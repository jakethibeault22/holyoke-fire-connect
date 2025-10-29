const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

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

// Get database instance
const dbPath = path.join(__dirname, '../../data/db.sqlite');
const db = new Database(dbPath);

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
router.post('/register', (req, res) => {
  const { email, name, username, password } = req.body;
  
  if (!email || !name || !username || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  const result = registerUser(email, name, username, password);
  
  if (result.error) {
    res.status(400).json(result);
  } else {
    res.json({ success: true, message: 'Registration submitted. Please wait for admin approval.' });
  }
});

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const result = loginUser(username, password);
  
  if (!result) {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  } else if (result.error) {
    res.status(403).json({ success: false, error: result.error });
  } else {
    res.json({ success: true, user: result });
  }
});

// Get current user
router.get('/user/:id', (req, res) => {
  const user = getUserById(parseInt(req.params.id));
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// --- Users ---
router.get('/users', (req, res) => {
  res.json(getUsers());
});

// Get users by role
router.get('/users/by-role/:role', (req, res) => {
  const role = req.params.role;
  res.json(getUsersByRole(role));
});

// Get pending users (Admin or Chief)
router.get('/admin/pending-users', (req, res) => {
  const requestingUserId = req.query.requestingUserId;
  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId required' });
  }
  
  const requestingUser = getUserById(parseInt(requestingUserId));
  if (!requestingUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Check if user is chief or admin
  const userRoles = requestingUser.roles || [requestingUser.role];
  const isChiefOrAdmin = userRoles.some(role => 
    role === 'chief' || role === 'admin'
  );
  
  if (!isChiefOrAdmin) {
    return res.status(403).json({ error: 'Unauthorized - Chief or Admin access required' });
  }
  
  res.json(getPendingUsers());
});

// Approve user (Admin only)
router.post('/admin/approve-user/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const { assignedRole, requestingUserId } = req.body;
  
  const result = approveUser(userId, assignedRole, requestingUserId);
  
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
});

// Reject user (Admin only)
router.post('/admin/reject-user/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const { requestingUserId } = req.body;
  
  const result = rejectUser(userId, requestingUserId);
  
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
});

// --- Bulletins ---
router.get('/bulletins', (req, res) => {
  res.json(getBulletins());
});

// Get all bulletins for unread indicators
router.get('/bulletins/all', (req, res) => {
  const userId = req.query.userId;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  const user = getUserById(parseInt(userId));
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  try {
    const allBulletins = db.prepare(`
      SELECT id, category, created_at
      FROM bulletins
      ORDER BY created_at DESC
    `).all();
    
    const filteredBulletins = allBulletins.filter(bulletin => 
      canViewBulletin(parseInt(userId), bulletin.category)
    );
    
    res.json(filteredBulletins);
  } catch (err) {
    console.error('Error fetching all bulletins:', err);
    res.status(500).json({ error: 'Failed to fetch bulletins' });
  }
});

router.post('/bulletins', upload.array('files', 5), (req, res) => {
  const { title, body, category, userId } = req.body;
  const result = addBulletin(title, body, category || 'west-wing', userId);
  
  if (result.error) {
    res.status(403).json(result);
  } else {
    const bulletinId = result.lastInsertRowid;
    
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        addAttachment(
          file.filename,
          file.originalname,
          file.path,
          file.size,
          file.mimetype,
          bulletinId,
          null
        );
      });
    }
    
    res.json({ success: true, id: bulletinId });
  }
});

// Get bulletins by category with role-based filtering
router.get('/bulletins/category/:category', (req, res) => {
  const category = req.params.category;
  const userId = req.query.userId;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  const user = getUserById(parseInt(userId));
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (!canViewBulletin(parseInt(userId), category)) {
    return res.json([]);
  }
  
  const bulletins = getBulletinsByCategory(category, parseInt(userId));
  res.json(bulletins);
});

// Check bulletin permissions endpoint
router.get('/bulletins/permissions/:category', (req, res) => {
  const category = req.params.category;
  const userId = req.query.userId;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  const user = getUserById(parseInt(userId));
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({
    canView: canViewBulletin(parseInt(userId), category),
    canPost: canPostBulletin(parseInt(userId), category),
    canDelete: canDeleteBulletin(parseInt(userId), category)
  });
});

router.delete('/bulletins/:id', (req, res) => {
  const bulletinId = parseInt(req.params.id);
  const { userId } = req.body;
  const result = deleteBulletin(bulletinId, userId);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
});

// Get bulletin attachments
router.get('/bulletins/:id/attachments', (req, res) => {
  const bulletinId = parseInt(req.params.id);
  const attachments = getAttachmentsByBulletin(bulletinId);
  res.json(attachments);
});

// Download bulletin attachment
router.get('/bulletins/:bulletinId/attachments/:attachmentId', (req, res) => {
  const attachmentId = parseInt(req.params.attachmentId);
  
  try {
    const attachment = db.prepare(`
      SELECT * FROM attachments WHERE id = ? AND bulletin_id IS NOT NULL
    `).get(attachmentId);
    
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
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

// --- Messages ---
router.get('/messages/inbox/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  res.json(getInbox(userId));
});

router.get('/messages/sent/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  res.json(getSent(userId));
});

// Handle multiple recipients and threading
router.post('/messages', upload.array('files', 5), (req, res) => {
  const { senderId, to, subject, body, threadId, parentMessageId } = req.body;
  
  try {
    const recipients = JSON.parse(to);
    
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'At least one recipient is required' });
    }
    
    // Use the updated sendMessage function
    const result = sendMessage(senderId, recipients, subject, body, threadId ? parseInt(threadId) : null, parentMessageId);
    const messageId = result.lastInsertRowid;
    
    // Add attachments if any
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        addAttachment(
          file.filename,
          file.originalname,
          file.path,
          file.size,
          file.mimetype,
          null,
          messageId
        );
      });
    }
    
    res.json({ success: true, threadId: result.threadId });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get all messages in a thread
router.get('/messages/thread/:threadId', (req, res) => {
  const threadId = parseInt(req.params.threadId);
  const userId = req.query.userId;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  try {
    // Check if user is a participant in this thread
    const isParticipant = db.prepare(`
      SELECT 1 FROM thread_participants 
      WHERE thread_id = ? AND user_id = ?
    `).get(threadId, parseInt(userId));
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to view this thread' });
    }
    
    // Return ALL messages in the thread (no filtering by sender/recipient)
    const messages = getThreadMessages(threadId);
    res.json(messages);
  } catch (err) {
    console.error('Error fetching thread:', err);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// KILLSWITCH ENDPOINT - Super admin only
router.post('/admin/killswitch', (req, res) => {
  const { password, requestingUserId } = req.body;
  
  const requestingUser = getUserById(parseInt(requestingUserId));
  if (!requestingUser || requestingUser.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  const result = executeKillswitch(password);
  res.json(result);
});



// Get thread participants
router.get('/messages/thread/:threadId/participants', (req, res) => {
  const threadId = parseInt(req.params.threadId);
  
  try {
    const participants = db.prepare(`
      SELECT user_id, users.name
      FROM thread_participants
      JOIN users ON thread_participants.user_id = users.id
      WHERE thread_id = ?
    `).all(threadId);
    
    res.json({ participants });
  } catch (err) {
    console.error('Error fetching thread participants:', err);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

router.delete('/messages/:id', (req, res) => {
  const messageId = parseInt(req.params.id);
  const { userId } = req.body;
  const result = deleteMessage(messageId, userId);
  res.json({ success: result.changes > 0 });
});

// Get message attachments
router.get('/messages/:id/attachments', (req, res) => {
  const messageId = parseInt(req.params.id);
  const attachments = getAttachmentsByMessage(messageId);
  res.json(attachments);
});

// Download message attachment
router.get('/messages/:messageId/attachments/:attachmentId', (req, res) => {
  const attachmentId = parseInt(req.params.attachmentId);
  
  try {
    const attachment = db.prepare(`
      SELECT * FROM attachments WHERE id = ? AND message_id IS NOT NULL
    `).get(attachmentId);
    
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
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
router.delete('/attachments/:id', (req, res) => {
  const attachmentId = parseInt(req.params.id);
  const result = deleteAttachment(attachmentId);
  res.json({ success: result.changes > 0 });
});

// --- READ STATUS ENDPOINTS ---

// Get read status for a user
router.get('/read-status/:userId', (req, res) => {
  const { userId } = req.params;
  
  try {
    const bulletins = db.prepare(`
      SELECT bulletin_id FROM bulletin_reads WHERE user_id = ?
    `).all(userId);
    
    const messages = db.prepare(`
      SELECT message_id FROM message_reads WHERE user_id = ?
    `).all(userId);
    
    res.json({
      bulletins: bulletins.map(b => b.bulletin_id),
      messages: messages.map(m => m.message_id)
    });
  } catch (err) {
    console.error('Error fetching read status:', err);
    res.status(500).json({ error: 'Failed to fetch read status' });
  }
});

// Mark bulletin as read
router.post('/bulletins/mark-read', (req, res) => {
  const { userId, bulletinId } = req.body;
  
  try {
    db.prepare(`
      INSERT OR IGNORE INTO bulletin_reads (user_id, bulletin_id, read_at)
      VALUES (?, ?, datetime('now'))
    `).run(userId, bulletinId);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking bulletin as read:', err);
    res.status(500).json({ error: 'Failed to mark bulletin as read' });
  }
});

// Mark message as read
router.post('/messages/mark-read', (req, res) => {
  const { userId, messageId } = req.body;
  
  try {
    db.prepare(`
      INSERT OR IGNORE INTO message_reads (user_id, message_id, read_at)
      VALUES (?, ?, datetime('now'))
    `).run(userId, messageId);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking message as read:', err);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// --- Admin User Management ---
router.post('/admin/users', (req, res) => {
  const { email, name, username, password, roles, requestingUserId } = req.body;
  const result = createUser(email, name, username, password, roles, requestingUserId);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: true, id: result.lastInsertRowid });
  }
});

router.put('/admin/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const { email, name, username, roles, requestingUserId } = req.body;
  const result = updateUser(userId, email, name, username, roles, requestingUserId);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
});

router.delete('/admin/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const { requestingUserId } = req.body;
  const result = deleteUser(userId, requestingUserId);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
});

router.post('/admin/users/:id/reset-password', (req, res) => {
  const userId = parseInt(req.params.id);
  const { newPassword, requestingUserId } = req.body;
  const result = resetPassword(userId, newPassword, requestingUserId);
  if (result.error) {
    res.status(403).json(result);
  } else {
    res.json({ success: result.changes > 0 });
  }
});

module.exports = router;