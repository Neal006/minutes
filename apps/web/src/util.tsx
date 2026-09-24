import { useSyncExternalStore } from 'react';

export function formatTs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${m}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return '<1 min';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`;
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86_400_000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: days > 300 ? 'numeric' : undefined });
}

/** Search snippets arrive with \u0002…\u0003 around matches; render them as <mark> nodes, never as HTML. */
export function Highlight({ text }: { text: string }) {
  return <>{text.split(/[\u0002\u0003]/).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}</>;
}

// ── Hash router: works from file://, in Electron, and behind any static host. ──
const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  const [path, qs] = hash.replace(/^#\/?/, '').split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(qs) };
}

export const navigate = (to: string) => {
  location.hash = to;
};
