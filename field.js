// HARMONIX — the field: a Canvas 2D stage that draws what the synth is doing.
// Ground: a perspective field of spectrum lines (low notes ripple close, high notes far).
// Horizon: a live spectrum skyline, each bar coloured by the pitch class of its frequency.
// Sky: one Lissajous figure per sounding note, drawn from its interval to the root.

import { hsla, pcHue } from './theory.js';

const VOID = '#05050A';
const TAU = Math.PI * 2;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function createField({ canvas, host, stage: stageEl, read, onFrame, reduced: startReduced = false }) {
  let ctx = null;
  try { ctx = canvas.getContext('2d', { alpha: false }); } catch (e) { ctx = null; }
  if (!ctx) return null;

  let W = 1, H = 1, dpr = 1, small = false;
  let st = { x: 0, y: 0, w: 1, h: 1 };
  let horizon = 0, ground = 0;
  let L = 40, P = 120;
  let lineY = [], lineZ = [];
  let ptsX = new Float32Array(160), ptsY = new Float32Array(160);
  const weights = new Float32Array(32);
  let barsN = 96, bars = new Float32Array(96), barF = [], barHue = [], barBin = [], barRate = 0;
  let barsLive = false;
  let edgeL = null, edgeR = null, topFade = null;

  const voices = new Map(); // visual voices keyed by unique serial
  const current = new Map(); // note id → serial of the voice it currently drives
  const fx = []; // beams and ripples
  let serial = 0;
  let energy = 0, lastHue = 60;

  let reduced = startReduced;
  let paused = false;
  let inView = true;
  let running = false;
  let last = 0;
  let time = 0;

  function layout() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    small = W < 720;
    dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const s = stageEl.getBoundingClientRect();
    st = { x: s.left - r.left, y: s.top - r.top, w: Math.max(40, s.width), h: Math.max(40, s.height) };
    horizon = st.y + st.h * 0.46;
    ground = st.y + st.h;
    L = small ? 24 : 40;
    P = small ? 84 : 140;
    if (ptsX.length < P) { ptsX = new Float32Array(P); ptsY = new Float32Array(P); }
    lineY = []; lineZ = [];
    for (let i = 0; i < L; i++) {
      const z = (i + 1) / L;
      lineZ.push(z);
      lineY.push(horizon + (ground - horizon) * Math.pow(z, 1.65));
    }
    barsN = small ? 44 : 88;
    bars = new Float32Array(barsN);
    barF = []; barHue = []; barBin = []; barRate = 0;
    for (let b = 0; b < barsN; b++) {
      const f = 70 * Math.pow(7000 / 70, b / (barsN - 1));
      barF.push(f);
      const midi = 69 + 12 * Math.log2(f / 440);
      barHue.push(pcHue(((Math.round(midi) % 12) + 12) % 12));
    }
    const fadeW = Math.min(160, W * 0.12);
    edgeL = ctx.createLinearGradient(0, 0, fadeW, 0);
    edgeL.addColorStop(0, VOID); edgeL.addColorStop(1, 'rgba(5,5,10,0)');
    edgeR = ctx.createLinearGradient(W - fadeW, 0, W, 0);
    edgeR.addColorStop(0, 'rgba(5,5,10,0)'); edgeR.addColorStop(1, VOID);
    topFade = ctx.createLinearGradient(0, 0, 0, Math.min(140, H * 0.16));
    topFade.addColorStop(0, VOID); topFade.addColorStop(1, 'rgba(5,5,10,0)');
    draw(null);
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    let e = 0;
    voices.forEach((v, key) => {
      v.age += dt;
      if (v.held) {
        const target = v.age < 0.14 ? 1 : 0.74;
        v.level += (target - v.level) * Math.min(1, dt / (v.age < 0.14 ? 0.02 : 0.3));
      } else {
        v.level *= Math.exp(-dt / v.tau);
        if (v.level < 0.004) { voices.delete(key); return; }
      }
      if (!reduced) {
        v.phase += dt * v.omega;
        v.g.delta += dt * v.g.rate;
      }
      e += v.level;
    });
    energy += (Math.min(1, e) - energy) * Math.min(1, dt * 6);
    for (let i = fx.length - 1; i >= 0; i--) {
      fx[i].life += dt;
      if (fx[i].life > fx[i].dur) fx.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- draw
  function draw(data) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, W, H);
    drawHorizon();
    drawBars(data);
    drawField(data);
    drawSky();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = edgeL; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = edgeR; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = topFade; ctx.fillRect(0, 0, W, H);
  }

  function spanAt(z) {
    const half = st.w * 0.5 * (0.58 + 0.46 * z);
    const cx = st.x + st.w * 0.5;
    return [cx - half, half * 2];
  }

  function drawHorizon() {
    const [x0, span] = spanAt(0);
    const glow = 0.05 + energy * 0.22;
    const g = ctx.createLinearGradient(0, horizon - 70, 0, horizon + 2);
    g.addColorStop(0, hsla(lastHue, 0));
    g.addColorStop(1, hsla(lastHue, glow * 0.6));
    ctx.fillStyle = g;
    ctx.fillRect(x0, horizon - 70, span, 72);
    ctx.strokeStyle = 'rgba(240,240,245,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, horizon + 0.5);
    ctx.lineTo(x0 + span, horizon + 0.5);
    ctx.stroke();
    // tick marks along the horizon, like a frequency ruler
    ctx.strokeStyle = 'rgba(240,240,245,0.16)';
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const x = x0 + (i / 24) * span;
      const h = i % 6 === 0 ? 7 : 3;
      ctx.moveTo(x + 0.5, horizon + 3);
      ctx.lineTo(x + 0.5, horizon + 3 + h);
    }
    ctx.stroke();
  }

  function drawBars(data) {
    const f = data && data.f;
    const [x0, span] = spanAt(0);
    const maxH = (horizon - st.y) * 0.62;
    if (f && data.rate !== barRate) {
      barRate = data.rate;
      barBin = barF.map((fr) => Math.min(f.length - 1, Math.round((fr / (data.rate / 2)) * f.length)));
    }
    const decay = reduced ? 0.78 : 0.9;
    let any = false;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = small ? 1.5 : 1.25;
    for (let b = 0; b < barsN; b++) {
      let v = 0;
      if (f) {
        v = f[barBin[b]] / 255;
        v = Math.max(0, (v - 0.28) / 0.72);
      }
      bars[b] = Math.max(v, bars[b] * decay);
      const val = bars[b];
      if (val < 0.01) continue;
      any = true;
      const h = Math.pow(val, 1.4) * maxH;
      const x = x0 + ((b + 0.5) / barsN) * span;
      ctx.strokeStyle = hsla(barHue[b], 0.18 + 0.7 * val);
      ctx.beginPath();
      ctx.moveTo(x, horizon - 1);
      ctx.lineTo(x, horizon - 1 - h);
      ctx.stroke();
      // a cap, like a peak-hold LED
      ctx.fillStyle = hsla(barHue[b], 0.5 + 0.5 * val, 8);
      ctx.fillRect(x - 1.5, horizon - 3 - h, 3, 1.5);
    }
    ctx.globalCompositeOperation = 'source-over';
    barsLive = any;
  }

  function scopeTrigger(t) {
    // find an upward zero crossing so the waveform holds still, like a scope
    const lim = Math.min(t.length >> 1, 900);
    for (let i = 1; i < lim; i++) if (t[i - 1] < 0 && t[i] >= 0) return i;
    return 0;
  }

  function drawField(data) {
    const td = data && data.t;
    const trig = td ? scopeTrigger(td) : 0;
    const tdSpan = td ? Math.min(1024, td.length - trig - 1) : 0;
    const A = st.h * 0.2;
    const vs = [...voices.values()];
    const nV = Math.min(vs.length, weights.length);
    for (let i = 0; i < L; i++) {
      const z = lineZ[i];
      const y0 = lineY[i];
      const [x0, span] = spanAt(z);
      let wsum = 0, wmax = 0, hue = 0;
      for (let k = 0; k < nV; k++) {
        const v = vs[k];
        const dz = z - v.depth;
        const w = v.level * Math.exp(-(dz * dz) / 0.02);
        weights[k] = w;
        wsum += w;
        if (w > wmax) { wmax = w; hue = v.hue; }
      }
      const amp = A * (0.2 + 0.8 * z);
      const scopeAmt = td ? Math.min(1, wsum) * 0.6 : 0;
      for (let j = 0; j < P; j++) {
        const u = j / (P - 1);
        const win = Math.pow(Math.sin(Math.PI * u), 1.5);
        let d = 0;
        if (!reduced) d += (Math.sin(u * 9 + time * 0.5 + i * 0.55) * 0.6 + Math.sin(u * 23 - time * 0.33 + i * 1.3) * 0.4) * 0.05;
        for (let k = 0; k < nV; k++) {
          const w = weights[k];
          if (w < 0.004) continue;
          const v = vs[k];
          d += w * Math.sin(u * v.k + v.phase + i * 0.38);
        }
        if (scopeAmt > 0.01) d += td[trig + ((u * tdSpan) | 0)] * scopeAmt * 2.4;
        ptsX[j] = x0 + u * span;
        ptsY[j] = y0 - d * win * amp;
      }
      // hidden-line fill: nearer lines occlude the farther ones behind their peaks
      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let j = 1; j < P; j++) ctx.lineTo(ptsX[j], ptsY[j]);
      ctx.lineTo(ptsX[P - 1], y0 + 2);
      ctx.lineTo(ptsX[0], y0 + 2);
      ctx.closePath();
      ctx.fillStyle = VOID;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let j = 1; j < P; j++) ctx.lineTo(ptsX[j], ptsY[j]);
      ctx.lineWidth = 0.6 + 0.8 * z;
      ctx.strokeStyle = `rgba(240,240,245,${(0.1 + 0.24 * z).toFixed(3)})`;
      ctx.stroke();
      if (wsum > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = hsla(hue, Math.min(0.95, wsum * 1.1));
        ctx.stroke();
        if (wsum > 0.12) {
          ctx.lineWidth = 3 + 4 * z;
          ctx.strokeStyle = hsla(hue, Math.min(0.2, wsum * 0.22));
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  function drawSky() {
    ctx.globalCompositeOperation = 'lighter';
    // beams and ripples
    for (const e of fx) {
      const k = 1 - e.life / e.dur;
      if (e.type === 'beam') {
        ctx.strokeStyle = hsla(e.hue, 0.55 * k * k);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(e.x0, e.y0);
        ctx.lineTo(e.x1, e.y1 + e.r * 0.2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = hsla(e.hue, 0.5 * k * k);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * (1 + (1 - k) * 1.5), 0, TAU);
        ctx.stroke();
      }
    }
    voices.forEach((v) => {
      const g = v.g;
      const grow = reduced ? 1 : easeOut(Math.min(1, v.age / 0.45));
      const r = g.r * (0.55 + 0.45 * grow);
      const lvl = Math.min(1, v.level);
      ctx.beginPath();
      for (let s = 0; s <= g.n; s++) {
        const th = (s / g.n) * TAU;
        const x = g.cx + r * Math.sin(g.a * th + g.delta);
        const y = g.cy + r * Math.sin(g.b * th);
        if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = hsla(v.hue, 0.95 * lvl, 6);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.strokeStyle = hsla(v.hue, 0.1 * lvl);
      ctx.stroke();
      // centre mark + pitch-class dot
      ctx.fillStyle = hsla(v.hue, 0.9 * lvl, 10);
      ctx.fillRect(g.cx - 1.5, g.cy - 1.5, 3, 3);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- loop
  function busy() { return voices.size > 0 || fx.length > 0 || barsLive; }
  function wants() { return inView && !document.hidden && !paused && (!reduced || busy()); }

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    update(dt);
    const data = read ? read() : null;
    draw(data);
    if (onFrame) onFrame(dt, data);
    if (wants()) {
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function kick() {
    if (running || !wants()) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- api
  function noteOn({ id, midi, hue, a, b, cents, x, xf = 0.5 }) {
    const prev = current.get(id);
    if (prev !== undefined && voices.has(prev)) { const pv = voices.get(prev); pv.held = false; pv.tau = 0.08; }
    const key = ++serial;
    const depth = 1 - Math.max(0, Math.min(1, (midi - 38) / (92 - 38)));
    // the sky reaches up behind the title, so figures have room to breathe
    const skyTop = Math.max(72, st.y - st.h * 0.55);
    const skyH = Math.max(40, horizon - skyTop);
    const r = Math.max(14, Math.min(st.w * (small ? 0.11 : 0.085), skyH * 0.34, 110));
    const t = 1 - depth; // high notes float higher
    const cx = st.x + r + 6 + Math.max(0, Math.min(1, xf)) * Math.max(0, st.w - 2 * r - 12);
    const cy = horizon - r - 14 - t * Math.max(0, skyH - 2 * r - 22);
    const n = Math.min(900, 80 * Math.max(a, b) + 60);
    const rate = (0.22 + Math.min(0.9, Math.abs(cents) * 0.04)) * (cents < 0 ? -1 : 1);
    const v = {
      id, midi, hue, depth, level: 0.85, held: true, tau: 0.3, age: 0,
      k: TAU * (1.2 + (midi - 36) * 0.09), omega: 1.4 + (midi - 36) * 0.07, phase: Math.random() * TAU,
      g: { a, b, cx, cy, r, n, delta: Math.PI * 0.37, rate },
    };
    voices.set(key, v);
    current.set(id, key);
    lastHue = hue;
    if (!reduced) {
      fx.push({ type: 'beam', hue, x0: x, y0: st.y + st.h, x1: cx, y1: cy, r, life: 0, dur: 0.5 });
      fx.push({ type: 'ring', hue, x: cx, y: cy, r, life: 0, dur: 0.9 });
    }
    kick();
  }

  function noteOff(id, releaseSeconds) {
    const key = current.get(id);
    if (key === undefined) return;
    current.delete(id);
    const v = voices.get(key);
    if (!v) return;
    v.held = false;
    v.tau = Math.max(0.05, releaseSeconds / 5);
    kick();
  }

  function clear() {
    voices.clear();
    current.clear();
    fx.length = 0;
    bars.fill(0);
    energy = 0;
    draw(null);
    kick();
  }

  function setPaused(p) { paused = p; if (!p) kick(); }
  function setReduced(r) { reduced = r; draw(null); kick(); }

  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => layout()) : null;
  if (ro) { ro.observe(host); ro.observe(stageEl); } else window.addEventListener('resize', layout);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      kick();
    }, { threshold: 0 }).observe(host);
  }
  document.addEventListener('visibilitychange', kick);

  layout();
  kick();

  return { noteOn, noteOff, clear, setPaused, setReduced, kick, layout };
}
