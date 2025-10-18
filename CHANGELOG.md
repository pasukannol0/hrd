# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2024-10-18

### Added

#### Leave Management System
- **Complete leave management module** with approval workflows:
  - Support for Indonesian leave types: `izin` (permission), `cuti` (vacation), `sakit` (sick leave)
  - Status workflow: `pending` → `approved`/`rejected`/`cancelled`
  - Role-based approval actors mapped to roles (admin, manager, employee)
  - Half-day leave support via `total_days` decimal field
  - Attachment URLs for supporting documents
  
- **LeaveRepository** - Database operations for leave management:
  - CRUD operations with caching support
  - Query by user, status, leave type, date range
  - Overlap detection for leave periods
  - Approved leave retrieval for attendance integration
  - Transaction support for atomic updates
  - Leave balance calculation by type and period

- **LeaveManagementService** - Business logic for leave workflows:
  - Leave submission with validation
  - Approval/rejection with role validation
  - Cancellation with status transition checks
  - Overlap checking to prevent conflicting leaves
  - Leave balance tracking by type and year
  - Audit history retrieval per leave request
  - Date-based leave status checking

- **AuditService** - Comprehensive audit logging:
  - Logs all leave state changes to `audit_logs` table
  - Tracks actor, action, old/new values, metadata
  - Entity-specific and user-specific audit queries
  - IP address and user agent tracking support
  - Generic audit logging for any entity type

- **NotificationService** - Event-driven notification system:
  - Placeholder hooks for email/push/SMS notifications
  - Events for all leave actions (submitted, approved, rejected, cancelled)
  - Extensible hook system for custom integrations
  - Non-blocking error handling (notifications don't break main flow)
  - Configurable logging

- **AttendanceAnomalyCheckerService** - Policy integration:
  - Checks if absences are excused by approved leaves
  - Respects approved leaves when evaluating attendance anomalies
  - Multi-day anomaly checking with leave exclusion
  - Weekend and holiday detection
  - Leave date extraction for reporting

#### REST API Layer
- **Leave REST API** with Express.js:
  - `POST /api/leaves` - Submit leave request
  - `GET /api/leaves/:id` - Get leave by ID
  - `GET /api/leaves` - Query leaves with filters (user, status, type, dates)
  - `POST /api/leaves/:id/approve` - Approve leave
  - `POST /api/leaves/:id/reject` - Reject leave with reason
  - `POST /api/leaves/:id/cancel` - Cancel leave
  - `GET /api/leaves/:id/audit` - Get audit history
  - `POST /api/leaves/check-overlap` - Check for overlapping leaves
  - `GET /api/users/:userId/leave-balance` - Get leave balance

- **API Middleware & Error Handling**:
  - Zod schema validation middleware
  - Standardized error responses
  - 404 handler for undefined routes
  - Development-mode error stack traces

- **Type-safe request/response handling**:
  - TypeScript interfaces for all API models
  - Zod runtime validation schemas
  - Request validation with detailed error messages

#### Types & Validation
- **Leave Management Types**:
  - `LeaveType` enum (izin, cuti, sakit)
  - `LeaveStatus` enum (pending, approved, rejected, cancelled)
  - `LeaveAction` enum (submit, approve, reject, cancel)
  - `Leave` interface with all fields
  - Status transition rules with allowed roles
  - Event and notification payload types

- **Zod Validation Schemas**:
  - `CreateLeaveRequestSchema` - Leave submission validation
  - `ApproveLeaveRequestSchema` - Approval validation
  - `RejectLeaveRequestSchema` - Rejection with reason
  - `CancelLeaveRequestSchema` - Cancellation validation
  - `LeaveQueryParamsSchema` - Query parameter validation

#### Documentation & Examples
- **Comprehensive documentation** (`docs/LEAVE_MANAGEMENT.md`):
  - Architecture overview with component descriptions
  - Complete API endpoint documentation with curl examples
  - Usage examples for all services
  - Status transition matrix with role permissions
  - Notification hook integration guide
  - Database schema documentation
  - Error handling patterns

- **Working examples**:
  - `examples/leave-management-example.ts` - Complete service usage
  - `examples/simple-leave-test.ts` - Basic test suite
  - `examples/leave-api-server.ts` - Production-ready API server

### Changed
- Updated main `README.md` with leave management quick start
- Added leave management to feature list
- Exported API layer from main `src/index.ts`
- Enhanced repository index to include `LeaveRepository`
- Enhanced services index to include all new services

### Integration
- **Policy Engine Integration**: Attendance anomaly detection now respects approved leaves
- **Audit Trail Integration**: All leave actions automatically logged to existing audit system
- **Database Integration**: Uses existing `leaves` and `audit_logs` tables

## [1.1.0] - 2024-10-17

### Added

#### Service Layer & Repositories
- **Repository Layer** with PostGIS query support and caching:
  - `OfficeRepository` - Office data access with geographic queries
  - `NetworkRepository` - Wi-Fi network data access with SSID/BSSID matching
  - `BeaconRepository` - Beacon data access with proximity queries
  - `NfcTagRepository` - NFC tag data access with location-based queries
  - `PolicyRepository` - Policy data access with priority ordering
  - `BaseRepository` - Abstract base class with caching and transaction support

- **Presence Validation Services**:
  - `GeoValidatorService` - Location validation using PostGIS ST_DWithin and ST_Contains
    - Configurable distance tolerance (default: 100m)
    - Boundary containment checking
    - Nearest office detection
  - `WiFiMatcherService` - Wi-Fi network matching
    - BSSID (MAC address) exact matching
    - SSID-based matching with fallback
    - Office association
  - `BeaconProximityService` - Bluetooth beacon detection
    - iBeacon format support (UUID, major, minor)
    - RSSI-based distance estimation
    - Proximity threshold validation (default: 50m)
    - Geographic proximity using PostGIS
  - `NfcVerifierService` - NFC tag verification
    - Tag UID validation
    - Location-based verification with distance checking
    - Nearby tag discovery
  - `QrTokenGeneratorService` - Dynamic QR code generation
    - HMAC-SHA256 signature
    - Configurable TTL (30-60 seconds)
    - Base64url encoded tokens
    - Nonce for replay prevention
  - `FaceRecognitionService` - Pluggable face recognition with liveness detection
    - Provider abstraction for multiple backends
    - Automatic liveness detection
    - Confidence threshold validation
    - Timeout protection
    - Face enrollment and deletion

- **Adapters & Utilities**:
  - `MockFaceRecognitionAdapter` - Mock face recognition for testing
    - Configurable success/error rates
    - Simulated delays
    - In-memory face storage
    - Test user support
  - `InMemoryCache` - Simple in-memory caching implementation
    - TTL support
    - Automatic cleanup
    - Async interface

- **TypeScript Type Definitions**:
  - Complete type definitions for all models
  - Provider interfaces for pluggable components
  - Result types for validation operations
  - Error enums for face recognition

#### Documentation
- `src/README.md` - Comprehensive service layer documentation
- `examples/usage-example.ts` - Complete usage examples
- Updated main README with service layer information
- TypeScript configuration with strict mode

#### Build System
- TypeScript compilation with source maps
- Type declaration generation
- Build and watch scripts

### Changed
- Updated `package.json` to include TypeScript build scripts
- Enhanced main README with Quick Start guide
- Updated project structure documentation

### Technical Details
- **Caching Strategy**: 300s TTL for most queries, 600s for aggregate queries
- **PostGIS Functions**: ST_Contains, ST_DWithin, ST_Distance for geographic operations
- **Coordinate System**: SRID 4326 (WGS 84)
- **HMAC Algorithm**: SHA-256 for QR token signatures
- **Distance Estimation**: Path loss model for beacon RSSI calculations

## [1.0.0] - 2024-01-15

### Added

#### Database Schema
- **Core Tables**:
  - `app_users` - User management with role-based access control
  - `devices` - Device tracking and trust management
  - `offices` - Office locations with PostGIS polygon boundaries
  - `office_networks` - WiFi network definitions for verification
  - `beacons` - Bluetooth beacon management (iBeacon format)
  - `nfc_tags` - NFC tag registration and tracking
  - `attendance` - Comprehensive attendance records with integrity verification
  - `leaves` - Leave management with approval workflow
  - `audit_logs` - Complete audit trail for all operations
  - `policy_sets` - Attendance policy configuration

#### Extensions
- PostGIS for geographic data types and functions
- uuid-ossp for UUID generation
- pgcrypto for password hashing and cryptographic operations

#### Materialized Views
- `daily_attendance_summary` - Daily attendance statistics per user and office
- `weekly_attendance_summary` - Weekly aggregated attendance data
- `monthly_attendance_summary` - Monthly attendance reports
- `office_occupancy_summary` - Hourly office occupancy tracking

#### Functions
- `update_updated_at_column()` - Automatic timestamp updates on row modifications
- `calculate_work_duration()` - Automatic work duration calculation
- `refresh_daily_attendance_summary()` - Refresh daily summary view
- `refresh_weekly_attendance_summary()` - Refresh weekly summary view
- `refresh_monthly_attendance_summary()` - Refresh monthly summary view
- `refresh_office_occupancy_summary()` - Refresh office occupancy view
- `refresh_all_materialized_views()` - Convenience function to refresh all views

#### Indexes
- B-tree indexes for primary keys, foreign keys, and frequently queried columns
- GiST indexes for PostGIS geography columns
- GIN indexes for JSONB columns (integrity_verdict, metadata)
- BRIN indexes for time-series data (audit_logs)
- Partial indexes for active records

#### Features
- **Geographic Verification**: PostGIS-based geofencing for attendance
- **Multi-method Check-in**: Support for GPS, WiFi, Beacon, NFC, and manual check-ins
- **Integrity Verification**: JSONB field for flexible verification results storage
- **Cryptographic Signatures**: Tamper detection for attendance records
- **Zero-downtime Migrations**: Expand/backfill/contract pattern support
- **Audit Trail**: Comprehensive logging of all critical operations
- **Policy Management**: Flexible attendance policy configuration
- **Timezone Support**: Timezone-aware operations for global deployments

#### Documentation
- `README.md` - Project overview and features
- `SETUP.md` - Comprehensive setup guide
- `CHANGELOG.md` - Version history and changes
- `docs/SCHEMA_OVERVIEW.md` - Detailed schema documentation
- `docs/MIGRATION_TEMPLATES.md` - Zero-downtime migration patterns
- `docs/ZERO_DOWNTIME_WORKFLOW.md` - Deployment workflow guide
- `docs/QUICK_REFERENCE.md` - Common queries and commands reference

#### Scripts
- `scripts/seed.js` - Sample data fixtures for development and testing

#### Migrations
- Migration 1: Enable PostGIS extension
- Migration 2: Create app_users table
- Migration 3: Create offices table with PostGIS support
- Migration 4: Create office_networks table
- Migration 5: Create beacons table
- Migration 6: Create nfc_tags table
- Migration 7: Create devices table
- Migration 8: Create policy_sets table
- Migration 9: Create attendance table with integrity verification
- Migration 10: Create leaves table
- Migration 11: Create audit_logs table
- Migration 12: Create materialized views for reporting
- Migration 13: Create materialized view refresh functions

### Security
- Password hashing using bcrypt (pgcrypto)
- Support for cryptographic signatures on attendance records
- Audit logging for security-sensitive operations
- Role-based access control (admin, manager, employee)
- Device trust management

### Performance
- Comprehensive indexing strategy
- Materialized views for expensive aggregations
- BRIN indexes for large time-series tables
- Partial indexes for frequently filtered queries
- Batch processing support for large data operations

---

## Unreleased

### Planned
- Partitioning for attendance and audit_logs tables
- Additional reporting views (absence tracking, overtime calculation)
- Geospatial clustering for office boundary optimization
- Performance monitoring views
- Replication setup documentation

---

## Migration Guide

### From No Database to v1.0.0

1. Install PostgreSQL 12+ with PostGIS 3.0+
2. Create database
3. Run `npm install` to install dependencies
4. Configure `.env` with database credentials
5. Run `npm run migrate:up` to apply all migrations
6. Run `npm run db:seed` to load sample data (optional)

See [SETUP.md](./SETUP.md) for detailed instructions.

---

## Breaking Changes

None (initial release)

---

## Contributors

Initial schema design and implementation.

---

## Notes

### Design Decisions

1. **PostGIS for Geolocation**: Chose PostGIS over simple lat/lng columns for:
   - Accurate distance calculations
   - Complex polygon boundary checks
   - Built-in spatial indexing (GiST)
   - Industry-standard geography types

2. **JSONB for Integrity Verdict**: Flexible structure allows:
   - Different verification methods without schema changes
   - Easy addition of new verification checks
   - Efficient querying with GIN indexes
   - Backward compatibility

3. **Materialized Views**: Pre-computed aggregations for:
   - Fast reporting queries
   - Reduced load on main tables
   - Scheduled refresh during off-peak hours
   - Concurrent refresh support

4. **Zero-downtime Migration Pattern**: Expand/backfill/contract ensures:
   - No application downtime
   - Safe rollback procedures
   - Gradual code migration
   - Production stability

5. **Audit Logging**: Complete audit trail provides:
   - Compliance with data regulations
   - Security monitoring
   - Change history tracking
   - Debugging capabilities

### Future Considerations

- Consider partitioning `attendance` table by month for better performance at scale
- Evaluate need for read replicas as traffic grows
- Monitor materialized view refresh times and adjust schedules
- Consider archiving old audit logs to separate table
- Evaluate caching strategy for frequently-accessed policies

---

## Support

For questions or issues:
- Review documentation in `/docs` directory
- Check [QUICK_REFERENCE.md](./docs/QUICK_REFERENCE.md) for common solutions
- Review PostgreSQL logs for database-level issues

## License

MIT License - See [LICENSE](./LICENSE) file for details
