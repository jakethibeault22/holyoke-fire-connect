const { Pool } = require('pg');

const pool = new Pool({
  host: 'db.elvkfezgjhqjbtsnpvod.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'afrUM6rFojLEHP6H',
  ssl: {
    rejectUnauthorized: false
  },
  // Force IPv4
  options: '-c search_path=public'
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to PostgreSQL database:', err.stack);
  } else {
    console.log('Successfully connected to PostgreSQL database');
    release();
  }
});

module.exports = { pool };