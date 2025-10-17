import { NfcTagRepository, OfficeRepository } from '../repositories';
import { NfcVerificationResult, GeoPoint } from '../types';

export interface NfcVerifierConfig {
  nfcTagRepository: NfcTagRepository;
  officeRepository: OfficeRepository;
}

export class NfcVerifierService {
  private nfcTagRepository: NfcTagRepository;
  private officeRepository: OfficeRepository;

  constructor(config: NfcVerifierConfig) {
    this.nfcTagRepository = config.nfcTagRepository;
    this.officeRepository = config.officeRepository;
  }

  async verifyTag(tagUid: string): Promise<NfcVerificationResult> {
    const tag = await this.nfcTagRepository.findByTagUid(tagUid);

    if (!tag) {
      return {
        verified: false,
      };
    }

    const office = await this.officeRepository.findById(tag.office_id);

    if (!office) {
      return {
        verified: false,
      };
    }

    return {
      verified: true,
      office_id: office.id,
      office_name: office.name,
      tag_id: tag.id,
      tag_uid: tag.tag_uid,
    };
  }

  async verifyTagWithLocation(
    tagUid: string,
    userLocation?: GeoPoint,
    maxDistanceMeters: number = 10
  ): Promise<NfcVerificationResult & { distance_meters?: number; location_valid?: boolean }> {
    const tag = await this.nfcTagRepository.findByTagUid(tagUid);

    if (!tag) {
      return {
        verified: false,
      };
    }

    const office = await this.officeRepository.findById(tag.office_id);

    if (!office) {
      return {
        verified: false,
      };
    }

    if (userLocation && tag.location_point) {
      const distance = await this.nfcTagRepository.getDistanceToTag(
        userLocation,
        tag.id
      );

      if (distance !== null) {
        const locationValid = distance <= maxDistanceMeters;

        return {
          verified: locationValid,
          office_id: office.id,
          office_name: office.name,
          tag_id: tag.id,
          tag_uid: tag.tag_uid,
          distance_meters: distance,
          location_valid: locationValid,
        };
      }
    }

    return {
      verified: true,
      office_id: office.id,
      office_name: office.name,
      tag_id: tag.id,
      tag_uid: tag.tag_uid,
    };
  }

  async findNearbyTags(
    point: GeoPoint,
    distanceMeters: number = 50
  ): Promise<Array<{
    tag_id: string;
    tag_uid: string;
    office_id: string;
    office_name: string;
    distance_meters: number;
  }>> {
    const tags = await this.nfcTagRepository.findNearbyTags(point, distanceMeters, 10);

    const results = [];

    for (const tag of tags) {
      const office = await this.officeRepository.findById(tag.office_id);

      if (office) {
        results.push({
          tag_id: tag.id,
          tag_uid: tag.tag_uid,
          office_id: office.id,
          office_name: office.name,
          distance_meters: tag.distance_meters,
        });
      }
    }

    return results;
  }

  async findTagsByOffice(officeId: string): Promise<Array<{
    id: string;
    tag_uid: string;
    tag_type?: string;
    location_description?: string;
  }>> {
    const tags = await this.nfcTagRepository.findByOfficeId(officeId);

    return tags.map(tag => ({
      id: tag.id,
      tag_uid: tag.tag_uid,
      tag_type: tag.tag_type,
      location_description: tag.location_description,
    }));
  }
}
