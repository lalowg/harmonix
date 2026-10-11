# HARMONIX — See the Sound

A playable audio-visual instrument for the browser. Sixteen pads drive a Web Audio synthesiser, and a Canvas 2D stage turns every note into light: a colour for its pitch, a Lissajous figure for its interval, a wave through a perspective field of spectrum lines.

**Production URL:** `https://harmonix-one.vercel.app`

---

## Concept

HARMONIX is a fictional instrument maker. Its product concept is the HX-16, a sixteen-pad *visual synthesiser*, and this site is the browser edition of that instrument. There is no marketing hero sitting in front of the product: the first screen **is** the instrument. Everything below it explains how it works, and each explanation is something you can play.

## Brand and positioning

- **Name / line:** HARMONIX — *See the Sound.*
- **Positioning:** an instrument, not an app. It is precise and technical, but also tactile and a bit poetic. The copy talks like a well-made manual: what each stage does, with real numbers taken from the engine (8 ms attack, +7 cents detune, 3.4 s impulse, FFT 2048).
- **Honesty rules:** the HX-16 hardware is labelled as a fictional concept, the early-access form says plainly that nothing is sent, and the interval plate is labelled illustrative. There are no invented clients, metrics or testimonials.

## Audience

Electronic musicians and live-visual performers, sound-curious designers, and teachers who want to *show* what an interval or a filter does. Also anyone who lands on the page and just wants to press something.

## Art direction

- **Dark instrument UI:** void `#05050A`, white `#F0F0F5`, hairline rules at 12 % and 24 % white, square 2–3 px corners, printed-panel details (hairline scales on pads, LED on the power button, a live readout strip).
- **Spectrum lines:** the only colour comes from sound. Pitch classes are mapped around the **circle of fifths** (C red → G orange → D yellow … F rose), so consonant chords read as neighbouring hues. The same mapping is used everywhere: pads, glyphs, spectrum bars, interval rows, the wheel, keycaps and patch labels.
- **Imagery** is all generated: canvas field and figures, SVG signal-path diagrams, oscilloscope plates, the pitch wheel, patch waveforms and a full keyboard map. A static SVG film grain sits over everything.
- **Motif:** stacked hairlines (the "spectrum lines") as section dividers, ticker strokes and the mobile menu background.

## Typography

- **Display:** Major Mono Display (400). Its mixed-case monospaced forms suit lowercase headings (`see the sound`, `every interval has a shape`). Headings are sized from the font's measured 0.74 em advance, so the longest word always fits at 360 px. No heading ever breaks mid-word.
- **Text / UI:** Sometype Mono (400, 500, 700, italic 400). It is used for body copy, labels, readouts and tabular numbers.

## Motion language

Motion is caused by sound, not by the timeline.

- **Field:** 40 perspective lines (24 on phones) with hidden-line occlusion. Each sounding voice ripples the lines near its depth (low notes near, high notes far), and the analyser's real waveform, phase-locked like a scope, is mixed in.
- **Figures:** each note blooms a Lissajous figure from its just-intonation ratio to the root, rising from the pad you hit along a short beam. It turns at a rate set by the equal-temperament error, then fades with the note's release.
- **Spectrum skyline:** bars rising from the horizon, each coloured by the pitch class of its frequency.
- **Kinetic title:** the letters of *see the sound* lift with their frequency band, the title splits into red and blue as the level rises, and the struck pitch flashes one letter in its colour.
- **Tuned headings:** section titles scramble through glyphs and resolve once, like a receiver locking on. The monospaced font keeps the layout still while they do.
- **Signal path:** a packet travels down a sticky diagram and each stage's waveform draws itself on.
- **Interval plate:** figures morph point by point between ratios, and drift slowly in equal temperament.
- **Wheel:** the pitch wheel rotates the played note under its pointer.
- **Ticker:** the ticker is scroll-linked and never plays on its own.

## Signature interaction — how to play

1. **Touch, click or type.** The sixteen pads sit in one row on desktop and in a 4 × 4 grid on phones, with the lowest note bottom-left. Keyboard: `Z X C V` / `A S D F` / `Q W E R` / `1 2 3 4`, with the bottom keyboard row as the lowest pads. Keys follow physical positions, so AZERTY and QWERTZ work too.
2. **Chords and glides:** press with several fingers, or slide across pads to glide between notes.
3. **Transport:** *Start audio / Pause / Resume* (`P`), *Mute* (`M`, the visuals keep listening), *Hold* (notes ring until pressed again), *Play a phrase* (a short demo that you start yourself) and *Reset* (`0`). `Esc` releases every note.
4. **Parameters:** Key, Scale (major pentatonic, Dorian, Lydian, Hirajoshi, whole tone), Octave (`-` / `=`), Wave (sine, triangle, saw, square), Tone, Space, Echo, Release and Volume. Use `,` / `.` to step through scales.
5. **Elsewhere on the page:** click an interval to hear it and see its figure (switch between equal and just tuning to watch the drift stop). Click a note on the colour wheel, or *Play the scale*. Use *Load & hear* on a patch.

Sound **never** starts on its own. The `AudioContext` is created only inside a user gesture: a pad, a key or a button.

## Tech

- Static HTML, CSS and native ES modules. There is no build step and no framework, and no libraries besides Google Fonts.
- `theory.js`: scales, pitch-to-colour mapping, interval ratios, parameter curves, patches and the phrase. It has no DOM access.
- `audio.js`: Web Audio engine. Each voice has 2 oscillators (+7¢), a low-pass with an envelope, an amplitude envelope and a stereo position. A bus feeds dry, convolution reverb (impulse generated at start-up) and a filtered feedback delay, then a compressor, an analyser (before the master gain, so mute keeps the visuals alive), master gain and output. Up to 12 voices, with oldest-voice stealing.
- `field.js`: Canvas 2D renderer for the field, skyline and figures. DPR is capped (2 desktop, 1.5 phones), and phones get fewer lines, points and bars.
- `main.js`: pads (pointer events, multi-touch, glide, pointer capture), keyboard map, transport, parameters, HUD and kinetic type.
- `sections.js`: navigation, tuned headings, signal path, interval plate, colour wheel, patch track, keyboard map, ticker and form.
- Total hand-written JS is about 70 KB unminified.

## Local development

```bash
npx serve .
```

Then open the printed URL. ES modules need to be served over HTTP; opening the file directly won't work.

## Accessibility

- Semantic landmarks, one `h1`, a skip link, and visible `:focus-visible` rings on everything.
- Every pad is a real `<button>` with a live label (for example "F#3, key C"). It plays with Enter or Space while focused, and assistive-tech clicks play a short note. Every canvas interaction has a button or keyboard equivalent.
- The parameters are native `select`, radio and range controls, with `aria-valuetext` readouts. Status changes (muted, paused, patch loaded, reset) go to a polite live region. Notes themselves are not announced, so it doesn't get chatty.
- Tuned headings keep their real text in a visually hidden span. The animated glyphs are `aria-hidden`.
- The mobile menu makes the rest of the page `inert` and closes with `Esc`.
- **`prefers-reduced-motion: reduce`:** no idle drift, blinking cursor, kinetic lift, beams, ripples, figure spin, scroll ticker or heading scramble. The canvas renders only while something is sounding, and every interaction still works.
- The form uses inline, linked error messages (`aria-invalid`, `aria-describedby`). On success it says clearly that nothing was sent.

## Performance

- One 2D canvas. Its loop pauses when the hero is offscreen (IntersectionObserver), when the tab is hidden, while paused, and when idle under reduced motion.
- The interval plate animates only while visible and moving.
- Repeated SVG art (signal waveforms, wheel, patch art, keyboard map) is pre-generated into the HTML.
- Fonts load with `display=swap`. Grain is a tiny inline SVG. There are no images or external scripts.

## Known limitations

- iOS mutes Web Audio when the ringer switch is on silent. Safari 17+ is asked to treat the page as media playback (`navigator.audioSession`), but older iOS versions stay silent until the switch is flipped.
- Glide across pads is turned off while Hold is on, so a slide doesn't toggle a dozen notes.
- On touch screens, a drag that starts on the pads plays notes instead of scrolling. Scroll from anywhere outside the pad grid.
- The ring rotation uses a registered custom property (`@property`). Browsers without it jump straight to the new angle.
- The HX-16 hardware, its "early access list" and the brand are fictional. The interval figures are illustrative, not measurements.

## Files

`index.html`, `style.css`, `main.js`, `sections.js`, `field.js`, `audio.js`, `theory.js`, `logo.svg`, `favicon.svg`, `README.md`.

## Credit

Designed & built by Saad Bashir — https://www.linkedin.com/in/saadbashirmarketing/

Fictional concept brand — portfolio project.
