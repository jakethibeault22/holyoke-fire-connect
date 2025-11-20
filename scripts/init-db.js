const { pool } = require('../config/db');
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
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
    
    console.log('Tables created successfully');
    
    // Check if super admin exists
    const adminCheck = await client.query(
      "SELECT * FROM users WHERE username = 'admin'"
    );
    
    if (adminCheck.rows.length === 0) {
      console.log('Creating super admin user...');
      const adminPassword = hashPassword('admin123');
      
      const result = await client.query(
        `INSERT INTO users (email, name, username, password_hash, is_admin, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        ['admin@holyokefire.com', 'Administrator', 'admin', adminPassword, 1, 'admin', 'active']
      );
      
      const adminId = result.rows[0].id;
      
      // Add admin role to user_roles table
      await client.query(
        'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
        [adminId, 'admin']
      );
      
      console.log('Super admin created (username: admin, password: admin123)');
    } else {
      console.log('Super admin already exists');
    }
    
    await client.query('COMMIT');
    console.log('Database initialization completed successfully');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', err);
    throw err;
  } finally {
    client.release();
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
