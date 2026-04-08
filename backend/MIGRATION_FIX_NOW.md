# Database Migration - FIX NOW!

## The Problem

PostgreSQL database is missing these columns on the `users` table:
- `trial_start`
- `trial_end`
- `trial_used`
- `payment_status`
- `last_payment_id`

The code tries to access these columns, but they don't exist in the schema → **UndefinedColumn error**.

---

## Solution (3 Steps)

### Step 1: Run the Migration Script (2 min)

**Option A: Run Locally** (if you have database access)

```bash
cd /home/ridha/freelance/auto_application_bot/backend

# Ensure you have a .env file with:
# DATABASE_URL=postgresql://user:pass@host/dbname

# Run migration
python migrate_add_trial_columns.py
```

Expected output:
```
✅ Found 'users' table
❌ Missing column: trial_start
❌ Missing column: trial_end
❌ Missing column: trial_used
❌ Missing column: payment_status
❌ Missing column: last_payment_id

📝 Adding 5 missing columns...
✅ Added column: trial_start (TIMESTAMP)
✅ Added column: trial_end (TIMESTAMP)
✅ Added column: trial_used (INTEGER)
✅ Added column: payment_status (VARCHAR(50))
✅ Added column: last_payment_id (VARCHAR(255))

✅ Migration completed successfully!
✅ Database has X existing users
```

**Option B: Run on Render** (using Render Shell)

1. Go to https://dashboard.render.com → JobRocket Backend
2. Click **Shell** tab
3. Run these commands:

```bash
# Enter backend directory
cd backend

# Activate venv
source ../venv/bin/activate

# Run migration
python migrate_add_trial_columns.py
```

**Option C: SQL Direct** (using Render Database GUI)

1. Go to https://dashboard.render.com → PostgreSQL Database
2. Click **Query Editor**
3. Run this SQL:

```sql
-- Add missing columns to users table
ALTER TABLE users ADD COLUMN trial_start TIMESTAMP DEFAULT NULL;
ALTER TABLE users ADD COLUMN trial_end TIMESTAMP DEFAULT NULL;
ALTER TABLE users ADD COLUMN trial_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN payment_status VARCHAR(50) DEFAULT 'free';
ALTER TABLE users ADD COLUMN last_payment_id VARCHAR(255) DEFAULT NULL;

-- Verify
SELECT COUNT(*) FROM users;
```

### Step 2: Redeploy Backend (2 min)

1. Go to https://dashboard.render.com → JobRocket Backend
2. Click **Redeploy**
3. Wait for green checkmark

### Step 3: Verify (2 min)

```bash
# Test health
curl https://jobrocket-backend-9uxh.onrender.com/health

# Test database
curl https://jobrocket-backend-9uxh.onrender.com/db-check

# Test profile endpoint (with your email)
curl https://jobrocket-backend-9uxh.onrender.com/api/profile/your-email%40example.com
```

Expected: All return 200 OK (no database errors)

---

## What the Migration Does

✅ **Adds 5 missing columns** to the `users` table in PostgreSQL

```sql
-- Columns added:
trial_start TIMESTAMP          -- When user's trial started
trial_end TIMESTAMP            -- When user's trial ends
trial_used INTEGER             -- Number of trial days used
payment_status VARCHAR(50)     -- 'free', 'trial', 'pro', 'premium'
last_payment_id VARCHAR(255)   -- Last Paddle payment ID
```

✅ **Handles existing users gracefully**
- Existing users get these columns set to defaults
- Existing users won't have trial (backward compatible)
- New users will auto-enroll in 7-day trial

✅ **No data loss**
- All existing user data preserved
- Only adds new empty/default columns

---

## Why This Was Needed

The code was updated to support:
- 7-day free trial for new users
- Paddle payment integration
- Trial expiration logic

But the database schema wasn't updated to have these new columns. Running the script syncs the schema with the code.

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| `DATABASE_URL not set` | Create .env with DATABASE_URL or set in Render dashboard |
| `column already exists` | That's fine! The script detects existing columns and skips them |
| `permission denied` | Ensure database user has ALTER TABLE permissions |
| `connection refused` | Check DATABASE_URL is correct and database is accessible |

---

## Next: Deploy and Test

After migration succeeds:

```bash
# Commit your code
git add backend/migrate_add_trial_columns.py
git commit -m "Add database migration script for trial columns"
git push

# Redeploy on Render (auto-deploys from git push)

# Test endpoints
curl https://jobrocket-backend-9uxh.onrender.com/health
curl https://jobrocket-backend-9uxh.onrender.com/api/profile/email%40example.com
```

---

**Run the migration NOW to fix the UndefinedColumn error!**

Choose one of the 3 options above and execute it.
