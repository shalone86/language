// Microphone recording → 16 kHz mono WAV, with a level meter and auto-stop on silence.

import { encodeWav, trimSilence, normalizeGain } from "./wav.js";

const TARGET_RATE = 16000;

export class Recorder {
  constructor() {
    this.state = "idle";
  }

  /**
   * Start recording.
   * @param {object} o
   * @param {(level:number)=>void} [o.onLevel]  0..1 loudness, ~30x per second
   * @param {()=>void} [o.onAutoStop]           called when silence after speech ends the take
   * @param {number} [o.maxMs]                  hard limit
   * @param {number} [o.silenceMs]              how long a pause after speech ends the take
   */
  async start({ onLevel, onAutoStop, maxMs = 12000, silenceMs = 1300 } = {}) {
    if (this.state !== "idle") return;
    this.state = "starting";
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        // Browser "voice call" processing is off on purpose: noise suppression treats the
        // hiss of /s/, /f/ and /θ/ as noise and strips it — exactly the sounds we're checking.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
    } catch (e) {
      this.state = "idle";
      throw new Error(e.name === "NotAllowedError"
        ? "Microphone permission was blocked. Allow the microphone in your browser settings and try again."
        : `Could not open the microphone (${e.message}).`);
    }
    this.chunks = [];
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"]
      .find((m) => window.MediaRecorder?.isTypeSupported?.(m));
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start();

    // Level meter + simple voice-activity detection for auto-stop.
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctx.createMediaStreamSource(this.stream);
    const an = this.ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const data = new Float32Array(an.fftSize);
    const t0 = performance.now();
    let spokeAt = 0, lastLoud = 0;
    const tick = () => {
      if (this.state !== "recording") return;
      an.getFloatTimeDomainData(data);
      let sum = 0;
      for (const s of data) sum += s * s;
      const level = Math.sqrt(sum / data.length);
      onLevel?.(Math.min(1, level * 6));
      const now = performance.now();
      if (level > 0.03) {
        lastLoud = now;
        if (!spokeAt) spokeAt = now;
      }
      const silentFor = now - lastLoud;
      if ((spokeAt && now - spokeAt > 250 && silentFor > silenceMs) || now - t0 > maxMs) {
        onAutoStop?.();
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.state = "recording";
    this.raf = requestAnimationFrame(tick);
  }

  /** Stop and return { url, wav, speech, duration }. url plays the original take. */
  async stop() {
    if (this.state !== "recording") return null;
    this.state = "stopping";
    cancelAnimationFrame(this.raf);
    const done = new Promise((r) => (this.rec.onstop = r));
    this.rec.stop();
    await done;
    this.stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(this.chunks, { type: this.rec.mimeType || "audio/webm" });
    try {
      const decoded = await this.ctx.decodeAudioData(await blob.arrayBuffer());
      const mono = await resample(decoded, TARGET_RATE);
      const { samples, speech } = trimSilence(mono, TARGET_RATE);
      const wavSamples = normalizeGain(samples);
      const wav = new Blob([encodeWav(wavSamples, TARGET_RATE)], { type: "audio/wav" });
      return { url: URL.createObjectURL(wav), wav, speech, duration: wavSamples.length / TARGET_RATE };
    } finally {
      this.ctx.close();
      this.state = "idle";
    }
  }

  cancel() {
    if (this.state !== "recording") return;
    cancelAnimationFrame(this.raf);
    this.rec.stop();
    this.stream.getTracks().forEach((t) => t.stop());
    this.ctx.close();
    this.state = "idle";
  }
}

async function resample(buffer, rate) {
  const length = Math.ceil(buffer.duration * rate);
  const off = new OfflineAudioContext(1, length, rate);
  const src = off.createBufferSource();
  src.buffer = buffer; // multi-channel input is down-mixed to mono by the 1-channel context
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

export const micSupported = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
