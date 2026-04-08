"""
Profile endpoints — create, fetch, update (persisted to SQLite).

Error Handling Pattern:
- All database operations wrapped in try/except
- Returns JSONResponse with proper status codes and CORS headers
- Logs errors with full context for debugging
- Gracefully handles legacy users with missing fields using getattr()
"""
import os
import logging
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from database import SessionLocal, User
from utils.cv_parser import parse_cv

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize CV directory for storage
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
    """
    Create/update user profile with CV parsing and skill detection.
    
    Error Handling:
    - Database queries wrapped in try/except
    - PDF parsing wrapped in try/except (graceful fallback)
    - Returns 400 if user not found (registration required)
    - Returns 500 with JSON detail on unexpected errors
    """
    try:
        cv_path = ""
        cv_data: dict = {}

        # Try to parse CV if provided
        if cv:
            try:
                file_bytes = await cv.read()
                cv_data = parse_cv(file_bytes, cv.content_type or "application/pdf")
                
                # Save CV file
                dest = CV_DIR / f"{email.replace('@', '_')}.pdf"
                dest.write_bytes(file_bytes)
                cv_path = str(dest)
                logger.info(f"✅ CV parsed for {email}")
                
            except Exception as cv_error:
                # If CV parsing fails, continue without it
                logger.warning(f"⚠️ CV parsing failed for {email}: {str(cv_error)}")
                cv_data = {}

        # Merge uploaded skills with detected skills
        form_skills = [s.strip() for s in skills.split(",") if s.strip()]
        detected = cv_data.get("detected_skills", [])
        merged_skills = list(dict.fromkeys(form_skills + detected))

        resolved_phone = phone or cv_data.get("detected_phone", "")

        # Update user profile in database
        with SessionLocal() as db:
            user = db.get(User, email)
            if not user:
                logger.warning(f"⚠️ Profile creation: user {email} not found (not registered)")
                raise HTTPException(404, "User not found. Please register first.")
            
            user.name = name
            user.phone = resolved_phone
            user.skills = ",".join(merged_skills)
            user.target_titles = targetTitles
            
            # Store locations newline-separated to preserve "City, Country" entries
            locs = [l.strip() for l in targetLocations.replace("\r", "").split("\n") if l.strip()]
            if not locs:  # Fallback: was comma-separated
                locs = [l.strip() for l in targetLocations.split(",") if l.strip()]
            user.target_locations = "\n".join(locs)
            
            if cv_path:
                user.cv_path = cv_path
            
            db.commit()
            db.refresh(user)
            logger.info(f"✅ Profile updated for {email}")

        return JSONResponse(
            status_code=200,
            content=_fmt(user)
        )

    except HTTPException:
        # Re-raise HTTP exceptions (400, 404, etc)
        raise
        
    except Exception as e:
        logger.error(f"❌ Profile creation error for {email}: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "Failed to create profile",
                "detail": str(e),
                "type": type(e).__name__,
            }
        )


# ── Fetch profile ───────────────────────────────────────────────────────────
@router.get("/{email}")
def get_profile(email: str):
    """
    Fetch user profile by email.
    
    Error Handling:
    - Returns 404 if user not found
    - Returns 500 with JSON detail on database errors
    - Uses safe field access (getattr) for backward compatibility with legacy users
    """
    try:
        with SessionLocal() as db:
            user = db.get(User, email)
            if not user:
                logger.warning(f"⚠️ Profile fetch: user {email} not found")
                raise HTTPException(status_code=404, detail="Profile not found")
            
            logger.info(f"✅ Profile fetched for {email}")
            return _fmt(user)

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"❌ Profile fetch error for {email}: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "Failed to fetch profile",
                "detail": str(e),
                "type": type(e).__name__,
            }
        )


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
    """
    Update platform credentials for a user.
    
    Error Handling:
    - Returns 404 if user not found
    - Returns 500 with JSON detail on database errors
    - Only updates provided fields (rest ignored)
    """
    try:
        with SessionLocal() as db:
            user = db.get(User, email)
            if not user:
                logger.warning(f"⚠️ Credentials update: user {email} not found")
                raise HTTPException(status_code=404, detail="User not found")
            
            # Update all platform credentials if provided
            platforms = ["linkedin", "indeed", "glassdoor", "monster", "naukri", "bayt", "timesjobs"]
            for platform in platforms:
                email_field = f"{platform}_email"
                password_field = f"{platform}_password"
                
                if hasattr(body, email_field):
                    email_val = getattr(body, email_field, "")
                    if email_val:
                        setattr(user, email_field, email_val)
                
                if hasattr(body, password_field):
                    password_val = getattr(body, password_field, "")
                    if password_val:
                        setattr(user, password_field, password_val)
            
            db.commit()
            logger.info(f"✅ Credentials updated for {email}")
            
        return JSONResponse(
            status_code=200,
            content={"message": "Credentials saved successfully"}
        )

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"❌ Credentials update error for {email}: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "Failed to update credentials",
                "detail": str(e),
                "type": type(e).__name__,
            }
        )


def _fmt(user: User) -> dict:
    """
    Format user profile for API response.
    
    CRITICAL: Uses getattr() for all optional fields to support legacy users
    who don't have new trial/payment fields (backward compatibility).
    
    If a field doesn't exist on a user record, getattr returns the default.
    This prevents AttributeError 500 crashes when new fields are added.
    """
    return {
        # Basic profile info (always present)
        "email": user.email,
        "name": user.name or "",
        "phone": getattr(user, "phone", None) or "",
        
        # Plan and payment (new fields - use safe access)
        "plan": getattr(user, "plan", None) or "free",
        "payment_status": getattr(user, "payment_status", None) or "free",
        "trial_start": getattr(user, "trial_start", None),
        "trial_end": getattr(user, "trial_end", None),
        
        # CV and skills
        "cv_path": getattr(user, "cv_path", None) or "",
        "skills": [s.strip() for s in (getattr(user, "skills", None) or "").split(",") if s.strip()],
        "target_titles": [t.strip() for t in (getattr(user, "target_titles", None) or "").split(",") if t.strip()],
        "target_locations": [
            l.strip() 
            for l in (getattr(user, "target_locations", None) or "").replace("\r", "").split("\n") 
            if l.strip()
        ],
        
        # LinkedIn (7 job platforms: all with email, password, verified status)
        "linkedin_email": getattr(user, "linkedin_email", None) or "",
        "linkedin_password": getattr(user, "linkedin_password", None) or "",
        "linkedin_verified": bool(getattr(user, "linkedin_verified", False)),
        
        # Indeed
        "indeed_email": getattr(user, "indeed_email", None) or "",
        "indeed_password": getattr(user, "indeed_password", None) or "",
        "indeed_verified": bool(getattr(user, "indeed_verified", False)),
        
        # Glassdoor
        "glassdoor_email": getattr(user, "glassdoor_email", None) or "",
        "glassdoor_password": getattr(user, "glassdoor_password", None) or "",
        "glassdoor_verified": bool(getattr(user, "glassdoor_verified", False)),
        
        # Monster
        "monster_email": getattr(user, "monster_email", None) or "",
        "monster_password": getattr(user, "monster_password", None) or "",
        "monster_verified": bool(getattr(user, "monster_verified", False)),
        
        # Bayt
        "bayt_email": getattr(user, "bayt_email", None) or "",
        "bayt_password": getattr(user, "bayt_password", None) or "",
        "bayt_verified": bool(getattr(user, "bayt_verified", False)),
        
        # Naukri
        "naukri_email": getattr(user, "naukri_email", None) or "",
        "naukri_password": getattr(user, "naukri_password", None) or "",
        "naukri_verified": bool(getattr(user, "naukri_verified", False)),
        
        # TimesJobs
        "timesjobs_email": getattr(user, "timesjobs_email", None) or "",
        "timesjobs_password": getattr(user, "timesjobs_password", None) or "",
        "timesjobs_verified": bool(getattr(user, "timesjobs_verified", False)),
    }
