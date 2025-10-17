import { BaseRepository } from './base.repository';
import { PolicySet } from '../types';

export class PolicyRepository extends BaseRepository {
  async findById(id: string): Promise<PolicySet | null> {
    const cacheKey = this.getCacheKey('policy', id);
    const cached = await this.getCached<PolicySet>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.query<PolicySet>(
      `SELECT 
        id, name, description, office_id,
        working_hours_start, working_hours_end, working_days,
        late_threshold_minutes, early_departure_threshold_minutes,
        require_geofence, require_network_validation,
        require_beacon_proximity, require_nfc_tap,
        max_checkin_distance_meters, is_active, priority,
        created_at, updated_at
      FROM policy_sets
      WHERE id = $1 AND is_active = true`,
      [id]
    );

    const policy = result.rows[0] || null;
    
    if (policy) {
      await this.setCached(cacheKey, policy);
    }

    return policy;
  }

  async findByOfficeId(officeId: string): Promise<PolicySet[]> {
    const cacheKey = `policies:office:${officeId}`;
    const cached = await this.getCached<PolicySet[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.query<PolicySet>(
      `SELECT 
        id, name, description, office_id,
        working_hours_start, working_hours_end, working_days,
        late_threshold_minutes, early_departure_threshold_minutes,
        require_geofence, require_network_validation,
        require_beacon_proximity, require_nfc_tap,
        max_checkin_distance_meters, is_active, priority,
        created_at, updated_at
      FROM policy_sets
      WHERE office_id = $1 AND is_active = true
      ORDER BY priority DESC, created_at DESC`,
      [officeId]
    );

    const policies = result.rows;
    await this.setCached(cacheKey, policies);

    return policies;
  }

  async findGlobalPolicies(): Promise<PolicySet[]> {
    const cacheKey = 'policies:global';
    const cached = await this.getCached<PolicySet[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.query<PolicySet>(
      `SELECT 
        id, name, description, office_id,
        working_hours_start, working_hours_end, working_days,
        late_threshold_minutes, early_departure_threshold_minutes,
        require_geofence, require_network_validation,
        require_beacon_proximity, require_nfc_tap,
        max_checkin_distance_meters, is_active, priority,
        created_at, updated_at
      FROM policy_sets
      WHERE office_id IS NULL AND is_active = true
      ORDER BY priority DESC, created_at DESC`
    );

    const policies = result.rows;
    await this.setCached(cacheKey, policies);

    return policies;
  }

  async findApplicablePolicy(officeId?: string): Promise<PolicySet | null> {
    const cacheKey = officeId 
      ? `policy:applicable:office:${officeId}`
      : 'policy:applicable:global';
      
    const cached = await this.getCached<PolicySet>(cacheKey);
    
    if (cached) {
      return cached;
    }

    let result;
    
    if (officeId) {
      result = await this.query<PolicySet>(
        `SELECT 
          id, name, description, office_id,
          working_hours_start, working_hours_end, working_days,
          late_threshold_minutes, early_departure_threshold_minutes,
          require_geofence, require_network_validation,
          require_beacon_proximity, require_nfc_tap,
          max_checkin_distance_meters, is_active, priority,
          created_at, updated_at
        FROM policy_sets
        WHERE (office_id = $1 OR office_id IS NULL) AND is_active = true
        ORDER BY 
          CASE WHEN office_id IS NOT NULL THEN 1 ELSE 2 END,
          priority DESC,
          created_at DESC
        LIMIT 1`,
        [officeId]
      );
    } else {
      result = await this.query<PolicySet>(
        `SELECT 
          id, name, description, office_id,
          working_hours_start, working_hours_end, working_days,
          late_threshold_minutes, early_departure_threshold_minutes,
          require_geofence, require_network_validation,
          require_beacon_proximity, require_nfc_tap,
          max_checkin_distance_meters, is_active, priority,
          created_at, updated_at
        FROM policy_sets
        WHERE office_id IS NULL AND is_active = true
        ORDER BY priority DESC, created_at DESC
        LIMIT 1`
      );
    }

    const policy = result.rows[0] || null;
    
    if (policy) {
      await this.setCached(cacheKey, policy);
    }

    return policy;
  }

  async invalidateCache(policyId?: string, officeId?: string): Promise<void> {
    if (policyId) {
      await this.deleteCached(this.getCacheKey('policy', policyId));
    }
    if (officeId) {
      await this.deleteCached(`policies:office:${officeId}`);
      await this.deleteCached(`policy:applicable:office:${officeId}`);
    }
    await this.deleteCached('policies:global');
    await this.deleteCached('policy:applicable:global');
  }
}
