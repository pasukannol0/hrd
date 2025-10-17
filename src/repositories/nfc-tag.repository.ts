import { BaseRepository } from './base.repository';
import { NfcTag, GeoPoint } from '../types';

export class NfcTagRepository extends BaseRepository {
  async findById(id: string): Promise<NfcTag | null> {
    const cacheKey = this.getCacheKey('nfc_tag', id);
    const cached = await this.getCached<NfcTag>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.query<NfcTag>(
      `SELECT 
        id, office_id, tag_uid, tag_type,
        location_description,
        ST_AsText(location_point::geometry) as location_point,
        is_active, created_at, updated_at
      FROM nfc_tags
      WHERE id = $1 AND is_active = true`,
      [id]
    );

    const tag = result.rows[0] || null;
    
    if (tag) {
      await this.setCached(cacheKey, tag);
    }

    return tag;
  }

  async findByOfficeId(officeId: string): Promise<NfcTag[]> {
    const cacheKey = `nfc_tags:office:${officeId}`;
    const cached = await this.getCached<NfcTag[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.query<NfcTag>(
      `SELECT 
        id, office_id, tag_uid, tag_type,
        location_description,
        ST_AsText(location_point::geometry) as location_point,
        is_active, created_at, updated_at
      FROM nfc_tags
      WHERE office_id = $1 AND is_active = true
      ORDER BY location_description`,
      [officeId]
    );

    const tags = result.rows;
    await this.setCached(cacheKey, tags);

    return tags;
  }

  async findByTagUid(tagUid: string): Promise<NfcTag | null> {
    const cacheKey = `nfc_tag:uid:${tagUid}`;
    const cached = await this.getCached<NfcTag>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.query<NfcTag>(
      `SELECT 
        id, office_id, tag_uid, tag_type,
        location_description,
        ST_AsText(location_point::geometry) as location_point,
        is_active, created_at, updated_at
      FROM nfc_tags
      WHERE tag_uid = $1 AND is_active = true
      LIMIT 1`,
      [tagUid]
    );

    const tag = result.rows[0] || null;
    
    if (tag) {
      await this.setCached(cacheKey, tag);
    }

    return tag;
  }

  async findNearbyTags(
    point: GeoPoint,
    distanceMeters: number,
    limit: number = 10
  ): Promise<Array<NfcTag & { distance_meters: number }>> {
    const result = await this.query<NfcTag & { distance_meters: number }>(
      `SELECT 
        id, office_id, tag_uid, tag_type,
        location_description,
        ST_AsText(location_point::geometry) as location_point,
        is_active, created_at, updated_at,
        ST_Distance(
          location_point,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) as distance_meters
      FROM nfc_tags
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

  async getDistanceToTag(point: GeoPoint, tagId: string): Promise<number | null> {
    const result = await this.query<{ distance_meters: number }>(
      `SELECT 
        ST_Distance(
          location_point,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) as distance_meters
      FROM nfc_tags
      WHERE id = $3 AND location_point IS NOT NULL`,
      [point.longitude, point.latitude, tagId]
    );

    return result.rows[0]?.distance_meters ?? null;
  }

  async invalidateCache(tagId?: string, officeId?: string): Promise<void> {
    if (tagId) {
      await this.deleteCached(this.getCacheKey('nfc_tag', tagId));
    }
    if (officeId) {
      await this.deleteCached(`nfc_tags:office:${officeId}`);
    }
  }
}
