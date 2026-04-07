"""Billing and plans — manage subscriptions and feature access."""
import os
import hmac
import hashlib
import httpx
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from database import SessionLocal, User, PLAN_FEATURES, Payment

router = APIRouter()

# Paddle v3 Configuration
PADDLE_SANDBOX = os.getenv("PADDLE_SANDBOX", "true").lower() == "true"
PADDLE_API_KEY = os.getenv("PADDLE_API_KEY", "")
PADDLE_WEBHOOK_SECRET = os.getenv("PADDLE_WEBHOOK_SECRET", "")
PADDLE_PRICE_PRO = os.getenv("PADDLE_PRICE_PRO", "")
PADDLE_PRICE_PREMIUM = os.getenv("PADDLE_PRICE_PREMIUM", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Paddle API endpoint
PADDLE_API_URL = "https://api.paddle.com" if not PADDLE_SANDBOX else "https://sandbox-api.paddle.com"

# Map plan names to price IDs
PADDLE_PRICE_MAP = {
    "pro": PADDLE_PRICE_PRO,
    "premium": PADDLE_PRICE_PREMIUM,
}


class PlanUpgradeIn(BaseModel):
    plan: str  # "pro" | "premium"
    email: str


class PaymentCheckoutIn(BaseModel):
    email: str
    plan: str  # "pro" | "premium"


@router.get("/plans")
def get_plans():
    """Get all available plans with features and pricing."""
    return {
        plan_id: {
            "id": plan_id,
            "name": plan["name"],
            "platforms": plan["platforms"],
            "max_apps_per_day": plan["max_apps_per_day"],
            "price": plan["price_display"],
            "price_paise": plan["price_paise"],
            "type": plan["type"],
        }
        for plan_id, plan in PLAN_FEATURES.items()
    }


@router.get("/plan/{email}")
def get_user_plan(email: str):
    """Get user's current plan details."""
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found")
        
        plan_id = user.plan or "free"
        plan = PLAN_FEATURES.get(plan_id, PLAN_FEATURES["free"])
        
        # Calculate trial info
        now = datetime.utcnow()
        trial_active = False
        trial_days_remaining = 0
        
        if user.trial_end and now < user.trial_end:
            trial_active = True
            trial_days_remaining = (user.trial_end - now).days + 1
        
        return {
            "plan": plan_id,
            "name": plan["name"],
            "platforms": plan["platforms"],
            "max_apps_per_day": plan["max_apps_per_day"],
            "price": plan["price_display"],
            "type": plan["type"],
            "trial": {
                "active": trial_active,
                "days_remaining": trial_days_remaining,
                "end_date": user.trial_end.isoformat() if user.trial_end else None,
            },
            "payment_status": user.payment_status,
        }


@router.get("/trial-status/{email}")
def get_trial_status(email: str):
    """Get detailed trial & subscription status."""
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found")
        
        now = datetime.utcnow()
        trial_active = False
        trial_days_remaining = 0
        trial_end_date = None
        
        if user.trial_end and now < user.trial_end:
            trial_active = True
            trial_days_remaining = (user.trial_end - now).days + 1
            trial_end_date = user.trial_end.isoformat()
        
        return {
            "email": email,
            "plan": user.plan or "free",
            "payment_status": user.payment_status,
            "trial": {
                "active": trial_active,
                "days_remaining": trial_days_remaining,
                "end_date": trial_end_date,
                "message": (
                    f"7-day premium trial active! {trial_days_remaining} days remaining. All features unlocked."
                    if trial_active
                    else "Trial expired. Please upgrade to continue using premium features."
                ),
            },
            "platforms": {
                "free": PLAN_FEATURES["free"]["platforms"],
                "pro": PLAN_FEATURES["pro"]["platforms"],
                "premium": PLAN_FEATURES["premium"]["platforms"],
                "available_for_user": PLAN_FEATURES[user.plan or "free"]["platforms"],
            },
            "max_apps_per_day": PLAN_FEATURES[user.plan or "free"]["max_apps_per_day"],
            "upgrade_required": trial_active is False and user.payment_status == "expired",
        }


@router.post("/checkout")
async def create_checkout(body: PaymentCheckoutIn):
    """
    Create a Paddle checkout link for one-time payment.
    Uses Paddle v3 API to create a transaction checkout.
    """
    if body.plan not in ["pro", "premium"]:
        raise HTTPException(400, "Invalid plan. Must be 'pro' or 'premium'")
    
    if not PADDLE_API_KEY or not PADDLE_PRICE_MAP.get(body.plan):
        raise HTTPException(500, "Paddle not configured. Missing API credentials.")
    
    with SessionLocal() as db:
        user = db.get(User, body.email)
        if not user:
            raise HTTPException(404, "User not found")
    
    # Get price ID for the plan
    price_id = PADDLE_PRICE_MAP[body.plan]
    plan_config = PLAN_FEATURES[body.plan]
    
    # Create checkout session using Paddle v3 API
    try:
        async with httpx.AsyncClient() as client:
            # Paddle v3: Create a transaction with checkout
            checkout_data = {
                "items": [
                    {
                        "price_id": price_id,
                        "quantity": 1,
                    }
                ],
                "customer": {
                    "email": body.email,
                },
                "custom_data": {
                    "user_email": body.email,
                    "plan": body.plan,
                },
                "checkout": {
                    "url": f"{FRONTEND_URL}/billing?success=true",
                },
            }
            
            headers = {
                "Authorization": f"Bearer {PADDLE_API_KEY}",
                "Content-Type": "application/json",
            }
            
            response = await client.post(
                f"{PADDLE_API_URL}/transactions",
                json=checkout_data,
                headers=headers,
                timeout=10.0,
            )

            if response.status_code not in [200, 201]:
                print(f"Paddle API error: {response.text}")
                raise HTTPException(
                    response.status_code,
                    f"Failed to create checkout: {response.status_code}"
                )

            data = response.json()
            checkout_url = data.get("data", {}).get("checkout", {}).get("url")
            
            if not checkout_url:
                raise HTTPException(500, "Paddle did not return checkout URL")
            
            return {
                "checkout_url": checkout_url,
                "plan": body.plan,
                "amount": plan_config["price_display"],
                "platforms": plan_config["platforms"],
            }
    
    except httpx.TimeoutException:
        raise HTTPException(500, "Paddle API timeout. Please try again.")
    except Exception as e:
        print(f"Checkout error: {e}")
        raise HTTPException(500, f"Payment processing error: {str(e)}")


@router.post("/webhook/paddle")
async def paddle_webhook(request: Request):
    """
    Webhook handler for Paddle payment notifications (v3 API).
    Verifies signature and updates user subscription.
    """
    try:
        # Get the raw body for signature verification
        body = await request.body()
        
        # Get Paddle signature from header
        paddle_signature = request.headers.get("Paddle-Signature", "")
        
        # Verify Paddle webhook signature (v3 format)
        if not _verify_paddle_signature_v3(body, paddle_signature):
            print("Webhook signature verification failed")
            raise HTTPException(401, "Invalid Paddle signature")
        
        # Parse the JSON
        data = await request.json()
        
        event_type = data.get("event_type")
        event_data = data.get("data", {})
        
        print(f"Paddle webhook: {event_type}")
        
        # Handle different Paddle events
        if event_type == "transaction.completed":
            return _handle_transaction_completed(event_data)
        elif event_type == "transaction.updated":
            # Check if status changed to completed
            if event_data.get("status") == "completed":
                return _handle_transaction_completed(event_data)
        
        return {"status": "acknowledged"}
    
    except Exception as e:
        print(f"Webhook error: {e}")
        raise HTTPException(400, f"Webhook processing error: {str(e)}")


@router.get("/payment-status/{email}")
def get_payment_status(email: str):
    """Get user's latest payment status."""
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found")
        
        latest_payment = db.query(Payment).filter(
            Payment.user_email == email
        ).order_by(Payment.created_at.desc()).first()
        
        return {
            "current_plan": user.plan or "free",
            "latest_payment": {
                "id": latest_payment.id,
                "plan": latest_payment.plan_id,
                "amount": f"₹{latest_payment.amount_paise / 100}",
                "status": latest_payment.status,
                "created_at": latest_payment.created_at.isoformat(),
                "completed_at": latest_payment.completed_at.isoformat() if latest_payment.completed_at else None,
            } if latest_payment else None,
        }


def _verify_paddle_signature_v3(body: bytes, signature: str) -> bool:
    """
    Verify Paddle v3 webhook signature.
    Paddle v3 uses: ts;signature format where signature is HMAC SHA256
    """
    if not PADDLE_WEBHOOK_SECRET or not signature:
        print("Missing webhook secret or signature")
        return False
    
    try:
        # Paddle v3 signature format: ts;signature
        parts = signature.rsplit(";", 1)
        if len(parts) != 2:
            print("Invalid signature format")
            return False
        
        ts, sig = parts
        
        # Create the data to verify: ts + request body
        data_to_verify = f"{ts}{body.decode('utf-8')}"
        
        # Compute HMAC-SHA256
        expected_sig = hmac.new(
            PADDLE_WEBHOOK_SECRET.encode(),
            data_to_verify.encode(),
            hashlib.sha256
        ).hexdigest()
        
        # Compare signatures (constant time comparison)
        result = hmac.compare_digest(sig, expected_sig)
        print(f"Signature verification: {result}")
        return result
    
    except Exception as e:
        print(f"Signature verification error: {e}")
        return False


def _handle_transaction_completed(event_data: dict) -> dict:
    """Handle Paddle transaction.completed event."""
    try:
        transaction_id = event_data.get("id")
        customer_email = event_data.get("customer_id")  # v3 uses different field
        
        # Try different field names for customer email
        if not customer_email:
            custom_data = event_data.get("custom_data", {})
            customer_email = custom_data.get("user_email") if isinstance(custom_data, dict) else None
        
        if not customer_email:
            print(f"No customer email found in event data: {event_data}")
            return {"status": "skipped", "reason": "No customer email"}
        
        status = event_data.get("status", "").lower()
        if status != "completed":
            print(f"Transaction status is {status}, not completed")
            return {"status": "skipped", "reason": f"Transaction status is {status}"}
        
        with SessionLocal() as db:
            user = db.get(User, customer_email)
            if not user:
                print(f"User not found: {customer_email}")
                return {"status": "skipped", "reason": "User not found"}
            
            # Determine plan from custom data
            custom_data = event_data.get("custom_data", {})
            plan_id = custom_data.get("plan") if isinstance(custom_data, dict) else None
            
            if not plan_id or plan_id not in ["pro", "premium"]:
                plan_id = "pro"  # Default to pro if not specified
            
            # Update user plan and payment status
            user.plan = plan_id
            user.payment_status = "active"
            
            # Clear trial on payment (user has paid, trial no longer applies)
            user.trial_end = None
            user.trial_start = None
            
            user.last_payment_id = f"paddle_{transaction_id}"
            
            # Get amount from charges/items
            amount_paise = 59900  # Default to ₹599
            try:
                charges = event_data.get("charges", [])
                if charges:
                    # Amount is typically in the smallest currency unit
                    amount_paise = int(charges[0].get("amount", 59900))
            except:
                pass
            
            # Record payment
            payment = Payment(
                id=f"paddle_{transaction_id}",
                user_email=customer_email,
                plan_id=plan_id,
                amount_paise=amount_paise,
                currency="INR",
                status="completed",
                paddle_transaction_id=transaction_id,
                created_at=datetime.utcnow(),
                completed_at=datetime.utcnow(),
            )
            db.add(payment)
            db.commit()
            
            print(f"Payment processed: {customer_email} upgraded to {plan_id}")
        
        return {
            "status": "processed",
            "user": customer_email,
            "transaction_id": transaction_id,
            "plan": plan_id,
            "message": "Payment successful! Your premium features are now active.",
        }
    
    except Exception as e:
        print(f"Error handling transaction: {e}")
        return {"status": "error", "reason": str(e)}


def _platform_configured(user: User, platform: str) -> bool:
    """Check if platform is configured with credentials."""
    field_name = f"{platform}_email"
    return bool(getattr(user, field_name, None))


def _platform_verified(user: User, platform: str) -> bool:
    """Check if platform is verified."""
    field_name = f"{platform}_verified"
    return bool(getattr(user, field_name, False))


@router.get("/feature-access/{email}")
def check_feature_access(email: str, platform: str = None):
    """Check if user has access to a specific feature/platform."""
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found")
        
        plan = PLAN_FEATURES.get(user.plan or "free", PLAN_FEATURES["free"])
        
        if platform:
            has_access = platform in plan["platforms"]
            return {
                "has_access": has_access,
                "platform": platform,
                "current_plan": user.plan or "free",
            }
        
        return {
            "plan": user.plan or "free",
            "allowed_platforms": plan["platforms"],
            "max_apps_per_day": plan["max_apps_per_day"],
        }


