# Quick Reference Guide

## Common Commands

### Migration Commands

```bash
# Run all pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down

# Check migration status
npm run migrate:status

# Create new migration
npm run migrate:create add-user-avatar

# Seed database with sample data
npm run db:seed
```

### Database Connection

```bash
# Set up environment variables
cp .env.example .env

# Edit .env with your credentials
nano .env

# Test connection
psql $DATABASE_URL
```

---

## Common Query Patterns

### Geographic Queries

```sql
-- Check if point is within office boundary
SELECT * FROM offices 
WHERE ST_Contains(
  boundary::geometry, 
  ST_GeogFromText('POINT(longitude latitude)')::geometry
);

-- Calculate distance between two points
SELECT ST_Distance(
  ST_GeogFromText('POINT(lon1 lat1)'),
  ST_GeogFromText('POINT(lon2 lat2)')
) as distance_meters;

-- Find nearest office
SELECT id, name, 
  ST_Distance(
    boundary, 
    ST_GeogFromText('POINT(longitude latitude)')
  ) as distance_meters
FROM offices
ORDER BY distance_meters
LIMIT 1;
```

### Attendance Queries

```sql
-- Today's attendance for a user
SELECT * FROM attendance 
WHERE user_id = $1 
  AND DATE(check_in_time) = CURRENT_DATE;

-- Users currently checked in
SELECT u.full_name, a.check_in_time, o.name as office
FROM attendance a
JOIN app_users u ON a.user_id = u.id
JOIN offices o ON a.office_id = o.id
WHERE a.check_out_time IS NULL
  AND DATE(a.check_in_time) = CURRENT_DATE;

-- Monthly work hours for user
SELECT 
  DATE_TRUNC('month', check_in_time) as month,
  SUM(work_duration_minutes) / 60.0 as total_hours
FROM attendance
WHERE user_id = $1
  AND check_in_time >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', check_in_time);

-- Attendance with integrity issues
SELECT * FROM attendance
WHERE (integrity_verdict->>'overall_score')::float < 0.7
ORDER BY check_in_time DESC;
```

### User Management

```sql
-- Create user with hashed password
INSERT INTO app_users (email, full_name, password_hash, role)
VALUES ($1, $2, crypt($3, gen_salt('bf')), $4);

-- Authenticate user
SELECT * FROM app_users 
WHERE email = $1 
  AND password_hash = crypt($2, password_hash)
  AND is_active = true;

-- Get user with devices
SELECT 
  u.*,
  json_agg(d.*) as devices
FROM app_users u
LEFT JOIN devices d ON u.id = d.user_id AND d.is_active = true
WHERE u.id = $1
GROUP BY u.id;
```

### Leave Management

```sql
-- Pending leave requests
SELECT l.*, u.full_name, u.department
FROM leaves l
JOIN app_users u ON l.user_id = u.id
WHERE l.status = 'pending'
ORDER BY l.created_at;

-- Approve leave request
UPDATE leaves
SET status = 'approved',
    approved_by = $1,
    approved_at = CURRENT_TIMESTAMP
WHERE id = $2;

-- Check if user is on leave
SELECT EXISTS (
  SELECT 1 FROM leaves 
  WHERE user_id = $1 
    AND status = 'approved'
    AND CURRENT_DATE BETWEEN start_date AND end_date
) as is_on_leave;
```

### Reporting Queries

```sql
-- Daily attendance summary
SELECT * FROM daily_attendance_summary
WHERE attendance_date = CURRENT_DATE
  AND office_id = $1
ORDER BY full_name;

-- Weekly attendance for user
SELECT * FROM weekly_attendance_summary
WHERE user_id = $1
  AND week_start_date >= CURRENT_DATE - INTERVAL '4 weeks'
ORDER BY week_start_date DESC;

-- Monthly department summary
SELECT 
  department,
  COUNT(DISTINCT user_id) as employees,
  SUM(days_present) as total_days_present,
  ROUND(AVG(total_work_hours), 2) as avg_hours_per_employee
FROM monthly_attendance_summary
WHERE month_start_date = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY department;

-- Office occupancy today
SELECT * FROM office_occupancy_summary
WHERE occupancy_date = CURRENT_DATE
ORDER BY office_name, hour;
```

---

## Common Migration Patterns

### Add Column (Safe)

```javascript
exports.up = (pgm) => {
  pgm.addColumn('table_name', {
    new_column: {
      type: 'varchar(255)',
      notNull: false,  // Important: nullable first
      default: null
    }
  });
  
  pgm.createIndex('table_name', 'new_column');
};

exports.down = (pgm) => {
  pgm.dropColumn('table_name', 'new_column');
};
```

### Add Index (Safe)

```javascript
exports.up = (pgm) => {
  // Use CONCURRENTLY to avoid locking
  pgm.sql(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_table_column
    ON table_name (column_name);
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_table_column;');
};
```

### Add Foreign Key (Three-Phase)

```javascript
// Phase 1: Add column
exports.up = (pgm) => {
  pgm.addColumn('child_table', {
    parent_id: { type: 'uuid', notNull: false }
  });
  pgm.createIndex('child_table', 'parent_id');
};

// Phase 2: Backfill data
exports.up = (pgm) => {
  pgm.sql(`UPDATE child_table SET parent_id = ...`);
};

// Phase 3: Add constraint
exports.up = (pgm) => {
  pgm.alterColumn('child_table', 'parent_id', { notNull: true });
  pgm.addConstraint('child_table', 'fk_child_parent', {
    foreignKeys: {
      columns: 'parent_id',
      references: 'parent_table(id)',
      onDelete: 'CASCADE'
    }
  });
};
```

### Rename Column (Three-Phase)

```javascript
// Phase 1: Add new column + trigger
exports.up = (pgm) => {
  pgm.addColumn('table_name', {
    new_name: { type: 'same_type', notNull: false }
  });
  
  pgm.sql(`UPDATE table_name SET new_name = old_name`);
  
  pgm.sql(`
    CREATE FUNCTION sync_columns() RETURNS TRIGGER AS $$
    BEGIN
      NEW.new_name := NEW.old_name;
      NEW.old_name := NEW.new_name;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    
    CREATE TRIGGER sync_trigger
    BEFORE UPDATE ON table_name
    FOR EACH ROW EXECUTE FUNCTION sync_columns();
  `);
};

// Phase 2: Update application code to use new_name

// Phase 3: Drop old column
exports.up = (pgm) => {
  pgm.sql('DROP TRIGGER sync_trigger ON table_name');
  pgm.sql('DROP FUNCTION sync_columns()');
  pgm.dropColumn('table_name', 'old_name');
};
```

---

## Integrity Verdict Structure

The `integrity_verdict` JSONB field in attendance table:

```json
{
  "geofence_check": {
    "passed": true,
    "distance_meters": 45.2,
    "within_boundary": true,
    "office_id": "uuid"
  },
  "network_check": {
    "passed": true,
    "ssid": "CompanyWiFi-SF",
    "bssid": "00:11:22:33:44:55",
    "matched": true,
    "office_network_id": "uuid"
  },
  "device_trust": {
    "passed": true,
    "is_trusted_device": true,
    "device_id": "uuid",
    "last_seen": "2024-01-15T09:00:00Z"
  },
  "beacon_proximity": {
    "passed": true,
    "beacon_id": "uuid",
    "uuid": "f7826da6-4fa2-4e98-8024-bc5b71e0893e",
    "major": 1,
    "minor": 1,
    "rssi": -65,
    "distance_estimate": "immediate"
  },
  "nfc_verification": {
    "passed": true,
    "nfc_tag_id": "uuid",
    "tag_uid": "E004010123456789"
  },
  "policy_compliance": {
    "passed": true,
    "policy_id": "uuid",
    "within_working_hours": true,
    "is_working_day": true
  },
  "timestamp": "2024-01-15T09:05:30Z",
  "overall_score": 0.95,
  "risk_level": "low"
}
```

### Query Integrity Verdict

```sql
-- Get attendance with failed geofence check
SELECT * FROM attendance
WHERE integrity_verdict->'geofence_check'->>'passed' = 'false';

-- Get attendance with low overall score
SELECT * FROM attendance
WHERE (integrity_verdict->>'overall_score')::float < 0.5;

-- Get attendance verified by NFC
SELECT * FROM attendance
WHERE integrity_verdict ? 'nfc_verification'
  AND integrity_verdict->'nfc_verification'->>'passed' = 'true';
```

---

## Materialized View Refresh

### Manual Refresh

```sql
-- Refresh all views
SELECT refresh_all_materialized_views();

-- Refresh specific view
SELECT refresh_daily_attendance_summary();
SELECT refresh_weekly_attendance_summary();
SELECT refresh_monthly_attendance_summary();
SELECT refresh_office_occupancy_summary();
```

### Automated Refresh (pg_cron)

```sql
-- Install pg_cron extension
CREATE EXTENSION pg_cron;

-- Schedule daily refresh at 1 AM
SELECT cron.schedule(
  'daily-attendance-refresh',
  '0 1 * * *',
  'SELECT refresh_daily_attendance_summary();'
);

-- Schedule weekly refresh (Monday 2 AM)
SELECT cron.schedule(
  'weekly-attendance-refresh',
  '0 2 * * 1',
  'SELECT refresh_weekly_attendance_summary();'
);

-- Schedule monthly refresh (1st day, 3 AM)
SELECT cron.schedule(
  'monthly-attendance-refresh',
  '0 3 1 * *',
  'SELECT refresh_monthly_attendance_summary();'
);

-- List scheduled jobs
SELECT * FROM cron.job;

-- Remove scheduled job
SELECT cron.unschedule('daily-attendance-refresh');
```

---

## Performance Monitoring

### Index Usage

```sql
-- Find unused indexes
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Slow Queries

```sql
-- Enable pg_stat_statements
CREATE EXTENSION pg_stat_statements;

-- Find slowest queries
SELECT 
  query,
  calls,
  ROUND(total_exec_time::numeric / 1000, 2) as total_seconds,
  ROUND(mean_exec_time::numeric, 2) as mean_ms,
  ROUND((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 2) as percentage
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

### Table Bloat

```sql
-- Check table sizes
SELECT 
  schemaname || '.' || tablename as table,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Vacuum and analyze
VACUUM ANALYZE attendance;
```

### Active Connections

```sql
-- Check active connections
SELECT 
  datname,
  usename,
  application_name,
  client_addr,
  state,
  query,
  state_change
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY state_change;

-- Kill long-running query
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE pid = <pid>;
```

---

## Backup and Restore

### Backup

```bash
# Full database backup
pg_dump -Fc $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).dump

# Schema only
pg_dump -s $DATABASE_URL > schema_$(date +%Y%m%d).sql

# Single table
pg_dump -t attendance $DATABASE_URL > attendance_backup.sql

# Compressed backup
pg_dump $DATABASE_URL | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore

```bash
# Restore from custom format
pg_restore -d $DATABASE_URL backup.dump

# Restore from SQL
psql $DATABASE_URL < backup.sql

# Restore single table
psql $DATABASE_URL < attendance_backup.sql
```

---

## Troubleshooting

### Migration Stuck

```sql
-- Check for locks
SELECT 
  pid,
  usename,
  pg_blocking_pids(pid) as blocked_by,
  query
FROM pg_stat_activity
WHERE cardinality(pg_blocking_pids(pid)) > 0;

-- Kill blocking process
SELECT pg_terminate_backend(<pid>);
```

### PostGIS Not Working

```sql
-- Check if PostGIS is installed
SELECT PostGIS_Version();

-- Install PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify
SELECT * FROM pg_extension WHERE extname = 'postgis';
```

### Connection Pool Exhausted

```bash
# Check max connections
psql $DATABASE_URL -c "SHOW max_connections;"

# Check current connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Increase max_connections (requires restart)
ALTER SYSTEM SET max_connections = 200;
```

---

## Environment Variables

```bash
# Database connection
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Individual components
PGHOST=localhost
PGPORT=5432
PGDATABASE=attendance_db
PGUSER=username
PGPASSWORD=password

# SSL (for production)
PGSSLMODE=require
```

---

## Quick Checks

### Verify Schema

```sql
-- List all tables
\dt

-- Describe table
\d attendance

-- List indexes
\di

-- List materialized views
\dm

-- List functions
\df
```

### Verify Data

```sql
-- Count records
SELECT 
  'app_users' as table, COUNT(*) as count FROM app_users
UNION ALL
SELECT 'offices', COUNT(*) FROM offices
UNION ALL
SELECT 'attendance', COUNT(*) FROM attendance;

-- Check for NULLs in important columns
SELECT COUNT(*) FROM attendance WHERE check_in_location IS NULL;
SELECT COUNT(*) FROM offices WHERE boundary IS NULL;
```

### Health Check

```sql
-- Database size
SELECT pg_size_pretty(pg_database_size(current_database()));

-- Last vacuum time
SELECT 
  relname,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public';

-- Replication lag (if applicable)
SELECT 
  client_addr,
  state,
  sync_state,
  pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) as send_lag,
  pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) as replay_lag
FROM pg_stat_replication;
```
