import { RedisCache } from '../utils/redis-cache';
import { OfficePolicy, OfficePolicySchema, PolicyValidationResult } from '../types';
import { Pool } from 'pg';

export interface PolicyLoaderConfig {
  cache: RedisCache;
  pool: Pool;
  defaultTtlSeconds?: number;
}

export interface PolicyLoadResult {
  policy: OfficePolicy | null;
  etag: string | null;
  cached: boolean;
  modified: boolean;
}

export type InvalidationHook = (policyId: string, officeId?: string) => Promise<void>;

export class PolicyLoaderMiddleware {
  private cache: RedisCache;
  private pool: Pool;
  private defaultTtlSeconds: number;
  private invalidationHooks: InvalidationHook[] = [];

  constructor(config: PolicyLoaderConfig) {
    this.cache = config.cache;
    this.pool = config.pool;
    this.defaultTtlSeconds = config.defaultTtlSeconds || 300;
  }

  registerInvalidationHook(hook: InvalidationHook): void {
    this.invalidationHooks.push(hook);
  }

  async loadPolicy(
    policyId: string,
    ifNoneMatch?: string
  ): Promise<PolicyLoadResult> {
    const cacheKey = `policy:${policyId}`;
    
    const cached = await this.cache.getWithETag<OfficePolicy>(cacheKey);

    if (cached) {
      if (ifNoneMatch && ifNoneMatch === cached.etag) {
        return {
          policy: null,
          etag: cached.etag,
          cached: true,
          modified: false,
        };
      }

      return {
        policy: cached.value,
        etag: cached.etag,
        cached: true,
        modified: true,
      };
    }

    const policy = await this.fetchPolicyFromDatabase(policyId);

    if (!policy) {
      return {
        policy: null,
        etag: null,
        cached: false,
        modified: true,
      };
    }

    const etag = await this.cache.setWithETag(cacheKey, policy, this.defaultTtlSeconds);

    if (ifNoneMatch && ifNoneMatch === etag) {
      return {
        policy: null,
        etag,
        cached: false,
        modified: false,
      };
    }

    return {
      policy,
      etag,
      cached: false,
      modified: true,
    };
  }

  async loadPolicyByOffice(
    officeId: string,
    ifNoneMatch?: string
  ): Promise<PolicyLoadResult> {
    const cacheKey = `policy:office:${officeId}`;
    
    const cached = await this.cache.getWithETag<OfficePolicy>(cacheKey);

    if (cached) {
      if (ifNoneMatch && ifNoneMatch === cached.etag) {
        return {
          policy: null,
          etag: cached.etag,
          cached: true,
          modified: false,
        };
      }

      return {
        policy: cached.value,
        etag: cached.etag,
        cached: true,
        modified: true,
      };
    }

    const policy = await this.fetchApplicablePolicyForOffice(officeId);

    if (!policy) {
      return {
        policy: null,
        etag: null,
        cached: false,
        modified: true,
      };
    }

    const etag = await this.cache.setWithETag(cacheKey, policy, this.defaultTtlSeconds);

    if (ifNoneMatch && ifNoneMatch === etag) {
      return {
        policy: null,
        etag,
        cached: false,
        modified: false,
      };
    }

    return {
      policy,
      etag,
      cached: false,
      modified: true,
    };
  }

  async invalidatePolicy(policyId: string, officeId?: string): Promise<void> {
    const keys = [`policy:${policyId}`];
    
    if (officeId) {
      keys.push(`policy:office:${officeId}`);
    }

    for (const key of keys) {
      await this.cache.delete(key);
      await this.cache.delete(`${key}:etag`);
    }

    for (const hook of this.invalidationHooks) {
      try {
        await hook(policyId, officeId);
      } catch (error) {
        console.error('Error executing invalidation hook:', error);
      }
    }
  }

  async invalidateOfficePolicy(officeId: string): Promise<void> {
    await this.cache.delete(`policy:office:${officeId}`);
    await this.cache.delete(`policy:office:${officeId}:etag`);
  }

  validatePolicySchema(data: unknown): PolicyValidationResult {
    const result = OfficePolicySchema.safeParse(data);

    if (result.success) {
      return {
        valid: true,
        policy: result.data,
      };
    }

    const errors = result.error.issues.map((err: any) => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    }));

    return {
      valid: false,
      errors,
    };
  }

  private async fetchPolicyFromDatabase(policyId: string): Promise<OfficePolicy | null> {
    const query = `
      SELECT 
        id, name, description, office_id, version, is_active, priority,
        required_factors, geo_distance, liveness_config,
        working_hours_start, working_hours_end, working_days,
        late_threshold_minutes, early_departure_threshold_minutes,
        created_at, updated_at, created_by, updated_by
      FROM office_policies
      WHERE id = $1 AND is_active = true
    `;

    try {
      const result = await this.pool.query(query, [policyId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDatabaseRowToPolicy(result.rows[0]);
    } catch (error) {
      console.error('Error fetching policy from database:', error);
      throw error;
    }
  }

  private async fetchApplicablePolicyForOffice(officeId: string): Promise<OfficePolicy | null> {
    const query = `
      SELECT 
        id, name, description, office_id, version, is_active, priority,
        required_factors, geo_distance, liveness_config,
        working_hours_start, working_hours_end, working_days,
        late_threshold_minutes, early_departure_threshold_minutes,
        created_at, updated_at, created_by, updated_by
      FROM office_policies
      WHERE (office_id = $1 OR office_id IS NULL) AND is_active = true
      ORDER BY 
        CASE WHEN office_id IS NOT NULL THEN 1 ELSE 2 END,
        priority DESC,
        created_at DESC
      LIMIT 1
    `;

    try {
      const result = await this.pool.query(query, [officeId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDatabaseRowToPolicy(result.rows[0]);
    } catch (error) {
      console.error('Error fetching applicable policy from database:', error);
      throw error;
    }
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
      required_factors: row.required_factors,
      geo_distance: row.geo_distance,
      liveness_config: row.liveness_config,
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
}
