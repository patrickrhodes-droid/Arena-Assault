# Arena Assault

Arena Assault is a browser-based wave survival shooter built with `Three.js`, `Express`, and `Socket.IO`. The project used to live inside one large HTML file; it is now split into smaller frontend modules with a dedicated server entrypoint and a documented folder structure.

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

4. When you are finished, stop the server by returning to the terminal where `npm start` is running and pressing `Ctrl+C`.

To test multiplayer locally, open multiple browser tabs or windows against the same server.

## Connect over a local network

If you want other people on the same home network or LAN to join:

1. Start the server on the host computer:

```bash
npm start
```

2. Find the host computer's local IP address.

On Windows, you can usually find it with:

```bash
ipconfig
```

Look for an IPv4 address such as `192.168.1.42` or `10.0.0.15`.

3. On each other device on the same network, open the game using that IP address and port `3000`:

```text
http://192.168.1.42:3000
```

Replace `192.168.1.42` with the actual IP address of the computer running the server.

### Local network notes

- Everyone must be connected to the same local network.
- The host computer must keep the server running while others play.
- If Windows Firewall prompts you, allow Node.js on private networks or other devices may not be able to connect.
- Some guest Wi-Fi networks block device-to-device traffic, which will prevent local multiplayer from working even if the IP address is correct.
- `localhost` only works on the same machine that is running the server. Other devices must use the host machine's local IP address.

## Project structure

```text
Arena Assault/
|-- public/
|   |-- index.html              # Main browser entrypoint
|   |-- styles/
|   |   `-- main.css            # All UI styling
|   `-- src/
|       |-- main.js             # App bootstrap and main game loop
|       |-- config.js           # Shared gameplay constants and weapon definitions
|       |-- state.js            # Mutable runtime state shared across modules
|       |-- utils.js            # Small reusable helpers
|       |-- audio.js            # Web Audio sound effects
|       |-- scene.js            # Three.js scene, arena, player, and weapon visuals
|       |-- collision.js        # Collision helpers for movement and bullets
|       |-- combat.js           # Weapons, bullets, particles, and health packs
|       |-- enemies.js          # Enemy creation, AI, and wave management
|       |-- player.js           # Input handling, player movement, and camera control
|       |-- network.js          # Socket.IO multiplayer event wiring
|       `-- ui.js               # HUD, lobby, damage overlay, minimap, and rankings UI
|-- server.js                   # Express + Socket.IO server
|-- package.json                # Node package metadata and scripts
`-- arenatest.html              # Legacy redirect to the new entrypoint
```

## Architecture overview

### Frontend

- `public/index.html` contains only the page shell and UI markup.
- `public/styles/main.css` contains all visual styling that used to be inline.
- `public/src/main.js` boots the game, connects modules together, and owns the animation loop.
- `public/src/state.js` exposes a shared `game` object so the systems can work together without packing everything into one file.

### Rendering and world

- `scene.js` builds the Three.js scene, camera, renderer, arena, local player model, remote player model factory, and weapon visuals.
- `collision.js` contains reusable helpers for player-vs-obstacle and bullet-vs-world checks.

### Gameplay systems

- `combat.js` handles weapon switching, firing, reloading, projectiles, hit particles, and health pack pickups.
- `enemies.js` handles enemy spawning, enemy definitions, AI behavior, boss logic, and wave progression.
- `player.js` handles keyboard and mouse input, movement, jump/gravity, camera positioning, revive interactions, and first-person weapon motion.

### Multiplayer

- `network.js` is responsible for all client-side Socket.IO events.
- `server.js` tracks players, relays movement and combat events, synchronizes lobby state, and broadcasts revive/game-over updates.

## Gameplay flow

1. Players connect to the lobby and enter a name.
2. Each player readies up.
3. The host starts the match once everyone is ready.
4. The host simulates waves and enemy behavior.
5. Clients receive synced enemy state, player state, revives, damage, and end-of-match rankings.

## Notes for future work

- The project is now easier to extend because UI, rendering, networking, and gameplay systems are separated.
- The shared `game` state keeps the refactor approachable, but the next step would be breaking that state into smaller domain-specific stores.
- There is still room to optimize allocations in hot loops like bullets, particles, and enemy updates if you want a deeper performance pass later.
