"""
ARQ Worker — executes bot tasks from Redis queue.

Run as a SEPARATE process from the API:
    cd backend && python -m arq workers.bot_worker.WorkerSettings

Each task = one user automation session on one platform.
Worker maintains a BrowserPool shared across concurrent tasks.
"""
import asyncio
import logging
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path

# Allow imports from backend/ and bot/
_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(_ROOT / "backend"))
sys.path.insert(0, str(_ROOT))

from database import (
    SessionLocal, User, PlatformCredential, JobApplication,
    BotLog, RecruiterContact, PLAN_FEATURES,
)
from services.crypto import decrypt_password
from services.whatsapp import TwilioWhatsAppSender, process_recruiter_contact

logger = logging.getLogger(__name__)


# ── Task ───────────────────────────────────────────────────────────────────────

async def run_bot_task(
    ctx,
    user_email: str,
    platform:   str,
    max_jobs:   int = 50,
):
    """
    Main ARQ task — called by the worker for each (user, platform) pair.
    Creates and tears down its own BrowserPool per task to keep memory low.
    """
    from bot.browser.pool import BrowserPool
    task_id = ctx.get("job_id", str(uuid.uuid4()))
    logger.info("Task start: user=%s platform=%s max_jobs=%d", user_email, platform, max_jobs)

    def _log(message: str, level: str = "info"):
        with SessionLocal() as db:
            db.add(BotLog(
                user_email = user_email,
                task_id    = task_id,
                platform   = platform,
                message    = message,
                level      = level,
            ))
            db.commit()

    from bot.browser.session_manager import get_storage_state

    # Load user & credentials
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == user_email).first()
        if not user:
            _log("User not found — task aborted.", "error")
            return {"error": "User not found"}

        cred = db.query(PlatformCredential).filter_by(
            user_email=user_email, platform=platform
        ).first()

        if not cred:
            # Fall back to legacy flat columns
            plat_email = getattr(user, f"{platform}_email", "") or ""
            plat_pass  = getattr(user, f"{platform}_password", "") or ""
        else:
            plat_email = cred.email
            plat_pass  = decrypt_password(cred.encrypted_password)

        storage_state = get_storage_state(user_email, platform)
        has_credentials = bool(plat_email and plat_pass)
        if not has_credentials and not storage_state:
            _log(f"No credentials or browser session for {platform} — task skipped.", "warn")
            return {"error": "No credentials or session"}

        config = {
            "platform":         platform,
            "email":            plat_email or user_email,
            "password":         plat_pass or "",
            "user_email":       user_email,
            "target_titles":    [t.strip() for t in (user.target_titles or "").split(",") if t.strip()],
            "target_locations": [
                l.strip()
                for l in (user.target_locations or "").replace("\r", "").split("\n")
                if l.strip()
            ],
            "max_applications": max_jobs,
            "cv_path":          user.cv_path or "",
            "phone":            user.phone or "",
            "skills":           user.skills or "",
            "name":             user.name or "",
            "cv_public_url":    user.cv_public_url or "",
        }

    _log(f"Starting {platform} automation — max {max_jobs} applications")

    # Import platform adapter
    try:
        adapter_class = _get_adapter(platform)
    except ImportError as e:
        _log(f"Platform adapter not available for {platform}: {e}", "warn")
        return {"error": f"Adapter not found: {platform}"}

    # Run automation inside a per-task browser pool (start fresh, shut down after)
    # This keeps peak memory low on constrained hosts (Render free plan).
    results = []
    pool = BrowserPool(pool_size=1)
    await pool.start()
    try:
        async with pool.acquire(storage_state=storage_state) as ctx_browser:
            from bot.platforms.base import PlatformConfig
            adapter_config = PlatformConfig(
                platform_id       = platform,
                email             = config["email"],
                password          = config["password"],
                target_titles     = config["target_titles"],
                target_locations  = config["target_locations"],
                max_applications  = config["max_applications"],
                cv_path           = config["cv_path"] or None,
                phone             = config["phone"] or None,
                skills            = config["skills"] or None,
            )
            setattr(adapter_config, "_user_email", user_email)
            adapter  = adapter_class(adapter_config, ctx_browser)
            results  = await adapter.run()
    finally:
        await pool.shutdown()

    # Persist applied jobs
    saved = 0
    with SessionLocal() as db:
        for r in results:
            if not r.applied:
                continue
            try:
                db.add(JobApplication(
                    id              = str(uuid.uuid4()),
                    user_email      = user_email,
                    title           = r.title,
                    company         = r.company,
                    location        = r.location,
                    platform        = platform,
                    job_external_id = r.job_id,
                    job_url         = r.url,
                    description     = r.description,
                    applied_at      = datetime.utcnow(),
                    proof           = f"{platform} Easy Apply",
                ))
                saved += 1
            except Exception as e:
                logger.warning("Failed to save application: %s", e)

            # Handle recruiter phone found in job description
            if r.recruiter_phone:
                try:
                    sender = TwilioWhatsAppSender()
                    await process_recruiter_contact(
                        db_session    = db,
                        user_email    = user_email,
                        post_data     = {
                            "phone":    r.recruiter_phone,
                            "author":   r.company,
                            "post_url": r.url,
                            "text":     r.description or "",
                        },
                        user_profile  = {"name": config["name"], "skills": config["skills"],
                                         "cv_public_url": config["cv_public_url"]},
                        whatsapp_sender = sender,
                    )
                except Exception as e:
                    logger.warning("Recruiter WhatsApp failed: %s", e)

        db.commit()

    # Run AI cover letter generation asynchronously (non-blocking)
    applied_jobs = [r for r in results if r.applied]
    if applied_jobs:
        asyncio.create_task(_enrich_with_ai(user_email, applied_jobs, config))

    summary = f"Done: applied to {saved}/{len(results)} jobs on {platform}"
    _log(summary, "success")
    logger.info("Task complete: %s", summary)
    return {"applied": saved, "found": len(results), "platform": platform}


def _get_adapter(platform: str):
    """Import and return the adapter class for the given platform."""
    from bot.platforms.linkedin_jobs import LinkedInJobsAdapter
    from bot.platforms.indeed import IndeedAdapter
    from bot.platforms.glassdoor import GlassdoorAdapter
    from bot.platforms.monster import MonsterAdapter
    from bot.platforms.google_jobs import GoogleJobsAdapter

    mapping = {
        "linkedin":    LinkedInJobsAdapter,
        "indeed":      IndeedAdapter,
        "glassdoor":   GlassdoorAdapter,
        "monster":     MonsterAdapter,
        "google_jobs": GoogleJobsAdapter,
    }
    if platform not in mapping:
        raise ImportError(f"No adapter for: {platform}")
    return mapping[platform]


async def _enrich_with_ai(user_email: str, applied_jobs, config: dict):
    """
    Background task after bot run:
      1. Generate AI cover letters for every applied job.
      2. Tailor the user's default resume to each job (if a default resume exists).
    Both results are stored on the JobApplication row for later download.
    """
    jobs_data = [
        {"title": r.title, "company": r.company, "description": r.description or "",
         "job_id": r.job_id, "url": r.url}
        for r in applied_jobs
    ]

    # ── Cover letters ──────────────────────────────────────────────────────────
    try:
        from ai.cover_letter import generate_cover_letter_batch
        enriched = await generate_cover_letter_batch(
            user_profile={"name": config["name"], "skills": config["skills"]},
            jobs=jobs_data,
        )
        with SessionLocal() as db:
            for job_data, result in zip(applied_jobs, enriched):
                app = db.query(JobApplication).filter_by(
                    user_email=user_email,
                    job_external_id=job_data["job_id"],
                ).first()
                if app and result.get("cover_letter"):
                    app.cover_letter = result["cover_letter"]
            db.commit()
        logger.info("Cover letters generated for %d jobs", len(enriched))
    except Exception as e:
        logger.warning("Cover letter generation failed: %s", e)

    # ── Auto-tailor default resume ─────────────────────────────────────────────
    try:
        from database import Resume
        from services.resume_ai_optimizer import optimize_resume_for_job

        with SessionLocal() as db:
            default_resume = db.query(Resume).filter_by(
                user_email=user_email, is_default=True
            ).first()
            if not default_resume:
                default_resume = db.query(Resume).filter_by(
                    user_email=user_email
                ).order_by(Resume.created_at.desc()).first()

            if not default_resume:
                logger.info("No resume found for %s — skipping resume tailoring", user_email)
                return

            # Serialize INSIDE session to avoid DetachedInstanceError on lazy-loaded relationships
            from routers.resume import _serialize_resume
            resume_data = _serialize_resume(default_resume)   # session still open here

        for job in applied_jobs:
            if not job.description:
                continue
            try:
                optimized = await optimize_resume_for_job(
                    resume_data     = resume_data,
                    job_title       = job.title,
                    company         = job.company,
                    job_description = job.description,
                )
                if not optimized:
                    continue

                import json as _json
                with SessionLocal() as db:
                    app = db.query(JobApplication).filter_by(
                        user_email=user_email, job_external_id=job.job_id,
                    ).first()
                    if app:
                        app.tailored_resume = _json.dumps(optimized)
                    db.commit()
            except Exception as e:
                logger.warning("Resume tailoring failed for job %s: %s", job.job_id, e)

        logger.info("Resume tailoring complete for %d applied jobs", len(applied_jobs))

    except Exception as e:
        logger.warning("Auto-resume enrichment failed: %s", e)


# ── Worker lifecycle ───────────────────────────────────────────────────────────

async def startup(ctx):
    """Called once when the worker process starts."""
    logger.info("Worker started — browser pool is per-task (lazy)")


async def shutdown(ctx):
    """Called once when the worker process stops."""
    logger.info("Worker shutdown")


# ── ARQ WorkerSettings ─────────────────────────────────────────────────────────

def _redis_settings():
    from arq.connections import RedisSettings
    from urllib.parse import urlparse

    url = os.getenv("REDIS_URL", "")
    if url:
        # Render gives redis:// or rediss:// (TLS) with optional user:password@host:port
        # Use urlparse so we handle all variants correctly
        p = urlparse(url)
        use_tls = p.scheme == "rediss"
        return RedisSettings(
            host     = p.hostname or "localhost",
            port     = p.port or 6379,
            username = p.username or None,   # Render uses ACL: AUTH default <password>
            password = p.password or None,
            ssl      = use_tls,
        )

    return RedisSettings(
        host     = os.getenv("REDIS_HOST", "localhost"),
        port     = int(os.getenv("REDIS_PORT", "6379")),
        password = os.getenv("REDIS_PASSWORD") or None,
    )


class WorkerSettings:
    redis_settings = _redis_settings()
    functions      = [run_bot_task]
    on_startup     = startup
    on_shutdown    = shutdown
    max_jobs       = 3         # concurrent tasks per worker process (each spawns Chromium)
    job_timeout    = 3600      # 1 hour max per task
    keep_result    = 86400     # store results 24 hours
    retry_jobs     = False     # don't auto-retry failed bot runs
