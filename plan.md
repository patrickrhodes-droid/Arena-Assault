# Arena Assault — Road to a Polished, Playable Game

This document captures everything needed to take the project from its current prototype state to a genuinely polished, shippable game. Items are grouped by area and ordered roughly by impact-to-effort ratio.

✅ = implemented

---

## 1. Core Gameplay Feel

### 1.1 Movement
- **Hold-to-crouch option** — current toggle is unintuitive for new players. Add a keybind setting.
- ✅ **Sprint visual feedback** — subtle FOV increase (+8°) and head-bob when sprinting.
- **Jump feel** — add a small squash-and-stretch animation to the player model on land impact.
- ✅ **Coyote time** — 80 ms grace window after walking off a ledge before gravity locks in.
- ✅ **Jump input buffering** — jump input queued for 120 ms while airborne; fires automatically on the next landing frame.
- ✅ **Landing sound** — soft/hard landing variants (impactGeneric_light / impactMetal_heavy) based on fall velocity.
- ✅ **Landing camera dip** — camera punches down on impact and springs back over ~0.4 s.
- **Wall running / slide** — stretch goal; would add significant skill ceiling.

### 1.2 Weapons
- ✅ **Weapon sway / bob** — movement bob (sin wave at 5.5 rad/s, ±0.004/0.006 u) layered on top of existing idle breathe and mouse sway.
- ✅ **Reload animation** — gun dips down via a sin curve over the reload duration and returns when complete.
- ✅ **Muzzle flash** — pure PointLight burst (warm white, intensity 7–12, 55 ms). Shotgun/bazooka get higher intensity.
- ✅ **Hit markers** — crosshair dot flashes white → orange when a shot connects.
- ✅ **Empty mag feedback** — UI click sound on dry-fire.
- ✅ **Ammo counter urgency** — ammo display pulses red when below 25% of magazine capacity.
- ✅ **Weapon balancing pass** — shotgun 72 → 144 per pellet; bazooka 500 → 1000 direct, 400 → 800 splash.
- ✅ **Crosshair / bullet alignment** — third-person bullets raycast from camera through crosshair centre, eliminating close-range parallax.
- ✅ **Hit-stop** — world freezes for ~55 ms on every sword hit; kill slow-mo (0.15× speed, 120 ms) on every kill.
- ✅ **Boss bazooka knockback** — bazooka now damages and applies a small knockback (0.4 u) to the boss.
- **Ammo pickups** — add ammo crates to maps so players can resupply mid-wave.
- ✅ **Sword lunge** — forward knockback impulse (45 u) when swinging while pressing W, usable in air.

### 1.3 Enemy AI
- **Enemy pathfinding fix** — the detour system still relies on 4 fixed corner waypoints and breaks in complex geometry (Blacksite). Replace with a simple grid/navmesh approach.
- **Dog animation** — dogs currently use the Wolf GLB walk. A proper dog-run animation or faster gallop cycle would look better.
- ✅ **Soldier suppression** — soldiers strafe perpendicular to the player in the kite zone (direction alternates every 1.5–3 s). Also blends lateral movement while advancing/retreating.
- ✅ **Enemy awareness** — brief "notice" pause (0.35–0.6 s) before first charge; removes instant aggro.
- ✅ **Boss roar** — phase 2 transition: red flash + heavy screen shake + HUD alert.
- ✅ **Dog / skeleton standoff** — both types now maintain a minimum gap (1.8 u dog, 1.7 u skeleton) rather than stacking on the player's position.
- ✅ **Smooth knockback** — per-frame displacement capped at 0.6 u so high-force impulses (boss, grapple) slide the player rather than teleporting them.

---

## 2. Visual Polish

### 2.1 Character & Animation
- ✅ **Walk cycle head-bob** — sinusoidal vertical camera offset in first-person while walking/sprinting.
- **Landing animation** — camera dips on heavy landing.
- **Crouch transition** — currently uses y-scale squeeze; replace with proper crouch.
- **Remote player interpolation** — remote players stutter slightly at low frame rates. Use proper lerp with a 100 ms buffer.
- **Shadow** — the directional light casts a shadow that appears to disconnect from the player. Fix per-map shadow bias.

### 2.2 Maps
- **Desert and City colours too similar** — one needs a stronger colour shift.
- **Ladder visuals** — City and Desert ladders are invisible. Add GLB ladder prop models matched to the ladder zones.
- **Map props at night** — City street lights should cast point light shadows.
- ✅ **Skybox** — HDR equirectangular sky per map (arenasky.hdr, desertsky.hdr, Citysky.hdr). Blacksite keeps the dark gradient sphere.
- ✅ **Water in Desert** — semi-transparent blue planes at both oasis compounds (y=0.03, 13×7 u).

### 2.3 Effects
- ✅ **Color-coded death particles** — white for skeletons, dark red for soldiers, orange for dogs, gold for boss.
- ✅ **Bullet-hole decals** — DecalGeometry with bullet-holes.png projects onto walls, floors, and static GLB props. Pool of 60; oldest disposed when exceeded.
- ✅ **Explosive barrel pre-warning** — proximity warning banner appears when player enters blast radius.
- ✅ **Post-processing bloom** — EffectComposer + UnrealBloomPass (strength 0.38, radius 0.55, threshold 0.82). Muzzle flashes and explosions glow; normal geometry unaffected.
- ✅ **Muzzle smoke** — 1–3 grey particles (no gravity) at barrel on every shot; rifle/shotgun get 1, others get 3.
- ✅ **Boss slam shockwave** — burst of orange particles + large embers at ground level when boss lands after a jump.
- ✅ **Bullet tracers** — short yellow-white Line geometry from muzzle in bullet direction, fades over 60 ms.
- ✅ **Shell ejection** — brass-coloured box mesh ejects right from muzzle, bounces once off the floor with a metallic clink.
- ✅ **Surface-specific impact VFX** — warm/sandy materials spawn sand-coloured dust; dark materials spawn blue-grey haze; default spawns grey sparks.
- **Squash & stretch on heavy landing** — scale player group Y axis briefly on hard impact and spring back. Needs animation pass.
- **Contextual wall material VFX pass** — currently uses material colour heuristic. A tagged `surfaceType` field per mesh would allow exact material matching (metal sparks, concrete dust, sand puff, etc.).

---

## 3. Audio

- ✅ **Footstep sounds** — concrete (Arena/City), carpet (Blacksite), grass (Desert). Pace varies: sprint 0.30 s, walk 0.44 s, crouch 0.60 s. Only plays when grounded.
- ✅ **Wall impact** — impactMetal_medium on every bullet hole placement.
- ✅ **Enemy hit feedback** — impactSoft_medium for regular enemies; impactPlate_heavy for boss/miniboss.
- ✅ **Melee damage** — impactPunch_heavy (dog/boss), impactPunch_medium (skeleton lighter hit).
- ✅ **Kill confirmation bell** — removed (sounded bad).
- ✅ **Weapon / health pickup** — impactTin_medium for weapons, impactGeneric_light for health packs.
- ✅ **Sword hit** — impactPlank_medium layered with synth sword sound when swing connects.
- ✅ **Prop destruction** — impactWood_heavy on destructible barrel/crate.
- ✅ **Boss footstep** — impactMining every 0.55 s while the boss is charging.
- ✅ **Grapple hook hit** — impactMetal_heavy when hook latches onto surface.
- ✅ **Landing sound** — soft/hard variant based on fall speed.
- ✅ **Empty mag click** — impactMetal_light on dry-fire, throttled at 0.3 s.
- ✅ **UI audio** — click1–5 (buttons), rollover1–6 (hover), switch1–10 (toggles/sliders), mouseclick1 (Ready Up confirm).
- ✅ **Pitch randomisation on gunshots** — ±8% frequency variation per shot on all procedural weapon sounds. Eliminates machine-gun sample repetition.
- ✅ **Audio ducking on explosions** — shotgun, sniper, and bazooka temporarily duck all other SFX by ~70% for 800 ms via `effectiveVol` multiplier.
- ✅ **Shell clink** — synthesised metallic triangle-wave ping plays when ejected shell bounces off the floor.
- ✅ **Banter radio beep** — three-dot morse-style square-wave burst plays whenever a banter line appears.
- **Distance-based reverb zones** — requires AudioContext `ConvolverNode` with per-zone impulse response buffers. Currently all SFX are dry. Needs: IR sample library, zone tagging on map objects, and a routing graph that blends dry/wet by zone. Significant audio architecture change.
- **Weapon fire sounds** — each weapon needs a real fire/reload sample. Currently all use synthesised tones.
- **Enemy audio** — dog growl on aggro; skeleton rattle on attack; soldier "contact!" on seeing player.
- **Boss audio** — charge roar, swing whoosh, phase-2 snarl, death explosion.
- **Ambient audio** — desert wind, urban noise, industrial hum for Arena/Blacksite.
- ✅ **Low health heartbeat** — double-thump synth heartbeat every 0.85 s when HP < 25%. Vignette pulse already existed.

---

## 4. UI / UX

### 4.1 HUD
- ✅ **Damage direction indicator** — red arc at the edge of the screen pointing toward the damage source.
- ✅ **Wave progression bar** — thin bar + "N LEFT" count below the wave number.
- ✅ **Score pop-ups** — "+100" floats up from the crosshair on each kill.
- ✅ **Boss phase indicator** — "PHASE 1" / "PHASE 2 — ENRAGED" label beneath the boss HP bar.
- ✅ **Crosshair hit flash** — dot flashes white → orange when a bullet connects.

### 4.2 Menus & Flow
- ✅**Map preview thumbnails** — replace gradient lobby cards with actual screenshot thumbnails.
- ✅ **Settings screen** — Master/Music/SFX sliders, Shadows toggle, Particles toggle. All persist via localStorage.
- ✅ **Tutorial popup** — full keyboard + controller control reference shown on first launch (localStorage flag). Dismissed by clicking GOT IT or pressing Esc.
- ✅ **Lobby chat** — text chat in lobby broadcast to all players via Socket.IO.
- ✅ **Ping display** — live ms counter in top-right of HUD; colour-coded green/amber/red.
- ✅ **Lobby background** — arenabackground.jpg shown behind lobby panels.
- ✅ **Duplicate name check** — server rejects playerReady if another player already has that name; client re-enables the button with a red error message.

---

## 5. Technical / Architecture

### 5.1 Server
- ✅ **Shared constants** — server.js imports game constants from `gameConstants.js`.
- **Enemy AI fallback** — if the host disconnects mid-wave, enemies freeze. Add server-side minimal AI after 5 s of no sync packets.
- ✅ **Rate limiting** — bulletHit, enemyMeleeAttempt, chatMessage are rate-limited per socket.
- ✅ **Leaderboard uniqueness** — session-token-keyed dedup.
- **Reconnection window** — in-progress game state is held in memory. Write to a `session.json` that survives server restarts.

### 5.2 Client Performance
- **Instanced mesh for repeated props** — convert repeated BoxGeometry props to `THREE.InstancedMesh` to cut draw calls by 40–60%.
- **Texture atlas** — a shared atlas would cut GPU texture swaps.
- **Occlusion culling** — `three-mesh-bvh` for Blacksite.
- **FXAA post-process** — replace MSAA with FXAA for mobile/low-end PCs.
- **LOD for enemy models** — switch GLB enemies to lower-poly versions beyond 40 units.

### 5.3 Networking
- **Delta compression for enemy sync** — only send changed fields per 50 ms tick.
- **Reconnection token persistence** — survive server restarts.

### 5.4 Distribution (Electron)
- ✅ **Installer / .exe** — Electron 42 wraps game as a Windows NSIS installer; `npm run dist`.
- ✅ **Dynamic port selection** — tries 3001, falls back to any free OS port. Prevents conflicts when two instances run on the same machine.
- ✅ **Child process isolation** — server.js runs in a `utilityProcess.fork()` subprocess. Server crashes no longer kill the Electron window; user sees an error dialog and can restart.
- ✅ **Writable data path** — leaderboard and career stats redirect to `userData` folder to avoid Program Files ACL issues.
- **Auto-update** — version check against GitHub releases; prompt to pull latest.


---

## 6. Content / Modes

- **More waves** — scripted events: wave 15 speed buff, wave 20 double skeletons, wave 25 boss + normal enemies.
- **Challenge modifiers** — double enemy speed, no health packs, one-hit-kill.
- **Horde mode** — infinite enemies, pure score, no wave breaks.
- **Co-op revive challenge** — downed players can only be revived by a sword kill nearby.
- **New enemy: Brute Dog** — larger, slower dog with heavy knockback.
- **New enemy: Sniper Skeleton** — bone-throwing skeleton that holds range.
- **Map: Rooftop** — exposed edges, AC units as cover, circling helicopter boss.
- **Map: Bunker** — underground CQB map with T-shaped corridor and two side rooms.
- **Destructible environment** — extend destructibles to thin partition walls (bazooka-only).

---

## Priority Order (if shipping soon)

1. ✅ Hit markers
2. ✅Enemy pathfinding fix (2 h, gameplay critical)
3. ✅ Weapon audio assets — real fire/reload sounds still needed
4. ✅ Damage direction indicator
5. ✅Post-processing bloom (2 h)
6. ✅Map thumbnails for lobby (1 h)
7. ✅ Wave progress bar
8. ✅ Settings screen
9. Instanced mesh for props (4 h, performance)
10. ✅ Electron packager + dynamic port + child process isolation
11. Firewall NSIS rule (1 h, first-run UX)
