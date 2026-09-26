import type { SttSegment, Stt } from '../ai.ts';
import { wavInfo } from '../wav.ts';
import type { OnCall } from './openrouter.ts';

type Asr = (audio: Float32Array, opts: { return_timestamps: boolean }) => Promise<{ text: string; chunks?: { timestamp: [number, number | null]; text: string }[] }>;

/**
 * Whisper running on this machine via transformers.js (ONNX). $0, no key, audio never leaves the
 * server. The model (~80 MB for base.en) downloads once on first use and is cached.
 * ~2 s per 20 s chunk on a laptop CPU.
 */
export function localStt(env = process.env, onCall?: OnCall): Stt {
  const model = env.LOCAL_STT_MODEL ?? 'onnx-community/whisper-base.en';
  let asr: Promise<Asr> | undefined;
  // ponytail: one inference at a time (ONNX session is CPU-bound anyway); a worker pool if chunks queue up.
  let queue: Promise<unknown> = Promise.resolve();

  const load = () =>
    (asr ??= import('@huggingface/transformers')
      .then((m) => {
        // Default cache is inside node_modules, which is read-only in the Docker image.
        if (env.MODEL_CACHE_DIR) m.env.cacheDir = env.MODEL_CACHE_DIR;
        return m.pipeline('automatic-speech-recognition', model, { dtype: 'q8' }) as unknown as Promise<Asr>;
      })
      .catch((e) => {
        asr = undefined; // let the next chunk retry the download
        throw e;
      }));

  return {
    transcribe(audio, mime) {
      const info = wavInfo(audio);
      // Wrong format won't fix itself on retry, so fail the chunk immediately.
      const bad = (msg: string) => Object.assign(new Error(msg), { retryable: false });
      if (!info || info.bitsPerSample !== 16) throw bad(`Local STT needs 16-bit PCM WAV (got ${mime})`);
      if (info.sampleRate !== 16_000) throw bad(`Local STT needs 16 kHz audio (got ${info.sampleRate} Hz)`);
      const frames = Math.floor(info.dataLength / 2 / info.channels);
      const pcm = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < info.channels; c++) sum += audio.readInt16LE(info.dataOffset + (i * info.channels + c) * 2);
        pcm[i] = sum / info.channels / 32768;
      }
      const run = async (): Promise<SttSegment[]> => {
        const t0 = performance.now();
        const out = await (await load())(pcm, { return_timestamps: true });
        onCall?.({ task: 'transcribe', provider: 'local', model: `local:${model}`, ms: Math.round(performance.now() - t0) });
        const chunks = out.chunks?.length ? out.chunks : [{ timestamp: [0, info.durationSec] as [number, number], text: out.text }];
        return chunks
          .map((c) => ({ start: c.timestamp[0], end: c.timestamp[1] ?? info.durationSec, text: c.text.trim() }))
          .filter((s) => s.text && !/^\[?\(?(blank_audio|silence|music)\)?\]?$/i.test(s.text));
      };
      const result = queue.then(run, run);
      queue = result.catch(() => {});
      return result;
    },
  };
}
