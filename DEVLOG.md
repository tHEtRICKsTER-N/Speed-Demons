# Speed Demons: devlog

Newest first. Each entry says what changed, why, and how it was checked. The roadmap is in [PLAN.md](PLAN.md).

---

## 2026-09-26: World expansion and visual upgrade (M4)

**Worlds and weather**
- Three new worlds with their own scenery: **Desert Canyon** (striped mesas, rock spires, cacti, dust), **Frozen Peaks** (snow-capped mountains, frosted pines, ice spikes, floating icebergs) and **Volcano Core** (flowing lava sea, smoking volcanoes with glowing craters, basalt columns, glowing rock islands). `js/world.js` became an environment framework: each theme picks its ground and scenery.
- 9 new tracks (21 in total), rival pace 1.03 to 1.15, and rival cars per world.
- Weather (`js/weather.js`, GPU particles wrapped around the camera): rain, thunderstorm with lightning and thunder, snow, sugar snow, sandstorm, embers, ash, mist. Each type also pulls the fog in and dims the light. Rain makes the road dark and glossy.
- Old tracks got weather too: mist on Island Dash, rain on Twilight Twister and Laser Loop, sugar snow on Sugar Rush, a storm on Demon's Drop.

**Obstacles** (`js/obstacles.js`, all in road space)
- Seven types: cones (knocked flying), barriers (crash), swinging hammers (crash and knock sideways), sliding blocks and spinning bars (shove), oil and ice slicks (steering goes loose), bounce pads (launch into the air).
- Every later track of worlds 2 to 4 gained one obstacle section; world 1 stays clean.
- Rivals plan a lane round static obstacles one cluster at a time, and predict moving ones: they try full speed, then easing off, to find a line that's clear while the whole car passes. About one time in five a rival is careless and can get wiped out.

**Cars and looks**
- Four new cars (10 in total): Zippy (go-kart), Dust Devil (rally, grips on oil and ice), Hot Rod (dragster with big rear slicks), Comet (rocket car, new top car). Each has its own engine sound.
- Sky reflections on paint, coins and wet roads (a PMREM environment map baked from the sky), a sun glow, head and tail light glows (tail lights flare when braking), chevron boards before sharp turns, lamp posts on dark tracks.

**Problems found and fixed while testing**
- Two barrier layouts left a gap 5 cm narrower than a car, so every car hit them. They were redesigned as slaloms with at least 2.6 m of room, and the check now fails any barrier that leaves less.
- Rivals wiped out on spinners almost every pass:
  - The spinner's bar reached the road edge, so the only way through was timing. It now stops short, leaving a narrow edge lane that's always safe.
  - Its hit zone was wider than the bar itself.
  - The dodge prediction treated the car as a point. It now sweeps the whole car through.
- The dodge planner assumed constant speed, so it kept predicting the same blocked moment and crawled. It now also tries arriving later.
- A hammer hit's sideways knock (4.4 m) usually threw you off the track as well, which was too harsh. It's now about 3 m.
- The new tracks had few coins (Eruption had none). Coin trails were added on every jump run-up.

**Checked**
- New `tools/check.mjs`, one command for the whole sanity check. Latest full run: 50/50, then 32/32 with the portal checks.
  - geometry of all 21 tracks
  - every track by autopilot, with no bad falls and no console errors
  - missed-jump and edge falls, respawn blinking
  - garage buy and upgrade, daily streak
  - a phone race with forced landscape
  - with `--portals`: the Poki and CrazyGames SDKs, including a rewarded ad
- Screenshots of all worlds, every obstacle up close, all 10 cars, and phone layouts of the garage, tracks and a race.
- **Difficulty:** the new worlds beat a starting car with no upgrades, but are won comfortably with an upgraded mid-price car (Hot Rod led by 51 to 166 m).

## 2026-09-26: Store image renderer

- `tools/store-assets.mjs` renders the portal images from the game in headless Chrome into `dist/store/`: CrazyGames covers (1920x1080, 800x1200, 800x800, title only) and the Poki square (1256x1256, no text).
- The `?debug` hook gained a free camera (`S.freeCam`) for staged shots.
- **Not done:** the hero shot is framed from below the car, so it shows the dark underside. It needs the camera above and behind. Preview videos aren't written yet.

## 2026-09-26: Retention and race feel (M3)

- Daily reward: 7-day streak (100 to 1,000 coins), restarts if you skip a day, optional video for double. A gift button on the title opens it, so *Race* stays one click.
- Garage: free coins for a video (5 min cooldown), one-race test drive of cars you don't own.
- Overtake callouts, close-pass bonus (pass within about 3.3 m without touching), white flash and slow-mo on clean multi-trick landings.
- Each car has its own engine note.
- **Fixed:** the logo's drop-shadow filter painted over the gift button and swallowed clicks.
- **Checked:** all 12 tracks by autopilot; daily streak logic (same day, next day, skipped day, wrap after day 7); free coins and test drive with CrazyGames test ads; the Poki flow.

## 2026-09-26: Falls, respawns and collisions

- A missed jump or a drive off an open edge now falls past the ramp and tumbles away (no snapping onto the lip), then respawns at the last checkpoint after 1.4 s instead of up to 9 s. The camera holds still to watch the drop.
- After a respawn the car blinks for 2 s and can't be bumped (1.2 s after a crash).
- **Fixed:** an old edge glitch where driving off the side re-landed the car on the next frame and snapped it 1.4 m inward, like an invisible wall.
- **Fixed:** rival bumps could push you off an open edge; rivals drove through each other.
- **Checked:** a geometry audit of all 12 tracks (no crossing sections, no pillars through roads, coins on the road), screenshots of every track and car, pause/restart/quit flows.

## 2026-09-25: Portals, economy, 12 tracks (M2)

- Poki and CrazyGames integration (`js/platform.js`): loading and gameplay events, midgame ads between races, rewarded *Double coins*, mute and input lock during ads, CrazyGames data-module saves. Without an SDK (own site, ad blockers) everything still works.
- `tools/package.mjs` builds the upload zips (about 310 KB each).
- Coins replace star pickups; coins also come from stunts, place and new stars. Garage with 6 cars and 4 upgrades each. Save format v2 migrates old saves.
- 12 tracks in 4 worlds, one click from title to race, one-tap full screen on phones, full screen hidden on portals (CrazyGames rule).
- Font bundled (portals allow no external requests); arrow and space keys never scroll the host page.
- **Checked:** autopilot on all tracks, both SDKs in local test mode, phone layouts.

## 2026-09-25: Speed Demons (M1)

- Renamed from Stunt Rush. Converted ES modules to plain scripts and three.js to a classic build so `index.html` runs from disk (browsers block modules and the manifest on `file://`).
- Full screen button (title, pause, <kbd>F</kbd>), iPhone *Add to Home Screen* help, forced landscape on phones held upright.
- Pushed to GitHub (`tHEtRICKsTER-N/Speed-Demons`).
