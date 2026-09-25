/* Visual themes and the four track layouts. */
(() => {
'use strict';
const SD = (window.SD ||= {});
const { TrackBuilder } = SD.track;

const THEMES = {
  day: {
    sky: { top: '#2a6fdb', mid: '#8ec9ff', bottom: '#e4f3ff' },
    fog: '#cde6ff', fogNear: 260, fogFar: 1500,
    sun: { dir: [0.45, 0.75, -0.3], color: '#fff3d6', intensity: 2.6, glow: '#fff4c2' },
    hemi: { sky: '#e2f1ff', ground: '#6d7f99', intensity: 1.15 },
    road: { asphalt: '#454b5e', edgeA: '#ff4757', edgeB: '#ffffff', line: '#ffffff' },
    slab: '#6878a0', pillar: '#8a98b8', wall: '#7fdcff', accent: '#ff7a18', checkpoint: '#20c997',
    cloud: '#ffffff', cloudY: 0, floorY: -25, islands: '#6cc551', balloons: true, nightSky: false, neon: false,
    thumb: 'linear-gradient(180deg,#2a6fdb,#8ec9ff 60%,#ffffff 61%,#e4f3ff)',
  },
  sunset: {
    sky: { top: '#3b1e6d', mid: '#ff8a5c', bottom: '#ffd3a1' },
    fog: '#ffb48a', fogNear: 240, fogFar: 1400,
    sun: { dir: [-0.6, 0.18, -0.75], color: '#ffc38a', intensity: 2.3, glow: '#ffd08a' },
    hemi: { sky: '#ffd0b0', ground: '#6a4a7a', intensity: 1.0 },
    road: { asphalt: '#4a4458', edgeA: '#ff3d7f', edgeB: '#ffe066', line: '#fff3d6' },
    slab: '#7a5a8c', pillar: '#9a7aa8', wall: '#ffb3d9', accent: '#ff3d7f', checkpoint: '#ffb703',
    cloud: '#ffe2d0', cloudY: 0, floorY: -25, islands: '#e6a15a', balloons: true, nightSky: false, neon: false,
    thumb: 'linear-gradient(180deg,#3b1e6d,#ff8a5c 55%,#ffe2d0 56%,#ffd3a1)',
  },
  candy: {
    sky: { top: '#5b2a9c', mid: '#e58bd6', bottom: '#ffe0f4' },
    fog: '#f3b6e6', fogNear: 240, fogFar: 1400,
    sun: { dir: [0.3, 0.55, 0.75], color: '#ffe3f7', intensity: 2.2, glow: '#ffffff' },
    hemi: { sky: '#ffe0f7', ground: '#7a5aa0', intensity: 1.15 },
    road: { asphalt: '#4d3f63', edgeA: '#35e0ff', edgeB: '#ffffff', line: '#ffe6fa' },
    slab: '#9b6fc4', pillar: '#c69be0', wall: '#ff9be8', accent: '#35e0ff', checkpoint: '#ff5dc8',
    cloud: '#fff0fb', cloudY: 0, floorY: -25, islands: '#ff9fd0', balloons: true, nightSky: false, neon: false,
    thumb: 'linear-gradient(180deg,#5b2a9c,#e58bd6 55%,#fff0fb 56%,#ffe0f4)',
  },
  night: {
    sky: { top: '#02030c', mid: '#141a45', bottom: '#2c2a66' },
    fog: '#1c1d4a', fogNear: 200, fogFar: 1100,
    sun: { dir: [0.35, 0.7, 0.4], color: '#9fb4ff', intensity: 1.1, glow: '#dfe6ff' },
    hemi: { sky: '#5a64b8', ground: '#1a1030', intensity: 0.8 },
    road: { asphalt: '#1c1c2a', edgeA: '#ff2bd6', edgeB: '#2bf0ff', line: '#b9f6ff' },
    slab: '#262a4d', pillar: '#343a66', wall: '#2bf0ff', accent: '#ff2bd6', checkpoint: '#2bf0ff',
    cloud: '#4a4f8c', cloudY: 0, floorY: -25, islands: '#3d5a8a', balloons: false, nightSky: true, neon: true,
    thumb: 'linear-gradient(180deg,#02030c,#141a45 55%,#4a4f8c 56%,#2c2a66)',
  },
};

const TRACKS = [
  {
    id: 'rookie',
    name: 'Sky Rookie',
    theme: 'day',
    desc: 'Rolling hills and your first big jumps.',
    target: 3000,
    build(b) {
      b.straight(110);
      b.stars(6, 8, 'line', 0);
      b.slope(90, 8);
      b.turn(35, 150);
      b.straight(40).checkpoint();
      b.pad(0).straight(45);
      b.ramp(18, 4).jump({ gap: 22, land: 85 });
      b.straight(30).stars(7, 7, 'weave');
      b.turn(-60, 120);
      b.slope(110, 12);
      b.straight(30).checkpoint();
      b.turn(40, 130);
      b.stars(6, 8, 'line', -2.5);
      b.slope(80, -8);
      b.pad(0).straight(45);
      b.ramp(20, 4.5).jump({ gap: 26, land: 95 });
      b.straight(40).checkpoint();
      b.turn(-45, 140);
      b.slope(70, 8).slope(70, -8);
      b.stars(8, 8, 'weave');
      b.turn(50, 110, 16);
      b.straight(30).pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(60).finish().straight(170);
    },
  },
  {
    id: 'loops',
    name: 'Sunset Loops',
    theme: 'sunset',
    desc: 'Loop-the-loops and a walled S-bend.',
    target: 2800,
    build(b) {
      b.straight(110);
      b.slope(80, -6);
      b.turn(-40, 130);
      b.straight(20).checkpoint();
      b.pad(0).straight(55);
      b.loop(15, 13);
      b.straight(40).stars(6, 8, 'line', 0);
      b.turn(50, 120);
      b.pad(0).straight(40);
      b.ramp(20, 4.5).jump({ gap: 26, land: 95 });
      b.straight(25).checkpoint();
      b.walls(true).width(5).turn(-70, 70, 18).turn(65, 70, 18).width(6).walls(false);
      b.straight(30).slope(110, 16);
      b.straight(20).checkpoint();
      b.pad(0).straight(55);
      b.loop(16, -14);
      b.straight(40).turn(-40, 130);
      b.stars(8, 8, 'weave');
      b.slope(70, -8);
      b.pad(0).straight(40);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(30).checkpoint();
      b.turn(45, 140);
      b.slope(60, 9).slope(60, -9);
      b.pad(0).straight(50);
      b.loop(14, 12);
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'candy',
    name: 'Candy Corkscrew',
    theme: 'candy',
    desc: 'Barrel-roll corkscrews and huge air.',
    target: 3800,
    build(b) {
      b.straight(110);
      b.turn(30, 150);
      b.straight(20).checkpoint();
      b.pad(0).straight(40);
      b.corkscrew(80, 1);
      b.straight(30).stars(6, 8);
      b.slope(90, 14);
      b.turn(-55, 110);
      b.pad(0).straight(40);
      b.ramp(22, 5).jump({ gap: 32, land: 110 });
      b.straight(20).checkpoint();
      b.turn(60, 90, 20);
      b.pad(0).straight(50);
      b.loop(16, 14);
      b.straight(30);
      b.corkscrew(80, -1);
      b.straight(20).checkpoint();
      b.slope(100, 18);
      b.turn(-50, 120);
      b.stars(8, 8, 'weave');
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(30).checkpoint();
      b.walls(true).width(5).turn(-60, 80, 20).turn(60, 80, 20).width(6).walls(false);
      b.slope(60, 8).slope(60, -8);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'neon',
    name: 'Neon Nights',
    theme: 'night',
    desc: 'Everything at once, under the stars.',
    target: 4600,
    build(b) {
      b.straight(110);
      b.slope(80, 10);
      b.turn(-40, 120);
      b.straight(20).checkpoint();
      b.pad(0).straight(50);
      b.loop(15, 13);
      b.straight(20).corkscrew(70, 1);
      b.straight(30).stars(6, 8);
      b.pad(0).straight(40);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(20).checkpoint();
      b.walls(true).width(4.6).turn(70, 70, 20).turn(-70, 70, 20).turn(50, 80, 18).width(6).walls(false);
      b.slope(110, 20);
      b.straight(20).checkpoint();
      b.pad(0).straight(50);
      b.loop(17, -15);
      b.straight(30);
      b.pad(0).straight(40);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(20).checkpoint();
      b.turn(-45, 120);
      b.stars(8, 8, 'weave');
      b.corkscrew(80, -1);
      b.straight(30).slope(70, 10).slope(70, -10);
      b.pad(0).straight(50);
      b.loop(15, 13);
      b.straight(30).pad(0).straight(40);
      b.ramp(22, 5).jump({ gap: 32, land: 110 });
      b.straight(70).finish().straight(170);
    },
  },
];

const cache = new Map();
function buildTrack(def) {
  if (!cache.has(def.id)) {
    const b = new TrackBuilder({ height: 120, width: 6, startS: 50 });
    def.build(b);
    cache.set(def.id, b.build());
  }
  return cache.get(def.id);
}

SD.tracks = { THEMES, TRACKS, buildTrack };
})();
