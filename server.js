const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Ensure data directories exist
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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
  
  // Ensure super admin user exists (safe - only creates if missing)
  const { pool } = require('./config/db');
  const crypto = require('crypto');
  
  function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }
  
  try {
    // Check if ANY admin user exists
    const adminCheck = await pool.query(
      "SELECT * FROM users WHERE role = 'admin' OR role = 'super_user'"
    );
    
    if (adminCheck.rows.length === 0) {
      console.log('No admin users found - creating super admin...');
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
      
      console.log('✓ Super admin created! Username: superadmin, Password: SuperAdmin123!');
    } else {
      console.log(`✓ Found ${adminCheck.rows.length} admin user(s)`);
    }
    
    // Log total user count for debugging
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    console.log(`✓ Total users in database: ${userCount.rows[0].count}`);
    
  } catch (err) {
    console.error('✗ Super admin check error:', err.message);
  }
  
  // Run automatic cleanup of old data (once per day)
  try {
    const { runDailyCleanup } = require('./scripts/cleanup');
    
    // Run cleanup on startup
    await runDailyCleanup();
    
    // Set up daily cleanup check (every 6 hours, but only runs once per day)
    setInterval(async () => {
      await runDailyCleanup();
    }, 6 * 60 * 60 * 1000); // Check every 6 hours
    
  } catch (err) {
    console.error('✗ Cleanup initialization error:', err.message);
  }
});
