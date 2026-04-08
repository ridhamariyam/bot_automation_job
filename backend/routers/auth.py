"""JWT auth with SQLite persistence — data survives restarts."""
import os
import smtplib
import secrets
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from jose import jwt
from passlib.context import CryptContext
from database import SessionLocal, User, ResetToken

SECRET_KEY = "change-me-in-production"
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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


def _make_token(email: str) -> str:
    payload = {"sub": email, "exp": datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _user_dict(user: User) -> dict:
    # Calculate trial status (safe access for legacy users without trial fields)
    now = datetime.utcnow()
    trial_active = False
    days_remaining = 0
    trial_end = getattr(user, "trial_end", None)
    
    if trial_end and now < trial_end:
        trial_active = True
        days_remaining = max(0, (trial_end - now).days)
    
    return {
        "id": user.email,
        "email": user.email,
        "name": user.name,
        "plan": getattr(user, "plan", "free") or "free",
        "payment_status": getattr(user, "payment_status", "free"),
        "trial": {
            "active": trial_active,
            "days_remaining": days_remaining,
            "end": trial_end.isoformat() if trial_end else None
        }
    }


def _send_reset_email(to_email: str, reset_link: str):
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your JobRocket password"
    msg["From"] = f"JobRocket <{smtp_user}>"
    msg["To"] = to_email

    text = f"Reset your password:\n\n{reset_link}\n\nExpires in 1 hour."
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0a0a0f;color:#fff;border-radius:12px;">
      <h2 style="color:#818cf8;margin-bottom:8px;">JobRocket</h2>
      <h3 style="margin-bottom:8px;">Reset your password</h3>
      <p style="color:#9ca3af;margin-bottom:24px;">Click the button below. Link expires in 1 hour.</p>
      <a href="{reset_link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;">
        Reset password
      </a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">If you didn't request this, ignore this email.</p>
    </div>
    """
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(smtp_host, smtp_port) as s:
        s.starttls()
        s.login(smtp_user, smtp_pass)
        s.sendmail(smtp_user, to_email, msg.as_string())


@router.post("/register")
def register(body: RegisterIn):
    with SessionLocal() as db:
        if db.get(User, body.email):
            raise HTTPException(400, "Email already registered")
        
        # Create new user with 7-day premium trial
        trial_start = datetime.utcnow()
        trial_end = trial_start + timedelta(days=7)
        
        user = User(
            email=body.email,
            name=body.name,
            hashed_pw=pwd_context.hash(body.password),
            plan="premium",  # Default to premium during trial
            trial_start=trial_start,
            trial_end=trial_end,
            trial_used=1,
            payment_status="trial"
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
                    "start": trial_start.isoformat(),
                    "end": trial_end.isoformat(),
                    "days_remaining": 7,
                    "message": "You have 7 days of premium access. All platforms unlocked!"
                }
            }
        }


@router.post("/login")
def login(body: LoginIn):
    with SessionLocal() as db:
        user = db.get(User, body.email)
        if not user or not pwd_context.verify(body.password, user.hashed_pw):
            raise HTTPException(401, "Invalid credentials")
        return {"token": _make_token(user.email), "user": _user_dict(user)}


@router.post("/forgot-password")
def forgot_password(body: ForgotIn, background_tasks: BackgroundTasks):
    token = secrets.token_urlsafe(32)
    with SessionLocal() as db:
        db.add(ResetToken(
            token=token,
            email=body.email,
            expires=datetime.utcnow() + timedelta(hours=1),
        ))
        db.commit()
    base_url = os.getenv("RESET_BASE_URL", "http://localhost:3000")
    background_tasks.add_task(_send_reset_email, body.email, f"{base_url}/reset-password?token={token}")
    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: ResetIn):
    with SessionLocal() as db:
        record = db.get(ResetToken, body.token)
        if not record or datetime.utcnow() > record.expires:
            raise HTTPException(400, "Invalid or expired reset link")
        user = db.get(User, record.email)
        if not user:
            raise HTTPException(400, "No account found. Please register first.")
        user.hashed_pw = pwd_context.hash(body.password)
        db.delete(record)
        db.commit()
    return {"message": "Password updated successfully"}
