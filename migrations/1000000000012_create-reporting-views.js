exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE MATERIALIZED VIEW daily_attendance_summary AS
    SELECT 
      DATE(check_in_time AT TIME ZONE o.timezone) as attendance_date,
      a.office_id,
      o.name as office_name,
      a.user_id,
      u.full_name,
      u.department,
      COUNT(*) as check_in_count,
      MIN(a.check_in_time) as first_check_in,
      MAX(COALESCE(a.check_out_time, a.check_in_time)) as last_check_out,
      SUM(a.work_duration_minutes) as total_work_minutes,
      AVG(a.work_duration_minutes) as avg_work_minutes,
      COUNT(CASE WHEN a.status = 'late' THEN 1 END) as late_count,
      COUNT(CASE WHEN a.status = 'early_departure' THEN 1 END) as early_departure_count,
      COUNT(CASE WHEN a.check_out_time IS NULL THEN 1 END) as missing_checkout_count,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'check_in_time', a.check_in_time,
          'check_out_time', a.check_out_time,
          'status', a.status,
          'check_in_method', a.check_in_method,
          'work_duration_minutes', a.work_duration_minutes
        ) ORDER BY a.check_in_time
      ) as attendance_details
    FROM attendance a
    JOIN app_users u ON a.user_id = u.id
    JOIN offices o ON a.office_id = o.id
    GROUP BY 
      DATE(check_in_time AT TIME ZONE o.timezone),
      a.office_id,
      o.name,
      a.user_id,
      u.full_name,
      u.department
    WITH DATA;
  `);

  pgm.createIndex('daily_attendance_summary', 'attendance_date');
  pgm.createIndex('daily_attendance_summary', 'office_id');
  pgm.createIndex('daily_attendance_summary', 'user_id');
  pgm.createIndex('daily_attendance_summary', ['attendance_date', 'office_id']);
  pgm.createIndex('daily_attendance_summary', ['user_id', 'attendance_date']);

  pgm.sql(`
    CREATE MATERIALIZED VIEW weekly_attendance_summary AS
    SELECT 
      DATE_TRUNC('week', attendance_date)::date as week_start_date,
      office_id,
      office_name,
      user_id,
      full_name,
      department,
      COUNT(*) as days_present,
      SUM(check_in_count) as total_check_ins,
      SUM(total_work_minutes) as total_work_minutes,
      AVG(total_work_minutes) as avg_daily_work_minutes,
      SUM(late_count) as total_late_count,
      SUM(early_departure_count) as total_early_departure_count,
      SUM(missing_checkout_count) as total_missing_checkout_count,
      MIN(first_check_in) as earliest_check_in_time,
      MAX(last_check_out) as latest_check_out_time
    FROM daily_attendance_summary
    GROUP BY 
      DATE_TRUNC('week', attendance_date)::date,
      office_id,
      office_name,
      user_id,
      full_name,
      department
    WITH DATA;
  `);

  pgm.createIndex('weekly_attendance_summary', 'week_start_date');
  pgm.createIndex('weekly_attendance_summary', 'office_id');
  pgm.createIndex('weekly_attendance_summary', 'user_id');
  pgm.createIndex('weekly_attendance_summary', ['week_start_date', 'office_id']);

  pgm.sql(`
    CREATE MATERIALIZED VIEW monthly_attendance_summary AS
    SELECT 
      DATE_TRUNC('month', attendance_date)::date as month_start_date,
      EXTRACT(YEAR FROM attendance_date)::integer as year,
      EXTRACT(MONTH FROM attendance_date)::integer as month,
      office_id,
      office_name,
      user_id,
      full_name,
      department,
      COUNT(*) as days_present,
      SUM(check_in_count) as total_check_ins,
      SUM(total_work_minutes) as total_work_minutes,
      AVG(total_work_minutes) as avg_daily_work_minutes,
      SUM(late_count) as total_late_count,
      SUM(early_departure_count) as total_early_departure_count,
      SUM(missing_checkout_count) as total_missing_checkout_count,
      MIN(first_check_in) as earliest_check_in_time,
      MAX(last_check_out) as latest_check_out_time,
      ROUND((SUM(total_work_minutes) / 60.0)::numeric, 2) as total_work_hours
    FROM daily_attendance_summary
    GROUP BY 
      DATE_TRUNC('month', attendance_date)::date,
      EXTRACT(YEAR FROM attendance_date),
      EXTRACT(MONTH FROM attendance_date),
      office_id,
      office_name,
      user_id,
      full_name,
      department
    WITH DATA;
  `);

  pgm.createIndex('monthly_attendance_summary', 'month_start_date');
  pgm.createIndex('monthly_attendance_summary', 'office_id');
  pgm.createIndex('monthly_attendance_summary', 'user_id');
  pgm.createIndex('monthly_attendance_summary', ['year', 'month']);
  pgm.createIndex('monthly_attendance_summary', ['month_start_date', 'office_id']);

  pgm.sql(`
    CREATE MATERIALIZED VIEW office_occupancy_summary AS
    SELECT 
      DATE(check_in_time AT TIME ZONE o.timezone) as occupancy_date,
      EXTRACT(HOUR FROM check_in_time AT TIME ZONE o.timezone)::integer as hour,
      a.office_id,
      o.name as office_name,
      o.city,
      o.country,
      COUNT(DISTINCT a.user_id) as unique_users,
      COUNT(*) as total_check_ins,
      ARRAY_AGG(DISTINCT u.department) FILTER (WHERE u.department IS NOT NULL) as departments_present
    FROM attendance a
    JOIN app_users u ON a.user_id = u.id
    JOIN offices o ON a.office_id = o.id
    GROUP BY 
      DATE(check_in_time AT TIME ZONE o.timezone),
      EXTRACT(HOUR FROM check_in_time AT TIME ZONE o.timezone),
      a.office_id,
      o.name,
      o.city,
      o.country
    WITH DATA;
  `);

  pgm.createIndex('office_occupancy_summary', 'occupancy_date');
  pgm.createIndex('office_occupancy_summary', 'office_id');
  pgm.createIndex('office_occupancy_summary', ['occupancy_date', 'hour']);
  pgm.createIndex('office_occupancy_summary', ['office_id', 'occupancy_date']);

  pgm.sql(`
    COMMENT ON MATERIALIZED VIEW daily_attendance_summary IS 
    'Daily attendance summary per user and office. Refresh daily at midnight.';
  `);

  pgm.sql(`
    COMMENT ON MATERIALIZED VIEW weekly_attendance_summary IS 
    'Weekly attendance summary per user and office. Refresh weekly on Monday morning.';
  `);

  pgm.sql(`
    COMMENT ON MATERIALIZED VIEW monthly_attendance_summary IS 
    'Monthly attendance summary per user and office. Refresh monthly on the first day of month.';
  `);

  pgm.sql(`
    COMMENT ON MATERIALIZED VIEW office_occupancy_summary IS 
    'Hourly office occupancy statistics. Refresh daily to track peak usage hours.';
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP MATERIALIZED VIEW IF EXISTS office_occupancy_summary CASCADE;');
  pgm.sql('DROP MATERIALIZED VIEW IF EXISTS monthly_attendance_summary CASCADE;');
  pgm.sql('DROP MATERIALIZED VIEW IF EXISTS weekly_attendance_summary CASCADE;');
  pgm.sql('DROP MATERIALIZED VIEW IF EXISTS daily_attendance_summary CASCADE;');
};
