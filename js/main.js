/* Speed Demons - boot, race flow, camera, effects, HUD and menus. */
(() => {
'use strict';
const SD = (window.SD ||= {});
const Audio = SD.audio;
const { clamp, damp, rand, formatTime, suffix, escapeHtml, store } = SD.util;
const { buildTrackMesh } = SD.track;
const { THEMES, TRACKS, buildTrack } = SD.tracks;
const { CAR_TYPES, COLORS, CarModel } = SD.cars;
const { World } = SD.world;
const { Particles } = SD.fx;
const { PlayerCar, AiCar, collide } = SD.physics;
const { Input } = SD.input;

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const IDLE = { steer: 0, gas: false, brake: false, nitro: false, pitch: 0, roll: 0 };

/* ====================================================================== save data */
const SAVE_KEY = 'speedDemons.v1';
const OLD_SAVE_KEY = 'stuntRush.v1'; // the game's earlier name - carry progress over
const save = Object.assign(
  { car: 'racer', color: COLORS[0], track: 0, sfx: true, music: true, quality: null, autoGas: null, results: {} },
  store.get(SAVE_KEY, null) || store.get(OLD_SAVE_KEY, {}),
);
const persist = () => store.set(SAVE_KEY, save);
const result = (i) => save.results[TRACKS[i].id] || {};
const totalStars = () => TRACKS.reduce((n, _, i) => n + (result(i).stars || 0), 0);
const trackUnlocked = (i) => i === 0 || (result(i - 1).stars || 0) > 0;
const carUnlocked = (t) => totalStars() >= t.unlock;
const carType = () => CAR_TYPES.find((t) => t.id === save.car) || CAR_TYPES[0];
if (!carUnlocked(carType())) save.car = 'racer';
if (!TRACKS[save.track] || !trackUnlocked(save.track)) save.track = 0;

/* ====================================================================== renderer & scene */
const input = new Input();
const QUALITY = {
  high: { label: 'High', ratio: 2, shadows: true, shadowSize: 2048 },
  medium: { label: 'Medium', ratio: 1.5, shadows: true, shadowSize: 1024 },
  low: { label: 'Low', ratio: 1, shadows: false, shadowSize: 512 },
};
const QUALITY_ORDER = ['high', 'medium', 'low'];
let quality = QUALITY[save.quality] ? save.quality : input.touchUI ? 'medium' : 'high';

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !input.touchUI, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3200);
const world = new World(scene);
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
const AI_ROSTER = [
  { name: 'Blaze', type: 'muscle', color: '#ff8a00' },
  { name: 'Nova', type: 'racer', color: '#3a86ff' },
  { name: 'Dash', type: 'buggy', color: '#2ec4b6' },
  { name: 'Viper', type: 'racer', color: '#8338ec' },
];
const TRACK_SKILL = [0.86, 0.92, 0.96, 1.0]; // AI pace per track (fraction of 52 m/s)

const S = {
  mode: 'loading', // loading | menu | countdown | race | finished
  paused: false,
  screen: null,
  trackIdx: -1,
  def: null,
  theme: null,
  track: null,
  trackView: null,
  player: null,
  playerModel: null,
  aiModels: null,
  ais: [],
  all: [],
  countdown: 0,
  raceTime: 0,
  time: 0,
  finishT: 0,
  position: 5,
  resultsShown: false,
  result: null,
  shake: 0,
  camSnap: true,
  lastBump: 0,
  fovKick: 0,
};

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
  S.trackView = buildTrackMesh(S.track, S.theme, { anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
  scene.add(S.trackView.group);
  world.build(S.theme, S.track);
  renderer.toneMappingExposure = S.theme.nightSky ? 1.2 : 1.05;
  if (!S.aiModels) {
    S.aiModels = AI_ROSTER.map((r) => {
      const m = new CarModel(r.type, r.color);
      scene.add(m.root);
      return m;
    });
  }
  S.ais = AI_ROSTER.map((r, k) => new AiCar(S.track, CAR_TYPES.find((t) => t.id === r.type), S.aiModels[k], r.name, 1));
  createPlayer();
}

function createPlayer() {
  if (S.playerModel) {
    scene.remove(S.playerModel.root);
    disposeTree(S.playerModel.root);
  }
  const type = carType();
  S.playerModel = new CarModel(type.id, save.color);
  scene.add(S.playerModel.root);
  S.player = new PlayerCar(S.track, type, S.playerModel, CONFIG.playerName || 'You');
  S.player.on(onPlayerEvent);
  S.all = [S.player, ...S.ais];
  AI_ROSTER.forEach((r, k) => S.aiModels[k].setColor(r.color === save.color ? '#e9ecef' : r.color));
  placeGrid();
}

function placeGrid() {
  const tr = S.track;
  for (const st of tr.stars) st.taken = false;
  const base = TRACK_SKILL[S.trackIdx] || 0.85;
  const slots = [[-3, 6], [3, 6], [-3, 15], [3, 15]];
  S.ais.forEach((a, k) => {
    a.skill = base + 0.03 - k * 0.02;
    a.place(tr.startS - slots[k][1], slots[k][0]);
  });
  S.player.reset(tr.startS - 24, 0);
  S.player.update(0, IDLE);
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
  loadTrack(save.track);
  placeGrid();
  input.inGame = false;
  Audio.engineOff();
  smoke.clear();
  glow.clear();
  refreshMenus();
  showScreen(screen);
  updateOverlays();
}

function startRace() {
  loadTrack(save.track);
  placeGrid();
  S.mode = 'countdown';
  S.countdown = 3.6;
  S.raceTime = 0;
  S.finishT = 0;
  S.paused = false;
  S.resultsShown = false;
  S.position = S.all.length;
  smoke.clear();
  glow.clear();
  for (const k in hudCache) delete hudCache[k];
  buildProgressDots();
  showScreen(null);
  input.inGame = true;
  input.releaseAll();
  Audio.init();
  Audio.engineOn();
  updateOverlays();
}

function setPaused(v) {
  if (S.mode !== 'race' && S.mode !== 'countdown') return;
  if (S.paused === v) return;
  S.paused = v;
  input.releaseAll();
  if (v) Audio.engineOff();
  else Audio.engineOn();
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
  const pos = standings().indexOf(p) + 1;
  S.position = pos;
  const earned = [true, pos === 1, p.score >= S.def.target];
  const stars = earned.filter(Boolean).length;
  const before = { total: totalStars(), tracks: TRACKS.map((_, i) => trackUnlocked(i)) };
  const prev = result(S.trackIdx);
  save.results[S.def.id] = {
    stars: Math.max(prev.stars || 0, stars),
    time: prev.time == null ? p.finishTime : Math.min(prev.time, p.finishTime),
    score: Math.max(prev.score || 0, p.score),
  };
  persist();
  const unlocks = [];
  TRACKS.forEach((t, i) => {
    if (!before.tracks[i] && trackUnlocked(i)) unlocks.push(`New track: ${t.name}`);
  });
  CAR_TYPES.forEach((t) => {
    if (before.total < t.unlock && totalStars() >= t.unlock) unlocks.push(`New car: ${t.name}`);
  });
  S.result = { pos, earned, unlocks };
  showMsg(pos === 1 ? 'YOU WIN!' : 'FINISH!', 'hold');
  Audio.sfx.finish(pos === 1);
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
  S.shake = Math.max(0, S.shake - dt * 1.8);
  S.fovKick = Math.max(0, S.fovKick - dt * 1.5);
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
  const ctx = { go, all: S.all, rubber };
  for (const a of S.ais) {
    a.update(dt, ctx);
    if (go && !a.finished && a.s >= tr.finishS) {
      a.finished = true;
      a.finishTime = S.raceTime;
    }
  }

  if (S.mode === 'race') {
    collide(p, S.ais, (hit) => {
      if (hit > 2 && S.time - S.lastBump > 0.4) {
        S.lastBump = S.time;
        Audio.sfx.wall();
        S.shake = Math.max(S.shake, Math.min(0.5, hit * 0.03));
      }
    });
    if (p.s >= tr.finishS) finishRace();
    else S.position = standings().indexOf(p) + 1;
  }
  if (S.mode === 'finished') {
    S.finishT += dt;
    if (!S.resultsShown && S.finishT > 3) showResults();
  }
  effects(dt);
}

/* ====================================================================== effects */
const C = (hex) => new THREE.Color(hex);
const COL = { smoke: C('#d8dce6'), dust: C('#c9b9a0'), spark: C('#ffb347'), nitro: C('#5fd0ff'), star: C('#ffd23f'), ring: C('#fff1a8') };
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

/* ====================================================================== player events */
function onPlayerEvent(type, d) {
  const p = S.player;
  switch (type) {
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
    case 'fall':
      showMsg('WHOOPS!', 'small');
      Audio.sfx.whoosh();
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
    case 'star':
      Audio.sfx.star();
      burst(d.pos, 12, glow, COL.star, 7, { size: 0.35, gravity: 2 });
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
  if (!p) return;
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
  speed: $('h-speed'), nitro: $('nitro'), nitroFill: $('h-nitro'), air: $('h-air'), progress: $('h-progress'),
  touch: $('touch'), vignette: $('vignette'), msg: $('center-msg'), popups: $('popups'),
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
  const mult = Math.min(4, 1 + (p.combo - 1) * 0.5);
  setText(hud.combo, 'combo', p.combo > 1 ? `COMBO x${mult}` : '');
  setText(hud.speed, 'speed', String(Math.round(p.speed * 3.6)));
  setText(hud.air, 'air', p.mode === 'air' && p.airTime > 0.6 ? `AIR ${p.airTime.toFixed(1)}s` : '');
  const n = Math.round(p.nitro);
  if (hudCache.nitro !== n) {
    hudCache.nitro = n;
    hud.nitroFill.style.transform = `scaleX(${n / 100})`;
  }
  setClass(hud.nitro, 'full', 'full', n >= 99 && !p.boosting);
  setClass(hud.nitro, 'active', 'active', p.boosting);
  setClass(hud.touch, 'air', 'air', p.mode === 'air');
  setClass(hud.vignette, 'vig', 'on', p.boosting);
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
  hudCache.vig = false;
  $('btn-respawn').hidden = !racing;
}

/* ====================================================================== menus */
function showScreen(id) {
  S.screen = id || null;
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

function clickPrimary() {
  if (!S.screen) return;
  const b = [...document.querySelectorAll(`#${S.screen} [data-primary]`)].find((x) => !x.disabled);
  if (b) b.click();
}

function starString(n) {
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}

function refreshMenus() {
  $('star-total').textContent = String(totalStars());
  $('btn-sound').textContent = (save.sfx ? '🔊' : '🔇') + ' Sound';
  $('btn-sound').classList.toggle('off', !save.sfx);
  $('btn-music').textContent = '🎵 Music';
  $('btn-music').classList.toggle('off', !save.music);
  $('btn-quality').textContent = '✨ ' + QUALITY[quality].label;
  $('btn-autogas').textContent = 'Auto-gas: ' + (input.autoGas ? 'On' : 'Off');
  $('btn-autogas').classList.toggle('off', !input.autoGas);

  const list = $('track-list');
  list.innerHTML = '';
  TRACKS.forEach((t, i) => {
    const r = result(i);
    const open = trackUnlocked(i);
    const b = document.createElement('button');
    b.className = 'track-card' + (i === save.track ? ' sel' : '') + (open ? '' : ' locked');
    b.innerHTML =
      `<div class="track-thumb" style="background:${THEMES[t.theme].thumb}">${open ? '' : '🔒'}</div>` +
      `<div class="track-info"><div class="track-name">${escapeHtml(t.name)}</div><div class="track-desc">${escapeHtml(open ? t.desc : 'Finish the previous track to unlock')}</div>` +
      `<div class="track-meta"><span class="stars">${starString(r.stars || 0)}</span><span>${r.time != null ? formatTime(r.time) : ''}</span></div></div>`;
    b.addEventListener('click', () => {
      if (!open) return;
      save.track = i;
      persist();
      loadTrack(i);
      placeGrid();
      refreshMenus();
    });
    list.appendChild(b);
  });

  const cars = $('car-list');
  cars.innerHTML = '';
  for (const t of CAR_TYPES) {
    const open = carUnlocked(t);
    const b = document.createElement('button');
    b.className = 'car-card' + (t.id === save.car ? ' sel' : '') + (open ? '' : ' locked');
    const bar = (label, v) => `<span>${label}</span><div class="stat-bar"><i style="width:${Math.round(v * 100)}%"></i></div>`;
    b.innerHTML =
      `<span class="nm">${t.name}</span><span class="lock">${open ? '' : `🔒 ${t.unlock} ★`}</span>` +
      `<span class="ds">${t.desc}</span>` +
      `<div class="stats">${bar('Speed', t.top / 57)}${bar('Accel', t.accel / 27)}${bar('Grip', t.grip / 31)}${bar('Air', t.air / 1.3)}</div>`;
    b.addEventListener('click', () => {
      if (!open || save.car === t.id) return;
      save.car = t.id;
      persist();
      createPlayer();
      refreshMenus();
    });
    cars.appendChild(b);
  }

  const colors = $('color-list');
  colors.innerHTML = '';
  for (const col of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (col === save.color ? ' sel' : '');
    b.style.background = col;
    b.setAttribute('aria-label', 'Colour ' + col);
    b.addEventListener('click', () => {
      save.color = col;
      persist();
      S.playerModel.setColor(col);
      AI_ROSTER.forEach((r, k) => S.aiModels[k].setColor(r.color === col ? '#e9ecef' : r.color));
      refreshMenus();
    });
    colors.appendChild(b);
  }
}

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
  $('res-unlock').textContent = r.unlocks.length ? '🔓 ' + r.unlocks.join(' · ') : '';
  $('res-table').innerHTML = standings()
    .map((c, i) => `<li class="${c.isPlayer ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm">${escapeHtml(c.name)}</span><span>${c.finished ? formatTime(c.finishTime) : '—'}</span></li>`)
    .join('');
  const next = S.trackIdx + 1;
  const btn = $('btn-next');
  btn.disabled = !(next < TRACKS.length && trackUnlocked(next));
  btn.textContent = next < TRACKS.length ? 'Next track' : 'All tracks done!';
  $('btn-retry').toggleAttribute('data-primary', btn.disabled);
  Audio.engineOff();
  showScreen('screen-results');
  updateOverlays();
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
  } catch (e) { /* unsupported (e.g. iPhone): the rotate prompt takes over */ }
}

let fsHelpReturn = null;
function toggleFullscreen() {
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
    // an iPhone home-screen app already runs full screen (and can't toggle it). Note that
    // display-mode also reads "fullscreen" while a page is in full screen, so don't hide it otherwise.
    b.hidden = !canFullscreen && installedApp();
  });
}

function showGate(resume) {
  gateOpen = true;
  gateReturn = S.screen;
  showScreen(null);
  $('btn-gate').textContent = !canFullscreen ? '▶ Play' : resume ? '▶ Back to full screen' : '▶ Play in full screen';
  $('btn-gate-skip').hidden = !canFullscreen;
  $('gate-hint').textContent = isIOS && !installedApp() ? 'For true full screen on iPhone: tap Share → Add to Home Screen.' : '';
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
  if (!input.touchUI || !canFullscreen || fsDeclined || gateOpen || installedApp()) return;
  if (!inFullscreen()) {
    setPaused(true);
    showGate(true);
  }
}
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

/* ====================================================================== wiring */
const on = (id, fn) => $(id).addEventListener('click', fn);
on('btn-play', () => showScreen('screen-tracks'));
on('btn-garage', () => {
  S.lastMenu = 'screen-title';
  showScreen('screen-garage');
});
on('btn-tracks-garage', () => {
  S.lastMenu = 'screen-tracks';
  showScreen('screen-garage');
});
on('btn-garage-done', () => showScreen(S.lastMenu || 'screen-title'));
on('btn-howto', () => showScreen('screen-howto'));
on('btn-howto-back', () => showScreen('screen-title'));
on('btn-tracks-back', () => showScreen('screen-title'));
on('btn-race', startRace);
on('btn-pause', () => setPaused(true));
on('btn-respawn', () => {
  if (S.mode === 'race' && S.player.mode !== 'crash') S.player.respawn();
});
on('btn-resume', () => setPaused(false));
on('btn-restart', startRace);
on('btn-quit', () => enterMenu());
on('btn-retry', startRace);
on('btn-res-menu', () => enterMenu());
on('btn-next', () => {
  const next = S.trackIdx + 1;
  if (next >= TRACKS.length || !trackUnlocked(next)) return;
  save.track = next;
  persist();
  startRace();
});
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
  Promise.race([enterLandscapeFullscreen(), new Promise((r) => setTimeout(r, 800))]).finally(closeGate);
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

input.autoGas = save.autoGas == null ? input.touchUI : save.autoGas;
input.on.pause = () => setPaused(!S.paused);
input.on.respawn = () => {
  if (S.mode === 'race' && !S.paused && S.player.mode !== 'crash') S.player.respawn();
};
input.on.primary = clickPrimary;
input.on.back = () => {
  if (['screen-tracks', 'screen-garage', 'screen-howto'].includes(S.screen)) showScreen('screen-title');
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
$('touch').addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    setPaused(true);
    Audio.suspend();
  } else {
    Audio.resume();
  }
});
window.addEventListener('resize', resize);

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
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
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
  renderer.render(scene, camera);
  const p = S.player;
  if (S.mode === 'countdown') Audio.engine(0.15, input.state.gas, false, false, 0);
  else if (S.mode === 'race' || S.mode === 'finished') {
    const air = p.mode === 'air';
    Audio.engine(p.speed / p.type.top, !air && input.state.gas, p.boosting, air, air ? clamp(p.speed / 60, 0, 1) : 0);
  }
  if (hud.root.classList.contains('show')) updateHUD();
  perfMonitor(dt);
}

/* ====================================================================== boot */
function boot() {
  document.title = CONFIG.gameTitle || 'Speed Demons';
  $('title-text').textContent = CONFIG.gameTitle || 'Speed Demons';
  $('gate-title').textContent = CONFIG.gameTitle || 'Speed Demons';
  $('subtitle-text').textContent = CONFIG.subtitle || '';
  refreshFullscreenButtons();
  applyQuality();
  loadTrack(save.track);
  enterMenu();
  if (input.touchUI) showGate(false);
  $('loading').classList.add('done');
  last = performance.now();
  requestAnimationFrame(frame);
}

// Dev hook (only with ?debug in the URL): step the simulation without requestAnimationFrame.
if (new URLSearchParams(location.search).has('debug')) {
  window.__speedDemons = {
    S, input, save,
    step(seconds, draw = true) {
      const h = 1 / 60;
      for (let t = 0; t < seconds; t += h) {
        update(h);
        smoke.update(h);
        glow.update(h);
        S.trackView.update(h, S.time);
        updateCamera(h);
      }
      if (draw) {
        world.update(h, S.time, camera, S.player.pos);
        renderer.render(scene, camera);
        updateHUD();
      }
    },
  };
}

const fontsReady = document.fonts && document.fonts.load ? document.fonts.load('800 40px "Baloo 2"').catch(() => {}) : Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]).then(() => {
  try {
    boot();
  } catch (err) {
    $('loading-text').textContent = 'Sorry - this device could not start the game (' + err.message + ')';
    throw err;
  }
});
})();
