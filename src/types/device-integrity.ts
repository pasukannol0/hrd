export enum IntegrityProviderType {
  PLAY_INTEGRITY = 'play_integrity',
  APP_ATTEST = 'app_attest',
  DEVICE_CHECK = 'device_check',
  MOCK = 'mock',
}

export type IntegrityMode = IntegrityProviderType;

export type IntegrityLevel =
  | 'STRONG'
  | 'MODERATE'
  | 'BASIC'
  | 'UNKNOWN';

export interface DeviceIntegrityPayloadBase {
  type: IntegrityProviderType;
}

export interface PlayIntegrityPayload extends DeviceIntegrityPayloadBase {
  type: IntegrityProviderType.PLAY_INTEGRITY;
  signedAttestation: string;
  applicationId?: string;
  packageName?: string;
  deviceId?: string;
  devicePublicKey?: string;
}

export interface AppAttestPayload extends DeviceIntegrityPayloadBase {
  type: IntegrityProviderType.APP_ATTEST;
  attestation: string;
  keyId: string;
  challenge: string;
  deviceId?: string;
  devicePublicKey?: string;
}

export interface DeviceCheckPayload extends DeviceIntegrityPayloadBase {
  type: IntegrityProviderType.DEVICE_CHECK;
  deviceToken: string;
  transactionId?: string;
  deviceId?: string;
  devicePublicKey?: string;
}

export interface MockIntegrityPayload extends DeviceIntegrityPayloadBase {
  type: IntegrityProviderType.MOCK;
  deviceId?: string;
  devicePublicKey?: string;
  valid?: boolean;
  nonce?: string;
  integrityLevel?: IntegrityLevel;
  issuedAt?: string | number | Date;
  expiresAt?: string | number | Date;
  claims?: Record<string, any>;
}

export type DeviceIntegrityPayload =
  | PlayIntegrityPayload
  | AppAttestPayload
  | DeviceCheckPayload
  | MockIntegrityPayload;

export interface DeviceIntegrityVerificationOptions {
  expectedNonce?: string;
  maxAgeMs?: number;
  now?: Date;
  userId?: string;
  deviceId?: string;
  environment?: string;
  additionalContext?: Record<string, any>;
}

export interface DeviceIntegrityVerificationResult {
  valid: boolean;
  provider: IntegrityProviderType;
  deviceId?: string;
  devicePublicKey?: string;
  issuedAt?: Date;
  expiresAt?: Date;
  nonce?: string;
  integrityLevel: IntegrityLevel;
  riskSignals?: string[];
  rootDetected?: boolean;
  jailbreakDetected?: boolean;
  metadata?: Record<string, any>;
  warnings?: string[];
  reasons?: string[];
}

export interface DeviceIntegrityProvider {
  readonly type: IntegrityProviderType;
  verifyAttestation(
    payload: DeviceIntegrityPayload,
    options: DeviceIntegrityVerificationOptions
  ): Promise<DeviceIntegrityVerificationResult>;
}

export interface DeviceRootSignalEnvelope {
  rooted?: boolean;
  jailbroken?: boolean;
  tampered?: boolean;
  emulator?: boolean;
  customSignals?: Record<string, any>;
}

export interface DeviceIntegrityRequest {
  provider?: IntegrityProviderType;
  payload: DeviceIntegrityPayload;
  expectedNonce?: string;
  userId: string;
  deviceId?: string;
  devicePublicKey?: string;
  rootSignals?: DeviceRootSignalEnvelope;
  metadata?: Record<string, any>;
  now?: Date;
  maxAgeMs?: number;
}

export interface DeviceBindingRecord {
  userId: string;
  deviceId: string;
  devicePublicKey: string;
  boundAt: Date;
  lastValidatedAt?: Date;
  metadata?: Record<string, any>;
}

export type DeviceBindingStatus =
  | 'valid'
  | 'unbound'
  | 'bound'
  | 'mismatch'
  | 'missing_public_key'
  | 'skipped'
  | 'error';

export interface DeviceBindingValidationResult {
  status: DeviceBindingStatus;
  valid: boolean;
  binding?: DeviceBindingRecord;
  message?: string;
  reason?: string;
  autoBound?: boolean;
}

export interface DeviceBindingStore {
  bind(record: DeviceBindingRecord): Promise<void>;
  validate(
    userId: string,
    deviceId: string,
    devicePublicKey?: string
  ): Promise<DeviceBindingValidationResult>;
  getBinding(userId: string, deviceId: string): Promise<DeviceBindingRecord | null>;
  remove(userId: string, deviceId: string): Promise<void>;
}

export interface RootDetectionInput {
  request: DeviceIntegrityRequest;
  verification: DeviceIntegrityVerificationResult;
  evaluatedAt: Date;
}

export interface RootDetectionResult {
  adapter: string;
  type: 'root' | 'jailbreak' | 'tamper' | string;
  detected: boolean;
  confidence?: number;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface RootDetectionAdapter {
  readonly name: string;
  detect(input: RootDetectionInput): Promise<RootDetectionResult[]>;
}

export interface DeviceIntegrityMetricEvent {
  provider: IntegrityProviderType;
  mode: IntegrityMode;
  valid: boolean;
  latencyMs: number;
  environment: string;
  timestamp: Date;
  deviceId?: string;
  userId?: string;
  integrityLevel: IntegrityLevel;
  rootSignalsDetected: string[];
  bindingStatus: DeviceBindingStatus;
  nonceValidated: boolean;
  attestationAgeMs?: number;
  metadata?: Record<string, any>;
}

export interface IntegrityMetricsEmitter {
  emitVerification(event: DeviceIntegrityMetricEvent): void;
}

export type IntegrityLoggerLevel = 'debug' | 'info' | 'warn' | 'error';

export type IntegrityLogger = (
  level: IntegrityLoggerLevel,
  message: string,
  meta?: Record<string, any>
) => void;

export interface DeviceIntegrityContext {
  mode: IntegrityMode;
  provider: IntegrityProviderType;
  verifiedAt: Date;
  latencyMs: number;
  verification: DeviceIntegrityVerificationResult;
  rootSignals: RootDetectionResult[];
  binding: DeviceBindingValidationResult;
  metrics: {
    rootSignalsDetected: number;
    attestationAgeMs?: number;
  };
}
