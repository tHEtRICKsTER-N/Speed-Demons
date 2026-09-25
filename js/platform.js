/* Game portal integration: Poki, CrazyGames, or plain web (own site / local file).
 * One interface for the rest of the game: gameplay events, ad breaks, rewarded ads, saves.
 *
 * Which platform: ?platform=poki|crazygames|web in the URL (testing), else the
 * <meta name="sd-platform"> tag (set by tools/package.mjs for each portal build),
 * else the hostname. Without its SDK (ad blocker, offline) every call quietly does nothing. */
(() => {
'use strict';
const SD = (window.SD ||= {});

const SDK_URL = {
  poki: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
  crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
};

function detect() {
  const q = new URLSearchParams(location.search).get('platform');
  if (q && (q === 'web' || SDK_URL[q])) return q;
  const meta = document.querySelector('meta[name="sd-platform"]');
  const m = meta && meta.content;
  if (m && m !== 'auto' && (m === 'web' || SDK_URL[m])) return m;
  const host = location.hostname;
  if (/(^|\.)poki(-gdn)?\.(com|io)$/.test(host) || /poki/.test(host)) return 'poki';
  if (/crazygames|1001juegos/.test(host)) return 'crazygames';
  return 'web';
}

function loadScript(src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    s.src = src;
    s.async = true;
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); reject(new Error('load failed')); };
    document.head.appendChild(s);
  });
}

const name = detect();
let poki = null; // window.PokiSDK once ready
let cg = null; // window.CrazyGames.SDK once ready
let playing = false;
let adActive = false;
const listeners = { adStart: [], adEnd: [], mute: [] };
const emit = (ev, v) => listeners[ev].forEach((fn) => fn(v));

function adStart() {
  if (adActive) return;
  adActive = true;
  emit('adStart');
}
function adEnd() {
  if (!adActive) return;
  adActive = false;
  emit('adEnd');
}

const platform = {
  name,
  // CrazyGames forbids in-game full screen buttons, and both portals provide their own.
  get fullscreenUI() { return name === 'web'; },
  get adActive() { return adActive; },
  get hasAds() { return !!(poki || (cg && cg.environment !== 'disabled')); },
  on(ev, fn) { listeners[ev].push(fn); },

  async init() {
    if (name === 'web') return;
    try {
      await loadScript(SDK_URL[name], 6000);
      if (name === 'poki' && window.PokiSDK) {
        await window.PokiSDK.init();
        poki = window.PokiSDK;
      } else if (name === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK) {
        await window.CrazyGames.SDK.init();
        cg = window.CrazyGames.SDK;
        if (cg.environment === 'disabled') cg = null;
        if (cg) {
          cg.game.loadingStart();
          const s = cg.game.settings || {};
          if (s.muteAudio) emit('mute', true);
          cg.game.addSettingsChangeListener((ns) => emit('mute', !!ns.muteAudio));
        }
      }
    } catch (e) {
      // Blocked or offline: the game still runs, just without portal features.
      poki = null;
      cg = null;
    }
  },

  loadingDone() {
    try {
      if (poki) poki.gameLoadingFinished();
      if (cg) cg.game.loadingStop();
    } catch (e) { /* ignore */ }
  },

  // Called for every start / resume of actual driving, and every stop (pause, menu, finish).
  // Portals ask for no repeated events in a row, so only changes are forwarded.
  gameplay(on) {
    if (on === playing || adActive) return;
    playing = on;
    try {
      if (poki) on ? poki.gameplayStart() : poki.gameplayStop();
      if (cg) on ? cg.game.gameplayStart() : cg.game.gameplayStop();
    } catch (e) { /* ignore */ }
  },

  // Ad at a natural break (before starting the next race). The portal decides whether one plays.
  commercialBreak() {
    platform.gameplay(false);
    if (poki) {
      return poki.commercialBreak(adStart).catch(() => {}).then(adEnd);
    }
    if (cg) {
      return new Promise((resolve) => {
        const done = () => { adEnd(); resolve(); };
        try {
          cg.ad.requestAd('midgame', { adStarted: adStart, adFinished: done, adError: done });
        } catch (e) { done(); }
      });
    }
    return Promise.resolve();
  },

  // Opt-in rewarded video. Resolves true only when the reward should be granted.
  rewardedBreak() {
    platform.gameplay(false);
    if (poki) {
      return poki.rewardedBreak(adStart).then((ok) => !!ok, () => false).then((ok) => { adEnd(); return ok; });
    }
    if (cg) {
      return new Promise((resolve) => {
        const finish = (ok) => { adEnd(); resolve(ok); };
        try {
          cg.ad.requestAd('rewarded', { adStarted: adStart, adFinished: () => finish(true), adError: () => finish(false) });
        } catch (e) { finish(false); }
      });
    }
    return Promise.resolve(false);
  },

  happytime() {
    try { if (cg) cg.game.happytime(); } catch (e) { /* ignore */ }
  },

  // Progress saves. CrazyGames requires its data module (synced to the player's account).
  storage: {
    get(key) {
      try {
        if (cg && cg.data) return cg.data.getItem(key);
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    set(key, value) {
      try {
        if (cg && cg.data) cg.data.setItem(key, value);
        else localStorage.setItem(key, value);
      } catch (e) { /* storage unavailable (e.g. private mode) */ }
    },
  },
};

SD.platform = platform;
})();
