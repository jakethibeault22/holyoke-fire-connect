const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const backup = require('../scripts/backup');
const { pool } = require('../config/db');

const {
  loginUser,
  getUserById,
  getUsers,
  getPendingUsers,
  registerUser,
  approveUser,
  rejectUser,
  getBulletinsByCategory,
  addBulletin,
  deleteBulletin,
  getInbox,
  getSent,
  sendMessage,
  getThreadMessages,
  deleteMessage,
  addAttachment,
  getAttachmentsByBulletin,
  getAttachmentsByMessage,
  deleteAttachment,
  createUser,
  updateUser,
  deleteUser,
  resetPassword,
  changePassword,
  verifyPassword,
  canViewBulletin,
  canPostBulletin,
  canDeleteBulletin,
  getUsersByRole
} = require('../main');

// ---------------------------------------------------------------------------
// Session configuration
//   Web app:    httpOnly cookie (JavaScript can't read it)
//   Mobile app: send  client: 'mobile'  in the login body, store the returned
//               token, and send it as  Authorization: Bearer <token>
// ---------------------------------------------------------------------------
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET environment variable must be set (32+ characters)');
}

const COOKIE_NAME = 'hfc_session';
const WEB_SESSION_HOURS = 12;
const MOBILE_SESSION_DAYS = 30;
const MIN_PASSWORD = 8;

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/'
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Express 4 does not catch rejected promises; this forwards them to the error handler
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const rolesOf = (u) => u.roles || [u.role];
const isAdminUser = (u) => rolesOf(u).some(r => r === 'admin' || r === 'super_user');
const isChiefOrAdmin = (u) => rolesOf(u).some(r => r === 'fire_chief' || r === 'admin' || r === 'super_user');

async function userCanViewBulletinId(user, bulletinId) {
  const r = await pool.query('SELECT category FROM bulletins WHERE id = $1', [bulletinId]);
  if (r.rows.length === 0) return false;
  return canViewBulletin(user.id, r.rows[0].category);
}

async function userInThread(userId, threadId) {
  const r = await pool.query(
    'SELECT 1 FROM thread_participants WHERE thread_id = $1 AND user_id = $2',
    [threadId, userId]
  );
  return r.rows.length > 0;
}

async function userInThreadOfMessage(userId, messageId) {
  const r = await pool.query(
    `SELECT 1 FROM messages m
     JOIN thread_participants tp ON tp.thread_id = m.thread_id
     WHERE m.id = $1 AND tp.user_id = $2`,
    [messageId, userId]
  );
  return r.rows.length > 0;
}

// Locally stored files: only these types may render inline. Everything else is
// forced to download so an uploaded .html/.svg can never run script on our origin.
const INLINE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf'];

// Serves an attachment/library file: Cloudinary (http) files redirect,
// legacy local files are sent from disk.
function sendStoredFile(res, record) {
  if (record.file_path && record.file_path.startsWith('http')) {
    return res.redirect(record.file_path);
  }

  const filePath = path.resolve(record.file_path);
  if (!fs.existsSync(filePath)) {
    console.error('File not found on disk:', filePath);
    return res.status(404).json({ error: 'File not found on disk' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const ext = path.extname(filePath).toLowerCase();
  if (!INLINE_EXT.includes(ext)) {
    const name = encodeURIComponent(record.original_filename || record.filename);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${name}`);
  }
  return res.sendFile(filePath);
}

// Expo push: max 100 messages per request
async function sendExpoPush(messages) {
  for (let i = 0; i < messages.length; i += 100) {
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
    } catch (err) {
      console.error('Push error:', err.message);
    }
  }
}

const CATEGORY_LABELS = {
  'west-wing': 'Chiefs',
  'training': 'Training',
  'fire-prevention': 'Fire Prevention',
  'repair-division': 'Repair Division',
  'alarm-division': 'Alarm Division',
  'commissioners': 'Commissioners'
};

// ---------------------------------------------------------------------------
// Authentication middleware
// ---------------------------------------------------------------------------
// '/display/feed' is authenticated by its own display key inside the route
const publicRoutes = ['/login', '/register', '/logout', '/request-password-reset', '/display/feed'];

// Firehouse display options
const DISPLAY_DURATIONS = [60, 240, 720, 1440, 4320, 10080]; // minutes: 1h, 4h, 12h, 24h, 3d, 7d
const NO_DISPLAY_CATEGORIES = ['commissioners'];             // never shown on the wall TVs
const ROTATE_OPTIONS = [0, 10, 15, 20, 30, 45, 60, 90, 120]; // seconds per bulletin (0 = automatic)

const requireAuth = async (req, res, next) => {
  if (publicRoutes.includes(req.path)) {
    return next();
  }

  const authHeader = req.get('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = bearer || (req.cookies && req.cookies[COOKIE_NAME]);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, SESSION_SECRET, { algorithms: ['HS256'] });
    // Reload the user every request so role changes, deletions and
    // deactivations take effect immediately
    const user = await getUserById(payload.id);
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.user = user;

    // Sliding web session: the app polls every 10 seconds, so as long as it's
    // open the cookie keeps getting extended. It only expires after 12 hours
    // of inactivity (so a 24-hour shift doesn't log anyone out mid-message).
    if (!bearer && payload.iat && Date.now() / 1000 - payload.iat > 3600) {
      const fresh = jwt.sign({ id: user.id }, SESSION_SECRET, {
        algorithm: 'HS256',
        expiresIn: `${WEB_SESSION_HOURS}h`
      });
      res.cookie(COOKIE_NAME, fresh, { ...cookieOptions(), maxAge: WEB_SESSION_HOURS * 60 * 60 * 1000 });
    }

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication required' });
  }
};

router.use(requireAuth);

// ---------------------------------------------------------------------------
// File uploads (Cloudinary, with local-disk fallback)
// ---------------------------------------------------------------------------
let upload;
let cloudinaryClient = null;
try {
  const cloudinary = require('cloudinary').v2;
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  cloudinaryClient = cloudinary;

  const cloudinaryStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const isImage = file.mimetype.startsWith('image/');
      const isVideo = file.mimetype.startsWith('video/');
      const ext = file.originalname.split('.').pop().toLowerCase();
      const baseName = Date.now() + '-' + Math.round(Math.random() * 1E9);
      return {
        folder: 'holyoke-fire-connect',
        resource_type: isImage ? 'image' : isVideo ? 'video' : 'raw',
        type: 'upload',
        public_id: `${baseName}.${ext}`,
      };
    },
  });

  upload = multer({ storage: cloudinaryStorage, limits: { fileSize: 200 * 1024 * 1024 } });
  console.log('✔ Cloudinary storage configured');
} catch (err) {
  console.warn('⚠ Cloudinary not available, falling back to local disk storage:', err.message);
  const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.resolve(__dirname, '../../data/uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
      cb(null, uniqueName);
    }
  });
  upload = multer({ storage: diskStorage, limits: { fileSize: 200 * 1024 * 1024 } });
}

// Uploads happen before the route's permission checks run, so a rejected
// request has to clean up the files it already stored.
const discardUploads = (req) => {
  const files = req.files || (req.file ? [req.file] : []);
  files.forEach(f => {
    if (cloudinaryClient && f.path && f.path.startsWith('http') && f.filename) {
      const mime = f.mimetype || '';
      const resourceType = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'raw';
      cloudinaryClient.uploader.destroy(f.filename, { resource_type: resourceType }).catch(() => {});
    } else if (f.path && !f.path.startsWith('http')) {
      fs.unlink(f.path, () => {});
    }
  });
};

const saveAttachments = async (files, bulletinId, messageId) => {
  for (const file of (files || [])) {
    await addAttachment(
      file.filename || file.original_filename,
      file.originalname || file.original_filename,
      file.secure_url || file.url || file.path,
      file.bytes || file.size || 0,
      file.mimetype || file.resource_type,
      bulletinId,
      messageId
    );
  }
};

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------
router.post('/register', h(async (req, res) => {
  const { email, name, username, password } = req.body || {};

  if (!email || !name || !username || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
  }

  const result = await registerUser(email, name, username, password);

  if (result.error) {
    res.status(400).json(result);
  } else {
    res.json({ success: true, message: 'Registration submitted. Please wait for admin approval.' });
  }
}));

router.post('/login', h(async (req, res) => {
  const { username, password, client } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required' });
  }

  const result = await loginUser(username, password);

  if (!result) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
  if (result.error) {
    return res.status(403).json({ success: false, error: result.error });
  }

  const isMobile = client === 'mobile' || req.get('X-Client') === 'mobile';

  if (isMobile) {
    // Mobile apps keep the token themselves (SecureStore) and send it as a Bearer header
    const token = jwt.sign({ id: result.id }, SESSION_SECRET, {
      algorithm: 'HS256',
      expiresIn: `${MOBILE_SESSION_DAYS}d`
    });
    return res.json({ success: true, user: result, token });
  }

  const token = jwt.sign({ id: result.id }, SESSION_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${WEB_SESSION_HOURS}h`
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: WEB_SESSION_HOURS * 60 * 60 * 1000 });
  res.json({ success: true, user: result });
}));

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.json({ success: true });
});

// Current session user (used by the clients on startup)
router.get('/me', (req, res) => {
  res.json(req.user);
});

// Get a user (self or admin only)
router.get('/user/:id', h(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id !== req.user.id && !isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const user = await getUserById(id);
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
}));

// User changes their own password. After an admin reset (must_change_password)
// the current password isn't required; otherwise it is.
router.post('/change-password', h(async (req, res) => {
  const { newPassword, currentPassword } = req.body || {};
  if (!newPassword) {
    return res.status(400).json({ error: 'newPassword required' });
  }

  if (!req.user.must_change_password) {
    if (!currentPassword || !(await verifyPassword(req.user.id, currentPassword))) {
      return res.status(403).json({ error: 'Current password is incorrect' });
    }
  }

  const result = await changePassword(req.user.id, newPassword);
  if (result.error) {
    return res.status(400).json(result);
  }
  res.json({ success: true });
}));

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
router.get('/users', h(async (req, res) => {
  res.json(await getUsers());
}));

router.get('/users/by-role/:role', h(async (req, res) => {
  res.json(await getUsersByRole(req.params.role));
}));

// Save Expo push token (own token only)
router.post('/users/:id/push-token', h(async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token required' });

  await pool.query('UPDATE users SET expo_push_token = $1 WHERE id = $2', [token, userId]);
  res.json({ success: true });
}));

// ---------------------------------------------------------------------------
// Admin: approvals
// ---------------------------------------------------------------------------
router.get('/admin/pending-users', h(async (req, res) => {
  if (!isChiefOrAdmin(req.user)) {
    return res.status(403).json({ error: 'Unauthorized - Chief or Admin access required' });
  }
  res.json(await getPendingUsers());
}));

router.post('/admin/approve-user/:id', h(async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { assignedRole } = req.body || {};

  // main.js also enforces who may hand out admin-level roles
  const result = await approveUser(userId, assignedRole, req.user.id);

  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
}));

router.post('/admin/reject-user/:id', h(async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const result = await rejectUser(userId, req.user.id);

  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
}));

// ---------------------------------------------------------------------------
// Bulletins
// ---------------------------------------------------------------------------

// Bulletins the user may see (filtered by category permission)
router.get('/bulletins', h(async (req, res) => {
  const result = await pool.query(`
    SELECT b.*, u.name as author_name
    FROM bulletins b
    JOIN users u ON b.user_id = u.id
    ORDER BY b.created_at DESC
  `);

  const allowed = {};
  const visible = [];
  for (const bulletin of result.rows) {
    if (!(bulletin.category in allowed)) {
      allowed[bulletin.category] = await canViewBulletin(req.user.id, bulletin.category);
    }
    if (allowed[bulletin.category]) visible.push(bulletin);
  }

  res.json(visible);
}));

// All bulletins the user may see (id/category/date only) for unread indicators
router.get('/bulletins/all', h(async (req, res) => {
  const result = await pool.query('SELECT id, category, created_at FROM bulletins ORDER BY created_at DESC');

  const allowed = {};
  const visible = [];
  for (const bulletin of result.rows) {
    if (!(bulletin.category in allowed)) {
      allowed[bulletin.category] = await canViewBulletin(req.user.id, bulletin.category);
    }
    if (allowed[bulletin.category]) visible.push(bulletin);
  }

  res.json(visible);
}));

router.post('/bulletins', upload.array('files', 5), h(async (req, res) => {
    const { title, body } = req.body;
  const category = req.body.category || 'west-wing';

  // Optional: show on the firehouse displays for N minutes (0 = board only)
  const displayMinutes = parseInt(req.body.displayMinutes, 10) || 0;
  if (displayMinutes !== 0 && !DISPLAY_DURATIONS.includes(displayMinutes)) {
    discardUploads(req);
    return res.status(400).json({ error: 'Invalid display duration' });
  }
  if (displayMinutes > 0 && NO_DISPLAY_CATEGORIES.includes(category)) {
    discardUploads(req);
    return res.status(400).json({ error: 'Bulletins in this category cannot be shown on the displays' });
  }

  if (!title || !title.trim() || !body || !body.trim()) {
    discardUploads(req);
    return res.status(400).json({ error: 'Title and content are required' });
  }

  // addBulletin checks canPostBulletin for this user and category
  const result = await addBulletin(title, body, category, req.user.id, displayMinutes);

  if (result.error) {
    discardUploads(req);
    return res.status(403).json(result);
  }

  const bulletinId = result.lastInsertRowid;
  await saveAttachments(req.files, bulletinId, null);

  // Push notifications. Restricted categories only notify people who can view them,
  // otherwise the title and preview would leak to everyone with the app installed.
  try {
    const tokenResult = await pool.query(
      "SELECT id, expo_push_token FROM users WHERE expo_push_token IS NOT NULL AND status = 'active'"
    );

    let recipients = tokenResult.rows;
    if (category === 'alarm-division' || category === 'commissioners') {
      const filtered = [];
      for (const r of recipients) {
        if (await canViewBulletin(r.id, category)) filtered.push(r);
      }
      recipients = filtered;
    }

    const label = CATEGORY_LABELS[category] || (category.charAt(0).toUpperCase() + category.slice(1));
    const messages = recipients
      .map(r => r.expo_push_token)
      .filter(t => t && t.startsWith('ExponentPushToken'))
      .map(token => ({
        to: token,
        sound: 'default',
        title: `New Bulletin - ${label}`,
        body: `${title}: ${body.substring(0, 80)}`,
      }));

    await sendExpoPush(messages);
  } catch (err) {
    console.error('Push error:', err.message);
  }

  res.json({ success: true, id: bulletinId });
}));

// ---------------------------------------------------------------------------
// Firehouse displays (wall TVs)
// ---------------------------------------------------------------------------
const hashDisplayKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

// Read-only feed for the display computers. Authenticated by display key
// (see publicRoutes above), not by a user login, and it only ever returns
// bulletins that were flagged for the displays and haven't expired.
router.get('/display/feed', h(async (req, res) => {
  const key = req.query.key || req.get('X-Display-Key');
  if (!key) return res.status(401).json({ error: 'Display key required' });

  const device = await pool.query(
        'UPDATE display_keys SET last_seen = CURRENT_TIMESTAMP WHERE key_hash = $1 AND revoked_at IS NULL RETURNING id, rotate_seconds',
    [hashDisplayKey(key)]
  );
  if (device.rows.length === 0) return res.status(401).json({ error: 'Invalid display key' });

  const result = await pool.query(`
    SELECT b.id, b.title, b.body, b.category, u.name AS author_name,
           (EXTRACT(EPOCH FROM (b.display_until - CURRENT_TIMESTAMP)) * 1000)::bigint AS ms_remaining,
           (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - b.created_at)) * 1000)::bigint AS age_ms
    FROM bulletins b
    JOIN users u ON b.user_id = u.id
    WHERE b.display_until > CURRENT_TIMESTAMP
    ORDER BY b.created_at DESC
    LIMIT 20
  `);

    res.json({
    rotate_seconds: device.rows[0].rotate_seconds || 0,
    bulletins: result.rows.map(b => ({
      ...b,
      category_label: CATEGORY_LABELS[b.category] || (b.category.charAt(0).toUpperCase() + b.category.slice(1))
    }))
  });
}));

router.get('/display/keys', h(async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Admin access required' });
  const result = await pool.query(`
        SELECT id, name, created_at, COALESCE(rotate_seconds, 0) AS rotate_seconds,
           EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_seen))::int AS seen_ago_s
    FROM display_keys
    WHERE revoked_at IS NULL
    ORDER BY created_at
  `);
  res.json(result.rows);
}));

router.post('/display/keys', h(async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Admin access required' });

  const name = String(req.body.name || '').trim().slice(0, 100);
  if (!name) return res.status(400).json({ error: 'A name is required' });

  const count = await pool.query('SELECT COUNT(*) FROM display_keys WHERE revoked_at IS NULL');
  if (Number(count.rows[0].count) >= 20) {
    return res.status(400).json({ error: 'Too many active display links. Revoke one first.' });
  }

  // The key is shown once; only its hash is stored
  const key = crypto.randomBytes(32).toString('hex');
  const result = await pool.query(
    'INSERT INTO display_keys (name, key_hash) VALUES ($1, $2) RETURNING id, name',
    [name, hashDisplayKey(key)]
  );
  res.json({ id: result.rows[0].id, name: result.rows[0].name, key });
}));

router.patch('/display/keys/:id', h(async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Admin access required' });

  const seconds = parseInt(req.body.rotate_seconds, 10);
  if (!ROTATE_OPTIONS.includes(seconds)) {
    return res.status(400).json({ error: 'Invalid rotation time' });
  }

  const result = await pool.query(
    'UPDATE display_keys SET rotate_seconds = $1 WHERE id = $2 AND revoked_at IS NULL',
    [seconds, parseInt(req.params.id, 10) || 0]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Display not found' });
  res.json({ success: true });
}));

router.delete('/display/keys/:id', h(async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Admin access required' });
  await pool.query(
    'UPDATE display_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND revoked_at IS NULL',
    [parseInt(req.params.id, 10) || 0]
  );
  res.json({ success: true });
}));

// ---------------------------------------------------------------------------
// Database backups (admin only). Files are encrypted with BACKUP_ENCRYPTION_KEY.
// ---------------------------------------------------------------------------
const requireBackupAdmin = (req, res) => {
  if (!isAdminUser(req.user)) {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
};

router.get('/backups', h(async (req, res) => {
  if (!requireBackupAdmin(req, res)) return;
  res.json(await backup.getStatus());
}));

router.post('/backups', h(async (req, res) => {
  if (!requireBackupAdmin(req, res)) return;
  if (!backup.getKey()) {
    return res.status(400).json({ error: 'BACKUP_ENCRYPTION_KEY is not set on the server' });
  }
  try {
    const created = await backup.createStoredBackup({ pool });
    console.log(`Backup created by ${req.user.username}: ${created.name} (${created.bytes} bytes)`);
    res.json({ success: true, backup: created });
  } catch (err) {
    console.error('Backup failed:', err);
    res.status(500).json({ error: (err && err.message) || 'Backup failed' });
  }
}));

// Fresh encrypted copy streamed straight to the admin's browser (nothing is stored)
router.get('/backups/download-now', h(async (req, res) => {
  if (!requireBackupAdmin(req, res)) return;
  if (!backup.getKey()) {
    return res.status(400).json({ error: 'BACKUP_ENCRYPTION_KEY is not set on the server' });
  }
  const { buffer, name } = await backup.createEncryptedBackup({ pool });
  console.log(`Backup downloaded by ${req.user.username}: ${name}`);
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${name}"`
  });
  res.send(buffer);
}));

// A stored backup: redirect to a signed Cloudinary link (the file is encrypted anyway)
router.get('/backups/file', h(async (req, res) => {
  if (!requireBackupAdmin(req, res)) return;
  const id = String(req.query.id || '');
  const cloud = backup.getCloud();
  if (!cloud || !backup.isBackupId(id)) {
    return res.status(400).json({ error: 'Invalid backup' });
  }
  res.redirect(backup.signedUrl(id, cloud));
}));

router.get('/bulletins/permissions/:category', h(async (req, res) => {
  const category = req.params.category;
  res.json({
    canView: await canViewBulletin(req.user.id, category),
    canPost: await canPostBulletin(req.user.id, category),
    canDelete: await canDeleteBulletin(req.user.id, category)
  });
}));

router.get('/bulletins/category/:category', h(async (req, res) => {
  const category = req.params.category;

  if (!(await canViewBulletin(req.user.id, category))) {
    return res.status(403).json({ error: 'Not authorized to view this category' });
  }

  res.json(await getBulletinsByCategory(category));
}));

router.get('/bulletins/can-view/:category', h(async (req, res) => {
  res.json({ canView: await canViewBulletin(req.user.id, req.params.category) });
}));

router.post('/bulletins/mark-read', h(async (req, res) => {
  const bulletinId = parseInt((req.body || {}).bulletinId, 10);
  if (!Number.isInteger(bulletinId)) {
    return res.status(400).json({ error: 'bulletinId required' });
  }

  await pool.query(
    `INSERT INTO bulletin_reads (user_id, bulletin_id, read_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT DO NOTHING`,
    [req.user.id, bulletinId]
  );

  res.json({ success: true });
}));

router.delete('/bulletins/:id', h(async (req, res) => {
  // deleteBulletin allows the author, or anyone with canDeleteBulletin for the category
  const result = await deleteBulletin(parseInt(req.params.id, 10), req.user.id);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
}));

router.get('/bulletins/:id/attachments', h(async (req, res) => {
  const bulletinId = parseInt(req.params.id, 10);
  if (!(await userCanViewBulletinId(req.user, bulletinId))) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  res.json(await getAttachmentsByBulletin(bulletinId));
}));

// Download/serve bulletin attachment (Cloudinary redirect, or local disk for legacy files)
router.get('/bulletins/:bulletinId/attachments/:attachmentId', h(async (req, res) => {
  const bulletinId = parseInt(req.params.bulletinId, 10);
  const attachmentId = parseInt(req.params.attachmentId, 10);

  if (!(await userCanViewBulletinId(req.user, bulletinId))) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const result = await pool.query(
    'SELECT * FROM attachments WHERE id = $1 AND bulletin_id = $2',
    [attachmentId, bulletinId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Attachment not found' });
  }

  sendStoredFile(res, result.rows[0]);
}));

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
router.get('/messages/inbox/:userId', h(async (req, res) => {
  if (parseInt(req.params.userId, 10) !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(await getInbox(req.user.id));
}));

router.get('/messages/sent/:userId', h(async (req, res) => {
  if (parseInt(req.params.userId, 10) !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(await getSent(req.user.id));
}));

router.post('/messages', upload.array('files', 5), h(async (req, res) => {
  const { to, subject, body, threadId, parentMessageId } = req.body;

  let recipients;
  try {
    recipients = JSON.parse(to).map(Number);
  } catch (err) {
    discardUploads(req);
    return res.status(400).json({ error: 'Invalid recipients' });
  }

  if (recipients.length === 0 || !recipients.every(Number.isInteger)) {
    discardUploads(req);
    return res.status(400).json({ error: 'At least one recipient is required' });
  }
  if (!subject || !subject.trim() || !body || !body.trim()) {
    discardUploads(req);
    return res.status(400).json({ error: 'Subject and message are required' });
  }

  // Every recipient must be a real, active user
  const valid = await pool.query(
    "SELECT id FROM users WHERE id = ANY($1::int[]) AND status = 'active'",
    [recipients]
  );
  if (valid.rows.length !== new Set(recipients).size) {
    discardUploads(req);
    return res.status(400).json({ error: 'One or more recipients are invalid' });
  }

  // Replying into an existing thread requires being a participant
  let threadIdInt = null;
  if (threadId) {
    threadIdInt = parseInt(threadId, 10);
    if (!(await userInThread(req.user.id, threadIdInt))) {
      discardUploads(req);
      return res.status(403).json({ error: 'Not authorized to post in this thread' });
    }
  }
  const parentIdInt = parentMessageId ? parseInt(parentMessageId, 10) : null;

  const result = await sendMessage(req.user.id, recipients, subject, body, threadIdInt, parentIdInt);
  const messageId = result.lastInsertRowid;

  // Mark as read for the sender
  await pool.query(
    'INSERT INTO message_reads (user_id, message_id, read_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING',
    [req.user.id, messageId]
  );

  await saveAttachments(req.files, null, messageId);

  // Push notifications to recipients
  try {
    const tokenResult = await pool.query(
      'SELECT expo_push_token FROM users WHERE id = ANY($1::int[]) AND expo_push_token IS NOT NULL',
      [recipients]
    );
    const messages = tokenResult.rows
      .map(r => r.expo_push_token)
      .filter(t => t && t.startsWith('ExponentPushToken'))
      .map(token => ({
        to: token,
        sound: 'default',
        title: `New Message from ${req.user.name || 'Someone'}`,
        body: subject,
      }));
    await sendExpoPush(messages);
  } catch (err) {
    console.error('Push error:', err.message);
  }

  res.json({ success: true, threadId: result.threadId, messageId: messageId });
}));

router.get('/messages/thread/:threadId', h(async (req, res) => {
  const threadId = parseInt(req.params.threadId, 10);
  if (!(await userInThread(req.user.id, threadId))) {
    return res.status(403).json({ error: 'Not authorized to view this thread' });
  }
  res.json(await getThreadMessages(threadId));
}));

router.get('/messages/thread/:threadId/participants', h(async (req, res) => {
  const threadId = parseInt(req.params.threadId, 10);
  if (!(await userInThread(req.user.id, threadId))) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const result = await pool.query(
    `SELECT user_id, users.name
     FROM thread_participants
     JOIN users ON thread_participants.user_id = users.id
     WHERE thread_id = $1`,
    [threadId]
  );

  res.json({ participants: result.rows });
}));

router.get('/messages/thread/:threadId/read-receipts', h(async (req, res) => {
  const threadId = parseInt(req.params.threadId, 10);
  if (!(await userInThread(req.user.id, threadId))) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const result = await pool.query(
    `SELECT mr.message_id, mr.user_id, u.name, mr.read_at
     FROM message_reads mr
     JOIN messages m ON mr.message_id = m.id
     JOIN users u ON mr.user_id = u.id
     WHERE m.thread_id = $1
     ORDER BY mr.read_at DESC`,
    [threadId]
  );

  const grouped = {};
  result.rows.forEach(receipt => {
    if (!grouped[receipt.message_id]) {
      grouped[receipt.message_id] = [];
    }
    grouped[receipt.message_id].push({
      userId: receipt.user_id,
      name: receipt.name,
      readAt: receipt.read_at
    });
  });

  res.json(grouped);
}));

router.post('/messages/mark-read', h(async (req, res) => {
  const messageId = parseInt((req.body || {}).messageId, 10);
  if (!Number.isInteger(messageId)) {
    return res.status(400).json({ error: 'messageId required' });
  }
  if (!(await userInThreadOfMessage(req.user.id, messageId))) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  await pool.query(
    `INSERT INTO message_reads (user_id, message_id, read_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT DO NOTHING`,
    [req.user.id, messageId]
  );

  res.json({ success: true });
}));

router.get('/messages/:messageId/read-receipts', h(async (req, res) => {
  const messageId = parseInt(req.params.messageId, 10);
  if (!(await userInThreadOfMessage(req.user.id, messageId))) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const result = await pool.query(
    `SELECT mr.user_id, mr.read_at, u.name
     FROM message_reads mr
     JOIN users u ON mr.user_id = u.id
     WHERE mr.message_id = $1
     ORDER BY mr.read_at DESC`,
    [messageId]
  );

  res.json(result.rows);
}));

router.delete('/messages/:id', h(async (req, res) => {
  const result = await deleteMessage(parseInt(req.params.id, 10), req.user.id);
  res.json({ success: result.changes > 0 });
}));

router.get('/messages/:id/attachments', h(async (req, res) => {
  const messageId = parseInt(req.params.id, 10);
  if (!(await userInThreadOfMessage(req.user.id, messageId))) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  res.json(await getAttachmentsByMessage(messageId));
}));

// Download/serve message attachment (Cloudinary redirect, or local disk for legacy files)
router.get('/messages/:messageId/attachments/:attachmentId', h(async (req, res) => {
  const messageId = parseInt(req.params.messageId, 10);
  const attachmentId = parseInt(req.params.attachmentId, 10);

  if (!(await userInThreadOfMessage(req.user.id, messageId))) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const result = await pool.query(
    'SELECT * FROM attachments WHERE id = $1 AND message_id = $2',
    [attachmentId, messageId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Attachment not found' });
  }

  sendStoredFile(res, result.rows[0]);
}));

// Delete attachment (admin only; the web app does not currently use this)
router.delete('/attachments/:id', h(async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const result = await deleteAttachment(parseInt(req.params.id, 10));
  res.json({ success: result.changes > 0 });
}));

// ---------------------------------------------------------------------------
// Read status
// ---------------------------------------------------------------------------
router.get('/read-status/:userId', h(async (req, res) => {
  if (parseInt(req.params.userId, 10) !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const bulletinsResult = await pool.query(
    'SELECT bulletin_id FROM bulletin_reads WHERE user_id = $1',
    [req.user.id]
  );
  const messagesResult = await pool.query(
    'SELECT message_id FROM message_reads WHERE user_id = $1',
    [req.user.id]
  );

  res.json({
    bulletins: bulletinsResult.rows.map(b => b.bulletin_id),
    messages: messagesResult.rows.map(m => m.message_id)
  });
}));

// ---------------------------------------------------------------------------
// Admin user management (main.js also re-checks admin status)
// ---------------------------------------------------------------------------
router.post('/admin/users', h(async (req, res) => {
  const { email, name, username, password, roles } = req.body || {};

  if (!password || password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
  }

  const result = await createUser(email, name, username, password, roles, req.user.id);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: true, id: result.id || result.lastInsertRowid });
  }
}));

router.put('/admin/users/:id', h(async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { email, name, username, roles } = req.body || {};
  const result = await updateUser(userId, email, name, username, roles, req.user.id);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: true, id: result.id || result.lastInsertRowid });
  }
}));

router.delete('/admin/users/:id', h(async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const result = await deleteUser(userId, req.user.id);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
}));

router.post('/admin/users/:id/reset-password', h(async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { newPassword } = req.body || {};

  if (!newPassword || newPassword.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
  }

  // forces the user to choose a new password at next login (must_change_password)
  const result = await resetPassword(userId, newPassword, req.user.id);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
}));

router.get('/admin/export-sql', h(async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  res.json({ message: 'PostgreSQL backup should be done through Render dashboard or Supabase dashboard' });
}));

// ---------------------------------------------------------------------------
// Password reset requests
// ---------------------------------------------------------------------------

// (The password_reset_requests table is created and migrated in scripts/init-db.js)

// Public: a user asks for a password reset
router.post('/request-password-reset', h(async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'Username required' });

  const userResult = await pool.query(
    'SELECT id, name, username FROM users WHERE LOWER(username) = LOWER($1)',
    [username]
  );

  // Same response whether or not the username exists
  if (userResult.rows.length === 0) {
    return res.json({ success: true });
  }

  const u = userResult.rows[0];

  // Don't pile up duplicate pending requests
  const existing = await pool.query(
    "SELECT 1 FROM password_reset_requests WHERE user_id = $1 AND status = 'pending'",
    [u.id]
  );
  if (existing.rows.length === 0) {
    await pool.query(
      'INSERT INTO password_reset_requests (user_id, username, name) VALUES ($1, $2, $3)',
      [u.id, u.username, u.name]
    );
  }

  res.json({ success: true });
}));

router.get('/admin/password-reset-requests', h(async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const result = await pool.query(
    "SELECT * FROM password_reset_requests WHERE status = 'pending' ORDER BY created_at DESC"
  );
  res.json(result.rows);
}));

router.post('/admin/password-reset-requests/:id/dismiss', h(async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  await pool.query(
    "UPDATE password_reset_requests SET status = 'dismissed', resolved_at = CURRENT_TIMESTAMP, resolved_by = $2 WHERE id = $1",
    [parseInt(req.params.id, 10), req.user.id]
  );
  res.json({ success: true });
}));

// Marks a request done (the admin then uses the reset-password endpoint)
router.post('/admin/password-reset-requests/:id/resolve', h(async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  await pool.query(
    "UPDATE password_reset_requests SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, resolved_by = $2 WHERE id = $1",
    [parseInt(req.params.id, 10), req.user.id]
  );
  res.json({ success: true });
}));

// ---------------------------------------------------------------------------
// File library
// ---------------------------------------------------------------------------
router.get('/files', h(async (req, res) => {
  const { category } = req.query;

  const filtered = category && category !== 'all';
  // LEFT JOIN: uploaded_by becomes NULL when an uploader is deleted, and an
  // inner join would make those files disappear from the library
  const query = filtered
    ? "SELECT f.*, COALESCE(u.name, 'Deleted user') as uploader_name FROM file_library f LEFT JOIN users u ON f.uploaded_by = u.id WHERE f.category = $1 ORDER BY f.created_at DESC"
    : "SELECT f.*, COALESCE(u.name, 'Deleted user') as uploader_name FROM file_library f LEFT JOIN users u ON f.uploaded_by = u.id ORDER BY f.created_at DESC";

  const result = await pool.query(query, filtered ? [category] : []);
  res.json(result.rows);
}));

router.post('/files', upload.single('file'), h(async (req, res) => {
  const { title, description, category } = req.body;
  if (!title || !title.trim() || !req.file) {
    discardUploads(req);
    return res.status(400).json({ error: 'title and file are required' });
  }

  const filePath = req.file.secure_url || req.file.url || req.file.path;
  const result = await pool.query(
    'INSERT INTO file_library (uploaded_by, title, description, category, filename, original_filename, file_path, file_size, mime_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
    [
      req.user.id,
      title,
      description || '',
      category || 'general',
      req.file.filename || req.file.public_id,
      req.file.originalname,
      filePath,
      req.file.size || req.file.bytes || 0,
      req.file.mimetype
    ]
  );
  res.json({ success: true, id: result.rows[0].id });
}));

// Uploaders can delete their own files; admins can delete any
router.delete('/files/:id', h(async (req, res) => {
  const fileId = parseInt(req.params.id, 10);
  const result = isAdminUser(req.user)
    ? await pool.query('DELETE FROM file_library WHERE id = $1', [fileId])
    : await pool.query('DELETE FROM file_library WHERE id = $1 AND uploaded_by = $2', [fileId, req.user.id]);
  res.json({ success: result.rowCount > 0 });
}));

router.get('/files/:id/download', h(async (req, res) => {
  const fileId = parseInt(req.params.id, 10);
  const result = await pool.query('SELECT * FROM file_library WHERE id = $1', [fileId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
  sendStoredFile(res, result.rows[0]);
}));

// ---------------------------------------------------------------------------
// Error handler (must be last)
// ---------------------------------------------------------------------------
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (200MB max)' });
  }
  console.error('API error:', err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = router;
