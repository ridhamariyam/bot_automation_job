# Example Router Implementation with Error Handling

## Template for all routers (auth.py, bot.py, billing.py, jobs.py)

This file shows the exact pattern used in profile.py that you should apply to other routers.

---

## Example 1: Simple GET Endpoint

### ❌ Before (Crashes on Error)

```python
@router.get("/user/{email}")
def get_user(email: str):
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found")
        return user.__dict__
```

**Problems:**
- `db.get()` could throw exception → 500 with NO CORS headers
- No logging to debug issues
- Returns SQLAlchemy object directly (not JSON-safe)

### ✅ After (Safe Implementation)

```python
import logging
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from database import SessionLocal, User

logger = logging.getLogger(__name__)

@router.get("/user/{email}")
def get_user(email: str):
    """
    Fetch user by email.
    
    Returns:
    - 200: User found, returns user dict
    - 404: User not found
    - 500: Database error (logged with full stack trace)
    """
    try:
        with SessionLocal() as db:
            user = db.get(User, email)
            if not user:
                logger.warning(f"User not found: {email}")
                raise HTTPException(status_code=404, detail="User not found")
            
            logger.info(f"✅ User fetched: {email}")
            return {
                "email": user.email,
                "name": user.name,
                "plan": getattr(user, "plan", "free")
            }

    except HTTPException:
        # Re-raise HTTP exceptions (404, 400, etc)
        raise

    except Exception as e:
        logger.error(f"Failed to fetch user {email}: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "Failed to fetch user",
                "detail": str(e),
                "type": type(e).__name__,
            }
        )
```

---

## Example 2: POST with Data Validation

### ❌ Before (Unvalidated Input)

```python
@router.post("/register")
def register(body: dict):
    with SessionLocal() as db:
        user = User(
            email=body["email"],           # Could be None → 500
            password=body["password"],     # Could be None → 500
            name=body.get("name", "")
        )
        db.add(user)
        db.commit()
        return {"result": "registered"}
```

**Problems:**
- Missing key handling (KeyError → 500)
- No validation on email/password format
- No check if user already exists
- No error response with details

### ✅ After (Validated with Error Handling)

```python
from pydantic import BaseModel, EmailStr
from fastapi import HTTPException
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)

class RegisterIn(BaseModel):
    email: EmailStr        # Automatically validates email format
    password: str          # At least check not empty
    name: str = ""         # Optional
    
    class Config:
        example = {
            "email": "user@example.com",
            "password": "secure_pass",
            "name": "John Doe"
        }

@router.post("/register")
def register(body: RegisterIn):
    """
    Register new user.
    
    Returns:
    - 201: User created
    - 400: Email already registered
    - 500: Database error
    """
    try:
        with SessionLocal() as db:
            # Check if user already exists
            existing = db.get(User, body.email)
            if existing:
                logger.warning(f"Registration: email already registered {body.email}")
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": "Email already registered",
                        "detail": f"{body.email} is already in use"
                    }
                )
            
            # Create new user
            from passlib.context import CryptContext
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            
            user = User(
                email=body.email,
                name=body.name or body.email.split("@")[0],
                hashed_pw=pwd_context.hash(body.password),
                plan="free",
                payment_status="free",
            )
            
            db.add(user)
            db.commit()
            db.refresh(user)
            
            logger.info(f"✅ User registered: {body.email}")
            
            return JSONResponse(
                status_code=201,
                content={
                    "result": "registered",
                    "email": user.email,
                    "plan": user.plan,
                }
            )

    except Exception as e:
        logger.error(f"Registration error for {body.email}: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "Registration failed",
                "detail": str(e),
                "type": type(e).__name__,
            }
        )
```

---

## Example 3: PATCH with Optional Fields

### ❌ Before (Partial Updates Break)

```python
@router.patch("/user/{email}")
def update_user(email: str, body: dict):
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found")
        
        # If body contains None values, this overwrites with None
        user.name = body.get("name")       # Could be None
        user.phone = body.get("phone")     # Could be None
        user.plan = body.get("plan")       # Could be None
        
        db.commit()
        return {"result": "updated"}
```

**Problems:**
- Setting fields to None when updating (partial updates fail)
- No validation on updated values
- No error handling

### ✅ After (Safe Partial Updates)

```python
from pydantic import BaseModel
from typing import Optional
from fastapi.responses import JSONResponse

class UpdateUserIn(BaseModel):
    name: Optional[str] = None          # Optional: only set if provided
    phone: Optional[str] = None
    plan: Optional[str] = None
    
    class Config:
        example = {
            "name": "New Name",
            "phone": "+1234567890"
        }

@router.patch("/user/{email}")
def update_user(email: str, body: UpdateUserIn):
    """
    Update user fields (only provided fields are updated).
    
    Returns:
    - 200: User updated
    - 404: User not found
    - 500: Database error
    """
    try:
        with SessionLocal() as db:
            user = db.get(User, email)
            if not user:
                logger.warning(f"Update: user not found {email}")
                raise HTTPException(status_code=404, detail="User not found")
            
            # Only update fields that were explicitly provided (not None)
            if body.name is not None:
                user.name = body.name
            if body.phone is not None:
                user.phone = body.phone
            if body.plan is not None:
                # Validate plan value
                if body.plan not in ["free", "pro", "premium"]:
                    return JSONResponse(
                        status_code=400,
                        content={"error": "Invalid plan", "detail": f"Plan must be one of: free, pro, premium"}
                    )
                user.plan = body.plan
            
            db.commit()
            db.refresh(user)
            
            logger.info(f"✅ User updated: {email}")
            
            return JSONResponse(
                status_code=200,
                content={
                    "result": "updated",
                    "email": user.email,
                    "name": user.name,
                    "plan": getattr(user, "plan", "free"),
                }
            )

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Update error for {email}: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "Update failed",
                "detail": str(e),
                "type": type(e).__name__,
            }
        )
```

---

## Example 4: DELETE with Cascading Operations

### ❌ Before (Unhandled Cascade)

```python
@router.delete("/user/{email}")
def delete_user(email: str):
    with SessionLocal() as db:
        user = db.get(User, email)
        if not user:
            raise HTTPException(404, "User not found")
        
        # What if user has related records? Orphaned data?
        db.delete(user)
        db.commit()
        
        return {"result": "deleted"}
```

**Problems:**
- No cascade handling (leaves orphaned data)
- Doesn't delete files (CV, session data)
- No soft-delete option

### ✅ After (Safe Cascade Delete)

```python
import os
from pathlib import Path
from fastapi.responses import JSONResponse

@router.delete("/user/{email}")
def delete_user(email: str):
    """
    Delete user account (permanent).
    
    Cascade operations:
    - Delete user record
    - Delete uploaded CV file
    - Delete session files
    - Delete credentials
    
    Returns:
    - 200: User deleted
    - 404: User not found
    - 500: Deletion error
    """
    try:
        with SessionLocal() as db:
            user = db.get(User, email)
            if not user:
                logger.warning(f"Delete: user not found {email}")
                raise HTTPException(status_code=404, detail="User not found")
            
            # Delete CV file if exists
            cv_path = getattr(user, "cv_path", None)
            if cv_path and os.path.exists(cv_path):
                try:
                    os.remove(cv_path)
                    logger.info(f"✅ CV file deleted: {cv_path}")
                except Exception as file_error:
                    logger.warning(f"Could not delete CV: {str(file_error)}")
            
            # Delete session files if exists
            sessions_dir = Path(__file__).parent.parent / "bot" / "sessions"
            for pattern in [f"*{email.replace('@', '_')}*", f"*{email}*"]:
                for file in sessions_dir.glob(pattern):
                    try:
                        file.unlink()
                        logger.info(f"✅ Session file deleted: {file}")
                    except Exception as file_error:
                        logger.warning(f"Could not delete session: {str(file_error)}")
            
            # Delete user record
            db.delete(user)
            db.commit()
            
            logger.info(f"✅ User deleted: {email}")
            
            return JSONResponse(
                status_code=200,
                content={
                    "result": "deleted",
                    "email": email,
                    "message": "Account and all data permanently deleted"
                }
            )

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Delete error for {email}: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "Delete failed",
                "detail": str(e),
                "type": type(e).__name__,
            }
        )
```

---

## Example 5: Async Operation with Timeout

### ❌ Before (No Timeout, Can Hang)

```python
import asyncio

@router.post("/verify-email/{email}")
async def verify_email(email: str):
    # Could hang forever if service is down
    result = await send_verification_email(email)
    return {"result": "sent"}
```

### ✅ After (Timeout + Error Handling)

```python
import asyncio
from fastapi.responses import JSONResponse

@router.post("/verify-email/{email}")
async def verify_email(email: str):
    """
    Send verification email to user.
    
    Returns:
    - 200: Email sent
    - 404: User not found
    - 503: Email service unavailable
    - 500: Unexpected error
    """
    try:
        with SessionLocal() as db:
            user = db.get(User, email)
            if not user:
                logger.warning(f"Email verify: user not found {email}")
                raise HTTPException(status_code=404, detail="User not found")
        
        # Set timeout to prevent hanging
        try:
            result = await asyncio.wait_for(
                send_verification_email(email),
                timeout=10.0  # 10 second timeout
            )
            logger.info(f"✅ Verification email sent to {email}")
            
            return JSONResponse(
                status_code=200,
                content={
                    "result": "sent",
                    "email": email,
                    "message": "Check your email for verification link"
                }
            )

        except asyncio.TimeoutError:
            logger.error(f"Email service timeout for {email}")
            return JSONResponse(
                status_code=503,
                content={
                    "error": "Email service unavailable",
                    "detail": "Please try again in a few moments"
                }
            )

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Email verify error for {email}: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "Failed to send email",
                "detail": str(e),
                "type": type(e).__name__,
            }
        )
```

---

## Quick Reference: Error Handling Checklist

For each endpoint, ensure:

- [ ] Database queries inside `with SessionLocal() as db:`
- [ ] HTTPException re-raised with `raise`
- [ ] All other exceptions logged with `exc_info=True`
- [ ] JSON response returned on unexpected error (not raw exception)
- [ ] Optional fields accessed with `getattr(obj, "field", default)`
- [ ] Input validated with Pydantic models (if POST/PATCH)
- [ ] Appropriate HTTP status code (200, 201, 400, 404, 500, etc)
- [ ] Logging at info/warning/error level appropriately
- [ ] Long operations have timeout (asyncio.wait_for)
- [ ] File operations in try/except blocks

---

## Testing Error Handling

```python
# Test 500 handling with curl
curl https://jobrocket-backend-9uxh.onrender.com/api/profile/invalid-email \
  -H "Origin: https://jobrocket.aiviora.online"

# Should get:
# {
#   "error": "Profile not found",
#   "detail": "...",
#   "type": "..."
# }

# With headers:
# Access-Control-Allow-Origin: https://jobrocket.aiviora.online

# NOT a CORS error
```

---

## Summary Table

| Scenario | Status Code | Pattern |
|----------|------------|---------|
| Resource created | 201 | `JSONResponse(status_code=201, content={...})` |
| Request OK | 200 | `return {...}` |
| Bad input | 400 | `JSONResponse(status_code=400, content={...})` |
| Not found | 404 | `raise HTTPException(status_code=404, detail="...")` |
| Unexpected error | 500 | `JSONResponse(status_code=500, content={...})` |
| Service down | 503 | `JSONResponse(status_code=503, content={...})` |

