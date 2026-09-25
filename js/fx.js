/* GPU point-sprite particles (smoke, sparks, nitro, confetti). */
(() => {
'use strict';
const SD = (window.SD ||= {});
const vert = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vAlpha = aAlpha * smoothstep(1.5, 5.0, -mv.z); // fade out right in front of the camera
  vColor = aColor;
  gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
}`;
const frag = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

class Particles {
  constructor(max, additive) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', attr(this.pos, 3));
    g.setAttribute('aColor', attr(this.col, 3));
    g.setAttribute('aSize', attr(this.size, 1));
    g.setAttribute('aAlpha', attr(this.alpha, 1));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  // o: { pos, vel?, color (THREE.Color), size, life, gravity?, drag?, grow?, alpha? }
  emit(o) {
    let i = this.count;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); // recycle when full
    else this.count++;
    this.pos[i * 3] = o.pos.x;
    this.pos[i * 3 + 1] = o.pos.y;
    this.pos[i * 3 + 2] = o.pos.z;
    this.vel[i * 3] = o.vel ? o.vel.x : 0;
    this.vel[i * 3 + 1] = o.vel ? o.vel.y : 0;
    this.vel[i * 3 + 2] = o.vel ? o.vel.z : 0;
    this.col[i * 3] = o.color.r;
    this.col[i * 3 + 1] = o.color.g;
    this.col[i * 3 + 2] = o.color.b;
    this.size[i] = o.size;
    this.life[i] = this.maxLife[i] = o.life;
    this.grav[i] = o.gravity || 0;
    this.drag[i] = o.drag || 0;
    this.grow[i] = o.grow || 0;
    this.alpha[i] = this.a0[i] = o.alpha ?? 1;
  }

  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const k = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= d;
      this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt;
      this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 2.5);
    }
    this.count = n;
    this.geo.setDrawRange(0, n);
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[name].needsUpdate = true;
  }

  copy(from, to) {
    for (let c = 0; c < 3; c++) {
      this.pos[to * 3 + c] = this.pos[from * 3 + c];
      this.vel[to * 3 + c] = this.vel[from * 3 + c];
      this.col[to * 3 + c] = this.col[from * 3 + c];
    }
    this.size[to] = this.size[from];
    this.alpha[to] = this.alpha[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.grow[to] = this.grow[from];
    this.a0[to] = this.a0[from];
  }

  clear() {
    this.count = 0;
    this.geo.setDrawRange(0, 0);
  }

  setScale(viewportHeight, fovDeg) {
    this.mat.uniforms.uScale.value = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
}

SD.fx = { Particles };
})();
