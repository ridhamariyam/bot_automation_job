"""
JobRocket Bot Runner v2 — orchestrates platform adapters via the BrowserPool.

Execution modes:
    1. ARQ worker (production): bot_worker.py calls run_bot_task() directly
    2. Subprocess (dev/fallback): spawned by backend bot.py router
    3. CLI: python bot/runner.py [for local testing]

In subprocess/CLI mode this script runs one user's full automation session.
"""
import asyncio
import logging
import os
import sys
from pathlib import Path

import httpx

# Ensure backend imports work when run as subprocess
_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(_ROOT / "backend"))
sys.path.insert(0, str(_ROOT))

from database import SessionLocal, PlatformCredential, User
from services.crypto import decrypt_password
from bot.browser.session_manager import get_storage_state

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

BASE_URL = os.getenv("BOT_API_URL", "http://localhost:8000")

PLATFORM_MAP = {
    "linkedin":    "bot.platforms.linkedin_jobs.LinkedInJobsAdapter",
    "indeed":      "bot.platforms.indeed.IndeedAdapter",
    "glassdoor":   "bot.platforms.glassdoor.GlassdoorAdapter",
    "monster":     "bot.platforms.monster.MonsterAdapter",
    "google_jobs": "bot.platforms.google_jobs.GoogleJobsAdapter",
}


async def fetch_profile(user_email: str, token: str) -> dict:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == user_email).first()
        if not user:
            raise RuntimeError(f"User not found: {user_email}")

        creds = {
            cred.platform: cred
            for cred in db.query(PlatformCredential).filter_by(user_email=user_email).all()
        }

        profile = {
            "email": user.email,
            "name": user.name or "",
            "phone": user.phone or "",
            "cv_path": user.cv_path or "",
            "skills": [s.strip() for s in (user.skills or "").split(",") if s.strip()],
            "target_titles": [t.strip() for t in (user.target_titles or "").split(",") if t.strip()],
            "target_locations": [
                l.strip()
                for l in (user.target_locations or "").replace("\r", "").split("\n")
                if l.strip()
            ],
        }

        for platform in PLATFORM_MAP:
            cred = creds.get(platform)
            if cred:
                plat_email = cred.email
                plat_pass = decrypt_password(cred.encrypted_password)
                verified = bool(cred.verified)
            else:
                plat_email = getattr(user, f"{platform}_email", "") or ""
                plat_pass = getattr(user, f"{platform}_password", "") or ""
                verified = bool(getattr(user, f"{platform}_verified", 0))

            if getattr(user, f"{platform}_session_json", None):
                verified = True

            profile[f"{platform}_email"] = plat_email
            profile[f"{platform}_password"] = plat_pass
            profile[f"{platform}_verified"] = verified

        return profile


async def post_log(user_email: str, message: str, level: str = "info"):
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{BASE_URL}/api/bot/log",
                json={"user_email": user_email, "message": message, "level": level},
                timeout=5,
            )
    except Exception:
        pass


async def record_application(user_email: str, job) -> None:
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{BASE_URL}/api/jobs",
                json={
                    "user_email":     user_email,
                    "title":          job.title,
                    "company":        job.company,
                    "location":       job.location,
                    "platform":       job.platform,
                    "job_url":        job.url,
                    "status":         "Applied",
                    "proof":          getattr(job, "proof", f"{job.platform} Easy Apply"),
                    "score":          getattr(job, "score", None),
                    "score_breakdown": getattr(job, "score_breakdown", None),
                },
                timeout=10,
            )
    except Exception as e:
        logger.warning("Failed to record application: %s", e)


def _import_adapter(dotted: str):
    parts  = dotted.rsplit(".", 1)
    module = __import__(parts[0], fromlist=[parts[1]])
    return getattr(module, parts[1])


async def main(user_email: str, token: str, max_jobs_each: int = 50):
    logger.info("JobRocket Bot v2 starting for %s", user_email)

    data = await fetch_profile(user_email, token)

    titles    = [t.strip() for t in data.get("target_titles", []) if t.strip()]
    locations = _clean_locations(data.get("target_locations", []))

    if not titles:
        await post_log(user_email, "No target job titles set. Go to Settings → Profile.", "error")
        return
    if not locations:
        await post_log(user_email, "No target locations set. Go to Settings → Profile.", "error")
        return

    logger.info("Titles: %s", titles)
    logger.info("Locations: %s", locations)

    # Determine which platforms to run (based on verified credentials)
    platforms_to_run: list[tuple[str, str, str, dict | None]] = []
    for platform, dotted_class in PLATFORM_MAP.items():
        del dotted_class
        saved_email = data.get(f"{platform}_email", "")
        saved_pass  = data.get(f"{platform}_password", "")
        verified    = bool(data.get(f"{platform}_verified"))
        storage_state = get_storage_state(user_email, platform)
        has_credentials = bool(saved_email and saved_pass)

        if verified and (has_credentials or storage_state):
            platforms_to_run.append((
                platform,
                saved_email or user_email,
                saved_pass or "",
                storage_state,
            ))

    if not platforms_to_run:
        await post_log(
            user_email,
            "No ready platform connection found. Set up LinkedIn or Indeed in Settings.",
            "error",
        )
        return

    await post_log(
        user_email,
        f"Running on platforms: {', '.join(p[0] for p in platforms_to_run)}",
        "info",
    )

    # Import and run adapters using a shared BrowserPool
    from bot.browser.pool import BrowserPool
    from bot.platforms.base import PlatformConfig

    pool = BrowserPool(size=min(len(platforms_to_run), 3))
    await pool.start()

    try:
        for platform, plat_email, plat_pass, storage_state in platforms_to_run:
            AdapterClass = _import_adapter(PLATFORM_MAP[platform])
            config       = PlatformConfig(
                platform_id      = platform,
                email            = plat_email,
                password         = plat_pass,
                target_titles    = titles,
                target_locations = locations,
                max_applications = max_jobs_each,
                cv_path          = data.get("cv_path") or None,
                phone            = data.get("phone") or None,
                skills           = (
                    ",".join(data.get("skills", []))
                    if isinstance(data.get("skills"), list)
                    else data.get("skills") or ""
                ),
            )
            setattr(config, "_user_email", user_email)

            await post_log(user_email, f"Starting {platform}...", "info")

            async with pool.acquire(storage_state=storage_state) as ctx:
                adapter = AdapterClass(config, ctx)

                # Inject logging function
                async def _log(msg: str, lvl: str = "info"):
                    await post_log(user_email, f"[{platform}] {msg}", lvl)

                adapter._log_fn = _log
                results         = await adapter.run()

            # Record applied jobs
            applied = [r for r in results if r.applied]
            for job in applied:
                await record_application(user_email, job)

            await post_log(
                user_email,
                f"{platform}: applied to {len(applied)}/{len(results)} jobs",
                "success" if applied else "info",
            )

    finally:
        await pool.shutdown()

    await post_log(user_email, "Bot finished all platforms.", "success")
    logger.info("Bot finished for %s", user_email)


def _clean_locations(raw: list) -> list[str]:
    """Rejoin 'City, Country' pairs that were split by comma."""
    result = []
    i      = 0
    while i < len(raw):
        loc = raw[i].strip()
        if (
            i + 1 < len(raw)
            and len(raw[i + 1].strip()) <= 20
            and not any(c.isdigit() for c in raw[i + 1])
            and raw[i + 1].strip() not in ("Remote", "remote")
        ):
            result.append(f"{loc}, {raw[i+1].strip()}")
            i += 2
        else:
            result.append(loc)
            i += 1
    return result


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(_ROOT / "backend" / ".env")

    _email = os.getenv("BOT_USER_EMAIL") or input("Email: ").strip()
    _token = os.getenv("BOT_TOKEN")      or input("Token: ").strip()
    _max   = int(os.getenv("BOT_MAX_JOBS", "50"))

    asyncio.run(main(_email, _token, max_jobs_each=_max))
