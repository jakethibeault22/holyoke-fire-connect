import { useEffect, useState } from 'react';

// Admin panel: file storage (Cloudinary).
//  1. Usage meter for the free plan.
//  2. Review old attachments: choose an age, see every attachment that old (biggest first),
//     tick the ones to delete, or mark ones to keep forever. Nothing is deleted until you
//     tick files and confirm.
//  3. Unused files: files nothing points to any more. Shown as a list to review before deleting.

function fmtBytes(b) {
  if (b === null || b === undefined) return '—';
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDate(v) {
  if (!v) return '';
  return new Date(v).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function kindOf(mime, name) {
  const m = mime || '';
  if (m.startsWith('video/')) return 'Video';
  if (m.startsWith('image/')) return 'Photo';
  if (m === 'application/pdf') return 'PDF';
  if (name && /\.(mp4|mov|m4v|avi)$/i.test(name)) return 'Video';
  if (name && /\.(jpe?g|png|gif|heic|webp)$/i.test(name)) return 'Photo';
  return 'Document';
}

const AGES = [
  [30, '30 days'],
  [90, '3 months'],
  [180, '6 months'],
  [365, '1 year'],
  [730, '2 years']
];

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const post = (path, body) =>
  api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function StoragePanel() {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState('');

  // old attachments
  const [days, setDays] = useState(180);
  const [showKept, setShowKept] = useState(false);
  const [old, setOld] = useState(null);
  const [oldSel, setOldSel] = useState({});
  const [oldBusy, setOldBusy] = useState(false);
  const [oldConfirm, setOldConfirm] = useState(false);
  const [oldMsg, setOldMsg] = useState('');

  // unused files
  const [sweep, setSweep] = useState(null);
  const [sweepSel, setSweepSel] = useState({});
  const [sweepBusy, setSweepBusy] = useState(false);
  const [sweepConfirm, setSweepConfirm] = useState(false);
  const [sweepMsg, setSweepMsg] = useState('');

  const loadUsage = async () => {
    try {
      setUsage(await api('/api/storage/usage'));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadUsage();
  }, []);

  // ---------- old attachments ----------
  const loadOld = async (keepSelection) => {
    setOldBusy(true);
    setOldMsg('');
    setOldConfirm(false);
    try {
      const data = await api(`/api/storage/attachments?days=${days}&showKept=${showKept}`);
      setOld(data);
      if (!keepSelection) setOldSel({});
    } catch (err) {
      setError(err.message);
    }
    setOldBusy(false);
  };

  const oldIds = old ? old.items.filter(i => oldSel[i.id]).map(i => i.id) : [];
  const oldBytes = old ? old.items.filter(i => oldSel[i.id]).reduce((s, i) => s + (i.size || 0), 0) : 0;

  const toggleAllOld = (on) => {
    const next = {};
    if (on) old.items.filter(i => !i.keep).forEach(i => { next[i.id] = true; });
    setOldSel(next);
    setOldConfirm(false);
  };

  const keepOld = async (ids, keep) => {
    setOldBusy(true);
    try {
      await post('/api/storage/attachments/keep', { ids, keep });
      await loadOld(true);
      setOldSel(sel => {
        const next = { ...sel };
        if (keep) ids.forEach(id => delete next[id]);
        return next;
      });
    } catch (err) {
      setError(err.message);
    }
    setOldBusy(false);
  };

  const deleteOld = async () => {
    setOldBusy(true);
    try {
      const r = await post('/api/storage/attachments/delete', { ids: oldIds });
      await loadOld(false); // refreshes the list (and clears the old message)
      setOldMsg(`Deleted ${r.deleted} file${r.deleted === 1 ? '' : 's'}${r.skippedKept ? ` (${r.skippedKept} marked Keep were left alone)` : ''}.`);
      loadUsage();
    } catch (err) {
      setError(err.message);
    }
    setOldBusy(false);
  };

  // ---------- unused files ----------
  const checkSweep = async () => {
    setSweepBusy(true);
    setSweepMsg('');
    setSweepConfirm(false);
    try {
      const data = await post('/api/storage/sweep', { delete: false });
      setSweep(data);
      const sel = {};
      (data.orphans || []).forEach(o => { sel[o.public_id] = true; });
      setSweepSel(sel);
    } catch (err) {
      setError(err.message);
    }
    setSweepBusy(false);
  };

  const sweepIds = sweep && sweep.orphans ? sweep.orphans.filter(o => sweepSel[o.public_id]).map(o => o.public_id) : [];
  const sweepBytes = sweep && sweep.orphans ? sweep.orphans.filter(o => sweepSel[o.public_id]).reduce((s, o) => s + o.bytes, 0) : 0;

  const deleteSweep = async () => {
    setSweepBusy(true);
    try {
      const r = await post('/api/storage/sweep', { delete: true, items: sweepIds });
      setSweep(null);
      setSweepConfirm(false);
      setSweepMsg(`Deleted ${r.deleted} unused file${r.deleted === 1 ? '' : 's'}.`);
      loadUsage();
    } catch (err) {
      setError(err.message);
    }
    setSweepBusy(false);
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

      {error && (
        <p className="text-sm text-red-600 mb-3">
          {error} <button className="underline ml-1" onClick={() => setError('')}>dismiss</button>
        </p>
      )}

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
              Getting close to the free limit. Review old attachments below and delete what you no longer need.
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

      {/* ---------------- Review old attachments ---------------- */}
      <div className="mt-5 border-t pt-4">
        <h4 className="font-semibold text-gray-800">Review old attachments</h4>
        <p className="text-sm text-gray-600 mt-1 mb-3">
          See attachments older than a chosen age, biggest first, and pick which to delete. The bulletin or message
          stays; only the attached file is removed. Use Keep on anything that should never be offered for deletion.
        </p>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="text-sm">
            Older than{' '}
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="p-1 border rounded bg-white">
              {AGES.map(([d, label]) => <option key={d} value={d}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm flex items-center gap-1">
            <input type="checkbox" checked={showKept} onChange={(e) => setShowKept(e.target.checked)} />
            Include ones marked Keep
          </label>
          <button
            onClick={() => loadOld(false)}
            disabled={oldBusy}
            className="bg-gray-800 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
          >
            {oldBusy && !old ? 'Loading…' : 'Show attachments'}
          </button>
        </div>
        {oldMsg && <p className="text-sm text-green-700 mb-2">{oldMsg}</p>}

        {old && (
          <div className="border rounded">
            {old.items.length === 0 ? (
              <p className="p-3 text-sm text-gray-600">No attachments older than that.</p>
            ) : (
              <>
                <div className="flex items-center justify-between bg-gray-50 px-3 py-2 text-sm border-b">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={oldIds.length > 0 && oldIds.length === old.items.filter(i => !i.keep).length}
                      onChange={(e) => toggleAllOld(e.target.checked)}
                    />
                    Select all
                  </label>
                  <span className="text-gray-600">
                    {old.total} attachment{old.total === 1 ? '' : 's'} · {fmtBytes(old.totalBytes)}
                    {old.total > old.items.length ? ` (showing the biggest ${old.items.length})` : ''}
                  </span>
                </div>
                <div className="max-h-96 overflow-y-auto divide-y">
                  {old.items.map(i => (
                    <div key={i.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        disabled={i.keep}
                        checked={!!oldSel[i.id]}
                        onChange={(e) => { setOldSel(s => ({ ...s, [i.id]: e.target.checked })); setOldConfirm(false); }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {i.source === 'message' ? 'Attachment on a private message' : i.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {kindOf(i.mime_type, i.name)} · {fmtBytes(i.size)} · {fmtDate(i.created_at)}
                          {i.source === 'bulletin' && i.title ? ` · Bulletin: ${i.title}${i.category ? ` (${i.category})` : ''}` : ''}
                          {i.keep ? ' · Kept' : ''}
                        </div>
                      </div>
                      {i.url && (
                        <a href={i.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline whitespace-nowrap">View</a>
                      )}
                      <button
                        onClick={() => keepOld([i.id], !i.keep)}
                        disabled={oldBusy}
                        className="text-gray-700 hover:underline whitespace-nowrap disabled:opacity-50"
                      >
                        {i.keep ? 'Unkeep' : 'Keep'}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-3 border-t bg-gray-50 text-sm">
                  {oldIds.length === 0 ? (
                    <span className="text-gray-600">Tick the attachments to delete.</span>
                  ) : !oldConfirm ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setOldConfirm(true)}
                        className="bg-red-700 text-white px-4 py-2 rounded text-sm font-semibold"
                      >
                        Delete {oldIds.length} selected ({fmtBytes(oldBytes)})
                      </button>
                      <button
                        onClick={() => keepOld(oldIds, true)}
                        disabled={oldBusy}
                        className="px-3 py-2 rounded text-sm border disabled:opacity-50"
                      >
                        Keep selected instead
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="mb-2">
                        Permanently delete <strong>{oldIds.length}</strong> file{oldIds.length === 1 ? '' : 's'}{' '}
                        (<strong>{fmtBytes(oldBytes)}</strong>)? This cannot be undone.
                      </p>
                      <button
                        onClick={deleteOld}
                        disabled={oldBusy}
                        className="bg-red-700 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
                      >
                        {oldBusy ? 'Deleting…' : 'Yes, delete them'}
                      </button>
                      <button onClick={() => setOldConfirm(false)} className="ml-2 px-3 py-2 rounded text-sm border">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---------------- Unused files ---------------- */}
      <div className="mt-5 border-t pt-4">
        <h4 className="font-semibold text-gray-800">Unused files</h4>
        <p className="text-sm text-gray-600 mt-1 mb-3">
          Files in storage that no bulletin, message or library entry uses any more (left behind by earlier deletes).
          You'll see the list first and can untick anything you want to leave alone. Files added in the last 24 hours
          are never included.
        </p>
        {sweepMsg && <p className="text-sm text-green-700 mb-2">{sweepMsg}</p>}
        {!sweep && (
          <button
            onClick={checkSweep}
            disabled={sweepBusy}
            className="bg-gray-800 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
          >
            {sweepBusy ? 'Checking…' : 'Check for unused files'}
          </button>
        )}
        {sweep && (
          <div className="border rounded">
            {sweep.orphanCount === 0 ? (
              <div className="p-3 text-sm">
                Nothing to clean up. All {sweep.totalFiles} files are in use.
                <button onClick={() => setSweep(null)} className="ml-3 px-3 py-1 rounded text-sm border">Close</button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between bg-gray-50 px-3 py-2 text-sm border-b">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={sweepIds.length === sweep.orphans.length}
                      onChange={(e) => {
                        const next = {};
                        if (e.target.checked) sweep.orphans.forEach(o => { next[o.public_id] = true; });
                        setSweepSel(next);
                        setSweepConfirm(false);
                      }}
                    />
                    Select all
                  </label>
                  <span className="text-gray-600">
                    {sweep.orphanCount} unused · {fmtBytes(sweep.orphanBytes)} · {sweep.referenced} in use (untouched)
                    {sweep.listTruncated ? ` · showing the biggest ${sweep.orphans.length}` : ''}
                  </span>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y">
                  {sweep.orphans.map(o => (
                    <div key={o.public_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!sweepSel[o.public_id]}
                        onChange={(e) => { setSweepSel(s => ({ ...s, [o.public_id]: e.target.checked })); setSweepConfirm(false); }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{o.public_id.split('/').pop()}</div>
                        <div className="text-xs text-gray-500">
                          {o.resource_type === 'video' ? 'Video' : o.resource_type === 'image' ? 'Photo' : 'Document'} · {fmtBytes(o.bytes)} · {fmtDate(o.created_at)}
                        </div>
                      </div>
                      {o.url && (
                        <a href={o.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">View</a>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-3 py-3 border-t bg-gray-50 text-sm">
                  {sweepIds.length === 0 ? (
                    <span className="text-gray-600">Nothing ticked.</span>
                  ) : !sweepConfirm ? (
                    <button
                      onClick={() => setSweepConfirm(true)}
                      className="bg-red-700 text-white px-4 py-2 rounded text-sm font-semibold"
                    >
                      Delete {sweepIds.length} selected ({fmtBytes(sweepBytes)})
                    </button>
                  ) : (
                    <div>
                      <p className="mb-2">
                        Permanently delete <strong>{sweepIds.length}</strong> unused file{sweepIds.length === 1 ? '' : 's'}{' '}
                        (<strong>{fmtBytes(sweepBytes)}</strong>)? This cannot be undone.
                      </p>
                      <button
                        onClick={deleteSweep}
                        disabled={sweepBusy}
                        className="bg-red-700 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
                      >
                        {sweepBusy ? 'Deleting…' : 'Yes, delete them'}
                      </button>
                      <button onClick={() => setSweepConfirm(false)} className="ml-2 px-3 py-2 rounded text-sm border">Cancel</button>
                    </div>
                  )}
                  <button onClick={() => setSweep(null)} className="ml-2 px-3 py-2 rounded text-sm border">Close</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
