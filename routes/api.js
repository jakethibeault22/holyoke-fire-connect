const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/db');

const { 
  loginUser, 
  getUserById, 
  getUsers,
  getPendingUsers,
  registerUser,
  approveUser,
  rejectUser,
  getBulletins,
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
  canViewBulletin,
  canPostBulletin,
  canDeleteBulletin,
  getUsersByRole
} = require('../main');

// Public routes that don't require authentication
const publicRoutes = ['/login', '/register'];

// Routes that should skip auth (authenticated in other ways)
const skipAuthRoutes = ['/users', '/users/by-role'];

// Middleware to check authentication for non-public routes
const requireAuth = (req, res, next) => {
  // Skip auth for public routes
  if (publicRoutes.some(route => req.path === route)) {
    return next();
  }
  
  // Skip auth for certain routes (they handle their own auth)
  if (skipAuthRoutes.some(route => req.path.startsWith(route))) {
    return next();
  }
  
  // Skip auth for POST routes with file uploads (they handle auth after multer processes FormData)
  if (req.method === 'POST' && (req.path === '/bulletins' || req.path === '/messages' || req.path.startsWith('/admin/users'))) {
    return next();
  }
  
  // Check for userId in query, body, or URL params
  const userId = req.query.userId || 
                 req.query.requestingUserId ||
                 req.body?.userId || 
                 req.body?.requestingUserId || 
                 req.body?.senderId ||
                 req.params?.userId;
  
  // For routes that have userId in the path like /messages/inbox/:userId
  const pathMatch = req.path.match(/\/(\d+)/);
  const pathUserId = pathMatch ? pathMatch[1] : null;
  
  if (!userId && !pathUserId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  next();
};

// Apply auth middleware to all routes
router.use(requireAuth);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(__dirname, '../../data/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Public registration (no auth required)
router.post('/register', async (req, res) => {
  const { email, name, username, password } = req.body;
  
  if (!email || !name || !username || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  const result = await registerUser(email, name, username, password);
  
  if (result.error) {
    res.status(400).json(result);
  } else {
    res.json({ success: true, message: 'Registration submitted. Please wait for admin approval.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await loginUser(username, password);
  
  if (!result) {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  } else if (result.error) {
    res.status(403).json({ success: false, error: result.error });
  } else {
    res.json({ success: true, user: result });
  }
});

// Get current user
router.get('/user/:id', async (req, res) => {
  const user = await getUserById(parseInt(req.params.id));
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// --- Users ---
router.get('/users', async (req, res) => {
  const users = await getUsers();
  res.json(users);
});

// Get users by role
router.get('/users/by-role/:role', async (req, res) => {
  const role = req.params.role;
  const users = await getUsersByRole(role);
  res.json(users);
});

// Get pending users (Admin or Chief)
router.get('/admin/pending-users', async (req, res) => {
  const requestingUserId = req.query.requestingUserId;
  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId required' });
  }
  
  const requestingUser = await getUserById(parseInt(requestingUserId));
  if (!requestingUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const userRoles = requestingUser.roles || [requestingUser.role];
  const isChiefOrAdmin = userRoles.some(role => 
    role === 'chief' || role === 'admin' || role === 'super_user'
  );
  
  if (!isChiefOrAdmin) {
    return res.status(403).json({ error: 'Unauthorized - Chief or Admin access required' });
  }
  
  const pending = await getPendingUsers();
  res.json(pending);
});

// Approve user (Admin only)
router.post('/admin/approve-user/:id', async (req, res) => {
  const userId = parseInt(req.params.id);
  const { assignedRole, requestingUserId } = req.body;
  
  const result = await approveUser(userId, assignedRole, requestingUserId);
  
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
});

// Reject user (Admin only)
router.post('/admin/reject-user/:id', async (req, res) => {
  const userId = parseInt(req.params.id);
  const { requestingUserId } = req.body;
  
  const result = await rejectUser(userId, requestingUserId);
  
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
});

// --- Bulletins ---
router.get('/bulletins', async (req, res) => {
  const bulletins = await getBulletins();
  res.json(bulletins);
});

// Get all bulletins for unread indicators
router.get('/bulletins/all', async (req, res) => {
  const userId = req.query.userId;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  const user = await getUserById(parseInt(userId));
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  try {
    const result = await pool.query(`
      SELECT id, category, created_at
      FROM bulletins
      ORDER BY created_at DESC
    `);
    
    // Filter bulletins based on user permissions
    const filteredBulletins = [];
    for (const bulletin of result.rows) {
      const canView = await canViewBulletin(parseInt(userId), bulletin.category);
      if (canView) {
        filteredBulletins.push(bulletin);
      }
    }
    
    res.json(filteredBulletins);
  } catch (err) {
    console.error('Error fetching all bulletins:', err);
    res.status(500).json({ error: 'Failed to fetch bulletins' });
  }
});

router.post('/bulletins', upload.array('files', 5), async (req, res) => {
  const { title, body, category, userId } = req.body;
  const result = await addBulletin(title, body, category || 'west-wing', userId);
  
  if (result.error) {
    res.status(403).json(result);
  } else {
    const bulletinId = result.lastInsertRowid;
    
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await addAttachment(
          file.filename,
          file.originalname,
          file.path,
          file.size,
          file.mimetype,
          bulletinId,
          null
        );
      }
    }
    
    res.json({ success: true, id: bulletinId });
  }
});

// Get bulletins by category with role-based filtering
router.get('/bulletins/category/:category', async (req, res) => {
  const category = req.params.category;
  const userId = req.query.userId;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  const user = await getUserById(parseInt(userId));
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const bulletins = await getBulletinsByCategory(category, parseInt(userId));
  res.json(bulletins);
});

// Check bulletin permissions endpoint
router.get('/bulletins/permissions/:category', async (req, res) => {
  const category = req.params.category;
  const userId = req.query.userId;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  const user = await getUserById(parseInt(userId));
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({
    canView: await canViewBulletin(parseInt(userId), category),
    canPost: await canPostBulletin(parseInt(userId), category),
    canDelete: await canDeleteBulletin(parseInt(userId), category)
  });
});

router.delete('/bulletins/:id', async (req, res) => {
  const bulletinId = parseInt(req.params.id);
  const { userId } = req.body;
  const result = await deleteBulletin(bulletinId, userId);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
});

// Get bulletin attachments
router.get('/bulletins/:id/attachments', async (req, res) => {
  const bulletinId = parseInt(req.params.id);
  const attachments = await getAttachmentsByBulletin(bulletinId);
  res.json(attachments);
});

// Download bulletin attachment
router.get('/bulletins/:bulletinId/attachments/:attachmentId', async (req, res) => {
  const attachmentId = parseInt(req.params.attachmentId);
  
  try {
    const result = await pool.query(
      'SELECT * FROM attachments WHERE id = $1 AND bulletin_id IS NOT NULL',
      [attachmentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    const attachment = result.rows[0];
    const filePath = path.resolve(attachment.file_path);
    
    if (!fs.existsSync(filePath)) {
      console.error('File not found on disk:', filePath);
      return res.status(404).json({ error: 'File not found on disk' });
    }
    
    res.sendFile(filePath);
  } catch (err) {
    console.error('Error retrieving attachment:', err);
    res.status(500).json({ error: 'Failed to retrieve attachment', details: err.message });
  }
});

// Check if user can view a category
router.get('/bulletins/can-view/:category', async (req, res) => {
  const category = req.params.category;
  const userId = req.query.userId;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  const canView = await canViewBulletin(parseInt(userId), category);
  res.json({ canView });
});

// Mark bulletin as read
router.post('/bulletins/mark-read', async (req, res) => {
  const { userId, bulletinId } = req.body;
  
  try {
    await pool.query(`
      INSERT INTO bulletin_reads (user_id, bulletin_id, read_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING
    `, [userId, bulletinId]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking bulletin as read:', err);
    res.status(500).json({ error: 'Failed to mark bulletin as read' });
  }
});

// --- Messages ---
router.get('/messages/inbox/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  const messages = await getInbox(userId);
  res.json(messages);
});

router.get('/messages/sent/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  const messages = await getSent(userId);
  res.json(messages);
});

// Handle multiple recipients and threading
router.post('/messages', upload.array('files', 5), async (req, res) => {
  const { senderId, to, subject, body, threadId, parentMessageId } = req.body;
  
  try {
    const recipients = JSON.parse(to);
    
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'At least one recipient is required' });
    }
    
    const result = await sendMessage(senderId, recipients, subject, body, threadId ? parseInt(threadId) : null, parentMessageId);
    const messageId = result.lastInsertRowid;
    
    // Add attachments if any
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await addAttachment(
          file.filename,
          file.originalname,
          file.path,
          file.size,
          file.mimetype,
          null,
          messageId
        );
      }
    }
    
    res.json({ success: true, threadId: result.threadId });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get messages in a thread
router.get('/messages/thread/:threadId', async (req, res) => {
  const threadId = req.params.threadId;
  const userId = req.query.userId;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  try {
    // Check if user is a participant in this thread
    const participantResult = await pool.query(
      'SELECT 1 FROM thread_participants WHERE thread_id = $1 AND user_id = $2',
      [threadId, parseInt(userId)]
    );
    
    if (participantResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized to view this thread' });
    }
    
    const messages = await getThreadMessages(threadId);
    res.json(messages);
  } catch (err) {
    console.error('Error fetching thread:', err);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// Get thread participants
router.get('/messages/thread/:threadId/participants', async (req, res) => {
  const threadId = parseInt(req.params.threadId);
  
  try {
    const result = await pool.query(`
      SELECT user_id, users.name
      FROM thread_participants
      JOIN users ON thread_participants.user_id = users.id
      WHERE thread_id = $1
    `, [threadId]);
    
    res.json({ participants: result.rows });
  } catch (err) {
    console.error('Error fetching thread participants:', err);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

router.delete('/messages/:id', async (req, res) => {
  const messageId = parseInt(req.params.id);
  const { userId } = req.body;
  const result = await deleteMessage(messageId, userId);
  res.json({ success: result.changes > 0 });
});

// Get message attachments
router.get('/messages/:id/attachments', async (req, res) => {
  const messageId = parseInt(req.params.id);
  const attachments = await getAttachmentsByMessage(messageId);
  res.json(attachments);
});

// Download message attachment
router.get('/messages/:messageId/attachments/:attachmentId', async (req, res) => {
  const attachmentId = parseInt(req.params.attachmentId);
  
  try {
    const result = await pool.query(
      'SELECT * FROM attachments WHERE id = $1 AND message_id IS NOT NULL',
      [attachmentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    const attachment = result.rows[0];
    const filePath = path.resolve(attachment.file_path);
    
    if (!fs.existsSync(filePath)) {
      console.error('File not found on disk:', filePath);
      return res.status(404).json({ error: 'File not found on disk' });
    }
    
    res.sendFile(filePath);
  } catch (err) {
    console.error('Error retrieving attachment:', err);
    res.status(500).json({ error: 'Failed to retrieve attachment', details: err.message });
  }
});

// Delete attachment
router.delete('/attachments/:id', async (req, res) => {
  const attachmentId = parseInt(req.params.id);
  const result = await deleteAttachment(attachmentId);
  res.json({ success: result.changes > 0 });
});

// Mark message as read
router.post('/messages/mark-read', async (req, res) => {
  const { userId, messageId } = req.body;
  
  try {
    await pool.query(`
      INSERT INTO message_reads (user_id, message_id, read_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING
    `, [userId, messageId]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking message as read:', err);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// --- READ STATUS ENDPOINTS ---

// Get read status for a user
router.get('/read-status/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    const bulletinsResult = await pool.query(
      'SELECT bulletin_id FROM bulletin_reads WHERE user_id = $1',
      [userId]
    );
    
    const messagesResult = await pool.query(
      'SELECT message_id FROM message_reads WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      bulletins: bulletinsResult.rows.map(b => b.bulletin_id),
      messages: messagesResult.rows.map(m => m.message_id)
    });
  } catch (err) {
    console.error('Error fetching read status:', err);
    res.status(500).json({ error: 'Failed to fetch read status' });
  }
});

// --- Admin User Management ---
router.post('/admin/users', async (req, res) => {
  const { email, name, username, password, roles, requestingUserId } = req.body;
  const result = await createUser(email, name, username, password, roles, requestingUserId);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: true, id: result.id || result.lastInsertRowid });
  }
});

router.put('/admin/users/:id', async (req, res) => {
  const userId = parseInt(req.params.id);
  const { email, name, username, roles, requestingUserId } = req.body;
  const result = await updateUser(userId, email, name, username, roles, requestingUserId);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: true, id: result.id || result.lastInsertRowid });
  }
});

router.delete('/admin/users/:id', async (req, res) => {
  const userId = parseInt(req.params.id);
  const { requestingUserId } = req.body;
  const result = await deleteUser(userId, requestingUserId);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
});

router.post('/admin/users/:id/reset-password', async (req, res) => {
  const userId = parseInt(req.params.id);
  const { newPassword, requestingUserId } = req.body;
  const result = await resetPassword(userId, newPassword, requestingUserId);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
});

// ADMIN: Export database info
router.get('/admin/export-sql', async (req, res) => {
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  const user = await getUserById(parseInt(userId));
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    res.json({ message: 'PostgreSQL backup should be done through Render dashboard or Supabase dashboard' });
  } catch (err) {
    console.error('Error creating backup:', err);
    res.status(500).json({ error: 'Backup failed', details: err.message });
  }
});

// One-time: Initialize Supabase database

module.exports = router;