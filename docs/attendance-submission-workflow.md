# Attendance Submission Workflow

This document describes the complete attendance submission workflow with presence validators, policy evaluation, integrity checks, motion guard, rate limiting, device binding, cryptographic signatures, audit logs, and Prometheus metrics.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Attendance Submission Service                     │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Rate Limiter │→ │Device Binding│→ │Motion Guard  │              │
│  │  (Redis)     │  │  (PostgreSQL)│  │(Speed/Teleport│              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│           ↓                                   ↓                       │
│  ┌──────────────────────────────────────────────────┐               │
│  │          Policy Evaluation Engine                 │               │
│  │  • Geofence • WiFi • Beacon • NFC • QR • Face   │               │
│  └──────────────────────────────────────────────────┘               │
│           ↓                                   ↓                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Integrity   │  │ Cryptographic│  │  Attendance  │              │
│  │  Verdict     │→ │  Signature   │→ │  Persistence │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│           ↓                                   ↓                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Audit Logs  │  │   Metrics    │  │    Alerts    │              │
│  │ (PostgreSQL) │  │ (Prometheus) │  │  (Webhook)   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

## Workflow Steps

### 1. Rate Limiting (Redis-based)

**Configuration:**
- Maximum: 12 requests per minute per user
- Window: Sliding 60-second window
- Storage: Redis sorted sets with automatic cleanup

**Implementation:**
```typescript
const rateLimiter = new RateLimiterService({
  redis,
  maxRequestsPerWindow: 12,
  windowSeconds: 60,
  keyPrefix: 'rate_limit:',
});
```

**Behavior:**
- Tracks request timestamps in Redis
- Removes expired entries automatically
- Returns remaining quota and reset time
- Blocks requests when limit exceeded
- Emits Prometheus counter: `rate_limit_blocks_total`

### 2. Device Binding Enforcement

**Configuration:**
- Require trusted device: Yes/No
- Minimum trust score: 0.0 - 1.0
- Storage: PostgreSQL devices table

**Trust Score Calculation:**
```typescript
Base Score:
  - Trusted device: 1.0
  - Untrusted device: 0.5

Adjustments:
  - Device age > 30 days: +0.1
  - Last used > 90 days ago: -0.2
```

**Behavior:**
- Verifies device exists and belongs to user
- Checks `is_trusted` flag
- Calculates trust score
- Updates `last_used_at` timestamp
- Emits Prometheus counter: `device_trust_failures_total`

### 3. Motion Guard (Teleport/Speed Detection)

**Configuration:**
- Max speed: 8 m/s (≈29 km/h, ≈18 mph)
- Teleport threshold: 1000 meters
- Minimum time delta: 1 second

**Detection Algorithm:**
```typescript
1. Fetch last check-in location for user
2. Calculate distance using Haversine formula
3. Calculate time delta between locations
4. Compute speed = distance / time_delta
5. Check violations:
   - Teleport: distance > 1000m
   - Speed: speed > 8 m/s
```

**Behavior:**
- Compares current location with last attendance
- Detects unrealistic movement patterns
- Allows first-time check-ins (no previous location)
- Emits Prometheus counter: `motion_guard_violations_total`
- Changes decision from ACCEPTED to REVIEW if violated

### 4. Policy Evaluation

**Multi-Factor Authentication:**
- Geofence validation (GPS + PostGIS)
- WiFi network matching (SSID/BSSID)
- Bluetooth beacon proximity (iBeacon + RSSI)
- NFC tag verification (UID)
- QR code validation (HMAC + TTL)
- Face recognition with liveness detection

**Policy Loading:**
```typescript
const policyLoader = new PolicyLoaderMiddleware({
  pool,
  cache: redisCache,
  cacheTtlSeconds: 300, // 5 minutes
});
```

**Evaluation Context:**
```typescript
const context: PolicyEvaluationContext = {
  user_id: string,
  office_id: string,
  timestamp: Date,
  location: { latitude, longitude },
  wifi: { ssid, bssid },
  beacon: { uuid, major, minor, rssi },
  nfc: { tag_uid },
  qr: { token },
  face: { image_data },
};
```

**Decisions:**
- `ACCEPTED`: All requirements met, on time
- `REVIEW`: Requirements met but late, or partial factors
- `REJECTED`: Insufficient factors, outside hours, or failed checks

### 5. Integrity Verdict Generation

**Structure:**
```typescript
interface IntegrityVerdict {
  policy_evaluation: PolicyEvaluationResult;
  motion_guard: MotionGuardResult;
  device_trust: DeviceTrustResult;
  rate_limit: RateLimitResult;
  overall_score: number; // 0.0 - 1.0
  timestamp: Date;
  version: string;
}
```

**Overall Score Calculation:**
```typescript
Weights:
  - Policy evaluation: 50%
  - Motion guard: 20%
  - Device trust: 20%
  - Rate limit: 10%

Policy Score:
  - ACCEPTED: 1.0
  - REVIEW: 0.5
  - REJECTED: 0.0
```

**Storage:**
- Stored as JSONB in `attendance.integrity_verdict` column
- Indexed with GIN for fast queries
- Immutable after creation

### 6. Cryptographic Signature

**Algorithm:**
- HMAC-SHA256
- Secret key from environment variable
- Signs critical attendance data

**Signed Payload:**
```typescript
{
  user_id: string,
  device_id: string,
  office_id: string,
  timestamp: ISO8601,
  location: { latitude, longitude },
  integrity_score: number
}
```

**Storage:**
- Check-in signature: `attendance.signature_check_in`
- Check-out signature: `attendance.signature_check_out`
- Both stored as hex strings

**Verification:**
```typescript
const isValid = signatureService.verifySignature(signature, data);
```

### 7. Attendance Persistence

**Database Table:** `attendance`

**Key Fields:**
```sql
id                  UUID PRIMARY KEY
user_id             UUID NOT NULL
device_id           UUID NOT NULL
office_id           UUID NOT NULL
policy_set_id       UUID
check_in_time       TIMESTAMPTZ NOT NULL
check_in_location   GEOGRAPHY(Point, 4326) NOT NULL
check_in_method     VARCHAR(50) NOT NULL
status              VARCHAR(50) NOT NULL
integrity_verdict   JSONB NOT NULL
signature_check_in  TEXT
```

**Status Values:**
- `present`: On-time attendance
- `late`: Late arrival
- `early_departure`: Left early
- `review`: Requires manual review
- `absent`: Marked absent

**PostGIS Integration:**
- Locations stored as `GEOGRAPHY(Point, 4326)`
- GIST indexes for spatial queries
- Haversine distance calculations

### 8. Audit Logging

**Audit Log Table:** `audit_logs`

**Logged Events:**
- Attendance submissions (all)
- Rate limit blocks
- Device trust failures
- Motion guard violations
- Policy decisions

**Fields:**
```sql
user_id       UUID
action        VARCHAR(100)
entity_type   VARCHAR(50)
entity_id     VARCHAR(255)
old_values    JSONB
new_values    JSONB
ip_address    VARCHAR(45)
user_agent    TEXT
metadata      JSONB
created_at    TIMESTAMPTZ
```

**Usage:**
```typescript
await auditLog.logAttendanceSubmission({
  user_id: '...',
  attendance_id: '...',
  decision: 'accepted',
  integrity_verdict: {...},
  ip_address: '192.168.1.100',
  user_agent: 'AttendanceApp/1.0',
});
```

### 9. Prometheus Metrics

**Counters:**
```
attendance_submissions_total
attendance_submissions_accepted
attendance_submissions_rejected
attendance_submissions_review
rate_limit_blocks_total
motion_guard_violations_total
device_trust_failures_total
```

**Export Format:**
```
# HELP attendance_submissions_total Total number of attendance submissions
# TYPE attendance_submissions_total counter
attendance_submissions_total 1234

# HELP attendance_submissions_accepted Number of accepted submissions
# TYPE attendance_submissions_accepted counter
attendance_submissions_accepted 987
```

**HTTP Endpoint:**
```typescript
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metricsService.exportPrometheusFormat());
});
```

### 10. Alerts

**Alert Hooks:**
```typescript
const alertOnReview = async (data: {
  user_id: string;
  attendance_id: string;
  rationale: string;
  motion_guard_passed: boolean;
  timestamp: Date;
}) => {
  // Send webhook, email, SMS, etc.
  await fetch('https://alerts.example.com/review', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

const alertOnRejection = async (data: {
  user_id: string;
  rationale: string;
  timestamp: Date;
}) => {
  // Send webhook, email, SMS, etc.
  await fetch('https://alerts.example.com/rejection', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};
```

**Use Cases:**
- Notify managers of attendance requiring review
- Alert security on motion guard violations
- Inform users of rejected submissions
- Escalate repeated failures

## Complete Usage Example

```typescript
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
} from 'attendance-system';

// Initialize dependencies
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis({ host: 'localhost', port: 6379 });

// Create services
const policyLoader = new PolicyLoaderMiddleware({ pool, cache, cacheTtlSeconds: 300 });
const policyEvaluator = new PolicyEvaluatorService({ /* validators */ });
const motionGuard = new MotionGuardService({ maxSpeedMps: 8 });
const rateLimiter = new RateLimiterService({ redis, maxRequestsPerWindow: 12 });
const deviceBinding = new DeviceBindingService({ pool, requireTrustedDevice: true });
const signature = new SignatureService({ secretKey: process.env.SECRET_KEY });
const metrics = new MetricsService({ enabled: true });
const auditLog = new AuditLogService({ pool });

// Initialize attendance service
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

// Submit attendance
const result = await attendanceService.submitAttendance({
  user_id: '550e8400-e29b-41d4-a716-446655440001',
  device_id: '550e8400-e29b-41d4-a716-446655440002',
  office_id: '550e8400-e29b-41d4-a716-446655440003',
  timestamp: new Date(),
  location: { latitude: 37.7749, longitude: -122.4194 },
  wifi: { ssid: 'CompanyWiFi', bssid: '00:11:22:33:44:55' },
  check_in_method: 'gps_wifi',
}, {
  ip_address: '192.168.1.100',
  user_agent: 'AttendanceApp/1.0',
});

console.log(`Decision: ${result.decision}`);
console.log(`Attendance ID: ${result.attendance_id}`);
console.log(`Signature: ${result.signature}`);
```

## Error Handling

**Error Types:**
- `RATE_LIMIT_EXCEEDED`: User has exceeded 12 requests/minute
- `DEVICE_TRUST_FAILED`: Device is not trusted
- `NO_POLICY_FOUND`: No active policy for office
- Generic errors: Database, Redis, network failures

**Response Structure:**
```typescript
{
  success: false,
  decision: 'rejected',
  rationale: 'Error description',
  integrity_verdict: { /* partial data */ },
  metadata: { submission_time_ms, timestamp },
  error: 'ERROR_CODE',
}
```

**Graceful Degradation:**
- Redis failures: Allow request, log warning
- Motion guard: Continue with warning if no last location
- Audit log failures: Continue, log error

## Monitoring

**Key Metrics to Monitor:**
1. Acceptance rate: `accepted / total`
2. Rejection rate: `rejected / total`
3. Review rate: `review / total`
4. Rate limit blocks: Trending up indicates abuse
5. Motion guard violations: Potential GPS spoofing
6. Device trust failures: Untrusted device usage
7. Submission latency: `submission_time_ms`

**Alerting Thresholds:**
- Rejection rate > 10%: Investigate policy issues
- Motion violations > 5%: Possible GPS spoofing
- Rate limit blocks > 50/hour/user: Potential abuse
- Average latency > 2000ms: Performance degradation

## Security Considerations

1. **Rate Limiting**: Prevents brute force and abuse
2. **Device Binding**: Ensures only trusted devices
3. **Motion Guard**: Detects GPS spoofing and teleportation
4. **Cryptographic Signatures**: Prevents tampering
5. **Audit Logs**: Complete traceability
6. **Policy Evaluation**: Multi-factor authentication
7. **Redis Security**: Use password, TLS in production
8. **Secret Key Management**: Rotate keys periodically

## Performance Optimization

1. **Redis Caching**: Policy data cached for 5 minutes
2. **Connection Pooling**: PostgreSQL pool with reuse
3. **Lazy Evaluation**: Skip unavailable presence factors
4. **Batch Operations**: Minimal database round-trips
5. **Async/Await**: Non-blocking I/O throughout
6. **PostGIS Indexes**: GIST indexes on geography columns
7. **JSONB Indexes**: GIN indexes on integrity_verdict

## Production Deployment

**Environment Variables:**
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/attendance
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
SIGNATURE_SECRET_KEY=your-signature-secret-key
QR_SECRET_KEY=your-qr-secret-key
```

**Database Setup:**
```bash
npm run migrate:up
```

**Health Checks:**
```typescript
// Check Redis connectivity
await redis.ping();

// Check PostgreSQL connectivity
await pool.query('SELECT 1');

// Check rate limiter
const info = await rateLimiter.getRateLimitInfo(userId);
```

**Scaling Considerations:**
- Use Redis Cluster for high availability
- PostgreSQL read replicas for reporting queries
- Horizontal scaling with stateless services
- CDN for static assets (face images, QR codes)

## License

MIT
