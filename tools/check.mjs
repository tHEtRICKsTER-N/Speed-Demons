#!/usr/bin/env node
// Sanity check for Speed Demons. Run before every release:
//
//   node tools/check.mjs               geometry audit + browser checks (headless Chrome)
//   node tools/check.mjs --portals     also Poki / CrazyGames SDK flows (needs internet)
//   node tools/check.mjs --shots       also save a mid-race screenshot of every track to dist/check/
//   node tools/check.mjs --tracks 0,5  only race these tracks
//
// Exits with code 1 if anything fails. Chrome is found automatically; set CHROME_PATH to override.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const tracksArg = args.includes('--tracks') ? args[args.indexOf('--tracks') + 1] : null;
const shotsDir = path.join(root, 'dist', 'check');
if (flag('--shots')) fs.mkdirSync(shotsDir, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -  ' + detail : ''}`);
}

/* ================================================================== 1. geometry audit (no browser) */
function geometryAudit() {
  const ctx = { console };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['vendor/three.min.js', 'js/util.js', 'js/track.js', 'js/obstacles.js', 'js/tracks.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  const { TRACKS, THEMES, buildTrack } = ctx.SD.tracks;
  const { SLAB } = ctx.SD.track;
  const ids = new Set();
  for (const def of TRACKS) {
    if (ids.has(def.id)) check(`track ids unique`, false, def.id);
    ids.add(def.id);
    const tr = buildTrack(def);
    const { n, P, N, w, gap, grip } = tr;
    const floorY = THEMES[def.theme].floorY;
    const issues = [];
    const inLoop = (i, j) => tr.features.some((f) => f.kind === 'loop' && i >= f.s0 - 10 && j <= f.s1 + 40);
    const seen = new Set();
    for (let i = 0; i < n; i += 2) {
      for (let j = i + 80; j < n; j += 2) {
        const horiz = Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z);
        if (!inLoop(i, j) && horiz < w[i] + w[j] + 4 && Math.abs(P[i].y - P[j].y) < 9) {
          const key = `${Math.round(i / 40)}-${Math.round(j / 40)}`;
          if (!seen.has(key)) issues.push(`road ${i}m and ${j}m pass ${horiz.toFixed(1)}m apart`);
          seen.add(key);
        }
      }
    }
    for (let i = 20; i < n; i += 38) {
      if (gap[i] || grip[i] > 0 || N[i].y < 0.9) continue;
      const top = P[i].y - SLAB;
      if (top - floorY <= 4) continue;
      for (let j = 0; j < n; j++) {
        if (Math.abs(i - j) >= 30 && Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z) < w[j] + 2 && P[j].y < top && P[j].y > floorY) {
          issues.push(`pillar at ${i}m through the road at ${j}m`);
          break;
        }
      }
    }
    for (const c of tr.coins) if (Math.abs(c.d) > w[tr.index(c.s)] - 0.8) issues.push(`coin off the road at ${c.s.toFixed(0)}m`);
    for (const o of tr.obstacles) {
      const k = tr.index(o.s);
      const half = o.hw || (o.type === 'cone' ? 0.3 : o.type === 'bouncer' ? 2.1 : 0);
      if (Math.abs(o.d || 0) + half > w[k] + 0.01) issues.push(`${o.type} off the road at ${o.s.toFixed(0)}m`);
      for (let j = k - 6; j <= k + 6; j++) {
        if (grip[Math.max(0, j)] > 0 || gap[Math.max(0, j)]) {
          issues.push(`${o.type} inside a loop/jump at ${o.s.toFixed(0)}m`);
          break;
        }
      }
      if (o.type === 'bouncer') {
        for (let j = k; j < Math.min(n, k + 95); j++) {
          if (gap[j] || grip[j] > 0) {
            issues.push(`bouncer at ${o.s.toFixed(0)}m has no clear landing`);
            break;
          }
        }
      }
      // static obstacles must leave a lane a car fits through (car 1.9 m + margin)
      if (o.type === 'barrier') {
        const free = Math.max(w[k] - (o.d + o.hw), o.d - o.hw + w[k]);
        if (free < 2.6) issues.push(`barrier at ${o.s.toFixed(0)}m leaves only ${free.toFixed(1)} m`);
      }
    }
    if (Math.min(...P.map((p) => p.y)) < floorY + 20) issues.push('track dips close to the ground');
    check(`geometry ${def.id}`, issues.length === 0, issues.slice(0, 3).join('; '));
  }
  return TRACKS.length;
}

/* ================================================================== browser helpers */
function findChrome() {
  const cands = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  const hit = cands.find((c) => c && fs.existsSync(c));
  if (!hit) throw new Error('Chrome/Edge not found - set CHROME_PATH');
  return hit;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openBrowser() {
  const port = 9500 + Math.floor(Math.random() * 400);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-check-'));
  const proc = spawn(findChrome(), ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); }
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++seq; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  const b = {
    send, evaluate, errors,
    async viewport(w, h, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
      await send('Emulation.setEmulatedMedia', { features: mobile ? [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] : [] });
    },
    async open(url) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 80; i++) {
        await sleep(250);
        try { if (await evaluate(`!!(window.__speedDemons && document.getElementById('loading').classList.contains('done'))`)) return true; } catch { /* loading */ }
      }
      return false;
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    },
    close() {
      try { ws.close(); } catch { /* closing */ }
      proc.kill();
      setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked on Windows */ } }, 500);
    },
  };
  return b;
}

// Page-side autopilot: dodges obstacles with the same planners as the rivals, uses nitro, no tricks.
const AUTOPILOT = `
window.__auto = (H) => {
  const S = H.S, p = S.player, PH = window.SD.physics;
  let lane = 0;
  H.input.poll = (air) => {
    const st = H.input.state;
    const plan = PH.planLane(S.track, p.s, lane);
    if (plan !== null) lane = plan;
    const dz = PH.planDodge(S.track, p.s, p.d, p.v, S.track.clock);
    let slow = false;
    if (dz && dz.lane !== undefined) { lane = dz.lane; if (dz.speed && p.v > dz.speed) slow = true; }
    else if (dz && dz.slow) slow = p.v > 22;
    if (plan === null && !dz && !S.track.obstacles.some((o) => o.s > p.s - 3 && o.s < p.s + 80)) lane = 0;
    st.steer = air ? 0 : Math.max(-1, Math.min(1, (lane - p.d) * 0.6 - p.vd * 0.2)); // in the air, steering spins the car
    st.gas = !slow; st.brake = slow && p.v > 20; st.nitro = !air && !slow && p.nitro > 30; st.pitch = 0; st.roll = 0;
    return st;
  };
};
1`;

/* ================================================================== 2. browser checks */
async function browserChecks(nTracks) {
  const b = await openBrowser();
  const url = pathToFileURL(path.join(root, 'index.html')).href + '?debug';
  try {
    await b.viewport(1280, 720);
    const booted = await b.open(url);
    check('boots from file:// with no errors', booted && b.errors.length === 0, b.errors[0] || '');
    const boot = await b.evaluate(`JSON.stringify({ title: document.title, screen: __speedDemons.S.screen, font: document.fonts.check('800 20px "Baloo 2"') })`);
    const bj = JSON.parse(boot);
    check('title screen and bundled font', bj.title === 'Speed Demons' && bj.screen === 'screen-title' && bj.font, boot);
    await b.evaluate(AUTOPILOT);

    // every track by autopilot
    const list = tracksArg ? tracksArg.split(',').map(Number) : [...Array(nTracks).keys()];
    for (const ti of list) {
      const r = JSON.parse(await b.evaluate(`(async () => {
        const H = __speedDemons, S = H.S;
        S.freeCam = false; S.paused = false;
        H.save.track = ${ti};
        await H.startRace(false);
        const p = S.player, counts = {};
        const orig = p.emitFn;
        p.emitFn = (t, d) => { counts[t] = (counts[t] || 0) + 1; orig(t, d); };
        __auto(H);
        let t = 0, shot = false;
        while (S.mode !== 'finished' && t < 240) {
          H.step(0.25, false); t += 0.25;
          if (!shot && ${flag('--shots')} && p.s > S.track.startS + (S.track.finishS - S.track.startS) * 0.45) { shot = true; window.__shotNow = true; break; }
        }
        return JSON.stringify({ id: S.def.id, mode: S.mode, t: +S.raceTime.toFixed(1), pos: S.position, counts });
      })()`));
      if (flag('--shots') && r.mode !== 'finished') {
        await b.evaluate('__speedDemons.step(0.02, true); 1');
        await sleep(200);
        await b.shot(path.join(shotsDir, `track-${String(ti).padStart(2, '0')}-${r.id}.png`));
        Object.assign(r, JSON.parse(await b.evaluate(`(async () => {
          const H = __speedDemons, S = H.S; let t = 0;
          while (S.mode !== 'finished' && t < 240) { H.step(0.25, false); t += 0.25; }
          return JSON.stringify({ mode: S.mode, t: +S.raceTime.toFixed(1), pos: S.position });
        })()`)));
      }
      const c = r.counts;
      const hits = ['barrier', 'hammer', 'shove'].reduce((n, k) => n + (c[k] || 0), 0);
      // a hammer can knock you off the road (by design); any other fall means something is wrong
      const badFall = (c.fall || 0) > (c.hammer || 0);
      check(`race ${r.id}`, r.mode === 'finished' && !badFall, `${r.t}s, P${r.pos}, obstacle hits ${hits}, crashes ${c.crash || 0}${c.fall ? `, fell ${c.fall}x` : ''}`);
    }

    // missed jump: falls through, respawns blinking
    const fall = JSON.parse(await b.evaluate(`(async () => {
      const H = __speedDemons, S = H.S; H.save.track = 0; await H.startRace(false);
      const p = S.player, log = [];
      const orig = p.emitFn; p.emitFn = (t, d) => { log.push(t); orig(t, d); };
      H.input.poll = () => { const st = H.input.state; st.steer = Math.max(-1, Math.min(1, -p.d * 0.45 - p.vd * 0.2)); st.gas = p.v < 17; st.brake = p.v > 19; st.nitro = false; st.pitch = 0; st.roll = 0; p.padT = 0; return st; };
      let t = 0; while (!log.includes('respawn') && t < 90) { H.step(1 / 60, false); t += 1 / 60; }
      const blink = []; for (let k = 0; k < 12; k++) { H.step(0.075, false); blink.push(p.model.root.visible ? 1 : 0); }
      return JSON.stringify({ log: log.filter((e) => ['takeoff', 'miss', 'fall', 'respawn', 'land'].includes(e)), blink: blink.join('') });
    })()`));
    const fl = fall.log.join(',');
    check('missed jump falls through and respawns blinking', fl.includes('miss,fall,respawn') && !fl.includes('miss,land') && /10|01/.test(fall.blink), `${fl} | ${fall.blink}`);

    // driving off an open edge
    const edge = JSON.parse(await b.evaluate(`(async () => {
      const H = __speedDemons, S = H.S; H.save.track = 0; await H.startRace(false);
      const p = S.player, log = [];
      const orig = p.emitFn; p.emitFn = (t, d) => { log.push(t); orig(t, d); };
      let t = 0; while (S.mode !== 'race' && t < 10) { H.step(0.1, false); t += 0.1; }
      H.input.poll = () => { const st = H.input.state; st.steer = 1; st.gas = true; st.brake = false; st.nitro = false; st.pitch = 0; st.roll = 0; return st; };
      t = 0; while (!log.includes('respawn') && t < 30) { H.step(1 / 60, false); t += 1 / 60; }
      return JSON.stringify({ takeoffs: log.filter((e) => e === 'takeoff').length, respawn: log.includes('respawn'), ghost: p.ghostT > 0 });
    })()`));
    check('driving off an edge falls cleanly and respawns', edge.respawn && edge.ghost && edge.takeoffs <= 3, JSON.stringify(edge));

    // garage: buy and upgrade
    const gar = JSON.parse(await b.evaluate(`(() => {
      const H = __speedDemons; H.enterMenu(); H.save.coins = 30000;
      document.getElementById('btn-garage').click();
      document.querySelector('[data-car="rally"]').click();
      document.querySelector('[data-buy]').click();
      document.querySelector('[data-up="engine"]').click();
      const r = { car: H.save.car, owned: !!H.save.owned.rally, engine: (H.save.upgrades.rally || {}).engine || 0, coins: H.save.coins };
      document.getElementById('btn-garage-done').click();
      return JSON.stringify(r);
    })()`));
    check('garage buys and upgrades a car', gar.car === 'rally' && gar.owned && gar.engine === 1 && gar.coins < 30000, JSON.stringify(gar));

    // daily reward logic
    const daily = JSON.parse(await b.evaluate(`(() => {
      const e = __speedDemons.eco, s = __speedDemons.save, day = 864e5, now = Date.now();
      s.daily = { last: null, streak: 0 };
      const a = e.claimDaily(1, now), again = e.claimDaily(1, now), next = e.claimDaily(1, now + day), skip = e.dailyStatus(now + 3 * day).streak;
      return JSON.stringify({ a, again, next, skip });
    })()`));
    check('daily reward streak', daily.a === 100 && daily.again === 0 && daily.next === 150 && daily.skip === 1, JSON.stringify(daily));

    // phone: forced landscape + a race with touch controls
    await b.viewport(390, 844, true);
    await b.open(url);
    await b.evaluate(AUTOPILOT);
    const phone = JSON.parse(await b.evaluate(`(async () => {
      const H = __speedDemons, S = H.S;
      const rotated = document.body.classList.contains('force-landscape');
      document.getElementById('gate').classList.remove('active');
      H.save.track = 12; await H.startRace(false); __auto(H);
      let t = 0; while (S.mode !== 'finished' && t < 240) { H.step(0.25, false); t += 0.25; }
      H.step(3.5, false);
      return JSON.stringify({ rotated, touch: document.getElementById('touch').classList.contains('show') || S.mode === 'finished', finished: S.mode === 'finished', results: S.screen === 'screen-results' });
    })()`));
    check('phone upright: forced landscape, race and results', phone.rotated && phone.finished && phone.results, JSON.stringify(phone));
    check('no console errors during the run', b.errors.length === 0, b.errors.slice(0, 2).join(' | '));
  } finally {
    b.close();
  }
}

/* ================================================================== 3. portal flows (optional) */
function staticServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function portalChecks() {
  const server = await staticServer();
  const base = `http://localhost:${server.address().port}/index.html`;
  const b = await openBrowser();
  try {
    await b.viewport(1280, 720);
    for (const platform of ['crazygames', 'poki']) {
      await b.open(`${base}?platform=${platform}&debug`);
      await sleep(2500);
      await b.evaluate(AUTOPILOT);
      const r = JSON.parse(await b.evaluate(`(async () => {
        const H = __speedDemons, S = H.S, P = H.platform, ev = [];
        P.on('adStart', () => ev.push('adStart')); P.on('adEnd', () => ev.push('adEnd'));
        const info = { platform: P.name, hasAds: P.hasAds, fsHidden: document.getElementById('btn-fs').hidden };
        H.save.track = 0; await H.startRace(false); __auto(H);
        let t = 0; while (S.mode !== 'finished' && t < 200) { H.step(0.25, false); t += 0.25; }
        H.step(3.5, true);
        window.__ev = ev;
        window.__before = H.save.coins;
        return JSON.stringify(info);
      })()`));
      // a real click: ad SDKs only play video after a genuine user gesture
      await sleep(800);
      const c = await b.evaluate(`(() => { const r = document.getElementById('btn-double').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      for (const type of ['mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: c[0], y: c[1], button: 'left', clickCount: 1 });
      for (let k = 0; k < 60; k++) {
        await sleep(500);
        if (await b.evaluate('__speedDemons.S.doubled || __ev.includes("adEnd")')) break;
      }
      await sleep(800);
      Object.assign(r, JSON.parse(await b.evaluate(`JSON.stringify({ doubled: __speedDemons.S.doubled, gained: __speedDemons.save.coins - __before, ev: __ev })`)));
      check(`${platform} SDK: ads, rewarded double coins, full screen hidden`, r.hasAds && r.fsHidden && r.doubled && r.gained > 0, JSON.stringify(r));
    }
  } finally {
    b.close();
    server.close();
  }
}

/* ================================================================== run */
const n = geometryAudit();
await browserChecks(n);
if (flag('--portals')) await portalChecks();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ` - ${failed.length} failed` : ''}`);
setTimeout(() => process.exit(failed.length ? 1 : 0), 700);
