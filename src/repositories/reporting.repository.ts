import { BaseRepository } from './base.repository';
import {
  DailyAttendanceSummary,
  WeeklyAttendanceSummary,
  MonthlyAttendanceSummary,
  OfficeOccupancySummary,
  ReportFilter,
  PaginationParams,
  PaginatedResult,
} from '../types';

export class ReportingRepository extends BaseRepository {
  async getDailyAttendanceSummary(
    filter: ReportFilter,
    pagination: PaginationParams = {}
  ): Promise<PaginatedResult<DailyAttendanceSummary>> {
    const { page = 1, limit = 100 } = pagination;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.start_date) {
      conditions.push(`attendance_date >= $${paramIndex++}`);
      params.push(filter.start_date);
    }

    if (filter.end_date) {
      conditions.push(`attendance_date <= $${paramIndex++}`);
      params.push(filter.end_date);
    }

    if (filter.office_id) {
      conditions.push(`office_id = $${paramIndex++}`);
      params.push(filter.office_id);
    }

    if (filter.user_id) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filter.user_id);
    }

    if (filter.department) {
      conditions.push(`department = $${paramIndex++}`);
      params.push(filter.department);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM daily_attendance_summary
      ${whereClause}
    `;

    const countResult = await this.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total, 10);

    const dataQuery = `
      SELECT *
      FROM daily_attendance_summary
      ${whereClause}
      ORDER BY attendance_date DESC, office_name, full_name
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const dataParams = [...params, limit, offset];
    const dataResult = await this.query<DailyAttendanceSummary>(dataQuery, dataParams);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async getWeeklyAttendanceSummary(
    filter: ReportFilter,
    pagination: PaginationParams = {}
  ): Promise<PaginatedResult<WeeklyAttendanceSummary>> {
    const { page = 1, limit = 100 } = pagination;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.start_date) {
      conditions.push(`week_start_date >= $${paramIndex++}`);
      params.push(filter.start_date);
    }

    if (filter.end_date) {
      conditions.push(`week_start_date <= $${paramIndex++}`);
      params.push(filter.end_date);
    }

    if (filter.office_id) {
      conditions.push(`office_id = $${paramIndex++}`);
      params.push(filter.office_id);
    }

    if (filter.user_id) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filter.user_id);
    }

    if (filter.department) {
      conditions.push(`department = $${paramIndex++}`);
      params.push(filter.department);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM weekly_attendance_summary
      ${whereClause}
    `;

    const countResult = await this.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total, 10);

    const dataQuery = `
      SELECT *
      FROM weekly_attendance_summary
      ${whereClause}
      ORDER BY week_start_date DESC, office_name, full_name
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const dataParams = [...params, limit, offset];
    const dataResult = await this.query<WeeklyAttendanceSummary>(dataQuery, dataParams);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async getMonthlyAttendanceSummary(
    filter: ReportFilter,
    pagination: PaginationParams = {}
  ): Promise<PaginatedResult<MonthlyAttendanceSummary>> {
    const { page = 1, limit = 100 } = pagination;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.start_date) {
      conditions.push(`month_start_date >= $${paramIndex++}`);
      params.push(filter.start_date);
    }

    if (filter.end_date) {
      conditions.push(`month_start_date <= $${paramIndex++}`);
      params.push(filter.end_date);
    }

    if (filter.office_id) {
      conditions.push(`office_id = $${paramIndex++}`);
      params.push(filter.office_id);
    }

    if (filter.user_id) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filter.user_id);
    }

    if (filter.department) {
      conditions.push(`department = $${paramIndex++}`);
      params.push(filter.department);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM monthly_attendance_summary
      ${whereClause}
    `;

    const countResult = await this.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total, 10);

    const dataQuery = `
      SELECT *
      FROM monthly_attendance_summary
      ${whereClause}
      ORDER BY month_start_date DESC, office_name, full_name
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const dataParams = [...params, limit, offset];
    const dataResult = await this.query<MonthlyAttendanceSummary>(dataQuery, dataParams);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async getOfficeOccupancySummary(
    filter: ReportFilter,
    pagination: PaginationParams = {}
  ): Promise<PaginatedResult<OfficeOccupancySummary>> {
    const { page = 1, limit = 100 } = pagination;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.start_date) {
      conditions.push(`occupancy_date >= $${paramIndex++}`);
      params.push(filter.start_date);
    }

    if (filter.end_date) {
      conditions.push(`occupancy_date <= $${paramIndex++}`);
      params.push(filter.end_date);
    }

    if (filter.office_id) {
      conditions.push(`office_id = $${paramIndex++}`);
      params.push(filter.office_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM office_occupancy_summary
      ${whereClause}
    `;

    const countResult = await this.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total, 10);

    const dataQuery = `
      SELECT *
      FROM office_occupancy_summary
      ${whereClause}
      ORDER BY occupancy_date DESC, hour DESC, office_name
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const dataParams = [...params, limit, offset];
    const dataResult = await this.query<OfficeOccupancySummary>(dataQuery, dataParams);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async refreshMaterializedView(viewName: string): Promise<void> {
    const allowedViews = [
      'daily_attendance_summary',
      'weekly_attendance_summary',
      'monthly_attendance_summary',
      'office_occupancy_summary',
    ];

    if (!allowedViews.includes(viewName)) {
      throw new Error(`Invalid view name: ${viewName}`);
    }

    await this.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`);
  }
}
