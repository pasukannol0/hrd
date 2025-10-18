const { Pool } = require('pg');
const { ReportAdminService, MetricsService, AuditLogService } = require('../dist');
require('dotenv').config();

async function generateReport() {
  const reportType = process.argv[2] || 'daily';
  const format = process.argv[3] || 'csv';
  const startDate = process.argv[4] ? new Date(process.argv[4]) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDate = process.argv[5] ? new Date(process.argv[5]) : new Date();

  if (!['daily', 'weekly', 'monthly', 'occupancy'].includes(reportType)) {
    console.error('Invalid report type. Use: daily, weekly, monthly, or occupancy');
    process.exit(1);
  }

  if (!['csv', 'pdf'].includes(format)) {
    console.error('Invalid format. Use: csv or pdf');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const metricsService = new MetricsService();
  const auditLogService = new AuditLogService({ pool });

  const reportService = new ReportAdminService({
    pool,
    timezone: process.env.TIMEZONE || 'Asia/Jakarta',
    companyName: process.env.COMPANY_NAME || 'Attendance System',
    signedUrlSecretKey: process.env.SIGNED_URL_SECRET || 'change-me-in-production',
    exportDirectory: process.env.EXPORT_DIRECTORY || './exports',
    urlExpirationSeconds: parseInt(process.env.URL_EXPIRATION_SECONDS || '3600', 10),
    metricsService,
    auditLogService,
  });

  console.log('Generating report...');
  console.log(`- Type: ${reportType}`);
  console.log(`- Format: ${format}`);
  console.log(`- Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

  try {
    const result = await reportService.generateReport({
      report_type: reportType,
      format: format,
      filters: {
        start_date: startDate,
        end_date: endDate,
      },
      requested_by: 'script-admin',
    });

    console.log('\n✓ Report generated successfully!');
    console.log(`  File ID: ${result.file_id}`);
    console.log(`  File path: ${result.file_path}`);
    console.log(`  Signed URL: ${result.signed_url}`);
    console.log(`  Expires at: ${result.expires_at.toISOString()}`);
    console.log(`  Records: ${result.record_count}`);
    console.log(`  Generation time: ${result.generation_time_ms}ms`);

    console.log('\nMetrics:');
    const metrics = metricsService.getMetrics();
    console.log(`  Total exports: ${metrics.export_requests_total}`);
    console.log(`  CSV exports: ${metrics.export_requests_csv}`);
    console.log(`  PDF exports: ${metrics.export_requests_pdf}`);
  } catch (error) {
    console.error('Error generating report:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Usage help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node generate-report.js [reportType] [format] [startDate] [endDate]

Arguments:
  reportType  - Report type: daily, weekly, monthly, or occupancy (default: daily)
  format      - Export format: csv or pdf (default: csv)
  startDate   - Start date in YYYY-MM-DD format (default: 30 days ago)
  endDate     - End date in YYYY-MM-DD format (default: today)

Examples:
  node generate-report.js daily csv 2024-01-01 2024-01-31
  node generate-report.js monthly pdf 2024-01-01 2024-12-31
  node generate-report.js occupancy csv
  `);
  process.exit(0);
}

generateReport();
