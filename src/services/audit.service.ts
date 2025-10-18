import { Pool } from 'pg';

export interface AuditLogEntry {
  user_id?: string;
  entity_type: string;
  entity_id?: string;
  action: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

export interface AuditServiceConfig {
  pool: Pool;
}

export class AuditService {
  private pool: Pool;

  constructor(config: AuditServiceConfig) {
    this.pool = config.pool;
  }

  async log(entry: AuditLogEntry): Promise<string> {
    const query = `
      INSERT INTO audit_logs (
        user_id,
        entity_type,
        entity_id,
        action,
        old_values,
        new_values,
        metadata,
        ip_address,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

    const values = [
      entry.user_id || null,
      entry.entity_type,
      entry.entity_id || null,
      entry.action,
      entry.old_values ? JSON.stringify(entry.old_values) : null,
      entry.new_values ? JSON.stringify(entry.new_values) : null,
      entry.metadata ? JSON.stringify(entry.metadata) : '{}',
      entry.ip_address || null,
      entry.user_agent || null,
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0].id;
  }

  async logLeaveAction(
    leaveId: string,
    action: string,
    actorId: string,
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<string> {
    return this.log({
      user_id: actorId,
      entity_type: 'leave',
      entity_id: leaveId,
      action,
      old_values: oldValues,
      new_values: newValues,
      metadata,
    });
  }

  async getEntityAuditHistory(
    entityType: string,
    entityId: string,
    limit: number = 100
  ): Promise<any[]> {
    const query = `
      SELECT 
        id,
        user_id,
        entity_type,
        entity_id,
        action,
        old_values,
        new_values,
        metadata,
        ip_address,
        user_agent,
        created_at
      FROM audit_logs
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `;

    const result = await this.pool.query(query, [entityType, entityId, limit]);
    return result.rows;
  }

  async getUserAuditHistory(
    userId: string,
    entityType?: string,
    limit: number = 100
  ): Promise<any[]> {
    let query = `
      SELECT 
        id,
        user_id,
        entity_type,
        entity_id,
        action,
        old_values,
        new_values,
        metadata,
        ip_address,
        user_agent,
        created_at
      FROM audit_logs
      WHERE user_id = $1
    `;
    
    const params: any[] = [userId];

    if (entityType) {
      query += ' AND entity_type = $2';
      params.push(entityType);
      query += ' ORDER BY created_at DESC LIMIT $3';
      params.push(limit);
    } else {
      query += ' ORDER BY created_at DESC LIMIT $2';
      params.push(limit);
    }

    const result = await this.pool.query(query, params);
    return result.rows;
  }
}
