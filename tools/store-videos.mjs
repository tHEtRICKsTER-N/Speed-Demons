// Preview videos for the portals, rendered frame by frame from the game. store-assets.mjs opens
// the browser and calls makeVideos(); the encoding needs ffmpeg on the PATH.
//
// Every frame steps the race by exactly 1/fps and CSS animations (trick popups, callouts) are
// wound to the same clock, so the footage plays at true speed however slow the renderer is.
//
// CrazyGames: 15-20 s, no sound, 1080p landscape (16:9) and portrait (2:3), opening on the cover.
// Poki:       animated thumbnail, 1080x1080, 50 fps or more, 4-6 s, 2-3 scenes of 1-2 s each.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A clip races `track` in the cover car and starts `from` metres past the start of feature
// `at` = [kind, n], the n-th (from 0) jump, loop, cork(screw) or obstacle of that type (cone,
// hammer, spinner...), then records `len` seconds. A jump's feature starts 40 m before take-off.
// In the air the autopilot does `turns` of `trick` (flip, roll or spin); on the ground it holds
// lateral offset `lane` (0 = the middle). `skip` s of the clip play out before recording starts.
const CLIPS = {
  loop: { track: 3, at: ['loop', 0], from: 15, len: 2.4 }, // Sunset Loops
  flip: { track: 17, at: ['jump', 0], from: 30, skip: 0.2, len: 3.6, trick: 'flip', turns: 2 }, // Avalanche Alley, snow; lands 2.9 s in
  cork: { track: 6, at: ['cork', 0], from: 5, len: 2.4 }, // Candy Corkscrew
  overtake: { track: 12, at: ['cone', 0], from: -45, len: 2.6 }, // Canyon Run: 3rd to 1st
  night: { track: 9, at: ['jump', 1], from: 30, skip: 0.3, len: 3.6, trick: 'roll', turns: 2 }, // Neon Nights; lands 3.3 s in
};

// Each video opens on its cover: held for `hold` s, then the race resumes and over `glide` s the
// camera flies from the cover pose into the chase camera; `resume` s later it cuts to the clips,
// each a name from CLIPS or [name, overrides].
const TRAILER = ['loop', 'flip', 'cork', 'overtake', 'night'];
const VIDEOS = [
  { file: 'crazygames-preview-1920x1080.mp4', w: 1920, h: 1080, fps: 30, cover: 0, hold: 1, glide: 1.2, resume: 2.4, clips: TRAILER },
  { file: 'crazygames-preview-1080x1620.mp4', w: 1080, h: 1620, fps: 30, cover: 1, hold: 1, glide: 1.2, resume: 2.4, clips: TRAILER },
  { file: 'poki-animated-thumbnail-1080x1080.mp4', w: 1080, h: 1080, fps: 60, cover: 3, hold: 0.4, glide: 0.9, resume: 1.5, clips: [['loop', { len: 1.6 }], ['flip', { skip: 1.6, len: 1.9 }]] }, // 5.4 s
];

const PAGE = `
window.__video = {
  // Autopilot: hold the road at offset lane, use nitro, do the trick in the air.
  drive(trick, lane = 0, turns = 1) {
    const H = __speedDemons, p = H.S.player, full = Math.PI * 2 * turns - 0.9;
    H.input.poll = (air) => {
      const st = H.input.state;
      st.steer = air ? 0 : Math.max(-1, Math.min(1, -(p.d - lane) * 0.45 - p.vd * 0.2));
      st.gas = true; st.brake = false; st.nitro = !air && p.nitro > 20;
      st.pitch = 0; st.roll = 0;
      if (air && p.fallT === 0 && p.airTime > 0.12) {
        if (trick === 'flip' && p.trickP < full) st.pitch = -1;
        if (trick === 'roll' && Math.abs(p.trickR) < full) st.roll = 1;
        if (trick === 'spin' && Math.abs(p.trickY) < full) st.steer = 1;
      }
      return st;
    };
  },
  // Race (without drawing) to the clip's start. False if it's never reached.
  async seek(c) {
    const H = __speedDemons, S = H.S;
    S.adPause = true; // the game loop keeps its hands off: frames are stepped from here
    this.glide = null;
    document.getElementById('hud').style.opacity = '';
    __store.title(null);
    await __store.start({ ...c, pitch: 0 });
    const [kind, n] = c.at;
    const list = S.track.features.filter((f) => f.kind === kind).map((f) => f.s0)
      .concat(S.track.obstacles.filter((o) => o.type === kind).map((o) => o.s));
    if (list[n] == null) return false;
    const target = list[n] + (c.from || 0), p = S.player;
    const emit = p.emitFn;
    this.log = [];
    this.clock = 0;
    p.emitFn = (type, data) => {
      const at = Math.round(p.s) + 'm' + (this.clock ? ' (' + (this.clock / 1000).toFixed(1) + 's in)' : '');
      if (type === 'land') this.log.push(at + ' ' + p.airTime.toFixed(1) + 's air' + data.tricks.map((k) => ' ' + k.name).join(','));
      if (type === 'crash') this.log.push(at + ' CRASH');
      emit(type, data);
    };
    this.drive(null, c.lane);
    for (let t = 0; t < 150 && S.mode === 'race' && p.s < target; t += 1 / 60) H.step(1 / 60, false);
    if (S.mode !== 'race' || p.s < target) return false;
    this.log.push('-- clip at ' + Math.round(p.s) + 'm');
    this.drive(c.trick, c.lane, c.turns);
    this.cut();
    return true;
  },
  // Carry on from the frozen cover: the camera glides from its cover pose (kept at the same
  // offset from the car, so the car stays framed) to the chase camera.
  resume(glide) {
    const H = __speedDemons, S = H.S, cam = H.camera;
    this.glide = { t: 0, len: glide, rel: cam.position.clone().sub(S.player.pos), quat: cam.quaternion.clone(), fov: cam.fov };
    S.adPause = true; S.freeCam = false; S.paused = false;
    this.drive(null);
    __store.hideUI(true);
    this.cut();
  },
  // A new shot: animations already running are treated as long finished.
  cut() {
    this.clock = 0;
    this.anims = new WeakMap();
    for (const a of document.getAnimations()) this.anims.set(a, -1e7);
    this.crashed = false;
  },
  // One video frame: step the race, blend the camera while gliding, draw, and wind every CSS
  // animation to the video clock.
  tick(dt) {
    const H = __speedDemons, S = H.S, cam = H.camera;
    H.step(dt, false);
    if (S.player.mode === 'crash') this.crashed = true;
    const g = this.glide, hud = document.getElementById('hud'), title = document.getElementById('promo-title');
    if (g) {
      g.t += dt;
      const k = Math.min(1, g.t / g.len), e = k * k * (3 - 2 * k);
      cam.position.lerpVectors(g.rel.clone().add(S.player.pos), cam.position.clone(), e);
      cam.quaternion.slerpQuaternions(g.quat, cam.quaternion.clone(), e);
      cam.fov = g.fov + (cam.fov - g.fov) * e;
      cam.updateProjectionMatrix();
      if (title) title.style.opacity = Math.max(0, 1 - g.t / 0.35);
      hud.style.opacity = e;
      if (k >= 1) { this.glide = null; if (title) title.remove(); hud.style.opacity = ''; }
    }
    H.draw(dt);
    this.clock += dt * 1000;
    for (const a of document.getAnimations()) {
      let start = this.anims.get(a);
      if (start === undefined) { start = this.clock - dt * 1000; this.anims.set(a, start); }
      if (a.playState !== 'paused') a.pause();
      a.currentTime = Math.max(0, this.clock - start);
    }
    return this.crashed;
  },
};
1`;

// only: 'preview' for the clip contact sheets, else a part of the file names to render.
export async function makeVideos({ evaluate, viewport, capture, out, sleep, IMAGES, only }) {
  await evaluate(PAGE);
  if (only === 'preview') return previewClips({ evaluate, viewport, capture, out, sleep, IMAGES });
  for (const v of VIDEOS.filter((x) => !only || x.file.includes(only))) {
    const cover = IMAGES[v.cover];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-video-'));
    let n = 0;
    const next = () => path.join(dir, String(n++).padStart(5, '0') + '.jpg');
    const dt = 1 / v.fps;
    const record = async (seconds, label) => {
      const frames = Math.round(seconds * v.fps);
      let crashed = false;
      for (let i = 0; i < frames; i++) {
        crashed = (await evaluate(`__video.tick(${dt})`)) || crashed;
        await capture(next(), v.w, v.h, 'jpeg');
      }
      if (crashed) console.warn(`  ${v.file}: the car crashed during ${label}`);
    };

    await viewport(v.w, v.h, 1);
    await evaluate('__store.hideUI(false); 1');
    if (!(await evaluate(`__store.fly(${JSON.stringify(cover.shot)})`))) throw new Error(`${v.file}: never reached the cover jump`);
    await evaluate(`__store.title(${JSON.stringify(cover.title)}); __store.frame(${JSON.stringify(cover.shot)}); 1`);
    await sleep(300);
    const first = next();
    await capture(first, v.w, v.h, 'jpeg');
    for (let i = 1; i < Math.round(v.hold * v.fps); i++) fs.copyFileSync(first, next());
    await evaluate(`__video.resume(${v.glide}); 1`);
    await record(v.resume, 'the opening');

    for (const entry of v.clips) {
      const [name, o] = Array.isArray(entry) ? entry : [entry, {}];
      const c = { ...CLIPS[name], ...o };
      if (!(await evaluate(`__video.seek(${JSON.stringify({ ...cover.shot, ...c })})`))) throw new Error(`${v.file}: clip ${name} never reached its start`);
      for (let i = 0; i < Math.round((c.skip || 0) * v.fps); i++) await evaluate(`__video.tick(${dt})`);
      await record(c.len, name);
    }

    const file = path.join(out, v.file);
    const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(v.fps), '-i', path.join(dir, '%05d.jpg'),
      // JPEG frames are full range; convert to the TV range every web player expects
      '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-color_range', 'tv',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', '-an', file], { stdio: 'inherit' });
    fs.rmSync(dir, { recursive: true, force: true });
    if (ff.status !== 0) throw new Error('ffmpeg failed - is it installed and on the PATH?');
    const mb = fs.statSync(file).size / 1e6;
    console.log(`dist/store/${v.file}  ${v.w}x${v.h} ${v.fps} fps  ${(n / v.fps).toFixed(1)} s  ${mb.toFixed(1)} MB`);
  }
  await evaluate('__store.hideUI(false); 1');
}

// A contact sheet with four stills from each clip (start to end), to check them quickly.
async function previewClips({ evaluate, viewport, capture, out }) {
  const dir = path.join(out, 'video-preview');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'raw'), { recursive: true });
  const shot = { car: 'hyper', color: '#ff3b5c' };
  await viewport(640, 360, 1);
  await evaluate('__store.hideUI(true); 1');
  let n = 0;
  for (const [name, c] of Object.entries(CLIPS)) {
    if (!(await evaluate(`__video.seek(${JSON.stringify({ ...shot, ...c })})`))) { console.warn(`${name}: never reached its start`); continue; }
    const frames = Math.round(c.len * 30);
    const picks = new Set([0, Math.round(frames / 3), Math.round((frames * 2) / 3), frames - 1]);
    let crashed = false;
    for (let i = 0; i < frames; i++) {
      crashed = (await evaluate(`__video.tick(${1 / 30})`)) || crashed;
      if (!picks.has(i)) continue;
      await evaluate(`__store.label(${JSON.stringify(`${name} ${(i / 30).toFixed(1)}s`)}); 1`);
      await capture(path.join(dir, 'raw', String(++n).padStart(3, '0') + '.png'), 640, 360);
    }
    console.log(`${name}: ${crashed ? 'CRASHED' : 'clean'} | ${(await evaluate('__video.log')).join(' | ')}`);
  }
  await evaluate(`__store.label(''); 1`);
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, 'raw', '%03d.png'), '-vf', 'tile=4x3', path.join(dir, 'sheet-%02d.png')]);
  console.log('dist/store/video-preview/sheet-*.png');
}
