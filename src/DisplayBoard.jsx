import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Full-screen firehouse display. Open /display?key=<display key> in a browser
// on the computer that drives the TVs. It needs no login: the key identifies
// the display and can only read bulletins that were flagged for the displays.
//
// Layout: regular bulletins rotate one at a time on the left. Bulletins marked
// CRITICAL sit in a red panel on the right for their whole display time. They
// stack there; if they don't all fit, the stack scrolls upward like a ticker.

const POLL_MS = 20 * 1000;                  // how often to ask the server for changes
const RELOAD_CHECK_MS = 6 * 60 * 60 * 1000; // reload now and then to pick up new app versions
const NEW_BADGE_MS = 15 * 60 * 1000;        // how long a bulletin is tagged NEW
const CRITICAL_SCROLL_VH_PER_SEC = 4;       // ticker speed when critical bulletins don't all fit
const CRITICAL_WIDTH = '36vw';              // width of the critical panel

const RED = '#dc2626';

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

function dwellMs(b, rotateSec) {
  if (rotateSec > 0) return rotateSec * 1000;   // fixed time chosen by the admin
  const len = (b.title || '').length + (b.body || '').length;
  return Math.min(40000, Math.max(10000, 8000 + len * 40));
}

function titleSize(len) {
  if (len < 40) return 8;
  if (len < 80) return 6.5;
  return 5;
}

function bodySize(len) {
  if (len < 120) return 5.2;
  if (len < 300) return 4.2;
  if (len < 600) return 3.4;
  return 2.8;
}

// Text is never cut off: sizes are given as "<n>vh * var(--s)" and this box
// shrinks --s until everything inside fits in the space available.
function FitBox({ fitKey, className, style, children }) {
  const outer = useRef(null);
  const inner = useRef(null);

  const fit = useCallback(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    let s = 1;
    i.style.setProperty('--s', String(s));
    while (i.scrollHeight > o.clientHeight + 1 && s > 0.3) {
      s = Math.round((s - 0.04) * 100) / 100;
      i.style.setProperty('--s', String(s));
    }
  }, []);

  useLayoutEffect(() => {
    fit();
  }, [fitKey, fit]);

  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  return (
    <div ref={outer} className={className} style={{ ...style, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
      <div ref={inner} style={{ width: '100%', '--s': 1 }}>{children}</div>
    </div>
  );
}

const scaled = (vh) => `calc(${vh}vh * var(--s))`;

function Tag({ children, bg, color = '#e2e8f0', pulse, size = 2.4 }) {
  return (
    <span
      className="font-semibold tracking-widest uppercase rounded"
      style={{
        background: bg,
        color,
        fontSize: `${size}vh`,
        padding: '0.6vh 1.2vw',
        animation: pulse ? 'dispPulse 1.6s infinite' : undefined
      }}
    >
      {children}
    </span>
  );
}

function postedLine(b) {
  return `Posted by ${b.author_name} · ${new Date(b.postedAt).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  })}`;
}

// Stack of critical bulletins. If they all fit they just sit there; if not,
// the stack scrolls upward in a seamless loop (a vertical ticker).
function CriticalCard({ b, now, cTitle, cBody }) {
  return (
    <div
      className="rounded"
      style={{
        background: '#0f172a',
        borderLeft: `0.8vh solid ${RED}`,
        padding: '1.2vh 1vw',
        marginBottom: '1.5vh'
      }}
    >
      <div className="flex items-center gap-[0.8vw]" style={{ marginBottom: '0.8vh' }}>
        <Tag bg="#1e293b" size={1.8}>{b.category_label}</Tag>
        {now - b.postedAt < NEW_BADGE_MS && <Tag bg={RED} color="#fff" pulse size={1.8}>NEW</Tag>}
      </div>
      <div className="font-extrabold" style={{ fontSize: `${cTitle}vh`, lineHeight: 1.1 }}>{b.title}</div>
      <div className="text-slate-100 whitespace-pre-wrap" style={{ fontSize: `${cBody}vh`, lineHeight: 1.25, marginTop: '1vh' }}>
        {b.body}
      </div>
      <div className="text-slate-400" style={{ fontSize: '1.9vh', marginTop: '1vh' }}>{postedLine(b)}</div>
    </div>
  );
}

function CriticalTicker({ items, now, cTitle, cBody }) {
  const outer = useRef(null);
  const list = useRef(null);
  const [scroll, setScroll] = useState({ on: false, dist: 0, secs: 0 });
  const sig = items.map(b => `${b.id}:${b.title}:${(b.body || '').length}`).join('|') + `|${cTitle}`;

  const measure = useCallback(() => {
    const o = outer.current;
    const l = list.current;
    if (!o || !l) return;
    const dist = l.scrollHeight;
    if (dist > o.clientHeight + 1) {
      const pxPerSec = (window.innerHeight * CRITICAL_SCROLL_VH_PER_SEC) / 100;
      setScroll(prev => (prev.on && prev.dist === dist ? prev : { on: true, dist, secs: dist / pxPerSec }));
    } else {
      setScroll(prev => (prev.on ? { on: false, dist: 0, secs: 0 } : prev));
    }
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [sig, measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const cards = items.map(b => <CriticalCard key={b.id} b={b} now={now} cTitle={cTitle} cBody={cBody} />);

  return (
    <div
      ref={outer}
      className="flex-1 min-h-0 relative"
      style={{
        overflow: 'hidden',
        padding: scroll.on ? '0 1vw' : '1.5vh 1vw 0',
        WebkitMaskImage: scroll.on ? 'linear-gradient(to bottom, transparent 0, #000 2vh, #000 calc(100% - 2vh), transparent 100%)' : undefined,
        maskImage: scroll.on ? 'linear-gradient(to bottom, transparent 0, #000 2vh, #000 calc(100% - 2vh), transparent 100%)' : undefined
      }}
    >
      {scroll.on ? (
        <div
          key={`${sig}|${scroll.dist}`}
          style={{
            '--dist': `-${scroll.dist}px`,
            animation: `dispTicker ${scroll.secs}s linear infinite`,
            willChange: 'transform'
          }}
        >
          <div ref={list} style={{ paddingTop: '1.5vh' }}>{cards}</div>
          <div aria-hidden="true" style={{ paddingTop: '1.5vh' }}>{cards}</div>
        </div>
      ) : (
        <div ref={list}>{cards}</div>
      )}
    </div>
  );
}

export default function DisplayBoard() {
  const [key] = useState(readKey);
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState(key ? 'loading' : 'nokey');
  const [now, setNow] = useState(Date.now());
  const [rotateSec, setRotateSec] = useState(0);
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
          critical: !!b.critical,
          expiresAt: received + Number(b.ms_remaining),
          postedAt: received - Number(b.age_ms)
        }));

        // A new regular bulletin pops up on the left right away
        // (a new critical one simply appears in the critical panel)
        if (knownIds.current) {
          const fresh = list.filter(b => !b.critical).findIndex(b => !knownIds.current.has(b.id));
          if (fresh !== -1) setIdx(fresh);
        }
        knownIds.current = new Set(list.map(b => b.id));

        setItems(list);
        setRotateSec(Number(data.rotate_seconds) || 0);
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

  const live = items.filter(b => b.expiresAt > now);
  const active = live.filter(b => !b.critical);       // rotating, left
  const critical = live.filter(b => b.critical);      // pinned, right
  const safeIdx = active.length ? idx % active.length : 0;
  const cur = active[safeIdx];

  // Rotate through the regular bulletins
  useEffect(() => {
    if (active.length < 2 || !cur) return undefined;
    const t = setTimeout(() => setIdx(i => (i + 1) % active.length), dwellMs(cur, rotateSec));
    return () => clearTimeout(t);
  }, [safeIdx, cur && cur.id, active.length, rotateSec]);

  const time = new Date(now);
  const clock = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  let message = null;
  if (status === 'nokey') message = 'No display key. Open the display link provided by your administrator.';
  if (status === 'unauthorized') message = 'This display is not authorized. Ask your administrator for a new display link.';

  const hasCritical = !message && critical.length > 0;
  const leftWidth = hasCritical ? `calc(100vw - ${CRITICAL_WIDTH})` : '100vw';

  // Text sizes for the critical cards (bigger when there are few of them)
  const n = critical.length;
  const cTitle = n <= 1 ? 5.4 : n === 2 ? 4.4 : 3.6;
  const cBody = n <= 1 ? 3.8 : n === 2 ? 3.1 : 2.6;

  return (
    <div className="fixed inset-0 bg-slate-950 text-white flex flex-col overflow-hidden select-none cursor-none">
      <style>{`
        @keyframes dispFade { from { opacity: 0; transform: translateY(1.5vh); } to { opacity: 1; transform: none; } }
        @keyframes dispBar { from { width: 0%; } to { width: 100%; } }
        @keyframes dispTicker { from { transform: translateY(0); } to { transform: translateY(var(--dist)); } }
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

      {/* Body: rotating bulletins (left) + pinned critical panel (right) */}
      <div className="flex-1 flex min-h-0">
        <div className="min-w-0 min-h-0 flex flex-col px-[4vw] py-[3vh]" style={{ width: leftWidth }}>
          {message && (
            <div className="flex-1 flex items-center justify-center text-center text-slate-300" style={{ fontSize: '4vh' }}>
              {message}
            </div>
          )}

          {!message && !cur && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="font-bold" style={{ fontSize: hasCritical ? '14vh' : '18vh', lineHeight: 1 }}>{clock}</div>
              <div className="text-slate-400 mt-[2vh]" style={{ fontSize: '4vh' }}>{date}</div>
              <div className="text-slate-500 mt-[6vh]" style={{ fontSize: '3vh' }}>
                {status === 'loading' ? 'Loading…' : hasCritical ? 'No other bulletins' : 'No active bulletins'}
              </div>
            </div>
          )}

          {!message && cur && (
            <div key={cur.id} style={{ animation: 'dispFade 600ms ease-out' }} className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
                <Tag bg="#1e293b">{cur.category_label}</Tag>
                {now - cur.postedAt < NEW_BADGE_MS && (
                  <Tag bg={RED} color="#fff" pulse>NEW</Tag>
                )}
              </div>

              <FitBox fitKey={`${cur.id}|${hasCritical}`} className="flex-1 min-h-0">
                <div className="font-extrabold" style={{ fontSize: scaled(titleSize((cur.title || '').length)), lineHeight: 1.1 }}>
                  {cur.title}
                </div>
                <div
                  className="text-slate-100 whitespace-pre-wrap mt-[3vh]"
                  style={{ fontSize: scaled(bodySize((cur.body || '').length)), lineHeight: 1.3 }}
                >
                  {cur.body}
                </div>
                <div className="text-slate-400 mt-[3vh]" style={{ fontSize: scaled(2.6) }}>
                  {postedLine(cur)}
                </div>
              </FitBox>
            </div>
          )}
        </div>

        {hasCritical && (
          <div
            className="flex flex-col min-h-0"
            style={{ width: CRITICAL_WIDTH, background: '#2b0b0b', borderLeft: `0.6vh solid ${RED}` }}
          >
            <div
              className="flex items-center justify-between px-[1.5vw]"
              style={{ height: '7vh', background: '#b91c1c' }}
            >
              <span className="font-extrabold tracking-widest" style={{ fontSize: '3.4vh', animation: 'dispPulse 2s infinite' }}>
                ⚠ CRITICAL
              </span>
              {critical.length > 1 && (
                <span className="font-semibold" style={{ fontSize: '2.4vh' }}>
                  {critical.length} active
                </span>
              )}
            </div>

            <CriticalTicker items={critical} now={now} cTitle={cTitle} cBody={cBody} />
          </div>
        )}
      </div>

      {/* Footer: progress bar + status (the bar belongs to the rotating side) */}
      <div className="relative bg-slate-900" style={{ height: '5vh' }}>
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between" style={{ width: leftWidth }}>
          {cur && active.length > 1 ? (
            <div
              key={`${cur.id}-${safeIdx}-${rotateSec}`}
              className="bg-red-600"
              style={{ height: '0.8vh', animation: `dispBar ${dwellMs(cur, rotateSec)}ms linear forwards` }}
            />
          ) : <div />}
          <div className="flex-1 flex items-center justify-between px-[4vw] text-slate-500" style={{ fontSize: '2vh' }}>
            <span>{status === 'offline' ? 'Connection lost — showing last known bulletins' : ''}</span>
            <span>{cur && active.length > 1 ? `${safeIdx + 1} / ${active.length}` : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
