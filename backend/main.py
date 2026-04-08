"""
JobRocket API - Production-Safe Backend with CORS, Error Handling, and Logging

Key Features:
- FastAPI backend with proper CORS configuration for Vercel + Render
- Global exception handler that preserves CORS headers even on errors
- Structured logging middleware for debugging
- Safe database connection patterns
- Support for Vercel preview deployments via regex
"""

import os
import logging
import json
import time
from typing import Callable
from datetime import datetime

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import profile, jobs, auth, bot, billing

load_dotenv()

# ═════════════════════════════════════════════════════════════════════════════
# LOGGING CONFIGURATION
# ═════════════════════════════════════════════════════════════════════════════
# Structured logging for production - logs all request/response metadata
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ═════════════════════════════════════════════════════════════════════════════
# FASTAPI APP INITIALIZATION
# ═════════════════════════════════════════════════════════════════════════════
app = FastAPI(
    title="JobRocket API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ═════════════════════════════════════════════════════════════════════════════
# CORS CONFIGURATION - MUST BE FIRST MIDDLEWARE
# ═════════════════════════════════════════════════════════════════════════════
# Why this order matters:
# 1. Middleware added first runs LAST on response (LIFO order)
# 2. CORS must run LAST to ensure headers are added to ALL responses
# 3. Even exceptions and errors will get CORS headers

ALLOWED_ORIGINS = [
    # Vercel Production
    "https://bot-automation-job.vercel.app",
    
    # Production domains for custom domain
    "https://jobrocket.aiviora.online",
    "https://www.jobrocket.aiviora.online",
    
    # Development/Testing
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]

# Add environment variable origins (comma-separated)
extra_origins = os.getenv("EXTRA_CORS_ORIGINS", "").strip()
if extra_origins:
    additional = [o.strip() for o in extra_origins.split(",") if o.strip()]
    ALLOWED_ORIGINS.extend(additional)
    logger.info(f"✅ Added extra CORS origins from env: {additional}")

logger.info(f"✅ CORS Allowed Origins: {ALLOWED_ORIGINS}")

# CRITICAL: CORSMiddleware added FIRST so it runs LAST on response
# This ensures CORS headers are present even when exceptions occur
app.add_middleware(
    CORSMiddleware,
    # Explicit whitelist prevents "Access-Control-Allow-Origin: *" (which breaks credentials)
    allow_origins=ALLOWED_ORIGINS,
    # Pattern for Vercel preview deployments: *.vercel.app
    allow_origin_regex=r"https://.*\.vercel\.app",
    # Credentials required for auth headers and cookies
    allow_credentials=True,
    # HTTP methods used by Vercel frontend
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    # Headers used by frontend requests
    allow_headers=[
        "Content-Type",
        "Authorization",
        "Accept",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
    ],
    # Headers exposed to frontend JavaScript
    expose_headers=[
        "Content-Type",
        "Authorization",
        "X-Total-Count",
    ],
    # Cache preflight for 1 hour (improves performance)
    max_age=3600,
)

# ═════════════════════════════════════════════════════════════════════════════
# STRUCTURED LOGGING MIDDLEWARE
# ═════════════════════════════════════════════════════════════════════════════
# Why this works:
# - Logs ALL requests/responses including timing
# - Captures origin for debugging CORS issues
# - Logs response status (helps diagnose 500 errors hidden as CORS)
@app.middleware("http")
async def structured_logging_middleware(request: Request, call_next):
    """Log request metadata and response status for debugging."""
    
    # Extract request info
    method = request.method
    path = request.url.path
    origin = request.headers.get("origin", "NO_ORIGIN")
    start_time = time.time()
    
    # Log incoming request
    logger.info(
        f"→ [{method}] {path} | Origin: {origin}"
    )
    
    try:
        # Call the next middleware/route
        response = await call_next(request)
        
        # Calculate response time
        duration_ms = (time.time() - start_time) * 1000
        
        # Log response
        logger.info(
            f"← [{method}] {path} | Status: {response.status_code} | "
            f"Duration: {duration_ms:.2f}ms | Origin: {origin}"
        )
        
        return response
        
    except Exception as exc:
        # Log unexpected exceptions
        duration_ms = (time.time() - start_time) * 1000
        logger.error(
            f"✗ [{method}] {path} | Exception: {type(exc).__name__}: {str(exc)} | "
            f"Duration: {duration_ms:.2f}ms | Origin: {origin}",
            exc_info=True
        )
        raise

# ═════════════════════════════════════════════════════════════════════════════
# GLOBAL EXCEPTION HANDLER
# ═════════════════════════════════════════════════════════════════════════════
# Why this prevents "misleading CORS errors":
# - Browser sees 500 error first
# - If CORS headers are missing, browser shows CORS error instead of real error
# - This handler ensures CORS headers are ALWAYS returned
# - Frontend gets real error details instead of generic "CORS blocked"

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler that:
    1. Catches ALL unhandled exceptions
    2. Logs full error details
    3. Returns JSON response with CORS headers
    4. Prevents misleading "CORS blocked" errors in browser
    """
    
    method = request.method
    path = request.url.path
    origin = request.headers.get("origin", "NO_ORIGIN")
    
    logger.error(
        f"🔴 UNHANDLED EXCEPTION: [{method}] {path} | Origin: {origin}",
        exc_info=exc,
        extra={
            "client_origin": origin,
            "request_path": path,
            "request_method": method
        }
    )
    
    # Determine status code
    status_code = 500
    if isinstance(exc, HTTPException):
        status_code = exc.status_code
    
    # Return JSON error response (not HTML 500 page)
    return JSONResponse(
        status_code=status_code,
        content={
            "error": "Internal Server Error",
            "detail": str(exc) if str(exc) else "An unexpected error occurred",
            "type": type(exc).__name__,
            "timestamp": datetime.utcnow().isoformat(),
        },
        headers={
            # Explicitly add CORS headers so browser doesn't block the error response
            "Access-Control-Allow-Origin": origin if origin != "NO_ORIGIN" else "*",
            "Access-Control-Allow-Credentials": "true",
        }
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle FastAPI HTTP exceptions with CORS headers."""
    
    origin = request.headers.get("origin", "NO_ORIGIN")
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail if isinstance(exc.detail, dict) else {"message": exc.detail},
            "timestamp": datetime.utcnow().isoformat(),
        },
        headers={
            "Access-Control-Allow-Origin": origin if origin != "NO_ORIGIN" else "*",
            "Access-Control-Allow-Credentials": "true",
        }
    )

# ═════════════════════════════════════════════════════════════════════════════
# STARTUP EVENT
# ═════════════════════════════════════════════════════════════════════════════
@app.on_event("startup")
async def startup_event():
    """Log startup confirmation for monitoring."""
    logger.info("=" * 80)
    logger.info("🚀 JobRocket API Starting")
    logger.info(f"✅ CORS configured for: {len(ALLOWED_ORIGINS)} origins + *.vercel.app")
    logger.info("✅ Global exception handler active")
    logger.info("✅ Structured logging enabled")
    logger.info("=" * 80)

# ═════════════════════════════════════════════════════════════════════════════
# INCLUDE API ROUTERS
# ═════════════════────════────────────────────────────────────────────────────
# Routes are included AFTER middleware setup so middleware runs on all routes
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(bot.router, prefix="/api/bot", tags=["bot"])
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])

# ═════════════════════════════════════════════════════════════════════════════
# HEALTH CHECK & DIAGNOSTIC ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    """
    Health check endpoint - returns 200 if API is running.
    Used by Render to verify service is alive.
    """
    return {
        "status": "ok",
        "service": "JobRocket API",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/db-check")
def db_check():
    """
    Database connectivity check - returns list of tables if DB is connected.
    Useful for debugging database issues.
    """
    try:
        from database import engine
        from sqlalchemy import text, inspect

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        inspector = inspect(engine)
        tables = inspector.get_table_names()

        logger.info(f"✅ Database check passed. Tables: {tables}")
        return {
            "status": "ok",
            "database": "connected",
            "tables": tables,
            "count": len(tables),
        }

    except Exception as e:
        logger.error(f"❌ Database check failed: {str(e)}", exc_info=True)
        return {
            "status": "error",
            "database": "failed",
            "detail": str(e),
        }

@app.post("/debug-register")
def debug_register(body: dict):
    """
    Development-only endpoint to create test users.
    Should be disabled in production via environment variable.
    """
    try:
        if not os.getenv("DEBUG_MODE", "false").lower() == "true":
            return {"error": "Debug mode disabled"}

        from database import SessionLocal, User
        from passlib.context import CryptContext

        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

        with SessionLocal() as db:
            existing = db.get(User, body.get("email"))
            if existing:
                logger.warning(f"Debug register: user {body.get('email')} already exists")
                return {"result": "already_exists", "email": body.get("email")}

            user = User(
                email=body["email"],
                name=body["name"],
                hashed_pw=pwd_context.hash(body["password"])
            )

            db.add(user)
            db.commit()

            logger.info(f"✅ Debug register: created user {body.get('email')}")
            return {"result": "created", "email": body.get("email")}

    except Exception as e:
        logger.error(f"❌ Debug register error: {str(e)}", exc_info=True)
        return {
            "error": str(e),
            "type": type(e).__name__,
        }

# ═════════════════════════════════════════════════════════════════════════════
# DATABASE MIGRATION ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@app.post("/migrate/add-trial-columns")
def migrate_add_trial_columns(api_key: str = None):
    """
    One-time migration endpoint to add trial/payment columns to users table.
    
    Security: Accepts requests if:
    1. api_key matches MIGRATION_API_KEY env var, OR
    2. MIGRATION_API_KEY is not set in environment (development/setup mode)
    
    Usage:
        POST /migrate/add-trial-columns
        OR: POST /migrate/add-trial-columns?api_key=YOUR_SECRET_KEY
    """
    
    # Security check - allow if key matches OR if no key is configured (first-time setup)
    required_key = os.getenv("MIGRATION_API_KEY")
    if required_key and api_key != required_key:
        logger.warning(f"❌ Migration endpoint called with invalid API key")
        return JSONResponse(
            status_code=403,
            content={"error": "Unauthorized", "detail": "Invalid API key"}
        )
    
    try:
        from database import engine
        from sqlalchemy import text
        
        logger.info("🚀 Starting database migration: adding trial columns...")
        
        # SQL to add missing columns
        migration_sql = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_start TIMESTAMP DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_end TIMESTAMP DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'free'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_payment_id VARCHAR(255) DEFAULT NULL",
        ]
        
        results = []
        with engine.begin() as conn:
            for sql in migration_sql:
                try:
                    conn.execute(text(sql))
                    col_name = sql.split("ADD COLUMN")[1].strip().split()[0]
                    logger.info(f"✅ Added column: {col_name}")
                    results.append({"column": col_name, "status": "added"})
                except Exception as col_error:
                    # Column might already exist, which is fine
                    col_name = sql.split("ADD COLUMN")[1].strip().split()[0]
                    logger.info(f"ℹ️  Column {col_name} already exists or error: {str(col_error)}")
                    results.append({"column": col_name, "status": "skipped", "reason": str(col_error)})
        
        # Verify migration by checking table structure
        from sqlalchemy import inspect
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns("users")]
        
        logger.info(f"✅ Migration completed. Users table now has {len(columns)} columns")
        
        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "message": "Migration completed successfully",
                "columns_processed": results,
                "total_columns": len(columns),
            }
        )
    
    except Exception as e:
        logger.error(f"❌ Migration error: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "Migration failed",
                "detail": str(e),
                "type": type(e).__name__,
            }
        )