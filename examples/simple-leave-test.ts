import { Pool } from 'pg';
import {
  LeaveRepository,
  AuditService,
  NotificationService,
  LeaveManagementService,
  LeaveType,
  LeaveStatus,
} from '../src';

async function simpleTest() {
  console.log('=== Leave Management System - Simple Test ===\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/attendance',
  });

  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✓ Database connection successful\n');

    // Initialize services
    const leaveRepository = new LeaveRepository({ pool });
    const auditService = new AuditService({ pool });
    const notificationService = new NotificationService({ enableLogging: true });

    const leaveManagementService = new LeaveManagementService({
      leaveRepository,
      auditService,
      notificationService,
    });

    console.log('✓ Services initialized\n');

    // Test 1: Submit leave request
    console.log('Test 1: Submit leave request...');
    const testUserId = '00000000-0000-0000-0000-000000000001';
    
    const leave = await leaveManagementService.submitLeave({
      user_id: testUserId,
      leave_type: LeaveType.CUTI,
      start_date: new Date('2024-12-25'),
      end_date: new Date('2024-12-27'),
      total_days: 3,
      reason: 'Test vacation',
    });

    console.log('✓ Leave submitted successfully');
    console.log(`  Leave ID: ${leave.id}`);
    console.log(`  Status: ${leave.status}`);
    console.log(`  Type: ${leave.leave_type}`);
    console.log(`  Days: ${leave.total_days}\n`);

    // Test 2: Query leaves
    console.log('Test 2: Query user leaves...');
    const userLeaves = await leaveManagementService.getUserLeaves(testUserId);
    console.log(`✓ Found ${userLeaves.length} leave(s) for user\n`);

    // Test 3: Approve leave
    console.log('Test 3: Approve leave...');
    const approvedLeave = await leaveManagementService.approveLeave(
      leave.id,
      { approved_by: '00000000-0000-0000-0000-000000000002' },
      'manager'
    );
    console.log('✓ Leave approved successfully');
    console.log(`  Status: ${approvedLeave.status}`);
    console.log(`  Approved by: ${approvedLeave.approved_by}\n`);

    // Test 4: Check if user is on leave
    console.log('Test 4: Check if user is on leave...');
    const isOnLeave = await leaveManagementService.isUserOnLeave(
      testUserId,
      new Date('2024-12-26')
    );
    console.log(`✓ User on leave: ${isOnLeave}\n`);

    // Test 5: Get leave balance
    console.log('Test 5: Get leave balance...');
    const balance = await leaveManagementService.getLeaveBalance(
      testUserId,
      LeaveType.CUTI,
      12,
      2024
    );
    console.log('✓ Leave balance calculated');
    console.log(`  Total allocated: ${balance.total_allocated}`);
    console.log(`  Used: ${balance.used}`);
    console.log(`  Pending: ${balance.pending}`);
    console.log(`  Available: ${balance.available}\n`);

    // Test 6: Get audit history
    console.log('Test 6: Get audit history...');
    const history = await leaveManagementService.getLeaveAuditHistory(leave.id);
    console.log(`✓ Found ${history.length} audit log(s)\n`);

    // Clean up test data
    console.log('Cleaning up test data...');
    await leaveRepository.delete(leave.id);
    console.log('✓ Test data cleaned up\n');

    console.log('=== All tests passed! ===');

  } catch (error) {
    console.error('✗ Test failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  simpleTest()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { simpleTest };
