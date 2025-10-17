exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION refresh_daily_attendance_summary()
    RETURNS void AS $$
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY daily_attendance_summary;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION refresh_weekly_attendance_summary()
    RETURNS void AS $$
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY weekly_attendance_summary;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION refresh_monthly_attendance_summary()
    RETURNS void AS $$
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_attendance_summary;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION refresh_office_occupancy_summary()
    RETURNS void AS $$
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY office_occupancy_summary;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
    RETURNS void AS $$
    BEGIN
      PERFORM refresh_daily_attendance_summary();
      PERFORM refresh_weekly_attendance_summary();
      PERFORM refresh_monthly_attendance_summary();
      PERFORM refresh_office_occupancy_summary();
      
      RAISE NOTICE 'All materialized views refreshed at %', NOW();
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    COMMENT ON FUNCTION refresh_daily_attendance_summary() IS 
    'Refresh daily attendance summary view. Should be run daily at midnight.';
  `);

  pgm.sql(`
    COMMENT ON FUNCTION refresh_weekly_attendance_summary() IS 
    'Refresh weekly attendance summary view. Should be run weekly on Monday morning.';
  `);

  pgm.sql(`
    COMMENT ON FUNCTION refresh_monthly_attendance_summary() IS 
    'Refresh monthly attendance summary view. Should be run monthly on the first day.';
  `);

  pgm.sql(`
    COMMENT ON FUNCTION refresh_office_occupancy_summary() IS 
    'Refresh office occupancy summary view. Should be run daily.';
  `);

  pgm.sql(`
    COMMENT ON FUNCTION refresh_all_materialized_views() IS 
    'Convenience function to refresh all materialized views. Can be scheduled via cron or pg_cron extension.';
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP FUNCTION IF EXISTS refresh_all_materialized_views() CASCADE;');
  pgm.sql('DROP FUNCTION IF EXISTS refresh_office_occupancy_summary() CASCADE;');
  pgm.sql('DROP FUNCTION IF EXISTS refresh_monthly_attendance_summary() CASCADE;');
  pgm.sql('DROP FUNCTION IF EXISTS refresh_weekly_attendance_summary() CASCADE;');
  pgm.sql('DROP FUNCTION IF EXISTS refresh_daily_attendance_summary() CASCADE;');
};
