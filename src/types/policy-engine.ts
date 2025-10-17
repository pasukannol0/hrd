import { z } from 'zod';

export enum PresenceMode {
  GEOFENCE = 'geofence',
  WIFI = 'wifi',
  BEACON = 'beacon',
  NFC = 'nfc',
  QR = 'qr',
  FACE = 'face',
}

export enum PolicyDecision {
  ACCEPTED = 'accepted',
  REVIEW = 'review',
  REJECTED = 'rejected',
}

export const GeoDistanceConfigSchema = z.object({
  max_distance_meters: z.number().min(0).max(10000),
  strict_boundary_check: z.boolean().default(false),
});

export const LivenessConfigSchema = z.object({
  enabled: z.boolean().default(true),
  min_confidence: z.number().min(0).max(1).default(0.8),
  require_blink: z.boolean().default(false),
  require_head_movement: z.boolean().default(false),
});

export const PresenceModeConfigSchema = z.object({
  mode: z.nativeEnum(PresenceMode),
  required: z.boolean(),
  weight: z.number().min(0).max(1).default(1),
});

export const RequiredFactorsSchema = z.object({
  min_factors: z.number().min(1).max(6).default(1),
  presence_modes: z.array(PresenceModeConfigSchema).min(1),
  allow_fallback: z.boolean().default(true),
});

export const OfficePolicySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  office_id: z.string().uuid().optional().nullable(),
  version: z.number().int().min(1).default(1),
  is_active: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  
  required_factors: RequiredFactorsSchema,
  geo_distance: GeoDistanceConfigSchema.optional(),
  liveness_config: LivenessConfigSchema.optional(),
  
  working_hours_start: z.string().regex(/^\d{2}:\d{2}$/),
  working_hours_end: z.string().regex(/^\d{2}:\d{2}$/),
  working_days: z.array(z.number().min(0).max(6)),
  
  late_threshold_minutes: z.number().min(0).default(15),
  early_departure_threshold_minutes: z.number().min(0).default(15),
  
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
  created_by: z.string().uuid().optional(),
  updated_by: z.string().uuid().optional(),
});

export type OfficePolicy = z.infer<typeof OfficePolicySchema>;
export type GeoDistanceConfig = z.infer<typeof GeoDistanceConfigSchema>;
export type LivenessConfig = z.infer<typeof LivenessConfigSchema>;
export type PresenceModeConfig = z.infer<typeof PresenceModeConfigSchema>;
export type RequiredFactors = z.infer<typeof RequiredFactorsSchema>;

export interface PolicyEvaluationContext {
  user_id: string;
  office_id?: string;
  timestamp: Date;
  location?: {
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
    user_id_claim?: string;
  };
}

export interface FactorEvaluationResult {
  mode: PresenceMode;
  passed: boolean;
  confidence: number;
  details: Record<string, any>;
  error?: string;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  policy_id: string;
  policy_version: number;
  factors_evaluated: FactorEvaluationResult[];
  factors_passed: number;
  factors_required: number;
  rationale: string;
  metadata: {
    evaluation_time_ms: number;
    timestamp: Date;
    office_id?: string;
    working_hours_check?: {
      is_working_hours: boolean;
      is_late: boolean;
      is_early_departure: boolean;
    };
  };
}

export interface PolicyAuditLog {
  id: string;
  policy_id: string;
  action: 'created' | 'updated' | 'deleted' | 'activated' | 'deactivated';
  version: number;
  previous_version?: number;
  changes?: Record<string, any>;
  performed_by: string;
  performed_at: Date;
  reason?: string;
}

export interface PolicyValidationError {
  field: string;
  message: string;
  code: string;
}

export interface PolicyValidationResult {
  valid: boolean;
  errors?: PolicyValidationError[];
  policy?: OfficePolicy;
}
