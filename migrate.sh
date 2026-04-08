#!/bin/bash
# Direct SQL migration using psql

# Connection string
DB_URL="postgresql://jobrocket:vpy2HmabMFX63aWMcRJIjsN9Zgh2T12Y@dpg-d7adr5buibrs739nhmag-a/jobrocket_rw5n"

echo "🚀 Starting database migration..."
echo "Adding missing columns to users table..."

# Execute SQL using psql
psql "$DB_URL" <<EOF
-- Add trial columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_start TIMESTAMP DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_end TIMESTAMP DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_payment_id VARCHAR(255) DEFAULT NULL;

-- Verify
SELECT COUNT(*) as "Total Users", 
       COUNT(trial_start) as "With trial_start",
       COUNT(payment_status) as "With payment_status"
FROM users;
EOF

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully!"
else
    echo "❌ Migration failed!"
    exit 1
fi
