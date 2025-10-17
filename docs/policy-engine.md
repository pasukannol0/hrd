# Policy Engine Module

The Policy Engine module provides a flexible, configurable system for defining, evaluating, and managing office-level attendance policies with multiple presence verification factors.

## Features

- **JSON Schema Validation**: Zod-based schema validation for policy definitions
- **Redis-Backed ETag Caching**: HTTP ETag/If-None-Match semantics with Redis caching
- **Policy Evaluator**: Returns accepted|review|rejected decisions with rationale metadata
- **Admin API**: Versioned policy CRUD operations with full audit trail
- **Multi-Factor Support**: Supports geofence, WiFi, Beacon, NFC, QR, and Face recognition factors

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Policy Engine                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │  PolicyAdmin     │    │  PolicyLoader    │               │
│  │  Service         │    │  Middleware      │               │
│  │  (CRUD + Audit)  │───▶│  (ETag Cache)    │               │
│  └──────────────────┘    └──────────────────┘               │
│           │                       │                          │
│           │                       ▼                          │
│           │              ┌──────────────────┐               │
│           │              │  RedisCache      │               │
│           │              │  (ETag Support)  │               │
│           │              └──────────────────┘               │
│           ▼                                                  │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │  Database        │    │  PolicyEvaluator │               │
│  │  (PostgreSQL)    │    │  Service         │               │
│  └──────────────────┘    └──────────────────┘               │
│           │                       │                          │
│           │                       ▼                          │
│           │              ┌──────────────────┐               │
│           └─────────────▶│  Factor Services │               │
│                          │  (Geo, WiFi,     │               │
│                          │   Beacon, NFC,   │               │
│                          │   QR, Face)      │               │
│                          └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## Policy Schema

Policies are defined using Zod schemas with the following structure:

```typescript
{
  id: string (UUID),
  name: string,
  description?: string,
  office_id?: string (UUID) | null,  // null = global policy
  version: number,
  is_active: boolean,
  priority: number,  // Higher priority = preferred
  
  required_factors: {
    min_factors: number,  // Minimum factors that must pass
    presence_modes: [
      {
        mode: 'geofence' | 'wifi' | 'beacon' | 'nfc' | 'qr' | 'face',
        required: boolean,
        weight: number (0-1)
      }
    ],
    allow_fallback: boolean  // Allow review if some factors pass
  },
  
  geo_distance?: {
    max_distance_meters: number (0-10000),
    strict_boundary_check: boolean
  },
  
  liveness_config?: {
    enabled: boolean,
    min_confidence: number (0-1),
    require_blink: boolean,
    require_head_movement: boolean
  },
  
  working_hours_start: string,  // Format: "HH:MM"
  working_hours_end: string,    // Format: "HH:MM"
  working_days: number[],        // 0=Sunday, 6=Saturday
  
  late_threshold_minutes: number,
  early_departure_threshold_minutes: number,
  
  created_at: Date,
  updated_at: Date,
  created_by?: string (UUID),
  updated_by?: string (UUID)
}
```

## Components

### 1. PolicyLoaderMiddleware

Loads policies with Redis-backed ETag caching and cache invalidation hooks.

**Features:**
- ETag generation based on policy content hash
- If-None-Match header support for 304 Not Modified responses
- Automatic cache invalidation on policy updates
- Configurable TTL (default: 300 seconds)
- Custom invalidation hooks

**Methods:**

```typescript
// Load policy by ID with optional ETag check
async loadPolicy(policyId: string, ifNoneMatch?: string): Promise<PolicyLoadResult>

// Load applicable policy for an office
async loadPolicyByOffice(officeId: string, ifNoneMatch?: string): Promise<PolicyLoadResult>

// Invalidate cached policy
async invalidatePolicy(policyId: string, officeId?: string): Promise<void>

// Invalidate all policies for an office
async invalidateOfficePolicy(officeId: string): Promise<void>

// Validate policy data against schema
validatePolicySchema(data: unknown): PolicyValidationResult

// Register custom invalidation hook
registerInvalidationHook(hook: InvalidationHook): void
```

**Usage:**

```typescript
const policyLoader = new PolicyLoaderMiddleware({
  cache: redisCache,
  pool: pgPool,
  defaultTtlSeconds: 300,
});

// Load policy with ETag support
const result = await policyLoader.loadPolicy(policyId, ifNoneMatch);

if (!result.modified) {
  // Return 304 Not Modified
  return { status: 304 };
}

// Use result.policy and result.etag
```

### 2. PolicyEvaluatorService

Evaluates check-in attempts against policy rules using multiple presence factors.

**Features:**
- Multi-factor evaluation (geofence, WiFi, beacon, NFC, QR, face)
- Working hours validation
- Late/early departure detection
- Confidence scoring per factor
- Detailed rationale generation
- Performance metrics

**Methods:**

```typescript
async evaluatePolicy(
  policy: OfficePolicy,
  context: PolicyEvaluationContext
): Promise<PolicyEvaluationResult>
```

**Evaluation Context:**

```typescript
interface PolicyEvaluationContext {
  user_id: string;
  office_id?: string;
  timestamp: Date;
  
  location?: {
    latitude: number;
    longitude: number;
  };
  
  wifi?: {
    ssid?: string;
    bssid?: string;
  };
  
  beacon?: {
    uuid: string;
    major: number;
    minor: number;
    rssi?: number;
  };
  
  nfc?: {
    tag_uid: string;
  };
  
  qr?: {
    token: string;
  };
  
  face?: {
    image_data: Buffer | string;
  };
}
```

**Evaluation Result:**

```typescript
interface PolicyEvaluationResult {
  decision: 'accepted' | 'review' | 'rejected';
  policy_id: string;
  policy_version: number;
  factors_evaluated: FactorEvaluationResult[];
  factors_passed: number;
  factors_required: number;
  rationale: string;
  metadata: {
    evaluation_time_ms: number;
    timestamp: Date;
    office_id?: string;
    working_hours_check?: {
      is_working_hours: boolean;
      is_late: boolean;
      is_early_departure: boolean;
    };
  };
}
```

**Decision Logic:**

1. **ACCEPTED**: All required factors pass AND within working hours AND not late
2. **REVIEW**: Some factors pass OR late arrival OR outside working hours
3. **REJECTED**: Insufficient factors pass AND no fallback allowed

**Usage:**

```typescript
const evaluator = new PolicyEvaluatorService({
  geoValidator,
  wifiMatcher,
  beaconProximity,
  nfcVerifier,
  qrTokenGenerator,
  faceRecognition,
});

const result = await evaluator.evaluatePolicy(policy, context);

switch (result.decision) {
  case 'accepted':
    // Automatically approve check-in
    break;
  case 'review':
    // Flag for manual review
    break;
  case 'rejected':
    // Reject check-in
    break;
}
```

### 3. PolicyAdminService

Provides CRUD operations for policies with versioning and audit logging.

**Features:**
- Transactional policy updates
- Automatic version incrementing
- Comprehensive audit trail
- Change tracking
- Policy activation/deactivation

**Methods:**

```typescript
// Create new policy
async createPolicy(input: CreatePolicyInput): Promise<OfficePolicy>

// Update existing policy (increments version)
async updatePolicy(policyId: string, input: UpdatePolicyInput): Promise<OfficePolicy>

// Delete policy
async deletePolicy(policyId: string, performedBy: string, reason?: string): Promise<void>

// Activate/deactivate policy
async activatePolicy(policyId: string, performedBy: string): Promise<OfficePolicy>
async deactivatePolicy(policyId: string, performedBy: string): Promise<OfficePolicy>

// Retrieve policies
async getPolicyById(policyId: string): Promise<OfficePolicy | null>
async listPolicies(options: PolicyListOptions): Promise<OfficePolicy[]>

// Audit trail
async getPolicyHistory(policyId: string): Promise<PolicyAuditLog[]>
async getAuditLogs(options: AuditLogOptions): Promise<PolicyAuditLog[]>
```

**Usage:**

```typescript
const policyAdmin = new PolicyAdminService({
  pool: pgPool,
  policyLoader,
});

// Create policy
const policy = await policyAdmin.createPolicy({
  name: 'High Security Policy',
  office_id: 'office-123',
  required_factors: {
    min_factors: 2,
    presence_modes: [
      { mode: 'geofence', required: true, weight: 1.0 },
      { mode: 'face', required: true, weight: 1.0 },
    ],
    allow_fallback: false,
  },
  working_hours_start: '09:00',
  working_hours_end: '17:00',
  working_days: [1, 2, 3, 4, 5],
  created_by: 'admin-user-id',
});

// Update policy
await policyAdmin.updatePolicy(policy.id, {
  late_threshold_minutes: 20,
  updated_by: 'admin-user-id',
  reason: 'Increased flexibility',
});

// View history
const history = await policyAdmin.getPolicyHistory(policy.id);
```

### 4. RedisCache with ETag Support

Extended Redis cache provider with ETag generation and validation.

**Features:**
- SHA-256 based ETag generation
- Atomic get/set with ETag
- Connection pooling and retry
- Key prefix support
- TTL management

**Methods:**

```typescript
async get<T>(key: string): Promise<T | null>
async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
async delete(key: string): Promise<void>
async clear(): Promise<void>

// ETag-specific methods
async getWithETag<T>(key: string): Promise<{ value: T; etag: string } | null>
async setWithETag<T>(key: string, value: T, ttlSeconds?: number): Promise<string>
```

**Usage:**

```typescript
const redisCache = new RedisCache({
  host: 'localhost',
  port: 6379,
  password: 'redis-password',
  keyPrefix: 'attendance:policy:',
});

// Get with ETag
const cached = await redisCache.getWithETag('policy:123');
if (cached && cached.etag === clientETag) {
  // Return 304 Not Modified
}

// Set with ETag generation
const etag = await redisCache.setWithETag('policy:123', policyData, 300);
```

## Database Schema

### office_policies Table

```sql
CREATE TABLE office_policies (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  office_id UUID REFERENCES offices(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  required_factors JSONB NOT NULL,
  geo_distance JSONB,
  liveness_config JSONB,
  working_hours_start VARCHAR(5) NOT NULL,
  working_hours_end VARCHAR(5) NOT NULL,
  working_days INTEGER[] NOT NULL,
  late_threshold_minutes INTEGER NOT NULL DEFAULT 15,
  early_departure_threshold_minutes INTEGER NOT NULL DEFAULT 15,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

CREATE INDEX idx_office_policies_office_id ON office_policies(office_id);
CREATE INDEX idx_office_policies_is_active ON office_policies(is_active);
CREATE INDEX idx_office_policies_composite ON office_policies(office_id, is_active, priority);
```

### policy_audit_logs Table

```sql
CREATE TABLE policy_audit_logs (
  id UUID PRIMARY KEY,
  policy_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  version INTEGER NOT NULL,
  previous_version INTEGER,
  changes JSONB,
  performed_by UUID NOT NULL,
  performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reason TEXT
);

CREATE INDEX idx_policy_audit_logs_policy_id ON policy_audit_logs(policy_id);
CREATE INDEX idx_policy_audit_logs_performed_by ON policy_audit_logs(performed_by);
CREATE INDEX idx_policy_audit_logs_performed_at ON policy_audit_logs(performed_at);
CREATE INDEX idx_policy_audit_logs_action ON policy_audit_logs(action);
```

## HTTP Middleware Integration

Example Express.js integration:

```typescript
import express from 'express';
import { PolicyLoaderMiddleware, PolicyEvaluatorService } from './services';

const app = express();

// GET /api/policies/:id - Load policy with ETag support
app.get('/api/policies/:id', async (req, res) => {
  const policyId = req.params.id;
  const ifNoneMatch = req.headers['if-none-match'];

  const result = await policyLoader.loadPolicy(policyId, ifNoneMatch);

  if (!result.modified) {
    return res.status(304).end();
  }

  if (!result.policy) {
    return res.status(404).json({ error: 'Policy not found' });
  }

  res.setHeader('ETag', result.etag);
  res.setHeader('Cache-Control', 'max-age=300');
  return res.json(result.policy);
});

// POST /api/check-in/evaluate - Evaluate check-in
app.post('/api/check-in/evaluate', async (req, res) => {
  const { office_id, context } = req.body;

  const policyResult = await policyLoader.loadPolicyByOffice(office_id);
  if (!policyResult.policy) {
    return res.status(404).json({ error: 'No policy found' });
  }

  const evaluation = await policyEvaluator.evaluatePolicy(
    policyResult.policy,
    context
  );

  return res.json(evaluation);
});
```

## Configuration

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/attendance

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis-password

# Policy Engine
POLICY_CACHE_TTL=300
```

## Performance Considerations

1. **Caching Strategy**:
   - Policies are cached in Redis with 5-minute TTL by default
   - ETag-based conditional requests reduce bandwidth
   - Automatic cache invalidation on updates

2. **Database Optimization**:
   - Composite indexes on (office_id, is_active, priority)
   - JSONB indexes for policy configuration queries
   - Prepared statements for frequent queries

3. **Evaluation Performance**:
   - Factor services run in parallel when possible
   - Lazy evaluation (skips factors not in context)
   - Typical evaluation time: 50-200ms

## Security Considerations

1. **Policy Validation**: All policies validated against Zod schema before storage
2. **Audit Trail**: All changes logged with user attribution
3. **Cache Invalidation**: Automatic invalidation prevents stale policy enforcement
4. **Version Control**: Policies are versioned to prevent concurrent modification issues

## Testing

See `examples/policy-engine-usage.ts` for comprehensive usage examples.

## Migration

Run the migration to create required tables:

```bash
npm run migrate:up
```

## License

MIT
