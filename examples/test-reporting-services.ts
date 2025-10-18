import { Pool } from 'pg';
import {
  ReportingRepository,
  CsvExportService,
  PdfExportService,
  SignedUrlService,
  ReportAdminService,
  MetricsService,
  AuditLogService,
} from '../src';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';

async function testReportingServices() {
  console.log('Testing Reporting Services...\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/attendance_db',
  });

  try {
    console.log('1. Testing ReportingRepository...');
    const reportingRepo = new ReportingRepository({ pool });
    
    const dailyResult = await reportingRepo.getDailyAttendanceSummary(
      {
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-01-31'),
      },
      { page: 1, limit: 5 }
    );
    
    console.log(`   ✓ Found ${dailyResult.data.length} daily records (${dailyResult.pagination.total} total)`);

    console.log('\n2. Testing CsvExportService...');
    const csvService = new CsvExportService({ timezone: 'Asia/Jakarta' });
    
    await mkdir('./exports', { recursive: true });
    const csvStream = createWriteStream('./exports/test-daily.csv');
    await csvService.exportDailyReport(dailyResult.data, csvStream);
    
    console.log('   ✓ CSV export generated: ./exports/test-daily.csv');

    console.log('\n3. Testing PdfExportService...');
    const pdfService = new PdfExportService({
      timezone: 'Asia/Jakarta',
      companyName: 'Test Company',
    });
    
    const pdfStream = createWriteStream('./exports/test-daily.pdf');
    await pdfService.exportDailyReport(dailyResult.data, pdfStream);
    
    console.log('   ✓ PDF export generated: ./exports/test-daily.pdf');

    console.log('\n4. Testing SignedUrlService...');
    const signedUrlService = new SignedUrlService({
      secretKey: 'test-secret-key',
      defaultExpirationSeconds: 3600,
    });
    
    const signedUrl = signedUrlService.generateSignedUrl({
      resource: 'test-file-id',
      expiresInSeconds: 3600,
      metadata: { user_id: 'test-user' },
    });
    
    console.log(`   ✓ Signed URL generated: ${signedUrl.url}`);
    console.log(`   ✓ Expires at: ${signedUrl.expires_at}`);
    
    const verification = signedUrlService.verifySignedUrl(signedUrl.token);
    console.log(`   ✓ Verification: valid=${verification.valid}, expired=${verification.expired}`);

    console.log('\n5. Testing MetricsService...');
    const metricsService = new MetricsService();
    
    metricsService.incrementCounter('export_requests_total');
    metricsService.incrementCounter('export_requests_csv');
    metricsService.incrementCounter('export_requests_completed');
    
    const metrics = metricsService.getMetrics();
    console.log(`   ✓ Metrics recorded: ${metrics.export_requests_total} total requests`);

    console.log('\n6. Testing AuditLogService...');
    const auditLogService = new AuditLogService({ pool });
    
    await auditLogService.log({
      user_id: 'test-user',
      action: 'export_report',
      entity_type: 'report',
      entity_id: 'daily_csv',
      metadata: {
        report_type: 'daily',
        format: 'csv',
        timestamp: new Date().toISOString(),
      },
    });
    
    console.log('   ✓ Audit log entry created');

    console.log('\n7. Testing ReportAdminService (full integration)...');
    const reportAdminService = new ReportAdminService({
      pool,
      timezone: 'Asia/Jakarta',
      companyName: 'Test Company',
      signedUrlSecretKey: 'test-secret-key',
      exportDirectory: './exports',
      urlExpirationSeconds: 3600,
      metricsService,
      auditLogService,
    });
    
    console.log('   - Getting report preview...');
    const preview = await reportAdminService.getReportPreview(
      'daily',
      { start_date: new Date('2024-01-01'), end_date: new Date('2024-01-31') },
      3
    );
    console.log(`   ✓ Preview loaded: ${preview.length} records`);
    
    console.log('   - Generating full report...');
    const reportResult = await reportAdminService.generateReport({
      report_type: 'daily',
      format: 'csv',
      filters: {
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-01-31'),
      },
      requested_by: 'test-admin',
    });
    
    console.log(`   ✓ Report generated successfully!`);
    console.log(`     - File ID: ${reportResult.file_id}`);
    console.log(`     - Records: ${reportResult.record_count}`);
    console.log(`     - Generation time: ${reportResult.generation_time_ms}ms`);
    
    console.log('   - Verifying download access...');
    const token = reportResult.signed_url.split('token=')[1];
    const downloadVerification = reportAdminService.verifyDownloadAccess(token);
    console.log(`   ✓ Download access: valid=${downloadVerification.valid}`);

    console.log('\n✓ All tests passed!');
    console.log('\nFinal Metrics:');
    console.log(metricsService.exportPrometheusFormat());

  } catch (error) {
    console.error('\n✗ Test failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  testReportingServices().catch((error) => {
    console.error('Test error:', error);
    process.exit(1);
  });
}

export { testReportingServices };
