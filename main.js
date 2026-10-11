// HARMONIX — instrument controller: pads, keyboard, transport, parameters, HUD, kinetic type.

import { Synth, audioSupported } from './audio.js';
import { createField } from './field.js';
import {
  SCALES, SCALE_ORDER, NOTE_NAMES, DEFAULTS, PAD_KEYS, PAD_CODES, PATCHES, PHRASE,
  mtof, noteName, pcHue, degreeMidi, rootMidi, intervalFor,
  toneHz, releaseSec, fmtHz, fmtSec, fmtPct,
} from './theory.js';
import { initSections } from './sections.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
const isReduced = () => reducedMQ.matches;

const state = { ...DEFAULTS, hold: false, muted: false, paused: false };
const synth = new Synth(state);
const emit = (name, detail = {}) => document.dispatchEvent(new CustomEvent(name, { detail }));

// ------------------------------------------------------------------ announcer
const live = $('#hx-live');
let liveTimer = 0;
function announce(msg) {
  if (!live) return;
  clearTimeout(liveTimer);
  live.textContent = '';
  liveTimer = setTimeout(() => { live.textContent = msg; }, 40);
}

// ------------------------------------------------------------------ elements
const hero = $('#play');
const keybed = $('.keybed');
const pads = $$('.pad', keybed);
const btnPower = $('#btn-power');
const btnHold = $('#btn-hold');
const btnPhrase = $('#btn-phrase');
const btnReset = $('#btn-reset');
const muteBtns = $$('[data-mute]');
const hudEl = {
  note: $('#hud-note'), hz: $('#hud-hz'), iv: $('#hud-iv'), voices: $('#hud-voices'), audio: $('#hud-audio'),
};
const letters = $$('.kin .ch');
const kin = $('.kin');

// ------------------------------------------------------------------ field
let field = null;
try {
  field = createField({
    canvas: $('.hero-canvas'),
    host: hero,
    stage: $('#stage'),
    read: () => synth.read(),
    onFrame: kinetic,
    reduced: isReduced(),
  });
} catch (e) {
  field = null;
}
root.classList.add(field ? 'has-canvas' : 'no-canvas');

// ------------------------------------------------------------------ audio lifecycle
let audioWarned = false;
function ensureAudio() {
  if (!audioSupported) {
    if (!audioWarned) {
      audioWarned = true;
      const p = $('.stage-noaudio');
      if (p) p.hidden = false;
      hudEl.audio.textContent = 'n/a';
      announce('This browser cannot synthesise audio. The visuals still respond.');
    }
    return false;
  }
  const first = !synth.started;
  if (!synth.start()) return false;
  if (state.paused) setPaused(false, true);
  if (first) {
    synth.onstate = updatePower;
    updatePower();
    announce(state.muted ? 'Audio started, muted.' : 'Audio started.');
  }
  return true;
}

function updatePower() {
  const on = synth.started && !state.paused;
  root.classList.toggle('audio-on', on);
  const label = !synth.started ? 'Start audio' : state.paused ? 'Resume' : 'Pause';
  btnPower.querySelector('.tp-label').textContent = label;
  hudEl.audio.textContent = !audioSupported ? 'n/a' : !synth.started ? 'off' : state.paused ? 'paused' : state.muted ? 'muted' : 'on';
}

function setPaused(p, silent = false) {
  if (!synth.started && p) return;
  state.paused = p;
  if (p) {
    stopPhrase();
    synth.suspend();
  } else {
    synth.resume();
  }
  if (field) field.setPaused(p);
  root.classList.toggle('is-paused', p);
  updatePower();
  if (!silent) announce(p ? 'Paused. Press P or Resume to continue.' : 'Resumed.');
}

function togglePause() {
  if (!synth.started) { if (ensureAudio()) blip('start', mtof(rootMidi(state) + 12), 0.35, 0.5); return; }
  setPaused(!state.paused);
}

function setMuted(m, silent = false) {
  state.muted = m;
  synth.setMuted(m);
  muteBtns.forEach((b) => b.setAttribute('aria-pressed', String(m)));
  updatePower();
  if (!silent) announce(m ? 'Muted. The visuals keep listening.' : 'Sound on.');
}

// ------------------------------------------------------------------ pads
const held = new Map(); // degree → { sources:Set, midi, momentary }
const pointers = new Map(); // pointerId → degree (or -1)
let played = false;

const degMidi = (deg) => degreeMidi(deg, state);

function padPos(deg) {
  const hr = hero.getBoundingClientRect();
  const kr = keybed.getBoundingClientRect();
  const pr = pads[deg].getBoundingClientRect();
  const cx = pr.left + pr.width / 2;
  return { x: cx - hr.left, xf: kr.width > 0 ? (cx - kr.left) / kr.width : 0.5 };
}

function padOn(deg, src, momentary = false) {
  if (deg < 0 || deg > 15) return;
  ensureAudio();
  const rec = held.get(deg);
  if (state.hold && !momentary) {
    if (rec) { releasePad(deg); return; }
  } else if (rec) {
    rec.sources.add(src);
    return;
  }
  const midi = degMidi(deg);
  const id = 'pad' + deg;
  synth.noteOn(id, mtof(midi), 0.9);
  const iv = intervalFor(midi - rootMidi(state));
  const hue = pcHue(midi % 12);
  if (field) field.noteOn({ id, midi, hue, a: iv.a, b: iv.b, cents: iv.cents, ...padPos(deg) });
  held.set(deg, { sources: new Set([src]), midi, momentary });
  pads[deg].classList.add('is-on');
  root.style.setProperty('--hx-hue', hue);
  hud(midi, iv);
  flashLetter(midi, hue);
  emit('hx:noteon', { deg, midi, hue });
  if (!played) { played = true; hero.classList.add('is-played'); }
}

function padOff(deg, src) {
  const rec = held.get(deg);
  if (!rec) return;
  rec.sources.delete(src);
  if (rec.sources.size) return;
  if (state.hold && !rec.momentary) return;
  releasePad(deg);
}

function releasePad(deg) {
  const rec = held.get(deg);
  if (!rec) return;
  held.delete(deg);
  synth.noteOff('pad' + deg);
  if (field) field.noteOff('pad' + deg, releaseSec(state.release));
  pads[deg].classList.remove('is-on');
  emit('hx:noteoff', { deg });
  hudEl.voices.textContent = String(held.size);
}

function releaseAll() { [...held.keys()].forEach(releasePad); }

function releaseMomentary() {
  pointers.clear();
  held.forEach((rec, deg) => {
    [...rec.sources].forEach((s) => { if (s !== 'phrase') rec.sources.delete(s); });
    if (!rec.sources.size && (!state.hold || rec.momentary)) releasePad(deg);
  });
}

// pointer: multi-touch chords + glide across pads
keybed.addEventListener('pointerdown', (e) => {
  const pad = e.target.closest('.pad');
  if (!pad) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  if (keybed.setPointerCapture) { try { keybed.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
  const deg = +pad.dataset.deg;
  pointers.set(e.pointerId, deg);
  padOn(deg, 'p' + e.pointerId);
});
keybed.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId) || state.hold) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const pad = el && el.closest ? el.closest('.pad') : null;
  const deg = pad && keybed.contains(pad) ? +pad.dataset.deg : -1;
  const prev = pointers.get(e.pointerId);
  if (deg === prev) return;
  if (prev >= 0) padOff(prev, 'p' + e.pointerId);
  if (deg >= 0) padOn(deg, 'p' + e.pointerId);
  pointers.set(e.pointerId, deg);
});
const endPointer = (e) => {
  if (!pointers.has(e.pointerId)) return;
  const deg = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (deg >= 0) padOff(deg, 'p' + e.pointerId);
};
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => keybed.addEventListener(t, endPointer));
keybed.addEventListener('contextmenu', (e) => e.preventDefault());

// keyboard on a focused pad (Enter / Space) and assistive-tech clicks
pads.forEach((pad) => {
  const deg = +pad.dataset.deg;
  pad.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) padOn(deg, 'focus');
  });
  pad.addEventListener('keyup', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    padOff(deg, 'focus');
  });
  pad.addEventListener('click', (e) => {
    if (e.detail !== 0) return; // real pointer/keyboard presses are handled above
    if (state.hold) { padOn(deg, 'at'); return; }
    padOn(deg, 'at');
    setTimeout(() => padOff(deg, 'at'), 450);
  });
});

// global keyboard
const KEYMAP = Object.fromEntries(PAD_CODES.map((c, i) => [c, i]));
const isTyping = (t) => {
  if (!t || t === document.body) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !['range', 'radio', 'checkbox', 'button', 'submit'].includes(t.type);
  return false;
};

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (isTyping(e.target)) return;
  if (document.body.classList.contains('menu-open')) return;
  const deg = KEYMAP[e.code];
  if (deg !== undefined) {
    e.preventDefault();
    if (!e.repeat) padOn(deg, 'k' + e.code);
    return;
  }
  if (e.repeat) return;
  let handled = true;
  switch (e.code) {
    case 'KeyP': togglePause(); break;
    case 'KeyM': setMuted(!state.muted); break;
    case 'Digit0': case 'Numpad0': reset(); break;
    case 'Escape': panic(); break;
    case 'Minus': case 'NumpadSubtract': stepOctave(-1); break;
    case 'Equal': case 'NumpadAdd': stepOctave(1); break;
    case 'Comma': stepScale(-1); break;
    case 'Period': stepScale(1); break;
    default: handled = false;
  }
  if (handled) emit('hx:fn', { code: e.code });
});
window.addEventListener('keyup', (e) => {
  const deg = KEYMAP[e.code];
  if (deg !== undefined) padOff(deg, 'k' + e.code);
});
window.addEventListener('blur', releaseMomentary);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopPhrase(); releaseMomentary(); }
});

// ------------------------------------------------------------------ transport
btnPower.addEventListener('click', togglePause);
muteBtns.forEach((b) => b.addEventListener('click', () => setMuted(!state.muted)));
btnHold.addEventListener('click', () => setHold(!state.hold));
btnReset.addEventListener('click', reset);
btnPhrase.addEventListener('click', () => (phraseOn ? stopPhrase() : startPhrase()));

function setHold(h) {
  state.hold = h;
  btnHold.setAttribute('aria-pressed', String(h));
  if (!h) held.forEach((rec, deg) => { if (!rec.sources.size) releasePad(deg); });
  announce(h ? 'Hold on. Pads ring until you press them again.' : 'Hold off.');
}

function panic() {
  const busy = held.size > 0 || phraseOn;
  stopPhrase();
  releaseAll();
  synth.panic();
  clearBlips();
  if (busy) announce('All notes released.');
}

function reset() {
  stopPhrase();
  releaseAll();
  synth.panic();
  clearBlips();
  const muted = state.muted;
  Object.assign(state, DEFAULTS, { hold: false, muted });
  btnHold.setAttribute('aria-pressed', 'false');
  syncControls();
  applyParams();
  relabel();
  if (field) field.clear();
  if (state.paused) setPaused(false, true);
  hudEl.note.textContent = '—';
  hudEl.hz.textContent = '—';
  hudEl.iv.textContent = '—';
  hudEl.voices.textContent = '0';
  emit('hx:state', { reason: 'reset' });
  announce('Instrument reset to defaults.');
}

// phrase — user-triggered demo, never automatic
let phraseOn = false;
let phraseTimers = [];
function startPhrase() {
  ensureAudio();
  stopPhrase();
  phraseOn = true;
  btnPhrase.setAttribute('aria-pressed', 'true');
  let end = 0;
  PHRASE.forEach(([t, degs, dur]) => {
    end = Math.max(end, t + dur);
    phraseTimers.push(setTimeout(() => {
      degs.forEach((d) => padOn(d, 'phrase', true));
      phraseTimers.push(setTimeout(() => degs.forEach((d) => padOff(d, 'phrase')), dur * 1000));
    }, t * 1000));
  });
  phraseTimers.push(setTimeout(stopPhrase, (end + 0.15) * 1000));
}
function stopPhrase() {
  phraseTimers.forEach(clearTimeout);
  phraseTimers = [];
  if (phraseOn) {
    held.forEach((rec, deg) => {
      if (rec.sources.has('phrase')) { rec.sources.delete('phrase'); if (!rec.sources.size && (!state.hold || rec.momentary)) releasePad(deg); }
    });
  }
  phraseOn = false;
  btnPhrase.setAttribute('aria-pressed', 'false');
}

// one-shot notes for the sections (intervals, wheel, patch previews)
const blips = new Map();
function blip(id, freq, dur, vel = 0.85) {
  if (!synth.started) return;
  clearTimeout(blips.get(id));
  synth.noteOn(id, freq, vel);
  blips.set(id, setTimeout(() => { synth.noteOff(id); blips.delete(id); }, dur * 1000));
}
function clearBlips() {
  blips.forEach((t, id) => { clearTimeout(t); synth.noteOff(id); });
  blips.clear();
  previewTimers.forEach(clearTimeout);
  previewTimers = [];
}

// ------------------------------------------------------------------ parameters
const ctl = {
  key: $('#p-key'), scale: $('#p-scale'),
  tone: $('#p-tone'), space: $('#p-space'), echo: $('#p-echo'), release: $('#p-release'), volume: $('#p-volume'),
};
const outs = { tone: $('#o-tone'), space: $('#o-space'), echo: $('#o-echo'), release: $('#o-release'), volume: $('#o-volume') };
const RANGES = ['tone', 'space', 'echo', 'release', 'volume'];
const fmtParam = (n, v) => (n === 'tone' ? fmtHz(toneHz(v)) : n === 'release' ? fmtSec(releaseSec(v)) : fmtPct(v));

function paintRange(n) {
  const el = ctl[n];
  const v = state[n];
  el.value = String(Math.round(v * 100));
  el.style.setProperty('--val', el.value + '%');
  const txt = fmtParam(n, v);
  outs[n].textContent = txt;
  el.setAttribute('aria-valuetext', txt);
}

function syncControls() {
  ctl.key.value = String(state.key);
  ctl.scale.value = state.scale;
  RANGES.forEach(paintRange);
  const oct = $(`input[name="octave"][value="${state.octave}"]`);
  if (oct) oct.checked = true;
  const wav = $(`input[name="wave"][value="${state.wave}"]`);
  if (wav) wav.checked = true;
}

function applyParams() { ['wave', 'tone', 'space', 'echo', 'release', 'volume'].forEach((n) => synth.setParam(n)); }

function relabel() {
  pads.forEach((pad, i) => {
    const midi = degMidi(i);
    const note = noteName(midi);
    pad.querySelector('.pad-note').textContent = note;
    pad.style.setProperty('--hue', pcHue(midi % 12));
    pad.setAttribute('aria-label', `${note}, key ${PAD_KEYS[i]}`);
  });
  root.style.setProperty('--hx-hue', pcHue(state.key));
}

RANGES.forEach((n) => {
  ctl[n].addEventListener('input', () => {
    state[n] = ctl[n].value / 100;
    paintRange(n);
    synth.setParam(n);
    emit('hx:state', { reason: 'param' });
  });
});
ctl.key.addEventListener('change', () => { releaseAll(); state.key = +ctl.key.value; relabel(); emit('hx:state', { reason: 'param' }); });
ctl.scale.addEventListener('change', () => { releaseAll(); state.scale = ctl.scale.value; relabel(); emit('hx:state', { reason: 'param' }); });
$$('input[name="octave"]').forEach((r) => r.addEventListener('change', () => {
  if (!r.checked) return;
  releaseAll(); state.octave = +r.value; relabel(); emit('hx:state', { reason: 'param' });
}));
$$('input[name="wave"]').forEach((r) => r.addEventListener('change', () => {
  if (!r.checked) return;
  state.wave = r.value; synth.setParam('wave'); emit('hx:state', { reason: 'param' });
}));

function stepOctave(d) {
  const next = Math.max(-1, Math.min(1, state.octave + d));
  if (next === state.octave) { announce(`Octave ${fmtOct(next)} is the limit.`); return; }
  releaseAll();
  state.octave = next;
  syncControls();
  relabel();
  emit('hx:state', { reason: 'param' });
  announce(`Octave ${fmtOct(next)}.`);
}
const fmtOct = (o) => (o > 0 ? '+' + o : o < 0 ? '−' + Math.abs(o) : '0');

function stepScale(d) {
  const i = SCALE_ORDER.indexOf(state.scale);
  state.scale = SCALE_ORDER[(i + d + SCALE_ORDER.length) % SCALE_ORDER.length];
  releaseAll();
  syncControls();
  relabel();
  emit('hx:state', { reason: 'param' });
  announce(`Scale: ${NOTE_NAMES[state.key]} ${SCALES[state.scale].label}.`);
}

// rail toggle (tablet / phone)
const railBtn = $('.rail-toggle');
railBtn.addEventListener('click', () => {
  const open = railBtn.getAttribute('aria-expanded') !== 'true';
  railBtn.setAttribute('aria-expanded', String(open));
  $('.rail').classList.toggle('is-open', open);
});

// patches
let previewTimers = [];
function loadPatch(i, preview = false) {
  const p = PATCHES[i];
  if (!p) return;
  stopPhrase();
  releaseAll();
  Object.assign(state, p.params);
  syncControls();
  applyParams();
  relabel();
  emit('hx:state', { reason: 'patch', patch: i });
  announce(`Patch ${p.code}, ${p.name}, loaded: ${NOTE_NAMES[state.key]} ${SCALES[state.scale].label}.`);
  if (preview && ensureAudio()) {
    previewTimers.forEach(clearTimeout);
    previewTimers = [0, 2, 4, 7].map((d, k) => setTimeout(() => blip('pp' + k, mtof(degMidi(d)), 1.2), k * 150));
  }
}

// ------------------------------------------------------------------ HUD + kinetic type
function flip(el, text) {
  el.textContent = text;
  if (isReduced()) return;
  el.classList.remove('flip');
  void el.offsetWidth;
  el.classList.add('flip');
}
function hud(midi, iv) {
  flip(hudEl.note, noteName(midi));
  hudEl.hz.textContent = mtof(midi).toFixed(2);
  hudEl.iv.textContent = `${iv.short} ${iv.a}:${iv.b}`;
  hudEl.voices.textContent = String(held.size);
}

const hitTimers = new Map();
function flashLetter(midi, hue) {
  if (!letters.length) return;
  const el = letters[midi % letters.length];
  el.style.setProperty('--hit', hue);
  el.classList.add('is-hit');
  clearTimeout(hitTimers.get(el));
  hitTimers.set(el, setTimeout(() => el.classList.remove('is-hit'), 140));
}

const kinBins = letters.map((_, i) => 80 * Math.pow(5000 / 80, i / Math.max(1, letters.length - 1)));
const lifts = new Float32Array(letters.length);
const shown = new Float32Array(letters.length);
let lastAmp = 0;
function kinetic(dt, data) {
  if (isReduced() || !letters.length) return;
  let rms = 0;
  if (data) {
    const f = data.f;
    const nyq = data.rate / 2;
    for (let i = 0; i < letters.length; i++) {
      const bin = Math.min(f.length - 1, Math.round((kinBins[i] / nyq) * f.length));
      const v = Math.max(0, (f[bin] / 255 - 0.3) / 0.7);
      lifts[i] = Math.max(v, lifts[i] - dt * 1.6);
    }
    const t = data.t;
    let s = 0;
    for (let j = 0; j < t.length; j += 4) s += t[j] * t[j];
    rms = Math.sqrt(s / (t.length / 4));
  } else {
    for (let i = 0; i < letters.length; i++) lifts[i] = Math.max(0, lifts[i] - dt * 1.6);
  }
  for (let i = 0; i < letters.length; i++) {
    const v = lifts[i];
    if (Math.abs(v - shown[i]) < 0.004) continue;
    shown[i] = v;
    letters[i].style.transform = v > 0.003 ? `translate3d(0,${(-v * 0.16).toFixed(3)}em,0) scaleY(${(1 + v * 0.16).toFixed(3)})` : '';
  }
  const amp = Math.min(1, rms * 4);
  if (Math.abs(amp - lastAmp) > 0.01 || (amp === 0 && lastAmp !== 0)) {
    lastAmp = amp;
    kin.style.setProperty('--amp', amp.toFixed(3));
  }
}

function onReducedChange() {
  if (isReduced()) {
    letters.forEach((el, i) => { el.style.transform = ''; shown[i] = 0; lifts[i] = 0; });
    if (kin) kin.style.setProperty('--amp', '0');
  }
  if (field) field.setReduced(isReduced());
  emit('hx:reduced', { reduced: isReduced() });
}
if (reducedMQ.addEventListener) reducedMQ.addEventListener('change', onReducedChange);
else if (reducedMQ.addListener) reducedMQ.addListener(onReducedChange);

// ------------------------------------------------------------------ boot
syncControls();
relabel();
updatePower();
if (!audioSupported) {
  const p = $('.stage-noaudio');
  if (p) p.hidden = false;
}

initSections({
  state,
  synth,
  ensureAudio,
  blip,
  announce,
  loadPatch,
  isReduced,
  emit,
});
emit('hx:state', { reason: 'init' });
