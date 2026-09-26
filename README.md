# Speed Demons

A 3D arcade stunt racer for PC and phones. Race rivals across 12 sky tracks full of loops, corkscrews, ramps and big jumps. Pull flips, spins and barrel rolls for stunt points and nitro, grab coins, and spend them on new cars and upgrades.

Built with [three.js](https://threejs.org) (bundled in `vendor/`, MIT licence). There's no build step: open `index.html` and play. The cars, tracks, scenery and sounds are all generated in code, so the whole game is about 300 KB zipped.

## Features

- **12 tracks in 4 worlds:** Sky Islands, Sunset Coast, Candy Clouds and Neon Nights. Finishing a track unlocks the next.
- **5-car races** against named rivals who get faster (and flashier) world by world.
- **Stunts:** front and back flips, 360 spins and barrel rolls. Combos multiply your score, clean landings earn a bonus, and bad ones crash you. Stunts fill your nitro.
- **Missed a jump?** The car falls away into the clouds, then comes back at the last checkpoint, blinking for a moment while rivals can't bump it.
- **Coins** on the track, plus coins for stunts, finishing position and new stars. Coins are the only currency.
- **Garage:** 6 cars (Racer, Buggy, Muscle, Stomper the monster truck, Bolt the formula car, Phantom the hypercar), each with 4 upgrades (Engine, Turbo, Nitro, Handling, 5 levels each) and 9 colours.
- **3 stars per track:** finish, win, and beat the track's stunt target.
- **Slipstream:** tuck in behind a rival to fill your nitro.
- **First-race hints** for keyboard and touch.
- **Always landscape:** on a phone or tablet held upright, the game turns itself sideways, so it plays in landscape even with rotation lock on.
- **Full screen:** on your own site there's a *Full screen* button on the title and pause screens (or press <kbd>F</kbd>), and phones start with a one-tap *Play in full screen*. On game portals this is hidden, because the portal provides full screen (CrazyGames forbids in-game full screen buttons).
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
| Full screen (own site) | F | pause menu | – |

## Publishing on Poki and CrazyGames

Build the upload zips:

```bash
node tools/package.mjs
```

This writes to `dist/` (which git ignores):

| File | Upload to |
| --- | --- |
| `speed-demons-poki.zip` | [Poki for Developers](https://developers.poki.com) |
| `speed-demons-crazygames.zip` | [CrazyGames developer portal](https://developer.crazygames.com) |
| `speed-demons-web.zip` | your own site (GitHub Pages, Netlify, itch.io, ...) |

Each zip pins the platform in `index.html` (`<meta name="sd-platform">`). [`js/platform.js`](js/platform.js) then loads that portal's SDK and handles:

- **Loading and gameplay events:** loading finished, and gameplay start/stop on every race start, pause, resume, finish and quit (never twice in a row).
- **Midgame ads** before the next race, retry or restart, never before the first race. The portal decides whether an ad actually plays.
- **Rewarded ads:** *🎬 Double coins* on the results screen, next to an equal-size *Next race* button. The reward is only given when the ad completes.
- **During any ad:** the game freezes, all sound mutes and input is ignored.
- **Saves:** CrazyGames saves through its data module (synced to the player's account), everything else uses `localStorage`. The CrazyGames "mute audio" setting is respected.
- **Ad blockers:** the game runs normally without the SDK, just without ads.

Both portals' rules are followed: no external requests (the font is bundled), no outside links, one currency, and one click from the title to a race.

To test a portal locally, serve the folder and add `?platform=poki` or `?platform=crazygames` to the URL. Both SDKs run in test mode on `localhost`, and CrazyGames shows demo ads.

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/?platform=crazygames>.

Things the portals ask for that live outside the code: thumbnails and screenshots, a game description, and (Poki) an animated thumbnail.

## Run it

Double-click `index.html`. It runs straight from disk in Chrome, Edge, Firefox and Safari.

To play on a phone, put the folder on any static host and open the link. Serving it over HTTP also enables *Add to Home Screen* / install as an app.

Add `?debug` to the URL to expose `window.__speedDemons`, which lets you step the simulation from the console.

## Personalize

Edit [`js/config.js`](js/config.js): player name, title, subtitle and results messages. Car prices and stats are in [`js/cars.js`](js/cars.js), rewards and upgrade costs in [`js/economy.js`](js/economy.js), and track layouts in [`js/tracks.js`](js/tracks.js).

## How it works

```
js/track.js     track builder (straights, turns, ramps, jumps, loops, corkscrews, coins),
                the sampled 3D ribbon the physics runs on, and mesh generation
js/tracks.js    the 12 layouts, 4 worlds and colour themes
js/physics.js   arcade driving on the ribbon, ballistic air, tricks, landings, falls, AI drivers
js/cars.js      procedural low-poly cars and their stats
js/economy.js   save file, coins, car purchases, upgrades, race rewards
js/platform.js  Poki / CrazyGames SDKs: events, ads, saves
js/world.js     sky shader, cloud sea, floating islands, balloons, lighting
js/fx.js        GPU particles (smoke, sparks, nitro, confetti)
js/main.js      race flow, camera, HUD, menus, garage, full screen and landscape handling
js/input.js     keyboard / touch / gamepad
js/audio.js     synthesized engine, effects and music
tools/package.mjs  builds the portal zips
```

The scripts are plain `<script>` files rather than ES modules, so the page works from `file://`. Each file wraps itself in a function and shares its exports on `window.SD`. `index.html` loads them in dependency order, after `vendor/three.min.js` (a classic-script build of three.js that sets `window.THREE`).

On the ground, the car's position is stored as distance along the track plus sideways offset. That keeps loops and corkscrews stable. At a ramp, a sharp crest, or the road edge, it switches to free 3D flight. Landings are graded by how well the car's wheels and nose line up with the road.

The Baloo 2 font is bundled in `fonts/` under the SIL Open Font License (`fonts/OFL.txt`).
