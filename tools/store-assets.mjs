#!/usr/bin/env node
// Renders the store images and preview videos the portals ask for, straight from the game,
// in headless Chrome. Output goes to dist/store/ (git ignores dist/).
//
//   node tools/store-assets.mjs            images (+ videos once tools/store-videos.mjs exists)
//   node tools/store-assets.mjs images     images only
//   node tools/store-assets.mjs videos     videos only; 'videos poki' only those whose file name
//                                          has 'poki', 'videos preview' a few stills per clip
//   node tools/store-assets.mjs scout 7,12 the hero camera on the first jumps of those tracks
//                                          ('all' or none: every track), as contact sheets in
//                                          dist/store/scout/
//
// CrazyGames: covers 1920x1080, 800x1200, 800x800 (title only, no other text) and preview
//             videos 15-20 s, 1080p landscape (16:9) and portrait (2:3), starting on the cover.
// Poki:       square thumbnail, at least 628x628, no text at all.
// Chrome is found automatically; set CHROME_PATH to use a specific browser.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'store');
const what = process.argv[2] || 'all';
fs.mkdirSync(out, { recursive: true });

/* ------------------------------------------------------------------ the shots */
// A shot: race `track` (index) in `car`/`color`, fly off jump number `jump` pitching the nose up
// to `pitch` radians (the start of a backflip), freeze `air` seconds after take-off, and place the
// camera relative to the car: cam = [back, side, up] metres behind it along its travel direction,
// out to the side the sun lights, and above it. It looks at the car raised by `lookUp` and pushed
// `lookAhead` along its path; `shiftX`/`shiftY` then slide the view so the car sits that many
// metres right of / above the centre of the picture (to keep it clear of the title).
// `flames` sizes the nitro flames (0 = off; against a bright sky they burn out to white spikes).
// Magma Mile's second jump: smoking volcanoes behind, the lit road and the rivals below.
const HERO = { track: 18, jump: 2, air: 0.62, pitch: 0.6, car: 'hyper', color: '#ff3b5c', cam: [6.5, 4.6, 1.4], lookUp: 0.6, lookAhead: 2, fov: 52, flames: 0 };
const IMAGES = [
  { file: 'crazygames-cover-1920x1080.png', w: 1920, h: 1080, title: 'left', shot: { ...HERO, cam: [7, 4.8, 1.4], shiftX: 2.8 } },
  { file: 'crazygames-cover-800x1200.png', w: 800, h: 1200, title: 'top', shot: { ...HERO, cam: [9, 4.6, 2], shiftX: 1.3, shiftY: -1.1, fov: 58 } },
  { file: 'crazygames-cover-800x800.png', w: 800, h: 800, title: 'top', shot: { ...HERO, cam: [7, 4.4, 1.6], shiftY: -1.1, fov: 56 } },
  { file: 'poki-thumbnail-628x628@2x.png', w: 628, h: 628, title: null, shot: { ...HERO, cam: [7.6, 4.8, 1.5], shiftX: 0.9, fov: 52 } },
];

/* ------------------------------------------------------------------ browser */
function findChrome() {
  const env = process.env.CHROME_PATH;
  const cands = env ? [env] : [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  const hit = cands.find((c) => c && fs.existsSync(c));
  if (!hit) throw new Error('Chrome/Edge not found - set CHROME_PATH');
  return hit;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-store-'));
const chrome = spawn(findChrome(), [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 100 && !targets; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++seq; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
}
async function capture(file, w, h, format = 'png') {
  const r = await send('Page.captureScreenshot', { format, quality: format === 'jpeg' ? 92 : undefined, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
}
function done(code = 0) {
  try { ws.close(); } catch { /* closing anyway */ }
  chrome.kill();
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked on Windows - fine */ } process.exit(code); }, 500);
}
process.on('uncaughtException', (e) => { console.error(e); done(1); });

async function viewport(w, h, dpr) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  await sleep(300);
  await evaluate('window.__speedDemons ? (__speedDemons.resize(), 1) : 0');
}

/* ------------------------------------------------------------------ page-side helpers */
const PAGE_HELPERS = `
window.__store = {
  // Hide the menus and buttons, and unless hud is set (gameplay footage) the race HUD too.
  hideUI(hud = false) {
    let st = document.getElementById('store-css');
    if (!st) { st = document.createElement('style'); st.id = 'store-css'; document.head.appendChild(st); }
    st.textContent = '#touch,.screen,#toast,#gate,#loading,#btn-pause,#btn-respawn,#hint' + (hud ? '' : ',#hud,#popups,#center-msg,#speedlines,#vignette,#flash') + '{display:none!important}' +
      '#promo-title{position:absolute;z-index:60;font-family:"Baloo 2",sans-serif;font-weight:800;font-style:italic;line-height:0.86;letter-spacing:-0.02em;' +
      'background:linear-gradient(180deg,#fff6b0 0%,#ffd23f 30%,#ff7a18 70%,#e0480c 100%);-webkit-background-clip:text;background-clip:text;color:transparent;' +
      '-webkit-text-stroke:0.035em #1b1f3b;filter:drop-shadow(0 0.06em 0 #1b1f3b) drop-shadow(0 0.12em 0.18em rgba(0,0,0,0.45));pointer-events:none}' +
      '#promo-title span{display:block}';
  },
  title(layout) {
    let t = document.getElementById('promo-title');
    if (!layout) { if (t) t.remove(); return; }
    if (!t) { t = document.createElement('div'); t.id = 'promo-title'; t.innerHTML = '<span>SPEED</span><span>DEMONS</span>'; document.getElementById('app').appendChild(t); }
    const W = innerWidth, H = innerHeight;
    if (layout === 'left') Object.assign(t.style, { left: W * 0.045 + 'px', top: H * 0.07 + 'px', fontSize: H * 0.2 + 'px', textAlign: 'left', right: 'auto' });
    else Object.assign(t.style, { left: '0', right: '0', top: H * 0.045 + 'px', fontSize: Math.min(W * 0.19, H * 0.15) + 'px', textAlign: 'center' });
  },
  // Start a race on the shot's track with an autopilot that holds the road, uses nitro, and in
  // the air pitches the nose up until it reaches shot.pitch.
  async start(shot) {
    const H = __speedDemons, S = H.S;
    S.freeCam = false; S.paused = false;
    H.save.car = shot.car; H.save.color = shot.color; H.save.track = shot.track;
    await H.startRace(false);
    let t = 0; while (S.mode !== 'race' && t < 6) { H.step(0.1, false); t += 0.1; }
    const p = S.player;
    H.input.poll = (air) => {
      const st = H.input.state;
      st.steer = air ? 0 : Math.max(-1, Math.min(1, -p.d * 0.45 - p.vd * 0.2));
      st.gas = true; st.brake = false; st.nitro = !air && p.nitro > 20;
      st.pitch = air && p.airTime > 0.12 && p.trickP < shot.pitch ? -1 : 0; st.roll = 0;
      return st;
    };
    this.jumps = 0; this.wasAir = false;
  },
  // Drive on until jump number n (counted from the start) is shot.air seconds old.
  toJump(shot, n) {
    const H = __speedDemons, S = H.S, p = S.player;
    S.freeCam = false; S.paused = false;
    for (let t = 0; t < 120 && S.mode === 'race'; t += 1 / 60) {
      H.step(1 / 60, false);
      const air = p.mode === 'air' && p.fallT === 0 && S.track.isGap(p.s);
      if (air && !this.wasAir) this.jumps++;
      this.wasAir = air;
      if (this.jumps === n && air && p.airTime >= shot.air) return true;
      if (this.jumps > n) return false;
    }
    return false;
  },
  async fly(shot) {
    await this.start(shot);
    return this.toJump(shot, shot.jump);
  },
  frame(shot) {
    const H = __speedDemons, S = H.S, p = S.player, cam = H.camera;
    S.paused = true; S.freeCam = true;
    H.glow.clear();
    const up = new THREE.Vector3(0, 1, 0);
    const fwd = new THREE.Vector3().copy(p.vel).setY(0).normalize();
    const side = new THREE.Vector3().crossVectors(fwd, up).normalize();
    if (side.dot(H.world.sunDir) < 0) side.negate(); // the camera goes on the sunlit side
    const [back, out, high] = shot.cam;
    cam.position.copy(p.pos).addScaledVector(fwd, -back).addScaledVector(side, out).addScaledVector(up, high);
    cam.up.set(0, 1, 0);
    cam.fov = shot.fov;
    cam.updateProjectionMatrix();
    const look = new THREE.Vector3().copy(p.pos).addScaledVector(up, shot.lookUp || 0).addScaledVector(fwd, shot.lookAhead || 0);
    cam.lookAt(look);
    cam.updateMatrixWorld();
    const shift = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(-(shot.shiftX || 0))
      .addScaledVector(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1), -(shot.shiftY || 0));
    cam.position.add(shift);
    cam.updateMatrixWorld();
    const fl = shot.flames ?? 1; // nitro flame size, 0 = off
    S.playerModel.flames.forEach((f) => { f.visible = fl > 0; f.scale.set(fl, fl, fl * 1.3); });
    H.world.update(0, S.time, cam, p.pos); // sun, shadows and sky follow the new camera
    H.weather.update(0, cam);
    H.renderer.render(H.scene, cam);
  },
  label(text) {
    let l = document.getElementById('scout-label');
    if (!l) { l = document.createElement('div'); l.id = 'scout-label'; l.style.cssText = 'position:absolute;left:8px;top:6px;z-index:70;font:700 22px sans-serif;color:#fff;text-shadow:0 1px 3px #000'; document.getElementById('app').appendChild(l); }
    l.textContent = text;
  },
};
1`;

/* ------------------------------------------------------------------ run */
const url = pathToFileURL(path.join(root, 'index.html')).href + '?debug';
await send('Page.enable');
await viewport(1280, 720, 1);
await send('Page.navigate', { url });
for (let i = 0; i < 60; i++) {
  await sleep(250);
  try { if (await evaluate(`!!(window.__speedDemons && document.getElementById('loading').classList.contains('done'))`)) break; } catch { /* still loading */ }
}
await evaluate(PAGE_HELPERS);
await evaluate('__store.hideUI(); 1');

if (what === 'all' || what === 'images') {
  for (const img of IMAGES) {
    await viewport(img.w, img.h, img.file.includes('@2x') ? 2 : 1);
    const ok = await evaluate(`__store.fly(${JSON.stringify(img.shot)})`);
    if (!ok) throw new Error(`${img.file}: never reached the jump`);
    await evaluate(`__store.title(${JSON.stringify(img.title)}); __store.frame(${JSON.stringify(img.shot)}); 1`);
    await sleep(400);
    const dpr = img.file.includes('@2x') ? 2 : 1;
    await capture(path.join(out, img.file), img.w, img.h);
    console.log(`dist/store/${img.file}  ${img.w * dpr}x${img.h * dpr}`);
  }
  await evaluate('__store.title(null); 1');
}

// Scout: shoot the hero camera on the first few jumps of each track, to pick the cover shot.
// An optional JSON argument overrides HERO, e.g. scout 7,12 '{"pitch":0,"car":"rocket"}'.
if (what === 'scout') {
  const list = process.argv[3] || 'all';
  const tracks = list !== 'all' ? list.split(',').map(Number) : await evaluate('SD.tracks.TRACKS.length').then((n) => [...Array(n).keys()]);
  const shot = { ...HERO, ...JSON.parse(process.argv[4] || '{}') };
  const dir = path.join(out, 'scout');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'raw'), { recursive: true });
  await viewport(640, 360, 1);
  let n = 0;
  for (const track of tracks) {
    await evaluate(`__store.start(${JSON.stringify({ ...shot, track })})`);
    for (let jump = 1; jump <= 3; jump++) {
      if (!(await evaluate(`__store.toJump(${JSON.stringify(shot)}, ${jump})`))) break;
      await evaluate(`__store.label('track ${track}  jump ${jump}'); __store.frame(${JSON.stringify(shot)}); 1`);
      await sleep(150);
      await capture(path.join(dir, 'raw', String(++n).padStart(3, '0') + '.png'), 640, 360);
    }
  }
  await evaluate(`__store.label(''); 1`);
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, 'raw', '%03d.png'), '-vf', 'tile=3x4', path.join(dir, 'sheet-%02d.png')]);
  console.log(ff.status === 0 ? `dist/store/scout/sheet-*.png  ${n} shots` : `dist/store/scout/raw/  ${n} shots (no ffmpeg for sheets)`);
}

if (what === 'all' || what === 'videos') {
  const videos = path.join(root, 'tools', 'store-videos.mjs');
  if (fs.existsSync(videos)) {
    const { makeVideos } = await import(pathToFileURL(videos).href);
    await makeVideos({ evaluate, viewport, capture, out, sleep, IMAGES, only: process.argv[3] });
  } else {
    console.log('preview videos: not implemented yet (tools/store-videos.mjs)');
  }
}
done(0);
