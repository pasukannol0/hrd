import { Pool } from 'pg';
import { AttendanceRepository } from '../repositories/attendance.repository';
import { PolicyLoaderMiddleware } from './policy-loader.middleware';
import { PolicyEvaluatorService } from './policy-evaluator.service';
import { MotionGuardService } from './motion-guard.service';
import { RateLimiterService } from './rate-limiter.service';
import { DeviceBindingService } from './device-binding.service';
import { SignatureService } from './signature.service';
import { MetricsService } from './metrics.service';
import { AuditLogService } from './audit-log.service';
import {
  AttendanceSubmissionRequest,
  AttendanceSubmissionResult,
  IntegrityVerdict,
  AttendanceStatus,
  PolicyEvaluationContext,
  PolicyDecision,
} from '../types';

export interface AttendanceSubmissionServiceConfig {
  pool: Pool;
  policyLoader: PolicyLoaderMiddleware;
  policyEvaluator: PolicyEvaluatorService;
  motionGuard: MotionGuardService;
  rateLimiter: RateLimiterService;
  deviceBinding: DeviceBindingService;
  signature: SignatureService;
  metrics?: MetricsService;
  auditLog?: AuditLogService;
  alertOnReview?: (data: any) => Promise<void>;
  alertOnRejection?: (data: any) => Promise<void>;
}

export class AttendanceSubmissionService {
  private attendanceRepo: AttendanceRepository;
  private policyLoader: PolicyLoaderMiddleware;
  private policyEvaluator: PolicyEvaluatorService;
  private motionGuard: MotionGuardService;
  private rateLimiter: RateLimiterService;
  private deviceBinding: DeviceBindingService;
  private signature: SignatureService;
  private metrics?: MetricsService;
  private auditLog?: AuditLogService;
  private alertOnReview?: (data: any) => Promise<void>;
  private alertOnRejection?: (data: any) => Promise<void>;

  constructor(config: AttendanceSubmissionServiceConfig) {
    this.attendanceRepo = new AttendanceRepository({ pool: config.pool });
    this.policyLoader = config.policyLoader;
    this.policyEvaluator = config.policyEvaluator;
    this.motionGuard = config.motionGuard;
    this.rateLimiter = config.rateLimiter;
    this.deviceBinding = config.deviceBinding;
    this.signature = config.signature;
    this.metrics = config.metrics;
    this.auditLog = config.auditLog;
    this.alertOnReview = config.alertOnReview;
    this.alertOnRejection = config.alertOnRejection;
  }

  async submitAttendance(
    request: AttendanceSubmissionRequest,
    context?: { ip_address?: string; user_agent?: string }
  ): Promise<AttendanceSubmissionResult> {
    const startTime = Date.now();

    try {
      console.log(`[AttendanceSubmission] Starting submission for user ${request.user_id}`);

      const rateLimitResult = await this.rateLimiter.checkRateLimit(request.user_id);
      
      if (!rateLimitResult.passed) {
        console.warn(`[AttendanceSubmission] Rate limit exceeded for user ${request.user_id}`);
        
        this.metrics?.recordRateLimitBlock(request.user_id);
        
        if (this.auditLog) {
          await this.auditLog.logRateLimitBlock({
            user_id: request.user_id,
            ip_address: context?.ip_address,
            user_agent: context?.user_agent,
          });
        }

        return {
          success: false,
          decision: 'rejected',
          rationale: `Rate limit exceeded. Maximum ${rateLimitResult.limit} requests per minute. Please try again at ${rateLimitResult.reset_at.toISOString()}.`,
          integrity_verdict: {
            rate_limit: rateLimitResult,
            overall_score: 0,
            timestamp: new Date(),
            version: '1.0',
          },
          metadata: {
            submission_time_ms: Date.now() - startTime,
            timestamp: new Date(),
          },
          error: 'RATE_LIMIT_EXCEEDED',
        };
      }

      const deviceTrustResult = await this.deviceBinding.checkDeviceTrust(
        request.user_id,
        request.device_id
      );

      if (!deviceTrustResult.passed) {
        console.warn(`[AttendanceSubmission] Device trust check failed for user ${request.user_id}, device ${request.device_id}`);
        
        this.metrics?.recordDeviceTrustFailure(request.user_id, request.device_id);
        
        if (this.auditLog) {
          await this.auditLog.logDeviceTrustFailure({
            user_id: request.user_id,
            device_id: request.device_id,
            reason: deviceTrustResult.details || 'Device not trusted',
            ip_address: context?.ip_address,
            user_agent: context?.user_agent,
          });
        }

        return {
          success: false,
          decision: 'rejected',
          rationale: `Device trust verification failed: ${deviceTrustResult.details}`,
          integrity_verdict: {
            rate_limit: rateLimitResult,
            device_trust: deviceTrustResult,
            overall_score: 0,
            timestamp: new Date(),
            version: '1.0',
          },
          metadata: {
            submission_time_ms: Date.now() - startTime,
            timestamp: new Date(),
          },
          error: 'DEVICE_TRUST_FAILED',
        };
      }

      const lastLocation = await this.attendanceRepo.getLastLocationByUser(request.user_id);
      
      const motionGuardResult = await this.motionGuard.checkMotion(
        request.location,
        request.timestamp,
        lastLocation || undefined
      );

      if (!motionGuardResult.passed) {
        console.warn(`[AttendanceSubmission] Motion guard violation for user ${request.user_id}`, motionGuardResult);
        
        const violationType = motionGuardResult.teleport_detected ? 'teleport' : 'speed';
        this.metrics?.recordMotionGuardViolation(request.user_id, violationType);
        
        if (this.auditLog) {
          await this.auditLog.logMotionGuardViolation({
            user_id: request.user_id,
            violation_type: violationType,
            details: motionGuardResult,
            ip_address: context?.ip_address,
            user_agent: context?.user_agent,
          });
        }
      }

      let policy;
      if (request.office_id) {
        const policyResult = await this.policyLoader.loadPolicyByOffice(request.office_id);
        policy = policyResult.policy;
      }

      if (!policy) {
        console.error(`[AttendanceSubmission] No policy found for office ${request.office_id}`);
        return {
          success: false,
          decision: 'rejected',
          rationale: 'No active policy found for the specified office',
          integrity_verdict: {
            rate_limit: rateLimitResult,
            device_trust: deviceTrustResult,
            motion_guard: motionGuardResult,
            overall_score: 0,
            timestamp: new Date(),
            version: '1.0',
          },
          metadata: {
            submission_time_ms: Date.now() - startTime,
            timestamp: new Date(),
          },
          error: 'NO_POLICY_FOUND',
        };
      }

      const evaluationContext: PolicyEvaluationContext = {
        user_id: request.user_id,
        office_id: request.office_id,
        timestamp: request.timestamp,
        location: request.location,
        wifi: request.wifi,
        beacon: request.beacon,
        nfc: request.nfc,
        qr: request.qr,
        face: request.face,
      };

      const policyEvaluation = await this.policyEvaluator.evaluatePolicy(
        policy,
        evaluationContext
      );

      const overallScore = this.calculateOverallScore({
        policyEvaluation,
        motionGuardResult,
        deviceTrustResult,
        rateLimitResult,
      });

      const integrityVerdict: IntegrityVerdict = {
        policy_evaluation: policyEvaluation,
        motion_guard: motionGuardResult,
        device_trust: deviceTrustResult,
        rate_limit: rateLimitResult,
        overall_score: overallScore,
        timestamp: new Date(),
        version: '1.0',
      };

      const signatureData = {
        user_id: request.user_id,
        device_id: request.device_id,
        office_id: request.office_id || 'unknown',
        timestamp: request.timestamp,
        location: request.location,
        integrity_verdict: integrityVerdict,
      };

      const checkInSignature = this.signature.signAttendanceData(signatureData);

      let finalDecision = policyEvaluation.decision;
      let attendanceStatus = this.mapDecisionToStatus(finalDecision, policyEvaluation);

      if (!motionGuardResult.passed && finalDecision === PolicyDecision.ACCEPTED) {
        finalDecision = PolicyDecision.REVIEW;
        attendanceStatus = AttendanceStatus.REVIEW;
      }

      let attendanceRecord;
      if (finalDecision !== PolicyDecision.REJECTED) {
        attendanceRecord = await this.attendanceRepo.create({
          user_id: request.user_id,
          device_id: request.device_id,
          office_id: request.office_id || 'unknown',
          policy_set_id: policy.id,
          check_in_time: request.timestamp,
          check_in_location: request.location,
          check_in_method: request.check_in_method,
          beacon_id: request.beacon ? undefined : undefined,
          nfc_tag_id: request.nfc ? undefined : undefined,
          network_ssid: request.wifi?.ssid,
          status: attendanceStatus,
          integrity_verdict: integrityVerdict,
          signature_check_in: checkInSignature,
        });

        console.log(`[AttendanceSubmission] Attendance record created: ${attendanceRecord.id}`);
      }

      this.metrics?.recordAttendanceSubmission(finalDecision);

      if (this.auditLog && attendanceRecord) {
        await this.auditLog.logAttendanceSubmission({
          user_id: request.user_id,
          attendance_id: attendanceRecord.id,
          decision: finalDecision,
          integrity_verdict: integrityVerdict,
          ip_address: context?.ip_address,
          user_agent: context?.user_agent,
        });
      }

      if (finalDecision === PolicyDecision.REVIEW && this.alertOnReview) {
        await this.alertOnReview({
          user_id: request.user_id,
          attendance_id: attendanceRecord?.id,
          rationale: policyEvaluation.rationale,
          motion_guard_passed: motionGuardResult.passed,
          timestamp: new Date(),
        }).catch(err => console.error('Alert on review failed:', err));
      }

      if (finalDecision === PolicyDecision.REJECTED && this.alertOnRejection) {
        await this.alertOnRejection({
          user_id: request.user_id,
          rationale: policyEvaluation.rationale,
          timestamp: new Date(),
        }).catch(err => console.error('Alert on rejection failed:', err));
      }

      const submissionTimeMs = Date.now() - startTime;
      console.log(`[AttendanceSubmission] Completed in ${submissionTimeMs}ms with decision: ${finalDecision}`);

      return {
        success: finalDecision !== PolicyDecision.REJECTED,
        attendance_id: attendanceRecord?.id,
        decision: finalDecision,
        rationale: policyEvaluation.rationale,
        integrity_verdict: integrityVerdict,
        signature: checkInSignature,
        metadata: {
          submission_time_ms: submissionTimeMs,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      console.error('[AttendanceSubmission] Error during submission:', error);
      
      return {
        success: false,
        decision: 'rejected',
        rationale: `Internal error during attendance submission: ${error instanceof Error ? error.message : 'Unknown error'}`,
        integrity_verdict: {
          overall_score: 0,
          timestamp: new Date(),
          version: '1.0',
        },
        metadata: {
          submission_time_ms: Date.now() - startTime,
          timestamp: new Date(),
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private calculateOverallScore(data: {
    policyEvaluation: any;
    motionGuardResult: any;
    deviceTrustResult: any;
    rateLimitResult: any;
  }): number {
    const weights = {
      policy: 0.5,
      motionGuard: 0.2,
      deviceTrust: 0.2,
      rateLimit: 0.1,
    };

    const policyScore = data.policyEvaluation.decision === PolicyDecision.ACCEPTED 
      ? 1.0 
      : data.policyEvaluation.decision === PolicyDecision.REVIEW 
        ? 0.5 
        : 0;

    const motionScore = data.motionGuardResult.passed ? 1.0 : 0;
    const deviceScore = data.deviceTrustResult.trust_score || (data.deviceTrustResult.passed ? 1.0 : 0);
    const rateLimitScore = data.rateLimitResult.passed ? 1.0 : 0;

    return (
      policyScore * weights.policy +
      motionScore * weights.motionGuard +
      deviceScore * weights.deviceTrust +
      rateLimitScore * weights.rateLimit
    );
  }

  private mapDecisionToStatus(
    decision: PolicyDecision,
    evaluation: any
  ): AttendanceStatus {
    if (decision === PolicyDecision.REJECTED) {
      return AttendanceStatus.ABSENT;
    }

    if (decision === PolicyDecision.REVIEW) {
      return AttendanceStatus.REVIEW;
    }

    if (evaluation.metadata?.working_hours_check?.is_late) {
      return AttendanceStatus.LATE;
    }

    return AttendanceStatus.PRESENT;
  }
}
