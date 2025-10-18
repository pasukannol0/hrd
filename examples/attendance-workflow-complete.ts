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
  FaceRecognitionService,
  MockFaceRecognitionAdapter,
} from '../src/services';
import {
  OfficeRepository,
  NetworkRepository,
  BeaconRepository,
  NfcTagRepository,
} from '../src/repositories';
import { RedisCache } from '../src/utils/redis-cache';
import { AttendanceSubmissionRequest } from '../src/types';

async function demonstrateAttendanceWorkflow() {
  console.log('=== Attendance Submission Workflow Demo ===\n');

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

  console.log('1. Initializing repositories...');
  const officeRepo = new OfficeRepository({ pool, cache: redisCache });
  const networkRepo = new NetworkRepository({ pool, cache: redisCache });
  const beaconRepo = new BeaconRepository({ pool, cache: redisCache });
  const nfcTagRepo = new NfcTagRepository({ pool, cache: redisCache });

  console.log('2. Setting up presence validators...');
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

  const mockFaceProvider = new MockFaceRecognitionAdapter({
    successRate: 0.9,
    simulateDelay: true,
    alwaysRecognizeUsers: ['550e8400-e29b-41d4-a716-446655440001'],
  });

  const faceRecognition = new FaceRecognitionService({
    provider: mockFaceProvider,
    enableLivenessCheck: true,
    confidenceThreshold: 0.8,
  });

  console.log('3. Configuring policy engine...');
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
    faceRecognition,
  });

  console.log('4. Setting up motion guard (max speed: 8 m/s)...');
  const motionGuard = new MotionGuardService({
    maxSpeedMps: 8,
    teleportDistanceMeters: 1000,
    minTimeDeltaSeconds: 1,
  });

  console.log('5. Configuring rate limiter (12 requests/min)...');
  const rateLimiter = new RateLimiterService({
    redis,
    maxRequestsPerWindow: 12,
    windowSeconds: 60,
    keyPrefix: 'rate_limit:',
  });

  console.log('6. Initializing device binding...');
  const deviceBinding = new DeviceBindingService({
    pool,
    requireTrustedDevice: true,
    minTrustScore: 0.7,
  });

  console.log('7. Setting up cryptographic signature service...');
  const signature = new SignatureService({
    secretKey: process.env.SIGNATURE_SECRET_KEY || 'your-signature-secret-key',
    algorithm: 'sha256',
  });

  console.log('8. Enabling Prometheus metrics...');
  const metrics = new MetricsService({ enabled: true });

  console.log('9. Configuring audit logging...');
  const auditLog = new AuditLogService({ pool });

  console.log('10. Setting up alert hooks...\n');
  const alertOnReview = async (data: any) => {
    console.log('[ALERT] 🔔 Attendance requires review:');
    console.log(`  User: ${data.user_id}`);
    console.log(`  Attendance ID: ${data.attendance_id}`);
    console.log(`  Rationale: ${data.rationale}`);
    console.log(`  Motion Guard: ${data.motion_guard_passed ? 'PASSED' : 'FAILED'}`);
    console.log('');
  };

  const alertOnRejection = async (data: any) => {
    console.log('[ALERT] ❌ Attendance rejected:');
    console.log(`  User: ${data.user_id}`);
    console.log(`  Rationale: ${data.rationale}`);
    console.log('');
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

  console.log('=== Test Case 1: Successful Submission ===\n');

  const request1: AttendanceSubmissionRequest = {
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

  try {
    const result1 = await attendanceService.submitAttendance(request1, {
      ip_address: '192.168.1.100',
      user_agent: 'AttendanceApp/1.0 iOS/15.0',
    });

    console.log('Result:');
    console.log(`  Success: ${result1.success ? '✅' : '❌'}`);
    console.log(`  Decision: ${result1.decision.toUpperCase()}`);
    console.log(`  Attendance ID: ${result1.attendance_id || 'N/A'}`);
    console.log(`  Rationale: ${result1.rationale}`);
    console.log(`  Overall Score: ${result1.integrity_verdict.overall_score.toFixed(2)}`);
    console.log(`  Processing Time: ${result1.metadata.submission_time_ms}ms`);
    console.log(`  Signature: ${result1.signature?.substring(0, 32)}...`);
    console.log('');
  } catch (error) {
    console.error('Error in test case 1:', error);
  }

  console.log('=== Test Case 2: Rate Limit Test ===\n');
  console.log('Submitting 15 requests rapidly (limit is 12/min)...\n');

  for (let i = 1; i <= 15; i++) {
    const request: AttendanceSubmissionRequest = {
      user_id: '550e8400-e29b-41d4-a716-446655440001',
      device_id: '550e8400-e29b-41d4-a716-446655440002',
      office_id: '550e8400-e29b-41d4-a716-446655440003',
      timestamp: new Date(),
      location: {
        latitude: 37.7749 + (i * 0.0001),
        longitude: -122.4194,
      },
      check_in_method: 'gps',
    };

    try {
      const result = await attendanceService.submitAttendance(request);
      
      if (result.success) {
        console.log(`Request ${i}: ✅ ACCEPTED (remaining: ${result.integrity_verdict.rate_limit?.remaining})`);
      } else if (result.error === 'RATE_LIMIT_EXCEEDED') {
        console.log(`Request ${i}: ⛔ RATE LIMITED`);
        console.log(`  Reset at: ${result.integrity_verdict.rate_limit?.reset_at.toISOString()}`);
        break;
      }
    } catch (error) {
      console.error(`Request ${i}: Error`, error);
    }
  }

  console.log('\n=== Test Case 3: Motion Guard Violation ===\n');

  const request3a: AttendanceSubmissionRequest = {
    user_id: '550e8400-e29b-41d4-a716-446655440099',
    device_id: '550e8400-e29b-41d4-a716-446655440002',
    office_id: '550e8400-e29b-41d4-a716-446655440003',
    timestamp: new Date(),
    location: {
      latitude: 37.7749,
      longitude: -122.4194,
    },
    check_in_method: 'gps',
  };

  console.log('First check-in at SF (37.7749, -122.4194)...');
  await attendanceService.submitAttendance(request3a);

  await new Promise(resolve => setTimeout(resolve, 2000));

  const request3b: AttendanceSubmissionRequest = {
    user_id: '550e8400-e29b-41d4-a716-446655440099',
    device_id: '550e8400-e29b-41d4-a716-446655440002',
    office_id: '550e8400-e29b-41d4-a716-446655440003',
    timestamp: new Date(),
    location: {
      latitude: 40.7128,
      longitude: -74.0060,
    },
    check_in_method: 'gps',
  };

  console.log('Second check-in at NYC (40.7128, -74.0060) 2 seconds later...');
  const result3 = await attendanceService.submitAttendance(request3b);

  console.log('\nResult:');
  console.log(`  Decision: ${result3.decision.toUpperCase()}`);
  console.log(`  Motion Guard Passed: ${result3.integrity_verdict.motion_guard?.passed ? '✅' : '❌'}`);
  console.log(`  Teleport Detected: ${result3.integrity_verdict.motion_guard?.teleport_detected ? '⚠️ YES' : 'No'}`);
  console.log(`  Speed: ${result3.integrity_verdict.motion_guard?.speed_mps?.toFixed(2)} m/s`);
  console.log(`  Distance: ${result3.integrity_verdict.motion_guard?.distance_meters?.toFixed(0)} meters`);
  console.log('');

  console.log('=== Prometheus Metrics Summary ===\n');
  const metricsData = metrics.getMetrics();
  console.log(`Total Submissions: ${metricsData.attendance_submissions_total}`);
  console.log(`Accepted: ${metricsData.attendance_submissions_accepted}`);
  console.log(`Rejected: ${metricsData.attendance_submissions_rejected}`);
  console.log(`Review Required: ${metricsData.attendance_submissions_review}`);
  console.log(`Rate Limit Blocks: ${metricsData.rate_limit_blocks_total}`);
  console.log(`Motion Guard Violations: ${metricsData.motion_guard_violations_total}`);
  console.log(`Device Trust Failures: ${metricsData.device_trust_failures_total}`);
  console.log('');

  console.log('=== Prometheus Export Format ===\n');
  console.log(metrics.exportPrometheusFormat());

  await redis.quit();
  await redisCache.disconnect();
  await pool.end();

  console.log('\n✨ Demo completed successfully!');
}

if (require.main === module) {
  demonstrateAttendanceWorkflow().catch(error => {
    console.error('Demo failed:', error);
    process.exit(1);
  });
}

export { demonstrateAttendanceWorkflow };
