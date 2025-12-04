const { pool } = require('./config/db');
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

function isAdminOrHigher(user) {
  if (!user) return false;
  const userRoles = user.roles || [user.role];
  return userRoles.includes('admin') || userRoles.includes('super_user');
}

function isChiefOrHigher(role) {
  return getRoleLevel(role) >= getRoleLevel('chief');
}

// Get all roles for a user
async function getUserRoles(userId) {
  const result = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  return result.rows.map(r => r.role);
}

// Add role to user
async function addUserRole(userId, role) {
  await pool.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, role]);
}

// Set multiple roles for a user (replaces all existing roles)
async function setUserRoles(userId, roles, existingClient = null) {
  const client = existingClient || await pool.connect();
  const shouldRelease = !existingClient;
  
  try {
    if (!existingClient) await client.query('BEGIN');
    
    // Delete existing roles
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    
    // Add new roles
    for (const role of roles) {
      await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [userId, role]);
    }
    
    // Update primary role in users table (use highest level role)
    if (roles.length > 0) {
      const primaryRole = roles.reduce((highest, role) => 
        getRoleLevel(role) > getRoleLevel(highest) ? role : highest
      );
      await client.query('UPDATE users SET role = $1 WHERE id = $2', [primaryRole, userId]);
    }
    
    if (!existingClient) await client.query('COMMIT');
  } catch (err) {
    if (!existingClient) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (shouldRelease) client.release();
  }
}

// Get users by role
async function getUsersByRole(role) {
  const result = await pool.query(`
    SELECT DISTINCT u.id, u.name, u.email, u.username
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    WHERE ur.role = $1 AND u.status = 'active'
    ORDER BY u.name
  `, [role]);
  return result.rows;
}

async function canViewBulletin(userId, category) {
  const user = await getUserById(userId);
  if (!user) return false;
  
  const userRoles = user.roles || [user.role];
  
  // Admin and Super User can view everything
  if (userRoles.includes('admin') || userRoles.includes('super_user')) {
    return true;
  }
  
  // Check based on category
  switch(category) {
    case 'west-wing':
    case 'training':
    case 'fire-prevention':
    case 'repair-division':
      return true; // Everyone can view these
    case 'alarm-division':
      return userRoles.some(role => 
        role === 'alarm_division' || 
        role === 'alarm_supervisor' || 
        getRoleLevel(role) >= getRoleLevel('chief')
      );
    case 'commissioners':
      return userRoles.some(role => getRoleLevel(role) >= getRoleLevel('fire_commissioner'));
    default:
      return true;
  }
}

async function canPostBulletin(userId, category) {
  const user = await getUserById(userId);
  if (!user) return false;
  
  const userRoles = user.roles || [user.role];
  
  // Admin and Super User can post everywhere
  if (userRoles.includes('admin') || userRoles.includes('super_user')) {
    return true;
  }
  
  switch(category) {
    case 'west-wing':
      return userRoles.some(role => getRoleLevel(role) >= getRoleLevel('deputy'));
    case 'training':
      return userRoles.some(role => role === 'training' || getRoleLevel(role) >= getRoleLevel('chief'));
    case 'fire-prevention':
      return userRoles.some(role => role === 'prevention_captain' || getRoleLevel(role) >= getRoleLevel('chief'));
    case 'repair-division':
      return userRoles.some(role => role === 'repair_division_supervisor' || getRoleLevel(role) >= getRoleLevel('chief'));
    case 'alarm-division':
      return userRoles.some(role => role === 'alarm_supervisor' || getRoleLevel(role) >= getRoleLevel('chief'));
    case 'commissioners':
      return userRoles.some(role => getRoleLevel(role) >= getRoleLevel('fire_commissioner'));
    default:
      return false;
  }
}

async function canDeleteBulletin(userId, category) {
  const user = await getUserById(userId);
  if (!user) return false;
  
  const userRoles = user.roles || [user.role];
  
  // Admin and Super User can delete everything
  if (userRoles.includes('admin') || userRoles.includes('super_user')) {
    return true;
  }
  
  switch(category) {
    case 'west-wing':
    case 'training':
    case 'fire-prevention':
    case 'repair-division':
    case 'alarm-division':
      return userRoles.some(role => getRoleLevel(role) >= getRoleLevel('chief'));
    case 'commissioners':
      return userRoles.some(role => getRoleLevel(role) >= getRoleLevel('fire_commissioner'));
    default:
      return false;
  }
}

// Authentication
async function loginUser(username, password) {
  const hashedPassword = hashPassword(password);
  const result = await pool.query(
    'SELECT id, email, name, username, is_admin, role, status FROM users WHERE LOWER(username) = LOWER($1) AND password_hash = $2',
    [username, hashedPassword]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const user = result.rows[0];
  
  if (user.status !== 'active') {
    return { error: 'Account is pending approval or has been rejected' };
  }
  
  // Add all roles to user object
  user.roles = await getUserRoles(user.id);
  
  // If user has no roles in user_roles table, add their primary role
  if (user.roles.length === 0 && user.role) {
    await addUserRole(user.id, user.role);
    user.roles = [user.role];
  }
  
  return user;
}

async function getUserById(userId) {
  const result = await pool.query(
    'SELECT id, email, name, username, is_admin, role, status FROM users WHERE id = $1',
    [userId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const user = result.rows[0];
  user.roles = await getUserRoles(userId);
  return user;
}

// Users
async function getUsers() {
  const result = await pool.query(
    'SELECT id, email, name, username, is_admin, role, status FROM users ORDER BY name'
  );
  
  // Add roles to each user
  for (const user of result.rows) {
    user.roles = await getUserRoles(user.id);
  }
  
  return result.rows;
}

// Get pending users (for admin approval)
async function getPendingUsers() {
  const result = await pool.query(
    "SELECT id, email, name, username, status, created_at FROM users WHERE status = 'pending' ORDER BY created_at DESC"
  );
  return result.rows;
}

// Public user registration
async function registerUser(email, name, username, password) {
  const existingUser = await pool.query(
    'SELECT id FROM users WHERE username = $1 OR email = $2',
    [username, email]
  );
  
  if (existingUser.rows.length > 0) {
    return { error: 'Username or email already exists' };
  }
  
  const hashedPassword = hashPassword(password);
  
  try {
    const result = await pool.query(
      "INSERT INTO users (email, name, username, password_hash, is_admin, role, status) VALUES ($1, $2, $3, $4, 0, 'firefighter', 'pending') RETURNING id",
      [email, name, username, hashedPassword]
    );
    return { success: true, id: result.rows[0].id };
  } catch (err) {
    return { error: 'Registration failed: ' + err.message };
  }
}

// Admin approves user
async function approveUser(userId, assignedRole, requestingUserId) {
  const requestingUser = await getUserById(requestingUserId);
  if (!requestingUser || !isChiefOrHigher(requestingUser.role)) {
    return { error: 'Unauthorized - Chief or Admin access required' };
  }
  
  if (!ROLE_HIERARCHY.hasOwnProperty(assignedRole)) {
    return { error: 'Invalid role' };
  }
  
  const isAdmin = assignedRole === 'admin' ? 1 : 0;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(
      "UPDATE users SET status = 'active', role = $1, is_admin = $2 WHERE id = $3",
      [assignedRole, isAdmin, userId]
    );
    
    await client.query(
      'INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, assignedRole]
    );
    
    await client.query('COMMIT');
    return { changes: 1 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Admin rejects user
async function rejectUser(userId, requestingUserId) {
  const requestingUser = await getUserById(requestingUserId);
  if (!requestingUser || !isChiefOrHigher(requestingUser.role)) {
    return { error: 'Unauthorized - Chief or Admin access required' };
  }
  
  // Delete the user permanently instead of just marking as rejected
  const result = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  return { changes: result.rowCount };
}

// Bulletins
async function getBulletins() {
  const result = await pool.query(`
    SELECT b.*, u.name as author_name 
    FROM bulletins b 
    JOIN users u ON b.user_id = u.id 
    ORDER BY b.created_at DESC
  `);
  return result.rows;
}

async function getBulletinsByCategory(category, userId = null) {
  const result = await pool.query(`
    SELECT b.*, u.name as author_name, b.user_id as author_id
    FROM bulletins b 
    JOIN users u ON b.user_id = u.id 
    WHERE b.category = $1 
    ORDER BY b.created_at DESC
  `, [category]);
  
  return result.rows;
}

async function addBulletin(title, body, category, userId) {
  const user = await getUserById(userId);
  if (!user) {
    return { error: 'User not found' };
  }
  
  const result = await pool.query(
    'INSERT INTO bulletins (title, body, category, user_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [title, body, category, userId]
  );
  
  return { lastInsertRowid: result.rows[0].id };
}

async function deleteBulletin(bulletinId, userId) {
  const user = await getUserById(userId);
  if (!user) {
    return { error: 'User not found' };
  }
  
  const bulletinResult = await pool.query('SELECT category, user_id FROM bulletins WHERE id = $1', [bulletinId]);
  if (bulletinResult.rows.length === 0) {
    return { error: 'Bulletin not found' };
  }
  
  const result = await pool.query('DELETE FROM bulletins WHERE id = $1', [bulletinId]);
  return { changes: result.rowCount };
}

// Messages
async function getInbox(userId) {
  const result = await pool.query(`
    SELECT m.*, 
           u.name AS sender_name,
           (SELECT COUNT(*) FROM messages WHERE thread_id = m.thread_id) as message_count,
           (SELECT STRING_AGG(users.name, ', ') 
            FROM thread_participants tp 
            JOIN users ON tp.user_id = users.id 
            WHERE tp.thread_id = m.thread_id AND tp.user_id != $1) as participant_names
    FROM messages m 
    JOIN users u ON m.sender_id = u.id 
    WHERE m.thread_id IN (
      SELECT thread_id FROM thread_participants WHERE user_id = $1
    )
    AND m.id IN (
      SELECT MAX(id) 
      FROM messages 
      WHERE thread_id IN (
        SELECT thread_id FROM thread_participants WHERE user_id = $1
      )
      GROUP BY thread_id
    )
    ORDER BY m.created_at DESC
  `, [userId]);
  
  return result.rows;
}

async function getThreadMessages(threadId) {
  const result = await pool.query(`
    SELECT m.*, 
           sender.name AS sender_name
    FROM messages m 
    JOIN users sender ON m.sender_id = sender.id
    WHERE m.thread_id = $1
    ORDER BY m.created_at ASC
  `, [threadId]);
  
  return result.rows;
}

async function sendMessage(senderId, recipients, subject, body, threadId = null, parentMessageId = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const recipientArray = Array.isArray(recipients) ? recipients : [recipients];
    
    const result = await client.query(
      'INSERT INTO messages (sender_id, recipient_id, subject, body, thread_id, parent_message_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [senderId, recipientArray[0], subject, body, threadId, parentMessageId]
    );
    
    const messageId = result.rows[0].id;
    
    let actualThreadId = threadId;
    if (!threadId) {
      actualThreadId = messageId;
      await client.query('UPDATE messages SET thread_id = $1 WHERE id = $2', [actualThreadId, messageId]);
    }
    
    await client.query(
      'INSERT INTO thread_participants (thread_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [actualThreadId, senderId]
    );
    
    for (const recipientId of recipientArray) {
      await client.query(
        'INSERT INTO thread_participants (thread_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [actualThreadId, recipientId]
      );
    }
    
    await client.query('COMMIT');
    return { lastInsertRowid: messageId, threadId: actualThreadId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getSent(userId) {
  const result = await pool.query(
    'SELECT m.*, u.name AS recipient_name FROM messages m JOIN users u ON m.recipient_id = u.id WHERE m.sender_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

async function deleteMessage(messageId, userId) {
  const messageResult = await pool.query('SELECT thread_id FROM messages WHERE id = $1', [messageId]);
  
  if (messageResult.rows.length === 0) {
    return { changes: 0 };
  }
  
  const threadId = messageResult.rows[0].thread_id;
  
  const participantResult = await pool.query(
    'SELECT 1 FROM thread_participants WHERE thread_id = $1 AND user_id = $2',
    [threadId, userId]
  );
  
  if (participantResult.rows.length === 0) {
    return { changes: 0 };
  }
  
  const result = await pool.query(
    'DELETE FROM thread_participants WHERE thread_id = $1 AND user_id = $2',
    [threadId, userId]
  );
  
  return { changes: result.rowCount };
}

// Attachments
async function addAttachment(filename, originalFilename, filePath, fileSize, mimeType, bulletinId, messageId) {
  const result = await pool.query(
    'INSERT INTO attachments (filename, original_filename, file_path, file_size, mime_type, bulletin_id, message_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [filename, originalFilename, filePath, fileSize, mimeType, bulletinId, messageId]
  );
  return { lastInsertRowid: result.rows[0].id };
}

async function getAttachmentsByBulletin(bulletinId) {
  const result = await pool.query('SELECT * FROM attachments WHERE bulletin_id = $1', [bulletinId]);
  return result.rows;
}

async function getAttachmentsByMessage(messageId) {
  const result = await pool.query('SELECT * FROM attachments WHERE message_id = $1', [messageId]);
  return result.rows;
}

async function deleteAttachment(attachmentId) {
  const result = await pool.query('DELETE FROM attachments WHERE id = $1', [attachmentId]);
  return { changes: result.rowCount };
}

// User Management (Admin only)
async function createUser(email, name, username, password, roles, requestingUserId) {
  const requestingUser = await getUserById(requestingUserId);
  if (!isAdminOrHigher(requestingUser)) {
    return { error: 'Unauthorized - Admin access required' };
  }
  
  const rolesArray = Array.isArray(roles) ? roles : [roles];
  
  if (rolesArray.includes('super_user') && !requestingUser.roles?.includes('super_user') && requestingUser.role !== 'super_user') {
    return { error: 'Only Super Users can assign Super User role' };
  }
  
  for (const role of rolesArray) {
    if (!ROLE_HIERARCHY.hasOwnProperty(role)) {
      return { error: `Invalid role: ${role}` };
    }
  }
  
  const primaryRole = rolesArray.reduce((highest, role) => 
    getRoleLevel(role) > getRoleLevel(highest) ? role : highest
  );
  const isAdmin = rolesArray.includes('admin') ? 1 : 0;
  
  const hashedPassword = hashPassword(password);
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const result = await client.query(
      "INSERT INTO users (email, name, username, password_hash, is_admin, role, status) VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id",
      [email, name, username, hashedPassword, isAdmin, primaryRole]
    );
    
    const userId = result.rows[0].id;
    
    for (const role of rolesArray) {
      await client.query(
        'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
        [userId, role]
      );
    }
    
    await client.query('COMMIT');
    return { lastInsertRowid: userId };
} catch (err) {
    await client.query('ROLLBACK');
    // Return error instead of throwing
    if (err.code === '23505') {  // PostgreSQL unique constraint violation
      return { error: 'Username or email already exists' };
    }
    return { error: 'Failed to create user: ' + err.message };
  } finally {
    client.release();
  }
}

async function updateUser(userId, email, name, username, roles, requestingUserId) {
  const requestingUser = await getUserById(requestingUserId);
  if (!isAdminOrHigher(requestingUser)) {
    return { error: 'Unauthorized - Admin access required' };
  }
  
  const targetUser = await getUserById(userId);
  if (targetUser && (targetUser.role === 'super_user' || targetUser.roles?.includes('super_user'))) {
    if (requestingUser.role !== 'super_user' && !requestingUser.roles?.includes('super_user')) {
      return { error: 'Only Super Users can edit Super User accounts' };
    }
  }
  
  const rolesArray = Array.isArray(roles) ? roles : [roles];
  
  if (rolesArray.includes('super_user') && requestingUser.role !== 'super_user') {
    return { error: 'Only Super Users can assign Super User role' };
  }
  
  for (const role of rolesArray) {
    if (!ROLE_HIERARCHY.hasOwnProperty(role)) {
      return { error: `Invalid role: ${role}` };
    }
  }
  
  const primaryRole = rolesArray.reduce((highest, role) => 
    getRoleLevel(role) > getRoleLevel(highest) ? role : highest
  );
  const isAdmin = rolesArray.includes('admin') ? 1 : 0;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(
      'UPDATE users SET email = $1, name = $2, username = $3, is_admin = $4, role = $5 WHERE id = $6',
      [email, name, username, isAdmin, primaryRole, userId]
    );
    
    await setUserRoles(userId, rolesArray, client);
    
await client.query('COMMIT');
    return { success: true, id: userId };
  } catch (err) {
    await client.query('ROLLBACK');
    // Return error instead of throwing
    if (err.code === '23505') {  // PostgreSQL unique constraint violation
      return { error: 'Username or email already exists' };
    }
    return { error: 'Failed to create user: ' + err.message };
  } finally {
    client.release();
  }
}

async function deleteUser(userId, requestingUserId) {
  const requestingUser = await getUserById(requestingUserId);
  if (!isAdminOrHigher(requestingUser)) {
    return { error: 'Unauthorized - Admin access required' };
  }
  
  if (userId === requestingUserId) {
    return { error: 'Cannot delete your own account' };
  }
  
  const targetUser = await getUserById(userId);
  if (targetUser && (targetUser.role === 'super_user' || targetUser.roles?.includes('super_user'))) {
    return { error: 'Cannot delete Super User accounts' };
  }
  
  const result = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  return { changes: result.rowCount };
}

async function resetPassword(userId, newPassword, requestingUserId) {
  const requestingUser = await getUserById(requestingUserId);
  if (!isAdminOrHigher(requestingUser)) {
    return { error: 'Unauthorized - Admin access required' };
  }
  
  const targetUser = await getUserById(userId);
  if (targetUser && (targetUser.role === 'super_user' || targetUser.roles?.includes('super_user'))) {
    if (requestingUser.role !== 'super_user' && !requestingUser.roles?.includes('super_user')) {
      return { error: 'Only Super Users can reset Super User passwords' };
    }
  }
  
  const hashedPassword = hashPassword(newPassword);
  const result = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);
  return { changes: result.rowCount };
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
};