import { z } from 'zod';

export enum LeaveType {
  IZIN = 'izin',        // Permission leave
  CUTI = 'cuti',        // Vacation/Annual leave
  SAKIT = 'sakit',      // Sick leave
}

export enum LeaveStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export enum LeaveAction {
  SUBMIT = 'submit',
  APPROVE = 'approve',
  REJECT = 'reject',
  CANCEL = 'cancel',
}

export interface Leave {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  start_date: Date;
  end_date: Date;
  total_days: number;
  reason?: string;
  status: LeaveStatus;
  approved_by?: string;
  approved_at?: Date;
  rejection_reason?: string;
  attachment_urls?: string[];
  created_at: Date;
  updated_at: Date;
}

export interface LeaveWithUserInfo extends Leave {
  user_name?: string;
  user_email?: string;
  approver_name?: string;
}

export const CreateLeaveRequestSchema = z.object({
  user_id: z.string().uuid(),
  leave_type: z.nativeEnum(LeaveType),
  start_date: z.string().or(z.date()),
  end_date: z.string().or(z.date()),
  total_days: z.number().min(0.5).max(365),
  reason: z.string().min(1).max(1000).optional(),
  attachment_urls: z.array(z.string().url()).optional(),
});

export const ApproveLeaveRequestSchema = z.object({
  approved_by: z.string().uuid(),
});

export const RejectLeaveRequestSchema = z.object({
  rejected_by: z.string().uuid(),
  rejection_reason: z.string().min(1).max(1000),
});

export const CancelLeaveRequestSchema = z.object({
  cancelled_by: z.string().uuid(),
  cancellation_reason: z.string().min(1).max(1000).optional(),
});

export const LeaveQueryParamsSchema = z.object({
  user_id: z.string().uuid().optional(),
  status: z.nativeEnum(LeaveStatus).optional(),
  leave_type: z.nativeEnum(LeaveType).optional(),
  start_date: z.string().or(z.date()).optional(),
  end_date: z.string().or(z.date()).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export type CreateLeaveRequest = z.infer<typeof CreateLeaveRequestSchema>;
export type ApproveLeaveRequest = z.infer<typeof ApproveLeaveRequestSchema>;
export type RejectLeaveRequest = z.infer<typeof RejectLeaveRequestSchema>;
export type CancelLeaveRequest = z.infer<typeof CancelLeaveRequestSchema>;
export type LeaveQueryParams = z.infer<typeof LeaveQueryParamsSchema>;

export interface LeaveStatusTransition {
  from: LeaveStatus;
  to: LeaveStatus;
  allowed_roles: string[];
  action: LeaveAction;
}

export const LEAVE_STATUS_TRANSITIONS: LeaveStatusTransition[] = [
  {
    from: LeaveStatus.PENDING,
    to: LeaveStatus.APPROVED,
    allowed_roles: ['admin', 'manager'],
    action: LeaveAction.APPROVE,
  },
  {
    from: LeaveStatus.PENDING,
    to: LeaveStatus.REJECTED,
    allowed_roles: ['admin', 'manager'],
    action: LeaveAction.REJECT,
  },
  {
    from: LeaveStatus.PENDING,
    to: LeaveStatus.CANCELLED,
    allowed_roles: ['admin', 'manager', 'employee'],
    action: LeaveAction.CANCEL,
  },
  {
    from: LeaveStatus.APPROVED,
    to: LeaveStatus.CANCELLED,
    allowed_roles: ['admin', 'manager'],
    action: LeaveAction.CANCEL,
  },
];

export interface LeaveEvent {
  event_type: 'leave.submitted' | 'leave.approved' | 'leave.rejected' | 'leave.cancelled';
  leave_id: string;
  user_id: string;
  leave: Leave;
  actor_id: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface LeaveNotificationPayload {
  recipient_user_id: string;
  event: LeaveEvent;
  notification_type: 'email' | 'push' | 'sms';
  template_id?: string;
}

export interface LeaveAuditEntry {
  leave_id: string;
  action: LeaveAction;
  actor_id: string;
  old_status?: LeaveStatus;
  new_status: LeaveStatus;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface LeaveOverlapCheck {
  has_overlap: boolean;
  overlapping_leaves?: Leave[];
}

export interface LeaveBalanceInfo {
  user_id: string;
  leave_type: LeaveType;
  total_allocated: number;
  used: number;
  pending: number;
  available: number;
}
