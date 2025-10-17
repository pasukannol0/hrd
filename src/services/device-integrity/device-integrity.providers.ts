import {
  AppAttestPayload,
  DeviceCheckPayload,
  DeviceIntegrityPayload,
  DeviceIntegrityProvider,
  DeviceIntegrityVerificationOptions,
  DeviceIntegrityVerificationResult,
  IntegrityLevel,
  IntegrityProviderType,
  MockIntegrityPayload,
  PlayIntegrityPayload,
} from '../../types';

const base64UrlToBuffer = (input: string): Buffer => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(paddingLength);
  return Buffer.from(padded, 'base64');
};

const decodeAttestationPayload = (payload: string): any => {
  if (!payload) {
    return {};
  }

  try {
    if (payload.includes('.')) {
      const [, encodedPayload] = payload.split('.', 3);
      const buffer = base64UrlToBuffer(encodedPayload || '');
      const json = buffer.toString('utf8');
      return JSON.parse(json);
    }

    const buffer = base64UrlToBuffer(payload);
    const json = buffer.toString('utf8');
    return JSON.parse(json);
  } catch (error) {
    throw new Error(`Failed to decode attestation payload: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
};

const normalizeDate = (value: any, fallback?: Date): Date | undefined => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'number') {
    return new Date(value);
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }

    const asDate = new Date(value);
    return Number.isNaN(asDate.getTime()) ? fallback : asDate;
  }

  if (typeof value === 'object' && value !== null) {
    if ('seconds' in value && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }
  }

  return fallback;
};

const determineIntegrityLevel = (verdicts: string[]): IntegrityLevel => {
  if (verdicts.some(verdict => verdict === 'MEETS_STRONG_INTEGRITY')) {
    return 'STRONG';
  }

  if (verdicts.some(verdict => verdict === 'MEETS_DEVICE_INTEGRITY')) {
    return 'MODERATE';
  }

  if (verdicts.some(verdict => verdict === 'MEETS_BASIC_INTEGRITY')) {
    return 'BASIC';
  }

  return 'UNKNOWN';
};

const ensureArray = (value: any): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  return [String(value)];
};

const defaultIntegrityLevel = (value?: IntegrityLevel): IntegrityLevel => value ?? 'UNKNOWN';

export class PlayIntegrityProvider implements DeviceIntegrityProvider {
  readonly type = IntegrityProviderType.PLAY_INTEGRITY;
  private readonly defaultMaxAgeMs: number;

  constructor(config?: { maxAgeMs?: number }) {
    this.defaultMaxAgeMs = config?.maxAgeMs ?? 2 * 60 * 1000;
  }

  async verifyAttestation(
    payload: DeviceIntegrityPayload,
    options: DeviceIntegrityVerificationOptions
  ): Promise<DeviceIntegrityVerificationResult> {
    if (payload.type !== IntegrityProviderType.PLAY_INTEGRITY) {
      throw new Error('PlayIntegrityProvider received unsupported payload');
    }

    const typedPayload = payload as PlayIntegrityPayload;
    const decoded = decodeAttestationPayload(typedPayload.signedAttestation);
    const now = options.now ?? new Date();

    const nonce = decoded.nonce ?? decoded.payload?.nonce ?? decoded.tokenPayloadExternal?.nonce;
    const timestampRaw = decoded.timestampMillis ?? decoded.timestampMs ?? decoded.timestamp ?? decoded.payload?.timestampMillis;
    const issuedAt = normalizeDate(timestampRaw, now);
    const maxAge = options.maxAgeMs ?? this.defaultMaxAgeMs;
    const ageMs = issuedAt ? Math.max(0, now.getTime() - issuedAt.getTime()) : undefined;
    const expired = typeof maxAge === 'number' && typeof ageMs === 'number' && ageMs > maxAge;

    const verdicts = ensureArray(
      decoded.deviceIntegrity?.deviceRecognitionVerdict ??
      decoded.deviceIntegrityVerdict ??
      decoded.deviceIntegrity?.deviceVerdict
    );

    const riskSignals = new Set<string>();
    if (decoded.environmentDetails?.riskSignals) {
      ensureArray(decoded.environmentDetails.riskSignals).forEach(signal => riskSignals.add(signal));
    }
    if (decoded.accountDetails?.riskSignals) {
      ensureArray(decoded.accountDetails.riskSignals).forEach(signal => riskSignals.add(signal));
    }
    if (decoded.accountIntegrity?.appLicensingVerdict) {
      riskSignals.add(String(decoded.accountIntegrity.appLicensingVerdict));
    }
    if (verdicts.some(verdict => verdict.startsWith('FAILED'))) {
      riskSignals.add('ROOTED');
    }

    const reasons: string[] = [];
    const warnings: string[] = [];

    if (options.expectedNonce) {
      if (!nonce) {
        reasons.push('nonce_missing');
      } else if (nonce !== options.expectedNonce) {
        reasons.push('nonce_mismatch');
      }
    }

    if (expired) {
      reasons.push('attestation_expired');
    }

    if (verdicts.length === 0) {
      warnings.push('missing_device_integrity_verdict');
    }

    const deviceId = typedPayload.deviceId ?? decoded.deviceId ?? decoded.device?.id ?? decoded.accountId;
    const devicePublicKey = typedPayload.devicePublicKey ?? decoded.devicePublicKey ?? decoded.publicKey ?? decoded.key;

    const integrityLevel = verdicts.length > 0 ? determineIntegrityLevel(verdicts) : 'UNKNOWN';
    const rootDetected = verdicts.some(verdict => verdict.startsWith('FAILED')) || riskSignals.has('ROOTED');
    const jailbreakDetected = riskSignals.has('JAILBROKEN');

    const valid = reasons.length === 0 && (verdicts.length === 0 || verdicts.some(verdict => verdict.startsWith('MEETS')));

    return {
      valid,
      provider: this.type,
      deviceId,
      devicePublicKey,
      issuedAt,
      expiresAt: issuedAt && maxAge ? new Date(issuedAt.getTime() + maxAge) : undefined,
      nonce,
      integrityLevel,
      riskSignals: Array.from(riskSignals),
      rootDetected,
      jailbreakDetected,
      metadata: {
        applicationId: typedPayload.applicationId ?? decoded.applicationId ?? decoded.packageName,
        packageName: typedPayload.packageName ?? decoded.packageName,
        verdicts,
        evaluationType: decoded.environmentDetails?.appRecognitionVerdict,
      },
      warnings,
      reasons,
    };
  }
}

export class AppAttestProvider implements DeviceIntegrityProvider {
  readonly type = IntegrityProviderType.APP_ATTEST;
  private readonly defaultMaxAgeMs: number;

  constructor(config?: { maxAgeMs?: number }) {
    this.defaultMaxAgeMs = config?.maxAgeMs ?? 5 * 60 * 1000;
  }

  async verifyAttestation(
    payload: DeviceIntegrityPayload,
    options: DeviceIntegrityVerificationOptions
  ): Promise<DeviceIntegrityVerificationResult> {
    if (payload.type !== IntegrityProviderType.APP_ATTEST) {
      throw new Error('AppAttestProvider received unsupported payload');
    }

    const typedPayload = payload as AppAttestPayload;
    const decoded = decodeAttestationPayload(typedPayload.attestation);
    const now = options.now ?? new Date();

    const nonce = decoded.nonce ?? decoded.challenge ?? typedPayload.challenge;
    const issuedAt = normalizeDate(decoded.timestamp ?? decoded.timestampMs ?? decoded.issuedAt, now);
    const maxAge = options.maxAgeMs ?? this.defaultMaxAgeMs;
    const ageMs = issuedAt ? Math.max(0, now.getTime() - issuedAt.getTime()) : undefined;
    const expired = typeof maxAge === 'number' && typeof ageMs === 'number' && ageMs > maxAge;

    const reasons: string[] = [];
    const warnings: string[] = [];

    if (options.expectedNonce) {
      if (!nonce) {
        reasons.push('nonce_missing');
      } else if (nonce !== options.expectedNonce) {
        reasons.push('nonce_mismatch');
      }
    }

    if (expired) {
      reasons.push('attestation_expired');
    }

    const deviceId = typedPayload.deviceId ?? decoded.deviceIdentifier ?? decoded.deviceId;
    const devicePublicKey = typedPayload.devicePublicKey ?? decoded.publicKey ?? decoded.key;

    const riskSignals = new Set<string>();
    if (decoded.isJailbroken === true || decoded.jailbreakDetected === true) {
      riskSignals.add('JAILBROKEN');
    }
    if (decoded.isDebuggable === true) {
      riskSignals.add('DEBUGGABLE');
    }
    if (decoded.isLocked === false) {
      riskSignals.add('DEVICE_UNLOCKED');
    }

    const rootDetected = decoded.isJailbroken === true || decoded.jailbreakDetected === true;
    const jailbreakDetected = rootDetected;

    const integrityLevel: IntegrityLevel = decoded.attestationType === 'DEVICE' ? 'STRONG' : decoded.attestationType === 'BASIC' ? 'BASIC' : 'UNKNOWN';

    const valid = reasons.length === 0 && decoded.attestationTrusted !== false;

    return {
      valid,
      provider: this.type,
      deviceId,
      devicePublicKey,
      issuedAt,
      expiresAt: issuedAt && maxAge ? new Date(issuedAt.getTime() + maxAge) : undefined,
      nonce,
      integrityLevel: defaultIntegrityLevel(integrityLevel),
      riskSignals: Array.from(riskSignals),
      rootDetected,
      jailbreakDetected,
      metadata: {
        keyId: typedPayload.keyId,
        environment: decoded.environment,
        teamId: decoded.teamId,
        bundleId: decoded.bundleId,
      },
      warnings,
      reasons,
    };
  }
}

export class DeviceCheckProvider implements DeviceIntegrityProvider {
  readonly type = IntegrityProviderType.DEVICE_CHECK;
  private readonly defaultMaxAgeMs: number;

  constructor(config?: { maxAgeMs?: number }) {
    this.defaultMaxAgeMs = config?.maxAgeMs ?? 5 * 60 * 1000;
  }

  async verifyAttestation(
    payload: DeviceIntegrityPayload,
    options: DeviceIntegrityVerificationOptions
  ): Promise<DeviceIntegrityVerificationResult> {
    if (payload.type !== IntegrityProviderType.DEVICE_CHECK) {
      throw new Error('DeviceCheckProvider received unsupported payload');
    }

    const typedPayload = payload as DeviceCheckPayload;
    const decoded = decodeAttestationPayload(typedPayload.deviceToken);
    const now = options.now ?? new Date();

    const nonce = decoded.nonce ?? decoded.challenge ?? decoded.transactionId ?? typedPayload.transactionId;
    const issuedAt = normalizeDate(decoded.timestamp ?? decoded.timestampMs ?? decoded.issuedAt, now);
    const maxAge = options.maxAgeMs ?? this.defaultMaxAgeMs;
    const ageMs = issuedAt ? Math.max(0, now.getTime() - issuedAt.getTime()) : undefined;
    const expired = typeof maxAge === 'number' && typeof ageMs === 'number' && ageMs > maxAge;

    const reasons: string[] = [];
    const warnings: string[] = [];

    if (options.expectedNonce) {
      if (!nonce) {
        reasons.push('nonce_missing');
      } else if (nonce !== options.expectedNonce) {
        reasons.push('nonce_mismatch');
      }
    }

    if (expired) {
      reasons.push('attestation_expired');
    }

    const deviceId = typedPayload.deviceId ?? decoded.deviceId ?? decoded.deviceIdentifier;
    const devicePublicKey = typedPayload.devicePublicKey ?? decoded.devicePublicKey ?? decoded.publicKey;

    const riskSignals = new Set<string>();
    ensureArray(decoded.signals).forEach(signal => riskSignals.add(signal));
    if (decoded.isJailbroken) {
      riskSignals.add('JAILBROKEN');
    }
    if (decoded.isCompromised) {
      riskSignals.add('COMPROMISED');
    }

    const rootDetected = decoded.isJailbroken === true || decoded.isCompromised === true || riskSignals.has('ROOTED');
    const jailbreakDetected = decoded.isJailbroken === true || riskSignals.has('JAILBROKEN');

    const status = String(decoded.status ?? '').toUpperCase();
    let integrityLevel: IntegrityLevel = 'UNKNOWN';
    if (status === 'TRUSTED') {
      integrityLevel = 'STRONG';
    } else if (status === 'UNSPECIFIED') {
      integrityLevel = 'BASIC';
    } else if (status === 'UNKNOWN') {
      integrityLevel = 'UNKNOWN';
    }

    const valid = reasons.length === 0 && status !== 'DENIED';

    return {
      valid,
      provider: this.type,
      deviceId,
      devicePublicKey,
      issuedAt,
      expiresAt: issuedAt && maxAge ? new Date(issuedAt.getTime() + maxAge) : undefined,
      nonce,
      integrityLevel,
      riskSignals: Array.from(riskSignals),
      rootDetected,
      jailbreakDetected,
      metadata: {
        transactionId: typedPayload.transactionId ?? decoded.transactionId,
        status,
      },
      warnings,
      reasons,
    };
  }
}

export class MockIntegrityProvider implements DeviceIntegrityProvider {
  readonly type = IntegrityProviderType.MOCK;

  async verifyAttestation(
    payload: DeviceIntegrityPayload,
    options: DeviceIntegrityVerificationOptions
  ): Promise<DeviceIntegrityVerificationResult> {
    if (payload.type !== IntegrityProviderType.MOCK) {
      throw new Error('MockIntegrityProvider received unsupported payload');
    }

    const typedPayload = payload as MockIntegrityPayload;
    const now = options.now ?? new Date();
    const issuedAt = normalizeDate(typedPayload.issuedAt, now) ?? now;
    const expiresAt = normalizeDate(typedPayload.expiresAt) ?? new Date(issuedAt.getTime() + (options.maxAgeMs ?? 5 * 60 * 1000));
    const nonce = typedPayload.nonce ?? options.expectedNonce;
    const reasons: string[] = [];

    if (options.expectedNonce && nonce !== options.expectedNonce) {
      reasons.push('nonce_mismatch');
    }

    const valid = typedPayload.valid ?? reasons.length === 0;

    return {
      valid,
      provider: this.type,
      deviceId: typedPayload.deviceId ?? options.deviceId,
      devicePublicKey: typedPayload.devicePublicKey,
      issuedAt,
      expiresAt,
      nonce,
      integrityLevel: defaultIntegrityLevel(typedPayload.integrityLevel),
      riskSignals: [],
      rootDetected: false,
      jailbreakDetected: false,
      metadata: typedPayload.claims,
      warnings: [],
      reasons,
    };
  }
}
