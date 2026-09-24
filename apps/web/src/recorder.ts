import { api, ApiError } from './api.ts';

/**
 * Records mic (+ optional system/tab audio) and streams it to the server.
 *
 * Two MediaRecorders share one mixed stream:
 *  - a chunk recorder restarted every CHUNK_MS, so every chunk is a standalone, decodable file
 *    (MediaRecorder timeslices after the first have no container header);
 *  - a continuous recorder for the single playback file uploaded on stop.
 *
 * Chunks go through an in-memory upload queue that survives network drops: retries with
 * exponential backoff, wakes up on the browser's `online` event, and the server treats
 * (meeting, seq) as idempotent, so a retry after a lost response is harmless.
 */

const CHUNK_MS = 20_000; // ponytail: fixed window; cut on silence (VAD) to avoid splitting words
const BITRATE = 32_000;

export type Phase = 'idle' | 'starting' | 'recording' | 'stopping';

export interface RecState {
  phase: Phase;
  meetingId: string | null;
  startedAt: number | null;
  level: number; // 0..1 input level for the meter
  pendingUploads: number;
  offline: boolean;
  systemAudio: 'on' | 'off' | 'unavailable';
  error: string | null;
}

interface QueuedChunk {
  seq: number;
  startMs: number;
  blob: Blob;
}

const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

const stopRecorder = (r: MediaRecorder | null) =>
  new Promise<void>((resolve) => {
    if (!r || r.state === 'inactive') return resolve();
    r.addEventListener('stop', () => resolve(), { once: true });
    r.stop();
  });

function friendlyError(e: unknown): string {
  if (e instanceof DOMException && e.name === 'NotAllowedError') return 'Microphone access was denied. Allow it in your browser settings and try again.';
  if (e instanceof DOMException && e.name === 'NotFoundError') return 'No microphone found.';
  return e instanceof Error ? e.message : String(e);
}

class Recorder {
  private state: RecState = { phase: 'idle', meetingId: null, startedAt: null, level: 0, pendingUploads: 0, offline: false, systemAudio: 'off', error: null };
  private listeners = new Set<() => void>();

  private streams: MediaStream[] = [];
  private ctx: AudioContext | null = null;
  private mixed: MediaStream | null = null;
  private mime = '';
  private t0 = 0;
  private seq = 0;
  private chunkRec: MediaRecorder | null = null;
  private chunkTimer: ReturnType<typeof setTimeout> | undefined;
  private fullRec: MediaRecorder | null = null;
  private fullParts: Blob[] = [];
  private meterTimer: ReturnType<typeof setInterval> | undefined;

  private queue: QueuedChunk[] = [];
  private pumping = false;
  private drained: (() => void)[] = [];
  private wake: (() => void) | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getState = () => this.state;
  dismissError = () => this.set({ error: null });
  private set(patch: Partial<RecState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  async start({ systemAudio }: { systemAudio: boolean }): Promise<string> {
    if (this.state.phase !== 'idle') throw new Error('Already recording');
    this.set({ phase: 'starting', error: null });
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      this.streams = [mic];
      let system: RecState['systemAudio'] = 'off';
      if (systemAudio) {
        try {
          // Chrome requires video to share audio; the video track is simply never recorded.
          // In the desktop app, Electron grants this without a picker (see apps/desktop).
          const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          this.streams.push(display);
          system = display.getAudioTracks().length ? 'on' : 'unavailable';
        } catch {
          system = 'unavailable';
        }
      }

      this.ctx = new AudioContext();
      const dest = this.ctx.createMediaStreamDestination();
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 1024;
      for (const s of this.streams) {
        if (!s.getAudioTracks().length) continue;
        const src = this.ctx.createMediaStreamSource(s);
        src.connect(dest);
        src.connect(analyser);
      }
      this.mixed = dest.stream;

      const { id } = await api.createMeeting();
      this.mime = pickMime();
      this.t0 = performance.now();
      this.seq = 0;
      this.fullParts = [];
      this.fullRec = new MediaRecorder(this.mixed, { mimeType: this.mime, audioBitsPerSecond: BITRATE });
      this.fullRec.ondataavailable = (e) => e.data.size && this.fullParts.push(e.data);
      this.fullRec.start(1000);
      this.set({ phase: 'recording', meetingId: id, startedAt: Date.now(), systemAudio: system, pendingUploads: 0, offline: false });
      this.startChunk();

      const buf = new Uint8Array(analyser.fftSize);
      this.meterTimer = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        this.set({ level: Math.min(1, Math.sqrt(sum / buf.length) * 4) });
      }, 100);
      return id;
    } catch (e) {
      this.teardown();
      this.set({ phase: 'idle', meetingId: null, startedAt: null, error: friendlyError(e) });
      throw e;
    }
  }

  private startChunk() {
    if (!this.mixed || !this.state.meetingId) return;
    const rec = new MediaRecorder(this.mixed, { mimeType: this.mime, audioBitsPerSecond: BITRATE });
    const seq = this.seq++;
    const startMs = Math.round(performance.now() - this.t0);
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(parts, { type: rec.mimeType || this.mime });
      if (blob.size) this.enqueue({ seq, startMs, blob });
    };
    rec.start();
    this.chunkRec = rec;
    // Start the next recorder before stopping this one so no audio falls between chunks.
    this.chunkTimer = setTimeout(() => {
      this.startChunk();
      rec.stop();
    }, CHUNK_MS);
  }

  async stop(): Promise<void> {
    const id = this.state.meetingId;
    if (this.state.phase !== 'recording' || !id) return;
    this.set({ phase: 'stopping' });
    clearTimeout(this.chunkTimer);
    await stopRecorder(this.chunkRec);
    await stopRecorder(this.fullRec);
    const durationMs = Math.round(performance.now() - this.t0);
    const full = new Blob(this.fullParts, { type: this.fullRec?.mimeType || this.mime });
    this.teardown();

    try {
      await this.drain();
      if (full.size) {
        // Playback audio is nice-to-have; notes still get made if it can't be uploaded.
        await retry(() => api.putAudio(id, full), 4).catch(() => this.set({ error: "Couldn't upload the playback audio. Notes are still being generated." }));
      }
      await retry(() => api.finish(id, durationMs), 6);
    } catch (e) {
      this.set({ error: `Couldn't finish the meeting: ${friendlyError(e)}. Open it and press "Process now".` });
    } finally {
      this.fullParts = [];
      this.set({ phase: 'idle', meetingId: null, startedAt: null, level: 0 });
    }
  }

  private teardown() {
    clearInterval(this.meterTimer);
    clearTimeout(this.chunkTimer);
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    this.streams = [];
    void this.ctx?.close();
    this.ctx = null;
    this.mixed = null;
  }

  // ── upload queue ──

  private enqueue(c: QueuedChunk) {
    this.queue.push(c);
    this.set({ pendingUploads: this.queue.length });
    void this.pump();
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    const id = this.state.meetingId;
    let delay = 1000;
    while (this.queue.length && id) {
      const c = this.queue[0];
      try {
        await api.putChunk(id, c.seq, c.startMs, c.blob);
        this.queue.shift();
        delay = 1000;
        this.set({ pendingUploads: this.queue.length, offline: false });
      } catch (e) {
        if (e instanceof ApiError && e.status < 500 && e.status !== 408 && e.status !== 429) {
          console.error(`Dropping chunk ${c.seq}:`, e.message); // won't succeed on retry
          this.queue.shift();
          this.set({ pendingUploads: this.queue.length });
          continue;
        }
        this.set({ offline: true });
        await this.sleepOrOnline(delay);
        delay = Math.min(delay * 2, 30_000);
      }
    }
    this.pumping = false;
    this.drained.splice(0).forEach((fn) => fn());
  }

  private sleepOrOnline(ms: number) {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(t);
        window.removeEventListener('online', done);
        resolve();
      };
      const t = setTimeout(done, ms);
      window.addEventListener('online', done);
      this.wake = done;
    });
  }

  /** Resolves once every queued chunk is uploaded (keeps retrying while offline). */
  private drain(): Promise<void> {
    if (!this.queue.length && !this.pumping) return Promise.resolve();
    this.wake?.(); // stop waiting out a backoff; the user is waiting now
    return new Promise((resolve) => this.drained.push(resolve));
  }
}

async function retry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts - 1 || (e instanceof ApiError && e.status < 500)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

export const recorder = new Recorder();
