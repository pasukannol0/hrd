import { Pool } from 'pg';
import express from 'express';
import {
  LeaveRepository,
  AuditService,
  NotificationService,
  LeaveManagementService,
  AttendanceAnomalyCheckerService,
  createLeaveApi,
  errorHandler,
  notFoundHandler,
} from '../src';

async function startServer() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/attendance',
  });

  // Initialize repositories
  const leaveRepository = new LeaveRepository({ pool });

  // Initialize services
  const auditService = new AuditService({ pool });

  const notificationService = new NotificationService({
    hooks: {
      onLeaveSubmitted: async (event) => {
        console.log(`[Notification] Leave submitted by user ${event.user_id}`);
        console.log(`  Leave ID: ${event.leave_id}`);
        console.log(`  Type: ${event.leave.leave_type}`);
        console.log(`  Dates: ${event.leave.start_date} to ${event.leave.end_date}`);
      },
      onLeaveApproved: async (event) => {
        console.log(`[Notification] Leave ${event.leave_id} approved by ${event.actor_id}`);
      },
      onLeaveRejected: async (event) => {
        console.log(`[Notification] Leave ${event.leave_id} rejected by ${event.actor_id}`);
        console.log(`  Reason: ${event.metadata?.rejection_reason}`);
      },
      onLeaveCancelled: async (event) => {
        console.log(`[Notification] Leave ${event.leave_id} cancelled by ${event.actor_id}`);
      },
    },
    enableLogging: true,
  });

  const leaveManagementService = new LeaveManagementService({
    leaveRepository,
    auditService,
    notificationService,
  });

  const attendanceAnomalyChecker = new AttendanceAnomalyCheckerService({
    leaveManagementService,
  });

  // Create Express app
  const app = express();

  // Middleware
  app.use(express.json());
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'leave-management-api' });
  });

  // Mount leave API
  const leaveApi = createLeaveApi({ leaveManagementService });
  app.use('/api', leaveApi);

  // Additional endpoint for attendance integration
  app.post('/api/attendance/check-anomaly', async (req, res, next) => {
    try {
      const { user_id, date } = req.body;
      
      if (!user_id || !date) {
        res.status(400).json({
          success: false,
          error: 'user_id and date are required',
        });
        return;
      }

      const result = await attendanceAnomalyChecker.checkAttendanceAnomaly(
        user_id,
        new Date(date)
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  });

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Start server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log('\n=== Leave Management API Server ===');
    console.log(`Server running on port ${PORT}`);
    console.log(`\nAvailable endpoints:`);
    console.log(`  GET    /health                              - Health check`);
    console.log(`  POST   /api/leaves                          - Submit leave request`);
    console.log(`  GET    /api/leaves/:id                      - Get leave by ID`);
    console.log(`  GET    /api/leaves                          - Query leaves`);
    console.log(`  POST   /api/leaves/:id/approve              - Approve leave`);
    console.log(`  POST   /api/leaves/:id/reject               - Reject leave`);
    console.log(`  POST   /api/leaves/:id/cancel               - Cancel leave`);
    console.log(`  GET    /api/leaves/:id/audit                - Get audit history`);
    console.log(`  POST   /api/leaves/check-overlap            - Check overlap`);
    console.log(`  GET    /api/users/:userId/leave-balance     - Get leave balance`);
    console.log(`  POST   /api/attendance/check-anomaly        - Check attendance anomaly`);
    console.log(`\nExample requests:`);
    console.log(`\n  Submit leave:`);
    console.log(`    curl -X POST http://localhost:${PORT}/api/leaves \\`);
    console.log(`      -H "Content-Type: application/json" \\`);
    console.log(`      -d '{`);
    console.log(`        "user_id": "00000000-0000-0000-0000-000000000001",`);
    console.log(`        "leave_type": "cuti",`);
    console.log(`        "start_date": "2024-12-25",`);
    console.log(`        "end_date": "2024-12-27",`);
    console.log(`        "total_days": 3,`);
    console.log(`        "reason": "Family vacation"`);
    console.log(`      }'`);
    console.log(`\n  Query leaves:`);
    console.log(`    curl "http://localhost:${PORT}/api/leaves?user_id=00000000-0000-0000-0000-000000000001&status=approved"`);
    console.log(`\n  Check attendance anomaly:`);
    console.log(`    curl -X POST http://localhost:${PORT}/api/attendance/check-anomaly \\`);
    console.log(`      -H "Content-Type: application/json" \\`);
    console.log(`      -d '{`);
    console.log(`        "user_id": "00000000-0000-0000-0000-000000000001",`);
    console.log(`        "date": "2024-12-26"`);
    console.log(`      }'`);
    console.log();
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await pool.end();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('\nSIGINT received, shutting down gracefully...');
    await pool.end();
    process.exit(0);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { startServer };
