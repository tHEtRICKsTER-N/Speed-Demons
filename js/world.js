/* The world around a track: sky, lighting, reflections, and the scenery of each environment
 * (sky islands, desert canyon, frozen peaks, volcano). Weather lives in weather.js. */
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

// Soft round glow for sprites (sun, lights).
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  glowTex = canvasTexture(128, 128, (x, W) => {
    const g = x.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, W);
  });
  return glowTex;
}

// Tileable ground textures: speckled noise over a base colour, plus a pattern per surface.
function groundTexture(kind, base) {
  const t = canvasTexture(256, 256, (x, W, H) => {
    const rng = seeded(kind.length * 97);
    x.fillStyle = base;
    x.fillRect(0, 0, W, H);
    if (kind === 'sand') {
      // dune ripples
      x.strokeStyle = 'rgba(120,70,20,0.13)';
      x.lineWidth = 3;
      for (let y = 0; y < H; y += 14) {
        x.beginPath();
        for (let px = 0; px <= W; px += 8) x.lineTo(px, y + Math.sin((px / W) * Math.PI * 4 + y) * 4);
        x.stroke();
      }
    }
    for (let i = 0; i < 2200; i++) {
      const light = rng() < 0.5;
      x.fillStyle = kind === 'lava' ? (light ? 'rgba(255,220,120,0.25)' : 'rgba(40,0,0,0.25)') : light ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';
      x.fillRect(rng() * W, rng() * H, 2, 2);
    }
    if (kind === 'lava') {
      // dark crust plates with glowing cracks between them
      for (let i = 0; i < 26; i++) {
        const cx = rng() * W, cy = rng() * H, r = 12 + rng() * 26;
        for (const ox of [-W, 0, W]) {
          for (const oy of [-H, 0, H]) {
            x.fillStyle = `rgba(${40 + rng() * 30},${10 + rng() * 10},8,0.92)`;
            x.beginPath();
            for (let k = 0; k < 7; k++) {
              const a = (k / 7) * Math.PI * 2;
              const rr = r * (0.7 + rng() * 0.4);
              x.lineTo(cx + ox + Math.cos(a) * rr, cy + oy + Math.sin(a) * rr);
            }
            x.fill();
          }
        }
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Horizontal rock strata for mesas.
function strataTexture(colors) {
  const t = canvasTexture(16, 256, (x, W, H) => {
    const rng = seeded(5);
    let y = 0;
    while (y < H) {
      const h = 8 + rng() * 28;
      x.fillStyle = colors[Math.floor(rng() * colors.length)];
      x.fillRect(0, y, W, h + 1);
      y += h;
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
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
uniform float flash;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(mid, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(mid, bottom, pow(clamp(-h, 0.0, 1.0), 0.4));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(sd, 700.0) * 2.5 + pow(sd, 24.0) * 0.3);
  col += vec3(0.75, 0.8, 1.0) * flash;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
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
        flash: { value: 0 },
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

    // big soft glow around the sun (a cheap stand-in for bloom)
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, depthTest: true, fog: false, blending: THREE.AdditiveBlending }));
    this.sunGlow.renderOrder = -9;
    scene.add(this.sunGlow);

    this.pmrem = renderer ? new THREE.PMREMGenerator(renderer) : null;
    this.envRT = null;
    this.group = null;
    this.cloudTex = cloudTexture();
    this.balloons = [];
    this.animated = [];
    this.flash = 0;
    this.baseHemi = 1;
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

  build(theme, track, opts = {}) {
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (m.map && m.map !== this.cloudTex && m.map !== glowTex) m.map.dispose();
            m.dispose();
          }
        }
      });
    }
    const g = (this.group = new THREE.Group());
    this.scene.add(g);
    this.theme = theme;
    this.balloons = [];
    this.animated = [];
    this.starfield = null;
    const rng = seeded(track.n * 7 + 3);

    // sky, fog, light
    const u = this.skyMat.uniforms;
    u.top.value.set(theme.sky.top);
    u.mid.value.set(theme.sky.mid);
    u.bottom.value.set(theme.sky.bottom);
    u.sunColor.value.set(theme.sun.glow);
    this.sunDir.fromArray(theme.sun.dir).normalize();
    u.sunDir.value.copy(this.sunDir);
    const fogK = opts.fogScale || 1;
    this.scene.fog = new THREE.Fog(opts.fogColor || theme.fog, theme.fogNear * fogK, theme.fogFar * fogK);
    this.hemi.color.set(theme.hemi.sky);
    this.hemi.groundColor.set(theme.hemi.ground);
    this.sun.color.set(theme.sun.color);
    this.sun.intensity = theme.sun.intensity * (opts.sunScale || 1);
    this.sunGlow.material.color.set(theme.sun.glow);
    this.sunGlow.material.opacity = (theme.nightSky ? 0.35 : 0.8) * (opts.sunScale || 1);

    const center = track.bbox.getCenter(new V3());
    const size = track.bbox.getSize(new V3());
    const ctx = { g, theme, track, rng, center, spread: Math.max(size.x, size.z) / 2 + 700 };

    // Points sampled along the track so scenery keeps its distance from the road.
    const avoid = [];
    for (let i = 0; i < track.n; i += 12) avoid.push(track.P[i]);
    ctx.clearOf = (x, y, z, r) => {
      for (const p of avoid) {
        const dx = p.x - x, dy = p.y - y, dz = p.z - z;
        if (dx * dx + dy * dy * 0.5 + dz * dz < r * r) return false;
      }
      return true;
    };
    // Same, but ignoring height: for things that stand on the ground under the road.
    ctx.clearOfFlat = (x, z, r) => {
      for (const p of avoid) {
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz < r * r) return false;
      }
      return true;
    };

    const env = theme.env || 'sky';
    if (env === 'desert') this.buildDesert(ctx);
    else if (env === 'arctic') this.buildArctic(ctx);
    else if (env === 'volcano') this.buildVolcano(ctx);
    else this.buildSky(ctx);

    if (theme.nightSky) this.buildStars(ctx);
    this.updateEnvMap(theme);
    // Image-based light from the sky now does part of the hemisphere light's job.
    this.baseHemi = theme.hemi.intensity * (this.envRT ? 0.7 : 1) * (opts.lightScale || 1);
    this.hemi.intensity = this.baseHemi;
  }

  // Reflections: bake the sky into an environment map, so paint, coins and wet roads mirror it.
  updateEnvMap(theme) {
    if (!this.pmrem) return;
    const envScene = new THREE.Scene();
    const skyMat = this.skyMat.clone();
    skyMat.uniforms.flash.value = 0;
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: theme.ground || theme.cloud || theme.sky.bottom }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -12;
    envScene.add(floor);
    const rt = this.pmrem.fromScene(envScene, 0.02, 0.1, 100);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = theme.envIntensity ?? 0.75;
    skyMat.dispose();
    floor.geometry.dispose();
    floor.material.dispose();
  }

  /* ------------------------------------------------------------------ environments */
  buildSky({ g, theme, track, rng, center, spread, clearOf }) {
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
    this.animated.push((dt) => { this.cloudTex.offset.x += dt * 0.002; });

    this.buildPuffs({ g, theme, track, rng, center, spread, clearOf }, theme.cloud, theme.cloudY);
    this.buildIslands({ g, theme, track, rng, center, spread, clearOf }, { rock: '#8a6a55', cap: theme.islands, tree: theme.nightSky ? '#2a6b6b' : '#2f8f4e' });

    // hot-air balloons
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
  }

  buildPuffs({ g, track, rng, center, spread, clearOf }, color, floorY, count = 90) {
    const puffs = [];
    for (let c = 0; c < count && puffs.length < 520; c++) {
      const high = c < 18;
      const x = center.x + (rng() * 2 - 1) * spread;
      const z = center.z + (rng() * 2 - 1) * spread;
      const y = high ? track.minY - 30 + rng() * (track.maxY - track.minY + 90) : floorY + rng() * 12;
      if (!clearOf(x, y, z, high ? 110 : 40)) continue;
      const k = 5 + Math.floor(rng() * 4);
      const base = (high ? 8 : 16) + rng() * 16;
      for (let i = 0; i < k; i++) {
        const s = base * (0.6 + rng() * 0.6);
        puffs.push([x + (rng() - 0.5) * base * 2.6, y + (rng() - 0.3) * base * 0.5, z + (rng() - 0.5) * base * 1.6, s]);
      }
    }
    if (!puffs.length) return;
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color, flatShading: true }), puffs.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new V3();
    const ps = new V3();
    puffs.forEach(([x, y, z, s], i) => {
      q.setFromAxisAngle(new V3(0, 1, 0), rng() * 6);
      mesh.setMatrixAt(i, m.compose(ps.set(x, y, z), q, sc.set(s, s * 0.7, s)));
    });
    g.add(mesh);
  }

  // Floating islands (rock underside, flat cap, a few trees). colors: { rock, cap, tree, glow? }
  buildIslands({ g, track, rng, center, spread, clearOf }, colors, max = 34) {
    const islands = [];
    for (let tries = 0; tries < 220 && islands.length < max; tries++) {
      const x = center.x + (rng() * 2 - 1) * (spread - 250);
      const z = center.z + (rng() * 2 - 1) * (spread - 250);
      const y = track.minY - 20 + rng() * (track.maxY - track.minY + 60);
      const s = 8 + rng() * 22;
      if (clearOf(x, y, z, 55 + s * 1.5)) islands.push([x, y, z, s]);
    }
    if (!islands.length) return;
    const rockGeo = new THREE.ConeGeometry(1, 1.9, 7);
    rockGeo.rotateX(Math.PI);
    rockGeo.translate(0, -0.95, 0);
    const capGeo = new THREE.CylinderGeometry(1.06, 0.98, 0.3, 7);
    capGeo.translate(0, 0.15, 0);
    const treeGeo = new THREE.ConeGeometry(0.16, 0.55, 6);
    treeGeo.translate(0, 0.55, 0);
    const capMat = colors.glow
      ? new THREE.MeshStandardMaterial({ color: colors.cap, emissive: colors.glow, emissiveIntensity: 0.9, flatShading: true, roughness: 0.8 })
      : new THREE.MeshLambertMaterial({ color: colors.cap, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: colors.rock, flatShading: true }), islands.length);
    const caps = new THREE.InstancedMesh(capGeo, capMat, islands.length);
    const trees = colors.tree ? new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ color: colors.tree, flatShading: true }), islands.length * 4) : null;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new V3();
    const ps = new V3();
    let t = 0;
    islands.forEach(([x, y, z, s], i) => {
      q.setFromAxisAngle(new V3(0, 1, 0), rng() * 6);
      rocks.setMatrixAt(i, m.compose(ps.set(x, y, z), q, sc.set(s, s * (0.8 + rng() * 0.6), s)));
      caps.setMatrixAt(i, m.compose(ps.set(x, y, z), q, sc.set(s, s, s)));
      if (trees) {
        for (let k = 0; k < 4; k++) {
          const a = rng() * 6.28;
          const r = rng() * 0.7 * s;
          const ts = s * (0.9 + rng() * 0.8);
          trees.setMatrixAt(t++, m.compose(ps.set(x + Math.cos(a) * r, y + 0.3 * s, z + Math.sin(a) * r), q, sc.set(ts, ts, ts)));
        }
      }
    });
    g.add(rocks, caps);
    if (trees) {
      trees.count = t;
      g.add(trees);
    }
  }

  groundPlane(g, center, y, kind, color, repeat) {
    const tex = groundTexture(kind, color);
    tex.repeat.set(repeat, repeat);
    const mat = kind === 'lava' ? new THREE.MeshBasicMaterial({ map: tex, color: '#ffffff', toneMapped: false }) : new THREE.MeshLambertMaterial({ map: tex });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(center.x, y, center.z);
    g.add(floor);
    return { floor, tex };
  }

  // Instanced tapered columns (mesas, spires, basalt, ice) with a texture wrapped round them.
  columns(g, list, geo, mat) {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new V3();
    const ps = new V3();
    list.forEach(([x, y, z, r, h, rot], i) => {
      q.setFromAxisAngle(new V3(0, 1, 0), rot || 0);
      mesh.setMatrixAt(i, m.compose(ps.set(x, y, z), q, sc.set(r, h, r)));
    });
    g.add(mesh);
    return mesh;
  }

  buildDesert(ctx) {
    const { g, theme, track, rng, center, spread, clearOf, clearOfFlat } = ctx;
    const floorY = theme.floorY;
    this.groundPlane(g, center, floorY, 'sand', theme.ground, 60);

    // Mesas: flat-topped towers of layered rock, some rising past the road.
    const mesas = [];
    for (let tries = 0; tries < 400 && mesas.length < 46; tries++) {
      const x = center.x + (rng() * 2 - 1) * spread;
      const z = center.z + (rng() * 2 - 1) * spread;
      const r = 25 + rng() * 60;
      const top = track.minY - 40 + rng() * (track.maxY - track.minY + 90);
      if (!clearOfFlat(x, z, r + 45)) continue;
      mesas.push([x, floorY, z, r, top - floorY, rng() * 6]);
    }
    const mesaGeo = new THREE.CylinderGeometry(0.86, 1, 1, 9, 1);
    mesaGeo.translate(0, 0.5, 0);
    const strata = strataTexture(['#c8733a', '#b35f2e', '#d9955a', '#a8522a', '#e0a870', '#9c4a26']);
    strata.repeat.set(3, 1);
    this.columns(g, mesas, mesaGeo, new THREE.MeshLambertMaterial({ map: strata, flatShading: true }));
    // sandy caps on top of the mesas
    const capGeo = new THREE.CylinderGeometry(0.86, 0.86, 0.02, 9);
    capGeo.translate(0, 1, 0);
    this.columns(g, mesas, capGeo, new THREE.MeshLambertMaterial({ color: '#e7b77c', flatShading: true }));

    // Rock spires and small buttes.
    const spires = [];
    for (let tries = 0; tries < 300 && spires.length < 60; tries++) {
      const x = center.x + (rng() * 2 - 1) * spread;
      const z = center.z + (rng() * 2 - 1) * spread;
      const r = 5 + rng() * 10;
      const h = 30 + rng() * 90;
      if (!clearOfFlat(x, z, r + 20) && floorY + h > track.minY - 12) continue;
      spires.push([x, floorY, z, r, h, rng() * 6]);
    }
    const spireGeo = new THREE.CylinderGeometry(0.35, 1, 1, 6, 1);
    spireGeo.translate(0, 0.5, 0);
    const strata2 = strataTexture(['#b8602c', '#cf8248', '#9e4c24', '#dba06a']);
    this.columns(g, spires, spireGeo, new THREE.MeshLambertMaterial({ map: strata2, flatShading: true }));

    // Saguaro cacti on the desert floor (trunk + two arms), and boulders.
    const cacti = [];
    for (let tries = 0; tries < 900 && cacti.length < 180; tries++) {
      const x = center.x + (rng() * 2 - 1) * spread * 0.8;
      const z = center.z + (rng() * 2 - 1) * spread * 0.8;
      cacti.push([x, floorY, z, 1, 6 + rng() * 8, rng() * 6]);
    }
    const cactusGeo = new THREE.CylinderGeometry(0.55, 0.65, 1, 7);
    cactusGeo.translate(0, 0.5, 0);
    const cactusMat = new THREE.MeshLambertMaterial({ color: '#4f8a3c', flatShading: true });
    this.columns(g, cacti, cactusGeo, cactusMat);
    const armGeo = new THREE.CylinderGeometry(0.4, 0.45, 1, 6);
    armGeo.translate(0, 0.5, 0);
    const arms = [];
    for (const [x, y, z, , h, rot] of cacti) {
      arms.push([x + Math.cos(rot) * 1.3, y + h * 0.45, z + Math.sin(rot) * 1.3, 1, h * 0.4, rot]);
      if (rng() < 0.6) arms.push([x - Math.cos(rot) * 1.3, y + h * 0.35, z - Math.sin(rot) * 1.3, 1, h * 0.35, rot]);
    }
    this.columns(g, arms, armGeo, cactusMat);
    const boulders = [];
    for (let i = 0; i < 140; i++) {
      const x = center.x + (rng() * 2 - 1) * spread * 0.9;
      const z = center.z + (rng() * 2 - 1) * spread * 0.9;
      const s = 2 + rng() * 7;
      boulders.push([x, floorY + s * 0.3, z, s, s * 0.7, rng() * 6]);
    }
    this.columns(g, boulders, new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#b56d3e', flatShading: true }));
    // dust haze low over the sand
    this.buildPuffs(ctx, '#f2cf9e', floorY + 4, 40);
  }

  buildArctic(ctx) {
    const { g, theme, track, rng, center, spread, clearOf, clearOfFlat } = ctx;
    const floorY = theme.floorY;
    this.groundPlane(g, center, floorY, 'snow', theme.ground, 50);

    // Snow-capped mountains ringing the course.
    const peaks = [];
    for (let tries = 0; tries < 400 && peaks.length < 40; tries++) {
      const x = center.x + (rng() * 2 - 1) * (spread + 300);
      const z = center.z + (rng() * 2 - 1) * (spread + 300);
      const r = 90 + rng() * 170;
      const h = track.maxY - floorY + 40 + rng() * 260;
      if (!clearOfFlat(x, z, r + 60)) continue;
      peaks.push([x, floorY, z, r, h, rng() * 6]);
    }
    const peakGeo = new THREE.ConeGeometry(1, 1, 8, 1);
    peakGeo.translate(0, 0.5, 0);
    this.columns(g, peaks, peakGeo, new THREE.MeshLambertMaterial({ color: '#5f7188', flatShading: true }));
    const caps = peaks.map(([x, y, z, r, h, rot]) => [x, y + h * 0.56, z, r * 0.455, h * 0.455, rot]);
    this.columns(g, caps, peakGeo, new THREE.MeshLambertMaterial({ color: '#f7fbff', flatShading: true }));

    // Frosted pines: two stacked cones, dark green with white tips.
    const pines = [];
    for (let i = 0; i < 420; i++) {
      const x = center.x + (rng() * 2 - 1) * spread * 0.85;
      const z = center.z + (rng() * 2 - 1) * spread * 0.85;
      const s = 3 + rng() * 5;
      pines.push([x, floorY, z, s, s * 3.2, rng() * 6]);
    }
    const pineGeo = new THREE.ConeGeometry(1, 1, 7);
    pineGeo.translate(0, 0.5, 0);
    this.columns(g, pines, pineGeo, new THREE.MeshLambertMaterial({ color: '#2d5a45', flatShading: true }));
    const pineTips = pines.map(([x, y, z, s, h, rot]) => [x, y + h * 0.55, z, s * 0.46, h * 0.45, rot]);
    this.columns(g, pineTips, pineGeo, new THREE.MeshLambertMaterial({ color: '#eef6ff', flatShading: true }));

    // Ice crystal spikes near the ground, and floating icebergs up at road height.
    const ice = [];
    for (let tries = 0; tries < 300 && ice.length < 70; tries++) {
      const x = center.x + (rng() * 2 - 1) * spread;
      const z = center.z + (rng() * 2 - 1) * spread;
      const r = 3 + rng() * 6;
      const h = 20 + rng() * 50;
      if (!clearOfFlat(x, z, r + 15) && floorY + h > track.minY - 12) continue;
      ice.push([x, floorY, z, r, h, rng() * 6]);
    }
    const iceGeo = new THREE.CylinderGeometry(0.05, 1, 1, 6);
    iceGeo.translate(0, 0.5, 0);
    this.columns(g, ice, iceGeo, new THREE.MeshStandardMaterial({ color: '#9fdcff', emissive: '#3aa8ff', emissiveIntensity: 0.25, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, flatShading: true }));
    this.buildIslands(ctx, { rock: '#cfe4f5', cap: '#ffffff', tree: '#2d5a45' }, 26);
    this.buildPuffs(ctx, '#ffffff', floorY + 6, 50);
  }

  buildVolcano(ctx) {
    const { g, theme, track, rng, center, spread, clearOf, clearOfFlat } = ctx;
    const floorY = theme.floorY;
    const { tex } = this.groundPlane(g, center, floorY, 'lava', '#ff6a1a', 70);
    this.animated.push((dt) => { tex.offset.x += dt * 0.004; tex.offset.y += dt * 0.0025; });

    // Volcanoes with glowing craters and a column of smoke.
    const cones = [];
    for (let tries = 0; tries < 300 && cones.length < 16; tries++) {
      const x = center.x + (rng() * 2 - 1) * (spread + 200);
      const z = center.z + (rng() * 2 - 1) * (spread + 200);
      const r = 110 + rng() * 150;
      const h = track.maxY - floorY + 20 + rng() * 180;
      if (!clearOfFlat(x, z, r + 70)) continue;
      cones.push([x, floorY, z, r, h, rng() * 6]);
    }
    const coneGeo = new THREE.CylinderGeometry(0.16, 1, 1, 9, 1, true);
    coneGeo.translate(0, 0.5, 0);
    this.columns(g, cones, coneGeo, new THREE.MeshLambertMaterial({ color: '#2a1e1e', flatShading: true }));
    const craterGeo = new THREE.CircleGeometry(1, 9);
    craterGeo.rotateX(-Math.PI / 2);
    this.columns(g, cones.map(([x, y, z, r, h]) => [x, y + h - 0.5, z, r * 0.16, 1, 0]), craterGeo, new THREE.MeshBasicMaterial({ color: '#ff7a1a' }));
    for (const [x, y, z, r, h] of cones) {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff5a1a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      glow.position.set(x, y + h + r * 0.1, z);
      glow.scale.setScalar(r * 0.9);
      g.add(glow);
    }
    const smoke = [];
    for (const [x, y, z, r, h] of cones) {
      for (let k = 0; k < 8; k++) smoke.push([x + (rng() - 0.5) * r * 0.25, y + h + 20 + k * 22, z + (rng() - 0.5) * r * 0.25, r * (0.12 + k * 0.03)]);
    }
    if (smoke.length) {
      const sm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#3a2c2c', flatShading: true, transparent: true, opacity: 0.85 }), smoke.length);
      const m = new THREE.Matrix4();
      smoke.forEach(([x, y, z, s], i) => sm.setMatrixAt(i, m.compose(new V3(x, y, z), new THREE.Quaternion(), new V3(s, s * 0.8, s))));
      g.add(sm);
    }

    // Basalt columns: clusters of dark hexagonal pillars rising out of the lava.
    const basalt = [];
    for (let c = 0; c < 70; c++) {
      const cx = center.x + (rng() * 2 - 1) * spread;
      const cz = center.z + (rng() * 2 - 1) * spread;
      const hBase = 15 + rng() * 70;
      if (!clearOfFlat(cx, cz, 40) && floorY + hBase > track.minY - 15) continue;
      for (let k = 0; k < 7; k++) basalt.push([cx + (rng() - 0.5) * 16, floorY, cz + (rng() - 0.5) * 16, 2.2 + rng() * 1.5, hBase * (0.6 + rng() * 0.5), rng()]);
    }
    const hexGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    hexGeo.translate(0, 0.5, 0);
    this.columns(g, basalt, hexGeo, new THREE.MeshLambertMaterial({ color: '#312a2e', flatShading: true }));
    this.buildIslands(ctx, { rock: '#2c2224', cap: '#3a2020', glow: '#ff4a10', tree: null }, 28);
  }

  buildStars({ g, rng }) {
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

  // Lightning: brighten the sky and light for a moment (weather.js triggers it).
  lightning(strength = 1) {
    this.flash = Math.max(this.flash, strength);
  }

  update(dt, time, camera, focus) {
    this.sky.position.copy(camera.position);
    if (this.starfield) this.starfield.position.copy(camera.position);
    this.sunGlow.position.copy(camera.position).addScaledVector(this.sunDir, 1200);
    this.sunGlow.scale.setScalar(this.theme && this.theme.nightSky ? 180 : 380);
    this.sunGlow.visible = this.sunDir.y > -0.05;
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 150);
    this.sun.target.position.copy(focus);
    for (const fn of this.animated) fn(dt, time);
    for (const b of this.balloons) b.obj.position.y = b.y + Math.sin(time * 0.4 + b.phase) * 3;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.5);
    this.skyMat.uniforms.flash.value = this.flash * 0.6;
    this.hemi.intensity = this.baseHemi * (1 + this.flash * 1.8);
  }
}

SD.world = { World };
})();
