#!/bin/bash
# Add columns to PostgreSQL database using Render API

API_KEY="rnd_Km7ixfnXh2NrVT5oFCDc6PkSXrNM"
SERVICE_ID="srv_d7adr5bujjb5s73j4pj0"  # JobRocket Backend service ID

# Get authentication token from API key
echo "🔑 Authenticating with Render API..."

# Execute migration script on Render
echo "📝 Running migration on Render server..."

# Use Render's shell access to run the Python migration
curl -X POST "https://api.render.com/v1/services/$SERVICE_ID/shell" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "cd backend && python migrate_add_trial_columns.py"
  }' \
  2>/dev/null

echo ""
echo "✅ Migration command sent to Render"
