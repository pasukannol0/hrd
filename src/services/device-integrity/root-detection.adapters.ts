import {
  RootDetectionAdapter,
  RootDetectionInput,
  RootDetectionResult,
} from '../../types';

const hasBooleanTrue = (values: Array<boolean | undefined | null>): boolean =>
  values.some(value => value === true);

const calculateConfidence = (sources: Array<boolean | undefined | null>): number | undefined => {
  const trueCount = sources.filter(value => value === true).length;
  if (trueCount === 0) {
    return undefined;
  }

  const weight = trueCount / sources.length;
  return Math.min(1, Math.max(0.3, weight));
};

export class BasicRootDetectionAdapter implements RootDetectionAdapter {
  readonly name = 'basic_signal';

  async detect(input: RootDetectionInput): Promise<RootDetectionResult[]> {
    const results: RootDetectionResult[] = [];
    const { verification, request } = input;
    const riskSignals = verification.riskSignals ?? [];
    const metadata = verification.metadata ?? {};
    const customSignals = request.rootSignals?.customSignals ?? {};

    const rootSources = [
      verification.rootDetected,
      request.rootSignals?.rooted,
      metadata.rooted,
      metadata.root,
      metadata.deviceRooted,
      customSignals.rooted,
      riskSignals.includes('ROOTED'),
      riskSignals.includes('ROOT_DETECTED'),
    ];

    const jailbreakSources = [
      verification.jailbreakDetected,
      request.rootSignals?.jailbroken,
      metadata.jailbroken,
      metadata.jailbreak,
      customSignals.jailbroken,
      riskSignals.includes('JAILBROKEN'),
      riskSignals.includes('COMPROMISED_OS'),
    ];

    const tamperSources = [
      request.rootSignals?.tampered,
      metadata.tampered,
      customSignals.tampered,
      riskSignals.includes('TAMPER_DETECTED'),
    ];

    const emulatorSources = [
      request.rootSignals?.emulator,
      metadata.emulator,
      customSignals.emulator,
      riskSignals.includes('EMULATOR'),
    ];

    const rootDetected = hasBooleanTrue(rootSources);
    const jailbreakDetected = hasBooleanTrue(jailbreakSources);
    const tamperDetected = hasBooleanTrue(tamperSources);
    const emulatorDetected = hasBooleanTrue(emulatorSources);

    results.push({
      adapter: this.name,
      type: 'root',
      detected: rootDetected,
      confidence: calculateConfidence(rootSources),
      reason: rootDetected ? 'root_signal_detected' : undefined,
      metadata: {
        riskSignals,
        sourcesChecked: rootSources.length,
      },
    });

    results.push({
      adapter: this.name,
      type: 'jailbreak',
      detected: jailbreakDetected,
      confidence: calculateConfidence(jailbreakSources),
      reason: jailbreakDetected ? 'jailbreak_signal_detected' : undefined,
      metadata: {
        riskSignals,
        sourcesChecked: jailbreakSources.length,
      },
    });

    results.push({
      adapter: this.name,
      type: 'tamper',
      detected: tamperDetected,
      confidence: calculateConfidence(tamperSources),
      reason: tamperDetected ? 'tamper_signal_detected' : undefined,
      metadata: {
        riskSignals,
        sourcesChecked: tamperSources.length,
      },
    });

    results.push({
      adapter: this.name,
      type: 'emulator',
      detected: emulatorDetected,
      confidence: calculateConfidence(emulatorSources),
      reason: emulatorDetected ? 'emulator_signal_detected' : undefined,
      metadata: {
        riskSignals,
        sourcesChecked: emulatorSources.length,
      },
    });

    return results;
  }
}
