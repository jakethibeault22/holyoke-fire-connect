const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  host: 'db.elvkfezgjhqjbtsnpvod.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'afrUM6rFojLEHP6H'
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
