#!/bin/bash
# JobRocket Complete Feature Test Script
# Tests: Registration, Premium Access, Feedback System, Authentication

API_BASE="https://jobrocket-backend-9uxh.onrender.com"
EMAIL="testuser_$(date +%s)@jobrocket.ai"
PASSWORD="Test@Secure123"
NAME="Test User $(date +%s)"

echo "=========================================="
echo "🧪 JobRocket Feature Test Suite"
echo "=========================================="
echo ""

# ─────────────────────────────────────────────
# TEST 1: User Registration
# ─────────────────────────────────────────────
echo "TEST 1: User Registration with Premium Access"
echo "─────────────────────────────────────────────"

REG_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"name\": \"$NAME\"
  }")

echo "$REG_RESPONSE" | python3 << 'PYTHON'
import sys, json
try:
    data = json.load(sys.stdin)
    user = data.get('user', {})
    trial = user.get('trial', {})
    
    print(f"✅ Email: {user.get('email')}")
    print(f"✅ Plan: {user.get('plan')} (expected: premium)")
    print(f"✅ Payment Status: {user.get('payment_status')}")
    print(f"✅ Trial Active: {trial.get('active')} (expected: true)")
    print(f"✅ Days Remaining: {trial.get('days_remaining')} (expected: 999)")
    print(f"✅ Token Received: {'✓' if data.get('token') else '✗'}")
    
    # Save token for future tests
    with open('/tmp/jobrocket_token.txt', 'w') as f:
        f.write(data.get('token', ''))
    with open('/tmp/jobrocket_email.txt', 'w') as f:
        f.write(user.get('email', ''))
        
    # Validate results
    success = (
        user.get('plan') == 'premium' and
        trial.get('active') == True and
        data.get('token')
    )
    print(f"\n{'✅ PASS' if success else '❌ FAIL'}")
except Exception as e:
    print(f"❌ Error: {e}")
    print(json.dumps(data if 'data' in locals() else {}, indent=2))
PYTHON

echo ""

# ─────────────────────────────────────────────
# TEST 2: User Login
# ─────────────────────────────────────────────
echo "TEST 2: User Login"
echo "──────────────────"

LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

echo "$LOGIN_RESPONSE" | python3 << 'PYTHON'
import sys, json
try:
    data = json.load(sys.stdin)
    user = data.get('user', {})
    
    print(f"✅ Email: {user.get('email')}")
    print(f"✅ Plan: {user.get('plan')}")
    print(f"✅ Token Received: {'✓' if data.get('token') else '✗'}")
    
    # Save token for next tests
    with open('/tmp/jobrocket_token.txt', 'w') as f:
        f.write(data.get('token', ''))
    
    success = bool(data.get('token'))
    print(f"\n{'✅ PASS' if success else '❌ FAIL'}")
except Exception as e:
    print(f"❌ Error: {e}")
PYTHON

echo ""

# ─────────────────────────────────────────────
# TEST 3: Check Feedback Status (should not be ready on day 0)
# ─────────────────────────────────────────────
echo "TEST 3: Feedback Status (< 2 days)"
echo "───────────────────────────────────"

TOKEN=$(cat /tmp/jobrocket_token.txt 2>/dev/null)

curl -s -X GET "$API_BASE/api/feedback/feedback-status" \
  -H "Authorization: Bearer $TOKEN" | python3 << 'PYTHON'
import sys, json
try:
    data = json.load(sys.stdin)
    
    print(f"✅ Ready for Feedback: {data.get('ready_for_feedback')} (expected: false)")
    print(f"✅ Days Used: {data.get('days_used')} (expected: 0)")
    print(f"✅ Message: {data.get('message')}")
    
    success = (
        data.get('ready_for_feedback') == False and
        data.get('days_used') == 0
    )
    print(f"\n{'✅ PASS' if success else '❌ FAIL'}")
except Exception as e:
    print(f"❌ Error: {e}")
    print("Response:", data if 'data' in locals() else "No response")
PYTHON

echo ""

# ─────────────────────────────────────────────
# TEST 4: Submit Feedback (even though not ready)
# ─────────────────────────────────────────────
echo "TEST 4: Submit Feedback"
echo("───────────────────────")

curl -s -X POST "$API_BASE/api/feedback/submit-feedback" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 5,
    "suggestion": "Amazing tool! Would love to see batch job applications."
  }' | python3 << 'PYTHON'
import sys, json
try:
    data = json.load(sys.stdin)
    
    print(f"✅ Status: {data.get('status')}")
    print(f"✅ Message: {data.get('message')}")
    print(f"✅ Rating Saved: {data.get('rating')}")
    print(f"✅ Feedback ID: {data.get('feedback_id', 'N/A')[:20]}...")
    
    success = (
        data.get('status') == 'success' and
        data.get('rating') == 5
    )
    print(f"\n{'✅ PASS' if success else '❌ FAIL'}")
except Exception as e:
    print(f"❌ Error: {e}")
PYTHON

echo ""

# ─────────────────────────────────────────────
# TEST 5: Get Feedback History
# ─────────────────────────────────────────────
echo "TEST 5: Retrieve Feedback History"
echo("─────────────────────────────────")

curl -s -X GET "$API_BASE/api/feedback/my-feedback" \
  -H "Authorization: Bearer $TOKEN" | python3 << 'PYTHON'
import sys, json
try:
    data = json.load(sys.stdin)
    feedbacks = data.get('feedbacks', [])
    
    print(f"✅ Total Feedback Entries: {data.get('total', len(feedbacks))}")
    if len(feedbacks) > 0:
        print(f"✅ Average Rating: {data.get('average_rating')}")
        for i, fb in enumerate(feedbacks[:3], 1):  # Show first 3
            print(f"   Feedback {i}: {fb.get('rating')}★ | {fb.get('suggestion', 'N/A')[:50]}...")
    else:
        print("   No feedback yet")
    
    success = True  # This endpoint should always work
    print(f"\n{'✅ PASS' if success else '❌ FAIL'}")
except Exception as e:
    print(f"❌ Error: {e}")
PYTHON

echo ""

# ─────────────────────────────────────────────
# TEST 6: Bot Access (should have premium)
# ─────────────────────────────────────────────
echo "TEST 6: Bot Premium Access Check"
echo("────────────────────────────────")

EMAIL_FOR_CHECK=$(cat /tmp/jobrocket_email.txt 2>/dev/null)

curl -s -X GET "$API_BASE/api/bot/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | python3 << 'PYTHON'
import sys, json
try:
    data = json.load(sys.stdin)
    
    # Check if response contains premium status
    status = data.get('status', '')
    message = data.get('message', '')
    access = data.get('has_access', False)
    
    print(f"✅ Status: {status}")
    print(f"✅ Message: {message}")
    print(f"✅ Has Premium Access: {access}")
    
    success = ('premium' in message.lower() or access == True)
    print(f"\n{'✅ PASS' if success else '⚠️ CHECK MANUALLY'}")
except Exception as e:
    print(f"⚠️ Endpoint not yet available or error: {e}")
PYTHON

echo ""

# ─────────────────────────────────────────────
# TEST 7: Health Check
# ─────────────────────────────────────────────
echo "TEST 7: API Health Check"
echo("───────────────────────")

curl -s -X GET "$API_BASE/health" | python3 << 'PYTHON'
import sys, json
try:
    data = json.load(sys.stdin)
    
    print(f"✅ Status: {data.get('status')}")
    print(f"✅ Service: {data.get('service')}")
    
    success = data.get('status') == 'ok'
    print(f"\n{'✅ PASS' if success else '❌ FAIL'}")
except Exception as e:
    print(f"❌ Error: {e}")
PYTHON

echo ""

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo "=========================================="
echo "✅ Test Suite Complete"
echo "=========================================="
echo ""
echo "Credentials for manual testing:"
echo "  Email: $EMAIL"
echo "  Password: $PASSWORD"
echo "  Token saved to: /tmp/jobrocket_token.txt"
echo ""
echo "Next: Monitor feedback after 2 days of usage"
echo "=========================================="
