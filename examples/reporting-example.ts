import { Pool } from 'pg';
import { ReportAdminService, MetricsService, AuditLogService } from '../src/services';
import { ReportFilter } from '../src/types';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const metricsService = new MetricsService();
  const auditLogService = new AuditLogService({ pool });

  const reportAdminService = new ReportAdminService({
    pool,
    timezone: 'Asia/Jakarta',
    companyName: 'My Company',
    signedUrlSecretKey: process.env.SIGNED_URL_SECRET || 'change-me-in-production',
    exportDirectory: './exports',
    urlExpirationSeconds: 3600,
    metricsService,
    auditLogService,
  });

  const filters: ReportFilter = {
    start_date: new Date('2024-01-01'),
    end_date: new Date('2024-12-31'),
  };

  try {
    console.log('Generating daily attendance report (CSV)...');
    const csvReport = await reportAdminService.generateReport({
      report_type: 'daily',
      format: 'csv',
      filters,
      requested_by: 'admin-user-id',
    });

    console.log('CSV Report generated:');
    console.log('- File ID:', csvReport.file_id);
    console.log('- Signed URL:', csvReport.signed_url);
    console.log('- Expires at:', csvReport.expires_at);
    console.log('- Records:', csvReport.record_count);
    console.log('- Generation time:', csvReport.generation_time_ms, 'ms');

    console.log('\nGenerating monthly attendance report (PDF)...');
    const pdfReport = await reportAdminService.generateReport({
      report_type: 'monthly',
      format: 'pdf',
      filters,
      requested_by: 'admin-user-id',
    });

    console.log('PDF Report generated:');
    console.log('- File ID:', pdfReport.file_id);
    console.log('- Signed URL:', pdfReport.signed_url);
    console.log('- Expires at:', pdfReport.expires_at);
    console.log('- Records:', pdfReport.record_count);
    console.log('- Generation time:', pdfReport.generation_time_ms, 'ms');

    console.log('\nGetting report preview...');
    const preview = await reportAdminService.getReportPreview('daily', filters, 5);
    console.log('Preview records:', preview.length);

    console.log('\nVerifying download access...');
    const token = csvReport.signed_url.split('token=')[1];
    const verification = reportAdminService.verifyDownloadAccess(token);
    console.log('Verification result:', verification);

    console.log('\nRefreshing materialized views...');
    await reportAdminService.refreshMaterializedViews();
    console.log('Materialized views refreshed');

    console.log('\nExport metrics:');
    console.log(metricsService.exportPrometheusFormat());

    console.log('\nCleaning up expired exports...');
    const deletedCount = await reportAdminService.cleanupExpiredExports();
    console.log('Deleted', deletedCount, 'expired exports');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(console.error);
}
