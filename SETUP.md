# Setup Guide

This guide will help you set up the attendance management system database from scratch.

## Prerequisites

### System Requirements
- PostgreSQL 12+ with PostGIS 3.0+
- Node.js 16+
- npm or yarn

### Install PostgreSQL with PostGIS

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install postgresql-14 postgresql-14-postgis-3
sudo systemctl start postgresql
```

#### macOS (Homebrew)
```bash
brew install postgresql postgis
brew services start postgresql
```

#### Docker
```bash
docker run -d \
  --name attendance-postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=attendance_db \
  -p 5432:5432 \
  postgis/postgis:14-3.3
```

---

## Step 1: Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE attendance_db;

# Connect to the new database
\c attendance_db

# Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

# Verify PostGIS installation
SELECT PostGIS_Version();

# Exit psql
\q
```

---

## Step 2: Clone and Install

```bash
# Clone repository (if applicable)
git clone <repository-url>
cd attendance-system

# Install dependencies
npm install
```

---

## Step 3: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env file
nano .env
```

Update `.env` with your credentials:

```env
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/attendance_db
PGHOST=localhost
PGPORT=5432
PGDATABASE=attendance_db
PGUSER=postgres
PGPASSWORD=yourpassword
```

---

## Step 4: Run Migrations

```bash
# Check migration status
npm run migrate:status

# Run all migrations
npm run migrate:up

# Verify migrations
npm run migrate:status
```

Expected output:
```
┌───┬─────────────────────────────────────────────┬────────────────────────┐
│ # │ Migration                                   │ Migrated at            │
├───┼─────────────────────────────────────────────┼────────────────────────┤
│ 1 │ enable-postgis-extension                    │ 2024-01-15 10:30:45    │
│ 2 │ create-app-users-table                      │ 2024-01-15 10:30:46    │
│ 3 │ create-offices-table                        │ 2024-01-15 10:30:47    │
│ 4 │ create-office-networks-table                │ 2024-01-15 10:30:47    │
│ 5 │ create-beacons-table                        │ 2024-01-15 10:30:48    │
│ 6 │ create-nfc-tags-table                       │ 2024-01-15 10:30:48    │
│ 7 │ create-devices-table                        │ 2024-01-15 10:30:49    │
│ 8 │ create-policy-sets-table                    │ 2024-01-15 10:30:49    │
│ 9 │ create-attendance-table                     │ 2024-01-15 10:30:50    │
│10 │ create-leaves-table                         │ 2024-01-15 10:30:51    │
│11 │ create-audit-logs-table                     │ 2024-01-15 10:30:51    │
│12 │ create-reporting-views                      │ 2024-01-15 10:30:52    │
│13 │ create-materialized-view-refresh-functions  │ 2024-01-15 10:30:52    │
└───┴─────────────────────────────────────────────┴────────────────────────┘
```

---

## Step 5: Seed Sample Data (Optional)

```bash
# Load sample data
npm run db:seed
```

This will create:
- 3 offices (San Francisco, New York, London)
- 5 sample users
- 5 devices
- 3 policy sets
- WiFi networks, beacons, and NFC tags

---

## Step 6: Verify Installation

```bash
# Connect to database
psql $DATABASE_URL

# Check tables
\dt

# Check materialized views
\dm

# Check sample data
SELECT COUNT(*) FROM app_users;
SELECT COUNT(*) FROM offices;
SELECT COUNT(*) FROM attendance;

# Test PostGIS
SELECT name, ST_AsText(boundary::geometry) 
FROM offices 
LIMIT 1;

# Exit
\q
```

---

## Step 7: Set Up Automated Materialized View Refresh (Optional)

### Option 1: Using pg_cron (Recommended for Production)

```bash
# Connect to database as superuser
psql $DATABASE_URL

# Enable pg_cron extension
CREATE EXTENSION pg_cron;

# Schedule daily refresh at 1 AM
SELECT cron.schedule(
  'daily-attendance-refresh',
  '0 1 * * *',
  'SELECT refresh_daily_attendance_summary();'
);

# Schedule weekly refresh (Monday 2 AM)
SELECT cron.schedule(
  'weekly-attendance-refresh',
  '0 2 * * 1',
  'SELECT refresh_weekly_attendance_summary();'
);

# Schedule monthly refresh (1st day, 3 AM)
SELECT cron.schedule(
  'monthly-attendance-refresh',
  '0 3 1 * *',
  'SELECT refresh_monthly_attendance_summary();'
);

# Schedule office occupancy refresh (daily at 2 AM)
SELECT cron.schedule(
  'office-occupancy-refresh',
  '0 2 * * *',
  'SELECT refresh_office_occupancy_summary();'
);

# Verify scheduled jobs
SELECT * FROM cron.job;
```

### Option 2: Using System Cron

Create a script `/home/your-user/refresh-views.sh`:

```bash
#!/bin/bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/attendance_db"
psql $DATABASE_URL -c "SELECT refresh_all_materialized_views();"
```

Make it executable and add to crontab:

```bash
chmod +x /home/your-user/refresh-views.sh

# Edit crontab
crontab -e

# Add line (runs daily at 2 AM):
0 2 * * * /home/your-user/refresh-views.sh >> /var/log/refresh-views.log 2>&1
```

---

## Production Setup

### 1. Connection Pooling

For production, use a connection pooler like PgBouncer:

```bash
# Install PgBouncer
sudo apt-get install pgbouncer

# Configure /etc/pgbouncer/pgbouncer.ini
[databases]
attendance_db = host=localhost port=5432 dbname=attendance_db

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
```

Update `.env`:
```env
DATABASE_URL=postgresql://user:pass@localhost:6432/attendance_db
```

### 2. SSL/TLS

Enable SSL in PostgreSQL:

```bash
# Generate SSL certificate
sudo openssl req -new -x509 -days 365 -nodes -text \
  -out /var/lib/postgresql/server.crt \
  -keyout /var/lib/postgresql/server.key

# Update postgresql.conf
ssl = on
ssl_cert_file = '/var/lib/postgresql/server.crt'
ssl_key_file = '/var/lib/postgresql/server.key'

# Restart PostgreSQL
sudo systemctl restart postgresql
```

Update `.env`:
```env
PGSSLMODE=require
```

### 3. Backups

Set up automated backups:

```bash
# Create backup script
cat > /home/postgres/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATABASE="attendance_db"

mkdir -p $BACKUP_DIR

# Full backup
pg_dump -Fc $DATABASE > $BACKUP_DIR/${DATABASE}_${TIMESTAMP}.dump

# Keep only last 7 days
find $BACKUP_DIR -name "${DATABASE}_*.dump" -mtime +7 -delete

echo "Backup completed: ${DATABASE}_${TIMESTAMP}.dump"
EOF

chmod +x /home/postgres/backup.sh

# Schedule daily backups (3 AM)
echo "0 3 * * * /home/postgres/backup.sh >> /var/log/postgres-backup.log 2>&1" | crontab -
```

### 4. Monitoring

Install and configure pg_stat_statements:

```sql
-- Add to postgresql.conf
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all

-- Restart PostgreSQL
-- Then in database:
CREATE EXTENSION pg_stat_statements;

-- Query slow queries
SELECT 
  query,
  calls,
  ROUND(mean_exec_time::numeric, 2) as mean_ms
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### 5. Performance Tuning

Update `postgresql.conf` for production:

```conf
# Memory Settings
shared_buffers = 4GB                 # 25% of RAM
effective_cache_size = 12GB          # 75% of RAM
maintenance_work_mem = 1GB
work_mem = 64MB

# Checkpoint Settings
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100

# Query Planning
random_page_cost = 1.1              # For SSD
effective_io_concurrency = 200      # For SSD

# Connection Settings
max_connections = 200

# Logging
log_min_duration_statement = 1000   # Log queries > 1 second
log_line_prefix = '%m [%p] %u@%d '
log_statement = 'ddl'
```

---

## Development Setup

### 1. Local Development Database

```bash
# Create separate dev database
createdb attendance_db_dev

# Copy .env to .env.development
cp .env .env.development

# Edit .env.development
PGDATABASE=attendance_db_dev

# Run migrations
NODE_ENV=development npm run migrate:up

# Seed data
NODE_ENV=development npm run db:seed
```

### 2. Testing Database

```bash
# Create test database
createdb attendance_db_test

# Copy .env to .env.test
cp .env .env.test

# Edit .env.test
PGDATABASE=attendance_db_test

# Run migrations for tests
NODE_ENV=test npm run migrate:up
```

---

## Troubleshooting

### Issue: "PostGIS extension not found"

```bash
# Check PostGIS installation
psql -U postgres -c "SELECT * FROM pg_available_extensions WHERE name LIKE '%postgis%';"

# If not installed, install PostGIS
sudo apt-get install postgresql-14-postgis-3

# Or for macOS
brew install postgis
```

### Issue: "Permission denied for schema public"

```sql
-- Grant permissions
GRANT ALL ON SCHEMA public TO your_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
```

### Issue: "Connection refused"

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Start PostgreSQL
sudo systemctl start postgresql

# Check port
sudo netstat -plnt | grep 5432
```

### Issue: "Too many connections"

```sql
-- Check current connections
SELECT count(*) FROM pg_stat_activity;

-- Check max connections
SHOW max_connections;

-- Increase max connections
ALTER SYSTEM SET max_connections = 200;

-- Restart PostgreSQL
sudo systemctl restart postgresql
```

### Issue: Migration fails mid-way

```bash
# Check migration status
npm run migrate:status

# Manually fix the database state
psql $DATABASE_URL

# Then retry or rollback
npm run migrate:down
npm run migrate:up
```

---

## Next Steps

1. **Read Documentation**:
   - [README.md](./README.md) - Overview and features
   - [docs/SCHEMA_OVERVIEW.md](./docs/SCHEMA_OVERVIEW.md) - Database schema details
   - [docs/ZERO_DOWNTIME_WORKFLOW.md](./docs/ZERO_DOWNTIME_WORKFLOW.md) - Migration best practices
   - [docs/QUICK_REFERENCE.md](./docs/QUICK_REFERENCE.md) - Common queries and commands

2. **Create Your First Migration**:
   ```bash
   npm run migrate:create add-my-feature
   # Edit migrations/<timestamp>_add-my-feature.js
   npm run migrate:up
   ```

3. **Set Up Application**:
   - Connect your application to the database
   - Implement attendance tracking logic
   - Set up authentication using `app_users` table

4. **Configure Monitoring**:
   - Set up database monitoring
   - Configure alerting for slow queries
   - Monitor materialized view refresh

5. **Plan Backups**:
   - Set up automated backups
   - Test restore procedures
   - Document disaster recovery plan

---

## Support

For issues or questions:
- Check [docs/QUICK_REFERENCE.md](./docs/QUICK_REFERENCE.md) for common solutions
- Review migration logs: `SELECT * FROM pgmigrations;`
- Check PostgreSQL logs: `sudo tail -f /var/log/postgresql/postgresql-14-main.log`

## Security Checklist

- [ ] Strong passwords for database users
- [ ] SSL/TLS enabled for connections
- [ ] Firewall configured to restrict database access
- [ ] Regular security updates applied
- [ ] Backup encryption enabled
- [ ] Audit logging configured
- [ ] Principle of least privilege for database users
- [ ] Connection pooling configured
- [ ] Rate limiting on authentication endpoints
- [ ] Regular backup testing
