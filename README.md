# Arena Assault

Arena Assault is a browser-based multiplayer wave survival shooter built with `Three.js`, `Express`, and `Socket.IO`. Players fight together against escalating waves of enemies across a large 144×144 unit arena.

## How to run

1. Install dependencies if needed:

```bash
npm install
```

2. Start the local server:

```bash
npm start
```

3. Open the game in your browser:

```text
http://localhost:3000
```

4. When you are finished, stop the server by pressing `Ctrl+C` in the terminal.

To test multiplayer locally, open multiple browser tabs or windows against the same server.

## Connect over a local network

If you want other people on the same home network or LAN to join:

1. Start the server on the host computer (`npm start`).

2. Find the host computer's local IP address. On Windows:

```bash
ipconfig
```

Look for an IPv4 address such as `192.168.1.42`.

3. On each other device, open:

```text
http://192.168.1.42:3000
```

The server PC sees a **COPY JOIN LINK** button in the lobby that copies this address automatically.

### Local network notes

- Everyone must be on the same local network.
- The host computer must keep the server running while others play.
- If Windows Firewall prompts you, allow Node.js on private networks.
- Some guest Wi-Fi networks block device-to-device traffic.
- `localhost` only works on the machine running the server.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Space | Jump |
| Double-tap W | Toggle sprint lock |
| Shift | Crouch (toggle) |
| W / S on a ladder | Climb up / down |
| 1 / 2 / 3 / 4 / Q | Switch weapon |
| Mouse | Aim |
| Left click | Fire |
| Right click | Aim down sights |
| R | Reload |
| E (hold) | Revive downed teammate |
| Esc | Pause |

## Weapons

| Slot | Name | Damage | Notes |
|---|---|---|---|
| 1 | Service Pistol | 102 | Semi-auto, fast fire rate, always available |
| 2 | Assault Rifle | 46 per bullet | Full-auto, 30-round mag |
| 3 | Shotgun | 72 per pellet (×8) | High close-range burst; damage falls off at range |
| 4 | Sniper Rifle | 480 | Slow fire, heavy ADS zoom |
| Q | Tactical Blade | 9999 / 160 vs boss | One-hit kills all non-boss enemies |

All weapons have hip-fire and ADS spread, recoil, and reload animations. GLB models are rendered in first-person and on the third-person player model.

## Enemies

| Type | Appears | Behaviour |
|---|---|---|
| Soldier | Wave 1+ | Ranged. Keeps distance, shoots at players. HP and fire rate scale with wave. |
| Dog | Wave 3+ | Fast melee rush. Chance increases each wave up to 55%. |
| Skeleton | Wave 6+ | 1 HP, spawns in groups of 5. Wave 6 = 4 groups (+1 per wave, capped at 8). Animated GLB model at ¾ scale. |
| Titan Brute (boss) | Every 5th wave | Large melee boss (56 damage, heavy knockback). High HP, jump escape. Multiple bosses with multiplied HP on later boss waves. |

## Wave system

- Waves start automatically after a short countdown.
- Non-boss waves spawn soldiers and dogs (with interleaved skeleton groups from wave 6 onward).
- Every 5th wave (5, 10, 15 …) spawns one or more Titan Brute bosses. Boss count and HP multiplier grow on each successive boss wave.
- Wave announcements show the current wave number and enemy type warnings.
- An enemy ping alert pulses on the minimap after 60 seconds if enemies are still alive.

## Multiplayer

- Up to several players can join the same session via the lobby.
- The first player to connect becomes the **host** and simulates all game logic. Other players receive synced state.
- **Revive system**: downed players can be revived by teammates holding `E` nearby. Players fully die after the countdown expires.
- **Nametags** appear above each remote player's head in-world.
- **Teammate status panel** (top-left) shows each teammate's HP bar.
- **Teammate down alert** pops up and pulses on the minimap when a teammate is downed.
- **Spectator mode**: eliminated players spectate until the next wave.
- **Rankings screen** shows final score, kills, accuracy, and damage for all players at game over.
- Player max HP is divided by the number of players to keep the game balanced.

## Arena

- 144 × 144 unit open arena with boundary walls and neon accent strips.
- Roughly 80 structures: staircase pyramids, bunkers (north and south), tall towers (east, west, and four corner sniper perches), crate clusters, diagonal cover barriers, metal barriers, and outer-wall cover.
- **Sniper tower ladders**: each of the four corner perch towers has a climbable ladder (W/S to climb, Space to jump off). At the top the player can step onto the platform.
- **Crouch**: Shift toggles crouch — speed drops to 45 %, camera lowers, player model squishes. Uncrouches automatically on jump or ladder grab.
- Exponential fog at density 0.005 for visibility across the larger map.
- 20 teal point lights spread across the arena floor.

## HUD and minimap

- Health bar, ammo counter, weapon name, score, and wave number displayed at all times.
- **Boss HP bar**: single boss shows its name and individual HP; two or more bosses show **TITAN BOSSES** with a combined percentage (killing one of two equal bosses drops it to 50%).
- Crosshair with ADS scope overlays for sniper and red-dot for pistol/assault.
- Inventory hotbar shows all weapon slots and highlights the active weapon.
- **Minimap** (360 × 360 px, bottom-left): shows obstacles, all enemies (colour-coded by type — red for soldiers, orange for dogs, light-blue for skeletons, gold for bosses), remote players, and a directional arrow for the local player.

## Host controls

The server PC sees a **Host Controls** panel in the lobby above the join link button:

- **Start at Wave** — dropdown (1–30) to begin the match at a specific wave instead of wave 1. Useful for testing later content.
- **Invincibility** — toggle switch that disables all damage to all players for the entire session. Enemies still move and attack but deal no damage.

Both settings persist across replays until changed.

## Project structure

```text
Arena Assault/
|-- public/
|   |-- index.html              # Main browser entrypoint and UI markup
|   |-- styles/
|   |   `-- main.css            # All UI styling
|   |-- assets/
|   |   `-- models/             # GLB weapon and character models
|   `-- src/
|       |-- main.js             # App bootstrap and main game loop
|       |-- config.js           # Shared gameplay constants and weapon definitions
|       |-- state.js            # Mutable runtime state shared across modules
|       |-- utils.js            # Small reusable helpers
|       |-- audio.js            # Web Audio sound effects
|       |-- scene.js            # Three.js scene, arena, player, weapon, and enemy visuals
|       |-- collision.js        # Collision helpers for movement and bullets
|       |-- combat.js           # Weapons, bullets, particles, and health pack pickups
|       |-- enemies.js          # Enemy creation, AI, skeleton/boss logic, and wave management
|       |-- player.js           # Input handling, movement, jump/gravity, and camera control
|       |-- network.js          # Socket.IO client-side event wiring
|       `-- ui.js               # HUD, lobby, minimap, damage overlay, and rankings UI
|-- server.js                   # Express + Socket.IO server
|-- package.json                # Node package metadata and scripts
`-- arenatest.html              # Legacy redirect to the new entrypoint
```

## Architecture overview

### Frontend

- `public/index.html` contains only the page shell and UI markup.
- `public/styles/main.css` contains all visual styling.
- `public/src/main.js` boots the game, connects modules together, and owns the animation loop.
- `public/src/state.js` exposes a shared `game` object so systems can communicate without coupling.

### Rendering and world

- `scene.js` builds the Three.js scene, camera, renderer, arena geometry, local and remote player models, weapon GLB models, and the skeleton GLB loader.
- `collision.js` contains reusable helpers for player-vs-obstacle and bullet-vs-world intersection checks.

### Gameplay systems

- `combat.js` handles weapon switching, firing, reloading, projectiles, hit particles, and health pack pickups.
- `enemies.js` handles all four enemy types, AI movement and attacks, wave progression, boss logic, and skeleton group spawning.
- `player.js` handles keyboard and mouse input, movement, jump/gravity, sprint, camera positioning, revive interactions, and first-person weapon motion.

### Multiplayer

- `network.js` handles all client-side Socket.IO events: player join/leave, movement sync, enemy sync, damage, revives, and game over.
- `server.js` tracks players, relays movement and combat events, synchronises lobby state, and broadcasts revive and end-of-match data.
