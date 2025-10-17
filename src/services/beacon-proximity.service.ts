import { BeaconRepository, OfficeRepository } from '../repositories';
import { BeaconProximityResult, GeoPoint } from '../types';

export interface BeaconProximityConfig {
  beaconRepository: BeaconRepository;
  officeRepository: OfficeRepository;
  defaultProximityThreshold?: number;
}

export class BeaconProximityService {
  private beaconRepository: BeaconRepository;
  private officeRepository: OfficeRepository;
  private defaultProximityThreshold: number;

  constructor(config: BeaconProximityConfig) {
    this.beaconRepository = config.beaconRepository;
    this.officeRepository = config.officeRepository;
    this.defaultProximityThreshold = config.defaultProximityThreshold || 50;
  }

  async detectBeacon(
    uuid: string,
    major: number,
    minor: number,
    rssi?: number
  ): Promise<BeaconProximityResult> {
    const beacon = await this.beaconRepository.findByBeaconIdentifier(
      uuid,
      major,
      minor
    );

    if (!beacon) {
      return {
        detected: false,
      };
    }

    const office = await this.officeRepository.findById(beacon.office_id);

    if (!office) {
      return {
        detected: false,
      };
    }

    const distanceEstimate = rssi ? this.estimateDistanceFromRSSI(rssi) : undefined;

    return {
      detected: true,
      office_id: office.id,
      office_name: office.name,
      beacon_id: beacon.id,
      rssi,
      distance_estimate: distanceEstimate,
    };
  }

  async detectNearbyBeacons(
    point: GeoPoint,
    proximityThreshold?: number
  ): Promise<BeaconProximityResult[]> {
    const threshold = proximityThreshold ?? this.defaultProximityThreshold;
    
    const beacons = await this.beaconRepository.findNearbyBeacons(
      point,
      threshold,
      10
    );

    const results: BeaconProximityResult[] = [];

    for (const beacon of beacons) {
      const office = await this.officeRepository.findById(beacon.office_id);

      if (office) {
        results.push({
          detected: true,
          office_id: office.id,
          office_name: office.name,
          beacon_id: beacon.id,
          distance_estimate: beacon.distance_meters,
        });
      }
    }

    return results;
  }

  async verifyBeaconProximity(
    uuid: string,
    major: number,
    minor: number,
    rssi: number,
    proximityThreshold?: number
  ): Promise<{ within_proximity: boolean; distance_estimate?: number }> {
    const threshold = proximityThreshold ?? this.defaultProximityThreshold;
    const distanceEstimate = this.estimateDistanceFromRSSI(rssi);

    const beacon = await this.beaconRepository.findByBeaconIdentifier(
      uuid,
      major,
      minor
    );

    if (!beacon) {
      return {
        within_proximity: false,
      };
    }

    return {
      within_proximity: distanceEstimate <= threshold,
      distance_estimate: distanceEstimate,
    };
  }

  private estimateDistanceFromRSSI(rssi: number): number {
    const txPower = -59;
    const n = 2.0;

    if (rssi === 0) {
      return -1.0;
    }

    const ratio = rssi / txPower;
    
    if (ratio < 1.0) {
      return Math.pow(ratio, 10);
    } else {
      return 0.89976 * Math.pow(ratio, 7.7095) + 0.111;
    }
  }

  async findBeaconsByOffice(officeId: string): Promise<Array<{
    id: string;
    uuid: string;
    major: number;
    minor: number;
    location_description?: string;
  }>> {
    const beacons = await this.beaconRepository.findByOfficeId(officeId);

    return beacons.map(beacon => ({
      id: beacon.id,
      uuid: beacon.uuid,
      major: beacon.major,
      minor: beacon.minor,
      location_description: beacon.location_description,
    }));
  }
}
