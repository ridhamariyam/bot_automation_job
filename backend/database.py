import os
from pathlib import Path
from sqlalchemy import create_engine, Column, String, DateTime, Text, Integer, Boolean
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
    elif DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 10},
    )
else:
    # Local dev: SQLite
    DB_PATH = Path(__file__).parent / "jobrocket.db"
    engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


# ── Plan Features ──────────────────────────────────────────────────────────
# Free: LinkedIn only, 5 apps/day, permanent free tier
# Pro: LinkedIn + Indeed + Glassdoor, 50 apps/day, ₹499/month, limited automation
# Premium: All platforms, unlimited apps/day, ₹2999/month, full automation + priority

PLAN_FEATURES = {
    "free": {
        "name": "Free",
        "platforms": ["linkedin"],
        "max_apps_per_day": 5,
        "price_paise": 0,
        "price_display": "Free",
        "price_monthly": 0,
        "type": "free",
        "description": "Limited usage — get started for free",
    },
    "pro": {
        "name": "Pro",
        "platforms": ["linkedin", "indeed", "glassdoor"],
        "max_apps_per_day": 50,
        "price_paise": 49900,  # ₹499/month
        "price_display": "₹499",
        "price_monthly": 499,
        "type": "monthly",
        "description": "Core features with limited automation",
    },
    "premium": {
        "name": "Premium",
        "platforms": ["linkedin", "indeed", "glassdoor", "monster", "bayt", "naukri", "timesjobs", "direct"],
        "max_apps_per_day": 1000,  # Effectively unlimited
        "price_paise": 299900,  # ₹2999/month
        "price_display": "₹2999",
        "price_monthly": 2999,
        "type": "monthly",
        "description": "Full automation with priority support",
    },
}


class User(Base):
    __tablename__ = "users"
    email               = Column(String, primary_key=True, index=True)
    name                = Column(String, nullable=False)
    hashed_pw           = Column(String, nullable=False)
    plan                = Column(String, default="premium")  # Default to premium for now
    
    # Trial: 7-day premium trial for all new users
    trial_start         = Column(DateTime, nullable=True)
    trial_end           = Column(DateTime, nullable=True)
    trial_used          = Column(Integer, default=0)  # 0 = not used, 1 = trial given
    
    # Billing & Payment
    payment_status      = Column(String, default="trial")  # trial | active | expired | free
    last_payment_id     = Column(String, nullable=True)
    
    # Usage tracking
    usage_start         = Column(DateTime, nullable=True)  # When user first started using the app
    feedback_requested  = Column(Integer, default=0)  # 0 = not yet, 1 = requested/submitted
    
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
    
    # Direct Applications
    direct_email        = Column(String, nullable=True)
    direct_password     = Column(String, nullable=True)
    direct_verified     = Column(Integer, default=0)
    
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


class Payment(Base):
    __tablename__ = "payments"
    id              = Column(String, primary_key=True)  # Paddle transaction ID
    user_email      = Column(String, nullable=False, index=True)
    plan_id         = Column(String, nullable=False)  # free | pro | premium
    amount_paise    = Column(Integer, nullable=False)  # Amount in paise (0 for free)
    currency        = Column(String, default="INR")
    status          = Column(String, default="pending")  # pending | completed | failed | refunded
    paddle_transaction_id = Column(String, nullable=True, unique=True)
    paddle_order_id = Column(String, nullable=True, unique=True)
    created_at      = Column(DateTime, nullable=False)
    completed_at    = Column(DateTime, nullable=True)


class UserFeedback(Base):
    __tablename__ = "user_feedback"
    id              = Column(String, primary_key=True)  # Unique ID
    user_email      = Column(String, nullable=False, index=True)
    rating          = Column(Integer, nullable=False)  # 1-5 rating
    suggestion      = Column(Text, nullable=True)  # User's suggestions/feedback
    created_at      = Column(DateTime, nullable=False)


def init_db():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        print(f"[db] create_all failed (will retry on next request): {exc}")
