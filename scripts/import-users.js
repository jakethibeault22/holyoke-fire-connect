const { pool } = require('../config/db');

async function importUsers() {
  const client = await pool.connect();
  
  try {
    console.log('Importing users...');
    
    await client.query('BEGIN');
    
    // Insert users
    await client.query(`INSERT INTO users (id, email, name, username, password_hash, is_admin, role, status, created_at) VALUES (1, 'superadmin@holyokefire.com', 'Super Administrator', 'superadmin', '1cbf46107d2e302a2de3233b29ce2f01289993e9b68d31ed254810a4593bfbac', 1, 'super_user', 'active', '2025-12-01 20:05:50.571003')`);
    await client.query(`INSERT INTO users (id, email, name, username, password_hash, is_admin, role, status, created_at) VALUES (2, 'Jake.Thibeault@gmail.com', 'Jake Thibeault', 'ThibeaultJ', '7db8872eca26708d4e4b900aec4d2a69ed3f7670bb0a712d8402456fb728142c', 1, 'admin', 'active', '2025-12-01 20:07:10.131332')`);
    await client.query(`INSERT INTO users (id, email, name, username, password_hash, is_admin, role, status, created_at) VALUES (3, 'Parser', 'Parser', 'Parser', 'b17d45121150928f2146af49e195eff1eef5d67325be273a733fb74acadaa342', 0, 'alarm_division', 'active', '2025-12-09 15:24:38.224762')`);
    await client.query(`INSERT INTO users (id, email, name, username, password_hash, is_admin, role, status, created_at) VALUES (4, 'efentondunnigan@gmail.com', 'Elizabeth Fenton', 'EFenton', '0edea30d86cd8a684026022f922158bb917af33e579c55f89a7ad7cac9dfb8f6', 0, 'alarm_division', 'active', '2025-12-09 15:40:05.952814')`);
    await client.query(`INSERT INTO users (id, email, name, username, password_hash, is_admin, role, status, created_at) VALUES (5, 'nathanbutler784@gmail.com', 'Nathan Butler ', 'Nathan_Butler ', '56f09024e35820e1898eca98adaf52e7175cc6177b8d915b2a83227ca65bccb2', 0, 'alarm_division', 'active', '2025-12-09 16:54:02.366998')`);
    await client.query(`INSERT INTO users (id, email, name, username, password_hash, is_admin, role, status, created_at) VALUES (6, 'savagemay1@icloud.com', 'Angel Ruiz', 'ADRuiz', '7c9534599c83243823c42dd77ab7f20164264f2d9c04596214030dbcd54359b0', 0, 'alarm_division', 'active', '2025-12-09 17:01:05.633099')`);
    await client.query(`INSERT INTO users (id, email, name, username, password_hash, is_admin, role, status, created_at) VALUES (7, 'dylandonicz@yahoo.com', 'Dylan Donicz ', 'DDalarm', '131787d6b075acdf6d476b728205692daf51c29d44d0b6fca8f5a1d11b2168ab', 0, 'alarm_division', 'active', '2025-12-09 17:22:27.839015')`);
    await client.query(`INSERT INTO users (id, email, name, username, password_hash, is_admin, role, status, created_at) VALUES (10, 'nickcallahan13@hotmail.com', 'Nick Callahan ', 'NickC', 'b48da1934adf8c59e946896c7f2e5c58fa07b450cd30703d18c6df3e7947c393', 0, 'training', 'active', '2025-12-09 17:42:01.756601')`);
    await client.query(`INSERT INTO users (id, email, name, username, password_hash, is_admin, role, status, created_at) VALUES (11, 'wellerr@holyoke.org', 'Robert J Weller', 'Caymus67', '213d750139d307b397285d469ec6fff4e62c6faaceb8cfb5f64dbe5ade799561', 0, 'alarm_supervisor', 'active', '2025-12-10 15:43:21.372186')`);
    await client.query(`INSERT INTO users (id, email, name, username, password_hash, is_admin, role, status, created_at) VALUES (12, 'rexd@holyoke.org', 'David Rex', 'RexD', 'a875f04515dec3714e7db2f42fea02e7b0be2f6de527f3d050f5c9cafc123a81', 0, 'training', 'active', '2025-12-10 17:15:27.037925')`);
    await client.query(`INSERT INTO users (id, email, name, username, password_hash, is_admin, role, status, created_at) VALUES (13, 'dennisgobeil@yahoo.com', 'Dennis Gobeil', 'dgobeil', '861d961fe31b94e433cd35fbbde9102fe6ba3199aaf662b7337cea34cc0ee924', 0, 'alarm_division', 'active', '2025-12-14 09:57:13.930589')`);
    await client.query(`INSERT INTO users (id, email, name, username, password_hash, is_admin, role, status, created_at) VALUES (14, 'ernstm@holyoke.org', 'Matthew Ernst', 'MErnst', '3e9d8a395f3b91c73e2241df2a1d05e8ade44bf334b1a8d972e655a7a9d54de3', 1, 'admin', 'active', '2026-01-12 13:54:02.893207')`);
    await client.query(`INSERT INTO users (id, email, name, username, password_hash, is_admin, role, status, created_at) VALUES (15, 'test', 'test', 'test', 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae', 0, 'officer', 'active', '2026-02-09 14:11:25.75582')`);
    
    console.log('✓ Users imported');
    
    // Insert user_roles
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES (1, 'super_user')`);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES (2, 'admin')`);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES (3, 'alarm_division')`);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES (4, 'alarm_division')`);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES (5, 'alarm_division')`);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES (6, 'alarm_division')`);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES (7, 'alarm_division')`);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES (10, 'training')`);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES (11, 'alarm_supervisor')`);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES (12, 'training')`);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES (13, 'alarm_division')`);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES (14, 'admin')`);
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES (15, 'officer')`);
    
    console.log('✓ User roles imported');
    
    // Reset sequence
    await client.query(`SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))`);
    
    console.log('✓ Sequence reset');
    
    await client.query('COMMIT');
    
    console.log('✓ All users imported successfully!');
    process.exit(0);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error importing users:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

importUsers();