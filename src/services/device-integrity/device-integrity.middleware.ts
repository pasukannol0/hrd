import {
  DeviceBindingStore,
  DeviceBindingValidationResult,
  DeviceIntegrityContext,
  DeviceIntegrityMetricEvent,
  DeviceIntegrityProvider,
  DeviceIntegrityRequest,
  DeviceIntegrityVerificationResult,
  IntegrityLogger,
  IntegrityLoggerLevel,
  IntegrityMetricsEmitter,
  IntegrityMode,
  IntegrityProviderType,
  PolicyEvaluationContext,
  RootDetectionAdapter,
  RootDetectionResult,
} from '../../types';
import { InMemoryDeviceBindingStore } from './device-binding.store';
import { BasicRootDetectionAdapter } from './root-detection.adapters';
import { ConsoleIntegrityMetricsEmitter } from './integrity-metrics';
import {
  AppAttestProvider,
  DeviceCheckProvider,
  MockIntegrityProvider,
  PlayIntegrityProvider,
} from './device-integrity.providers';

export interface DeviceIntegrityMiddlewareConfig {
  providers?: DeviceIntegrityProvider[];
  mode?: IntegrityMode | string;
  environment?: string;
  allowMockModeInProduction?: boolean;
  autoBindOnFirstSeen?: boolean;
  bindingStore?: DeviceBindingStore;
  rootDetectionAdapters?: RootDetectionAdapter[];
  metricsEmitter?: IntegrityMetricsEmitter;
  logger?: IntegrityLogger;
  maxAttestationAgeMs?: number;
}

const normalizeMode = (mode?: string | IntegrityMode | null): IntegrityMode | undefined => {
  if (!mode) {
    return undefined;
  }

  const normalized = mode.toString().toLowerCase();

  switch (normalized) {
    case IntegrityProviderType.PLAY_INTEGRITY:
    case 'playintegrity':
    case 'play':
      return IntegrityProviderType.PLAY_INTEGRITY;
    case IntegrityProviderType.APP_ATTEST:
    case 'appattest':
    case 'attest':
      return IntegrityProviderType.APP_ATTEST;
    case IntegrityProviderType.DEVICE_CHECK:
    case 'devicecheck':
    case 'device':
      return IntegrityProviderType.DEVICE_CHECK;
    case IntegrityProviderType.MOCK:
      return IntegrityProviderType.MOCK;
    default:
      return undefined;
  }
};

const defaultLogger: IntegrityLogger = (level: IntegrityLoggerLevel, message: string, meta?: Record<string, any>) => {
  const payload = meta ? { ...meta } : undefined;
  switch (level) {
    case 'debug':
      console.debug(`[device-integrity] ${message}`, payload);
      break;
    case 'warn':
      console.warn(`[device-integrity] ${message}`, payload);
      break;
    case 'error':
      console.error(`[device-integrity] ${message}`, payload);
      break;
    default:
      console.info(`[device-integrity] ${message}`, payload);
  }
};

export class DeviceIntegrityMiddleware {
  private readonly providers = new Map<IntegrityProviderType, DeviceIntegrityProvider>();
  private readonly rootDetectionAdapters: RootDetectionAdapter[];
  private readonly bindingStore: DeviceBindingStore;
  private readonly metricsEmitter: IntegrityMetricsEmitter;
  private readonly logger: IntegrityLogger;
  private readonly environment: string;
  private readonly autoBindOnFirstSeen: boolean;
  private readonly allowMockModeInProduction: boolean;
  private readonly maxAttestationAgeMs?: number;
  private readonly isProductionEnvironment: boolean;
  private mode: IntegrityMode;

  constructor(config?: DeviceIntegrityMiddlewareConfig) {
    const resolvedProviders = (config?.providers && config.providers.length > 0)
      ? config.providers
      : this.buildDefaultProviders();

    resolvedProviders.forEach(provider => {
      this.providers.set(provider.type, provider);
    });

    this.logger = config?.logger ?? defaultLogger;
    this.metricsEmitter = config?.metricsEmitter ?? new ConsoleIntegrityMetricsEmitter();
    this.bindingStore = config?.bindingStore ?? new InMemoryDeviceBindingStore();
    this.rootDetectionAdapters = config?.rootDetectionAdapters ?? [new BasicRootDetectionAdapter()];
    this.autoBindOnFirstSeen = config?.autoBindOnFirstSeen ?? true;
    this.maxAttestationAgeMs = config?.maxAttestationAgeMs;

    const rawEnvironment = (config?.environment ?? process.env.NODE_ENV ?? 'development').toLowerCase();
    this.environment = rawEnvironment;
    this.isProductionEnvironment = rawEnvironment.includes('prod');
    this.allowMockModeInProduction = config?.allowMockModeInProduction ?? false;

    const envMode = normalizeMode(process.env.INTEGRITY_MODE ?? undefined);
    const configMode = normalizeMode(config?.mode ?? undefined);
    const initialMode = configMode ?? envMode;
    this.mode = this.resolveInitialMode(initialMode);

    this.enforceMockSafeguard();
  }

  getMode(): IntegrityMode {
    return this.mode;
  }

  setMode(mode: IntegrityMode | string): void {
    const normalized = normalizeMode(mode);

    if (!normalized) {
      throw new Error(`Unsupported integrity mode: ${mode}`);
    }

    if (!this.providers.has(normalized)) {
      throw new Error(`Integrity provider for mode "${normalized}" is not registered`);
    }

    if (normalized === IntegrityProviderType.MOCK && this.isProductionEnvironment && !this.allowMockModeInProduction) {
      throw new Error('Cannot enable mock integrity mode in production environment');
    }

    this.mode = normalized;
  }

  async verify(request: DeviceIntegrityRequest): Promise<DeviceIntegrityContext> {
    const providerType = this.resolveProviderType(request.provider);
    const provider = this.providers.get(providerType);

    if (!provider) {
      throw new Error(`Integrity provider for mode "${providerType}" is not registered`);
    }

    const startedAt = Date.now();
    const verifiedAt = new Date();

    const verification = await this.performVerification(provider, request, providerType);
    const rootSignals = await this.evaluateRootSignals(request, verification, verifiedAt);
    const binding = await this.evaluateBinding(request, verification);

    const latencyMs = Date.now() - startedAt;
    const attestationAgeMs = verification.issuedAt ? verifiedAt.getTime() - verification.issuedAt.getTime() : undefined;
    const rootSignalsDetected = rootSignals.filter(signal => signal.detected).map(signal => signal.type);

    this.emitMetrics({
      provider: providerType,
      verification,
      latencyMs,
      binding,
      request,
      attestationAgeMs,
      rootSignalsDetected,
    });

    this.logger('info', 'device_integrity.verification', {
      provider: providerType,
      valid: verification.valid,
      deviceId: verification.deviceId ?? request.deviceId,
      userId: request.userId,
      rootSignalsDetected,
      bindingStatus: binding.status,
      mode: this.mode,
    });

    return {
      mode: this.mode,
      provider: providerType,
      verifiedAt,
      latencyMs,
      verification,
      rootSignals,
      binding,
      metrics: {
        rootSignalsDetected: rootSignalsDetected.length,
        attestationAgeMs,
      },
    };
  }

  async enrichPolicyContext(
    context: PolicyEvaluationContext,
    request: DeviceIntegrityRequest
  ): Promise<PolicyEvaluationContext> {
    const integrityContext = await this.verify(request);
    return {
      ...context,
      device_integrity: integrityContext,
    };
  }

  registerProvider(provider: DeviceIntegrityProvider): void {
    this.providers.set(provider.type, provider);
  }

  registerRootDetectionAdapter(adapter: RootDetectionAdapter): void {
    this.rootDetectionAdapters.push(adapter);
  }

  private buildDefaultProviders(): DeviceIntegrityProvider[] {
    return [
      new PlayIntegrityProvider(),
      new AppAttestProvider(),
      new DeviceCheckProvider(),
      new MockIntegrityProvider(),
    ];
  }

  private resolveInitialMode(initialMode?: IntegrityMode): IntegrityMode {
    if (initialMode && this.providers.has(initialMode)) {
      return initialMode;
    }

    const availableMode = this.providers.keys().next().value as IntegrityMode | undefined;

    if (availableMode) {
      return availableMode;
    }

    throw new Error('No device integrity providers registered');
  }

  private resolveProviderType(requested: IntegrityProviderType | string | undefined): IntegrityProviderType {
    const normalized = normalizeMode(requested ?? this.mode);
    if (normalized && this.providers.has(normalized)) {
      return normalized;
    }

    if (normalized) {
      this.logger('warn', 'device_integrity.provider_missing', {
        requested: normalized,
      });
    }

    return this.mode;
  }

  private enforceMockSafeguard(): void {
    if (this.mode === IntegrityProviderType.MOCK && this.isProductionEnvironment && !this.allowMockModeInProduction) {
      throw new Error('INTEGRITY_MODE=mock is forbidden in production environments');
    }

    if (this.mode === IntegrityProviderType.MOCK && !this.isProductionEnvironment) {
      this.logger('warn', 'device_integrity.mock_mode_enabled', {
        environment: this.environment,
      });
    }
  }

  private async performVerification(
    provider: DeviceIntegrityProvider,
    request: DeviceIntegrityRequest,
    providerType: IntegrityProviderType
  ): Promise<DeviceIntegrityVerificationResult> {
    const maxAgeMs = request.maxAgeMs ?? this.maxAttestationAgeMs;

    if (request.payload.type !== providerType) {
      throw new Error(`Device integrity payload type mismatch: expected ${providerType} but received ${request.payload.type}`);
    }

    return provider.verifyAttestation(request.payload, {
      expectedNonce: request.expectedNonce,
      maxAgeMs,
      now: request.now ?? new Date(),
      userId: request.userId,
      deviceId: request.deviceId,
      environment: this.environment,
      additionalContext: request.metadata,
    });
  }

  private async evaluateRootSignals(
    request: DeviceIntegrityRequest,
    verification: DeviceIntegrityVerificationResult,
    evaluatedAt: Date
  ): Promise<RootDetectionResult[]> {
    const results: RootDetectionResult[] = [];

    for (const adapter of this.rootDetectionAdapters) {
      try {
        const adapterResults = await adapter.detect({
          request,
          verification,
          evaluatedAt,
        });
        results.push(...adapterResults);
      } catch (error) {
        this.logger('error', 'device_integrity.root_detection_failed', {
          adapter: adapter.name,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    return results;
  }

  private async evaluateBinding(
    request: DeviceIntegrityRequest,
    verification: DeviceIntegrityVerificationResult
  ): Promise<DeviceBindingValidationResult> {
    const deviceId = verification.deviceId ?? request.deviceId;
    const devicePublicKey = verification.devicePublicKey ?? request.devicePublicKey;

    if (!request.userId || !deviceId) {
      return {
        status: 'skipped',
        valid: false,
        message: 'Device binding validation skipped due to missing identifiers',
      };
    }

    let validation = await this.bindingStore.validate(request.userId, deviceId, devicePublicKey);

    if (validation.status === 'unbound' && this.autoBindOnFirstSeen && devicePublicKey) {
      await this.bindingStore.bind({
        userId: request.userId,
        deviceId,
        devicePublicKey,
        boundAt: new Date(),
        lastValidatedAt: new Date(),
        metadata: {
          provider: verification.provider,
          mode: this.mode,
        },
      });

      validation = {
        status: 'bound',
        valid: true,
        binding: await this.bindingStore.getBinding(request.userId, deviceId) ?? undefined,
        autoBound: true,
        message: 'Device was automatically bound on first attestation',
      };
    }

    return validation;
  }

  private emitMetrics(params: {
    provider: IntegrityProviderType;
    verification: DeviceIntegrityVerificationResult;
    latencyMs: number;
    binding: DeviceBindingValidationResult;
    request: DeviceIntegrityRequest;
    attestationAgeMs?: number;
    rootSignalsDetected: string[];
  }): void {
    const { provider, verification, latencyMs, binding, request, attestationAgeMs, rootSignalsDetected } = params;

    try {
      const event: DeviceIntegrityMetricEvent = {
        provider,
        mode: this.mode,
        valid: verification.valid,
        latencyMs,
        environment: this.environment,
        timestamp: new Date(),
        deviceId: verification.deviceId ?? request.deviceId,
        userId: request.userId,
        integrityLevel: verification.integrityLevel,
        rootSignalsDetected,
        bindingStatus: binding.status,
        nonceValidated: !(verification.reasons || []).some(reason => reason === 'nonce_mismatch' || reason === 'nonce_missing'),
        attestationAgeMs,
        metadata: {
          bindingAutoBound: binding.autoBound ?? false,
          bindingStatus: binding.status,
          warnings: verification.warnings,
          reasons: verification.reasons,
        },
      };

      this.metricsEmitter.emitVerification(event);
    } catch (error) {
      this.logger('error', 'device_integrity.metric_emit_failed', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }
}
