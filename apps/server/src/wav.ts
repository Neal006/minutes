// Minimal PCM WAV helpers. The browser uploads 16 kHz mono 16-bit WAV chunks, which every
// STT provider accepts (OpenRouter audio models don't take WebM), so the server needs no ffmpeg.

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
  durationSec: number;
}

export const isWavMime = (mime: string) => /^audio\/(x-)?wav/.test(mime);

/** Walks the RIFF chunks (they aren't always fmt→data) and returns null for anything that isn't PCM WAV. */
export function wavInfo(buf: Buffer): WavInfo | null {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let fmt: { channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  for (let off = 12; off + 8 <= buf.length; ) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ' && off + 24 <= buf.length) {
      if (buf.readUInt16LE(off + 8) !== 1) return null; // not integer PCM
      fmt = { channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), bitsPerSample: buf.readUInt16LE(off + 22) };
    } else if (id === 'data' && fmt) {
      const dataLength = Math.min(size, buf.length - off - 8);
      const bytesPerSec = fmt.sampleRate * fmt.channels * (fmt.bitsPerSample / 8);
      return { ...fmt, dataOffset: off + 8, dataLength, durationSec: bytesPerSec ? dataLength / bytesPerSec : 0 };
    }
    off += 8 + size + (size % 2); // chunks are word-aligned
  }
  return null;
}

/** Loudness of 16-bit PCM in dBFS (-Infinity for digital silence). */
export function rmsDbfs(buf: Buffer, info: WavInfo): number {
  if (info.bitsPerSample !== 16) return 0; // unknown depth: treat as loud so it still gets transcribed
  let sum = 0;
  const n = Math.floor(info.dataLength / 2);
  for (let i = 0; i < n; i++) {
    const v = buf.readInt16LE(info.dataOffset + i * 2) / 32768;
    sum += v * v;
  }
  return n ? 20 * Math.log10(Math.sqrt(sum / n)) : -Infinity;
}

/** Below this, a chunk is room tone at most: skip the STT call (saves free-tier quota, avoids hallucinations). */
export const SILENCE_DBFS = -50;

export function isSilentWav(buf: Buffer): boolean {
  const info = wavInfo(buf);
  return !!info && (info.durationSec === 0 || rmsDbfs(buf, info) < SILENCE_DBFS);
}

export function encodeWav(pcm: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Split a PCM WAV into standalone WAV files of `seconds` each (what the browser recorder does live). */
export function sliceWav(buf: Buffer, seconds: number): { startSec: number; wav: Buffer }[] {
  const info = wavInfo(buf);
  if (!info) throw new Error('Not a PCM WAV file');
  const frame = info.channels * (info.bitsPerSample / 8);
  const step = Math.floor(seconds * info.sampleRate) * frame;
  const data = buf.subarray(info.dataOffset, info.dataOffset + info.dataLength);
  const out: { startSec: number; wav: Buffer }[] = [];
  for (let off = 0; off < data.length; off += step) {
    out.push({ startSec: off / frame / info.sampleRate, wav: encodeWav(data.subarray(off, off + step), info.sampleRate, info.channels, info.bitsPerSample) });
  }
  return out;
}
