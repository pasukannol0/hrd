const { Pool } = require('pg');
const { unlink } = require('fs/promises');
const { join } = require('path');
require('dotenv').config();

async function cleanupExpiredExports() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const exportDirectory = process.env.EXPORT_DIRECTORY || './exports';

  console.log('Starting cleanup of expired exports...');
  const startTime = Date.now();

  try {
    const query = `
      SELECT id, file_path, file_id
      FROM export_requests
      WHERE status = 'completed'
        AND url_expires_at IS NOT NULL
        AND url_expires_at < NOW()
    `;

    const result = await pool.query(query);
    const expiredExports = result.rows;

    console.log(`Found ${expiredExports.length} expired exports`);

    let deletedFiles = 0;
    let deletedRecords = 0;

    for (const exportRecord of expiredExports) {
      if (exportRecord.file_path) {
        try {
          await unlink(exportRecord.file_path);
          deletedFiles++;
          console.log(`✓ Deleted file: ${exportRecord.file_path}`);
        } catch (error) {
          console.warn(`⚠ Could not delete file ${exportRecord.file_path}:`, error.message);
        }
      }

      try {
        await pool.query('DELETE FROM export_requests WHERE id = $1', [exportRecord.id]);
        deletedRecords++;
      } catch (error) {
        console.error(`✗ Could not delete record ${exportRecord.id}:`, error.message);
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`\n✓ Cleanup completed in ${totalDuration}ms`);
    console.log(`  - Deleted ${deletedFiles} files`);
    console.log(`  - Deleted ${deletedRecords} database records`);
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cleanupExpiredExports();
