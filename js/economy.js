/* Progress and economy: the save file, coins (the only currency), cars, upgrades, race rewards. */
(() => {
'use strict';
const SD = (window.SD ||= {});
const { store } = SD.util;
const { CAR_TYPES, COLORS } = SD.cars;
const { TRACKS } = SD.tracks;

const SAVE_KEY = 'speedDemons.v2';
const OLD_KEYS = ['speedDemons.v1', 'stuntRush.v1']; // earlier save formats - carried over

const COIN_VALUE = 5; // each coin picked up on the track
const PLACE_BONUS = [250, 180, 130, 90, 60];
const NEW_STAR_BONUS = 100;

const UPGRADES = [
  { id: 'engine', name: 'Engine', desc: 'Top speed' },
  { id: 'turbo', name: 'Turbo', desc: 'Acceleration' },
  { id: 'nitro', name: 'Nitro', desc: 'Fills faster, lasts longer' },
  { id: 'handling', name: 'Handling', desc: 'Grip and air control' },
];
const MAX_LEVEL = 5;
const LEVEL_COST = [150, 300, 550, 900, 1400];

function defaults() {
  return {
    v: 2,
    coins: 0,
    car: 'racer',
    color: COLORS[0],
    owned: { racer: true },
    upgrades: {},
    track: 0,
    results: {},
    sfx: true,
    music: true,
    quality: null,
    autoGas: null,
    tutorial: false,
    races: 0,
    daily: { last: null, streak: 0 },
    freeAt: 0, // when the garage's free-coins video was last watched (ms)
  };
}

function load() {
  const s = defaults();
  const cur = store.get(SAVE_KEY, null);
  if (cur) return Object.assign(s, cur);
  const old = OLD_KEYS.map((k) => store.get(k, null)).find(Boolean);
  if (old) {
    // v1 unlocked cars with stars: keep what was unlocked, and turn stars into starting coins
    Object.assign(s, { color: old.color || s.color, track: old.track || 0, results: old.results || {}, sfx: old.sfx !== false, music: old.music !== false, quality: old.quality ?? null, autoGas: old.autoGas ?? null, tutorial: true });
    const stars = Object.values(s.results).reduce((n, r) => n + (r.stars || 0), 0);
    if (stars >= 3) s.owned.buggy = true;
    if (stars >= 6) s.owned.muscle = true;
    if (s.owned[old.car]) s.car = old.car;
    s.coins = stars * 150;
  }
  return s;
}

// Filled by reload() once the platform SDK is ready (CrazyGames saves live in its data module).
const save = defaults();
const persist = () => store.set(SAVE_KEY, save);
function reload() {
  const loaded = load();
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, loaded);
  if (!owns(save.car)) save.car = 'racer';
  if (!TRACKS[save.track] || !trackUnlocked(save.track)) save.track = 0;
}

const carById = (id) => CAR_TYPES.find((t) => t.id === id) || CAR_TYPES[0];
const carTier = (id) => Math.max(0, CAR_TYPES.findIndex((t) => t.id === id));
const levels = (id) => Object.assign({ engine: 0, turbo: 0, nitro: 0, handling: 0 }, save.upgrades[id]);
const owns = (id) => !!save.owned[id];
const upgradeCost = (id, stat) => {
  const lv = levels(id)[stat];
  return lv >= MAX_LEVEL ? null : Math.round((LEVEL_COST[lv] * (1 + carTier(id) * 0.25)) / 10) * 10;
};

// Driving stats with upgrades applied (what the physics uses).
function carStats(id) {
  const t = carById(id);
  const u = levels(id);
  return {
    ...t,
    top: t.top * (1 + 0.025 * u.engine),
    accel: t.accel * (1 + 0.05 * u.turbo),
    grip: t.grip * (1 + 0.035 * u.handling),
    air: t.air * (1 + 0.05 * u.handling),
    nitroGain: 1 + 0.12 * u.nitro,
    nitroDrain: 1 / (1 + 0.08 * u.nitro),
  };
}

function spend(amount) {
  if (save.coins < amount) return false;
  save.coins -= amount;
  persist();
  return true;
}

function buyCar(id) {
  const t = carById(id);
  if (owns(id) || !spend(t.price)) return false;
  save.owned[id] = true;
  save.car = id;
  persist();
  return true;
}

function buyUpgrade(id, stat) {
  const cost = upgradeCost(id, stat);
  if (cost == null || !owns(id) || !spend(cost)) return false;
  save.upgrades[id] = Object.assign(levels(id), { [stat]: levels(id)[stat] + 1 });
  persist();
  return true;
}

function addCoins(n) {
  save.coins += Math.max(0, Math.round(n));
  persist();
}

// Coins for a finished race. newStars = stars earned on this track for the first time.
function raceReward({ pos, coins, score, trackIdx, newStars }) {
  const tier = 1 + trackIdx * 0.12;
  const lines = [
    { label: `Coins ×${coins}`, value: coins * COIN_VALUE },
    { label: 'Stunts', value: Math.round(score / 25) },
    { label: `${pos}${pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'} place`, value: Math.round((PLACE_BONUS[pos - 1] || 40) * tier) },
  ];
  if (newStars > 0) lines.push({ label: `New ★ ×${newStars}`, value: newStars * NEW_STAR_BONUS });
  return { lines: lines.filter((l) => l.value > 0), total: lines.reduce((n, l) => n + l.value, 0) };
}

/* ---- daily reward: a 7-day streak that restarts if you skip a day */
const DAILY = [100, 150, 200, 300, 400, 500, 1000];
const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
function dailyStatus(now = Date.now()) {
  const d = save.daily || { last: null, streak: 0 };
  if (d.last === dayKey(now)) return { ready: false, streak: d.streak, reward: 0, rewards: DAILY };
  const streak = d.last === dayKey(now - 864e5) ? (d.streak % DAILY.length) + 1 : 1;
  return { ready: true, streak, reward: DAILY[streak - 1], rewards: DAILY };
}
function claimDaily(mult = 1, now = Date.now()) {
  const st = dailyStatus(now);
  if (!st.ready) return 0;
  save.daily = { last: dayKey(now), streak: st.streak };
  addCoins(st.reward * mult);
  return st.reward * mult;
}

/* ---- free coins for watching a video in the garage (cooldown so it isn't pushed too often) */
const FREE_COOLDOWN = 5 * 60 * 1000;
const freeCoinsAmount = () => Math.min(1000, 150 + totalStars() * 20);
const freeCoinsWait = (now = Date.now()) => Math.max(0, (save.freeAt || 0) + FREE_COOLDOWN - now);
function claimFreeCoins(now = Date.now()) {
  if (freeCoinsWait(now) > 0) return 0;
  save.freeAt = now;
  const n = freeCoinsAmount();
  addCoins(n);
  return n;
}

/* ---- tracks & stars */
const result = (i) => save.results[TRACKS[i].id] || {};
const totalStars = () => TRACKS.reduce((n, _, i) => n + (result(i).stars || 0), 0);
// Finish a track to open the next one (tracks you've already raced stay open).
const trackUnlocked = (i) => i === 0 || (result(i - 1).stars || 0) > 0 || (result(i).stars || 0) > 0;
// The track "Play" should start: the first unlocked one still missing stars, else the last played.
function nextTrack() {
  for (let i = 0; i < TRACKS.length; i++) {
    if (trackUnlocked(i) && (result(i).stars || 0) < 3) return i;
  }
  return save.track;
}

SD.economy = {
  save, persist, reload, COIN_VALUE, UPGRADES, MAX_LEVEL,
  carById, carStats, levels, owns, upgradeCost, buyCar, buyUpgrade, addCoins, raceReward,
  result, totalStars, trackUnlocked, nextTrack,
  dailyStatus, claimDaily, freeCoinsAmount, freeCoinsWait, claimFreeCoins,
};
})();
