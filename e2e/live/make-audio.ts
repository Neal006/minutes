// Global setup: synthesize the scripted meeting to one 16 kHz mono WAV with the built-in Windows voices
// (the case-study TTS script). Chromium plays it as the microphone.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LINES, VOICE } from './script';

const RATE = 16_000;
const GAP_SEC = 0.6;

/** PCM bytes of a 16-bit WAV (walks the RIFF chunks: SAPI files are not always 44-byte headers). */
function pcmOf(wav: Buffer): Buffer {
  for (let at = 12; at + 8 <= wav.length; ) {
    const id = wav.toString('ascii', at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    if (id === 'data') return wav.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

function wavFile(pcm: Buffer): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export default function makeAudio() {
  const out = process.env.LIVE_AUDIO!;
  if (existsSync(out)) return;
  if (process.platform !== 'win32') throw new Error('Live e2e synthesizes speech with Windows voices; run it on Windows');
  const work = mkdtempSync(path.join(tmpdir(), 'minutes-live-tts-'));
  const linesFile = path.join(work, 'lines.json');
  writeFileSync(linesFile, JSON.stringify(LINES.map((l) => ({ text: l.text, voice: VOICE[l.speaker], rate: 0 }))));
  const tts = path.resolve('apps/server/case-studies/tts.ps1');
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tts, '-In', linesFile, '-Out', work], { stdio: 'inherit' });
  const gap = Buffer.alloc(Math.round(GAP_SEC * RATE) * 2);
  const parts = LINES.flatMap((_, i) => [pcmOf(readFileSync(path.join(work, `${i}.wav`))), gap]);
  writeFileSync(out, wavFile(Buffer.concat([gap, ...parts])));
}
