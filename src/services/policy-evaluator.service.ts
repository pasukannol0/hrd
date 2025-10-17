import {
  OfficePolicy,
  PolicyEvaluationContext,
  PolicyEvaluationResult,
  PolicyDecision,
  FactorEvaluationResult,
  PresenceMode,
} from '../types';
import { GeoValidatorService } from './geo-validator.service';
import { WiFiMatcherService } from './wifi-matcher.service';
import { BeaconProximityService } from './beacon-proximity.service';
import { NfcVerifierService } from './nfc-verifier.service';
import { QrTokenGeneratorService } from './qr-token-generator.service';
import { FaceRecognitionService } from './face-recognition';

export interface PolicyEvaluatorConfig {
  geoValidator?: GeoValidatorService;
  wifiMatcher?: WiFiMatcherService;
  beaconProximity?: BeaconProximityService;
  nfcVerifier?: NfcVerifierService;
  qrTokenGenerator?: QrTokenGeneratorService;
  faceRecognition?: FaceRecognitionService;
}

export class PolicyEvaluatorService {
  private geoValidator?: GeoValidatorService;
  private wifiMatcher?: WiFiMatcherService;
  private beaconProximity?: BeaconProximityService;
  private nfcVerifier?: NfcVerifierService;
  private qrTokenGenerator?: QrTokenGeneratorService;
  private faceRecognition?: FaceRecognitionService;

  constructor(config: PolicyEvaluatorConfig) {
    this.geoValidator = config.geoValidator;
    this.wifiMatcher = config.wifiMatcher;
    this.beaconProximity = config.beaconProximity;
    this.nfcVerifier = config.nfcVerifier;
    this.qrTokenGenerator = config.qrTokenGenerator;
    this.faceRecognition = config.faceRecognition;
  }

  async evaluatePolicy(
    policy: OfficePolicy,
    context: PolicyEvaluationContext
  ): Promise<PolicyEvaluationResult> {
    const startTime = Date.now();
    const factorResults: FactorEvaluationResult[] = [];

    const workingHoursCheck = this.checkWorkingHours(policy, context.timestamp);

    for (const modeConfig of policy.required_factors.presence_modes) {
      if (!modeConfig.required && !this.hasContextForMode(modeConfig.mode, context)) {
        continue;
      }

      const result = await this.evaluateFactor(
        modeConfig.mode,
        context,
        policy
      );
      
      if (result) {
        factorResults.push(result);
      }
    }

    const factorsPassed = factorResults.filter(r => r.passed).length;
    const factorsRequired = policy.required_factors.min_factors;
    
    let decision: PolicyDecision;
    let rationale: string;

    if (factorsPassed >= factorsRequired) {
      if (workingHoursCheck.is_working_hours) {
        if (workingHoursCheck.is_late) {
          decision = PolicyDecision.REVIEW;
          rationale = `Check-in successful but late by more than ${policy.late_threshold_minutes} minutes. Review required.`;
        } else {
          decision = PolicyDecision.ACCEPTED;
          rationale = `All required factors met (${factorsPassed}/${factorsRequired}) during working hours.`;
        }
      } else {
        decision = PolicyDecision.REVIEW;
        rationale = `Check-in outside working hours. Manual review required.`;
      }
    } else {
      const failedFactors = factorResults.filter(r => !r.passed);
      const failedModes = failedFactors.map(f => f.mode).join(', ');
      
      if (factorsPassed > 0 && policy.required_factors.allow_fallback) {
        decision = PolicyDecision.REVIEW;
        rationale = `Insufficient factors met (${factorsPassed}/${factorsRequired}). Failed: ${failedModes}. Manual review required.`;
      } else {
        decision = PolicyDecision.REJECTED;
        rationale = `Check-in rejected. Required ${factorsRequired} factors, only ${factorsPassed} passed. Failed: ${failedModes}.`;
      }
    }

    return {
      decision,
      policy_id: policy.id,
      policy_version: policy.version,
      factors_evaluated: factorResults,
      factors_passed: factorsPassed,
      factors_required: factorsRequired,
      rationale,
      metadata: {
        evaluation_time_ms: Date.now() - startTime,
        timestamp: new Date(),
        office_id: context.office_id,
        working_hours_check: workingHoursCheck,
      },
    };
  }

  private hasContextForMode(mode: PresenceMode, context: PolicyEvaluationContext): boolean {
    switch (mode) {
      case PresenceMode.GEOFENCE:
        return !!context.location;
      case PresenceMode.WIFI:
        return !!context.wifi;
      case PresenceMode.BEACON:
        return !!context.beacon;
      case PresenceMode.NFC:
        return !!context.nfc;
      case PresenceMode.QR:
        return !!context.qr;
      case PresenceMode.FACE:
        return !!context.face;
      default:
        return false;
    }
  }

  private async evaluateFactor(
    mode: PresenceMode,
    context: PolicyEvaluationContext,
    policy: OfficePolicy
  ): Promise<FactorEvaluationResult | null> {
    try {
      switch (mode) {
        case PresenceMode.GEOFENCE:
          return await this.evaluateGeofence(context, policy);
        case PresenceMode.WIFI:
          return await this.evaluateWiFi(context);
        case PresenceMode.BEACON:
          return await this.evaluateBeacon(context);
        case PresenceMode.NFC:
          return await this.evaluateNfc(context);
        case PresenceMode.QR:
          return await this.evaluateQr(context);
        case PresenceMode.FACE:
          return await this.evaluateFace(context, policy);
        default:
          return null;
      }
    } catch (error) {
      return {
        mode,
        passed: false,
        confidence: 0,
        details: {},
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async evaluateGeofence(
    context: PolicyEvaluationContext,
    policy: OfficePolicy
  ): Promise<FactorEvaluationResult | null> {
    if (!context.location || !this.geoValidator || !context.office_id) {
      return null;
    }

    const geoConfig = policy.geo_distance;
    const distanceTolerance = geoConfig?.max_distance_meters;

    const result = await this.geoValidator.validateLocation(
      context.location,
      context.office_id,
      distanceTolerance
    );

    const passed = geoConfig?.strict_boundary_check 
      ? result.within_boundary
      : result.valid;

    return {
      mode: PresenceMode.GEOFENCE,
      passed,
      confidence: passed ? (result.within_boundary ? 1.0 : 0.8) : 0,
      details: {
        distance_meters: result.distance_meters,
        within_boundary: result.within_boundary,
        office_name: result.office_name,
      },
    };
  }

  private async evaluateWiFi(context: PolicyEvaluationContext): Promise<FactorEvaluationResult | null> {
    if (!context.wifi || !this.wifiMatcher) {
      return null;
    }

    const result = await this.wifiMatcher.matchNetwork(
      context.wifi.ssid || '',
      context.wifi.bssid
    );

    return {
      mode: PresenceMode.WIFI,
      passed: result.matched,
      confidence: result.matched ? (result.bssid ? 1.0 : 0.7) : 0,
      details: {
        matched: result.matched,
        office_name: result.office_name,
        ssid: result.ssid,
        bssid: result.bssid,
      },
    };
  }

  private async evaluateBeacon(context: PolicyEvaluationContext): Promise<FactorEvaluationResult | null> {
    if (!context.beacon || !this.beaconProximity) {
      return null;
    }

    const result = await this.beaconProximity.detectBeacon(
      context.beacon.uuid,
      context.beacon.major,
      context.beacon.minor,
      context.beacon.rssi
    );

    return {
      mode: PresenceMode.BEACON,
      passed: result.detected,
      confidence: result.detected ? 0.9 : 0,
      details: {
        detected: result.detected,
        office_name: result.office_name,
        distance_estimate: result.distance_estimate,
        rssi: result.rssi,
      },
    };
  }

  private async evaluateNfc(context: PolicyEvaluationContext): Promise<FactorEvaluationResult | null> {
    if (!context.nfc || !this.nfcVerifier) {
      return null;
    }

    const result = await this.nfcVerifier.verifyTag(context.nfc.tag_uid);

    return {
      mode: PresenceMode.NFC,
      passed: result.verified,
      confidence: result.verified ? 1.0 : 0,
      details: {
        verified: result.verified,
        office_name: result.office_name,
        tag_uid: result.tag_uid,
      },
    };
  }

  private async evaluateQr(context: PolicyEvaluationContext): Promise<FactorEvaluationResult | null> {
    if (!context.qr || !this.qrTokenGenerator) {
      return null;
    }

    const result = this.qrTokenGenerator.validateToken(context.qr.token);

    return {
      mode: PresenceMode.QR,
      passed: result.valid && !result.expired,
      confidence: result.valid && !result.expired ? 0.85 : 0,
      details: {
        valid: result.valid,
        expired: result.expired,
        office_id: result.office_id,
      },
    };
  }

  private async evaluateFace(
    context: PolicyEvaluationContext,
    policy: OfficePolicy
  ): Promise<FactorEvaluationResult | null> {
    if (!context.face || !this.faceRecognition) {
      return null;
    }

    const livenessConfig = policy.liveness_config;
    
    if (livenessConfig?.enabled) {
      const result = await this.faceRecognition.recognizeWithLiveness(
        context.face.image_data
      );

      const meetsLivenessThreshold = !result.liveness || 
        (result.liveness.confidence || 0) >= (livenessConfig.min_confidence || 0.8);
      
      const passed = result.recognized && 
                    result.liveness?.is_live === true &&
                    meetsLivenessThreshold &&
                    result.user_id === context.user_id;

      return {
        mode: PresenceMode.FACE,
        passed,
        confidence: result.confidence || 0,
        details: {
          recognized: result.recognized,
          user_id: result.user_id,
          liveness: result.liveness,
          face_confidence: result.confidence,
        },
      };
    } else {
      const result = await this.faceRecognition.recognizeFace(
        context.face.image_data
      );

      const passed = result.recognized && result.user_id === context.user_id;

      return {
        mode: PresenceMode.FACE,
        passed,
        confidence: result.confidence || 0,
        details: {
          recognized: result.recognized,
          user_id: result.user_id,
          face_confidence: result.confidence,
        },
      };
    }
  }

  private checkWorkingHours(policy: OfficePolicy, timestamp: Date): {
    is_working_hours: boolean;
    is_late: boolean;
    is_early_departure: boolean;
  } {
    const dayOfWeek = timestamp.getDay();
    const isWorkingDay = policy.working_days.includes(dayOfWeek);

    if (!isWorkingDay) {
      return {
        is_working_hours: false,
        is_late: false,
        is_early_departure: false,
      };
    }

    const hours = timestamp.getHours();
    const minutes = timestamp.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    const [startHour, startMin] = policy.working_hours_start.split(':').map(Number);
    const startTimeInMinutes = startHour * 60 + startMin;

    const [endHour, endMin] = policy.working_hours_end.split(':').map(Number);
    const endTimeInMinutes = endHour * 60 + endMin;

    const isLate = timeInMinutes > (startTimeInMinutes + policy.late_threshold_minutes);
    const isEarlyDeparture = timeInMinutes < (endTimeInMinutes - policy.early_departure_threshold_minutes);
    const isWorkingHours = timeInMinutes >= startTimeInMinutes && timeInMinutes <= endTimeInMinutes;

    return {
      is_working_hours: isWorkingHours,
      is_late: isLate && isWorkingHours,
      is_early_departure: isEarlyDeparture,
    };
  }
}
