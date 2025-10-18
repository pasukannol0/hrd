# Leave Management Module

A comprehensive leave management system with approval workflows, REST API endpoints, audit logging, and notification hooks.

## Features

- **Leave Types**: Support for Indonesian leave types
  - `izin` - Permission leave
  - `cuti` - Vacation/Annual leave
  - `sakit` - Sick leave

- **Status Workflow**: Complete leave lifecycle management
  - `pending` → `approved` (by manager/admin)
  - `pending` → `rejected` (by manager/admin)
  - `pending` → `cancelled` (by employee/manager/admin)
  - `approved` → `cancelled` (by manager/admin only)

- **REST API**: Full REST endpoints with validation
  - Submit leave requests
  - Approve/reject leaves
  - Cancel leaves
  - Query leave history
  - Check overlapping leaves
  - Get leave balance

- **Audit Logging**: Complete audit trail for all state changes
  - Tracks who performed actions
  - Records old and new values
  - Maintains metadata and timestamps

- **Notifications**: Event-driven notification system
  - Placeholder hooks for email/push/SMS
  - Events for all leave actions
  - Extensible hook system

- **Policy Integration**: Attendance anomaly detection respects approved leaves
  - Check if user is on approved leave
  - Exclude leave days from attendance anomalies
  - Support for multi-day leave periods

## Architecture

### Components

```
src/
├── types/
│   └── leave-management.ts        # TypeScript types and enums
├── repositories/
│   └── leave.repository.ts        # Database operations
├── services/
│   ├── audit.service.ts           # Audit logging
│   ├── notification.service.ts    # Event notifications
│   ├── leave-management.service.ts # Business logic
│   └── attendance-anomaly-checker.service.ts # Policy integration
└── api/
    ├── leave-api.ts               # REST endpoints
    └── error-handler.middleware.ts # Error handling
```

## Usage

### 1. Initialize Services

```typescript
import { Pool } from 'pg';
import {
  LeaveRepository,
  AuditService,
  NotificationService,
  LeaveManagementService,
} from 'attendance-system';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const leaveRepository = new LeaveRepository({ pool });
const auditService = new AuditService({ pool });
const notificationService = new NotificationService({
  hooks: {
    onLeaveSubmitted: async (event) => {
      // Send email to manager
      console.log('Leave submitted:', event.leave_id);
    },
    onLeaveApproved: async (event) => {
      // Send email to employee
      console.log('Leave approved:', event.leave_id);
    },
  },
});

const leaveManagementService = new LeaveManagementService({
  leaveRepository,
  auditService,
  notificationService,
});
```

### 2. Submit Leave Request

```typescript
import { LeaveType } from 'attendance-system';

const leave = await leaveManagementService.submitLeave({
  user_id: 'user-uuid-123',
  leave_type: LeaveType.CUTI,
  start_date: new Date('2024-12-25'),
  end_date: new Date('2024-12-27'),
  total_days: 3,
  reason: 'Family vacation',
  attachment_urls: ['https://example.com/documents/leave-form.pdf'],
});
```

### 3. Approve Leave

```typescript
const approvedLeave = await leaveManagementService.approveLeave(
  leave.id,
  { approved_by: 'manager-uuid-456' },
  'manager' // actor role
);
```

### 4. Reject Leave

```typescript
const rejectedLeave = await leaveManagementService.rejectLeave(
  leave.id,
  {
    rejected_by: 'manager-uuid-456',
    rejection_reason: 'Insufficient annual leave balance',
  },
  'manager'
);
```

### 5. Cancel Leave

```typescript
const cancelledLeave = await leaveManagementService.cancelLeave(
  leave.id,
  {
    cancelled_by: 'user-uuid-123',
    cancellation_reason: 'Plans changed',
  },
  'employee'
);
```

### 6. Query Leaves

```typescript
import { LeaveStatus } from 'attendance-system';

// Get user's approved leaves
const userLeaves = await leaveManagementService.getUserLeaves(
  'user-uuid-123',
  LeaveStatus.APPROVED
);

// Query with filters
const leaves = await leaveManagementService.queryLeaves({
  user_id: 'user-uuid-123',
  status: LeaveStatus.PENDING,
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  limit: 50,
  offset: 0,
});
```

### 7. Check Overlap

```typescript
const overlapCheck = await leaveManagementService.checkOverlap(
  'user-uuid-123',
  new Date('2024-12-26'),
  new Date('2024-12-28')
);

if (overlapCheck.has_overlap) {
  console.log('Overlapping leaves:', overlapCheck.overlapping_leaves);
}
```

### 8. Get Leave Balance

```typescript
const balance = await leaveManagementService.getLeaveBalance(
  'user-uuid-123',
  LeaveType.CUTI,
  12, // total allocated days
  2024 // year
);

console.log(`Available: ${balance.available} days`);
```

### 9. Attendance Policy Integration

```typescript
import { AttendanceAnomalyCheckerService } from 'attendance-system';

const anomalyChecker = new AttendanceAnomalyCheckerService({
  leaveManagementService,
});

// Check if absence is excused due to approved leave
const anomalyResult = await anomalyChecker.checkAttendanceAnomaly(
  'user-uuid-123',
  new Date('2024-12-26')
);

if (anomalyResult.is_excused && anomalyResult.excuse_reason === 'approved_leave') {
  console.log('Absence is excused - user has approved leave');
}

// Get all excused absence dates
const leaveDates = await anomalyChecker.getExcusedAbsences(
  'user-uuid-123',
  new Date('2024-12-01'),
  new Date('2024-12-31')
);
```

## REST API

### Setup

```typescript
import express from 'express';
import { createLeaveApi, errorHandler, notFoundHandler } from 'attendance-system';

const app = express();
app.use(express.json());

// Mount leave API
const leaveApi = createLeaveApi({ leaveManagementService });
app.use('/api', leaveApi);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(3000, () => {
  console.log('Leave Management API running on port 3000');
});
```

### Endpoints

#### Submit Leave Request

```http
POST /api/leaves
Content-Type: application/json

{
  "user_id": "user-uuid-123",
  "leave_type": "cuti",
  "start_date": "2024-12-25",
  "end_date": "2024-12-27",
  "total_days": 3,
  "reason": "Family vacation"
}
```

#### Get Leave by ID

```http
GET /api/leaves/:id
```

#### Query Leaves

```http
GET /api/leaves?user_id=user-uuid-123&status=approved&limit=50&offset=0
```

#### Approve Leave

```http
POST /api/leaves/:id/approve
Content-Type: application/json

{
  "approved_by": "manager-uuid-456"
}
```

#### Reject Leave

```http
POST /api/leaves/:id/reject
Content-Type: application/json

{
  "rejected_by": "manager-uuid-456",
  "rejection_reason": "Insufficient leave balance"
}
```

#### Cancel Leave

```http
POST /api/leaves/:id/cancel
Content-Type: application/json

{
  "cancelled_by": "user-uuid-123",
  "cancellation_reason": "Plans changed"
}
```

#### Get Audit History

```http
GET /api/leaves/:id/audit
```

#### Check Overlap

```http
POST /api/leaves/check-overlap
Content-Type: application/json

{
  "user_id": "user-uuid-123",
  "start_date": "2024-12-26",
  "end_date": "2024-12-28",
  "exclude_leave_id": "optional-leave-id"
}
```

#### Get Leave Balance

```http
GET /api/users/:userId/leave-balance?leave_type=cuti&year=2024&total_allocated=12
```

## Status Transitions & Permissions

### Allowed Transitions

| From Status | To Status   | Allowed Roles          | Action   |
|-------------|-------------|------------------------|----------|
| pending     | approved    | admin, manager         | approve  |
| pending     | rejected    | admin, manager         | reject   |
| pending     | cancelled   | admin, manager, employee | cancel |
| approved    | cancelled   | admin, manager         | cancel   |

### Role-Based Access

- **Employee**: Can submit and cancel their own pending leaves
- **Manager**: Can approve, reject, or cancel any leave
- **Admin**: Full access to all operations

## Notification Hooks

The notification service provides extensible hooks for integration with your notification system:

```typescript
const notificationService = new NotificationService({
  hooks: {
    onLeaveSubmitted: async (event) => {
      await emailService.send({
        to: event.leave.approver_email,
        subject: 'New Leave Request',
        template: 'leave-submitted',
        data: event.leave,
      });
    },
    onLeaveApproved: async (event) => {
      await emailService.send({
        to: event.leave.user_email,
        subject: 'Leave Request Approved',
        template: 'leave-approved',
        data: event.leave,
      });
      
      await pushNotificationService.send({
        userId: event.user_id,
        title: 'Leave Approved',
        body: 'Your leave request has been approved',
      });
    },
    onLeaveRejected: async (event) => {
      await emailService.send({
        to: event.leave.user_email,
        subject: 'Leave Request Rejected',
        template: 'leave-rejected',
        data: {
          ...event.leave,
          rejection_reason: event.metadata?.rejection_reason,
        },
      });
    },
    onLeaveCancelled: async (event) => {
      await emailService.send({
        to: event.leave.user_email,
        subject: 'Leave Request Cancelled',
        template: 'leave-cancelled',
        data: event.leave,
      });
    },
  },
  enableLogging: true,
});
```

## Audit Trail

All leave actions are automatically logged to the `audit_logs` table:

```typescript
// Get audit history for a leave
const history = await leaveManagementService.getLeaveAuditHistory(leave.id);

// Each entry includes:
// - user_id: Who performed the action
// - action: What was done (submit, approve, reject, cancel)
// - old_values: State before the action
// - new_values: State after the action
// - metadata: Additional context
// - timestamp: When it happened
```

## Database Schema

The `leaves` table structure:

```sql
CREATE TABLE leaves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  leave_type VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days DECIMAL(4,1) NOT NULL,
  reason TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  attachment_urls TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_end_date_after_start CHECK (end_date >= start_date)
);
```

## Validation

All requests are validated using Zod schemas:

- **CreateLeaveRequest**: Validates leave submission data
- **ApproveLeaveRequest**: Validates approval data
- **RejectLeaveRequest**: Validates rejection data with reason
- **CancelLeaveRequest**: Validates cancellation data
- **LeaveQueryParams**: Validates query parameters

Invalid requests return 400 Bad Request with detailed error information.

## Error Handling

The API includes comprehensive error handling:

```typescript
// Validation errors (400)
{
  "success": false,
  "error": "Validation failed",
  "details": [...]
}

// Not found errors (404)
{
  "success": false,
  "error": "Leave not found"
}

// Business logic errors (400/403)
{
  "success": false,
  "error": "Invalid status transition from pending to approved"
}

// Server errors (500)
{
  "success": false,
  "error": "Internal server error"
}
```

## Example Application

See `examples/leave-management-example.ts` for a complete working example.

## Testing

```bash
# Build the project
npm run build

# Run migrations
npm run migrate:up

# Start the example application
node dist/examples/leave-management-example.js
```

## Integration with Attendance System

The leave management module integrates with the attendance system through the `AttendanceAnomalyCheckerService`:

1. **Absence Excusal**: Approved leaves automatically excuse absences
2. **Anomaly Detection**: Policy engine checks for approved leaves before flagging anomalies
3. **Report Generation**: Leave dates are excluded from attendance compliance reports
4. **Balance Tracking**: Leave balances are considered when evaluating attendance patterns

This ensures that employees on approved leave are not flagged for attendance violations.
