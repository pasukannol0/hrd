# Reporting APIs & Export Services

This document describes the reporting APIs and export services implementation for the attendance management system.

## Features

### 1. Materialized Views Query Services
- **Daily Attendance Summary**: Detailed daily attendance records per user and office
- **Weekly Attendance Summary**: Aggregated weekly attendance statistics
- **Monthly Attendance Summary**: Monthly attendance reports with work hours
- **Office Occupancy Summary**: Hourly occupancy statistics per office

All queries support:
- Pagination (page, limit)
- Filtering (date range, office, user, department)
- Sorting and indexing for optimal performance

### 2. Export Generation Services

#### CSV Export
- Streaming writer for memory-efficient large dataset exports
- Timezone-aware formatting (Asia/Jakarta by default)
- Column headers with human-readable names
- Automatic conversion of minutes to hours

#### PDF Export
- Template-based PDF generation using PDFKit
- Company branding support
- Multi-page support with headers and footers
- Landscape orientation for wide data tables
- Timezone information in footer

### 3. Admin Endpoints

The `ReportAdminService` provides:
- **Report Generation**: Creates export files with signed URLs
- **Signed URL Management**: Secure, time-limited download URLs
- **Access Control**: Token-based verification with user validation
- **Export Tracking**: Database tracking of all export requests
- **Preview Support**: Small data previews before full export

### 4. Monitoring & Audit

#### Prometheus Metrics
- `export_requests_total`: Total number of export requests
- `export_requests_csv`: Number of CSV exports
- `export_requests_pdf`: Number of PDF exports
- `export_requests_completed`: Successful exports
- `export_requests_failed`: Failed exports

#### Audit Logs
- All export requests are logged with:
  - User ID
  - Report type and format
  - Applied filters
  - Timestamp
  - Generation time and record count

## Architecture

```
┌─────────────────┐
│  Admin Request  │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ ReportAdminService  │
└────────┬────────────┘
         │
         ├──► ReportingRepository ──► Materialized Views
         │
         ├──► CsvExportService ─────► CSV File
         │
         ├──► PdfExportService ─────► PDF File
         │
         ├──► SignedUrlService ─────► Secure URL
         │
         ├──► MetricsService ───────► Prometheus
         │
         └──► AuditLogService ──────► Audit Logs
```

## Usage Examples

### 1. Initialize Services

```typescript
import { Pool } from 'pg';
import { ReportAdminService, MetricsService, AuditLogService } from 'attendance-system';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const metricsService = new MetricsService();
const auditLogService = new AuditLogService({ pool });

const reportService = new ReportAdminService({
  pool,
  timezone: 'Asia/Jakarta',
  companyName: 'My Company',
  signedUrlSecretKey: process.env.SIGNED_URL_SECRET,
  exportDirectory: './exports',
  urlExpirationSeconds: 3600,
  metricsService,
  auditLogService,
});
```

### 2. Generate Daily Report (CSV)

```typescript
const result = await reportService.generateReport({
  report_type: 'daily',
  format: 'csv',
  filters: {
    start_date: new Date('2024-01-01'),
    end_date: new Date('2024-12-31'),
    office_id: 'office-uuid',
  },
  requested_by: 'admin-user-id',
});

// Returns:
// {
//   file_id: 'daily_1234567890_abc123',
//   file_path: './exports/daily_1234567890_abc123.csv',
//   signed_url: '/api/downloads/daily_1234567890_abc123?token=...',
//   expires_at: Date,
//   record_count: 1500,
//   generation_time_ms: 2345
// }
```

### 3. Generate Monthly Report (PDF)

```typescript
const result = await reportService.generateReport({
  report_type: 'monthly',
  format: 'pdf',
  filters: {
    start_date: new Date('2024-01-01'),
    end_date: new Date('2024-12-31'),
    department: 'Engineering',
  },
  requested_by: 'admin-user-id',
});
```

### 4. Verify Download Access

```typescript
const verification = reportService.verifyDownloadAccess(token, userId);

if (verification.valid && !verification.expired) {
  // Allow download
  const filePath = getFilePathFromId(verification.file_id);
  res.download(filePath);
} else if (verification.expired) {
  res.status(410).json({ error: 'Download link has expired' });
} else {
  res.status(403).json({ error: 'Invalid or unauthorized access' });
}
```

### 5. Preview Report Data

```typescript
const preview = await reportService.getReportPreview(
  'daily',
  { start_date: new Date('2024-01-01'), end_date: new Date('2024-01-31') },
  10
);

// Returns first 10 records for preview
```

### 6. Refresh Materialized Views

```typescript
// Refresh all materialized views
await reportService.refreshMaterializedViews();

// This should be scheduled periodically (e.g., daily cron job)
```

### 7. Query Reports Directly

```typescript
import { ReportingRepository } from 'attendance-system';

const reportingRepo = new ReportingRepository({ pool });

// Get daily attendance with pagination
const dailyReport = await reportingRepo.getDailyAttendanceSummary(
  {
    start_date: new Date('2024-01-01'),
    end_date: new Date('2024-01-31'),
    office_id: 'office-uuid',
  },
  { page: 1, limit: 100 }
);

// Returns:
// {
//   data: [...],
//   pagination: {
//     page: 1,
//     limit: 100,
//     total: 1500,
//     total_pages: 15
//   }
// }
```

## Report Types

### Daily Attendance Summary
- Date, office, employee, department
- Check-in count, first/last times
- Total and average work minutes
- Late count, early departures, missing check-outs
- Detailed attendance records (JSONB)

### Weekly Attendance Summary
- Week start date, office, employee, department
- Days present, total check-ins
- Total work time and daily average
- Aggregated late/early/missing counts
- Earliest and latest times for the week

### Monthly Attendance Summary
- Year, month, office, employee, department
- Days present, total check-ins
- Total work hours (converted from minutes)
- Average daily work time
- Monthly aggregates of issues

### Office Occupancy Summary
- Date, hour, office location
- Unique users and total check-ins
- Departments present
- Useful for capacity planning and peak hour analysis

## Filtering Options

All report types support the following filters:

```typescript
interface ReportFilter {
  start_date?: Date;      // Filter by start date
  end_date?: Date;        // Filter by end date
  office_id?: string;     // Filter by specific office
  user_id?: string;       // Filter by specific user
  department?: string;    // Filter by department
}
```

## Timezone Handling

All services use `Asia/Jakarta` timezone by default. This ensures:
- Dates are formatted in the local timezone
- Time calculations respect local business hours
- Reports show times in the familiar local format

To change timezone:

```typescript
const reportService = new ReportAdminService({
  timezone: 'America/New_York', // or any IANA timezone
  // ... other config
});
```

## Signed URLs

Download URLs are secured using HMAC-based signatures:

1. **Generation**: Creates a token containing:
   - Resource ID (file ID)
   - Expiration timestamp
   - User metadata
   - Random nonce for uniqueness
   - HMAC signature

2. **Verification**: Validates:
   - Signature authenticity
   - Not expired
   - User authorization (optional)

3. **Expiration**: Default 1 hour, configurable

## Database Schema

### export_requests table
```sql
CREATE TABLE export_requests (
  id UUID PRIMARY KEY,
  report_type VARCHAR(50) NOT NULL,
  format VARCHAR(10) NOT NULL,
  filters JSONB NOT NULL,
  requested_by UUID NOT NULL REFERENCES app_users,
  requested_at TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  file_path TEXT,
  file_id VARCHAR(255),
  signed_url_token TEXT,
  url_expires_at TIMESTAMP,
  record_count INTEGER,
  generation_time_ms INTEGER,
  error_message TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

## Performance Considerations

1. **Materialized Views**: Pre-computed aggregations for fast queries
2. **Indexes**: Strategic indexes on date, office_id, user_id
3. **Pagination**: Limit result sets for memory efficiency
4. **Streaming**: CSV/PDF generation uses streams to handle large datasets
5. **Concurrent Refresh**: Materialized views can be refreshed without blocking queries

## Security

1. **Access Control**: All endpoints require authentication
2. **Signed URLs**: Time-limited, tamper-proof download links
3. **User Validation**: Optional user ID verification in tokens
4. **Audit Logging**: Complete audit trail of all export operations
5. **File Cleanup**: Automatic deletion of expired exports

## Monitoring

### Prometheus Metrics Endpoint

```typescript
const metrics = metricsService.exportPrometheusFormat();
// Returns Prometheus-formatted metrics text

// Example output:
// # HELP export_requests_total Total number of export requests
// # TYPE export_requests_total counter
// export_requests_total 1234
// ...
```

### Audit Logs

All export requests are logged to the `audit_logs` table:
- User actions are trackable
- Filter parameters are stored
- Generation times are recorded
- Failures are logged with error messages

## Maintenance Tasks

### Daily Cron Jobs

```bash
# Refresh materialized views
0 1 * * * node scripts/refresh-views.js

# Clean up expired exports
0 2 * * * node scripts/cleanup-exports.js
```

### Example Scripts

**refresh-views.js**:
```javascript
const reportService = new ReportAdminService({ ... });
await reportService.refreshMaterializedViews();
```

**cleanup-exports.js**:
```javascript
const reportService = new ReportAdminService({ ... });
const deleted = await reportService.cleanupExpiredExports();
console.log(`Cleaned up ${deleted} expired exports`);
```

## Error Handling

All services include comprehensive error handling:

```typescript
try {
  const result = await reportService.generateReport(options);
} catch (error) {
  if (error.message.includes('Unsupported report type')) {
    // Handle invalid report type
  } else if (error.message.includes('Unsupported export format')) {
    // Handle invalid format
  } else {
    // Handle general errors
    console.error('Export generation failed:', error);
  }
}
```

## API Integration Example

```typescript
// Express.js endpoint
app.post('/api/reports/generate', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { report_type, format, filters } = req.body;
    
    const result = await reportService.generateReport({
      report_type,
      format,
      filters,
      requested_by: req.user.id,
    });
    
    res.json({
      success: true,
      download_url: result.signed_url,
      expires_at: result.expires_at,
      record_count: result.record_count,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/downloads/:file_id', async (req, res) => {
  const { token } = req.query;
  const { file_id } = req.params;
  
  const verification = reportService.verifyDownloadAccess(token, req.user?.id);
  
  if (!verification.valid) {
    return res.status(403).json({ error: 'Invalid or expired download link' });
  }
  
  const filePath = path.join(exportDirectory, `${file_id}.csv`); // or .pdf
  res.download(filePath);
});
```

## Testing

See `examples/reporting-example.ts` for a complete working example.

## Dependencies

- `csv-stringify`: CSV generation
- `pdfkit`: PDF generation
- `date-fns` & `date-fns-tz`: Timezone-aware date formatting
- `pg`: PostgreSQL client

## License

MIT
