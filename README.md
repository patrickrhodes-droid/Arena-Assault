# Arena Assault

Arena Assault is a browser-based multiplayer shooter built with `Three.js`, `Express`, and `Socket.IO`. Play co-op wave survival against enemy AI, or jump into two competitive PvP modes — **Gun Game** and **Free For All** — with up to 4 players on a local network.

## How to run

1. Install dependencies if needed:

```bash
npm install
```

2. Start the game server:

```bash
npm start
```
or double-click **Startserver.bat** on Windows.

3. Open the game in your browser at `http://localhost:3001`.

To test multiplayer locally, open multiple browser tabs against the same server.

## Desktop build (Electron)

The game ships as a standalone Windows desktop app. The Electron wrapper spawns `server.js` in an isolated child process and opens a native window — no browser required.

```bash
npm run electron        # run in dev (live edits reflected on Ctrl+R)
npm run dist            # build a Windows NSIS installer → ./dist/
npm run dist:mac        # macOS .dmg
npm run dist:linux      # Linux AppImage
```

- **Dynamic port** — the wrapper tries port 3001 first, then falls back to any OS-free port, so two instances on the same machine never conflict.
- **Child process isolation** — the server runs in `utilityProcess.fork()`. A server crash shows an error dialog rather than killing the app window.
- **Persistent data** — leaderboard and career stats are stored in the user's Electron `userData` folder, surviving app updates and avoiding Program Files permission issues.
- **No rebuild needed** — `npm run electron` reads live from `public/`. Edit a file and press **Ctrl+R** in the window to reload.

## Editors

### Map editor

```bash
npm run editor          # starts on port 3002
```

Open `http://localhost:3002` (or double-click **starteditor.bat** on Windows). The game server does not need to be running.

See [MAP_EDITOR.md](MAP_EDITOR.md) for the full editing workflow.

### Character & weapon editor

```bash
npm run editor          # start the editor server if not already running
```

Open `http://localhost:3002/editor/character.html` (or double-click **startchareditor.bat**).

- **Character tab** — select any operator and transform individual body parts. Walk animation preview available.
- **Weapon tab** — switch between FPS and 3P views, adjust positions and scales, fine-tune GLB model transform offsets.
- Click **Save** to write `public/assets/characterConfig.json`; the game loads it automatically on next launch.

**Key editor features:**
- Load and edit `arena`, `desert`, `city`, `blacksite`, and `sandbox` (or any custom map)
- Add, move, rotate, and resize: **boxes**, **props** (GLB models), **destructible barrels**, **ladders**, and **spawn zones**
- Set collision box size independently from model scale for props
- Object list with type filter and count
- Show/hide collision AABB overlays
- Save As to create copies before experimenting

Maps are stored as JSON in `public/maps/`. Saving in the editor is immediately reflected in the game — no server restart required.

## Connecting over a local network

Arena Assault uses **automatic LAN discovery** — no IP address sharing required.

1. Everyone launches the app (or opens `http://localhost:3001` in a browser).
2. The **CONNECT** screen lists all active games found on the local network automatically.
3. Click **JOIN** to enter someone else's room, or **PLAY HERE** to host a new game.

Hosts see a **Share** line with their local IP and port for players who need to connect from a different subnet or via browser.

Discovery uses a UDP broadcast on port 45678. If your firewall blocks it, games won't appear in the list — allow the app through Windows Firewall when prompted.

## Lobby flow

The lobby uses three screens:

1. **CONNECT** — LAN discovery screen. Lists active games on the network. Click **JOIN** to enter a room or **PLAY HERE** to host.
2. **OPERATOR** — Enter a name. A live player list and chat box are shown. Click **READY UP** when set. **← BACK** (or **B** on controller) returns to the LAN list. The server rejects duplicate names — you'll see an error if your name is already taken.
3. **MODE & MAP** — The host picks a game mode (Campaign / Endless / Gun Game / Free For All) and, for non-campaign modes, selects a map. All players see the selection update in real-time. Host clicks **START MISSION** (co-op), **START GUN GAME**, or **START FREE FOR ALL**. PvP modes require 2+ players.

**Host controls** (bottom of the map screen): Start at Wave, Invincibility, Room Password, Copy Join Link.

A **⚙ SETTINGS** button is available on every lobby screen.

## Maps

| Map | Theme | Description |
|---|---|---|
| **Combat Arena** | Industrial | The original 144 × 144 unit arena with metal staircases, crate clusters, bunkers, and 4 double-height sniper towers. Night sky with teal accent lighting. |
| **Dust Bowl** | Desert | Sandy, open layout with ruined archways, stone pillars, oasis compounds, low sand-dune ridges, and two stepped-pyramid sniper platforms. Warm amber sky. |
| **Downtown** | City (Day) | Tight urban grid with four large climbable buildings, a central plaza, jersey barriers, alleyways, and dumpsters. Bright sunlit skyline. |
| **Blacksite** | Indoor | Abandoned research compound. A cross-shaped ground floor with a central atrium, four long corridors, and four large corner rooms. Second floor features catwalks and a raised central observation deck. |

All maps are stored as JSON files in `public/maps/` and loaded by both the game and the editor. HDR sky textures (`.hdr`) are loaded per map for Arena, Desert, and City.

### Blacksite navigation

- **Ground floor** — central atrium connects to four corridors (N/S/E/W). Each corridor leads to a large open wing.
- **Catwalks** — approach the base of any catwalk pillar and press **W** while facing it to climb.
- **Observation deck** — a raised central platform in the atrium with a ladder on its north face.
- **Explosive barrels** — red barrels and gas cans scattered throughout the corridors detonate when shot.

Selecting a map in the lobby rebuilds the 3D background in real time so you can preview it before starting.

## Controls

### Keyboard & Mouse

| Key | Action |
|---|---|
| W A S D | Move |
| Space | Jump |
| Shift + W | Sprint (hold) |
| Double-tap W | Sprint toggle |
| Ctrl | Crouch (toggle) |
| W / S on a ladder | Climb up / down |
| 1 / 2 / 3 / 4 / 5 / 6 / 7 | Select weapon slot (co-op) |
| Q | Cycle weapon (co-op) |
| Mouse | Aim |
| Left click | Fire / use equipped weapon |
| Right click | Aim down sights |
| R | Reload |
| G | Fire / release grappling hook |
| E | Pick up weapon drop / Hold to revive downed teammate |
| Esc | Pause |

### Xbox / XInput controller

Full controller support — no mouse or keyboard required once the game is launched. Plugging in a controller auto-fills the player name with "Operator" if the name field is empty.

| Button | Action |
|---|---|
| Left Stick | Move |
| L3 (click in) / double-tap forward | Sprint toggle |
| Right Stick | Look / aim camera |
| R3 (click in) | Grapple |
| RT | Fire |
| LT | Aim Down Sights (camera sensitivity halved while held) |
| A | Jump |
| B (hold) | Pick up weapon / Hold to revive |
| X | Reload |
| Y | Crouch toggle |
| LB | Cycle weapon backwards |
| RB | Cycle weapon forwards |
| Start | Pause / Resume settings menu |
| D-pad / Left Stick | Navigate menus (up+left = back, down+right = forward) |
| A | Confirm / activate focused element |
| B | Back / resume when paused — also returns to the LAN list from the operator screen |

## Weapons

| Slot | Name | Damage | Notes |
|---|---|---|---|
| 1 | Service Pistol | 150 | Semi-auto, fast fire rate, always available |
| 2 | Assault Rifle | 30 per bullet | Full-auto, 60-round mag |
| 3 | Shotgun | 144 per pellet (×8) | High close-range burst; damage falls off to 16 min at range |
| 4 | Sniper Rifle | 500 | Slow fire, heavy ADS zoom |
| 5 | Tactical Blade | 500 (melee) | One-hit kills in PvP; vs boss: **750 per swing (1.5× bonus)** |
| 6 | Bazooka | 1000 direct / 800 splash | 4-round mag, 6-unit splash radius, slow projectile |
| 7 | Grapple Hook | 300 | Pulls you to walls or cover; drags non-boss enemies to you; in PvP pulls target players toward you |

ADS reduces all weapon recoil to 25% (does not apply to the Bazooka).

In **Campaign mode** you start with only the Pistol. Each of the first 7 waves drops a weapon pickup over the last enemy's corpse — walk over it and press **E** to add it to your arsenal. **Weapon drops remain on the map** until all players have collected them. **Collected weapons carry over** between maps.

## Game modes (Co-op)

### Campaign

**Story** — full narrative told through JRPG-style cutscenes before each map:

| Map | Chapter | Story |
|---|---|---|
| Arena | Chapter 1 | Iestyn and Patrick investigate a locked-down training facility |
| Desert | Chapter 2 | After clearing the Arena they meet Will and Matt; together they push to a research outpost |
| City | Chapter 3 | A broadcast signal draws the squad to a fallen city |
| Blacksite | Chapter 4 | The signal leads to the original abandoned compound where it all began |

Between each map a **between-map operator select screen** lets you choose who you deploy as. Will and Matt unlock after clearing Chapter 1.

**In-game squad banter** — during active waves, the squad comments on the action. Only unlocked characters speak.

- Fixed 7-wave structure per map, then auto-progression: **Arena → Dust Bowl → Downtown → Blacksite** (loops).
- Enemy escalation every two waves:
  - Waves 1–2: Skeletons only
  - Waves 3–4: Skeletons + Soldiers
  - Waves 5–6: Skeletons + Soldiers + Dogs
  - Wave 7: Titan Brute boss
- **Weapon drops** — last enemy of each wave drops a specific pickup.
  - Wave 1 → Assault Rifle · Wave 2 → Shotgun · Wave 3 → Sniper · Wave 4 → Sword · Wave 5 → Grapple · Wave 6 → Bazooka · Wave 7 → Pistol

### Endless

- Waves continue indefinitely; boss spawns every 5th wave.
- Dogs appear from wave 3, soldiers from wave 6.
- All weapons are available from the start.

## PvP modes

### Gun Game

- Every **1 kill** automatically advances you to the next weapon.
- Progression: Pistol → Assault Rifle → Shotgun → Sniper → Sword → Bazooka → **Grapple Hook**.
- First player to reach the Grapple Hook and score **1 grapple kill** wins.
- On death: player falls, screen fades to black, then fades back at the corner furthest from any living player.

### Free For All

- All weapons available from the start — full inventory bar shown at all times.
- Host chooses match duration: **3 min**, **5 min**, or **10 min**.
- Most kills when time runs out wins.
- Countdown timer and current rank (`#1`, `#2`) displayed top-left.

### PvP Grapple mechanics

Firing the Grapple Hook at another player deals **300 damage** and applies a strong pull force yanking them toward you.

## Enemies (Co-op)

| Type | Appears | Behaviour |
|---|---|---|
| Skeleton | Wave 1+ | 1 HP, fast melee rusher. Keeps a small standoff gap (1.7 u) rather than stacking on the player. |
| Dog | Wave 3+ (Endless) / Wave 5+ (Campaign) | Fast melee rush. Maintains 1.8 u standoff gap. |
| Soldier | Wave 6+ (Endless) / Wave 3+ (Campaign) | Ranged kiter. HP and fire rate scale with wave. |
| **Titan Scout** (mini-boss) | **Wave 8+ (Endless) / Dust Bowl onwards (Campaign)** | Half-size Titan Brute. 15% faster (13.8 u/s). 40% of boss damage. HP ≈ 6× a wave-scaled soldier. **All weapons deal full damage.** Rare: 8% chance per slot, max 2 per wave. Drops 750 score and 75 XP. Always appears on guaranteed waves (wave 8 Endless; wave 1 of each post-Arena Campaign map). |
| Titan Brute (boss) | Every 5th wave (Endless) / Wave 7 (Campaign) | Large melee boss with club attack. Phase 1 (full HP): 12 u/s, 1.1 s attack cooldown. Phase 2 (≤ 33% HP): glows orange-red, 18.6 u/s, 0.65 s cooldown. Telegraphed wind-up, heavy knockback, jump-escape when player is elevated. **Body-slam during jump** deals 75% melee damage. Multiple bosses from wave 10 onward (Endless). Only Pistol, Sword, Grapple, and Bazooka damage the Titan Brute. **Sword deals 1.5× damage.** |

## Wave system

- Waves start automatically after a short countdown.
- Wave announcements show the current wave number and enemy type warnings (suppressed in Campaign mode).
- An enemy ping alert pulses on the minimap after 60 seconds if enemies remain.
- A progress bar and enemy count ("N LEFT") track wave completion in real time.

## Audio

All sound effects use a lazy-loaded buffer cache (first play fetches, subsequent plays are instant):

| Event | Sound |
|---|---|
| Footstep (Arena/City) | `footstep_concrete` |
| Footstep (Desert) | `footstep_grass` |
| Footstep (Blacksite) | `footstep_carpet` |
| Soft landing | `impactGeneric_light` |
| Hard landing | `impactMetal_heavy` |
| Bullet hits wall | `impactMetal_medium` |
| Bullet hits enemy | `impactSoft_medium` |
| Bullet hits boss | `impactPlate_heavy` |
| Sword connects | `impactPlank_medium` |
| Dog punch on player | `impactPunch_heavy` |
| Skeleton punch on player | `impactPunch_medium` |
| Prop destroyed | `impactWood_heavy` |
| Boss footstep (charging) | `impactMining` |
| Grapple hook lands | `impactMetal_heavy` |
| Kill confirmed | `impactBell_heavy` |
| Weapon pickup | `impactTin_medium` |
| Health pack pickup | `impactGeneric_light` |
| Empty mag dry-fire | `impactMetal_light` |
| UI button click | `click1–5` (random) |
| UI hover | `rollover1–6` (random) |
| Ready Up / confirm | `mouseclick1` |
| Toggle / slider change | `switch1–10` (random) |

Background music uses HTML5 `<audio>` elements (intro + looping track per map/mode).

## Character system

Four playable operators, each with a unique 3D head model:

| Name | Colour | Unlocked |
|---|---|---|
| Iestyn | Red / coral | Always |
| Patrick | Blue | Always |
| Will | Green | After completing the Arena map in Campaign |
| Matt | Yellow / amber | After completing the Arena map in Campaign |

Each character card shows a live animated 3D head — idle bob when unselected, full 360° spin when selected.

## Multiplayer

- The **server drives wave spawning, damage validation, and health packs**. Enemy AI runs on the host client and syncs to others at 20 Hz.
- The first player to connect becomes the **lobby leader** — controls mode/map selection and match start.
- **Revive system**: downed players can be revived by teammates holding `E` nearby (45 s timeout before forced spectate).
- **Nametags** appear above each remote player's head.
- **Teammate status panel** shows each teammate's HP bar.
- **Spectator mode**: eliminated co-op players spectate until the next wave.
- **Remote animations**: walk cycles, crouch, sword swings, and weapon changes are synced in real-time.
- **Bullet visibility**: shots from remote players are visible as tracers on all clients.
- **Rankings screen** shows final stats for all players at game over.
- **Pause**: when all alive players pause simultaneously, enemy AI freezes.
- **Mid-match refresh**: if a player refreshes their browser, they automatically rejoin within 60 seconds with wave, HP, weapon, and character restored.

## HUD

- Health bar with PvP kill counter and rank indicator.
- Ammo counter and weapon name.
- Boss HP bar with **phase label** and combined percentage for multiple bosses.
- ADS scope overlays (sniper scope, red-dot for pistol/assault).
- **Wave enemy bar** — thin progress bar + "N LEFT" count below the wave number.
- **Score pop-ups** — "+100" floats up from the crosshair on each kill, gold for bosses.
- **Damage direction indicator** — red arc at the screen edge points toward the damage source.
- **Hit marker** — crosshair dot flashes white → orange when a shot connects.
- **Minimap** (bottom-left): full arena coverage, obstacles, colour-coded enemies, remote players.
- **Weapon pickup prompt** — "Press E to pick up ASSAULT" when near a weapon drop.
- **Weapon unlock popup** pulses on screen when PvP weapon advances.
- **Ping display** — live ms counter in top-right, colour-coded green/amber/red.

## Pause menu / Settings

Press **Esc** (or **Start** on controller) in-game to pause. Four collapsible sections:

- **Controls** — Mouse sensitivity and Controller sensitivity sliders (persist in `localStorage`). Full keyboard and Xbox controller reference.
- **Audio** — Master, Music, and SFX volume sliders (0–100%, persist in `localStorage`).
- **Graphics** — Shadows toggle and Particles toggle.
- **HUD** — Crosshair style selector and Damage Numbers toggle.

The same panel is reachable from the lobby via the **⚙ SETTINGS** button on any lobby screen.

## Leaderboard

Saved to `leaderboard.json` (or the Electron `userData` folder when packaged) and updated after every session. Click **ALL-TIME LEADERBOARD** on the game-over screen to fetch and display the top 20 COOP scores.

## Gameplay tuning reference

### Shared constants

`public/src/gameConstants.js` is the single source of truth for constants shared between client and server.

### Player stats and movement

| What | Current value | Where to change it |
|---|---:|---|
| Base player max HP | 1000 | `public/src/gameConstants.js` → `P_MAX_HP` |
| Co-op HP scaling | `round(P_MAX_HP / playerCount)` | `server.js` inside `socket.on('startMatch')` |
| Base walk speed | 6 | `public/src/config.js` → `PLAYER_MOVEMENT.walkSpeed` |
| Sprint multiplier | 2.9 | `public/src/config.js` → `PLAYER_MOVEMENT.sprintMultiplier` |
| Crouch speed | 2.7 | `public/src/config.js` → `PLAYER_MOVEMENT.crouchSpeed` |
| Jump velocity | 11.2 | `public/src/gameConstants.js` → `JUMP_VEL` |
| Gravity | 20 | `public/src/gameConstants.js` → `GRAV` |
| Grapple pull speed | 60 | `public/src/config.js` → `GRAPPLE_TUNING.pullSpeed` |
| Revive range | 2.8 | `public/src/config.js` → `REVIVE_TUNING.range` |
| Revive hold time | 3.0 s | `public/src/config.js` → `REVIVE_TUNING.holdTime` |
| Health pack heal amount | 150 | `public/src/network.js` in `healthPackRemoved` |

### Weapon stats

All player weapon stats live in `public/src/config.js` under `WEAPON_DEFS`.

| Weapon | Mag | Fire rate | Reload | Damage | Extra notes |
|---|---:|---:|---:|---:|---|
| Pistol | 14 | 0.3 s | 1.2 s | 150 | Bullet speed 96 |
| Assault rifle | 60 | 0.05 s | 1.6 s | 30 | Bullet speed 90 |
| Shotgun | 8 | 0.72 s | 2.2 s | 144 per pellet | 8 pellets, falls to 16 min at range |
| Sniper | 5 | 1.15 s | 2.6 s | 500 | Bullet speed 160 |
| Sword | 1 | 0.4 s | 0.1 s | 500 | Range 4.5, arc 1.2; 1.5× vs boss |
| Bazooka | 4 | 1.8 s | 3.2 s | 1000 direct / 800 splash | 6-unit splash radius; bullet speed 55 |
| Grapple | — | 0.3 s | — | 300 | Pulls you to geometry; drags non-boss enemies; pulls PvP players |

### PvP settings

| What | Current value | Where to change it |
|---|---:|---|
| Kills to advance weapon | 1 | `public/src/gameConstants.js` → `PVP_KILLS_PER_WEAPON` |
| Gun Game win condition | 1 grapple kill | `server.js` in `resolvePvPKill()` |
| FFA match durations | 3 / 5 / 10 min | `public/src/config.js` → `FFA_DURATIONS` |
| FFA grapple pull force | 260 | `public/src/network.js` → `pvpGrapplePull` handler |

### Campaign settings

| What | Current value | Where to change it |
|---|---:|---|
| Max campaign waves per map | 7 | `server.js` → `CAMPAIGN_MAX_WAVE` |
| Campaign map order | arena→desert→city→blacksite | `server.js` → `CAMPAIGN_MAP_ORDER` |
| Wave weapon drops | wave 1=assault … wave 7=pistol | `server.js` → `CAMPAIGN_WAVE_WEAPON_DROP` |

### Enemy stats

#### Skeleton

| Stat | Current value |
|---|---:|
| HP | 1 |
| Speed | `9 + random * 2.5` |
| Melee damage | `8 + wave` |
| Standoff distance | 1.7 u |

#### Dog

| Stat | Current value |
|---|---:|
| HP | `round((46 + wave * 10) * 1.1^wave)` |
| Speed | `8 + random * 2 + wave * 0.3` |
| Melee damage | `12 + wave * 2` |
| Standoff distance | 1.8 u |

#### Soldier

| Stat | Current value |
|---|---:|
| HP | `round((58 + wave * 12) * 1.1^wave)` |
| Speed | `3.5 + random * 1.5 + wave * 0.2` |
| Fire interval | `max(0.8, 2.2 - wave * 0.1) + random * 0.4` |
| Bullet damage | 25 |

#### Titan Scout (mini-boss)

| Stat | Current value |
|---|---:|
| HP | `round(6 * (58 + wave * 12) * 1.1^wave)` |
| Move speed | 13.8 |
| Melee damage | `round((100 + wave * 10) * 0.4)` |
| Attack reach | 4.5 |
| Spawn chance | 8% per enemy slot (wave 8+, max 2) |

#### Titan Brute (boss)

| Stat | Current value |
|---|---:|
| HP | `round(2700 * 1.1^wave * hpMult)` |
| Phase 2 trigger | HP ≤ `maxHp / 3` |
| Move speed | 12 (P1) / 18.6 (P2) |
| Melee damage | `100 + wave * 10` |
| Attack reach | 7.8 |
| Attack frequency | 1.1 s (P1) / 0.65 s (P2) |

### Wave and spawn pacing

| What | Current value | Where to change it |
|---|---:|---|
| Inter-wave wait time | 2.5 s | `server.js` in `finishWave()` |
| Standard enemies per wave | `min(1 + wave, 12)` | `server.js` in `tickWave()` |
| Max live enemies | 35 | `server.js` → `MAX_LIVE_ENEMIES` |

### Health pack and score values

| What | Current value | Where to change it |
|---|---:|---|
| Health pack drop chance | 10% | `server.js` in `killEnemy()` |
| Health restored per pack | 150 | `public/src/network.js` in `healthPackRemoved` |
| Skeleton score | 25 | `server.js` in `killEnemy()` |
| Dog score | 150 | `server.js` in `killEnemy()` |
| Soldier score | 100 | `server.js` in `killEnemy()` |
| Titan Scout score | 750 | `server.js` in `killEnemy()` |
| Boss score | 2500 | `server.js` in `killEnemy()` |

## Project structure

```text
Arena Assault/
├── public/
│   ├── index.html              # Lobby UI and game markup
│   ├── styles/
│   │   └── main.css            # All UI styling
│   ├── maps/                   # Editable JSON map files (source of truth)
│   │   ├── arena.json
│   │   ├── desert.json
│   │   ├── city.json
│   │   ├── blacksite.json
│   │   └── sandbox.json
│   ├── assets/
│   │   ├── models/             # GLB weapon, character, and prop models
│   │   ├── Images/             # Background images and bullet-holes texture
│   │   ├── Skies/              # HDR sky textures (arenasky, Citysky, desertsky)
│   │   ├── SFX/                # Impact and footstep sound effects (OGG)
│   │   ├── UISFX/              # UI click, hover, and switch sounds (OGG)
│   │   └── Background music/   # Per-map intro + loop tracks (MP3)
│   ├── editor/                 # Map editor UI (served by map-editor-server.js)
│   └── src/
│       ├── main.js             # App bootstrap and main game loop
│       ├── config.js           # Constants, weapon defs, map defs, character defs
│       ├── gameConstants.js    # Shared constants (also imported by server.js)
│       ├── state.js            # Mutable runtime state shared across modules
│       ├── utils.js            # Small reusable helpers
│       ├── audio.js            # Web Audio synth + file-based SFX with buffer cache
│       ├── scene.js            # Three.js scene setup, HDR sky loading, map init
│       ├── mapLoader.js        # Fetches map JSON and builds Three.js scene from it
│       ├── collision.js        # Collision helpers
│       ├── combat.js           # Weapons, bullets, decals, particles, pickups
│       ├── enemies.js          # Enemy rendering, wave UI, boss AI, sword hit
│       ├── player.js           # Input, movement, camera, footsteps, networking sync
│       ├── network.js          # Socket.IO client events
│       ├── gamepad.js          # Xbox / XInput controller support
│       ├── banter.js           # In-game squad dialogue system
│       ├── story.js            # Campaign cutscenes and character select
│       ├── features.js         # Career stats, combos, kill tracking
│       └── ui.js               # HUD, lobby screens, minimap, rankings
├── server.js                   # Express + Socket.IO server — waves, damage, health packs
├── electron-main.cjs           # Electron entry point (CJS; spawns server.js as child process)
├── map-editor-server.js        # Separate Express server for the map editor (port 3002)
├── scripts/
│   └── export-maps.mjs         # One-time tool: regenerates JSON maps from source geometry
├── MAP_EDITOR.md               # Full map editor workflow documentation
├── plan.md                     # Development roadmap and TODO list
├── Startserver.bat             # Windows quick-launch for the game server
└── package.json
```
