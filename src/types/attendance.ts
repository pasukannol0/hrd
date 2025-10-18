import { PolicyEvaluationResult } from './policy-engine';

export interface AttendanceRecord {
  id: string;
  user_id: string;
  device_id: string;
  office_id: string;
  policy_set_id?: string;
  check_in_time: Date;
  check_out_time?: Date;
  check_in_location: string;
  check_out_location?: string;
  check_in_method: string;
  check_out_method?: string;
  beacon_id?: string;
  nfc_tag_id?: string;
  network_ssid?: string;
  status: string;
  work_duration_minutes?: number;
  integrity_verdict: IntegrityVerdict;
  signature_check_in?: string;
  signature_check_out?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface IntegrityVerdict {
  policy_evaluation?: PolicyEvaluationResult;
  motion_guard?: MotionGuardResult;
  device_trust?: DeviceTrustResult;
  rate_limit?: RateLimitResult;
  overall_score: number;
  timestamp: Date;
  version: string;
}

export interface MotionGuardResult {
  passed: boolean;
  teleport_detected: boolean;
  speed_violation: boolean;
  speed_mps?: number;
  distance_meters?: number;
  time_delta_seconds?: number;
  last_location?: {
    latitude: number;
    longitude: number;
    timestamp: Date;
  };
  details?: string;
}

export interface DeviceTrustResult {
  passed: boolean;
  is_trusted: boolean;
  device_id: string;
  device_fingerprint?: string;
  last_seen?: Date;
  trust_score?: number;
  details?: string;
}

export interface RateLimitResult {
  passed: boolean;
  limit: number;
  remaining: number;
  reset_at: Date;
  blocked: boolean;
}

export interface AttendanceSubmissionRequest {
  user_id: string;
  device_id: string;
  office_id?: string;
  timestamp: Date;
  location: {
    latitude: number;
    longitude: number;
  };
  wifi?: {
    ssid?: string;
    bssid?: string;
  };
  beacon?: {
    uuid: string;
    major: number;
    minor: number;
    rssi?: number;
  };
  nfc?: {
    tag_uid: string;
  };
  qr?: {
    token: string;
  };
  face?: {
    image_data: Buffer | string;
  };
  check_in_method: string;
}

export interface AttendanceSubmissionResult {
  success: boolean;
  attendance_id?: string;
  decision: 'accepted' | 'review' | 'rejected';
  rationale: string;
  integrity_verdict: IntegrityVerdict;
  signature?: string;
  metadata: {
    submission_time_ms: number;
    timestamp: Date;
  };
  error?: string;
}

export enum AttendanceStatus {
  PRESENT = 'present',
  LATE = 'late',
  EARLY_DEPARTURE = 'early_departure',
  ABSENT = 'absent',
  REVIEW = 'review',
}

export interface PrometheusMetrics {
  attendance_submissions_total: number;
  attendance_submissions_accepted: number;
  attendance_submissions_rejected: number;
  attendance_submissions_review: number;
  rate_limit_blocks_total: number;
  motion_guard_violations_total: number;
  device_trust_failures_total: number;
}
