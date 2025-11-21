const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure data directories exist
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize database tables (one-time)
const { initDatabase } = require('./scripts/init-db');
initDatabase().then(() => {
  console.log('Database tables ready');
}).catch(err => {
  console.error('Database init error:', err);
});

// API routes
const apiRouter = require('./routes/api');
app.use('/api', apiRouter);

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'dist')));

// All other routes serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Create super user if it doesn't exist
  const { pool } = require('./config/db');
  const crypto = require('crypto');
  
  function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }
  
  try {
    const check = await pool.query("SELECT * FROM users WHERE username = 'superadmin'");
    
    if (check.rows.length === 0) {
      const password = 'SuperAdmin123!';
      const hashedPassword = hashPassword(password);
      
      const result = await pool.query(
        `INSERT INTO users (email, name, username, password_hash, is_admin, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        ['superadmin@holyokefire.com', 'Super Administrator', 'superadmin', hashedPassword, 1, 'super_user', 'active']
      );
      
      await pool.query(
        'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
        [result.rows[0].id, 'super_user']
      );
      
      console.log('✓ Super user created! Username: superadmin, Password: SuperAdmin123!');
    }
  } catch (err) {
    console.error('Super user creation error:', err);
  }
});