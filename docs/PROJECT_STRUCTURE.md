# Project Structure

```
attendance-system/
├── README.md                           # Project overview and main documentation
├── SETUP.md                            # Installation and setup guide
├── CHANGELOG.md                        # Version history and changes
├── LICENSE                             # MIT License
├── package.json                        # Node.js dependencies and scripts
├── database.json                       # Database configuration for node-pg-migrate
├── .env.example                        # Environment variables template
├── .gitignore                          # Git ignore rules
├── .node-pg-migraterc                  # Migration tool configuration
│
├── migrations/                         # Database migration files
│   ├── 1000000000001_enable-postgis-extension.js
│   ├── 1000000000002_create-app-users-table.js
│   ├── 1000000000003_create-offices-table.js
│   ├── 1000000000004_create-office-networks-table.js
│   ├── 1000000000005_create-beacons-table.js
│   ├── 1000000000006_create-nfc-tags-table.js
│   ├── 1000000000007_create-devices-table.js
│   ├── 1000000000008_create-policy-sets-table.js
│   ├── 1000000000009_create-attendance-table.js
│   ├── 1000000000010_create-leaves-table.js
│   ├── 1000000000011_create-audit-logs-table.js
│   ├── 1000000000012_create-reporting-views.js
│   └── 1000000000013_create-materialized-view-refresh-functions.js
│
├── scripts/                            # Utility scripts
│   └── seed.js                         # Sample data seeding script
│
└── docs/                               # Documentation
    ├── PROJECT_STRUCTURE.md            # This file - project organization
    ├── SCHEMA_OVERVIEW.md              # Database schema documentation
    ├── MIGRATION_TEMPLATES.md          # Zero-downtime migration patterns
    ├── ZERO_DOWNTIME_WORKFLOW.md       # Deployment workflow guide
    └── QUICK_REFERENCE.md              # Common queries and commands
```

## File Descriptions

### Root Level

#### Configuration Files

- **`package.json`**: Node.js project configuration
  - Dependencies: node-pg-migrate, pg, dotenv
  - Scripts: migrate:up, migrate:down, migrate:status, db:seed
  
- **`database.json`**: Database connection configuration for migrations
  - Development and production environments
  - Connection parameters from environment variables

- **`.env.example`**: Template for environment variables
  - Database connection parameters
  - Copy to `.env` and customize for your environment

- **`.node-pg-migraterc`**: Migration tool settings
  - Migration directory location
  - Transaction behavior
  - Migration table name

- **`.gitignore`**: Files to exclude from version control
  - node_modules/, .env, logs, etc.

#### Documentation Files

- **`README.md`**: Main project documentation
  - Features overview
  - Database schema summary
  - Migration commands
  - Zero-downtime strategies
  - Security considerations

- **`SETUP.md`**: Complete setup guide
  - Prerequisites installation
  - Database creation
  - Environment configuration
  - Production setup
  - Troubleshooting

- **`CHANGELOG.md`**: Version history
  - Release notes
  - Breaking changes
  - Migration guides

- **`LICENSE`**: MIT License

---

### `/migrations` Directory

Database migration files using node-pg-migrate format.

**Naming Convention**: `YYYYMMDDHHMMSS_description.js`

**Structure**:
```javascript
exports.up = (pgm) => {
  // Forward migration
};

exports.down = (pgm) => {
  // Rollback migration
};
```

**Execution Order** (by timestamp):
1. **Extension Setup** (0001): PostGIS, uuid-ossp, pgcrypto
2. **Core Tables** (0002-0011): Users, offices, devices, attendance, etc.
3. **Reporting** (0012-0013): Materialized views and refresh functions

**Migration Files**:

| File | Description | Key Features |
|------|-------------|--------------|
| `0001_enable-postgis-extension.js` | Enable required PostgreSQL extensions | PostGIS, uuid-ossp, pgcrypto |
| `0002_create-app-users-table.js` | User management table | RBAC, password hashing, updated_at trigger |
| `0003_create-offices-table.js` | Office locations | PostGIS GEOGRAPHY polygon, timezone support |
| `0004_create-office-networks-table.js` | WiFi networks | SSID/BSSID tracking, foreign key to offices |
| `0005_create-beacons-table.js` | Bluetooth beacons | iBeacon format, PostGIS Point location |
| `0006_create-nfc-tags-table.js` | NFC tags | Unique UID, PostGIS Point location |
| `0007_create-devices-table.js` | User devices | Trust management, push tokens |
| `0008_create-policy-sets-table.js` | Attendance policies | Working hours, verification requirements |
| `0009_create-attendance-table.js` | Attendance records | Multi-method check-in, integrity verdict JSONB |
| `0010_create-leaves-table.js` | Leave management | Approval workflow, multiple types |
| `0011_create-audit-logs-table.js` | Audit trail | JSONB metadata, old/new values tracking |
| `0012_create-reporting-views.js` | Materialized views | Daily/weekly/monthly summaries |
| `0013_create-materialized-view-refresh-functions.js` | Refresh functions | Automated view updates |

---

### `/scripts` Directory

Utility scripts for database operations.

#### `seed.js`
- **Purpose**: Populate database with sample data
- **Usage**: `npm run db:seed`
- **Creates**:
  - 3 offices (SF, NY, London) with geographic boundaries
  - 5 sample users (various roles)
  - 5 devices (trusted)
  - 3 policy sets
  - WiFi networks, beacons, NFC tags

---

### `/docs` Directory

Comprehensive documentation for the project.

#### `SCHEMA_OVERVIEW.md`
- Database schema documentation
- Entity relationship diagrams (ASCII art)
- Table descriptions with column details
- Common query patterns
- Index strategies
- Performance considerations

#### `MIGRATION_TEMPLATES.md`
- Zero-downtime migration patterns
- Template code for common operations:
  - Adding columns
  - Renaming columns
  - Changing column types
  - Adding foreign keys
  - Creating indexes
  - Splitting tables
  - Adding constraints
- Best practices and pitfalls

#### `ZERO_DOWNTIME_WORKFLOW.md`
- Complete workflow guide
- Real-world examples with timelines
- Expand/Backfill/Contract pattern explained
- Rollback procedures
- Monitoring queries
- Common pitfalls and solutions

#### `QUICK_REFERENCE.md`
- Common commands cheat sheet
- Frequently-used queries
- Migration patterns quick reference
- Integrity verdict structure
- Materialized view refresh
- Performance monitoring queries
- Backup/restore commands

#### `PROJECT_STRUCTURE.md`
- This file
- Project organization overview
- File descriptions and purposes

---

## Workflow

### Development Workflow

1. **Create Migration**
   ```bash
   npm run migrate:create add-new-feature
   ```

2. **Edit Migration File**
   ```javascript
   // migrations/YYYYMMDDHHMMSS_add-new-feature.js
   exports.up = (pgm) => { /* ... */ };
   exports.down = (pgm) => { /* ... */ };
   ```

3. **Test Migration**
   ```bash
   npm run migrate:up    # Apply
   npm run migrate:down  # Rollback
   npm run migrate:up    # Re-apply
   ```

4. **Verify Changes**
   ```bash
   psql $DATABASE_URL
   \dt  # List tables
   \d table_name  # Describe table
   ```

### Deployment Workflow

See [ZERO_DOWNTIME_WORKFLOW.md](./ZERO_DOWNTIME_WORKFLOW.md) for complete deployment procedures.

**Summary**:
1. **Phase 1 (Expand)**: Add new schema elements
2. **Phase 2 (Backfill)**: Migrate data, update code
3. **Phase 3 (Contract)**: Remove old schema elements

---

## Dependencies

### Production Dependencies

```json
{
  "node-pg-migrate": "^7.6.1",  // Migration tool
  "pg": "^8.12.0",               // PostgreSQL client
  "dotenv": "^16.4.5"            // Environment variables
}
```

### Development Dependencies

```json
{
  "@types/node": "^20.14.9",     // TypeScript definitions
  "@types/pg": "^8.11.6"         // PostgreSQL type definitions
}
```

### Database Extensions

- **postgis**: Geographic data types and functions
- **uuid-ossp**: UUID generation
- **pgcrypto**: Cryptographic functions (password hashing, signatures)
- **pg_cron** (optional): Automated task scheduling
- **pg_stat_statements** (optional): Query performance monitoring

---

## Database Schema Summary

### Tables (11)
- `app_users` - User management
- `devices` - Device tracking
- `offices` - Office locations
- `office_networks` - WiFi networks
- `beacons` - Bluetooth beacons
- `nfc_tags` - NFC tags
- `attendance` - Attendance records
- `leaves` - Leave management
- `audit_logs` - Audit trail
- `policy_sets` - Attendance policies
- `pgmigrations` - Migration tracking (created by node-pg-migrate)

### Materialized Views (4)
- `daily_attendance_summary`
- `weekly_attendance_summary`
- `monthly_attendance_summary`
- `office_occupancy_summary`

### Functions (6)
- `update_updated_at_column()` - Automatic timestamp updates
- `calculate_work_duration()` - Work duration calculation
- `refresh_daily_attendance_summary()` - Refresh daily view
- `refresh_weekly_attendance_summary()` - Refresh weekly view
- `refresh_monthly_attendance_summary()` - Refresh monthly view
- `refresh_office_occupancy_summary()` - Refresh occupancy view
- `refresh_all_materialized_views()` - Refresh all views

---

## Getting Started

1. **First Time Setup**
   ```bash
   npm install
   cp .env.example .env
   # Edit .env with your credentials
   npm run migrate:up
   npm run db:seed  # Optional
   ```

2. **Check Status**
   ```bash
   npm run migrate:status
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM app_users;"
   ```

3. **Read Documentation**
   - Start with [README.md](../README.md)
   - Review [SCHEMA_OVERVIEW.md](./SCHEMA_OVERVIEW.md)
   - Study [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)

4. **Create Your First Migration**
   ```bash
   npm run migrate:create add-my-feature
   # Follow patterns in MIGRATION_TEMPLATES.md
   ```

---

## Maintenance

### Regular Tasks

- **Daily**: Review audit logs for anomalies
- **Weekly**: Check query performance, unused indexes
- **Monthly**: Review table sizes, consider archiving old data
- **Quarterly**: Test backup/restore procedures

### Monitoring

```sql
-- Table sizes
SELECT * FROM pg_stat_user_tables;

-- Index usage
SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;

-- Slow queries (requires pg_stat_statements)
SELECT query, mean_exec_time FROM pg_stat_statements 
ORDER BY mean_exec_time DESC LIMIT 10;
```

---

## Support Resources

- **Documentation**: All `.md` files in root and `/docs`
- **Quick Reference**: [docs/QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
- **Setup Issues**: [SETUP.md](../SETUP.md) troubleshooting section
- **Migration Help**: [docs/MIGRATION_TEMPLATES.md](./MIGRATION_TEMPLATES.md)
