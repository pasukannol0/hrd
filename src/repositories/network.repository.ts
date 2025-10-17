import { BaseRepository } from './base.repository';
import { OfficeNetwork } from '../types';

export class NetworkRepository extends BaseRepository {
  async findById(id: string): Promise<OfficeNetwork | null> {
    const cacheKey = this.getCacheKey('network', id);
    const cached = await this.getCached<OfficeNetwork>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.query<OfficeNetwork>(
      `SELECT 
        id, office_id, ssid, bssid, network_type, is_active,
        created_at, updated_at
      FROM office_networks
      WHERE id = $1 AND is_active = true`,
      [id]
    );

    const network = result.rows[0] || null;
    
    if (network) {
      await this.setCached(cacheKey, network);
    }

    return network;
  }

  async findByOfficeId(officeId: string): Promise<OfficeNetwork[]> {
    const cacheKey = `networks:office:${officeId}`;
    const cached = await this.getCached<OfficeNetwork[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.query<OfficeNetwork>(
      `SELECT 
        id, office_id, ssid, bssid, network_type, is_active,
        created_at, updated_at
      FROM office_networks
      WHERE office_id = $1 AND is_active = true
      ORDER BY ssid`,
      [officeId]
    );

    const networks = result.rows;
    await this.setCached(cacheKey, networks);

    return networks;
  }

  async findBySSID(ssid: string): Promise<OfficeNetwork[]> {
    const result = await this.query<OfficeNetwork>(
      `SELECT 
        id, office_id, ssid, bssid, network_type, is_active,
        created_at, updated_at
      FROM office_networks
      WHERE ssid = $1 AND is_active = true
      ORDER BY office_id`,
      [ssid]
    );

    return result.rows;
  }

  async findByBSSID(bssid: string): Promise<OfficeNetwork | null> {
    const cacheKey = `network:bssid:${bssid}`;
    const cached = await this.getCached<OfficeNetwork>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.query<OfficeNetwork>(
      `SELECT 
        id, office_id, ssid, bssid, network_type, is_active,
        created_at, updated_at
      FROM office_networks
      WHERE bssid = $1 AND is_active = true
      LIMIT 1`,
      [bssid]
    );

    const network = result.rows[0] || null;
    
    if (network) {
      await this.setCached(cacheKey, network);
    }

    return network;
  }

  async findBySSIDAndBSSID(ssid: string, bssid?: string): Promise<OfficeNetwork | null> {
    if (bssid) {
      const result = await this.query<OfficeNetwork>(
        `SELECT 
          id, office_id, ssid, bssid, network_type, is_active,
          created_at, updated_at
        FROM office_networks
        WHERE ssid = $1 AND bssid = $2 AND is_active = true
        LIMIT 1`,
        [ssid, bssid]
      );

      return result.rows[0] || null;
    } else {
      const result = await this.query<OfficeNetwork>(
        `SELECT 
          id, office_id, ssid, bssid, network_type, is_active,
          created_at, updated_at
        FROM office_networks
        WHERE ssid = $1 AND is_active = true
        LIMIT 1`,
        [ssid]
      );

      return result.rows[0] || null;
    }
  }

  async invalidateCache(networkId?: string, officeId?: string): Promise<void> {
    if (networkId) {
      await this.deleteCached(this.getCacheKey('network', networkId));
    }
    if (officeId) {
      await this.deleteCached(`networks:office:${officeId}`);
    }
  }
}
