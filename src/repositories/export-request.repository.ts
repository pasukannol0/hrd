import { BaseRepository } from './base.repository';
import { ExportRecord, ReportType, ExportFormat, ReportFilter } from '../types';

export interface CreateExportRequestParams {
  report_type: ReportType;
  format: ExportFormat;
  filters: ReportFilter;
  requested_by: string;
  file_id?: string;
  file_path?: string;
  signed_url_token?: string;
  url_expires_at?: Date;
}

export interface UpdateExportRequestParams {
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  file_path?: string;
  file_id?: string;
  signed_url_token?: string;
  url_expires_at?: Date;
  record_count?: number;
  generation_time_ms?: number;
  error_message?: string;
  completed_at?: Date;
}

export class ExportRequestRepository extends BaseRepository {
  async create(params: CreateExportRequestParams): Promise<ExportRecord> {
    const query = `
      INSERT INTO export_requests (
        report_type, format, filters, requested_by,
        file_id, file_path, signed_url_token, url_expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      params.report_type,
      params.format,
      JSON.stringify(params.filters),
      params.requested_by,
      params.file_id || null,
      params.file_path || null,
      params.signed_url_token || null,
      params.url_expires_at || null,
    ];

    const result = await this.query(query, values);
    return this.mapRowToExportRecord(result.rows[0]);
  }

  async update(id: string, params: UpdateExportRequestParams): Promise<ExportRecord> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (params.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(params.status);
    }

    if (params.file_path !== undefined) {
      updates.push(`file_path = $${paramIndex++}`);
      values.push(params.file_path);
    }

    if (params.file_id !== undefined) {
      updates.push(`file_id = $${paramIndex++}`);
      values.push(params.file_id);
    }

    if (params.signed_url_token !== undefined) {
      updates.push(`signed_url_token = $${paramIndex++}`);
      values.push(params.signed_url_token);
    }

    if (params.url_expires_at !== undefined) {
      updates.push(`url_expires_at = $${paramIndex++}`);
      values.push(params.url_expires_at);
    }

    if (params.record_count !== undefined) {
      updates.push(`record_count = $${paramIndex++}`);
      values.push(params.record_count);
    }

    if (params.generation_time_ms !== undefined) {
      updates.push(`generation_time_ms = $${paramIndex++}`);
      values.push(params.generation_time_ms);
    }

    if (params.error_message !== undefined) {
      updates.push(`error_message = $${paramIndex++}`);
      values.push(params.error_message);
    }

    if (params.completed_at !== undefined) {
      updates.push(`completed_at = $${paramIndex++}`);
      values.push(params.completed_at);
    }

    if (updates.length === 0) {
      throw new Error('No updates provided');
    }

    values.push(id);

    const query = `
      UPDATE export_requests
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.query(query, values);
    if (result.rows.length === 0) {
      throw new Error(`Export request not found: ${id}`);
    }

    return this.mapRowToExportRecord(result.rows[0]);
  }

  async findById(id: string): Promise<ExportRecord | null> {
    const query = `
      SELECT *
      FROM export_requests
      WHERE id = $1
    `;

    const result = await this.query(query, [id]);
    return result.rows.length > 0 ? this.mapRowToExportRecord(result.rows[0]) : null;
  }

  async findByFileId(fileId: string): Promise<ExportRecord | null> {
    const query = `
      SELECT *
      FROM export_requests
      WHERE file_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.query(query, [fileId]);
    return result.rows.length > 0 ? this.mapRowToExportRecord(result.rows[0]) : null;
  }

  async findByUserId(userId: string, limit: number = 50): Promise<ExportRecord[]> {
    const query = `
      SELECT *
      FROM export_requests
      WHERE requested_by = $1
      ORDER BY requested_at DESC
      LIMIT $2
    `;

    const result = await this.query(query, [userId, limit]);
    return result.rows.map((row) => this.mapRowToExportRecord(row));
  }

  async deleteExpired(): Promise<number> {
    const query = `
      DELETE FROM export_requests
      WHERE status = 'completed'
        AND url_expires_at IS NOT NULL
        AND url_expires_at < NOW()
    `;

    const result = await this.query(query);
    return result.rowCount || 0;
  }

  private mapRowToExportRecord(row: any): ExportRecord {
    return {
      id: row.id,
      report_type: row.report_type,
      format: row.format,
      filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters,
      requested_by: row.requested_by,
      requested_at: row.requested_at,
      status: row.status,
      file_path: row.file_path,
      signed_url: row.signed_url_token,
      url_expires_at: row.url_expires_at,
      error_message: row.error_message,
      completed_at: row.completed_at,
    };
  }
}
