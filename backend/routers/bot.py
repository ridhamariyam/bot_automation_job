"""
Bot control — start / stop / status / verify / logs.

v2 changes:
- start: enqueues ARQ task (Redis) instead of spawning subprocess
- Falls back to subprocess if Redis is not configured (dev mode)
- verify: uses PlatformCredential; still runs headless Playwright check
- Credentials read from PlatformCredential (encrypted) or legacy flat columns
"""
import asyncio
import logging
import os
import re
import signal
import uuid
from dataclasses import dataclass
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright
from pydantic import BaseModel
from sqlalchemy import func

from database import SessionLocal, User, BotLog, JobApplication, PlatformCredential, PLAN_FEATURES
from services.crypto import encrypt_password

router = APIRouter()
logger = logging.getLogger(__name__)

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
CAPTURE_VIEWPORT = {"width": 1280, "height": 800}
CAPTURE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)
CAPTURE_LOCALE = "en-US"
CAPTURE_TIMEZONE = "America/New_York"
CAPTURE_SLOW_MO_MS = 75

LOGIN_URLS = {
    "linkedin": "https://www.linkedin.com/login",
    "indeed": "https://secure.indeed.com/account/login",
}
LOGIN_SESSION_TTL = timedelta(minutes=10)


@dataclass
class BrowserLoginSession:
    session_id: str
    user_email: str
    platform: str
    playwright: Playwright
    browser: Browser
    context: BrowserContext
    page: Page
    created_at: datetime
    expires_at: datetime
    timeout_task: Optional[asyncio.Task] = None


_browser_sessions: dict[str, BrowserLoginSession] = {}
_browser_sessions_lock = asyncio.Lock()


class BrowserSessionInProgressError(Exception):
    pass


# ── Schemas ────────────────────────────────────────────────────────────────────
class StartIn(BaseModel):
    email:    str
    token:    str
    max_jobs: int = 50

class VerifyIn(BaseModel):
    platform: str
    email:    str
    password: str
    user_email: Optional[str] = None

class BrowserSessionStartIn(BaseModel):
    user_email: str

class BrowserSessionStatusIn(BaseModel):
    session_id: str

class BrowserSessionCompleteIn(BaseModel):
    session_id: str
    user_email: str

class BrowserSessionCancelIn(BaseModel):
    session_id: str

class LogIn(BaseModel):
    user_email: str
    message:    str
    level:      str = "info"


# ── Helpers ────────────────────────────────────────────────────────────────────
def _normalize_session_platform(platform: str) -> str:
    platform = platform.lower().strip()
    if platform not in LOGIN_URLS:
        raise HTTPException(400, f"Unsupported browser session platform: {platform}")
    return platform


async def _close_browser_session(session: BrowserLoginSession) -> None:
    current_task = asyncio.current_task()
    if session.timeout_task and session.timeout_task is not current_task:
        session.timeout_task.cancel()

    try:
        if not session.page.is_closed():
            await session.page.close()
    except Exception:
        pass
    try:
        await session.context.close()
    except Exception:
        pass
    try:
        await session.browser.close()
    except Exception:
        pass
    try:
        await session.playwright.stop()
    except Exception:
        pass


async def _expire_browser_session(session_id: str) -> None:
    session = await _get_browser_session(session_id)
    if not session:
        return

    delay = max(0.0, (session.expires_at - datetime.utcnow()).total_seconds())
    try:
        await asyncio.sleep(delay)
    except asyncio.CancelledError:
        return

    expired = await _pop_browser_session(session_id)
    if expired:
        await _close_browser_session(expired)


async def _cleanup_expired_browser_sessions() -> None:
    now = datetime.utcnow()
    expired: list[BrowserLoginSession] = []

    async with _browser_sessions_lock:
        for session_id, session in list(_browser_sessions.items()):
            if session.expires_at <= now:
                expired.append(_browser_sessions.pop(session_id))

    for session in expired:
        await _close_browser_session(session)


async def _pop_browser_session(session_id: str) -> Optional[BrowserLoginSession]:
    async with _browser_sessions_lock:
        return _browser_sessions.pop(session_id, None)


async def _get_browser_session(session_id: str) -> Optional[BrowserLoginSession]:
    async with _browser_sessions_lock:
        return _browser_sessions.get(session_id)


async def _has_active_browser_session(user_email: str, platform: str) -> bool:
    async with _browser_sessions_lock:
        for session in _browser_sessions.values():
            if session.user_email == user_email and session.platform == platform:
                return True
    return False


async def _new_capture_context(browser: Browser, storage_state: Optional[dict] = None) -> BrowserContext:
    return await browser.new_context(
        viewport=CAPTURE_VIEWPORT,
        user_agent=CAPTURE_USER_AGENT,
        locale=CAPTURE_LOCALE,
        timezone_id=CAPTURE_TIMEZONE,
        storage_state=storage_state,
    )


def _session_current_page(session: BrowserLoginSession) -> Optional[Page]:
    open_pages = [page for page in session.context.pages if not page.is_closed()]
    if open_pages:
        session.page = open_pages[-1]
        return session.page
    if session.page and not session.page.is_closed():
        return session.page
    return None


async def _browser_session_ready(session: BrowserLoginSession) -> tuple[bool, str]:
    from bot.browser.session_manager import is_authenticated_page

    page = _session_current_page(session)
    if not page:
        return False, "Browser window was closed. Start again."

    try:
        if await is_authenticated_page(page, session.platform):
            return True, "Login detected"
    except Exception as exc:
        logger.warning("Status check failed for %s [%s]: %s", session.platform, session.session_id, exc)
        return False, "Checking login failed"

    return False, "Not logged in yet"


async def _validate_captured_session(session: BrowserLoginSession, storage_state: dict) -> bool:
    from bot.browser.session_manager import validate_authenticated_session

    validate_ctx = await _new_capture_context(session.browser, storage_state=storage_state)
    try:
        return await validate_authenticated_session(validate_ctx, session.platform)
    finally:
        try:
            await validate_ctx.close()
        except Exception:
            pass


async def _validate_saved_platform_session(user_email: str, platform: str) -> Optional[bool]:
    from bot.browser.session_manager import (
        get_storage_state,
        invalidate_session,
        validate_authenticated_session,
    )

    storage_state = get_storage_state(user_email, platform)
    if not storage_state:
        return True

    playwright: Optional[Playwright] = None
    browser: Optional[Browser] = None
    context: Optional[BrowserContext] = None

    try:
        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(headless=True, args=CHROMIUM_ARGS)
        context = await _new_capture_context(browser, storage_state=storage_state)
        is_valid = await validate_authenticated_session(context, platform)
        if not is_valid:
            invalidate_session(user_email, platform)
        return is_valid
    except Exception as exc:
        logger.warning("Saved session preflight failed for %s/%s: %s", user_email, platform, exc)
        return None
    finally:
        if context:
            try:
                await context.close()
            except Exception:
                pass
        if browser:
            try:
                await browser.close()
            except Exception:
                pass
        if playwright:
            try:
                await playwright.stop()
            except Exception:
                pass


async def _launch_browser_login_session(platform: str, user_email: str) -> BrowserLoginSession:
    await _cleanup_expired_browser_sessions()
    playwright: Optional[Playwright] = None
    browser: Optional[Browser] = None
    context: Optional[BrowserContext] = None
    page: Optional[Page] = None

    try:
        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(
            headless=False,
            slow_mo=CAPTURE_SLOW_MO_MS,
            args=CHROMIUM_ARGS,
        )
        context = await _new_capture_context(browser)
        page = await context.new_page()
        await page.goto(LOGIN_URLS[platform], wait_until="domcontentloaded", timeout=30000)

        session = BrowserLoginSession(
            session_id=str(uuid.uuid4()),
            user_email=user_email,
            platform=platform,
            playwright=playwright,
            browser=browser,
            context=context,
            page=page,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + LOGIN_SESSION_TTL,
        )

        async with _browser_sessions_lock:
            for active in _browser_sessions.values():
                if active.user_email == user_email and active.platform == platform:
                    raise BrowserSessionInProgressError("Session already in progress")
            _browser_sessions[session.session_id] = session
            session.timeout_task = asyncio.create_task(_expire_browser_session(session.session_id))

        logger.info(
            "Browser connect session started for %s/%s [%s]. User must log in manually and click Continue.",
            user_email,
            platform,
            session.session_id,
        )
        return session
    except Exception:
        if page:
            try:
                if not page.is_closed():
                    await page.close()
            except Exception:
                pass
        if context:
            try:
                await context.close()
            except Exception:
                pass
        if browser:
            try:
                await browser.close()
            except Exception:
                pass
        if playwright:
            try:
                await playwright.stop()
            except Exception:
                pass
        raise


def _get_verified_platforms(user: User, db) -> list[str]:
    """Return list of platforms with verified credentials."""
    plan_platforms = PLAN_FEATURES["premium"]["platforms"]  # all users have full access

    verified = []
    # Check new PlatformCredential table first
    creds = db.query(PlatformCredential).filter_by(user_email=user.email).all()
    cred_map = {c.platform: c for c in creds}

    for platform in plan_platforms:
        if getattr(user, f"{platform}_session_json", None):
            verified.append(platform)
            continue
        cred = cred_map.get(platform)
        if cred and cred.verified:
            verified.append(platform)
            continue
        # Fallback: legacy flat columns
        if getattr(user, f"{platform}_verified", 0):
            verified.append(platform)

    return verified


def _check_daily_limit(user_email: str, plan: str, db) -> tuple[int, int, int]:
    """Returns (today_count, max_daily, remaining)."""
    plan_config = PLAN_FEATURES["premium"]  # all users have full access
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
    from utils.feature_flags import is_bot_disabled
    if is_bot_disabled():
        raise HTTPException(503, "Bot automation is temporarily disabled. Please try again later.")

    # Cap max_jobs to a safe upper bound
    if body.max_jobs is not None and body.max_jobs > 500:
        raise HTTPException(400, "max_jobs cannot exceed 500 per run")

    session_platforms: list[str] = []

    with SessionLocal() as db:
        user = db.query(User).filter(User.email == body.email).first()
        if not user:
            raise HTTPException(404, "User not found")

        verified_platforms = _get_verified_platforms(user, db)
        if not verified_platforms:
            raise HTTPException(
                400,
                "No ready platform connection. Go to Settings → Platforms and connect at least one platform.",
            )

        today_count, max_daily, remaining = _check_daily_limit(
            body.email, "premium", db
        )
        if remaining <= 0:
            raise HTTPException(
                429,
                f"Daily limit reached: {today_count}/{max_daily} applications today. Resets at midnight.",
            )

        effective_max = min(body.max_jobs or 50, remaining)
        session_platforms = [
            platform
            for platform in verified_platforms
            if getattr(user, f"{platform}_session_json", None)
        ]

    for platform in session_platforms:
        is_valid = await _validate_saved_platform_session(body.email, platform)
        if is_valid is None:
            raise HTTPException(
                503,
                f"Could not validate your {platform} session right now. Please try again.",
            )
        if not is_valid:
            with SessionLocal() as db:
                db.add(BotLog(
                    user_email=body.email,
                    message=f"{platform.title()} session expired before bot start",
                    level="warn",
                ))
                db.commit()
            raise HTTPException(409, f"SESSION_EXPIRED:{platform}")

    with SessionLocal() as db:
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
        from urllib.parse import urlparse as _urlparse

        # Parse Redis URL — handles redis:// and rediss:// (TLS) with any auth format
        _p = _urlparse(REDIS_URL or "")
        settings = RedisSettings(
            host     = _p.hostname or "localhost",
            port     = _p.port or 6379,
            password = _p.password or None,
            ssl      = (_p.scheme == "rediss"),
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
                _job_id     = f"{user_email}:{platform}",   # dedup key — ARQ skips if job_id already queued
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
            from urllib.parse import urlparse as _urlparse
            from database import ALL_PLATFORMS
            _p2 = _urlparse(REDIS_URL)
            redis = await create_pool(RedisSettings(
                host     = _p2.hostname or "localhost",
                port     = _p2.port or 6379,
                password = _p2.password or None,
                ssl      = (_p2.scheme == "rediss"),
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


# ── Browser session connect flow ───────────────────────────────────────────────
@router.post("/session/{platform}/start")
async def start_browser_session(platform: str, body: BrowserSessionStartIn):
    platform = _normalize_session_platform(platform)
    await _cleanup_expired_browser_sessions()
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == body.user_email).first()
        if not user:
            raise HTTPException(404, "User not found")

    if await _has_active_browser_session(body.user_email, platform):
        return JSONResponse(status_code=409, content={"error": "Session already in progress"})

    try:
        session = await _launch_browser_login_session(platform, body.user_email)
    except BrowserSessionInProgressError:
        return JSONResponse(status_code=409, content={"error": "Session already in progress"})
    return {"session_id": session.session_id, "status": "waiting_for_login"}


@router.post("/session/{platform}/status")
async def browser_session_status(platform: str, body: BrowserSessionStatusIn):
    platform = _normalize_session_platform(platform)
    await _cleanup_expired_browser_sessions()

    session = await _get_browser_session(body.session_id)
    if not session or session.platform != platform:
        return {"ready": False, "message": "Session expired"}

    ready, message = await _browser_session_ready(session)
    return {"ready": ready, "message": message}


@router.post("/session/{platform}/complete")
async def complete_browser_session(platform: str, body: BrowserSessionCompleteIn):
    platform = _normalize_session_platform(platform)
    await _cleanup_expired_browser_sessions()

    session = await _get_browser_session(body.session_id)
    if not session or session.platform != platform or session.user_email != body.user_email:
        raise HTTPException(404, "Session not found or expired")

    ready, message = await _browser_session_ready(session)
    if not ready:
        return {"ok": False, "message": message}

    try:
        storage_state = await session.context.storage_state()
        is_valid = await _validate_captured_session(session, storage_state)
        if not is_valid:
            return {
                "ok": False,
                "message": "Session validation failed. Please wait until your homepage loads, then retry.",
            }

        from bot.browser.session_manager import persist_storage_state

        with SessionLocal() as db:
            user = db.query(User).filter(User.email == body.user_email).first()
            if not user:
                raise HTTPException(404, "User not found")

        if not persist_storage_state(body.user_email, platform, storage_state):
            raise HTTPException(500, f"Could not save {platform} session")
    except Exception:
        popped = await _pop_browser_session(body.session_id)
        if popped:
            await _close_browser_session(popped)
        raise

    popped = await _pop_browser_session(body.session_id)
    if popped:
        await _close_browser_session(popped)

    return {"ok": True, "message": f"{platform.title()} session saved"}


@router.post("/session/{platform}/cancel")
async def cancel_browser_session(platform: str, body: BrowserSessionCancelIn):
    platform = _normalize_session_platform(platform)
    session = await _get_browser_session(body.session_id)
    if session and session.platform == platform:
        session = await _pop_browser_session(body.session_id)
    else:
        session = None
    if session:
        await _close_browser_session(session)
    return {"ok": True, "message": "Session cancelled"}


# ── Verify credentials ─────────────────────────────────────────────────────────
@router.post("/verify")
async def verify_platform(body: VerifyIn):
    """
    Run a headless Playwright login check.
    On success, marks PlatformCredential.verified = True.
    """
    try:
        from bot.browser.stealth_browser import StealthBrowser  # noqa: F401
    except ImportError:
        raise HTTPException(500, "Playwright / bot package not installed on this server")

    platform = body.platform.lower()
    if platform not in ("linkedin", "indeed", "glassdoor"):
        raise HTTPException(400, f"Unsupported platform for verification: {platform}")

    target_user_email = (body.user_email or "").strip() or body.email

    async def _check() -> tuple[bool, str]:
        from bot.browser.stealth_browser import StealthBrowser
        ctx, sb = await StealthBrowser.one_shot_context()
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
            await page.close()
            await sb.shutdown()

    try:
        ok, message = await _check()
    except Exception as exc:
        raise HTTPException(500, f"Browser check failed: {exc}")

    # Persist verified status
    if ok:
        with SessionLocal() as db:
            # Update PlatformCredential if it exists
            cred = db.query(PlatformCredential).filter_by(
                user_email=target_user_email, platform=platform
            ).first()
            if not cred:
                cred = db.query(PlatformCredential).filter_by(
                    platform=platform, email=body.email
                ).first()
            if not cred:
                # Create credential record from the verify call
                cred = PlatformCredential(
                    user_email         = target_user_email,
                    platform           = platform,
                    email              = body.email,
                    encrypted_password = encrypt_password(body.password),
                )
                db.add(cred)
            else:
                cred.email = body.email
                if body.password:
                    cred.encrypted_password = encrypt_password(body.password)
            cred.verified = True

            # Also update legacy flat column
            user = db.query(User).filter(User.email == target_user_email).first()
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

        plan_platforms = PLAN_FEATURES["premium"]["platforms"]  # all users have full access

        creds = {c.platform: c for c in db.query(PlatformCredential).filter_by(user_email=email).all()}

        platforms_out = []
        for p in plan_platforms:
            cred = creds.get(p)
            session_ready = bool(getattr(user, f"{p}_session_json", None))
            session_updated_at = getattr(user, f"{p}_session_updated_at", None)
            if session_ready:
                status = "verified"
            elif cred:
                status = "verified" if cred.verified else "configured"
            elif session_updated_at:
                status = "expired"
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
            "plan":           "premium",
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
