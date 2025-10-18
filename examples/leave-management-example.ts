import { Pool } from 'pg';
import express from 'express';
import {
  LeaveRepository,
  AuditService,
  NotificationService,
  LeaveManagementService,
  createLeaveApi,
  errorHandler,
  notFoundHandler,
  LeaveType,
  LeaveStatus,
} from '../src';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Initialize repositories
  const leaveRepository = new LeaveRepository({ pool });

  // Initialize services
  const auditService = new AuditService({ pool });
  
  const notificationService = new NotificationService({
    hooks: {
      onLeaveSubmitted: async (event) => {
        console.log('Leave submitted:', event.leave_id);
        // Send email notification to manager
      },
      onLeaveApproved: async (event) => {
        console.log('Leave approved:', event.leave_id);
        // Send email notification to employee
      },
      onLeaveRejected: async (event) => {
        console.log('Leave rejected:', event.leave_id);
        // Send email notification to employee
      },
      onLeaveCancelled: async (event) => {
        console.log('Leave cancelled:', event.leave_id);
        // Send email notification to relevant parties
      },
    },
    enableLogging: true,
  });

  const leaveManagementService = new LeaveManagementService({
    leaveRepository,
    auditService,
    notificationService,
  });

  // Example 1: Submit a leave request
  console.log('\n=== Example 1: Submit Leave Request ===');
  const newLeave = await leaveManagementService.submitLeave({
    user_id: 'user-uuid-123',
    leave_type: LeaveType.CUTI,
    start_date: new Date('2024-12-25'),
    end_date: new Date('2024-12-27'),
    total_days: 3,
    reason: 'Family vacation',
  });
  console.log('Leave submitted:', newLeave);

  // Example 2: Approve leave
  console.log('\n=== Example 2: Approve Leave ===');
  const approvedLeave = await leaveManagementService.approveLeave(
    newLeave.id,
    { approved_by: 'manager-uuid-456' },
    'manager'
  );
  console.log('Leave approved:', approvedLeave);

  // Example 3: Query leaves
  console.log('\n=== Example 3: Query Leaves ===');
  const userLeaves = await leaveManagementService.getUserLeaves(
    'user-uuid-123',
    LeaveStatus.APPROVED
  );
  console.log('User approved leaves:', userLeaves.length);

  // Example 4: Check for overlapping leaves
  console.log('\n=== Example 4: Check Overlap ===');
  const overlapCheck = await leaveManagementService.checkOverlap(
    'user-uuid-123',
    new Date('2024-12-26'),
    new Date('2024-12-28')
  );
  console.log('Has overlap:', overlapCheck.has_overlap);

  // Example 5: Get leave balance
  console.log('\n=== Example 5: Get Leave Balance ===');
  const balance = await leaveManagementService.getLeaveBalance(
    'user-uuid-123',
    LeaveType.CUTI,
    12
  );
  console.log('Leave balance:', balance);

  // Example 6: REST API setup
  console.log('\n=== Example 6: REST API Setup ===');
  const app = express();
  app.use(express.json());

  // Mount leave API
  const leaveApi = createLeaveApi({ leaveManagementService });
  app.use('/api', leaveApi);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Leave Management API running on port ${PORT}`);
    console.log('\nAvailable endpoints:');
    console.log('  POST   /api/leaves                    - Submit leave request');
    console.log('  GET    /api/leaves/:id                - Get leave by ID');
    console.log('  GET    /api/leaves                    - Query leaves');
    console.log('  POST   /api/leaves/:id/approve        - Approve leave');
    console.log('  POST   /api/leaves/:id/reject         - Reject leave');
    console.log('  POST   /api/leaves/:id/cancel         - Cancel leave');
    console.log('  GET    /api/leaves/:id/audit          - Get audit history');
    console.log('  POST   /api/leaves/check-overlap      - Check overlap');
    console.log('  GET    /api/users/:userId/leave-balance - Get leave balance');
  });

  // Example 7: Attendance anomaly checking with leave integration
  console.log('\n=== Example 7: Attendance Anomaly Checking ===');
  const isOnLeave = await leaveManagementService.isUserOnLeave(
    'user-uuid-123',
    new Date('2024-12-26')
  );
  console.log('User on leave on 2024-12-26:', isOnLeave);

  // Get leave dates in range
  const leaveDates = await leaveManagementService.getUserLeaveDates(
    'user-uuid-123',
    new Date('2024-12-01'),
    new Date('2024-12-31')
  );
  console.log('Leave dates in December:', leaveDates.length);

  await pool.end();
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main };
