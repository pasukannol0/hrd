import { BaseRepository } from './base.repository';
import { Office, GeoPoint } from '../types';

export class OfficeRepository extends BaseRepository {
  async findById(id: string): Promise<Office | null> {
    const cacheKey = this.getCacheKey('office', id);
    const cached = await this.getCached<Office>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.query<Office>(
      `SELECT 
        id, name, address, city, state, country, postal_code,
        ST_AsText(boundary::geometry) as boundary,
        timezone, is_active, created_at, updated_at
      FROM offices
      WHERE id = $1 AND is_active = true`,
      [id]
    );

    const office = result.rows[0] || null;
    
    if (office) {
      await this.setCached(cacheKey, office);
    }

    return office;
  }

  async findAll(activeOnly: boolean = true): Promise<Office[]> {
    const cacheKey = `offices:all:${activeOnly}`;
    const cached = await this.getCached<Office[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const query = activeOnly
      ? `SELECT 
          id, name, address, city, state, country, postal_code,
          ST_AsText(boundary::geometry) as boundary,
          timezone, is_active, created_at, updated_at
        FROM offices
        WHERE is_active = true
        ORDER BY name`
      : `SELECT 
          id, name, address, city, state, country, postal_code,
          ST_AsText(boundary::geometry) as boundary,
          timezone, is_active, created_at, updated_at
        FROM offices
        ORDER BY name`;

    const result = await this.query<Office>(query);
    const offices = result.rows;

    await this.setCached(cacheKey, offices, 600);

    return offices;
  }

  async findByLocation(point: GeoPoint): Promise<Office | null> {
    const result = await this.query<Office>(
      `SELECT 
        id, name, address, city, state, country, postal_code,
        ST_AsText(boundary::geometry) as boundary,
        timezone, is_active, created_at, updated_at
      FROM offices
      WHERE is_active = true
        AND ST_Contains(
          boundary,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        )
      LIMIT 1`,
      [point.longitude, point.latitude]
    );

    return result.rows[0] || null;
  }

  async findNearbyOffices(
    point: GeoPoint,
    distanceMeters: number,
    limit: number = 10
  ): Promise<Array<Office & { distance_meters: number }>> {
    const result = await this.query<Office & { distance_meters: number }>(
      `SELECT 
        id, name, address, city, state, country, postal_code,
        ST_AsText(boundary::geometry) as boundary,
        timezone, is_active, created_at, updated_at,
        ST_Distance(
          boundary,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) as distance_meters
      FROM offices
      WHERE is_active = true
        AND ST_DWithin(
          boundary,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
      ORDER BY distance_meters ASC
      LIMIT $4`,
      [point.longitude, point.latitude, distanceMeters, limit]
    );

    return result.rows;
  }

  async getDistanceToOffice(point: GeoPoint, officeId: string): Promise<number | null> {
    const result = await this.query<{ distance_meters: number }>(
      `SELECT 
        ST_Distance(
          boundary,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) as distance_meters
      FROM offices
      WHERE id = $3`,
      [point.longitude, point.latitude, officeId]
    );

    return result.rows[0]?.distance_meters ?? null;
  }

  async isPointInOfficeBoundary(point: GeoPoint, officeId: string): Promise<boolean> {
    const result = await this.query<{ within_boundary: boolean }>(
      `SELECT 
        ST_Contains(
          boundary,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) as within_boundary
      FROM offices
      WHERE id = $3`,
      [point.longitude, point.latitude, officeId]
    );

    return result.rows[0]?.within_boundary ?? false;
  }

  async invalidateCache(officeId?: string): Promise<void> {
    if (officeId) {
      await this.deleteCached(this.getCacheKey('office', officeId));
    }
    await this.deleteCached('offices:all:true');
    await this.deleteCached('offices:all:false');
  }
}
