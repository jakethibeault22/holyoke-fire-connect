import { useEffect, useState } from 'react';

// Admin panel: how much of the free Cloudinary plan (photos, videos, documents,
// and the encrypted backups) is used, plus a tidy-up for files nothing uses any more.

function fmtBytes(b) {
  if (b === null || b === undefined) return '—';
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function StoragePanel() {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sweep, setSweep] = useState(null);
  const [done, setDone] = useState('');

  const load = async () => {
    try {
      const res = await fetch('/api/storage/usage');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not load storage usage');
        return;
      }
      setError('');
      setUsage(data);
    } catch (err) {
      setError('Could not load storage usage');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runSweep = async (del) => {
    setBusy(true);
    setDone('');
    try {
      const res = await fetch('/api/storage/sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete: del })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not check for unused files');
      } else if (del) {
        setSweep(null);
        setDone(`Deleted ${data.deleted} unused file${data.deleted === 1 ? '' : 's'}.`);
        load();
      } else {
        setError('');
        setSweep(data);
      }
    } catch (err) {
      setError('Could not check for unused files');
    }
    setBusy(false);
  };

  const pct = usage && usage.percent !== null && usage.percent !== undefined ? Math.min(100, usage.percent) : null;
  const barColor = pct === null ? '#6b7280' : pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#16a34a';

  return (
    <div className="mb-6 bg-white border rounded-lg shadow-sm p-6">
      <h3 className="text-xl font-bold text-gray-800">File Storage</h3>
      <p className="text-gray-600 text-sm mt-1 mb-4">
        Photos, videos and documents are kept in Cloudinary. The free plan includes 25 credits a month, shared
        between storage used and files viewed. Photos are limited to 10 MB, videos to 100 MB and documents to 10 MB.
      </p>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {usage && usage.configured === false && (
        <p className="text-sm text-amber-800 bg-amber-50 border-l-4 border-amber-500 p-2 rounded">
          Cloudinary is not set up, so files are not being stored there.
        </p>
      )}

      {usage && usage.configured && (
        <>
          <div className="flex items-baseline justify-between text-sm mb-1">
            <span className="font-semibold">
              {usage.creditsUsed !== null && usage.creditsUsed !== undefined ? usage.creditsUsed.toFixed(1) : '—'}
              {usage.creditsLimit ? ` of ${usage.creditsLimit}` : ''} credits used this month
            </span>
            {pct !== null && <span className="text-gray-600">{pct}%</span>}
          </div>
          <div className="h-3 bg-gray-200 rounded overflow-hidden">
            <div className="h-full" style={{ width: `${pct === null ? 0 : pct}%`, background: barColor }} />
          </div>
          {pct !== null && pct >= 80 && (
            <p className="text-sm text-amber-800 mt-2">
              Getting close to the free limit. Delete old videos you no longer need, or use the tidy-up below.
            </p>
          )}

          <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
            <div className="bg-gray-50 rounded p-3">
              <div className="text-gray-500 text-xs">Stored</div>
              <div className="font-semibold">{fmtBytes(usage.storageBytes)}</div>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <div className="text-gray-500 text-xs">Viewed this month</div>
              <div className="font-semibold">{fmtBytes(usage.bandwidthBytes)}</div>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <div className="text-gray-500 text-xs">Files</div>
              <div className="font-semibold">{usage.files !== null && usage.files !== undefined ? usage.files : '—'}</div>
            </div>
          </div>
        </>
      )}

      <div className="mt-4 border-t pt-4">
        <p className="text-sm text-gray-600 mb-2">
          Tidy up: find files that no bulletin, message or library entry uses any more. Files added in the last 24
          hours are never touched.
        </p>
        {done && <p className="text-sm text-green-700 mb-2">{done}</p>}
        {!sweep && (
          <button
            onClick={() => runSweep(false)}
            disabled={busy}
            className="bg-gray-800 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Check for unused files'}
          </button>
        )}
        {sweep && (
          <div className="bg-gray-50 rounded p-3 text-sm">
            {sweep.orphanCount === 0 ? (
              <p>Nothing to clean up. All {sweep.totalFiles} files are in use.</p>
            ) : (
              <>
                <p>
                  Found <strong>{sweep.orphanCount}</strong> unused file{sweep.orphanCount === 1 ? '' : 's'} using{' '}
                  <strong>{fmtBytes(sweep.orphanBytes)}</strong>. {sweep.referenced} files are in use and will not be touched.
                </p>
                <button
                  onClick={() => runSweep(true)}
                  disabled={busy}
                  className="mt-2 bg-red-700 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
                >
                  {busy ? 'Deleting…' : `Delete ${sweep.orphanCount} unused file${sweep.orphanCount === 1 ? '' : 's'}`}
                </button>
              </>
            )}
            <button onClick={() => setSweep(null)} className="mt-2 ml-2 px-3 py-2 rounded text-sm border">
              {sweep.orphanCount === 0 ? 'Close' : 'Cancel'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
