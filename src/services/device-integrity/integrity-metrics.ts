import { DeviceIntegrityMetricEvent, IntegrityMetricsEmitter } from '../../types';

const stringifyMetadata = (metadata?: Record<string, any>): Record<string, any> | undefined => {
  if (!metadata) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch {
    return undefined;
  }
};

export class ConsoleIntegrityMetricsEmitter implements IntegrityMetricsEmitter {
  emitVerification(event: DeviceIntegrityMetricEvent): void {
    const payload = {
      event: 'device_integrity_verification',
      provider: event.provider,
      mode: event.mode,
      valid: event.valid,
      latencyMs: event.latencyMs,
      environment: event.environment,
      timestamp: event.timestamp.toISOString(),
      deviceId: event.deviceId,
      userId: event.userId,
      integrityLevel: event.integrityLevel,
      rootSignalsDetected: event.rootSignalsDetected,
      bindingStatus: event.bindingStatus,
      nonceValidated: event.nonceValidated,
      attestationAgeMs: event.attestationAgeMs,
      metadata: stringifyMetadata(event.metadata),
    };

    try {
      console.log('[integrity-metric]', JSON.stringify(payload));
    } catch (error) {
      console.error('[integrity-metric] Failed to emit metric', error);
    }
  }
}
