import { BaseRepository } from './base.repository';
import { Beacon, GeoPoint } from '../types';

export class BeaconRepository extends BaseRepository {
  async findById(id: string): Promise<Beacon | null> {
    const cacheKey = this.getCacheKey('beacon', id);
    const cached = await this.getCached<Beacon>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.query<Beacon>(
      `SELECT 
        id, office_id, uuid, major, minor,
        location_description,
        ST_AsText(location_point::geometry) as location_point,
        is_active, created_at, updated_at
      FROM beacons
      WHERE id = $1 AND is_active = true`,
      [id]
    );

    const beacon = result.rows[0] || null;
    
    if (beacon) {
      await this.setCached(cacheKey, beacon);
    }

    return beacon;
  }

  async findByOfficeId(officeId: string): Promise<Beacon[]> {
    const cacheKey = `beacons:office:${officeId}`;
    const cached = await this.getCached<Beacon[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.query<Beacon>(
      `SELECT 
        id, office_id, uuid, major, minor,
        location_description,
        ST_AsText(location_point::geometry) as location_point,
        is_active, created_at, updated_at
      FROM beacons
      WHERE office_id = $1 AND is_active = true
      ORDER BY major, minor`,
      [officeId]
    );

    const beacons = result.rows;
    await this.setCached(cacheKey, beacons);

    return beacons;
  }

  async findByBeaconIdentifier(
    uuid: string,
    major: number,
    minor: number
  ): Promise<Beacon | null> {
    const cacheKey = `beacon:identifier:${uuid}:${major}:${minor}`;
    const cached = await this.getCached<Beacon>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.query<Beacon>(
      `SELECT 
        id, office_id, uuid, major, minor,
        location_description,
        ST_AsText(location_point::geometry) as location_point,
        is_active, created_at, updated_at
      FROM beacons
      WHERE uuid = $1 AND major = $2 AND minor = $3 AND is_active = true
      LIMIT 1`,
      [uuid, major, minor]
    );

    const beacon = result.rows[0] || null;
    
    if (beacon) {
      await this.setCached(cacheKey, beacon);
    }

    return beacon;
  }

  async findNearbyBeacons(
    point: GeoPoint,
    distanceMeters: number,
    limit: number = 10
  ): Promise<Array<Beacon & { distance_meters: number }>> {
    const result = await this.query<Beacon & { distance_meters: number }>(
      `SELECT 
        id, office_id, uuid, major, minor,
        location_description,
        ST_AsText(location_point::geometry) as location_point,
        is_active, created_at, updated_at,
        ST_Distance(
          location_point,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) as distance_meters
      FROM beacons
      WHERE is_active = true
        AND location_point IS NOT NULL
        AND ST_DWithin(
          location_point,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
      ORDER BY distance_meters ASC
      LIMIT $4`,
      [point.longitude, point.latitude, distanceMeters, limit]
    );

    return result.rows;
  }

  async getDistanceToBeacon(point: GeoPoint, beaconId: string): Promise<number | null> {
    const result = await this.query<{ distance_meters: number }>(
      `SELECT 
        ST_Distance(
          location_point,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) as distance_meters
      FROM beacons
      WHERE id = $3 AND location_point IS NOT NULL`,
      [point.longitude, point.latitude, beaconId]
    );

    return result.rows[0]?.distance_meters ?? null;
  }

  async invalidateCache(beaconId?: string, officeId?: string): Promise<void> {
    if (beaconId) {
      await this.deleteCached(this.getCacheKey('beacon', beaconId));
    }
    if (officeId) {
      await this.deleteCached(`beacons:office:${officeId}`);
    }
  }
}
