"""
WhatsApp outreach service for recruiter contact workflow.

Primary:  Twilio WhatsApp API (production — requires TWILIO_* env vars)
Fallback: Log-only mode (dev — no credentials needed)

Recruiter workflow logic (process_recruiter_contact):
    IF phone/whatsapp found in hiring post:
        → send WhatsApp application immediately
    ELSE:
        → store recruiter in DB for manual "Call Recruiter" follow-up
"""
import logging
import os
import re
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


# ── Twilio sender ──────────────────────────────────────────────────────────────

class TwilioWhatsAppSender:
    """
    Sends WhatsApp messages via Twilio Messaging API.
    Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
    """

    _BASE = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"

    def __init__(self):
        self.sid  = os.environ.get("TWILIO_ACCOUNT_SID", "")
        self.auth = os.environ.get("TWILIO_AUTH_TOKEN", "")
        self.from_ = os.environ.get("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

    def is_configured(self) -> bool:
        return bool(self.sid and self.auth)

    async def send(self, to: str, body: str, media_url: Optional[str] = None) -> dict:
        """
        Send a WhatsApp message.
        'to' should be E.164 format: +919876543210 (country code required).
        """
        if not self.is_configured():
            logger.info("[WhatsApp DEV] Would send to %s:\n%s", to, body[:120])
            return {"status": "dev_mode", "to": to}

        to_wa = f"whatsapp:{to}" if not to.startswith("whatsapp:") else to
        payload = {"From": self.from_, "To": to_wa, "Body": body}
        if media_url:
            payload["MediaUrl"] = media_url

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                self._BASE.format(sid=self.sid),
                data  = payload,
                auth  = (self.sid, self.auth),
            )
            resp.raise_for_status()
            return resp.json()


# ── Message builder ────────────────────────────────────────────────────────────

def build_whatsapp_message(
    user_name:    str,
    job_title:    str,
    company:      str,
    skills:       str,
    cv_url:       Optional[str] = None,
) -> str:
    """Build a professional WhatsApp intro message to a recruiter."""
    top_skills = ", ".join(s.strip() for s in skills.split(",")[:4] if s.strip())
    cv_line    = f"\n\nCV: {cv_url}" if cv_url else ""
    return (
        f"Hello! I came across your hiring post for *{job_title}* at *{company}*.\n\n"
        f"I'm {user_name} — a professional with expertise in {top_skills}.\n\n"
        f"I'd love to discuss the opportunity and share how I can contribute to your team.{cv_line}\n\n"
        f"Looking forward to connecting!"
    )


# ── Phone normalisation ────────────────────────────────────────────────────────

def normalize_phone(raw: str) -> Optional[str]:
    """
    Convert raw phone string to E.164 format (+CountryCodeNumber).
    Returns None if it can't be normalised.
    """
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10:
        return f"+91{digits}"           # Assume India if 10 digits
    if len(digits) == 11 and digits.startswith("0"):
        return f"+91{digits[1:]}"       # 0XXXXXXXXXX → +91XXXXXXXXXX
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    if len(digits) >= 11:
        return f"+{digits}"
    return None


# ── Recruiter contact workflow ─────────────────────────────────────────────────

async def process_recruiter_contact(
    db_session,
    user_email:      str,
    post_data:       dict,
    user_profile:    dict,
    whatsapp_sender: TwilioWhatsAppSender,
) -> dict:
    """
    Core workflow decision:

    IF phone/whatsapp in post_data:
        → attempt WhatsApp send
        → on success: log as whatsapp_sent
        → on failure: fall through to DB save
    ELSE:
        → save to recruiter_contacts as pending_call

    Returns: {"action": str, "success": bool, "phone": Optional[str]}
    """
    from database import RecruiterContact

    raw_phone = post_data.get("whatsapp") or post_data.get("phone")
    phone     = normalize_phone(raw_phone) if raw_phone else None

    if phone:
        msg = build_whatsapp_message(
            user_name  = user_profile.get("name", ""),
            job_title  = post_data.get("inferred_title", "the position"),
            company    = post_data.get("author", "your company"),
            skills     = user_profile.get("skills", ""),
            cv_url     = user_profile.get("cv_public_url"),
        )
        try:
            await whatsapp_sender.send(to=phone, body=msg)
            # Record in DB as sent
            _upsert_contact(
                db_session, user_email, post_data,
                phone=phone, status="whatsapp_sent",
                whatsapp_sent_at=datetime.utcnow(),
            )
            return {"action": "whatsapp_sent", "success": True, "phone": phone}
        except Exception as e:
            logger.warning("WhatsApp send failed for %s: %s", phone, e)
            # Fall through to save for manual follow-up

    # No phone or send failed — save for manual "Call Recruiter" list
    _upsert_contact(db_session, user_email, post_data, phone=raw_phone, status="pending_call")
    return {"action": "saved_for_call", "success": True, "phone": raw_phone}


def _upsert_contact(
    db,
    user_email: str,
    post_data:  dict,
    phone:      Optional[str],
    status:     str,
    whatsapp_sent_at: Optional[datetime] = None,
):
    from database import RecruiterContact
    import uuid

    existing = db.query(RecruiterContact).filter_by(
        user_email=user_email,
        post_url=post_data.get("post_url", ""),
    ).first()

    if existing:
        existing.status           = status
        existing.whatsapp_sent_at = whatsapp_sent_at or existing.whatsapp_sent_at
    else:
        db.add(RecruiterContact(
            id              = str(uuid.uuid4()),
            user_email      = user_email,
            recruiter_name  = post_data.get("author", "Unknown"),
            phone           = phone or post_data.get("phone"),
            whatsapp        = post_data.get("whatsapp"),
            email           = post_data.get("email"),
            post_url        = post_data.get("post_url", ""),
            post_text       = (post_data.get("text") or "")[:500],
            inferred_title  = post_data.get("inferred_title"),
            platform        = post_data.get("platform", "linkedin_feed"),
            status          = status,
            whatsapp_sent_at = whatsapp_sent_at,
        ))
    db.commit()
