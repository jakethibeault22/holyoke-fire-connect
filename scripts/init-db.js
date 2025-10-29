const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'db.sqlite');
const db = new Database(dbPath);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    role TEXT DEFAULT 'firefighter',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, role)
  );

  CREATE TABLE IF NOT EXISTS bulletins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT DEFAULT 'west-wing',
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    thread_id TEXT,
    parent_message_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (recipient_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    bulletin_id INTEGER,
    message_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bulletin_id) REFERENCES bulletins(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bulletin_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    bulletin_id INTEGER NOT NULL,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (bulletin_id) REFERENCES bulletins(id) ON DELETE CASCADE,
    UNIQUE(user_id, bulletin_id)
  );

  CREATE TABLE IF NOT EXISTS message_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    UNIQUE(user_id, message_id)
  );
`);

// Check if admin user exists, if not create default users
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');

if (!adminExists) {
  console.log('Creating default users...');
  
  const users = [
    { email: 'admin@holyokefd.gov', name: 'Admin User', username: 'admin', password: 'admin123', role: 'admin', isAdmin: 1 },
    { email: 'chief@holyokefd.gov', name: 'Fire Chief', username: 'chief', password: 'chief123', role: 'chief', isAdmin: 0 },
    { email: 'officer@holyokefd.gov', name: 'Officer Smith', username: 'officer', password: 'officer123', role: 'officer', isAdmin: 0 },
    { email: 'firefighter@holyokefd.gov', name: 'Firefighter Jones', username: 'firefighter', password: 'fire123', role: 'firefighter', isAdmin: 0 }
  ];

  const insertUser = db.prepare(
    'INSERT INTO users (email, name, username, password_hash, is_admin, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const insertRole = db.prepare(
    'INSERT INTO user_roles (user_id, role) VALUES (?, ?)'
  );

  users.forEach(user => {
    const result = insertUser.run(
      user.email,
      user.name,
      user.username,
      hashPassword(user.password),
      user.isAdmin,
      user.role,
      'active'
    );
    
    insertRole.run(result.lastInsertRowid, user.role);
  });

  console.log('Default users created successfully!');
}

db.close();
console.log('Database initialized successfully!');