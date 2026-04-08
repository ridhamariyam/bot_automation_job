# Architecture & Flow Diagrams

## 1. Request Flow with CORS & Error Handling

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (Vercel)                                           │
│ https://jobrocket.aiviora.online                            │
│                                                             │
│ fetch('/api/profile/user@example.com')                      │
│   ↓                                                          │
└─────────────────────────────────────────────────────────────┘

   REQUEST SENT ────┐
                   │ Origin: https://jobrocket.aiviora.online
                   │ Authorization: Bearer TOKEN
                   ↓

┌─────────────────────────────────────────────────────────────┐
│ BACKEND (Render)                                            │
│ https://jobrocket-backend-9uxh.onrender.com                │
│                                                             │
│ REQUEST RECEIVED:                                           │
│   1. [LOGGING MIDDLEWARE] Log request metadata              │
│   2. [CORS MIDDLEWARE] Check if origin allowed ✓            │
│   3. [ROUTE HANDLER] Process request                        │
│      - Database query                                        │
│      - Format response                                       │
│      - Return data                                           │
│   4. [CORS MIDDLEWARE] Add CORS headers                     │
│   5. [LOGGING MIDDLEWARE] Log response status               │
│                                                             │
└─────────────────────────────────────────────────────────────┘

   RESPONSE SENT ────┐
                   │ HTTP 200
                   │ Access-Control-Allow-Origin: ...
                   │ Content-Type: application/json
                   │ {"email": "user@example.com", ...}
                   ↓

┌─────────────────────────────────────────────────────────────┐
│ BROWSER                                                     │
│                                                             │
│ Receives response:                                           │
│   1. ✅ Has Access-Control-Allow-Origin header?             │
│   2. ✅ Does it match request origin?                       │
│   3. ✅ Allow JavaScript to access response                 │
│                                                             │
│ Result: Response delivered to JavaScript                    │
│         (data displayed on page)                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Error Handling Flow

```
NORMAL PATH:
────────────────────
Request → Route Handler → Database → Format → Response (200)
                              ↓
                           Success
                              ↓
                      Return formatted data


ERROR PATH (WITHOUT GLOBAL HANDLER):
────────────────────────────────────────
Request → Route Handler → Database → 💥 Exception
                              ↓
                         Unhandled!
                              ↓
                     FastAPI returns HTML 500 page
                              ↓
                     ❌ NO CORS HEADERS
                              ↓
Browser: "CORS error!" (misleading)


ERROR PATH (WITH GLOBAL HANDLER):
──────────────────────────────────
Request → Route Handler → Database → 💥 Exception
                              ↓
                      Route try/except catches it
                              ↓
                      Log error with stack trace
                              ↓
                    Return JSONResponse(500)
                              ↓
                Global exception handler catches it
                              ↓
              Add CORS headers to error response
                              ↓
              Return: {"error": "...", "detail": "..."}
                    + Access-Control-Allow-Origin header
                              ↓
Browser: "Error: database timeout" ✅ (real error)
```

---

## 3. Middleware Execution Order

```
MIDDLEWARE EXECUTION (Request → Response):

Request comes in:
    ↓
[LOGGING MIDDLEWARE] → Start timing
    ↓
[CORS MIDDLEWARE] → Check if origin allowed
    ↓
[ROUTE HANDLER] → Execute the endpoint
    ↓
RESPONSE GOES BACK:
    ↓
[CORS MIDDLEWARE] ← Add CORS headers (IMPORTANT!)
    ↓
[LOGGING MIDDLEWARE] ← Log response status
    ↓
Response sent to browser


KEY INSIGHT: Middleware added FIRST runs LAST on response
    app.add_middleware(CORSMiddleware)  ← Added first
    app.add_middleware(CustomMiddleware) ← Added second

    On response: CustomMiddleware runs first
                 CORSMiddleware runs second (adds headers)
```

---

## 4. Database Field Access Pattern

```
NEW FIELD ADDED:
────────────────
class User(Base):
    email: str          ← Exists on all users
    name: str           ← Exists on all users
    plan: str           ← NEW FIELD (only on new users)
    trial_end: DateTime ← NEW FIELD (only on new users)


OLD USER IN DATABASE:     NEW USER IN DATABASE:
┌────────────────────┐   ┌────────────────────┐
│ email              │   │ email              │
│ name               │   │ name               │
│ hashed_pw          │   │ hashed_pw          │
│ cv_path            │   │ cv_path            │
│ phone              │   │ phone              │
│ skills             │   │ skills             │
│ target_titles      │   │ target_titles      │
│ target_locations   │   │ target_locations   │
│ linkedin_email     │   │ linkedin_email     │
│ linkedin_password  │   │ linkedin_password  │
│                    │   │ plan               │ ← NEW
│                    │   │ trial_end          │ ← NEW
│                    │   │ payment_status     │ ← NEW
└────────────────────┘   └────────────────────┘


SAFE FIELD ACCESS:
──────────────────

❌ WRONG:  plan = user.plan
          (crashes on old user: AttributeError)

✅ CORRECT: plan = getattr(user, "plan", "free")
           Works on old user: returns "free"
           Works on new user: returns actual value


APPLIED EVERYWHERE:
───────────────────
plan = getattr(user, "plan", None) or "free"
payment_status = getattr(user, "payment_status", "free")
trial_end = getattr(user, "trial_end", None)
verified = bool(getattr(user, "verified", False))
```

---

## 5. Complete Response Flow Example

```
USER ACTION: Click "Save Profile"
┌────────────────────────────────────────────────────────────┐
│ FRONTEND                                                   │
│ ─────────────────────────────────────────────────────────  │
│ POST /api/profile/user@example.com                         │
│ {                                                           │
│   "name": "John Doe",                                      │
│   "skills": "Python,JavaScript"                            │
│ }                                                           │
│                                                            │
│ Origin: https://jobrocket.aiviora.online                   │
│ Authorization: Bearer eyJxxxxxxx                           │
└────────────────────────────────────────────────────────────┘

         ↓ OVER INTERNET ↓

┌────────────────────────────────────────────────────────────┐
│ BACKEND (main.py - Middleware Processing)                 │
│ ─────────────────────────────────────────────────────────  │
│                                                            │
│ STEP 1: LOGGING MIDDLEWARE (Start)                        │
│ ────────────────────────────────────                      │
│ logger.info("[POST] /api/profile/user@example.com |       │
│             Origin: https://jobrocket.aiviora.online")    │
│                                                            │
│ STEP 2: CORS MIDDLEWARE (Check)                          │
│ ─────────────────────────────                            │
│ origin = "https://jobrocket.aiviora.online"              │
│ if origin in ALLOWED_ORIGINS:  ✓ YES                     │
│   will_add_cors_headers = True                            │
│                                                            │
│ STEP 3: ROUTE HANDLER (Process)                          │
│ ────────────────────────                                │
│ @router.patch("/{email}")                                │
│ def update_profile(email: str, body: UpdateIn):          │
│     try:                                                  │
│         with SessionLocal() as db:                       │
│             user = db.get(User, email)                  │
│             if not user:                                │
│                 raise HTTPException(404, "Not found")   │
│                                                          │
│             # Safe field access (supports old users)     │
│             current_plan = getattr(user, "plan", "f...")│
│                                                          │
│             # Update fields                             │
│             user.name = body.name                      │
│             user.skills = body.skills                 │
│             db.commit()                                │
│                                                          │
│             logger.info(f"✅ Profile updated")          │
│             return _fmt(user)  # Return 200 with data   │
│                                                          │
│     except HTTPException:                               │
│         raise  # Let FastAPI handle                     │
│                                                          │
│     except Exception as e:                             │
│         logger.error(f"Error: {e}", exc_info=True)    │
│         return JSONResponse(                           │
│             status_code=500,                           │
│             content={"error": str(e)}                 │
│         )                                              │
│                                                          │
│ STEP 4: CORS MIDDLEWARE (Add Headers)                  │
│ ─────────────────────────────────────                  │
│ response = Response(data)                              │
│ response.headers["Access-Control-Allow-Origin"] = ...  │
│ return response                                        │
│                                                          │
│ STEP 5: LOGGING MIDDLEWARE (End)                       │
│ ─────────────────────────────────                      │
│ logger.info("[PATCH] /api/profile/user@example.com |   │
│             Status: 200 | Duration: 145.32ms")        │
│                                                        │
└────────────────────────────────────────────────────────────┘

         ↓ OVER INTERNET ↓

┌────────────────────────────────────────────────────────────┐
│ BROWSER RECEIVES RESPONSE                                  │
│ ─────────────────────────────────────────────────────────  │
│                                                            │
│ HTTP Status: 200 OK                                       │
│ Headers:                                                  │
│   Access-Control-Allow-Origin: https://jobrocket.a...    │
│   Access-Control-Allow-Credentials: true                │
│   Content-Type: application/json                        │
│                                                            │
│ Body:                                                     │
│ {                                                        │
│   "email": "user@example.com",                          │
│   "name": "John Doe",                                  │
│   "skills": ["Python", "JavaScript"],                 │
│   "plan": "premium",                                  │
│   "trial_end": "2025-04-15T12:00:00",               │
│   ... (all 8 platforms and credentials)               │
│ }                                                        │
│                                                            │
│ BROWSER CHECK:                                          │
│   1. ✓ Has Access-Control-Allow-Origin header         │
│   2. ✓ Matches request origin                         │
│   3. ✓ JavaScript can access response                │
│                                                            │
└────────────────────────────────────────────────────────────┘

         ↓ JavaScript receives data ↓

┌────────────────────────────────────────────────────────────┐
│ FRONTEND                                                   │
│ ─────────────────────────────────────────────────────────  │
│ JavaScript executes:                                       │
│ const response = await fetch(...)                         │
│ const data = await response.json()                        │
│ console.log(data)  // Works! Data received               │
│                                                            │
│ Page updates with new profile data                        │
│ User sees success message                               │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 6. Error Path Example

```
USER ACTION: Request with invalid email
┌────────────────────────────────────────────────────────────┐
│ FRONTEND                                                   │
│ fetch('/api/profile/invalid')  (no email symbol)          │
└────────────────────────────────────────────────────────────┘

         ↓ OVER INTERNET ↓

┌────────────────────────────────────────────────────────────┐
│ BACKEND                                                    │
│                                                            │
│ STEP 1: LOGGING MIDDLEWARE                               │
│ logger.info("[GET] /api/profile/invalid |                │
│             Origin: https://jobrocket...")               │
│                                                            │
│ STEP 2: CORS MIDDLEWARE ✓                               │
│ (headers will be added to response)                      │
│                                                            │
│ STEP 3: ROUTE HANDLER                                   │
│ @router.get("/{email}")                                 │
│ def get_profile(email: str = "invalid")                │
│     try:                                                │
│         with SessionLocal() as db:                      │
│             user = db.get(User, "invalid")             │
│             if not user:  ← TRUE!                       │
│                 raise HTTPException(404, "Not found")   │
│                                                         │
│     except HTTPException:  ← Caught!                    │
│         raise  # Re-raise (FastAPI handles)            │
│                                                         │
│ STEP 4: Global HTTPException Handler                   │
│ @app.exception_handler(HTTPException)                  │
│ async def http_exception_handler(request, exc):       │
│     origin = "https://jobrocket..."                   │
│     return JSONResponse(                              │
│         status_code=exc.status_code,  # 404           │
│         content={"error": "User not found"},          │
│         headers={                                      │
│             "Access-Control-Allow-Origin": origin,    │
│             "Access-Control-Allow-Credentials": "t"   │
│         }                                              │
│     )                                                 │
│                                                         │
│ STEP 5: CORS MIDDLEWARE                               │
│ (headers already added, just passes through)          │
│                                                         │
│ STEP 6: LOGGING MIDDLEWARE                            │
│ logger.info("[GET] /api/profile/invalid |             │
│             Status: 404 | Duration: 23.45ms")        │
│                                                         │
└────────────────────────────────────────────────────────────┘

         ↓ OVER INTERNET ↓

┌────────────────────────────────────────────────────────────┐
│ BROWSER                                                    │
│                                                            │
│ HTTP Status: 404 Not Found  ← Real status                │
│ Headers:                                                  │
│   Access-Control-Allow-Origin: https://jobrocket...      │
│   Content-Type: application/json                        │
│                                                            │
│ Body:                                                     │
│ {                                                        │
│   "error": "User not found"                            │
│ }                                                        │
│                                                            │
│ BROWSER CHECK:                                          │
│   1. ✓ Has CORS headers (not CORS error!)             │
│   2. ✓ Status 404 (not 500 or HTML page)             │
│   3. ✓ Body is JSON (not HTML)                        │
│   4. ✓ JavaScript can read error message              │
│                                                            │
└────────────────────────────────────────────────────────────┘

         ↓ JavaScript receives error ↓

┌────────────────────────────────────────────────────────────┐
│ FRONTEND                                                   │
│                                                            │
│ const response = await fetch(...)                         │
│ if (!response.ok) {                                      │
│   const error = await response.json()                   │
│   console.error(error.error)  // "User not found"      │
│   // User sees: "User not found" (real error)          │
│ }                                                         │
│                                                            │
│ NOT "CORS error" (misleading)  ✓                       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 7. Supported Origins & Regex Pattern

```
ALLOWED ORIGINS (Explicit Whitelist):
─────────────────────────────────────

Production:
  ✓ https://jobrocket.aiviora.online
  ✓ https://www.jobrocket.aiviora.online
  ✓ https://bot-automation-job.vercel.app

Development:
  ✓ http://localhost:3000
  ✓ http://localhost:3001
  ✓ http://127.0.0.1:3000
  ✓ http://127.0.0.1:3001


REGEX PATTERN (Automatic):
──────────────────────────

allow_origin_regex=r"https://.*\.vercel\.app"

Matches:
  ✓ https://pr-123-myproject.vercel.app
  ✓ https://pr-456-myproject.vercel.app
  ✓ https://main-myproject.vercel.app
  ✓ (any *.vercel.app preview deployment)

Doesn't match:
  ✗ http://vercel.app  (no subdomain)
  ✗ https://example.vercel.app.attacker.com  (wrong format)
  ✗ https://vercel-app.com  (not .vercel.app)
```

---

## 8. Status Code Reference

```
2xx - Success:
─────────────
200 OK              ← Data fetched/updated successfully
201 Created         ← New resource created
204 No Content      ← Success but no body

4xx - Client Error:
───────────────────
400 Bad Request     ← Invalid input (malformed JSON, validation failed)
401 Unauthorized    ← Missing/invalid authentication
403 Forbidden       ← User doesn't have permission
404 Not Found       ← Resource doesn't exist
409 Conflict        ← Email already registered, duplicate entry

5xx - Server Error:
───────────────────
500 Internal Error  ← Unexpected exception (database crash, timeout)
502 Bad Gateway     ← Backend not responding (Render down)
503 Unavailable     ← Service temporarily down (maintenance)
504 Timeout         ← Request took too long (slow database)
```

---

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     INTERNET                              │
│                                                          │
│  Browser at: https://jobrocket.aiviora.online           │
│  (Vercel CDN - Global edge locations)                   │
│      ↕ (HTTP/HTTPS requests)                            │
│      │                                                   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ VERCEL                                                   │
│ (Frontend Hosting)                                      │
│                                                         │
│ App (Next.js + TypeScript + React)                      │
│ - Billing page                                          │
│ - Profile page                                          │
│ - Login page                                            │
│ - Dashboard                                             │
│                                                         │
│ On user action: fetch() call to backend                │
└──────────────────────────────────────────────────────────┘
           ↕
        HTTPS
           ↕
┌──────────────────────────────────────────────────────────┐
│ RENDER                                                   │
│ (Backend Hosting)                                       │
│                                                         │
│ FastAPI Application                                     │
│ - main.py (CORS + error handling)                      │
│ - routers/ (auth, bot, profile, billing, jobs)        │
│ - database.py (SQLAlchemy ORM)                         │
│ - utils/ (CV parser, helpers)                          │
│                                                         │
│ Environment Variables:                                 │
│ - DATABASE_URL (PostgreSQL in production)              │
│ - PADDLE_WEBHOOK_SECRET (live payment key)            │
│ - DEBUG_MODE (disabled in production)                 │
└──────────────────────────────────────────────────────────┘
           ↕
        HTTPS
           ↕
┌──────────────────────────────────────────────────────────┐
│ DATABASE                                                 │
│ (PostgreSQL - Render)                                   │
│                                                         │
│ Tables:                                                 │
│ - users (email, name, plan, trial_*, payment_*)       │
│ - ...other tables...                                  │
│                                                         │
│ Backups: Automated daily                              │
└──────────────────────────────────────────────────────────┘


PAYMENT FLOW:
─────────────
Frontend → [Billing Page] →  Paddle Overlay
                                  ↓
                           User enters card details
                                  ↓
                        Paddle processes payment
                                  ↓
                     Paddle sends webhook to Backend
                                  ↓
                  Backend updates user.plan = "premium"
                                  ↓
                      Backend redirects to Dashboard
                                  ↓
                      User sees premium features
```

---

This visual guide shows how all components work together in production!
