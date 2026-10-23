const { pool } = require('../config/db');

async function initDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating tables...');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_admin INTEGER DEFAULT 0,
        role VARCHAR(50) DEFAULT 'firefighter',
        status VARCHAR(20) DEFAULT 'pending',
        must_change_password BOOLEAN DEFAULT FALSE,
        expo_push_token TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Columns added after the first release (no-ops when they already exist)
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT');

    // User roles table (for multiple roles)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        UNIQUE(user_id, role)
      )
    `);

    // Bulletins table
    await client.query(`
      CREATE TABLE IF NOT EXISTS bulletins (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'west-wing',
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        thread_id INTEGER,
        parent_message_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Thread participants table
    await client.query(`
      CREATE TABLE IF NOT EXISTS thread_participants (
        id SERIAL PRIMARY KEY,
        thread_id INTEGER NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(thread_id, user_id)
      )
    `);

    // Attachments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS attachments (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type VARCHAR(100),
        bulletin_id INTEGER REFERENCES bulletins(id) ON DELETE CASCADE,
        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Bulletin reads table
    await client.query(`
      CREATE TABLE IF NOT EXISTS bulletin_reads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        bulletin_id INTEGER REFERENCES bulletins(id) ON DELETE CASCADE,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, bulletin_id)
      )
    `);

    // Message reads table
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_reads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, message_id)
      )
    `);

    // Password reset requests table. routes/api.js used to create its own
    // version of this table (with username/name but no resolved_*), so the
    // ALTERs below bring either version up to the full set of columns.
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        username VARCHAR(255),
        name VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP,
        resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await client.query('ALTER TABLE password_reset_requests ADD COLUMN IF NOT EXISTS username VARCHAR(255)');
    await client.query('ALTER TABLE password_reset_requests ADD COLUMN IF NOT EXISTS name VARCHAR(255)');
    await client.query('ALTER TABLE password_reset_requests ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP');
    await client.query('ALTER TABLE password_reset_requests ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL');

    // Push tokens table (the API currently stores tokens in users.expo_push_token)
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // File library table
    await client.query(`
      CREATE TABLE IF NOT EXISTS file_library (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        filename VARCHAR(255) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type VARCHAR(100),
        category VARCHAR(50) DEFAULT 'general',
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes for the queries the app runs constantly (inbox, threads, bulletins,
    // attachments, and the cascading deletes the cleanup job triggers)
    await client.query('CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_thread_participants_user ON thread_participants(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bulletins_category_created ON bulletins(category, created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_attachments_bulletin ON attachments(bulletin_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_message_reads_message ON message_reads(message_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bulletin_reads_bulletin ON bulletin_reads(bulletin_id)');

    console.log('Tables created successfully');

    // NOTE: no default admin account is created here. server.js creates the first
    // admin on startup, only if none exists, using the INITIAL_ADMIN_PASSWORD
    // environment variable.

    await client.query('COMMIT');
    console.log('Database initialization completed successfully');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }

  // Logins are case-insensitive (LOWER(username)), so two usernames that differ
  // only by case would be ambiguous. Enforce uniqueness the same way. This is
  // outside the transaction so that existing duplicates can't block startup.
  try {
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username))');
  } catch (err) {
    console.warn('⚠ Could not enforce case-insensitive unique usernames. Duplicates may already exist:', err.message);
    try {
      const dupes = await pool.query(
        'SELECT LOWER(username) AS username, COUNT(*) FROM users GROUP BY LOWER(username) HAVING COUNT(*) > 1'
      );
      dupes.rows.forEach(d => console.warn(`  duplicate username (case-insensitive): ${d.username} x${d.count}`));
    } catch (e) { /* ignore */ }
  }
}

// Only run if called directly (not required as module)
if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('✓ Database ready');
      process.exit(0);
    })
    .catch(err => {
      console.error('✗ Database initialization failed:', err);
      process.exit(1);
    });
}

module.exports = { initDatabase };
