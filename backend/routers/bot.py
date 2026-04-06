"""Bot control — start / stop / status / verify per user."""
import asyncio
import os
import signal
from pathlib import Path
from datetime import datetime, date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import SessionLocal, User, BotLog, JobApplication, PLAN_FEATURES
from sqlalchemy import func

router = APIRouter()

_running:    dict[str, asyncio.subprocess.Process] = {}
_started_at: dict[str, str] = {}

BOT_SCRIPT = Path(__file__).parent.parent.parent / "bot" / "runner.py"
PYTHON     = Path(__file__).parent.parent / "venv" / "bin" / "python"


class StartIn(BaseModel):
    email: str
    token: str
    max_jobs: int = 50


class VerifyIn(BaseModel):
    platform: str   # "linkedin" | "indeed"
    email: str
    password: str


class LogIn(BaseModel):
    user_email: str
    message: str
    level: str = "info"  # info | success | error | warn


@router.post("/start")
async def start_bot(body: StartIn):
    if body.email in _running:
        proc = _running[body.email]
        if proc.returncode is None:
            return {"status": "already_running", "started_at": _started_at.get(body.email)}

    with SessionLocal() as db:
        user = db.get(User, body.email)
        if not user:
            raise HTTPException(404, "User not found")
        
        # Get user's plan and features
        plan = user.plan or "free"
        plan_config = PLAN_FEATURES.get(plan)
        if not plan_config:
            raise HTTPException(400, f"Invalid plan: {plan}")
        
        # Check if user has credentials for any platform in their plan
        available_platforms = plan_config["platforms"]
        has_credentials = False
        for platform in available_platforms:
            email_field = f"{platform}_email"
            if hasattr(user, email_field) and getattr(user, email_field):
                has_credentials = True
                break
        
        if not has_credentials:
            platforms_str = ", ".join(available_platforms)
            raise HTTPException(
                400, 
                f"No platform credentials saved for your plan. Go to Settings → Platforms and add credentials for: {platforms_str}"
            )
        
        # Check daily application limit
        today = date.today()
        today_count = db.query(func.count(JobApplication.id)).filter(
            JobApplication.user_email == body.email,
            func.date(JobApplication.applied_at) == today
        ).scalar() or 0
        
        max_daily = plan_config["max_apps_per_day"]
        remaining = max_daily - today_count
        
        if remaining <= 0:
            raise HTTPException(
                429,
                f"Daily limit reached. You have {today_count}/{max_daily} applications today. Limit resets at midnight IST."
            )
        
        # Enforce max_jobs does not exceed plan limit and remaining for today
        effective_max = min(body.max_jobs or 50, remaining)
        
        # Log the start attempt with plan info
        log_entry = BotLog(
            user_email=body.email,
            message=f"Bot starting on plan '{plan}' ({available_platforms[0]}+). Max jobs today: {effective_max} (used {today_count}/{max_daily})",
            level="info",
            created_at=datetime.utcnow()
        )
        db.add(log_entry)
        db.commit()

    env = {
        **os.environ,
        "BOT_USER_EMAIL": body.email,
        "BOT_TOKEN":      body.token,
        "BOT_MAX_JOBS":   str(effective_max),
        "DISPLAY":        os.environ.get("DISPLAY", ":0"),  # allow browser window on local machine
    }

    proc = await asyncio.create_subprocess_exec(
        str(PYTHON), str(BOT_SCRIPT),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(BOT_SCRIPT.parent.parent),
    )
    _running[body.email]    = proc
    _started_at[body.email] = datetime.utcnow().isoformat()
    return {
        "status": "started",
        "pid": proc.pid,
        "started_at": _started_at[body.email],
        "plan": plan,
        "max_jobs_today": effective_max,
        "applied_today": today_count
    }


@router.post("/stop")
async def stop_bot(email: str):
    proc = _running.get(email)
    if not proc or proc.returncode is not None:
        _running.pop(email, None)
        return {"status": "not_running"}
    try:
        proc.send_signal(signal.SIGTERM)
        await asyncio.wait_for(proc.wait(), timeout=5)
    except Exception:
        proc.kill()
    _running.pop(email, None)
    return {"status": "stopped"}


@router.get("/status")
async def bot_status(email: str):
    proc = _running.get(email)
    if not proc or proc.returncode is not None:
        _running.pop(email, None)
        return {"running": False}
    return {"running": True, "pid": proc.pid, "started_at": _started_at.get(email)}


@router.post("/verify")
async def verify_platform(body: VerifyIn):
    """
    Headless login check — returns {ok, message}.
    Runs a quick Playwright login attempt and reports success/failure.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise HTTPException(500, "Playwright not installed")

    platform = body.platform.lower()

    async def _check() -> tuple[bool, str]:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
            )
            ctx = await browser.new_context(
                user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            await ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
            page = await ctx.new_page()

            try:
                if platform == "linkedin":
                    await page.goto("https://www.linkedin.com/login", wait_until="domcontentloaded", timeout=20000)
                    await page.wait_for_timeout(1500)
                    await page.fill("#username", body.email)
                    await page.wait_for_timeout(800)
                    await page.fill("#password", body.password)
                    await page.wait_for_timeout(800)
                    await page.click("button[type='submit']")
                    await page.wait_for_timeout(5000)
                    if "feed" in page.url:
                        return True, "LinkedIn account verified successfully."
                    if "checkpoint" in page.url or "challenge" in page.url:
                        return False, "LinkedIn requires OTP verification. Log in once manually in your browser first, then retry."
                    return False, "LinkedIn login failed. Check your email and password."

                elif platform == "indeed":
                    await page.goto("https://secure.indeed.com/auth", wait_until="domcontentloaded", timeout=20000)
                    await page.wait_for_timeout(2000)

                    # Step 1 — email
                    email_sel = "input[name='__email'], input[type='email']"
                    await page.wait_for_selector(email_sel, timeout=8000)
                    await page.fill(email_sel, body.email)
                    await page.wait_for_timeout(800)
                    for btn in ["button[type='submit']", "button:has-text('Continue')", "button:has-text('Next')"]:
                        if await page.locator(btn).count():
                            await page.locator(btn).first.click()
                            break
                    await page.wait_for_timeout(3000)

                    # Step 2 — password
                    pw_sel = "input[type='password']"
                    await page.wait_for_selector(pw_sel, timeout=8000)
                    await page.fill(pw_sel, body.password)
                    await page.wait_for_timeout(800)
                    for btn in ["button[type='submit']", "button:has-text('Sign in')", "button:has-text('Continue')"]:
                        if await page.locator(btn).count():
                            await page.locator(btn).first.click()
                            break
                    await page.wait_for_timeout(4000)

                    url = page.url
                    if "challenge" in url or "verify" in url:
                        return False, "Indeed requires email/OTP verification. Complete it once in your browser first, then retry."
                    if "auth" not in url and "indeed.com" in url:
                        return True, "Indeed account verified successfully."
                    return False, "Indeed login failed. Check your email and password."

                return False, f"Unknown platform: {platform}"
            finally:
                await browser.close()

    ok, message = await _check()

    # Persist verified status to DB
    if ok:
        with SessionLocal() as db:
            user = db.get(User, body.email) if "@" in body.email else None
            # find user by platform email
            if not user:
                from sqlalchemy import text
                with SessionLocal() as db2:
                    col = "linkedin_email" if platform == "linkedin" else "indeed_email"
                    row = db2.execute(
                        text(f"SELECT email FROM users WHERE {col} = :e"), {"e": body.email}
                    ).fetchone()
                    if row:
                        user = db2.get(User, row[0])
                        if platform == "linkedin":
                            user.linkedin_verified = True
                        else:
                            user.indeed_verified = True
                        db2.commit()

    return {"ok": ok, "message": message}


@router.post("/log")
def log_message(body: LogIn):
    """Log a message from the bot to the database."""
    with SessionLocal() as db:
        log_entry = BotLog(
            user_email=body.user_email,
            message=body.message,
            level=body.level,
            created_at=datetime.utcnow(),
        )
        db.add(log_entry)
        db.commit()
    return {"status": "logged"}


@router.get("/logs/{user_email}")
def get_logs(user_email: str, limit: int = 50):
    """Get recent bot logs for a user."""
    with SessionLocal() as db:
        logs = db.query(BotLog).filter(
            BotLog.user_email == user_email
        ).order_by(BotLog.created_at.desc()).limit(limit).all()
        return [
            {
                "timestamp": log.created_at.isoformat() if log.created_at else None,
                "level": log.level,
                "message": log.message,
            }
            for log in logs
        ]
