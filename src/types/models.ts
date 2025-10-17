export interface Office {
  id: string;
  name: string;
  address: string;
  city: string;
  state?: string;
  country: string;
  postal_code?: string;
  boundary: string;
  timezone: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface OfficeNetwork {
  id: string;
  office_id: string;
  ssid: string;
  bssid?: string;
  network_type: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Beacon {
  id: string;
  office_id: string;
  uuid: string;
  major: number;
  minor: number;
  location_description?: string;
  location_point?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface NfcTag {
  id: string;
  office_id: string;
  tag_uid: string;
  tag_type?: string;
  location_description?: string;
  location_point?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PolicySet {
  id: string;
  name: string;
  description?: string;
  office_id?: string;
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];
  late_threshold_minutes: number;
  early_departure_threshold_minutes: number;
  require_geofence: boolean;
  require_network_validation: boolean;
  require_beacon_proximity: boolean;
  require_nfc_tap: boolean;
  max_checkin_distance_meters?: number;
  is_active: boolean;
  priority: number;
  created_at: Date;
  updated_at: Date;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface GeoValidationResult {
  valid: boolean;
  distance_meters?: number;
  within_boundary: boolean;
  office_id?: string;
  office_name?: string;
}

export interface WiFiMatchResult {
  matched: boolean;
  office_id?: string;
  office_name?: string;
  network_id?: string;
  ssid?: string;
  bssid?: string;
}

export interface BeaconProximityResult {
  detected: boolean;
  office_id?: string;
  office_name?: string;
  beacon_id?: string;
  rssi?: number;
  distance_estimate?: number;
}

export interface NfcVerificationResult {
  verified: boolean;
  office_id?: string;
  office_name?: string;
  tag_id?: string;
  tag_uid?: string;
}

export interface QrToken {
  token: string;
  expires_at: Date;
  office_id?: string;
  user_id?: string;
}

export interface QrTokenValidation {
  valid: boolean;
  expired: boolean;
  office_id?: string;
  user_id?: string;
}
