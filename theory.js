// HARMONIX — shared music theory, colour mapping and instrument data.
// Pure module: no DOM access, so it is also used by the authoring scripts.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALES = {
  pentatonic: { label: 'major pentatonic', steps: [0, 2, 4, 7, 9] },
  dorian: { label: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  lydian: { label: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
  hirajoshi: { label: 'Hirajoshi', steps: [0, 2, 3, 7, 8] },
  wholetone: { label: 'whole tone', steps: [0, 2, 4, 6, 8, 10] },
};
export const SCALE_ORDER = ['pentatonic', 'dorian', 'lydian', 'hirajoshi', 'wholetone'];

export const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];
export const WAVE_LABEL = { sine: 'Sine', triangle: 'Triangle', sawtooth: 'Saw', square: 'Square' };

export const DEFAULTS = {
  key: 2, // D
  scale: 'pentatonic',
  octave: 0,
  wave: 'triangle',
  tone: 0.55,
  space: 0.35,
  echo: 0.22,
  release: 0.42,
  volume: 0.8,
};

export const MAX_VOICES = 12;
export const BASE_MIDI = 48; // C3 — pad 1 sits at key + octave above this

// Pads are numbered lowest → highest. Keys follow physical positions (KeyboardEvent.code),
// bottom keyboard row = lowest pads, exactly like the 4 × 4 grid on screen.
export const PAD_KEYS = ['Z', 'X', 'C', 'V', 'A', 'S', 'D', 'F', 'Q', 'W', 'E', 'R', '1', '2', '3', '4'];
export const PAD_CODES = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'Digit1', 'Digit2', 'Digit3', 'Digit4'];

// Interval names with just-intonation ratios (used for the Lissajous figures).
export const INTERVALS = [
  { st: 0, name: 'unison', short: 'unison', ratio: [1, 1] },
  { st: 1, name: 'minor second', short: 'min 2nd', ratio: [16, 15] },
  { st: 2, name: 'major second', short: '2nd', ratio: [9, 8] },
  { st: 3, name: 'minor third', short: 'min 3rd', ratio: [6, 5] },
  { st: 4, name: 'major third', short: '3rd', ratio: [5, 4] },
  { st: 5, name: 'perfect fourth', short: '4th', ratio: [4, 3] },
  { st: 6, name: 'tritone', short: 'tritone', ratio: [7, 5] },
  { st: 7, name: 'perfect fifth', short: '5th', ratio: [3, 2] },
  { st: 8, name: 'minor sixth', short: 'min 6th', ratio: [8, 5] },
  { st: 9, name: 'major sixth', short: '6th', ratio: [5, 3] },
  { st: 10, name: 'minor seventh', short: 'min 7th', ratio: [9, 5] },
  { st: 11, name: 'major seventh', short: '7th', ratio: [15, 8] },
];

// Intervals featured in the "every interval has a shape" index.
export const INTERVAL_ROWS = [0, 2, 3, 4, 5, 7, 9, 11, 12];

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const pcOf = (m) => ((Math.round(m) % 12) + 12) % 12;
export const noteName = (m) => NOTE_NAMES[pcOf(m)] + (Math.floor(Math.round(m) / 12) - 1);

// Colour follows the circle of fifths: C red, G orange, D yellow … F rose.
export const fifthsIndex = (pc) => (pc * 7) % 12;
export const pcHue = (pc) => fifthsIndex(pc) * 30;
export const hueLight = (h) => (h >= 200 && h <= 290 ? 71 : h >= 150 && h < 200 ? 58 : 63);
export const hsla = (h, a = 1, dl = 0) => `hsla(${h},92%,${hueLight(h) + dl}%,${a})`;

export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a || 1;
}

export function intervalFor(semis) {
  const s = Math.max(0, Math.round(semis));
  const oct = Math.floor(s / 12);
  const st = s % 12;
  const iv = INTERVALS[st];
  let a = iv.ratio[0] * Math.pow(2, oct);
  let b = iv.ratio[1];
  const g = gcd(a, b); a /= g; b /= g;
  let name = iv.name;
  let short = iv.short;
  if (oct > 0 && st === 0) {
    name = oct === 1 ? 'octave' : `${oct} octaves`;
    short = oct === 1 ? 'octave' : `${oct} oct`;
  } else if (oct > 0) {
    name = `${iv.name} + ${oct === 1 ? 'octave' : oct + ' octaves'}`;
    short = `${iv.short} +${oct} oct`;
  }
  // Equal temperament minus just intonation, in cents.
  const cents = st * 100 - 1200 * Math.log2(iv.ratio[0] / iv.ratio[1]);
  return { st, oct, name, short, a, b, cents };
}

export const rootMidi = (s) => BASE_MIDI + s.key + 12 * s.octave;
export function degreeMidi(deg, s) {
  const steps = SCALES[s.scale].steps;
  const n = steps.length;
  return rootMidi(s) + steps[deg % n] + 12 * Math.floor(deg / n);
}
export const scalePcs = (s) => SCALES[s.scale].steps.map((x) => (s.key + x) % 12);

// Parameter mappings shared by the engine and the readouts.
export const toneHz = (t) => 220 * Math.pow(9000 / 220, t);
export const releaseSec = (r) => 0.12 * Math.pow(5 / 0.12, r);
export const fmtHz = (hz) => (hz >= 1000 ? (hz / 1000).toFixed(1) + ' kHz' : Math.round(hz) + ' Hz');
export const fmtSec = (s) => (s < 1 ? s.toFixed(2) : s.toFixed(1)) + ' s';
export const fmtPct = (v) => Math.round(v * 100) + '%';

export function lissajous(a, b, delta, n = 600) {
  const out = new Float32Array((n + 1) * 2);
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI * 2;
    out[i * 2] = Math.sin(a * th + delta);
    out[i * 2 + 1] = Math.sin(b * th);
  }
  return out;
}

export const PATCHES = [
  {
    code: 'P-01', name: 'night glass',
    blurb: 'Slow sine bells in a wide room. Hold three pads and let them ring into each other.',
    params: { key: 2, scale: 'pentatonic', octave: 0, wave: 'sine', tone: 0.62, space: 0.72, echo: 0.18, release: 0.82 },
  },
  {
    code: 'P-02', name: 'brass dust',
    blurb: 'A low, filtered saw in Dorian. Short notes, a dry room and a dark edge.',
    params: { key: 9, scale: 'dorian', octave: -1, wave: 'sawtooth', tone: 0.36, space: 0.28, echo: 0.32, release: 0.34 },
  },
  {
    code: 'P-03', name: 'pulse garden',
    blurb: 'Square waves in Lydian with a long echo. Tap quickly; the repeats do the rest.',
    params: { key: 5, scale: 'lydian', octave: 0, wave: 'square', tone: 0.48, space: 0.24, echo: 0.62, release: 0.24 },
  },
  {
    code: 'P-04', name: 'paper rain',
    blurb: 'Bright triangle plucks in Hirajoshi. Sparse, open and a little melancholic.',
    params: { key: 4, scale: 'hirajoshi', octave: 0, wave: 'triangle', tone: 0.72, space: 0.52, echo: 0.44, release: 0.5 },
  },
  {
    code: 'P-05', name: 'drift',
    blurb: 'Whole-tone sines with a five-second tail. Nothing resolves, by design.',
    params: { key: 0, scale: 'wholetone', octave: 1, wave: 'sine', tone: 0.8, space: 0.86, echo: 0.5, release: 1 },
  },
];

// A short phrase played by "Play a phrase": [start s, pad degrees, duration s].
// Written in scale degrees, so it re-harmonises itself for every scale and key.
export const PHRASE = [
  [0.0, [0, 4], 0.9], [0.5, [7], 0.4], [0.9, [9], 0.4], [1.3, [11], 0.5],
  [1.8, [9], 0.4], [2.2, [2, 7], 0.7], [3.0, [8], 0.4], [3.4, [12], 0.8],
  [4.3, [0, 4, 7], 1.6], [6.1, [14], 0.4], [6.5, [11], 0.4], [6.9, [9], 0.4],
  [7.4, [0, 7, 12], 2.2],
];
