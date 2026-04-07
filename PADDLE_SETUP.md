# Paddle Payment Integration Setup

This guide explains how to set up Paddle payment processing for your JobRocket application.

## 1. Paddle Account Setup

1. **Create a Paddle Account**
   - Go to https://paddle.com
   - Sign up for a business account
   - Complete verification

2. **Get Your Credentials**
   - Log in to Paddle Dashboard
   - Navigate to Settings → Developer Tools
   - Copy your:
     - **Vendor ID** - Your unique seller identifier
     - **API Key** - For backend authentication
     - **Public Key** - For webhook verification (optional, for advanced verification)

## 2. Create Products in Paddle

In your Paddle Dashboard, create two products (one for each paid plan):

### Product 1: Pro Plan
- **Name**: JobRocket Pro
- **Price**: ₹599 (one-time)
- **Type**: One-time payment
- **Paddle Price ID**: Store this ID

### Product 2: Premium Plan
- **Name**: JobRocket Premium
- **Price**: ₹599 (one-time)
- **Type**: One-time payment
- **Paddle Price ID**: Store this ID

## 3. Configure Environment Variables

Create a `.env` file in the backend directory with:

```env
# Paddle Configuration
PADDLE_API_KEY=your_paddle_api_key
PADDLE_WEBHOOK_SECRET=your_webhook_secret
PADDLE_VENDOR_ID=your_vendor_id
PADDLE_PRODUCT_PRO=123456        # Replace with your Pro product ID
PADDLE_PRODUCT_PREMIUM=123457    # Replace with your Premium product ID
FRONTEND_URL=http://localhost:3000  # Or your production URL
```

## 4. Set Up Webhooks

1. In Paddle Dashboard, navigate to **Settings → Alerts & Webhooks**
2. Add a new webhook with:
   - **URL**: `https://yourdomain.com/api/billing/webhook/paddle` (or `http://localhost:8000/api/billing/webhook/paddle` for local testing)
   - **Events to subscribe to**:
     - `subscription.created`
     - `subscription.updated`
     - `transaction.completed`
     - `transaction.billed`

3. Generate and copy the **Webhook Secret** from Paddle
4. Add to `.env`:
   ```env
   PADDLE_WEBHOOK_SECRET=your_webhook_secret_here
   ```

## 5. Test Payment Flow

### Local Testing

For local testing with webhook verification:

1. **Use ngrok for webhook tunneling** (when testing webhooks locally):
   ```bash
   ngrok http 8000
   ```
   This gives you a public URL like `https://xxxx-xxxx-xxxx.ngrok.io`

2. **Update webhook URL in Paddle Dashboard**:
   - Set to `https://xxxx-xxxx-xxxx.ngrok.io/api/billing/webhook/paddle`

3. **Test Payment Flow**:
   - Navigate to `/billing` on frontend
   - Click "Upgrade to Pro" or "Go Premium"
   - You'll be redirected to Paddle checkout
   - Use Paddle test cards (see below)

### Paddle Test Cards

For testing without real charges:
- **Card Number**: `4111 1111 1111 1111`
- **Expiry**: Any future date (e.g., 12/25)
- **CVV**: Any 3 digits (e.g., 123)

## 6. Verify Payment Integration

Once set up, the flow works like this:

```
User clicks "Upgrade" on billing page
         ↓
Frontend calls /api/billing/checkout
         ↓
Backend returns Paddle checkout URL
         ↓
Frontend redirects user to Paddle checkout
         ↓
User completes payment
         ↓
Paddle redirects user back to /billing?status=success&plan=pro
         ↓
Webhook: Paddle sends transaction.completed event
         ↓
Backend verifies signature and:
  - Updates user.plan in database
  - Records Payment entry
  - User can now access Pro features
```

## 7. Database Records

When a payment is processed, the `Payment` table stores:
- `id`: Unique payment identifier
- `user_email`: User's email
- `plan_id`: Plan purchased (pro/premium)
- `amount_paise`: Amount in paise (₹499 = 49900 paise)
- `status`: "completed", "pending", "failed", "refunded"
- `paddle_transaction_id`: Paddle's transaction ID
- `created_at`: When payment was initiated
- `completed_at`: When payment was confirmed

## 8. Production Deployment

When deploying to production:

1. **Update FRONTEND_URL**:
   ```env
   FRONTEND_URL=https://yourdomain.com
   ```

2. **Update webhook in Paddle Dashboard**:
   ```
   https://yourdomain.com/api/billing/webhook/paddle
   ```

3. **Use production Paddle keys** (not test keys)

4. **Enable HTTPS** on your domain

5. **Test payment flow** end-to-end

## 9. Troubleshooting

### Webhook not being called
- Check Paddle Dashboard → Alerts → Webhook logs
- Verify webhook URL is correct and publicly accessible
- Verify signature is being verified correctly
- Check backend logs for errors

### Payment shows as pending
- Check Paddle Dashboard for payment status
- May take 2-3 seconds for webhook to arrive
- Manually verify via `/api/billing/payment-status/{email}`

### Can't access pro features after upgrade
- Check database: User's `plan` field should be "pro"
- Check Payment record exists with status "completed"
- Check `/api/billing/plan/{email}` returns new plan

### Signature verification failing
- Ensure PADDLE_WEBHOOK_SECRET is correct
- Check webhook secret in Paddle Dashboard matches .env
- Verify webhook is configured for correct events only

## 10. Support

- Paddle Docs: https://developer.paddle.com/
- Webhook Reference: https://developer.paddle.com/webhooks/overview
- Integration Docs: https://developer.paddle.com/billing
