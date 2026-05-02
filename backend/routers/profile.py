"""
Profile endpoints — create/update, fetch, credential management.

v2: Credentials now stored encrypted in PlatformCredential table.
    Legacy flat columns on User kept for backward compat reads.
"""
import logging
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from database import SessionLocal, User, PlatformCredential, PlatformSession
from services.crypto import encrypt_password
from utils.cv_parser import parse_cv

logger = logging.getLogger(__name__)
router = APIRouter()

CV_DIR = Path(__file__).parent.parent / "uploads" / "cvs"
CV_DIR.mkdir(parents=True, exist_ok=True)

PLATFORMS = [
    "linkedin", "indeed", "glassdoor", "monster",
    "naukri", "bayt", "timesjobs", "google_jobs",
]
BROWSER_SESSION_PLATFORMS = {"linkedin", "indeed"}


# ── Create / update profile ────────────────────────────────────────────────────
@router.post("")
async def create_profile(
    name:            str        = Form(...),
    email:           str        = Form(...),
    phone:           str        = Form(""),
    summary:         str        = Form(""),
    skills:          str        = Form(""),
    targetTitles:    str        = Form(""),
    targetLocations: str        = Form(""),
    yearsExp:        str        = Form(""),
    salary:          str        = Form(""),
    noticePeriod:    str        = Form(""),
    cv:              UploadFile = File(None),
):
    try:
        cv_path = ""
        cv_data: dict = {}

        if cv:
            try:
                file_bytes = await cv.read()
                cv_data = parse_cv(file_bytes, cv.content_type or "application/pdf")
                dest = CV_DIR / f"{email.replace('@', '_')}.pdf"
                dest.write_bytes(file_bytes)
                cv_path = str(dest)
            except Exception as e:
                logger.warning("CV parse failed for %s: %s", email, e)

        form_skills = [s.strip() for s in skills.split(",") if s.strip()]
        detected    = cv_data.get("detected_skills", [])
        merged      = list(dict.fromkeys(form_skills + detected))
        resolved_phone = phone or cv_data.get("detected_phone", "")

        locs = [l.strip() for l in targetLocations.replace("\r", "").split("\n") if l.strip()]
        if not locs:
            locs = [l.strip() for l in targetLocations.split(",") if l.strip()]

        with SessionLocal() as db:
            user = db.query(User).filter(User.email == email).first()
            if not user:
                raise HTTPException(404, "User not found. Please register first.")

            user.name            = name
            user.phone           = resolved_phone
            user.skills          = ",".join(merged)
            user.target_titles   = targetTitles
            user.target_locations = "\n".join(locs)
            if cv_path:
                user.cv_path = cv_path
            if yearsExp:
                user.years_exp = int(yearsExp)
            if salary:
                user.salary = int(salary)
            if noticePeriod:
                user.notice_period = int(noticePeriod)

            db.commit()
            db.refresh(user)
            # Build response while session is still open so no DetachedInstanceError
            profile_data = _fmt(user, db)

        return JSONResponse(status_code=200, content=profile_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Profile create error for %s: %s", email, e, exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})


# ── Fetch profile ──────────────────────────────────────────────────────────────
@router.get("/{email}")
def get_profile(email: str):
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(404, "Profile not found")
        return _fmt(user, db)


# ── Update credentials (encrypted) ────────────────────────────────────────────
class CredentialItem(BaseModel):
    platform: str
    email: str
    password: str


class CredentialsIn(BaseModel):
    # All supported platforms
    linkedin_email:      str = ""
    linkedin_password:   str = ""
    indeed_email:        str = ""
    indeed_password:     str = ""
    glassdoor_email:     str = ""
    glassdoor_password:  str = ""
    monster_email:       str = ""
    monster_password:    str = ""
    naukri_email:        str = ""
    naukri_password:     str = ""
    bayt_email:          str = ""
    bayt_password:       str = ""
    timesjobs_email:     str = ""
    timesjobs_password:  str = ""
    google_jobs_email:   str = ""
    google_jobs_password: str = ""


@router.patch("/{email}/credentials")
def update_credentials(email: str, body: CredentialsIn):
    """
    Save platform credentials.
    Stores in PlatformCredential (encrypted) AND in legacy flat columns (for bot compat).
    """
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(404, "User not found")

        for platform in PLATFORMS:
            plat_email = getattr(body, f"{platform}_email", "").strip()
            plat_pass  = getattr(body, f"{platform}_password", "").strip()

            if not plat_email or not plat_pass:
                continue

            # --- Write to PlatformCredential (encrypted) ---
            cred = db.query(PlatformCredential).filter_by(
                user_email=email, platform=platform
            ).first()
            if cred:
                email_changed = cred.email != plat_email
                cred.email              = plat_email
                cred.encrypted_password = encrypt_password(plat_pass)
                if email_changed:
                    cred.verified = False
                # else: preserve existing verified status
            else:
                db.add(PlatformCredential(
                    user_email         = email,
                    platform           = platform,
                    email              = plat_email,
                    encrypted_password = encrypt_password(plat_pass),
                    verified           = False,
                ))

            # --- Also write to legacy flat columns (bot runner reads these) ---
            if hasattr(user, f"{platform}_email"):
                email_changed = getattr(user, f"{platform}_email") != plat_email
                setattr(user, f"{platform}_email",    plat_email)
                setattr(user, f"{platform}_password", plat_pass)
                if email_changed:
                    setattr(user, f"{platform}_verified", 0)
                    if platform in BROWSER_SESSION_PLATFORMS:
                        setattr(user, f"{platform}_session_json", None)
                        setattr(user, f"{platform}_session_updated_at", None)
                        old_session = db.query(PlatformSession).filter_by(
                            user_email=email, platform=platform
                        ).first()
                        if old_session:
                            old_session.cookies_json = None
                            old_session.is_valid = False
                # else: preserve existing verified status

        db.commit()

    return {"message": "Credentials saved successfully"}


# ── Format response ────────────────────────────────────────────────────────────
def _fmt(user: User, db) -> dict:
    """
    Build profile response dict.
    Reads credential status from PlatformCredential when db is provided,
    falls back to legacy flat columns otherwise.
    """
    def _cred(platform: str) -> dict:
        session_ready = False
        session_updated_at = None
        if platform in BROWSER_SESSION_PLATFORMS:
            session_ready = bool(getattr(user, f"{platform}_session_json", None))
            session_updated_at = getattr(user, f"{platform}_session_updated_at", None)

        if db:
            cred = db.query(PlatformCredential).filter_by(
                user_email=user.email, platform=platform
            ).first()
            if cred:
                return {
                    "email":    cred.email,
                    "password": "",         # Never return plaintext to frontend
                    "verified": bool(cred.verified or session_ready),
                    "session_status": (
                        "ready" if session_ready else
                        "expired" if session_updated_at else
                        "missing"
                    ),
                    "session_updated_at": (
                        session_updated_at.isoformat() if session_updated_at else None
                    ),
                }
        # Fallback to legacy flat columns
        return {
            "email":    getattr(user, f"{platform}_email", "") or "",
            "password": "",
            "verified": bool(getattr(user, f"{platform}_verified", 0) or session_ready),
            "session_status": (
                "ready" if session_ready else
                "expired" if session_updated_at else
                "missing"
            ),
            "session_updated_at": session_updated_at.isoformat() if session_updated_at else None,
        }

    result = {
        "email":           user.email,
        "name":            user.name or "",
        "phone":           getattr(user, "phone", "") or "",
        "plan":            "premium",   # all users have full access
        "payment_status":  "active",
        "trial_end":       None,
        "cv_path":         getattr(user, "cv_path", "") or "",
        "cv_public_url":   getattr(user, "cv_public_url", "") or "",
        "skills":          [s.strip() for s in (getattr(user, "skills", "") or "").split(",") if s.strip()],
        "target_titles":   [t.strip() for t in (getattr(user, "target_titles", "") or "").split(",") if t.strip()],
        "target_locations": [
            l.strip()
            for l in (getattr(user, "target_locations", "") or "").replace("\r", "").split("\n")
            if l.strip()
        ],
        "years_exp":       getattr(user, "years_exp", None),
        "salary":          getattr(user, "salary", None),
        "notice_period":   getattr(user, "notice_period", None),
    }

    # Add per-platform credential info (email + verified, never password)
    for platform in PLATFORMS:
        cred = _cred(platform)
        result[f"{platform}_email"]    = cred["email"]
        result[f"{platform}_password"] = cred["password"]
        result[f"{platform}_verified"] = cred["verified"]
        result[f"{platform}_session_status"] = cred["session_status"]
        result[f"{platform}_session_updated_at"] = cred["session_updated_at"]

    return result
