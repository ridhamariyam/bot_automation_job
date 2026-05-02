"""
Session manager — persists browser sessions to the database.

LinkedIn and Indeed now use encrypted Playwright storage_state persisted on the
User row. Other platforms continue to use the legacy platform_sessions table.
"""
import json
import logging
import os
import sys
from datetime import datetime
from typing import Optional

from playwright.async_api import BrowserContext, Page

logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from database import SessionLocal, PlatformCredential, PlatformSession, User
from services.crypto import decrypt_text, encrypt_text

SESSION_FIELD_MAP = {
    "linkedin": ("linkedin_session_json", "linkedin_session_updated_at", "linkedin_verified"),
    "indeed": ("indeed_session_json", "indeed_session_updated_at", "indeed_verified"),
}
AUTH_CHECKS = {
    "linkedin": {
        "auth_url": "https://www.linkedin.com/feed/",
        "url_fragments": ["/feed"],
        "blocked_fragments": ["/login", "/checkpoint", "/challenge"],
        "selectors": [
            "img.global-nav__me-photo",
            "[data-test-global-nav-link='profile']",
            "button.global-nav__me",
        ],
    },
    "indeed": {
        "auth_url": "https://www.indeed.com/myjobs",
        "url_fragments": ["/jobs", "/account", "/myjobs"],
        "blocked_fragments": ["/account/login", "/auth", "/login", "/challenge", "/verify"],
        "selectors": [
            "[data-testid='userOptions']",
            "nav[aria-label='Primary']",
            "[data-testid='account-menu-button']",
        ],
    },
}
UNAUTHENTICATED_URL_FRAGMENTS = ("challenge", "checkpoint", "authwall", "login")


def supports_storage_state(platform: str) -> bool:
    return platform in SESSION_FIELD_MAP


def get_authenticated_url(platform: str) -> str:
    config = AUTH_CHECKS.get(platform)
    if not config:
        raise ValueError(f"Unsupported platform auth check: {platform}")
    return str(config["auth_url"])


async def is_authenticated_page(page: Page, platform: str) -> bool:
    config = AUTH_CHECKS.get(platform)
    if not config:
        return False

    try:
        url = (page.url or "").lower()
    except Exception:
        return False

    if any(fragment in url for fragment in UNAUTHENTICATED_URL_FRAGMENTS):
        return False

    if any(fragment in url for fragment in config["blocked_fragments"]):
        return False

    if any(fragment in url for fragment in config["url_fragments"]):
        return True

    for selector in config["selectors"]:
        try:
            if await page.locator(selector).first.count():
                return True
        except Exception:
            continue

    return False


async def validate_authenticated_session(ctx: BrowserContext, platform: str) -> bool:
    """Navigate to a known authenticated page and confirm the session is still valid."""
    page = await ctx.new_page()
    try:
        await page.goto(get_authenticated_url(platform), wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(1500)
        return await is_authenticated_page(page, platform)
    except Exception as e:
        logger.warning("Auth validation failed for %s: %s", platform, e)
        return False
    finally:
        try:
            await page.close()
        except Exception:
            pass


def get_storage_state(user_email: str, platform: str) -> Optional[dict]:
    """Return decrypted Playwright storage_state for supported platforms."""
    if not supports_storage_state(platform):
        return None

    session_field, _, _ = SESSION_FIELD_MAP[platform]
    try:
        with SessionLocal() as db:
            user = db.query(User).filter(User.email == user_email).first()
            if not user:
                return None

            encrypted_state = getattr(user, session_field, None)
            if not encrypted_state:
                return None

            plaintext = decrypt_text(encrypted_state)
            if not plaintext:
                return None
            return json.loads(plaintext)
    except Exception as e:
        logger.warning("Failed to read storage_state for %s/%s: %s", user_email, platform, e)
        return None


def has_saved_session(user_email: str, platform: str) -> bool:
    if supports_storage_state(platform):
        return get_storage_state(user_email, platform) is not None

    try:
        with SessionLocal() as db:
            session = db.query(PlatformSession).filter_by(
                user_email=user_email, platform=platform, is_valid=True
            ).first()
            return bool(session and session.cookies_json)
    except Exception:
        return False


async def _apply_storage_state(ctx: BrowserContext, storage_state: dict) -> bool:
    cookies = storage_state.get("cookies") or []
    origins = storage_state.get("origins") or []

    if cookies:
        await ctx.add_cookies(cookies)

    if origins:
        payload = json.dumps(origins)
        await ctx.add_init_script(
            f"""
            (() => {{
              const originStates = {payload};
              const byOrigin = new Map(
                originStates.map((entry) => [entry.origin, entry.localStorage || []])
              );
              const applyLocalStorage = () => {{
                const items = byOrigin.get(window.location.origin);
                if (!items) return;
                for (const item of items) {{
                  try {{
                    window.localStorage.setItem(item.name, item.value);
                  }} catch (err) {{}}
                }}
              }};
              applyLocalStorage();
              document.addEventListener("DOMContentLoaded", applyLocalStorage);
            }})();
            """
        )

    return bool(cookies or origins)


def persist_storage_state(user_email: str, platform: str, storage_state: dict) -> bool:
    """Persist encrypted storage_state for LinkedIn/Indeed."""
    if not supports_storage_state(platform):
        return False

    session_field, updated_at_field, verified_field = SESSION_FIELD_MAP[platform]
    try:
        storage_json = json.dumps(storage_state)
        encrypted_state = encrypt_text(storage_json)
        now = datetime.utcnow()

        with SessionLocal() as db:
            user = db.query(User).filter(User.email == user_email).first()
            if not user:
                return False

            setattr(user, session_field, encrypted_state)
            setattr(user, updated_at_field, now)
            if hasattr(user, verified_field):
                setattr(user, verified_field, 1)

            cred = db.query(PlatformCredential).filter_by(
                user_email=user_email, platform=platform
            ).first()
            if cred:
                cred.verified = True

            legacy_session = db.query(PlatformSession).filter_by(
                user_email=user_email, platform=platform
            ).first()
            if legacy_session:
                legacy_session.cookies_json = None
                legacy_session.is_valid = False
                legacy_session.last_used = now

            db.commit()
        return True
    except Exception as e:
        logger.warning("Failed to persist storage_state for %s/%s: %s", user_email, platform, e)
        return False


async def save_session(ctx: BrowserContext, user_email: str, platform: str) -> bool:
    """Save current browser session."""
    try:
        if supports_storage_state(platform):
            storage_state = await ctx.storage_state()
            return persist_storage_state(user_email, platform, storage_state)

        cookies = await ctx.cookies()
        cookies_json = json.dumps(cookies)

        with SessionLocal() as db:
            session = db.query(PlatformSession).filter_by(
                user_email=user_email, platform=platform
            ).first()
            if session:
                session.cookies_json = cookies_json
                session.last_used = datetime.utcnow()
                session.is_valid = True
            else:
                db.add(PlatformSession(
                    user_email=user_email,
                    platform=platform,
                    cookies_json=cookies_json,
                    last_used=datetime.utcnow(),
                    is_valid=True,
                ))
            db.commit()
        return True
    except Exception as e:
        logger.warning("Failed to save session for %s/%s: %s", user_email, platform, e)
        return False


async def load_session(ctx: BrowserContext, user_email: str, platform: str) -> bool:
    """Load a saved session into the browser context."""
    try:
        storage_state = get_storage_state(user_email, platform)
        if storage_state:
            return await _apply_storage_state(ctx, storage_state)

        with SessionLocal() as db:
            session = db.query(PlatformSession).filter_by(
                user_email=user_email, platform=platform, is_valid=True
            ).first()
            if not session or not session.cookies_json:
                return False

            cookies = json.loads(session.cookies_json)
            await ctx.add_cookies(cookies)
            return True
    except Exception as e:
        logger.warning("Failed to load session for %s/%s: %s", user_email, platform, e)
        return False


def invalidate_session(user_email: str, platform: str):
    """Mark session as invalid (e.g. after logout or auth failure)."""
    try:
        with SessionLocal() as db:
            if supports_storage_state(platform):
                session_field, _, verified_field = SESSION_FIELD_MAP[platform]
                user = db.query(User).filter(User.email == user_email).first()
                if user:
                    setattr(user, session_field, None)
                    if hasattr(user, verified_field):
                        setattr(user, verified_field, 0)

                cred = db.query(PlatformCredential).filter_by(
                    user_email=user_email, platform=platform
                ).first()
                if cred:
                    cred.verified = False

            session = db.query(PlatformSession).filter_by(
                user_email=user_email, platform=platform
            ).first()
            if session:
                session.cookies_json = None
                session.is_valid = False
                session.last_used = datetime.utcnow()

            db.commit()
    except Exception as e:
        logger.warning("Failed to invalidate session for %s/%s: %s", user_email, platform, e)
