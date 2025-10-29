const { db } = require('./config/db');
const crypto = require('crypto');

// Hash password helper
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Role hierarchy helper
const ROLE_HIERARCHY = {
  'firefighter': 1,
  'repair_division': 2,
  'alarm_division': 3,
  'officer': 4,
  'prevention': 5,
  'repair_division_supervisor': 6,
  'training': 7,
  'prevention_captain': 8,
  'alarm_supervisor': 9,
  'fire_commissioner': 10,
  'deputy': 11,
  'XO': 12,
  'chief': 13,
  'admin':14,
  'super_user': 15,
};

function getRoleLevel(role) {
  return ROLE_HIERARCHY[role] || 0;
}

function isChiefOrHigher(role) {
  return getRoleLevel(role) >= getRoleLevel('chief');
}

// Get all roles for a user
function getUserRoles(userId) {
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(userId);
  return roles.map(r => r.role);
}

// Add role to user
function addUserRole(userId, role) {
  const stmt = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, ?)');
  return stmt.run(userId, role);
}

// Remove role from user
function removeUserRole(userId, role) {
  const stmt = db.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?');
  return stmt.run(userId, role);
}

// Set multiple roles for a user (replaces all existing roles)
function setUserRoles(userId, roles) {
  // Delete existing roles
  db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
  
  // Add new roles
  const stmt = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)');
  roles.forEach(role => {
    stmt.run(userId, role);
  });
  
  // Update primary role in users table (use highest level role)
  if (roles.length > 0) {
    const primaryRole = roles.reduce((highest, role) => 
      getRoleLevel(role) > getRoleLevel(highest) ? role : highest
    );
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(primaryRole, userId);
  }
}

// Get users by role
function getUsersByRole(role) {
  return db.prepare(`
    SELECT DISTINCT u.id, u.name, u.email, u.username
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    WHERE ur.role = ? AND u.status = 'active'
    ORDER BY u.name
  `).all(role);
}

function canViewBulletin(userId, category) {
  // ... existing code ...
  return userRoles.some(role => {
    switch(category) {
      case 'west-wing':
        return true;
      case 'training':
        return true;
      case 'fire-prevention':  // Changed from fire_prevention
        return true;
      case 'repair-division':  // Changed from repair_division
        return true;
      case 'alarm-division':
        return role === 'alarm_division' || 
               role === 'alarm_supervisor' || 
               getRoleLevel(role) >= getRoleLevel('chief');
      case 'commissioners':
        return getRoleLevel(role) >= getRoleLevel('fire_commissioner');
      default:
        return true;
    }
  });
}

function canPostBulletin(userId, category) {
  // ... existing code ...
  return userRoles.some(role => {
    switch(category) {
      case 'west-wing':
        return getRoleLevel(role) >= getRoleLevel('deputy');
      case 'training':
        return role === 'training' || getRoleLevel(role) >= getRoleLevel('chief');
      case 'fire-prevention':  // Changed from fire_prevention
        return role === 'prevention_captain' || getRoleLevel(role) >= getRoleLevel('chief');
      case 'repair-division':  // Changed from repair_division
        return role === 'repair_division_supervisor' || getRoleLevel(role) >= getRoleLevel('chief');
      case 'alarm-division':
        return role === 'alarm_supervisor' || getRoleLevel(role) >= getRoleLevel('chief');
      case 'commissioners':
        return getRoleLevel(role) >= getRoleLevel('fire_commissioner');
      default:
        return false;
    }
  });
}

function canViewBulletin(userId, category) {
  const user = getUserById(userId);
  if (!user) return false;
  
  const userRoles = user.roles || [user.role];
  
  // Admin and Super User can view everything
  if (userRoles.includes('admin') || userRoles.includes('super_user')) {
    return true;
  }
  
  // Check if any of the user's roles have permission
  return userRoles.some(role => {
    switch(category) {
      case 'west-wing':
        return true;
      case 'training':
        return true;
      case 'fire-prevention':
        return true;
      case 'repair-division':
        return true;
      case 'alarm-division':
        return role === 'alarm_division' || 
               role === 'alarm_supervisor' || 
               getRoleLevel(role) >= getRoleLevel('chief');
      case 'commissioners':
        return getRoleLevel(role) >= getRoleLevel('fire_commissioner');
      default:
        return true;
    }
  });
}

function canPostBulletin(userId, category) {
  const user = getUserById(userId);
  if (!user) return false;
  
  const userRoles = user.roles || [user.role];
  
  // Admin and Super User can post everywhere
  if (userRoles.includes('admin') || userRoles.includes('super_user')) {
    return true;
  }
  
  return userRoles.some(role => {
    switch(category) {
      case 'west-wing':
        return getRoleLevel(role) >= getRoleLevel('deputy');
      case 'training':
        return role === 'training' || getRoleLevel(role) >= getRoleLevel('chief');
      case 'fire-prevention':
        return role === 'prevention_captain' || getRoleLevel(role) >= getRoleLevel('chief');
      case 'repair-division':
        return role === 'repair_division_supervisor' || getRoleLevel(role) >= getRoleLevel('chief');
      case 'alarm-division':
        return role === 'alarm_supervisor' || getRoleLevel(role) >= getRoleLevel('chief');
      case 'commissioners':
        return getRoleLevel(role) >= getRoleLevel('fire_commissioner');
      default:
        return false;
    }
  });
}

function canDeleteBulletin(userId, category) {
  const user = getUserById(userId);
  if (!user) return false;
  
  const userRoles = user.roles || [user.role];
  
  // Admin and Super User can delete everything
  if (userRoles.includes('admin') || userRoles.includes('super_user')) {
    return true;
  }
  
  return userRoles.some(role => {
    switch(category) {
      case 'west-wing':
      case 'training':
      case 'fire-prevention':
      case 'repair-division':
      case 'alarm-division':
        return getRoleLevel(role) >= getRoleLevel('chief');
      case 'commissioners':
        return getRoleLevel(role) >= getRoleLevel('fire_commissioner');
      default:
        return false;
    }
  });
}

// Authentication - Updated to check status
function loginUser(username, password) {
  const hashedPassword = hashPassword(password);
  const user = db.prepare('SELECT id, email, name, username, is_admin, role, status FROM users WHERE username = ? AND password_hash = ?')
    .get(username, hashedPassword);
  
  if (!user) {
    return null;
  }
  
  // Check if user is active
  if (user.status !== 'active') {
    return { error: 'Account is pending approval or has been rejected' };
  }
  
  // Add all roles to user object
  user.roles = getUserRoles(user.id);
  
  // If user has no roles in user_roles table, add their primary role
  if (user.roles.length === 0 && user.role) {
    addUserRole(user.id, user.role);
    user.roles = [user.role];
  }
  
  return user;
}

function getUserById(userId) {
  const user = db.prepare('SELECT id, email, name, username, is_admin, role, status FROM users WHERE id = ?').get(userId);
  if (user) {
    user.roles = getUserRoles(userId);
  }
  return user;
}

// Users
function getUsers() {
  const users = db.prepare('SELECT id, email, name, username, is_admin, role, status FROM users').all();
  // Add roles to each user
  users.forEach(user => {
    user.roles = getUserRoles(user.id);
  });
  return users;
}

// Get pending users (for admin approval)
function getPendingUsers() {
  return db.prepare('SELECT id, email, name, username, status, created_at FROM users WHERE status = ? ORDER BY created_at DESC').all('pending');
}

// Public user registration
function registerUser(email, name, username, password) {
  // Check if username or email already exists
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existingUser) {
    return { error: 'Username or email already exists' };
  }
  
  const hashedPassword = hashPassword(password);
  const stmt = db.prepare('INSERT INTO users (email, name, username, password_hash, is_admin, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
  
  try {
    const result = stmt.run(email, name, username, hashedPassword, 0, 'firefighter', 'pending');
    return { success: true, id: result.lastInsertRowid };
  } catch (err) {
    return { error: 'Registration failed: ' + err.message };
  }
}

// Admin approves user
function approveUser(userId, assignedRole, requestingUserId) {
  const requestingUser = getUserById(requestingUserId);
  if (!requestingUser || !isChiefOrHigher(requestingUser.role)) {
    return { error: 'Unauthorized - Chief or Admin access required' };
  }
  
  // Validate role
  if (!ROLE_HIERARCHY.hasOwnProperty(assignedRole)) {
    return { error: 'Invalid role' };
  }
  
  const isAdmin = assignedRole === 'admin' ? 1 : 0;
  const stmt = db.prepare('UPDATE users SET status = ?, role = ?, is_admin = ? WHERE id = ?');
  const result = stmt.run('active', assignedRole, isAdmin, userId);
  
  // Add role to user_roles table
  addUserRole(userId, assignedRole);
  
  return result;
}

// Admin rejects user
function rejectUser(userId, requestingUserId) {
  const requestingUser = getUserById(requestingUserId);
  if (!requestingUser || !isChiefOrHigher(requestingUser.role)) {
    return { error: 'Unauthorized - Chief or Admin access required' };
  }
  
  const stmt = db.prepare('UPDATE users SET status = ? WHERE id = ?');
  return stmt.run('rejected', userId);
}

// Bulletins
function getBulletins() {
  return db.prepare(`
    SELECT b.*, u.name as author_name 
    FROM bulletins b 
    JOIN users u ON b.user_id = u.id 
    ORDER BY b.created_at DESC
  `).all();
}

// Get bulletins by category with role-based filtering
function getBulletinsByCategory(category, userId = null) {
  const bulletins = db.prepare(`
    SELECT b.*, u.name as author_name, b.user_id as author_id
    FROM bulletins b 
    JOIN users u ON b.user_id = u.id 
    WHERE b.category = ? 
    ORDER BY b.created_at DESC
  `).all(category);
  
  // If userId provided, filter based on permissions
  if (userId && !canViewBulletin(userId, category)) {
    return [];
  }
  
  return bulletins;
}

// Add bulletin with role-based permissions
function addBulletin(title, body, category, userId) {
  const user = getUserById(userId);
  if (!user) {
    return { error: 'User not found' };
  }
  
  if (!canPostBulletin(userId, category)) {
    return { error: 'Unauthorized - You do not have permission to post in this category' };
  }
  
  const stmt = db.prepare('INSERT INTO bulletins (title, body, category, user_id) VALUES (?, ?, ?, ?)');
  return stmt.run(title, body, category, userId);
}

// Delete bulletin with role-based permissions
function deleteBulletin(bulletinId, userId) {
  const user = getUserById(userId);
  if (!user) {
    return { error: 'User not found' };
  }
  
  // Get the bulletin to check its category and author
  const bulletin = db.prepare('SELECT category, user_id FROM bulletins WHERE id = ?').get(bulletinId);
  if (!bulletin) {
    return { error: 'Bulletin not found' };
  }
  
  // Allow deletion if user has permission OR is the author
  if (!canDeleteBulletin(userId, bulletin.category) && bulletin.user_id !== userId) {
    return { error: 'Unauthorized - You do not have permission to delete this bulletin' };
  }
  
  const stmt = db.prepare('DELETE FROM bulletins WHERE id = ?');
  return stmt.run(bulletinId);
}

// Messages
function getInbox(userId) {
  const result = db.prepare(`
    SELECT m.*, 
           u.name AS sender_name,
           (SELECT COUNT(*) FROM messages WHERE thread_id = m.thread_id) as message_count,
           (SELECT GROUP_CONCAT(users.name, ', ') 
            FROM thread_participants tp 
            JOIN users ON tp.user_id = users.id 
            WHERE tp.thread_id = m.thread_id AND tp.user_id != ?) as participant_names
    FROM messages m 
    JOIN users u ON m.sender_id = u.id 
    WHERE m.thread_id IN (
      SELECT thread_id FROM thread_participants WHERE user_id = ?
    )
    AND m.id IN (
      SELECT MAX(id) 
      FROM messages 
      WHERE thread_id IN (
        SELECT thread_id FROM thread_participants WHERE user_id = ?
      )
      GROUP BY thread_id
    )
    ORDER BY m.created_at DESC
  `).all(userId, userId, userId);
  
  console.log('getInbox result:', result);
  return result;
}

function getThreadMessages(threadId) {
  return db.prepare(`
    SELECT m.*, 
           sender.name AS sender_name
    FROM messages m 
    JOIN users sender ON m.sender_id = sender.id
    WHERE m.thread_id = ?
    ORDER BY m.created_at ASC
  `).all(threadId);
}

function sendMessage(senderId, recipients, subject, body, threadId = null, parentMessageId = null) {
  // recipients should be an array of user IDs
  const recipientArray = Array.isArray(recipients) ? recipients : [recipients];
  
  // Create ONE message for the group (use first recipient as placeholder in recipient_id field)
  // The real participant list is managed by thread_participants table
  const stmt = db.prepare(`
    INSERT INTO messages (sender_id, recipient_id, subject, body, thread_id, parent_message_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(senderId, recipientArray[0], subject, body, threadId, parentMessageId);
  const messageId = result.lastInsertRowid;
  
  // If no threadId provided, this is a new thread - use the message ID as thread ID
  let actualThreadId = threadId;
  if (!threadId) {
    actualThreadId = messageId;
    db.prepare('UPDATE messages SET thread_id = ? WHERE id = ?').run(actualThreadId, messageId);
  }
  
  // Add all participants to the thread (including sender)
  const addParticipant = db.prepare(`
    INSERT OR IGNORE INTO thread_participants (thread_id, user_id)
    VALUES (?, ?)
  `);
  
  // Add sender
  addParticipant.run(actualThreadId, senderId);
  
  // Add all recipients
  recipientArray.forEach(recipientId => {
    addParticipant.run(actualThreadId, recipientId);
  });
  
  return { ...result, threadId: actualThreadId, lastInsertRowid: messageId };
}

function getSent(userId) {
  return db.prepare('SELECT m.*, u.name AS recipient_name FROM messages m JOIN users u ON m.recipient_id = u.id WHERE m.sender_id = ? ORDER BY created_at DESC').all(userId);
}

// Delete message
function deleteMessage(messageId, userId) {
  // Get the message to find its thread
  const message = db.prepare('SELECT thread_id FROM messages WHERE id = ?').get(messageId);
  
  if (!message) {
    return { changes: 0 };
  }
  
  // Check if user is a participant in this thread
  const isParticipant = db.prepare(`
    SELECT 1 FROM thread_participants 
    WHERE thread_id = ? AND user_id = ?
  `).get(message.thread_id, userId);
  
  if (!isParticipant) {
    return { changes: 0 };
  }
  
  // Remove user from thread participants (they can rejoin if someone replies)
  const stmt = db.prepare('DELETE FROM thread_participants WHERE thread_id = ? AND user_id = ?');
  return stmt.run(message.thread_id, userId);
}

// Attachments
function addAttachment(filename, originalFilename, filePath, fileSize, mimeType, bulletinId, messageId) {
  const stmt = db.prepare('INSERT INTO attachments (filename, original_filename, file_path, file_size, mime_type, bulletin_id, message_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  return stmt.run(filename, originalFilename, filePath, fileSize, mimeType, bulletinId, messageId);
}

function getAttachmentsByBulletin(bulletinId) {
  return db.prepare('SELECT * FROM attachments WHERE bulletin_id = ?').all(bulletinId);
}

function getAttachmentsByMessage(messageId) {
  return db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(messageId);
}

function deleteAttachment(attachmentId) {
  const stmt = db.prepare('DELETE FROM attachments WHERE id = ?');
  return stmt.run(attachmentId);
}

// User Management (Admin only)
function createUser(email, name, username, password, roles, requestingUserId) {
  const requestingUser = getUserById(requestingUserId);
  if (!requestingUser || requestingUser.role !== 'admin') {
    return { error: 'Unauthorized - Admin access required' };
  }
  
  // Validate roles
  const rolesArray = Array.isArray(roles) ? roles : [roles];
  
  // NEW: Check if trying to assign super_user role
  if (rolesArray.includes('super_user') && requestingUser.role !== 'super_user') {
    return { error: 'Only Super Users can assign Super User role' };
  }
  
  for (const role of rolesArray) {
    if (!ROLE_HIERARCHY.hasOwnProperty(role)) {
      return { error: `Invalid role: ${role}` };
    }
  }
  
  // Determine primary role (highest level) and isAdmin
  const primaryRole = rolesArray.reduce((highest, role) => 
    getRoleLevel(role) > getRoleLevel(highest) ? role : highest
  );
  const isAdmin = rolesArray.includes('admin') ? 1 : 0;
  
  const hashedPassword = hashPassword(password);
  const stmt = db.prepare('INSERT INTO users (email, name, username, password_hash, is_admin, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(email, name, username, hashedPassword, isAdmin, primaryRole, 'active');
  
  // Add all roles
  const userId = result.lastInsertRowid;
  setUserRoles(userId, rolesArray);
  
  return result;
}

function updateUser(userId, email, name, username, roles, requestingUserId) {
  const requestingUser = getUserById(requestingUserId);
  if (!requestingUser || requestingUser.role !== 'admin') {
    return { error: 'Unauthorized - Admin access required' };
  }
  
  // Validate roles
  const rolesArray = Array.isArray(roles) ? roles : [roles];
  
  // NEW: Check if trying to assign super_user role
  if (rolesArray.includes('super_user') && requestingUser.role !== 'super_user') {
    return { error: 'Only Super Users can assign Super User role' };
  }
  
  for (const role of rolesArray) {
    if (!ROLE_HIERARCHY.hasOwnProperty(role)) {
      return { error: `Invalid role: ${role}` };
    }
  }
  
  // Determine primary role (highest level) and isAdmin
  const primaryRole = rolesArray.reduce((highest, role) => 
    getRoleLevel(role) > getRoleLevel(highest) ? role : highest
  );
  const isAdmin = rolesArray.includes('admin') ? 1 : 0;
  
  const stmt = db.prepare('UPDATE users SET email = ?, name = ?, username = ?, is_admin = ?, role = ? WHERE id = ?');
  const result = stmt.run(email, name, username, isAdmin, primaryRole, userId);
  
  // Update roles
  setUserRoles(userId, rolesArray);
  
  return result;
}

function deleteUser(userId, requestingUserId) {
  const requestingUser = getUserById(requestingUserId);
  if (!requestingUser || requestingUser.role !== 'admin') {
    return { error: 'Unauthorized - Admin access required' };
  }
  
  // Don't allow deleting yourself
  if (userId === requestingUserId) {
    return { error: 'Cannot delete your own account' };
  }
  
  //Don't allow deleting super users
  const targetUser = getUserById(userId);
  if (targetUser && (targetUser.role === 'super_user' || targetUser.roles?.includes('super_user'))) {
    return { error: 'Cannot delete Super User accounts' };
  }
  
  try {
    // Delete all related records first (in order to avoid foreign key constraints)
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM bulletin_reads WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM message_reads WHERE user_id = ?').run(userId);
    
    // Delete messages sent by this user
    db.prepare('DELETE FROM messages WHERE sender_id = ?').run(userId);
    
    // Delete messages received by this user
    db.prepare('DELETE FROM messages WHERE recipient_id = ?').run(userId);
    
    // Delete bulletins created by this user
    db.prepare('DELETE FROM bulletins WHERE user_id = ?').run(userId);
    
    // Finally delete the user
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    return stmt.run(userId);
  } catch (err) {
    console.error('Error deleting user:', err);
    return { error: 'Failed to delete user: ' + err.message };
  }
}

function resetPassword(userId, newPassword, requestingUserId) {
  const requestingUser = getUserById(requestingUserId);
  if (!requestingUser || requestingUser.role !== 'admin') {
    return { error: 'Unauthorized - Admin access required' };
  }
  
  const hashedPassword = hashPassword(newPassword);
  const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  return stmt.run(hashedPassword, userId);
}

module.exports = {
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
  getUserRoles,
  getUsersByRole,
  setUserRoles,
  addUserRole,
  removeUserRole,
};