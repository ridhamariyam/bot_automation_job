"""
Bot control — start / stop / status / verify / logs.

v2 changes:
- start: enqueues ARQ task (Redis) instead of spawning subprocess
- Falls back to subprocess if Redis is not configured (dev mode)
- verify: uses PlatformCredential; still runs headless Playwright check
- Credentials read from PlatformCredential (encrypted) or legacy flat columns
"""
import asyncio
import os
import re
import signal
from datetime import datetime, date
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func

from database import SessionLocal, User, BotLog, JobApplication, PlatformCredential, PLAN_FEATURES

router = APIRouter()

# ── In-process subprocess tracking (dev / fallback only) ──────────────────────
_running:    dict[str, asyncio.subprocess.Process] = {}
_started_at: dict[str, str] = {}

BOT_SCRIPT = Path(__file__).parent.parent.parent / "bot" / "runner.py"
PYTHON      = Path(__file__).parent.parent / "venv" / "bin" / "python"

REDIS_URL = os.getenv("REDIS_URL") or (
    f"redis://:{os.getenv('REDIS_PASSWORD', '')}@"
    f"{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', '6379')}"
    if os.getenv("REDIS_HOST") else None
)

CHROMIUM_ARGS = [
    "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
    "--disable-gpu", "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
]


# ── Schemas ────────────────────────────────────────────────────────────────────
class StartIn(BaseModel):
    email:    str
    token:    str
    max_jobs: int = 50

class VerifyIn(BaseModel):
    platform: str
    email:    str
    password: str

class LogIn(BaseModel):
    user_email: str
    message:    str
    level:      str = "info"


# ── Helpers ────────────────────────────────────────────────────────────────────
def _get_verified_platforms(user: User, db) -> list[str]:
    """Return list of platforms with verified credentials."""
    plan_platforms = PLAN_FEATURES.get(user.plan or "premium", PLAN_FEATURES["premium"])["platforms"]

    verified = []
    # Check new PlatformCredential table first
    creds = db.query(PlatformCredential).filter_by(user_email=user.email).all()
    cred_map = {c.platform: c for c in creds}

    for platform in plan_platforms:
        cred = cred_map.get(platform)
        if cred and cred.verified:
            verified.append(platform)
            continue
        # Fallback: legacy flat columns
        if (getattr(user, f"{platform}_email", None)
                and getattr(user, f"{platform}_verified", 0)):
            verified.append(platform)

    return verified


def _check_daily_limit(user_email: str, plan: str, db) -> tuple[int, int, int]:
    """Returns (today_count, max_daily, remaining)."""
    plan_config = PLAN_FEATURES.get(plan, PLAN_FEATURES["premium"])
    max_daily   = plan_config["max_apps_per_day"]
    today       = date.today()
    today_count = db.query(func.count(JobApplication.id)).filter(
        JobApplication.user_email == user_email,
        func.date(JobApplication.applied_at) == today,
    ).scalar() or 0
    return today_count, max_daily, max(0, max_daily - today_count)


# ── Start ──────────────────────────────────────────────────────────────────────
@router.post("/start")
async def start_bot(body: StartIn):
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == body.email).first()
        if not user:
            raise HTTPException(404, "User not found")

        verified_platforms = _get_verified_platforms(user, db)
        if not verified_platforms:
            raise HTTPException(
                400,
                "No verified platform credentials. Go to Settings → Platforms and verify at least one.",
            )

        today_count, max_daily, remaining = _check_daily_limit(
            body.email, user.plan or "premium", db
        )
        if remaining <= 0:
            raise HTTPException(
                429,
                f"Daily limit reached: {today_count}/{max_daily} applications today. Resets at midnight.",
            )

        effective_max = min(body.max_jobs or 50, remaining)

        db.add(BotLog(
            user_email=body.email,
            message=f"Bot starting on {', '.join(verified_platforms)}. Max jobs: {effective_max} ({today_count}/{max_daily} used today)",
            level="info",
        ))
        db.commit()

    # Try ARQ/Redis queue first (production), fall back to subprocess (dev)
    if REDIS_URL:
        return await _enqueue_arq(body.email, verified_platforms, effective_max)
    else:
        return await _spawn_subprocess(body.email, body.token, effective_max)


async def _enqueue_arq(user_email: str, platforms: list[str], max_jobs: int) -> dict:
    """Enqueue bot tasks in ARQ/Redis queue — one task per platform."""
    try:
        from arq.connections import create_pool, RedisSettings

        # Parse redis URL
        m = re.match(r"redis://(?::(.+)@)?([^:/]+):(\d+)", REDIS_URL or "")
        settings = RedisSettings(
            host     = m.group(2) if m else "localhost",
            port     = int(m.group(3)) if m else 6379,
            password = m.group(1) if m and m.group(1) else None,
        )
        redis = await create_pool(settings)

        job_ids = []
        per_platform = max(1, max_jobs // len(platforms))
        for platform in platforms:
            job = await redis.enqueue_job(
                "run_bot_task",
                user_email  = user_email,
                platform    = platform,
                max_jobs    = per_platform,
                _job_id     = f"{user_email}:{platform}",   # dedup key
                _dedupe_time = 60,                           # ignore duplicate within 60s
            )
            job_ids.append(job.job_id if job else f"{user_email}:{platform}")

        await redis.close()
        return {
            "status":     "queued",
            "platforms":  platforms,
            "max_jobs":   max_jobs,
            "job_ids":    job_ids,
            "mode":       "worker",
        }
    except Exception as e:
        # Redis unavailable — fall back to subprocess
        return {"status": "error", "detail": f"Queue unavailable: {e}"}


async def _spawn_subprocess(user_email: str, token: str, effective_max: int) -> dict:
    """Dev fallback: spawn bot/runner.py as a subprocess (original behavior)."""
    if user_email in _running:
        proc = _running[user_email]
        if proc.returncode is None:
            return {"status": "already_running", "started_at": _started_at.get(user_email), "mode": "subprocess"}

    env = {
        **os.environ,
        "BOT_USER_EMAIL": user_email,
        "BOT_TOKEN":      token,
        "BOT_MAX_JOBS":   str(effective_max),
        "DISPLAY":        os.environ.get("DISPLAY", ":0"),
    }
    proc = await asyncio.create_subprocess_exec(
        str(PYTHON), str(BOT_SCRIPT),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(BOT_SCRIPT.parent.parent),
    )
    _running[user_email]    = proc
    _started_at[user_email] = datetime.utcnow().isoformat()
    return {
        "status":     "started",
        "pid":        proc.pid,
        "started_at": _started_at[user_email],
        "max_jobs":   effective_max,
        "mode":       "subprocess",
    }


# ── Stop ───────────────────────────────────────────────────────────────────────
@router.post("/stop")
async def stop_bot(email: str):
    # Cancel ARQ jobs if Redis available
    if REDIS_URL:
        try:
            from arq.connections import create_pool, RedisSettings
            from database import ALL_PLATFORMS
            m2 = re.match(r"redis://(?::(.+)@)?([^:/]+):(\d+)", REDIS_URL)
            redis = await create_pool(RedisSettings(
                host     = m2.group(2) if m2 else "localhost",
                port     = int(m2.group(3)) if m2 else 6379,
                password = m2.group(1) if m2 and m2.group(1) else None,
            ))
            for platform in ALL_PLATFORMS:
                try:
                    job = await redis.job(f"{email}:{platform}")
                    if job:
                        await job.abort()
                except Exception:
                    pass
            await redis.close()
        except Exception:
            pass

    # Also kill subprocess if running (dev mode)
    proc = _running.get(email)
    if proc and proc.returncode is None:
        try:
            proc.send_signal(signal.SIGTERM)
            await asyncio.wait_for(proc.wait(), timeout=5)
        except Exception:
            proc.kill()
        _running.pop(email, None)

    return {"status": "stopped"}


# ── Status ─────────────────────────────────────────────────────────────────────
@router.get("/status")
async def bot_status(email: str):
    """Check if a bot is running for this user (subprocess mode only)."""
    proc = _running.get(email)
    if proc and proc.returncode is None:
        return {"running": True, "pid": proc.pid, "started_at": _started_at.get(email), "mode": "subprocess"}
    _running.pop(email, None)
    return {"running": False, "mode": REDIS_URL and "worker" or "subprocess"}


# ── Verify credentials ─────────────────────────────────────────────────────────
@router.post("/verify")
async def verify_platform(body: VerifyIn):
    """
    Run a headless Playwright login check.
    On success, marks PlatformCredential.verified = True.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise HTTPException(500, "Playwright not installed on this server")

    platform = body.platform.lower()
    if platform not in ("linkedin", "indeed", "glassdoor"):
        raise HTTPException(400, f"Unsupported platform for verification: {platform}")

    async def _check() -> tuple[bool, str]:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            ctx = await browser.new_context(
                user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                           "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                viewport={"width": 1366, "height": 768},
            )
            await ctx.add_init_script(
                "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
                "window.chrome={runtime:{}};"
            )
            page = await ctx.new_page()
            try:
                if platform == "linkedin":
                    await page.goto("https://www.linkedin.com/login",
                                    wait_until="domcontentloaded", timeout=20000)
                    await page.wait_for_timeout(1500)
                    await page.fill("#username", body.email)
                    await page.wait_for_timeout(800)
                    await page.fill("#password", body.password)
                    await page.wait_for_timeout(800)
                    await page.click("button[type='submit']")
                    await page.wait_for_timeout(5000)
                    if "feed" in page.url:
                        return True, "LinkedIn verified successfully."
                    if "checkpoint" in page.url or "challenge" in page.url:
                        return False, "LinkedIn requires OTP verification. Log in once manually first, then retry."
                    return False, "LinkedIn login failed. Check your email and password."

                elif platform == "indeed":
                    await page.goto("https://secure.indeed.com/auth",
                                    wait_until="domcontentloaded", timeout=20000)
                    await page.wait_for_timeout(2000)
                    email_sel = "input[name='__email'], input[type='email']"
                    await page.wait_for_selector(email_sel, timeout=8000)
                    await page.fill(email_sel, body.email)
                    await page.wait_for_timeout(600)
                    for btn in ["button[type='submit']", "button:has-text('Continue')"]:
                        if await page.locator(btn).count():
                            await page.locator(btn).first.click(); break
                    await page.wait_for_timeout(3000)
                    pw_sel = "input[type='password']"
                    await page.wait_for_selector(pw_sel, timeout=8000)
                    await page.fill(pw_sel, body.password)
                    await page.wait_for_timeout(600)
                    for btn in ["button[type='submit']", "button:has-text('Sign in')"]:
                        if await page.locator(btn).count():
                            await page.locator(btn).first.click(); break
                    await page.wait_for_timeout(4000)
                    if "challenge" in page.url or "verify" in page.url:
                        return False, "Indeed requires verification. Complete it once manually first."
                    if "auth" not in page.url and "indeed.com" in page.url:
                        return True, "Indeed verified successfully."
                    return False, "Indeed login failed. Check your email and password."

                elif platform == "glassdoor":
                    await page.goto("https://www.glassdoor.com/profile/login_input.htm",
                                    wait_until="domcontentloaded", timeout=20000)
                    await page.wait_for_timeout(2000)
                    await page.fill("input[name='username']", body.email)
                    await page.wait_for_timeout(600)
                    await page.fill("input[name='password']", body.password)
                    await page.wait_for_timeout(600)
                    await page.click("button[type='submit']")
                    await page.wait_for_timeout(4000)
                    if "glassdoor.com" in page.url and "login" not in page.url:
                        return True, "Glassdoor verified successfully."
                    return False, "Glassdoor login failed. Check your credentials."

                return False, "Unknown platform"

            finally:
                await browser.close()

    try:
        ok, message = await _check()
    except Exception as exc:
        raise HTTPException(500, f"Browser check failed: {exc}")

    # Persist verified status
    if ok:
        with SessionLocal() as db:
            # Update PlatformCredential if it exists
            cred = db.query(PlatformCredential).filter_by(
                user_email=body.email, platform=platform
            ).first()
            if not cred:
                # Create credential record from the verify call
                cred = PlatformCredential(
                    user_email         = body.email,
                    platform           = platform,
                    email              = body.email,
                    encrypted_password = "",  # not provided here
                )
                db.add(cred)
            cred.verified = True

            # Also update legacy flat column
            user = db.query(User).filter(User.email == body.email).first()
            if user and hasattr(user, f"{platform}_verified"):
                setattr(user, f"{platform}_verified", 1)

            db.commit()

    return {"ok": ok, "message": message}


# ── Platform list ──────────────────────────────────────────────────────────────
@router.get("/platforms/{email}")
def get_platforms(email: str):
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(404, "User not found")

        plan_platforms = PLAN_FEATURES.get(
            user.plan or "premium", PLAN_FEATURES["premium"]
        )["platforms"]

        creds = {c.platform: c for c in db.query(PlatformCredential).filter_by(user_email=email).all()}

        platforms_out = []
        for p in plan_platforms:
            cred = creds.get(p)
            if cred:
                status = "verified" if cred.verified else "configured"
            elif getattr(user, f"{p}_email", None):
                status = "verified" if getattr(user, f"{p}_verified", 0) else "configured"
            else:
                status = "not_configured"

            platforms_out.append({
                "platform":   p,
                "configured": status != "not_configured",
                "verified":   status == "verified",
                "status":     status,
            })

        return {
            "email":          email,
            "plan":           user.plan or "premium",
            "platforms":      platforms_out,
            "verified_count": sum(1 for p in platforms_out if p["verified"]),
        }


# ── Logging ────────────────────────────────────────────────────────────────────
@router.post("/log")
def log_message(body: LogIn):
    with SessionLocal() as db:
        db.add(BotLog(
            user_email=body.user_email,
            message=body.message,
            level=body.level,
        ))
        db.commit()
    return {"status": "logged"}


@router.get("/logs/{user_email}")
def get_logs(user_email: str, limit: int = 50):
    with SessionLocal() as db:
        logs = (
            db.query(BotLog)
            .filter(BotLog.user_email == user_email)
            .order_by(BotLog.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "timestamp": log.created_at.isoformat() if log.created_at else None,
                "level":     log.level,
                "message":   log.message,
                "platform":  log.platform,
                "task_id":   log.task_id,
            }
            for log in logs
        ]
