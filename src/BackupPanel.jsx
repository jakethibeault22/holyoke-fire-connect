import { useEffect, useState } from 'react';

// Admin panel: database backups. A snapshot is taken automatically once a day and
// the newest 7 are kept (stored encrypted in Cloudinary). Admins can also take one
// now, or download a fresh encrypted copy to their own computer.

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

export default function BackupPanel() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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

  const newest = status && status.backups && status.backups[0];
  const stale = newest && Date.now() - Date.parse(newest.created_at) > 30 * 60 * 60 * 1000;
  const ready = status && status.keySet;

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
          Cloudinary isn't configured, so automatic daily backups are off. You can still download a backup below.
        </div>
      )}
      {status && status.listError && (
        <div className="mb-4 border-l-4 border-amber-500 bg-amber-50 p-3 rounded text-sm text-amber-800">
          Couldn't read the stored backups: {status.listError}
        </div>
      )}
      {ready && status.cloudinaryConfigured && !status.listError && (stale || !newest) && (
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
          disabled={!ready || !status.cloudinaryConfigured || busy}
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
      </div>

      {status && status.backups && status.backups.length > 0 && (
        <div className="space-y-2">
          {status.backups.map(b => (
            <div key={b.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
              <div>
                <div className="font-semibold text-sm">{fmtDate(b.created_at)}</div>
                <div className="text-xs text-gray-500">{fmtSize(b.bytes)}</div>
              </div>
              <a
                href={`/api/backups/file?id=${encodeURIComponent(b.id)}`}
                className="text-blue-700 text-sm font-semibold hover:underline"
              >
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
