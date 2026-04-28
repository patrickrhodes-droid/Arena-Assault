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

1. **PLAYER** — Enter a name and pick your character (Iestyn, Patrick, Will, or Matt). Each has a distinct head colour and size. Patrick's head uses a custom GLB model.
2. **MAP** — The host chooses a map; all players see the selection update in real-time. Non-host players see the chosen map highlighted but cannot change it.
3. **LOBBY** — See who is in the session, check controls, ready up, and start. Host sees **START MISSION** (co-op) and, when ≥ 2 players have characters, **PVP MATCH**.

## Maps

| Map | Theme | Description |
|---|---|---|
| **Combat Arena** | Industrial | The original 144 × 144 unit arena with metal staircases, crate clusters, bunkers, and 4 double-height sniper towers. Cyan accent lighting. |
| **Dust Bowl** | Desert | Sandy, open layout with ruined archways, stone pillars, oasis compounds, low sand-dune ridges, and two stepped-pyramid sniper platforms. Warm amber lighting. |
| **Downtown** | City (Night) | Tight urban grid with four large climbable buildings, a central plaza, jersey barriers, alleyways, dumpsters, and neon accent lights. Dark atmosphere with blue-white street lamps. |

All maps share the same collision, ladder-climb, and spawn systems — only the geometry, colours, fog, sky, and lighting differ.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Space | Jump |
| Shift + W | Sprint |
| Double-tap W | Sprint (alt) |
| Ctrl | Crouch (toggle) |
| W / S on a ladder | Climb up / down |
| 1 / 2 / 3 / 4 / Q | Switch weapon (co-op) |
| Mouse | Aim |
| Left click | Fire |
| Right click | Aim down sights |
| R | Reload |
| E (hold) | Revive downed teammate |
| Esc | Pause / fullscreen toggle |

## Weapons

All figures are taken directly from `config.js` and `combat.js`.

| Slot | Name | Damage | Pellets | Mag | Fire interval | Shots/s | Reload | Bullet speed | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Service Pistol | 102 | 1 | 14 | 0.30 s | ~3.3 | 1.2 s | 96 u/s | Semi-auto (click to fire) |
| 2 | Assault Rifle | 46 | 1 | 30 | 0.09 s | ~11.1 | 1.6 s | 90 u/s | Full-auto |
| 3 | Shotgun | 72 per pellet | 8 | 8 | 0.72 s | ~1.4 | 2.2 s | 78 u/s | Max burst 576 dmg; falloff 8–30 u → min 8/pellet |
| 4 | Sniper Rifle | 480 | 1 | 5 | 1.15 s | ~0.87 | 2.6 s | 160 u/s | Tightest ADS spread (0.0015); high scope zoom |
| 5 | Tactical Blade | — | — | — | 0.40 s swing | — | — | — | Co-op: one-hit kills regular enemies, 160 dmg/swing vs boss; PvP: 999 dmg (one-shot) |

**ADS zoom FOV** — Pistol/Assault 28°, Shotgun 60°, Sniper 19° (scoped overlay), Sword 75°.  
**Hip vs ADS spread** — Pistol 0.018/0.007, Assault 0.022/0.008, Shotgun 0.12/0.06, Sniper 0.012/0.0015.  
**Boss restriction** — only the Pistol and Sword deal damage to the Titan Brute.

## PvP Gun Game mode

- Starts with only the **pistol**; every **2 kills** automatically advances you to the next weapon.
- Progression: Pistol → Assault Rifle → Shotgun → Sniper → Sword.
- Manual weapon switching is **locked** — the game decides your loadout.
- First player to reach **13 total kills** (final 5 must be sword kills) wins.
- On death: the player falls over with an animation, the screen fades to black, then fades back in at the corner **furthest from any living player**.
- Inventory bar is replaced by a compact kill counter and rank indicator next to the health bar.
- A **"SHOTGUN UNLOCKED"** style popup appears whenever your weapon progresses.

## Enemies (Co-op)

All figures pulled from `enemies.js`. HP formulas use wave `W`.

### Soldier

| Stat | Formula / value | Wave 1 | Wave 5 | Wave 10 |
|---|---|---|---|---|
| HP | `round((58 + W×12) × 1.1^W)` | 77 | 190 | 461 |
| Move speed | `3.5–5.0 + W×0.2` u/s | 3.7–5.2 | 4.5–6.0 | 5.5–7.0 |
| Fire interval | `max(0.8, 2.2−W×0.1) + 0–0.4 s` | 2.1–2.5 s | 1.7–2.1 s | 0.8–1.2 s |
| Bullet damage | 25 (fixed) | 25 | 25 | 25 |
| Engage range | < 50 u | — | — | — |
| Preferred distance | 7–14 u from player | — | — | — |

- Appears every wave from wave 1. Keeps at 7–14 unit spacing; retreats if closer, advances if farther.
- Fires once per interval towards nearest living player.

### Dog

| Stat | Formula / value | Wave 3 | Wave 5 | Wave 10 |
|---|---|---|---|---|
| HP | `round((46 + W×10) × 1.1^W)` | 101 | 155 | 378 |
| Move speed | `8.0–10.0 + W×0.3` u/s | 8.9–10.9 | 9.5–11.5 | 11.0–13.0 |
| Melee damage | `12 + W×2` | 18 | 22 | 32 |
| Attack range | 2.5 u | — | — | — |
| Attack cooldown | 1.0 s | — | — | — |

- First appears at wave 3. Spawn chance: `min(55%, 12% + (W−3)×12%)` — so 12% at wave 3, 55% from wave 7 onward.
- Pure melee rush; attacks every 1 s when within 2.5 u.

### Skeleton

| Stat | Value |
|---|---|
| HP | 1 (one-hit kill, no health bar) |
| Move speed | 9.0–11.5 u/s (fixed, no wave scaling) |
| Melee damage | `8 + W` |
| Attack range | 2.0 u |
| Attack cooldown | 0.8 s |

- First appears at wave 6. Spawns in groups of 5 around a random arena edge point.
- Groups per wave: 4 at wave 6, +1 per wave, capped at 8 (so max 40 skeletons per wave from groups).
- Uses an animated GLB model with a death animation.

### Titan Brute (Boss)

Spawns every 5th wave. Count and HP multiplier increase over time.

| Wave | Boss count | HP multiplier | HP per boss (approx) | Club damage |
|---|---|---|---|---|
| 5 | 1 | 1× | 5,800 | 150 |
| 10 | 2 | 1× | 9,340 each | 200 |
| 15 | 2 | 2× | 30,100 each | 250 |
| 20 | 3 | 2× | 48,400 each | 300 |
| 25 | 3 | 4× | 155,900 each | 350 |

HP formula: `round(3600 × 1.1^W × hpMultiplier)`.  
Club damage formula: `100 + W×10`.

| Stat | Value |
|---|---|
| Move speed | 12 u/s |
| Attack range | 7.8 u |
| Swing cooldown | 1.1 s (+ 0.2 s windup) |
| Knockback | 185 u/s on hit |

- Only damaged by the **Pistol** (102 dmg/shot) and **Sword** (160 dmg/swing).
- Jumps over obstacles when stuck (escape velocity ~39 u/s).
- Named "TITAN BRUTE ELITE" when HP multiplier > 1.

## Player stats

| Stat | Value |
|---|---|
| Max HP | 1,000 (co-op: divided by player count, rounded) |
| Walk speed | 6 u/s |
| Sprint speed | 18.6 u/s (Shift + W, or double-tap W) |
| Crouch speed | 2.7 u/s |
| Jump velocity | 11.2 u/s (gravity 20 u/s²) |
| Health pack restore | +150 HP (capped at max) |
| Revive HP | Full health |

## Wave system

- Between waves there is a 2.5 s countdown, then the next wave begins.
- Regular waves spawn up to `min(2 + W×2, 30)` soldiers/dogs and (from wave 6) up to `min(4 + W−6, 8)` skeleton groups.
- Every 5th wave is a boss wave — no soldiers or dogs, only Titan Brutes.
- Wave announcements show the current wave number and enemy-type warnings.
- An enemy ping alert pulses on the minimap after 60 seconds if enemies are still alive.

## Character system

Four playable characters with distinct heads:

| Name | Head colour | Head scale | Model |
|---|---|---|---|
| Iestyn | Red / coral (#ff5544) | 1× | GLB face model |
| Patrick | Blue (#55aaff) | 1× | GLB face model |
| Will | Green (#66dd66) | 1× | GLB face model |
| Matt | Yellow (#ffcc33) | 1× | GLB face model |

Characters are rendered on both the local and remote player models. GLB face models load asynchronously and are swapped in automatically when ready. Iestyn, Patrick, and Will use custom GLB models. Matt uses a coloured box placeholder designed to be swapped for a GLB in future.

Heads use a layer-isolated point-light fill so they appear bright without any emissive glow bleeding onto the rest of the scene.

## Health and reviving

- **Health packs** spawn on enemy death (10% chance) and restore **150 HP**.
- Being **revived** by a teammate restores you to **full health** — no more getting up at 30%.

## Multiplayer

- The first player to connect becomes the **host** and simulates all game logic.
- **Revive system**: downed players can be revived by teammates holding `E` nearby (45 s timeout before forced spectate).
- **Nametags** appear above each remote player's head.
- **Teammate status panel** shows each teammate's HP bar.
- **Teammate down alert** flashes prominently and pulses on the minimap.
- **Spectator mode**: eliminated co-op players spectate until the next wave.
- **Remote animations**: other players' walk cycles, crouch squish, sword swings, and weapon changes are all synced in real-time.
- **Bullet visibility**: shots fired by remote players are visible as tracers on all clients.
- **Rankings screen** shows final stats for all players at game over.
- **Reconnection**: if a player drops mid-game, their score, kills, and alive status are preserved for 30 seconds so they can rejoin seamlessly.

## HUD

- Health bar with integrated PvP kill counter and rank indicator.
- Ammo counter and weapon name (in PvP the inventory hotbar is hidden; just the current weapon shows).
- Boss HP bar showing individual boss health or combined percentage for multiple bosses.
- ADS scope overlays (sniper scope, red-dot for pistol/assault).
- **Minimap** (360 × 360 px, bottom-left): obstacles, colour-coded enemies, remote players, and a directional arrow for the local player.
- **Weapon unlock popup** pulses on screen whenever your PvP weapon advances.

## Host controls (server PC only)

- **Start at Wave** — begin co-op at any wave 1–30.
- **Invincibility** — all players take no damage for the session.

## Project structure

```text
Arena Assault/
|-- public/
|   |-- index.html              # Three-screen lobby UI and game markup
|   |-- shared-constants.json   # Single source of truth for PVP/weapon constants (server + client)
|   |-- styles/
|   |   `-- main.css            # All UI styling
|   |-- assets/
|   |   `-- models/             # GLB weapon and character head models
|   `-- src/
|       |-- main.js             # App bootstrap and main game loop
|       |-- config.js           # Constants, weapon defs, map defs, character defs
|       |-- state.js            # Mutable runtime state shared across modules
|       |-- utils.js            # Small reusable helpers
|       |-- audio.js            # Web Audio sound effects
|       |-- scene.js            # Three.js scene, multi-map arena builders, player/enemy visuals
|       |-- collision.js        # Collision helpers
|       |-- combat.js           # Weapons, bullets, particles, health pack pickups
|       |-- enemies.js          # Enemy AI, wave management, boss logic, PvP sword hit
|       |-- player.js           # Input, movement, camera, networking sync
|       |-- network.js          # Socket.IO client events
|       `-- ui.js               # HUD, lobby screens, minimap, rankings
|-- server.js                   # Express + Socket.IO server
|-- Startserver.bat             # Windows quick-launch shortcut
`-- package.json
```
