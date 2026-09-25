/* Synthesized audio (Web Audio API) - engine, wind, nitro, effects and a music loop. */
(() => {
'use strict';
const SD = (window.SD ||= {});
let ac = null;
let master, sfxBus, musicBus, noiseBuf;
let eng = null;
let musicTimer = null;
let nextNote = 0;
let step = 0;
const on = { sfx: true, music: true };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function init() {
  if (ac) {
    if (ac.state === 'suspended') ac.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = 0.85;
  master.connect(ac.destination);
  sfxBus = ac.createGain();
  sfxBus.gain.value = on.sfx ? 1 : 0;
  sfxBus.connect(master);
  musicBus = ac.createGain();
  musicBus.gain.value = on.music ? 0.45 : 0;
  musicBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ac.createBufferSource(); // iOS unlock
  s.buffer = ac.createBuffer(1, 1, 22050);
  s.connect(ac.destination);
  s.start(0);
}

function tone(freq, dur, o = {}) {
  if (!ac) return;
  const t = ac.currentTime + (o.delay || 0);
  const osc = ac.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(o.bus || sfxBus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(dur, o = {}) {
  if (!ac) return;
  const t = ac.currentTime + (o.delay || 0);
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = o.type || 'lowpass';
  f.frequency.setValueAtTime(o.freq || 1000, t);
  if (o.slide) f.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
  f.Q.value = o.q || 1;
  const g = ac.createGain();
  g.gain.setValueAtTime(o.vol || 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(o.bus || sfxBus);
  src.start(t, Math.random() * 0.8);
  src.stop(t + dur + 0.05);
}

function loopNoise(type, freq, q) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.value = 0;
  src.connect(f);
  f.connect(g);
  g.connect(sfxBus);
  src.start();
  return { src, f, g };
}

/* ------------------------------------------------------------------ engine */
function engineOn() {
  if (!ac || eng) return;
  const o1 = ac.createOscillator();
  const o2 = ac.createOscillator();
  o1.type = 'sawtooth';
  o2.type = 'square';
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  lp.Q.value = 3;
  const g = ac.createGain();
  g.gain.value = 0;
  o1.connect(lp);
  o2.connect(lp);
  lp.connect(g);
  g.connect(sfxBus);
  o1.start();
  o2.start();
  eng = { o1, o2, lp, g, wind: loopNoise('bandpass', 700, 0.7), nitro: loopNoise('bandpass', 1400, 1.5) };
}

function engineOff() {
  if (!eng) return;
  const e = eng;
  eng = null;
  const t = ac.currentTime;
  for (const g of [e.g, e.wind.g, e.nitro.g]) g.gain.setTargetAtTime(0, t, 0.05);
  setTimeout(() => {
    try {
      e.o1.stop();
      e.o2.stop();
      e.wind.src.stop();
      e.nitro.src.stop();
    } catch (err) { /* already stopped */ }
  }, 400);
}

// pct ~0..1.3 of top speed; air: airborne; wind 0..1
function engine(pct, gas, nitro, air, wind) {
  if (!eng) return;
  const t = ac.currentTime;
  const gears = 5;
  const gp = Math.min(pct, 1.4) * gears;
  const gear = Math.min(gears - 1, Math.floor(gp));
  const r = air ? 0.9 : gp - gear;
  const f = 40 + gear * 9 + r * 62 + (nitro ? 18 : 0) + (air && gas ? 30 : 0);
  eng.o1.frequency.setTargetAtTime(f, t, 0.05);
  eng.o2.frequency.setTargetAtTime(f * 0.503, t, 0.05);
  eng.lp.frequency.setTargetAtTime(420 + pct * 1300 + (gas ? 500 : 0), t, 0.06);
  eng.g.gain.setTargetAtTime(0.04 + (gas ? 0.03 : 0) + Math.min(pct, 1) * 0.025, t, 0.08);
  eng.wind.g.gain.setTargetAtTime(wind * 0.16, t, 0.1);
  eng.wind.f.frequency.setTargetAtTime(400 + wind * 900, t, 0.1);
  eng.nitro.g.gain.setTargetAtTime(nitro ? 0.12 : 0, t, 0.06);
}

/* ------------------------------------------------------------------ effects */
const sfx = {
  click() { tone(760, 0.06, { type: 'triangle', vol: 0.08 }); },
  count(n) { tone(n > 0 ? 523 : 1047, n > 0 ? 0.2 : 0.5, { type: 'square', vol: 0.08 }); },
  land(strength) {
    noise(0.25, { vol: 0.15 + Math.min(0.4, strength * 0.02), freq: 500, slide: 90 });
    tone(80, 0.18, { type: 'sine', vol: 0.12 + Math.min(0.2, strength * 0.01), slide: 40 });
  },
  trick(level) {
    const base = 660 * Math.pow(1.12, Math.min(level, 8));
    tone(base, 0.12, { type: 'square', vol: 0.06 });
    tone(base * 1.5, 0.22, { type: 'triangle', vol: 0.1, delay: 0.07 });
  },
  perfect() { [880, 1109, 1319, 1760].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.09, delay: i * 0.05 })); },
  crash() {
    noise(0.6, { vol: 0.55, freq: 1200, slide: 100 });
    tone(120, 0.4, { type: 'square', vol: 0.1, slide: 40 });
  },
  wall() { noise(0.12, { vol: 0.25, freq: 2500, type: 'bandpass', q: 2 }); },
  ring() { [1047, 1568, 2093].forEach((f, i) => tone(f, 0.2, { type: 'sine', vol: 0.12, delay: i * 0.06 })); },
  star() { tone(1568, 0.08, { type: 'triangle', vol: 0.08 }); tone(2093, 0.12, { type: 'sine', vol: 0.08, delay: 0.05 }); },
  pad() { noise(0.5, { vol: 0.25, type: 'bandpass', freq: 400, slide: 3500, q: 2 }); },
  checkpoint() { tone(988, 0.1, { type: 'square', vol: 0.06 }); tone(1319, 0.18, { type: 'square', vol: 0.06, delay: 0.09 }); },
  whoosh() { noise(0.4, { vol: 0.2, type: 'bandpass', freq: 2500, slide: 300, q: 1.5 }); },
  finish(win) {
    const seq = win ? [523, 659, 784, 1047, 784, 1047] : [523, 659, 784];
    seq.forEach((f, i) => tone(f, i === seq.length - 1 ? 0.6 : 0.2, { type: 'square', vol: 0.08, delay: i * 0.12 }));
  },
};

/* ------------------------------------------------------------------ music */
// Driving Am - F - C - G loop at 128 bpm.
const BPM = 128;
const EIGHTH = 60 / BPM / 2;
const BASS = [45, 41, 48, 43];
const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
const LEAD = [
  69, 0, 72, 0, 76, 0, 74, 72,
  72, 0, 69, 0, 65, 0, 0, 0,
  67, 0, 72, 0, 76, 0, 79, 76,
  74, 0, 0, 71, 74, 0, 0, 0,
  69, 0, 72, 0, 76, 0, 81, 79,
  77, 0, 76, 0, 72, 0, 0, 0,
  76, 0, 79, 0, 84, 0, 83, 79,
  79, 0, 0, 0, 74, 0, 71, 0,
];
const LEAD_LEN = LEAD.map((m, i) => {
  if (!m) return 0;
  let n = 1;
  while (i + n < LEAD.length && !LEAD[i + n] && n < 4) n++;
  return n;
});

function playStep(i, t) {
  const bar = Math.floor(i / 8) % 4;
  const s = i % 8;
  const d = t - ac.currentTime;
  const o = { bus: musicBus, delay: d };
  tone(mtof(BASS[bar] - (s % 2 ? 0 : 12)), EIGHTH * 0.8, { ...o, type: 'sawtooth', vol: 0.06 });
  if (s === 0 || s === 3 || s === 6) {
    const ch = CHORDS[bar];
    for (const n of ch) tone(mtof(n + 12), EIGHTH * 1.6, { ...o, type: 'triangle', vol: 0.025 });
  }
  if (s === 0 || s === 4) tone(160, 0.14, { ...o, type: 'sine', vol: 0.3, slide: 45 });
  if (s === 2 || s === 6) noise(0.12, { ...o, type: 'bandpass', freq: 1800, vol: 0.09 });
  noise(0.035, { ...o, type: 'highpass', freq: 8000, vol: s % 2 ? 0.04 : 0.025 });
  const m = LEAD[i];
  if (m) tone(mtof(m), EIGHTH * LEAD_LEN[i] * 0.9, { ...o, type: 'square', vol: 0.035, attack: 0.01 });
}

function schedule() {
  if (!ac || ac.state !== 'running') return;
  if (nextNote < ac.currentTime) nextNote = ac.currentTime + 0.05;
  while (nextNote < ac.currentTime + 0.15) {
    playStep(step, nextNote);
    nextNote += EIGHTH;
    step = (step + 1) % 64;
  }
}

function musicStart() {
  if (!ac || musicTimer) return;
  nextNote = ac.currentTime + 0.1;
  step = 0;
  musicTimer = setInterval(schedule, 30);
}

function setSfx(v) {
  on.sfx = v;
  if (sfxBus) sfxBus.gain.setTargetAtTime(v ? 1 : 0, ac.currentTime, 0.02);
}

function setMusic(v) {
  on.music = v;
  if (!ac) return;
  musicBus.gain.setTargetAtTime(v ? 0.45 : 0, ac.currentTime, 0.05);
  if (v) musicStart();
  else {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

function suspend() { if (ac && ac.state === 'running') ac.suspend(); }
function resume() { if (ac && ac.state === 'suspended') ac.resume(); }

SD.audio = { init, engineOn, engineOff, engine, sfx, setSfx, setMusic, suspend, resume };
})();
