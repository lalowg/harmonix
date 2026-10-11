// HARMONIX — Web Audio engine.
// The AudioContext is only ever created inside start(), which the UI calls from a user gesture.

import { MAX_VOICES, toneHz, releaseSec } from './theory.js';

const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
export const audioSupported = !!AC;

const WAVE_LEVEL = { sine: 0.3, triangle: 0.27, sawtooth: 0.15, square: 0.12 };

export class Synth {
  // `params` is the live instrument state object; the engine reads it on demand.
  constructor(params) {
    this.params = params;
    this.ctx = null;
    this.voices = new Map();
    this.order = [];
    this.onstate = null;
    this._data = null;
  }

  get started() { return !!this.ctx; }
  get state() { return this.ctx ? this.ctx.state : 'idle'; }

  start() {
    if (!AC) return false;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      // Safari 17+: play through the silent switch, like a media app.
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* not supported */ }

    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) {
      try { ctx = new AC(); } catch (err) { return false; }
    }
    this.ctx = ctx;
    const p = this.params;

    this.bus = ctx.createGain();
    this.dry = ctx.createGain();

    this.revSend = ctx.createGain();
    this.conv = ctx.createConvolver();
    this.conv.buffer = this._impulse(3.4);

    this.delSend = ctx.createGain();
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.36;
    this.delTone = ctx.createBiquadFilter();
    this.delTone.type = 'lowpass';
    this.delTone.frequency.value = 2600;
    this.fb = ctx.createGain();

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 18;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;

    // The analyser sits before the master gain, so muting silences the speakers
    // but the visuals keep listening.
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.78;
    this.master = ctx.createGain();

    this.bus.connect(this.dry);
    this.dry.connect(this.comp);
    this.bus.connect(this.revSend);
    this.revSend.connect(this.conv);
    this.conv.connect(this.comp);
    this.bus.connect(this.delSend);
    this.delSend.connect(this.delay);
    this.delay.connect(this.delTone);
    this.delTone.connect(this.fb);
    this.fb.connect(this.delay);
    this.delTone.connect(this.comp);
    this.comp.connect(this.analyser);
    this.analyser.connect(this.master);
    this.master.connect(ctx.destination);

    this.tData = new Float32Array(this.analyser.fftSize);
    this.fData = new Uint8Array(this.analyser.frequencyBinCount);
    this._data = { t: this.tData, f: this.fData, rate: ctx.sampleRate };

    ['space', 'echo'].forEach((n) => this.setParam(n, true));
    this.master.gain.value = p.muted ? 0 : this._vol();

    ctx.onstatechange = () => { if (this.onstate) this.onstate(ctx.state); };
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }

  _vol() { const v = this.params.volume; return v * v * 0.95; }
  _cutoff() { return toneHz(this.params.tone); }

  _impulse(seconds) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    const pre = Math.floor(rate * 0.014);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const fadeIn = i < pre ? i / pre : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.8) * fadeIn;
      }
    }
    return buf;
  }

  noteOn(id, freq, vel = 0.9) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.voices.has(id)) this._kill(id, 0.03);
    while (this.voices.size >= MAX_VOICES && this.order.length) this._kill(this.order[0], 0.04);

    const t = ctx.currentTime;
    const p = this.params;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = o2.type = p.wave;
    o1.frequency.setValueAtTime(freq, t);
    o2.frequency.setValueAtTime(freq, t);
    o2.detune.setValueAtTime(7, t);
    const mix2 = ctx.createGain();
    mix2.gain.value = 0.6;

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 5;
    const cutoff = this._cutoff();
    const peak = Math.min(cutoff * 3.2 + freq * 2, 15000);
    f.frequency.setValueAtTime(peak, t);
    f.frequency.setTargetAtTime(cutoff, t + 0.008, 0.12);

    const g = ctx.createGain();
    const level = vel * (WAVE_LEVEL[p.wave] || 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.008);
    g.gain.setTargetAtTime(level * 0.62, t + 0.008, 0.18);

    let out = g;
    let pan = null;
    if (ctx.createStereoPanner) {
      pan = ctx.createStereoPanner();
      // Low notes sit left, high notes drift right — gently.
      const pos = Math.max(-1, Math.min(1, (Math.log2(freq / 260)) * 0.22));
      pan.pan.value = pos;
      g.connect(pan);
      out = pan;
    }
    o1.connect(f);
    o2.connect(mix2);
    mix2.connect(f);
    f.connect(g);
    out.connect(this.bus);
    o1.start(t);
    o2.start(t);

    const voice = { o1, o2, f, g, pan, mix2, id };
    o1.onended = () => {
      try { [o1, o2, mix2, f, g].forEach((n) => n.disconnect()); if (pan) pan.disconnect(); } catch (e) { /* already gone */ }
    };
    this.voices.set(id, voice);
    this.order.push(id);
  }

  _hold(param, t) {
    if (param.cancelAndHoldAtTime) {
      param.cancelAndHoldAtTime(t);
    } else {
      const v = param.value;
      param.cancelScheduledValues(t);
      param.setValueAtTime(v, t);
    }
  }

  _release(id, seconds) {
    const v = this.voices.get(id);
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._hold(v.g.gain, t);
    v.g.gain.setTargetAtTime(0, t, Math.max(0.01, seconds / 5));
    const end = t + seconds + 0.08;
    try { v.o1.stop(end); v.o2.stop(end); } catch (e) { /* stopped */ }
    this.voices.delete(id);
    const i = this.order.indexOf(id);
    if (i > -1) this.order.splice(i, 1);
  }

  noteOff(id) { this._release(id, releaseSec(this.params.release)); }
  _kill(id, seconds) { this._release(id, seconds); }
  panic() { [...this.voices.keys()].forEach((id) => this._kill(id, 0.06)); }

  setParam(name, immediate = false) {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = this.params;
    const t = ctx.currentTime;
    const tc = immediate ? 0.001 : 0.04;
    switch (name) {
      case 'tone': {
        const c = this._cutoff();
        this.voices.forEach((v) => { this._hold(v.f.frequency, t); v.f.frequency.setTargetAtTime(c, t, 0.06); });
        break;
      }
      case 'space':
        this.revSend.gain.setTargetAtTime(p.space * 0.9, t, tc);
        this.dry.gain.setTargetAtTime(1 - p.space * 0.35, t, tc);
        break;
      case 'echo':
        this.delSend.gain.setTargetAtTime(p.echo * 0.55, t, tc);
        this.fb.gain.setTargetAtTime(0.22 + p.echo * 0.48, t, tc);
        break;
      case 'volume':
        if (!p.muted) this.master.gain.setTargetAtTime(this._vol(), t, tc);
        break;
      case 'wave':
        this.voices.forEach((v) => { v.o1.type = p.wave; v.o2.type = p.wave; });
        break;
      default:
    }
  }

  setMuted(m) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : this._vol(), this.ctx.currentTime, 0.03);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  read() {
    if (!this.ctx || this.ctx.state !== 'running') return null;
    this.analyser.getFloatTimeDomainData(this.tData);
    this.analyser.getByteFrequencyData(this.fData);
    return this._data;
  }
}
