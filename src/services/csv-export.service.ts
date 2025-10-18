import { stringify } from 'csv-stringify';
import { Writable } from 'stream';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import {
  DailyAttendanceSummary,
  WeeklyAttendanceSummary,
  MonthlyAttendanceSummary,
  OfficeOccupancySummary,
  ReportType,
} from '../types';

export interface CsvExportConfig {
  timezone?: string;
}

export class CsvExportService {
  private timezone: string;

  constructor(config?: CsvExportConfig) {
    this.timezone = config?.timezone || 'Asia/Jakarta';
  }

  private formatDate(date: Date): string {
    return formatInTimeZone(date, this.timezone, 'yyyy-MM-dd');
  }

  private formatDateTime(date: Date): string {
    return formatInTimeZone(date, this.timezone, 'yyyy-MM-dd HH:mm:ss');
  }

  private formatTime(date: Date): string {
    return formatInTimeZone(date, this.timezone, 'HH:mm:ss');
  }

  async exportDailyReport(data: DailyAttendanceSummary[], output: Writable): Promise<void> {
    const columns = [
      { key: 'attendance_date', header: 'Date' },
      { key: 'office_name', header: 'Office' },
      { key: 'full_name', header: 'Employee' },
      { key: 'department', header: 'Department' },
      { key: 'check_in_count', header: 'Check-ins' },
      { key: 'first_check_in', header: 'First Check-in' },
      { key: 'last_check_out', header: 'Last Check-out' },
      { key: 'total_work_minutes', header: 'Total Work (min)' },
      { key: 'total_work_hours', header: 'Total Work (hrs)' },
      { key: 'late_count', header: 'Late Count' },
      { key: 'early_departure_count', header: 'Early Departures' },
      { key: 'missing_checkout_count', header: 'Missing Check-outs' },
    ];

    const stringifier = stringify({
      header: true,
      columns: columns.map((c) => ({ key: c.key, header: c.header })),
    });

    stringifier.pipe(output);

    for (const row of data) {
      stringifier.write({
        attendance_date: this.formatDate(row.attendance_date),
        office_name: row.office_name,
        full_name: row.full_name,
        department: row.department || 'N/A',
        check_in_count: row.check_in_count,
        first_check_in: this.formatTime(row.first_check_in),
        last_check_out: this.formatTime(row.last_check_out),
        total_work_minutes: row.total_work_minutes,
        total_work_hours: (row.total_work_minutes / 60).toFixed(2),
        late_count: row.late_count,
        early_departure_count: row.early_departure_count,
        missing_checkout_count: row.missing_checkout_count,
      });
    }

    stringifier.end();

    return new Promise((resolve, reject) => {
      stringifier.on('finish', resolve);
      stringifier.on('error', reject);
    });
  }

  async exportWeeklyReport(data: WeeklyAttendanceSummary[], output: Writable): Promise<void> {
    const columns = [
      { key: 'week_start_date', header: 'Week Starting' },
      { key: 'office_name', header: 'Office' },
      { key: 'full_name', header: 'Employee' },
      { key: 'department', header: 'Department' },
      { key: 'days_present', header: 'Days Present' },
      { key: 'total_check_ins', header: 'Total Check-ins' },
      { key: 'total_work_minutes', header: 'Total Work (min)' },
      { key: 'total_work_hours', header: 'Total Work (hrs)' },
      { key: 'avg_daily_work_minutes', header: 'Avg Daily Work (min)' },
      { key: 'total_late_count', header: 'Total Late' },
      { key: 'total_early_departure_count', header: 'Total Early Departures' },
      { key: 'total_missing_checkout_count', header: 'Total Missing Check-outs' },
    ];

    const stringifier = stringify({
      header: true,
      columns: columns.map((c) => ({ key: c.key, header: c.header })),
    });

    stringifier.pipe(output);

    for (const row of data) {
      stringifier.write({
        week_start_date: this.formatDate(row.week_start_date),
        office_name: row.office_name,
        full_name: row.full_name,
        department: row.department || 'N/A',
        days_present: row.days_present,
        total_check_ins: row.total_check_ins,
        total_work_minutes: row.total_work_minutes,
        total_work_hours: (row.total_work_minutes / 60).toFixed(2),
        avg_daily_work_minutes: row.avg_daily_work_minutes?.toFixed(2) || '0',
        total_late_count: row.total_late_count,
        total_early_departure_count: row.total_early_departure_count,
        total_missing_checkout_count: row.total_missing_checkout_count,
      });
    }

    stringifier.end();

    return new Promise((resolve, reject) => {
      stringifier.on('finish', resolve);
      stringifier.on('error', reject);
    });
  }

  async exportMonthlyReport(data: MonthlyAttendanceSummary[], output: Writable): Promise<void> {
    const columns = [
      { key: 'year', header: 'Year' },
      { key: 'month', header: 'Month' },
      { key: 'office_name', header: 'Office' },
      { key: 'full_name', header: 'Employee' },
      { key: 'department', header: 'Department' },
      { key: 'days_present', header: 'Days Present' },
      { key: 'total_check_ins', header: 'Total Check-ins' },
      { key: 'total_work_hours', header: 'Total Work (hrs)' },
      { key: 'avg_daily_work_minutes', header: 'Avg Daily Work (min)' },
      { key: 'total_late_count', header: 'Total Late' },
      { key: 'total_early_departure_count', header: 'Total Early Departures' },
      { key: 'total_missing_checkout_count', header: 'Total Missing Check-outs' },
    ];

    const stringifier = stringify({
      header: true,
      columns: columns.map((c) => ({ key: c.key, header: c.header })),
    });

    stringifier.pipe(output);

    for (const row of data) {
      stringifier.write({
        year: row.year,
        month: row.month,
        office_name: row.office_name,
        full_name: row.full_name,
        department: row.department || 'N/A',
        days_present: row.days_present,
        total_check_ins: row.total_check_ins,
        total_work_hours: row.total_work_hours,
        avg_daily_work_minutes: row.avg_daily_work_minutes?.toFixed(2) || '0',
        total_late_count: row.total_late_count,
        total_early_departure_count: row.total_early_departure_count,
        total_missing_checkout_count: row.total_missing_checkout_count,
      });
    }

    stringifier.end();

    return new Promise((resolve, reject) => {
      stringifier.on('finish', resolve);
      stringifier.on('error', reject);
    });
  }

  async exportOccupancyReport(data: OfficeOccupancySummary[], output: Writable): Promise<void> {
    const columns = [
      { key: 'occupancy_date', header: 'Date' },
      { key: 'hour', header: 'Hour' },
      { key: 'office_name', header: 'Office' },
      { key: 'city', header: 'City' },
      { key: 'country', header: 'Country' },
      { key: 'unique_users', header: 'Unique Users' },
      { key: 'total_check_ins', header: 'Total Check-ins' },
      { key: 'departments_present', header: 'Departments' },
    ];

    const stringifier = stringify({
      header: true,
      columns: columns.map((c) => ({ key: c.key, header: c.header })),
    });

    stringifier.pipe(output);

    for (const row of data) {
      stringifier.write({
        occupancy_date: this.formatDate(row.occupancy_date),
        hour: `${row.hour.toString().padStart(2, '0')}:00`,
        office_name: row.office_name,
        city: row.city || 'N/A',
        country: row.country || 'N/A',
        unique_users: row.unique_users,
        total_check_ins: row.total_check_ins,
        departments_present: Array.isArray(row.departments_present)
          ? row.departments_present.join(', ')
          : 'N/A',
      });
    }

    stringifier.end();

    return new Promise((resolve, reject) => {
      stringifier.on('finish', resolve);
      stringifier.on('error', reject);
    });
  }

  async exportReport(
    reportType: ReportType,
    data: any[],
    output: Writable
  ): Promise<void> {
    switch (reportType) {
      case 'daily':
        return this.exportDailyReport(data, output);
      case 'weekly':
        return this.exportWeeklyReport(data, output);
      case 'monthly':
        return this.exportMonthlyReport(data, output);
      case 'occupancy':
        return this.exportOccupancyReport(data, output);
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }
  }
}
