# FastAPI Error Handling & Production Safety Guide

## Overview

This guide explains the production-safe patterns implemented in JobRocket API to prevent CORS errors and 500 crashes.

## Table of Contents

1. [CORS Configuration](#cors-configuration)
2. [Global Exception Handler](#global-exception-handler)
3. [Router Error Handling Pattern](#router-error-handling-pattern)
4. [Database Safe Access Pattern](#database-safe-access-pattern)
5. [Logging Best Practices](#logging-best-practices)
6. [Common Pitfalls & Solutions](#common-pitfalls--solutions)

---

## CORS Configuration

### Why CORS Matters

When your frontend (Vercel) calls your backend (Render), the browser enforces CORS rules:

```
1. Browser sees request from https://jobrocket.aiviora.online
2. Browser asks: "Is this origin allowed?"
3. Backend must respond with: Access-Control-Allow-Origin header
4. If missing, browser blocks response (shows CORS error)
```

### Key CORS Setup (in main.py)

```python
# 1. MUST be added FIRST (runs LAST on response)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,              # Explicit whitelist
    allow_origin_regex=r"https://.*\.vercel\.app",  # Regex for preview deployments
    allow_credentials=True,                      # Allow auth headers + cookies
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", ...],
    expose_headers=["Content-Type", "Authorization", ...],
    max_age=3600,  # Cache preflight for 1 hour
)

# 2. Register routes AFTER middleware
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
```

### Why Middleware Order Matters

FastAPI processes middleware in **LIFO order** (Last In, First Out):

```
Request Flow:
→ [CORS Middleware] → ... → [Your Route] → ...

Response Flow:
← [Your Route] → ... → [CORS Middleware] ← (adds headers)
```

**If CORS is added AFTER other middleware, it runs FIRST on response, not LAST.**

### Supporting Vercel Preview Deployments

Vercel creates preview URLs like: `https://pr-123-my-project.vercel.app`

Instead of hardcoding every preview URL, use regex:

```python
allow_origin_regex=r"https://.*\.vercel\.app"  # Matches ALL *.vercel.app
```

---

## Global Exception Handler

### Problem It Solves

Without a global exception handler:

```python
@app.get("/api/profile/{email}")
def get_profile(email: str):
    # If this crashes with AssertionError...
    data = expensive_db_query(email)  # 💥
    return data
    
# Browser sees:
# 1. 500 Internal Server Error (FastAPI's default HTML error page)
# 2. NO CORS headers on the response
# 3. Browser blocks the response as CORS violation
# 4. User sees: "CORS error" (misleading - real error was database bug)
```

✅ **Solution: Global exception handler ensures CORS headers on ALL responses**

### Implementation

```python
from fastapi.responses import JSONResponse
from fastapi import HTTPException
from datetime import datetime

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catches ALL unhandled exceptions and returns:
    1. JSON response (not HTML)
    2. With CORS headers
    3. With full error details for debugging
    """
    
    method = request.method
    path = request.url.path
    origin = request.headers.get("origin", "NO_ORIGIN")
    
    # Log the full exception for debugging
    logger.error(
        f"🔴 UNHANDLED EXCEPTION: [{method}] {path} | Origin: {origin}",
        exc_info=exc,  # Includes full stack trace
    )
    
    # Return JSON error response with CORS headers
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "detail": str(exc),
            "type": type(exc).__name__,  # e.g., "AttributeError", "ValueError"
            "timestamp": datetime.utcnow().isoformat(),
        },
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
        }
    )
```

---

## Router Error Handling Pattern

### Standard Pattern for All Routes

```python
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from database import SessionLocal, User
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# ✅ CORRECT: Try/Except + Proper Error Responses

@router.get("/{email}")
def get_profile(email: str):
    """
    Fetch user profile by email.
    
    All database operations wrapped in try/except.
    Returns proper HTTP status codes and JSON errors.
    """
    try:
        with SessionLocal() as db:
            user = db.get(User, email)
            if not user:
                logger.warning(f"Profile fetch: user {email} not found")
                raise HTTPException(status_code=404, detail="User not found")
            
            logger.info(f"✅ Profile fetched for {email}")
            return format_user(user)

    except HTTPException:
        # Re-raise HTTP exceptions (404, 400, etc)
        # FastAPI handles these automatically with proper response
        raise

    except Exception as e:
        # Catch unexpected errors (database crashes, timeouts, etc)
        logger.error(
            f"❌ Profile fetch failed for {email}: {str(e)}",
            exc_info=True,  # Includes full stack trace
        )
        
        # Return JSON error instead of letting it crash
        return JSONResponse(
            status_code=500,
            content={
                "error": "Failed to fetch profile",
                "detail": str(e),
                "type": type(e).__name__,  # Helps debugging
            }
        )
```

### Key Points

| Pattern | ✅ Correct | ❌ Wrong |
|---------|-----------|---------|
| Return type | `JSONResponse` or Pydantic model | Raw `dict` |
| Status codes | 200, 201, 400, 404, 500 | HTTP defaults |
| Errors | Logged with `exc_info=True` | Printed or ignored |
| HTTP exceptions | Re-raised with `raise` | Caught and wrapped |
| Database | Inside try/except | Unguarded |

---

## Database Safe Access Pattern

### Problem: Legacy Users Missing New Fields

When you add new columns to the User model:

```python
class User(Base):
    # Existing fields
    email: str
    name: str
    
    # NEW FIELDS (don't exist on old users)
    trial_end: DateTime    # ← Old users don't have this
    payment_status: str    # ← Old users don't have this
```

Old users in the database DON'T have these fields. Direct access crashes:

```python
# ❌ WRONG - Crashes on old users
def get_access_info(user: User):
    if user.trial_end > now:  # ← AttributeError on old users!
        return "premium"
    return "free"
```

### ✅ CORRECT: Use getattr() with Defaults

```python
# ✅ CORRECT - Safe on all users (old and new)
def get_access_info(user: User):
    # Use getattr(object, attr_name, default_value)
    trial_end = getattr(user, "trial_end", None)
    
    if trial_end and trial_end > datetime.utcnow():
        return "premium"
    
    return "free"
```

### Apply Throughout Codebase

In `_fmt()` (profile.py):

```python
def _fmt(user: User) -> dict:
    return {
        # Safe access for all fields
        "email": user.email,  # Always present
        "plan": getattr(user, "plan", None) or "free",  # Optional, default "free"
        "trial_end": getattr(user, "trial_end", None),  # Optional, default None
        "verified": bool(getattr(user, "verified", False)),  # Optional, default False
    }
```

In `_get_user_access_info()` (bot.py):

```python
def _get_user_access_info(user: User):
    # Safe access for optional fields
    trial_end = getattr(user, "trial_end", None)
    payment_status = getattr(user, "payment_status", "free")
    plan = getattr(user, "plan", "free") or "free"
    
    # Now logic is safe for all users
    if trial_end and datetime.utcnow() < trial_end:
        return "premium", "Trial active", True
    
    if payment_status != "trial":
        return plan, None, True
    
    return "free", "Trial expired", False
```

### Pattern Summary

```python
# Pattern: getattr(object, "field_name", default_value)

# For strings
email = getattr(user, "email", "") or ""

# For dates/objects
trial_end = getattr(user, "trial_end", None)

# For booleans
verified = bool(getattr(user, "verified", False))

# For numbers
plan_tier = getattr(user, "plan_tier", 0)
```

---

## Logging Best Practices

### Structured Logging

In `main.py` middleware:

```python
@app.middleware("http")
async def structured_logging_middleware(request: Request, call_next):
    """Log request method, path, origin, response status, and timing."""
    
    method = request.method
    path = request.url.path
    origin = request.headers.get("origin", "NO_ORIGIN")
    start_time = time.time()
    
    logger.info(f"→ [{method}] {path} | Origin: {origin}")
    
    try:
        response = await call_next(request)
        duration_ms = (time.time() - start_time) * 1000
        
        logger.info(
            f"← [{method}] {path} | Status: {response.status_code} | "
            f"Duration: {duration_ms:.2f}ms"
        )
        
        return response
    except Exception as exc:
        duration_ms = (time.time() - start_time) * 1000
        logger.error(
            f"✗ [{method}] {path} | Exception: {type(exc).__name__} | "
            f"Duration: {duration_ms:.2f}ms",
            exc_info=True
        )
        raise
```

### Log Levels in Routers

```python
import logging
logger = logging.getLogger(__name__)

def my_route():
    try:
        # Info: Normal, important events
        logger.info(f"✅ User {email} registered successfully")
        
        # Warning: Something unexpected but non-critical
        logger.warning(f"⚠️ CV parsing failed for {email}, continuing without CV")
        
        # Error: Something failed and needs investigation
        logger.error(f"❌ Database connection lost: {str(e)}", exc_info=True)
        
    except Exception as e:
        # Always log with exc_info=True to see full stack trace
        logger.error("Failed to process request", exc_info=True)
```

---

## Common Pitfalls & Solutions

### Pitfall 1: CORS Added AFTER Other Middleware

❌ **Wrong:**
```python
app.add_middleware(CustomMiddleware)
app.add_middleware(CORSMiddleware, ...)  # Added second = runs first on response
```

✅ **Correct:**
```python
app.add_middleware(CORSMiddleware, ...)  # Added first = runs last on response
app.add_middleware(CustomMiddleware)
```

---

### Pitfall 2: No Global Exception Handler

❌ **Wrong:**
```python
@app.get("/data")
def get_data():
    crash_here()  # 500, no CORS headers, browser shows CORS error
    return {}
```

✅ **Correct:**
```python
# In main.py, add:
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": str(exc)},
        headers={"Access-Control-Allow-Origin": origin}
    )
```

---

### Pitfall 3: Direct Field Access on Optional Columns

❌ **Wrong:**
```python
def _fmt(user: User):
    return {
        "trial_end": user.trial_end,  # 💥 AttributeError on old users
    }
```

✅ **Correct:**
```python
def _fmt(user: User):
    return {
        "trial_end": getattr(user, "trial_end", None),  # Safe on all users
    }
```

---

### Pitfall 4: Not Logging Exceptions

❌ **Wrong:**
```python
try:
    db.add(user)
    db.commit()
except Exception as e:
    # What error occurred? No clue.
    return {"error": "Failed"}
```

✅ **Correct:**
```python
try:
    db.add(user)
    db.commit()
except Exception as e:
    # Full stack trace logged for debugging
    logger.error("Database commit failed", exc_info=True)
    return {"error": "Failed"}
```

---

### Pitfall 5: Hardcoding Frontend URLs

❌ **Wrong:**
```python
ALLOWED_ORIGINS = [
    "https://jobrocket.aiviora.online",
    "https://www.jobrocket.aiviora.online",
    "https://pr-123-myproject.vercel.app",  # Hardcoded preview URL
    "https://pr-124-myproject.vercel.app",  # Another hardcoded URL
    # ... more URLs ...
]
```

✅ **Correct:**
```python
ALLOWED_ORIGINS = [
    "https://jobrocket.aiviora.online",
    "https://www.jobrocket.aiviora.online",
]

# Plus regex pattern to match all Vercel previews
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",  # Matches ALL previews
    ...
)
```

---

## Deployment Checklist

Before deploying to production (Render):

- [ ] CORS middleware is FIRST (added at the top)
- [ ] Global exception handler is defined
- [ ] All routes wrapped in try/except
- [ ] All optional fields use `getattr()`
- [ ] All exceptions logged with `exc_info=True`
- [ ] Logging configured to INFO level (DEBUG in dev)
- [ ] Database operations inside context managers (`with SessionLocal() as db:`)
- [ ] Routes return JSONResponse with proper status codes
- [ ] Frontend origin is in ALLOWED_ORIGINS
- [ ] Regex pattern covers all Vercel deployment URLs

---

## Testing CORS

After deploying to Render:

```bash
# Test preflight request
curl -X OPTIONS https://jobrocket-backend-9uxh.onrender.com/api/profile \
  -H "Origin: https://jobrocket.aiviora.online" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Should see: Access-Control-Allow-Origin: https://jobrocket.aiviora.online

# Test actual request
curl -H "Origin: https://jobrocket.aiviora.online" \
  https://jobrocket-backend-9uxh.onrender.com/health \
  -v

# Should see the CORS header in response
```

---

## Summary

| Component | Purpose | Location |
|-----------|---------|----------|
| **CORS Middleware** | Allow cross-origin requests | main.py (FIRST) |
| **Global Exception Handler** | Catch 500 errors + add CORS headers | main.py |
| **Structured Logging** | Track request/response flow | main.py middleware |
| **Router Try/Except** | Handle errors gracefully | All routers |
| **Safe Field Access** | Support legacy users with missing columns | All routers (_fmt, helpers) |
| **Database Context Manager** | Proper connection handling | All routers `with SessionLocal() as db:` |

This pattern ensures:
- ✅ Frontend gets real errors, not misleading "CORS error"
- ✅ Backend never crashes with unhandled exceptions
- ✅ Requests logged for debugging
- ✅ Legacy users get service without SQL errors
- ✅ Vercel + Render deployment works smoothly
