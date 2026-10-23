import { useEffect, useState } from 'react';

// Admin panel: create / revoke the keys that firehouse display computers use.
// Shown on the User Management screen (admins only; the API enforces this too).

function seenText(secs) {
  if (secs === null || secs === undefined) return 'never connected';
  if (secs < 90) return 'online now';
  if (secs < 3600) return `last seen ${Math.round(secs / 60)} min ago`;
  if (secs < 86400) return `last seen ${Math.round(secs / 3600)} hr ago`;
  return `last seen ${Math.round(secs / 86400)} days ago`;
}

export default function DisplayKeys() {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/display/keys');
      if (res.ok) setKeys(await res.json());
    } catch (err) {
      console.error('Error loading display keys:', err);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const create = async () => {
    setError('');
    if (!name.trim()) {
      setError('Give the display a name (for example "Apron TVs").');
      return;
    }
    try {
      const res = await fetch('/api/display/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create the key');
        return;
      }
      setCreated({ name: data.name, url: `${window.location.origin}/display?key=${data.key}` });
      setCopied(false);
      setName('');
      load();
    } catch (err) {
      setError('Could not create the key');
    }
  };

  const revoke = async (k) => {
    if (!window.confirm(`Revoke "${k.name}"? That display will stop working immediately.`)) return;
    try {
      await fetch(`/api/display/keys/${k.id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Error revoking key:', err);
    }
    load();
  };

  const setRotate = async (k, seconds) => {
    try {
      await fetch(`/api/display/keys/${k.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotate_seconds: seconds })
      });
    } catch (err) {
      console.error('Error saving rotation time:', err);
    }
    load();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch (err) {
      setCopied(false);
    }
  };

  return (
    <div className="mb-6 bg-white border rounded-lg shadow-sm p-6">
      <h3 className="text-xl font-bold text-gray-800">Firehouse Displays</h3>
      <p className="text-gray-600 text-sm mt-1 mb-4">
        Each computer that drives the apron TVs gets its own link. Open the link once on that computer and it
        stays signed in for display only. Revoke a link to cut that computer off.
      </p>

      {created && (
        <div className="mb-4 border-l-4 border-green-500 bg-green-50 p-4 rounded">
          <p className="font-semibold text-green-800">Link for "{created.name}" (shown only once, copy it now):</p>
          <input
            readOnly
            value={created.url}
            onFocus={(e) => e.target.select()}
            className="w-full mt-2 p-2 border rounded font-mono text-xs bg-white"
          />
          <div className="mt-2 flex gap-2">
            <button onClick={copy} className="bg-green-700 text-white px-3 py-1 rounded text-sm">
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button onClick={() => setCreated(null)} className="px-3 py-1 rounded text-sm border">
              Done
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {keys.length === 0 && <p className="text-sm text-gray-500">No display links yet.</p>}
        {keys.map(k => (
          <div key={k.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
            <div>
              <div className="font-semibold">{k.name}</div>
              <div className="text-xs text-gray-500">{seenText(k.seen_ago_s)}</div>
            </div>
                        <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500">
                Time per bulletin
                <select
                  value={k.rotate_seconds || 0}
                  onChange={(e) => setRotate(k, Number(e.target.value))}
                  className="block mt-1 p-1 border rounded text-sm text-gray-800 bg-white"
                >
                  <option value={0}>Automatic (by length)</option>
                  <option value={10}>10 seconds</option>
                  <option value={15}>15 seconds</option>
                  <option value={20}>20 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={45}>45 seconds</option>
                  <option value={60}>1 minute</option>
                  <option value={90}>90 seconds</option>
                  <option value={120}>2 minutes</option>
                </select>
              </label>
              <button onClick={() => revoke(k)} className="text-red-600 text-sm font-semibold hover:underline">
                Revoke
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name, e.g. Apron TVs"
          className="flex-1 p-2 border rounded"
        />
        <button onClick={create} className="bg-gray-800 text-white px-4 py-2 rounded font-semibold">
          Create link
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
