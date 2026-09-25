/* Arcade car physics: grounded driving along the track ribbon, ballistic flight with
 * flips / spins / rolls, graded landings, crashes, respawns - plus the AI drivers. */
(() => {
'use strict';
const SD = (window.SD ||= {});
const { G, STEP, makeFrame } = SD.track;
const { clamp, damp, rand, smooth, TAU } = SD.util;

const DRIFT = 0.45; // how strongly corners push you wide (arcade-friendly < 1)
const MAX_GROUND = 72; // m/s hard cap, even with nitro + pads + downhill
const JUMP_MAX = 50; // launch speed cap off ramps, so every jump lands on its landing zone
const CREST_MAX = 58; // same idea for the rare hop over a sharp hill crest
const DOWNFORCE = 0.004; // keeps you planted over crests at speed - air comes from ramps
const AI_TOP = 52; // AI pace reference (m/s); their car model is cosmetic
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
    this.lastCheckpoint = this.track.startS;
    this.finished = false;
    this.finishTime = 0;
    this.score = 0;
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
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    if (this.mode === 'ground') this.updateGround(dt, inp);
    else if (this.mode === 'air') this.updateAir(dt, inp);
    else this.updateCrash(dt);
    this.checkPickups();
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
    if (this.boosting) this.nitro = Math.max(0, this.nitro - 24 * dt);
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
    const lat = inp.steer * type.grip * clamp(this.v / 14, 0.3, 1) + DRIFT * (-f.kg * this.v * this.v - G * f.R.y * gravSide);
    this.vd = (this.vd + lat * dt) * Math.exp(-5 * dt);
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
    this.syncGround(f);
    this.checkTrackEvents();
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
    if (!(ctl && anyInput)) {
      orient(tq2, T, N, R, 0);
      this.quat.slerp(tq2, 1 - Math.exp(-3.2 * dt));
    }
    this.up.copy(Y);
    if (this.vel.lengthSq() > 1) this.fwd.copy(this.vel).normalize();

    const solid = !tr.gap[i] && Math.abs(lat) < tr.w[i] + 0.6;
    if (solid && h <= 0.05 && this.prevH > -0.6) {
      this.land(i, along, lat);
      return;
    }
    this.prevH = h;
    if (this.pos.y < tr.minY - 70 || this.airTime > 9) {
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
    this.d = clamp(lat, -(tr.w[i] - 1.05), tr.w[i] - 1.05);
    if (!quick && (align < 0.3 || headingDot < 0.2)) {
      this.crash();
      return;
    }
    const clean = align > 0.92 && headingDot > 0.92;
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
      this.nitro = Math.min(100, this.nitro + total / 25);
    }
    this.emit('land', { impact, tricks, total, multiplier, clean, trickCount });
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
    this.guess = this.track.index(this.s);
    this.syncGround();
    this.emit('respawn');
  }

  /* ---------------------------------------------------------------- pickups */
  checkPickups() {
    const tr = this.track;
    const c = tv3.set(0, 0.7, 0).applyQuaternion(this.quat).add(this.pos);
    for (const st of tr.stars) {
      if (st.taken || Math.abs(st.s - this.s) > 8) continue;
      if (st.pos.distanceToSquared(c) < 2.6 * 2.6) {
        st.taken = true;
        this.score += 50;
        this.nitro = Math.min(100, this.nitro + 6);
        this.emit('star', { pos: st.pos });
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
        this.nitro = Math.min(100, this.nitro + 20);
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
    const w = tr.w[i] - 1.2;
    this.lane = clamp(this.lane, -w, w);
    const d0 = this.d;
    this.d = clamp(damp(this.d, this.lane, 1.8, dt), -w, w);
    this.s = Math.min(this.s + this.v * dt, tr.length - 1);

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

  sync(latV) {
    const f = this.track.frameAt(this.s, this.f);
    this.pos.copy(f.p).addScaledVector(f.R, this.d);
    orient(this.quat, f.T, f.N, f.R, Math.atan2(latV, Math.max(this.v, 6)) * 0.9);
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
  if (player.mode !== 'ground') return;
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
}

SD.physics = { PlayerCar, AiCar, collide };
})();
