import { LeaveManagementService } from './leave-management.service';

export interface AttendanceAnomalyCheckerConfig {
  leaveManagementService: LeaveManagementService;
}

export interface AttendanceRecord {
  user_id: string;
  date: Date;
  check_in_time?: Date;
  check_out_time?: Date;
  status?: string;
}

export interface AnomalyCheckResult {
  has_anomaly: boolean;
  anomaly_type?: 'absent' | 'late' | 'early_departure' | 'no_checkout';
  is_excused: boolean;
  excuse_reason?: 'approved_leave' | 'holiday' | 'weekend';
  details?: Record<string, any>;
}

export class AttendanceAnomalyCheckerService {
  private leaveManagementService: LeaveManagementService;

  constructor(config: AttendanceAnomalyCheckerConfig) {
    this.leaveManagementService = config.leaveManagementService;
  }

  async checkAttendanceAnomaly(
    userId: string,
    date: Date,
    record?: AttendanceRecord
  ): Promise<AnomalyCheckResult> {
    // Check if user has approved leave on this date
    const isOnLeave = await this.leaveManagementService.isUserOnLeave(userId, date);

    if (isOnLeave) {
      return {
        has_anomaly: false,
        is_excused: true,
        excuse_reason: 'approved_leave',
        details: {
          message: 'User has approved leave on this date',
        },
      };
    }

    // If no attendance record exists, check for absence
    if (!record || !record.check_in_time) {
      return {
        has_anomaly: true,
        anomaly_type: 'absent',
        is_excused: false,
        details: {
          message: 'No attendance record found for this date',
        },
      };
    }

    // Additional anomaly checks can be added here
    // For example: late arrival, early departure, no checkout, etc.

    return {
      has_anomaly: false,
      is_excused: false,
      details: {
        message: 'Attendance record is normal',
      },
    };
  }

  async checkMultipleDaysAnomalies(
    userId: string,
    startDate: Date,
    endDate: Date,
    records?: AttendanceRecord[]
  ): Promise<Map<string, AnomalyCheckResult>> {
    const results = new Map<string, AnomalyCheckResult>();

    // Get all approved leave dates in the range
    const leaveDates = await this.leaveManagementService.getUserLeaveDates(
      userId,
      startDate,
      endDate
    );

    const leaveDateStrings = new Set(
      leaveDates.map(d => d.toISOString().split('T')[0])
    );

    // Check each day
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      const record = records?.find(
        r => r.date.toISOString().split('T')[0] === dateStr
      );

      // If user has approved leave, mark as excused
      if (leaveDateStrings.has(dateStr)) {
        results.set(dateStr, {
          has_anomaly: false,
          is_excused: true,
          excuse_reason: 'approved_leave',
        });
      } else if (!record || !record.check_in_time) {
        // Check for absence
        const dayOfWeek = current.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (isWeekend) {
          results.set(dateStr, {
            has_anomaly: false,
            is_excused: true,
            excuse_reason: 'weekend',
          });
        } else {
          results.set(dateStr, {
            has_anomaly: true,
            anomaly_type: 'absent',
            is_excused: false,
          });
        }
      } else {
        results.set(dateStr, {
          has_anomaly: false,
          is_excused: false,
        });
      }

      current.setDate(current.getDate() + 1);
    }

    return results;
  }

  async getExcusedAbsences(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Date[]> {
    return this.leaveManagementService.getUserLeaveDates(
      userId,
      startDate,
      endDate
    );
  }
}
