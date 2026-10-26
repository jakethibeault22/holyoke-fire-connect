// Restores a backup file into the database in DATABASE_URL.
//
// THIS REPLACES ALL CURRENT DATA with the contents of the backup.
//
//   PowerShell:
//     $env:DATABASE_URL = "postgresql://..."          (the database to restore INTO)
//     $env:BACKUP_ENCRYPTION_KEY = "your key"
//     node scripts/restore-backup.js C:\path\to\backup.hfcb            (shows what it would do)
//     node scripts/restore-backup.js C:\path\to\backup.hfcb --yes      (does it)
//
// Before replacing anything it saves an encrypted copy of the CURRENT data next to
// where you run the command (pre-restore-<time>.hfcb), so even a mistaken restore
// can be undone. Run `node server.js` (or redeploy) afterwards so the schema is checked.

const fs = require('fs');
const { decrypt, parseBackup, countRows, createEncryptedBackup, restoreBackup } = require('./backup');

const [, , file, flag] = process.argv;

if (!file) {
  console.error('Usage: node scripts/restore-backup.js <backup-file.hfcb> [--yes]');
  process.exit(1);
}

(async () => {
  let data;
  try {
    data = parseBackup(decrypt(fs.readFileSync(file)));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  console.log(`Backup created: ${data.created_at}`);
  const counts = countRows(data);
  Object.keys(counts).forEach(t => console.log(`  ${t}: ${counts[t]} rows`));

  if (flag !== '--yes') {
    console.log('\nNothing was changed. Add --yes to replace ALL current data in DATABASE_URL with this backup.');
    process.exit(0);
  }

  const { pool } = require('../config/db');
  try {
    const safety = await createEncryptedBackup({ pool });
    const safetyFile = `pre-restore-${safety.name.replace('hfc-backup-', '')}`;
    fs.writeFileSync(safetyFile, safety.buffer);
    console.log(`\nSaved the current data to ${safetyFile} first.`);

    const client = await pool.connect();
    try {
      await restoreBackup(client, data);
    } finally {
      client.release();
    }
    console.log('Restore complete.');
  } catch (err) {
    console.error(`Restore failed (nothing was changed): ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
