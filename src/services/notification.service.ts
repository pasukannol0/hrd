import { LeaveEvent, LeaveNotificationPayload } from '../types';

export interface NotificationHook {
  onLeaveSubmitted?: (event: LeaveEvent) => Promise<void>;
  onLeaveApproved?: (event: LeaveEvent) => Promise<void>;
  onLeaveRejected?: (event: LeaveEvent) => Promise<void>;
  onLeaveCancelled?: (event: LeaveEvent) => Promise<void>;
}

export interface NotificationServiceConfig {
  hooks?: NotificationHook;
  enableLogging?: boolean;
}

export class NotificationService {
  private hooks?: NotificationHook;
  private enableLogging: boolean;

  constructor(config: NotificationServiceConfig = {}) {
    this.hooks = config.hooks;
    this.enableLogging = config.enableLogging ?? true;
  }

  async notify(event: LeaveEvent): Promise<void> {
    if (this.enableLogging) {
      console.log(`[NotificationService] Event: ${event.event_type}`, {
        leave_id: event.leave_id,
        user_id: event.user_id,
        actor_id: event.actor_id,
      });
    }

    try {
      switch (event.event_type) {
        case 'leave.submitted':
          await this.hooks?.onLeaveSubmitted?.(event);
          break;
        case 'leave.approved':
          await this.hooks?.onLeaveApproved?.(event);
          break;
        case 'leave.rejected':
          await this.hooks?.onLeaveRejected?.(event);
          break;
        case 'leave.cancelled':
          await this.hooks?.onLeaveCancelled?.(event);
          break;
      }
    } catch (error) {
      console.error('[NotificationService] Error processing event:', error);
      // Don't throw - notifications should not break the main flow
    }
  }

  async notifyLeaveSubmitted(
    leaveId: string,
    userId: string,
    leave: any,
    actorId: string
  ): Promise<void> {
    const event: LeaveEvent = {
      event_type: 'leave.submitted',
      leave_id: leaveId,
      user_id: userId,
      leave,
      actor_id: actorId,
      timestamp: new Date(),
    };
    await this.notify(event);
  }

  async notifyLeaveApproved(
    leaveId: string,
    userId: string,
    leave: any,
    actorId: string
  ): Promise<void> {
    const event: LeaveEvent = {
      event_type: 'leave.approved',
      leave_id: leaveId,
      user_id: userId,
      leave,
      actor_id: actorId,
      timestamp: new Date(),
    };
    await this.notify(event);
  }

  async notifyLeaveRejected(
    leaveId: string,
    userId: string,
    leave: any,
    actorId: string,
    rejectionReason?: string
  ): Promise<void> {
    const event: LeaveEvent = {
      event_type: 'leave.rejected',
      leave_id: leaveId,
      user_id: userId,
      leave,
      actor_id: actorId,
      timestamp: new Date(),
      metadata: { rejection_reason: rejectionReason },
    };
    await this.notify(event);
  }

  async notifyLeaveCancelled(
    leaveId: string,
    userId: string,
    leave: any,
    actorId: string,
    cancellationReason?: string
  ): Promise<void> {
    const event: LeaveEvent = {
      event_type: 'leave.cancelled',
      leave_id: leaveId,
      user_id: userId,
      leave,
      actor_id: actorId,
      timestamp: new Date(),
      metadata: { cancellation_reason: cancellationReason },
    };
    await this.notify(event);
  }

  setHooks(hooks: NotificationHook): void {
    this.hooks = hooks;
  }

  addHook(hookName: keyof NotificationHook, handler: (event: LeaveEvent) => Promise<void>): void {
    if (!this.hooks) {
      this.hooks = {};
    }
    this.hooks[hookName] = handler;
  }
}
