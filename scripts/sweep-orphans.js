// One-off tidy-up: finds files in Cloudinary that no bulletin, message or library
// entry uses any more (left behind before deletes were cleaning up after themselves).
//
//   node scripts/sweep-orphans.js            -> report only, deletes nothing
//   node scripts/sweep-orphans.js --delete   -> delete the unused files
//
// Run it from the Render Shell (so the database and Cloudinary settings are already there).
// Files uploaded in the last 24 hours are always left alone.

const { pool } = require('../config/db');
const { sweepOrphans } = require('./cloudinary-files');

const fmt = (b) => (b >= 1024 * 1024 * 1024 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`);

(async () => {
  const del = process.argv.includes('--delete');
  const r = await sweepOrphans(pool, { dryRun: !del });
  if (r.error) {
    console.error(r.error);
    process.exit(1);
  }
  console.log(`Files in Cloudinary:     ${r.totalFiles}`);
  console.log(`Still used by the app:   ${r.referenced}`);
  console.log(`Unused (orphaned):       ${r.orphanCount}  (${fmt(r.orphanBytes)})`);
  if (del) console.log(`Deleted:                 ${r.deleted}`);
  else if (r.orphanCount) console.log('\nNothing was deleted. Run again with --delete to remove them.');
  process.exit(0);
})().catch(err => {
  console.error('Sweep failed:', err.message);
  process.exit(1);
});
