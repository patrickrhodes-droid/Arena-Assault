# Arena Assault

Arena Assault is a browser-based multiplayer shooter built with `Three.js`, `Express`, and `Socket.IO`. Play co-op wave survival against enemy AI, or jump into a competitive **PvP Gun Game** with up to 4 players — all selectable from a clean three-screen lobby.

## How to run

1. Install dependencies if needed:

```bash
npm install
```

2. Start the local server:

```bash
npm start
```
or double-click **Startserver.bat** on Windows.

3. Open the game in your browser at `http://localhost:3001`.

To test multiplayer locally, open multiple browser tabs against the same server.

## Connect over a local network

1. Start the server on the host computer.
2. Find the host's local IP (`ipconfig` on Windows). Look for an IPv4 address like `192.168.1.42`.
3. On each other device, open `http://192.168.1.42:3001`.

The server PC sees a **COPY JOIN LINK** button in the lobby that copies this address automatically.

## Lobby flow

The lobby is split into three screens:

1. **PLAYER** — Enter a name and pick your character (Iestyn, Patrick, Will, or Matt). Each has a distinct head colour and size. Iestyn, Patrick, and Will each use a custom GLB face model.
2. **MAP** — The host chooses a map; all players see the selection update in real-time. Non-host players see the chosen map highlighted but cannot change it.
3. **LOBBY** — See who is in the session, check controls, ready up, and start. Host sees **START MISSION** (co-op) and, when ≥ 2 players have characters, **PVP MATCH**.

## Maps

| Map | Theme | Description |
|---|---|---|
| **Combat Arena** | Industrial | The original 144 × 144 unit arena with metal staircases, crate clusters, bunkers, and 4 double-height sniper towers. Cyan accent lighting. |
| **Dust Bowl** | Desert | Sandy, open layout with ruined archways, stone pillars, oasis compounds, low sand-dune ridges, and two stepped-pyramid sniper platforms. Warm amber lighting. |
| **Downtown** | City (Day) | Tight urban grid with four large climbable buildings, a central plaza, jersey barriers, alleyways, dumpsters, and warm combat-zone accents. Bright sunlit skyline with clear visibility. |

All maps share the same collision, ladder-climb, and spawn systems — only the geometry, textures, colours, fog, sky, and lighting differ. Each map is populated with props from the **City Props** and **Shooter** GLB asset packs (street lights, trees, trash cans, fire hydrants, traffic lights, dumpsters, barrels, crates, vehicles, sack trenches, shipping containers, and more). Walls, ground, and buildings use procedural canvas textures (metal panels for Arena, sandstone for Desert, asphalt + concrete brick for City).

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Space | Jump |
| Shift + W | Sprint |
| Double-tap W | Sprint (alt) |
| Ctrl | Crouch (toggle) |
| W / S on a ladder | Climb up / down |
| 1 / 2 / 3 / 4 / 5 / 6 | Select weapon slot (co-op) |
| Q | Cycle weapon (co-op) |
| Mouse | Aim |
| Left click | Fire / use equipped weapon |
| Right click | Aim down sights |
| R | Reload |
| G | Fire / release grappling hook |
| E (hold) | Revive downed teammate |
| Esc | Pause / fullscreen toggle |

## Weapons

| Slot | Name | Damage | Notes |
|---|---|---|---|
| 1 | Service Pistol | 102 | Semi-auto, fast fire rate, always available |
| 2 | Assault Rifle | 46 per bullet | Full-auto, 30-round mag |
| 3 | Shotgun | 72 per pellet (×8) | High close-range burst; damage falls off at range |
| 4 | Sniper Rifle | 500 | Slow fire, heavy ADS zoom |
| 5 | Tactical Blade | 500 (melee) | One-hit kills in PvP; vs boss: 250 per swing |
| 6 | Grapple Hook | 80 | Pulls you to walls or cover; if aimed at an enemy it deals 80 damage and yanks non-boss enemies to 8 units away |

## PvP Gun Game mode

- Starts with only the **pistol**; every **2 kills** automatically advances you to the next weapon.
- Progression: Pistol → Assault Rifle → Shotgun → Sniper → Sword → Grapple.
- Manual weapon switching is **locked** — the game decides your loadout.
- First player to reach **13 total kills** (final 5 must be sword kills) wins.
- On death: the player falls over with an animation, the screen fades to black, then fades back in at the corner **furthest from any living player**.
- Inventory bar is replaced by a compact kill counter and rank indicator next to the health bar.
- A **"SHOTGUN UNLOCKED"** style popup appears whenever your weapon progresses.

## Enemies (Co-op)

| Type | Appears | Behaviour |
|---|---|---|
| Skeleton | Wave 1+ | 1 HP, fast melee rusher. Wave 6 = 4 groups of 2 per wave (+1 group per wave, capped at 8). Animated GLB model. |
| Dog | Wave 3+ | Fast melee rush. Chance increases each wave up to 55%. |
| Soldier | Wave 6+ | Ranged. Keeps distance, shoots at players. HP and fire rate scale with wave. Spawns in pairs alongside skeleton groups. |
| Titan Brute (boss) | Every 5th wave | Large melee boss with club attack. Telegraphed wind-up before each swing; continues closing the gap during wind-up so the hit reliably lands. Heavy knockback, jump-escape behaviour. Multiple bosses from wave 10 onward. Only the Pistol and Sword damage the Titan Brute. |

The boss attack has a 7.8 unit reach (50% wider than original) and swings every 1.1 s for more aggressive threat.

## Wave system

- Waves start automatically after a short countdown.
- Every 5th wave spawns one or more Titan Brute bosses.
- Wave announcements show the current wave number and enemy type warnings.
- An enemy ping alert pulses on the minimap after 60 seconds if enemies are still alive.

## Character system

Four playable characters with distinct heads:

| Name | Head colour | Head scale |
|---|---|---|
| Iestyn | Red / coral | 1.5× (GLB face model) |
| Patrick | Blue | 1.0× (GLB face model) |
| Will | Green | 1.25× (GLB face model) |
| Matt | Yellow | 0.8× |

Characters are rendered on both the local and remote player models. GLB face models load asynchronously and are swapped in automatically when ready. Iestyn, Patrick, and Will each use a custom GLB face model. Matt uses a coloured box placeholder designed to be swapped for a GLB in future.

Heads use a layer-isolated point-light fill so they appear bright without any emissive glow bleeding onto the rest of the scene.

## Multiplayer

- The **server drives wave spawning, damage validation, and health packs**. Enemy AI (movement, pathfinding, attacks) runs on the host client and is synced to other clients at 20 Hz, giving all non-host players smooth enemy visuals without simulation overhead.
- The first player to connect becomes the **lobby leader** and controls map selection and match start, but has no in-game simulation advantage.
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
- Ammo counter and weapon name (in PvP the inventory hotbar is hidden; just the current weapon shows).
- Boss HP bar showing individual boss health or combined percentage for multiple bosses.
- ADS scope overlays (sniper scope, red-dot for pistol/assault).
- **Minimap** (360 × 360 px, bottom-left): full arena coverage, obstacles, colour-coded enemies, remote players, and a directional arrow for the local player.
- **Weapon unlock popup** pulses on screen whenever your PvP weapon advances.

## Host controls (server PC only)

- **Start at Wave** — begin co-op at any wave 1–30.
- **Invincibility** — all players take no damage for the session.

## Gameplay tuning reference

Use this section when you want to rebalance movement, health, weapons, PvP progression, or enemies.

### Important note about shared constants

Some values exist in both the client and the server:

- `public/src/gameConstants.js` is the shared client-side source of truth.
- `server.js` still duplicates some of those same values for the authoritative simulation.

If you change one of these and gameplay depends on the server too, update both files.

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
| Grapple cooldown after release | 0.8 s | `public/src/config.js` -> `GRAPPLE_TUNING.releaseCooldown` |
| Grapple cooldown after jump-release | 0.5 s | `public/src/config.js` -> `GRAPPLE_TUNING.jumpReleaseCooldown` |
| Revive range | 2.8 | `public/src/config.js` -> `REVIVE_TUNING.range` |
| Revive hold time | 3.0 s | `public/src/config.js` -> `REVIVE_TUNING.holdTime` |
| Downed bleed-out timer | 45 s | `public/src/main.js` where `game.downedTime / 45` is used |
| Health pack heal amount | 150 | `public/src/network.js` in `healthPackRemoved` |

### Weapon stats

All player weapon stats live in `public/src/config.js` under `WEAPON_DEFS`.

| Weapon | Key stats to edit |
|---|---|
| Pistol | `mag`, `fireRate`, `reload`, `damage`, `spreadHip`, `spreadAim`, `bulletSpeed`, `bulletLife`, `aimFov` |
| Assault rifle | `mag`, `fireRate`, `reload`, `damage`, `spreadHip`, `spreadAim`, `bulletSpeed`, `bulletLife`, `aimFov` |
| Shotgun | `mag`, `fireRate`, `reload`, `damage`, `minDamage`, `falloffStart`, `falloffEnd`, `pellets`, spreads |
| Sniper | `mag`, `fireRate`, `reload`, `damage`, `spreadHip`, `spreadAim`, `bulletSpeed`, `bulletLife`, `aimFov` |
| Sword | `fireRate`, `damage`, `range`, `arc` |

Current default weapon values:

| Weapon | Mag | Fire rate | Reload | Damage | Extra notes |
|---|---:|---:|---:|---:|---|
| Pistol | 14 | 0.3 s | 1.2 s | 102 | Bullet speed 96 |
| Assault rifle | 30 | 0.09 s | 1.6 s | 46 | Bullet speed 90 |
| Shotgun | 8 | 0.72 s | 2.2 s | 72 per pellet | 8 pellets, falls to 8 min damage |
| Sniper | 5 | 1.15 s | 2.6 s | 500 | Bullet speed 160 |
| Sword | 1 | 0.4 s | 0.1 s | 500 | Range 4.5, arc 1.2 |
| Grapple | - | 0.9 s | - | 80 | No ammo; pulls you to world geometry or drags non-boss enemies to 8 units away |

Related weapon logic:

- Weapon order / unlock order: `public/src/gameConstants.js` and `public/src/config.js` -> `WEAPON_ORDER`
- PvP weapon progression: `public/src/config.js` -> `PVP_KILLS_PER_WEAPON`
- Boss damage restriction (only pistol and sword hurt Titan Brute): `server.js` inside `socket.on('bulletHit')`

### PvP settings

| What | Current value | Where to change it |
|---|---:|---|
| Kills needed to unlock next weapon | 2 | `public/src/config.js` and `server.js` -> `PVP_KILLS_PER_WEAPON` |
| Total kills to win | 13 | `public/src/config.js` -> `PVP_WIN_KILLS`, `server.js` -> `PVP_WIN_KILLS` |
| Sword kills required at the end | 5 | `public/src/config.js` -> `PVP_SWORD_KILLS_TO_WIN`, `server.js` -> `PVP_SWORD_KILLS_TO_WIN` |
| PvP spawn corners | 4 fixed corners | `public/src/config.js` and `server.js` -> `PVP_CORNERS` |

### Enemy stats

The server-side values in `server.js` are the ones that actually matter for gameplay. The client now mirrors most enemy stat blocks from central config objects in `public/src/config.js`, so you can tune there first and then copy matching changes to `server.js` when needed.

#### Skeleton

- Spawned by `makeSkeleton()` in `server.js`
- Mirrored visually in `createSkeleton()` in `public/src/enemies.js`

| Stat | Current value |
|---|---:|
| HP | 1 |
| Speed | `9 + random * 2.5` |
| Melee damage | `8 + wave` |
| Attack timer seed | `random * 0.4` |

Client mirror location: `public/src/config.js` -> `SKELETON_TUNING`

#### Dog

- Spawned by `makeDog()` in `server.js`
- Mirrored visually in `createDog()` in `public/src/enemies.js`

| Stat | Current value |
|---|---:|
| HP | `round((46 + wave * 10) * 1.1^wave)` |
| Speed | `8 + random * 2 + wave * 0.3` |
| Melee damage | `12 + wave * 2` |
| Attack timer seed | `random * 0.5` |

Client mirror location: `public/src/config.js` -> `DOG_TUNING`

#### Soldier

- Spawned by `makeSoldier()` in `server.js`
- Mirrored visually in `createSoldier()` in `public/src/enemies.js`

| Stat | Current value |
|---|---:|
| HP | `round((58 + wave * 12) * 1.1^wave)` |
| Speed | `3.5 + random * 1.5 + wave * 0.2` |
| Fire interval | `max(0.8, 2.2 - wave * 0.1) + random * 0.4` |
| Bullet damage | 25 |
| Bullet speed | 28 |
| Bullet life | 4 s |

Client mirror location: `public/src/config.js` -> `SOLDIER_TUNING`

#### Titan Brute (boss)

- Spawned by `makeBoss()` in `server.js`
- Mirrored visually in `createBoss()` in `public/src/enemies.js`

| Stat | Current value |
|---|---:|
| HP | `round(3600 * 1.1^wave * hpMult)` |
| Move speed | 12 |
| Melee damage | `100 + wave * 10` |
| Attack reach | 7.8 |
| Attack frequency | 1.1 s |
| Windup | 0.2 s |
| Swing window | 0.22 s |
| Escape jump gravity | 180 |
| Escape jump height | `50 / 6` |
| Escape forward speed | 14 |

Boss tuning locations:

- `server.js` top-level constants: `BOSS_ATTACK_REACH`, `BOSS_ATTACK_FREQ`, `BOSS_WINDUP`, `BOSS_SWING`, `BOSS_ESCAPE_GRAV`, `BOSS_ESCAPE_HEIGHT`, `BOSS_ESCAPE_FWD_SPD`
- `public/src/config.js` -> `BOSS_TUNING` for the mirrored HP, move speed, and damage values used by the client
- `public/src/enemies.js` top-level constants for the visual/client-owned mirror

### Wave and spawn pacing

Most co-op wave pacing is handled in `server.js` inside `tickWave()`.

| What | Current value | Where to change it |
|---|---:|---|
| Inter-wave wait time | 2.5 s | `server.js` in `finishWave()` and initial `waveTmr` setup |
| Standard enemies per wave | `min(1 + wave, 12)` | `server.js` in `tickWave()` |
| Skeleton groups from wave 6+ | starts at 2 groups | `server.js` in `tickWave()` |
| Max live enemies | 60 | `server.js` -> `MAX_LIVE_ENEMIES`, `public/src/enemies.js` mirror |
| Enemy ping warning delay | 60 s | `public/src/state.js` -> `nextEnemyPing` reset value |

Boss-wave scaling lives in:

- `server.js` -> `spawnBoss()`
- `public/src/enemies.js` -> `getBossWaveConfig()`

### Health pack and score values

| What | Current value | Where to change it |
|---|---:|---|
| Health pack drop chance | 10% | `server.js` in `killEnemy()` |
| Health restored per pack | 150 | `public/src/network.js` in `healthPackRemoved` |
| Skeleton score | 25 | `server.js` in `killEnemy()` |
| Dog score | 150 | `server.js` in `killEnemy()` |
| Soldier score | 100 | `server.js` in `killEnemy()` |
| Boss score | 2500 | `server.js` in `killEnemy()` |

## Project structure

```text
Arena Assault/
|-- public/
|   |-- index.html              # Three-screen lobby UI and game markup
|   |-- styles/
|   |   `-- main.css            # All UI styling
|   |-- assets/
|   |   `-- models/             # GLB weapon, character, and prop models (City Props & Shooter asset packs)
|   `-- src/
|       |-- main.js             # App bootstrap and main game loop
|       |-- config.js           # Constants, weapon defs, map defs, character defs
|       |-- state.js            # Mutable runtime state shared across modules
|       |-- utils.js            # Small reusable helpers
|       |-- audio.js            # Web Audio sound effects
|       |-- scene.js            # Three.js scene, multi-map arena builders, player/enemy visuals
|       |-- collision.js        # Collision helpers
|       |-- combat.js           # Weapons, bullets, particles, health pack pickups
|       |-- enemies.js          # Enemy rendering, wave UI, boss logic, PvP sword hit
|       |-- player.js           # Input, movement, camera, networking sync
|       |-- network.js          # Socket.IO client events
|       `-- ui.js               # HUD, lobby screens, minimap, rankings
|-- server.js                   # Express + Socket.IO server — authoritative game simulation (enemy AI, waves, damage, health packs)
|-- Startserver.bat             # Windows quick-launch shortcut
`-- package.json
```
