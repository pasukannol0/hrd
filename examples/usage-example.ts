/**
 * Usage examples for presence factor services and repositories
 */

import { Pool } from 'pg';
import {
  InMemoryCache,
  OfficeRepository,
  NetworkRepository,
  BeaconRepository,
  NfcTagRepository,
  PolicyRepository,
  GeoValidatorService,
  WiFiMatcherService,
  BeaconProximityService,
  NfcVerifierService,
  QrTokenGeneratorService,
  FaceRecognitionService,
  MockFaceRecognitionAdapter,
} from '../src';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const cache = new InMemoryCache(60000);

  const officeRepo = new OfficeRepository({ pool, cache, defaultCacheTtl: 300 });
  const networkRepo = new NetworkRepository({ pool, cache, defaultCacheTtl: 300 });
  const beaconRepo = new BeaconRepository({ pool, cache, defaultCacheTtl: 300 });
  const nfcTagRepo = new NfcTagRepository({ pool, cache, defaultCacheTtl: 300 });
  const policyRepo = new PolicyRepository({ pool, cache, defaultCacheTtl: 300 });

  console.log('=== Example 1: Geo Validation ===');
  const geoValidator = new GeoValidatorService({
    officeRepository: officeRepo,
    defaultDistanceTolerance: 100,
  });

  const geoResult = await geoValidator.validateLocation(
    { latitude: 37.7749, longitude: -122.4194 }
  );

  console.log('Geo validation result:', geoResult);

  console.log('\n=== Example 2: Wi-Fi Matching ===');
  const wifiMatcher = new WiFiMatcherService({
    networkRepository: networkRepo,
    officeRepository: officeRepo,
  });

  const wifiResult = await wifiMatcher.matchNetwork(
    'CompanyWiFi-SF',
    '00:11:22:33:44:55'
  );

  console.log('Wi-Fi match result:', wifiResult);

  console.log('\n=== Example 3: Beacon Detection ===');
  const beaconService = new BeaconProximityService({
    beaconRepository: beaconRepo,
    officeRepository: officeRepo,
    defaultProximityThreshold: 50,
  });

  const beaconResult = await beaconService.detectBeacon(
    'f7826da6-4fa2-4e98-8024-bc5b71e0893e',
    1,
    100,
    -65
  );

  console.log('Beacon detection result:', beaconResult);

  console.log('\n=== Example 4: NFC Verification ===');
  const nfcVerifier = new NfcVerifierService({
    nfcTagRepository: nfcTagRepo,
    officeRepository: officeRepo,
  });

  const nfcResult = await nfcVerifier.verifyTag('04:A1:B2:C3:D4:E5:F6');

  console.log('NFC verification result:', nfcResult);

  console.log('\n=== Example 5: QR Token Generation ===');
  const qrGenerator = new QrTokenGeneratorService({
    secretKey: process.env.QR_SECRET_KEY || 'development-secret-key',
    minTtlSeconds: 30,
    maxTtlSeconds: 60,
  });

  const qrToken = qrGenerator.generateDynamicToken('office-uuid', 'user-uuid');

  console.log('Generated QR token:', qrToken.token);
  console.log('Token expires at:', qrToken.expires_at);
  console.log('Remaining TTL:', qrGenerator.getRemainingTtl(qrToken.token), 'seconds');

  await new Promise(resolve => setTimeout(resolve, 2000));

  const tokenValidation = qrGenerator.validateToken(qrToken.token);
  console.log('Token validation:', tokenValidation);

  console.log('\n=== Example 6: Face Recognition (Mock) ===');
  const mockProvider = new MockFaceRecognitionAdapter({
    successRate: 0.9,
    simulateDelay: true,
    delayMs: 500,
    alwaysRecognizeUsers: ['test-user-1'],
  });

  const faceService = new FaceRecognitionService({
    provider: mockProvider,
    enableLivenessCheck: true,
    confidenceThreshold: 0.8,
    timeout: 10000,
  });

  const faceImageData = Buffer.from('mock-face-image-data');

  console.log('Enrolling face for test-user-1...');
  const enrollResult = await faceService.enrollFace('test-user-1', faceImageData);
  console.log('Enrollment result:', enrollResult);

  console.log('Recognizing face with liveness check...');
  const recognitionResult = await faceService.recognizeWithLiveness(faceImageData);
  console.log('Recognition result:', recognitionResult);

  console.log('\n=== Example 7: Combined Presence Verification ===');
  const userLocation = { latitude: 37.7749, longitude: -122.4194 };
  const wifiSSID = 'CompanyWiFi-SF';
  const wifiBSSID = '00:11:22:33:44:55';
  const beaconUuid = 'f7826da6-4fa2-4e98-8024-bc5b71e0893e';
  const beaconMajor = 1;
  const beaconMinor = 100;
  const beaconRSSI = -65;
  const nfcTagUid = '04:A1:B2:C3:D4:E5:F6';

  const presenceVerification = {
    geo: await geoValidator.validateLocation(userLocation),
    wifi: await wifiMatcher.matchNetwork(wifiSSID, wifiBSSID),
    beacon: await beaconService.detectBeacon(beaconUuid, beaconMajor, beaconMinor, beaconRSSI),
    nfc: await nfcVerifier.verifyTag(nfcTagUid),
    qr: qrGenerator.validateToken(qrToken.token),
    face: await faceService.recognizeFace(faceImageData),
  };

  console.log('Combined presence verification:', JSON.stringify(presenceVerification, null, 2));

  const verificationScore = [
    presenceVerification.geo.valid ? 1 : 0,
    presenceVerification.wifi.matched ? 1 : 0,
    presenceVerification.beacon.detected ? 1 : 0,
    presenceVerification.nfc.verified ? 1 : 0,
    presenceVerification.qr.valid ? 1 : 0,
    presenceVerification.face.recognized ? 1 : 0,
  ].reduce((sum, val) => sum + val, 0);

  console.log(`\nVerification score: ${verificationScore}/6`);

  console.log('\n=== Example 8: Policy-Based Verification ===');
  const officeId = geoResult.office_id;

  if (officeId) {
    const policy = await policyRepo.findApplicablePolicy(officeId);

    if (policy) {
      console.log('Applicable policy:', policy.name);
      console.log('Requirements:');
      console.log('  - Geofence:', policy.require_geofence);
      console.log('  - Network validation:', policy.require_network_validation);
      console.log('  - Beacon proximity:', policy.require_beacon_proximity);
      console.log('  - NFC tap:', policy.require_nfc_tap);
      console.log('  - Max distance:', policy.max_checkin_distance_meters, 'meters');

      const meetsRequirements = {
        geofence: !policy.require_geofence || presenceVerification.geo.valid,
        network: !policy.require_network_validation || presenceVerification.wifi.matched,
        beacon: !policy.require_beacon_proximity || presenceVerification.beacon.detected,
        nfc: !policy.require_nfc_tap || presenceVerification.nfc.verified,
      };

      const allRequirementsMet = Object.values(meetsRequirements).every(met => met);

      console.log('\nRequirements status:');
      Object.entries(meetsRequirements).forEach(([key, met]) => {
        console.log(`  ${key}: ${met ? '✓' : '✗'}`);
      });

      console.log(`\nPolicy compliance: ${allRequirementsMet ? 'PASSED' : 'FAILED'}`);
    }
  }

  cache.destroy();
  await pool.end();

  console.log('\nDone!');
}

if (require.main === module) {
  main().catch(console.error);
}

export { main };
