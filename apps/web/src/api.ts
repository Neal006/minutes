export type Status = 'recording' | 'processing' | 'ready' | 'failed';

export interface MeetingListItem {
  id: string;
  title: string;
  status: Status;
  created_at: number;
  duration_ms: number;
  summary: string | null;
  open_items: number;
}

export interface Segment {
  id: number;
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface ActionItem {
  id: number;
  text: string;
  owner: string | null;
  due: string | null;
  done: number;
  start_ms: number | null;
}

export interface Meeting extends Omit<MeetingListItem, 'open_items'> {
  title_locked: boolean;
  decisions: string[];
  error: string | null;
  has_audio: boolean;
  segments: Segment[];
  action_items: ActionItem[];
  chunks: { total: number; pending: number; failed: number };
}

export interface SearchHit {
  segment_id: number;
  meeting_id: string;
  meeting_title: string;
  created_at: number;
  start_ms: number;
  snippet: string;
}

export interface AskResult {
  answer: string;
  sources: { n: number; meeting_id: string; meeting_title: string; start_ms: number; text: string }[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown, contentType = 'application/json'): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': contentType },
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new ApiError(res.status, err?.error ?? `Request failed (${res.status})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  listMeetings: () => req<MeetingListItem[]>('GET', '/meetings'),
  getMeeting: (id: string) => req<Meeting>('GET', `/meetings/${id}`),
  createMeeting: () => req<{ id: string }>('POST', '/meetings', {}),
  rename: (id: string, title: string) => req('PATCH', `/meetings/${id}`, { title }),
  remove: (id: string) => req('DELETE', `/meetings/${id}`),
  putChunk: (id: string, seq: number, startMs: number, blob: Blob) =>
    req('PUT', `/meetings/${id}/chunks/${seq}?start_ms=${startMs}`, blob, blob.type),
  putAudio: (id: string, blob: Blob) => req('PUT', `/meetings/${id}/audio`, blob, blob.type),
  finish: (id: string, durationMs: number) => req('POST', `/meetings/${id}/finish`, { duration_ms: durationMs }),
  reprocess: (id: string) => req('POST', `/meetings/${id}/reprocess`),
  setDone: (itemId: number, done: boolean) => req('PATCH', `/action-items/${itemId}`, { done }),
  search: (q: string) => req<SearchHit[]>('GET', `/search?q=${encodeURIComponent(q)}`),
  ask: (question: string) => req<AskResult>('POST', '/ask', { question }),
};
