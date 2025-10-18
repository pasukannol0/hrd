# Presence Factor Services & Repositories

This directory contains the service layer and repository layer for the attendance management system's presence verification features.

## Architecture

```
src/
├── types/              # TypeScript type definitions
├── utils/              # Utility functions (caching, etc.)
├── repositories/       # Data access layer with PostGIS queries
└── services/           # Business logic layer
    └── face-recognition/  # Face recognition with pluggable providers
```

## Repositories

Repository classes provide data access with caching support and PostGIS queries.

### OfficeRepository

Manages office locations with geographic boundaries.

**Key Methods:**
- `findById(id)` - Find office by ID (cached)
- `findByLocation(point)` - Find office containing a point (PostGIS ST_Contains)
- `findNearbyOffices(point, distance)` - Find offices within distance (PostGIS ST_DWithin)
- `getDistanceToOffice(point, officeId)` - Calculate distance (PostGIS ST_Distance)
- `isPointInOfficeBoundary(point, officeId)` - Check if point is within boundary

### NetworkRepository

Manages office Wi-Fi networks.

**Key Methods:**
- `findBySSID(ssid)` - Find networks by SSID
- `findByBSSID(bssid)` - Find network by BSSID (MAC address)
- `findBySSIDAndBSSID(ssid, bssid)` - Exact match
- `findByOfficeId(officeId)` - Get all networks for an office

### BeaconRepository

Manages Bluetooth beacons with proximity detection.

**Key Methods:**
- `findByBeaconIdentifier(uuid, major, minor)` - Find beacon by iBeacon ID
- `findNearbyBeacons(point, distance)` - Find beacons near location (PostGIS ST_DWithin)
- `getDistanceToBeacon(point, beaconId)` - Calculate distance (PostGIS ST_Distance)

### NfcTagRepository

Manages NFC tags for tap-based verification.

**Key Methods:**
- `findByTagUid(tagUid)` - Find tag by UID
- `findNearbyTags(point, distance)` - Find tags near location (PostGIS ST_DWithin)
- `getDistanceToTag(point, tagId)` - Calculate distance (PostGIS ST_Distance)

### PolicyRepository

Manages attendance policies with office-specific and global rules.

**Key Methods:**
- `findByOfficeId(officeId)` - Get policies for office (priority ordered)
- `findGlobalPolicies()` - Get global policies
- `findApplicablePolicy(officeId)` - Get highest priority applicable policy

## Services

Service classes implement business logic for presence verification.

### GeoValidatorService

Validates user location against office boundaries using PostGIS.

**Configuration:**
- `officeRepository` - Office repository instance
- `defaultDistanceTolerance` - Default distance in meters (default: 100)

**Methods:**
```typescript
validateLocation(point, officeId?, distanceTolerance?): Promise<GeoValidationResult>
```

**Features:**
- Uses `ST_Contains` to check if point is within office boundary
- Uses `ST_DWithin` to check if point is within distance tolerance
- Configurable distance tolerance per validation
- Returns distance and office information

### WiFiMatcherService

Matches Wi-Fi networks (SSID/BSSID) to offices.

**Configuration:**
- `networkRepository` - Network repository instance
- `officeRepository` - Office repository instance

**Methods:**
```typescript
matchNetwork(ssid, bssid?): Promise<WiFiMatchResult>
matchBSSIDOnly(bssid): Promise<WiFiMatchResult>
findNetworksByOffice(officeId): Promise<Network[]>
```

**Features:**
- Exact BSSID matching for precise location
- SSID-only matching as fallback
- Returns office information on match

### BeaconProximityService

Handles Bluetooth beacon detection and proximity verification.

**Configuration:**
- `beaconRepository` - Beacon repository instance
- `officeRepository` - Office repository instance
- `defaultProximityThreshold` - Default proximity in meters (default: 50)

**Methods:**
```typescript
detectBeacon(uuid, major, minor, rssi?): Promise<BeaconProximityResult>
detectNearbyBeacons(point, proximityThreshold?): Promise<BeaconProximityResult[]>
verifyBeaconProximity(uuid, major, minor, rssi, threshold?): Promise<ProximityCheck>
```

**Features:**
- iBeacon format support (UUID, major, minor)
- RSSI-based distance estimation
- Proximity threshold validation
- Geographic proximity detection using PostGIS

### NfcVerifierService

Verifies NFC tag scans and associates with offices.

**Configuration:**
- `nfcTagRepository` - NFC tag repository instance
- `officeRepository` - Office repository instance

**Methods:**
```typescript
verifyTag(tagUid): Promise<NfcVerificationResult>
verifyTagWithLocation(tagUid, userLocation?, maxDistance?): Promise<VerificationResult>
findNearbyTags(point, distance?): Promise<NearbyTag[]>
```

**Features:**
- Tag UID verification
- Optional location-based verification
- Distance validation between user and tag
- Returns office information

### QrTokenGeneratorService

Generates HMAC-based dynamic QR codes with configurable TTL.

**Configuration:**
- `secretKey` - HMAC secret key (required)
- `minTtlSeconds` - Minimum TTL (default: 30)
- `maxTtlSeconds` - Maximum TTL (default: 60)
- `defaultTtlSeconds` - Default TTL (default: 45)

**Methods:**
```typescript
generateToken(officeId?, userId?, ttlSeconds?): QrToken
generateDynamicToken(officeId?, userId?): QrToken // Random TTL between min/max
validateToken(token): QrTokenValidation
getRemainingTtl(token): number | null
```

**Features:**
- HMAC-SHA256 signature
- Configurable TTL (30-60 seconds)
- Base64url encoded tokens
- Nonce for uniqueness
- Token validation with expiration check

### FaceRecognitionService

Pluggable face recognition with liveness detection.

**Configuration:**
- `provider` - FaceRecognitionProvider implementation
- `enableLivenessCheck` - Enable liveness detection (default: true)
- `confidenceThreshold` - Minimum confidence (default: 0.8)
- `timeout` - Operation timeout in ms (default: 10000)

**Methods:**
```typescript
recognizeFace(imageData): Promise<FaceRecognitionResult>
detectLiveness(imageData): Promise<LivenessDetectionResult>
recognizeWithLiveness(imageData): Promise<RecognitionResult>
enrollFace(userId, imageData): Promise<EnrollmentResult>
deleteFace(userId): Promise<DeletionResult>
setProvider(provider): void
```

**Features:**
- Pluggable provider architecture
- Automatic liveness detection
- Confidence threshold validation
- Timeout protection
- Error handling with categorized errors

### MockFaceRecognitionAdapter

Mock implementation for testing and development.

**Configuration:**
- `successRate` - Success rate (default: 0.9)
- `simulateDelay` - Add delay (default: true)
- `delayMs` - Delay duration (default: 500)
- `alwaysRecognizeUsers` - Users to always recognize
- `simulateErrors` - Enable random errors (default: false)
- `errorRate` - Error probability (default: 0.1)

**Features:**
- In-memory face enrollment
- Configurable success/error rates
- Simulated delays
- Test user lists
- Error simulation

### DeviceIntegrityMiddleware

Provides unified device attestation verification across Google Play Integrity, Apple App Attest, and Apple DeviceCheck with contextual root detection, binding enforcement, and metrics emission.

**Configuration:**
- `providers` - Optional list of custom `DeviceIntegrityProvider` implementations
- `mode` - Overrides the active provider (defaults to `INTEGRITY_MODE` environment variable)
- `bindingStore` - Custom `DeviceBindingStore` implementation (defaults to in-memory)
- `rootDetectionAdapters` - Additional `RootDetectionAdapter` instances for advanced signal fusion
- `metricsEmitter` - Custom `IntegrityMetricsEmitter` for forwarding verification metrics
- `allowMockModeInProduction` - Explicitly permit mock mode in production (default: false)

**Methods:**
```typescript
verify(request: DeviceIntegrityRequest): Promise<DeviceIntegrityContext>
enrichPolicyContext(context, request): Promise<PolicyEvaluationContext>
registerProvider(provider: DeviceIntegrityProvider): void
registerRootDetectionAdapter(adapter: RootDetectionAdapter): void
```

**Features:**
- Secure nonce and timestamp validation with provider-specific adapters
- Root/jailbreak signal fusion with pluggable adapters
- Device public-key binding with automatic first-use enrollment
- Console metrics emitter producing structured integrity events
- Automatic safeguards that prevent `INTEGRITY_MODE=mock` in production environments

> **Environment:** Add `INTEGRITY_MODE=mock` to local `.env` files for development/testing. Production deployments must configure a real provider.

## Usage Examples

### Initialize Repositories

```typescript
import { Pool } from 'pg';
import { InMemoryCache } from './utils';
import {
  OfficeRepository,
  NetworkRepository,
  BeaconRepository,
  NfcTagRepository,
  PolicyRepository,
} from './repositories';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const cache = new InMemoryCache();

const officeRepo = new OfficeRepository({ pool, cache });
const networkRepo = new NetworkRepository({ pool, cache });
const beaconRepo = new BeaconRepository({ pool, cache });
const nfcTagRepo = new NfcTagRepository({ pool, cache });
const policyRepo = new PolicyRepository({ pool, cache });
```

### Geo Validation

```typescript
import { GeoValidatorService } from './services';

const geoValidator = new GeoValidatorService({
  officeRepository: officeRepo,
  defaultDistanceTolerance: 100,
});

const result = await geoValidator.validateLocation(
  { latitude: 37.7749, longitude: -122.4194 },
  'office-uuid',
  150 // Override distance tolerance
);

if (result.valid) {
  console.log(`Valid location at ${result.distance_meters}m from ${result.office_name}`);
}
```

### Wi-Fi Matching

```typescript
import { WiFiMatcherService } from './services';

const wifiMatcher = new WiFiMatcherService({
  networkRepository: networkRepo,
  officeRepository: officeRepo,
});

const result = await wifiMatcher.matchNetwork(
  'CompanyWiFi-SF',
  '00:11:22:33:44:55'
);

if (result.matched) {
  console.log(`Matched office: ${result.office_name}`);
}
```

### Beacon Detection

```typescript
import { BeaconProximityService } from './services';

const beaconService = new BeaconProximityService({
  beaconRepository: beaconRepo,
  officeRepository: officeRepo,
  defaultProximityThreshold: 50,
});

const result = await beaconService.detectBeacon(
  'f7826da6-4fa2-4e98-8024-bc5b71e0893e',
  1,
  100,
  -65 // RSSI
);

if (result.detected) {
  console.log(`Detected beacon at office: ${result.office_name}`);
  console.log(`Estimated distance: ${result.distance_estimate}m`);
}
```

### NFC Verification

```typescript
import { NfcVerifierService } from './services';

const nfcVerifier = new NfcVerifierService({
  nfcTagRepository: nfcTagRepo,
  officeRepository: officeRepo,
});

const result = await nfcVerifier.verifyTag('04:A1:B2:C3:D4:E5:F6');

if (result.verified) {
  console.log(`Verified NFC tag at office: ${result.office_name}`);
}
```

### QR Token Generation

```typescript
import { QrTokenGeneratorService } from './services';

const qrGenerator = new QrTokenGeneratorService({
  secretKey: process.env.QR_SECRET_KEY || 'your-secret-key',
  minTtlSeconds: 30,
  maxTtlSeconds: 60,
});

// Generate with random TTL
const token = qrGenerator.generateDynamicToken(
  'office-uuid',
  'user-uuid'
);

console.log(`Token: ${token.token}`);
console.log(`Expires at: ${token.expires_at}`);

// Validate token
const validation = qrGenerator.validateToken(token.token);

if (validation.valid) {
  console.log(`Valid token for office: ${validation.office_id}`);
}
```

### Face Recognition

```typescript
import {
  FaceRecognitionService,
  MockFaceRecognitionAdapter,
} from './services';

const mockProvider = new MockFaceRecognitionAdapter({
  successRate: 0.9,
  simulateDelay: true,
  alwaysRecognizeUsers: ['test-user-1'],
});

const faceService = new FaceRecognitionService({
  provider: mockProvider,
  enableLivenessCheck: true,
  confidenceThreshold: 0.8,
});

// Enroll face
const enrollment = await faceService.enrollFace(
  'user-uuid',
  faceImageBuffer
);

if (enrollment.success) {
  console.log(`Face enrolled: ${enrollment.face_id}`);
}

// Recognize with liveness
const result = await faceService.recognizeWithLiveness(faceImageBuffer);

if (result.recognized && result.liveness?.is_live) {
  console.log(`Recognized user: ${result.user_id}`);
  console.log(`Confidence: ${result.confidence}`);
}
```

## Error Handling

All services include comprehensive error handling:

### Repository Errors
- Database connection errors
- Query execution errors
- Cache errors (non-fatal)

### Service Errors
- Validation errors
- Provider errors (face recognition)
- Timeout errors
- Data not found errors

### Face Recognition Errors
```typescript
enum FaceRecognitionError {
  NO_FACE_DETECTED
  MULTIPLE_FACES_DETECTED
  POOR_IMAGE_QUALITY
  LIVENESS_CHECK_FAILED
  RECOGNITION_FAILED
  ENROLLMENT_FAILED
  PROVIDER_ERROR
  TIMEOUT
}
```

## Caching Strategy

Repositories use optional caching with configurable TTL:

- **Office data**: 300s (5 minutes)
- **Network data**: 300s
- **Beacon data**: 300s
- **NFC tag data**: 300s
- **Policy data**: 300s
- **Aggregate queries**: 600s (10 minutes)

Cache can be disabled by not providing a cache instance to repositories.

## PostGIS Functions Used

- `ST_Contains` - Check if point is within boundary
- `ST_DWithin` - Check if geometries are within distance
- `ST_Distance` - Calculate distance between geometries
- `ST_MakePoint` - Create point from coordinates
- `ST_SetSRID` - Set spatial reference system

All coordinates use SRID 4326 (WGS 84 - latitude/longitude).

## Testing

Use the MockFaceRecognitionAdapter for testing face recognition without external dependencies:

```typescript
const mockAdapter = new MockFaceRecognitionAdapter({
  successRate: 1.0,
  simulateDelay: false,
  alwaysRecognizeUsers: ['test-user'],
  simulateErrors: false,
});

// Test enrollment
await mockAdapter.enrollFace('test-user', 'image-data');

// Test recognition
const result = await mockAdapter.recognizeFace('image-data');
expect(result.recognized).toBe(true);
```

## Production Considerations

1. **Database Connection Pooling**: Configure appropriate pool size
2. **Cache Strategy**: Use Redis for distributed caching in production
3. **Face Recognition Provider**: Integrate with AWS Rekognition, Azure Face API, or similar
4. **QR Secret Key**: Use strong, randomly generated secret key
5. **Monitoring**: Add logging and metrics
6. **Rate Limiting**: Implement rate limiting for face recognition operations
7. **Data Privacy**: Handle biometric data according to regulations (GDPR, BIPA, etc.)

## License

MIT
