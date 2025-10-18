import { Pool, QueryResult } from 'pg';
import { DeviceTrustResult } from '../types';

export interface DeviceBindingConfig {
  pool: Pool;
  requireTrustedDevice?: boolean;
  minTrustScore?: number;
}

export class DeviceBindingService {
  private pool: Pool;
  private requireTrustedDevice: boolean;
  private minTrustScore: number;

  constructor(config: DeviceBindingConfig) {
    this.pool = config.pool;
    this.requireTrustedDevice = config.requireTrustedDevice ?? true;
    this.minTrustScore = config.minTrustScore ?? 0.7;
  }

  async checkDeviceTrust(userId: string, deviceId: string): Promise<DeviceTrustResult> {
    try {
      const query = `
        SELECT 
          id, user_id, device_fingerprint, is_trusted, 
          last_used_at, created_at
        FROM devices
        WHERE id = $1 AND user_id = $2 AND is_active = true
      `;

      const result: QueryResult = await this.pool.query(query, [deviceId, userId]);

      if (result.rows.length === 0) {
        return {
          passed: false,
          is_trusted: false,
          device_id: deviceId,
          details: 'Device not found or not associated with user',
        };
      }

      const device = result.rows[0];
      const isTrusted = device.is_trusted === true;

      await this.updateLastUsed(deviceId);

      if (this.requireTrustedDevice && !isTrusted) {
        return {
          passed: false,
          is_trusted: false,
          device_id: deviceId,
          device_fingerprint: device.device_fingerprint,
          last_seen: device.last_used_at,
          trust_score: 0,
          details: 'Device is not trusted for attendance submission',
        };
      }

      const trustScore = this.calculateTrustScore(device);

      const passed = !this.requireTrustedDevice || (isTrusted && trustScore >= this.minTrustScore);

      return {
        passed,
        is_trusted: isTrusted,
        device_id: deviceId,
        device_fingerprint: device.device_fingerprint,
        last_seen: device.last_used_at,
        trust_score: trustScore,
        details: passed 
          ? `Device verified with trust score ${trustScore.toFixed(2)}`
          : `Device trust score ${trustScore.toFixed(2)} below minimum ${this.minTrustScore}`,
      };
    } catch (error) {
      console.error('Device trust check error:', error);
      return {
        passed: false,
        is_trusted: false,
        device_id: deviceId,
        details: `Error checking device trust: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private calculateTrustScore(device: any): number {
    let score = device.is_trusted ? 1.0 : 0.5;

    const daysSinceCreation = device.created_at 
      ? (Date.now() - new Date(device.created_at).getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    
    if (daysSinceCreation > 30) {
      score = Math.min(1.0, score + 0.1);
    }

    const daysSinceLastUse = device.last_used_at
      ? (Date.now() - new Date(device.last_used_at).getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    
    if (daysSinceLastUse > 90) {
      score = Math.max(0, score - 0.2);
    }

    return Math.max(0, Math.min(1, score));
  }

  private async updateLastUsed(deviceId: string): Promise<void> {
    try {
      const query = `
        UPDATE devices
        SET last_used_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;
      await this.pool.query(query, [deviceId]);
    } catch (error) {
      console.error('Error updating device last used:', error);
    }
  }

  async trustDevice(userId: string, deviceId: string): Promise<boolean> {
    try {
      const query = `
        UPDATE devices
        SET is_trusted = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2
      `;
      const result = await this.pool.query(query, [deviceId, userId]);
      return result.rowCount ? result.rowCount > 0 : false;
    } catch (error) {
      console.error('Error trusting device:', error);
      return false;
    }
  }

  async untrustDevice(userId: string, deviceId: string): Promise<boolean> {
    try {
      const query = `
        UPDATE devices
        SET is_trusted = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2
      `;
      const result = await this.pool.query(query, [deviceId, userId]);
      return result.rowCount ? result.rowCount > 0 : false;
    } catch (error) {
      console.error('Error untrusting device:', error);
      return false;
    }
  }
}
