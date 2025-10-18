export interface DailyAttendanceSummary {
  attendance_date: Date;
  office_id: string;
  office_name: string;
  user_id: string;
  full_name: string;
  department?: string;
  check_in_count: number;
  first_check_in: Date;
  last_check_out: Date;
  total_work_minutes: number;
  avg_work_minutes: number;
  late_count: number;
  early_departure_count: number;
  missing_checkout_count: number;
  attendance_details: any;
}

export interface WeeklyAttendanceSummary {
  week_start_date: Date;
  office_id: string;
  office_name: string;
  user_id: string;
  full_name: string;
  department?: string;
  days_present: number;
  total_check_ins: number;
  total_work_minutes: number;
  avg_daily_work_minutes: number;
  total_late_count: number;
  total_early_departure_count: number;
  total_missing_checkout_count: number;
  earliest_check_in_time: Date;
  latest_check_out_time: Date;
}

export interface MonthlyAttendanceSummary {
  month_start_date: Date;
  year: number;
  month: number;
  office_id: string;
  office_name: string;
  user_id: string;
  full_name: string;
  department?: string;
  days_present: number;
  total_check_ins: number;
  total_work_minutes: number;
  avg_daily_work_minutes: number;
  total_late_count: number;
  total_early_departure_count: number;
  total_missing_checkout_count: number;
  earliest_check_in_time: Date;
  latest_check_out_time: Date;
  total_work_hours: number;
}

export interface OfficeOccupancySummary {
  occupancy_date: Date;
  hour: number;
  office_id: string;
  office_name: string;
  city?: string;
  country?: string;
  unique_users: number;
  total_check_ins: number;
  departments_present: string[];
}

export interface ReportFilter {
  start_date?: Date;
  end_date?: Date;
  office_id?: string;
  user_id?: string;
  department?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'occupancy';
export type ExportFormat = 'csv' | 'pdf';

export interface ExportRequest {
  report_type: ReportType;
  format: ExportFormat;
  filters: ReportFilter;
  requested_by: string;
  requested_at: Date;
}

export interface ExportRecord {
  id: string;
  report_type: ReportType;
  format: ExportFormat;
  filters: ReportFilter;
  requested_by: string;
  requested_at: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  file_path?: string;
  signed_url?: string;
  url_expires_at?: Date;
  error_message?: string;
  completed_at?: Date;
}

export interface SignedUrlOptions {
  expires_in_seconds?: number;
  content_type?: string;
}

export interface ExportMetrics {
  export_requests_total: number;
  export_requests_csv: number;
  export_requests_pdf: number;
  export_requests_completed: number;
  export_requests_failed: number;
  export_generation_duration_ms: number;
}
