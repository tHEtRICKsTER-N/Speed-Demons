/* Keyboard, touch and gamepad input, merged into one state object each frame. */
(() => {
'use strict';
const SD = (window.SD ||= {});
const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

class Input {
  constructor() {
    this.keys = {};
    this.touch = { steer: 0, brake: false, nitro: false };
    this.state = { steer: 0, gas: false, brake: false, nitro: false, pitch: 0, roll: 0 };
    this.touchUI = window.matchMedia('(pointer: coarse)').matches;
    this.autoGas = false;
    this.inGame = false;
    this.rotated = false; // page turned sideways with CSS (upright phone)
    this.on = { pause: null, respawn: null, primary: null, back: null, fullscreen: null, touchDetected: null };
    this.gpPrev = {};
    this.steerPointers = new Map();

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (this.inGame && GAME_KEYS.includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') this.fire(this.inGame ? 'pause' : 'back');
      else if (e.code === 'KeyR' && this.inGame) this.fire('respawn');
      else if (e.code === 'KeyF') this.fire('fullscreen');
      else if (e.code === 'Enter') {
        const a = document.activeElement;
        if (!a || a.tagName !== 'BUTTON') this.fire('primary');
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => this.releaseAll());
    window.addEventListener('touchstart', () => {
      if (!this.touchUI) {
        this.touchUI = true;
        this.fire('touchDetected');
      }
    }, { passive: true });
  }

  fire(name) { if (this.on[name]) this.on[name](); }

  releaseAll() {
    for (const k in this.keys) this.keys[k] = false;
    this.touch.steer = 0;
    this.touch.brake = this.touch.nitro = false;
    this.steerPointers.clear();
  }

  bindTouch({ zone, left, right, brake, nitro }) {
    const hold = (node, set) => {
      node.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { node.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        node.classList.add('on');
        set(true);
      });
      const end = () => {
        node.classList.remove('on');
        set(false);
      };
      node.addEventListener('pointerup', end);
      node.addEventListener('pointercancel', end);
      node.addEventListener('lostpointercapture', end);
    };
    hold(brake, (v) => (this.touch.brake = v));
    hold(nitro, (v) => (this.touch.nitro = v));

    const refresh = () => {
      let s = 0;
      for (const v of this.steerPointers.values()) s = v;
      this.touch.steer = s;
      left.classList.toggle('on', s < 0);
      right.classList.toggle('on', s > 0);
    };
    const side = (e) => {
      const r = zone.getBoundingClientRect();
      // turned sideways, the zone's left half is the top half of its box on screen
      if (this.rotated) return e.clientY < r.top + r.height / 2 ? -1 : 1;
      return e.clientX < r.left + r.width / 2 ? -1 : 1;
    };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.steerPointers.set(e.pointerId, side(e));
      refresh();
    });
    zone.addEventListener('pointermove', (e) => {
      if (!this.steerPointers.has(e.pointerId)) return;
      this.steerPointers.set(e.pointerId, side(e));
      refresh();
    });
    const end = (e) => {
      this.steerPointers.delete(e.pointerId);
      refresh();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
    this.clearTouchVisuals = () => {
      for (const n of [left, right, brake, nitro]) n.classList.remove('on');
    };
  }

  pollGamepad() {
    let pads = [];
    try {
      pads = navigator.getGamepads ? navigator.getGamepads() : [];
    } catch (e) { /* blocked */ }
    for (const g of pads) {
      if (!g || !g.connected) continue;
      const b = (i) => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.3));
      const ax = (i) => (Math.abs(g.axes[i] || 0) > 0.2 ? g.axes[i] : 0);
      const st = {
        steer: b(14) ? -1 : b(15) ? 1 : ax(0),
        stickY: b(12) ? -1 : b(13) ? 1 : ax(1),
        gas: b(0) || b(7),
        brake: b(1) || b(6),
        nitro: b(2),
        roll: (b(5) ? 1 : 0) - (b(4) ? 1 : 0),
      };
      const edge = (name, now) => {
        const was = this.gpPrev[name];
        this.gpPrev[name] = now;
        return now && !was;
      };
      if (edge('start', b(9))) this.fire(this.inGame ? 'pause' : 'back');
      if (edge('y', b(3)) && this.inGame) this.fire('respawn');
      if (edge('a', b(0)) && !this.inGame) this.fire('primary');
      return st;
    }
    return null;
  }

  // air: whether the car is airborne (gas/brake/nitro become flip controls)
  poll(air) {
    const k = this.keys;
    const s = this.state;
    const gp = this.pollGamepad();
    const upKey = !!(k.ArrowUp || k.KeyW);
    const downKey = !!(k.ArrowDown || k.KeyS);
    let steer = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    if (this.touch.steer) steer = this.touch.steer;
    if (gp && gp.steer) steer = gp.steer;

    s.brake = downKey || this.touch.brake || !!(gp && gp.brake);
    s.nitro = !!(k.Space || k.ShiftLeft || k.ShiftRight) || this.touch.nitro || !!(gp && gp.nitro);
    s.gas = this.autoGas ? !s.brake : upKey || !!(gp && gp.gas);
    s.steer = Math.max(-1, Math.min(1, steer));

    // In the air: up / NITRO = front flip, down / BRAKE = back flip, Q/E = barrel roll.
    let pitch = (upKey ? 1 : 0) - (downKey ? 1 : 0);
    if (this.touch.nitro) pitch = 1;
    if (this.touch.brake) pitch = -1;
    if (gp && gp.stickY) pitch = -gp.stickY;
    s.pitch = air ? pitch : 0;
    s.roll = air ? (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0) + (gp ? gp.roll : 0) : 0;
    if (air) s.nitro = false;
    return s;
  }
}

SD.input = { Input };
})();
