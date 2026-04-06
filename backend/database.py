from pathlib import Path
from sqlalchemy import create_engine, Column, String, DateTime, Text, Integer, Boolean
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DB_PATH = Path(__file__).parent / "jobrocket.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


# ── Plan Features ──────────────────────────────────────────────────────────
# Free: LinkedIn only, 5 apps/day
# Pro: LinkedIn + Indeed + Glassdoor, 50 apps/day  
# Premium: All platforms, 200 apps/day

PLAN_FEATURES = {
    "free": {
        "name": "Free",
        "platforms": ["linkedin"],
        "max_apps_per_day": 5,
        "price": 0,
    },
    "pro": {
        "name": "Pro",
        "platforms": ["linkedin", "indeed", "glassdoor"],
        "max_apps_per_day": 50,
        "price": 499,  # in paise
    },
    "premium": {
        "name": "Premium",
        "platforms": ["linkedin", "indeed", "glassdoor", "monster", "bayt", "naukri", "timesjobs", "direct"],
        "max_apps_per_day": 200,
        "price": 999,  # in paise
    },
}


class User(Base):
    __tablename__ = "users"
    email               = Column(String, primary_key=True, index=True)
    name                = Column(String, nullable=False)
    hashed_pw           = Column(String, nullable=False)
    plan                = Column(String, default="free")
    
    # LinkedIn
    linkedin_email      = Column(String, nullable=True)
    linkedin_password   = Column(String, nullable=True)
    linkedin_verified   = Column(Integer, default=0)
    
    # Indeed
    indeed_email        = Column(String, nullable=True)
    indeed_password     = Column(String, nullable=True)
    indeed_verified     = Column(Integer, default=0)
    
    # Glassdoor
    glassdoor_email     = Column(String, nullable=True)
    glassdoor_password  = Column(String, nullable=True)
    glassdoor_verified  = Column(Integer, default=0)
    
    # Monster
    monster_email       = Column(String, nullable=True)
    monster_password    = Column(String, nullable=True)
    monster_verified    = Column(Integer, default=0)
    
    # Naukri
    naukri_email        = Column(String, nullable=True)
    naukri_password     = Column(String, nullable=True)
    naukri_verified     = Column(Integer, default=0)
    
    # Bayt
    bayt_email          = Column(String, nullable=True)
    bayt_password       = Column(String, nullable=True)
    bayt_verified       = Column(Integer, default=0)
    
    # TimesJobs
    timesjobs_email     = Column(String, nullable=True)
    timesjobs_password  = Column(String, nullable=True)
    timesjobs_verified  = Column(Integer, default=0)
    
    # Profile info
    target_titles       = Column(Text, nullable=True)
    target_locations    = Column(Text, nullable=True)
    skills              = Column(Text, nullable=True)
    phone               = Column(String, nullable=True)
    cv_path             = Column(String, nullable=True)


class ResetToken(Base):
    __tablename__ = "reset_tokens"
    token   = Column(String, primary_key=True)
    email   = Column(String, nullable=False)
    expires = Column(DateTime, nullable=False)


class JobApplication(Base):
    __tablename__ = "job_applications"
    id          = Column(String, primary_key=True)
    user_email  = Column(String, nullable=False, index=True)
    title       = Column(String, nullable=False)
    company     = Column(String, nullable=False)
    location    = Column(String, nullable=True)
    platform    = Column(String, nullable=False)
    job_url     = Column(String, nullable=True)
    status      = Column(String, default="Applied")
    applied_at  = Column(DateTime, nullable=False)
    proof       = Column(Text, nullable=True)


class BotLog(Base):
    __tablename__ = "bot_logs"
    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_email  = Column(String, nullable=False, index=True)
    message     = Column(Text, nullable=False)
    level       = Column(String, default="info")   # info | success | error | warn
    created_at  = Column(DateTime, nullable=False)


Base.metadata.create_all(bind=engine)
