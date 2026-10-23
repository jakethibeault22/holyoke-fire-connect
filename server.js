const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Render terminates TLS at a proxy; this makes req.ip / req.secure reflect the real client
app.set('trust proxy', 1);

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// Middleware. File uploads go through multer (multipart), so JSON/form bodies
// never need to be large. The old 200mb limit let anyone exhaust memory.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// (CORS removed: the React app is served from this same origin.)

// Ensure data directories exist
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// API routes (routes/api.js throws at load if SESSION_SECRET is missing)
const apiRouter = require('./routes/api');
app.use('/api', apiRouter);

// Unknown /api paths get a JSON 404 instead of the React index.html
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve static files from React build
const distPath = path.join(__dirname, 'dist');
console.log('📁 Checking for dist folder at:', distPath);
console.log('📁 Dist folder exists:', fs.existsSync(distPath));
if (fs.existsSync(distPath)) {
  const distContents = fs.readdirSync(distPath);
  console.log('📁 Dist folder contents:', distContents);

  const assetsPath = path.join(distPath, 'assets');
  if (fs.existsSync(assetsPath)) {
    const assetsContents = fs.readdirSync(assetsPath);
    console.log('📁 Assets folder contents:', assetsContents);
  } else {
    console.log('❌ Assets folder NOT FOUND');
  }
}
app.use(express.static(distPath));

// All other routes serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Last-resort error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Server error' });
});

// Log instead of crashing on stray promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);

  // Auto-initialize database tables on startup
  try {
    const { initDatabase } = require('./scripts/init-db');
    await initDatabase();
    console.log('✔ Database initialized');
  } catch (err) {
    console.error('✗ Database init error:', err.message);
  }

  // Ensure an admin exists (only creates one if NONE exists)
  const { pool } = require('./config/db');

  try {
    const adminCheck = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' OR role = 'super_user'"
    );

    if (adminCheck.rows.length > 0) {
      console.log(`✓ Found ${adminCheck.rows.length} admin user(s)`);
    } else {
      // The initial password must be supplied via environment variable.
      // There is no built-in default password.
      const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;

      if (!initialPassword || initialPassword.length < 12) {
        console.error('✗ No admin user exists. Set INITIAL_ADMIN_PASSWORD (12+ characters) and restart to create one.');
      } else {
        console.log('No admin users found - creating super admin...');
        const hashedPassword = bcrypt.hashSync(initialPassword, 10);

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

        console.log('✓ Super admin created. Username: superadmin');
      }
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
