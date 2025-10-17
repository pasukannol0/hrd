/**
 * Complete Policy Engine Example
 * 
 * This example demonstrates:
 * 1. Creating and managing policies
 * 2. Loading policies with ETag caching
 * 3. Evaluating check-ins against policies
 * 4. Handling different decision outcomes
 * 5. Audit trail and versioning
 */

import { Pool } from 'pg';
import {
  RedisCache,
  PolicyLoaderMiddleware,
  PolicyEvaluatorService,
  PolicyAdminService,
  GeoValidatorService,
  WiFiMatcherService,
  BeaconProximityService,
  NfcVerifierService,
  QrTokenGeneratorService,
  FaceRecognitionService,
  MockFaceRecognitionAdapter,
  OfficeRepository,
  NetworkRepository,
  BeaconRepository,
  NfcTagRepository,
  PresenceMode,
  PolicyEvaluationContext,
  PolicyDecision,
} from '../src';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         Policy Engine Complete Example                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/attendance',
  });

  const redisCache = new RedisCache({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    keyPrefix: 'attendance:policy:',
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

  const qrGenerator = new QrTokenGeneratorService({
    secretKey: process.env.QR_SECRET_KEY || 'example-secret-key-change-in-production',
  });

  const mockFaceProvider = new MockFaceRecognitionAdapter({
    successRate: 0.95,
    simulateDelay: true,
    delayMs: 300,
  });

  const faceRecognition = new FaceRecognitionService({
    provider: mockFaceProvider,
    enableLivenessCheck: true,
    confidenceThreshold: 0.8,
  });

  const policyLoader = new PolicyLoaderMiddleware({
    cache: redisCache,
    pool,
    defaultTtlSeconds: 300,
  });

  const policyEvaluator = new PolicyEvaluatorService({
    geoValidator,
    wifiMatcher,
    beaconProximity,
    nfcVerifier,
    qrTokenGenerator,
    faceRecognition,
  });

  const policyAdmin = new PolicyAdminService({
    pool,
    policyLoader,
  });

  console.log('✓ All services initialized\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SCENARIO 1: Creating High-Security Policy');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const highSecurityPolicy = await policyAdmin.createPolicy({
    name: 'High Security Office - Multi-Factor',
    description: 'Requires geofence, WiFi, and face recognition for check-in',
    office_id: null,
    priority: 100,
    required_factors: {
      min_factors: 3,
      presence_modes: [
        { mode: PresenceMode.GEOFENCE, required: true, weight: 1.0 },
        { mode: PresenceMode.WIFI, required: true, weight: 1.0 },
        { mode: PresenceMode.FACE, required: true, weight: 1.0 },
        { mode: PresenceMode.BEACON, required: false, weight: 0.8 },
        { mode: PresenceMode.NFC, required: false, weight: 0.9 },
      ],
      allow_fallback: true,
    },
    geo_distance: {
      max_distance_meters: 50,
      strict_boundary_check: false,
    },
    liveness_config: {
      enabled: true,
      min_confidence: 0.85,
      require_blink: false,
      require_head_movement: false,
    },
    working_hours_start: '08:30',
    working_hours_end: '17:30',
    working_days: [1, 2, 3, 4, 5],
    late_threshold_minutes: 10,
    early_departure_threshold_minutes: 10,
    created_by: 'admin-uuid-001',
  });

  console.log(`✓ Policy Created: ${highSecurityPolicy.name}`);
  console.log(`  ID: ${highSecurityPolicy.id}`);
  console.log(`  Version: ${highSecurityPolicy.version}`);
  console.log(`  Priority: ${highSecurityPolicy.priority}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SCENARIO 2: ETag Caching Demonstration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Loading policy for the first time...');
  const load1 = await policyLoader.loadPolicy(highSecurityPolicy.id);
  console.log(`  Cached: ${load1.cached}`);
  console.log(`  Modified: ${load1.modified}`);
  console.log(`  ETag: ${load1.etag}\n`);

  console.log('Loading policy again with same ETag...');
  const load2 = await policyLoader.loadPolicy(highSecurityPolicy.id, load1.etag || undefined);
  console.log(`  Cached: ${load2.cached}`);
  console.log(`  Modified: ${load2.modified}`);
  console.log(`  → Would return HTTP 304 Not Modified\n`);

  console.log('Loading policy from cache...');
  const load3 = await policyLoader.loadPolicy(highSecurityPolicy.id);
  console.log(`  Cached: ${load3.cached}`);
  console.log(`  Cache Hit! No database query needed\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SCENARIO 3: Successful Check-In (ACCEPTED)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await mockFaceProvider.enrollFace('user-uuid-123', 'user-face-data');

  const successContext: PolicyEvaluationContext = {
    user_id: 'user-uuid-123',
    office_id: 'office-uuid-001',
    timestamp: new Date('2024-01-15T09:00:00Z'),
    location: {
      latitude: 37.7749,
      longitude: -122.4194,
    },
    wifi: {
      ssid: 'OfficeNetwork',
      bssid: '00:11:22:33:44:55',
    },
    face: {
      image_data: Buffer.from('user-face-data'),
    },
  };

  console.log('Evaluating check-in with all factors present...');
  const successEval = await policyEvaluator.evaluatePolicy(
    highSecurityPolicy,
    successContext
  );

  console.log(`\n  Decision: ${successEval.decision.toUpperCase()}`);
  console.log(`  Rationale: ${successEval.rationale}`);
  console.log(`  Factors Passed: ${successEval.factors_passed}/${successEval.factors_required}`);
  console.log(`  Evaluation Time: ${successEval.metadata.evaluation_time_ms}ms\n`);

  console.log('  Factor Results:');
  for (const factor of successEval.factors_evaluated) {
    const status = factor.passed ? '✓' : '✗';
    console.log(`    ${status} ${factor.mode.toUpperCase()} (confidence: ${factor.confidence.toFixed(2)})`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SCENARIO 4: Late Arrival (REVIEW)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const lateContext: PolicyEvaluationContext = {
    ...successContext,
    timestamp: new Date('2024-01-15T09:30:00Z'),
  };

  console.log('Evaluating check-in 30 minutes late...');
  const lateEval = await policyEvaluator.evaluatePolicy(
    highSecurityPolicy,
    lateContext
  );

  console.log(`\n  Decision: ${lateEval.decision.toUpperCase()}`);
  console.log(`  Rationale: ${lateEval.rationale}`);
  console.log(`  Late By: ${lateEval.metadata.working_hours_check?.is_late ? 'Yes' : 'No'}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SCENARIO 5: Insufficient Factors (REJECTED)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const insufficientContext: PolicyEvaluationContext = {
    user_id: 'user-uuid-123',
    office_id: 'office-uuid-001',
    timestamp: new Date('2024-01-15T09:00:00Z'),
    location: {
      latitude: 37.7749,
      longitude: -122.4194,
    },
  };

  console.log('Evaluating check-in with only geofence...');
  const rejectedEval = await policyEvaluator.evaluatePolicy(
    highSecurityPolicy,
    insufficientContext
  );

  console.log(`\n  Decision: ${rejectedEval.decision.toUpperCase()}`);
  console.log(`  Rationale: ${rejectedEval.rationale}`);
  console.log(`  Factors Passed: ${rejectedEval.factors_passed}/${rejectedEval.factors_required}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SCENARIO 6: Policy Update and Versioning');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Updating policy to allow 2 factors instead of 3...');
  const updatedPolicy = await policyAdmin.updatePolicy(highSecurityPolicy.id, {
    required_factors: {
      ...highSecurityPolicy.required_factors,
      min_factors: 2,
    },
    updated_by: 'admin-uuid-001',
    reason: 'Relaxed requirements for pilot phase',
  });

  console.log(`  ✓ Policy Updated`);
  console.log(`  New Version: ${updatedPolicy.version}`);
  console.log(`  Min Factors: ${updatedPolicy.required_factors.min_factors}\n`);

  console.log('Re-evaluating previously rejected check-in...');
  const reevaluation = await policyEvaluator.evaluatePolicy(
    updatedPolicy,
    insufficientContext
  );

  console.log(`  New Decision: ${reevaluation.decision.toUpperCase()}`);
  console.log(`  Rationale: ${reevaluation.rationale}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SCENARIO 7: Audit Trail');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const history = await policyAdmin.getPolicyHistory(highSecurityPolicy.id);

  console.log(`Policy history (${history.length} entries):\n`);
  for (const entry of history) {
    console.log(`  ${entry.action.toUpperCase()} - Version ${entry.version}`);
    console.log(`    Performed by: ${entry.performed_by}`);
    console.log(`    Timestamp: ${entry.performed_at.toISOString()}`);
    if (entry.reason) {
      console.log(`    Reason: ${entry.reason}`);
    }
    if (entry.changes) {
      console.log(`    Changes: ${Object.keys(entry.changes).join(', ')}`);
    }
    console.log();
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SCENARIO 8: Cache Invalidation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Registering invalidation hook...');
  policyLoader.registerInvalidationHook(async (policyId, officeId) => {
    console.log(`  → Hook triggered for policy ${policyId.substring(0, 8)}...`);
    if (officeId) {
      console.log(`  → Office affected: ${officeId.substring(0, 8)}...`);
    }
  });

  console.log('Invalidating policy cache...');
  await policyLoader.invalidatePolicy(highSecurityPolicy.id);
  console.log('  ✓ Cache cleared\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SCENARIO 9: Cleanup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Deactivating policy...');
  await policyAdmin.deactivatePolicy(highSecurityPolicy.id, 'admin-uuid-001');
  console.log('  ✓ Policy deactivated\n');

  console.log('Deleting policy...');
  await policyAdmin.deletePolicy(
    highSecurityPolicy.id,
    'admin-uuid-001',
    'Example cleanup'
  );
  console.log('  ✓ Policy deleted\n');

  await redisCache.disconnect();
  await pool.end();

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         Example Complete!                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('Key Takeaways:');
  console.log('  1. Policies support multi-factor authentication');
  console.log('  2. ETag caching reduces database load');
  console.log('  3. Decisions: ACCEPTED, REVIEW, or REJECTED');
  console.log('  4. Full versioning and audit trail');
  console.log('  5. Automatic cache invalidation on updates');
  console.log();
}

if (require.main === module) {
  main().catch(console.error);
}

export { main as runCompleteExample };
