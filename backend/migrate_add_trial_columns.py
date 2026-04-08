"""
Database Migration Script - Add Trial & Payment Columns to Users Table

This script adds the missing columns to the production PostgreSQL database.

CRITICAL: Run this ONCE before redeploying the backend.

Usage:
    python migrate_add_trial_columns.py

The script will:
1. Connect to the database (uses DATABASE_URL env var)
2. Add missing columns if they don't exist
3. Set default values for existing users
4. Verify the migration succeeded
"""

import os
import sys
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text, inspect
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def get_database_url():
    """Get database URL from environment."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("❌ ERROR: DATABASE_URL environment variable not set")
        print("Set it in your .env file or Render dashboard")
        sys.exit(1)
    return db_url

def column_exists(inspector, table_name, column_name):
    """Check if a column exists in a table."""
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns

def run_migration():
    """Run the migration to add trial/payment columns."""
    
    db_url = get_database_url()
    print(f"Connecting to database: {db_url.split('@')[1] if '@' in db_url else 'local'}")
    
    engine = create_engine(db_url)
    
    # Get table inspector
    inspector = inspect(engine)
    
    # Check if users table exists
    if "users" not in inspector.get_table_names():
        print("❌ ERROR: 'users' table does not exist")
        sys.exit(1)
    
    print("✅ Found 'users' table")
    
    # Check existing columns
    existing_columns = [col['name'] for col in inspector.get_columns("users")]
    print(f"Existing columns: {len(existing_columns)}")
    
    # Define columns to add
    columns_to_add = [
        ("trial_start", "TIMESTAMP", "NULL"),
        ("trial_end", "TIMESTAMP", "NULL"),
        ("trial_used", "INTEGER", "0"),
        ("payment_status", "VARCHAR(50)", "'free'"),
        ("last_payment_id", "VARCHAR(255)", "NULL"),
    ]
    
    # Check which columns are missing
    missing_columns = []
    for col_name, col_type, default_val in columns_to_add:
        if not column_exists(inspector, "users", col_name):
            missing_columns.append((col_name, col_type, default_val))
            print(f"❌ Missing column: {col_name}")
        else:
            print(f"✅ Column exists: {col_name}")
    
    if not missing_columns:
        print("\n✅ All columns already exist! Migration not needed.")
        return True
    
    # Add missing columns
    print(f"\n📝 Adding {len(missing_columns)} missing columns...")
    
    with engine.begin() as conn:
        for col_name, col_type, default_val in missing_columns:
            # ALTER TABLE statement
            alter_sql = f"""
            ALTER TABLE users
            ADD COLUMN {col_name} {col_type} DEFAULT {default_val}
            """
            
            try:
                conn.execute(text(alter_sql))
                print(f"✅ Added column: {col_name} ({col_type})")
            except Exception as e:
                print(f"❌ Failed to add column {col_name}: {str(e)}")
                return False
    
    # Verify migration
    print("\n🔍 Verifying migration...")
    inspector = inspect(engine)
    
    all_present = True
    for col_name, _, _ in columns_to_add:
        if column_exists(inspector, "users", col_name):
            print(f"✅ Verified: {col_name}")
        else:
            print(f"❌ NOT FOUND: {col_name}")
            all_present = False
    
    if not all_present:
        print("\n❌ Migration verification failed!")
        return False
    
    # Count users and show summary
    with engine.connect() as conn:
        result = conn.execute(text("SELECT COUNT(*) FROM users"))
        user_count = result.scalar()
    
    print(f"\n✅ Migration completed successfully!")
    print(f"✅ Database has {user_count} existing users")
    print(f"✅ New users will auto-enroll in 7-day trial on registration")
    print(f"✅ Existing users won't have trial fields set (graceful degradation)")
    
    return True

if __name__ == "__main__":
    try:
        success = run_migration()
        if success:
            print("\n" + "=" * 60)
            print("🚀 MIGRATION SUCCESSFUL!")
            print("=" * 60)
            print("\nNext steps:")
            print("1. Redeploy backend on Render")
            print("2. Test /health endpoint")
            print("3. Test /api/profile/{email}")
            print("\nThe backend should now work without database errors!")
            sys.exit(0)
        else:
            print("\n❌ MIGRATION FAILED")
            sys.exit(1)
    except Exception as e:
        print(f"\n❌ Migration error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
