"""
Recruiter contact endpoints.

GET  /api/recruiter/{email}          — list all contacts for user
GET  /api/recruiter/{email}/pending  — only pending_call (for "Call Recruiter" UI)
PATCH /api/recruiter/{contact_id}    — update contact status (called, ignored, etc.)
POST /api/recruiter/scan-feed        — trigger LinkedIn feed scan for hiring posts
POST /api/recruiter/send-whatsapp    — manually send WhatsApp to a contact
"""
import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from middleware.auth import require_self, require_auth
from pydantic import BaseModel

from database import SessionLocal, User, RecruiterContact
from services.whatsapp import TwilioWhatsAppSender, build_whatsapp_message, normalize_phone

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────
class StatusUpdate(BaseModel):
    status: str   # called | whatsapp_sent | replied | ignored | pending_call

class WhatsAppSendIn(BaseModel):
    contact_id: str
    user_email:  str

class ScanFeedIn(BaseModel):
    user_email: str
    max_posts:  int = 30


# ── List contacts ──────────────────────────────────────────────────────────────
@router.get("/{email}")
def list_contacts(email: str, status: str | None = None, _: str = Depends(require_self)):
    """Return all recruiter contacts for a user, optionally filtered by status."""
    with SessionLocal() as db:
        q = db.query(RecruiterContact).filter(RecruiterContact.user_email == email)
        if status:
            q = q.filter(RecruiterContact.status == status)
        contacts = q.order_by(RecruiterContact.created_at.desc()).all()
        return [_fmt(c) for c in contacts]


@router.get("/{email}/pending")
def pending_calls(email: str, _: str = Depends(require_self)):
    """Contacts waiting for manual phone call — shown in 'Call Recruiter' UI."""
    with SessionLocal() as db:
        contacts = (
            db.query(RecruiterContact)
            .filter(
                RecruiterContact.user_email == email,
                RecruiterContact.status == "pending_call",
            )
            .order_by(RecruiterContact.created_at.desc())
            .all()
        )
        return [_fmt(c) for c in contacts]


# ── Update status ──────────────────────────────────────────────────────────────
@router.patch("/{contact_id}")
def update_contact_status(contact_id: str, body: StatusUpdate):
    """Mark a recruiter contact as called, ignored, etc."""
    valid = {"called", "whatsapp_sent", "replied", "ignored", "pending_call"}
    if body.status not in valid:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(valid)}")

    with SessionLocal() as db:
        contact = db.get(RecruiterContact, contact_id)
        if not contact:
            raise HTTPException(404, "Contact not found")
        contact.status = body.status
        db.commit()
        return _fmt(contact)


# ── Manual WhatsApp send ───────────────────────────────────────────────────────
@router.post("/send-whatsapp")
async def send_whatsapp_to_contact(body: WhatsAppSendIn, token_email: str = Depends(require_auth)):
    """
    Manually trigger a WhatsApp message to a recruiter contact.
    Used when the user clicks 'Send WhatsApp' in the Call Recruiter UI.
    """
    if body.user_email.lower() != token_email.lower():
        raise HTTPException(403, "Access denied")
    with SessionLocal() as db:
        contact = db.get(RecruiterContact, body.contact_id)
        if not contact:
            raise HTTPException(404, "Contact not found")

        user = db.query(User).filter(User.email == body.user_email).first()
        if not user:
            raise HTTPException(404, "User not found")

        phone = contact.whatsapp or contact.phone
        if not phone:
            raise HTTPException(400, "No phone number for this contact")

        normalized = normalize_phone(phone)
        if not normalized:
            raise HTTPException(400, f"Cannot normalise phone number: {phone}")

        msg = build_whatsapp_message(
            user_name  = user.name,
            job_title  = contact.inferred_title or "the open position",
            company    = contact.recruiter_name or "your company",
            skills     = user.skills or "",
            cv_url     = user.cv_public_url,
        )

    sender = TwilioWhatsAppSender()
    try:
        result = await sender.send(to=normalized, body=msg)
        with SessionLocal() as db:
            contact = db.get(RecruiterContact, body.contact_id)
            if contact:
                contact.status           = "whatsapp_sent"
                contact.whatsapp_sent_at = datetime.utcnow()
                db.commit()
        return {"success": True, "to": normalized, "result": result}
    except Exception as e:
        raise HTTPException(500, f"WhatsApp send failed: {e}")


# ── LinkedIn feed scan ─────────────────────────────────────────────────────────
@router.post("/scan-feed")
async def scan_linkedin_feed(body: ScanFeedIn, token_email: str = Depends(require_auth)):
    """
    Scan the user's LinkedIn feed for hiring posts.
    Extracts contacts and runs the recruiter workflow for each found post.
    Requires the user to have verified LinkedIn credentials.
    """
    if body.user_email.lower() != token_email.lower():
        raise HTTPException(403, "Access denied")
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == body.user_email).first()
        if not user:
            raise HTTPException(404, "User not found")

        from database import PlatformCredential
        from services.crypto import decrypt_password

        cred = db.query(PlatformCredential).filter_by(
            user_email=body.user_email, platform="linkedin"
        ).first()

        if cred and cred.verified:
            li_email = cred.email
            li_pass  = decrypt_password(cred.encrypted_password)
        else:
            li_email = getattr(user, "linkedin_email", "") or ""
            li_pass  = getattr(user, "linkedin_password", "") or ""

        if not li_email or not li_pass:
            raise HTTPException(400, "LinkedIn credentials not found. Verify LinkedIn in Settings first.")

        user_profile = {
            "name":          user.name,
            "skills":        user.skills or "",
            "cv_public_url": user.cv_public_url,
        }

    # Run scan in background (can take a few minutes)
    asyncio.create_task(
        _run_feed_scan(
            user_email   = body.user_email,
            li_email     = li_email,
            li_pass      = li_pass,
            user_profile = user_profile,
            max_posts    = body.max_posts,
        )
    )

    return {
        "status":  "scanning",
        "message": f"LinkedIn feed scan started. Up to {body.max_posts} posts will be analysed.",
    }


async def _run_feed_scan(
    user_email:   str,
    li_email:     str,
    li_pass:      str,
    user_profile: dict,
    max_posts:    int,
):
    """Background task: scan feed → classify → extract contacts → send/store."""
    try:
        from bot.browser.pool import BrowserPool
        from bot.platforms.linkedin_hiring import scan_linkedin_feed_for_hiring_posts
        from services.whatsapp import TwilioWhatsAppSender, process_recruiter_contact

        pool = BrowserPool(size=1)
        await pool.start()

        try:
            async with pool.acquire() as ctx:
                # Login with saved session or fresh credentials
                from bot.browser.session_manager import load_session, save_session
                await load_session(ctx, user_email, "linkedin")

                posts = await scan_linkedin_feed_for_hiring_posts(ctx, max_posts=max_posts)
                await save_session(ctx, user_email, "linkedin")
        finally:
            await pool.shutdown()

        logger.info("Feed scan for %s: found %d hiring posts", user_email, len(posts))

        sender = TwilioWhatsAppSender()
        with SessionLocal() as db:
            for post in posts:
                try:
                    await process_recruiter_contact(
                        db_session    = db,
                        user_email    = user_email,
                        post_data     = post,
                        user_profile  = user_profile,
                        whatsapp_sender = sender,
                    )
                except Exception as e:
                    logger.warning("Failed to process post %s: %s", post.get("post_id"), e)

        # Log to bot_logs
        with SessionLocal() as db:
            from database import BotLog
            db.add(BotLog(
                user_email = user_email,
                platform   = "linkedin_feed",
                message    = f"Feed scan complete. Found {len(posts)} hiring posts.",
                level      = "success",
            ))
            db.commit()

    except Exception as e:
        logger.error("Feed scan failed for %s: %s", user_email, e, exc_info=True)
        with SessionLocal() as db:
            from database import BotLog
            db.add(BotLog(
                user_email = user_email,
                platform   = "linkedin_feed",
                message    = f"Feed scan failed: {e}",
                level      = "error",
            ))
            db.commit()


# ── Stats ──────────────────────────────────────────────────────────────────────
@router.get("/{email}/stats")
def recruiter_stats(email: str, _: str = Depends(require_self)):
    with SessionLocal() as db:
        all_contacts = db.query(RecruiterContact).filter(
            RecruiterContact.user_email == email
        ).all()
        by_status: dict[str, int] = {}
        for c in all_contacts:
            by_status[c.status] = by_status.get(c.status, 0) + 1
        return {
            "total":           len(all_contacts),
            "by_status":       by_status,
            "whatsapp_sent":   by_status.get("whatsapp_sent", 0),
            "pending_call":    by_status.get("pending_call", 0),
        }


# ── Format ─────────────────────────────────────────────────────────────────────
def _fmt(c: RecruiterContact) -> dict:
    return {
        "id":               c.id,
        "recruiter_name":   c.recruiter_name,
        "phone":            c.phone,
        "whatsapp":         c.whatsapp,
        "email":            c.email,
        "post_url":         c.post_url,
        "post_text":        c.post_text,
        "inferred_title":   c.inferred_title,
        "platform":         c.platform,
        "status":           c.status,
        "whatsapp_sent_at": c.whatsapp_sent_at.isoformat() if c.whatsapp_sent_at else None,
        "created_at":       c.created_at.isoformat() if c.created_at else None,
    }
