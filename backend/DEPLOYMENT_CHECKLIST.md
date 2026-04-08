# Production Deployment Checklist

**For:** BatchJobRocket Backend (Render) + Frontend (Vercel)  
**Environment:** Production (Live Payment, Real Users)  
**Date:** 2025

---

## Pre-Deployment Verification

### ✅ Backend Code Review

- [ ] **main.py**
  - [ ] CORSMiddleware added FIRST (before other middleware)
  - [ ] Global exception handler defined (@app.exception_handler(Exception))
  - [ ] Global HTTPException handler defined
  - [ ] Startup event logs CORS configuration
  - [ ] Debug middleware logs request method/path/origin/status
  - [ ] All routers included with correct prefixes
  - [ ] Health check endpoint working (/health)
  - [ ] Database check endpoint working (/db-check)

- [ ] **All Router Files** (auth.py, bot.py, billing.py, jobs.py, profile.py)
  - [ ] All endpoints wrapped in try/except
  - [ ] HTTPExceptions re-raised with `raise`
  - [ ] Other exceptions logged with `exc_info=True`
  - [ ] JSONResponse returned on errors (not raw dicts)
  - [ ] All optional DB fields use `getattr(obj, "field", default)`
  - [ ] Input validated with Pydantic models (POST/PATCH)
  - [ ] Logging statements present (info/warning/error)
  - [ ] Database operations inside `with SessionLocal() as db:`

- [ ] **database.py**
  - [ ] Session factory configured correctly
  - [ ] Engine connection string uses DATABASE_URL env var
  - [ ] All required columns present on User table
  - [ ] Trial columns exist (trial_start, trial_end, trial_used)
  - [ ] Payment columns exist (payment_status, last_payment_id)
  - [ ] All platform columns exist (linkedin_*, indeed_*, etc.)

### ✅ Frontend Code Review

- [ ] **app/billing/page.tsx**
  - [ ] Paddle SDK loads from CDN (https://cdn.paddle.com/paddle/v2/paddle.js)
  - [ ] Client token is live (production), NOT sandbox
  - [ ] Price IDs are live production IDs
  - [ ] Success URL redirects to /dashboard
  - [ ] Trial banner displays when trial is active
  - [ ] Upgrade required banner displays when trial expired

- [ ] **API Calls**
  - [ ] All API calls use full URL: `https://jobrocket-backend-9uxh.onrender.com`
  - [ ] No localhost references in production code
  - [ ] Authorization header includes Bearer token
  - [ ] Content-Type set to application/json

### ✅ Environment Configuration

#### Render Backend Variables

```
DATABASE_URL=postgresql://user:pass@host/db
DEBUG_MODE=false  # Only "true" enables debug endpoints
EXTRA_CORS_ORIGINS=  # Leave empty unless additional origins needed

# Paddle Payment (Live Credentials)
PADDLE_WEBHOOK_SECRET=pdl_wh_xxxxx
# Note: Client token in frontend, NOT in backend
```

#### Vercel Frontend Variables

```
NEXT_PUBLIC_API_URL=https://jobrocket-backend-9uxh.onrender.com
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=live_15d057265d1b7dc9d9335c7eb3a
NEXT_PUBLIC_PADDLE_PRICE_PRO=pri_01knn4f6079a1nvpzzmf0g686m
NEXT_PUBLIC_PADDLE_PRICE_PREMIUM=pri_01knn4g3kd8nzzqz6f66vvahtc
```

### ✅ CORS Configuration

```python
# In main.py, verify:
ALLOWED_ORIGINS = [
    "https://bot-automation-job.vercel.app",
    "https://jobrocket.aiviora.online",
    "https://www.jobrocket.aiviora.online",
]

allow_origin_regex=r"https://.*\.vercel\.app"  # Covers all preview deployments
```

---

## Deployment Steps

### Step 1: Commit All Changes

```bash
cd /home/ridha/freelance/auto_application_bot

git add -A
git commit -m "Production-safe CORS, global error handling, safe DB access

- Updated main.py: CORSMiddleware (first), global exception handlers, structured logging
- Updated profile.py: try/except error handling, _fmt() with getattr()
- Added ERROR_HANDLING_GUIDE.md: comprehensive error handling patterns
- Added EXAMPLE_ROUTER_IMPLEMENTATION.md: template for other routers
- All optional DB fields use getattr() for legacy user compatibility
- All routes return JSONResponse with proper status codes on errors
- All exceptions logged with exc_info=True for debugging"

git push origin main
```

### Step 2: Backend Redeploy (Render)

1. Go to https://dashboard.render.com
2. Select **JobRocket Backend** service
3. Click **Redeploy** (or wait for auto-deploy from git push)
4. Monitor deploy logs for errors
5. Verify service is active (green status)

### Step 3: Verify Backend Health

```bash
# Test 1: Health check
curl https://jobrocket-backend-9uxh.onrender.com/health

# Expected: {"status": "ok", "service": "JobRocket API", ...}

# Test 2: CORS preflight
curl -X OPTIONS https://jobrocket-backend-9uxh.onrender.com/api/profile \
  -H "Origin: https://jobrocket.aiviora.online" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Expected: See "Access-Control-Allow-Origin: https://jobrocket.aiviora.online"

# Test 3: Database check
curl https://jobrocket-backend-9uxh.onrender.com/db-check

# Expected: {"status": "ok", "database": "connected", "tables": [...]}
```

### Step 4: Verify Frontend Can Call API

1. Deploy frontend to Vercel (or use existing deployment)
2. Go to https://bot-automation-job.vercel.app (or production domain)
3. Open browser DevTools (F12) → Network tab
4. Go to **Settings** page
5. Try to edit profile → save
6. Check Network requests:
   - [ ] Request goes to https://jobrocket-backend-9uxh.onrender.com (no CORS error)
   - [ ] Response status is 200 (not 500 hidden as CORS error)
   - [ ] Response has Access-Control-Allow-Origin header

### Step 5: Test Error Handling

1. Go to frontend login page
2. Try to login with invalid email (e.g., `invalid@example.com`)
3. Check Network tab:
   - [ ] Request completes (no hanging)
   - [ ] Response status is 404 or 400 (not 500)
   - [ ] Response is JSON (not HTML error page)
   - [ ] Response has CORS headers

---

## Monitoring & Debugging

### Check Backend Logs (Render)

1. Go to https://dashboard.render.com → JobRocket Backend
2. Click **Logs**
3. Look for entries like:
   - `✅ JobRocket API Starting` (startup OK)
   - `✅ CORS Enabled for: X origins` (CORS loaded)
   - `→ [GET] /api/profile/user@example.com | Origin: ...` (incoming request)
   - `← [GET] /api/profile/user@example.com | Status: 200 | Duration: ...` (success)
   - `✗ [GET] /api/profile/user@example.com | Exception: AttributeError | ...` (error)

### Common Issues & Solutions

| Issue | Root Cause | Solution |
|-------|-----------|----------|
| Browser shows "CORS error" | Global exception handler missing | Verify `@app.exception_handler(Exception)` in main.py |
| Backend logs show ValueError on DB | Missing DATABASE_URL env var | Set in Render dashboard |
| Legacy user gets 500 on /api/profile | Direct field access (user.field) | Use `getattr(user, "field", default)` |
| Preflight requests return 404 | Missing explicit OPTIONS handler | Add `@app.options("/{full_path:path}")` |
| Trial/payment fields are None for new users | Fields not created on registration | Check auth.py register route sets all fields |
| Large response is truncated | Default response size limit | Check Render plan limits |

### Real-Time Debugging

```bash
# Monitor logs in real-time (Render)
# Go to Dashboard → Logs → Tail

# Or check specific user operations
curl -X GET "https://jobrocket-backend-9uxh.onrender.com/api/profile/user%40example.com" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Origin: https://jobrocket.aiviora.online"

# Should see in logs:
# → [GET] /api/profile/user@example.com | Origin: https://jobrocket.aiviora.online
# ← [GET] /api/profile/user@example.com | Status: 200 | Duration: X.XXms
```

---

## Post-Deployment Validation

### ✅ Day 1: Basic Operations

- [ ] User can register (new users auto-enrolled in trial)
- [ ] User can login (JWT token works)
- [ ] User can view profile (all 8 platform fields returned)
- [ ] User can update profile (CV upload works)
- [ ] Trial countdown displays on billing page
- [ ] "Upgrade" button works on billing page

### ✅ Day 2: Payment Flow

- [ ] Click "Upgrade" → Paddle overlay loads
- [ ] Enter test payment details → Payment processes
- [ ] User plan changes to "premium" (check /api/billing/plan/{email})
- [ ] Trial fields cleared after payment
- [ ] Receive email confirmation (if SMTP configured)

### ✅ Day 3: Error Scenarios

- [ ] Request to non-existent user → 404 (not 500)
- [ ] Invalid email format → 400 (not 500)
- [ ] Database disconnects temporarily → 500 with JSON (not HTML)
- [ ] CORS error on request → Headers present (not misleading)

### ✅ Day 4: Scale Testing

- [ ] Backend handles concurrent requests (5+ simultaneous)
- [ ] Response times remain <500ms (check logs)
- [ ] No database connection pool exhaustion
- [ ] Memory/CPU usage stable (check Render dashboard)

---

## Rollback Plan

If critical issues found:

### Quick Rollback (Git)

```bash
# Find the last known good commit
git log --oneline | head -20

# Revert to last good version
git revert HEAD
git push

# Render auto-deploys from git push
```

### Manual Rollback (Render Dashboard)

1. Go to https://dashboard.render.com → JobRocket Backend
2. Click **Manual Deploy**
3. Select previous version from Available Deployments
4. Click **Deploy**

---

## Performance Optimization

### Response Times (Target < 300ms)

```bash
# Check actual response times in logs
# Example from structured logging:
# ← [GET] /api/profile/user@example.com | Status: 200 | Duration: 145.32ms ✅

# If > 300ms consistently, investigate:
curl -X GET "https://jobrocket-backend-9uxh.onrender.com/db-check"
# Check database response time
```

### Database Query Optimization

```python
# Slow: N+1 query problem
for user_email in user_emails:
    with SessionLocal() as db:  # New connection each loop
        user = db.get(User, user_email)

# Fast: Single batch query
with SessionLocal() as db:
    users = db.query(User).filter(User.email.in_(user_emails)).all()
```

### CORS Cache

```python
# Preflight responses cached for 1 hour
max_age=3600  # in main.py CORSMiddleware

# Browser won't send preflight again for 1 hour
# Reduces requests by ~50% for SPAs
```

---

## Security Checklist

- [ ] DEBUG_MODE=false on Render (disables /debug-register)
- [ ] PADDLE_WEBHOOK_SECRET configured (live secret key)
- [ ] Password hashing with bcrypt (min cost=12)
- [ ] JWT tokens with expiry (check auth.py)
- [ ] HTTPS enforced (all ALLOWED_ORIGINS are https://)
- [ ] No credentials in git (use .gitignore)
- [ ] No database passwords logged (check main.py logging)
- [ ] CORS only allows specific origins (not "*")

---

## Continuous Monitoring (Post-Launch)

### Daily Checks

```bash
# 1. Service is up
curl https://jobrocket-backend-9uxh.onrender.com/health

# 2. Database connected
curl https://jobrocket-backend-9uxh.onrender.com/db-check

# 3. No excessive errors in logs
# Go to Render Dashboard → Logs → Search for "error"
```

### Weekly Review

- [ ] Check Render logs for errors/warnings
- [ ] Review response time trends
- [ ] Check if any deprecated API calls still in use
- [ ] Review failed requests (4xx, 5xx)
- [ ] Collect user feedback on errors

### Monthly Review

- [ ] Database size growth (any leaks?)
- [ ] User growth and resource usage
- [ ] Third-party API status (Paddle, SMTP)
- [ ] Plan scaling needs (more users = more DB capacity)

---

## Document References

- **ERROR_HANDLING_GUIDE.md** - Comprehensive error patterns & CORS explanation
- **EXAMPLE_ROUTER_IMPLEMENTATION.md** - Template examples for all routers
- **main.py** - Production CORS + error handling implementation
- **routers/profile.py** - Example router with safe DB access pattern

---

## Sign-Off

**Deployment Date:** ___________

**Deployed By:** ___________

**Verified Working:** ✅

**Known Issues:** None

**Next Steps:**
1. Monitor logs for 24 hours
2. Collect user feedback
3. Plan database migration for legacy users (optional but recommended)

