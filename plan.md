# Arena Assault — Road to a Polished, Playable Game

This document captures everything needed to take the project from its current prototype state to a genuinely polished, shippable game. Items are grouped by area and ordered roughly by impact-to-effort ratio.

---

## 1. Core Gameplay Feel

### 1.1 Movement
- **Hold-to-crouch option** — current toggle is unintuitive for new players. Add a keybind setting.
- **Sprint visual feedback** — add a subtle FOV increase and head-bob when sprinting so it *feels* fast.
- **Jump feel** — add a small squash-and-stretch animation to the player model on land impact.
- **Coyote time** — ~80 ms grace window after walking off a ledge before gravity locks in. Makes platforming feel fair.
- **Wall running / slide** — stretch goal; would add significant skill ceiling.

### 1.2 Weapons
- **Weapon sway / bob** — first-person gun should sway gently while moving and settle when still.
- **Reload animation** — add a simple transform animation (gun dips down, comes back up) instead of just text.
- **Muzzle flash is too subtle** — increase the flash mesh size and lifetime by ~3×.
- **Hit markers** — a brief white crosshair flicker when a shot connects would dramatically improve feedback.
- **Ammo pickups** — add ammo crates to maps (similar to health packs) so players can resupply mid-wave.
- **Weapon balancing pass** — pistol ADS accuracy is nearly as good as the rifle. Pistol should have a larger aim spread penalty. Shotgun needs damage falloff review.
- **Sword lunge** — allow the player to dash 2–3 units forward when swinging the sword, making it feel aggressive.

### 1.3 Enemy AI
- **Enemy pathfinding fix** — `segmentIntersectsExpandedBox` is using the right property names now, but the detour system still relies on 4 fixed corner waypoints and breaks in complex geometry (Blacksite). Replace with a simple grid/navmesh approach.
- **Dog animation** — dogs currently use the Wolf GLB walk. A proper dog-run animation or faster gallop cycle would look better.
- **Soldier suppression** — soldiers should strafe laterally when behind cover, not just stand and shoot.
- **Enemy awareness** — enemies should have a brief "notice" state (they look at you, pause) before charging; removes the "instant aggro" feel.
- **Boss roar** — at phase 2 transition the boss should play a visual roar (screen shake, red flash) to signal the phase change clearly.

---

## 2. Visual Polish

### 2.1 Character & Animation
- **Walk cycle head-bob** — add vertical sinusoidal offset to camera while walking. Currently smooth but flat.
- **Landing animation** — camera dips on heavy landing.
- **Crouch transition** — currently uses y-scale squeeze; replace with proper crouch by lowering `playerGroup.position.y` 0.6 units so the character actually crouches rather than squishes.
- **Remote player interpolation** — remote players stutter slightly at low frame rates. Use proper lerp with a 100 ms buffer.
- **Shadow** — the directional light casts a shadow that appears to disconnect from the player (shadow to the left on Arena). Fix by tweaking the shadow camera position and bias per map.

### 2.2 Maps
- **Desert and City colours too similar** — Desert is warm brown/orange, City is warm orange-grey. One of them needs a stronger colour shift (City could be cooler/blue-grey).
- **Ladder visuals** — City and Desert ladders are invisible (just collision zones). Add GLB ladder prop models matched to the ladder zones.
- **Map props at night** — after dark the City street lights should actually cast point light shadows to give the map depth.
- **Blacksite corner rooms** — the "corner room divider walls" placed inside the solid masses are unreachable. Either open them up (add corridors) or remove the divider walls and let the corner masses be plain.
- **Skybox** — all maps use a plain background colour. A simple skybox (gradient sphere or cube) would add depth, especially for the outdoor maps.
- **Water in Desert** — the oasis compound has no water feature. A blue plane inside the compound walls would read as an oasis immediately.

### 2.3 Effects
- **Death particles** — enemies currently spawn generic orange/red cubes on death. Add colour-coded particles: white for skeletons, dark red for soldiers, orange for dogs, gold for boss.
- **Blood decals** — very small impact decals on walls when bullets hit (1–2 frame flash then fade) add significant impact feel.
- **Explosive barrel pre-warning** — barrels should have a glowing indicator (emissive rim) and a brief "critical hit" flash before detonating, giving nearby players a moment to react.
- **Post-processing** — Three.js `EffectComposer` with a mild bloom pass (for the green glow in Blacksite, neon in City) and vignette would dramatically improve visual quality. No quality loss for the gameplay.
- **Muzzle smoke** — a small wisp of semi-transparent particle at the barrel on fire adds realism.
- **Boss slam shockwave** — when the boss swings its club, spawn a ring of particles at ground level expanding outward.

---

## 3. Audio

All items here require new audio assets (WAV/OGG files).

- **Footstep sounds** — different clips per surface: metal (Arena/Blacksite), sand (Desert), concrete (City). Trigger on each step during the walk cycle.
- **Weapon audio** — each weapon needs: fire sound, reload start, reload end, click-on-empty. Currently all weapons share a generic tone.
- **Enemy audio** — dog growl on aggro; skeleton rattle on attack; soldier "contact!" on seeing player.
- **Boss audio** — charge roar, swing whoosh, phase-2 transition snarl, death explosion.
- **Ambient audio** — desert wind, urban noise (traffic, distant birds), industrial hum for Arena/Blacksite.
- **UI audio** — button clicks, wave start sting, wave clear sting, leaderboard appearance.
- **Hit confirmation sound** — a tight "tick" when a bullet connects with an enemy; distinct from the impact spark.
- **Low health heartbeat** — slow heartbeat + red vignette pulse when player HP < 25%.

---

## 4. UI / UX

### 4.1 HUD
- **Damage direction indicator** — a red arc at the edge of the screen pointing toward the damage source, similar to most modern shooters.
- **Enemy distance labels** — in wave mode, show a small dot with the distance to the nearest enemy on the minimap.
- **Wave progression bar** — a horizontal bar at the top showing "enemies remaining / total this wave" rather than just the wave number.
- **Score pop-ups** — when an enemy is killed, show a brief "+100" floating up from the kill position in 3D space (sprite or canvas).
- **Boss phase indicator** — a text label beneath the boss HP bar: "PHASE 1" or "PHASE 2 — ENRAGED".
- **Crosshair hit flash** — make the crosshair flash red/orange when a bullet connects (hit marker).

### 4.2 Menus & Flow
- **Map preview thumbnails** — replace the procedural gradient cards with actual screenshot thumbnails of each map (saved PNG files).
- **Post-game vote** — after a COOP round ends, show a "Play again?" / "Change map?" vote panel before redeploying.
- **Settings screen** — audio volume (master/music/SFX), mouse sensitivity (already exists), graphics quality (shadow on/off, particle count), fullscreen toggle.
- **Tutorial popup** — on first launch, a dismissable overlay showing the 5 most important controls.
- **Lobby chat** — a simple text input so players can communicate before the match starts without leaving the tab.
- **Player ping display** — show latency next to each player's name in the lobby list.
- **PvP weapon progression display** — in PvP, show all 7 weapons in a horizontal strip with the current weapon highlighted and a kill count to the next unlock.

---

## 5. Technical / Architecture

### 5.1 Server
- **Shared constants** — server.js duplicates constants from `gameConstants.js`. Now that the server is ESM it can `import` them directly. Do a cleanup pass.
- **Enemy AI fallback** — `tickEnemies` in server.js is never called. If the host disconnects mid-wave, all enemies freeze. Add a fallback: after 5 s with no `ownedEnemiesSync` packets for an enemy, the server runs minimal AI for it.
- **Rate limiting** — `bulletHit` and `enemyMeleeAttempt` events from clients are not rate-limited. A malicious client could spam them. Add a per-event cooldown on the server.
- **Leaderboard uniqueness** — the leaderboard allows duplicate player names. Add a session-token-keyed dedup so the same player doesn't appear 5 times.
- **Reconnection window** — 60 s is generous but the state is held in memory. If the server restarts, it's gone. Write the in-progress game state to a `session.json` that survives restarts.

### 5.2 Client Performance
- **Instanced mesh for repeated props** — barrels, crates, bollards placed at many positions are separate draw calls. Convert to `THREE.InstancedMesh` to cut draw calls by 40–60%.
- **Texture atlas** — GLB props each bring their own textures. A shared atlas would cut GPU texture swaps.
- **Occlusion culling** — Blacksite has many interior walls. Enemies and props behind walls are still rendered. `three-mesh-bvh` can provide basic culling.
- **FXAA post-process** — current MSAA antialiasing (`antialias: true`) is expensive. Replace with an FXAA pass for mobile/low-end PCs.
- **LOD for enemy models** — switch GLB enemies to lower-poly versions beyond 40 units.

### 5.3 Networking
- **Delta compression for enemy sync** — currently sends full x/y/z/rot/walkT for every enemy every 50 ms. Only send changed fields.
- **Client-side prediction** — player movement is fully client-authoritative (good). But bullet hits go through an async round-trip that can feel laggy. For LAN play this is fine; for WAN play, client-side hit confirmation would help.
- **Reconnection token persistence** — tokens survive tab refresh (localStorage) but not server restart. Write a token→name mapping to disk so reconnection works across server restarts.

---

## 6. Content / Modes

- **More waves** — currently the wave system caps at whatever you can survive. Add scripted events: at wave 15, all enemies get a speed buff; at wave 20, double skeleton groups; at wave 25, a boss *and* normal enemies.
- **Challenge modifiers** — host-selectable modifiers: double enemy speed, no health packs, one-hit-kill mode.
- **Horde mode** — a variant where enemies spawn infinitely and the goal is pure score. No wave breaks.
- **Co-op revive challenge** — a wave where downed players can only be revived by a specific action (sword kill near them).
- **New enemy: Brute Dog** — a larger, slower dog variant that can knock players back; introduces a heavier melee threat.
- **New enemy: Sniper Skeleton** — a skeleton that holds position and throws bones at range; forces players to stay mobile.
- **Map: Rooftop** — a city rooftop map with exposed edges, air conditioning units as cover, and a helicopter that circles and fires at players periodically (boss equivalent).
- **Map: Bunker** — underground concrete bunker; single large room with a T-shaped corridor and two side rooms; very tight, CQB-focused.
- **Destructible environment** — extend destructible props to walls (thin partitions that can be blasted open with the bazooka).

---

## 7. Release Readiness

- **Installer / .exe** — wrap with Electron or pkg for a one-click LAN launcher that doesn't require Node.js installed separately.
- **Auto-update** — a version check against a GitHub release tag; prompt players to pull the latest version.
- **Error handling** — socket disconnection, server crash, and bad data are largely unhandled on the client. Add a "Connection lost — reconnecting…" overlay and graceful degradation.
- **Accessibility** — colour-blind mode (replace red enemy indicators with shapes); adjustable text size in HUD.
- **GDPR / privacy** — the leaderboard stores player names. Add a disclaimer and opt-out if distributing beyond a private LAN.
- **Performance target** — define a minimum spec (e.g., integrated GPU, 60 fps in 4-player COOP on the Arena map) and test against it. Profile with Chrome DevTools and address the top 3 bottlenecks.

---

## Priority Order (if shipping soon)

1. Hit markers (15 min, massive feel improvement)
2. Enemy pathfinding fix (2 h, gameplay critical)
3. Weapon audio assets (external, high impact)
4. Damage direction indicator (1 h)
5. Post-processing bloom (2 h)
6. Map thumbnails for lobby (1 h)
7. Wave progress bar (30 min)
8. Settings screen (3 h)
9. Instanced mesh for props (4 h, performance)
10. Electron packager (2 h, distribution)
