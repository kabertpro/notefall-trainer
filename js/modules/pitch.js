/**
 * pitch.js — Real-time pitch detection via Web Audio API
 * Implements: YIN algorithm (de Cheveigné & Kawahara 2002)
 * with McLeod Pitch Method fallback for noisy signals.
 * Kabert Studio – LMKE
 */

import { freqToMidi, midiToPitchInfo, midiToNoteName } from './midi.js';

// ── AudioWorklet processor (inlined as a blob URL) ──────────────────────
const WORKLET_CODE = `
class PitchCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(2048);
    this._writePos = 0;
    this._frameCount = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this._buffer[this._writePos++ % 2048] = input[i];
    }
    this._frameCount++;
    // Send a copy every ~4 frames (~93ms at 44100/128)
    if (this._frameCount % 4 === 0) {
      const copy = new Float32Array(2048);
      for (let i = 0; i < 2048; i++) {
        copy[i] = this._buffer[(this._writePos - 2048 + i + 2048) % 2048];
      }
      this.port.postMessage(copy.buffer, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('pitch-capture', PitchCapture);
`;

export class PitchDetector {
  constructor(config = {}) {
    this.sensitivity  = config.sensitivity  ?? 0.05;  // RMS gate
    this.sampleRate   = 44100;
    this.bufferSize   = 2048;

    this.context      = null;
    this.stream       = null;
    this.worklet      = null;
    this.source       = null;
    this.analyser     = null;
    this.active       = false;

    /** Latest detection result */
    this.result = {
      freq:     0,
      midi:     null,
      noteName: '—',
      cents:    0,
      rms:      0,
      confident: false,
    };

    this._listeners = [];
  }

  /** Request microphone & boot AudioWorklet */
  async start() {
    if (this.active) return;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });

    this.context = new AudioContext({ sampleRate: this.sampleRate });
    await this.context.resume();

    // Register worklet from blob
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const url  = URL.createObjectURL(blob);
    await this.context.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    this.source   = this.context.createMediaStreamSource(this.stream);
    this.worklet  = new AudioWorkletNode(this.context, 'pitch-capture');
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;

    this.source.connect(this.worklet);
    this.source.connect(this.analyser);
    this.worklet.port.onmessage = (e) => this._onBuffer(new Float32Array(e.data));

    this.active = true;
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    try {
      this.worklet?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach(t => t.stop());
      this.context?.close();
    } catch {}
    this.context = this.stream = this.worklet = this.source = null;
  }

  onResult(cb) { this._listeners.push(cb); }

  _onBuffer(buf) {
    const rms = this._rms(buf);
    if (rms < this.sensitivity) {
      this.result = { freq: 0, midi: null, noteName: '—', cents: 0, rms, confident: false };
      this._emit();
      return;
    }

    const freq = this._yin(buf) || this._mpm(buf);
    if (!freq || freq < 60 || freq > 2100) {
      this.result = { freq: 0, midi: null, noteName: '—', cents: 0, rms, confident: false };
      this._emit();
      return;
    }

    const midiFloat = freqToMidi(freq);
    const { midi, cents } = midiToPitchInfo(midiFloat);
    const noteName = midiToNoteName(midi);

    this.result = { freq, midi, noteName, cents, rms, confident: true };
    this._emit();
  }

  _emit() {
    this._listeners.forEach(cb => cb(this.result));
  }

  _rms(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  // ── YIN Algorithm ──────────────────────────────────────────────────────
  _yin(buf) {
    const N    = buf.length;
    const half = N >> 1;
    const d    = new Float32Array(half);
    const cmnd = new Float32Array(half);
    const threshold = 0.10;

    // Step 2: Difference function
    for (let tau = 1; tau < half; tau++) {
      for (let j = 0; j < half; j++) {
        const diff = buf[j] - buf[j + tau];
        d[tau] += diff * diff;
      }
    }

    // Step 3: Cumulative mean normalised difference
    cmnd[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < half; tau++) {
      runningSum += d[tau];
      cmnd[tau] = runningSum === 0 ? 0 : d[tau] * tau / runningSum;
    }

    // Step 4: Absolute threshold
    let tau = 2;
    while (tau < half) {
      if (cmnd[tau] < threshold) {
        while (tau + 1 < half && cmnd[tau + 1] < cmnd[tau]) tau++;
        break;
      }
      tau++;
    }

    if (tau === half || cmnd[tau] >= threshold) return 0;

    // Step 5: Parabolic interpolation
    const x0 = tau > 1     ? tau - 1 : tau;
    const x2 = tau + 1 < half ? tau + 1 : tau;
    let betterTau;
    if (x0 === tau) {
      betterTau = cmnd[tau] <= cmnd[x2] ? tau : x2;
    } else if (x2 === tau) {
      betterTau = cmnd[tau] <= cmnd[x0] ? tau : x0;
    } else {
      const s0 = cmnd[x0], s1 = cmnd[tau], s2 = cmnd[x2];
      betterTau = tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
    }

    return betterTau > 0 ? this.sampleRate / betterTau : 0;
  }

  // ── MPM (McLeod Pitch Method) – fallback ─────────────────────────────
  _mpm(buf) {
    const N   = buf.length;
    const nsdf = new Float32Array(N);

    // Normalised Square Difference Function
    for (let tau = 0; tau < N; tau++) {
      let acf = 0, m = 0;
      for (let i = 0; i < N - tau; i++) {
        acf += buf[i] * buf[i + tau];
        m   += buf[i] * buf[i] + buf[i + tau] * buf[i + tau];
      }
      nsdf[tau] = m > 0 ? 2 * acf / m : 0;
    }

    // Find peaks above 0.5
    const peaks = [];
    for (let i = 1; i < N - 1; i++) {
      if (nsdf[i] > nsdf[i - 1] && nsdf[i] >= nsdf[i + 1] && nsdf[i] > 0.5) {
        peaks.push(i);
      }
    }
    if (peaks.length === 0) return 0;

    // Parabolic interpolation on best peak
    const tau = peaks[0];
    if (tau < 1 || tau >= N - 1) return 0;
    const refined = tau + (nsdf[tau + 1] - nsdf[tau - 1]) / (2 * (2 * nsdf[tau] - nsdf[tau - 1] - nsdf[tau + 1]));
    return refined > 0 ? this.sampleRate / refined : 0;
  }
}
