// Small, dependency-free audio helpers (pure functions, testable in Node).

/** Encode mono float samples (-1..1) as a 16-bit PCM WAV file. */
export function encodeWav(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

/** Root-mean-square loudness of a slice. */
export function rms(samples, start = 0, end = samples.length) {
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, end - start));
}

/**
 * Cut leading/trailing silence and pad with a little quiet on each side
 * (Whisper is more reliable on short clips with some padding).
 * Returns { samples, speech } where speech=false means nothing above the threshold.
 */
export function trimSilence(samples, sampleRate, { threshold = 0.015, padSec = 0.3, frameSec = 0.02 } = {}) {
  const frame = Math.max(1, Math.round(sampleRate * frameSec));
  let first = -1, last = -1;
  for (let i = 0; i < samples.length; i += frame) {
    if (rms(samples, i, Math.min(samples.length, i + frame)) > threshold) {
      if (first < 0) first = i;
      last = i + frame;
    }
  }
  if (first < 0) return { samples, speech: false };
  const pad = Math.round(sampleRate * padSec);
  const keepFrom = Math.max(0, first - frame * 5);
  const keepTo = Math.min(samples.length, last + frame * 10);
  const out = new Float32Array(pad + (keepTo - keepFrom) + pad);
  out.set(samples.subarray(keepFrom, keepTo), pad);
  return { samples: out, speech: true };
}

/** Peak-normalize quiet recordings so the recognizer gets a healthy level. */
export function normalizeGain(samples, target = 0.9) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak < 1e-4 || peak > target) return samples;
  const g = Math.min(target / peak, 8);
  return samples.map((s) => s * g);
}
