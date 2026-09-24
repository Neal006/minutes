const RATE = 16_000; // what speech models are trained on; 20s ≈ 640 KB

/**
 * Re-encode a recorded chunk (WebM/Opus in Chrome) as 16 kHz mono 16-bit WAV. Every STT provider
 * accepts WAV, including OpenRouter's audio models, which don't take WebM.
 */
export async function toWav16k(blob: Blob): Promise<Blob> {
  const decoded = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await blob.arrayBuffer());
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.connect(ctx.destination); // a 1-channel destination downmixes stereo for us
  src.start();
  const samples = (await ctx.startRendering()).getChannelData(0);

  const out = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (off: number, s: string) => [...s].forEach((c, i) => out.setUint8(off + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  out.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVEfmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, 1, true); // mono
  out.setUint32(24, RATE, true);
  out.setUint32(28, RATE * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return new Blob([out], { type: 'audio/wav' });
}
