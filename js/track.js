/* Track: a "turtle" builder that lays down pieces (straights, turns, ramps, jumps, loops,
 * corkscrews), a uniformly-sampled 3D ribbon the physics rides on, and the mesh builder. */
(() => {
'use strict';
const SD = (window.SD ||= {});
const { clamp, lerp, smooth, seeded } = SD.util;

const STEP = 1; // metres between track samples
const G = 20; // gravity (a bit above real life for snappy jumps)
const SLAB = 0.8; // road slab thickness
const V3 = THREE.Vector3;

function makeFrame() {
  return { p: new V3(), T: new V3(), N: new V3(), R: new V3(), kn: 0, kg: 0, w: 6, walls: 0, grip: 0, gap: 0 };
}

/* ====================================================================== builder */
class TrackBuilder {
  constructor(opts = {}) {
    this.p = new V3(0, opts.height ?? 120, 0);
    this.yaw = 0; // + turns right
    this.pitch = 0; // + nose up
    this.bank = 0; // + right side down
    this.w = opts.width ?? 6; // half width
    this.targetW = this.w;
    this.wallsOn = false;
    this.gripV = 0; // extra "magnet" grip (loops / corkscrews)
    this.raw = [];
    this.len = 0;
    this.startS = opts.startS ?? 50;
    this.finishS = null;
    this.checkpoints = [];
    this.pads = [];
    this.coinList = [];
    this.obstacles = [];
    this.rings = [];
    this.features = []; // {s0, s1, kind} - AI uses these to keep speed up
    this._emit(false);
  }

  hfwd() { return new V3(Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right() { return new V3(Math.cos(this.yaw), 0, Math.sin(this.yaw)); }

  frame() {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const T = new V3(sy * cp, sp, -cy * cp);
    const N0 = new V3(-sy * sp, cp, cy * sp);
    const R0 = new V3(cy, 0, sy);
    const N = N0.multiplyScalar(Math.cos(this.bank)).addScaledVector(R0, Math.sin(this.bank));
    return { T, N };
  }

  _emit(gap) {
    const last = this.raw[this.raw.length - 1];
    if (last) this.len += this.p.distanceTo(last.p);
    if (this.w !== this.targetW) this.w += clamp(this.targetW - this.w, -0.15, 0.15);
    this.raw.push({ p: this.p.clone(), up: this.frame().N, w: this.w, walls: this.wallsOn, grip: this.gripV, gap: !!gap });
  }

  straight(L) {
    const n = Math.max(1, Math.round(L));
    for (let i = 0; i < n; i++) {
      this.p.addScaledVector(this.frame().T, L / n);
      this._emit();
    }
    return this;
  }

  // deg > 0 turns right. Curvature eases in/out; the road banks into the turn.
  turn(deg, radius, bankDeg) {
    const ang = (deg * Math.PI) / 180;
    const L = Math.abs(ang) * radius;
    const n = Math.max(4, Math.round(L));
    if (bankDeg == null) bankDeg = clamp(Math.abs(deg) * 0.22, 4, 16);
    const bank = ((bankDeg * Math.PI) / 180) * Math.sign(ang);
    const wts = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const v = smooth(clamp(Math.min(t / 0.2, (1 - t) / 0.2), 0, 1)) + 0.05;
      wts.push(v);
      sum += v;
    }
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;
      const da = (ang * wts[i]) / sum;
      this.yaw += da / 2;
      this.p.addScaledVector(this.frame().T, L / n);
      this.yaw += da / 2;
      this.bank = bank * smooth(clamp(Math.min(t / 0.3, (1 - t) / 0.3), 0, 1));
      this._emit();
    }
    this.bank = 0;
    return this;
  }

  // Height profile over a horizontal distance: h(t) offset, dh(t) slope.
  _profile(L, h, dh, gapFn) {
    const n = Math.max(2, Math.round(L));
    const start = this.p.clone();
    const fwd = this.hfwd();
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.p.copy(start).addScaledVector(fwd, L * t);
      this.p.y = start.y + h(t);
      this.pitch = Math.atan(dh(t));
      this._emit(gapFn ? gapFn(i, n) : false);
    }
  }

  slope(L, dy) {
    this._profile(L, (t) => dy * smooth(t), (t) => (dy * 6 * t * (1 - t)) / L);
    this.pitch = 0;
    return this;
  }

  // Kicker ramp - leaves the pitch at the take-off angle, so follow it with jump().
  ramp(L, h) {
    this._profile(L, (t) => h * t * t, (t) => (2 * h * t) / L);
    return this;
  }

  // Gap + landing ramp. The gap follows the ballistic arc of a car doing `vmin`.
  jump({ gap = 26, land = 90, vmin = 30, ring = true } = {}) {
    const s0 = this.len;
    const a = this.pitch;
    const ta = Math.tan(a);
    const c2 = Math.cos(a) ** 2;
    const k = G / (2 * vmin * vmin * c2);
    const y = (x) => x * ta - k * x * x;
    const yp = (x) => ta - 2 * k * x;
    const start = this.p.clone();
    const fwd = this.hfwd();
    if (ring) {
      const kr = G / (2 * 40 * 40 * c2);
      const xr = gap * 0.5;
      const pos = start.clone().addScaledVector(fwd, xr);
      pos.y += xr * ta - kr * xr * xr + 1.0;
      const dir = fwd.clone();
      dir.y = ta - 2 * kr * xr;
      this.rings.push({ pos, dir: dir.normalize(), r: 4.4 });
    }
    this._profile(gap, (t) => y(t * gap), (t) => yp(t * gap), (i, n) => i < n);
    const m1 = yp(gap);
    this._profile(land, (t) => m1 * land * (t - (t * t) / 2), (t) => m1 * (1 - t));
    this.pitch = 0;
    this.features.push({ s0: s0 - 40, s1: this.len, kind: 'jump' });
    return this;
  }

  // Vertical loop that drifts sideways by `shift` so the exit clears the entry.
  loop(R = 15, shift = 13) {
    const s0 = this.len;
    const L = 2 * Math.PI * R;
    const n = Math.round(L);
    const right = this.right();
    this.gripV = 15;
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      this.pitch = Math.PI * (t0 + t1);
      this.p.addScaledVector(this.frame().T, L / n);
      this.p.addScaledVector(right, shift * (smooth(t1) - smooth(t0)));
      this.pitch = Math.PI * 2 * t1;
      this._emit();
    }
    this.pitch = 0;
    this.gripV = 0;
    this.features.push({ s0: s0 - 50, s1: this.len, kind: 'loop' });
    return this;
  }

  // Straight section that twists a full turn (dir 1 = clockwise). Walls keep you in.
  corkscrew(L = 80, dir = 1) {
    const s0 = this.len;
    const walls = this.wallsOn;
    this.wallsOn = true;
    this.gripV = 24;
    const n = Math.round(L);
    for (let i = 1; i <= n; i++) {
      this.p.addScaledVector(this.frame().T, L / n);
      this.bank = dir * Math.PI * 2 * smooth(i / n);
      this._emit();
    }
    this.bank = 0;
    this.gripV = 0;
    this.wallsOn = walls;
    this.features.push({ s0: s0 - 30, s1: this.len, kind: 'cork' });
    return this;
  }

  /* ---- obstacles: placed `at` metres ahead of the current point (they don't lay any road,
   * so keep building straight road past them). See obstacles.js for how each behaves. */
  _ob(o) {
    o.phase = o.phase ?? this.obstacles.length * 1.37; // desynchronise moving obstacles
    this.obstacles.push(o);
    return this;
  }

  // pattern: 'line' (down the road), 'slalom' (alternating sides), 'wall' (a row across)
  cones(count = 5, pattern = 'line', d = 0, at = 10, spacing = 6) {
    for (let k = 0; k < count; k++) {
      let s = this.len + at;
      let dd = d;
      if (pattern === 'wall') dd = d + (k - (count - 1) / 2) * 1.3;
      else {
        s += k * spacing;
        if (pattern === 'slalom') dd = d + (k % 2 ? 2.2 : -2.2);
      }
      this.obstacles.push({ type: 'cone', s, d: dd });
    }
    return this;
  }

  barrier(d = 0, hw = 1.5, at = 12) { return this._ob({ type: 'barrier', s: this.len + at, d, hw }); }
  hammer(at = 20, period = 2.6) { return this._ob({ type: 'hammer', s: this.len + at, period }); }
  slider(at = 20, period = 2.8, hw = 1.5) { return this._ob({ type: 'slider', s: this.len + at, period, hw, amp: this.targetW - hw - 0.2 }); }
  // the bar stops short of the edges: hug an edge to pass safely, or time the gap for the short line
  spinner(at = 20, period = 3.8) { return this._ob({ type: 'spinner', s: this.len + at, period: Math.max(period, 3.6), r: this.targetW - 2.0 }); }
  slick(d = 0, len = 14, hw = 2.2, kind = 'oil', at = 8) { return this._ob({ type: 'slick', s: this.len + at, d, len, hw, kind }); }
  bouncer(d = 0, at = 10) { return this._ob({ type: 'bouncer', s: this.len + at, d }); }

  width(w) { this.targetW = w; return this; }
  walls(on) { this.wallsOn = on; return this; }
  checkpoint() { this.checkpoints.push(this.len); return this; }
  finish() { this.finishS = this.len; return this; }

  pad(d = 0, len = 10, hw = 2.6) {
    this.pads.push({ s0: this.len, s1: this.len + len, d, hw });
    return this;
  }

  // A trail of coins starting a few metres ahead. pattern: line | weave | diag
  coins(count, spacing = 8, pattern = 'line', d = 0) {
    for (let k = 0; k < count; k++) {
      const t = count > 1 ? k / (count - 1) : 0;
      let dd = d;
      if (pattern === 'weave') dd = d + Math.sin(t * Math.PI * 2) * 2.8;
      else if (pattern === 'diag') dd = lerp(-3, 3, t) * (d < 0 ? -1 : 1);
      this.coinList.push({ s: this.len + 6 + k * spacing, d: dd });
    }
    return this;
  }

  build() { return new Track(this); }
}

/* ====================================================================== sampled track */
class Track {
  constructor(b) {
    const raw = b.raw;
    const cum = new Float64Array(raw.length);
    for (let i = 1; i < raw.length; i++) cum[i] = cum[i - 1] + raw[i].p.distanceTo(raw[i - 1].p);
    const n = Math.floor(cum[raw.length - 1] / STEP) + 1;
    this.n = n;
    this.length = (n - 1) * STEP;
    this.P = new Array(n);
    this.T = new Array(n);
    this.N = new Array(n);
    this.R = new Array(n);
    this.w = new Float32Array(n);
    this.walls = new Uint8Array(n);
    this.grip = new Float32Array(n);
    this.gap = new Uint8Array(n);
    this.kn = new Float32Array(n);
    this.kg = new Float32Array(n);

    const up = new Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = i * STEP;
      while (j < raw.length - 2 && cum[j + 1] < s) j++;
      const a = raw[j];
      const c = raw[j + 1];
      const segLen = cum[j + 1] - cum[j];
      const t = segLen > 1e-6 ? clamp((s - cum[j]) / segLen, 0, 1) : 0;
      const near = t < 0.5 ? a : c;
      this.P[i] = a.p.clone().lerp(c.p, t);
      up[i] = a.up.clone().lerp(c.up, t);
      this.w[i] = lerp(a.w, c.w, t);
      this.walls[i] = near.walls ? 1 : 0;
      this.grip[i] = near.grip;
      this.gap[i] = near.gap ? 1 : 0;
    }
    for (let i = 0; i < n; i++) {
      const T = this.P[Math.min(n - 1, i + 1)].clone().sub(this.P[Math.max(0, i - 1)]).normalize();
      const N = up[i].addScaledVector(T, -up[i].dot(T)).normalize();
      this.T[i] = T;
      this.N[i] = N;
      this.R[i] = new V3().crossVectors(T, N);
    }
    // curvature split into "into the road" (kn) and "sideways" (kg) parts, lightly smoothed
    const kn = new Float32Array(n);
    const kg = new Float32Array(n);
    const tmp = new V3();
    for (let i = 1; i < n - 1; i++) {
      tmp.subVectors(this.T[i + 1], this.T[i - 1]).multiplyScalar(1 / (2 * STEP));
      kn[i] = tmp.dot(this.N[i]);
      kg[i] = tmp.dot(this.R[i]);
    }
    for (let i = 0; i < n; i++) {
      let a = 0, c = 0, m = 0;
      for (let k = -3; k <= 3; k++) {
        const q = clamp(i + k, 0, n - 1);
        a += kn[q];
        c += kg[q];
        m++;
      }
      this.kn[i] = a / m;
      this.kg[i] = c / m;
    }

    this.minY = Infinity;
    this.maxY = -Infinity;
    this.bbox = new THREE.Box3();
    for (const p of this.P) {
      this.minY = Math.min(this.minY, p.y);
      this.maxY = Math.max(this.maxY, p.y);
      this.bbox.expandByPoint(p);
    }

    this.startS = b.startS;
    this.finishS = b.finishS ?? this.length - 150;
    this.checkpoints = [this.startS, ...b.checkpoints].filter((s) => s < this.finishS).sort((x, y) => x - y);
    this.pads = b.pads;
    this.rings = b.rings.map((r) => ({ ...r }));
    this.features = b.features;
    this.clock = 0; // seconds; drives moving obstacles (set by the game every step)
    this.obstacles = (b.obstacles || [])
      .filter((o) => o.s > this.startS + 15 && o.s < this.finishS - 5 && !this.gap[this.index(o.s)])
      .map((o) => ({ ...o, knocked: false, knockAt: 0, knockDir: 1 }))
      .sort((a, c) => a.s - c.s);

    const f = makeFrame();
    this.coins = b.coinList
      .filter((st) => st.s < this.finishS && !this.gap[this.index(st.s)])
      .map((st) => {
        this.frameAt(st.s, f);
        return { s: st.s, d: st.d, pos: f.p.clone().addScaledVector(f.R, st.d).addScaledVector(f.N, 1.1), N: f.N.clone(), taken: false };
      });
  }

  index(s) {
    return clamp(Math.round(s / STEP), 0, this.n - 1);
  }

  isGap(s) {
    return this.gap[this.index(s)] === 1;
  }

  frameAt(s, out) {
    s = clamp(s, 0, this.length - 1e-4);
    const i = Math.floor(s / STEP);
    const j = Math.min(i + 1, this.n - 1);
    const f = s / STEP - i;
    out.p.lerpVectors(this.P[i], this.P[j], f);
    out.T.lerpVectors(this.T[i], this.T[j], f).normalize();
    out.N.lerpVectors(this.N[i], this.N[j], f);
    out.N.addScaledVector(out.T, -out.N.dot(out.T)).normalize();
    out.R.crossVectors(out.T, out.N);
    out.kn = lerp(this.kn[i], this.kn[j], f);
    out.kg = lerp(this.kg[i], this.kg[j], f);
    out.w = lerp(this.w[i], this.w[j], f);
    const k = f < 0.5 ? i : j;
    out.walls = this.walls[k];
    out.grip = this.grip[k];
    out.gap = this.gap[k];
    return out;
  }

  // Walk from `guess` to the sample whose cross-section plane contains `pos`.
  findNearest(pos, guess) {
    let i = clamp(guess, 0, this.n - 1);
    for (let k = 0; k < 600; k++) {
      const P = this.P[i];
      const T = this.T[i];
      const along = (pos.x - P.x) * T.x + (pos.y - P.y) * T.y + (pos.z - P.z) * T.z;
      if (along > 0.5 && i < this.n - 1) i++;
      else if (along < -0.5 && i > 0) i--;
      else break;
    }
    return i;
  }
}

/* ====================================================================== textures */
function canvasTex(w, h, paint, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 512 px of texture height = 12 m of road.
function roadTexture(theme, glowOnly) {
  const r = theme.road;
  return canvasTex(256, 512, (x, W, H) => {
    x.fillStyle = glowOnly ? '#000' : r.asphalt;
    x.fillRect(0, 0, W, H);
    if (!glowOnly) {
      const rng = seeded(7);
      for (let i = 0; i < 2600; i++) {
        x.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
        x.fillRect(rng() * W, rng() * H, 2, 2);
      }
    }
    for (let y = 0; y < H; y += 128) {
      x.fillStyle = (y / 128) % 2 ? r.edgeB : r.edgeA;
      x.fillRect(0, y, 18, 128);
      x.fillRect(W - 18, y, 18, 128);
    }
    x.fillStyle = r.line;
    x.fillRect(24, 0, 5, H);
    x.fillRect(W - 29, 0, 5, H);
    x.fillRect(W / 2 - 3, 0, 6, 210);
  });
}

function wallTexture(color) {
  return canvasTex(8, 64, (x, W, H) => {
    const g = x.createLinearGradient(0, H, 0, 0);
    g.addColorStop(0, color + '66');
    g.addColorStop(0.85, color + '14');
    g.addColorStop(0.86, color + 'ff');
    g.addColorStop(1, color + 'ff');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  });
}

function padTexture() {
  return canvasTex(128, 128, (x, W, H) => {
    x.fillStyle = 'rgba(0,200,255,0.25)';
    x.fillRect(0, 0, W, H);
    x.strokeStyle = '#7ff9ff';
    x.lineWidth = 16;
    x.lineJoin = 'miter';
    for (const y0 of [20, 84]) {
      x.beginPath();
      x.moveTo(18, y0 + 34);
      x.lineTo(64, y0);
      x.lineTo(110, y0 + 34);
      x.stroke();
    }
  });
}

function bannerTexture(label, bg, fg, checker) {
  return canvasTex(1024, 128, (x, W, H) => {
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
    if (checker) {
      const s = 16;
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < W / s; i++) {
          x.fillStyle = (i + r) % 2 ? '#111' : '#fff';
          x.fillRect(i * s, r * s, s, s);
          x.fillStyle = (i + r + 1) % 2 ? '#111' : '#fff';
          x.fillRect(i * s, H - (r + 1) * s, s, s);
        }
      }
    }
    x.fillStyle = fg;
    x.font = '800 72px "Baloo 2", "Arial Black", sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(label, W / 2, H / 2 + 4, W - 60);
  }, false);
}

// Chevron arrows for turn warning boards (pointing right; mirrored for left turns).
function chevronTexture(bg, fg) {
  return canvasTex(256, 96, (x, W, H) => {
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
    x.fillStyle = fg;
    for (let i = 0; i < 3; i++) {
      const x0 = 40 + i * 70;
      x.beginPath();
      x.moveTo(x0, 12);
      x.lineTo(x0 + 34, H / 2);
      x.lineTo(x0, H - 12);
      x.lineTo(x0 + 18, H - 12);
      x.lineTo(x0 + 52, H / 2);
      x.lineTo(x0 + 18, 12);
      x.closePath();
      x.fill();
    }
    x.strokeStyle = fg;
    x.lineWidth = 8;
    x.strokeRect(4, 4, W - 8, H - 8);
  }, false);
}

let lampGlowTex = null;
function lampGlowTexture() {
  if (!lampGlowTex) {
    lampGlowTex = canvasTex(64, 64, (x, W) => {
      const g = x.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, W, W);
    }, false);
  }
  return lampGlowTex;
}

function checkerTexture() {
  return canvasTex(64, 64, (x) => {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      x.fillStyle = (r + c) % 2 ? '#111' : '#fff';
      x.fillRect(c * 16, r * 16, 16, 16);
    }
  });
}

/* ====================================================================== meshes */
function pushV(arr, v) { arr.push(v.x, v.y, v.z); }

// A flat strip lying on the road between s0 and s1, laterally [d0, d1], lifted slightly.
function roadStrip(track, s0, s1, d0, d1, lift, vScale) {
  const f = makeFrame();
  const pos = [];
  const uv = [];
  const idx = [];
  const n = Math.max(1, Math.round((s1 - s0) / STEP));
  const a = new V3();
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    track.frameAt(s, f);
    a.copy(f.p).addScaledVector(f.N, lift).addScaledVector(f.R, d0);
    pushV(pos, a);
    a.copy(f.p).addScaledVector(f.N, lift).addScaledVector(f.R, d1);
    pushV(pos, a);
    const v = (s - s0) * vScale;
    uv.push(0, v, 1, v);
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A coin with a raised rim, standing up and facing down the track.
function coinGeometry() {
  const prof = [[0, -0.07], [0.6, -0.07], [0.63, -0.12], [0.76, -0.12], [0.8, 0], [0.76, 0.12], [0.63, 0.12], [0.6, 0.07], [0, 0.07]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 28);
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

function makeArch(track, s, label, theme, kind) {
  const f = track.frameAt(s, makeFrame());
  const g = new THREE.Group();
  const big = kind !== 'checkpoint';
  const hw = f.w + 1.3;
  const H = big ? 8 : 6.5;
  const color = kind === 'finish' ? theme.accent : kind === 'start' ? '#ffffff' : theme.checkpoint;
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.45 });
  const post = new THREE.BoxGeometry(0.9, H, 0.9);
  for (const sx of [-hw, hw]) {
    const m = new THREE.Mesh(post, mat);
    m.position.set(sx, H / 2 - 0.4, 0);
    g.add(m);
  }
  const bh = big ? 2.2 : 1.2;
  const banner = new THREE.MeshBasicMaterial({ map: bannerTexture(label, kind === 'finish' ? '#1b1b2f' : color, kind === 'start' ? '#1b1b2f' : '#ffffff', kind === 'finish'), toneMapped: false });
  const side = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.9, bh, 0.9), [side, side, side, side, banner, banner]);
  beam.position.set(0, H - 0.4 + bh / 2 - 0.2, 0);
  g.add(beam);
  g.position.copy(f.p);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.R, f.N, f.T.clone().negate()));
  return g;
}

function buildTrackMesh(track, theme, opts = {}) {
  const group = new THREE.Group();
  const { n, P, N, R, w, gap, walls } = track;
  const anis = opts.anisotropy || 4;

  // ---- road surface
  const pos = new Float32Array(n * 6);
  const nor = new Float32Array(n * 6);
  const uv = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = P[i], r = R[i], nn = N[i], ww = w[i];
    pos.set([p.x - r.x * ww, p.y - r.y * ww, p.z - r.z * ww, p.x + r.x * ww, p.y + r.y * ww, p.z + r.z * ww], i * 6);
    nor.set([nn.x, nn.y, nn.z, nn.x, nn.y, nn.z], i * 6);
    const v = (i * STEP) / 12;
    uv.set([0, v, 1, v], i * 4);
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    if (gap[i] || gap[i + 1]) continue;
    const a = 2 * i;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  top.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  top.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  top.setIndex(idx);
  const roadMap = roadTexture(theme, false);
  roadMap.anisotropy = anis;
  // In rain the road turns dark and glossy, mirroring the sky and lights.
  const roadMat = opts.wet
    ? new THREE.MeshStandardMaterial({ map: roadMap, color: '#b8bcc8', roughness: 0.3, metalness: 0.25, envMapIntensity: 1.4 })
    : new THREE.MeshStandardMaterial({ map: roadMap, roughness: 0.82, metalness: 0.02 });
  if (theme.neon) {
    const glow = roadTexture(theme, true);
    glow.anisotropy = anis;
    roadMat.emissiveMap = glow;
    roadMat.emissive = new THREE.Color('#ffffff');
    roadMat.emissiveIntensity = 1.3;
  }
  const road = new THREE.Mesh(top, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // ---- slab sides, underside and end caps
  const bp = [];
  const bn = [];
  const tl = new V3(), tr = new V3(), bl = new V3(), br = new V3();
  const tl2 = new V3(), tr2 = new V3(), bl2 = new V3(), br2 = new V3();
  const corners = (i, a, b, c, d) => {
    a.copy(P[i]).addScaledVector(R[i], -w[i]);
    b.copy(P[i]).addScaledVector(R[i], w[i]);
    c.copy(a).addScaledVector(N[i], -SLAB);
    d.copy(b).addScaledVector(N[i], -SLAB);
  };
  const quad = (a, b, c, d, nv) => {
    for (const v of [a, b, c, b, d, c]) pushV(bp, v);
    for (let k = 0; k < 6; k++) pushV(bn, nv);
  };
  const negR = new V3(), negN = new V3(), negT = new V3();
  for (let i = 0; i < n - 1; i++) {
    if (gap[i] || gap[i + 1]) continue;
    corners(i, tl, tr, bl, br);
    corners(i + 1, tl2, tr2, bl2, br2);
    quad(tl, bl, tl2, bl2, negR.copy(R[i]).negate());
    quad(tr, br, tr2, br2, R[i]);
    quad(bl, br, bl2, br2, negN.copy(N[i]).negate());
  }
  for (let i = 0; i < n; i++) {
    if (gap[i]) continue;
    if (i === 0 || gap[i - 1]) {
      corners(i, tl, tr, bl, br);
      quad(tl, tr, bl, br, negT.copy(track.T[i]).negate());
    }
    if (i === n - 1 || gap[i + 1]) {
      corners(i, tl, tr, bl, br);
      quad(tl, tr, bl, br, track.T[i]);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  body.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3));
  group.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: theme.slab, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide })));

  // ---- glass side walls
  const wp = [];
  const wuv = [];
  const WH = 1.3;
  const top1 = new V3(), top2 = new V3();
  for (let i = 0; i < n - 1; i++) {
    if (!walls[i] || !walls[i + 1] || gap[i] || gap[i + 1]) continue;
    corners(i, tl, tr, bl, br);
    corners(i + 1, tl2, tr2, bl2, br2);
    const u0 = (i * STEP) / 4, u1 = ((i + 1) * STEP) / 4;
    for (const [a, b] of [[tl, tl2], [tr, tr2]]) {
      top1.copy(a).addScaledVector(N[i], WH);
      top2.copy(b).addScaledVector(N[i + 1], WH);
      for (const v of [a, top1, b, top1, top2, b]) pushV(wp, v);
      wuv.push(u0, 0, u0, 1, u1, 0, u0, 1, u1, 1, u1, 0);
    }
  }
  if (wp.length) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
    const wm = new THREE.MeshBasicMaterial({ map: wallTexture(theme.wall), transparent: true, side: THREE.DoubleSide, depthWrite: false });
    group.add(new THREE.Mesh(wg, wm));
  }

  // ---- support pillars down into the clouds
  const pillars = [];
  for (let i = 20; i < n; i += 38) {
    if (gap[i] || track.grip[i] > 0 || N[i].y < 0.9) continue;
    const h = P[i].y - SLAB - theme.floorY;
    if (h > 4) pillars.push([P[i].x, P[i].z, h]);
  }
  if (pillars.length) {
    const pg = new THREE.CylinderGeometry(0.9, 1.4, 1, 8);
    pg.translate(0, 0.5, 0);
    const pm = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: theme.pillar, roughness: 0.8 }), pillars.length);
    const m = new THREE.Matrix4();
    pillars.forEach(([x, z, h], k) => {
      m.makeScale(1, h, 1).setPosition(x, theme.floorY, z);
      pm.setMatrixAt(k, m);
    });
    group.add(pm);
  }

  // ---- chevron boards on the outside of sharp turns, a little before the turn starts
  const signs = [];
  {
    const SHARP = 0.011; // sideways curvature (1/m): radius under about 90 m
    let lastSign = -1e9;
    for (let i = 40; i < n - 1; i++) {
      const k = track.kg[i];
      if (Math.abs(k) < SHARP || Math.abs(track.kg[i - 1]) >= SHARP) continue;
      const at = i - 22;
      if (at * STEP - lastSign < 80 || gap[at] || track.grip[at] > 0 || walls[at] || at * STEP > track.finishS) continue;
      lastSign = at * STEP;
      signs.push({ s: at * STEP, side: k > 0 ? -1 : 1, right: k > 0 });
    }
  }
  if (signs.length) {
    const board = new THREE.PlaneGeometry(3.2, 1.2);
    const tex = chevronTexture(theme.signBg || '#ffd400', theme.signFg || '#1b1b2f');
    const texL = tex.clone();
    texL.needsUpdate = true;
    texL.wrapS = THREE.RepeatWrapping;
    texL.repeat.x = -1;
    const matR = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const matL = new THREE.MeshBasicMaterial({ map: texL, toneMapped: false });
    const postGeo = new THREE.BoxGeometry(0.16, 2.2, 0.16);
    const postMat = new THREE.MeshStandardMaterial({ color: '#555c6e', roughness: 0.6, metalness: 0.5 });
    const f = makeFrame();
    for (const sg of signs) {
      track.frameAt(sg.s, f);
      const grp = new THREE.Group();
      const b = new THREE.Mesh(board, sg.right ? matR : matL);
      b.position.y = 2.2;
      const back = new THREE.Mesh(board, postMat);
      back.position.set(0, 2.2, -0.03);
      back.rotation.y = Math.PI;
      for (const px of [-1.1, 1.1]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(px, 1.1, -0.05);
        grp.add(post);
      }
      grp.add(b, back);
      grp.position.copy(f.p).addScaledVector(f.R, sg.side * (f.w + 1.9));
      // right-handed basis: x = R (board's right = driver's right), y = N, z = -T (faces oncoming cars)
      grp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.R, f.N, f.T.clone().negate()));
      group.add(grp);
    }
  }

  // ---- lamp posts with glowing heads on dark tracks
  if (theme.lamps) {
    const lamps = [];
    const f = makeFrame();
    let side = 1;
    for (let s = track.startS + 20; s < track.finishS + 60; s += 42) {
      const i = track.index(s);
      if (gap[i] || track.grip[i] > 0 || N[i].y < 0.85) continue;
      track.frameAt(s, f);
      lamps.push({ p: f.p.clone(), R: f.R.clone(), N: f.N.clone(), T: f.T.clone(), w: f.w, side });
      side = -side;
    }
    if (lamps.length) {
      const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 6.5, 6);
      poleGeo.translate(0, 3.25, 0);
      const armGeo = new THREE.BoxGeometry(1.8, 0.12, 0.12);
      armGeo.translate(-0.9, 6.4, 0);
      const headGeo = new THREE.BoxGeometry(0.7, 0.18, 0.4);
      headGeo.translate(-1.7, 6.3, 0);
      const metal = new THREE.MeshStandardMaterial({ color: '#3b4152', roughness: 0.5, metalness: 0.6 });
      const lampColor = theme.lampColor || '#fff1c4';
      const headMat = new THREE.MeshBasicMaterial({ color: lampColor, toneMapped: false });
      const poles = new THREE.InstancedMesh(poleGeo, metal, lamps.length);
      const arms = new THREE.InstancedMesh(armGeo, metal, lamps.length);
      const heads = new THREE.InstancedMesh(headGeo, headMat, lamps.length);
      const glowPos = [];
      const m = new THREE.Matrix4();
      const basis = new THREE.Matrix4();
      lamps.forEach((l, k) => {
        // local x points in over the road
        const inward = l.R.clone().multiplyScalar(-l.side);
        basis.makeBasis(inward.clone().negate(), l.N, inward.clone().cross(l.N).negate());
        const pos = l.p.clone().addScaledVector(l.R, l.side * (l.w + 0.8));
        m.copy(basis).setPosition(pos);
        poles.setMatrixAt(k, m);
        arms.setMatrixAt(k, m);
        heads.setMatrixAt(k, m);
        const g = pos.clone().addScaledVector(inward, 1.7).addScaledVector(l.N, 6.1);
        glowPos.push(g.x, g.y, g.z);
      });
      group.add(poles, arms, heads);
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
      const glows = new THREE.Points(gg, new THREE.PointsMaterial({ map: lampGlowTexture(), color: lampColor, size: 9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      group.add(glows);
    }
  }

  // ---- start / finish lines and arches
  const lineMat = (map) => new THREE.MeshBasicMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
  const checker = checkerTexture();
  checker.repeat.set(6, 1);
  group.add(new THREE.Mesh(roadStrip(track, track.finishS, track.finishS + 3, -w[track.index(track.finishS)], w[track.index(track.finishS)], 0.02, 1 / 3), lineMat(checker)));
  const startW = w[track.index(track.startS)];
  group.add(new THREE.Mesh(roadStrip(track, track.startS, track.startS + 0.8, -startW, startW, 0.02, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -2 })));
  group.add(makeArch(track, track.startS, 'START', theme, 'start'));
  group.add(makeArch(track, track.finishS, 'FINISH', theme, 'finish'));
  for (const s of track.checkpoints.slice(1)) group.add(makeArch(track, s, 'CHECKPOINT', theme, 'checkpoint'));

  // ---- boost pads
  const padTex = padTexture();
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
  for (const pd of track.pads) group.add(new THREE.Mesh(roadStrip(track, pd.s0, pd.s1, pd.d - pd.hw, pd.d + pd.hw, 0.04, 1 / 4), padMat));

  // ---- stunt rings
  const ringGeo = new THREE.TorusGeometry(1, 0.075, 10, 40);
  const ringMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb000', emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3 });
  const ringMeshes = track.rings.map((r) => {
    const m = new THREE.Mesh(ringGeo, ringMat);
    m.scale.setScalar(r.r);
    m.position.copy(r.pos);
    m.quaternion.setFromUnitVectors(new V3(0, 0, 1), r.dir);
    group.add(m);
    return m;
  });

  // ---- obstacles (models + animation live in obstacles.js)
  const obstacleUpdate = SD.obstacles ? SD.obstacles.buildMeshes(track, theme, group) : null;

  // ---- collectible coins (instanced, animated every frame)
  const coinMesh = new THREE.InstancedMesh(coinGeometry(), new THREE.MeshStandardMaterial({ color: '#ffc933', emissive: '#c77800', emissiveIntensity: 0.55, metalness: 0.65, roughness: 0.28 }), Math.max(1, track.coins.length));
  coinMesh.count = track.coins.length;
  group.add(coinMesh);

  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qs = new THREE.Quaternion();
  const scl = new V3();
  const yAxis = new V3(0, 1, 0);
  const ptmp = new V3();
  const basis = new THREE.Matrix4();
  const coinBase = track.coins.map((st) => {
    const f = track.frameAt(st.s, makeFrame());
    basis.makeBasis(f.R, f.N, f.T.clone().negate());
    return new THREE.Quaternion().setFromRotationMatrix(basis);
  });

  return {
    group,
    update(dt, time) {
      padTex.offset.y -= dt * 1.6;
      if (obstacleUpdate) obstacleUpdate(dt, track.clock);
      for (const m of ringMeshes) m.rotateZ(dt * 0.8);
      track.coins.forEach((st, k) => {
        if (st.taken) {
          mtx.makeScale(0, 0, 0);
        } else {
          qs.setFromAxisAngle(yAxis, time * 3 + k * 0.4);
          q.copy(coinBase[k]).multiply(qs);
          ptmp.copy(st.pos).addScaledVector(st.N, Math.sin(time * 3 + k) * 0.15);
          mtx.compose(ptmp, q, scl.setScalar(1));
        }
        coinMesh.setMatrixAt(k, mtx);
      });
      coinMesh.instanceMatrix.needsUpdate = true;
    },
  };
}

SD.track = { STEP, G, SLAB, makeFrame, TrackBuilder, Track, padTexture, buildTrackMesh };
})();
