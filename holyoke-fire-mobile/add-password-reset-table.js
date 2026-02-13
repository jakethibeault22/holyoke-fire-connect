const { pool } = require('./db');

async function addPasswordResetTable() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Creating password_reset_requests table...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);
    
    console.log('Adding must_change_password column to users table...');
    
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE
    `);
    
    await client.query('COMMIT');
    console.log('✓ Password reset tables added successfully');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Error adding password reset tables:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addPasswordResetTable()
    .then(() => {
      console.log('✓ Migration complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('✗ Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { addPasswordResetTable };