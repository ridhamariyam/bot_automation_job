import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import profile, jobs, auth, bot, billing

load_dotenv()

app = FastAPI(
    title="JobRocket API",
    version="1.0.0"
)

# -----------------------------
# Allowed Origins
# -----------------------------
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://JobRocket",
    "https://www.JobRocket",
    "https://JobRocketviora.online",
    "https://www.JobRocketviora.online",
    "https://bot-automation-job.vercel.app",
    "https://jobrocket-backend-9uxh.onrender.com"
]

# Allow extra origins from environment variable
extra_origins = os.getenv("EXTRA_CORS_ORIGINS", "")
if extra_origins:
    ALLOWED_ORIGINS += [
        origin.strip()
        for origin in extra_origins.split(",")
        if origin.strip()
    ]

# -----------------------------
# CORS Middleware
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# -----------------------------
# Routers
# -----------------------------
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(bot.router, prefix="/api/bot", tags=["bot"])
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])

# -----------------------------
# Health Check
# -----------------------------
@app.get("/health")
def health():
    return {"status": "ok"}

# -----------------------------
# Database Check
# -----------------------------
@app.get("/db-check")
def db_check():
    try:
        from database import engine
        from sqlalchemy import text, inspect

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        inspector = inspect(engine)
        tables = inspector.get_table_names()

        return {
            "db": "ok",
            "tables": tables
        }

    except Exception as e:
        return {
            "db": "error",
            "detail": str(e)
        }

# -----------------------------
# Debug Register (Dev Only)
# -----------------------------
@app.post("/debug-register")
def debug_register(body: dict):
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
                return {"result": "already exists"}

            user = User(
                email=body["email"],
                name=body["name"],
                hashed_pw=pwd_context.hash(body["password"])
            )

            db.add(user)
            db.commit()

            return {"result": "created"}

    except Exception as e:
        import traceback

        return {
            "error": str(e),
            "trace": traceback.format_exc()
        }