"""JWT auth — register, login, forgot/reset password."""
import os
import smtplib
import secrets
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from jose import jwt
from passlib.context import CryptContext

from database import SessionLocal, User, ResetToken
from main import limiter   # shared slowapi limiter instance

SECRET_KEY = os.getenv("JWT_SECRET", "change-me-in-production-set-JWT_SECRET-env-var")
ALGORITHM  = "HS256"
TOKEN_EXPIRE_DAYS = 30

router       = APIRouter()
pwd_context  = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Schemas ────────────────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    email: str
    password: str
    name: str

class LoginIn(BaseModel):
    email: str
    password: str

class ForgotIn(BaseModel):
    email: str

class ResetIn(BaseModel):
    token: str
    password: str


# ── Helpers ────────────────────────────────────────────────────────────────────
def _make_token(email: str) -> str:
    payload = {
        "sub": email,
        "exp": datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _user_dict(user: User) -> dict:
    return {
        "email": user.email,
        "name": user.name,
        "plan": "premium",   # all users have full access
        "payment_status": "active",
        "trial": {"active": False, "days_remaining": 0, "end": None},
    }


def _send_reset_email(to_email: str, reset_link: str):
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    if not smtp_user or not smtp_pass:
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your JobRocket password"
    msg["From"]    = f"JobRocket <{smtp_user}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(f"Reset link (expires 1 hour):\n{reset_link}", "plain"))
    msg.attach(MIMEText(
        f'<div style="font-family:sans-serif;padding:32px">'
        f'<h2>Reset your JobRocket password</h2>'
        f'<a href="{reset_link}" style="background:#4f46e5;color:#fff;padding:12px 24px;'
        f'border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px">'
        f'Reset password</a>'
        f'<p style="color:#6b7280;font-size:12px;margin-top:24px">'
        f'Expires in 1 hour. If you did not request this, ignore this email.</p></div>',
        "html",
    ))
    with smtplib.SMTP(smtp_host, smtp_port) as s:
        s.starttls()
        s.login(smtp_user, smtp_pass)
        s.sendmail(smtp_user, to_email, msg.as_string())


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/register")
@limiter.limit("5/minute")
def register(request: Request, body: RegisterIn):
    """Rate-limited: 5 registrations per IP per minute."""
    with SessionLocal() as db:
        existing = db.query(User).filter(User.email == body.email).first()
        if existing:
            raise HTTPException(400, "Email already registered")

        now  = datetime.utcnow()
        user = User(
            email       = body.email,
            name        = body.name,
            hashed_pw   = pwd_context.hash(body.password),
            plan        = "premium",
            trial_start = now,
            trial_end   = now + timedelta(days=999),
            trial_used  = 1,
            payment_status = "free",
            usage_start    = now,
            created_at     = now,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return {
        "token": _make_token(user.email),
        "user": {
            **_user_dict(user),
            "trial": {
                "active": True,
                "days_remaining": 999,
                "end": (now + timedelta(days=999)).isoformat(),
                "message": "Full Premium Access — all platforms unlocked!",
            },
        },
    }


@router.post("/login")
@limiter.limit("20/minute")
def login(request: Request, body: LoginIn):
    """Rate-limited: 20 attempts per IP per minute."""
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == body.email).first()
        if not user or not pwd_context.verify(body.password, user.hashed_pw):
            raise HTTPException(401, "Invalid credentials")

        if not user.usage_start:
            user.usage_start = datetime.utcnow()
            db.commit()

    return {"token": _make_token(user.email), "user": _user_dict(user)}


@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, body: ForgotIn, background_tasks: BackgroundTasks):
    token = secrets.token_urlsafe(32)
    with SessionLocal() as db:
        db.add(ResetToken(
            token   = token,
            email   = body.email,
            expires = datetime.utcnow() + timedelta(hours=1),
        ))
        db.commit()
    base = os.getenv("RESET_BASE_URL", os.getenv("FRONTEND_URL", "http://localhost:3000"))
    background_tasks.add_task(
        _send_reset_email, body.email, f"{base}/reset-password?token={token}"
    )
    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: ResetIn):
    with SessionLocal() as db:
        record = db.get(ResetToken, body.token)
        if not record or datetime.utcnow() > record.expires:
            raise HTTPException(400, "Invalid or expired reset link")
        user = db.query(User).filter(User.email == record.email).first()
        if not user:
            raise HTTPException(400, "No account found. Please register first.")
        user.hashed_pw = pwd_context.hash(body.password)
        db.query(ResetToken).filter(ResetToken.email == record.email).delete()
        db.commit()
    return {"message": "Password updated successfully"}
