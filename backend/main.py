"""
JobRocket API — production FastAPI backend.

v2 changes:
- Rate limiting on auth endpoints (slowapi)
- DB init_db() called on startup (creates new tables)
- Recruiter router included
- Graceful schema migration for existing deployments
"""
import os
import logging
import time
from datetime import datetime

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# ── Rate limiting ──────────────────────────────────────────────────────────────
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="JobRocket API",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ───────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = [
    "https://bot-automation-job.vercel.app",
    "https://jobrocket.aiviora.online",
    "https://www.jobrocket.aiviora.online",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]
extra = os.getenv("EXTRA_CORS_ORIGINS", "")
if extra:
    ALLOWED_ORIGINS.extend(o.strip() for o in extra.split(",") if o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "Origin",
                   "Access-Control-Request-Method", "Access-Control-Request-Headers"],
    expose_headers=["Content-Type", "Authorization", "X-Total-Count"],
    max_age=3600,
)

# ── Logging middleware ─────────────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.time()
    origin = request.headers.get("origin", "-")
    logger.info("→ %s %s  origin=%s", request.method, request.url.path, origin)
    try:
        resp = await call_next(request)
        ms = (time.time() - t0) * 1000
        logger.info("← %s %s  status=%s  %.0fms", request.method, request.url.path, resp.status_code, ms)
        return resp
    except Exception as exc:
        ms = (time.time() - t0) * 1000
        logger.error("✗ %s %s  %.0fms  %s", request.method, request.url.path, ms, exc, exc_info=True)
        raise

# ── Exception handlers ─────────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exc(request: Request, exc: Exception):
    origin = request.headers.get("origin", "*")
    logger.error("UNHANDLED %s %s — %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal Server Error", "detail": str(exc),
                 "timestamp": datetime.utcnow().isoformat()},
        headers={"Access-Control-Allow-Origin": origin,
                 "Access-Control-Allow-Credentials": "true"},
    )

@app.exception_handler(HTTPException)
async def http_exc(request: Request, exc: HTTPException):
    origin = request.headers.get("origin", "*")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "timestamp": datetime.utcnow().isoformat()},
        headers={"Access-Control-Allow-Origin": origin,
                 "Access-Control-Allow-Credentials": "true"},
    )

# ── Routers ────────────────────────────────────────────────────────────────────
from routers import auth, profile, jobs, bot, billing, feedback, recruiter, resume

app.include_router(auth.router,      prefix="/api/auth",      tags=["auth"])
app.include_router(profile.router,   prefix="/api/profile",   tags=["profile"])
app.include_router(jobs.router,      prefix="/api/jobs",      tags=["jobs"])
app.include_router(bot.router,       prefix="/api/bot",       tags=["bot"])
app.include_router(billing.router,   prefix="/api/billing",   tags=["billing"])
app.include_router(feedback.router,  prefix="/api/feedback",  tags=["feedback"])
app.include_router(recruiter.router, prefix="/api/recruiter", tags=["recruiter"])
app.include_router(resume.router,    prefix="/api/resume",    tags=["resume"])

# ── Startup ────────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    logger.info("=" * 70)
    logger.info("JobRocket API v2 starting")

    # Create all tables (new ones added in v2 schema)
    from database import init_db
    init_db()
    logger.info("DB tables initialised")

    # Migrate existing deployments: add any missing columns gracefully
    _migrate_existing_schema()

    logger.info("Ready — %d CORS origins + *.vercel.app", len(ALLOWED_ORIGINS))
    logger.info("=" * 70)


def _migrate_existing_schema():
    """Add columns that exist in v2 but not in v1 production databases."""
    from database import engine
    from sqlalchemy import text, inspect

    inspector = inspect(engine)
    tables = inspector.get_table_names()

    migrations: list[tuple[str, str, str]] = [
        # (table, column, SQL)
        ("users", "id",             "ALTER TABLE users ADD COLUMN id VARCHAR DEFAULT ''"),
        ("users", "cv_public_url",  "ALTER TABLE users ADD COLUMN cv_public_url VARCHAR"),
        ("users", "created_at",     "ALTER TABLE users ADD COLUMN created_at TIMESTAMP"),
        ("users", "trial_start",    "ALTER TABLE users ADD COLUMN trial_start TIMESTAMP"),
        ("users", "trial_end",      "ALTER TABLE users ADD COLUMN trial_end TIMESTAMP"),
        ("users", "trial_used",     "ALTER TABLE users ADD COLUMN trial_used INTEGER DEFAULT 0"),
        ("users", "payment_status", "ALTER TABLE users ADD COLUMN payment_status VARCHAR DEFAULT 'trial'"),
        ("users", "last_payment_id","ALTER TABLE users ADD COLUMN last_payment_id VARCHAR"),
        ("users", "usage_start",    "ALTER TABLE users ADD COLUMN usage_start TIMESTAMP"),
        ("users", "feedback_requested","ALTER TABLE users ADD COLUMN feedback_requested INTEGER DEFAULT 0"),
        ("job_applications", "user_id",         "ALTER TABLE job_applications ADD COLUMN user_id VARCHAR"),
        ("job_applications", "job_external_id", "ALTER TABLE job_applications ADD COLUMN job_external_id VARCHAR"),
        ("job_applications", "description",     "ALTER TABLE job_applications ADD COLUMN description TEXT"),
        ("job_applications", "tailored_resume", "ALTER TABLE job_applications ADD COLUMN tailored_resume TEXT"),
        ("job_applications", "cover_letter",    "ALTER TABLE job_applications ADD COLUMN cover_letter TEXT"),
        ("bot_logs", "user_id",   "ALTER TABLE bot_logs ADD COLUMN user_id VARCHAR"),
        ("bot_logs", "task_id",   "ALTER TABLE bot_logs ADD COLUMN task_id VARCHAR"),
        ("bot_logs", "platform",  "ALTER TABLE bot_logs ADD COLUMN platform VARCHAR"),
    ]

    with engine.begin() as conn:
        for table, col, sql in migrations:
            if table not in tables:
                continue
            existing = [c["name"] for c in inspector.get_columns(table)]
            if col in existing:
                continue
            try:
                conn.execute(text(sql))
                logger.info("Migration: added %s.%s", table, col)
            except Exception as e:
                if "already exists" not in str(e).lower():
                    logger.warning("Migration skip %s.%s: %s", table, col, e)


# ── Health / diagnostics ───────────────────────────────────────────────────────
_REDIS_URL_CACHE: str | None = None

def _redis_url() -> str | None:
    global _REDIS_URL_CACHE
    if _REDIS_URL_CACHE:
        return _REDIS_URL_CACHE
    url = os.getenv("REDIS_URL")
    if not url and os.getenv("REDIS_HOST"):
        pw   = os.getenv("REDIS_PASSWORD", "")
        host = os.getenv("REDIS_HOST", "localhost")
        port = os.getenv("REDIS_PORT", "6379")
        url  = f"redis://:{pw}@{host}:{port}" if pw else f"redis://{host}:{port}"
    _REDIS_URL_CACHE = url
    return url


@app.get("/health")
def health():
    checks: dict = {}

    # Database
    try:
        from database import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"

    # Redis
    try:
        import redis as _redis
        r = _redis.from_url(_redis_url() or "redis://localhost:6379",
                            socket_connect_timeout=2, socket_timeout=2)
        r.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"unavailable: {e}"

    overall = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return {
        "status":    overall,
        "checks":    checks,
        "service":   "JobRocket API v2",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/db-check")
def db_check():
    try:
        from database import engine
        from sqlalchemy import text, inspect
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        tables = inspect(engine).get_table_names()
        return {"status": "ok", "tables": tables}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.post("/migrate/add-trial-columns")
def migrate_legacy(api_key: str = None):
    """Legacy migration endpoint — kept for backward compatibility."""
    key = os.getenv("MIGRATION_API_KEY")
    if key and api_key != key:
        return JSONResponse(status_code=403, content={"error": "Unauthorized"})
    _migrate_existing_schema()
    return {"status": "ok", "message": "Migration complete"}
