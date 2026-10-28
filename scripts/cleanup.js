const { pool } = require('../config/db');
const { destroyFiles } = require('./cloudinary-files');

async function cleanupOldData() {
  console.log('Starting data cleanup...');
  
  try {
    // Files belonging to the rows about to be deleted. The database rows go via
    // CASCADE, but the files in Cloudinary must be removed separately or they
    // would sit there using storage forever.
    const oldBulletinFiles = await pool.query(`
      SELECT filename, file_path, mime_type FROM attachments
      WHERE bulletin_id IN (SELECT id FROM bulletins WHERE created_at < NOW() - INTERVAL '2 years')
    `);
    const oldMessageFiles = await pool.query(`
      SELECT filename, file_path, mime_type FROM attachments
      WHERE message_id IN (SELECT id FROM messages WHERE created_at < NOW() - INTERVAL '1 year')
    `);

    // Delete bulletins older than 2 years
    const bulletinResult = await pool.query(`
      DELETE FROM bulletins 
      WHERE created_at < NOW() - INTERVAL '2 years'
    `);
    
    if (bulletinResult.rowCount > 0) {
      console.log(`✓ Deleted ${bulletinResult.rowCount} bulletins older than 2 years`);
    }
    
    // Delete messages older than 1 year
    const messageResult = await pool.query(`
      DELETE FROM messages 
      WHERE created_at < NOW() - INTERVAL '1 year'
    `);
    
    if (messageResult.rowCount > 0) {
      console.log(`✓ Deleted ${messageResult.rowCount} messages older than 1 year`);
    }

    // Now remove the uploaded files themselves
    const removed = await destroyFiles([...oldBulletinFiles.rows, ...oldMessageFiles.rows]);
    if (removed > 0) {
      console.log(`✓ Removed ${removed} stored files from Cloudinary`);
    }
    
    // Clean up orphaned thread participants (threads where all messages are deleted)
    const orphanedThreads = await pool.query(`
      DELETE FROM thread_participants 
      WHERE thread_id NOT IN (SELECT DISTINCT thread_id FROM messages WHERE thread_id IS NOT NULL)
    `);
    
    if (orphanedThreads.rowCount > 0) {
      console.log(`✓ Cleaned up ${orphanedThreads.rowCount} orphaned thread participants`);
    }
    
    // Clean up orphaned read status entries
    const orphanedBulletinReads = await pool.query(`
      DELETE FROM bulletin_reads 
      WHERE bulletin_id NOT IN (SELECT id FROM bulletins)
    `);
    
    if (orphanedBulletinReads.rowCount > 0) {
      console.log(`✓ Cleaned up ${orphanedBulletinReads.rowCount} orphaned bulletin read entries`);
    }
    
    const orphanedMessageReads = await pool.query(`
      DELETE FROM message_reads 
      WHERE message_id NOT IN (SELECT id FROM messages)
    `);
    
    if (orphanedMessageReads.rowCount > 0) {
      console.log(`✓ Cleaned up ${orphanedMessageReads.rowCount} orphaned message read entries`);
    }
    
    console.log('✓ Data cleanup completed');
    
  } catch (err) {
    console.error('✗ Error during data cleanup:', err.message);
  }
}

// Track last cleanup time
let lastCleanup = null;

async function runDailyCleanup() {
  const now = new Date();
  
  // Only run once per day
  if (!lastCleanup || (now - lastCleanup) > 24 * 60 * 60 * 1000) {
    await cleanupOldData();
    lastCleanup = now;
  }
}

// Export for use in server.js
module.exports = { cleanupOldData, runDailyCleanup };

// Allow running directly for manual cleanup
if (require.main === module) {
  cleanupOldData()
    .then(() => {
      console.log('Manual cleanup completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Manual cleanup failed:', err);
      process.exit(1);
    });
}
