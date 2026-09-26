/* Track obstacles: cones, barriers, swinging hammers, sliding blocks, spinning bars, oil / ice
 * slicks and bounce pads. They live in road space (s = metres along the track, d = metres to
 * the right of the centre line), like the cars, so hit tests are simple and exact.
 * The TrackBuilder places them (track.js); physics.js reacts to hits; this file owns their
 * shapes, motion, hit tests and 3D models. */
(() => {
'use strict';
const SD = (window.SD ||= {});
const { makeFrame } = SD.track;

const CAR_HALF_LEN = 2.2;
const CAR_HALF_W = 0.95;
const TAU = Math.PI * 2;

// How dangerous each kind is: 'crash' | 'shove' | 'knock' | 'slip' | 'bounce'
const KIND = { cone: 'knock', barrier: 'crash', hammer: 'crash', slider: 'shove', spinner: 'shove', slick: 'slip', bouncer: 'bounce' };
// Rivals plan their lane around these (the moving ones they have to take their chances with).
const STATIC = { cone: true, barrier: true, slick: true };

/* ------------------------------------------------------------------ motion */
const HAMMER_L = 6.4; // arm length
const HAMMER_H = 7.3; // pivot height above the road
const HAMMER_SWING = 1.15; // max swing angle (rad)

function hammerAngle(o, t) { return HAMMER_SWING * Math.sin((TAU * t) / o.period + o.phase); }
function sliderD(o, t) { return o.amp * Math.sin((TAU * t) / o.period + o.phase); }
function spinnerAngle(o, t) { return (TAU * t) / o.period + o.phase; }

/* ------------------------------------------------------------------ hit tests */
// Does a car at (s, d) touch obstacle o at time t? Returns false or { dir } (a sideways push sign).
function hitTest(o, s, d, t) {
  const ds = s - o.s;
  switch (o.type) {
    case 'cone':
      if (o.knocked || Math.abs(ds) > CAR_HALF_LEN + 0.3 || Math.abs(d - o.d) > CAR_HALF_W + 0.3) return false;
      return { dir: Math.sign(o.d - d) || 1 };
    case 'barrier':
      if (Math.abs(ds) > CAR_HALF_LEN + 0.5 || Math.abs(d - o.d) > CAR_HALF_W + o.hw) return false;
      return { dir: Math.sign(d - o.d) || 1 };
    case 'hammer': {
      const a = hammerAngle(o, t);
      const headD = HAMMER_L * Math.sin(a);
      const headY = HAMMER_H - HAMMER_L * Math.cos(a) - 0.9; // bottom of the head
      if (headY > 1.3 || Math.abs(ds) > CAR_HALF_LEN + 0.7 || Math.abs(d - headD) > CAR_HALF_W + 0.9) return false;
      // knocked the way the hammer is swinging
      return { dir: Math.sign(Math.cos((TAU * t) / o.period + o.phase)) || 1 };
    }
    case 'slider': {
      const bd = sliderD(o, t);
      if (Math.abs(ds) > CAR_HALF_LEN + 1.0 || Math.abs(d - bd) > CAR_HALF_W + o.hw) return false;
      return { dir: Math.sign(d - bd) || 1 };
    }
    case 'spinner': {
      const a = spinnerAngle(o, t);
      const c = Math.cos(a), sn = Math.sin(a);
      const along = ds * c + d * sn;
      const across = -ds * sn + d * c;
      // bar half-thickness 0.23 + half a car (plus a little for the car's length)
      if (Math.abs(along) > o.r + 0.6 || Math.abs(across) > 1.2) return false;
      // pushed along the bar's sweep direction
      return { dir: Math.sign(along * c) || 1 };
    }
    case 'slick':
      if (ds < 0 || ds > o.len || Math.abs(d - o.d) > o.hw) return false;
      return { dir: 0 };
    case 'bouncer':
      if (ds < 0 || ds > 5 || Math.abs(d - o.d) > 2.1) return false;
      return { dir: 0 };
    default:
      return false;
  }
}

// Lateral span an obstacle blocks (for rivals' lane planning): [dMin, dMax] or null.
function blockSpan(o) {
  if (o.type === 'cone') return o.knocked ? null : [o.d - 0.4, o.d + 0.4];
  if (o.type === 'barrier') return [o.d - o.hw, o.d + o.hw];
  if (o.type === 'slick') return [o.d - o.hw, o.d + o.hw];
  return null;
}

function reset(track) {
  for (const o of track.obstacles) {
    o.knocked = false;
    o.knockAt = 0;
  }
}

/* ------------------------------------------------------------------ models */
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
const stripes = (a, b) => canvasTex(128, 128, (x, W, H) => {
  x.fillStyle = a;
  x.fillRect(0, 0, W, H);
  x.fillStyle = b;
  for (let i = -W; i < W * 2; i += 44) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 22, 0);
    x.lineTo(i + 22 - H, H);
    x.lineTo(i - H, H);
    x.fill();
  }
});
const slickTex = (kind) => canvasTex(128, 256, (x, W, H) => {
  x.clearRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) {
    const cx = W * (0.25 + Math.random() * 0.5), cy = H * (0.1 + i * 0.1), r = 30 + Math.random() * 30;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    if (kind === 'ice') {
      g.addColorStop(0, 'rgba(210,245,255,0.9)');
      g.addColorStop(0.7, 'rgba(160,220,255,0.6)');
      g.addColorStop(1, 'rgba(160,220,255,0)');
    } else {
      g.addColorStop(0, 'rgba(20,16,30,0.95)');
      g.addColorStop(0.55, 'rgba(60,30,90,0.75)');
      g.addColorStop(0.8, 'rgba(30,110,120,0.45)');
      g.addColorStop(1, 'rgba(10,10,20,0)');
    }
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
}, false);
const bounceTex = () => canvasTex(128, 128, (x, W, H) => {
  x.fillStyle = 'rgba(255,210,0,0.35)';
  x.fillRect(0, 0, W, H);
  x.strokeStyle = '#ffd400';
  x.lineWidth = 14;
  x.lineJoin = 'miter';
  x.beginPath();
  x.moveTo(20, 96);
  x.lineTo(64, 40);
  x.lineTo(108, 96);
  x.stroke();
  x.fillStyle = '#ffd400';
  x.fillRect(58, 40, 12, 70);
});

// A strip lying on the road (decals: slicks, bounce pads).
function decal(track, s0, s1, d0, d1, lift, mat, vScale = 1) {
  const f = makeFrame();
  const pos = [];
  const uv = [];
  const idx = [];
  const n = Math.max(1, Math.round(s1 - s0));
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    track.frameAt(s, f);
    for (const dd of [d0, d1]) {
      const p = f.p.clone().addScaledVector(f.N, lift).addScaledVector(f.R, dd);
      pos.push(p.x, p.y, p.z);
    }
    const v = ((s - s0) / (s1 - s0)) * vScale;
    uv.push(0, v, 1, v);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// Builds every obstacle's model into `group` and returns update(dt, t) that animates them.
function buildMeshes(track, theme, group) {
  if (!track.obstacles.length) return () => {};
  const f = makeFrame();
  const place = (obj, s, d = 0, lift = 0) => {
    track.frameAt(s, f);
    obj.position.copy(f.p).addScaledVector(f.R, d).addScaledVector(f.N, lift);
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.R, f.N, f.T.clone().negate()));
    return obj;
  };
  const metal = new THREE.MeshStandardMaterial({ color: '#4a5266', roughness: 0.45, metalness: 0.7 });
  const warn = new THREE.MeshStandardMaterial({ map: stripes('#ffd400', '#1b1b2f'), roughness: 0.5, metalness: 0.2 });
  const redWhite = new THREE.MeshStandardMaterial({ map: stripes('#ff3b3b', '#ffffff'), roughness: 0.55 });
  const coneMat = new THREE.MeshStandardMaterial({ color: '#ff6a00', roughness: 0.5 });
  const coneBand = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
  const coneGeo = new THREE.ConeGeometry(0.3, 0.75, 12);
  coneGeo.translate(0, 0.375, 0);
  const bandGeo = new THREE.CylinderGeometry(0.17, 0.21, 0.12, 12);
  bandGeo.translate(0, 0.42, 0);
  const baseGeo = new THREE.BoxGeometry(0.62, 0.06, 0.62);
  baseGeo.translate(0, 0.03, 0);
  const oilMat = new THREE.MeshBasicMaterial({ map: slickTex('oil'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const iceMat = new THREE.MeshBasicMaterial({ map: slickTex('ice'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, toneMapped: false });
  const bTex = bounceTex();
  bTex.repeat.set(1, 2);
  const bounceMat = new THREE.MeshBasicMaterial({ map: bTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, toneMapped: false });

  const views = [];
  for (const o of track.obstacles) {
    track.frameAt(o.s, f);
    const w = f.w;
    if (o.type === 'cone') {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(coneGeo, coneMat), new THREE.Mesh(bandGeo, coneBand), new THREE.Mesh(baseGeo, coneMat));
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      place(g, o.s, o.d);
      group.add(g);
      const base = g.position.clone();
      const baseQ = g.quaternion.clone();
      const T = f.T.clone(), R = f.R.clone(), N = f.N.clone();
      const spin = new THREE.Quaternion();
      const axis = new THREE.Vector3(1, 0.3, 0.2).normalize();
      views.push((dt, t) => {
        if (!o.knocked) {
          g.visible = true;
          g.position.copy(base);
          g.quaternion.copy(baseQ);
          return;
        }
        const k = t - o.knockAt;
        g.visible = k < 2.2;
        g.position.copy(base).addScaledVector(T, k * 14).addScaledVector(R, o.knockDir * k * 5).addScaledVector(N, 7 * k - 10 * k * k);
        g.quaternion.copy(baseQ).multiply(spin.setFromAxisAngle(axis, k * 14));
      });
    } else if (o.type === 'barrier') {
      const g = new THREE.Group();
      const block = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2, 1.1, 0.9), redWhite);
      block.position.y = 0.55;
      block.castShadow = true;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffb000', toneMapped: false }));
      lamp.position.set(0, 1.2, 0);
      g.add(block, lamp);
      place(g, o.s, o.d);
      group.add(g);
      views.push((dt, t) => { lamp.visible = Math.sin(t * 8) > 0; });
    } else if (o.type === 'hammer') {
      const g = place(new THREE.Group(), o.s, 0);
      const postGeo = new THREE.BoxGeometry(0.5, HAMMER_H + 1.2, 0.5);
      for (const x of [-(w + 0.8), w + 0.8]) {
        const post = new THREE.Mesh(postGeo, warn);
        post.position.set(x, (HAMMER_H + 1.2) / 2, 0);
        g.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 2.1, 0.6, 0.6), metal);
      beam.position.set(0, HAMMER_H + 0.9, 0);
      g.add(beam);
      const pivot = new THREE.Group();
      pivot.position.set(0, HAMMER_H, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, HAMMER_L, 0.22), metal);
      arm.position.y = -HAMMER_L / 2;
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 14), warn);
      head.rotation.x = Math.PI / 2;
      head.position.y = -HAMMER_L;
      head.castShadow = true;
      pivot.add(arm, head);
      g.add(pivot);
      group.add(g);
      views.push((dt, t) => { pivot.rotation.z = hammerAngle(o, t); });
    } else if (o.type === 'slider') {
      const g = place(new THREE.Group(), o.s, 0);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 0.08, 0.5), metal);
      rail.position.y = 0.04;
      const block = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2, 1.4, 2.0), warn);
      block.position.y = 0.72;
      block.castShadow = true;
      g.add(rail, block);
      group.add(g);
      views.push((dt, t) => { block.position.x = sliderD(o, t); });
    } else if (o.type === 'spinner') {
      const g = place(new THREE.Group(), o.s, 0);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.3, 12), metal);
      hub.position.y = 0.65;
      const rotor = new THREE.Group();
      rotor.position.y = 0.95;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(o.r * 2, 0.45, 0.45), warn);
      bar.castShadow = true;
      const tips = [-o.r, o.r].map((x) => {
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff3b3b', toneMapped: false }));
        tip.position.x = x;
        return tip;
      });
      rotor.add(bar, ...tips);
      g.add(hub, rotor);
      group.add(g);
      // physics bar direction in road space is (cos a, sin a) along (T, R); see the notes in hitTest
      views.push((dt, t) => { rotor.rotation.y = Math.PI / 2 - spinnerAngle(o, t); });
    } else if (o.type === 'slick') {
      group.add(decal(track, o.s, o.s + o.len, o.d - o.hw, o.d + o.hw, 0.03, o.kind === 'ice' ? iceMat : oilMat));
    } else if (o.type === 'bouncer') {
      group.add(decal(track, o.s, o.s + 5, o.d - 2.1, o.d + 2.1, 0.04, bounceMat, 2));
      const frame = place(new THREE.Group(), o.s + 2.5, o.d);
      for (const x of [-2.2, 2.2]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 5), warn);
        rail.position.set(x, 0.09, 0);
        frame.add(rail);
      }
      group.add(frame);
    }
  }
  return (dt, t) => {
    bTex.offset.y -= dt * 1.4;
    for (const v of views) v(dt, t);
  };
}

SD.obstacles = { KIND, STATIC, hitTest, blockSpan, reset, buildMeshes, sliderD, hammerAngle };
})();
