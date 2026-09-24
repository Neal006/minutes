import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Ask } from './pages/Ask.tsx';
import { Home } from './pages/Home.tsx';
import { MeetingPage } from './pages/Meeting.tsx';
import { Search } from './pages/Search.tsx';
import { recorder } from './recorder.ts';
import { formatTs, interceptInternalLinks, navigate, useRoute } from './util.tsx';

declare global {
  interface Window {
    minutesDesktop?: { isDesktop: true; platform: string };
  }
}

export function useRecorder() {
  return useSyncExternalStore(recorder.subscribe, recorder.getState);
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function RecordControl() {
  const rec = useRecorder();
  const [system, setSystem] = useState(() => localStorage.getItem('minutes.systemAudio') === '1');
  const now = useNow(rec.phase === 'recording');
  const desktop = window.minutesDesktop;

  const start = async () => {
    try {
      localStorage.setItem('minutes.systemAudio', system ? '1' : '0');
      const id = await recorder.start({ systemAudio: system });
      navigate(`/m/${id}`);
    } catch {
      /* error is shown from recorder state */
    }
  };

  if (rec.phase === 'recording' || rec.phase === 'stopping') {
    return (
      <div className="rec-live">
        <a className="rec-pill" href={`#/m/${rec.meetingId}`}>
          <span className="rec-dot" />
          {formatTs(now - (rec.startedAt ?? now))}
          <span className="meter" aria-hidden>
            <span style={{ transform: `scaleX(${rec.level})` }} />
          </span>
        </a>
        <button className="btn danger" onClick={() => recorder.stop()} disabled={rec.phase === 'stopping'}>
          {rec.phase === 'stopping' ? 'Saving…' : 'Stop'}
        </button>
      </div>
    );
  }
  return (
    <div className="rec-idle">
      <label className="toggle" title={desktop ? 'Also record what other people say through your speakers' : 'Share a tab or screen with audio to capture the other side of a call'}>
        <input type="checkbox" checked={system} onChange={(e) => setSystem(e.target.checked)} />
        {desktop ? 'System audio' : 'Tab audio'}
      </label>
      <button className="btn primary" onClick={start} disabled={rec.phase === 'starting'}>
        <span className="rec-dot idle" /> {rec.phase === 'starting' ? 'Starting…' : 'Record'}
      </button>
    </div>
  );
}

function SearchBox() {
  const { parts, params } = useRoute();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(parts[0] === 'search' ? (params.get('q') ?? '') : '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(t.tagName)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      className="search-box"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transcripts" aria-label="Search transcripts" />
      <kbd>/</kbd>
    </form>
  );
}

export function App() {
  const { parts } = useRoute();
  const rec = useRecorder();
  useEffect(interceptInternalLinks, []);

  // Closing the tab mid-recording would lose the in-memory chunks; ask first.
  useEffect(() => {
    if (rec.phase === 'idle' && !rec.pendingUploads) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [rec.phase, rec.pendingUploads]);

  let page;
  if (parts[0] === 'm' && parts[1]) page = <MeetingPage key={parts[1]} id={parts[1]} />;
  else if (parts[0] === 'search') page = <Search />;
  else if (parts[0] === 'ask') page = <Ask />;
  else page = <Home />;

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden>
            <rect width="32" height="32" rx="8" fill="var(--accent)" />
            <path d="M9 20V12m4.7 11V9m4.6 14V9M23 20v-8" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          Minutes
        </a>
        <nav>
          <a href="#/" aria-current={!parts[0] || parts[0] === 'm' ? 'page' : undefined}>Meetings</a>
          <a href="#/ask" aria-current={parts[0] === 'ask' ? 'page' : undefined}>Ask</a>
        </nav>
        <SearchBox />
        <RecordControl />
      </header>
      {rec.error && (
        <div className="toast" role="alert">
          {rec.error}
          <button className="btn ghost" onClick={recorder.dismissError} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {rec.phase !== 'idle' && rec.offline && (
        <div className="toast warn" role="status">
          Connection lost. {rec.pendingUploads} chunk{rec.pendingUploads === 1 ? '' : 's'} saved locally and will upload when you're back online.
        </div>
      )}
      <main>{page}</main>
    </div>
  );
}
