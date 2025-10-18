import {
  DeviceBindingRecord,
  DeviceBindingStore,
  DeviceBindingValidationResult,
} from '../../types';

const buildKey = (userId: string, deviceId: string): string => `${userId}::${deviceId}`;

export class InMemoryDeviceBindingStore implements DeviceBindingStore {
  private readonly bindings = new Map<string, DeviceBindingRecord>();

  async bind(record: DeviceBindingRecord): Promise<void> {
    const key = buildKey(record.userId, record.deviceId);
    const now = new Date();
    const normalized: DeviceBindingRecord = {
      ...record,
      boundAt: record.boundAt instanceof Date ? record.boundAt : new Date(record.boundAt),
      lastValidatedAt: record.lastValidatedAt ?? now,
    };

    this.bindings.set(key, normalized);
  }

  async validate(
    userId: string,
    deviceId: string,
    devicePublicKey?: string
  ): Promise<DeviceBindingValidationResult> {
    const key = buildKey(userId, deviceId);
    const binding = this.bindings.get(key);

    if (!binding) {
      return {
        status: 'unbound',
        valid: false,
        message: 'Device is not yet bound to the user',
      };
    }

    if (!devicePublicKey) {
      return {
        status: 'missing_public_key',
        valid: false,
        binding,
        message: 'Device public key is required for validation',
      };
    }

    if (binding.devicePublicKey !== devicePublicKey) {
      return {
        status: 'mismatch',
        valid: false,
        binding,
        reason: 'public_key_mismatch',
        message: 'Provided device public key does not match stored binding',
      };
    }

    const updated: DeviceBindingRecord = {
      ...binding,
      lastValidatedAt: new Date(),
    };
    this.bindings.set(key, updated);

    return {
      status: 'valid',
      valid: true,
      binding: updated,
    };
  }

  async getBinding(userId: string, deviceId: string): Promise<DeviceBindingRecord | null> {
    const key = buildKey(userId, deviceId);
    return this.bindings.get(key) ?? null;
  }

  async remove(userId: string, deviceId: string): Promise<void> {
    const key = buildKey(userId, deviceId);
    this.bindings.delete(key);
  }
}
