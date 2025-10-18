import { MotionGuardResult } from '../types';

export interface MotionGuardConfig {
  maxSpeedMps?: number;
  teleportDistanceMeters?: number;
  minTimeDeltaSeconds?: number;
}

export class MotionGuardService {
  private maxSpeedMps: number;
  private teleportDistanceMeters: number;
  private minTimeDeltaSeconds: number;

  constructor(config?: MotionGuardConfig) {
    this.maxSpeedMps = config?.maxSpeedMps ?? 8;
    this.teleportDistanceMeters = config?.teleportDistanceMeters ?? 1000;
    this.minTimeDeltaSeconds = config?.minTimeDeltaSeconds ?? 1;
  }

  async checkMotion(
    currentLocation: { latitude: number; longitude: number },
    currentTimestamp: Date,
    lastLocation?: { latitude: number; longitude: number; timestamp: Date }
  ): Promise<MotionGuardResult> {
    if (!lastLocation) {
      return {
        passed: true,
        teleport_detected: false,
        speed_violation: false,
        details: 'No previous location to compare',
      };
    }

    const distance = this.calculateDistance(
      lastLocation.latitude,
      lastLocation.longitude,
      currentLocation.latitude,
      currentLocation.longitude
    );

    const timeDeltaMs = currentTimestamp.getTime() - lastLocation.timestamp.getTime();
    const timeDeltaSeconds = timeDeltaMs / 1000;

    if (timeDeltaSeconds < this.minTimeDeltaSeconds) {
      return {
        passed: true,
        teleport_detected: false,
        speed_violation: false,
        distance_meters: distance,
        time_delta_seconds: timeDeltaSeconds,
        last_location: lastLocation,
        details: 'Time delta too small for meaningful speed calculation',
      };
    }

    const speedMps = distance / timeDeltaSeconds;

    const teleportDetected = distance > this.teleportDistanceMeters;
    const speedViolation = speedMps > this.maxSpeedMps;

    const passed = !teleportDetected && !speedViolation;

    let details = '';
    if (teleportDetected) {
      details = `Teleport detected: ${distance.toFixed(2)}m exceeds threshold of ${this.teleportDistanceMeters}m`;
    } else if (speedViolation) {
      details = `Speed violation: ${speedMps.toFixed(2)} m/s exceeds limit of ${this.maxSpeedMps} m/s`;
    } else {
      details = `Motion check passed: ${speedMps.toFixed(2)} m/s over ${distance.toFixed(2)}m`;
    }

    return {
      passed,
      teleport_detected: teleportDetected,
      speed_violation: speedViolation,
      speed_mps: speedMps,
      distance_meters: distance,
      time_delta_seconds: timeDeltaSeconds,
      last_location: lastLocation,
      details,
    };
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}
