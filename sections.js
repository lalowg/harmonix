// HARMONIX — sections: navigation, tuned headings, signal path, interval plate,
// pitch-colour wheel, patch track, keyboard map, ticker and the early-access form.

import {
  NOTE_NAMES, SCALES, PAD_CODES, mtof, noteName, pcHue, degreeMidi, scalePcs,
} from './theory.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TAU = Math.PI * 2;
const on = (name, fn) => document.addEventListener(name, (e) => fn(e.detail || {}));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function initSections(api) {
  const parts = [initNav, initTune, initSignal, initIntervals, initRing, initPatches, initKeys, initTicker, initForm];
  parts.forEach((fn) => {
    try { fn(api); } catch (e) { /* keep the rest of the page alive */ }
  });
}

// ------------------------------------------------------------------ navigation
function initNav(api) {
  const header = $('.site-header');
  const nav = $('#site-nav');
  const btn = $('.menu-btn');
  const links = $$('.nav-list a');
  const outside = [$('#main'), $('.site-footer')].filter(Boolean);

  let scrolled = null;
  const onScroll = () => {
    const s = window.scrollY > 8;
    if (s !== scrolled) { scrolled = s; header.classList.toggle('is-scrolled', s); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  let open = false;
  function setOpen(o, returnFocus = true) {
    open = o;
    btn.setAttribute('aria-expanded', String(o));
    nav.classList.toggle('is-open', o);
    document.body.classList.toggle('menu-open', o);
    outside.forEach((el) => { if (o) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
    if (o) {
      const first = nav.querySelector('a');
      if (first) setTimeout(() => first.focus(), 60);
    } else if (returnFocus) {
      btn.focus();
    }
  }
  btn.addEventListener('click', () => setOpen(!open));
  links.forEach((a) => a.addEventListener('click', () => { if (open) setOpen(false, false); }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); }
  });
  const wide = window.matchMedia('(min-width: 1180px)');
  const onWide = () => { if (wide.matches && open) setOpen(false, false); };
  if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);

  // current section
  if (!('IntersectionObserver' in window)) return;
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => a.removeAttribute('aria-current'));
      const a = map.get(en.target.id);
      if (a) a.setAttribute('aria-current', 'true');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
}

// ------------------------------------------------------------------ tuned headings
const GLYPHS = 'abcdefghijklmnopqrstuvwxyz0123456789#+=/';
function initTune(api) {
  const heads = $$('[data-tune]');
  heads.forEach((el) => {
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    el.textContent = '';
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = text;
    const vis = document.createElement('span');
    vis.className = 'tune';
    vis.setAttribute('aria-hidden', 'true');
    vis.textContent = text;
    el.append(sr, vis);
    el._tune = { vis, text };
  });
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      if (!api.isReduced()) scramble(en.target._tune.vis, en.target._tune.text);
    });
  }, { threshold: 0.6 });
  heads.forEach((h) => io.observe(h));
}
function scramble(el, text) {
  const chars = [...text];
  const start = performance.now();
  const step = 26;
  const settle = 170;
  const total = 120 + chars.length * step + settle;
  let lastSwap = 0;
  function tick(now) {
    const t = now - start;
    if (now - lastSwap > 45 || t >= total) {
      lastSwap = now;
      let out = '';
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        if (c === ' ') { out += ' '; continue; }
        out += t >= 120 + i * step + settle ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
    }
    if (t < total) requestAnimationFrame(tick); else el.textContent = text;
  }
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------------ signal path
function initSignal() {
  const steps = $$('.step');
  if (!steps.length) return;
  const nodes = $$('.sg-node');
  const packet = $('.sg-packet');
  const lit = $('.sg-lit');
  const Y = [70, 194, 318, 442, 566, 690];
  function activate(k) {
    steps.forEach((s, i) => s.classList.toggle('is-active', i === k));
    nodes.forEach((n, i) => { n.classList.toggle('is-active', i === k); n.classList.toggle('is-past', i < k); });
    if (packet) packet.style.transform = `translateY(${Y[k] - Y[0]}px)`;
    if (lit) lit.style.strokeDashoffset = String(1 - k / (Y.length - 1));
  }
  activate(0);
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) activate(+en.target.dataset.step); });
  }, { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach((s) => io.observe(s));
}

// ------------------------------------------------------------------ interval plate
function lissD(a, b, delta, n, flip = true) {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * TAU;
    const x = Math.sin(a * th + delta);
    const y = Math.sin(b * th) * (flip ? -1 : 1);
    d += (i ? 'L' : 'M') + x.toFixed(3) + ' ' + y.toFixed(3);
  }
  return d;
}

function initIntervals(api) {
  const rows = $$('.iv-row');
  if (!rows.length) return;
  const plate = $('.iv-plate');
  const pathEl = $('.plate-path');
  const glowEl = $('.plate-glow');
  const ratioEl = $('#plate-ratio');
  const nameEl = $('#plate-name');
  const loEl = $('#pl-lo');
  const hiEl = $('#pl-hi');
  const driftEl = $('#pl-drift');
  const capEl = $('#plate-cap');
  const N = 640;

  rows.forEach((r) => {
    const a = +r.dataset.a, b = +r.dataset.b;
    r.querySelector('.iv-fig path').setAttribute('d', lissD(a, b, Math.PI * 0.37, Math.min(520, 36 * Math.max(a, b) + 48)));
  });

  const info = (r) => ({ st: +r.dataset.st, a: +r.dataset.a, b: +r.dataset.b, cents: +r.dataset.cents, name: r.querySelector('.iv-name').textContent });
  let selRow = rows.find((r) => r.getAttribute('aria-pressed') === 'true') || rows[0];
  let cur = info(selRow);
  let from = null;
  let morph = 1;
  let delta = Math.PI * 0.37;
  let tuning = 'equal';
  const A = new Float32Array((N + 1) * 2);
  const B = new Float32Array((N + 1) * 2);

  const rootM = () => 60 + api.state.key;
  const freqs = () => {
    const lo = mtof(rootM());
    const hi = tuning === 'equal' ? mtof(rootM() + cur.st) : lo * (cur.a / cur.b);
    return { lo, hi };
  };
  const drift = () => {
    if (tuning === 'just') return 0;
    const { lo, hi } = freqs();
    const d = hi - (cur.a / cur.b) * lo;
    return Math.abs(d) < 1e-6 ? 0 : d;
  };

  function figure(a, b, d, out) {
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * TAU;
      out[i * 2] = Math.sin(a * th + d);
      out[i * 2 + 1] = -Math.sin(b * th);
    }
  }
  function render() {
    figure(cur.a, cur.b, delta, A);
    if (from && morph < 1) {
      figure(from.a, from.b, delta, B);
      const k = easeInOut(morph);
      for (let i = 0; i < A.length; i++) A[i] = B[i] + (A[i] - B[i]) * k;
    }
    let d = '';
    for (let i = 0; i <= N; i++) d += (i ? 'L' : 'M') + A[i * 2].toFixed(3) + ' ' + A[i * 2 + 1].toFixed(3);
    pathEl.setAttribute('d', d);
    glowEl.setAttribute('d', d);
  }
  function update() {
    const hue = pcHue((api.state.key + cur.st) % 12);
    plate.style.setProperty('--h', hue);
    ratioEl.textContent = `${cur.a}:${cur.b}`;
    nameEl.textContent = cur.name;
    const { lo, hi } = freqs();
    loEl.textContent = `${noteName(rootM())} · ${lo.toFixed(2)} Hz`;
    hiEl.textContent = `${noteName(rootM() + cur.st)} · ${hi.toFixed(2)} Hz`;
    const dr = drift();
    driftEl.textContent = dr === 0 ? 'none — still' : `${Math.abs(dr).toFixed(2)} Hz`;
    capEl.textContent = tuning === 'just'
      ? 'Just intonation uses the whole-number ratio itself, so the two waves lock together and the figure stands still.'
      : dr === 0
        ? 'Unisons and octaves are exact in equal temperament too, so this figure holds still.'
        : 'In equal temperament the ratio is never quite whole, so the figure slowly turns. Switch to just intonation and it stands still.';
  }

  let running = false, visible = false, last = 0;
  const wants = () => visible && !document.hidden && (morph < 1 || (!api.isReduced() && drift() !== 0));
  function tick(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (morph < 1) morph = Math.min(1, morph + dt / 0.6);
    if (!api.isReduced()) {
      const rate = Math.max(-TAU * 1.1, Math.min(TAU * 1.1, TAU * drift() * 0.5));
      delta += rate * dt;
    }
    render();
    if (wants()) requestAnimationFrame(tick); else running = false;
  }
  function kick() {
    if (running || !wants()) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }

  function play() {
    if (!api.ensureAudio()) return;
    const { lo, hi } = freqs();
    api.blip('iv-lo', lo, 1.9, 0.75);
    api.blip('iv-hi', hi, 1.9, 0.75);
  }
  function select(row, withSound) {
    rows.forEach((r) => r.setAttribute('aria-pressed', r === row ? 'true' : 'false'));
    selRow = row;
    from = { a: cur.a, b: cur.b };
    cur = info(row);
    morph = api.isReduced() ? 1 : 0;
    update();
    render();
    kick();
    if (withSound) play();
  }
  rows.forEach((r) => r.addEventListener('click', () => select(r, true)));
  $('#plate-play').addEventListener('click', play);
  $$('input[name="tuning"]').forEach((inp) => inp.addEventListener('change', () => {
    if (!inp.checked) return;
    tuning = inp.value;
    update();
    render();
    kick();
    play();
  }));

  on('hx:state', () => {
    rows.forEach((r) => r.style.setProperty('--h', pcHue((api.state.key + +r.dataset.st) % 12)));
    update();
    render();
  });
  on('hx:reduced', () => { morph = 1; render(); kick(); });
  document.addEventListener('visibilitychange', kick);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((en) => { visible = en[0].isIntersecting; kick(); }, { threshold: 0 }).observe(plate);
  } else {
    visible = true;
  }
  update();
  render();
}

// ------------------------------------------------------------------ pitch-colour wheel
function initRing(api) {
  const ring = $('.ring');
  if (!ring) return;
  const btns = $$('.ring-btn', ring);
  const segs = $$('.rs', ring);
  const lis = $$('.ring-notes li', ring);
  const noteEl = $('#ring-note');
  const hzEl = $('#ring-hz');
  const hueEl = $('#ring-hue');
  const section = $('#colour');
  let rot = 0;
  let touched = false;
  let seq = [];

  function face(pc) {
    const target = -((pc * 7) % 12) * 30;
    const diff = ((((target - rot) % 360) + 540) % 360) - 180;
    rot += diff;
    ring.style.setProperty('--rot', rot + 'deg');
  }
  function show(pc, midi, mark = true) {
    noteEl.textContent = NOTE_NAMES[pc];
    hzEl.textContent = mtof(midi).toFixed(2) + ' Hz';
    hueEl.textContent = 'hue ' + pcHue(pc) + '°';
    ring.style.setProperty('--h', pcHue(pc));
    btns.forEach((b) => b.classList.toggle('is-on', mark && +b.dataset.pc === pc));
  }
  function play(pc, midi, id = 'ring') {
    face(pc);
    show(pc, midi);
    if (api.ensureAudio()) api.blip(id, mtof(midi), 1.1, 0.8);
  }
  btns.forEach((b) => b.addEventListener('click', () => {
    touched = true;
    seq.forEach(clearTimeout);
    const pc = +b.dataset.pc;
    play(pc, 60 + pc);
  }));
  $('#ring-scale').addEventListener('click', () => {
    touched = true;
    seq.forEach(clearTimeout);
    const s = api.state;
    const steps = [...SCALES[s.scale].steps, 12];
    const base = 60 + s.key;
    seq = steps.map((st, k) => setTimeout(() => play((s.key + st) % 12, base + st, 'ring' + (k % 3)), k * 260));
  });

  on('hx:state', (d) => {
    const s = api.state;
    const pcs = scalePcs(s);
    segs.forEach((g) => {
      const pc = +g.dataset.pc;
      g.classList.toggle('in-scale', pcs.includes(pc));
      g.classList.toggle('is-root', pc === s.key);
    });
    lis.forEach((li) => li.classList.toggle('in-scale', pcs.includes(+li.querySelector('.ring-btn').dataset.pc)));
    $('#scale-now').textContent = `${NOTE_NAMES[s.key]} ${SCALES[s.scale].label}`;
    $('#scale-notes').textContent = pcs.map((pc) => NOTE_NAMES[pc]).join(' · ');
    section.style.setProperty('--h', pcHue(s.key));
    if (!touched || d.reason === 'patch' || d.reason === 'reset') {
      face(s.key);
      show(s.key, 60 + s.key, false);
    }
  });
}

// ------------------------------------------------------------------ patches
function initPatches(api) {
  const track = $('#patch-track');
  if (!track) return;
  const items = $$('.patch', track);
  const bar = $('.track-progress span');
  const [prev, next] = $$('.track-btn');

  $$('.patch-load', track).forEach((b) => b.addEventListener('click', () => api.loadPatch(+b.dataset.patch, true)));

  const mark = (idx) => items.forEach((it, i) => {
    const loaded = i === idx;
    it.classList.toggle('is-loaded', loaded);
    it.querySelector('.pl-label').textContent = loaded ? 'Loaded — play the pads' : 'Load & hear';
  });
  on('hx:state', (d) => {
    if (d.reason === 'patch') mark(d.patch);
    else if (d.reason === 'param' || d.reason === 'reset') mark(-1);
  });

  const stepW = () => (items[0] ? items[0].getBoundingClientRect().width : 300);
  [prev, next].forEach((b) => b && b.addEventListener('click', () => {
    track.scrollBy({ left: +b.dataset.dir * stepW(), behavior: api.isReduced() ? 'auto' : 'smooth' });
  }));
  let raf = 0;
  function progress() {
    raf = 0;
    const max = track.scrollWidth - track.clientWidth;
    const vis = Math.min(1, track.clientWidth / Math.max(1, track.scrollWidth));
    const p = max > 1 ? track.scrollLeft / max : 0;
    if (bar) {
      bar.style.width = (vis * 100).toFixed(2) + '%';
      bar.style.left = (p * (1 - vis) * 100).toFixed(2) + '%';
    }
    if (prev) prev.disabled = track.scrollLeft < 4;
    if (next) next.disabled = max - track.scrollLeft < 4;
  }
  track.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(progress); }, { passive: true });
  window.addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(progress); });
  progress();
}

// ------------------------------------------------------------------ keyboard map
function initKeys(api) {
  const caps = $$('.kb .kc-pad');
  if (!caps.length) return;
  const byCode = new Map($$('.kb .kc[data-code]').map((k) => [k.dataset.code, k]));
  const ALIAS = { Numpad0: 'Digit0', NumpadSubtract: 'Minus', NumpadAdd: 'Equal' };
  on('hx:state', () => {
    caps.forEach((k) => {
      const midi = degreeMidi(+k.dataset.deg, api.state);
      k.querySelector('.kc-s').textContent = noteName(midi);
      k.style.setProperty('--hue', pcHue(midi % 12));
    });
  });
  on('hx:noteon', ({ deg }) => { const k = byCode.get(PAD_CODES[deg]); if (k) k.classList.add('is-down'); });
  on('hx:noteoff', ({ deg }) => { const k = byCode.get(PAD_CODES[deg]); if (k) k.classList.remove('is-down'); });
  on('hx:fn', ({ code }) => {
    const k = byCode.get(ALIAS[code] || code);
    if (!k) return;
    k.classList.add('is-down');
    setTimeout(() => k.classList.remove('is-down'), 170);
  });
}

// ------------------------------------------------------------------ ticker (scroll-linked, never autoplaying)
function initTicker(api) {
  const t = $('.ticker');
  if (!t) return;
  const tracks = $$('.ticker-track', t);
  let ticking = false;
  function update() {
    ticking = false;
    if (api.isReduced()) { tracks.forEach((tr) => tr.style.setProperty('--tx', '0px')); return; }
    const r = t.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.bottom < -80 || r.top > vh + 80) return;
    const p = Math.max(0, Math.min(1, (vh - r.top) / (vh + r.height)));
    tracks.forEach((tr) => {
      const span = Math.max(0, tr.scrollWidth - window.innerWidth) * 0.55;
      const x = +tr.dataset.dir < 0 ? -p * span : -(1 - p) * span;
      tr.style.setProperty('--tx', x.toFixed(1) + 'px');
    });
  }
  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', req, { passive: true });
  window.addEventListener('resize', req);
  on('hx:reduced', req);
  update();
}

// ------------------------------------------------------------------ early-access form (demo, no network)
function initForm(api) {
  const form = $('#access-form');
  if (!form) return;
  const name = $('#f-name');
  const email = $('#f-email');
  const note = $('#f-note');
  const uses = $$('input[name="use"]', form);
  const chips = $('.chips', form);
  const status = $('#form-status');
  const count = $('#c-note-n');
  let attempted = false;

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const checks = {
    name: () => (name.value.trim().length >= 2 ? '' : 'Enter your name (at least 2 characters).'),
    email: () => {
      const v = email.value.trim();
      if (!v) return 'Enter your email address.';
      return EMAIL.test(v) ? '' : 'Enter an email address like name@example.com.';
    },
    use: () => (uses.some((u) => u.checked) ? '' : 'Choose how you would play it.'),
  };
  function show(field) {
    const msg = checks[field]();
    if (field === 'use') {
      $('#e-use').textContent = msg;
      chips.classList.toggle('has-error', !!msg);
      uses.forEach((u) => u.setAttribute('aria-invalid', msg ? 'true' : 'false'));
    } else {
      const input = field === 'name' ? name : email;
      $('#e-' + field).textContent = msg;
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    return msg;
  }
  name.addEventListener('blur', () => { if (attempted || name.value) show('name'); });
  email.addEventListener('blur', () => { if (attempted || email.value) show('email'); });
  name.addEventListener('input', () => { if (name.getAttribute('aria-invalid') === 'true') show('name'); });
  email.addEventListener('input', () => { if (email.getAttribute('aria-invalid') === 'true') show('email'); });
  uses.forEach((u) => u.addEventListener('change', () => { if (attempted) show('use'); }));
  note.addEventListener('input', () => { count.textContent = String(note.value.length); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    attempted = true;
    const errs = ['name', 'email', 'use'].map((f) => [f, show(f)]).filter(([, m]) => m);
    if (errs.length) {
      const first = errs[0][0];
      (first === 'name' ? name : first === 'email' ? email : uses[0]).focus();
      status.hidden = true;
      return;
    }
    const who = name.value.trim().split(/\s+/)[0];
    status.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = `Thank you, ${who}.`;
    status.append(strong, document.createTextNode('This is a portfolio demo: nothing was sent, no list exists and nothing was stored. Your details never left this browser tab — go back and play something instead.'));
    status.hidden = false;
    status.focus();
    form.reset();
    attempted = false;
    count.textContent = '0';
    [name, email].forEach((i) => i.setAttribute('aria-invalid', 'false'));
    uses.forEach((u) => u.setAttribute('aria-invalid', 'false'));
    chips.classList.remove('has-error');
    // a small rising arpeggio, only if the instrument is already on and audible
    if (api.synth.started && !api.state.muted && !api.state.paused) {
      [0, 4, 7, 12].forEach((st, k) => setTimeout(() => api.blip('ok' + k, mtof(72 + api.state.key + st), 0.9, 0.6), k * 110));
    }
  });
}
