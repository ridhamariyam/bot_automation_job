"""
Session manager — persists browser cookies to the database.

Replaces the file-based sessions in bot/sessions/*.json.
DB-backed sessions survive Render redeploys and are shared across workers.
"""
import json
import logging
from datetime import datetime
from typing import Optional

from playwright.async_api import BrowserContext

logger = logging.getLogger(__name__)


async def save_session(ctx: BrowserContext, user_email: str, platform: str) -> bool:
    """Save current browser cookies to platform_sessions table."""
    try:
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
        from database import SessionLocal, PlatformSession

        cookies = await ctx.cookies()
        cookies_json = json.dumps(cookies)

        with SessionLocal() as db:
            session = db.query(PlatformSession).filter_by(
                user_email=user_email, platform=platform
            ).first()
            if session:
                session.cookies_json = cookies_json
                session.last_used    = datetime.utcnow()
                session.is_valid     = True
            else:
                db.add(PlatformSession(
                    user_email   = user_email,
                    platform     = platform,
                    cookies_json = cookies_json,
                    last_used    = datetime.utcnow(),
                    is_valid     = True,
                ))
            db.commit()
        return True
    except Exception as e:
        logger.warning("Failed to save session for %s/%s: %s", user_email, platform, e)
        return False


async def load_session(ctx: BrowserContext, user_email: str, platform: str) -> bool:
    """Load cookies from DB into browser context. Returns True if session was found."""
    try:
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
        from database import SessionLocal, PlatformSession

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
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
        from database import SessionLocal, PlatformSession

        with SessionLocal() as db:
            session = db.query(PlatformSession).filter_by(
                user_email=user_email, platform=platform
            ).first()
            if session:
                session.is_valid = False
                db.commit()
    except Exception as e:
        logger.warning("Failed to invalidate session: %s", e)
