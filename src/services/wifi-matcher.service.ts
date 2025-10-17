import { NetworkRepository, OfficeRepository } from '../repositories';
import { WiFiMatchResult } from '../types';

export interface WiFiMatcherConfig {
  networkRepository: NetworkRepository;
  officeRepository: OfficeRepository;
}

export class WiFiMatcherService {
  private networkRepository: NetworkRepository;
  private officeRepository: OfficeRepository;

  constructor(config: WiFiMatcherConfig) {
    this.networkRepository = config.networkRepository;
    this.officeRepository = config.officeRepository;
  }

  async matchNetwork(ssid: string, bssid?: string): Promise<WiFiMatchResult> {
    if (bssid) {
      return this.matchByBSSID(ssid, bssid);
    } else {
      return this.matchBySSID(ssid);
    }
  }

  private async matchByBSSID(ssid: string, bssid: string): Promise<WiFiMatchResult> {
    const network = await this.networkRepository.findBySSIDAndBSSID(ssid, bssid);

    if (!network) {
      return {
        matched: false,
      };
    }

    const office = await this.officeRepository.findById(network.office_id);

    if (!office) {
      return {
        matched: false,
      };
    }

    return {
      matched: true,
      office_id: office.id,
      office_name: office.name,
      network_id: network.id,
      ssid: network.ssid,
      bssid: network.bssid,
    };
  }

  private async matchBySSID(ssid: string): Promise<WiFiMatchResult> {
    const network = await this.networkRepository.findBySSIDAndBSSID(ssid);

    if (!network) {
      return {
        matched: false,
      };
    }

    const office = await this.officeRepository.findById(network.office_id);

    if (!office) {
      return {
        matched: false,
      };
    }

    return {
      matched: true,
      office_id: office.id,
      office_name: office.name,
      network_id: network.id,
      ssid: network.ssid,
      bssid: network.bssid,
    };
  }

  async findNetworksByOffice(officeId: string): Promise<Array<{ id: string; ssid: string; bssid?: string }>> {
    const networks = await this.networkRepository.findByOfficeId(officeId);

    return networks.map(network => ({
      id: network.id,
      ssid: network.ssid,
      bssid: network.bssid,
    }));
  }

  async matchBSSIDOnly(bssid: string): Promise<WiFiMatchResult> {
    const network = await this.networkRepository.findByBSSID(bssid);

    if (!network) {
      return {
        matched: false,
      };
    }

    const office = await this.officeRepository.findById(network.office_id);

    if (!office) {
      return {
        matched: false,
      };
    }

    return {
      matched: true,
      office_id: office.id,
      office_name: office.name,
      network_id: network.id,
      ssid: network.ssid,
      bssid: network.bssid,
    };
  }
}
