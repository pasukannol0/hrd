import { Pool, QueryResult } from 'pg';

export interface AuditLogConfig {
  pool: Pool;
}

export interface AuditLogEntry {
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, any>;
}

export class AuditLogService {
  private pool: Pool;

  constructor(config: AuditLogConfig) {
    this.pool = config.pool;
  }

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const query = `
        INSERT INTO audit_logs (
          user_id, action, entity_type, entity_id,
          old_values, new_values, ip_address, user_agent, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      const values = [
        entry.user_id,
        entry.action,
        entry.entity_type,
        entry.entity_id,
        entry.old_values ? JSON.stringify(entry.old_values) : null,
        entry.new_values ? JSON.stringify(entry.new_values) : null,
        entry.ip_address || null,
        entry.user_agent || null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error('Audit log error:', error);
    }
  }

  async logAttendanceSubmission(data: {
    user_id: string;
    attendance_id: string;
    decision: string;
    integrity_verdict: any;
    ip_address?: string;
    user_agent?: string;
  }): Promise<void> {
    await this.log({
      user_id: data.user_id,
      action: 'attendance_submission',
      entity_type: 'attendance',
      entity_id: data.attendance_id,
      new_values: {
        decision: data.decision,
        integrity_score: data.integrity_verdict.overall_score,
      },
      ip_address: data.ip_address,
      user_agent: data.user_agent,
      metadata: {
        policy_decision: data.decision,
        motion_guard_passed: data.integrity_verdict.motion_guard?.passed,
        device_trust_passed: data.integrity_verdict.device_trust?.passed,
        rate_limit_passed: data.integrity_verdict.rate_limit?.passed,
      },
    });
  }

  async logRateLimitBlock(data: {
    user_id: string;
    ip_address?: string;
    user_agent?: string;
  }): Promise<void> {
    await this.log({
      user_id: data.user_id,
      action: 'rate_limit_block',
      entity_type: 'attendance',
      entity_id: 'n/a',
      ip_address: data.ip_address,
      user_agent: data.user_agent,
      metadata: {
        blocked: true,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async logDeviceTrustFailure(data: {
    user_id: string;
    device_id: string;
    reason: string;
    ip_address?: string;
    user_agent?: string;
  }): Promise<void> {
    await this.log({
      user_id: data.user_id,
      action: 'device_trust_failure',
      entity_type: 'device',
      entity_id: data.device_id,
      ip_address: data.ip_address,
      user_agent: data.user_agent,
      metadata: {
        reason: data.reason,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async logMotionGuardViolation(data: {
    user_id: string;
    violation_type: string;
    details: any;
    ip_address?: string;
    user_agent?: string;
  }): Promise<void> {
    await this.log({
      user_id: data.user_id,
      action: 'motion_guard_violation',
      entity_type: 'attendance',
      entity_id: 'n/a',
      ip_address: data.ip_address,
      user_agent: data.user_agent,
      metadata: {
        violation_type: data.violation_type,
        details: data.details,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async getRecentLogs(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const query = `
        SELECT *
        FROM audit_logs
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;

      const result: QueryResult = await this.pool.query(query, [userId, limit]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return [];
    }
  }
}
