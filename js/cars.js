/* Low-poly procedural car models and their driving stats. */
(() => {
'use strict';
const SD = (window.SD ||= {});
const { damp, rand } = SD.util;

// top: m/s, accel: m/s^2, grip: lateral m/s^2, air: rotation speed multiplier,
// landTol: how crooked a landing can be before it's a crash (higher = more forgiving), price: coins
// slipResist: how much less oil and ice upset it (0..1)
const CAR_TYPES = [
  { id: 'racer', name: 'Racer', desc: 'Balanced and quick.', top: 52, accel: 24, grip: 27, air: 1.0, landTol: 1, price: 0 },
  { id: 'kart', name: 'Zippy', desc: 'Go-kart. Tiny, twitchy, flips like crazy.', top: 47, accel: 30, grip: 33, air: 1.45, landTol: 1.2, price: 600 },
  { id: 'buggy', name: 'Buggy', desc: 'Grippy, with great air control.', top: 49, accel: 27, grip: 31, air: 1.3, landTol: 1.1, price: 1200 },
  { id: 'muscle', name: 'Muscle', desc: 'Brutal top speed.', top: 57, accel: 22, grip: 24, air: 0.85, landTol: 1, price: 2500 },
  { id: 'rally', name: 'Dust Devil', desc: 'Rally car. Grips on oil and ice.', top: 55, accel: 27, grip: 32, air: 1.05, landTol: 1.25, slipResist: 0.7, price: 3500 },
  { id: 'monster', name: 'Stomper', desc: 'Monster truck. Lands almost anything.', top: 51, accel: 25, grip: 26, air: 1.2, landTol: 1.6, price: 5000 },
  { id: 'hotrod', name: 'Hot Rod', desc: 'Dragster. Explosive acceleration.', top: 61, accel: 31, grip: 25, air: 0.9, landTol: 1, price: 6500 },
  { id: 'formula', name: 'Bolt', desc: 'Open-wheel racer. Corners on rails.', top: 60, accel: 28, grip: 34, air: 0.8, landTol: 0.9, price: 8000 },
  { id: 'hyper', name: 'Phantom', desc: 'Hypercar. The best at everything.', top: 63, accel: 30, grip: 31, air: 1.15, landTol: 1.15, price: 14000 },
  { id: 'rocket', name: 'Comet', desc: 'Rocket car. Nothing is faster.', top: 67, accel: 32, grip: 30, air: 1.2, landTol: 1.15, price: 22000 },
];

const COLORS = ['#ff3b5c', '#ff8a00', '#ffd400', '#2ec4b6', '#3a86ff', '#8338ec', '#ff4dc4', '#f1f3f5', '#2b2d42'];

const MODELS = {
  racer: {
    body: [[-2.15, 0.3], [2.0, 0.3], [2.2, 0.46], [2.14, 0.66], [1.15, 0.8], [0.9, 0.84], [-1.1, 0.88], [-1.95, 0.9], [-2.2, 0.8], [-2.22, 0.45]],
    width: 1.84,
    cabin: [[-1.15, 0.84], [0.95, 0.82], [0.35, 1.28], [-0.62, 1.3], [-1.25, 0.95]],
    cabinWidth: 1.5,
    wheelR: 0.4, wheelW: 0.32, wheelX: 0.93, wheelZ: [-1.35, 1.35],
    spoiler: true,
    front: -2.22, rear: 2.24, lightY: 0.6,
  },
  buggy: {
    body: [[-1.7, 0.55], [1.6, 0.55], [2.0, 0.85], [1.9, 1.0], [0.8, 1.05], [-1.5, 1.05], [-1.85, 0.95], [-1.85, 0.6]],
    width: 1.6,
    cage: true,
    wheelR: 0.56, wheelW: 0.44, wheelX: 1.04, wheelZ: [-1.3, 1.3],
    front: -2.02, rear: 1.9, lightY: 0.85,
  },
  muscle: {
    body: [[-2.4, 0.32], [2.3, 0.32], [2.45, 0.5], [2.4, 0.78], [1.0, 0.86], [-2.0, 0.88], [-2.45, 0.84], [-2.45, 0.45]],
    width: 1.95,
    cabin: [[-1.25, 0.86], [0.75, 0.86], [0.2, 1.3], [-0.95, 1.32], [-1.4, 0.95]],
    cabinWidth: 1.6,
    scoop: true,
    stripe: true,
    wheelR: 0.43, wheelW: 0.38, wheelX: 0.98, wheelZ: [-1.5, 1.55],
    front: -2.47, rear: 2.47, lightY: 0.6,
  },
  monster: {
    body: [[-2.2, 1.05], [2.1, 1.05], [2.3, 1.3], [2.25, 1.6], [0.9, 1.65], [-2.0, 1.66], [-2.35, 1.55], [-2.35, 1.15]],
    width: 1.9,
    cabin: [[-1.0, 1.62], [0.75, 1.62], [0.45, 2.25], [-0.65, 2.25], [-1.15, 1.72]],
    cabinWidth: 1.7,
    chassis: true,
    wheelR: 0.86, wheelW: 0.72, wheelX: 1.22, wheelZ: [-1.45, 1.45],
    front: -2.37, rear: 2.37, lightY: 1.38,
  },
  formula: {
    body: [[-2.55, 0.26], [2.1, 0.26], [2.2, 0.55], [1.25, 0.62], [0.35, 0.78], [-0.55, 0.64], [-2.3, 0.42], [-2.6, 0.32]],
    width: 1.0,
    open: true,
    wings: true,
    wheelR: 0.44, wheelW: 0.46, wheelX: 0.98, wheelZ: [-1.6, 1.45],
    front: -2.62, rear: 2.25, lightY: 0.42,
  },
  hyper: {
    body: [[-2.4, 0.28], [2.2, 0.28], [2.38, 0.5], [2.32, 0.72], [1.2, 0.8], [-0.4, 0.9], [-2.2, 0.62], [-2.46, 0.42]],
    width: 1.96,
    cabin: [[-0.95, 0.84], [0.95, 0.8], [0.35, 1.14], [-0.45, 1.14], [-1.15, 0.88]],
    cabinWidth: 1.3,
    fins: true,
    glow: true,
    wheelR: 0.42, wheelW: 0.36, wheelX: 0.99, wheelZ: [-1.45, 1.5],
    front: -2.48, rear: 2.4, lightY: 0.55,
  },
  kart: {
    body: [[-1.5, 0.18], [1.3, 0.18], [1.42, 0.34], [1.1, 0.42], [-1.2, 0.36], [-1.52, 0.28]],
    width: 1.1,
    kart: true,
    wheelR: 0.3, wheelW: 0.32, wheelX: 0.8, wheelZ: [-0.95, 1.0],
    front: -1.52, rear: 1.42, lightY: 0.32,
  },
  rally: {
    body: [[-2.0, 0.34], [1.9, 0.34], [2.05, 0.55], [2.0, 0.8], [1.3, 0.88], [-1.2, 0.9], [-2.0, 0.78], [-2.08, 0.48]],
    width: 1.8,
    cabin: [[-1.1, 0.88], [1.4, 0.86], [1.28, 1.44], [-0.45, 1.47], [-1.2, 0.96]],
    cabinWidth: 1.56,
    rally: true,
    wheelR: 0.43, wheelW: 0.34, wheelX: 0.9, wheelZ: [-1.3, 1.3],
    front: -2.08, rear: 2.08, lightY: 0.62,
  },
  hotrod: {
    body: [[-2.65, 0.45], [1.7, 0.45], [1.92, 0.62], [1.86, 0.96], [0.4, 0.98], [-2.3, 0.84], [-2.68, 0.7]],
    width: 1.5,
    cabin: [[0.15, 0.96], [1.55, 0.94], [1.3, 1.52], [0.55, 1.54], [0.05, 1.05]],
    cabinWidth: 1.3,
    hotrod: true,
    wheelR: 0.62, wheelRFront: 0.36, wheelW: 0.56, wheelX: 1.02, wheelZ: [-1.95, 1.28],
    front: -2.68, rear: 1.94, lightY: 0.76,
  },
  rocket: {
    body: [[-2.95, 0.42], [-2.2, 0.32], [2.1, 0.32], [2.3, 0.55], [2.2, 0.86], [0.6, 0.96], [-0.8, 0.8], [-2.95, 0.5]],
    width: 1.7,
    cabin: [[-0.9, 0.9], [0.7, 0.93], [0.3, 1.32], [-0.4, 1.32], [-1.1, 0.95]],
    cabinWidth: 1.0,
    rocket: true,
    glow: true,
    wheelR: 0.4, wheelW: 0.34, wheelX: 0.95, wheelZ: [-1.6, 1.5],
    front: -2.95, rear: 2.32, lightY: 0.58,
  },
};

let shared = null;
function lightGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sharedAssets() {
  if (shared) return shared;
  shared = {
    glowTex: lightGlowTexture(),
    glass: new THREE.MeshStandardMaterial({ color: '#1b2336', metalness: 0.6, roughness: 0.15 }),
    tire: new THREE.MeshStandardMaterial({ color: '#16161c', roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.8, roughness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: '#23252d', metalness: 0.5, roughness: 0.5 }),
    head: new THREE.MeshStandardMaterial({ color: '#fffbe6', emissive: '#fff4c4', emissiveIntensity: 1.2 }),
    flame: new THREE.MeshBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    flameCore: new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    white: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
  };
  return shared;
}

function extrudeProfile(points, depth, bevel) {
  const shape = new THREE.Shape();
  points.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateY(Math.PI / 2); // profile length -> -Z (front), extrusion -> +X
  g.translate(-depth / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

class CarModel {
  constructor(typeId, color) {
    const spec = MODELS[typeId] || MODELS.racer;
    const S = sharedAssets();
    this.typeId = typeId;
    this.spec = spec;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.paint = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.35 });
    this.brakeMat = new THREE.MeshStandardMaterial({ color: '#ff1f3d', emissive: '#ff1f3d', emissiveIntensity: 0.8 });

    const b = this.body;
    b.add(new THREE.Mesh(extrudeProfile(spec.body, spec.width, 0.08), this.paint));
    if (spec.cabin) b.add(new THREE.Mesh(extrudeProfile(spec.cabin, spec.cabinWidth, 0.06), S.glass));
    if (spec.spoiler) {
      b.add(box(1.9, 0.07, 0.42, this.paint, 0, 1.13, 1.9));
      b.add(box(0.08, 0.3, 0.2, S.dark, -0.6, 0.97, 1.9));
      b.add(box(0.08, 0.3, 0.2, S.dark, 0.6, 0.97, 1.9));
    }
    if (spec.scoop) b.add(box(0.7, 0.14, 0.8, S.dark, 0, 0.9, -1.35));
    if (spec.stripe) b.add(box(0.36, 0.02, 4.7, S.white, 0, 0.89, 0.05));
    if (spec.cage) {
      const bar = 0.09;
      for (const x of [-0.72, 0.72]) {
        for (const z of [-0.55, 0.75]) b.add(box(bar, 0.85, bar, S.dark, x, 1.45, z));
        b.add(box(bar, bar, 1.4, S.dark, x, 1.87, 0.1));
      }
      b.add(box(1.52, bar, bar, S.dark, 0, 1.87, -0.55));
      b.add(box(1.52, bar, bar, S.dark, 0, 1.87, 0.75));
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), this.paint);
      helmet.position.set(0, 1.45, 0.15);
      b.add(helmet);
      b.add(box(0.46, 0.14, 0.05, S.glass, 0, 1.47, -0.1));
    }
    if (spec.chassis) {
      // monster truck: exposed frame, axles and a roll bar
      b.add(box(1.4, 0.35, 4.0, S.dark, 0, 0.82, 0));
      for (const z of spec.wheelZ) b.add(box(2.3, 0.16, 0.16, S.dark, 0, spec.wheelR, z));
      b.add(box(1.6, 0.1, 0.1, S.dark, 0, 2.05, 1.3));
      for (const x of [-0.75, 0.75]) b.add(box(0.1, 0.45, 0.1, S.dark, x, 1.85, 1.3));
    }
    if (spec.open) {
      // formula: open cockpit with a driver, nose cone and wings
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), S.white);
      helmet.position.set(0, 0.92, 0.2);
      b.add(helmet);
      b.add(box(0.44, 0.12, 0.05, S.glass, 0, 0.95, -0.05));
      b.add(box(2.1, 0.06, 0.5, this.paint, 0, 0.3, -2.3));
      b.add(box(0.06, 0.2, 0.5, S.dark, -1.02, 0.36, -2.3));
      b.add(box(0.06, 0.2, 0.5, S.dark, 1.02, 0.36, -2.3));
      b.add(box(1.9, 0.08, 0.5, this.paint, 0, 1.08, 2.02));
      b.add(box(0.1, 0.5, 0.3, S.dark, 0, 0.82, 2.0));
      for (const x of [-0.95, 0.95]) b.add(box(0.06, 0.34, 0.55, S.dark, x, 1.0, 2.02));
      b.add(box(1.7, 0.28, 1.6, this.paint, 0, 0.42, 0.9)); // side pods
    }
    if (spec.kart) {
      // go-kart: seat, driver, steering column, bumpers, rear engine
      b.add(box(0.7, 0.55, 0.12, S.dark, 0, 0.62, 0.62)); // seat back
      b.add(box(0.7, 0.1, 0.6, S.dark, 0, 0.38, 0.35)); // seat
      const driver = box(0.5, 0.5, 0.36, this.paint, 0, 0.72, 0.3);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), S.white);
      helmet.position.set(0, 1.12, 0.28);
      b.add(driver, helmet, box(0.36, 0.12, 0.05, S.glass, 0, 1.13, 0.06));
      b.add(box(0.06, 0.06, 0.6, S.dark, 0, 0.62, -0.35)); // steering column
      b.add(box(0.36, 0.05, 0.05, S.dark, 0, 0.78, -0.62)); // wheel
      b.add(box(1.7, 0.1, 0.12, S.dark, 0, 0.3, -1.55)); // front bumper
      b.add(box(1.8, 0.1, 0.12, S.dark, 0, 0.32, 1.5)); // rear bumper
      b.add(box(0.55, 0.36, 0.4, S.dark, 0.25, 0.42, 1.12)); // engine
      b.add(box(0.1, 0.1, 0.4, S.rim, 0.45, 0.5, 1.4)); // exhaust
    }
    if (spec.rally) {
      b.add(box(0.5, 0.12, 0.7, S.dark, 0, 1.5, -0.1)); // roof scoop
      b.add(box(1.2, 0.14, 0.12, S.dark, 0, 1.52, -0.45)); // roof light bar
      for (const x of [-0.42, -0.14, 0.14, 0.42]) b.add(box(0.2, 0.16, 0.06, S.head, x, 1.52, -0.52));
      b.add(box(1.7, 0.07, 0.36, this.paint, 0, 1.38, 1.5)); // rear wing
      b.add(box(0.08, 0.2, 0.2, S.dark, -0.6, 1.26, 1.5));
      b.add(box(0.08, 0.2, 0.2, S.dark, 0.6, 1.26, 1.5));
      for (const x of [-0.92, 0.92]) b.add(box(0.3, 0.38, 0.04, S.dark, x, 0.38, 1.72)); // mud flaps
      b.add(box(0.24, 0.02, 3.4, S.white, 0.42, 0.91, 0.1)); // livery stripes
      b.add(box(0.24, 0.02, 3.4, S.white, -0.42, 0.91, 0.1));
    }
    if (spec.hotrod) {
      // supercharger blower through the hood, side pipes
      b.add(box(0.62, 0.3, 0.7, S.rim, 0, 1.1, -1.25));
      b.add(box(0.72, 0.16, 0.32, S.dark, 0, 1.32, -1.3));
      for (const x of [-0.86, 0.86]) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8), S.rim);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(x, 0.42, -0.4);
        b.add(pipe);
      }
      b.add(box(0.2, 0.02, 4.0, S.white, 0, 1.0, -0.4)); // centre stripe
    }
    if (spec.rocket) {
      // tail fin, side wings and a glowing jet nozzle
      b.add(box(0.08, 0.9, 0.9, this.paint, 0, 1.3, 1.75));
      for (const x of [-1, 1]) {
        const wing = box(0.9, 0.06, 0.8, this.paint, x * 1.15, 0.5, 0.9);
        wing.rotation.z = x * -0.12;
        b.add(wing);
      }
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.5, 14, 1, true), S.dark);
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(0, 0.62, 2.45);
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.3, 14), S.flameCore);
      core.position.set(0, 0.62, 2.62);
      b.add(nozzle, core);
    }
    if (spec.fins) {
      for (const x of [-0.72, 0.72]) b.add(box(0.06, 0.34, 0.9, this.paint, x, 0.95, 1.7));
      b.add(box(1.5, 0.06, 0.34, S.dark, 0, 1.12, 2.0));
    }
    if (spec.glow) {
      // neon underglow in the car's colour
      this.glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      const under = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 4.6), this.glowMat);
      under.rotation.x = -Math.PI / 2;
      under.position.y = 0.06;
      b.add(under);
    }
    // lights sit just proud of the bevelled body so they're visible
    for (const x of [-0.62, 0.62]) {
      b.add(box(0.42, 0.14, 0.06, S.head, x, spec.lightY, spec.front - 0.1));
      b.add(box(0.5, 0.16, 0.06, this.brakeMat, x, spec.lightY + 0.08, spec.rear + 0.1));
    }
    b.add(box(0.5, 0.2, 0.04, S.white, 0, spec.lightY - 0.12, spec.rear + 0.1)); // number plate

    // light glows: soft additive sprites over the head and tail lights
    const glow = (color, pts) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const mat = new THREE.PointsMaterial({ map: S.glowTex, color, size: 1.3, sizeAttenuation: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const pts3 = new THREE.Points(geo, mat);
      pts3.frustumCulled = false;
      b.add(pts3);
      return mat;
    };
    this.headGlow = glow('#fff2c8', [-0.62, spec.lightY, spec.front - 0.3, 0.62, spec.lightY, spec.front - 0.3]);
    this.tailGlow = glow('#ff2a3d', [-0.62, spec.lightY + 0.08, spec.rear + 0.3, 0.62, spec.lightY + 0.08, spec.rear + 0.3]);
    this.lightLevel = 0.4;

    // nitro flames (hidden unless boosting)
    this.flames = [];
    const flameGeo = new THREE.ConeGeometry(0.17, 1, 10, 1, true);
    flameGeo.rotateX(Math.PI / 2);
    flameGeo.translate(0, 0, 0.5);
    for (const x of [-0.45, 0.45]) {
      const f = new THREE.Mesh(flameGeo, S.flame);
      f.position.set(x, 0.42, spec.rear - 0.02);
      const core = new THREE.Mesh(flameGeo, S.flameCore);
      core.scale.set(0.5, 0.5, 0.6);
      f.add(core);
      f.visible = false;
      b.add(f);
      this.flames.push(f);
    }

    // wheels (not parented to the body so they don't lean with it)
    this.wheels = [];
    const wheelGeo = (r) => {
      const tireGeo = new THREE.CylinderGeometry(r, r, spec.wheelW, 18);
      tireGeo.rotateZ(Math.PI / 2);
      const rimGeo = new THREE.CylinderGeometry(r * 0.6, r * 0.6, spec.wheelW + 0.02, 8);
      rimGeo.rotateZ(Math.PI / 2);
      return { tireGeo, rimGeo };
    };
    const rear = wheelGeo(spec.wheelR);
    const frontG = spec.wheelRFront ? wheelGeo(spec.wheelRFront) : rear;
    for (const z of spec.wheelZ) {
      const isFront = z < 0;
      const r = isFront && spec.wheelRFront ? spec.wheelRFront : spec.wheelR;
      const g = isFront ? frontG : rear;
      for (const x of [-spec.wheelX, spec.wheelX]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, r, z);
        const tire = new THREE.Mesh(g.tireGeo, S.tire);
        tire.add(new THREE.Mesh(g.rimGeo, S.rim));
        pivot.add(tire);
        this.root.add(pivot);
        this.wheels.push({ pivot, tire, front: isFront, r });
      }
    }

    this.root.traverse((o) => {
      if (o.isMesh && o.material !== S.flame && o.material !== S.flameCore && o.material !== this.glowMat) o.castShadow = true;
    });
    this.spin = 0;
    this.lean = 0;
    this.pitch = 0;
    this.spring = 0;
    this.springV = 0;
  }

  // 0 = broad daylight, 1 = night: how strongly the lights glow.
  setLights(level) {
    this.lightLevel = level;
  }

  setColor(color) {
    this.paint.color.set(color);
    if (this.glowMat) this.glowMat.color.set(color);
  }

  // Visual-only kick to the suspension (landings, bumps).
  bump(strength) {
    this.springV -= strength;
  }

  // st: { speed, steer, accel, braking, nitro, grounded }
  update(dt, st) {
    this.spin += st.speed * dt;
    for (const w of this.wheels) {
      w.tire.rotation.x = -this.spin / w.r;
      if (w.front) w.pivot.rotation.y = -st.steer * 0.42;
    }
    const k = Math.min(1, st.speed / 30);
    this.lean = damp(this.lean, st.grounded ? st.steer * 0.06 * k : 0, 8, dt);
    this.pitch = damp(this.pitch, st.grounded ? st.accel * 0.004 : 0, 6, dt);
    this.springV += (-this.spring * 220 - this.springV * 14) * dt;
    this.spring += this.springV * dt;
    this.body.rotation.z = this.lean;
    this.body.rotation.x = this.pitch;
    this.body.position.y = Math.max(-0.25, this.spring * 0.5);
    for (const f of this.flames) {
      f.visible = st.nitro;
      if (st.nitro) f.scale.set(1, 1, rand(0.8, 1.5));
    }
    this.brakeMat.emissiveIntensity = st.braking ? 3.2 : 0.8;
    this.headGlow.opacity = 0.25 + this.lightLevel * 0.55;
    this.headGlow.size = 1.1 + this.lightLevel * 1.4;
    this.tailGlow.opacity = (st.braking ? 0.75 : 0.2) + this.lightLevel * 0.3;
    this.tailGlow.size = st.braking ? 1.6 : 1 + this.lightLevel * 0.5;
  }
}

SD.cars = { CAR_TYPES, COLORS, CarModel };
})();
