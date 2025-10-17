# Attendance Management System - Database Schema & Services

This repository contains the database schema, migration framework, and presence factor services for an attendance management system with geolocation tracking capabilities using PostGIS.

## Features

### Database & Schema
- **PostGIS Integration**: Geographic data types for office boundaries, check-in/out locations
- **Comprehensive Schema**: Tables for users, devices, offices, beacons, NFC tags, attendance, leaves, and audit logs
- **Integrity Verification**: JSONB field for storing integrity check results and cryptographic signatures
- **Materialized Views**: Pre-computed reporting views for daily, weekly, and monthly attendance summaries
- **Zero-Downtime Migrations**: Expand/backfill/contract pattern for production deployments
- **Audit Trail**: Complete audit logging for all critical operations

### Services & Repositories
- **Repository Layer**: Data access with PostGIS queries and caching support
- **Geo Validator**: Location validation using ST_DWithin/ST_Contains with configurable distance tolerance
- **Wi-Fi Matcher**: BSSID/SSID matching for network-based presence verification
- **Beacon Proximity**: Bluetooth beacon detection with RSSI-based distance estimation
- **NFC Verifier**: NFC tag verification with location validation
- **QR Token Generator**: HMAC-based dynamic QR codes with 30-60s TTL
- **Face Recognition**: Pluggable face recognition with liveness detection and mock adapter

## Prerequisites

- PostgreSQL 12+ with PostGIS extension
- Node.js 16+
- npm or yarn

## Installation

1. Install dependencies:

```bash
npm install
```

2. Configure database connection:

```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. Run migrations:

```bash
npm run migrate:up
```

4. Build the TypeScript services:

```bash
npm run build
```

5. Seed baseline data (optional):

```bash
npm run db:seed
```

## Quick Start

### Using the Services

```typescript
import { Pool } from 'pg';
import {
  InMemoryCache,
  OfficeRepository,
  GeoValidatorService,
  WiFiMatcherService,
  QrTokenGeneratorService,
} from 'attendance-system';

// Initialize
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const cache = new InMemoryCache();
const officeRepo = new OfficeRepository({ pool, cache });

// Geo validation
const geoValidator = new GeoValidatorService({
  officeRepository: officeRepo,
  defaultDistanceTolerance: 100,
});

const result = await geoValidator.validateLocation({
  latitude: 37.7749,
  longitude: -122.4194,
});

console.log(result); // { valid: true, distance_meters: 45.2, ... }
```

See [src/README.md](src/README.md) and [examples/usage-example.ts](examples/usage-example.ts) for comprehensive usage examples.

## Database Schema

### Core Tables

#### `app_users`
User accounts with authentication and role management.
- Supports admin, manager, and employee roles
- Includes employee ID, department, and contact information
- Tracks last login and account status

#### `offices`
Office locations with geographic boundaries.
- Uses PostGIS `GEOGRAPHY(Polygon)` for office boundaries
- Supports timezone-aware operations
- Includes full address information

#### `office_networks`
WiFi networks associated with offices for network-based verification.
- Tracks SSID and BSSID (MAC address)
- Supports multiple networks per office

#### `beacons`
Bluetooth beacons for proximity-based check-ins.
- iBeacon format (UUID, major, minor)
- Geographic location tracking
- Multiple beacons per office

#### `nfc_tags`
NFC tags for tap-based check-ins.
- Unique tag UIDs
- Geographic location tracking
- Tag type specification

#### `devices`
User devices with trust levels.
- Device identification and fingerprinting
- Push notification token storage
- Trust status for attendance verification

#### `attendance`
Attendance records with comprehensive tracking.
- Check-in and check-out times with locations
- Multiple verification methods (GPS, WiFi, beacon, NFC)
- `integrity_verdict` JSONB field for verification results
- Cryptographic signatures for tamper detection
- Automatic work duration calculation

#### `leaves`
Leave/absence management.
- Multiple leave types (sick, vacation, personal, etc.)
- Approval workflow with status tracking
- Support for half-days
- Document attachments

#### `audit_logs`
Complete audit trail for all operations.
- Tracks old and new values
- IP address and user agent logging
- JSONB metadata for flexible context storage

#### `policy_sets`
Attendance policies per office or globally.
- Working hours configuration
- Late and early departure thresholds
- Verification method requirements
- Priority-based policy application

### Materialized Views

#### `daily_attendance_summary`
Daily attendance statistics per user and office.
- First/last check-in times
- Total work duration
- Late arrivals and early departures
- Detailed attendance breakdown

**Refresh Policy**: Daily at midnight

#### `weekly_attendance_summary`
Weekly aggregated attendance data.
- Days present per week
- Total work hours
- Attendance patterns

**Refresh Policy**: Weekly on Monday morning

#### `monthly_attendance_summary`
Monthly attendance reports.
- Monthly work hours
- Attendance compliance metrics
- Department-level statistics

**Refresh Policy**: Monthly on the first day

#### `office_occupancy_summary`
Hourly office occupancy tracking.
- Peak usage hours
- Department distribution
- Capacity planning metrics

**Refresh Policy**: Daily

### Refresh Materialized Views

Use the provided helper functions:

```sql
-- Refresh all views
SELECT refresh_all_materialized_views();

-- Refresh specific view
SELECT refresh_daily_attendance_summary();
SELECT refresh_weekly_attendance_summary();
SELECT refresh_monthly_attendance_summary();
SELECT refresh_office_occupancy_summary();
```

For automated refreshes, set up pg_cron or external cron jobs:

```sql
-- Using pg_cron extension
SELECT cron.schedule('refresh-daily-views', '0 0 * * *', 'SELECT refresh_all_materialized_views();');
```

## Migration Commands

```bash
# Run all pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down

# Check migration status
npm run migrate:status

# Create new migration
npm run migrate:create <migration-name>

# Seed database
npm run db:seed
```

## Zero-Downtime Migration Strategy

This project follows the **Expand/Backfill/Contract** pattern for production deployments.

### Pattern Overview

1. **Expand**: Add new schema elements without breaking existing code
2. **Backfill**: Migrate data from old to new schema
3. **Contract**: Remove old schema elements after code is fully migrated

### Example: Adding a New Column

#### Phase 1: Expand (Migration 1)

```javascript
exports.up = (pgm) => {
  // Add new column with NULL allowed
  pgm.addColumn('app_users', {
    middle_name: { type: 'varchar(100)', notNull: false }
  });
  
  // Add comment for documentation
  pgm.sql(`COMMENT ON COLUMN app_users.middle_name IS 
    'Middle name - Added in Phase 1 (Expand)'`);
};
```

**Deploy**: Run migration, deploy new code that can handle NULL values

#### Phase 2: Backfill (Migration 2)

```javascript
exports.up = (pgm) => {
  // Backfill data in batches to avoid locks
  pgm.sql(`
    UPDATE app_users 
    SET middle_name = COALESCE(
      (SELECT middle_name FROM legacy_users WHERE legacy_users.id = app_users.id),
      ''
    )
    WHERE middle_name IS NULL;
  `);
};
```

**Deploy**: Run migration during low-traffic period

#### Phase 3: Contract (Migration 3)

```javascript
exports.up = (pgm) => {
  // Now safe to add NOT NULL constraint
  pgm.alterColumn('app_users', 'middle_name', {
    notNull: true,
    default: ''
  });
  
  // Remove old columns if any
  pgm.dropColumn('legacy_table', 'old_column');
};
```

**Deploy**: Run migration after all code is updated

### Example: Renaming a Column

#### Phase 1: Expand

```javascript
exports.up = (pgm) => {
  // Add new column
  pgm.addColumn('attendance', {
    check_in_timestamp: { 
      type: 'timestamp with time zone',
      notNull: false 
    }
  });
  
  // Copy data
  pgm.sql(`
    UPDATE attendance 
    SET check_in_timestamp = check_in_time;
  `);
  
  // Create trigger to keep both in sync
  pgm.sql(`
    CREATE OR REPLACE FUNCTION sync_check_in_columns()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.check_in_time IS NOT NULL THEN
        NEW.check_in_timestamp := NEW.check_in_time;
      END IF;
      IF NEW.check_in_timestamp IS NOT NULL THEN
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
};
```

#### Phase 2: Update Code

Deploy application code to use `check_in_timestamp` instead of `check_in_time`

#### Phase 3: Contract

```javascript
exports.up = (pgm) => {
  // Drop trigger
  pgm.sql('DROP TRIGGER IF EXISTS sync_check_in_trigger ON attendance;');
  pgm.sql('DROP FUNCTION IF EXISTS sync_check_in_columns();');
  
  // Drop old column
  pgm.dropColumn('attendance', 'check_in_time');
  
  // Add NOT NULL constraint
  pgm.alterColumn('attendance', 'check_in_timestamp', {
    notNull: true
  });
};
```

### Example: Adding a New Index

```javascript
exports.up = (pgm) => {
  // Create index CONCURRENTLY to avoid blocking
  pgm.sql(`
    CREATE INDEX CONCURRENTLY idx_attendance_user_date 
    ON attendance (user_id, DATE(check_in_time));
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_attendance_user_date;');
};
```

### Best Practices

1. **Never drop columns directly** - Use expand/backfill/contract
2. **Always use CONCURRENTLY** for index operations
3. **Test rollback procedures** - Ensure `down` migrations work
4. **Batch large updates** - Process in chunks to avoid long locks
5. **Monitor query performance** - Check explain plans before and after
6. **Coordinate with deployments** - Align migration phases with code releases
7. **Use transactions carefully** - Some operations can't run in transactions (CREATE INDEX CONCURRENTLY)
8. **Document breaking changes** - Add comments to migrations

## Security Considerations

### Password Hashing

User passwords are hashed using PostgreSQL's `pgcrypto` extension with bcrypt:

```sql
-- Hash password
INSERT INTO app_users (email, password_hash, ...)
VALUES ('user@example.com', crypt('password123', gen_salt('bf')), ...);

-- Verify password
SELECT * FROM app_users 
WHERE email = 'user@example.com' 
  AND password_hash = crypt('input_password', password_hash);
```

### Data Integrity

The `integrity_verdict` JSONB field stores verification results:

```json
{
  "geofence_check": {
    "passed": true,
    "distance_meters": 45.2,
    "within_boundary": true
  },
  "network_check": {
    "passed": true,
    "ssid": "CompanyWiFi-SF",
    "matched": true
  },
  "device_trust": {
    "passed": true,
    "is_trusted_device": true,
    "device_id": "uuid"
  },
  "beacon_proximity": {
    "passed": true,
    "beacon_uuid": "...",
    "rssi": -65
  },
  "timestamp": "2024-01-15T09:05:30Z",
  "overall_score": 0.95
}
```

### Cryptographic Signatures

Attendance records can be signed to prevent tampering:

```javascript
// Generate signature (example using HMAC)
const crypto = require('crypto');

function signAttendanceData(data, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(data))
    .digest('hex');
}

// Store in signature_check_in field
```

## Monitoring and Maintenance

### Index Usage

```sql
-- Check unused indexes
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE '%_pkey';
```

### Table Sizes

```sql
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Vacuum and Analyze

```sql
-- Vacuum all tables
VACUUM ANALYZE;

-- Vacuum specific table
VACUUM ANALYZE attendance;
```

## Troubleshooting

### Migration Fails

```bash
# Check current migration status
npm run migrate:status

# Rollback problematic migration
npm run migrate:down

# Fix migration file and try again
npm run migrate:up
```

### PostGIS Extension Not Available

```sql
-- Check available extensions
SELECT * FROM pg_available_extensions WHERE name LIKE '%postgis%';

-- Install PostGIS (system level)
-- Ubuntu/Debian:
sudo apt-get install postgresql-14-postgis-3

-- Then enable in database
CREATE EXTENSION postgis;
```

### Slow Queries

```sql
-- Enable query logging
ALTER DATABASE attendance_db SET log_min_duration_statement = 1000;

-- Check slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 20;
```

## Contributing

When adding new migrations:

1. Create migration with descriptive name
2. Include both `up` and `down` functions
3. Add appropriate indexes
4. Update this README if adding new tables/views
5. Test both migration and rollback
6. Follow zero-downtime patterns for production changes

## License

MIT
