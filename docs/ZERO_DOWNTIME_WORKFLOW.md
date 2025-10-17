# Zero-Downtime Deployment Workflow

This guide provides a step-by-step workflow for deploying database schema changes with zero downtime using the Expand/Backfill/Contract pattern.

## Overview

The zero-downtime migration strategy ensures that:
- Database changes don't cause application errors
- No downtime during deployments
- Changes can be rolled back safely
- Both old and new code versions can coexist

## Three-Phase Deployment Pattern

### Phase 1: EXPAND
**Add new schema elements without breaking existing code**
- Duration: 1 deployment cycle
- Goal: Make schema changes that are backwards compatible

### Phase 2: BACKFILL
**Migrate data and update application code**
- Duration: 1-2 deployment cycles
- Goal: Populate new schema and transition application code

### Phase 3: CONTRACT
**Remove old schema elements**
- Duration: 1 deployment cycle
- Goal: Clean up deprecated schema elements

---

## Real-World Example: Adding User Profile Photo

### Current State

```javascript
// Database schema
app_users {
  id: uuid
  email: varchar
  full_name: varchar
  // ... other fields
}

// Application code
const user = await db.query('SELECT * FROM app_users WHERE id = $1', [userId]);
```

### Goal
Add a `profile_photo_url` column to store user profile photos.

---

## Phase 1: EXPAND (Week 1, Day 1)

### Step 1.1: Create Migration

Create migration file: `migrations/YYYYMMDDHHMMSS_add_profile_photo_expand.js`

```javascript
exports.up = (pgm) => {
  // Add new column (nullable)
  pgm.addColumn('app_users', {
    profile_photo_url: {
      type: 'text',
      notNull: false,
      comment: 'URL to user profile photo - Phase 1: Expand'
    }
  });

  // Add index for common queries
  pgm.createIndex('app_users', 'profile_photo_url', {
    where: 'profile_photo_url IS NOT NULL'
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('app_users', 'profile_photo_url');
};
```

### Step 1.2: Deploy Migration

```bash
# In production
npm run migrate:up
```

**Result**: Column exists but all values are NULL. Existing queries still work.

### Step 1.3: Deploy Application Code (v1.1)

Update application to handle the new field (but still works with NULL):

```javascript
// Read user (works with NULL)
const user = await db.query('SELECT * FROM app_users WHERE id = $1', [userId]);
const profilePhoto = user.profile_photo_url || '/default-avatar.png';

// Update user (optionally set photo)
await db.query(`
  UPDATE app_users 
  SET full_name = $1, profile_photo_url = $2 
  WHERE id = $3
`, [fullName, photoUrl || null, userId]);
```

### Step 1.4: Verify

```sql
-- Check that column exists
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'app_users' 
  AND column_name = 'profile_photo_url';

-- Verify no errors in application logs
-- Verify existing functionality works
```

**✅ Phase 1 Complete**: Schema is expanded, application handles new field gracefully.

---

## Phase 2: BACKFILL (Week 1, Day 3-4)

### Step 2.1: Backfill Data (Optional)

If you need to populate existing records:

Create migration: `migrations/YYYYMMDDHHMMSS_add_profile_photo_backfill.js`

```javascript
exports.up = (pgm) => {
  // Option 1: Set default for all users
  pgm.sql(`
    UPDATE app_users 
    SET profile_photo_url = '/default-avatar.png'
    WHERE profile_photo_url IS NULL;
  `);

  // Option 2: Backfill from external service (in batches)
  pgm.sql(`
    DO $$
    DECLARE
      batch_size INTEGER := 100;
      rows_updated INTEGER;
    BEGIN
      LOOP
        UPDATE app_users
        SET profile_photo_url = 'https://api.example.com/avatars/' || id || '.jpg'
        WHERE profile_photo_url IS NULL
          AND id IN (
            SELECT id FROM app_users
            WHERE profile_photo_url IS NULL
            LIMIT batch_size
          );
        
        GET DIAGNOSTICS rows_updated = ROW_COUNT;
        EXIT WHEN rows_updated = 0;
        
        RAISE NOTICE 'Backfilled % rows', rows_updated;
        PERFORM pg_sleep(0.1); -- Brief pause between batches
      END LOOP;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE app_users SET profile_photo_url = NULL;`);
};
```

### Step 2.2: Deploy Backfill Migration

```bash
# Run during low-traffic period
npm run migrate:up
```

### Step 2.3: Monitor Backfill Progress

```sql
-- Check backfill progress
SELECT 
  COUNT(*) FILTER (WHERE profile_photo_url IS NULL) as null_count,
  COUNT(*) FILTER (WHERE profile_photo_url IS NOT NULL) as filled_count,
  COUNT(*) as total_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE profile_photo_url IS NOT NULL) / COUNT(*), 2) as percent_complete
FROM app_users;
```

### Step 2.4: Update Application Code (v1.2)

Now that data is backfilled, actively use the field:

```javascript
// Feature: Upload profile photo
async function uploadProfilePhoto(userId, file) {
  const photoUrl = await uploadToStorage(file);
  
  await db.query(`
    UPDATE app_users 
    SET profile_photo_url = $1 
    WHERE id = $2
  `, [photoUrl, userId]);
  
  return photoUrl;
}

// Feature: Display profile photo
async function getUserProfile(userId) {
  const user = await db.query(`
    SELECT id, full_name, email, profile_photo_url
    FROM app_users 
    WHERE id = $1
  `, [userId]);
  
  return {
    ...user,
    profilePhotoUrl: user.profile_photo_url || '/default-avatar.png'
  };
}
```

### Step 2.5: Verify

```sql
-- Verify data is populated
SELECT COUNT(*) FROM app_users WHERE profile_photo_url IS NOT NULL;

-- Check for any issues
SELECT * FROM app_users WHERE profile_photo_url IS NULL LIMIT 10;
```

**✅ Phase 2 Complete**: Data is backfilled, application actively uses new field.

---

## Phase 3: CONTRACT (Week 2, Day 1)

### Step 3.1: Add Constraints (Optional)

If you want to enforce NOT NULL:

Create migration: `migrations/YYYYMMDDHHMMSS_add_profile_photo_contract.js`

```javascript
exports.up = (pgm) => {
  // Verify no NULLs remain
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM app_users WHERE profile_photo_url IS NULL) THEN
        RAISE EXCEPTION 'NULL values still exist in profile_photo_url';
      END IF;
    END $$;
  `);

  // Add NOT NULL constraint if required
  pgm.alterColumn('app_users', 'profile_photo_url', {
    notNull: true,
    default: '/default-avatar.png'
  });

  // Update comment
  pgm.sql(`
    COMMENT ON COLUMN app_users.profile_photo_url IS 
    'URL to user profile photo - Phase 3: Contract (NOT NULL enforced)';
  `);
};

exports.down = (pgm) => {
  pgm.alterColumn('app_users', 'profile_photo_url', {
    notNull: false,
    default: null
  });
};
```

### Step 3.2: Deploy Final Migration

```bash
npm run migrate:up
```

### Step 3.3: Update Application Code (v1.3)

Now you can rely on the field always being present:

```javascript
// No need for fallback - field is always present
async function getUserProfile(userId) {
  const user = await db.query(`
    SELECT id, full_name, email, profile_photo_url
    FROM app_users 
    WHERE id = $1
  `, [userId]);
  
  return user; // profile_photo_url is guaranteed to exist
}
```

### Step 3.4: Verify

```sql
-- Verify constraint is in place
SELECT 
  column_name, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'app_users' 
  AND column_name = 'profile_photo_url';

-- Should return: is_nullable = 'NO'
```

**✅ Phase 3 Complete**: Schema change is fully deployed with all constraints.

---

## Complex Example: Renaming a Column with Active Traffic

### Scenario
Rename `check_in_time` → `check_in_timestamp` in the `attendance` table.
This table has high write volume (100+ inserts/min).

### Phase 1: EXPAND (Day 1, Morning)

**Migration 1**: Add new column and sync trigger

```javascript
exports.up = (pgm) => {
  // Add new column
  pgm.addColumn('attendance', {
    check_in_timestamp: {
      type: 'timestamp with time zone',
      notNull: false
    }
  });

  // Copy existing data
  pgm.sql(`
    UPDATE attendance 
    SET check_in_timestamp = check_in_time
    WHERE check_in_timestamp IS NULL;
  `);

  // Create bidirectional sync trigger
  pgm.sql(`
    CREATE OR REPLACE FUNCTION sync_check_in_columns()
    RETURNS TRIGGER AS $$
    BEGIN
      -- If old column updated, sync to new
      IF NEW.check_in_time IS DISTINCT FROM OLD.check_in_time THEN
        NEW.check_in_timestamp := NEW.check_in_time;
      END IF;
      
      -- If new column updated, sync to old
      IF NEW.check_in_timestamp IS DISTINCT FROM OLD.check_in_timestamp THEN
        NEW.check_in_time := NEW.check_in_timestamp;
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER sync_check_in_trigger
    BEFORE INSERT OR UPDATE ON attendance
    FOR EACH ROW
    EXECUTE FUNCTION sync_check_in_columns();
  `);

  // Add index on new column
  pgm.createIndex('attendance', 'check_in_timestamp');
};
```

**Deploy**: Application v1.0 still uses `check_in_time`, trigger keeps both in sync.

### Phase 2: BACKFILL (Day 1, Afternoon)

**Application v2.0**: Update code to use both columns

```javascript
// Dual write: write to both columns explicitly
await db.query(`
  INSERT INTO attendance (
    user_id, 
    office_id, 
    check_in_time,          -- OLD
    check_in_timestamp,     -- NEW
    check_in_location
  ) VALUES ($1, $2, $3, $3, $4)
`, [userId, officeId, checkInTime, location]);

// Dual read: try new column first, fallback to old
const attendance = await db.query(`
  SELECT 
    id,
    COALESCE(check_in_timestamp, check_in_time) as check_in_time,
    check_out_time
  FROM attendance 
  WHERE user_id = $1
`, [userId]);
```

**Deploy**: Both old and new code work simultaneously. Trigger ensures data consistency.

### Phase 2.5: TRANSITION (Day 2)

**Application v2.1**: Exclusively use new column

```javascript
// Write only to new column
await db.query(`
  INSERT INTO attendance (
    user_id, 
    office_id, 
    check_in_timestamp,     -- Only NEW column
    check_in_location
  ) VALUES ($1, $2, $3, $4)
`, [userId, officeId, checkInTime, location]);

// Read only from new column
const attendance = await db.query(`
  SELECT 
    id,
    check_in_timestamp as check_in_time,
    check_out_time
  FROM attendance 
  WHERE user_id = $1
`, [userId]);
```

**Deploy**: Application uses only `check_in_timestamp`. Trigger still keeps old column in sync for safety.

**Monitor**: Watch for 24-48 hours to ensure stability.

### Phase 3: CONTRACT (Day 4)

**Migration 2**: Remove old column

```javascript
exports.up = (pgm) => {
  // Drop trigger
  pgm.sql('DROP TRIGGER IF EXISTS sync_check_in_trigger ON attendance;');
  pgm.sql('DROP FUNCTION IF EXISTS sync_check_in_columns();');

  // Drop old column
  pgm.dropColumn('attendance', 'check_in_time');

  // Make new column NOT NULL
  pgm.alterColumn('attendance', 'check_in_timestamp', {
    notNull: true
  });

  // Update views and other dependencies
  pgm.sql(`
    DROP MATERIALIZED VIEW IF EXISTS daily_attendance_summary CASCADE;
    -- Recreate view using new column name
  `);
};
```

**Deploy**: Clean up complete. Only `check_in_timestamp` remains.

---

## Rollback Procedures

### Rollback in Phase 1
**Safe**: Just run `npm run migrate:down`

```bash
npm run migrate:down
```

No data loss, no application impact.

### Rollback in Phase 2
**Moderate Risk**: Need to roll back migration AND application code

```bash
# 1. Roll back application to v1.0
git revert <commit>
deploy_application

# 2. Roll back migration
npm run migrate:down
```

If data was backfilled, you may lose that data.

### Rollback in Phase 3
**High Risk**: Requires careful coordination

```bash
# 1. Run down migration to restore old schema
npm run migrate:down

# 2. Restore data from backups if needed

# 3. Roll back application code
git revert <commit>
deploy_application
```

**Best Practice**: Don't roll back Phase 3. Instead, create new migrations to fix forward.

---

## Timeline Example

### Typical 2-Week Timeline

| Day | Phase | Activity | Deploy Window |
|-----|-------|----------|---------------|
| Mon Week 1 | Expand | Deploy migration + code v1.1 | Morning |
| Wed Week 1 | Backfill | Run backfill migration | Off-hours |
| Thu Week 1 | Backfill | Deploy code v1.2 (active use) | Morning |
| Mon Week 2 | Contract | Deploy final migration + code v1.3 | Morning |

### Aggressive 1-Week Timeline (Low Risk Changes)

| Day | Phase | Activity | Deploy Window |
|-----|-------|----------|---------------|
| Mon | Expand | Migration + code v1.1 | Morning |
| Tue | Backfill | Backfill migration | Off-hours |
| Wed | Backfill | Code v1.2 | Morning |
| Fri | Contract | Final migration + code v1.3 | Morning |

---

## Best Practices Checklist

### Pre-Deployment
- [ ] Review migration with senior engineer
- [ ] Test migrations in staging with production-like data
- [ ] Verify `up` and `down` migrations work
- [ ] Document rollback procedure
- [ ] Schedule deployment during low-traffic window
- [ ] Notify team of deployment

### During Deployment
- [ ] Monitor database locks and query performance
- [ ] Watch application error logs
- [ ] Check application metrics (response time, error rate)
- [ ] Verify data integrity after each phase
- [ ] Keep communication channel open with team

### Post-Deployment
- [ ] Verify migration status: `npm run migrate:status`
- [ ] Check for any failed queries or errors
- [ ] Monitor for 24-48 hours before next phase
- [ ] Document any issues encountered
- [ ] Update runbook if needed

---

## Common Pitfalls and Solutions

### Pitfall 1: Long-Running Migrations Block Traffic

**Problem**: Large table updates cause locks, blocking writes.

**Solution**: Batch updates in small chunks

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    DECLARE
      batch_size INTEGER := 1000;
      rows_updated INTEGER;
    BEGIN
      LOOP
        UPDATE large_table
        SET new_column = old_column
        WHERE new_column IS NULL
          AND id IN (
            SELECT id FROM large_table
            WHERE new_column IS NULL
            LIMIT batch_size
          );
        
        GET DIAGNOSTICS rows_updated = ROW_COUNT;
        EXIT WHEN rows_updated = 0;
        
        PERFORM pg_sleep(0.1); -- Brief pause
      END LOOP;
    END $$;
  `);
};
```

### Pitfall 2: Forgetting to Drop Triggers

**Problem**: Sync triggers remain after contract phase, causing overhead.

**Solution**: Always clean up in contract phase

```javascript
exports.up = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS sync_trigger_name ON table_name;');
  pgm.sql('DROP FUNCTION IF EXISTS sync_function_name();');
};
```

### Pitfall 3: Not Validating Data Before Adding Constraints

**Problem**: Adding NOT NULL constraint fails due to NULL values.

**Solution**: Always validate first

```javascript
exports.up = (pgm) => {
  // Validate first
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM table_name WHERE column_name IS NULL) THEN
        RAISE EXCEPTION 'NULL values found in column_name';
      END IF;
    END $$;
  `);

  // Then add constraint
  pgm.alterColumn('table_name', 'column_name', { notNull: true });
};
```

### Pitfall 4: Index Creation Blocking Writes

**Problem**: Regular `CREATE INDEX` locks table.

**Solution**: Always use `CONCURRENTLY`

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name
    ON table_name (column_name);
  `);
};
```

---

## Monitoring Queries

### Check for Blocking Queries

```sql
SELECT 
  blocked_locks.pid AS blocked_pid,
  blocking_locks.pid AS blocking_pid,
  blocked_activity.usename AS blocked_user,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_query,
  blocking_activity.query AS blocking_query,
  blocked_activity.application_name AS blocked_app
FROM pg_locks blocked_locks
JOIN pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_locks blocking_locks 
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
JOIN pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted
  AND blocking_locks.granted;
```

### Monitor Migration Progress

```sql
-- For CREATE INDEX CONCURRENTLY
SELECT 
  now()::time,
  p.phase,
  ROUND(100.0 * p.blocks_done / NULLIF(p.blocks_total, 0), 2) AS blocks_percent,
  ROUND(100.0 * p.tuples_done / NULLIF(p.tuples_total, 0), 2) AS tuples_percent
FROM pg_stat_progress_create_index p
JOIN pg_stat_activity a ON a.pid = p.pid;
```

### Check Table Sizes

```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Conclusion

Zero-downtime migrations require:
1. **Planning**: Break changes into expand/backfill/contract phases
2. **Testing**: Verify migrations in staging
3. **Monitoring**: Watch for locks and performance issues
4. **Patience**: Don't rush through phases
5. **Communication**: Coordinate with team

**Remember**: It's better to be slow and safe than fast and broken.
