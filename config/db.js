const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
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
```

**AND update your DATABASE_URL in Render to use the transaction pooler:**
```
postgresql://postgres.elvkfezgjhqjbtsnpvod:afrUM6rFojLEHP6H@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require