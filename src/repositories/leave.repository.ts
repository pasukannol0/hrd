import { PoolClient } from 'pg';
import { BaseRepository } from './base.repository';
import { Leave, LeaveStatus, LeaveType, CreateLeaveRequest, LeaveQueryParams } from '../types';

export class LeaveRepository extends BaseRepository {
  async create(leave: CreateLeaveRequest, client?: PoolClient): Promise<Leave> {
    const query = `
      INSERT INTO leaves (
        user_id,
        leave_type,
        start_date,
        end_date,
        total_days,
        reason,
        attachment_urls,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      leave.user_id,
      leave.leave_type,
      leave.start_date,
      leave.end_date,
      leave.total_days,
      leave.reason || null,
      leave.attachment_urls || null,
      LeaveStatus.PENDING,
    ];

    const executor = client || this.pool;
    const result = await executor.query(query, values);
    return this.mapRowToLeave(result.rows[0]);
  }

  async findById(id: string): Promise<Leave | null> {
    const cacheKey = this.getCacheKey('leave', id);
    const cached = await this.getCached<Leave>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const query = 'SELECT * FROM leaves WHERE id = $1';
    const result = await this.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const leave = this.mapRowToLeave(result.rows[0]);
    await this.setCached(cacheKey, leave);
    return leave;
  }

  async findByUserId(
    userId: string,
    status?: LeaveStatus,
    limit: number = 50,
    offset: number = 0
  ): Promise<Leave[]> {
    let query = 'SELECT * FROM leaves WHERE user_id = $1';
    const params: any[] = [userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
      query += ' ORDER BY start_date DESC LIMIT $3 OFFSET $4';
      params.push(limit, offset);
    } else {
      query += ' ORDER BY start_date DESC LIMIT $2 OFFSET $3';
      params.push(limit, offset);
    }

    const result = await this.query(query, params);
    return result.rows.map(row => this.mapRowToLeave(row));
  }

  async findByStatus(
    status: LeaveStatus,
    limit: number = 50,
    offset: number = 0
  ): Promise<Leave[]> {
    const query = `
      SELECT * FROM leaves 
      WHERE status = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    
    const result = await this.query(query, [status, limit, offset]);
    return result.rows.map(row => this.mapRowToLeave(row));
  }

  async findWithFilters(params: LeaveQueryParams): Promise<Leave[]> {
    let query = 'SELECT * FROM leaves WHERE 1=1';
    const values: any[] = [];
    let paramIndex = 1;

    if (params.user_id) {
      query += ` AND user_id = $${paramIndex++}`;
      values.push(params.user_id);
    }

    if (params.status) {
      query += ` AND status = $${paramIndex++}`;
      values.push(params.status);
    }

    if (params.leave_type) {
      query += ` AND leave_type = $${paramIndex++}`;
      values.push(params.leave_type);
    }

    if (params.start_date) {
      query += ` AND start_date >= $${paramIndex++}`;
      values.push(params.start_date);
    }

    if (params.end_date) {
      query += ` AND end_date <= $${paramIndex++}`;
      values.push(params.end_date);
    }

    query += ` ORDER BY start_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(params.limit || 50, params.offset || 0);

    const result = await this.query(query, values);
    return result.rows.map(row => this.mapRowToLeave(row));
  }

  async updateStatus(
    id: string,
    status: LeaveStatus,
    approvedBy?: string,
    rejectionReason?: string,
    client?: PoolClient
  ): Promise<Leave> {
    let query = `
      UPDATE leaves 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
    `;
    const values: any[] = [status];
    let paramIndex = 2;

    if (status === LeaveStatus.APPROVED && approvedBy) {
      query += `, approved_by = $${paramIndex++}, approved_at = CURRENT_TIMESTAMP`;
      values.push(approvedBy);
    }

    if (status === LeaveStatus.REJECTED && rejectionReason) {
      query += `, rejection_reason = $${paramIndex++}`;
      values.push(rejectionReason);
    }

    query += ` WHERE id = $${paramIndex} RETURNING *`;
    values.push(id);

    const executor = client || this.pool;
    const result = await executor.query(query, values);

    if (result.rows.length === 0) {
      throw new Error(`Leave with id ${id} not found`);
    }

    const leave = this.mapRowToLeave(result.rows[0]);
    
    // Invalidate cache
    await this.deleteCached(this.getCacheKey('leave', id));
    
    return leave;
  }

  async checkOverlap(
    userId: string,
    startDate: Date | string,
    endDate: Date | string,
    excludeLeaveId?: string
  ): Promise<Leave[]> {
    let query = `
      SELECT * FROM leaves
      WHERE user_id = $1
        AND status IN ($2, $3)
        AND (
          (start_date <= $4 AND end_date >= $5)
          OR (start_date <= $6 AND end_date >= $7)
          OR (start_date >= $8 AND end_date <= $9)
        )
    `;
    const values: any[] = [
      userId,
      LeaveStatus.PENDING,
      LeaveStatus.APPROVED,
      endDate, startDate,
      endDate, startDate,
      startDate, endDate,
    ];

    if (excludeLeaveId) {
      query += ' AND id != $10';
      values.push(excludeLeaveId);
    }

    const result = await this.query(query, values);
    return result.rows.map(row => this.mapRowToLeave(row));
  }

  async getApprovedLeavesInRange(
    userId: string,
    startDate: Date | string,
    endDate: Date | string
  ): Promise<Leave[]> {
    const query = `
      SELECT * FROM leaves
      WHERE user_id = $1
        AND status = $2
        AND start_date <= $3
        AND end_date >= $4
      ORDER BY start_date
    `;

    const result = await this.query(query, [
      userId,
      LeaveStatus.APPROVED,
      endDate,
      startDate,
    ]);

    return result.rows.map(row => this.mapRowToLeave(row));
  }

  async countByUserAndStatus(userId: string, status: LeaveStatus): Promise<number> {
    const query = 'SELECT COUNT(*) as count FROM leaves WHERE user_id = $1 AND status = $2';
    const result = await this.query(query, [userId, status]);
    return parseInt(result.rows[0].count, 10);
  }

  async getTotalDaysByUserAndType(
    userId: string,
    leaveType: LeaveType,
    status: LeaveStatus,
    startDate?: Date | string,
    endDate?: Date | string
  ): Promise<number> {
    let query = `
      SELECT COALESCE(SUM(total_days), 0) as total
      FROM leaves
      WHERE user_id = $1 AND leave_type = $2 AND status = $3
    `;
    const values: any[] = [userId, leaveType, status];
    let paramIndex = 4;

    if (startDate) {
      query += ` AND start_date >= $${paramIndex++}`;
      values.push(startDate);
    }

    if (endDate) {
      query += ` AND end_date <= $${paramIndex++}`;
      values.push(endDate);
    }

    const result = await this.query(query, values);
    return parseFloat(result.rows[0].total);
  }

  async delete(id: string, client?: PoolClient): Promise<void> {
    const query = 'DELETE FROM leaves WHERE id = $1';
    const executor = client || this.pool;
    await executor.query(query, [id]);
    await this.deleteCached(this.getCacheKey('leave', id));
  }

  private mapRowToLeave(row: any): Leave {
    return {
      id: row.id,
      user_id: row.user_id,
      leave_type: row.leave_type as LeaveType,
      start_date: row.start_date,
      end_date: row.end_date,
      total_days: parseFloat(row.total_days),
      reason: row.reason,
      status: row.status as LeaveStatus,
      approved_by: row.approved_by,
      approved_at: row.approved_at,
      rejection_reason: row.rejection_reason,
      attachment_urls: row.attachment_urls,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
