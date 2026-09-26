# Speed Demons: plan

The roadmap for Speed Demons, a 3D arcade stunt racer for PC and phone browsers, published on Poki and CrazyGames with ads.

The goal is to be the best arcade stunt racer on the web. The core mode always stays: race rivals, pull stunts, collect coins and stars.

**How to use this file:** it's the single list of what's done, in progress and planned. Tick items as they land and add a dated entry to [DEVLOG.md](DEVLOG.md) describing what changed and how it was checked. New ideas go under [Later](#later).

Legend: `[x]` done · `[~]` in progress · `[ ]` planned

---

## M1: Playable game (done)

- [x] Stunt racing on a sampled 3D track ribbon: ramps, jumps, loops, corkscrews, walls, boost pads, stunt rings
- [x] Flips, spins and barrel rolls with combos, graded landings, crashes
- [x] Rival AI drivers with rubber banding, checkpoints, results
- [x] Runs from `file://` (plain scripts, classic three.js build) and over HTTP
- [x] PC and phone: touch controls, auto-gas, forced landscape, full screen (own site)

## M2: Portals and economy (done)

- [x] Poki and CrazyGames SDKs (`js/platform.js`): events, midgame and rewarded ads, mute/pause during ads, cloud saves
- [x] Upload zips per portal (`tools/package.mjs`)
- [x] Coins as the only currency, garage with cars and 4 upgrades, 12 tracks in 4 worlds
- [x] Missed jumps fall through, blinking respawn, collision fixes

## M3: Retention and race feel (done)

- [x] Daily reward streak, rewarded free coins (cooldown), rewarded test drive
- [x] Overtake callouts, close-pass bonus, slipstream, slow-mo on perfect landings
- [x] Per-car engine sounds

## M4: World expansion and visual upgrade (done)

**Environments.** The first four worlds are all sky islands above clouds.

- [x] Environment framework in `js/world.js`: each theme picks a ground and scenery set
- [x] **Desert Canyon:** sand floor, layered mesas, rock spires, cacti
- [x] **Frozen Peaks:** snow floor, snow-capped mountains, frosted pines, ice
- [x] **Volcano Core:** animated lava sea, volcano cones with glowing craters, basalt columns
- [x] 9 new tracks (3 per new world); rivals' cars and pace per world

**Weather** (`js/weather.js`, GPU particles that follow the camera).

- [x] Rain with lightning and thunder, and a wet reflective road
- [x] Snow, pink "sugar snow" in Candy Clouds, sandstorm, volcanic embers and ash, mist
- [x] A weather setting per track, mixed across the old worlds too

**Obstacles** (in the track builder, physics and AI).

- [x] Traffic cones: knocked flying, small slowdown
- [x] Barrier blocks: static, crash if hit
- [x] Swinging hammers: pendulums over the road, crash and knock you sideways
- [x] Sliding blocks: move side to side, shove you
- [x] Spinning bars: rotating arm at road level, time your pass
- [x] Oil and ice slicks: brief loss of grip
- [x] Bounce pads: launch you into the air for extra stunts
- [x] Rivals dodge static obstacles and can get wrecked by moving ones
- [x] Obstacles in the new tracks, lightly in the later old tracks (world 1 stays clean)

**Cars** (4 new, 10 total).

- [x] Zippy (go-kart), Dust Devil (rally car), Hot Rod (dragster), Comet (rocket car)
- [x] Their engine sounds, prices, and rivals' line-ups per world

**Visual detail.**

- [x] Sky reflections on cars, coins and rings (environment map from the sky)
- [x] Sun glow, headlight and tail-light glows
- [x] Chevron warning signs before sharp turns
- [x] Lamp posts and glowing edge strips on dark tracks
- [x] Wet-road sheen in rain

**Check.**

- [x] Sanity check: all tracks by autopilot, geometry audit, obstacles avoidable, portal flows, phone layout, screenshots of every world

## M5: Store and launch

- [ ] Tune the cover shot in `tools/store-assets.mjs` (camera above and behind, lit side of the car)
- [ ] CrazyGames preview videos: 15-20 s, 1080p landscape and portrait (2:3), starting on the cover
- [ ] Poki animated thumbnail
- [ ] Submit to Poki (web fit test) and CrazyGames (basic launch, then full launch)

## Later

- [ ] Translations (CrazyGames passes the player's language)
- [ ] Time trial against your own ghost
- [ ] Missions and achievements
- [ ] Online multiplayer (needs a server; CrazyGames has multiplayer requirements)
- [ ] Leaderboards
- [ ] Skid marks, camera modes, photo mode
- [ ] More environments (tropical ocean, city at night), more weather (blizzard whiteout), day-night cycle
- [ ] More obstacles: crushers, moving platforms, lava geysers

## Known issues and notes

- Tested in headless Chrome (desktop and emulated phone), not yet on a real iPhone or Android device.
- iPhone Safari can't go full screen from a web page; the game explains *Add to Home Screen* instead.
- Portal ads are verified only in the SDKs' local test modes.

## Sanity check procedure

Before every release:

1. `node tools/check.mjs --portals --shots`. It covers:
   - a geometry audit: roads, pillars, coins, obstacle placement and barrier gaps
   - every track by autopilot
   - missed-jump and edge falls, the garage, the daily reward, and a phone race
   - both portal SDKs
2. Look through the screenshots in `dist/check/`.
3. Play a race or two by hand on PC and a phone.
4. `node tools/package.mjs` builds the three zips.
