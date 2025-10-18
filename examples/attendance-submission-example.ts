import { Pool } from 'pg';
import { Redis } from 'ioredis';
import {
  AttendanceSubmissionService,
  PolicyLoaderMiddleware,
  PolicyEvaluatorService,
  MotionGuardService,
  RateLimiterService,
  DeviceBindingService,
  SignatureService,
  MetricsService,
  AuditLogService,
  GeoValidatorService,
  WiFiMatcherService,
  BeaconProximityService,
  NfcVerifierService,
  QrTokenGeneratorService,
} from '../src/services';
import {
  OfficeRepository,
  NetworkRepository,
  BeaconRepository,
  NfcTagRepository,
} from '../src/repositories';
import { RedisCache } from '../src/utils/redis-cache';
import { AttendanceSubmissionRequest } from '../src/types';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/attendance',
  });

  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  });

  const redisCache = new RedisCache({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    keyPrefix: 'attendance:',
  });

  const officeRepo = new OfficeRepository({ pool, cache: redisCache });
  const networkRepo = new NetworkRepository({ pool, cache: redisCache });
  const beaconRepo = new BeaconRepository({ pool, cache: redisCache });
  const nfcTagRepo = new NfcTagRepository({ pool, cache: redisCache });

  const geoValidator = new GeoValidatorService({
    officeRepository: officeRepo,
    defaultDistanceTolerance: 100,
  });

  const wifiMatcher = new WiFiMatcherService({
    networkRepository: networkRepo,
    officeRepository: officeRepo,
  });

  const beaconProximity = new BeaconProximityService({
    beaconRepository: beaconRepo,
    officeRepository: officeRepo,
    defaultProximityThreshold: 50,
  });

  const nfcVerifier = new NfcVerifierService({
    nfcTagRepository: nfcTagRepo,
    officeRepository: officeRepo,
  });

  const qrTokenGenerator = new QrTokenGeneratorService({
    secretKey: process.env.QR_SECRET_KEY || 'your-secret-key',
    minTtlSeconds: 30,
    maxTtlSeconds: 60,
  });

  const policyLoader = new PolicyLoaderMiddleware({
    pool,
    cache: redisCache,
    cacheTtlSeconds: 300,
  });

  const policyEvaluator = new PolicyEvaluatorService({
    geoValidator,
    wifiMatcher,
    beaconProximity,
    nfcVerifier,
    qrTokenGenerator,
  });

  const motionGuard = new MotionGuardService({
    maxSpeedMps: 8,
    teleportDistanceMeters: 1000,
    minTimeDeltaSeconds: 1,
  });

  const rateLimiter = new RateLimiterService({
    redis,
    maxRequestsPerWindow: 12,
    windowSeconds: 60,
    keyPrefix: 'rate_limit:',
  });

  const deviceBinding = new DeviceBindingService({
    pool,
    requireTrustedDevice: true,
    minTrustScore: 0.7,
  });

  const signature = new SignatureService({
    secretKey: process.env.SIGNATURE_SECRET_KEY || 'your-signature-secret-key',
    algorithm: 'sha256',
  });

  const metrics = new MetricsService({ enabled: true });

  const auditLog = new AuditLogService({ pool });

  const alertOnReview = async (data: any) => {
    console.log('[ALERT] Attendance requires review:', data);
  };

  const alertOnRejection = async (data: any) => {
    console.log('[ALERT] Attendance rejected:', data);
  };

  const attendanceService = new AttendanceSubmissionService({
    pool,
    policyLoader,
    policyEvaluator,
    motionGuard,
    rateLimiter,
    deviceBinding,
    signature,
    metrics,
    auditLog,
    alertOnReview,
    alertOnRejection,
  });

  const submissionRequest: AttendanceSubmissionRequest = {
    user_id: '550e8400-e29b-41d4-a716-446655440001',
    device_id: '550e8400-e29b-41d4-a716-446655440002',
    office_id: '550e8400-e29b-41d4-a716-446655440003',
    timestamp: new Date(),
    location: {
      latitude: 37.7749,
      longitude: -122.4194,
    },
    wifi: {
      ssid: 'CompanyWiFi-SF',
      bssid: '00:11:22:33:44:55',
    },
    check_in_method: 'gps_wifi',
  };

  console.log('Submitting attendance...');
  const result = await attendanceService.submitAttendance(submissionRequest, {
    ip_address: '192.168.1.100',
    user_agent: 'AttendanceApp/1.0',
  });

  console.log('\n=== Attendance Submission Result ===');
  console.log(`Success: ${result.success}`);
  console.log(`Decision: ${result.decision}`);
  console.log(`Rationale: ${result.rationale}`);
  console.log(`Attendance ID: ${result.attendance_id}`);
  console.log(`Signature: ${result.signature}`);
  console.log(`Overall Score: ${result.integrity_verdict.overall_score}`);
  console.log(`Submission Time: ${result.metadata.submission_time_ms}ms`);

  console.log('\n=== Integrity Verdict Details ===');
  console.log('Policy Evaluation:', result.integrity_verdict.policy_evaluation);
  console.log('Motion Guard:', result.integrity_verdict.motion_guard);
  console.log('Device Trust:', result.integrity_verdict.device_trust);
  console.log('Rate Limit:', result.integrity_verdict.rate_limit);

  console.log('\n=== Metrics ===');
  console.log(metrics.getMetrics());

  console.log('\n=== Prometheus Format ===');
  console.log(metrics.exportPrometheusFormat());

  await redis.quit();
  await redisCache.disconnect();
  await pool.end();
}

main().catch(console.error);
