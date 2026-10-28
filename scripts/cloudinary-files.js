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
          url: f.secure_url || f.url || null,
          created_at: f.created_at ? new Date(f.created_at).getTime() : 0
        });
      }
      cursor = page.next_cursor;
    } while (cursor);
  }
  return found;
}

// dryRun (default): only report, and list what would go so a person can review it.
// With dryRun false, `only` (array of public_ids) limits the delete to what the person
// ticked; every one is checked again here, so a file that has since become "in use" or
// is newer than minAgeHours is never deleted.
async function sweepOrphans(pool, { dryRun = true, minAgeHours = 24, only = null } = {}) {
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
  let skipped = 0;
  if (!dryRun) {
    const wanted = new Set(only || orphans.map(o => o.public_id));
    const targets = orphans.filter(o => wanted.has(o.public_id));
    skipped = wanted.size - targets.length; // asked for, but no longer a valid target
    await inBatches(targets, 5, async (o) => {
      try {
        await cloud.uploader.destroy(o.public_id, { resource_type: o.resource_type, invalidate: true });
        deleted += 1;
      } catch (err) {
        console.warn(`Could not delete ${o.public_id}:`, err.message);
      }
    });
  }

  const LIST_MAX = 500;
  return {
    dryRun,
    totalFiles: all.length,
    referenced: all.length - orphans.length,
    orphanCount: orphans.length,
    orphanBytes: orphans.reduce((s, o) => s + o.bytes, 0),
    deleted,
    skipped,
    // biggest first; only sent for the review screen
    orphans: dryRun
      ? orphans.slice().sort((x, y) => y.bytes - x.bytes).slice(0, LIST_MAX).map(o => ({
          public_id: o.public_id,
          resource_type: o.resource_type,
          bytes: o.bytes,
          url: o.url,
          created_at: o.created_at ? new Date(o.created_at).toISOString() : null
        }))
      : undefined,
    listTruncated: dryRun ? orphans.length > LIST_MAX : undefined
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

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// ---------------------------------------------------------------------------
// Reviewing old attachments (nothing is deleted without a person ticking it)
// ---------------------------------------------------------------------------
// Attachments of private messages are listed without names or links: an admin
// can see that space is being used, not what the message was about.
async function listOldAttachments(pool, { days = 180, showKept = false, limit = 300 } = {}) {
  const d = Math.max(1, Math.min(3650, parseInt(days, 10) || 180));
  const r = await pool.query(
    `SELECT a.id, a.original_filename, a.mime_type, a.file_size, a.file_path, a.created_at,
            COALESCE(a.keep_forever, false) AS keep_forever,
            a.bulletin_id, a.message_id, b.title AS bulletin_title, b.category AS bulletin_category
     FROM attachments a
     LEFT JOIN bulletins b ON a.bulletin_id = b.id
     WHERE a.created_at < NOW() - make_interval(days => $1::int)
       AND ($2::boolean OR COALESCE(a.keep_forever, false) = false)
     ORDER BY a.file_size DESC, a.id
     LIMIT $3`,
    [d, !!showKept, limit]
  );
  const total = await pool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(file_size), 0)::bigint AS bytes
     FROM attachments a
     WHERE a.created_at < NOW() - make_interval(days => $1::int)
       AND ($2::boolean OR COALESCE(a.keep_forever, false) = false)`,
    [d, !!showKept]
  );
  return {
    days: d,
    total: total.rows[0].n,
    totalBytes: Number(total.rows[0].bytes),
    items: r.rows.map(x => ({
      id: x.id,
      name: x.message_id ? null : x.original_filename,
      mime_type: x.mime_type,
      size: x.file_size,
      created_at: x.created_at,
      keep: x.keep_forever,
      source: x.message_id ? 'message' : 'bulletin',
      title: x.message_id ? null : x.bulletin_title,
      category: x.message_id ? null : x.bulletin_category,
      url: x.message_id ? null : x.file_path
    }))
  };
}

async function setKeepForever(pool, ids, keep) {
  const clean = (ids || []).map(n => parseInt(n, 10)).filter(Number.isInteger);
  if (!clean.length) return 0;
  const r = await pool.query('UPDATE attachments SET keep_forever = $1 WHERE id = ANY($2::int[])', [!!keep, clean]);
  return r.rowCount;
}

// Deletes the chosen attachments (database row and the stored file). Anything marked
// "keep" is skipped no matter what was sent.
async function deleteAttachments(pool, ids) {
  const clean = (ids || []).map(n => parseInt(n, 10)).filter(Number.isInteger);
  if (!clean.length) return { deleted: 0, skippedKept: 0 };
  const rows = await pool.query(
    `SELECT id, filename, file_path, mime_type, COALESCE(keep_forever, false) AS keep_forever
     FROM attachments WHERE id = ANY($1::int[])`, [clean]);
  const targets = rows.rows.filter(x => !x.keep_forever);
  if (targets.length) {
    await pool.query('DELETE FROM attachments WHERE id = ANY($1::int[])', [targets.map(x => x.id)]);
    await inBatches(targets, 5, (t) => destroyFiles([t]));
  }
  return { deleted: targets.length, skippedKept: rows.rows.length - targets.length };
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
  listOldAttachments,
  setKeepForever,
  deleteAttachments,
  _setClient
};
