from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import profile, jobs, auth, bot, billing
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="JobRocket API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://jobrocket.ai", "https://jobrocket.aiviora.online"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
        from database import engine
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        return {"db": "ok"}
    except Exception as e:
        return {"db": "error", "detail": str(e)}
