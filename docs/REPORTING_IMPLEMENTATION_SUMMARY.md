# Reporting APIs & Export Services - Implementation Summary

## Overview

This document summarizes the implementation of reporting APIs and export services for the attendance management system.

## Implementation Details

### 1. Core Components

#### Repositories
- **ReportingRepository** (`src/repositories/reporting.repository.ts`)
  - Queries materialized views with pagination and filtering
  - Supports all 4 report types (daily, weekly, monthly, occupancy)
  - Implements concurrent materialized view refresh
  
- **ExportRequestRepository** (`src/repositories/export-request.repository.ts`)
  - Tracks export requests in database
  - Manages export lifecycle (pending → processing → completed/failed)
  - Provides cleanup utilities for expired exports

#### Export Services
- **CsvExportService** (`src/services/csv-export.service.ts`)
  - Streaming CSV generation using `csv-stringify`
  - Timezone-aware date formatting
  - Memory-efficient for large datasets
  
- **PdfExportService** (`src/services/pdf-export.service.ts`)
  - PDF generation using `pdfkit`
  - Multi-page support with automatic pagination
  - Company branding and headers/footers
  
- **SignedUrlService** (`src/services/signed-url.service.ts`)
  - HMAC-SHA256 signed URLs
  - Time-limited access control
  - User validation support
  
- **ReportAdminService** (`src/services/report-admin.service.ts`)
  - Orchestrates all reporting functionality
  - Integrates with metrics and audit logging
  - Provides high-level API for report generation

#### Supporting Services
- **MetricsService** (extended)
  - Added 5 new Prometheus metrics for export tracking
  - Exportable in Prometheus text format
  
- **AuditLogService** (used for tracking)
  - Logs all export requests
  - Records filters and generation times

### 2. Database Schema

#### export_requests Table
```sql
CREATE TABLE export_requests (
  id UUID PRIMARY KEY,
  report_type VARCHAR(50),
  format VARCHAR(10),
  filters JSONB,
  requested_by UUID REFERENCES app_users,
  requested_at TIMESTAMP,
  status VARCHAR(20),
  file_path TEXT,
  file_id VARCHAR(255),
  signed_url_token TEXT,
  url_expires_at TIMESTAMP,
  record_count INTEGER,
  generation_time_ms INTEGER,
  error_message TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Indexes:**
- `requested_by`
- `status`
- `report_type`
- `requested_at`
- `(requested_by, requested_at)`
- `file_id`

### 3. Types & Interfaces

Created comprehensive TypeScript types in `src/types/reporting.ts`:
- `DailyAttendanceSummary`
- `WeeklyAttendanceSummary`
- `MonthlyAttendanceSummary`
- `OfficeOccupancySummary`
- `ReportFilter`
- `PaginationParams`
- `PaginatedResult<T>`
- `ReportType` (daily | weekly | monthly | occupancy)
- `ExportFormat` (csv | pdf)
- `ExportRequest`
- `ExportRecord`
- `SignedUrlOptions`
- `ExportMetrics`

### 4. Timezone Support

All services use **Asia/Jakarta** timezone by default:
- Date formatting respects local timezone
- Configurable via constructor options
- Uses `date-fns-tz` for accurate timezone conversions

### 5. Materialized Views

Leverages existing materialized views from migration `1000000000012`:
- `daily_attendance_summary`
- `weekly_attendance_summary`
- `monthly_attendance_summary`
- `office_occupancy_summary`

All have proper indexes for efficient querying.

### 6. Pagination & Filtering

**Pagination:**
- Page-based (page, limit)
- Returns total count and total pages
- Default: page=1, limit=100 (10,000 for exports)

**Filtering:**
- `start_date` / `end_date` - Date range
- `office_id` - Specific office
- `user_id` - Specific user
- `department` - Department filter

### 7. Security Features

1. **Signed URLs:**
   - HMAC-SHA256 signatures
   - Expiration timestamps
   - Random nonces
   - Metadata for context

2. **Access Control:**
   - User validation in tokens
   - Expiration checking
   - Signature verification

3. **Audit Logging:**
   - All export requests logged
   - User actions tracked
   - Filter parameters recorded

### 8. Monitoring

**Prometheus Metrics:**
- `export_requests_total` - Counter
- `export_requests_csv` - Counter
- `export_requests_pdf` - Counter
- `export_requests_completed` - Counter
- `export_requests_failed` - Counter

**Audit Logs:**
- Action: `export_report`
- Entity Type: `report`
- Metadata includes filters and timing

## Files Created/Modified

### New Files Created

#### Source Code
1. `src/types/reporting.ts` - Type definitions
2. `src/repositories/reporting.repository.ts` - Materialized view queries
3. `src/repositories/export-request.repository.ts` - Export tracking
4. `src/services/csv-export.service.ts` - CSV generation
5. `src/services/pdf-export.service.ts` - PDF generation
6. `src/services/signed-url.service.ts` - Secure URLs
7. `src/services/report-admin.service.ts` - Report orchestration

#### Migrations
8. `migrations/1000000000014_create-export-requests-table.js`

#### Scripts
9. `scripts/refresh-materialized-views.js` - Refresh views
10. `scripts/cleanup-expired-exports.js` - Cleanup utility
11. `scripts/generate-report.js` - CLI report generator

#### Documentation
12. `docs/REPORTING_APIS.md` - Complete API documentation
13. `docs/REPORTING_IMPLEMENTATION_SUMMARY.md` - This file

#### Examples
14. `examples/reporting-example.ts` - Usage examples
15. `examples/test-reporting-services.ts` - Integration tests

### Modified Files

1. `package.json` - Added dependencies and scripts
2. `src/types/index.ts` - Export reporting types
3. `src/types/attendance.ts` - Extended PrometheusMetrics
4. `src/services/metrics.service.ts` - Added export metrics
5. `src/services/index.ts` - Export new services
6. `src/repositories/index.ts` - Export new repositories
7. `README.md` - Updated features list
8. `CHANGELOG.md` - Added v1.2.0 entry
9. `.gitignore` - Added exports/ directory
10. `.env.example` - Added reporting config

## Dependencies Added

```json
{
  "csv-stringify": "^6.5.0",
  "date-fns": "^2.30.0",
  "date-fns-tz": "^2.0.0",
  "pdfkit": "^0.15.0",
  "@types/pdfkit": "^0.13.4"
}
```

## Usage Examples

### Generate CSV Report
```typescript
const result = await reportService.generateReport({
  report_type: 'daily',
  format: 'csv',
  filters: { start_date: new Date('2024-01-01'), end_date: new Date('2024-12-31') },
  requested_by: 'admin-user-id',
});
```

### Generate PDF Report
```typescript
const result = await reportService.generateReport({
  report_type: 'monthly',
  format: 'pdf',
  filters: { office_id: 'office-uuid' },
  requested_by: 'admin-user-id',
});
```

### Verify Download Access
```typescript
const verification = reportService.verifyDownloadAccess(token, userId);
if (verification.valid && !verification.expired) {
  // Allow download
}
```

### Get Report Preview
```typescript
const preview = await reportService.getReportPreview('daily', filters, 10);
```

### Refresh Materialized Views
```typescript
await reportService.refreshMaterializedViews();
```

## NPM Scripts Added

```bash
npm run refresh-views      # Refresh materialized views
npm run cleanup-exports    # Clean up expired exports
```

## Environment Variables

```bash
SIGNED_URL_SECRET=change-me-in-production
EXPORT_DIRECTORY=./exports
URL_EXPIRATION_SECONDS=3600
TIMEZONE=Asia/Jakarta
COMPANY_NAME=My Company
```

## Maintenance Tasks

### Daily Cron Jobs

1. **Refresh materialized views** (1 AM):
   ```bash
   0 1 * * * cd /path/to/project && npm run refresh-views
   ```

2. **Cleanup expired exports** (2 AM):
   ```bash
   0 2 * * * cd /path/to/project && npm run cleanup-exports
   ```

## Performance Considerations

1. **Materialized Views**: Pre-computed aggregations
2. **Streaming**: Memory-efficient for large datasets
3. **Pagination**: Limits result sets
4. **Indexes**: Strategic database indexes
5. **Concurrent Refresh**: Non-blocking view updates

## Testing

Run integration tests:
```bash
npm run build
node dist/examples/test-reporting-services.js
```

Generate test report:
```bash
node scripts/generate-report.js daily csv 2024-01-01 2024-01-31
```

## API Integration

The services are designed to be easily integrated into REST APIs:

```typescript
// Express.js example
app.post('/api/reports/generate', authenticate, async (req, res) => {
  const result = await reportService.generateReport({
    report_type: req.body.report_type,
    format: req.body.format,
    filters: req.body.filters,
    requested_by: req.user.id,
  });
  
  res.json({
    download_url: result.signed_url,
    expires_at: result.expires_at,
  });
});
```

## Next Steps

Potential enhancements:
1. Queue-based async export processing for large reports
2. Email notification when exports are ready
3. Report scheduling (daily/weekly/monthly automated reports)
4. Custom report templates
5. Excel (XLSX) export format
6. Report compression (ZIP)
7. S3/cloud storage integration for export files
8. Real-time progress tracking for long-running exports

## Conclusion

The reporting APIs and export services implementation provides:
- ✅ Comprehensive report generation (4 types, 2 formats)
- ✅ Secure downloads with signed URLs
- ✅ Timezone support (Asia/Jakarta)
- ✅ Pagination and filtering
- ✅ Prometheus metrics and audit logging
- ✅ Database tracking of exports
- ✅ Maintenance utilities
- ✅ Complete documentation and examples
- ✅ Type-safe TypeScript implementation

All requirements from the ticket have been successfully implemented.
