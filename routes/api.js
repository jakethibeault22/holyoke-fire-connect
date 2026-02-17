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
const publicRoutes = ['/login', '/register', '/request-password-reset'];

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
  
  // Allow admin password reset routes - they validate requestingUserId internally
  if (req.path.startsWith('/admin/password-reset-requests')) {
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

// Request password reset (public - no auth required)
router.post('/request-password-reset', async (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }
  
  try {
    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, email, name FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    
    if (userResult.rows.length === 0) {
      // Don't reveal if user exists or not for security
      return res.json({ success: true, message: 'If your username exists, an administrator will review your request.' });
    }
    
    const user = userResult.rows[0];
    
    // Check if there's already a pending request
    const existingRequest = await pool.query(
      'SELECT id FROM password_reset_requests WHERE user_id = $1 AND status = $2',
      [user.id, 'pending']
    );
    
    if (existingRequest.rows.length > 0) {
      return res.json({ success: true, message: 'You already have a pending password reset request.' });
    }
    
    // Create password reset request
    await pool.query(
      'INSERT INTO password_reset_requests (user_id, status) VALUES ($1, $2)',
      [user.id, 'pending']
    );
    
    res.json({ success: true, message: 'Password reset request submitted. An administrator will review your request.' });
  } catch (err) {
    console.error('Error requesting password reset:', err);
    res.status(500).json({ error: 'Failed to submit password reset request' });
  }
});

// Get password reset requests (Admin only)
router.get('/admin/password-reset-requests', async (req, res) => {
  const { requestingUserId } = req.query;
  
  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId required' });
  }
  
  try {
    const requestingUser = await getUserById(parseInt(requestingUserId));
    if (!requestingUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userRoles = requestingUser.roles || [requestingUser.role];
    const isAdmin = userRoles.some(role => 
      role === 'admin' || role === 'super_user' || role === 'chief'
    );
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized - Admin access required' });
    }
    
    const result = await pool.query(`
      SELECT prr.id, prr.user_id, prr.created_at, prr.status,
             u.name, u.username, u.email
      FROM password_reset_requests prr
      JOIN users u ON prr.user_id = u.id
      WHERE prr.status = 'pending'
      ORDER BY prr.created_at DESC
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching password reset requests:', err);
    res.status(500).json({ error: 'Failed to fetch password reset requests' });
  }
});

// Approve password reset request
router.post('/admin/password-reset-requests/:id/approve', async (req, res) => {
  const requestId = parseInt(req.params.id);
  const { newPassword, requestingUserId } = req.body;
  
  if (!newPassword || !requestingUserId) {
    return res.status(400).json({ error: 'newPassword and requestingUserId are required' });
  }
  
  try {
    const requestingUser = await getUserById(parseInt(requestingUserId));
    if (!requestingUser) {
      return res.status(404).json({ error: 'Requesting user not found' });
    }
    
    const userRoles = requestingUser.roles || [requestingUser.role];
    const isAdmin = userRoles.some(role => 
      role === 'admin' || role === 'super_user' || role === 'chief'
    );
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized - Admin access required' });
    }
    
    // Get the password reset request
    const requestResult = await pool.query(
      'SELECT user_id FROM password_reset_requests WHERE id = $1 AND status = $2',
      [requestId, 'pending']
    );
    
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Password reset request not found or already processed' });
    }
    
    const userId = requestResult.rows[0].user_id;
    
    // Reset the user's password and set must_change_password flag
    const result = await resetPassword(userId, newPassword, requestingUserId);
    
    if (result.error) {
      return res.status(403).json(result);
    }
    
    // Mark user as must change password
    await pool.query(
      'UPDATE users SET must_change_password = true WHERE id = $1',
      [userId]
    );
    
    // Mark request as approved
    await pool.query(
      'UPDATE password_reset_requests SET status = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['approved', requestId]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error approving password reset:', err);
    res.status(500).json({ error: 'Failed to approve password reset' });
  }
});

// Reject password reset request
router.post('/admin/password-reset-requests/:id/reject', async (req, res) => {
  const requestId = parseInt(req.params.id);
  const { requestingUserId } = req.body;
  
  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId is required' });
  }
  
  try {
    const requestingUser = await getUserById(parseInt(requestingUserId));
    if (!requestingUser) {
      return res.status(404).json({ error: 'Requesting user not found' });
    }
    
    const userRoles = requestingUser.roles || [requestingUser.role];
    const isAdmin = userRoles.some(role => 
      role === 'admin' || role === 'super_user' || role === 'chief'
    );
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized - Admin access required' });
    }
    
    // Mark request as rejected
    const result = await pool.query(
      'UPDATE password_reset_requests SET status = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2 AND status = $3',
      ['rejected', requestId, 'pending']
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Password reset request not found or already processed' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error rejecting password reset:', err);
    res.status(500).json({ error: 'Failed to reject password reset' });
  }
});

// Change own password (after admin reset)
router.post('/change-password', async (req, res) => {
  const { userId, oldPassword, newPassword } = req.body;
  
  if (!userId || !oldPassword || !newPassword) {
    return res.status(400).json({ error: 'userId, oldPassword, and newPassword are required' });
  }
  
  try {
    const crypto = require('crypto');
    const hashedOldPassword = crypto.createHash('sha256').update(oldPassword).digest('hex');
    
    // Verify old password
    const userResult = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND password_hash = $2',
      [userId, hashedOldPassword]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Set new password and clear must_change_password flag
    const hashedNewPassword = crypto.createHash('sha256').update(newPassword).digest('hex');
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [hashedNewPassword, userId]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error changing password:', err);
    res.status(500).json({ error: 'Failed to change password' });
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

// Save push notification token
router.post('/users/:userId/push-token', async (req, res) => {
  const userId = parseInt(req.params.userId);
  const { pushToken } = req.body;
  
  if (!pushToken) {
    return res.status(400).json({ error: 'pushToken is required' });
  }
  
  try {
    await pool.query(
      'INSERT INTO push_tokens (user_id, token) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET token = $2, updated_at = CURRENT_TIMESTAMP',
      [userId, pushToken]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving push token:', err);
    res.status(500).json({ error: 'Failed to save push token' });
  }
});

// Remove push notification token
router.delete('/users/:userId/push-token', async (req, res) => {
  const userId = parseInt(req.params.userId);
  
  try {
    await pool.query('DELETE FROM push_tokens WHERE user_id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing push token:', err);
    res.status(500).json({ error: 'Failed to remove push token' });
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
    
    // Automatically mark the message as read for the sender
    await pool.query(
      'INSERT INTO message_reads (user_id, message_id, read_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING',
      [senderId, messageId]
    );
    
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
    
    res.json({ success: true, threadId: result.threadId, messageId: messageId });
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

// Get read receipts for messages in a thread
router.get('/messages/thread/:threadId/read-receipts', async (req, res) => {
  const threadId = req.params.threadId;
  const userId = req.query.userId;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  try {
    // Get all read receipts for messages in this thread
    const result = await pool.query(`
      SELECT mr.message_id, mr.user_id, u.name, mr.read_at
      FROM message_reads mr
      JOIN messages m ON mr.message_id = m.id
      JOIN users u ON mr.user_id = u.id
      WHERE m.thread_id = $1
      ORDER BY mr.read_at DESC
    `, [threadId]);
    
    const receipts = result.rows;
    
    // Group by message_id
    const grouped = {};
    receipts.forEach(receipt => {
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
  } catch (err) {
    console.error('Error fetching read receipts:', err);
    res.status(500).json({ error: 'Failed to fetch read receipts' });
  }
});

// Get read receipts for a message
router.get('/messages/:messageId/read-receipts', async (req, res) => {
  const { messageId } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT mr.user_id, mr.read_at, u.name
      FROM message_reads mr
      JOIN users u ON mr.user_id = u.id
      WHERE mr.message_id = $1
      ORDER BY mr.read_at DESC
    `, [messageId]);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching read receipts:', err);
    res.status(500).json({ error: 'Failed to fetch read receipts' });
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

// --- File Library ---

// Get all files (optionally filtered by category)
router.get('/files', async (req, res) => {
  const { category, userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  try {
    let query = `
      SELECT f.*, u.name as uploaded_by_name
      FROM file_library f
      LEFT JOIN users u ON f.uploaded_by = u.id
    `;
    const params = [];

    if (category && category !== 'all') {
      query += ' WHERE f.category = $1';
      params.push(category);
    }

    query += ' ORDER BY f.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching files:', err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Upload a file to the library
router.post('/files', upload.single('file'), async (req, res) => {
  const { title, description, category, userId } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (!title || !userId) {
    return res.status(400).json({ error: 'Title and userId required' });
  }

  try {
    const user = await getUserById(parseInt(userId));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      `INSERT INTO file_library 
        (title, description, filename, original_filename, file_path, file_size, mime_type, category, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        title,
        description || '',
        req.file.filename,
        req.file.originalname,
        req.file.path,
        req.file.size,
        req.file.mimetype,
        category || 'general',
        parseInt(userId)
      ]
    );

    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Download a file from the library
router.get('/files/:id/download', async (req, res) => {
  const fileId = parseInt(req.params.id);

  try {
    const result = await pool.query(
      'SELECT * FROM file_library WHERE id = $1',
      [fileId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];
    const filePath = path.resolve(file.file_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.original_filename}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error('Error downloading file:', err);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Delete a file from the library
router.delete('/files/:id', async (req, res) => {
  const fileId = parseInt(req.params.id);
  const { userId } = req.body;

  try {
    const user = await getUserById(parseInt(userId));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userRoles = user.roles || [user.role];
    const isAdminOrHigher = userRoles.includes('admin') || userRoles.includes('super_user');

    const fileResult = await pool.query(
      'SELECT * FROM file_library WHERE id = $1',
      [fileId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = fileResult.rows[0];

    // Only allow admin or the uploader to delete
    if (!isAdminOrHigher && file.uploaded_by !== parseInt(userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete file from disk
    const filePath = path.resolve(file.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await pool.query('DELETE FROM file_library WHERE id = $1', [fileId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;