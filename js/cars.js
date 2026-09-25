/* Low-poly procedural car models and their driving stats. */
(() => {
'use strict';
const SD = (window.SD ||= {});
const { damp, rand } = SD.util;

// top: m/s, accel: m/s^2, grip: lateral m/s^2, air: rotation speed multiplier, unlock: stars needed
const CAR_TYPES = [
  { id: 'racer', name: 'Racer', desc: 'Balanced and quick.', top: 52, accel: 24, grip: 27, air: 1.0, unlock: 0 },
  { id: 'buggy', name: 'Buggy', desc: 'Grippy, with the best air control.', top: 49, accel: 27, grip: 31, air: 1.3, unlock: 3 },
  { id: 'muscle', name: 'Muscle', desc: 'Fastest in a straight line.', top: 57, accel: 22, grip: 24, air: 0.85, unlock: 6 },
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
};

let shared = null;
function sharedAssets() {
  if (shared) return shared;
  shared = {
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
    // lights sit just proud of the bevelled body so they're visible
    for (const x of [-0.62, 0.62]) {
      b.add(box(0.42, 0.14, 0.06, S.head, x, spec.lightY, spec.front - 0.1));
      b.add(box(0.5, 0.16, 0.06, this.brakeMat, x, spec.lightY + 0.08, spec.rear + 0.1));
    }
    b.add(box(0.5, 0.2, 0.04, S.white, 0, spec.lightY - 0.12, spec.rear + 0.1)); // number plate

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
    const tireGeo = new THREE.CylinderGeometry(spec.wheelR, spec.wheelR, spec.wheelW, 18);
    tireGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(spec.wheelR * 0.6, spec.wheelR * 0.6, spec.wheelW + 0.02, 8);
    rimGeo.rotateZ(Math.PI / 2);
    for (const z of spec.wheelZ) {
      for (const x of [-spec.wheelX, spec.wheelX]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, spec.wheelR, z);
        const tire = new THREE.Mesh(tireGeo, S.tire);
        tire.add(new THREE.Mesh(rimGeo, S.rim));
        pivot.add(tire);
        this.root.add(pivot);
        this.wheels.push({ pivot, tire, front: z < 0 });
      }
    }

    this.root.traverse((o) => {
      if (o.isMesh && o.material !== S.flame && o.material !== S.flameCore) o.castShadow = true;
    });
    this.spin = 0;
    this.lean = 0;
    this.pitch = 0;
    this.spring = 0;
    this.springV = 0;
  }

  setColor(color) {
    this.paint.color.set(color);
  }

  // Visual-only kick to the suspension (landings, bumps).
  bump(strength) {
    this.springV -= strength;
  }

  // st: { speed, steer, accel, braking, nitro, grounded }
  update(dt, st) {
    this.spin += (st.speed * dt) / this.spec.wheelR;
    for (const w of this.wheels) {
      w.tire.rotation.x = -this.spin;
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
  }
}

SD.cars = { CAR_TYPES, COLORS, CarModel };
})();
