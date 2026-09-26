/* Arcade car physics: grounded driving along the track ribbon, ballistic flight with
 * flips / spins / rolls, graded landings, crashes, respawns - plus the AI drivers. */
(() => {
'use strict';
const SD = (window.SD ||= {});
const { G, STEP, makeFrame } = SD.track;
const { clamp, damp, rand, smooth, TAU } = SD.util;

const DRIFT = 0.45; // how strongly corners push you wide (arcade-friendly < 1)
const MAX_GROUND = 78; // m/s hard cap, even with nitro + pads + downhill
const JUMP_MAX = 50; // launch speed cap off ramps, so every jump lands on its landing zone
const CREST_MAX = 58; // same idea for the rare hop over a sharp hill crest
const DOWNFORCE = 0.004; // keeps you planted over crests at speed - air comes from ramps
const AI_TOP = 52; // AI pace reference (m/s); their car model is cosmetic
const FALL_TIME = 1.4; // seconds of falling (after missing the road) before the respawn
const GHOST_TIME = 2; // seconds of blinking, un-bumpable car after a respawn
const OBS = () => SD.obstacles; // loaded after this file's helpers are defined

// Lane choice around static obstacles (cones, barriers, slicks): looks at the next cluster of
// them (within `ahead` m) and returns the nearest lateral line with room for a car, or null if the
// line `d` is already clear. One cluster at a time, so a car can weave through a slalom.
function planLane(track, s, d, ahead = 80) {
  const spans = [];
  let first = null;
  for (const o of track.obstacles) {
    if (o.s < s - 3) continue;
    if (o.s > s + ahead || (first !== null && o.s > first + 10)) break;
    const sp = OBS().blockSpan(o);
    if (!sp) continue;
    if (first === null) first = o.s;
    spans.push(sp);
  }
  if (!spans.length) return null;
  const need = 1.35; // half a car plus a margin
  const w = track.w[track.index(first)] - 1.1;
  const room = (x) => spans.reduce((m, [a, b]) => Math.min(m, x < a ? a - x : x > b ? x - b : 0), Infinity);
  if (room(d) >= need) return null;
  let best = d;
  let bestScore = -Infinity;
  for (let x = -w; x <= w + 1e-6; x += w / 8) {
    const r = room(x);
    const score = (r >= need ? 10 : r) - 0.15 * Math.abs(x - d);
    if (score > bestScore) {
      bestScore = score;
      best = x;
    }
  }
  return best;
}

// Moving obstacles (hammers, sliders, spinners) in the next 55 m: predict where they'll be when
// we get there. Tries full speed first, then easing off (arriving later), and returns
// { lane, speed } for the fastest reachable line that's clear the whole time we're passing
// (speed null = no need to slow), null if the current line is already fine, or { slow: true }.
function planDodge(track, s, d, v, t) {
  const O = OBS();
  for (const o of track.obstacles) {
    if (o.s < s - 3) continue;
    if (o.s > s + 55) break;
    if (O.STATIC[o.type] || o.type === 'bouncer') continue;
    const dist = Math.max(0, o.s - s);
    const w = track.w[track.index(o.s)] - 1.1;
    for (const k of [1, 0.85, 0.7, 0.55]) {
      const vv = Math.max(v * k, 8);
      const tArr = t + dist / vv;
      // sweep the car through the obstacle: nose to tail, each point at the time it gets there
      const clearAt = (x) => {
        for (let ds = -3.5; ds <= 3.51; ds += 0.875) if (O.hitTest(o, o.s + ds, x, tArr + ds / vv)) return false;
        return true;
      };
      if (k === 1 && clearAt(d)) return null;
      const reach = (5.5 * dist) / vv + 0.3;
      let best = null;
      for (let x = -w; x <= w + 1e-6; x += w / 6) {
        if (Math.abs(x - d) <= reach && clearAt(x) && (best === null || Math.abs(x - d) < Math.abs(best - d))) best = x;
      }
      if (best !== null) return { lane: best, speed: k < 1 ? vv : null };
    }
    return { slow: true };
  }
  return null;
}
const V3 = THREE.Vector3;
const tv = new V3();
const tv2 = new V3();
const tv3 = new V3();
const tq = new THREE.Quaternion();
const tq2 = new THREE.Quaternion();
const te = new THREE.Euler();
const tm = new THREE.Matrix4();
const Y = new V3(0, 1, 0);

// Orientation from a track frame, turned by `heading` radians (+ = right) around N.
function orient(q, T, N, R, heading) {
  const c = Math.cos(heading), s = Math.sin(heading);
  const fwd = tv.copy(T).multiplyScalar(c).addScaledVector(R, s);
  const right = tv2.crossVectors(fwd, N);
  tm.makeBasis(right, N, tv3.copy(fwd).negate());
  return q.setFromRotationMatrix(tm);
}

/* ====================================================================== player */
class PlayerCar {
  constructor(track, type, model, name) {
    this.isPlayer = true;
    this.track = track;
    this.type = type;
    this.model = model;
    this.name = name;
    this.f = makeFrame();
    this.pos = new V3();
    this.quat = new THREE.Quaternion();
    this.vel = new V3();
    this.ang = new V3();
    this.up = new V3(0, 1, 0);
    this.fwd = new V3(0, 0, -1);
    this.emitFn = null;
    this.reset(track.startS - 20, 0);
  }

  on(fn) { this.emitFn = fn; }
  emit(type, data) { if (this.emitFn) this.emitFn(type, data || {}); }

  reset(s, d) {
    this.mode = 'ground';
    this.s = s;
    this.d = d;
    this.v = 0;
    this.vd = 0;
    this.heading = 0;
    this.steerVis = 0;
    this.accel = 0;
    this.nitro = 0;
    this.boosting = false;
    this.padT = 0;
    this.lastPad = null;
    this.airTime = 0;
    this.crashT = 0;
    this.fallT = 0;
    this.ghostT = 0;
    this.slipT = 0; // on oil / ice: steering goes loose
    this.hitCool = 0; // brief immunity after an obstacle hit (no double hits)
    this.knockVd = 0; // sideways knock from a hammer, applied while crashing
    this.model.root.visible = true;
    this.lastCheckpoint = this.track.startS;
    this.finished = false;
    this.finishTime = 0;
    this.score = 0;
    this.coins = 0;
    this.combo = 0;
    this.comboT = 0;
    this.ringSide = [];
    this.ringsTaken = new Set();
    this.guess = this.track.index(s);
    this.syncGround();
  }

  get grounded() { return this.mode !== 'air'; }
  get speed() { return this.mode === 'air' ? this.vel.length() : this.v; }

  update(dt, inp) {
    this.padT = Math.max(0, this.padT - dt);
    this.hitCool = Math.max(0, this.hitCool - dt);
    this.slipT = Math.max(0, this.slipT - dt);
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    if (this.mode === 'ground') this.updateGround(dt, inp);
    else if (this.mode === 'air') this.updateAir(dt, inp);
    else this.updateCrash(dt);
    this.checkPickups();
    if (this.ghostT > 0) {
      this.ghostT = Math.max(0, this.ghostT - dt);
      this.model.root.visible = this.ghostT === 0 || Math.floor(this.ghostT * 12) % 2 === 0;
    }
    this.model.root.position.copy(this.pos);
    this.model.root.quaternion.copy(this.quat);
    this.model.update(dt, {
      speed: this.mode === 'air' ? Math.max(this.v, 20) : this.v,
      steer: this.steerVis,
      accel: this.accel,
      braking: inp.brake && this.mode === 'ground' && this.v > 1,
      nitro: this.boosting,
      grounded: this.mode !== 'air',
    });
  }

  /* ---------------------------------------------------------------- ground */
  updateGround(dt, inp) {
    const tr = this.track;
    const type = this.type;
    let f = tr.frameAt(this.s, this.f);
    this.boosting = inp.nitro && this.nitro > 0;
    if (this.boosting) this.nitro = Math.max(0, this.nitro - 24 * (type.nitroDrain || 1) * dt);
    const top = type.top * (this.boosting ? 1.25 : 1) * (this.padT > 0 ? 1.2 : 1);
    let a = 0;
    if (inp.gas) a += type.accel * clamp(1 - this.v / top, 0, 1);
    if (this.boosting) a += 14;
    if (inp.brake) a -= 34;
    else if (!inp.gas) a -= 4;
    if (this.v > top) a -= (this.v - top) * 1.2;
    a -= G * f.T.y * (f.grip > 0 ? 0.45 : 1); // gravity along the slope (softened in loops)
    this.accel = a;
    this.v = clamp(this.v + a * dt, 0, MAX_GROUND);

    // Steering fights the sideways push of corners; banking helps.
    const gravSide = f.grip > 0 ? 0.4 : 1;
    const slip = this.slipT > 0;
    const resist = type.slipResist || 0;
    const steerGrip = slip ? 0.2 + 0.7 * resist : 1; // on oil or ice the wheels barely bite
    let lat = inp.steer * type.grip * steerGrip * clamp(this.v / 14, 0.3, 1) + DRIFT * (-f.kg * this.v * this.v - G * f.R.y * gravSide);
    if (slip) lat += Math.sin((tr.clock || 0) * 7 + this.s * 0.05) * 16 * (1 - resist); // fishtailing
    this.vd = (this.vd + lat * dt) * Math.exp(-(slip ? 1.5 : 5) * dt);
    this.d += this.vd * dt;
    this.s = Math.min(this.s + this.v * dt, tr.length - 1);
    this.steerVis = damp(this.steerVis, inp.steer, 10, dt);
    this.heading = damp(this.heading, Math.atan2(this.vd, Math.max(this.v, 6)) * 0.9, 10, dt);

    f = tr.frameAt(this.s, this.f);
    const hw = f.w - 1.05;
    if (Math.abs(this.d) > hw) {
      const side = Math.sign(this.d);
      if (f.walls) {
        if (this.vd * side > 0) {
          const hit = Math.abs(this.vd);
          this.vd = -this.vd * 0.35;
          this.v *= 1 - Math.min(0.2, hit * 0.015);
          if (hit > 2.5) this.emit('wall', { hit });
        }
        this.d = side * hw;
      } else if (Math.abs(this.d) > f.w + 0.35) {
        this.takeoff(f, 'edge'); // drove off the edge
        return;
      }
    }
    // Leave the ground over gaps, sharp crests, or when too slow upside down in a loop.
    const press = this.v * this.v * (f.kn + DOWNFORCE) + G * f.N.y + f.grip + 3;
    if (f.gap || press < 0) {
      this.takeoff(f, f.gap ? 'gap' : 'crest');
      return;
    }
    if (this.checkObstacles(f)) return;
    this.syncGround(f);
    this.checkTrackEvents();
  }

  /* ---------------------------------------------------------------- obstacles */
  // Returns true when a hit changed the car's mode (crash / launch), ending this step.
  checkObstacles(f) {
    const tr = this.track;
    if (!tr.obstacles.length) return false;
    const t = tr.clock || 0;
    const O = OBS();
    for (const o of tr.obstacles) {
      if (o.s < this.s - 14) continue;
      if (o.s > this.s + 14) break;
      const kind = O.KIND[o.type];
      if (this.hitCool > 0 && kind !== 'slip' && kind !== 'knock') continue;
      if (this.ghostT > 0 && (kind === 'crash' || kind === 'shove')) continue;
      const hit = O.hitTest(o, this.s, this.d, t);
      if (!hit) continue;
      switch (o.type) {
        case 'cone':
          o.knocked = true;
          o.knockAt = t;
          o.knockDir = hit.dir;
          this.v *= 0.93;
          this.emit('cone', { pos: this.pos });
          break;
        case 'barrier': {
          // stop short of it and end up beside it, so recovering doesn't drive straight back in
          const hw = f.w - 1.05;
          let side = hit.dir;
          if (Math.abs(o.d + side * (o.hw + 1.3)) > hw) side = -side;
          this.crash();
          this.v = 0;
          this.s = Math.min(this.s, o.s - 2.9);
          this.d = clamp(o.d + side * (o.hw + 1.3), -hw, hw);
          this.hitCool = 2;
          this.emit('barrier', { pos: this.pos });
          return true;
        }
        case 'hammer':
          this.crash();
          this.knockVd = hit.dir * 7.5; // smashed about 3 m sideways - off the road if you were near the edge
          this.hitCool = 2;
          this.emit('hammer', { pos: this.pos });
          return true;
        case 'slider':
        case 'spinner':
          this.vd = hit.dir * (o.type === 'slider' ? 11 : 10);
          this.v *= o.type === 'slider' ? 0.75 : 0.6;
          this.hitCool = 0.8;
          this.emit('shove', { pos: this.pos, hit: 8 });
          break;
        case 'slick':
          if (this.slipT <= 0) this.emit('slick', { kind: o.kind });
          this.slipT = 0.8;
          break;
        case 'bouncer':
          this.takeoff(f, 'bounce');
          this.vel.addScaledVector(f.N, 14);
          this.hitCool = 1;
          this.emit('bounce');
          return true;
        default:
          break;
      }
    }
    return false;
  }

  syncGround(f = this.track.frameAt(this.s, this.f)) {
    this.pos.copy(f.p).addScaledVector(f.R, this.d);
    orient(this.quat, f.T, f.N, f.R, this.heading);
    this.up.copy(f.N);
    this.fwd.copy(f.T);
  }

  checkTrackEvents() {
    const tr = this.track;
    for (const cp of tr.checkpoints) {
      if (cp <= this.s && cp > this.lastCheckpoint) {
        this.lastCheckpoint = cp;
        this.emit('checkpoint');
      }
    }
    for (const pd of tr.pads) {
      if (this.s >= pd.s0 && this.s <= pd.s1 && Math.abs(this.d - pd.d) < pd.hw + 0.8 && this.lastPad !== pd) {
        this.lastPad = pd;
        this.padT = 1.3;
        this.v = Math.min(this.v + 12, this.type.top * 1.35);
        this.emit('pad');
      }
    }
  }

  /* ---------------------------------------------------------------- air */
  // reason: 'gap' (ramp jump) | 'crest' | 'edge' (drove off the side)
  takeoff(f, reason) {
    this.mode = 'air';
    this.pos.copy(f.p).addScaledVector(f.R, this.d);
    this.vel.copy(f.T).multiplyScalar(this.v).addScaledVector(f.R, this.vd);
    if (reason !== 'edge') this.vel.addScaledVector(f.N, 1.2);
    const cap = reason === 'gap' ? JUMP_MAX : reason === 'crest' ? CREST_MAX : Infinity;
    const sp = this.vel.length();
    if (sp > cap) this.vel.multiplyScalar(cap / sp);
    this.ang.set(0, 0, 0);
    this.airTime = 0;
    this.trickP = 0;
    this.trickY = 0;
    this.trickR = 0;
    this.latch = true;
    this.boosting = false;
    this.fallT = 0;
    this.offEdge = reason === 'edge';
    this.guess = this.track.index(this.s);
    this.prevH = 0.2;
    this.emit('takeoff');
  }

  updateAir(dt, inp) {
    const tr = this.track;
    this.airTime += dt;
    this.vel.y -= G * dt;
    this.pos.addScaledVector(this.vel, dt);

    // Buttons held at take-off are ignored until released, so you don't flip by accident.
    const anyInput = inp.pitch !== 0 || Math.abs(inp.steer) > 0.2 || inp.roll !== 0;
    if (this.latch && !anyInput) this.latch = false;
    const ctl = !this.latch && !this.finished;
    const k = this.type.air;
    this.ang.x = damp(this.ang.x, ctl ? -inp.pitch * 6.5 * k : 0, 9, dt);
    this.ang.y = damp(this.ang.y, ctl ? -inp.steer * 6.0 * k : 0, 9, dt);
    this.ang.z = damp(this.ang.z, ctl ? -inp.roll * 6.5 * k : 0, 9, dt);
    tq.setFromEuler(te.set(this.ang.x * dt, this.ang.y * dt, this.ang.z * dt));
    this.quat.multiply(tq);
    this.trickP += this.ang.x * dt;
    this.trickY += this.ang.y * dt;
    this.trickR += this.ang.z * dt;
    this.steerVis = damp(this.steerVis, 0, 4, dt);

    const i = tr.findNearest(this.pos, this.guess);
    this.guess = i;
    this.s = i * STEP;
    const P = tr.P[i], T = tr.T[i], N = tr.N[i], R = tr.R[i];
    tv.subVectors(this.pos, P);
    const h = tv.dot(N);
    const lat = tv.dot(R);
    const along = tv.dot(T);

    // Landing assist: when you're not tricking, gently line the car up with the road.
    // A car that has missed the road tumbles nose-first instead.
    if (this.fallT > 0) {
      tq.setFromEuler(te.set(-1.6 * dt, 0, this.tumble * dt));
      this.quat.multiply(tq);
    } else if (!(ctl && anyInput)) {
      orient(tq2, T, N, R, 0);
      this.quat.slerp(tq2, 1 - Math.exp(-3.2 * dt));
    }
    this.up.copy(Y);
    if (this.vel.lengthSq() > 1) this.fwd.copy(this.vel).normalize();

    // Land only when coming down onto the road from above. A car arriving from underneath
    // (a jump that fell short, or after driving off the edge) falls on past the ramp.
    // After driving off the side, only the road proper counts - no hopping back on from the edge.
    const solid = !tr.gap[i] && Math.abs(lat) < (this.offEdge ? tr.w[i] - 0.5 : tr.w[i] + 0.6);
    if (solid && h <= 0.05 && this.prevH > -0.15 && this.fallT === 0) {
      this.land(i, along, lat);
      return;
    }
    this.prevH = h;
    // Under the road = the road was missed: let the car drop away for a moment, then respawn.
    if (h < -1.5) {
      if (this.fallT === 0) {
        this.tumble = (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 1.4);
        this.combo = 0;
        this.emit('miss');
      }
      this.fallT += dt;
    }
    if (this.fallT > FALL_TIME || this.pos.y < tr.minY - 70 || this.airTime > 9) {
      this.emit('fall');
      this.respawn();
    }
  }

  land(i, along, lat) {
    const tr = this.track;
    const T = tr.T[i], N = tr.N[i], R = tr.R[i];
    const up = tv.set(0, 1, 0).applyQuaternion(this.quat);
    const align = up.dot(N);
    const fwd = tv2.set(0, 0, -1).applyQuaternion(this.quat);
    fwd.addScaledVector(N, -fwd.dot(N));
    if (fwd.lengthSq() < 1e-6) fwd.copy(T);
    fwd.normalize();
    const headingDot = fwd.dot(T);
    const headingSide = fwd.dot(R);
    const impact = Math.max(0, -this.vel.dot(N));
    const quick = this.airTime < 0.25;
    this.s = clamp(i * STEP + along, 0, tr.length - 1);
    this.d = clamp(lat, -(tr.w[i] + 0.3), tr.w[i] + 0.3); // no sideways snap; walls push back on the next step
    const tol = this.type.landTol || 1; // monster trucks shrug off crooked landings
    if (!quick && (align < 0.3 / tol || headingDot < 0.2 / tol)) {
      this.crash();
      return;
    }
    const clean = align > 1 - 0.08 * tol && headingDot > 1 - 0.08 * tol;
    this.v = Math.max(0, this.vel.dot(T)) * (quick || clean ? 1 : 0.82);
    this.vd = this.vel.dot(R) * 0.3;
    this.heading = Math.atan2(headingSide, headingDot) * 0.6;
    this.mode = 'ground';
    this.syncGround();
    this.model.bump(Math.min(6, impact * 0.25));
    if (quick) {
      if (impact > 6) this.emit('bump', { impact });
    } else {
      this.scoreLanding(clean, impact);
    }
  }

  scoreLanding(clean, impact) {
    const count = (a) => Math.floor((Math.abs(a) + 1.4) / TAU); // ~80 deg of slack; the assist finishes it
    const flips = count(this.trickP);
    const spins = count(this.trickY);
    const rolls = count(this.trickR);
    const times = (c) => (c === 1 ? '' : c === 2 ? 'Double ' : c === 3 ? 'Triple ' : `${c}x `);
    const tricks = [];
    if (flips) tricks.push({ name: times(flips) + (this.trickP < 0 ? 'Frontflip' : 'Backflip'), pts: 500 * flips });
    if (spins) tricks.push({ name: `${spins * 360} Spin`, pts: 400 * spins });
    if (rolls) tricks.push({ name: times(rolls) + 'Barrel Roll', pts: 450 * rolls });
    if (this.airTime > 1) tricks.push({ name: 'Big Air', pts: Math.round(this.airTime * 100) });
    const trickCount = flips + spins + rolls;
    if (clean && trickCount) tricks.push({ name: 'Perfect Landing', pts: 150 });
    let total = 0;
    let multiplier = 1;
    if (tricks.length) {
      if (trickCount) {
        this.combo = this.comboT > 0 ? this.combo + 1 : 1;
        this.comboT = 6;
        multiplier = Math.min(4, 1 + (this.combo - 1) * 0.5);
      }
      total = Math.round(tricks.reduce((s, t) => s + t.pts, 0) * multiplier);
      this.score += total;
      this.gainNitro(total / 25);
    }
    this.emit('land', { impact, tricks, total, multiplier, clean, trickCount });
  }

  gainNitro(n) {
    this.nitro = Math.min(100, this.nitro + n * (this.type.nitroGain || 1));
  }

  /* ---------------------------------------------------------------- crash / respawn */
  crash() {
    this.mode = 'crash';
    this.crashT = 0;
    this.v *= 0.3;
    this.vd = 0;
    this.combo = 0;
    this.comboT = 0;
    this.boosting = false;
    this.crashSpin = (Math.random() < 0.5 ? -1 : 1) * ((2 * TAU) / 0.65); // exactly two turns
    this.emit('crash');
  }

  updateCrash(dt) {
    const tr = this.track;
    const dur = 1.3;
    this.crashT += dt;
    this.v = Math.max(0, this.v - 22 * dt);
    this.s = Math.min(this.s + this.v * dt, tr.length - 1);
    if (tr.isGap(this.s)) {
      this.respawn();
      return;
    }
    const f = tr.frameAt(this.s, this.f);
    if (this.knockVd) {
      this.d += this.knockVd * dt;
      this.knockVd *= Math.exp(-2.5 * dt);
      if (Math.abs(this.knockVd) < 0.3) this.knockVd = 0;
      if (Math.abs(this.d) > f.w + 0.35) {
        if (f.walls) {
          this.d = Math.sign(this.d) * (f.w - 1.05);
          this.knockVd = 0;
        } else {
          // knocked clean off the road
          this.mode = 'ground';
          this.vd = this.knockVd;
          this.knockVd = 0;
          this.v = Math.max(this.v, 6);
          this.takeoff(f, 'edge');
          return;
        }
      }
    }
    const t = Math.min(1, this.crashT / dur);
    this.heading += this.crashSpin * (1 - t) * (dt / dur);
    this.pos.copy(f.p).addScaledVector(f.R, this.d).addScaledVector(f.N, Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t) * 1.2);
    orient(this.quat, f.T, f.N, f.R, this.heading);
    tq.setFromAxisAngle(tv.set(0, 0, 1), Math.sin(t * Math.PI * 2) * 0.5 * (1 - t));
    this.quat.multiply(tq);
    this.up.copy(f.N);
    this.fwd.copy(f.T);
    this.steerVis = 0;
    if (this.crashT > dur) {
      this.mode = 'ground';
      this.heading = 0;
      this.v = Math.max(this.v, 14);
      this.ghostT = Math.max(this.ghostT, 1.2);
      this.emit('recover');
    }
  }

  respawn() {
    this.mode = 'ground';
    this.s = this.lastCheckpoint + 2;
    this.d = 0;
    this.vd = 0;
    this.v = 26;
    this.heading = 0;
    this.combo = 0;
    this.lastPad = null;
    this.fallT = 0;
    this.ghostT = GHOST_TIME;
    this.model.root.visible = true;
    this.guess = this.track.index(this.s);
    this.syncGround();
    this.emit('respawn');
  }

  /* ---------------------------------------------------------------- pickups */
  checkPickups() {
    const tr = this.track;
    const c = tv3.set(0, 0.7, 0).applyQuaternion(this.quat).add(this.pos);
    for (const st of tr.coins) {
      if (st.taken || Math.abs(st.s - this.s) > 8) continue;
      if (st.pos.distanceToSquared(c) < 2.6 * 2.6) {
        st.taken = true;
        this.coins++;
        this.score += 50;
        this.gainNitro(6);
        this.emit('coin', { pos: st.pos });
      }
    }
    tr.rings.forEach((r, k) => {
      const side = tv.subVectors(c, r.pos).dot(r.dir);
      const prev = this.ringSide[k];
      this.ringSide[k] = side;
      if (this.mode !== 'air' || this.ringsTaken.has(k) || prev === undefined || !(prev < 0 && side >= 0)) return;
      if (tv.addScaledVector(r.dir, -side).length() < r.r) {
        this.ringsTaken.add(k);
        this.score += 250;
        this.gainNitro(20);
        this.emit('ring', { pos: r.pos });
      }
    });
  }
}

/* ====================================================================== AI */
class AiCar {
  constructor(track, type, model, name, skill) {
    this.isPlayer = false;
    this.track = track;
    this.type = type;
    this.model = model;
    this.name = name;
    this.skill = skill;
    this.f = makeFrame();
    this.pos = new V3();
    this.quat = new THREE.Quaternion();
    this.place(0, 0);
  }

  place(s, d) {
    this.s = s;
    this.d = d;
    this.lane = d;
    this.v = 0;
    this.finished = false;
    this.finishTime = 0;
    this.air = false;
    this.wasAir = false;
    this.spinDir = 0;
    this.spinT = 0;
    this.laneT = rand(3, 6);
    this.wipeT = 0; // spinning out after hitting an obstacle
    this.wipeDir = 1;
    this.hitCool = 0;
    this.focusT = rand(2, 6);
    this.careless = false; // now and then a rival doesn't see an obstacle coming
    this.sync(0);
  }

  get speed() { return this.v; }

  update(dt, ctx) {
    const tr = this.track;
    const type = this.type;
    const i = tr.index(this.s);
    let target = 0;
    if (ctx.go) {
      target = AI_TOP * this.skill * ctx.rubber(this);
      // corner speed from the sharpest sideways curvature over the next 60 m
      let k = 0;
      for (let j = 0; j < 60; j += 4) k = Math.max(k, Math.abs(tr.kg[Math.min(tr.n - 1, i + j)]));
      if (k > 0.002) target = Math.min(target, Math.sqrt((type.grip * 1.15) / (DRIFT * k)));
      for (const ft of tr.features) {
        if (this.s > ft.s0 && this.s < ft.s1) {
          target = Math.max(target, 38);
          break;
        }
      }
      if (this.finished) target = this.s > tr.finishS + 60 ? 0 : Math.min(target, 25);
    }
    if (this.v < target) this.v = Math.min(target, this.v + type.accel * 0.85 * clamp(1 - this.v / (type.top * 1.3), 0.15, 1) * dt);
    else this.v = Math.max(target, this.v - 20 * dt);

    // lanes: wander a little, dodge slower cars ahead
    this.laneT -= dt;
    if (this.laneT <= 0) {
      this.laneT = rand(3, 7);
      this.lane = [-2.8, 0, 2.8][Math.floor(Math.random() * 3)];
    }
    for (const o of ctx.all) {
      if (o === this) continue;
      const ds = o.s - this.s;
      if (ds > 0 && ds < 25 && Math.abs(o.d - this.lane) < 2.2 && o.speed < this.v + 1) {
        this.lane = o.d > 0 ? o.d - 3.2 : o.d + 3.2;
        break;
      }
    }
    // steer round cones, barriers and slicks; time moving obstacles (unless it's a careless moment)
    if (tr.obstacles.length) {
      const lane = planLane(tr, this.s, this.lane);
      if (lane !== null) this.lane = lane;
      this.focusT -= dt;
      if (this.focusT <= 0) {
        this.focusT = rand(4, 8);
        this.careless = Math.random() < 0.2;
      }
      if (!this.careless && ctx.go) {
        const plan = planDodge(tr, this.s, this.d, this.v, tr.clock || 0);
        if (plan && plan.lane !== undefined) {
          this.lane = plan.lane;
          if (plan.speed) this.v = Math.max(plan.speed, this.v - 26 * dt);
        } else if (plan && plan.slow) this.v = Math.max(this.v - 20 * dt, 20);
      }
    }
    const w = tr.w[i] - 1.2;
    this.lane = clamp(this.lane, -w, w);
    const d0 = this.d;
    // steer harder while dodging an obstacle
    const dodging = tr.obstacles.length && Math.abs(this.lane - this.d) > 0.3 && tr.obstacles.some((o) => o.s > this.s && o.s < this.s + 60);
    this.d = clamp(damp(this.d, this.lane, this.wipeT > 0 ? 0.5 : dodging ? 4 : 2.6, dt), -w, w);
    this.s = Math.min(this.s + this.v * dt, tr.length - 1);
    this.wipeT = Math.max(0, this.wipeT - dt);
    this.hitCool = Math.max(0, this.hitCool - dt);
    if (tr.obstacles.length && !this.air && this.hitCool <= 0) this.checkObstacles(ctx);

    this.air = tr.isGap(this.s);
    if (this.air && !this.wasAir) {
      this.spinDir = Math.random() < 0.45 ? (Math.random() < 0.5 ? -1 : 1) : 0; // show-offs
      this.spinT = 0;
    }
    this.wasAir = this.air;
    if (this.air) this.spinT += dt;
    const latV = (this.d - d0) / Math.max(dt, 1e-4);
    this.sync(latV);
    this.model.update(dt, { speed: this.v, steer: clamp(latV * 0.4, -1, 1), accel: 0, braking: false, nitro: false, grounded: !this.air });
  }

  // Rivals knock cones too, and spin out when a hammer, slider, spinner or barrier gets them.
  checkObstacles(ctx) {
    const tr = this.track;
    const O = OBS();
    const t = tr.clock || 0;
    for (const o of tr.obstacles) {
      if (o.s < this.s - 14) continue;
      if (o.s > this.s + 14) break;
      if (o.type === 'bouncer') continue;
      const hit = O.hitTest(o, this.s, this.d, t);
      if (!hit) continue;
      if (o.type === 'cone') {
        o.knocked = true;
        o.knockAt = t;
        o.knockDir = hit.dir;
        this.v *= 0.95;
        continue;
      }
      if (o.type === 'slick') {
        this.v *= 0.985;
        continue;
      }
      this.wipeT = 1.1;
      this.wipeDir = hit.dir || 1;
      this.v *= 0.45;
      this.hitCool = 1.6;
      if (o.type === 'barrier') this.d = clamp(o.d + (hit.dir || 1) * (o.hw + 1.3), -(tr.w[tr.index(this.s)] - 1.2), tr.w[tr.index(this.s)] - 1.2);
      if (ctx.onAiHit) ctx.onAiHit(this, o);
      return;
    }
  }

  sync(latV) {
    const f = this.track.frameAt(this.s, this.f);
    this.pos.copy(f.p).addScaledVector(f.R, this.d);
    orient(this.quat, f.T, f.N, f.R, Math.atan2(latV, Math.max(this.v, 6)) * 0.9);
    if (this.wipeT > 0) {
      tq.setFromAxisAngle(Y, this.wipeDir * TAU * smooth(1 - this.wipeT / 1.1));
      this.quat.multiply(tq);
    }
    if (this.air && this.spinDir) {
      tq.setFromAxisAngle(Y, this.spinDir * TAU * smooth(Math.min(1, this.spinT / 0.65)));
      this.quat.multiply(tq);
    }
    this.model.root.position.copy(this.pos);
    this.model.root.quaternion.copy(this.quat);
  }
}

// Simple side-by-side / rear-end contact between the player and AI cars.
function collide(player, ais, onBump) {
  if (player.mode !== 'ground' || player.ghostT > 0) return;
  const d0 = player.d;
  for (const a of ais) {
    if (a.air) continue;
    const ds = a.s - player.s;
    const dd = a.d - player.d;
    if (Math.abs(ds) > 4.4 || Math.abs(dd) > 2.0) continue;
    const push = (2.0 - Math.abs(dd)) * 0.5 * (dd >= 0 ? 1 : -1);
    player.d -= push;
    a.d += push;
    a.lane = a.d;
    if (Math.abs(dd) < 1.4) {
      if (ds > 0 && player.v > a.v) {
        const hit = player.v - a.v;
        player.v = a.v * 0.95;
        a.v += hit * 0.3;
        onBump(hit);
      } else if (ds < 0 && a.v > player.v) {
        const hit = a.v - player.v;
        a.v = player.v * 0.95;
        player.v += hit * 0.3;
        onBump(hit);
      }
    } else {
      player.vd -= push * 4;
      onBump(1.5);
    }
  }
  // Bumps can't shove you off an open edge - only your own steering can.
  if (player.d !== d0) {
    const tr = player.track;
    const lim = Math.max(tr.w[tr.index(player.s)] - 1.05, Math.abs(d0));
    player.d = clamp(player.d, -lim, lim);
  }
}

// Rivals don't drive through each other either: side-by-side cars push apart, and a car
// running into the back of another slows to its speed.
function separateAis(ais) {
  for (let i = 0; i < ais.length; i++) {
    for (let j = i + 1; j < ais.length; j++) {
      const a = ais[i];
      const b = ais[j];
      if (a.air || b.air) continue;
      const ds = b.s - a.s;
      const dd = b.d - a.d;
      if (Math.abs(ds) > 4.4 || Math.abs(dd) > 2.0) continue;
      const push = (2.0 - Math.abs(dd)) * 0.5 * (dd >= 0 ? 1 : -1);
      a.d -= push;
      b.d += push;
      a.lane = a.d;
      b.lane = b.d;
      const back = ds > 0 ? a : b;
      const front = ds > 0 ? b : a;
      if (Math.abs(dd) < 1.4 && back.v > front.v) back.v = front.v * 0.98;
    }
  }
}

SD.physics = { PlayerCar, AiCar, collide, separateAis, planLane, planDodge };
})();
