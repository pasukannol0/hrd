# Policy Engine Module

Comprehensive policy management system with ETag caching, multi-factor evaluation, and audit trail.

## Quick Start

```typescript
import { Pool } from 'pg';
import {
  RedisCache,
  PolicyLoaderMiddleware,
  PolicyEvaluatorService,
  PolicyAdminService,
} from './src';

// Initialize components
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redisCache = new RedisCache({ host: 'localhost', port: 6379 });

const policyLoader = new PolicyLoaderMiddleware({ cache: redisCache, pool });
const policyEvaluator = new PolicyEvaluatorService({ /* services */ });
const policyAdmin = new PolicyAdminService({ pool, policyLoader });

// Create a policy
const policy = await policyAdmin.createPolicy({
  name: 'Office Policy',
  office_id: 'office-123',
  required_factors: {
    min_factors: 2,
    presence_modes: [
      { mode: 'geofence', required: true, weight: 1.0 },
      { mode: 'face', required: true, weight: 1.0 },
    ],
    allow_fallback: true,
  },
  working_hours_start: '09:00',
  working_hours_end: '17:00',
  working_days: [1, 2, 3, 4, 5],
  created_by: 'admin-user-id',
});

// Load policy with ETag caching
const result = await policyLoader.loadPolicy(policy.id);

// Evaluate check-in
const evaluation = await policyEvaluator.evaluatePolicy(policy, context);
console.log(evaluation.decision); // 'accepted' | 'review' | 'rejected'
```

## Components

### 1. PolicyLoaderMiddleware
- Redis-backed ETag caching
- HTTP 304 Not Modified support
- Cache invalidation hooks

### 2. PolicyEvaluatorService
- Multi-factor evaluation (geofence, WiFi, beacon, NFC, QR, face)
- Returns accepted/review/rejected with rationale
- Working hours and late detection

### 3. PolicyAdminService
- Versioned CRUD operations
- Full audit trail
- Policy activation/deactivation

### 4. RedisCache
- ETag generation and validation
- Connection pooling
- Automatic retry logic

## Policy Schema

```typescript
{
  id: string,
  name: string,
  office_id?: string,  // null = global policy
  version: number,
  priority: number,
  
  required_factors: {
    min_factors: number,
    presence_modes: [
      { mode: PresenceMode, required: boolean, weight: number }
    ],
    allow_fallback: boolean
  },
  
  geo_distance?: {
    max_distance_meters: number,
    strict_boundary_check: boolean
  },
  
  liveness_config?: {
    enabled: boolean,
    min_confidence: number,
    require_blink: boolean,
    require_head_movement: boolean
  },
  
  working_hours_start: string,  // "HH:MM"
  working_hours_end: string,
  working_days: number[],  // 0=Sunday, 6=Saturday
  
  late_threshold_minutes: number,
  early_departure_threshold_minutes: number
}
```

## Presence Modes

- **geofence**: GPS location within office boundary
- **wifi**: Connected to office WiFi network
- **beacon**: Near office Bluetooth beacon
- **nfc**: NFC tag scan
- **qr**: QR code scan
- **face**: Face recognition with liveness

## Evaluation Context

```typescript
interface PolicyEvaluationContext {
  user_id: string;
  office_id?: string;
  timestamp: Date;
  location?: { latitude: number; longitude: number };
  wifi?: { ssid?: string; bssid?: string };
  beacon?: { uuid: string; major: number; minor: number; rssi?: number };
  nfc?: { tag_uid: string };
  qr?: { token: string };
  face?: { image_data: Buffer | string };
}
```

## Decision Logic

**ACCEPTED**: All required factors pass + within working hours + not late

**REVIEW**: Some factors pass OR late arrival OR outside working hours

**REJECTED**: Insufficient factors + no fallback allowed

## Database Migration

```bash
npm run migrate:up
```

Creates:
- `office_policies` table
- `policy_audit_logs` table
- Indexes for performance

## Examples

See:
- `examples/policy-engine-usage.ts` - Comprehensive usage examples
- `docs/policy-engine.md` - Full documentation

## Performance

- Typical evaluation: 50-200ms
- Cache TTL: 300s (configurable)
- ETag-based conditional requests reduce bandwidth
- Automatic cache invalidation

## License

MIT
