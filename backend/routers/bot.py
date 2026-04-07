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


def _get_user_access_info(user: User) -> tuple[str, str, bool]:
    """
    Returns (plan_name, message, has_access).
    - has_access: True if user has active trial or paid subscription
    - Automatically degrades users with expired trial to free plan
    """
    now = datetime.utcnow()
    
    # Check if trial is active
    if user.trial_end and now < user.trial_end:
        days_left = (user.trial_end - now).days
        msg = f"7-day trial active ({days_left} days remaining). All premium features unlocked."
        return "premium", msg, True
    
    # Trial expired or not used
    if user.trial_end and now >= user.trial_end and user.payment_status == "trial":
        # Degrade to free
        user.plan = "free"
        user.payment_status = "expired"
        # Save to DB
        with SessionLocal() as db:
            db.merge(user)
            db.commit()
        return "free", "Trial expired. Downgraded to free plan (5 apps/day). Upgrade to continue.", True
    
    # Check if they have an active paid subscription (assuming payment_status = "active" means paid)
    if user.payment_status == "active" and user.plan in ["pro", "premium"]:
        return user.plan, f"Active subscription: {PLAN_FEATURES[user.plan]['name']}", True
    
    # Free plan
    if user.plan == "free" or user.payment_status == "expired":
        return "free", "Free plan (5 apps/day). Upgrade to continue.", True
    
    # Default to free if no subscription
    return "free", "Free trial ended. Please upgrade.", False


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
        
        # Get user's access info (auto-degrade expired trials to free)
        plan, status_msg, has_access = _get_user_access_info(user)
        
        if not has_access:
            raise HTTPException(403, f"No access. {status_msg}")
        
        # Get plan config
        plan_config = PLAN_FEATURES.get(plan)
        if not plan_config:
            raise HTTPException(400, f"Invalid plan: {plan}")
        
        # Get all available platforms (premium can use all 8, pro uses 3, free uses 1)
        available_platforms = plan_config["platforms"]
        
        # Check if user has verified credentials for ANY platform in their plan
        has_credentials = False
        verified_platforms = []
        for platform in available_platforms:
            email_field = f"{platform}_email"
            verified_field = f"{platform}_verified"
            if (hasattr(user, email_field) and getattr(user, email_field) and
                hasattr(user, verified_field) and getattr(user, verified_field)):
                has_credentials = True
                verified_platforms.append(platform)
        
        if not has_credentials:
            platforms_str = ", ".join(available_platforms)
            raise HTTPException(
                400,
                f"No verified platform credentials. Go to Settings → Platforms and verify at least one: {platforms_str}"
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
        
        # Prepare log message with trial/subscription info
        trial_info = ""
        if user.trial_end:
            from datetime import datetime as dt
            if dt.utcnow() < user.trial_end:
                days_left = (user.trial_end - dt.utcnow()).days
                trial_info = f" | Trial: {days_left} days"
            else:
                trial_info = " | Trial expired"
        
        # Log the start attempt with plan info
        log_entry = BotLog(
            user_email=body.email,
            message=f"Bot starting on {plan.upper()} ({', '.join(verified_platforms)}). Max jobs: {effective_max} (used {today_count}/{max_daily}){trial_info}",
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
        raise HTTPException(500, "Playwright not installed on this server")

    platform = body.platform.lower()
    if platform not in ("linkedin", "indeed"):
        raise HTTPException(400, f"Unsupported platform: {platform}")

    # Chromium flags required for cloud/container environments (Render, Docker, etc.)
    CHROMIUM_ARGS = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",   # avoids /dev/shm exhaustion on low-memory hosts
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--single-process",
    ]

    async def _check() -> tuple[bool, str]:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True, args=CHROMIUM_ARGS)
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

                else:  # indeed
                    await page.goto("https://secure.indeed.com/auth", wait_until="domcontentloaded", timeout=20000)
                    await page.wait_for_timeout(2000)

                    email_sel = "input[name='__email'], input[type='email']"
                    await page.wait_for_selector(email_sel, timeout=8000)
                    await page.fill(email_sel, body.email)
                    await page.wait_for_timeout(800)
                    for btn in ["button[type='submit']", "button:has-text('Continue')", "button:has-text('Next')"]:
                        if await page.locator(btn).count():
                            await page.locator(btn).first.click()
                            break
                    await page.wait_for_timeout(3000)

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
            finally:
                await browser.close()

    try:
        ok, message = await _check()
    except Exception as exc:
        print(f"[verify] {platform} check failed: {exc}")
        raise HTTPException(500, f"Browser check failed: {exc}")

    # Persist verified status to DB
    if ok:
        try:
            with SessionLocal() as db:
                col_name = f"{platform}_email"
                # Find user by the platform email they provided
                user = db.query(User).filter(
                    getattr(User, col_name) == body.email
                ).first()
                if user:
                    setattr(user, f"{platform}_verified", True)
                    db.commit()
        except Exception as db_exc:
            print(f"[verify] Failed to update verified status for {platform}: {db_exc}")
            # Don't fail the response, user is still verified even if DB update fails

    return {"ok": ok, "message": message}


@router.get("/platforms/{email}")
def get_connected_platforms(email: str):
    """Get user's connected and verified platforms."""
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found")
        
        # Determine which platforms user has access to
        plan = user.plan or "free"
        available_platforms = PLAN_FEATURES[plan]["platforms"]
        
        connected_platforms = []
        for platform in available_platforms:
            email_field = f"{platform}_email"
            verified_field = f"{platform}_verified"
            
            has_creds = bool(getattr(user, email_field, None))
            is_verified = bool(getattr(user, verified_field, 0))
            
            connected_platforms.append({
                "platform": platform,
                "configured": has_creds,
                "verified": is_verified,
                "status": "verified" if is_verified else ("configured" if has_creds else "not_configured"),
            })
        
        return {
            "email": email,
            "plan": plan,
            "platforms": connected_platforms,
            "verified_count": sum(1 for p in connected_platforms if p["verified"]),
            "total_available": len(connected_platforms),
        }


@router.post("/platforms/{email}/update-credentials")
def update_platform_credentials(email: str, data: dict):
    """Update platform credentials for a user."""
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found")
        
        platform = data.get("platform", "").lower()
        if platform not in PLAN_FEATURES[user.plan or "free"]["platforms"]:
            raise HTTPException(400, f"Platform {platform} not available for user's plan")
        
        # Update credentials
        setattr(user, f"{platform}_email", data.get("email"))
        setattr(user, f"{platform}_password", data.get("password"))
        setattr(user, f"{platform}_verified", 0)  # Reset verification
        
        db.commit()
        
        return {
            "platform": platform,
            "message": f"Credentials updated for {platform}. Please verify in Settings.",
        }


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
