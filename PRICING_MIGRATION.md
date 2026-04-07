# Pricing Model Migration — One-Time to Monthly Subscriptions

## Changes Made

### ✅ Backend (database.py)
- Updated `PLAN_FEATURES` with new monthly pricing:
  - **Free**: ₹0/month, 5 apps/day, LinkedIn only (permanent free tier)
  - **Pro**: ₹499/month, 50 apps/day, LinkedIn + Indeed + Glassdoor
  - **Premium**: ₹899/month, 1000+ apps/day, All 8 platforms, full automation

### ✅ Frontend
- **Billing Page** (`app/billing/page.tsx`):
  - Updated plans with new prices: ₹499/month (Pro), ₹899/month (Premium)
  - Updated feature descriptions to reflect automation levels
  - Updated pricing display: shows "/month" instead of "one-time"
  - Updated FAQ to explain monthly subscriptions, cancellation, prorated credits

- **Settings Page** (`app/settings/page.tsx`):
  - Already displays current plan and available platforms
  - No changes needed

- **Dashboard** (`app/dashboard/page.tsx`):
  - Already shows plan info and daily limits
  - No changes needed

## ⏳ Backend Updates Still Needed

### Paddle Subscription Setup (Priority)

#### 1. Create Monthly Subscription Products in Paddle
- Go to [Paddle Sandbox Dashboard](https://sandbox.paddle.com)
- Create 2 new subscription products:
  - **Pro Plan**: ₹499/month
  - **Premium Plan**: ₹899/month
- Note the new `price_id` for each subscription
- Update `.env` with:
  ```
  PADDLE_PRICE_PRO_MONTHLY=pri_xxx  # New subscription price ID
  PADDLE_PRICE_PREMIUM_MONTHLY=pri_yyy  # New subscription price ID
  ```

#### 2. Update Billing Router (`routers/billing.py`)
- Separate one-time price IDs from monthly subscription IDs:
  ```python
  # Keep existing one-time prices for backwards compatibility
  PADDLE_PRICE_MAP_ONETIME = {...}
  
  # Add new monthly subscription prices
  PADDLE_PRICE_MAP_MONTHLY = {
      "pro": PADDLE_PRICE_PRO_MONTHLY,
      "premium": PADDLE_PRICE_PREMIUM_MONTHLY,
  }
  ```

#### 3. Update `/api/billing/checkout` Endpoint
- Check the `plan` type from `PLAN_FEATURES`
- If `type == "monthly"`, create a **subscription checkout** instead of one-time
- Paddle v3 subscription checkout example:
  ```python
  async def create_checkout(body: PaymentCheckoutIn):
      plan_config = PLAN_FEATURES[body.plan]
      
      if plan_config["type"] == "monthly":
          # Create subscription checkout
          payload = {
              "items": [{
                  "price_id": PADDLE_PRICE_MAP_MONTHLY[body.plan],
                  "quantity": 1
              }],
              "customer_email": body.email,
              "custom_data": {
                  "user_email": body.email,
                  "plan": body.plan,
              },
              "return_url": f"{FRONTEND_URL}/billing?status=success&plan={body.plan}"
          }
      else:
          # Create one-time transaction (existing code)
          ...
  ```

#### 4. Update Webhook Handler for Subscriptions
- Add handling for new Paddle subscription events:
  - `subscription.created` — User purchased subscription
  - `subscription.updated` — Plan/price changed
  - `subscription.paused` — User paused subscription
  - `subscription.canceled` — User canceled subscription (downgrade to Free)
  - `subscription.activated` — Subscription reactivated

Example webhook update:
```python
@router.post("/webhook/paddle")
async def handle_paddle_webhook(request: Request):
    # ... existing signature verification ...
    
    event_type = data.get("event_type")
    
    if event_type == "subscription.created":
        subscription = data["data"]["subscription"]
        user_email = subscription.get("custom_data", {}).get("user_email")
        plan = subscription.get("custom_data", {}).get("plan")
        # Update user.plan and create Payment record
        
    elif event_type == "subscription.canceled":
        subscription = data["data"]["subscription"]
        user_email = subscription.get("custom_data", {}).get("user_email")
        # Downgrade user to "free" plan
```

#### 5. Add Subscription Management Endpoints
- `GET /api/billing/subscription/{email}` — Get active subscription details
- `POST /api/billing/cancel/{email}` — Cancel user's subscription (downgrade to free)
- `POST /api/billing/update-plan/{email}` — Change subscription plan

#### 6. Update Frontend to Handle Subscription Cancellation
- Add "Cancel Subscription" button in settings for paid users
- Add "Manage Subscription" link to Paddle subscription portal
- Show subscription status (Active/Paused/Canceled)

## Database Schema Changes

### User Model (Already Updated)
- `plan` column: Stores current plan ("free", "pro", "premium")
- All platform credentials: `{platform}_email`, `{platform}_password`, `{platform}_verified`

### Payment Model (May Need Updates)
- Currently tracks one-time transactions
- Consider adding `subscription_id` field to link recurring payments
- Add `status` field for subscription lifecycle tracking

## Testing Checklist

- [ ] Create Paddle sandbox subscriptions for Pro and Premium plans
- [ ] Test upgrade flow: Free → Pro
- [ ] Test plan change: Pro → Premium (with prorated charges)
- [ ] Test cancellation: Pro → Free
- [ ] Test webhook signature verification for subscription events
- [ ] Test daily application limits per plan
- [ ] Test overaging limits (429 error when daily limit exceeded)
- [ ] Verify user sees correct available platforms after upgrade

## Deployment Checklist

1. Update `.env` with new Paddle subscription price IDs
2. Update `routers/billing.py` with subscription-specific endpoints
3. Update `database.py` with new PLAN_FEATURES (✅ Done)
4. Test all checkout and webhook flows in sandbox
5. Deploy frontend changes (✅ Done)
6. Deploy backend changes
7. Update FAQ documentation with monthly billing details
8. Send email to existing Pro/Premium users explaining transition (if upgrading from one-time)

## Notes

- **Grandfathering**: Consider allowing existing one-time payment users to keep their plan without monthly charges
- **Free Plan**: Remains unlimited/permanent, no expiration
- **Refund Policy**: 7-day money-back guarantee for new monthly subscriptions (as per updated FAQ)
- **Cancellation**: Users can cancel anytime from account settings, downgrading to Free tier
- **Support**: Consider implementing chat/email support for billing questions given monthly recurring nature
