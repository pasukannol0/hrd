const { Pool } = require('pg');
require('dotenv').config();

async function refreshMaterializedViews() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const views = [
    'daily_attendance_summary',
    'weekly_attendance_summary',
    'monthly_attendance_summary',
    'office_occupancy_summary',
  ];

  console.log('Starting materialized view refresh...');
  const startTime = Date.now();

  try {
    for (const view of views) {
      console.log(`Refreshing ${view}...`);
      const viewStart = Date.now();
      
      await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
      
      const duration = Date.now() - viewStart;
      console.log(`✓ ${view} refreshed in ${duration}ms`);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`\n✓ All views refreshed successfully in ${totalDuration}ms`);
  } catch (error) {
    console.error('Error refreshing materialized views:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

refreshMaterializedViews();
