# Database Schema Overview

## Entity Relationship Diagram

```
┌─────────────────┐
│   app_users     │
├─────────────────┤
│ id (PK)         │
│ email           │
│ full_name       │
│ phone_number    │
│ role            │
│ department      │
│ employee_id     │
│ password_hash   │
│ is_active       │
│ last_login_at   │
│ created_at      │
│ updated_at      │
└─────────────────┘
         │
         │ 1:N
         │
    ┌────┴─────┬────────────────┬──────────────┐
    │          │                │              │
    ▼          ▼                ▼              ▼
┌─────────┐  ┌──────────┐  ┌────────────┐  ┌────────┐
│ devices │  │ attendance│  │   leaves   │  │ audit  │
├─────────┤  ├──────────┤  ├────────────┤  │  _logs │
│ id (PK) │  │ id (PK)  │  │ id (PK)    │  ├────────┤
│user_id  │  │user_id   │  │ user_id    │  │id (PK) │
│device_  │  │device_id │  │ leave_type │  │user_id │
│ identifier│ │office_id │  │ start_date │  │entity  │
│device_  │  │policy_   │  │ end_date   │  │ _type  │
│ name    │  │ set_id   │  │ total_days │  │entity  │
│device_  │  │check_in  │  │ reason     │  │ _id    │
│ type    │  │ _time    │  │ status     │  │action  │
│is_trusted│ │check_out │  │approved_by │  │old_    │
│is_active│  │ _time    │  │approved_at │  │ values │
└─────────┘  │check_in  │  │rejection   │  │new_    │
             │ _location│  │ _reason    │  │ values │
             │check_out │  │attachment  │  │metadata│
             │ _location│  │ _urls      │  └────────┘
             │check_in  │  └────────────┘
             │ _method  │
             │check_out │
             │ _method  │
             │beacon_id │
             │nfc_tag_id│
             │network   │
             │ _ssid    │
             │status    │
             │work_     │
             │ duration │
             │integrity │
             │ _verdict │
             │signature │
             │ _check_in│
             │signature │
             │ _check_  │
             │  out     │
             └──────────┘
                  │
                  │
    ┌─────────────┼─────────────┐
    │             │             │
    ▼             ▼             ▼
┌─────────┐  ┌─────────┐  ┌──────────┐
│ offices │  │ beacons │  │ nfc_tags │
├─────────┤  ├─────────┤  ├──────────┤
│ id (PK) │  │ id (PK) │  │ id (PK)  │
│ name    │  │office_id│  │office_id │
│ address │  │ uuid    │  │ tag_uid  │
│ city    │  │ major   │  │ tag_type │
│ state   │  │ minor   │  │location  │
│ country │  │location │  │ _descrip │
│ postal  │  │ _descrip│  │ tion     │
│  _code  │  │  tion   │  │location  │
│ boundary│  │location │  │ _point   │
│(GEOGRAPHY│ │ _point  │  │is_active │
│ POLYGON)│  │is_active│  └──────────┘
│timezone │  └─────────┘
│is_active│
└─────────┘
    │
    │ 1:N
    │
    ▼
┌──────────────┐
│office_       │
│ networks     │
├──────────────┤
│ id (PK)      │
│ office_id    │
│ ssid         │
│ bssid        │
│ network_type │
│ is_active    │
└──────────────┘

┌──────────────┐
│ policy_sets  │
├──────────────┤
│ id (PK)      │
│ name         │
│ description  │
│ office_id    │
│ working_hours│
│  _start      │
│ working_hours│
│  _end        │
│ working_days │
│ late_        │
│  threshold   │
│ early_       │
│  departure   │
│  threshold   │
│ require_     │
│  geofence    │
│ require_     │
│  network_    │
│  validation  │
│ require_     │
│  beacon_     │
│  proximity   │
│ require_nfc  │
│  _tap        │
│ max_checkin  │
│  _distance   │
│ is_active    │
│ priority     │
└──────────────┘
```

## Materialized Views

```
┌─────────────────────────┐
│ daily_attendance_       │
│    summary              │
├─────────────────────────┤
│ attendance_date         │
│ office_id               │
│ office_name             │
│ user_id                 │
│ full_name               │
│ department              │
│ check_in_count          │
│ first_check_in          │
│ last_check_out          │
│ total_work_minutes      │
│ avg_work_minutes        │
│ late_count              │
│ early_departure_count   │
│ missing_checkout_count  │
│ attendance_details      │
│   (JSONB)               │
└─────────────────────────┘
            │
            │ Aggregates
            ▼
┌─────────────────────────┐
│ weekly_attendance_      │
│    summary              │
├─────────────────────────┤
│ week_start_date         │
│ office_id               │
│ office_name             │
│ user_id                 │
│ full_name               │
│ department              │
│ days_present            │
│ total_check_ins         │
│ total_work_minutes      │
│ avg_daily_work_minutes  │
│ total_late_count        │
│ total_early_departure   │
│  _count                 │
│ total_missing_checkout  │
│  _count                 │
│ earliest_check_in_time  │
│ latest_check_out_time   │
└─────────────────────────┘
            │
            │ Aggregates
            ▼
┌─────────────────────────┐
│ monthly_attendance_     │
│    summary              │
├─────────────────────────┤
│ month_start_date        │
│ year                    │
│ month                   │
│ office_id               │
│ office_name             │
│ user_id                 │
│ full_name               │
│ department              │
│ days_present            │
│ total_check_ins         │
│ total_work_minutes      │
│ avg_daily_work_minutes  │
│ total_late_count        │
│ total_early_departure   │
│  _count                 │
│ total_missing_checkout  │
│  _count                 │
│ earliest_check_in_time  │
│ latest_check_out_time   │
│ total_work_hours        │
└─────────────────────────┘

┌─────────────────────────┐
│ office_occupancy_       │
│    summary              │
├─────────────────────────┤
│ occupancy_date          │
│ hour                    │
│ office_id               │
│ office_name             │
│ city                    │
│ country                 │
│ unique_users            │
│ total_check_ins         │
│ departments_present     │
└─────────────────────────┘
```

## Table Descriptions

### Core Tables

#### `app_users`
**Purpose**: Store user accounts and authentication information.

**Key Features**:
- Supports role-based access (admin, manager, employee)
- Password hashing using pgcrypto
- Department and employee ID tracking
- Active/inactive status management

**Common Queries**:
```sql
-- Get active employees by department
SELECT * FROM app_users 
WHERE is_active = true 
  AND department = 'Engineering'
ORDER BY full_name;

-- Authenticate user
SELECT * FROM app_users 
WHERE email = $1 
  AND password_hash = crypt($2, password_hash)
  AND is_active = true;
```

---

#### `offices`
**Purpose**: Define office locations with geographic boundaries.

**Key Features**:
- PostGIS GEOGRAPHY polygon for precise boundary definition
- Timezone support for accurate time calculations
- Multi-country/multi-city support

**Common Queries**:
```sql
-- Check if point is within office boundary
SELECT * FROM offices 
WHERE ST_Contains(
  boundary::geometry, 
  ST_GeogFromText('POINT(-122.4189 37.7744)')::geometry
)
AND is_active = true;

-- Get offices near a location (within 10km)
SELECT id, name, 
  ST_Distance(boundary, ST_GeogFromText('POINT(-122.4189 37.7744)')) as distance_meters
FROM offices
WHERE ST_DWithin(boundary, ST_GeogFromText('POINT(-122.4189 37.7744)'), 10000)
ORDER BY distance_meters;
```

---

#### `devices`
**Purpose**: Track user devices and their trust status.

**Key Features**:
- Device fingerprinting
- Trust level for attendance verification
- Push notification token storage
- Last seen tracking

**Common Queries**:
```sql
-- Get user's trusted devices
SELECT * FROM devices 
WHERE user_id = $1 
  AND is_trusted = true 
  AND is_active = true;

-- Check if device exists and is trusted
SELECT is_trusted FROM devices 
WHERE device_identifier = $1 
  AND is_active = true;
```

---

#### `attendance`
**Purpose**: Record attendance with comprehensive verification data.

**Key Features**:
- Multiple check-in methods (GPS, WiFi, beacon, NFC)
- Integrity verdict JSONB for flexible verification results
- Cryptographic signatures for tamper detection
- Automatic work duration calculation
- Geographic location tracking with PostGIS

**Common Queries**:
```sql
-- Get today's attendance for a user
SELECT * FROM attendance 
WHERE user_id = $1 
  AND DATE(check_in_time) = CURRENT_DATE
ORDER BY check_in_time DESC;

-- Find users currently checked in (no checkout)
SELECT u.full_name, a.check_in_time, o.name as office_name
FROM attendance a
JOIN app_users u ON a.user_id = u.id
JOIN offices o ON a.office_id = o.id
WHERE a.check_out_time IS NULL
  AND DATE(a.check_in_time) = CURRENT_DATE;

-- Get attendance with low integrity scores
SELECT * FROM attendance
WHERE (integrity_verdict->>'overall_score')::float < 0.7
  AND check_in_time >= CURRENT_DATE - INTERVAL '7 days';
```

---

#### `beacons`
**Purpose**: Manage Bluetooth beacons for proximity-based check-ins.

**Key Features**:
- iBeacon format support (UUID, major, minor)
- Geographic location tracking
- Multiple beacons per office

**Common Queries**:
```sql
-- Find beacon by iBeacon identifiers
SELECT * FROM beacons 
WHERE uuid = $1 
  AND major = $2 
  AND minor = $3 
  AND is_active = true;

-- Get all beacons for an office
SELECT * FROM beacons 
WHERE office_id = $1 
  AND is_active = true;
```

---

#### `nfc_tags`
**Purpose**: Manage NFC tags for tap-based check-ins.

**Key Features**:
- Unique tag UID tracking
- Tag type specification
- Geographic location

**Common Queries**:
```sql
-- Validate NFC tag
SELECT * FROM nfc_tags 
WHERE tag_uid = $1 
  AND is_active = true;

-- Get office from NFC tag
SELECT o.* FROM offices o
JOIN nfc_tags n ON o.id = n.office_id
WHERE n.tag_uid = $1 
  AND n.is_active = true;
```

---

#### `office_networks`
**Purpose**: Define WiFi networks for network-based verification.

**Key Features**:
- SSID and BSSID tracking
- Multiple networks per office
- Network type classification

**Common Queries**:
```sql
-- Validate network SSID
SELECT office_id FROM office_networks 
WHERE ssid = $1 
  AND is_active = true;

-- Check if BSSID matches office
SELECT * FROM office_networks 
WHERE office_id = $1 
  AND bssid = $2 
  AND is_active = true;
```

---

#### `leaves`
**Purpose**: Manage leave requests and approvals.

**Key Features**:
- Multiple leave types
- Approval workflow
- Half-day support
- Document attachments

**Common Queries**:
```sql
-- Get pending leave requests
SELECT l.*, u.full_name, u.department
FROM leaves l
JOIN app_users u ON l.user_id = u.id
WHERE l.status = 'pending'
ORDER BY l.created_at;

-- Check if user is on leave today
SELECT * FROM leaves 
WHERE user_id = $1 
  AND status = 'approved'
  AND CURRENT_DATE BETWEEN start_date AND end_date;

-- Get leave balance (requires additional logic)
SELECT 
  user_id,
  leave_type,
  SUM(total_days) as days_taken
FROM leaves
WHERE user_id = $1
  AND status = 'approved'
  AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
GROUP BY user_id, leave_type;
```

---

#### `policy_sets`
**Purpose**: Define attendance policies and requirements.

**Key Features**:
- Office-specific or global policies
- Working hours and days configuration
- Verification method requirements
- Priority-based policy application

**Common Queries**:
```sql
-- Get applicable policy for office
SELECT * FROM policy_sets 
WHERE (office_id = $1 OR office_id IS NULL)
  AND is_active = true
ORDER BY priority DESC, created_at DESC
LIMIT 1;

-- Get working days for an office
SELECT working_days FROM policy_sets 
WHERE office_id = $1 
  AND is_active = true
ORDER BY priority DESC
LIMIT 1;
```

---

#### `audit_logs`
**Purpose**: Comprehensive audit trail for all system operations.

**Key Features**:
- Old and new value tracking
- JSONB metadata for flexible context
- IP address and user agent logging
- Entity type and action classification

**Common Queries**:
```sql
-- Get audit trail for a specific entity
SELECT * FROM audit_logs 
WHERE entity_type = 'attendance' 
  AND entity_id = $1
ORDER BY created_at DESC;

-- Get user's recent actions
SELECT * FROM audit_logs 
WHERE user_id = $1 
ORDER BY created_at DESC 
LIMIT 50;

-- Track changes to sensitive data
SELECT * FROM audit_logs 
WHERE entity_type = 'app_users' 
  AND action = 'update'
  AND old_values ? 'role'
  AND old_values->>'role' != new_values->>'role'
ORDER BY created_at DESC;
```

---

### Materialized Views

#### `daily_attendance_summary`
**Purpose**: Daily attendance statistics per user and office.

**Refresh Schedule**: Daily at midnight

**Use Cases**:
- Daily attendance reports
- Performance dashboards
- Anomaly detection

---

#### `weekly_attendance_summary`
**Purpose**: Weekly aggregated attendance data.

**Refresh Schedule**: Weekly on Monday morning

**Use Cases**:
- Weekly performance reviews
- Trend analysis
- Team attendance patterns

---

#### `monthly_attendance_summary`
**Purpose**: Monthly attendance reports.

**Refresh Schedule**: Monthly on the first day

**Use Cases**:
- Payroll processing
- Monthly reports
- Compliance tracking

---

#### `office_occupancy_summary`
**Purpose**: Hourly office occupancy statistics.

**Refresh Schedule**: Daily

**Use Cases**:
- Space utilization analysis
- Peak hour identification
- Capacity planning

---

## Indexes

### B-Tree Indexes (Default)

Used for:
- Primary keys
- Foreign keys
- Equality and range queries
- ORDER BY operations

Examples:
```sql
-- User lookup
idx_app_users_email
idx_app_users_employee_id

-- Attendance queries
idx_attendance_user_id
idx_attendance_check_in_time
idx_attendance_user_id_check_in_time (composite)
```

### GiST Indexes

Used for:
- Geographic queries (PostGIS)
- Full-text search
- Range types

Examples:
```sql
-- Geographic queries
idx_offices_boundary (GIST on GEOGRAPHY)
idx_attendance_check_in_location (GIST on GEOGRAPHY)
idx_beacons_location_point (GIST on GEOGRAPHY)
```

### GIN Indexes

Used for:
- JSONB queries
- Array containment
- Full-text search

Examples:
```sql
-- JSONB queries
idx_attendance_integrity_verdict (GIN on JSONB)
idx_audit_logs_metadata (GIN on JSONB)
```

### BRIN Indexes

Used for:
- Large tables with naturally ordered data
- Time-series data
- Lower overhead than B-tree

Examples:
```sql
-- Audit logs (time-series data)
idx_audit_logs_created_at_brin (BRIN on timestamp)
```

---

## Triggers

### `update_updated_at_column()`
**Applied to**: All tables with `updated_at` column

**Purpose**: Automatically update `updated_at` timestamp on row modifications.

---

### `calculate_work_duration()`
**Applied to**: `attendance` table

**Purpose**: Automatically calculate work duration when check-out time is recorded.

---

## Functions

### Materialized View Refresh Functions

- `refresh_daily_attendance_summary()`: Refresh daily summary
- `refresh_weekly_attendance_summary()`: Refresh weekly summary
- `refresh_monthly_attendance_summary()`: Refresh monthly summary
- `refresh_office_occupancy_summary()`: Refresh occupancy data
- `refresh_all_materialized_views()`: Refresh all views at once

---

## Extensions

### postgis
Geographic data types and functions for location-based features.

### uuid-ossp
UUID generation for primary keys.

### pgcrypto
Cryptographic functions for password hashing and signatures.

---

## Performance Considerations

### Query Optimization

1. **Use indexes effectively**
   - Composite indexes for multi-column queries
   - Partial indexes for filtered queries
   - Covering indexes to avoid table lookups

2. **Partition large tables**
   - Consider partitioning `attendance` and `audit_logs` by date
   - Range partitioning for time-series data

3. **Use materialized views**
   - Pre-compute expensive aggregations
   - Refresh during off-peak hours

4. **Optimize JSONB queries**
   - Use GIN indexes
   - Extract frequently-queried fields to columns

### Maintenance

1. **Regular VACUUM ANALYZE**
   - Keep statistics up-to-date
   - Reclaim space

2. **Monitor index usage**
   - Identify unused indexes
   - Add missing indexes

3. **Reindex periodically**
   - Rebuild fragmented indexes
   - Use `REINDEX CONCURRENTLY` in production

4. **Archive old data**
   - Move historical data to archive tables
   - Keep active tables small and fast
