import { Pool, QueryResult } from 'pg';
import { BaseRepository, RepositoryConfig } from './base.repository';
import { AttendanceRecord, IntegrityVerdict } from '../types';

export class AttendanceRepository extends BaseRepository {
  constructor(config: RepositoryConfig) {
    super(config);
  }

  async create(data: {
    user_id: string;
    device_id: string;
    office_id: string;
    policy_set_id?: string;
    check_in_time: Date;
    check_in_location: { latitude: number; longitude: number };
    check_in_method: string;
    beacon_id?: string;
    nfc_tag_id?: string;
    network_ssid?: string;
    status: string;
    integrity_verdict: IntegrityVerdict;
    signature_check_in?: string;
    notes?: string;
  }): Promise<AttendanceRecord> {
    const query = `
      INSERT INTO attendance (
        user_id, device_id, office_id, policy_set_id,
        check_in_time, check_in_location, check_in_method,
        beacon_id, nfc_tag_id, network_ssid, status,
        integrity_verdict, signature_check_in, notes
      ) VALUES (
        $1, $2, $3, $4, $5, 
        ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
        $8, $9, $10, $11, $12, $13, $14, $15
      )
      RETURNING 
        id, user_id, device_id, office_id, policy_set_id,
        check_in_time, check_out_time,
        ST_AsText(check_in_location) as check_in_location,
        ST_AsText(check_out_location) as check_out_location,
        check_in_method, check_out_method,
        beacon_id, nfc_tag_id, network_ssid,
        status, work_duration_minutes,
        integrity_verdict, signature_check_in, signature_check_out,
        notes, created_at, updated_at
    `;

    const values = [
      data.user_id,
      data.device_id,
      data.office_id,
      data.policy_set_id || null,
      data.check_in_time,
      data.check_in_location.longitude,
      data.check_in_location.latitude,
      data.check_in_method,
      data.beacon_id || null,
      data.nfc_tag_id || null,
      data.network_ssid || null,
      data.status,
      JSON.stringify(data.integrity_verdict),
      data.signature_check_in || null,
      data.notes || null,
    ];

    const result: QueryResult = await this.pool.query(query, values);
    return result.rows[0] as AttendanceRecord;
  }

  async findById(id: string): Promise<AttendanceRecord | null> {
    const query = `
      SELECT 
        id, user_id, device_id, office_id, policy_set_id,
        check_in_time, check_out_time,
        ST_AsText(check_in_location) as check_in_location,
        ST_AsText(check_out_location) as check_out_location,
        check_in_method, check_out_method,
        beacon_id, nfc_tag_id, network_ssid,
        status, work_duration_minutes,
        integrity_verdict, signature_check_in, signature_check_out,
        notes, created_at, updated_at
      FROM attendance
      WHERE id = $1
    `;

    const result: QueryResult = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findLastByUser(userId: string): Promise<AttendanceRecord | null> {
    const query = `
      SELECT 
        id, user_id, device_id, office_id, policy_set_id,
        check_in_time, check_out_time,
        ST_AsText(check_in_location) as check_in_location,
        ST_AsText(check_out_location) as check_out_location,
        check_in_method, check_out_method,
        beacon_id, nfc_tag_id, network_ssid,
        status, work_duration_minutes,
        integrity_verdict, signature_check_in, signature_check_out,
        notes, created_at, updated_at
      FROM attendance
      WHERE user_id = $1
      ORDER BY check_in_time DESC
      LIMIT 1
    `;

    const result: QueryResult = await this.pool.query(query, [userId]);
    return result.rows[0] || null;
  }

  async findByUserAndDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AttendanceRecord[]> {
    const query = `
      SELECT 
        id, user_id, device_id, office_id, policy_set_id,
        check_in_time, check_out_time,
        ST_AsText(check_in_location) as check_in_location,
        ST_AsText(check_out_location) as check_out_location,
        check_in_method, check_out_method,
        beacon_id, nfc_tag_id, network_ssid,
        status, work_duration_minutes,
        integrity_verdict, signature_check_in, signature_check_out,
        notes, created_at, updated_at
      FROM attendance
      WHERE user_id = $1
        AND check_in_time >= $2
        AND check_in_time <= $3
      ORDER BY check_in_time DESC
    `;

    const result: QueryResult = await this.pool.query(query, [userId, startDate, endDate]);
    return result.rows;
  }

  async getLastLocationByUser(userId: string): Promise<{
    latitude: number;
    longitude: number;
    timestamp: Date;
  } | null> {
    const query = `
      SELECT 
        ST_Y(check_in_location::geometry) as latitude,
        ST_X(check_in_location::geometry) as longitude,
        check_in_time as timestamp
      FROM attendance
      WHERE user_id = $1
        AND check_in_location IS NOT NULL
      ORDER BY check_in_time DESC
      LIMIT 1
    `;

    const result: QueryResult = await this.pool.query(query, [userId]);
    return result.rows[0] || null;
  }

  async updateStatus(id: string, status: string, notes?: string): Promise<void> {
    const query = `
      UPDATE attendance
      SET status = $1, notes = COALESCE($2, notes), updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `;

    await this.pool.query(query, [status, notes || null, id]);
  }

  async checkOut(
    id: string,
    checkOutTime: Date,
    checkOutLocation: { latitude: number; longitude: number },
    checkOutMethod: string,
    signatureCheckOut?: string
  ): Promise<void> {
    const query = `
      UPDATE attendance
      SET 
        check_out_time = $1,
        check_out_location = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
        check_out_method = $4,
        signature_check_out = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `;

    await this.pool.query(query, [
      checkOutTime,
      checkOutLocation.longitude,
      checkOutLocation.latitude,
      checkOutMethod,
      signatureCheckOut || null,
      id,
    ]);
  }
}
