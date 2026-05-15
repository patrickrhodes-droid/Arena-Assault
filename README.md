# Arena Assault

Arena Assault is a browser-based multiplayer shooter built with `Three.js`, `Express`, and `Socket.IO`. Play co-op wave survival against enemy AI, or jump into two competitive PvP modes — **Gun Game** and **Free For All** — with up to 4 players, all selectable from a clean two-screen lobby.

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

The game also ships as a standalone Windows desktop app. The Electron wrapper spawns the same `server.js` internally and points a native window at `http://localhost:3001`, so no browser is needed.

```bash
npm run electron        # run in dev (no installer — same code path as the packaged app)
npm run dist            # build a Windows NSIS installer in ./dist
npm run dist:mac        # macOS .dmg
npm run dist:linux      # Linux AppImage
```

`npm run electron` reads live from `public/` — edit a file, press **Ctrl+R** in the window, no rebuild required. `npm run dist` performs a full repackage every run; `dist/` is overwritten in place, so there's no need to delete it between builds. The Electron runtime itself is cached in `%LOCALAPPDATA%\electron-builder\Cache` and won't be re-downloaded.

Persistent data (leaderboard, career stats) is redirected to the user-writable Electron `userData` folder when running packaged, so it survives app updates and avoids Program Files ACL issues.

## Editors

### Map editor

```bash
npm run editor          # starts on port 3002
```

Open `http://localhost:3002` (or double-click **starteditor.bat** on Windows). The game server does not need to be running.

See [MAP_EDITOR.md](MAP_EDITOR.md) for the full editing workflow.

### Character & weapon editor

A visual editor for adjusting character body parts, head scale/rotation, and all first-person/third-person weapon positions.

```bash
# start the editor server if not already running
npm run editor
```

Open `http://localhost:3002/editor/character.html` (or double-click **startchareditor.bat**).

- **Character tab** — select any operator and transform individual body parts (torso, arms, legs, boots, head). Walk animation preview available.
- **Weapon tab** — switch between FPS and 3P views, adjust `fpPos`/`fpAdsPos`/`fpScale`/`tpPos`/`tpScale`, and fine-tune the GLB model's own scale, rotation, and position offset.
- Click **Save** to write `public/assets/characterConfig.json`; the game loads this file automatically on next launch and applies all overrides.

**Key editor features:**
- Load and edit `arena`, `desert`, `city`, `blacksite`, and `sandbox` (or any custom map)
- Add, move, rotate, and resize: **boxes**, **props** (GLB models), **destructible barrels**, **ladders**, and **spawn zones**
- Set collision box size independently from model scale for props
- Object list with type filter and count
- Show/hide collision AABB overlays
- Save As to create copies before experimenting
- Fullscreen mode

Maps are stored as JSON in `public/maps/`. Saving in the editor is immediately reflected in the game — no server restart required.

To regenerate the original four maps from the source geometry if needed:

```bash
node scripts/export-maps.mjs
```

## Connect over a local network

1. Start the server on the host computer.
2. Find the host's local IP (`ipconfig` on Windows). Look for an IPv4 address like `192.168.1.42`.
3. On each other device, open `http://192.168.1.42:3001`.

The server PC sees a **COPY JOIN LINK** button in the lobby that copies this address automatically.

## Lobby flow

The lobby uses two screens:

1. **OPERATOR** — Enter a name and pick your character. A live chat box lets players communicate before the match. Click **READY UP** when set. Once every player has readied, the host moves to the next screen automatically. A **← BACK** button (or **B** on controller) returns to the LAN list.
2. **MODE & MAP** — The host picks a game mode (Campaign / Endless / Gun Game / Free For All) and, for non-campaign modes, selects a map. All players see the selection update in real-time. Host clicks **START MISSION** (co-op), **START GUN GAME**, or **START FREE FOR ALL**. PvP modes require 2+ players.

**Host controls** (bottom-left of the lobby once joined): Start at Wave, Invincibility, Room Password, Copy Join Link.

A **ping indicator** (ms) is shown in the top-right of the HUD during play.

## Maps

| Map | Theme | Description |
|---|---|---|
| **Combat Arena** | Industrial | The original 144 × 144 unit arena with metal staircases, crate clusters, bunkers, and 4 double-height sniper towers. Cyan accent lighting. |
| **Dust Bowl** | Desert | Sandy, open layout with ruined archways, stone pillars, oasis compounds, low sand-dune ridges, and two stepped-pyramid sniper platforms. Warm amber lighting. |
| **Downtown** | City (Day) | Tight urban grid with four large climbable buildings, a central plaza, jersey barriers, alleyways, dumpsters, and warm combat-zone accents. Bright sunlit skyline with clear visibility. |
| **Blacksite** | Indoor | Abandoned research compound. A cross-shaped ground floor with a central atrium, four long corridors, and four large corner rooms. Second floor features four catwalks overlooking the hub plus a raised central observation deck. Tactical corridors create natural chokepoints. |

All maps are stored as JSON files in `public/maps/` and loaded by both the game and the editor. Each contains the full geometry, collision data, ladder zones, spawn points, lighting, and fog settings. Procedural canvas textures (metal panels, sandstone, asphalt, concrete brick) are applied at runtime based on the map's `theme` field.

### Blacksite navigation

- **Ground floor** — central atrium connects to four corridors (N/S/E/W). Each corridor leads to a large open wing. Wide doorways let you move freely between all areas.
- **Catwalks** — approach the base of any catwalk pillar and press **W** while facing it to climb to the elevated walkway above.
- **Observation deck** — a raised central platform in the atrium. A ladder on its north face leads to the top.
- **Explosive barrels** — red barrels and gas cans scattered throughout the corridors detonate when shot, dealing heavy AOE damage nearby.

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
| B | Back / resume when paused — also returns to the LAN list from the operator/ready-up screen |

## Weapons

| Slot | Name | Damage | Notes |
|---|---|---|---|
| 1 | Service Pistol | 150 | Semi-auto, fast fire rate, always available |
| 2 | Assault Rifle | 30 per bullet | Full-auto, 60-round mag |
| 3 | Shotgun | 72 per pellet (×8) | High close-range burst; damage falls off at range |
| 4 | Sniper Rifle | 500 | Slow fire, heavy ADS zoom |
| 5 | Tactical Blade | 500 (melee) | One-hit kills in PvP; vs boss: **750 per swing (1.5× bonus)** |
| 6 | Bazooka | 500 direct / 180 splash | 4-round mag, 6-unit splash radius, slow projectile |
| 7 | Grapple Hook | 300 | Pulls you to walls or cover; drags non-boss enemies to you; in PvP pulls target players toward you |

In **Campaign mode** you start with only the Pistol (slot 1). Each of the first 7 waves drops a weapon pickup over the last enemy's corpse — walk over it and press **E** (or hold **B** on controller) to add it to your arsenal. **Weapon drops remain on the map** until all players have collected them — every player can pick up the same drop. **Collected weapons carry over** between maps, so your full loadout persists into Dust Bowl, Downtown, and the Blacksite.

## Game modes (Co-op)

### Campaign

**Story** — Campaign features a full narrative told through JRPG-style cutscenes before each map:

| Map | Chapter | Story |
|---|---|---|
| Arena | Chapter 1 | Iestyn and Patrick investigate a locked-down training facility |
| Desert | Chapter 2 | After clearing the Arena they meet Will and Matt; together they push to a research outpost |
| City | Chapter 3 | A broadcast signal draws the squad to a fallen city |
| Blacksite | Chapter 4 | The signal leads to the original abandoned compound where it all began |

Between each map a **between-map operator select screen** lets you choose who you deploy as. Will and Matt unlock after clearing Chapter 1.

**In-game squad banter** — during active waves, the squad comments on the action: new enemy types, wave clears, boss warnings, and idle flavour lines. Only unlocked characters speak.

- Fixed 7-wave structure per map, then auto-progression to the next map in order: **Arena → Dust Bowl → Downtown → Blacksite** (loops).
- Enemy escalation each two waves:
  - Waves 1–2: Skeletons only
  - Waves 3–4: Skeletons + Soldiers
  - Waves 5–6: Skeletons + Soldiers + Dogs
  - Wave 7: Titan Brute boss
- **Weapon drops** — the last enemy of each wave drops a specific weapon pickup (floats with a glow ring). Walk within 2 m and press **E** to collect.
  - Wave 1 → Assault Rifle · Wave 2 → Shotgun · Wave 3 → Sniper · Wave 4 → Sword · Wave 5 → Grapple · Wave 6 → Bazooka · Wave 7 → Pistol
- Map selection is disabled in Campaign (maps rotate automatically).

### Endless

- Waves continue indefinitely; boss spawns every 5th wave.
- Dogs appear from wave 3, soldiers from wave 6.
- All weapons are available from the start.

## PvP modes

### Gun Game

- Every **1 kill** automatically advances you to the next weapon.
- Progression: Pistol → Assault Rifle → Shotgun → Sniper → Sword → Bazooka → **Grapple Hook**.
- Manual weapon switching is **locked** — the game decides your loadout.
- First player to reach the **Grapple Hook** and score **1 grapple kill** wins.
- On death: the player falls over with an animation, the screen fades to black, then fades back in at the corner furthest from any living player.
- Inventory bar is replaced by a compact kill counter and rank indicator next to the health bar.
- A **"SHOTGUN UNLOCKED"** style popup appears whenever your weapon progresses.

### Free For All

- All weapons are available from the start — full inventory bar shown at all times.
- The host chooses a match duration: **3 min**, **5 min**, or **10 min**.
- The player with the most kills when time runs out wins.
- A **countdown timer** and your current **rank position** (e.g. `#1`, `#2`) are displayed in the top-left corner of the screen.
- On death: same fade-and-respawn mechanic as Gun Game — respawn at the corner furthest from living players.
- **Grapple Hook** in FFA pulls the hooked player toward you (260-unit impulse) and deals 300 damage.

### PvP Grapple mechanics

In both PvP modes, firing the Grapple Hook at another player will:
1. Deal **300 damage** to the target.
2. Apply a strong pull force, yanking them toward your position.
3. Show a brief rope-and-hook visual flash on the shooter's screen.

## Enemies (Co-op)

| Type | Appears | Behaviour |
|---|---|---|
| Skeleton | Wave 1+ | 1 HP, fast melee rusher. Animated GLB model. |
| Dog | Wave 3+ (Endless) / Wave 5+ (Campaign) | Fast melee rush. Chance increases each wave up to 55% in Endless. |
| Soldier | Wave 6+ (Endless) / Wave 3+ (Campaign) | Ranged. Keeps distance, shoots at players. HP and fire rate scale with wave. |
| **Titan Scout** (mini-boss) | **Wave 8+ (Endless) / Dust Bowl onwards (Campaign)** | Half-size version of the Titan Brute. Same attack patterns but 15% faster (13.8 u/s). 40% of boss damage. HP ≈ 3× a wave-scaled soldier. **All weapons deal full damage** — no immunity like the full boss. Rare: 8% chance per enemy slot, max 1–2 per wave. Drops 750 score and 75 XP. |
| Titan Brute (boss) | Every 5th wave (Endless) / Wave 7 (Campaign) | Large melee boss with club attack. Two phases: Phase 1 (full HP) — 12 u/s speed, 1.1 s attack cooldown. Phase 2 (≤ 33% HP) — body glows orange-red, speed rises to 18.6 u/s, attack cooldown drops to 0.65 s. Phase 1 takes ~2/3 of the bar, phase 2 the last ~1/3. Telegraphed wind-up before each swing. Heavy knockback, jump-escape when stuck or when player is elevated. **Body-slam during jump**: deals 75% melee damage if the boss passes through a player while airborne. Multiple bosses from wave 10 onward (Endless only). Only the Pistol, Sword, Grapple, and Bazooka damage the Titan Brute. **Sword deals 1.5× (150%) damage to the boss.** |

The Titan Brute attack has a 7.8 unit reach and swings every 1.1 s (phase 1) or 0.65 s (phase 2). **Aiming down sights reduces all weapon recoil to 25%** (does not affect the Bazooka).

In multiplayer, non-host clients snap the boss's visual position to the authoritative attack origin when a hit arrives, preventing the "invisible attack" desync.

## Wave system

- Waves start automatically after a short countdown.
- Wave announcements show the current wave number and enemy type warnings.
- An enemy ping alert pulses on the minimap after 60 seconds if enemies are still alive.
- A progress bar and enemy count ("N LEFT") track wave completion in real time.

## Character system

Four playable operators, each with a unique 3D head model:

| Name | Colour | Unlocked |
|---|---|---|
| Iestyn | Red / coral | Always |
| Patrick | Blue | Always |
| Will | Green | After completing the Arena map in Campaign |
| Matt | Yellow / amber | After completing the Arena map in Campaign |

### Character select lobby
Each character card shows a live animated 3D head — idle bob when not selected, full 360° spin when selected. Click any card to pick that operator.

Will and Matt are unlocked through the Campaign story: after clearing the Arena boss, the Desert cutscene shows Iestyn and Patrick meeting Will and Matt, and both operators become permanently available for all game modes (stored in `localStorage`).

### Between-map character select (Campaign only)
After each map transition in Campaign, a brief story cutscene plays and then an **operator select screen** appears so you can switch characters before the next map. This is the right time to try Will or Matt after they unlock.

## Multiplayer

- The **server drives wave spawning, damage validation, and health packs**. Enemy AI (movement, pathfinding, attacks) runs on the host client and is synced to other clients at 20 Hz.
- The first player to connect becomes the **lobby leader** and controls mode/map selection and match start.
- **Revive system**: downed players can be revived by teammates holding `E` nearby (45 s timeout before forced spectate). Revived players return with full health.
- **Nametags** appear above each remote player's head.
- **Teammate status panel** shows each teammate's HP bar.
- **Teammate down alert** flashes prominently and pulses on the minimap.
- **Spectator mode**: eliminated co-op players spectate until the next wave.
- **Remote animations**: other players' walk cycles, crouch squish, sword swings, and weapon changes are all synced in real-time.
- **Bullet visibility**: shots fired by remote players are visible as tracers on all clients.
- **Rankings screen** shows final stats for all players at game over.
- **Pause**: when all alive players pause simultaneously, enemy AI freezes — useful for solo play.

## HUD

- Health bar with integrated PvP kill counter and rank indicator.
- Ammo counter and weapon name.
- Boss HP bar with **phase label** ("PHASE 1" / "PHASE 2 — ENRAGED") and combined percentage for multiple bosses.
- ADS scope overlays (sniper scope, red-dot for pistol/assault).
- **Wave enemy bar** — thin progress bar + "N LEFT" count below the wave number showing enemies remaining this wave.
- **Score pop-ups** — "+100" floats up from the crosshair on each kill, gold for bosses.
- **Damage direction indicator** — red arc at the screen edge points toward the source of incoming damage.
- **Hit marker** — crosshair dot flashes white → orange when a shot connects with an enemy.
- **Minimap** (bottom-left): full arena coverage, obstacles, colour-coded enemies, remote players, and a directional arrow for the local player.
- **Weapon pickup prompt** — "Press E to pick up ASSAULT" appears when near a weapon drop.
- **Weapon unlock popup** pulses on screen whenever your PvP weapon advances.

## Pause menu / Settings

Press **Esc** (or **Start** on controller) in-game to pause. The pause panel has four collapsible sections:

- **Controls** — Mouse sensitivity slider (1–10) and Controller sensitivity slider (1–10, persists in `localStorage`). Full keyboard and Xbox controller button reference.
- **Audio** — Master, Music, and SFX volume sliders (0–100%). All settings persist in `localStorage`.
- **Graphics** — Shadows toggle and Particles toggle. Disabling shadows can improve performance on low-end hardware; disabling particles reduces visual effects density.
- **HUD** — Crosshair style selector (Default / Dot / Cross / Plus / Circle) and Damage Numbers toggle.

Controller players can navigate the pause menu with D-pad / left stick, open sections with **A**, adjust sliders with D-pad left/right, and resume with **Start** or **B**.

The same panel is reachable from the lobby via the **⚙ SETTINGS** button on each lobby screen. In lobby mode the Resume / Give Up / Exit-to-Menu buttons are hidden, but **Fullscreen**, **View (third/first person)**, and **Career Stats** stay available so they can be toggled before a match.

## Leaderboard

An all-time leaderboard is saved to `leaderboard.json` on the server and updated after every session. On the game-over screen, click **ALL-TIME LEADERBOARD** to fetch and display the top 20 COOP scores.

## Reconnection

If a player's browser briefly loses the connection, they automatically rejoin within 60 seconds and their wave, HP, weapon, and character are restored. Each browser session stores a unique token in `localStorage`.

## Gameplay tuning reference

Use this section when you want to rebalance movement, health, weapons, PvP progression, or enemies.

### Shared constants

`public/src/gameConstants.js` is the single source of truth. `server.js` now imports `ARENA_SIZE`, `HALF`, `P_MAX_HP`, `WEAPON_ORDER`, `PVP_WIN_KILLS`, `PVP_CORNERS`, and the boss-escape physics constants directly from that file. Only constants that are server-exclusive (e.g. `B_SPD_E`, AI timings) live solely in `server.js`.

### Player stats and movement

| What | Current value | Where to change it |
|---|---:|---|
| Base player max HP | 1000 | `public/src/gameConstants.js` -> `P_MAX_HP`, and `server.js` -> `P_MAX_HP` |
| Co-op HP scaling per player | `round(P_MAX_HP / playerCount)` | `server.js` inside `socket.on('startMatch')` |
| Base walk speed | 6 | `public/src/config.js` -> `PLAYER_MOVEMENT.walkSpeed` |
| Sprint multiplier | 2.9 | `public/src/config.js` -> `PLAYER_MOVEMENT.sprintMultiplier` |
| Crouch speed | 2.7 | `public/src/config.js` -> `PLAYER_MOVEMENT.crouchSpeed` |
| Jump velocity | 11.2 | `public/src/gameConstants.js` -> `JUMP_VEL` |
| Gravity | 20 | `public/src/gameConstants.js` -> `GRAV` |
| Grapple pull speed | 60 | `public/src/config.js` -> `GRAPPLE_TUNING.pullSpeed` |
| Grapple max attach distance | 45 | `public/src/config.js` -> `GRAPPLE_TUNING.maxDistance` |
| Revive range | 2.8 | `public/src/config.js` -> `REVIVE_TUNING.range` |
| Revive hold time | 3.0 s | `public/src/config.js` -> `REVIVE_TUNING.holdTime` |
| Health pack heal amount | 150 | `public/src/network.js` in `healthPackRemoved` |

### Weapon stats

All player weapon stats live in `public/src/config.js` under `WEAPON_DEFS`.

Current default values:

| Weapon | Mag | Fire rate | Reload | Damage | Extra notes |
|---|---:|---:|---:|---:|---|
| Pistol | 14 | 0.3 s | 1.2 s | 150 | Bullet speed 96 |
| Assault rifle | 60 | 0.05 s | 1.6 s | 30 | Bullet speed 90 |
| Shotgun | 8 | 0.72 s | 2.2 s | 72 per pellet | 8 pellets, falls to 8 min damage |
| Sniper | 5 | 1.15 s | 2.6 s | 500 | Bullet speed 160 |
| Sword | 1 | 0.4 s | 0.1 s | 500 | Range 4.5, arc 1.2; 1.5× vs boss |
| Bazooka | 4 | 1.8 s | 3.2 s | 500 direct / 180 splash | 6-unit splash radius; bullet speed 55 |
| Grapple | — | 0.3 s | — | 300 | Pulls you to geometry; drags non-boss enemies; pulls PvP players toward you |

### PvP settings

| What | Current value | Where to change it |
|---|---:|---|
| Kills to advance weapon | 1 | `public/src/gameConstants.js` and `server.js` -> `PVP_KILLS_PER_WEAPON` |
| Gun Game win condition | 1 grapple kill | `server.js` in `resolvePvPKill()` — `onGrapple && weaponUsed === 'grapple'` |
| Weapon progression order | Pistol→Assault→Shotgun→Sniper→Sword→Bazooka→Grapple | `public/src/gameConstants.js` and `server.js` -> `WEAPON_ORDER` |
| FFA match durations | 3 / 5 / 10 min | `public/src/config.js` -> `FFA_DURATIONS`; dropdown options in `index.html` |
| FFA grapple pull force | 260 | `public/src/network.js` -> `pvpGrapplePull` handler (`knockbackX/Z` multiplier) |

### Campaign settings

| What | Current value | Where to change it |
|---|---:|---|
| Max campaign waves per map | 7 | `server.js` -> `CAMPAIGN_MAX_WAVE` |
| Campaign map order | arena→desert→city→blacksite | `server.js` -> `CAMPAIGN_MAP_ORDER` |
| Wave weapon drops | wave 1=assault … wave 7=pistol | `server.js` -> `CAMPAIGN_WAVE_WEAPON_DROP` |

### Enemy stats

#### Skeleton

| Stat | Current value |
|---|---:|
| HP | 1 |
| Speed | `9 + random * 2.5` |
| Melee damage | `8 + wave` |

Client mirror: `public/src/config.js` -> `SKELETON_TUNING`

#### Dog

| Stat | Current value |
|---|---:|
| HP | `round((46 + wave * 10) * 1.1^wave)` |
| Speed | `8 + random * 2 + wave * 0.3` |
| Melee damage | `12 + wave * 2` |

Client mirror: `public/src/config.js` -> `DOG_TUNING`

#### Soldier

| Stat | Current value |
|---|---:|
| HP | `round((58 + wave * 12) * 1.1^wave)` |
| Speed | `3.5 + random * 1.5 + wave * 0.2` |
| Fire interval | `max(0.8, 2.2 - wave * 0.1) + random * 0.4` |
| Bullet damage | 25 |

Client mirror: `public/src/config.js` -> `SOLDIER_TUNING`

#### Titan Scout (mini-boss)

| Stat | Current value |
|---|---:|
| HP | `round(3 * (58 + wave * 12) * 1.1^wave)` |
| Move speed | 13.8 |
| Melee damage | `round((100 + wave * 10) * 0.4)` |
| Attack reach | 4.5 |
| Spawn chance | 8% per enemy slot (wave 8+, max 2) |

Mini-boss tuning: `public/src/config.js` -> `MINIBOSS_TUNING`.

#### Titan Brute (boss)

| Stat | Current value |
|---|---:|
| HP | `round(2700 * 1.1^wave * hpMult)` |
| Phase 2 trigger | HP ≤ `maxHp / 3` |
| Move speed | 12 |
| Melee damage | `100 + wave * 10` |
| Attack reach | 7.8 |
| Attack frequency | 1.1 s |

Boss tuning: `server.js` top-level constants and `public/src/config.js` -> `BOSS_TUNING`.

### Wave and spawn pacing

| What | Current value | Where to change it |
|---|---:|---|
| Inter-wave wait time | 2.5 s | `server.js` in `finishWave()` |
| Standard enemies per wave | `min(1 + wave, 12)` | `server.js` in `tickWave()` |
| Max live enemies | 35 | `server.js` -> `MAX_LIVE_ENEMIES` |

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
|-- public/
|   |-- index.html              # Two-screen lobby UI and game markup
|   |-- styles/
|   |   `-- main.css            # All UI styling
|   |-- maps/                   # Editable JSON map files (source of truth for geometry)
|   |   |-- arena.json
|   |   |-- desert.json
|   |   |-- city.json
|   |   |-- blacksite.json
|   |   `-- sandbox.json
|   |-- assets/
|   |   `-- models/             # GLB weapon, character, and prop models
|   |-- editor/                 # Map editor UI (served by map-editor-server.js)
|   |   |-- index.html
|   |   |-- editor.js
|   |   `-- styles.css
|   `-- src/
|       |-- main.js             # App bootstrap and main game loop
|       |-- config.js           # Constants, weapon defs, map defs, character defs
|       |-- gameConstants.js    # Shared constants (also duplicated in server.js)
|       |-- state.js            # Mutable runtime state shared across modules
|       |-- utils.js            # Small reusable helpers
|       |-- audio.js            # Web Audio sound effects
|       |-- scene.js            # Three.js scene setup, map builder (JSON + legacy fallback)
|       |-- mapLoader.js        # Fetches map JSON and builds Three.js scene from it
|       |-- collision.js        # Collision helpers
|       |-- combat.js           # Weapons, bullets, particles, health packs, weapon pickups
|       |-- enemies.js          # Enemy rendering, wave UI, boss logic, PvP sword hit
|       |-- player.js           # Input, movement, camera, networking sync
|       |-- network.js          # Socket.IO client events
|       `-- ui.js               # HUD, lobby screens, minimap, rankings
|-- server.js                   # Express + Socket.IO server — waves, damage, health packs
|-- map-editor-server.js        # Separate Express server for the map editor (port 3002)
|-- scripts/
|   `-- export-maps.mjs         # One-time migration tool: regenerates JSON maps from source geometry
|-- MAP_EDITOR.md               # Full map editor workflow documentation
|-- Startserver.bat             # Windows quick-launch for the game server
`-- package.json
```
