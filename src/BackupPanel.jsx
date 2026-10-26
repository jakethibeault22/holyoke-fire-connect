import { useEffect, useRef, useState } from 'react';

// Admin panel: database backups.
//  - A backup is taken automatically once a day (newest 7 kept, stored encrypted in Cloudinary).
//  - "Back up now" takes one immediately; "Download a backup now" saves an encrypted copy to this computer.
//  - "Restore" replaces ALL current data with a stored backup or an uploaded backup file.
//    It shows a preview first, needs RESTORE typed to confirm, and saves a safety copy of the
//    current data before touching anything.

function fmtSize(bytes) {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

const COUNT_ROWS = [
  ['users', 'Users'],
  ['bulletins', 'Bulletins'],
  ['messages', 'Messages'],
  ['attachments', 'Attachments'],
  ['file_library', 'Library files'],
  ['display_keys', 'Display links']
];

export default function BackupPanel() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [restore, setRestore] = useState(null); // { source, label, stage, preview, error, typed, result }
  const fileInput = useRef(null);

  const load = async () => {
    try {
      const res = await fetch('/api/backups');
      if (res.ok) setStatus(await res.json());
    } catch (err) {
      console.error('Error loading backups:', err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const backUpNow = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/backups', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Backup failed');
      } else {
        const c = data.backup.counts || {};
        setNotice(`Backup saved (${fmtSize(data.backup.bytes)}): ${c.users ?? 0} users, ${c.bulletins ?? 0} bulletins, ${c.messages ?? 0} messages.`);
      }
    } catch (err) {
      setError('Backup failed');
    }
    setBusy(false);
    load();
  };

  // ---- restore ----
  const callRestore = (source, mode) => {
    const url = `/api/backups/restore?mode=${mode}` + (source.id ? `&id=${encodeURIComponent(source.id)}` : '');
    const headers = {};
    const opts = { method: 'POST', headers };
    if (mode === 'restore') headers['X-Confirm'] = 'RESTORE';
    if (source.file) {
      headers['Content-Type'] = 'application/octet-stream';
      opts.body = source.file;
    }
    return fetch(url, opts);
  };

  const openRestore = async (source, label) => {
    setRestore({ source, label, stage: 'loading', preview: null, error: '', typed: '', result: null });
    try {
      const res = await callRestore(source, 'preview');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRestore(r => r && { ...r, stage: 'error', error: data.error || 'Could not read that backup' });
      } else {
        setRestore(r => r && { ...r, stage: 'ready', preview: data });
      }
    } catch (err) {
      setRestore(r => r && { ...r, stage: 'error', error: 'Could not read that backup' });
    }
  };

  const onFileChosen = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) openRestore({ file }, file.name);
  };

  const confirmRestore = async () => {
    setRestore(r => r && { ...r, stage: 'working', error: '' });
    try {
      const res = await callRestore(restore.source, 'restore');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRestore(r => r && { ...r, stage: 'error', error: data.error || 'Restore failed' });
        return;
      }
      setRestore(r => r && { ...r, stage: 'done', result: data });
      setTimeout(() => window.location.reload(), 4000);
    } catch (err) {
      setRestore(r => r && { ...r, stage: 'error', error: 'Restore failed. Check the page again before trying twice.' });
    }
  };

  const closeRestore = () => {
    if (restore && restore.stage === 'working') return;
    setRestore(null);
    load();
  };

  const dailyBackups = status && status.backups ? status.backups.filter(b => b.kind !== 'safety') : [];
  const newest = dailyBackups[0];
  const stale = newest && Date.now() - Date.parse(newest.created_at) > 30 * 60 * 60 * 1000;
  const ready = status && status.keySet;
  const canStore = ready && status.cloudinaryConfigured;

  return (
    <div className="mb-6 bg-white border rounded-lg shadow-sm p-6">
      <h3 className="text-xl font-bold text-gray-800">Database Backups</h3>
      <p className="text-gray-600 text-sm mt-1 mb-4">
        A backup is taken automatically once a day and the newest {status ? status.keep : 7} are kept. Backups are
        encrypted: you need the server's BACKUP_ENCRYPTION_KEY to read or restore one, so keep a copy of that key
        somewhere safe outside Render.
      </p>

      {status && !status.keySet && (
        <div className="mb-4 border-l-4 border-red-500 bg-red-50 p-3 rounded text-sm text-red-800">
          Backups are turned off. Add a BACKUP_ENCRYPTION_KEY environment variable (16+ characters, 32+ recommended)
          in Render and redeploy.
        </div>
      )}
      {status && status.keySet && !status.cloudinaryConfigured && (
        <div className="mb-4 border-l-4 border-amber-500 bg-amber-50 p-3 rounded text-sm text-amber-800">
          Cloudinary isn't configured, so automatic daily backups and restoring are off. You can still download a backup below.
        </div>
      )}
      {status && status.listError && (
        <div className="mb-4 border-l-4 border-amber-500 bg-amber-50 p-3 rounded text-sm text-amber-800">
          Couldn't read the stored backups: {status.listError}
        </div>
      )}
      {canStore && !status.listError && (stale || !newest) && (
        <div className="mb-4 border-l-4 border-amber-500 bg-amber-50 p-3 rounded text-sm text-amber-800">
          {newest ? 'The newest stored backup is more than a day old.' : 'No stored backups yet.'} Use "Back up now" to
          take one.
        </div>
      )}
      {notice && (
        <div className="mb-4 border-l-4 border-green-500 bg-green-50 p-3 rounded text-sm text-green-800">{notice}</div>
      )}
      {error && (
        <div className="mb-4 border-l-4 border-red-500 bg-red-50 p-3 rounded text-sm text-red-800">{error}</div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={backUpNow}
          disabled={!canStore || busy}
          className="bg-gray-800 text-white px-4 py-2 rounded font-semibold disabled:opacity-40"
        >
          {busy ? 'Backing up…' : 'Back up now'}
        </button>
        {ready ? (
          <a
            href="/api/backups/download-now"
            className="px-4 py-2 rounded font-semibold border border-gray-400 text-gray-800 hover:bg-gray-50"
          >
            Download a backup now
          </a>
        ) : (
          <span className="px-4 py-2 rounded font-semibold border border-gray-200 text-gray-400">
            Download a backup now
          </span>
        )}
        <button
          onClick={() => fileInput.current && fileInput.current.click()}
          disabled={!canStore}
          className="px-4 py-2 rounded font-semibold border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-40"
        >
          Restore from a file…
        </button>
        <input ref={fileInput} type="file" accept=".hfcb" onChange={onFileChosen} className="hidden" />
      </div>

      {status && status.backups && status.backups.length > 0 && (
        <div className="space-y-2">
          {status.backups.map(b => (
            <div key={b.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
              <div>
                <div className="font-semibold text-sm">
                  {fmtDate(b.created_at)}
                  {b.kind === 'safety' && (
                    <span className="ml-2 text-xs font-semibold text-amber-800 bg-amber-100 rounded px-2 py-0.5">
                      Safety copy before a restore
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">{fmtSize(b.bytes)}</div>
              </div>
              <div className="flex items-center gap-4">
                <a
                  href={`/api/backups/file?id=${encodeURIComponent(b.id)}`}
                  className="text-blue-700 text-sm font-semibold hover:underline"
                >
                  Download
                </a>
                <button
                  onClick={() => openRestore({ id: b.id }, fmtDate(b.created_at))}
                  className="text-red-700 text-sm font-semibold hover:underline"
                >
                  Restore…
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {restore && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-1">Restore a backup</h3>
            <p className="text-sm text-gray-500 mb-4">{restore.label}</p>

            {restore.stage === 'loading' && <p className="text-gray-600">Reading the backup…</p>}

            {restore.stage === 'error' && (
              <>
                <div className="border-l-4 border-red-500 bg-red-50 p-3 rounded text-sm text-red-800 mb-4">
                  {restore.error}
                </div>
                <button onClick={closeRestore} className="px-4 py-2 rounded border font-semibold">Close</button>
              </>
            )}

            {(restore.stage === 'ready' || restore.stage === 'working') && restore.preview && (
              <>
                <p className="text-sm text-gray-700 mb-3">
                  Backup taken <strong>{fmtDate(restore.preview.created_at)}</strong>.
                </p>
                <table className="w-full text-sm mb-4">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-1 font-medium"></th>
                      <th className="py-1 font-medium">In this backup</th>
                      <th className="py-1 font-medium">Right now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COUNT_ROWS.map(([key, label]) => (
                      <tr key={key} className="border-t">
                        <td className="py-1">{label}</td>
                        <td className="py-1">{restore.preview.counts[key] ?? 0}</td>
                        <td className="py-1">{restore.preview.current[key] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="border-l-4 border-amber-500 bg-amber-50 p-3 rounded text-sm text-amber-900 mb-4 space-y-1">
                  <p className="font-semibold">This replaces ALL current data with the backup.</p>
                  <ul className="list-disc ml-5">
                    <li>Anything posted or changed after the backup was taken will be gone.</li>
                    <li>Passwords go back to what they were then.</li>
                    <li>Display links (the TVs) go back to what they were then.</li>
                    <li>You may be signed out afterward, and the page will reload.</li>
                  </ul>
                  <p>A safety copy of the current data is saved first, so this can be undone.</p>
                </div>

                <label className="block text-sm font-medium text-gray-700 mb-1">Type RESTORE to confirm</label>
                <input
                  type="text"
                  value={restore.typed}
                  onChange={(e) => setRestore(r => ({ ...r, typed: e.target.value }))}
                  disabled={restore.stage === 'working'}
                  autoComplete="off"
                  className="w-full p-2 border rounded mb-4"
                />

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={closeRestore}
                    disabled={restore.stage === 'working'}
                    className="px-4 py-2 rounded border font-semibold disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmRestore}
                    disabled={restore.typed !== 'RESTORE' || restore.stage === 'working'}
                    className="px-4 py-2 rounded bg-red-700 text-white font-semibold disabled:opacity-40"
                  >
                    {restore.stage === 'working' ? 'Restoring… do not close this page' : 'Restore now'}
                  </button>
                </div>
              </>
            )}

            {restore.stage === 'done' && (
              <>
                <div className="border-l-4 border-green-500 bg-green-50 p-3 rounded text-sm text-green-800 mb-2">
                  Restore complete. A safety copy of the previous data was saved ({fmtDate(restore.result.safety.created_at)}).
                </div>
                <p className="text-sm text-gray-600">Reloading…</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
