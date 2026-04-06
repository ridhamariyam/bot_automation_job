"""Profile endpoints — create, fetch, update (persisted to SQLite)."""
import os
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from database import SessionLocal, User
from utils.cv_parser import parse_cv

router = APIRouter()

CV_DIR = Path(__file__).parent.parent / "uploads" / "cvs"
CV_DIR.mkdir(parents=True, exist_ok=True)


# ── Create / update profile from questionnaire ─────────────────────────────
@router.post("")
async def create_profile(
    name: str            = Form(...),
    email: str           = Form(...),
    phone: str           = Form(""),
    summary: str         = Form(""),
    skills: str          = Form(""),
    targetTitles: str    = Form(""),
    targetLocations: str = Form(""),
    cv: UploadFile       = File(None),
):
    cv_path = ""
    cv_data: dict = {}

    if cv:
        file_bytes = await cv.read()
        cv_data    = parse_cv(file_bytes, cv.content_type or "application/pdf")
        dest       = CV_DIR / f"{email.replace('@','_')}.pdf"
        dest.write_bytes(file_bytes)
        cv_path = str(dest)

    form_skills   = [s.strip() for s in skills.split(",") if s.strip()]
    detected      = cv_data.get("detected_skills", [])
    merged_skills = list(dict.fromkeys(form_skills + detected))

    resolved_phone = phone or cv_data.get("detected_phone", "")

    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found. Please register first.")
        user.name             = name
        user.phone            = resolved_phone
        user.skills           = ",".join(merged_skills)
        # Titles: comma-separated. Locations: newline OR comma separated
        user.target_titles    = targetTitles
        # Store locations newline-separated to preserve "City, Country" entries
        locs = [l.strip() for l in targetLocations.replace("\r", "").split("\n") if l.strip()]
        if not locs:  # fallback: was comma-separated
            locs = [l.strip() for l in targetLocations.split(",") if l.strip()]
        user.target_locations = "\n".join(locs)
        if cv_path:
            user.cv_path = cv_path
        db.commit()
        db.refresh(user)

    return JSONResponse(content=_fmt(user))


# ── Fetch profile ───────────────────────────────────────────────────────────
@router.get("/{email}")
def get_profile(email: str):
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "Profile not found")
        return _fmt(user)


# ── Update platform credentials ─────────────────────────────────────────────
class CredentialsIn(BaseModel):
    # LinkedIn
    linkedin_email: str    = ""
    linkedin_password: str = ""
    # Indeed
    indeed_email: str      = ""
    indeed_password: str   = ""
    # Glassdoor
    glassdoor_email: str   = ""
    glassdoor_password: str = ""
    # Monster
    monster_email: str     = ""
    monster_password: str  = ""
    # Naukri
    naukri_email: str      = ""
    naukri_password: str   = ""
    # Bayt
    bayt_email: str        = ""
    bayt_password: str     = ""
    # TimesJobs
    timesjobs_email: str   = ""
    timesjobs_password: str = ""


@router.patch("/{email}/credentials")
def update_credentials(email: str, body: CredentialsIn):
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found")
        
        # Update all platform credentials if provided
        for field in ["linkedin", "indeed", "glassdoor", "monster", "naukri", "bayt", "timesjobs"]:
            email_field = f"{field}_email"
            password_field = f"{field}_password"
            if hasattr(body, email_field):
                email_val = getattr(body, email_field, "")
                if email_val:
                    setattr(user, email_field, email_val)
            if hasattr(body, password_field):
                password_val = getattr(body, password_field, "")
                if password_val:
                    setattr(user, password_field, password_val)
        
        db.commit()
    return {"message": "Credentials saved"}


def _fmt(user: User) -> dict:
    return {
        "email":              user.email,
        "name":               user.name,
        "phone":              user.phone or "",
        "plan":               user.plan,
        "cv_path":            user.cv_path or "",
        "skills":             [s for s in (user.skills or "").split(",") if s],
        "target_titles":      [t.strip() for t in (user.target_titles or "").split(",") if t.strip()],
        "target_locations":   [l.strip() for l in (user.target_locations or "").replace("\r","").split("\n") if l.strip()],
        "linkedin_email":     user.linkedin_email or "",
        "linkedin_password":  user.linkedin_password or "",
        "indeed_email":       user.indeed_email or "",
        "indeed_password":    user.indeed_password or "",
        "linkedin_verified":  bool(getattr(user, "linkedin_verified", False)),
        "indeed_verified":    bool(getattr(user, "indeed_verified", False)),
    }
