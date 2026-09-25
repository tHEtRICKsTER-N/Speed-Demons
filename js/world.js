/* Sky, clouds, floating islands, hot-air balloons and lighting around a track. */
(() => {
'use strict';
const SD = (window.SD ||= {});
const { seeded } = SD.util;

const V3 = THREE.Vector3;

function canvasTexture(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cloudTexture() {
  const rng = seeded(11);
  const t = canvasTexture(512, 512, (x, W, H) => {
    x.clearRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      const cx = rng() * W;
      const cy = rng() * H;
      const r = 30 + rng() * 70;
      for (const ox of [-W, 0, W]) {
        for (const oy of [-H, 0, H]) {
          const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
          g.addColorStop(0, 'rgba(255,255,255,0.55)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = g;
          x.fillRect(cx + ox - r, cy + oy - r, r * 2, r * 2);
        }
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function balloonTexture(a, b) {
  return canvasTexture(256, 64, (x, W, H) => {
    for (let i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? a : b;
      x.fillRect((i * W) / 8, 0, W / 8 + 1, H);
    }
  });
}

const skyVert = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFrag = `
uniform vec3 top;
uniform vec3 mid;
uniform vec3 bottom;
uniform vec3 sunDir;
uniform vec3 sunColor;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(mid, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(mid, bottom, pow(clamp(-h, 0.0, 1.0), 0.4));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(sd, 700.0) * 2.5 + pow(sd, 24.0) * 0.3);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class World {
  constructor(scene) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight('#ffffff', '#666666', 1);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.shadow.camera.left = -32;
    this.sun.shadow.camera.right = 32;
    this.sun.shadow.camera.top = 32;
    this.sun.shadow.camera.bottom = -32;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.hemi, this.sun, this.sun.target);
    this.sunDir = new V3(0, 1, 0);

    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color() },
        mid: { value: new THREE.Color() },
        bottom: { value: new THREE.Color() },
        sunDir: { value: new V3(0, 1, 0) },
        sunColor: { value: new THREE.Color() },
      },
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.group = null;
    this.cloudTex = cloudTexture();
    this.balloons = [];
  }

  setShadows(on, size) {
    this.sun.castShadow = on;
    if (on && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
  }

  build(theme, track) {
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.map && o.material.map !== this.cloudTex) o.material.map.dispose();
      });
    }
    const g = (this.group = new THREE.Group());
    this.scene.add(g);
    this.theme = theme;
    const rng = seeded(track.n * 7 + 3);

    // sky, fog, light
    const u = this.skyMat.uniforms;
    u.top.value.set(theme.sky.top);
    u.mid.value.set(theme.sky.mid);
    u.bottom.value.set(theme.sky.bottom);
    u.sunColor.value.set(theme.sun.glow);
    this.sunDir.fromArray(theme.sun.dir).normalize();
    u.sunDir.value.copy(this.sunDir);
    this.scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    this.hemi.color.set(theme.hemi.sky);
    this.hemi.groundColor.set(theme.hemi.ground);
    this.hemi.intensity = theme.hemi.intensity;
    this.sun.color.set(theme.sun.color);
    this.sun.intensity = theme.sun.intensity;

    const center = track.bbox.getCenter(new V3());
    const size = track.bbox.getSize(new V3());
    const spread = Math.max(size.x, size.z) / 2 + 700;

    // Points sampled along the track so scenery keeps its distance from the road.
    const avoid = [];
    for (let i = 0; i < track.n; i += 12) avoid.push(track.P[i]);
    const clearOf = (x, y, z, r) => {
      for (const p of avoid) {
        const dx = p.x - x, dy = p.y - y, dz = p.z - z;
        if (dx * dx + dy * dy * 0.5 + dz * dz < r * r) return false;
      }
      return true;
    };

    // cloud sea: an opaque floor plus a drifting puffy layer
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ color: theme.cloud }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(center.x, theme.cloudY - 4, center.z);
    g.add(floor);
    this.cloudTex.repeat.set(16, 16);
    const layer = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshLambertMaterial({ map: this.cloudTex, color: theme.cloud, transparent: true, depthWrite: false }),
    );
    layer.rotation.x = -Math.PI / 2;
    layer.position.set(center.x, theme.cloudY + 2, center.z);
    g.add(layer);

    // puffy low-poly cloud clusters
    const puffs = [];
    for (let c = 0; c < 90 && puffs.length < 520; c++) {
      const high = c < 18;
      const x = center.x + (rng() * 2 - 1) * spread;
      const z = center.z + (rng() * 2 - 1) * spread;
      const y = high ? track.minY - 30 + rng() * (track.maxY - track.minY + 90) : theme.cloudY + rng() * 12;
      if (!clearOf(x, y, z, high ? 110 : 40)) continue;
      const k = 5 + Math.floor(rng() * 4);
      const base = (high ? 8 : 16) + rng() * 16;
      for (let i = 0; i < k; i++) {
        const s = base * (0.6 + rng() * 0.6);
        puffs.push([x + (rng() - 0.5) * base * 2.6, y + (rng() - 0.3) * base * 0.5, z + (rng() - 0.5) * base * 1.6, s]);
      }
    }
    const puffMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: theme.cloud, flatShading: true }), puffs.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new V3();
    const ps = new V3();
    puffs.forEach(([x, y, z, s], i) => {
      q.setFromAxisAngle(new V3(0, 1, 0), rng() * 6);
      puffMesh.setMatrixAt(i, m.compose(ps.set(x, y, z), q, sc.set(s, s * 0.7, s)));
    });
    g.add(puffMesh);

    // floating islands with little trees
    const islands = [];
    for (let tries = 0; tries < 220 && islands.length < 34; tries++) {
      const x = center.x + (rng() * 2 - 1) * (spread - 250);
      const z = center.z + (rng() * 2 - 1) * (spread - 250);
      const y = track.minY - 20 + rng() * (track.maxY - track.minY + 60);
      const s = 8 + rng() * 22;
      if (clearOf(x, y, z, 55 + s * 1.5)) islands.push([x, y, z, s]);
    }
    const rockGeo = new THREE.ConeGeometry(1, 1.9, 7);
    rockGeo.rotateX(Math.PI);
    rockGeo.translate(0, -0.95, 0);
    const capGeo = new THREE.CylinderGeometry(1.06, 0.98, 0.3, 7);
    capGeo.translate(0, 0.15, 0);
    const treeGeo = new THREE.ConeGeometry(0.16, 0.55, 6);
    treeGeo.translate(0, 0.55, 0);
    const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: '#8a6a55', flatShading: true }), islands.length);
    const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshLambertMaterial({ color: theme.islands, flatShading: true }), islands.length);
    const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ color: theme.nightSky ? '#2a6b6b' : '#2f8f4e', flatShading: true }), islands.length * 4);
    let t = 0;
    islands.forEach(([x, y, z, s], i) => {
      q.setFromAxisAngle(new V3(0, 1, 0), rng() * 6);
      rocks.setMatrixAt(i, m.compose(ps.set(x, y, z), q, sc.set(s, s * (0.8 + rng() * 0.6), s)));
      caps.setMatrixAt(i, m.compose(ps.set(x, y, z), q, sc.set(s, s, s)));
      for (let k = 0; k < 4; k++) {
        const a = rng() * 6.28;
        const r = rng() * 0.7 * s;
        const ts = s * (0.9 + rng() * 0.8);
        trees.setMatrixAt(t++, m.compose(ps.set(x + Math.cos(a) * r, y + 0.3 * s, z + Math.sin(a) * r), q, sc.set(ts, ts, ts)));
      }
    });
    trees.count = t;
    g.add(rocks, caps, trees);

    // hot-air balloons
    this.balloons = [];
    if (theme.balloons) {
      const palette = [['#ff4757', '#ffffff'], ['#ffd23f', '#3a86ff'], ['#2ec4b6', '#ffffff'], ['#ff8a00', '#8338ec'], ['#ff4dc4', '#ffe066']];
      for (let tries = 0; tries < 80 && this.balloons.length < 7; tries++) {
        const x = center.x + (rng() * 2 - 1) * (spread - 400);
        const z = center.z + (rng() * 2 - 1) * (spread - 400);
        const y = track.minY + rng() * (track.maxY - track.minY + 50);
        if (!clearOf(x, y, z, 70)) continue;
        const [a, b] = palette[this.balloons.length % palette.length];
        const bg = new THREE.Group();
        const env = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), new THREE.MeshLambertMaterial({ map: balloonTexture(a, b) }));
        env.scale.y = 1.2;
        const basket = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.2), new THREE.MeshLambertMaterial({ color: '#8b5a2b' }));
        basket.position.y = -9.5;
        bg.add(env, basket);
        bg.position.set(x, y, z);
        g.add(bg);
        this.balloons.push({ obj: bg, y, phase: rng() * 6 });
      }
    }

    // night: stars
    this.starfield = null;
    if (theme.nightSky) {
      const pos = [];
      for (let i = 0; i < 1400; i++) {
        const v = new V3(rng() * 2 - 1, rng() * 0.9 + 0.05, rng() * 2 - 1).normalize().multiplyScalar(1400);
        pos.push(v.x, v.y, v.z);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      this.starfield = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.8, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 }));
      this.starfield.frustumCulled = false;
      g.add(this.starfield);
    }
  }

  update(dt, time, camera, focus) {
    this.sky.position.copy(camera.position);
    if (this.starfield) this.starfield.position.copy(camera.position);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 150);
    this.sun.target.position.copy(focus);
    this.cloudTex.offset.x += dt * 0.002;
    for (const b of this.balloons) b.obj.position.y = b.y + Math.sin(time * 0.4 + b.phase) * 3;
  }
}

SD.world = { World };
})();
