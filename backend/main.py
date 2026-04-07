import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import profile, jobs, auth, bot, billing
from dotenv import load_dotenv
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from database import init_db
    init_db()
    yield


app = FastAPI(title="JobRocket API", version="1.0.0", lifespan=lifespan)

# Base origins always allowed
_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://jobrocket.ai",
    "https://www.jobrocket.ai",
    "https://jobrocket.aiviora.online",
    "https://www.jobrocket.aiviora.online",
    "https://bot-automation-job.vercel.app",
]

# Allow extra origins from env var (comma-separated), e.g. Vercel preview URLs
_extra = os.getenv("EXTRA_CORS_ORIGINS", "")
if _extra:
    _ORIGINS += [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

app.include_router(auth.router,    prefix="/api/auth",    tags=["auth"])
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])
app.include_router(jobs.router,    prefix="/api/jobs",    tags=["jobs"])
app.include_router(bot.router,     prefix="/api/bot",     tags=["bot"])
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/db-check")
def db_check():
    try:
        from database import engine, Base
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        # Check tables
        inspector = __import__("sqlalchemy").inspect(engine)
        tables = inspector.get_table_names()
        return {"db": "ok", "tables": tables}
    except Exception as e:
        return {"db": "error", "detail": str(e)}


@app.post("/debug-register")
def debug_register(body: dict):
    try:
        from database import SessionLocal, User
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        with SessionLocal() as db:
            existing = db.get(User, body.get("email"))
            if existing:
                return {"result": "already exists"}
            user = User(email=body["email"], name=body["name"], hashed_pw=pwd_context.hash(body["password"]))
            db.add(user)
            db.commit()
            return {"result": "created"}
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}
