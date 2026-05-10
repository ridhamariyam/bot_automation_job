"""
JobRocket — SQLAlchemy database models (v2 production schema).

Migration strategy (zero-downtime with existing Render PostgreSQL):
- User.email stays as primary key (existing data intact)
- New tables added alongside existing ones (init_db creates them)
- Flat credential columns on User kept for backward compat (still work)
- PlatformCredential table added for new encrypted credential storage
- RecruiterContact + PlatformSession tables added fresh
"""
import os
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy import (
    create_engine, Column, String, DateTime, Text,
    Integer, Boolean, UniqueConstraint, Index, ForeignKey,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker, relationship

# ── Engine ─────────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
    elif DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=20,
        max_overflow=40,
        connect_args={"connect_timeout": 10},
    )
else:
    DB_PATH = Path(__file__).parent / "jobrocket.db"
    engine = create_engine(
        f"sqlite:///{DB_PATH}",
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


# ── Plan definitions ───────────────────────────────────────────────────────────
PLAN_FEATURES = {
    "free": {
        "name": "Free",
        "platforms": ["linkedin"],
        "max_apps_per_day": 5,
        "price_monthly": 0,
        "price_display": "Free",
        "price_paise": 0,
        "type": "free",
    },
    "pro": {
        "name": "Pro",
        "platforms": ["linkedin", "indeed", "glassdoor"],
        "max_apps_per_day": 50,
        "price_monthly": 499,
        "price_display": "₹499",
        "price_paise": 49900,
        "type": "subscription",
    },
    "premium": {
        "name": "Premium",
        "platforms": [
            "linkedin", "indeed", "glassdoor",
            "monster", "google_jobs", "bayt", "naukri", "timesjobs",
        ],
        "max_apps_per_day": 1000,
        "price_monthly": 2999,
        "price_display": "₹2999",
        "price_paise": 299900,
        "type": "subscription",
    },
}

ALL_PLATFORMS = sorted({p for cfg in PLAN_FEATURES.values() for p in cfg["platforms"]})


# ── Models ─────────────────────────────────────────────────────────────────────

class User(Base):
    """
    Core user table.
    email = primary key (kept from v1 for zero-downtime migration).
    Credential columns kept for backward compat — new code uses PlatformCredential.
    """
    __tablename__ = "users"

    email           = Column(String, primary_key=True, index=True)
    name            = Column(String, nullable=False)
    hashed_pw       = Column(String, nullable=False)

    # Plan & billing
    plan            = Column(String, default="premium")
    payment_status  = Column(String, default="trial")
    trial_start     = Column(DateTime, nullable=True)
    trial_end       = Column(DateTime, nullable=True)
    trial_used      = Column(Integer, default=0)
    last_payment_id = Column(String, nullable=True)

    # Usage
    usage_start         = Column(DateTime, nullable=True)
    feedback_requested  = Column(Integer, default=0)
    created_at          = Column(DateTime, default=datetime.utcnow)

    # Profile
    target_titles    = Column(Text, nullable=True)
    target_locations = Column(Text, nullable=True)
    skills           = Column(Text, nullable=True)
    phone            = Column(String, nullable=True)
    cv_path          = Column(String, nullable=True)
    cv_public_url    = Column(String, nullable=True)

    # Screening defaults
    years_exp        = Column(Integer, nullable=True)
    salary           = Column(Integer, nullable=True)
    notice_period    = Column(Integer, nullable=True)

    # Job preferences (set during onboarding)
    active_platforms = Column(Text, nullable=True)   # comma-separated
    job_types        = Column(Text, nullable=True)   # comma-separated
    work_modes       = Column(Text, nullable=True)   # comma-separated
    experience_level = Column(String, nullable=True)

    # ── Legacy flat credential columns (kept for backward compat) ──────────────
    # New code reads/writes PlatformCredential rows instead.
    # These remain so old sessions don't break on redeploy.
    linkedin_email      = Column(String, nullable=True)
    linkedin_password   = Column(String, nullable=True)
    linkedin_verified   = Column(Integer, default=0)
    linkedin_session_json = Column(Text, nullable=True)
    linkedin_session_updated_at = Column(DateTime, nullable=True)
    indeed_email        = Column(String, nullable=True)
    indeed_password     = Column(String, nullable=True)
    indeed_verified     = Column(Integer, default=0)
    indeed_session_json = Column(Text, nullable=True)
    indeed_session_updated_at = Column(DateTime, nullable=True)
    glassdoor_email     = Column(String, nullable=True)
    glassdoor_password  = Column(String, nullable=True)
    glassdoor_verified  = Column(Integer, default=0)
    monster_email       = Column(String, nullable=True)
    monster_password    = Column(String, nullable=True)
    monster_verified    = Column(Integer, default=0)
    naukri_email        = Column(String, nullable=True)
    naukri_password     = Column(String, nullable=True)
    naukri_verified     = Column(Integer, default=0)
    bayt_email          = Column(String, nullable=True)
    bayt_password       = Column(String, nullable=True)
    bayt_verified       = Column(Integer, default=0)
    timesjobs_email     = Column(String, nullable=True)
    timesjobs_password  = Column(String, nullable=True)
    timesjobs_verified  = Column(Integer, default=0)
    direct_email        = Column(String, nullable=True)
    direct_password     = Column(String, nullable=True)
    direct_verified     = Column(Integer, default=0)

    # Relationships
    platform_credentials = relationship(
        "PlatformCredential", back_populates="user",
        cascade="all, delete-orphan", foreign_keys="PlatformCredential.user_email",
    )
    recruiter_contacts = relationship(
        "RecruiterContact", back_populates="user",
        cascade="all, delete-orphan", foreign_keys="RecruiterContact.user_email",
    )
    platform_sessions = relationship(
        "PlatformSession", back_populates="user",
        cascade="all, delete-orphan", foreign_keys="PlatformSession.user_email",
    )


class PlatformCredential(Base):
    """
    Encrypted platform credentials — one row per (user, platform).
    Replaces the flat columns on User for new code paths.
    Passwords are Fernet-encrypted via services/crypto.py.
    """
    __tablename__ = "platform_credentials"
    __table_args__ = (
        UniqueConstraint("user_email", "platform", name="uq_cred_user_platform"),
    )

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    user_email         = Column(String, ForeignKey("users.email", ondelete="CASCADE"), nullable=False, index=True)
    platform           = Column(String, nullable=False)
    email              = Column(String, nullable=False)
    encrypted_password = Column(Text, nullable=False)   # Fernet ciphertext
    verified           = Column(Boolean, default=False)
    last_used          = Column(DateTime, nullable=True)
    created_at         = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="platform_credentials", foreign_keys=[user_email])


class JobApplication(Base):
    __tablename__ = "job_applications"
    __table_args__ = (
        Index("ix_user_platform_date", "user_email", "platform", "applied_at"),
    )

    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_email      = Column(String, ForeignKey("users.email", ondelete="CASCADE"), nullable=False, index=True)
    title           = Column(String, nullable=False)
    company         = Column(String, nullable=False)
    location        = Column(String, nullable=True)
    platform        = Column(String, nullable=False)
    job_external_id = Column(String, nullable=True)
    job_url         = Column(String, nullable=True)
    description     = Column(Text, nullable=True)
    status          = Column(String, default="Applied")
    applied_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    proof           = Column(Text, nullable=True)
    tailored_resume = Column(Text, nullable=True)
    cover_letter    = Column(Text, nullable=True)

    # Scoring fields (added v3)
    score           = Column(Integer, nullable=True)       # 0-100
    score_breakdown = Column(Text, nullable=True)          # JSON: ScoreResult dict
    outcome         = Column(String, nullable=True)        # reply|interview|offer|rejected
    outcome_at      = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_email])


class RecruiterContact(Base):
    """
    Recruiters found in hiring posts / job descriptions.
    Shown in frontend "Call Recruiter" list.
    """
    __tablename__ = "recruiter_contacts"

    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_email      = Column(String, ForeignKey("users.email", ondelete="CASCADE"), nullable=False, index=True)
    recruiter_name  = Column(String, nullable=True)
    phone           = Column(String, nullable=True)
    whatsapp        = Column(String, nullable=True)
    email           = Column(String, nullable=True)
    post_url        = Column(String, nullable=True)
    post_text       = Column(Text, nullable=True)
    inferred_title  = Column(String, nullable=True)
    platform        = Column(String, nullable=False, default="linkedin_feed")
    # pending_call | called | whatsapp_sent | replied | ignored
    status          = Column(String, default="pending_call")
    whatsapp_sent_at = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="recruiter_contacts", foreign_keys=[user_email])


class PlatformSession(Base):
    """
    Browser session cookies stored in DB (survives restarts & redeploys).
    Replaces the file-based session storage in bot/sessions/.
    """
    __tablename__ = "platform_sessions"
    __table_args__ = (
        UniqueConstraint("user_email", "platform", name="uq_session_user_platform"),
    )

    id           = Column(Integer, primary_key=True, autoincrement=True)
    user_email   = Column(String, ForeignKey("users.email", ondelete="CASCADE"), nullable=False, index=True)
    platform     = Column(String, nullable=False)
    worker_id    = Column(String, nullable=True)
    cookies_json = Column(Text, nullable=True)   # JSON-encoded cookie list
    last_used    = Column(DateTime, nullable=True)
    is_valid     = Column(Boolean, default=True)

    user = relationship("User", back_populates="platform_sessions", foreign_keys=[user_email])


class BotLog(Base):
    __tablename__ = "bot_logs"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_email = Column(String, ForeignKey("users.email", ondelete="CASCADE"), nullable=False, index=True)
    task_id    = Column(String, nullable=True)
    platform   = Column(String, nullable=True)
    message    = Column(Text, nullable=False)
    level      = Column(String, default="info")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_email])


class ResetToken(Base):
    __tablename__ = "reset_tokens"
    token   = Column(String, primary_key=True)
    email   = Column(String, nullable=False)
    expires = Column(DateTime, nullable=False)


class Payment(Base):
    __tablename__ = "payments"
    id                    = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_email            = Column(String, nullable=False, index=True)
    plan_id               = Column(String, nullable=False)
    amount_paise          = Column(Integer, nullable=False)
    currency              = Column(String, default="INR")
    status                = Column(String, default="pending")
    paddle_transaction_id = Column(String, nullable=True, unique=True)
    paddle_order_id       = Column(String, nullable=True, unique=True)
    created_at            = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at          = Column(DateTime, nullable=True)


class UserFeedback(Base):
    __tablename__ = "user_feedback"
    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_email = Column(String, nullable=False, index=True)
    rating     = Column(Integer, nullable=False)
    suggestion = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


# ── Resume Builder models ──────────────────────────────────────────────────────

class Resume(Base):
    """Master resume — one user can have multiple named versions."""
    __tablename__ = "resumes"

    id                   = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_email           = Column(String, ForeignKey("users.email", ondelete="CASCADE"), nullable=False, index=True)
    title                = Column(String, default="My Resume")
    full_name            = Column(String, nullable=True)
    email                = Column(String, nullable=True)
    phone                = Column(String, nullable=True)
    location             = Column(String, nullable=True)
    linkedin_url         = Column(String, nullable=True)
    github_url           = Column(String, nullable=True)
    website_url          = Column(String, nullable=True)
    professional_summary = Column(Text, nullable=True)
    is_default           = Column(Boolean, default=False)
    version              = Column(Integer, default=1)
    created_at           = Column(DateTime, default=datetime.utcnow)
    updated_at           = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    experiences = relationship("ResumeExperience", back_populates="resume",
                               cascade="all, delete-orphan", order_by="ResumeExperience.sort_order")
    projects    = relationship("ResumeProject", back_populates="resume",
                               cascade="all, delete-orphan", order_by="ResumeProject.sort_order")
    skills      = relationship("ResumeSkill", back_populates="resume",
                               cascade="all, delete-orphan")
    educations  = relationship("ResumeEducation", back_populates="resume",
                               cascade="all, delete-orphan", order_by="ResumeEducation.sort_order")
    user        = relationship("User", foreign_keys=[user_email])


class ResumeExperience(Base):
    __tablename__ = "resume_experience"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    resume_id   = Column(String, ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    company     = Column(String, nullable=False)
    title       = Column(String, nullable=False)
    location    = Column(String, nullable=True)
    start_date  = Column(String, nullable=True)
    end_date    = Column(String, nullable=True)
    current     = Column(Boolean, default=False)
    description = Column(Text, nullable=True)
    bullets     = Column(Text, nullable=True)   # JSON-encoded list[str]
    sort_order  = Column(Integer, default=0)

    resume = relationship("Resume", back_populates="experiences")


class ResumeProject(Base):
    __tablename__ = "resume_projects"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    resume_id   = Column(String, ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    name        = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    tech_stack  = Column(String, nullable=True)
    url         = Column(String, nullable=True)
    bullets     = Column(Text, nullable=True)   # JSON-encoded list[str]
    sort_order  = Column(Integer, default=0)

    resume = relationship("Resume", back_populates="projects")


class ResumeSkill(Base):
    __tablename__ = "resume_skills"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    resume_id   = Column(String, ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    skill       = Column(String, nullable=False)
    category    = Column(String, nullable=True)    # "Languages" | "Frameworks" | "Tools" | etc.
    proficiency = Column(String, nullable=True)    # "Expert" | "Intermediate" | "Beginner"

    resume = relationship("Resume", back_populates="skills")


class ResumeEducation(Base):
    __tablename__ = "resume_education"

    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    resume_id    = Column(String, ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    institution  = Column(String, nullable=False)
    degree       = Column(String, nullable=True)
    field        = Column(String, nullable=True)
    start_year   = Column(String, nullable=True)
    end_year     = Column(String, nullable=True)
    gpa          = Column(String, nullable=True)
    achievements = Column(Text, nullable=True)
    sort_order   = Column(Integer, default=0)

    resume = relationship("Resume", back_populates="educations")


class ScoringConfig(Base):
    """Per-user scoring mode, threshold, and per-platform daily limits."""
    __tablename__ = "scoring_config"

    user_email           = Column(String, ForeignKey("users.email", ondelete="CASCADE"), primary_key=True)
    mode                 = Column(String, default="balanced")   # aggressive|balanced|high_quality
    threshold_override   = Column(Integer, nullable=True)       # manual override (bypasses mode)
    adaptive_enabled     = Column(Boolean, default=True)
    threshold_adjustment = Column(Integer, default=0)           # computed by adaptive engine
    # Per-platform daily limits (NULL → use DEFAULT_PLATFORM_LIMITS)
    linkedin_daily       = Column(Integer, default=20)
    indeed_daily         = Column(Integer, default=40)
    glassdoor_daily      = Column(Integer, default=30)
    monster_daily        = Column(Integer, default=25)
    google_jobs_daily    = Column(Integer, default=15)
    naukri_daily         = Column(Integer, default=50)
    bayt_daily           = Column(Integer, default=20)
    timesjobs_daily      = Column(Integer, default=30)
    updated_at           = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_email])


class JobScore(Base):
    """
    Cache table — stores ScoreResult for (user_email, job_url) pairs.
    Avoids re-scoring the same job across sessions.
    TTL is enforced by the scorer (24h).
    """
    __tablename__ = "job_scores"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    cache_key   = Column(String, unique=True, nullable=False, index=True)  # sha256(user+url)[:32]
    user_email  = Column(String, ForeignKey("users.email", ondelete="CASCADE"), nullable=False, index=True)
    job_url     = Column(String, nullable=True)
    total_score = Column(Integer, nullable=False)
    result_json = Column(Text, nullable=False)    # full ScoreResult JSON
    scored_at   = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_email])


def init_db():
    """Create all tables. Safe to call on every startup — won't drop existing data."""
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        print(f"[db] create_all failed: {exc}")
