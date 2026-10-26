// Encrypted database backups.
//
//  - dumpDatabase()          reads every table in one consistent snapshot
//  - encrypt() / decrypt()   gzip + AES-256-GCM, key from BACKUP_ENCRYPTION_KEY
//  - createStoredBackup()    uploads an encrypted snapshot to Cloudinary (private) and keeps the newest 7
//  - runScheduledBackupIfDue() called by server.js; makes a backup if none exists from the last ~23 hours
//  - restoreBackup()         used by scripts/restore-backup.js (command line only, not the web app)
//
// A backup contains every message and every password hash, so it is only ever
// stored or sent encrypted. Losing BACKUP_ENCRYPTION_KEY means losing the ability
// to read the backups, so keep a copy of it somewhere safe outside Render.

const crypto = require('crypto');
const zlib = require('zlib');

// Dependency order (parents first). Restore inserts in this order.
const TABLES = [
  'users',
  'user_roles',
  'bulletins',
  'messages',
  'thread_participants',
  'attachments',
  'bulletin_reads',
  'message_reads',
  'password_reset_requests',
  'push_tokens',
  'file_library',
  'display_keys'
];

const BACKUP_FOLDER = 'hfc-backups';
const KEEP = 7;
const MIN_KEY_LENGTH = 16;
const MAGIC = Buffer.from('HFCB1');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const SCHEDULE_MIN_AGE_MS = 23 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------
function getKey() {
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  return key && key.length >= MIN_KEY_LENGTH ? key : null;
}

function getPool() {
  return require('../config/db').pool;
}

function getCloud() {
  if (!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) {
    return null;
  }
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
  return cloudinary;
}

// ---------------------------------------------------------------------------
// Dump + encryption
// ---------------------------------------------------------------------------
async function dumpDatabase(pool = getPool()) {
  const client = await pool.connect();
  try {
    // One snapshot for every table, so messages can't reference a user that
    // was created a second after the users table was read
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables = {};
    for (const table of TABLES) {
      const exists = await client.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${table}`]);
      if (!exists.rows[0].ok) continue;
      // json_agg keeps timestamps as exact text, so nothing is lost to time zones
      const result = await client.query(`SELECT COALESCE(json_agg(x), '[]'::json) AS rows FROM "${table}" x`);
      tables[table] = result.rows[0].rows;
    }
    await client.query('COMMIT');
    return { format: 'hfc-backup', version: 1, created_at: new Date().toISOString(), tables };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

function encrypt(plain, passphrase = getKey()) {
  if (!passphrase) {
    throw new Error('BACKUP_ENCRYPTION_KEY is not set (it must be at least 16 characters)');
  }
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const derived = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
  const body = Buffer.concat([cipher.update(zlib.gzipSync(plain)), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

function decrypt(buffer, passphrase = getKey()) {
  if (!passphrase) {
    throw new Error('BACKUP_ENCRYPTION_KEY is not set');
  }
  const headerLen = MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN;
  if (buffer.length <= headerLen || !buffer.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('This is not a Holyoke Fire Connect backup file');
  }
  let offset = MAGIC.length;
  const salt = buffer.subarray(offset, (offset += SALT_LEN));
  const iv = buffer.subarray(offset, (offset += IV_LEN));
  const tag = buffer.subarray(offset, (offset += TAG_LEN));
  const body = buffer.subarray(offset);

  try {
    const derived = crypto.scryptSync(passphrase, salt, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', derived, iv);
    decipher.setAuthTag(tag);
    return zlib.gunzipSync(Buffer.concat([decipher.update(body), decipher.final()]));
  } catch (err) {
    throw new Error('Could not decrypt: wrong BACKUP_ENCRYPTION_KEY, or the file is damaged');
  }
}

function parseBackup(plainBuffer) {
  const data = JSON.parse(plainBuffer.toString('utf8'));
  if (!data || data.format !== 'hfc-backup' || !data.tables) {
    throw new Error('Backup contents are not in the expected format');
  }
  return data;
}

function countRows(data) {
  const counts = {};
  Object.keys(data.tables).forEach(t => { counts[t] = data.tables[t].length; });
  return counts;
}

function backupName(date = new Date()) {
  const stamp = date.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
  return `hfc-backup-${stamp}.hfcb`;
}

async function createEncryptedBackup({ pool, now = new Date() } = {}) {
  const data = await dumpDatabase(pool);
  const buffer = encrypt(Buffer.from(JSON.stringify(data), 'utf8'));
  return { buffer, name: backupName(now), counts: countRows(data) };
}

// ---------------------------------------------------------------------------
// Cloudinary storage (private "authenticated" raw files, encrypted before upload)
// ---------------------------------------------------------------------------
const isBackupId = (id) =>
  typeof id === 'string' &&
  id.startsWith(`${BACKUP_FOLDER}/`) &&
  /^[A-Za-z0-9_\-/.]+$/.test(id) &&
  !id.includes('..');

function uploadBuffer(cloud, buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloud.uploader.upload_stream(
      { resource_type: 'raw', type: 'authenticated', public_id: publicId, overwrite: false },
      (err, res) => (err ? reject(err) : resolve(res))
    );
    stream.end(buffer);
  });
}

async function listStored(cloud = getCloud()) {
  const res = await cloud.api.resources({
    resource_type: 'raw',
    type: 'authenticated',
    prefix: `${BACKUP_FOLDER}/`,
    max_results: 100
  });
  return (res.resources || [])
    .map(r => ({
      id: r.public_id,
      name: r.public_id.split('/').pop(),
      created_at: r.created_at,
      bytes: r.bytes
    }))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

async function pruneStored(cloud, keep = KEEP) {
  const all = await listStored(cloud);
  const old = all.slice(keep).map(b => b.id);
  if (old.length) {
    await cloud.api.delete_resources(old, { resource_type: 'raw', type: 'authenticated' });
  }
  return old.length;
}

async function createStoredBackup({ pool, cloud = getCloud(), now = new Date() } = {}) {
  if (!cloud) throw new Error('Cloudinary is not configured');
  const { buffer, name, counts } = await createEncryptedBackup({ pool, now });
  const uploaded = await uploadBuffer(cloud, buffer, `${BACKUP_FOLDER}/${name}`);
  await pruneStored(cloud);
  return {
    id: uploaded.public_id,
    name,
    created_at: uploaded.created_at,
    bytes: uploaded.bytes,
    counts
  };
}

function signedUrl(id, cloud = getCloud()) {
  return cloud.url(id, { resource_type: 'raw', type: 'authenticated', sign_url: true, secure: true });
}

async function getStatus() {
  const cloud = getCloud();
  const status = {
    keySet: !!getKey(),
    cloudinaryConfigured: !!cloud,
    keep: KEEP,
    backups: [],
    listError: null
  };
  if (cloud) {
    try {
      status.backups = await listStored(cloud);
    } catch (err) {
      status.listError = (err && err.message) || 'Could not list stored backups';
    }
  }
  return status;
}

// Called by server.js every few hours; only makes a backup if the newest one is old
async function runScheduledBackupIfDue({ pool, cloud = getCloud(), now = new Date() } = {}) {
  if (!getKey()) return { skipped: 'BACKUP_ENCRYPTION_KEY not set' };
  if (!cloud) return { skipped: 'Cloudinary not configured' };
  const stored = await listStored(cloud);
  if (stored.length && now.getTime() - Date.parse(stored[0].created_at) < SCHEDULE_MIN_AGE_MS) {
    return { skipped: 'a recent backup already exists' };
  }
  const created = await createStoredBackup({ pool, cloud, now });
  return { created };
}

// ---------------------------------------------------------------------------
// Restore (command line only: scripts/restore-backup.js)
// ---------------------------------------------------------------------------
const SAFE_NAME = /^[a-z_][a-z0-9_]*$/;

async function restoreBackup(client, data) {
  const present = TABLES.filter(t => data.tables[t]);
  const unknown = Object.keys(data.tables).filter(t => !TABLES.includes(t));
  if (unknown.length) throw new Error(`Backup contains unexpected tables: ${unknown.join(', ')}`);

  await client.query('BEGIN');
  try {
    await client.query(`TRUNCATE ${TABLES.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);

    for (const table of present) {
      const rows = data.tables[table];
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]);
      if (!cols.every(c => SAFE_NAME.test(c))) throw new Error(`Unexpected column name in ${table}`);
      const colList = cols.map(c => `"${c}"`).join(', ');
      await client.query(
        `INSERT INTO "${table}" (${colList}) SELECT ${colList} FROM json_populate_recordset(null::"${table}", $1::json)`,
        [JSON.stringify(rows)]
      );
    }

    // Make the id counters continue after the highest restored id
    for (const table of TABLES) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('public.${table}', 'id'),
                GREATEST(COALESCE((SELECT MAX(id) FROM "${table}"), 0), 1),
                (SELECT MAX(id) FROM "${table}") IS NOT NULL)`
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    throw err;
  }
  return countRows(data);
}

module.exports = {
  TABLES,
  KEEP,
  BACKUP_FOLDER,
  getKey,
  getCloud,
  dumpDatabase,
  encrypt,
  decrypt,
  parseBackup,
  countRows,
  backupName,
  createEncryptedBackup,
  createStoredBackup,
  listStored,
  pruneStored,
  signedUrl,
  isBackupId,
  getStatus,
  runScheduledBackupIfDue,
  restoreBackup
};
