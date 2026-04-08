# URGENT: Database Schema Mismatch - FIX INSTRUCTIONS

## 🚨 Error Summary

```
psycopg2.errors.UndefinedColumn: column users.trial_start does not exist
```

Your PostgreSQL database schema is missing 5 columns that the code expects:
- `trial_start`
- `trial_end`
- `trial_used`
- `payment_status`
- `last_payment_id`

---

## ⚡ Quick Fix (3 Minutes)

### Option 1: Use Render Query Editor (Easiest)

1. Go to: https://dashboard.render.com
2. Select: **PostgreSQL Database** (JobRocket or your DB name)
3. Click: **Query Editor**
4. Copy-paste this SQL:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_start TIMESTAMP DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_end TIMESTAMP DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_payment_id VARCHAR(255) DEFAULT NULL;
```

5. Click **Execute**
6. You should see: `ALTER TABLE 0` (means columns added)

Then redeploy backend.

### Option 2: Use Python Script (My Computer)

```bash
cd /home/ridha/freelance/auto_application_bot/backend

# Make sure .env has DATABASE_URL
cat .env | grep DATABASE_URL

# Run migration script
python migrate_add_trial_columns.py
```

Expected output:
```
✅ Migration completed successfully!
🚀 MIGRATION SUCCESSFUL!
```

### Option 3: Use Render Shell (Render Dashboard)

1. Go to: https://dashboard.render.com → JobRocket Backend
2. Click: **Shell** tab at top
3. Run:

```bash
cd backend
source ../venv/bin/activate
python migrate_add_trial_columns.py
```

---

## 🔄 After Fix: Redeploy Backend

1. Go to Render dashboard
2. Click **Redeploy** on JobRocket Backend
3. Wait for green status
4. Test:

```bash
curl https://jobrocket-backend-9uxh.onrender.com/db-check
# Should return: "status": "ok", "database": "connected"
```

---

## ✅ What Gets Fixed

| Before | After |
|--------|-------|
| ❌ Database missing columns → UndefinedColumn error | ✅ All columns exist |
| ❌ `/api/profile` returns error | ✅ Returns user profile |
| ❌ `/api/bot/start` crashes | ✅ Checks trial and works |
| ❌ `/api/billing/plan` errors | ✅ Shows user plan & trial |

---

## 📋 Complete Process (5 min)

**Step 1: Add columns (pick one method above)**
- Option 1: SQL in Render Query Editor ← EASIEST
- Option 2: Python script locally
- Option 3: Render Shell

**Step 2: Verify schema**
```bash
# Check if columns exist
curl https://jobrocket-backend-9uxh.onrender.com/db-check
```

**Step 3: Redeploy**
- Go to Render Dashboard
- Click Redeploy
- Wait for green status

**Step 4: Test**
```bash
curl https://jobrocket-backend-9uxh.onrender.com/api/profile/your-email%40example.com
# Should return 200 with user profile
```

---

## 🛟 Troubleshooting

### "Column already exists"
✅ That's fine! The `IF NOT EXISTS` prevents errors if you run it twice.

### "Permission denied"
❌ Database user doesn't have ALTER permission. Contact database admin or use Render's Query Editor instead.

### "Connection refused"
❌ DATABASE_URL incorrect. Check Render dashboard for correct PostgreSQL connection string.

### Still getting UndefinedColumn after fix?
1. Did you click Execute in Query Editor?
2. Did you Redeploy the backend?
3. Try: `curl https://jobrocket-backend-9uxh.onrender.com/db-check`

---

## 📚 Related Files

- **migrate_add_trial_columns.py** - Python migration script
- **MIGRATION_FIX_NOW.md** - Detailed migration guide
- **main.py** - Has safe field access that handles missing columns
- **routers/profile.py** - Uses getattr() for backward compatibility

---

## 🚀 Next: After Migration

Once the database is fixed:

1. **New users** automatically get 7-day trial on registration
2. **Existing users** have default values (backward compatible)
3. **Payment flow** works with Paddle integration
4. **All endpoints** work without database errors

---

## ⏰ Timeline

- **Now**: Run one of the 3 fix options above (3 min)
- **+3 min**: Redeploy backend (2 min)
- **+5 min**: Test endpoints (1 min)
- **Done!** ✅

---

**Choose Option 1 (Render Query Editor) - it's the fastest!**

Then click Redeploy and you're done.
