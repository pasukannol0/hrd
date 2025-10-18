import { PrometheusMetrics } from '../types';

export interface MetricsServiceConfig {
  enabled?: boolean;
}

export class MetricsService {
  private enabled: boolean;
  private metrics: PrometheusMetrics;

  constructor(config?: MetricsServiceConfig) {
    this.enabled = config?.enabled ?? true;
    this.metrics = {
      attendance_submissions_total: 0,
      attendance_submissions_accepted: 0,
      attendance_submissions_rejected: 0,
      attendance_submissions_review: 0,
      rate_limit_blocks_total: 0,
      motion_guard_violations_total: 0,
      device_trust_failures_total: 0,
      export_requests_total: 0,
      export_requests_csv: 0,
      export_requests_pdf: 0,
      export_requests_completed: 0,
      export_requests_failed: 0,
    };
  }

  incrementCounter(metric: keyof PrometheusMetrics, labels?: Record<string, string>): void {
    if (!this.enabled) return;

    this.metrics[metric]++;

    if (labels) {
      console.log(`[METRICS] ${metric} incremented:`, labels);
    } else {
      console.log(`[METRICS] ${metric} incremented`);
    }
  }

  recordAttendanceSubmission(decision: 'accepted' | 'review' | 'rejected'): void {
    this.incrementCounter('attendance_submissions_total');
    
    switch (decision) {
      case 'accepted':
        this.incrementCounter('attendance_submissions_accepted');
        break;
      case 'rejected':
        this.incrementCounter('attendance_submissions_rejected');
        break;
      case 'review':
        this.incrementCounter('attendance_submissions_review');
        break;
    }
  }

  recordRateLimitBlock(userId: string): void {
    this.incrementCounter('rate_limit_blocks_total', { user_id: userId });
  }

  recordMotionGuardViolation(userId: string, violationType: string): void {
    this.incrementCounter('motion_guard_violations_total', { 
      user_id: userId, 
      violation_type: violationType 
    });
  }

  recordDeviceTrustFailure(userId: string, deviceId: string): void {
    this.incrementCounter('device_trust_failures_total', { 
      user_id: userId, 
      device_id: deviceId 
    });
  }

  getMetrics(): PrometheusMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      attendance_submissions_total: 0,
      attendance_submissions_accepted: 0,
      attendance_submissions_rejected: 0,
      attendance_submissions_review: 0,
      rate_limit_blocks_total: 0,
      motion_guard_violations_total: 0,
      device_trust_failures_total: 0,
      export_requests_total: 0,
      export_requests_csv: 0,
      export_requests_pdf: 0,
      export_requests_completed: 0,
      export_requests_failed: 0,
    };
  }

  exportPrometheusFormat(): string {
    const lines: string[] = [];
    
    lines.push('# HELP attendance_submissions_total Total number of attendance submissions');
    lines.push('# TYPE attendance_submissions_total counter');
    lines.push(`attendance_submissions_total ${this.metrics.attendance_submissions_total}`);
    
    lines.push('# HELP attendance_submissions_accepted Number of accepted attendance submissions');
    lines.push('# TYPE attendance_submissions_accepted counter');
    lines.push(`attendance_submissions_accepted ${this.metrics.attendance_submissions_accepted}`);
    
    lines.push('# HELP attendance_submissions_rejected Number of rejected attendance submissions');
    lines.push('# TYPE attendance_submissions_rejected counter');
    lines.push(`attendance_submissions_rejected ${this.metrics.attendance_submissions_rejected}`);
    
    lines.push('# HELP attendance_submissions_review Number of attendance submissions requiring review');
    lines.push('# TYPE attendance_submissions_review counter');
    lines.push(`attendance_submissions_review ${this.metrics.attendance_submissions_review}`);
    
    lines.push('# HELP rate_limit_blocks_total Total number of rate limit blocks');
    lines.push('# TYPE rate_limit_blocks_total counter');
    lines.push(`rate_limit_blocks_total ${this.metrics.rate_limit_blocks_total}`);
    
    lines.push('# HELP motion_guard_violations_total Total number of motion guard violations');
    lines.push('# TYPE motion_guard_violations_total counter');
    lines.push(`motion_guard_violations_total ${this.metrics.motion_guard_violations_total}`);
    
    lines.push('# HELP device_trust_failures_total Total number of device trust failures');
    lines.push('# TYPE device_trust_failures_total counter');
    lines.push(`device_trust_failures_total ${this.metrics.device_trust_failures_total}`);
    
    lines.push('# HELP export_requests_total Total number of export requests');
    lines.push('# TYPE export_requests_total counter');
    lines.push(`export_requests_total ${this.metrics.export_requests_total}`);
    
    lines.push('# HELP export_requests_csv Number of CSV export requests');
    lines.push('# TYPE export_requests_csv counter');
    lines.push(`export_requests_csv ${this.metrics.export_requests_csv}`);
    
    lines.push('# HELP export_requests_pdf Number of PDF export requests');
    lines.push('# TYPE export_requests_pdf counter');
    lines.push(`export_requests_pdf ${this.metrics.export_requests_pdf}`);
    
    lines.push('# HELP export_requests_completed Number of completed export requests');
    lines.push('# TYPE export_requests_completed counter');
    lines.push(`export_requests_completed ${this.metrics.export_requests_completed}`);
    
    lines.push('# HELP export_requests_failed Number of failed export requests');
    lines.push('# TYPE export_requests_failed counter');
    lines.push(`export_requests_failed ${this.metrics.export_requests_failed}`);
    
    return lines.join('\n');
  }
}
