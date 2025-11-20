const { pool } = require('../config/db');
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function createSuperUser() {
  const client = await pool.connect();
  
  try {
    // Check if super user exists
    const check = await client.query("SELECT * FROM users WHERE username = 'superadmin'");
    
    if (check.rows.length > 0) {
      console.log('Super user already exists!');
      return;
    }
    
    // Create super user
    const password = 'SuperAdmin123!';
    const hashedPassword = hashPassword(password);
    
    const result = await client.query(
      `INSERT INTO users (email, name, username, password_hash, is_admin, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      ['superadmin@holyokefire.com', 'Super Administrator', 'superadmin', hashedPassword, 1, 'super_user', 'active']
    );
    
    const userId = result.rows[0].id;
    
    // Add super_user role
    await client.query(
      'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
      [userId, 'super_user']
    );
    
    console.log('✓ Super user created successfully!');
    console.log('Username: superadmin');
    console.log('Password: SuperAdmin123!');
    
  } catch (err) {
    console.error('Error creating super user:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

createSuperUser();