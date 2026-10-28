// Keeps Cloudinary tidy so the free plan goes further.
//
//  - destroyFiles(rows)   delete uploaded files when their bulletin / message /
//                         attachment / library entry is deleted
//  - sweepOrphans(...)    find (and optionally delete) files in Cloudinary that no
//                         database row points to any more
//  - getUsage()           how much of the plan is used, for the admin screen
//
// Nothing here ever throws into a request: a failed delete is logged and the sweep
// will catch the file later.

const FOLDER = 'holyoke-fire-connect';

let client; // undefined = not looked up yet, null = Cloudinary not configured

function getClient() {
  if (client !== undefined) return client;
  client = null;
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    try {
      const cloudinary = require('cloudinary').v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
      });
      client = cloudinary;
    } catch (err) {
      console.warn('Cloudinary not available:', err.message);
    }
  }
  return client;
}

// for tests
function _setClient(c) {
  client = c;
}

function resourceTypeOf(mime) {
  const m = mime || '';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  return 'raw';
}

// rows: [{ filename, file_path, mime_type }]  (attachments / file_library rows)
async function destroyFiles(rows) {
  const cloud = getClient();
  if (!cloud) return 0;
  let removed = 0;
  for (const r of rows || []) {
    // only files that really live in Cloudinary (older local-disk uploads have no http path)
    if (!r || !r.filename || !r.file_path || !String(r.file_path).startsWith('http')) continue;
    try {
      await cloud.uploader.destroy(r.filename, { resource_type: resourceTypeOf(r.mime_type), invalidate: true });
      removed += 1;
    } catch (err) {
      console.warn(`Could not delete stored file ${r.filename}:`, err.message);
    }
  }
  return removed;
}

async function filesOfBulletin(pool, bulletinId) {
  const r = await pool.query(
    'SELECT filename, file_path, mime_type FROM attachments WHERE bulletin_id = $1', [bulletinId]);
  return r.rows;
}

async function filesOfMessage(pool, messageId) {
  const r = await pool.query(
    'SELECT filename, file_path, mime_type FROM attachments WHERE message_id = $1', [messageId]);
  return r.rows;
}

async function filesOfAttachment(pool, attachmentId) {
  const r = await pool.query(
    'SELECT filename, file_path, mime_type FROM attachments WHERE id = $1', [attachmentId]);
  return r.rows;
}

async function filesOfLibraryEntry(pool, fileId) {
  const r = await pool.query(
    'SELECT filename, file_path, mime_type FROM file_library WHERE id = $1', [fileId]);
  return r.rows;
}

// ---------------------------------------------------------------------------
// Orphan sweep
// ---------------------------------------------------------------------------
async function listCloudinaryFiles(cloud) {
  const found = [];
  for (const resourceType of ['image', 'video', 'raw']) {
    let cursor;
    do {
      const page = await cloud.api.resources({
        type: 'upload',
        resource_type: resourceType,
        prefix: `${FOLDER}/`,
        max_results: 500,
        next_cursor: cursor
      });
      for (const f of page.resources || []) {
        found.push({
          public_id: f.public_id,
          resource_type: resourceType,
          bytes: f.bytes || 0,
          created_at: f.created_at ? new Date(f.created_at).getTime() : 0
        });
      }
      cursor = page.next_cursor;
    } while (cursor);
  }
  return found;
}

// dryRun (default): only report. Files newer than minAgeHours are never touched
// (they may belong to an upload that is still being saved).
async function sweepOrphans(pool, { dryRun = true, minAgeHours = 24 } = {}) {
  const cloud = getClient();
  if (!cloud) return { error: 'Cloudinary is not configured' };

  const known = new Set();
  const a = await pool.query('SELECT filename FROM attachments');
  const f = await pool.query('SELECT filename FROM file_library');
  [...a.rows, ...f.rows].forEach(r => r.filename && known.add(r.filename));

  const cutoff = Date.now() - minAgeHours * 3600 * 1000;
  const all = await listCloudinaryFiles(cloud);
  const orphans = all.filter(x => !known.has(x.public_id) && x.created_at < cutoff);

  let deleted = 0;
  if (!dryRun) {
    for (const o of orphans) {
      try {
        await cloud.uploader.destroy(o.public_id, { resource_type: o.resource_type, invalidate: true });
        deleted += 1;
      } catch (err) {
        console.warn(`Could not delete ${o.public_id}:`, err.message);
      }
    }
  }

  return {
    dryRun,
    totalFiles: all.length,
    referenced: all.length - orphans.length,
    orphanCount: orphans.length,
    orphanBytes: orphans.reduce((s, o) => s + o.bytes, 0),
    deleted
  };
}

// ---------------------------------------------------------------------------
// Usage meter
// ---------------------------------------------------------------------------
async function getUsage() {
  const cloud = getClient();
  if (!cloud) return { configured: false };
  const u = await cloud.api.usage();
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);

  const storage = u.storage || {};
  const bandwidth = u.bandwidth || {};
  const transformations = u.transformations || {};
  const credits = u.credits || {};

  const parts = [storage.credits_usage, bandwidth.credits_usage, transformations.credits_usage]
    .map(num).filter(x => x !== null);
  const used = num(credits.usage) !== null ? credits.usage : (parts.length ? parts.reduce((s, x) => s + x, 0) : null);
  const limit = num(credits.limit);
  let percent = num(credits.used_percent);
  if (percent === null && used !== null && limit) percent = (used / limit) * 100;

  const limits = u.media_limits || {};
  return {
    configured: true,
    plan: u.plan || null,
    creditsUsed: used,
    creditsLimit: limit,
    percent: percent === null ? null : Math.round(percent * 10) / 10,
    storageBytes: num(storage.usage),
    storageCredits: num(storage.credits_usage),
    bandwidthBytes: num(bandwidth.usage),
    bandwidthCredits: num(bandwidth.credits_usage),
    transformationsCredits: num(transformations.credits_usage),
    files: num(u.resources) !== null ? u.resources : (num(u.objects && u.objects.usage)),
    maxImageBytes: num(limits.image_max_size_bytes),
    maxVideoBytes: num(limits.video_max_size_bytes),
    maxRawBytes: num(limits.raw_max_size_bytes)
  };
}

module.exports = {
  FOLDER,
  destroyFiles,
  filesOfBulletin,
  filesOfMessage,
  filesOfAttachment,
  filesOfLibraryEntry,
  sweepOrphans,
  getUsage,
  _setClient
};
