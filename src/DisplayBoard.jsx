import { useEffect, useRef, useState } from 'react';

// Full-screen firehouse display. Open /display?key=<display key> in a browser
// on the computer that drives the TVs. It needs no login: the key identifies
// the display and can only read bulletins that were flagged for the displays.

const POLL_MS = 20 * 1000;              // how often to ask the server for changes
const RELOAD_CHECK_MS = 6 * 60 * 60 * 1000; // reload now and then to pick up new app versions
const NEW_BADGE_MS = 15 * 60 * 1000;    // how long a bulletin is tagged NEW

function readKey() {
  let key = '';
  try {
    key = new URLSearchParams(window.location.search).get('key') || '';
    if (key) {
      localStorage.setItem('displayKey', key);
      // keep the key out of the address bar / history
      window.history.replaceState({}, '', '/display');
    } else {
      key = localStorage.getItem('displayKey') || '';
    }
  } catch (e) {
    // storage blocked: fall back to whatever is in the URL
  }
  return key;
}

function dwellMs(b) {
  const len = (b.title || '').length + (b.body || '').length;
  return Math.min(40000, Math.max(10000, 8000 + len * 40));
}

function titleSize(len) {
  if (len < 40) return '8vh';
  if (len < 80) return '6.5vh';
  return '5vh';
}

function bodySize(len) {
  if (len < 120) return '5.2vh';
  if (len < 300) return '4.2vh';
  if (len < 600) return '3.4vh';
  return '2.8vh';
}

export default function DisplayBoard() {
  const [key] = useState(readKey);
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState(key ? 'loading' : 'nokey');
  const [now, setNow] = useState(Date.now());
  const knownIds = useRef(null);

  // Clock tick (also drives expiry, so a bulletin disappears the second it expires)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll the server
  useEffect(() => {
    if (!key) return undefined;
    let stopped = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/display/feed?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
        if (stopped) return;
        if (res.status === 401) {
          setItems([]);
          setStatus('unauthorized');
          return;
        }
        if (!res.ok) throw new Error('Bad response');
        const data = await res.json();
        if (stopped) return;

        const received = Date.now();
        const list = data.bulletins.map(b => ({
          ...b,
          expiresAt: received + Number(b.ms_remaining),
          postedAt: received - Number(b.age_ms)
        }));

        // A bulletin we haven't seen before pops up right away
        if (knownIds.current) {
          const fresh = list.findIndex(b => !knownIds.current.has(b.id));
          if (fresh !== -1) setIdx(fresh);
        }
        knownIds.current = new Set(list.map(b => b.id));

        setItems(list);
        setStatus('ok');
      } catch (err) {
        if (!stopped) setStatus(s => (s === 'unauthorized' ? s : 'offline'));
      }
    };

    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [key]);

  // Reload every so often (only if the server is reachable) so the screen
  // picks up new versions of the app without anyone touching the computer
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch('/', { cache: 'no-store' });
        if (r.ok) window.location.reload();
      } catch (e) {
        // offline: try again next time
      }
    }, RELOAD_CHECK_MS);
    return () => clearInterval(t);
  }, []);

  const active = items.filter(b => b.expiresAt > now);
  const safeIdx = active.length ? idx % active.length : 0;
  const cur = active[safeIdx];

  // Rotate through the active bulletins
  useEffect(() => {
    if (active.length < 2 || !cur) return undefined;
    const t = setTimeout(() => setIdx(i => (i + 1) % active.length), dwellMs(cur));
    return () => clearTimeout(t);
  }, [safeIdx, cur && cur.id, active.length]);

  const time = new Date(now);
  const clock = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  let message = null;
  if (status === 'nokey') message = 'No display key. Open the display link provided by your administrator.';
  if (status === 'unauthorized') message = 'This display is not authorized. Ask your administrator for a new display link.';

  return (
    <div className="fixed inset-0 bg-slate-950 text-white flex flex-col overflow-hidden select-none cursor-none">
      <style>{`
        @keyframes dispFade { from { opacity: 0; transform: translateY(1.5vh); } to { opacity: 1; transform: none; } }
        @keyframes dispBar { from { width: 0%; } to { width: 100%; } }
        @keyframes dispPulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between bg-red-800 px-[4vw]" style={{ height: '12vh' }}>
        <div>
          <div className="font-extrabold tracking-wide" style={{ fontSize: '4vh', lineHeight: 1.1 }}>
            HOLYOKE FIRE DEPARTMENT
          </div>
          <div className="text-red-100 tracking-widest" style={{ fontSize: '2.2vh' }}>
            BULLETIN BOARD
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold" style={{ fontSize: '5vh', lineHeight: 1.1 }}>{clock}</div>
          <div className="text-red-100" style={{ fontSize: '2.2vh' }}>{date}</div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-[6vw] py-[3vh] min-h-0">
        {message && (
          <div className="text-center text-slate-300" style={{ fontSize: '4vh' }}>{message}</div>
        )}

        {!message && !cur && (
          <div className="text-center">
            <div className="font-bold" style={{ fontSize: '18vh', lineHeight: 1 }}>{clock}</div>
            <div className="text-slate-400 mt-[2vh]" style={{ fontSize: '4vh' }}>{date}</div>
            <div className="text-slate-500 mt-[6vh]" style={{ fontSize: '3vh' }}>
              {status === 'loading' ? 'Loading…' : 'No active bulletins'}
            </div>
          </div>
        )}

        {!message && cur && (
          <div key={cur.id} style={{ animation: 'dispFade 600ms ease-out' }} className="min-h-0 flex flex-col">
            <div className="flex items-center gap-[2vw] mb-[2.5vh]">
              <span
                className="bg-slate-800 text-slate-200 font-semibold tracking-widest uppercase rounded px-[1.5vw] py-[0.8vh]"
                style={{ fontSize: '2.4vh' }}
              >
                {cur.category_label}
              </span>
              {now - cur.postedAt < NEW_BADGE_MS && (
                <span
                  className="bg-red-600 text-white font-extrabold tracking-widest rounded px-[1.5vw] py-[0.8vh]"
                  style={{ fontSize: '2.4vh', animation: 'dispPulse 1.6s infinite' }}
                >
                  NEW
                </span>
              )}
            </div>

            <div className="font-extrabold" style={{ fontSize: titleSize((cur.title || '').length), lineHeight: 1.1 }}>
              {cur.title}
            </div>

            <div
              className="text-slate-100 whitespace-pre-wrap overflow-hidden mt-[3vh]"
              style={{ fontSize: bodySize((cur.body || '').length), lineHeight: 1.3, maxHeight: '48vh' }}
            >
              {cur.body}
            </div>

            <div className="text-slate-400 mt-[3vh]" style={{ fontSize: '2.6vh' }}>
              Posted by {cur.author_name} ·{' '}
              {new Date(cur.postedAt).toLocaleString([], {
                weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer: progress bar + status */}
      <div className="relative bg-slate-900" style={{ height: '5vh' }}>
        {cur && active.length > 1 && (
          <div
            key={`${cur.id}-${safeIdx}`}
            className="absolute left-0 top-0 bg-red-600"
            style={{ height: '0.8vh', animation: `dispBar ${dwellMs(cur)}ms linear forwards` }}
          />
        )}
        <div className="h-full flex items-center justify-between px-[4vw] text-slate-500" style={{ fontSize: '2vh' }}>
          <span>{status === 'offline' ? 'Connection lost — showing last known bulletins' : ''}</span>
          <span>{cur && active.length > 1 ? `${safeIdx + 1} / ${active.length}` : ''}</span>
        </div>
      </div>
    </div>
  );
}
