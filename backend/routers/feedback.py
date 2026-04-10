"""
Feedback endpoint - collect user ratings and suggestions after 2 days of usage.
"""
import logging
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from jose import jwt, JWTError
from database import SessionLocal, User, UserFeedback

logger = logging.getLogger(__name__)
router = APIRouter()

SECRET_KEY = "change-me-in-production"
ALGORITHM = "HS256"


def _get_current_user_email(authorization: str = Header(None)) -> str:
    """Extract email from JWT token in Authorization header."""
    if not authorization:
        raise HTTPException(401, "Missing authorization header")
    
    try:
        # Extract token from "Bearer <token>"
        if not authorization.startswith("Bearer "):
            raise HTTPException(401, "Invalid authorization header format")
        
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(401, "Invalid token")
        return email
    except JWTError as e:
        raise HTTPException(401, f"Invalid token: {str(e)}")


class FeedbackIn(BaseModel):
    rating: int  # 1-5
    suggestion: str = ""  # Optional feedback text


class FeedbackStatus(BaseModel):
    ready_for_feedback: bool
    days_used: int
    days_remaining: int
    message: str


@router.get("/feedback-status")
def get_feedback_status(authorization: str = Header(None)):
    """
    Check if user is ready for feedback (has been using app for 2+ days).
    
    Response:
    - ready_for_feedback: bool - Should we ask for feedback?
    - days_used: int - How many days has user been active?
    - days_remaining: int - Days until feedback is requested (if < 2 days)
    - message: str - Human-readable status
    """
    email = _get_current_user_email(authorization)
    
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found")
        
        usage_start = getattr(user, 'usage_start', None)
        feedback_requested = getattr(user, 'feedback_requested', 0)
        
        if not usage_start:
            return FeedbackStatus(
                ready_for_feedback=False,
                days_used=0,
                days_remaining=2,
                message="Please complete your profile to start tracking usage"
            )
        
        days_used = (datetime.utcnow() - usage_start).days
        ready = days_used >= 2 and feedback_requested == 0
        days_remaining = max(0, 2 - days_used)
        
        if ready:
            message = f"✨ Thanks for using JobRocket for {days_used} days! Please share your feedback."
        elif feedback_requested == 1:
            message = "Thank you for your feedback!"
        else:
            message = f"Keep using JobRocket! Feedback request in {days_remaining} days."
        
        return FeedbackStatus(
            ready_for_feedback=ready,
            days_used=days_used,
            days_remaining=days_remaining,
            message=message
        )


@router.post("/submit-feedback")
def submit_feedback(body: FeedbackIn, authorization: str = Header(None)):
    """
    Submit user feedback (rating + suggestions).
    
    - rating: 1-5 stars
    - suggestion: Optional text (suggestions, bugs, feature requests, etc.)
    """
    email = _get_current_user_email(authorization)
    
    # Validate rating
    if not isinstance(body.rating, int) or body.rating < 1 or body.rating > 5:
        raise HTTPException(400, "Rating must be between 1 and 5")
    
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found")
        
        try:
            # Create feedback record
            feedback = UserFeedback(
                id=str(uuid.uuid4()),
                user_email=email,
                rating=body.rating,
                suggestion=body.suggestion or "",
                created_at=datetime.utcnow()
            )
            db.add(feedback)
            
            # Mark user as having provided feedback
            user.feedback_requested = 1
            
            db.commit()
            logger.info(f"✅ Feedback submitted from {email}: {body.rating}/5 stars")
            
            return {
                "status": "success",
                "message": "Thank you for your feedback! 🙏",
                "rating": body.rating,
                "feedback_id": feedback.id
            }
        
        except Exception as e:
            logger.error(f"❌ Error saving feedback: {str(e)}", exc_info=True)
            raise HTTPException(500, f"Failed to save feedback: {str(e)}")


@router.get("/my-feedback")
def get_my_feedback(authorization: str = Header(None)):
    """Get user's own feedback history."""
    email = _get_current_user_email(authorization)
    
    with SessionLocal() as db:
        feedbacks = db.query(UserFeedback).filter(
            UserFeedback.user_email == email
        ).all()
        
        if not feedbacks:
            return {"feedbacks": [], "message": "No feedback submitted yet"}
        
        return {
            "feedbacks": [
                {
                    "id": fb.id,
                    "rating": fb.rating,
                    "suggestion": fb.suggestion,
                    "created_at": fb.created_at.isoformat()
                }
                for fb in feedbacks
            ],
            "total": len(feedbacks),
            "average_rating": sum(fb.rating for fb in feedbacks) / len(feedbacks)
        }
