/* Visual themes, worlds and the track layouts. */
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
    lamps: true, lampColor: '#b9f6ff', signBg: '#ff2bd6', signFg: '#0b0b1a',
    thumb: 'linear-gradient(180deg,#02030c,#141a45 55%,#4a4f8c 56%,#2c2a66)',
  },
  desert: {
    env: 'desert',
    sky: { top: '#3d7fd6', mid: '#f5d3a0', bottom: '#e8a35f' },
    fog: '#f0c895', fogNear: 280, fogFar: 1600,
    sun: { dir: [0.5, 0.62, -0.35], color: '#fff0d0', intensity: 2.9, glow: '#fff1c4' },
    hemi: { sky: '#ffe8c8', ground: '#b07a48', intensity: 1.1 },
    road: { asphalt: '#4d4642', edgeA: '#ff7a18', edgeB: '#ffffff', line: '#fff6e0' },
    slab: '#a0714a', pillar: '#c09062', wall: '#ffcf8a', accent: '#ff7a18', checkpoint: '#ffb703',
    ground: '#e3b47c', floorY: -10, cloud: '#f5dcb8', islands: '#d9a066', balloons: false, nightSky: false, neon: false,
    thumb: 'linear-gradient(180deg,#3d7fd6,#f5d3a0 55%,#e3b47c 56%,#c98d52)',
  },
  arctic: {
    env: 'arctic',
    sky: { top: '#5d97d0', mid: '#d8e9f6', bottom: '#f2f8fd' },
    fog: '#e2eef7', fogNear: 230, fogFar: 1350,
    sun: { dir: [-0.35, 0.42, -0.6], color: '#ffffff', intensity: 2.5, glow: '#ffffff' },
    hemi: { sky: '#eaf6ff', ground: '#9ab4cc', intensity: 1.15 },
    road: { asphalt: '#3f4656', edgeA: '#2bb3ff', edgeB: '#ffffff', line: '#e8f6ff' },
    slab: '#8fa9c4', pillar: '#b4c8dc', wall: '#bfe9ff', accent: '#2bb3ff', checkpoint: '#20c997',
    ground: '#f2f7fc', floorY: -10, cloud: '#ffffff', islands: '#ffffff', balloons: false, nightSky: false, neon: false,
    signBg: '#2bb3ff', signFg: '#ffffff',
    thumb: 'linear-gradient(180deg,#5d97d0,#d8e9f6 55%,#ffffff 56%,#cfe0ee)',
  },
  volcano: {
    env: 'volcano',
    sky: { top: '#12060c', mid: '#5a1a14', bottom: '#c2461c' },
    fog: '#4a1c12', fogNear: 200, fogFar: 1150,
    sun: { dir: [0.25, 0.3, 0.8], color: '#ffb080', intensity: 1.5, glow: '#ff7a3a' },
    hemi: { sky: '#8a4a4a', ground: '#ff5a1a', intensity: 1.0 },
    road: { asphalt: '#221d1f', edgeA: '#ff5a1a', edgeB: '#ffd23f', line: '#ffb070' },
    slab: '#2e2426', pillar: '#3a2e30', wall: '#ff7a3a', accent: '#ff5a1a', checkpoint: '#ffd23f',
    ground: '#ff6a1a', floorY: -10, cloud: '#3a2c2c', islands: '#3a2020', balloons: false, nightSky: false, neon: true,
    lamps: true, lampColor: '#ffb070', signBg: '#ff5a1a', signFg: '#1a0a06', exposure: 1.15, envIntensity: 0.6,
    thumb: 'linear-gradient(180deg,#12060c,#5a1a14 55%,#ff6a1a 56%,#c2461c)',
  },
};

// Worlds group the tracks in the menu, in unlock order.
const WORLDS = [
  { theme: 'day', name: 'Sky Islands' },
  { theme: 'sunset', name: 'Sunset Coast' },
  { theme: 'candy', name: 'Candy Clouds' },
  { theme: 'night', name: 'Neon Nights' },
  { theme: 'desert', name: 'Desert Canyon' },
  { theme: 'arctic', name: 'Frozen Peaks' },
  { theme: 'volcano', name: 'Volcano Core' },
];

// ai: rival pace (fraction of 52 m/s). target: stunt score needed for the third star.
// weather: clear | mist | rain | storm | snow | sugar | sand | embers | ash (see weather.js)
const TRACKS = [
  {
    id: 'rookie',
    name: 'Sky Rookie',
    theme: 'day',
    desc: 'Rolling hills and your first big jumps.',
    ai: 0.84,
    target: 3000,
    build(b) {
      b.straight(110);
      b.coins(6, 8, 'line', 0);
      b.slope(90, 8);
      b.turn(35, 150);
      b.straight(40).checkpoint();
      b.pad(0).straight(45);
      b.ramp(18, 4).jump({ gap: 22, land: 85 });
      b.straight(30).coins(7, 7, 'weave');
      b.turn(-60, 120);
      b.slope(110, 12);
      b.straight(30).checkpoint();
      b.turn(40, 130);
      b.coins(6, 8, 'line', -2.5);
      b.slope(80, -8);
      b.pad(0).straight(45);
      b.ramp(20, 4.5).jump({ gap: 26, land: 95 });
      b.straight(40).checkpoint();
      b.turn(-45, 140);
      b.slope(70, 8).slope(70, -8);
      b.coins(8, 8, 'weave');
      b.turn(50, 110, 16);
      b.straight(30).pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(60).finish().straight(170);
    },
  },
  {
    id: 'hopper',
    name: 'Cloud Hopper',
    theme: 'day',
    desc: 'Back-to-back jumps and your first loop.',
    ai: 0.87,
    target: 3400,
    build(b) {
      b.straight(110);
      b.coins(8, 8, 'line', 0);
      b.slope(80, 6);
      b.turn(-30, 160);
      b.straight(20).checkpoint();
      b.pad(0).straight(45);
      b.ramp(18, 4).jump({ gap: 22, land: 85 });
      b.straight(25).coins(6, 8, 'weave');
      b.pad(0).straight(40);
      b.ramp(20, 4.5).jump({ gap: 26, land: 95 });
      b.straight(30).checkpoint();
      b.turn(55, 120);
      b.coins(7, 8, 'line', 2.5);
      b.slope(90, -10);
      b.turn(-40, 140);
      b.straight(20).checkpoint();
      b.pad(0).straight(50);
      b.loop(14, 12);
      b.straight(40).coins(8, 8, 'weave');
      b.slope(60, 8).slope(60, -8);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(60).finish().straight(170);
    },
  },
  {
    id: 'island',
    name: 'Island Dash',
    theme: 'day',
    desc: 'Walled S-bends between the islands.',
    weather: 'mist',
    ai: 0.89,
    target: 3800,
    build(b) {
      b.straight(110);
      b.turn(40, 130);
      b.coins(6, 8, 'line', -2.5);
      b.straight(20).checkpoint();
      b.walls(true).width(5).turn(-60, 80, 18).turn(60, 80, 18).width(6).walls(false);
      b.straight(30).coins(6, 8, 'weave');
      b.pad(0).straight(45);
      b.ramp(20, 4.5).jump({ gap: 26, land: 95 });
      b.straight(20).checkpoint();
      b.slope(100, 14);
      b.turn(-45, 120);
      b.pad(0).straight(50);
      b.loop(15, -13);
      b.straight(40).checkpoint();
      b.coins(8, 8, 'diag', 1);
      b.turn(35, 150);
      b.slope(80, -10);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(20).checkpoint();
      b.walls(true).width(5).turn(55, 75, 18).turn(-55, 75, 18).width(6).walls(false);
      b.pad(0).straight(45);
      b.ramp(20, 4.5).jump({ gap: 26, land: 95 });
      b.straight(60).finish().straight(170);
    },
  },
  {
    id: 'loops',
    name: 'Sunset Loops',
    theme: 'sunset',
    desc: 'Loop-the-loops and a walled S-bend.',
    ai: 0.9,
    target: 2800,
    build(b) {
      b.straight(110);
      b.slope(80, -6);
      b.turn(-40, 130);
      b.straight(20).checkpoint();
      b.pad(0).straight(55);
      b.loop(15, 13);
      b.straight(40).coins(6, 8, 'line', 0);
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
      b.coins(8, 8, 'weave');
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
    id: 'twilight',
    name: 'Twilight Twister',
    theme: 'sunset',
    desc: 'A double loop, then a big leap.',
    weather: 'rain',
    ai: 0.92,
    target: 3400,
    build(b) {
      b.straight(110);
      b.slope(70, 8);
      b.turn(45, 120);
      b.straight(20).checkpoint();
      b.cones(5, 'slalom', 0, 8, 9);
      b.straight(55);
      b.pad(0).straight(55);
      b.loop(15, 13);
      b.straight(20).pad(0).straight(50);
      b.loop(15, -13);
      b.straight(40).coins(8, 8, 'weave');
      b.turn(-50, 110);
      b.straight(20).checkpoint();
      b.pad(0).straight(40);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(30).coins(6, 8, 'line', 2.5);
      b.walls(true).width(5).turn(70, 70, 18).turn(-70, 70, 18).width(6).walls(false);
      b.straight(20).checkpoint();
      b.slope(100, -14);
      b.turn(40, 140);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 34, land: 115 });
      b.straight(30).checkpoint();
      b.coins(8, 8, 'weave');
      b.slope(60, 9).slope(60, -9);
      b.pad(0).straight(50);
      b.loop(16, 14);
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'gauntlet',
    name: 'Golden Gauntlet',
    theme: 'sunset',
    desc: 'Four jumps and a tight walled chicane.',
    ai: 0.94,
    target: 4600,
    build(b) {
      b.straight(110);
      b.turn(-35, 150);
      b.coins(8, 8, 'line', 0);
      b.straight(20).checkpoint();
      b.bouncer(0, 10);
      b.straight(100);
      b.pad(0).straight(45);
      b.ramp(20, 4.5).jump({ gap: 26, land: 95 });
      b.straight(20);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(20).checkpoint();
      b.walls(true).width(4.8).turn(-65, 70, 20).turn(65, 70, 20).turn(-40, 90, 16).width(6).walls(false);
      b.slope(110, 16);
      b.straight(20).checkpoint();
      b.pad(0).straight(55);
      b.loop(16, -14);
      b.straight(40).coins(8, 8, 'weave');
      b.turn(50, 120);
      b.slope(80, -12);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(30).checkpoint();
      b.turn(-40, 140);
      b.coins(6, 8, 'diag', -1);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 32, land: 110 });
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'candy',
    name: 'Candy Corkscrew',
    theme: 'candy',
    desc: 'Barrel-roll corkscrews and huge air.',
    ai: 0.95,
    target: 3800,
    build(b) {
      b.straight(110);
      b.turn(30, 150);
      b.straight(20).checkpoint();
      b.slick(-2, 16, 2.4, 'oil', 8);
      b.straight(40);
      b.pad(0).straight(40);
      b.corkscrew(80, 1);
      b.straight(30).coins(6, 8);
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
      b.coins(8, 8, 'weave');
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
    id: 'sugar',
    name: 'Sugar Rush',
    theme: 'candy',
    desc: 'Corkscrew, loop, corkscrew. Hold on!',
    weather: 'sugar',
    ai: 0.97,
    target: 3800,
    build(b) {
      b.straight(110);
      b.coins(8, 8, 'weave');
      b.turn(-35, 140);
      b.straight(20).checkpoint();
      b.pad(0).straight(40);
      b.corkscrew(80, -1);
      b.straight(30).coins(6, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(20).checkpoint();
      b.slope(90, 12);
      b.turn(55, 110);
      b.pad(0).straight(50);
      b.loop(15, 13);
      b.straight(20).corkscrew(70, 1);
      b.straight(20).checkpoint();
      b.walls(true).width(5).turn(-65, 75, 20).turn(65, 75, 20).width(6).walls(false);
      b.coins(8, 8, 'weave');
      b.slope(80, -12);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'lollipop',
    name: 'Lollipop Leap',
    theme: 'candy',
    desc: 'Five big jumps. Flip on every one.',
    ai: 0.98,
    target: 6000,
    build(b) {
      b.straight(110);
      b.turn(30, 150);
      b.straight(20).checkpoint();
      b.spinner(18, 3.4);
      b.straight(45);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(20).coins(6, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 34, land: 115 });
      b.straight(20).checkpoint();
      b.turn(-50, 120);
      b.pad(0).straight(40);
      b.corkscrew(80, 1);
      b.straight(30).coins(8, 8, 'weave');
      b.slope(100, 16);
      b.straight(20).checkpoint();
      b.pad(0).straight(50);
      b.loop(16, -14);
      b.straight(30);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(30).checkpoint();
      b.walls(true).width(5).turn(60, 80, 20).turn(-60, 80, 20).width(6).walls(false);
      b.slope(70, -10);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 32, land: 110 });
      b.straight(20);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'neon',
    name: 'Neon Nights',
    theme: 'night',
    desc: 'Everything at once, under the stars.',
    ai: 1.0,
    target: 4600,
    build(b) {
      b.straight(110);
      b.slope(80, 10);
      b.turn(-40, 120);
      b.straight(20).checkpoint();
      b.hammer(18, 2.6);
      b.straight(45);
      b.pad(0).straight(50);
      b.loop(15, 13);
      b.straight(20).corkscrew(70, 1);
      b.straight(30).coins(6, 8);
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
      b.coins(8, 8, 'weave');
      b.corkscrew(80, -1);
      b.straight(30).slope(70, 10).slope(70, -10);
      b.pad(0).straight(50);
      b.loop(15, 13);
      b.straight(30).pad(0).straight(40);
      b.ramp(22, 5).jump({ gap: 32, land: 110 });
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'laser',
    name: 'Laser Loop',
    theme: 'night',
    desc: 'Loops, corkscrews and a narrow neon chicane.',
    weather: 'rain',
    ai: 1.02,
    target: 4200,
    build(b) {
      b.straight(110);
      b.slope(80, -8);
      b.turn(45, 120);
      b.straight(20).checkpoint();
      b.slider(18, 2.6);
      b.straight(45);
      b.pad(0).straight(50);
      b.loop(15, 13);
      b.straight(20).pad(0).straight(50);
      b.loop(15, -13);
      b.straight(20).checkpoint();
      b.coins(8, 8, 'weave');
      b.walls(true).width(4.6).turn(-70, 70, 20).turn(70, 70, 20).width(6).walls(false);
      b.pad(0).straight(40);
      b.corkscrew(80, 1);
      b.straight(30).checkpoint();
      b.pad(0).straight(40);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(30).coins(6, 8, 'diag', 1);
      b.slope(110, 18);
      b.turn(-45, 120);
      b.straight(20).checkpoint();
      b.pad(0).straight(50);
      b.loop(17, 15);
      b.straight(30).corkscrew(70, -1);
      b.straight(30).pad(0).straight(40);
      b.ramp(22, 5).jump({ gap: 32, land: 110 });
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'demon',
    name: "Demon's Drop",
    theme: 'night',
    desc: 'The final run: a huge drop and every trick in the book.',
    weather: 'storm',
    ai: 1.04,
    target: 5600,
    build(b) {
      b.straight(110);
      b.slope(80, 12);
      b.turn(-40, 120);
      b.straight(20).checkpoint();
      b.hammer(18, 2.4).hammer(44, 2.4);
      b.straight(70);
      b.pad(0).straight(50);
      b.loop(15, 13);
      b.straight(20).corkscrew(70, 1);
      b.straight(30).coins(8, 8, 'weave');
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(20).checkpoint();
      b.walls(true).width(4.6).turn(70, 70, 20).turn(-70, 70, 20).turn(50, 80, 18).width(6).walls(false);
      b.slope(130, -22);
      b.straight(20).checkpoint();
      b.pad(0).straight(50);
      b.loop(17, -15);
      b.straight(20).pad(0).straight(50);
      b.loop(15, 13);
      b.straight(30).coins(8, 8, 'line', 0);
      b.turn(-45, 120);
      b.pad(0).straight(40);
      b.corkscrew(90, -1);
      b.straight(30).checkpoint();
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 32, land: 110 });
      b.straight(20);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(20).checkpoint();
      b.slope(70, 10).slope(70, -10);
      b.coins(8, 8, 'weave');
      b.pad(0).straight(50);
      b.loop(16, 14);
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'canyon',
    name: 'Canyon Run',
    theme: 'desert',
    desc: 'Cones, barriers and your first bounce pad.',
    ai: 1.03,
    target: 4200,
    build(b) {
      b.straight(110);
      b.coins(8, 8, 'line', 0);
      b.turn(35, 140);
      b.straight(20).checkpoint();
      b.cones(6, 'slalom', 0, 10, 9);
      b.straight(75);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(20, 4.5).jump({ gap: 26, land: 95 });
      b.straight(20).checkpoint();
      b.barrier(-2.3, 2.0, 20).barrier(2.3, 2.0, 80);
      b.straight(100);
      b.turn(-50, 120);
      b.coins(6, 8, 'weave');
      b.slope(90, 10);
      b.straight(20).checkpoint();
      b.bouncer(0, 10);
      b.straight(110);
      b.turn(45, 130);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(20).checkpoint();
      b.cones(5, 'wall', -2, 20);
      b.straight(50);
      b.slope(80, -12);
      b.pad(0).straight(50);
      b.loop(15, 13);
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'mesa',
    name: 'Mesa Madness',
    theme: 'desert',
    desc: 'Swinging hammers and a slick of oil.',
    ai: 1.05,
    target: 4800,
    build(b) {
      b.straight(110);
      b.turn(-30, 150);
      b.straight(20).checkpoint();
      b.hammer(25, 2.6);
      b.straight(60);
      b.coins(6, 8, 'line', 2.5);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(20).checkpoint();
      b.slick(-1.5, 16, 2.4, 'oil', 10);
      b.straight(40);
      b.turn(55, 110);
      b.walls(true).width(5).turn(-60, 80, 18).turn(60, 80, 18).width(6).walls(false);
      b.straight(20).checkpoint();
      b.hammer(20, 2.3).hammer(50, 2.3);
      b.straight(70);
      b.pad(0).straight(50);
      b.loop(16, -14);
      b.straight(30).checkpoint();
      b.bouncer(0, 12);
      b.straight(100);
      b.coins(8, 8, 'weave');
      b.slope(90, -14);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'sandstorm',
    name: 'Sandstorm Sprint',
    theme: 'desert',
    desc: 'Sliding blocks in a howling sandstorm.',
    weather: 'sand',
    ai: 1.07,
    target: 5200,
    build(b) {
      b.straight(110);
      b.coins(8, 8, 'weave');
      b.turn(40, 130);
      b.straight(20).checkpoint();
      b.slider(20, 2.8);
      b.straight(60);
      b.pad(0).straight(40);
      b.corkscrew(80, 1);
      b.straight(30).checkpoint();
      b.barrier(0, 1.6, 22).cones(4, 'line', -3.4, 55, 5).cones(4, 'line', 3.4, 55, 5);
      b.straight(90);
      b.slope(100, 16);
      b.turn(-55, 110);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 32, land: 110 });
      b.straight(20).checkpoint();
      b.slider(15, 2.4).slider(45, 2.4);
      b.straight(70);
      b.slope(80, -12);
      b.bouncer(-2, 10);
      b.straight(100);
      b.coins(6, 8, 'line', 0);
      b.turn(35, 140);
      b.pad(0).straight(50);
      b.loop(15, 13);
      b.straight(20).checkpoint();
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'frostbite',
    name: 'Frostbite Pass',
    theme: 'arctic',
    desc: 'Ice patches, a spinning bar and a cone slalom.',
    weather: 'snow',
    ai: 1.07,
    target: 4600,
    build(b) {
      b.straight(110);
      b.slope(80, 8);
      b.coins(8, 8, 'weave');
      b.turn(-40, 130);
      b.straight(20).checkpoint();
      b.slick(0, 18, 3.0, 'ice', 10);
      b.straight(40);
      b.coins(6, 8, 'line', -2.5);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(20, 4.5).jump({ gap: 26, land: 95 });
      b.straight(20).checkpoint();
      b.spinner(25, 3.6);
      b.straight(60);
      b.turn(50, 120);
      b.cones(7, 'slalom', 0, 10, 8);
      b.straight(80).checkpoint();
      b.pad(0).straight(50);
      b.loop(15, 13);
      b.straight(30);
      b.slick(2, 16, 2.2, 'ice', 8).slick(-2, 16, 2.2, 'ice', 32);
      b.straight(60);
      b.slope(90, -12);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'glacier',
    name: 'Glacier Gauntlet',
    theme: 'arctic',
    desc: 'Twin hammers, a bounce pad and a barrier slalom.',
    weather: 'snow',
    ai: 1.09,
    target: 5400,
    build(b) {
      b.straight(110);
      b.coins(8, 8, 'line', 2.5);
      b.turn(35, 150);
      b.straight(20).checkpoint();
      b.hammer(20, 2.5).hammer(48, 2.5);
      b.straight(70);
      b.coins(8, 8, 'weave');
      b.pad(0).straight(40);
      b.corkscrew(80, -1);
      b.straight(30).checkpoint();
      b.bouncer(0, 10);
      b.straight(100);
      b.slick(0, 20, 3.2, 'ice', 5);
      b.straight(30);
      b.turn(-55, 110);
      b.walls(true).width(5).turn(60, 80, 18).turn(-60, 80, 18).width(6).walls(false);
      b.straight(20).checkpoint();
      b.spinner(20, 3.0);
      b.straight(50);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 34, land: 115 });
      b.straight(30).checkpoint();
      b.barrier(-2.3, 2.0, 12).barrier(2.3, 2.0, 72).barrier(-2.3, 2.0, 132);
      b.straight(150);
      b.pad(0).straight(50);
      b.loop(16, -14);
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'avalanche',
    name: 'Avalanche Alley',
    theme: 'arctic',
    desc: 'A huge drop, sliders and back-to-back jumps.',
    weather: 'snow',
    ai: 1.11,
    target: 6000,
    build(b) {
      b.straight(110);
      b.slope(80, 12);
      b.coins(8, 8, 'weave');
      b.turn(-40, 120);
      b.straight(20).checkpoint();
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 32, land: 110 });
      b.straight(20);
      b.slider(15, 2.6).slider(42, 2.2);
      b.straight(70);
      b.coins(6, 8, 'line', 0);
      b.straight(20).checkpoint();
      b.slope(130, -22);
      b.pad(0).straight(50);
      b.loop(17, 15);
      b.straight(20).corkscrew(70, 1);
      b.straight(30).checkpoint();
      b.cones(6, 'wall', 2, 15).slick(-2.5, 18, 2, 'ice', 30);
      b.straight(70);
      b.turn(50, 120);
      b.hammer(25, 2.4);
      b.straight(60);
      b.bouncer(0, 10);
      b.straight(100);
      b.straight(20).checkpoint();
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(20);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 32, land: 110 });
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'magma',
    name: 'Magma Mile',
    theme: 'volcano',
    desc: 'Spinning bars above a sea of lava.',
    weather: 'embers',
    ai: 1.11,
    target: 5000,
    build(b) {
      b.straight(110);
      b.coins(8, 8, 'weave');
      b.turn(40, 130);
      b.straight(20).checkpoint();
      b.spinner(20, 3.2);
      b.straight(50);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(22, 5).jump({ gap: 30, land: 110 });
      b.straight(20).checkpoint();
      b.barrier(0, 2.0, 25);
      b.straight(50);
      b.coins(6, 8, 'line', -2.5);
      b.slope(90, 12);
      b.turn(-50, 120);
      b.bouncer(0, 10);
      b.straight(100);
      b.straight(20).checkpoint();
      b.pad(0).straight(50);
      b.loop(15, -13);
      b.straight(30);
      b.slick(0, 16, 2.4, 'oil', 8);
      b.straight(40);
      b.spinner(15, 2.8);
      b.straight(45);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 34, land: 115 });
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'inferno',
    name: 'Inferno Loop',
    theme: 'volcano',
    desc: 'Hammers, a double loop and falling ash.',
    weather: 'ash',
    ai: 1.13,
    target: 5800,
    build(b) {
      b.straight(110);
      b.slope(80, -10);
      b.coins(8, 8, 'weave');
      b.turn(-35, 140);
      b.straight(20).checkpoint();
      b.hammer(20, 2.4).hammer(46, 2.4);
      b.straight(70);
      b.pad(0).straight(50);
      b.loop(15, 13);
      b.straight(20).pad(0).straight(50);
      b.loop(15, -13);
      b.straight(20).checkpoint();
      b.slider(15, 2.5);
      b.straight(40);
      b.walls(true).width(4.8).turn(65, 70, 20).turn(-65, 70, 20).width(6).walls(false);
      b.coins(6, 8, 'line', 0);
      b.bouncer(0, 12);
      b.straight(100);
      b.straight(20).checkpoint();
      b.pad(0).straight(40);
      b.corkscrew(80, 1);
      b.straight(30);
      b.cones(8, 'slalom', 0, 10, 7);
      b.straight(65);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(70).finish().straight(170);
    },
  },
  {
    id: 'eruption',
    name: 'Eruption',
    theme: 'volcano',
    desc: 'The grand finale: every obstacle, every trick.',
    weather: 'embers',
    ai: 1.15,
    target: 7000,
    build(b) {
      b.straight(110);
      b.slope(80, 14);
      b.coins(8, 8, 'weave');
      b.turn(40, 120);
      b.straight(20).checkpoint();
      b.spinner(20, 3.0);
      b.straight(50);
      b.pad(0).straight(50);
      b.loop(16, 14);
      b.straight(20).corkscrew(70, -1);
      b.straight(30).checkpoint();
      b.hammer(20, 2.3).hammer(46, 2.3).hammer(72, 2.3);
      b.straight(95);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(20).checkpoint();
      b.slider(15, 2.4).slick(0, 14, 2.4, 'oil', 32);
      b.straight(60);
      b.walls(true).width(4.6).turn(-70, 70, 20).turn(70, 70, 20).turn(-45, 80, 18).width(6).walls(false);
      b.slope(130, -24);
      b.straight(20).checkpoint();
      b.bouncer(0, 10);
      b.straight(100);
      b.barrier(-2.3, 2.0, 12).barrier(2.3, 2.0, 72).cones(5, 'wall', 2.4, 125);
      b.straight(145);
      b.pad(0).straight(50);
      b.loop(17, -15);
      b.straight(20).pad(0).straight(50);
      b.loop(15, 13);
      b.straight(30).checkpoint();
      b.pad(0).straight(40);
      b.corkscrew(90, 1);
      b.straight(20);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
      b.ramp(24, 6).jump({ gap: 36, land: 120 });
      b.straight(20);
      b.coins(5, 8, 'line', 0);
      b.pad(0).straight(45);
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

SD.tracks = { THEMES, WORLDS, TRACKS, buildTrack };
})();
