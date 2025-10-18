import { PoolClient } from 'pg';
import { LeaveRepository } from '../repositories/leave.repository';
import { AuditService } from './audit.service';
import { NotificationService } from './notification.service';
import {
  Leave,
  LeaveStatus,
  LeaveType,
  CreateLeaveRequest,
  ApproveLeaveRequest,
  RejectLeaveRequest,
  CancelLeaveRequest,
  LeaveQueryParams,
  LEAVE_STATUS_TRANSITIONS,
  LeaveOverlapCheck,
  LeaveBalanceInfo,
} from '../types';

export interface LeaveManagementServiceConfig {
  leaveRepository: LeaveRepository;
  auditService: AuditService;
  notificationService: NotificationService;
}

export class LeaveManagementService {
  private leaveRepository: LeaveRepository;
  private auditService: AuditService;
  private notificationService: NotificationService;

  constructor(config: LeaveManagementServiceConfig) {
    this.leaveRepository = config.leaveRepository;
    this.auditService = config.auditService;
    this.notificationService = config.notificationService;
  }

  async submitLeave(request: CreateLeaveRequest): Promise<Leave> {
    // Validate dates
    const startDate = new Date(request.start_date);
    const endDate = new Date(request.end_date);

    if (endDate < startDate) {
      throw new Error('End date must be after or equal to start date');
    }

    // Check for overlapping leaves
    const overlap = await this.checkOverlap(
      request.user_id,
      startDate,
      endDate
    );

    if (overlap.has_overlap) {
      throw new Error(
        `Leave request overlaps with existing leave(s): ${overlap.overlapping_leaves?.map(l => l.id).join(', ')}`
      );
    }

    // Create leave request
    const leave = await this.leaveRepository.create(request);

    // Log audit trail
    await this.auditService.logLeaveAction(
      leave.id,
      'submit',
      request.user_id,
      undefined,
      {
        leave_type: leave.leave_type,
        start_date: leave.start_date,
        end_date: leave.end_date,
        total_days: leave.total_days,
        status: leave.status,
      },
      {
        reason: leave.reason,
      }
    );

    // Send notification
    await this.notificationService.notifyLeaveSubmitted(
      leave.id,
      leave.user_id,
      leave,
      request.user_id
    );

    return leave;
  }

  async approveLeave(
    leaveId: string,
    request: ApproveLeaveRequest,
    actorRole: string
  ): Promise<Leave> {
    // Get existing leave
    const existingLeave = await this.leaveRepository.findById(leaveId);
    if (!existingLeave) {
      throw new Error(`Leave with id ${leaveId} not found`);
    }

    // Validate status transition
    this.validateStatusTransition(
      existingLeave.status,
      LeaveStatus.APPROVED,
      actorRole
    );

    // Update status
    const leave = await this.leaveRepository.updateStatus(
      leaveId,
      LeaveStatus.APPROVED,
      request.approved_by
    );

    // Log audit trail
    await this.auditService.logLeaveAction(
      leave.id,
      'approve',
      request.approved_by,
      { status: existingLeave.status },
      {
        status: leave.status,
        approved_by: leave.approved_by,
        approved_at: leave.approved_at,
      }
    );

    // Send notification
    await this.notificationService.notifyLeaveApproved(
      leave.id,
      leave.user_id,
      leave,
      request.approved_by
    );

    return leave;
  }

  async rejectLeave(
    leaveId: string,
    request: RejectLeaveRequest,
    actorRole: string
  ): Promise<Leave> {
    // Get existing leave
    const existingLeave = await this.leaveRepository.findById(leaveId);
    if (!existingLeave) {
      throw new Error(`Leave with id ${leaveId} not found`);
    }

    // Validate status transition
    this.validateStatusTransition(
      existingLeave.status,
      LeaveStatus.REJECTED,
      actorRole
    );

    // Update status
    const leave = await this.leaveRepository.updateStatus(
      leaveId,
      LeaveStatus.REJECTED,
      undefined,
      request.rejection_reason
    );

    // Log audit trail
    await this.auditService.logLeaveAction(
      leave.id,
      'reject',
      request.rejected_by,
      { status: existingLeave.status },
      {
        status: leave.status,
        rejection_reason: leave.rejection_reason,
      }
    );

    // Send notification
    await this.notificationService.notifyLeaveRejected(
      leave.id,
      leave.user_id,
      leave,
      request.rejected_by,
      request.rejection_reason
    );

    return leave;
  }

  async cancelLeave(
    leaveId: string,
    request: CancelLeaveRequest,
    actorRole: string
  ): Promise<Leave> {
    // Get existing leave
    const existingLeave = await this.leaveRepository.findById(leaveId);
    if (!existingLeave) {
      throw new Error(`Leave with id ${leaveId} not found`);
    }

    // Validate status transition
    this.validateStatusTransition(
      existingLeave.status,
      LeaveStatus.CANCELLED,
      actorRole
    );

    // Update status
    const leave = await this.leaveRepository.updateStatus(
      leaveId,
      LeaveStatus.CANCELLED
    );

    // Log audit trail
    await this.auditService.logLeaveAction(
      leave.id,
      'cancel',
      request.cancelled_by,
      { status: existingLeave.status },
      {
        status: leave.status,
      },
      {
        cancellation_reason: request.cancellation_reason,
      }
    );

    // Send notification
    await this.notificationService.notifyLeaveCancelled(
      leave.id,
      leave.user_id,
      leave,
      request.cancelled_by,
      request.cancellation_reason
    );

    return leave;
  }

  async getLeaveById(leaveId: string): Promise<Leave | null> {
    return this.leaveRepository.findById(leaveId);
  }

  async getUserLeaves(
    userId: string,
    status?: LeaveStatus,
    limit: number = 50,
    offset: number = 0
  ): Promise<Leave[]> {
    return this.leaveRepository.findByUserId(userId, status, limit, offset);
  }

  async getLeavesByStatus(
    status: LeaveStatus,
    limit: number = 50,
    offset: number = 0
  ): Promise<Leave[]> {
    return this.leaveRepository.findByStatus(status, limit, offset);
  }

  async queryLeaves(params: LeaveQueryParams): Promise<Leave[]> {
    return this.leaveRepository.findWithFilters(params);
  }

  async checkOverlap(
    userId: string,
    startDate: Date | string,
    endDate: Date | string,
    excludeLeaveId?: string
  ): Promise<LeaveOverlapCheck> {
    const overlappingLeaves = await this.leaveRepository.checkOverlap(
      userId,
      startDate,
      endDate,
      excludeLeaveId
    );

    return {
      has_overlap: overlappingLeaves.length > 0,
      overlapping_leaves: overlappingLeaves.length > 0 ? overlappingLeaves : undefined,
    };
  }

  async getApprovedLeavesInRange(
    userId: string,
    startDate: Date | string,
    endDate: Date | string
  ): Promise<Leave[]> {
    return this.leaveRepository.getApprovedLeavesInRange(
      userId,
      startDate,
      endDate
    );
  }

  async getLeaveBalance(
    userId: string,
    leaveType: LeaveType,
    totalAllocated: number = 12,
    year?: number
  ): Promise<LeaveBalanceInfo> {
    const currentYear = year || new Date().getFullYear();
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31);

    const [usedDays, pendingDays] = await Promise.all([
      this.leaveRepository.getTotalDaysByUserAndType(
        userId,
        leaveType,
        LeaveStatus.APPROVED,
        startDate,
        endDate
      ),
      this.leaveRepository.getTotalDaysByUserAndType(
        userId,
        leaveType,
        LeaveStatus.PENDING,
        startDate,
        endDate
      ),
    ]);

    return {
      user_id: userId,
      leave_type: leaveType,
      total_allocated: totalAllocated,
      used: usedDays,
      pending: pendingDays,
      available: totalAllocated - usedDays - pendingDays,
    };
  }

  async getLeaveAuditHistory(leaveId: string): Promise<any[]> {
    return this.auditService.getEntityAuditHistory('leave', leaveId);
  }

  private validateStatusTransition(
    currentStatus: LeaveStatus,
    newStatus: LeaveStatus,
    actorRole: string
  ): void {
    const transition = LEAVE_STATUS_TRANSITIONS.find(
      t => t.from === currentStatus && t.to === newStatus
    );

    if (!transition) {
      throw new Error(
        `Invalid status transition from ${currentStatus} to ${newStatus}`
      );
    }

    if (!transition.allowed_roles.includes(actorRole)) {
      throw new Error(
        `Role ${actorRole} is not allowed to transition from ${currentStatus} to ${newStatus}`
      );
    }
  }

  async isUserOnLeave(userId: string, date: Date | string): Promise<boolean> {
    const targetDate = typeof date === 'string' ? new Date(date) : date;
    const leaves = await this.leaveRepository.getApprovedLeavesInRange(
      userId,
      targetDate,
      targetDate
    );
    return leaves.length > 0;
  }

  async getUserLeaveDates(
    userId: string,
    startDate: Date | string,
    endDate: Date | string
  ): Promise<Date[]> {
    const leaves = await this.leaveRepository.getApprovedLeavesInRange(
      userId,
      startDate,
      endDate
    );

    const leaveDates = new Set<string>();

    for (const leave of leaves) {
      const current = new Date(leave.start_date);
      const end = new Date(leave.end_date);

      while (current <= end) {
        leaveDates.add(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
    }

    return Array.from(leaveDates).map(d => new Date(d));
  }
}
