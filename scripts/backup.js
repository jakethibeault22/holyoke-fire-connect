// Encrypted database backups.
//
//  - dumpDatabase()            reads every table in one consistent snapshot
//  - encrypt() / decrypt()     gzip + AES-256-GCM, key from BACKUP_ENCRYPTION_KEY
//  - createStoredBackup()      uploads an encrypted snapshot to Cloudinary (private)
//  - runScheduledBackupIfDue() called by server.js; makes a daily backup if none is recent
//  - restoreWithSafetyCopy()   used by the admin portal's Restore button
//  - restoreBackup()           the restore itself (also used by scripts/restore-backup.js)
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
const DAILY_PREFIX = 'hfc-backup';            // daily + "Back up now"
const SAFETY_PREFIX = 'hfc-prerestore';       // automatic copy taken just before a restore
const KEEP = 7;                               // daily backups kept
const KEEP_SAFETY = 3;                        // safety copies kept
const MIN_KEY_LENGTH = 16;
const MAGIC = Buffer.from('HFCB1');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const SCHEDULE_MIN_AGE_MS = 23 * 60 * 60 * 1000;

let restoreInProgress = false;

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

function backupName(date = new Date(), prefix = DAILY_PREFIX) {
  const stamp = date.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
  return `${prefix}-${stamp}.hfcb`;
}

async function createEncryptedBackup({ pool, now = new Date(), prefix = DAILY_PREFIX } = {}) {
  const data = await dumpDatabase(pool);
  const buffer = encrypt(Buffer.from(JSON.stringify(data), 'utf8'));
  return { buffer, name: backupName(now, prefix), counts: countRows(data) };
}

// ---------------------------------------------------------------------------
// Cloudinary storage (private "authenticated" raw files, encrypted before upload)
// ---------------------------------------------------------------------------
const isBackupId = (id) =>
  typeof id === 'string' &&
  id.startsWith(`${BACKUP_FOLDER}/`) &&
  /^[A-Za-z0-9_\-/.]+$/.test(id) &&
  !id.includes('..');

const kindOf = (id) => (id.split('/').pop().startsWith(`${SAFETY_PREFIX}-`) ? 'safety' : 'daily');

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
      kind: kindOf(r.public_id),
      created_at: r.created_at,
      bytes: r.bytes
    }))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

// Daily backups and safety copies are trimmed separately, so a restore never
// pushes a daily backup out of the list
async function pruneStored(cloud) {
  const all = await listStored(cloud);
  const old = [
    ...all.filter(b => b.kind === 'daily').slice(KEEP),
    ...all.filter(b => b.kind === 'safety').slice(KEEP_SAFETY)
  ].map(b => b.id);
  if (old.length) {
    await cloud.api.delete_resources(old, { resource_type: 'raw', type: 'authenticated' });
  }
  return old.length;
}

async function createStoredBackup({ pool, cloud = getCloud(), now = new Date(), kind = 'daily' } = {}) {
  if (!cloud) throw new Error('Cloudinary is not configured');
  const prefix = kind === 'safety' ? SAFETY_PREFIX : DAILY_PREFIX;
  const { buffer, name, counts } = await createEncryptedBackup({ pool, now, prefix });
  const uploaded = await uploadBuffer(cloud, buffer, `${BACKUP_FOLDER}/${name}`);
  await pruneStored(cloud);
  return {
    id: uploaded.public_id,
    name,
    kind,
    created_at: uploaded.created_at,
    bytes: uploaded.bytes,
    counts
  };
}

function signedUrl(id, cloud = getCloud()) {
  return cloud.url(id, { resource_type: 'raw', type: 'authenticated', sign_url: true, secure: true });
}

// Downloads a stored (still encrypted) backup so it can be restored
async function fetchStored(id, { cloud = getCloud(), fetchImpl = fetch } = {}) {
  if (!cloud) throw new Error('Cloudinary is not configured');
  if (!isBackupId(id)) throw new Error('Invalid backup');
  const res = await fetchImpl(signedUrl(id, cloud));
  if (!res.ok) throw new Error(`Could not download that backup (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
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

// Called by server.js every few hours; only makes a backup if the newest daily one is old
async function runScheduledBackupIfDue({ pool, cloud = getCloud(), now = new Date() } = {}) {
  if (!getKey()) return { skipped: 'BACKUP_ENCRYPTION_KEY not set' };
  if (!cloud) return { skipped: 'Cloudinary not configured' };
  const stored = (await listStored(cloud)).filter(b => b.kind === 'daily');
  if (stored.length && now.getTime() - Date.parse(stored[0].created_at) < SCHEDULE_MIN_AGE_MS) {
    return { skipped: 'a recent backup already exists' };
  }
  const created = await createStoredBackup({ pool, cloud, now });
  return { created };
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------
const SAFE_NAME = /^[a-z_][a-z0-9_]*$/;
const ADMIN_ROLES = ['admin', 'super_user'];

// Returns a problem description, or null if the backup is safe to restore
function checkRestorable(data) {
  const users = data.tables && data.tables.users;
  if (!Array.isArray(users) || users.length === 0) {
    return 'This backup contains no users, so restoring it would lock everyone out.';
  }
  const hasAdmin = users.some(u => u.status === 'active' && ADMIN_ROLES.includes(u.role));
  if (!hasAdmin) {
    return 'This backup has no active admin account, so restoring it would lock everyone out.';
  }
  const unknown = Object.keys(data.tables).filter(t => !TABLES.includes(t));
  if (unknown.length) return `Backup contains unexpected tables: ${unknown.join(', ')}`;
  return null;
}

async function currentCounts(pool = getPool()) {
  const counts = {};
  for (const table of TABLES) {
    const exists = await pool.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${table}`]);
    if (!exists.rows[0].ok) continue;
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
    counts[table] = r.rows[0].n;
  }
  return counts;
}

async function restoreBackup(client, data) {
  const unknown = Object.keys(data.tables).filter(t => !TABLES.includes(t));
  if (unknown.length) throw new Error(`Backup contains unexpected tables: ${unknown.join(', ')}`);
  const present = TABLES.filter(t => data.tables[t]);

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

// The portal's Restore button: saves a safety copy of the CURRENT data first, then
// replaces everything with the backup. If the safety copy can't be saved, nothing is touched.
async function restoreWithSafetyCopy({ pool = getPool(), cloud = getCloud(), data, now = new Date() }) {
  if (!cloud) throw new Error('Cloudinary must be configured so a safety copy can be saved before restoring');
  const problem = checkRestorable(data);
  if (problem) throw new Error(problem);
  if (restoreInProgress) throw new Error('A restore is already running');

  restoreInProgress = true;
  try {
    const safety = await createStoredBackup({ pool, cloud, now, kind: 'safety' });
    const client = await pool.connect();
    let counts;
    try {
      counts = await restoreBackup(client, data);
    } finally {
      client.release();
    }
    return { counts, safety };
  } finally {
    restoreInProgress = false;
  }
}

module.exports = {
  TABLES,
  KEEP,
  KEEP_SAFETY,
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
  fetchStored,
  isBackupId,
  getStatus,
  runScheduledBackupIfDue,
  checkRestorable,
  currentCounts,
  restoreBackup,
  restoreWithSafetyCopy
};
