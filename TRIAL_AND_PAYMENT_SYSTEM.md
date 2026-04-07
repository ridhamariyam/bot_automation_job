# 7-Day Trial & Payment System Implementation

## Overview
New users automatically get a **7-day free premium trial** with all features unlocked. After the trial expires, they can either upgrade to a paid plan or downgrade to the free tier.

---

## ✅ What's Been Implemented

### 1. **Database Changes**
- Added trial fields to User model:
  - `trial_start`: When trial began
  - `trial_end`: When trial expires
  - `trial_used`: Whether trial was used (0 or 1)
  - `payment_status`: "trial", "active", "expired", or "free"
  - `last_payment_id`: Latest payment transaction ID

### 2. **Auto-Trial on Registration**
- **File**: [backend/routers/auth.py](backend/routers/auth.py)
- Every new user gets 7-day premium trial automatically
- Trial starts at registration and expires 7 days later
- User is set to `plan="premium"` during trial with `payment_status="trial"`
- Registration response includes trial information

### 3. **Trial Validation on Bot Start**
- **File**: [backend/routers/bot.py](backend/routers/bot.py)
- `_get_user_access_info()` function checks:
  - If trial is active → Grant premium access with countdown
  - If trial expired → Auto-downgrade to free plan with `payment_status="expired"`
  - If paid subscription → Grant access based on plan
  - If free → Allow limited access
- Prevents bot start if trial expired and no payment

### 4. **Platform Connectivity & All 8 Platforms**
- **File**: [backend/routers/bot.py](backend/routers/bot.py)
- Premium users (trial or paid) get access to all 8 platforms:
  - LinkedIn, Indeed, Glassdoor, Monster, Bayt, Naukri, TimesJobs, Direct
- Pro users get 3 platforms: LinkedIn, Indeed, Glassdoor
- Free users get 1 platform: LinkedIn only
- New endpoints to manage platforms:
  - `GET /api/bot/platforms/{email}` - Get connected platforms
  - `POST /api/bot/platforms/{email}/update-credentials` - Save platform credentials
  - Platform verification via Playwright headless browser check

### 5. **Job Fetching & Tracking**
- **File**: [backend/routers/jobs.py](backend/routers/jobs.py)
- Track all job applications with details:
  - Job title, company, location, platform
  - Application status (Applied, Viewed, Interview, Rejected)
  - Timestamps and proof
- Endpoints:
  - `GET /api/jobs/{user_email}` - List all applications
  - `POST /api/jobs` - Add new job application
  - `PATCH /api/jobs/{job_id}/status` - Update status
  - `GET /api/jobs/stats/{user_email}` - Get statistics

### 6. **Billing & Payment System**
- **File**: [backend/routers/billing.py](backend/routers/billing.py)
- Paddle v3 API integration for secure payments
- Payment verification via webhook signature validation
- Endpoints:
  - `GET /api/billing/plans` - List all available plans
  - `GET /api/billing/plan/{email}` - Get user's current plan
  - `GET /api/billing/trial-status/{email}` - Get detailed trial info
  - `POST /api/billing/checkout` - Create Paddle checkout link
  - `POST /api/billing/webhook/paddle` - Handle payment webhooks
  - `GET /api/billing/payment-status/{email}` - Get payment history

### 7. **Policy: No Refunds, No Credit Back**
- **NO REFUNDS** for any subscription payments
- **NO CREDITS** given when downgrading plan
- Trial expiration automatically downgrades to free
- Clear messaging in:
  - [Billing page FAQ](frontend/app/billing/page.tsx)
  - Payment confirmation dialog
  - Footer warning banner

### 8. **Frontend Updates**
- **File**: [frontend/app/billing/page.tsx](frontend/app/billing/page.tsx)

**Trial Banner** (shows when trial is active):
- Displays days remaining
- Shows all unlocked features
- Warning if trial ending in 3 days or less

**Upgrade Required Banner** (shows when trial expired):
- Informs user to upgrade
- Guides to payment page

**Updated FAQ with**:
- Trial explanation
- What happens when trial ends
- No-refund policy clearly stated
- No-credit policy on downgrades

**Enhanced Settings Page** (partial):
- Platform connectivity management
- Platform verification via browser check
- Credential secure storage

---

## 🔄 User Flow

### **Day 1-7: Premium Trial**
1. User registers → Auto-enrolled in 7-day premium trial
2. Dashboard shows trial banner: "7 days remaining"
3. All 8 platforms available for connection
4. Unlimited apps/day during trial
5. Can run bot immediately after connecting platforms

### **Day 7+: Trial Expiration**
1. Billing page shows "Trial Expired - Upgrade to Continue"
2. If user tries to start bot → Automatic downgrade to FREE plan
3. Free plan: 5 apps/day, LinkedIn only
4. User can upgrade to Pro (₹499/month) or Premium (₹2999/month)

### **After Payment**
1. Paddle webhook confirms payment
2. User's `payment_status` changes to "active"
3. Trial dates cleared (no longer applies)
4. Plan upgraded to purchased tier
5. Bot can run with new limits

---

## 💳 Pricing Structure

| Plan | Price | Apps/Day | Platforms | Automation |
|------|-------|----------|-----------|-----------|
| **Free** | ₹0 | 5 | LinkedIn (1) | Basic |
| **Pro** | ₹499/month | 50 | LinkedIn + Indeed + Glassdoor (3) | Limited |
| **Premium** | ₹2999/month | 1000+ | All 8 platforms | Full |
| **Trial** | Free | 1000+ | All 8 platforms | Full (7 days) |

---

## ⚙️ Environment Variables Required

```bash
# Paddle Payment Gateway
PADDLE_API_KEY=your_paddle_api_key
PADDLE_WEBHOOK_SECRET=your_paddle_webhook_secret
PADDLE_SANDBOX=true  # Set to false for live payments
PADDLE_PRICE_PRO=pri_xxxxx    # Paddle price ID for Pro
PADDLE_PRICE_PREMIUM=pri_xxxxx # Paddle price ID for Premium

# Frontend URL (for redirect after payment)
FRONTEND_URL=https://yourdomain.com
```

---

## 🧪 Testing the System

### Test 1: Register New User
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass123",
    "name": "Test User"
  }'
```
✅ Response includes trial info with 7 days remaining

### Test 2: Check Trial Status
```bash
curl http://localhost:8000/api/billing/trial-status/test@example.com
```
✅ Returns trial active status and days remaining

### Test 3: Start Bot During Trial
```bash
curl -X POST http://localhost:8000/api/bot/start \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "token": "user_token",
    "max_jobs": 50
  }'
```
✅ Bot starts with premium access (if platforms verified)

### Test 4: Get Connected Platforms
```bash
curl http://localhost:8000/api/bot/platforms/test@example.com
```
✅ Shows available/connected/verified platforms

### Test 5: Verify Platform
```bash
curl -X POST http://localhost:8000/api/bot/verify \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "linkedin",
    "email": "linkedin@example.com",
    "password": "linkedinpass123"
  }'
```
✅ Playwright headless browser verifies account

---

## 📋 Database Schema Updates

```sql
-- User table additions:
ALTER TABLE users ADD COLUMN trial_start DATETIME;
ALTER TABLE users ADD COLUMN trial_end DATETIME;
ALTER TABLE users ADD COLUMN trial_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN payment_status VARCHAR DEFAULT 'trial';
ALTER TABLE users ADD COLUMN last_payment_id VARCHAR;

-- For all platform fields, verified columns already exist:
-- linkedin_verified, indeed_verified, glassdoor_verified, etc.
```

---

## 🔐 Security Features

1. **Middleware CORS** - Only whitelisted origins can call API
2. **JWT Tokens** - User authentication via tokens
3. **Paddle Webhook Verification** - HMAC SHA256 signature validation
4. **Password Hashing** - bcrypt for secure password storage
5. **Platform Credentials Encrypted** (should be added in production)
6. **Headless Browser Checks** - Anti-automation validation

---

## ⚠️ Known Limitations & TODO

1. **Encryption**: Platform passwords stored in plain text (add encryption layer)
2. **Payment Cancellation**: No endpoint to cancel subscription yet
3. **Plan Switching**: Pro to Premium upgrade doesn't pause/resume billing
4. **Refund Processing**: Manual refunds needed (per policy)
5. **Credit System**: No in-app credit system (won't add due to no-credit policy)
6. **Analytics**: Advanced analytics only available with Premium (not fully implemented)

---

## 📞 Support & Next Steps

1. **Payment Testing**: Get Paddle sandbox credentials and test checkout flow
2. **Webhook**: Configure Paddle webhook URL: `https://yourdomain.com/api/billing/webhook/paddle`
3. **Frontend Deployment**: Deploy billing page with live payment links
4. **Database Migration**: Run schema updates on production database
5. **Email Notifications**: Add payment receipt & trial expiration emails

---

## 📚 Related Files

- User Database: [backend/database.py](backend/database.py)
- Auth System: [backend/routers/auth.py](backend/routers/auth.py)
- Bot Control: [backend/routers/bot.py](backend/routers/bot.py)
- Billing: [backend/routers/billing.py](backend/routers/billing.py)
- Jobs Tracking: [backend/routers/jobs.py](backend/routers/jobs.py)
- Billing UI: [frontend/app/billing/page.tsx](frontend/app/billing/page.tsx)
- Settings UI: [frontend/app/settings/page.tsx](frontend/app/settings/page.tsx)

---

**Last Updated**: April 8, 2026
**Status**: ✅ Ready for Testing
