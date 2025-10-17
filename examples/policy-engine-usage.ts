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
} from '../src';
import {
  OfficeRepository,
  NetworkRepository,
  BeaconRepository,
  NfcTagRepository,
} from '../src/repositories';
import { PresenceMode, PolicyEvaluationContext } from '../src/types';

async function examplePolicyEngineUsage() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
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
    secretKey: process.env.QR_SECRET_KEY || 'your-secret-key',
  });

  const mockFaceProvider = new MockFaceRecognitionAdapter({
    successRate: 0.9,
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

  console.log('=== Policy Engine Usage Examples ===\n');

  console.log('1. Creating a New Policy');
  const newPolicy = await policyAdmin.createPolicy({
    name: 'High Security Office Policy',
    description: 'Requires multiple factors for high security offices',
    office_id: 'office-uuid-123',
    priority: 100,
    required_factors: {
      min_factors: 3,
      presence_modes: [
        { mode: PresenceMode.GEOFENCE, required: true, weight: 1.0 },
        { mode: PresenceMode.FACE, required: true, weight: 1.0 },
        { mode: PresenceMode.WIFI, required: false, weight: 0.8 },
        { mode: PresenceMode.NFC, required: false, weight: 0.9 },
      ],
      allow_fallback: true,
    },
    geo_distance: {
      max_distance_meters: 100,
      strict_boundary_check: false,
    },
    liveness_config: {
      enabled: true,
      min_confidence: 0.85,
      require_blink: false,
      require_head_movement: false,
    },
    working_hours_start: '09:00',
    working_hours_end: '17:00',
    working_days: [1, 2, 3, 4, 5],
    late_threshold_minutes: 15,
    early_departure_threshold_minutes: 15,
    created_by: 'admin-user-uuid',
  });
  console.log('Created policy:', newPolicy.id);
  console.log('Version:', newPolicy.version);
  console.log();

  console.log('2. Loading Policy with ETag Caching');
  const loadResult1 = await policyLoader.loadPolicy(newPolicy.id);
  console.log('First load - cached:', loadResult1.cached);
  console.log('ETag:', loadResult1.etag);
  console.log();

  const loadResult2 = await policyLoader.loadPolicy(
    newPolicy.id,
    loadResult1.etag || undefined
  );
  console.log('Second load with matching ETag - modified:', loadResult2.modified);
  console.log('Should return 304 Not Modified behavior');
  console.log();

  console.log('3. Loading Policy by Office');
  const officeLoadResult = await policyLoader.loadPolicyByOffice('office-uuid-123');
  console.log('Policy for office:', officeLoadResult.policy?.name);
  console.log();

  console.log('4. Evaluating Check-in Against Policy');
  const evaluationContext: PolicyEvaluationContext = {
    user_id: 'user-uuid-456',
    office_id: 'office-uuid-123',
    timestamp: new Date(),
    location: {
      latitude: 37.7749,
      longitude: -122.4194,
    },
    wifi: {
      ssid: 'Office-WiFi',
      bssid: '00:11:22:33:44:55',
    },
    face: {
      image_data: Buffer.from('fake-image-data'),
    },
  };

  if (newPolicy) {
    const evaluationResult = await policyEvaluator.evaluatePolicy(
      newPolicy,
      evaluationContext
    );
    console.log('Decision:', evaluationResult.decision);
    console.log('Rationale:', evaluationResult.rationale);
    console.log('Factors passed:', evaluationResult.factors_passed);
    console.log('Factors required:', evaluationResult.factors_required);
    console.log('Evaluation time:', evaluationResult.metadata.evaluation_time_ms, 'ms');
    console.log();
  }

  console.log('5. Updating Policy');
  const updatedPolicy = await policyAdmin.updatePolicy(newPolicy.id, {
    late_threshold_minutes: 20,
    updated_by: 'admin-user-uuid',
    reason: 'Increased late threshold for flexibility',
  });
  console.log('Updated policy version:', updatedPolicy.version);
  console.log();

  console.log('6. Cache Invalidation After Update');
  await policyLoader.invalidatePolicy(newPolicy.id, 'office-uuid-123');
  console.log('Cache invalidated');
  console.log();

  console.log('7. Viewing Policy History');
  const history = await policyAdmin.getPolicyHistory(newPolicy.id);
  console.log('Policy history entries:', history.length);
  for (const entry of history) {
    console.log(`  - ${entry.action} (v${entry.version}) by ${entry.performed_by} at ${entry.performed_at}`);
    if (entry.reason) {
      console.log(`    Reason: ${entry.reason}`);
    }
  }
  console.log();

  console.log('8. Listing All Policies');
  const allPolicies = await policyAdmin.listPolicies({
    is_active: true,
    limit: 10,
  });
  console.log('Active policies:', allPolicies.length);
  console.log();

  console.log('9. Deactivating Policy');
  await policyAdmin.deactivatePolicy(newPolicy.id, 'admin-user-uuid');
  console.log('Policy deactivated');
  console.log();

  console.log('10. Viewing Audit Logs');
  const auditLogs = await policyAdmin.getAuditLogs({
    policy_id: newPolicy.id,
    limit: 10,
  });
  console.log('Audit log entries:', auditLogs.length);
  for (const log of auditLogs) {
    console.log(`  - ${log.action} at ${log.performed_at}`);
  }
  console.log();

  console.log('11. Registering Invalidation Hook');
  policyLoader.registerInvalidationHook(async (policyId, officeId) => {
    console.log(`Custom invalidation hook called for policy ${policyId}`);
    if (officeId) {
      console.log(`  Office: ${officeId}`);
    }
  });
  console.log('Invalidation hook registered');
  console.log();

  console.log('12. Deleting Policy');
  await policyAdmin.deletePolicy(
    newPolicy.id,
    'admin-user-uuid',
    'Cleanup test policy'
  );
  console.log('Policy deleted');
  console.log();

  await redisCache.disconnect();
  await pool.end();
  console.log('=== Examples Complete ===');
}

async function exampleHttpMiddleware() {
  console.log('\n=== HTTP Middleware Example ===\n');
  console.log('Example Express.js middleware for ETag handling:\n');
  
  console.log(`
import express from 'express';
import { PolicyLoaderMiddleware } from './services';

const app = express();
const policyLoader = new PolicyLoaderMiddleware({ cache, pool });

// Middleware to load policy with ETag support
app.get('/api/policies/:id', async (req, res) => {
  const policyId = req.params.id;
  const ifNoneMatch = req.headers['if-none-match'];

  try {
    const result = await policyLoader.loadPolicy(policyId, ifNoneMatch);

    if (!result.modified) {
      // Return 304 Not Modified
      return res.status(304).end();
    }

    if (!result.policy) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    // Set ETag header
    res.setHeader('ETag', result.etag);
    res.setHeader('Cache-Control', 'max-age=300');
    
    return res.json(result.policy);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to evaluate check-in
app.post('/api/check-in/evaluate', async (req, res) => {
  const { office_id, context } = req.body;

  try {
    // Load policy for office
    const policyResult = await policyLoader.loadPolicyByOffice(office_id);
    
    if (!policyResult.policy) {
      return res.status(404).json({ error: 'No policy found for office' });
    }

    // Evaluate check-in
    const evaluation = await policyEvaluator.evaluatePolicy(
      policyResult.policy,
      context
    );

    return res.json(evaluation);
  } catch (error) {
    return res.status(500).json({ error: 'Evaluation failed' });
  }
});
`);
}

if (require.main === module) {
  examplePolicyEngineUsage()
    .then(() => exampleHttpMiddleware())
    .catch(console.error);
}

export { examplePolicyEngineUsage, exampleHttpMiddleware };
