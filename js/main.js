/* Speed Demons - boot, race flow, camera, effects, HUD, menus, garage and portal hooks. */
(() => {
'use strict';
const SD = (window.SD ||= {});
const Audio = SD.audio;
const platform = SD.platform;
const eco = SD.economy;
const { clamp, damp, rand, formatTime, suffix, escapeHtml } = SD.util;
const { buildTrackMesh } = SD.track;
const { THEMES, WORLDS, TRACKS, buildTrack } = SD.tracks;
const { CAR_TYPES, COLORS, CarModel } = SD.cars;
const { World } = SD.world;
const { Weather } = SD.weather;
const { Particles } = SD.fx;
const { PlayerCar, AiCar, collide, separateAis } = SD.physics;
const { Input } = SD.input;

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const IDLE = { steer: 0, gas: false, brake: false, nitro: false, pitch: 0, roll: 0 };
const save = eco.save; // filled in boot(), after the platform SDK is ready
const persist = eco.persist;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const coinHtml = (n) => `<span class="coin-ico"></span>${fmt(n)}`;

/* ====================================================================== renderer & scene */
const input = new Input();
const QUALITY = {
  high: { label: 'High', ratio: 2, shadows: true, shadowSize: 2048 },
  medium: { label: 'Medium', ratio: 1.5, shadows: true, shadowSize: 1024 },
  low: { label: 'Low', ratio: 1, shadows: false, shadowSize: 512 },
};
const QUALITY_ORDER = ['high', 'medium', 'low'];
let quality = input.touchUI ? 'medium' : 'high';

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !input.touchUI, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3200);
const world = new World(scene, renderer);
const weather = new Weather(scene);
weather.onLightning = (k) => world.lightning(k);
weather.onThunder = (delay) => Audio.sfx.thunder(delay);
const smoke = new Particles(500, false);
const glow = new Particles(700, true);
scene.add(smoke.points, glow.points);

const view = { w: 0, h: 0, winW: 0, winH: 0, baseFov: 62 };
function resize() {
  view.winW = window.innerWidth;
  view.winH = window.innerHeight;
  updateLandscape();
  const w = Math.max(1, view.w);
  const h = Math.max(1, view.h);
  const q = QUALITY[quality];
  const maxPixels = input.touchUI ? 2.2e6 : 4.5e6;
  const ratio = Math.min(window.devicePixelRatio || 1, q.ratio, Math.sqrt(maxPixels / (w * h)));
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  const aspect = w / h;
  camera.aspect = aspect;
  view.baseFov = aspect < 1 ? 82 : aspect < 1.45 ? 70 : 62;
  camera.updateProjectionMatrix();
  for (const p of [smoke, glow]) p.setScale(h * ratio, camera.fov);
  weather.setScale(h * ratio, camera.fov);
}

// Touch devices always play in landscape. Held upright, the page is turned sideways with CSS
// (body.force-landscape), so the game area is the viewport with width and height swapped.
function updateLandscape() {
  const rotate = input.touchUI && view.winH > view.winW;
  document.body.classList.toggle('force-landscape', rotate);
  input.rotated = rotate;
  view.w = rotate ? view.winH : view.winW;
  view.h = rotate ? view.winW : view.winH;
  const root = document.documentElement.style;
  root.setProperty('--app-w', view.w + 'px');
  root.setProperty('--app-h', view.h + 'px');
}

function applyQuality() {
  const q = QUALITY[quality];
  world.setShadows(q.shadows, q.shadowSize);
  resize();
}

/* ====================================================================== game state */
const RIVALS = [
  { name: 'Blaze', color: '#ff8a00' },
  { name: 'Nova', color: '#3a86ff' },
  { name: 'Dash', color: '#2ec4b6' },
  { name: 'Viper', color: '#8338ec' },
];
// Rival cars per world - they get flashier as you progress (their pace comes from the track).
const RIVAL_CARS = [
  ['muscle', 'racer', 'buggy', 'kart'],
  ['muscle', 'racer', 'buggy', 'monster'],
  ['formula', 'monster', 'buggy', 'muscle'],
  ['hyper', 'formula', 'muscle', 'monster'],
  ['rally', 'monster', 'buggy', 'hotrod'],
  ['rally', 'formula', 'hotrod', 'monster'],
  ['rocket', 'hyper', 'hotrod', 'formula'],
];

const S = {
  mode: 'loading', // loading | menu | countdown | race | finished
  paused: false,
  adPause: false,
  starting: false,
  raced: false, // a race was started this session (ad breaks only between races)
  screen: null,
  trackIdx: -1,
  def: null,
  theme: null,
  track: null,
  trackView: null,
  player: null,
  playerModel: null,
  aiModels: null,
  aiWorld: -1,
  ais: [],
  all: [],
  countdown: 0,
  raceTime: 0,
  time: 0,
  finishT: 0,
  position: 5,
  resultsShown: false,
  result: null,
  doubled: false,
  shake: 0,
  camSnap: true,
  lastBump: 0,
  fovKick: 0,
  draft: false,
  airHints: 0,
  hintT: 0,
  lightLevel: 0.2, // how strongly car lights glow on this track (0 day .. 1 night)
  slowT: 0, // real seconds of slow motion left (perfect landings)
  lastPos: 5,
  testDrive: null, // car id borrowed for one race (rewarded video in the garage)
  testDriveDone: false,
};

// The car you race with: your own, or one you're test driving.
const raceCar = () => S.testDrive || save.car;
function endTestDrive() {
  if (S.testDrive && S.testDriveDone) {
    S.testDrive = null;
    S.testDriveDone = false;
  }
  if (S.playerModel && S.playerModel.typeId !== raceCar()) createPlayer(raceCar());
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const key of ['map', 'emissiveMap']) if (m[key]) m[key].dispose();
      m.dispose();
    }
  });
}

const worldOf = (i) => Math.max(0, WORLDS.findIndex((w) => w.theme === TRACKS[i].theme));

function loadTrack(idx) {
  if (S.trackIdx === idx && S.track) return;
  S.trackIdx = idx;
  S.def = TRACKS[idx];
  S.theme = THEMES[S.def.theme];
  S.track = buildTrack(S.def);
  if (S.trackView) {
    scene.remove(S.trackView.group);
    disposeTree(S.trackView.group);
  }
  const look = Weather.look(S.def.weather) || {};
  S.trackView = buildTrackMesh(S.track, S.theme, { anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()), wet: !!look.wet });
  scene.add(S.trackView.group);
  world.build(S.theme, S.track, { fogScale: look.fog, sunScale: look.sun, lightScale: look.light });
  weather.set(S.def.weather || 'clear');
  renderer.toneMappingExposure = S.theme.exposure || (S.theme.nightSky ? 1.2 : 1.05);
  // how strongly car lights glow: dark worlds and gloomy weather switch them fully on
  S.lightLevel = S.theme.nightSky || S.theme.env === 'volcano' || (look.sun || 1) < 0.6 ? 1 : 0.2;
  const w = worldOf(idx);
  const cars = RIVAL_CARS[w] || RIVAL_CARS[0];
  if (S.aiWorld !== w) {
    if (S.aiModels) {
      for (const m of S.aiModels) {
        scene.remove(m.root);
        disposeTree(m.root);
      }
    }
    S.aiModels = RIVALS.map((r, k) => {
      const m = new CarModel(cars[k], r.color);
      scene.add(m.root);
      m.setLights(S.lightLevel);
      return m;
    });
    S.aiWorld = w;
  }
  for (const m of S.aiModels) m.setLights(S.lightLevel);
  S.ais = RIVALS.map((r, k) => new AiCar(S.track, eco.carById(cars[k]), S.aiModels[k], r.name, 1));
  createPlayer();
}

// Build the player's car. carId lets the garage preview cars you don't drive yet.
function createPlayer(carId = raceCar()) {
  if (S.playerModel) {
    scene.remove(S.playerModel.root);
    disposeTree(S.playerModel.root);
  }
  S.playerModel = new CarModel(carId, save.color);
  S.playerModel.setLights(S.lightLevel);
  scene.add(S.playerModel.root);
  S.player = new PlayerCar(S.track, eco.carStats(carId), S.playerModel, CONFIG.playerName || 'You');
  S.player.on(onPlayerEvent);
  S.all = [S.player, ...S.ais];
  recolorRivals();
  placeGrid();
}

function recolorRivals() {
  RIVALS.forEach((r, k) => S.aiModels[k].setColor(r.color === save.color ? '#e9ecef' : r.color));
}

function placeGrid() {
  const tr = S.track;
  for (const c of tr.coins) c.taken = false;
  SD.obstacles.reset(tr);
  const base = S.def.ai || 0.85;
  const slots = [[-3, 6], [3, 6], [-3, 15], [3, 15]];
  S.ais.forEach((a, k) => {
    a.skill = base + 0.03 - k * 0.02;
    a.place(tr.startS - slots[k][1], slots[k][0]);
  });
  S.player.reset(tr.startS - 24, 0);
  S.player.update(0, IDLE);
  for (const a of S.ais) a.wasAhead = a.s > S.player.s;
  S.camSnap = true;
}

function standings() {
  return [...S.all].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.s - a.s;
  });
}

// Leaders ease off a touch, cars you've passed push harder - keeps the pack close.
function rubber(a) {
  const gap = a.s - S.player.s;
  return gap > 0 ? 1 - 0.08 * clamp(gap / 160, 0, 1) : 1 + 0.06 * clamp(-gap / 160, 0, 1);
}

/* ====================================================================== race flow */
function enterMenu(screen = 'screen-title') {
  S.mode = 'menu';
  S.paused = false;
  S.resultsShown = false;
  platform.gameplay(false);
  loadTrack(save.track);
  endTestDrive();
  placeGrid();
  input.inGame = false;
  Audio.engineOff();
  smoke.clear();
  glow.clear();
  refreshMenus();
  showScreen(screen);
  updateOverlays();
}

// withBreak: offer the portal an ad break first (between races only, never before the first).
async function startRace(withBreak = S.raced) {
  if (S.starting) return;
  S.starting = true;
  showScreen(null);
  input.inGame = false;
  Audio.engineOff();
  if (withBreak) await platform.commercialBreak();
  S.starting = false;
  S.raced = true;
  loadTrack(save.track);
  endTestDrive();
  placeGrid();
  S.mode = 'countdown';
  S.countdown = 3.6;
  S.raceTime = 0;
  S.finishT = 0;
  S.paused = false;
  S.resultsShown = false;
  S.draft = false;
  S.slowT = 0;
  S.lastPos = S.all.length;
  smoke.clear();
  glow.clear();
  for (const k in hudCache) delete hudCache[k];
  buildProgressDots();
  input.inGame = true;
  input.releaseAll();
  Audio.init();
  Audio.setEngineVoice(raceCar());
  Audio.engineOn();
  platform.gameplay(true);
  if (!save.tutorial) {
    S.airHints = 0;
    showHint(input.touchUI ? 'Hold <b>◀ ▶</b> to steer &middot; hold <b>⚡</b> for nitro' : '<kbd>↑</kbd> gas &middot; <kbd>←</kbd><kbd>→</kbd> steer &middot; <kbd>Space</kbd> nitro', 7);
  }
  updateOverlays();
}

function setPaused(v) {
  if (S.mode !== 'race' && S.mode !== 'countdown') return;
  if (S.paused === v) return;
  S.paused = v;
  input.releaseAll();
  if (v) Audio.engineOff();
  else Audio.engineOn();
  platform.gameplay(!v);
  showScreen(v ? 'screen-pause' : null);
  updateOverlays();
}

function finishRace() {
  const p = S.player;
  p.finished = true;
  p.finishTime = S.raceTime;
  p.boosting = false;
  S.mode = 'finished';
  S.finishT = 0;
  input.inGame = false;
  platform.gameplay(false);
  const pos = standings().indexOf(p) + 1;
  S.position = pos;
  const earned = [true, pos === 1, p.score >= S.def.target];
  const stars = earned.filter(Boolean).length;
  const before = { tracks: TRACKS.map((_, i) => eco.trackUnlocked(i)) };
  const prev = eco.result(S.trackIdx);
  const newStars = Math.max(0, stars - (prev.stars || 0));
  save.results[S.def.id] = {
    stars: Math.max(prev.stars || 0, stars),
    time: prev.time == null ? p.finishTime : Math.min(prev.time, p.finishTime),
    score: Math.max(prev.score || 0, p.score),
  };
  const reward = eco.raceReward({ pos, coins: p.coins, score: p.score, trackIdx: S.trackIdx, newStars });
  save.races = (save.races || 0) + 1;
  if (save.races >= 2) save.tutorial = true;
  eco.addCoins(reward.total); // also saves
  const unlocks = [];
  TRACKS.forEach((t, i) => {
    if (!before.tracks[i] && eco.trackUnlocked(i)) unlocks.push(`New track: ${t.name}`);
  });
  if (S.testDrive) {
    const t = eco.carById(S.testDrive);
    S.testDriveDone = true;
    if (!eco.owns(t.id)) unlocks.push(`Test drive over. The ${t.name} is ${fmt(t.price)} coins in the Garage`);
  }
  const affordable = CAR_TYPES.find((t) => !eco.owns(t.id) && t.price <= save.coins);
  if (affordable && !S.testDrive) unlocks.push(`You can buy the ${affordable.name} in the Garage!`);
  S.result = { pos, earned, unlocks, reward };
  S.doubled = false;
  showMsg(pos === 1 ? 'YOU WIN!' : 'FINISH!', 'hold');
  Audio.sfx.finish(pos === 1);
  if (pos === 1) platform.happytime();
  confetti();
  updateOverlays();
}

function autopilot() {
  const p = S.player;
  const past = p.s - S.track.finishS;
  return { steer: clamp(-p.d * 0.3, -1, 1), gas: past < 50, brake: past > 50 && p.v > 3, nitro: false, pitch: 0, roll: 0 };
}

function update(dt) {
  S.time += dt;
  S.track.clock = S.time; // moving obstacles run on this clock (physics and models share it)
  S.shake = Math.max(0, S.shake - dt * 1.8);
  S.fovKick = Math.max(0, S.fovKick - dt * 1.5);
  if (S.hintT > 0) {
    S.hintT -= dt;
    if (S.hintT <= 0) hud.hint.classList.remove('show');
  }
  const p = S.player;
  const tr = S.track;
  const inp = input.poll(p.mode === 'air');

  if (S.mode === 'countdown') {
    const before = Math.ceil(S.countdown);
    S.countdown -= dt;
    const after = Math.ceil(S.countdown);
    if (after !== before) {
      if (after > 0) {
        showMsg(String(after));
        Audio.sfx.count(after);
      } else {
        S.mode = 'race';
        $('btn-respawn').hidden = false;
        showMsg('GO!');
        Audio.sfx.count(0);
      }
    }
    p.update(dt, IDLE);
  } else if (S.mode === 'race') {
    p.update(dt, inp);
    S.raceTime += dt;
  } else if (S.mode === 'finished') {
    p.update(dt, autopilot());
    S.raceTime += dt;
  } else {
    p.update(dt, IDLE);
  }

  const go = S.mode === 'race' || S.mode === 'finished';
  const ctx = { go, all: S.all, rubber, onAiHit };
  for (const a of S.ais) {
    a.update(dt, ctx);
    if (go && !a.finished && a.s >= tr.finishS) {
      a.finished = true;
      a.finishTime = S.raceTime;
    }
  }
  separateAis(S.ais);

  if (S.mode === 'race') {
    collide(p, S.ais, (hit) => {
      if (hit > 2 && S.time - S.lastBump > 0.4) {
        S.lastBump = S.time;
        Audio.sfx.wall();
        S.shake = Math.max(S.shake, Math.min(0.5, hit * 0.03));
      }
    });
    // Slipstream: tuck in right behind a rival to fill your nitro.
    let drafting = false;
    if (p.mode === 'ground' && p.v > 20) {
      for (const a of S.ais) {
        const ds = a.s - p.s;
        if (ds > 4 && ds < 18 && Math.abs(a.d - p.d) < 1.8) {
          drafting = true;
          break;
        }
      }
    }
    if (drafting) {
      p.gainNitro(10 * dt);
      if (!S.draft) Audio.sfx.draft();
    }
    S.draft = drafting;
    // Close pass: overtake a rival with only a whisker between you, without touching
    // (cars that rub are pushed exactly 2 m apart by the collision code).
    for (const a of S.ais) {
      const ahead = a.s > p.s;
      const gap = Math.abs(a.d - p.d);
      if (a.wasAhead && !ahead && p.mode === 'ground' && !a.air && gap > 2.05 && gap < 3.3 && p.v - a.v > 2) {
        p.score += 100;
        p.gainNitro(8);
        popups([{ text: 'CLOSE PASS <b>+100</b>' }]);
        Audio.sfx.closeCall();
      }
      a.wasAhead = ahead;
    }
    if (p.s >= tr.finishS) finishRace();
    else {
      S.position = standings().indexOf(p) + 1;
      if (S.position < S.lastPos) {
        callout(`▲ ${S.position}${suffix(S.position)}`);
        Audio.sfx.overtake();
      }
      S.lastPos = S.position;
    }
  } else {
    S.draft = false;
  }
  if (S.mode === 'finished') {
    S.finishT += dt;
    if (!S.resultsShown && S.finishT > 3) showResults();
  }
  effects(dt);
}

/* ====================================================================== effects */
const C = (hex) => new THREE.Color(hex);
const COL = { smoke: C('#d8dce6'), dust: C('#c9b9a0'), spark: C('#ffb347'), nitro: C('#5fd0ff'), coin: C('#ffd23f'), ring: C('#fff1a8') };
const tmpV = new V3();
const tmpV2 = new V3();

function exhaustPoint(x, out) {
  const m = S.playerModel.spec;
  return out.set(x, 0.42, m.rear + 0.3).applyQuaternion(S.player.quat).add(S.player.pos);
}

function burst(pos, n, sys, color, speed, opts = {}) {
  for (let i = 0; i < n; i++) {
    tmpV2.set(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1));
    sys.emit({ pos, vel: tmpV2, color, size: opts.size || 0.5, life: rand(0.4, 0.8) * (opts.life || 1), gravity: opts.gravity ?? 6, drag: opts.drag ?? 2, grow: opts.grow || 0 });
  }
}

function effects(dt) {
  const p = S.player;
  if (!p || S.mode === 'menu') return;
  if (p.boosting) {
    for (const x of [-0.45, 0.45]) {
      exhaustPoint(x, tmpV);
      tmpV2.copy(p.fwd).multiplyScalar(-6).add(new V3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)));
      glow.emit({ pos: tmpV, vel: tmpV2, color: COL.nitro, size: 0.45, life: 0.2, drag: 3, alpha: 0.8 });
    }
  }
  if (p.mode === 'ground' && p.v > 12 && (Math.abs(p.vd) > 3.2 || Math.abs(p.heading) > 0.18)) {
    for (const x of [-0.9, 0.9]) {
      tmpV.set(x, 0.2, 1.3).applyQuaternion(p.quat).add(p.pos);
      smoke.emit({ pos: tmpV, vel: tmpV2.copy(p.up).multiplyScalar(1.5), color: COL.smoke, size: 1.2, life: 0.7, grow: 3, drag: 1.5, alpha: 0.5 });
    }
  }
}

function confetti() {
  const f = S.player;
  const colors = ['#ff3b5c', '#ffd23f', '#2ec4b6', '#3a86ff', '#ff4dc4', '#ffffff'].map(C);
  for (let i = 0; i < 160; i++) {
    tmpV.copy(f.pos).addScaledVector(f.up, rand(6, 12)).add(tmpV2.set(rand(-8, 8), 0, rand(-8, 8)));
    smoke.emit({ pos: tmpV, vel: new V3(rand(-4, 4), rand(0, 6), rand(-4, 4)), color: colors[i % colors.length], size: 0.35, life: rand(2, 3.5), gravity: 4, drag: 1.2 });
  }
}

// A rival got caught by an obstacle: sparks and a thud if it's near you.
function onAiHit(a) {
  if (Math.abs(a.s - S.player.s) > 70) return;
  burst(a.pos, 16, glow, COL.spark, 10, { size: 0.3, gravity: 14, drag: 1 });
  burst(a.pos, 8, smoke, COL.smoke, 4, { size: 1.6, grow: 3, gravity: 0, life: 1.2 });
  Audio.sfx.clang(0.5);
}

/* ====================================================================== player events */
function onPlayerEvent(type, d) {
  const p = S.player;
  switch (type) {
    case 'takeoff':
      if (!save.tutorial && S.mode === 'race' && S.airHints < 3) {
        S.airHints++;
        showHint(input.touchUI ? 'In the air: <b>⚡</b> / <b>BRAKE</b> flip &middot; <b>◀ ▶</b> spin' : 'In the air: <kbd>↑</kbd><kbd>↓</kbd> flip &middot; <kbd>←</kbd><kbd>→</kbd> spin &middot; <kbd>Q</kbd><kbd>E</kbd> roll', 2.6);
      }
      break;
    case 'land': {
      Audio.sfx.land(d.impact);
      S.shake = Math.max(S.shake, Math.min(0.5, d.impact * 0.02));
      if (d.impact > 4) burst(p.pos, 14, smoke, COL.dust, 6, { size: 1.4, grow: 2.5, gravity: 1, life: 1.2 });
      if (d.tricks.length) {
        const lines = d.tricks.map((t) => ({ text: `${escapeHtml(t.name)} <b>+${t.pts}</b>` }));
        if (d.multiplier > 1) lines.push({ text: `COMBO x${d.multiplier}`, cls: 'total' });
        lines.push({ text: `+${d.total}`, cls: 'total' });
        popups(lines);
        if (d.trickCount) Audio.sfx.trick(p.combo);
        if (d.clean && d.trickCount) Audio.sfx.perfect();
        if (d.clean && (d.trickCount >= 2 || d.multiplier >= 2)) {
          S.slowT = 0.45;
          flash();
        }
      }
      break;
    }
    case 'crash':
      showMsg('CRASH!', 'small');
      Audio.sfx.crash();
      S.shake = 0.9;
      burst(p.pos, 26, glow, COL.spark, 12, { size: 0.3, gravity: 15, drag: 1 });
      burst(p.pos, 16, smoke, COL.smoke, 5, { size: 1.8, grow: 3, gravity: 0, life: 1.4 });
      vibrate(80);
      break;
    case 'miss': // missed the road: the car drops away, then respawns (see 'fall')
      showMsg('WHOOPS!', 'small');
      Audio.sfx.whoosh();
      break;
    case 'fall':
      Audio.sfx.checkpoint();
      break;
    case 'respawn':
      S.camSnap = true;
      break;
    case 'checkpoint':
      if (S.mode === 'race') {
        showMsg('CHECKPOINT', 'small');
        Audio.sfx.checkpoint();
      }
      break;
    case 'pad':
      Audio.sfx.pad();
      S.fovKick = 1;
      break;
    case 'coin':
      Audio.sfx.coin();
      burst(d.pos, 10, glow, COL.coin, 6, { size: 0.3, gravity: 2 });
      break;
    case 'ring':
      Audio.sfx.ring();
      popups([{ text: 'RING <b>+250</b>' }]);
      burst(d.pos, 30, glow, COL.ring, 10, { size: 0.5, gravity: 0 });
      break;
    case 'wall':
      Audio.sfx.wall();
      burst(p.pos, 8, glow, COL.spark, 8, { size: 0.25, gravity: 12 });
      S.shake = Math.max(S.shake, 0.2);
      vibrate(20);
      break;
    case 'bump':
      Audio.sfx.land(d.impact * 0.5);
      break;
    case 'cone':
      Audio.sfx.cone();
      S.shake = Math.max(S.shake, 0.12);
      break;
    case 'barrier':
      burst(p.pos, 20, glow, COL.spark, 10, { size: 0.3, gravity: 14, drag: 1 });
      break;
    case 'hammer':
      Audio.sfx.clang(1);
      showMsg('SMASHED!', 'small');
      burst(p.pos, 24, glow, COL.spark, 12, { size: 0.32, gravity: 14, drag: 1 });
      S.shake = 1;
      vibrate(120);
      break;
    case 'shove':
      Audio.sfx.wall();
      Audio.sfx.clang(0.4);
      burst(p.pos, 12, glow, COL.spark, 9, { size: 0.28, gravity: 12 });
      S.shake = Math.max(S.shake, 0.5);
      vibrate(50);
      break;
    case 'slick':
      Audio.sfx.skid();
      showMsg(d.kind === 'ice' ? 'ICE!' : 'OIL!', 'small');
      break;
    case 'bounce':
      Audio.sfx.boing();
      S.fovKick = 1;
      break;
    default:
      break;
  }
}

function vibrate(ms) {
  if (input.touchUI && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (e) { /* not allowed */ }
  }
}

/* ====================================================================== camera */
const cam = { pos: new V3(), up: new V3(0, 1, 0), fwd: new V3(0, 0, -1), look: new V3(), orbit: 0.6, fov: 62 };
const WORLD_UP = new V3(0, 1, 0);
const cTmp = new V3();
const cTmp2 = new V3();

function lerpV(v, target, k, dt) {
  return v.lerp(target, dt > 0 ? 1 - Math.exp(-k * dt) : 0);
}

function updateCamera(dt) {
  const p = S.player;
  if (!p || S.freeCam) return; // freeCam: a ?debug script is placing the camera (store images)
  if (S.mode === 'menu' || S.mode === 'loading') {
    const garage = S.screen === 'screen-garage';
    cam.orbit += dt * (garage ? 0.35 : 0.12);
    const r = garage ? 7.5 : 12;
    const h = garage ? 2.2 : 4.2;
    const target = cTmp.copy(p.pos).addScaledVector(p.up, 1);
    cam.pos.set(target.x + Math.cos(cam.orbit) * r, target.y + h, target.z + Math.sin(cam.orbit) * r);
    camera.position.copy(cam.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    if (garage && view.w > view.h) {
      // push the car to the left of the screen, away from the garage panel
      cTmp2.setFromMatrixColumn(camera.matrixWorld, 0);
      camera.position.addScaledVector(cTmp2, 2.6);
      camera.lookAt(target.addScaledVector(cTmp2, 2.6));
    }
    camera.fov = view.baseFov;
    camera.updateProjectionMatrix();
    cam.up.set(0, 1, 0);
    S.camSnap = true;
    return;
  }
  const air = p.mode === 'air';
  if (air && p.fallT > 0) {
    // missed the road: hold the camera where it is and watch the car drop away
    camera.position.copy(cam.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(p.pos);
    return;
  }
  const speed = p.speed;
  const upT = air ? WORLD_UP : p.up;
  const fwdT = cTmp.copy(p.fwd);
  if (air) {
    fwdT.y *= 0.3;
    if (fwdT.lengthSq() < 1e-4) fwdT.copy(cam.fwd);
    fwdT.normalize();
  }
  const dist = 7.4 + speed * 0.045;
  const height = 2.6 + speed * 0.012;
  if (S.camSnap) {
    cam.up.copy(upT);
    cam.fwd.copy(fwdT);
  } else {
    // loops & corkscrews twist fast - follow their roll tightly so the view doesn't tilt
    const twisty = !air && S.track.grip[S.track.index(p.s)] > 0;
    lerpV(cam.up, upT, air ? 2.5 : twisty ? 16 : 6, dt).normalize();
    lerpV(cam.fwd, fwdT, air ? 3 : twisty ? 12 : 7, dt).normalize();
  }
  const desired = cTmp2.copy(p.pos).addScaledVector(cam.fwd, -dist).addScaledVector(cam.up, height);
  if (S.camSnap) cam.pos.copy(desired);
  else lerpV(cam.pos, desired, air ? 10 : 14, dt);
  S.camSnap = false;
  camera.position.copy(cam.pos);
  if (S.shake > 0) camera.position.add(cTmp.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(S.shake * 0.35));
  camera.up.copy(cam.up);
  cam.look.copy(p.pos).addScaledVector(cam.up, 1.2).addScaledVector(cam.fwd, 4);
  camera.lookAt(cam.look);
  const targetFov = view.baseFov + clamp(speed - 20, 0, 50) * 0.18 + (p.boosting ? 7 : 0) + S.fovKick * 6;
  cam.fov = damp(cam.fov, targetFov, 4, dt);
  camera.fov = cam.fov;
  camera.updateProjectionMatrix();
}

/* ====================================================================== HUD & messages */
const hud = {
  root: $('hud'), pos: $('h-pos'), suf: $('h-pos-suf'), of: $('h-pos-of'), time: $('h-time'), score: $('h-score'), combo: $('h-combo'),
  speed: $('h-speed'), nitro: $('nitro'), nitroFill: $('h-nitro'), air: $('h-air'), progress: $('h-progress'), coins: $('h-coins'),
  draft: $('h-draft'), hint: $('hint'), lines: $('speedlines'), callout: $('h-callout'), flash: $('flash'),
  touch: $('touch'), vignette: $('vignette'), msg: $('center-msg'), popups: $('popups'), toast: $('toast'),
};
const hudCache = {};
function setText(node, key, v) {
  if (hudCache[key] !== v) {
    hudCache[key] = v;
    node.textContent = v;
  }
}
function setClass(node, key, cls, on) {
  if (hudCache[key] !== on) {
    hudCache[key] = on;
    node.classList.toggle(cls, on);
  }
}

let dots = [];
function buildProgressDots() {
  hud.progress.innerHTML = '<span class="flag">🏁</span>';
  dots = S.all.map((c) => {
    const d = document.createElement('div');
    d.className = 'dot' + (c.isPlayer ? ' me' : '');
    d.style.background = c.isPlayer ? save.color : c.model.paint.color.getStyle();
    hud.progress.appendChild(d);
    return d;
  });
}

function updateHUD() {
  const p = S.player;
  const tr = S.track;
  setText(hud.pos, 'pos', String(S.position));
  setText(hud.suf, 'suf', suffix(S.position));
  setText(hud.of, 'of', '/' + S.all.length);
  setText(hud.time, 'time', formatTime(S.mode === 'countdown' ? 0 : p.finished ? p.finishTime : S.raceTime));
  setText(hud.score, 'score', String(p.score));
  setText(hud.coins, 'coins', String(p.coins));
  const mult = Math.min(4, 1 + (p.combo - 1) * 0.5);
  setText(hud.combo, 'combo', p.combo > 1 ? `COMBO x${mult}` : '');
  setText(hud.speed, 'speed', String(Math.round(p.speed * 3.6)));
  setText(hud.air, 'air', p.mode === 'air' && p.airTime > 0.6 && !p.fallT ? `AIR ${p.airTime.toFixed(1)}s` : '');
  const n = Math.round(p.nitro);
  if (hudCache.nitro !== n) {
    hudCache.nitro = n;
    hud.nitroFill.style.transform = `scaleX(${n / 100})`;
  }
  setClass(hud.nitro, 'full', 'full', n >= 99 && !p.boosting);
  setClass(hud.nitro, 'active', 'active', p.boosting);
  setClass(hud.touch, 'air', 'air', p.mode === 'air');
  setClass(hud.vignette, 'vig', 'on', p.boosting);
  setClass(hud.draft, 'draft', 'show', S.draft);
  setClass(hud.lines, 'lines', 'on', S.mode === 'race' && (p.boosting || p.padT > 0 || p.speed > 60));
  const span = tr.finishS - tr.startS;
  S.all.forEach((c, i) => {
    if (dots[i]) dots[i].style.left = `${clamp((c.s - tr.startS) / span, 0, 1) * 100}%`;
  });
}

function showMsg(text, cls = '') {
  hud.msg.textContent = text;
  hud.msg.className = 'center-msg';
  void hud.msg.offsetWidth; // restart the animation
  hud.msg.className = 'center-msg ' + (cls.includes('hold') ? cls : 'show ' + cls);
}

function showHint(html, secs) {
  hud.hint.innerHTML = html;
  hud.hint.classList.add('show');
  S.hintT = secs;
}

function callout(text) {
  hud.callout.textContent = text;
  hud.callout.className = 'hud-callout';
  void hud.callout.offsetWidth;
  hud.callout.className = 'hud-callout show';
}

function flash() {
  hud.flash.className = '';
  void hud.flash.offsetWidth;
  hud.flash.className = 'on';
}

function toast(html) {
  hud.toast.innerHTML = html;
  hud.toast.className = 'toast';
  void hud.toast.offsetWidth;
  hud.toast.className = 'toast show';
}

function popups(lines) {
  hud.popups.innerHTML = '';
  lines.forEach((l, i) => {
    const d = document.createElement('div');
    d.className = 'popup ' + (l.cls || '');
    d.style.animationDelay = `${i * 0.08}s`;
    d.innerHTML = l.text;
    hud.popups.appendChild(d);
  });
}

function updateOverlays() {
  const racing = S.mode === 'countdown' || S.mode === 'race';
  hud.root.classList.toggle('show', (racing || (S.mode === 'finished' && !S.resultsShown)) && !S.paused);
  hud.touch.classList.toggle('show', input.touchUI && racing && !S.paused);
  if (!hud.touch.classList.contains('show')) {
    input.releaseAll();
    if (input.clearTouchVisuals) input.clearTouchVisuals();
  }
  hud.vignette.classList.remove('on');
  hud.lines.classList.remove('on');
  hudCache.vig = false;
  hudCache.lines = false;
  if (!racing) {
    hud.hint.classList.remove('show');
    S.hintT = 0;
  }
  $('btn-respawn').hidden = S.mode !== 'race'; // nothing to go back to during the countdown
}

/* ====================================================================== menus */
function showScreen(id) {
  S.screen = id || null;
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

function clickPrimary() {
  if (!S.screen) return;
  const b = [...document.querySelectorAll(`#${S.screen} [data-primary]`)].find((x) => !x.disabled && !x.hidden);
  if (b) b.click();
}

const starString = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

function refreshMenus() {
  $('title-coins').textContent = fmt(save.coins);
  $('btn-daily').hidden = !eco.dailyStatus().ready;
  $('star-total').textContent = `${eco.totalStars()} / ${TRACKS.length * 3}`;
  const next = eco.nextTrack();
  $('play-next').innerHTML = `${escapeHtml(TRACKS[next].name)} <span class="stars">${starString(eco.result(next).stars || 0)}</span>`;
  $('btn-sound').textContent = (save.sfx ? '🔊' : '🔇') + ' Sound';
  $('btn-sound').classList.toggle('off', !save.sfx);
  $('btn-music').textContent = '🎵 Music';
  $('btn-music').classList.toggle('off', !save.music);
  $('btn-quality').textContent = '✨ ' + QUALITY[quality].label;
  $('btn-autogas').textContent = 'Auto-gas: ' + (input.autoGas ? 'On' : 'Off');
  $('btn-autogas').classList.toggle('off', !input.autoGas);
  renderTracks();
  if (S.screen === 'screen-garage') renderGarage();
}

function renderTracks() {
  const list = $('track-list');
  list.innerHTML = '';
  WORLDS.forEach((w) => {
    const idxs = TRACKS.map((_, i) => i).filter((i) => TRACKS[i].theme === w.theme);
    const got = idxs.reduce((n, i) => n + (eco.result(i).stars || 0), 0);
    const head = document.createElement('div');
    head.className = 'world-head';
    head.innerHTML = `<span>${escapeHtml(w.name)}</span><span class="stars">★ ${got}/${idxs.length * 3}</span>`;
    list.appendChild(head);
    const row = document.createElement('div');
    row.className = 'world-row';
    for (const i of idxs) {
      const t = TRACKS[i];
      const r = eco.result(i);
      const open = eco.trackUnlocked(i);
      const b = document.createElement('button');
      b.className = 'track-card' + (i === save.track ? ' sel' : '') + (open ? '' : ' locked');
      b.innerHTML =
        `<div class="track-thumb" style="background:${THEMES[t.theme].thumb}">${open ? `<span class="track-no">${i + 1}</span>` : '🔒'}</div>` +
        `<div class="track-info"><div class="track-name">${escapeHtml(t.name)}</div><div class="track-desc">${escapeHtml(open ? t.desc : 'Finish the previous track to unlock')}</div>` +
        `<div class="track-meta"><span class="stars">${starString(r.stars || 0)}</span><span>${r.time != null ? formatTime(r.time) : ''}</span></div></div>`;
      b.addEventListener('click', () => {
        if (!open) {
          Audio.sfx.deny();
          return;
        }
        save.track = i;
        persist();
        loadTrack(i);
        placeGrid();
        renderTracks();
      });
      row.appendChild(b);
    }
    list.appendChild(row);
  });
}

/* ---------------------------------------------------------------- daily reward */
function openDaily() {
  const st = eco.dailyStatus();
  if (!st.ready) return;
  $('daily-days').innerHTML = st.rewards
    .map((n, k) => {
      const cls = k < st.streak - 1 ? 'done' : k === st.streak - 1 ? 'today' : '';
      return `<div class="day ${cls}"><small>Day ${k + 1}</small><b>${coinHtml(n)}</b>${k < st.streak - 1 ? '<i>✓</i>' : ''}</div>`;
    })
    .join('');
  $('btn-daily-claim').innerHTML = `Claim ${coinHtml(st.reward)}`;
  const dbl = $('btn-daily-double');
  dbl.hidden = !platform.hasAds;
  dbl.disabled = false;
  dbl.innerHTML = `🎬 Claim ${coinHtml(st.reward * 2)}`;
  showScreen('screen-daily');
}

function claimDaily(mult) {
  const n = eco.claimDaily(mult);
  if (!n) return;
  Audio.sfx.daily();
  toast(`🎁 ${coinHtml(n)} coins!`);
  showScreen('screen-title');
  refreshMenus();
}

/* ---------------------------------------------------------------- garage */
const garage = { view: 'racer', from: 'screen-title' };
const STAT_MAX = { top: 76, accel: 40, grip: 46, air: 1.85 };

let freeTimer = null;
function openGarage(from) {
  garage.from = from;
  garage.view = save.car;
  showScreen('screen-garage');
  renderGarage();
  clearInterval(freeTimer);
  freeTimer = setInterval(renderFreeCoins, 1000);
}

function closeGarage() {
  clearInterval(freeTimer);
  if (garage.view !== save.car) createPlayer(save.car);
  showScreen(garage.from || 'screen-title');
  refreshMenus();
}

// Rewarded "free coins" button, with its cooldown shown as a countdown.
function renderFreeCoins() {
  const box = $('garage-free');
  if (!platform.hasAds) {
    box.innerHTML = '';
    return;
  }
  const wait = eco.freeCoinsWait();
  const label = wait > 0
    ? `🎬 Free coins in ${Math.floor(wait / 60000)}:${String(Math.floor(wait / 1000) % 60).padStart(2, '0')}`
    : `🎬 Free coins +${fmt(eco.freeCoinsAmount())}`;
  let btn = box.querySelector('button');
  if (!btn) {
    box.innerHTML = '<button class="btn reward free-btn" data-free="1"></button>';
    btn = box.querySelector('button');
  }
  btn.textContent = label;
  btn.disabled = wait > 0;
}

function renderGarage() {
  const id = garage.view;
  const t = eco.carById(id);
  const owned = eco.owns(id);
  $('garage-coins').textContent = fmt(save.coins);

  $('car-list').innerHTML = CAR_TYPES.map((c) => {
    const tag = eco.owns(c.id) ? (c.id === save.car ? '<span class="tag on">✓</span>' : '') : `<span class="tag price">${coinHtml(c.price)}</span>`;
    return `<button class="car-chip${c.id === id ? ' sel' : ''}${eco.owns(c.id) ? '' : ' locked'}" data-car="${c.id}"><span class="nm">${c.name}</span>${tag}</button>`;
  }).join('');

  const st = eco.carStats(id);
  const bar = (label, v) => `<span>${label}</span><div class="stat-bar"><i style="width:${Math.round(clamp(v, 0, 1) * 100)}%"></i></div>`;
  $('car-info').innerHTML =
    `<div class="car-title">${t.name}</div><div class="car-desc">${t.desc}</div>` +
    `<div class="stats">${bar('Speed', st.top / STAT_MAX.top)}${bar('Accel', st.accel / STAT_MAX.accel)}${bar('Grip', st.grip / STAT_MAX.grip)}${bar('Air', st.air / STAT_MAX.air)}</div>`;

  let action;
  if (!owned) {
    const can = save.coins >= t.price;
    const test = platform.hasAds ? `<button class="btn reward pair" data-test="${id}">🎬 Test drive</button>` : '';
    action = `<button class="btn primary buy pair" data-buy="${id}"${can ? '' : ' disabled'}>Buy ${coinHtml(t.price)}</button>${test}` + (can ? '' : `<div class="need">Need ${fmt(t.price - save.coins)} more coins${test ? ', or take it for a spin first' : ''}</div>`);
  } else if (id === save.car) {
    action = '<div class="driving">✓ Your car</div>';
  } else {
    action = `<button class="btn primary" data-drive="${id}">Drive this car</button>`;
  }
  $('car-action').innerHTML = action;

  const lv = eco.levels(id);
  $('upgrade-list').innerHTML = owned
    ? eco.UPGRADES.map((u) => {
      const cost = eco.upgradeCost(id, u.id);
      const pips = Array.from({ length: eco.MAX_LEVEL }, (_, k) => `<i class="${k < lv[u.id] ? 'on' : ''}"></i>`).join('');
      const btn = cost == null
        ? '<span class="maxed">MAX</span>'
        : `<button class="btn up-btn" data-up="${u.id}"${save.coins >= cost ? '' : ' disabled'}>${coinHtml(cost)}</button>`;
      return `<div class="up-row"><div class="up-name">${u.name}<small>${u.desc}</small></div><div class="pips">${pips}</div>${btn}</div>`;
    }).join('')
    : '<p class="hint-text">Buy this car to upgrade it.</p>';

  renderFreeCoins();
  $('color-list').innerHTML = COLORS.map((col) => `<button class="swatch${col === save.color ? ' sel' : ''}" style="background:${col}" data-color="${col}" aria-label="Colour ${col}"></button>`).join('');
}

$('screen-garage').addEventListener('click', async (e) => {
  const el = e.target.closest('[data-car],[data-buy],[data-drive],[data-up],[data-color],[data-test],[data-free]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.test) {
    el.disabled = true;
    if (await platform.rewardedBreak()) {
      clearInterval(freeTimer);
      S.testDrive = d.test;
      S.testDriveDone = false;
      toast(`🏁 One race in the <b>${escapeHtml(eco.carById(d.test).name)}</b>!`);
      startRace(false); // no ad break right after the video
    } else el.disabled = false;
    return;
  }
  if (d.free) {
    el.disabled = true;
    if (await platform.rewardedBreak()) {
      const n = eco.claimFreeCoins();
      if (n) {
        Audio.sfx.buy();
        toast(`${coinHtml(n)} free coins!`);
      }
    }
    renderGarage();
    return;
  }
  if (d.car) {
    if (d.car !== garage.view) {
      garage.view = d.car;
      createPlayer(d.car);
    }
  } else if (d.buy) {
    if (eco.buyCar(d.buy)) {
      Audio.sfx.buy();
      toast(`🎉 The <b>${escapeHtml(eco.carById(d.buy).name)}</b> is yours!`);
      createPlayer(d.buy);
    } else Audio.sfx.deny();
  } else if (d.drive) {
    save.car = d.drive;
    persist();
    Audio.sfx.buy();
  } else if (d.up) {
    if (eco.buyUpgrade(garage.view, d.up)) {
      Audio.sfx.buy();
      S.player.type = eco.carStats(garage.view);
    } else Audio.sfx.deny();
  } else if (d.color) {
    save.color = d.color;
    persist();
    S.playerModel.setColor(d.color);
    recolorRivals();
  }
  renderGarage();
});

/* ---------------------------------------------------------------- results */
function showResults() {
  S.resultsShown = true;
  const p = S.player;
  const r = S.result;
  const msgs = CONFIG.messages || {};
  $('res-place').textContent = `${r.pos}${suffix(r.pos)} place`;
  $('res-stars').innerHTML = r.earned.map((got, i) => `<span class="${got ? 'got' : ''}" style="animation-delay:${0.2 + i * 0.25}s">★</span>`).join('');
  $('res-msg').textContent = r.pos === 1 ? msgs.win : r.pos <= 3 ? msgs.podium : msgs.other;
  $('res-time').textContent = formatTime(p.finishTime);
  $('res-score').textContent = String(p.score);
  $('res-target').textContent = String(S.def.target);
  renderResultCoins();
  $('res-unlock').textContent = r.unlocks.length ? '🔓 ' + r.unlocks.join(' · ') : '';
  $('res-table').innerHTML = standings()
    .map((c, i) => `<li class="${c.isPlayer ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm">${escapeHtml(c.name)}</span><span>${c.finished ? formatTime(c.finishTime) : '—'}</span></li>`)
    .join('');
  const last = S.trackIdx + 1 >= TRACKS.length;
  $('btn-next').textContent = last ? 'Race again' : 'Next race';
  const dbl = $('btn-double');
  dbl.hidden = !platform.hasAds;
  dbl.disabled = false;
  dbl.innerHTML = `🎬 Double coins <small>+${fmt(r.reward.total)}</small>`;
  Audio.engineOff();
  showScreen('screen-results');
  updateOverlays();
  countUp($('res-total'), r.reward.total * (S.doubled ? 2 : 1));
}

function renderResultCoins() {
  const rw = S.result.reward;
  $('res-coins').innerHTML =
    rw.lines.map((l) => `<div class="coin-line"><span>${escapeHtml(l.label)}</span><b>+${fmt(l.value)}</b></div>`).join('') +
    (S.doubled ? `<div class="coin-line bonus"><span>🎬 Bonus</span><b>+${fmt(rw.total)}</b></div>` : '') +
    `<div class="coin-line total"><span>Coins earned</span><b><span class="coin-ico"></span><span id="res-total">${fmt(rw.total * (S.doubled ? 2 : 1))}</span></b></div>`;
}

let countTimer = null;
function countUp(el, to) {
  clearInterval(countTimer);
  const t0 = performance.now();
  const dur = 900;
  countTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    el.textContent = fmt(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) Audio.sfx.tick();
    else clearInterval(countTimer);
  }, 60);
}

async function doubleCoins() {
  const btn = $('btn-double');
  if (S.doubled || btn.disabled) return;
  btn.disabled = true;
  const ok = await platform.rewardedBreak();
  if (ok && !S.doubled) {
    S.doubled = true;
    eco.addCoins(S.result.reward.total);
    renderResultCoins();
    countUp($('res-total'), S.result.reward.total * 2);
    btn.innerHTML = '✓ Coins doubled';
    Audio.sfx.buy();
    toast(`${coinHtml(S.result.reward.total)} bonus coins!`);
  } else {
    btn.disabled = false;
  }
}

/* ====================================================================== fullscreen & mobile gate */
const fsTarget = document.documentElement;
const canFullscreen = !!(fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen);
const inFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installedApp = () => window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
let fsDeclined = false;
let gateOpen = false;
let gateReturn = null;

async function enterLandscapeFullscreen() {
  if (canFullscreen && !inFullscreen()) {
    try {
      const r = (fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen).call(fsTarget, { navigationUI: 'hide' });
      if (r && r.then) await r;
    } catch (e) { /* refused - keep playing windowed */ }
  }
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (e) { /* unsupported (e.g. iPhone): the page turns itself sideways instead */ }
}

let fsHelpReturn = null;
function toggleFullscreen() {
  if (!platform.fullscreenUI) return; // portals provide their own full screen
  if (!canFullscreen) {
    // iPhone Safari has no Fullscreen API for pages: explain Add to Home Screen instead
    fsHelpReturn = S.screen;
    showScreen('screen-fs-help');
    return;
  }
  try {
    if (inFullscreen()) {
      fsDeclined = true;
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      fsDeclined = false;
      enterLandscapeFullscreen();
    }
  } catch (e) { /* not supported */ }
}

function refreshFullscreenButtons() {
  const label = inFullscreen() ? '⛶ Exit full screen' : '⛶ Full screen';
  document.querySelectorAll('.btn-fs').forEach((b) => {
    b.textContent = label;
    // Hidden on portals (CrazyGames forbids in-game full screen buttons), and in an iPhone
    // home-screen app, which already runs full screen. Note that display-mode also reads
    // "fullscreen" while a page is in full screen, so don't use it on its own.
    b.hidden = !platform.fullscreenUI || (!canFullscreen && installedApp());
  });
  document.querySelectorAll('.fs-only').forEach((el) => { el.hidden = !platform.fullscreenUI; });
}

let gateStartsRace = false;
function showGate(resume) {
  gateOpen = true;
  gateStartsRace = !resume; // first tap goes straight into a race (one tap to gameplay)
  gateReturn = S.screen;
  showScreen(null);
  $('btn-gate').textContent = resume ? '▶ Back to full screen' : '▶ Play in full screen';
  $('gate-hint').textContent = '';
  $('gate').classList.add('active');
}

function closeGate() {
  gateOpen = false;
  $('gate').classList.remove('active');
  if (gateReturn) showScreen(gateReturn);
  gateReturn = null;
}

function onFullscreenChange() {
  refreshFullscreenButtons();
  if (!platform.fullscreenUI || !input.touchUI || !canFullscreen || fsDeclined || gateOpen || installedApp()) return;
  if (!inFullscreen()) {
    setPaused(true);
    showGate(true);
  }
}
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

/* ====================================================================== wiring */
const on = (id, fn) => $(id).addEventListener('click', fn);
on('btn-play', () => {
  save.track = eco.nextTrack();
  persist();
  startRace();
});
on('btn-tracks', () => showScreen('screen-tracks'));
on('btn-daily', openDaily);
on('btn-daily-claim', () => claimDaily(1));
on('btn-daily-double', async () => {
  const b = $('btn-daily-double');
  b.disabled = true;
  if (await platform.rewardedBreak()) claimDaily(2);
  else b.disabled = false;
});
on('btn-daily-close', () => showScreen('screen-title'));
on('btn-garage', () => openGarage('screen-title'));
on('btn-tracks-garage', () => openGarage('screen-tracks'));
on('btn-garage-done', closeGarage);
on('btn-howto', () => showScreen('screen-howto'));
on('btn-howto-back', () => showScreen('screen-title'));
on('btn-tracks-back', () => showScreen('screen-title'));
on('btn-race', () => startRace());
on('btn-pause', () => setPaused(true));
on('btn-respawn', () => {
  if (S.mode === 'race' && S.player.mode !== 'crash') S.player.respawn();
});
on('btn-resume', () => setPaused(false));
on('btn-restart', () => startRace(true));
on('btn-quit', () => enterMenu());
on('btn-retry', () => startRace(true));
on('btn-res-menu', () => enterMenu());
on('btn-res-garage', () => {
  enterMenu();
  openGarage('screen-title');
});
on('btn-next', () => {
  const next = S.trackIdx + 1;
  if (next < TRACKS.length && eco.trackUnlocked(next)) save.track = next;
  persist();
  startRace(true);
});
on('btn-double', doubleCoins);
on('btn-sound', () => {
  save.sfx = !save.sfx;
  Audio.setSfx(save.sfx);
  persist();
  refreshMenus();
});
on('btn-music', () => {
  save.music = !save.music;
  Audio.setMusic(save.music);
  persist();
  refreshMenus();
});
on('btn-quality', () => {
  quality = QUALITY_ORDER[(QUALITY_ORDER.indexOf(quality) + 1) % QUALITY_ORDER.length];
  save.quality = quality;
  persist();
  applyQuality();
  refreshMenus();
});
on('btn-autogas', () => {
  save.autoGas = !input.autoGas;
  input.autoGas = save.autoGas;
  persist();
  refreshMenus();
});
on('btn-fs', toggleFullscreen);
on('btn-fs-pause', toggleFullscreen);
on('btn-fs-help-back', () => showScreen(fsHelpReturn || 'screen-title'));
on('btn-gate', () => {
  fsDeclined = false;
  const race = gateStartsRace;
  Promise.race([enterLandscapeFullscreen(), new Promise((r) => setTimeout(r, 800))]).finally(() => {
    closeGate();
    if (race) $('btn-play').click();
  });
});
on('btn-gate-skip', () => {
  fsDeclined = true;
  closeGate();
});

document.addEventListener('click', (e) => {
  if (e.target.closest('button')) Audio.sfx.click();
});

let audioReady = false;
function unlockAudio() {
  if (audioReady) {
    Audio.resume();
    return;
  }
  audioReady = true;
  Audio.init();
  Audio.setSfx(save.sfx);
  Audio.setMusic(save.music);
}
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlockAudio);

input.on.pause = () => setPaused(!S.paused);
input.on.respawn = () => {
  if (S.mode === 'race' && !S.paused && S.player.mode !== 'crash') S.player.respawn();
};
input.on.primary = clickPrimary;
input.on.back = () => {
  if (S.screen === 'screen-garage') closeGarage();
  else if (['screen-tracks', 'screen-howto', 'screen-daily'].includes(S.screen)) showScreen('screen-title');
  else if (S.screen === 'screen-fs-help') showScreen(fsHelpReturn || 'screen-title');
};
input.on.fullscreen = toggleFullscreen;
input.on.touchDetected = () => {
  if (save.autoGas == null) input.autoGas = true;
  resize();
  refreshMenus();
  updateOverlays();
};
input.bindTouch({ zone: $('t-steer'), left: $('t-left'), right: $('t-right'), brake: $('t-brake'), nitro: $('t-nitro') });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    setPaused(true);
    Audio.suspend();
  } else {
    Audio.resume();
  }
});
window.addEventListener('resize', resize);

// Portal ads: freeze the game, silence it and ignore input until the ad is over.
platform.on('adStart', () => {
  S.adPause = true;
  input.enabled = false;
  input.releaseAll();
  Audio.setMuted('ad', true);
});
platform.on('adEnd', () => {
  S.adPause = false;
  input.enabled = true;
  input.releaseAll();
  Audio.setMuted('ad', false);
  last = performance.now();
});
platform.on('mute', (m) => Audio.setMuted('platform', m));

/* ====================================================================== main loop */
const perf = { t: 0, frames: 0, grace: 4, drops: 0 };
function perfMonitor(dt) {
  if (S.paused || document.hidden || S.mode === 'loading') return;
  if (perf.grace > 0) {
    perf.grace -= dt;
    return;
  }
  perf.t += dt;
  perf.frames++;
  if (perf.t >= 3) {
    const fps = perf.frames / perf.t;
    perf.t = 0;
    perf.frames = 0;
    const i = QUALITY_ORDER.indexOf(quality);
    if (fps < 40 && i < QUALITY_ORDER.length - 1 && perf.drops < 2) {
      quality = QUALITY_ORDER[i + 1];
      perf.drops++;
      perf.grace = 3;
      applyQuality();
      refreshMenus();
    }
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (S.adPause) return;
  const realDt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  let dt = realDt;
  if (S.slowT > 0 && !S.paused) {
    S.slowT -= realDt;
    dt = realDt * 0.35;
  }
  if (window.innerWidth !== view.winW || window.innerHeight !== view.winH) resize();
  if (!S.paused) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 60) - 0.01));
    for (let i = 0; i < steps; i++) update(dt / steps);
    smoke.update(dt);
    glow.update(dt);
    S.trackView.update(dt, S.time);
  }
  updateCamera(S.paused ? 0 : dt);
  world.update(dt, S.time, camera, S.player.pos);
  weather.update(dt, camera);
  renderer.render(scene, camera);
  const p = S.player;
  if (S.mode === 'countdown') Audio.engine(0.15, input.state.gas, false, false, 0);
  else if (S.mode === 'race' || S.mode === 'finished') {
    const air = p.mode === 'air';
    Audio.engine(p.speed / p.type.top, !air && input.state.gas, p.boosting, air, air ? clamp(p.speed / 60, 0, 1) : 0);
  }
  if (hud.root.classList.contains('show')) updateHUD();
  perfMonitor(realDt);
}

/* ====================================================================== boot */
async function boot() {
  const fontsReady = document.fonts && document.fonts.load ? document.fonts.load('800 40px "Baloo 2"').catch(() => {}) : Promise.resolve();
  await Promise.all([platform.init(), Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))])]);
  eco.reload();
  quality = QUALITY[save.quality] ? save.quality : input.touchUI ? 'medium' : 'high';
  input.autoGas = save.autoGas == null ? input.touchUI : save.autoGas;
  document.title = CONFIG.gameTitle || 'Speed Demons';
  $('title-text').textContent = CONFIG.gameTitle || 'Speed Demons';
  $('gate-title').textContent = CONFIG.gameTitle || 'Speed Demons';
  $('subtitle-text').textContent = CONFIG.subtitle || '';
  refreshFullscreenButtons();
  applyQuality();
  loadTrack(save.track);
  enterMenu();
  if (platform.fullscreenUI && input.touchUI && canFullscreen && !installedApp()) showGate(false);
  $('loading').classList.add('done');
  platform.loadingDone();
  last = performance.now();
  requestAnimationFrame(frame);
}

// Dev hook (only with ?debug in the URL): step the simulation without requestAnimationFrame.
if (new URLSearchParams(location.search).has('debug')) {
  window.__speedDemons = {
    S, input, save, eco, platform, startRace, enterMenu, camera, scene, renderer, smoke, glow, world, weather, resize,
    step(seconds, draw = true) {
      const h = 1 / 60;
      const n = Math.max(1, Math.round(seconds / h));
      for (let i = 0; i < n; i++) {
        update(h);
        smoke.update(h);
        glow.update(h);
        S.trackView.update(h, S.time);
        updateCamera(h);
      }
      if (draw) this.draw(n * h);
    },
    // Render one frame as the game loop does; dt advances the scenery and weather animation.
    draw(dt = 0) {
      world.update(dt, S.time, camera, S.player.pos);
      weather.update(dt, camera);
      renderer.render(scene, camera);
      updateHUD();
    },
  };
}

boot().catch((err) => {
  $('loading-text').textContent = 'Sorry - this device could not start the game (' + err.message + ')';
  throw err;
});
})();
