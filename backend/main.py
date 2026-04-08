import os
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import profile, jobs, auth, bot, billing

load_dotenv()

# Setup logging for CORS debugging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="JobRocket API",
    version="1.0.0"
)

# ─────────────────────────────────────────────────────────────────────
# CORS Configuration - MUST BE BEFORE ANY ROUTES
# ─────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = [
    # Production domains
    "https://jobrocket.aiviora.online",
    "https://www.jobrocket.aiviora.online",
    
    # Development/Testing
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    
    # Vercel deployments (for testing)
    "https://bot-automation-job.vercel.app",
]

# Allow extra origins from environment variable (comma-separated)
extra_origins = os.getenv("EXTRA_CORS_ORIGINS", "").strip()
if extra_origins:
    additional = [origin.strip() for origin in extra_origins.split(",") if origin.strip()]
    ALLOWED_ORIGINS.extend(additional)
    logger.info(f"Added extra origins from env: {additional}")

logger.info(f"CORS Allowed Origins: {ALLOWED_ORIGINS}")

# Add CORS middleware BEFORE any routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "Accept",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
    ],
    expose_headers=[
        "Content-Type",
        "Authorization",
        "X-Total-Count",
    ],
    max_age=3600,  # 1 hour
)

# ─────────────────────────────────────────────────────────────────────
# DEBUG MIDDLEWARE - Log incoming requests and origins
# ─────────────────────────────────────────────────────────────────────
@app.middleware("http")
async def log_request_origin(request: Request, call_next):
    origin = request.headers.get("origin", "NO_ORIGIN")
    logger.info(f"[{request.method}] {request.url.path} | Origin: {origin}")
    
    response = await call_next(request)
    return response

# ─────────────────────────────────────────────────────────────────────
# Include API Routers
# ─────────────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(bot.router, prefix="/api/bot", tags=["bot"])
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])


# ─────────────────────────────────────────────────────────────────────
# Health Check Endpoints
# ─────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    """Simple health check endpoint."""
    return {"status": "ok", "service": "JobRocket API"}

# ─────────────────────────────────────────────────────────────────────
# Database Check Endpoint (Debug)
# ─────────────────────────────────────────────────────────────────────
@app.get("/db-check")
def db_check():
    """Check database connection and list tables."""
    try:
        from database import engine
        from sqlalchemy import text, inspect

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        inspector = inspect(engine)
        tables = inspector.get_table_names()

        logger.info(f"Database check passed. Tables: {tables}")
        return {
            "status": "ok",
            "db": "connected",
            "tables": tables
        }

    except Exception as e:
        logger.error(f"Database check failed: {str(e)}")
        return {
            "status": "error",
            "db": "failed",
            "detail": str(e)
        }

# -----------------------------

# ─────────────────────────────────────────────────────────────────────
# Debug Endpoints (Development Only)
# ─────────────────────────────────────────────────────────────────────
@app.post("/debug-register")
def debug_register(body: dict):
    """Debug endpoint to create test users (dev only)."""
    try:
        from database import SessionLocal, User
        from passlib.context import CryptContext

        pwd_context = CryptContext(
            schemes=["bcrypt"],
            deprecated="auto"
        )

        with SessionLocal() as db:

            existing = db.get(User, body.get("email"))
            if existing:
                logger.warning(f"Debug register: user {body.get('email')} already exists")
                return {"result": "already exists"}

            user = User(
                email=body["email"],
                name=body["name"],
                hashed_pw=pwd_context.hash(body["password"])
            )

            db.add(user)
            db.commit()

            logger.info(f"Debug register: created user {body.get('email')}")
            return {"result": "created"}

    except Exception as e:
        import traceback
        logger.error(f"Debug register error: {str(e)}")

        return {
            "error": str(e),
            "trace": traceback.format_exc()
        }