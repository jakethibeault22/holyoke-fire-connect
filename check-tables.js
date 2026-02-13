const { pool } = require('./config/db');

async function checkTables() {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('Tables in database:');
    result.rows.forEach(row => console.log('  -', row.table_name));
    
    const hasPasswordResetTable = result.rows.some(row => row.table_name === 'password_reset_requests');
    console.log('\nPassword reset table exists:', hasPasswordResetTable);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkTables();