// Decrypts a backup file so you can read it.
//
//   PowerShell:
//     $env:BACKUP_ENCRYPTION_KEY = "your key"
//     node scripts/decrypt-backup.js C:\path\to\hfc-backup-2026-10-23T15-00-00Z.hfcb backup.json
//
// With no output file it only prints a summary (row counts per table).
// The JSON file contains EVERYTHING (messages, password hashes): delete it when you're done.

const fs = require('fs');
const { decrypt, parseBackup, countRows } = require('./backup');

const [, , file, out] = process.argv;

if (!file) {
  console.error('Usage: node scripts/decrypt-backup.js <backup-file.hfcb> [output.json]');
  process.exit(1);
}

try {
  const data = parseBackup(decrypt(fs.readFileSync(file)));
  console.log(`Backup created: ${data.created_at}`);
  const counts = countRows(data);
  Object.keys(counts).forEach(t => console.log(`  ${t}: ${counts[t]} rows`));

  if (out) {
    fs.writeFileSync(out, JSON.stringify(data, null, 2));
    console.log(`\nWritten to ${out}. This file is NOT encrypted. Delete it when you're done.`);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
