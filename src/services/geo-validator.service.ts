import { OfficeRepository } from '../repositories';
import { GeoPoint, GeoValidationResult } from '../types';

export interface GeoValidatorConfig {
  officeRepository: OfficeRepository;
  defaultDistanceTolerance?: number;
}

export class GeoValidatorService {
  private officeRepository: OfficeRepository;
  private defaultDistanceTolerance: number;

  constructor(config: GeoValidatorConfig) {
    this.officeRepository = config.officeRepository;
    this.defaultDistanceTolerance = config.defaultDistanceTolerance || 100;
  }

  async validateLocation(
    point: GeoPoint,
    officeId?: string,
    distanceTolerance?: number
  ): Promise<GeoValidationResult> {
    const tolerance = distanceTolerance ?? this.defaultDistanceTolerance;

    if (officeId) {
      return this.validateAgainstSpecificOffice(point, officeId, tolerance);
    } else {
      return this.validateAgainstNearestOffice(point, tolerance);
    }
  }

  private async validateAgainstSpecificOffice(
    point: GeoPoint,
    officeId: string,
    tolerance: number
  ): Promise<GeoValidationResult> {
    const office = await this.officeRepository.findById(officeId);

    if (!office) {
      return {
        valid: false,
        within_boundary: false,
      };
    }

    const withinBoundary = await this.officeRepository.isPointInOfficeBoundary(
      point,
      officeId
    );

    if (withinBoundary) {
      return {
        valid: true,
        distance_meters: 0,
        within_boundary: true,
        office_id: office.id,
        office_name: office.name,
      };
    }

    const distance = await this.officeRepository.getDistanceToOffice(point, officeId);

    if (distance === null) {
      return {
        valid: false,
        within_boundary: false,
        office_id: office.id,
        office_name: office.name,
      };
    }

    const valid = distance <= tolerance;

    return {
      valid,
      distance_meters: distance,
      within_boundary: false,
      office_id: office.id,
      office_name: office.name,
    };
  }

  private async validateAgainstNearestOffice(
    point: GeoPoint,
    tolerance: number
  ): Promise<GeoValidationResult> {
    const officeInBoundary = await this.officeRepository.findByLocation(point);

    if (officeInBoundary) {
      return {
        valid: true,
        distance_meters: 0,
        within_boundary: true,
        office_id: officeInBoundary.id,
        office_name: officeInBoundary.name,
      };
    }

    const nearbyOffices = await this.officeRepository.findNearbyOffices(
      point,
      tolerance,
      1
    );

    if (nearbyOffices.length === 0) {
      return {
        valid: false,
        within_boundary: false,
      };
    }

    const nearestOffice = nearbyOffices[0];

    return {
      valid: true,
      distance_meters: nearestOffice.distance_meters,
      within_boundary: false,
      office_id: nearestOffice.id,
      office_name: nearestOffice.name,
    };
  }

  async findNearbyOffices(
    point: GeoPoint,
    distanceTolerance?: number,
    limit: number = 10
  ): Promise<Array<{ office_id: string; office_name: string; distance_meters: number }>> {
    const tolerance = distanceTolerance ?? this.defaultDistanceTolerance;
    
    const offices = await this.officeRepository.findNearbyOffices(
      point,
      tolerance,
      limit
    );

    return offices.map(office => ({
      office_id: office.id,
      office_name: office.name,
      distance_meters: office.distance_meters,
    }));
  }
}
