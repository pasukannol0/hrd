import { Pool } from 'pg';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { ReportingRepository } from '../repositories/reporting.repository';
import { ExportRequestRepository } from '../repositories/export-request.repository';
import { CsvExportService } from './csv-export.service';
import { PdfExportService } from './pdf-export.service';
import { SignedUrlService } from './signed-url.service';
import { MetricsService } from './metrics.service';
import { AuditLogService } from './audit-log.service';
import {
  ReportType,
  ExportFormat,
  ReportFilter,
  PaginationParams,
  ExportRequest,
  ExportRecord,
} from '../types';

export interface ReportAdminConfig {
  pool: Pool;
  timezone?: string;
  companyName?: string;
  signedUrlSecretKey: string;
  exportDirectory: string;
  urlExpirationSeconds?: number;
  metricsService?: MetricsService;
  auditLogService?: AuditLogService;
}

export interface GenerateReportOptions {
  report_type: ReportType;
  format: ExportFormat;
  filters: ReportFilter;
  requested_by: string;
  pagination?: PaginationParams;
}

export interface GenerateReportResult {
  file_id: string;
  file_path: string;
  signed_url: string;
  expires_at: Date;
  record_count: number;
  generation_time_ms: number;
}

export class ReportAdminService {
  private reportingRepo: ReportingRepository;
  private exportRequestRepo: ExportRequestRepository;
  private csvExportService: CsvExportService;
  private pdfExportService: PdfExportService;
  private signedUrlService: SignedUrlService;
  private metricsService?: MetricsService;
  private auditLogService?: AuditLogService;
  private exportDirectory: string;
  private urlExpirationSeconds: number;
  private timezone: string;

  constructor(config: ReportAdminConfig) {
    this.reportingRepo = new ReportingRepository({ pool: config.pool });
    this.exportRequestRepo = new ExportRequestRepository({ pool: config.pool });
    this.timezone = config.timezone || 'Asia/Jakarta';
    this.csvExportService = new CsvExportService({ timezone: this.timezone });
    this.pdfExportService = new PdfExportService({
      timezone: this.timezone,
      companyName: config.companyName,
    });
    this.signedUrlService = new SignedUrlService({
      secretKey: config.signedUrlSecretKey,
      defaultExpirationSeconds: config.urlExpirationSeconds || 3600,
    });
    this.metricsService = config.metricsService;
    this.auditLogService = config.auditLogService;
    this.exportDirectory = config.exportDirectory;
    this.urlExpirationSeconds = config.urlExpirationSeconds || 3600;
  }

  async generateReport(options: GenerateReportOptions): Promise<GenerateReportResult> {
    const startTime = Date.now();

    try {
      const data = await this.fetchReportData(options.report_type, options.filters, options.pagination);

      const fileId = this.generateFileId(options.report_type, options.format);
      const fileName = `${fileId}.${options.format}`;
      const filePath = join(this.exportDirectory, fileName);

      await mkdir(dirname(filePath), { recursive: true });

      await this.exportData(
        options.report_type,
        options.format,
        data,
        filePath
      );

      const signedUrlResult = this.signedUrlService.generateSignedUrl({
        resource: fileId,
        expiresInSeconds: this.urlExpirationSeconds,
        metadata: {
          user_id: options.requested_by,
          report_type: options.report_type,
          format: options.format,
        },
      });

      const generationTime = Date.now() - startTime;

      this.recordMetrics(options.format, generationTime, true);

      await this.logExportRequest({
        report_type: options.report_type,
        format: options.format,
        filters: options.filters,
        requested_by: options.requested_by,
        requested_at: new Date(),
      });

      return {
        file_id: fileId,
        file_path: filePath,
        signed_url: signedUrlResult.url,
        expires_at: signedUrlResult.expires_at,
        record_count: data.length,
        generation_time_ms: generationTime,
      };
    } catch (error) {
      this.recordMetrics(options.format, Date.now() - startTime, false);
      throw error;
    }
  }

  private async fetchReportData(
    reportType: ReportType,
    filters: ReportFilter,
    pagination?: PaginationParams
  ): Promise<any[]> {
    const paginationParams = {
      page: pagination?.page || 1,
      limit: pagination?.limit || 10000,
    };

    switch (reportType) {
      case 'daily': {
        const result = await this.reportingRepo.getDailyAttendanceSummary(filters, paginationParams);
        return result.data;
      }
      case 'weekly': {
        const result = await this.reportingRepo.getWeeklyAttendanceSummary(filters, paginationParams);
        return result.data;
      }
      case 'monthly': {
        const result = await this.reportingRepo.getMonthlyAttendanceSummary(filters, paginationParams);
        return result.data;
      }
      case 'occupancy': {
        const result = await this.reportingRepo.getOfficeOccupancySummary(filters, paginationParams);
        return result.data;
      }
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }
  }

  private async exportData(
    reportType: ReportType,
    format: ExportFormat,
    data: any[],
    filePath: string
  ): Promise<void> {
    const writeStream = createWriteStream(filePath);

    return new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);

      (async () => {
        try {
          if (format === 'csv') {
            await this.csvExportService.exportReport(reportType, data, writeStream);
          } else if (format === 'pdf') {
            await this.pdfExportService.exportReport(reportType, data, writeStream);
          } else {
            throw new Error(`Unsupported export format: ${format}`);
          }
        } catch (error) {
          reject(error);
        }
      })();
    });
  }

  private generateFileId(reportType: ReportType, format: ExportFormat): string {
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substring(2, 15);
    return `${reportType}_${timestamp}_${randomPart}`;
  }

  private recordMetrics(format: ExportFormat, durationMs: number, success: boolean): void {
    if (!this.metricsService) return;

    const metricName = format === 'csv' ? 'export_requests_csv' : 'export_requests_pdf';
    this.metricsService.incrementCounter('export_requests_total' as any);
    this.metricsService.incrementCounter(metricName as any);

    if (success) {
      this.metricsService.incrementCounter('export_requests_completed' as any);
    } else {
      this.metricsService.incrementCounter('export_requests_failed' as any);
    }
  }

  private async logExportRequest(request: ExportRequest): Promise<void> {
    if (!this.auditLogService) return;

    await this.auditLogService.log({
      user_id: request.requested_by,
      action: 'export_report',
      entity_type: 'report',
      entity_id: `${request.report_type}_${request.format}`,
      metadata: {
        report_type: request.report_type,
        format: request.format,
        filters: request.filters,
        timestamp: request.requested_at.toISOString(),
      },
    });
  }

  verifyDownloadAccess(token: string, userId?: string): {
    valid: boolean;
    expired: boolean;
    file_id?: string;
  } {
    const result = this.signedUrlService.verifyDownloadToken(token, userId);

    return {
      valid: result.valid,
      expired: result.expired,
      file_id: result.resource,
    };
  }

  async refreshMaterializedViews(): Promise<void> {
    const views = [
      'daily_attendance_summary',
      'weekly_attendance_summary',
      'monthly_attendance_summary',
      'office_occupancy_summary',
    ];

    for (const view of views) {
      await this.reportingRepo.refreshMaterializedView(view);
    }
  }

  async getReportPreview(
    reportType: ReportType,
    filters: ReportFilter,
    limit: number = 10
  ): Promise<any[]> {
    return this.fetchReportData(reportType, filters, { page: 1, limit });
  }

  async createExportRequest(options: GenerateReportOptions): Promise<ExportRecord> {
    const exportRecord = await this.exportRequestRepo.create({
      report_type: options.report_type,
      format: options.format,
      filters: options.filters,
      requested_by: options.requested_by,
    });

    return exportRecord;
  }

  async updateExportRequest(
    id: string,
    result: GenerateReportResult,
    status: 'completed' | 'failed',
    errorMessage?: string
  ): Promise<ExportRecord> {
    return this.exportRequestRepo.update(id, {
      status,
      file_id: result.file_id,
      file_path: result.file_path,
      signed_url_token: result.signed_url,
      url_expires_at: result.expires_at,
      record_count: result.record_count,
      generation_time_ms: result.generation_time_ms,
      error_message: errorMessage,
      completed_at: new Date(),
    });
  }

  async getUserExportHistory(userId: string, limit: number = 50): Promise<ExportRecord[]> {
    return this.exportRequestRepo.findByUserId(userId, limit);
  }

  async cleanupExpiredExports(): Promise<number> {
    return this.exportRequestRepo.deleteExpired();
  }
}
