import { Pool, PoolClient } from 'pg';
import { 
  OfficePolicy, 
  OfficePolicySchema, 
  PolicyAuditLog,
  PolicyValidationResult,
} from '../types';
import { PolicyLoaderMiddleware } from './policy-loader.middleware';

export interface PolicyAdminConfig {
  pool: Pool;
  policyLoader: PolicyLoaderMiddleware;
}

export interface CreatePolicyInput {
  name: string;
  description?: string;
  office_id?: string | null;
  priority?: number;
  required_factors: any;
  geo_distance?: any;
  liveness_config?: any;
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];
  late_threshold_minutes?: number;
  early_departure_threshold_minutes?: number;
  created_by: string;
}

export interface UpdatePolicyInput {
  name?: string;
  description?: string;
  office_id?: string | null;
  priority?: number;
  required_factors?: any;
  geo_distance?: any;
  liveness_config?: any;
  working_hours_start?: string;
  working_hours_end?: string;
  working_days?: number[];
  late_threshold_minutes?: number;
  early_departure_threshold_minutes?: number;
  updated_by: string;
  reason?: string;
}

export interface PolicyListOptions {
  office_id?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

export class PolicyAdminService {
  private pool: Pool;
  private policyLoader: PolicyLoaderMiddleware;

  constructor(config: PolicyAdminConfig) {
    this.pool = config.pool;
    this.policyLoader = config.policyLoader;
  }

  async createPolicy(input: CreatePolicyInput): Promise<OfficePolicy> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const policyData = {
        ...input,
        id: this.generateUuid(),
        version: 1,
        is_active: true,
        priority: input.priority || 0,
        late_threshold_minutes: input.late_threshold_minutes || 15,
        early_departure_threshold_minutes: input.early_departure_threshold_minutes || 15,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const validation = this.policyLoader.validatePolicySchema(policyData);
      
      if (!validation.valid) {
        throw new Error(`Policy validation failed: ${JSON.stringify(validation.errors)}`);
      }

      const policy = await this.insertPolicy(client, policyData);

      await this.createAuditLog(client, {
        policy_id: policy.id,
        action: 'created',
        version: policy.version,
        performed_by: input.created_by,
        performed_at: new Date(),
      });

      await client.query('COMMIT');

      await this.policyLoader.invalidatePolicy(policy.id, policy.office_id || undefined);

      return policy;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePolicy(policyId: string, input: UpdatePolicyInput): Promise<OfficePolicy> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const existing = await this.getPolicyById(policyId);
      
      if (!existing) {
        throw new Error(`Policy not found: ${policyId}`);
      }

      const updatedData = {
        ...existing,
        ...input,
        version: existing.version + 1,
        updated_at: new Date(),
        updated_by: input.updated_by,
      };

      delete (updatedData as any).created_by;

      const validation = this.policyLoader.validatePolicySchema(updatedData);
      
      if (!validation.valid) {
        throw new Error(`Policy validation failed: ${JSON.stringify(validation.errors)}`);
      }

      const policy = await this.updatePolicyInDb(client, policyId, updatedData);

      const changes = this.calculateChanges(existing, updatedData);

      await this.createAuditLog(client, {
        policy_id: policyId,
        action: 'updated',
        version: policy.version,
        previous_version: existing.version,
        changes,
        performed_by: input.updated_by,
        performed_at: new Date(),
        reason: input.reason,
      });

      await client.query('COMMIT');

      await this.policyLoader.invalidatePolicy(policyId, policy.office_id || undefined);

      return policy;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deletePolicy(policyId: string, performedBy: string, reason?: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const existing = await this.getPolicyById(policyId);
      
      if (!existing) {
        throw new Error(`Policy not found: ${policyId}`);
      }

      await client.query(
        'DELETE FROM office_policies WHERE id = $1',
        [policyId]
      );

      await this.createAuditLog(client, {
        policy_id: policyId,
        action: 'deleted',
        version: existing.version,
        performed_by: performedBy,
        performed_at: new Date(),
        reason,
      });

      await client.query('COMMIT');

      await this.policyLoader.invalidatePolicy(policyId, existing.office_id || undefined);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async activatePolicy(policyId: string, performedBy: string): Promise<OfficePolicy> {
    return this.togglePolicyStatus(policyId, true, performedBy);
  }

  async deactivatePolicy(policyId: string, performedBy: string): Promise<OfficePolicy> {
    return this.togglePolicyStatus(policyId, false, performedBy);
  }

  private async togglePolicyStatus(
    policyId: string, 
    isActive: boolean, 
    performedBy: string
  ): Promise<OfficePolicy> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE office_policies 
         SET is_active = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [isActive, policyId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Policy not found: ${policyId}`);
      }

      const policy = this.mapDatabaseRowToPolicy(result.rows[0]);

      await this.createAuditLog(client, {
        policy_id: policyId,
        action: isActive ? 'activated' : 'deactivated',
        version: policy.version,
        performed_by: performedBy,
        performed_at: new Date(),
      });

      await client.query('COMMIT');

      await this.policyLoader.invalidatePolicy(policyId, policy.office_id || undefined);

      return policy;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getPolicyById(policyId: string): Promise<OfficePolicy | null> {
    const result = await this.pool.query(
      `SELECT * FROM office_policies WHERE id = $1`,
      [policyId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseRowToPolicy(result.rows[0]);
  }

  async listPolicies(options: PolicyListOptions = {}): Promise<OfficePolicy[]> {
    const { office_id, is_active, limit = 50, offset = 0 } = options;

    let query = 'SELECT * FROM office_policies WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (office_id !== undefined) {
      query += ` AND office_id = $${paramIndex}`;
      params.push(office_id);
      paramIndex++;
    }

    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      params.push(is_active);
      paramIndex++;
    }

    query += ` ORDER BY priority DESC, created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);

    return result.rows.map(row => this.mapDatabaseRowToPolicy(row));
  }

  async getPolicyHistory(policyId: string): Promise<PolicyAuditLog[]> {
    const result = await this.pool.query(
      `SELECT * FROM policy_audit_logs 
       WHERE policy_id = $1 
       ORDER BY performed_at DESC`,
      [policyId]
    );

    return result.rows.map(row => ({
      id: row.id,
      policy_id: row.policy_id,
      action: row.action,
      version: row.version,
      previous_version: row.previous_version,
      changes: row.changes,
      performed_by: row.performed_by,
      performed_at: row.performed_at,
      reason: row.reason,
    }));
  }

  async getAuditLogs(options: {
    policy_id?: string;
    performed_by?: string;
    action?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<PolicyAuditLog[]> {
    const { policy_id, performed_by, action, limit = 100, offset = 0 } = options;

    let query = 'SELECT * FROM policy_audit_logs WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (policy_id) {
      query += ` AND policy_id = $${paramIndex}`;
      params.push(policy_id);
      paramIndex++;
    }

    if (performed_by) {
      query += ` AND performed_by = $${paramIndex}`;
      params.push(performed_by);
      paramIndex++;
    }

    if (action) {
      query += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    query += ` ORDER BY performed_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      policy_id: row.policy_id,
      action: row.action,
      version: row.version,
      previous_version: row.previous_version,
      changes: row.changes,
      performed_by: row.performed_by,
      performed_at: row.performed_at,
      reason: row.reason,
    }));
  }

  private async insertPolicy(client: PoolClient, policy: any): Promise<OfficePolicy> {
    const result = await client.query(
      `INSERT INTO office_policies (
        id, name, description, office_id, version, is_active, priority,
        required_factors, geo_distance, liveness_config,
        working_hours_start, working_hours_end, working_days,
        late_threshold_minutes, early_departure_threshold_minutes,
        created_at, updated_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        policy.id,
        policy.name,
        policy.description,
        policy.office_id,
        policy.version,
        policy.is_active,
        policy.priority,
        JSON.stringify(policy.required_factors),
        policy.geo_distance ? JSON.stringify(policy.geo_distance) : null,
        policy.liveness_config ? JSON.stringify(policy.liveness_config) : null,
        policy.working_hours_start,
        policy.working_hours_end,
        policy.working_days,
        policy.late_threshold_minutes,
        policy.early_departure_threshold_minutes,
        policy.created_at,
        policy.updated_at,
        policy.created_by,
      ]
    );

    return this.mapDatabaseRowToPolicy(result.rows[0]);
  }

  private async updatePolicyInDb(client: PoolClient, policyId: string, policy: any): Promise<OfficePolicy> {
    const result = await client.query(
      `UPDATE office_policies SET
        name = $1,
        description = $2,
        office_id = $3,
        version = $4,
        priority = $5,
        required_factors = $6,
        geo_distance = $7,
        liveness_config = $8,
        working_hours_start = $9,
        working_hours_end = $10,
        working_days = $11,
        late_threshold_minutes = $12,
        early_departure_threshold_minutes = $13,
        updated_at = $14,
        updated_by = $15
      WHERE id = $16
      RETURNING *`,
      [
        policy.name,
        policy.description,
        policy.office_id,
        policy.version,
        policy.priority,
        JSON.stringify(policy.required_factors),
        policy.geo_distance ? JSON.stringify(policy.geo_distance) : null,
        policy.liveness_config ? JSON.stringify(policy.liveness_config) : null,
        policy.working_hours_start,
        policy.working_hours_end,
        policy.working_days,
        policy.late_threshold_minutes,
        policy.early_departure_threshold_minutes,
        policy.updated_at,
        policy.updated_by,
        policyId,
      ]
    );

    return this.mapDatabaseRowToPolicy(result.rows[0]);
  }

  private async createAuditLog(client: PoolClient, log: Omit<PolicyAuditLog, 'id'>): Promise<void> {
    await client.query(
      `INSERT INTO policy_audit_logs (
        id, policy_id, action, version, previous_version, changes,
        performed_by, performed_at, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        this.generateUuid(),
        log.policy_id,
        log.action,
        log.version,
        log.previous_version,
        log.changes ? JSON.stringify(log.changes) : null,
        log.performed_by,
        log.performed_at,
        log.reason,
      ]
    );
  }

  private calculateChanges(oldPolicy: any, newPolicy: any): Record<string, any> {
    const changes: Record<string, any> = {};
    const keys = Object.keys(newPolicy);

    for (const key of keys) {
      if (key === 'version' || key === 'updated_at' || key === 'updated_by') {
        continue;
      }

      const oldValue = oldPolicy[key];
      const newValue = newPolicy[key];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes[key] = {
          old: oldValue,
          new: newValue,
        };
      }
    }

    return changes;
  }

  private mapDatabaseRowToPolicy(row: any): OfficePolicy {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      office_id: row.office_id,
      version: row.version,
      is_active: row.is_active,
      priority: row.priority,
      required_factors: typeof row.required_factors === 'string' 
        ? JSON.parse(row.required_factors) 
        : row.required_factors,
      geo_distance: row.geo_distance 
        ? (typeof row.geo_distance === 'string' ? JSON.parse(row.geo_distance) : row.geo_distance)
        : undefined,
      liveness_config: row.liveness_config 
        ? (typeof row.liveness_config === 'string' ? JSON.parse(row.liveness_config) : row.liveness_config)
        : undefined,
      working_hours_start: row.working_hours_start,
      working_hours_end: row.working_hours_end,
      working_days: row.working_days,
      late_threshold_minutes: row.late_threshold_minutes,
      early_departure_threshold_minutes: row.early_departure_threshold_minutes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: row.created_by,
      updated_by: row.updated_by,
    };
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
