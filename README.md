# Speed Demons

A casual 3D stunt racer for PC and phones. Race four sky tracks against AI drivers: loops, corkscrews, ramps and big jumps, with flips, spins and barrel rolls for stunt points.

Built with [three.js](https://threejs.org) (bundled in `vendor/`, MIT licence). There's no build step: open `index.html` and play. The cars, tracks, scenery and sounds are all generated in code.

## Features

- **4 tracks:** Sky Rookie, Sunset Loops, Candy Corkscrew and Neon Nights. Each has its own sky and colours, and each unlocks the next.
- **5-car sprint races** with a countdown, checkpoints, a live progress bar and positions.
- **Stunts:** front and back flips, 360 spins and barrel rolls in the air. Combos multiply your score. Clean landings earn a bonus; bad ones crash you.
- **Nitro** is earned from stunts, stars and gold rings. Boost pads give an instant kick.
- **3 stars per track:** finish, win, and beat the track's stunt target.
- **3 cars** (Racer, Buggy, Muscle) with different stats. Stars unlock them. 9 colours.
- **Always landscape:** on a phone or tablet held upright, the game turns itself sideways, so it plays in landscape even with rotation lock on. On a PC it fills the window.
- **Full screen:** a *Full screen* button on the title and pause screens (or press <kbd>F</kbd>). Phones start with a *Play in full screen* button that also locks landscape. iPhone Safari doesn't allow full screen for web pages, so the button there explains *Share → Add to Home Screen*, which opens the game full screen like an app.
- **Phones:** on-screen controls, and the car accelerates by itself.
- **Adaptive graphics:** High, Medium or Low, and it drops a level automatically on slow devices.

## Controls

| Action | Keyboard | Phone | Gamepad |
| --- | --- | --- | --- |
| Steer | ← → / A D | ◀ ▶ | Left stick / D-pad |
| Gas / brake | ↑ ↓ / W S | automatic / BRAKE | A, RT / B, LT |
| Nitro | Space / Shift | ⚡ NITRO | X |
| **In the air:** flip | ↑ / ↓ | NITRO / BRAKE buttons | Left stick up/down |
| **In the air:** spin | ← → | ◀ ▶ | Left stick |
| **In the air:** barrel roll | Q / E | – | LB / RB |
| Back to checkpoint | R | ⟲ | Y |
| Pause | Esc / P | ❚❚ | Start |
| Full screen | F | pause menu | – |

Anything held when you leave a ramp is ignored until you let go, so you won't flip by accident. Let go of the controls and the car lines itself up for landing.

## Run it

Double-click `index.html`. It runs straight from disk in Chrome, Edge, Firefox and Safari.

To play on a phone, put the folder on any static host (GitHub Pages, Netlify Drop, Vercel, Cloudflare Pages) and open the link. Serving it over HTTP also enables *Add to Home Screen* / install as an app. To test that locally:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

Add `?debug` to the URL to expose `window.__speedDemons`, which lets you step the simulation from the console.

## Personalize

Edit [`js/config.js`](js/config.js): player name, title, subtitle and results messages.

## How it works

```
js/track.js    track builder (straights, turns, ramps, jumps, loops, corkscrews),
               the sampled 3D ribbon the physics runs on, and mesh generation
js/tracks.js   the 4 layouts + colour themes
js/physics.js  arcade driving on the ribbon, ballistic air, tricks, landings, AI drivers
js/cars.js     procedural low-poly cars
js/world.js    sky shader, cloud sea, floating islands, balloons, lighting
js/fx.js       GPU particles (smoke, sparks, nitro, confetti)
js/main.js     race flow, camera, HUD, menus, full screen and landscape handling
js/input.js    keyboard / touch / gamepad
js/audio.js    synthesized engine, effects and music
```

The scripts are plain `<script>` files rather than ES modules, so the page works from `file://`. Each file wraps itself in a function and shares its exports on `window.SD`. `index.html` loads them in dependency order, after `vendor/three.min.js` (a classic-script build of three.js that sets `window.THREE`).

On the ground, the car's position is stored as distance along the track plus sideways offset. That keeps loops and corkscrews stable. At a ramp, a sharp crest, or the road edge, it switches to free 3D flight. Landings are graded by how well the car's wheels and nose line up with the road.
