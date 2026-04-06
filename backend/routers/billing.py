"""Billing and plans — manage subscriptions and feature access."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import SessionLocal, User, PLAN_FEATURES

router = APIRouter()


class PlanUpgradeIn(BaseModel):
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
            "price_monthly": f"₹{plan['price'] // 100}" if plan['price'] else "Free",
            "price_paise": plan["price"],
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
        
        plan_id = user.plan
        plan = PLAN_FEATURES.get(plan_id, PLAN_FEATURES["free"])
        
        return {
            "current_plan": plan_id,
            "name": plan["name"],
            "platforms": plan["platforms"],
            "max_apps_per_day": plan["max_apps_per_day"],
            "price": f"₹{plan['price'] // 100}" if plan['price'] else "Free",
            "available_platforms": [
                {
                    "id": p,
                    "name": p.replace("_", " ").title(),
                    "configured": bool(_platform_configured(user, p)),
                    "verified": bool(_platform_verified(user, p)),
                }
                for p in plan["platforms"]
            ],
        }


@router.post("/upgrade")
def upgrade_plan(email: str, body: PlanUpgradeIn):
    """Upgrade user to a new plan (in real app, this would handle payment)."""
    if body.plan not in PLAN_FEATURES:
        raise HTTPException(400, "Invalid plan")
    
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found")
        user.plan = body.plan
        db.commit()
    
    return {"status": "upgraded", "plan": body.plan}


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
        
        plan = PLAN_FEATURES.get(user.plan, PLAN_FEATURES["free"])
        
        if platform:
            has_access = platform in plan["platforms"]
            return {
                "has_access": has_access,
                "platform": platform,
                "required_plan": next(
                    (p for p, f in PLAN_FEATURES.items() if platform in f["platforms"]),
                    None,
                ),
            }
        
        return {
            "plan": user.plan,
            "allowed_platforms": plan["platforms"],
            "max_apps_per_day": plan["max_apps_per_day"],
        }
