/* Weather: rain (with lightning), snow, sugar snow, sandstorm, embers, ash and mist.
 * Particles live in a box that wraps around the camera and move on the GPU, so weather costs
 * almost nothing per frame. */
(() => {
'use strict';
const SD = (window.SD ||= {});

// kind -> look. vel: m/s, box: size of the wrapped volume around the camera,
// fog: how much closer the fog comes, sun/light: dimming, lines: draw as streaks (rain).
const KINDS = {
  clear: null,
  mist: { count: 0, fog: 0.45, sun: 0.8, light: 0.95 },
  rain: { count: 2600, lines: true, len: 1.6, vel: [2, -34, 0], box: [70, 44, 70], color: '#b8c8e0', opacity: 0.42, fog: 0.62, sun: 0.45, light: 0.8, wet: true, lightning: false },
  storm: { count: 3400, lines: true, len: 2.0, vel: [6, -40, 2], box: [70, 44, 70], color: '#c3d0e6', opacity: 0.5, fog: 0.5, sun: 0.3, light: 0.7, wet: true, lightning: true },
  snow: { count: 2200, size: 0.22, vel: [0.8, -3.2, 0.4], sway: 0.9, box: [60, 36, 60], color: '#ffffff', opacity: 0.9, fog: 0.55, sun: 0.75, light: 0.95 },
  sugar: { count: 1800, size: 0.2, vel: [0.5, -2.6, 0.3], sway: 1.1, box: [60, 36, 60], color: '#ffc2ec', opacity: 0.85, fog: 0.85, sun: 1, light: 1 },
  sand: { count: 2600, size: 0.16, vel: [34, -1.2, 6], sway: 0.6, box: [70, 30, 70], color: '#e6b97a', opacity: 0.55, fog: 0.33, sun: 0.6, light: 0.9 },
  embers: { count: 1300, size: 0.2, vel: [1.2, 4.5, 0.6], sway: 1.4, box: [60, 40, 60], color: '#ff8a2a', opacity: 1, additive: true, fog: 0.8, sun: 1, light: 1 },
  ash: { count: 1600, size: 0.18, vel: [1, -2.2, 0.8], sway: 1, box: [60, 36, 60], color: '#6d6468', opacity: 0.8, fog: 0.7, sun: 0.8, light: 0.95 },
};

const vert = `
attribute float aRand;
attribute float aEnd;
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
uniform vec3 uVel;
uniform float uSway;
uniform float uSize;
uniform float uScale;
uniform float uLen;
uniform float uOpacity;
varying float vA;
void main() {
  float speed = 0.75 + 0.5 * aRand;
  vec3 p = position + uVel * uTime * speed;
  p.x += sin(uTime * 1.3 + aRand * 40.0) * uSway;
  p.z += cos(uTime * 1.1 + aRand * 31.0) * uSway;
  p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
  p -= normalize(uVel) * uLen * aEnd;        // streak tail (rain)
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  float edge = 1.0 - smoothstep(0.32, 0.5, length((p - uCam) / uBox));
  vA = uOpacity * smoothstep(0.4, 2.5, dist) * edge * (aEnd > 0.5 ? 0.15 : 1.0);
  gl_PointSize = max(1.5, uSize * uScale / max(dist, 0.1));
  gl_Position = projectionMatrix * mv;
}`;
const fragPoints = `
uniform vec3 uColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.15, d) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;
const fragLines = `
uniform vec3 uColor;
varying float vA;
void main() {
  gl_FragColor = vec4(uColor, vA);
  #include <colorspace_fragment>
}`;

class Weather {
  constructor(scene) {
    this.scene = scene;
    this.kind = 'clear';
    this.mesh = null;
    this.time = 0;
    this.nextBolt = 8;
    this.onLightning = null; // (strength) => void
    this.onThunder = null; // (delaySeconds) => void
  }

  static look(kind) { return KINDS[kind] || null; }

  set(kind) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    this.kind = KINDS[kind] ? kind : 'clear';
    const k = KINDS[this.kind];
    this.nextBolt = 5 + Math.random() * 6;
    if (!k || !k.count) return;
    const n = k.count;
    const per = k.lines ? 2 : 1;
    const pos = new Float32Array(n * per * 3);
    const rnd = new Float32Array(n * per);
    const end = new Float32Array(n * per);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * k.box[0], y = Math.random() * k.box[1], z = Math.random() * k.box[2], r = Math.random();
      for (let e = 0; e < per; e++) {
        const j = i * per + e;
        pos.set([x, y, z], j * 3);
        rnd[j] = r;
        end[j] = e;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(...k.box) },
        uVel: { value: new THREE.Vector3(...k.vel) },
        uSway: { value: k.sway || 0 },
        uSize: { value: k.size || 0.2 },
        uScale: { value: 500 },
        uLen: { value: k.len || 0 },
        uOpacity: { value: k.opacity },
        uColor: { value: new THREE.Color(k.color) },
      },
      vertexShader: vert,
      fragmentShader: k.lines ? fragLines : fragPoints,
      transparent: true,
      depthWrite: false,
      blending: k.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = k.lines ? new THREE.LineSegments(geo, mat) : new THREE.Points(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.scene.add(this.mesh);
  }

  setScale(viewportHeight, fovDeg) {
    this.scale = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    if (this.mesh) this.mesh.material.uniforms.uScale.value = this.scale;
  }

  update(dt, camera) {
    this.time += dt;
    const k = KINDS[this.kind];
    if (this.mesh) {
      const u = this.mesh.material.uniforms;
      u.uTime.value = this.time % 1000;
      u.uCam.value.copy(camera.position);
      if (this.scale) u.uScale.value = this.scale;
    }
    if (k && k.lightning) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 6 + Math.random() * 9;
        const strength = 0.7 + Math.random() * 0.5;
        if (this.onLightning) this.onLightning(strength);
        if (this.onThunder) this.onThunder(0.3 + Math.random() * 1.2);
      }
    }
  }
}

SD.weather = { Weather };
})();
