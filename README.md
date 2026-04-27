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

| Slot | Name | Damage | Notes |
|---|---|---|---|
| 1 | Service Pistol | 102 | Semi-auto, fast fire rate, always available |
| 2 | Assault Rifle | 46 per bullet | Full-auto, 30-round mag |
| 3 | Shotgun | 72 per pellet (×8) | High close-range burst; damage falls off at range |
| 4 | Sniper Rifle | 480 | Slow fire, heavy ADS zoom |
| 5 | Tactical Blade | 999 (melee) | One-hit kills in PvP; vs boss: 160 per swing |

## PvP Gun Game mode

- Starts with only the **pistol**; every **2 kills** automatically advances you to the next weapon.
- Progression: Pistol → Assault Rifle → Shotgun → Sniper → Sword.
- Manual weapon switching is **locked** — the game decides your loadout.
- First player to reach **13 total kills** (final 5 must be sword kills) wins.
- On death: the player falls over with an animation, the screen fades to black, then fades back in at the corner **furthest from any living player**.
- Inventory bar is replaced by a compact kill counter and rank indicator next to the health bar.
- A **"SHOTGUN UNLOCKED"** style popup appears whenever your weapon progresses.

## Enemies (Co-op)

| Type | Appears | Behaviour |
|---|---|---|
| Soldier | Wave 1+ | Ranged. Keeps distance, shoots at players. HP and fire rate scale with wave. |
| Dog | Wave 3+ | Fast melee rush. Chance increases each wave up to 55%. |
| Skeleton | Wave 6+ | 1 HP, spawns in groups of 5. Wave 6 = 4 groups (+1 per wave, capped at 8). Animated GLB model. |
| Titan Brute (boss) | Every 5th wave | Large melee boss with club attack. High HP, heavy knockback, jump-escape behaviour. Multiple bosses from wave 10 onward. Only the Pistol and Sword damage the Titan Brute. |

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
| Iestyn | Red / coral | 1.5× |
| Patrick | Blue | 1.0× (GLB face model) |
| Will | Green | 1.25× (GLB face model) |
| Matt | Yellow | 0.8× |

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
