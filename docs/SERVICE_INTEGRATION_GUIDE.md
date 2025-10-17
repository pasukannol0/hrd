# Service Integration Guide

This guide explains how to integrate the presence factor services into your application.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Basic Setup](#basic-setup)
- [Service Integration](#service-integration)
- [Production Considerations](#production-considerations)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Prerequisites

1. **Database Setup**
   - PostgreSQL 12+ with PostGIS extension
   - Run all migrations: `npm run migrate:up`
   - (Optional) Seed sample data: `npm run db:seed`

2. **Node.js Environment**
   - Node.js 16+
   - TypeScript 5.3+
   - Built services: `npm run build`

3. **Environment Variables**
   ```bash
   DATABASE_URL=postgresql://user:password@localhost:5432/attendance_db
   QR_SECRET_KEY=your-strong-random-secret-key-here
   ```

## Installation

### As a Package (Recommended)

```bash
npm install attendance-system
```

### From Source

```bash
git clone <repository>
cd attendance-system
npm install
npm run build
```

## Basic Setup

### 1. Initialize Database Connection

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 2. Set Up Caching (Optional but Recommended)

```typescript
import { InMemoryCache } from 'attendance-system';

// For development/single-instance deployments
const cache = new InMemoryCache(60000); // Cleanup every 60s

// For production, use Redis or similar
// import Redis from 'ioredis';
// const redisClient = new Redis(process.env.REDIS_URL);
// const cache = new RedisCache(redisClient);
```

### 3. Initialize Repositories

```typescript
import {
  OfficeRepository,
  NetworkRepository,
  BeaconRepository,
  NfcTagRepository,
  PolicyRepository,
} from 'attendance-system';

const repositoryConfig = {
  pool,
  cache,
  defaultCacheTtl: 300, // 5 minutes
};

const repositories = {
  office: new OfficeRepository(repositoryConfig),
  network: new NetworkRepository(repositoryConfig),
  beacon: new BeaconRepository(repositoryConfig),
  nfcTag: new NfcTagRepository(repositoryConfig),
  policy: new PolicyRepository(repositoryConfig),
};
```

### 4. Initialize Services

```typescript
import {
  GeoValidatorService,
  WiFiMatcherService,
  BeaconProximityService,
  NfcVerifierService,
  QrTokenGeneratorService,
  FaceRecognitionService,
  MockFaceRecognitionAdapter,
} from 'attendance-system';

const services = {
  geoValidator: new GeoValidatorService({
    officeRepository: repositories.office,
    defaultDistanceTolerance: 100,
  }),

  wifiMatcher: new WiFiMatcherService({
    networkRepository: repositories.network,
    officeRepository: repositories.office,
  }),

  beaconProximity: new BeaconProximityService({
    beaconRepository: repositories.beacon,
    officeRepository: repositories.office,
    defaultProximityThreshold: 50,
  }),

  nfcVerifier: new NfcVerifierService({
    nfcTagRepository: repositories.nfcTag,
    officeRepository: repositories.office,
  }),

  qrGenerator: new QrTokenGeneratorService({
    secretKey: process.env.QR_SECRET_KEY,
    minTtlSeconds: 30,
    maxTtlSeconds: 60,
  }),

  faceRecognition: new FaceRecognitionService({
    provider: new MockFaceRecognitionAdapter(), // Replace with real provider
    enableLivenessCheck: true,
    confidenceThreshold: 0.8,
    timeout: 10000,
  }),
};
```

## Service Integration

### Geo-Location Validation

```typescript
// Check-in validation
app.post('/api/attendance/check-in', async (req, res) => {
  const { latitude, longitude, officeId } = req.body;

  const result = await services.geoValidator.validateLocation(
    { latitude, longitude },
    officeId
  );

  if (!result.valid) {
    return res.status(400).json({
      error: 'Location validation failed',
      distance: result.distance_meters,
    });
  }

  // Proceed with check-in
  res.json({
    success: true,
    office: result.office_name,
    distance: result.distance_meters,
  });
});
```

### Wi-Fi Verification

```typescript
// Network-based verification
app.post('/api/attendance/verify-network', async (req, res) => {
  const { ssid, bssid } = req.body;

  const result = await services.wifiMatcher.matchNetwork(ssid, bssid);

  if (!result.matched) {
    return res.status(400).json({
      error: 'Network not recognized',
    });
  }

  res.json({
    success: true,
    office: result.office_name,
    network: result.ssid,
  });
});
```

### Beacon Detection

```typescript
// Bluetooth beacon verification
app.post('/api/attendance/verify-beacon', async (req, res) => {
  const { uuid, major, minor, rssi } = req.body;

  const result = await services.beaconProximity.detectBeacon(
    uuid,
    major,
    minor,
    rssi
  );

  if (!result.detected) {
    return res.status(400).json({
      error: 'Beacon not detected',
    });
  }

  res.json({
    success: true,
    office: result.office_name,
    estimatedDistance: result.distance_estimate,
  });
});
```

### NFC Tag Verification

```typescript
// NFC tap verification
app.post('/api/attendance/verify-nfc', async (req, res) => {
  const { tagUid, latitude, longitude } = req.body;

  const result = await services.nfcVerifier.verifyTagWithLocation(
    tagUid,
    { latitude, longitude },
    10 // Max 10 meters from tag
  );

  if (!result.verified) {
    return res.status(400).json({
      error: 'NFC tag verification failed',
      reason: result.location_valid === false ? 'Too far from tag' : 'Tag not found',
    });
  }

  res.json({
    success: true,
    office: result.office_name,
    tag: result.tag_uid,
  });
});
```

### QR Code Generation & Validation

```typescript
// Generate dynamic QR code
app.post('/api/qr/generate', async (req, res) => {
  const { officeId, userId } = req.body;

  const token = services.qrGenerator.generateDynamicToken(officeId, userId);

  res.json({
    token: token.token,
    expiresAt: token.expires_at,
    ttl: services.qrGenerator.getRemainingTtl(token.token),
  });
});

// Validate QR code
app.post('/api/qr/validate', async (req, res) => {
  const { token } = req.body;

  const validation = services.qrGenerator.validateToken(token);

  if (!validation.valid) {
    return res.status(400).json({
      error: validation.expired ? 'Token expired' : 'Invalid token',
    });
  }

  res.json({
    success: true,
    officeId: validation.office_id,
    userId: validation.user_id,
  });
});
```

### Face Recognition

```typescript
// Enroll user's face
app.post('/api/face/enroll', async (req, res) => {
  const { userId, imageData } = req.body;

  const result = await services.faceRecognition.enrollFace(
    userId,
    Buffer.from(imageData, 'base64')
  );

  if (!result.success) {
    return res.status(400).json({
      error: result.error,
    });
  }

  res.json({
    success: true,
    faceId: result.face_id,
  });
});

// Verify face with liveness
app.post('/api/face/verify', async (req, res) => {
  const { imageData } = req.body;

  const result = await services.faceRecognition.recognizeWithLiveness(
    Buffer.from(imageData, 'base64')
  );

  if (!result.recognized) {
    return res.status(400).json({
      error: result.error,
      liveness: result.liveness,
    });
  }

  res.json({
    success: true,
    userId: result.user_id,
    confidence: result.confidence,
    liveness: result.liveness,
  });
});
```

### Combined Multi-Factor Verification

```typescript
// Multi-factor presence verification
app.post('/api/attendance/verify-presence', async (req, res) => {
  const {
    latitude,
    longitude,
    officeId,
    ssid,
    bssid,
    beaconData,
    nfcTagUid,
    qrToken,
    faceImage,
  } = req.body;

  // Get applicable policy
  const policy = await repositories.policy.findApplicablePolicy(officeId);

  if (!policy) {
    return res.status(400).json({ error: 'No policy found for office' });
  }

  const verification = {
    geo: null,
    wifi: null,
    beacon: null,
    nfc: null,
    qr: null,
    face: null,
  };

  // Check each required factor
  if (policy.require_geofence) {
    verification.geo = await services.geoValidator.validateLocation(
      { latitude, longitude },
      officeId,
      policy.max_checkin_distance_meters
    );

    if (!verification.geo.valid) {
      return res.status(400).json({
        error: 'Geofence validation failed',
        verification,
      });
    }
  }

  if (policy.require_network_validation && ssid) {
    verification.wifi = await services.wifiMatcher.matchNetwork(ssid, bssid);

    if (!verification.wifi.matched) {
      return res.status(400).json({
        error: 'Network validation failed',
        verification,
      });
    }
  }

  if (policy.require_beacon_proximity && beaconData) {
    verification.beacon = await services.beaconProximity.detectBeacon(
      beaconData.uuid,
      beaconData.major,
      beaconData.minor,
      beaconData.rssi
    );

    if (!verification.beacon.detected) {
      return res.status(400).json({
        error: 'Beacon verification failed',
        verification,
      });
    }
  }

  if (policy.require_nfc_tap && nfcTagUid) {
    verification.nfc = await services.nfcVerifier.verifyTag(nfcTagUid);

    if (!verification.nfc.verified) {
      return res.status(400).json({
        error: 'NFC verification failed',
        verification,
      });
    }
  }

  // Optional QR verification
  if (qrToken) {
    verification.qr = services.qrGenerator.validateToken(qrToken);
  }

  // Optional face verification
  if (faceImage) {
    verification.face = await services.faceRecognition.recognizeFace(
      Buffer.from(faceImage, 'base64')
    );
  }

  res.json({
    success: true,
    verification,
    policy: policy.name,
  });
});
```

## Production Considerations

### 1. Replace Mock Face Recognition

```typescript
// Implement a real provider (example with AWS Rekognition)
import AWS from 'aws-sdk';
import { FaceRecognitionProvider } from 'attendance-system';

class AWSRekognitionAdapter implements FaceRecognitionProvider {
  private rekognition: AWS.Rekognition;
  private collectionId: string;

  constructor(collectionId: string) {
    this.rekognition = new AWS.Rekognition();
    this.collectionId = collectionId;
  }

  async recognizeFace(imageData: Buffer | string) {
    // Implementation using AWS Rekognition
  }

  async detectLiveness(imageData: Buffer | string) {
    // Implementation using AWS Rekognition
  }

  async enrollFace(userId: string, imageData: Buffer | string) {
    // Implementation using AWS Rekognition
  }

  async deleteFace(userId: string) {
    // Implementation using AWS Rekognition
  }
}

// Use in service
const faceService = new FaceRecognitionService({
  provider: new AWSRekognitionAdapter('attendance-collection'),
  enableLivenessCheck: true,
});
```

### 2. Use Distributed Caching

```typescript
import Redis from 'ioredis';
import { CacheProvider } from 'attendance-system';

class RedisCache implements CacheProvider {
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const data = JSON.stringify(value);
    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, data);
    } else {
      await this.redis.set(key, data);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async clear(): Promise<void> {
    await this.redis.flushdb();
  }
}

// Use in repositories
const cache = new RedisCache(new Redis(process.env.REDIS_URL));
```

### 3. Add Monitoring & Logging

```typescript
import { GeoValidatorService } from 'attendance-system';

class MonitoredGeoValidator extends GeoValidatorService {
  async validateLocation(...args) {
    const startTime = Date.now();
    
    try {
      const result = await super.validateLocation(...args);
      
      console.log({
        service: 'geo-validator',
        duration: Date.now() - startTime,
        result: result.valid,
      });
      
      return result;
    } catch (error) {
      console.error({
        service: 'geo-validator',
        duration: Date.now() - startTime,
        error: error.message,
      });
      
      throw error;
    }
  }
}
```

### 4. Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// Rate limit face recognition endpoints
const faceRecognitionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: 'Too many face recognition attempts',
});

app.post('/api/face/verify', faceRecognitionLimiter, async (req, res) => {
  // Handle face verification
});
```

## Testing

### Unit Tests

```typescript
import { MockFaceRecognitionAdapter } from 'attendance-system';

describe('Face Recognition', () => {
  it('should recognize enrolled face', async () => {
    const adapter = new MockFaceRecognitionAdapter({
      successRate: 1.0,
      simulateDelay: false,
    });

    await adapter.enrollFace('test-user', 'image-data');
    const result = await adapter.recognizeFace('image-data');

    expect(result.recognized).toBe(true);
    expect(result.user_id).toBe('test-user');
  });
});
```

### Integration Tests

```typescript
import { Pool } from 'pg';
import { OfficeRepository, GeoValidatorService } from 'attendance-system';

describe('Geo Validation Integration', () => {
  let pool: Pool;
  let service: GeoValidatorService;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const officeRepo = new OfficeRepository({ pool });
    service = new GeoValidatorService({ officeRepository: officeRepo });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should validate location within office boundary', async () => {
    // Test implementation
  });
});
```

## Troubleshooting

### Issue: "PostGIS extension not found"

**Solution**: Enable PostGIS extension
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### Issue: "Cache errors"

**Solution**: Cache errors are non-fatal. The system will work without cache but may be slower.

### Issue: "QR tokens expire too quickly"

**Solution**: Adjust TTL configuration
```typescript
const qrGenerator = new QrTokenGeneratorService({
  secretKey: process.env.QR_SECRET_KEY,
  minTtlSeconds: 45,  // Increase minimum
  maxTtlSeconds: 90,  // Increase maximum
});
```

### Issue: "Face recognition timeouts"

**Solution**: Increase timeout
```typescript
const faceService = new FaceRecognitionService({
  provider: myProvider,
  timeout: 30000, // 30 seconds
});
```

### Issue: "Invalid coordinates"

**Solution**: Ensure longitude comes before latitude in PostGIS
```typescript
// Correct
{ latitude: 37.7749, longitude: -122.4194 }

// Coordinates are handled correctly by services
```

## Support

For additional help:
- Check [src/README.md](../src/README.md) for API documentation
- Review [examples/usage-example.ts](../examples/usage-example.ts)
- See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for common patterns

## License

MIT
