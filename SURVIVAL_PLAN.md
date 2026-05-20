# Survival Mode — Implementation Plan

## Context

Arena Assault today ships four game modes (Endless, Campaign, PvP, FFA) that all run on hand-authored 144×144 maps loaded from `public/maps/*.json`. The player has score and kills but no spendable currency, no shop, no day/night, and the world is a single 4000×4000 flat plane bounded at ±72 units (`HALF`).

The user asked for a fifth mode — **Survival** — that breaks all of those assumptions: a procedurally-generated, ever-expanding heightfield world streamed in chunks; biome-driven enemy mixes that get nastier the further you wander; a return-to-outpost shop where you spend per-kill bounties on new guns and gear; a placeable/equippable torch; destructible trees and rocks; a jetpack from the shop bound to double-tap space; and a day/night cycle (day twice as long as night) with the sun animating the lighting.

User-locked decisions:
- **Permadeath party-wipe** semantics: solo death → respawn at outpost with $0 (best-run stats persist); whole party down simultaneously → run ends.
- **Outpost-only shop** at world origin (no portable buy menu).
- **Ship everything in one drop** — all 8 phases land together.
- **Cross-mode improvements OK** if they don't break the existing four modes — shared utilities (heightfield collision, animated sun) can live in common code as long as the other modes' behaviour is unchanged.
- **Inventory is a reorderable Minecraft-style hotbar** (not the existing rigid `WEAPON_ORDER` slot map). Shop sells **weapons, potions, torches, and backpacks** — backpacks expand capacity beyond the 9-slot hotbar. Drag-and-drop reorder.

The intended outcome is a distinctively different mode that brings Valheim/Deep Rock Galactic exploration loops to the existing FPS engine without rewriting it. Survival reuses the destructible-prop pipeline, the item-drop networking pattern, the existing enemy factories, the rejoin/epoch system, and the rate-limit helpers wherever possible.

---

## Architecture Decision

**Survival is a fifth top-level mode**, not a `gameMode` inside `startMatch`. Justification: COOP's `tickWave` is structured around a `WAIT → SPAWNING → ACTIVE` state machine ([server.js:1059](server.js#L1059)) that doesn't fit a continuous distance-driven spawner. Adding `if (gameMode === 'survival') return;` at the top of every wave function would be invasive and bug-prone. Cleaner: a sibling `tickSurvival(dt)` triggered by `currentMode === 'SURVIVAL'`, mirroring how PvP/FFA already branch.

Server dispatch: new socket handler `startSurvivalMatch` next to [`startPvPMatch` (server.js:1839)](server.js#L1839) and [`startFFAMatch` (server.js:1876)](server.js#L1876). Mode value: `currentMode = 'SURVIVAL'`, `gameState.mode = 'SURVIVAL'`. Client branches on `game.mode === 'SURVIVAL'` (set from `matchStarted` payload in [network.js:348](public/src/network.js#L348)).

Match epoch + reconnect system ([server.js:751](server.js#L751)) is reused as-is — Survival lives inside one `gameState`, so rejoin tokens already work.

---

## Phase Plan (all ship together)

### Phase 1 — Shared deterministic noise + heightfield-aware collision

**New file:** `public/src/shared/noise.js` — written so both browser ESM and `server.js` (`import`) load it. Exports:
- `mulberry32(seed)` — seeded PRNG.
- `hash2(ix, iz, seed)` — integer hash for per-cell decisions.
- `simplex2(x, z, seed)` — 2D simplex (ported in-house — no NPM dependency; ULP drift between client/server is the #1 determinism risk).
- `fbm2(x, z, seed, octaves=4, lacunarity=2.0, gain=0.5)` — multi-octave.
- `sampleHeight(x, z, seed)` — canonical heightfield: `fbm2(x*0.012,z*0.012,seed)*14 + fbm2(x*0.05,z*0.05,seed^1,2)*2`.
- `sampleBiome(x, z, seed)` — low-frequency simplex thresholded into 4 zones.

**Edit `public/src/collision.js`:**
- `getSupportHeight` ([collision.js:55](public/src/collision.js#L55)) — start `support` at `sampleHeight(px, pz, game.terrainSeed)` when `game.mode === 'SURVIVAL'`, then run the existing AABB walk (lets rocks/torches stack on terrain). Other modes keep `support = 0`.
- `bulletHitObstacle` ([collision.js:88](public/src/collision.js#L88)) — `HALF` clamp gated `if (game.mode !== 'SURVIVAL')`. Survival uses a soft ±4000 sanity bound or a 10-second bullet lifetime instead.

**Server mirror:** add `sampleHeightAt(x,z)` helper and use it wherever enemy `y` is computed (search `e.y =` in [server.js](server.js)).

**Player movement:** in `public/src/player.js`, gate the `HALF`-based position clamp on `game.mode !== 'SURVIVAL'`.

This phase is the foundation — everything else needs it.

### Phase 2 — Chunk streaming

**New file:** `public/src/shared/survivalConfig.js`:
- `CHUNK_SIZE = 64`, `CHUNK_RES = 32` (~2k tris/chunk), `LOAD_RADIUS = 3` (7×7 = 49 chunks ≈ 448 units; comfortably inside camera `far=200` + fog), `UNLOAD_RADIUS = 4` (hysteresis).

**New file:** `public/src/chunkManager.js`:
- `game.chunks: Map<"cx|cz", { mesh, propsGroup, destructibles, obstacleHandles, biome }>`.
- `buildChunkMesh(cx, cz)` — `PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_RES-1, CHUNK_RES-1)`, vertex-displaced by `sampleHeight`, vertex-coloured by `sampleBiome`. Shared `MeshStandardMaterial` per biome (vertex colors enabled) — never create per-chunk materials, or GPU memory grows unbounded.
- `buildChunkProps(cx, cz)` — deterministic placement via `mulberry32(hash2(cx, cz, seed))`: trees, rocks, ambient grass. Rejection sample on slope > 0.4 and on a 12-unit outpost safe radius. All instances registered into `game.destructibles` with deterministic ids `tree_${cx}_${cz}_${i}` so server and client agree.
- `updateChunkStreaming(playerPos)` — called from the per-frame render loop. Diff loaded vs target chunk set. New chunks → build mesh+props, push AABBs onto `game.oBs`, store the contiguous index range in `obstacleHandles`. Dropped chunks → `geometry.dispose()`, splice their AABB range out of `game.oBs`, prune `game.destructibles`.
- Edge vertices align on integer chunk boundaries so neighbour chunks share heights exactly — no seam stitching.

**Server mirror:** mesh-free version of the same logic. Server keeps `gameState.chunkObstacles` as a parallel structure for `pickSpawnPos` / collision. Chunks load per player (union of all players' radii).

**Existing GLB cache + loader (`_glbCache` in [mapLoader.js:313](public/src/mapLoader.js#L313))** is reused for tree/rock GLBs.

### Phase 3 — Survival dispatch, distance-driven spawning, money

**`server.js`:**
- New `startSurvivalMatch` handler: rate-limited (reuse `checkRateLimit` 750ms), picks `gameState.terrainSeed = (Math.random()*1e9)|0`, `gameState.dayTimeSec = 0`, broadcasts `matchStarted { mode:'SURVIVAL', terrainSeed, dayTimeSec }`. Builds the outpost from a hand-authored `public/maps/survival_outpost.json` loaded once via existing `loadMapJson`.
- `tickSurvival(dt)`:
  1. Advance `gameState.dayTimeSec`.
  2. Ensure server chunks loaded for every alive player.
  3. Per loaded chunk containing a player, target enemy density = `f(distFromOrigin, biome)`. Spawn via `spawnSurvivalEnemy(cx, cz, biome, mult)` which calls the existing `makeSkeleton`/`makeSoldier`/`makeDog`/`makeMiniBoss` factories from [server.js:936](server.js#L936) area, then multiplies HP/maxHp/atkDmg/spd by `mult`.
  4. `MAX_LIVE_ENEMIES` already exists ([server.js:431](server.js#L431)) — keep it but compute `globalEnemyBudget = min(MAX_LIVE_ENEMIES, alivePlayers.length * 8)`.
  5. GC enemies > 220 units from every player; broadcast `enemyDespawned`.
- `difficultyAt(x, z) = 1 + Math.hypot(x, z) / 120` — HP/dmg roughly doubles every 120 units out.
- Spawn position picker: replace arena-edge `pickSpawnPos` ([server.js:891](server.js#L891)) with `pickSurvivalSpawnPos(playerPos)` — random ring 40–90 units around player, behind their facing, on chunk-loaded terrain, not in outpost safe zone.

**Money:**
- Add `players[id].money = 0` on connect (initial $50 on match start so they can afford first ammo).
- New persistent fields on `careerStats.json` (already exists at [server.js:216](server.js#L216)): `survivalBestMoney`, `survivalDeepestDistance`, `survivalDeathCount`.
- Hook into existing kill-resolution path (search for `score +=` in server.js combat handlers) — also call `awardMoney(killerId, enemy)` → `players[id].money += baseBounty(enemy.type) * difficultyAt(enemy.x, enemy.z) * biomeBonus(enemy.biome)`. Broadcast `moneyUpdated { playerId, money, delta, reason }`.

**Permadeath wiring:**
- Solo player death: re-use existing `playerDied` handler; in Survival mode, on death set `players[id].money = 0` and respawn at outpost (existing respawn flow can be extended). Keep `survivalBestMoney`/`survivalDeepestDistance` in `careerStats.json`.
- Party wipe (all alive players downed at once): new server check inside `tickSurvival` — if `allAlivePlayers.every(p => p.isAlive === false || p.isDowned)` for ≥3s, end the run, emit `survivalRunEnded { stats }`, save to career, transition all clients to the gameover screen.

**Client:**
- `network.js` handlers for `moneyUpdated`, `survivalRunEnded`.
- HUD: when `game.mode === 'SURVIVAL'`, replace the wave counter with money (`$1,234`) and a small "distance from home: 312u" stat.
- Floating world-space toast on kill: `+$12`.

### Phase 4 — Outpost, shop UI, jetpack, day/night

**Outpost:** `public/maps/survival_outpost.json` — small fixed building, vendor NPC mesh (reuse an existing GLB if there's a friendly model, otherwise placeholder cylinder), bonfire centerpiece, 12-unit safe radius enforced server-side (enemies despawn or retreat inside it; players can't fire weapons within 12u of vendor to prevent grief).

**Shop UI:** new `public/src/ui/shopUI.js`. Activation: `E` within 3 units of vendor opens a modal. Closes on `Esc` or `E` again.

Server events:
- `shopOpen` (C→S empty) → `shopCatalog { items:[{id,name,price,kind,icon}] }`.
- `shopPurchase { itemId, qty }` (C→S). Server validates alive + within 3u + money sufficient.
- `shopPurchased { playerId, itemId, qty, money }` to buyer + `moneyUpdated` to others.
- `shopRejected { reason:'distance'|'broke'|'unknown' }`.

Initial catalog (server-side `survivalShopCatalog` const, easy to tune):

| Item id | Kind | Price | Stack | Effect |
|---|---|---|---|---|
| `pistol_ammo` | consumable | $20 | 8 | Refills pistol mag stockpile |
| `shotgun` | weapon | $150 | 1 | Adds to inventory |
| `assault_rifle` | weapon | $250 | 1 | — |
| `sniper_rifle` | weapon | $400 | 1 | — |
| `bazooka` | weapon | $700 | 1 | — |
| `jetpack` | gear | $500 | 1 | Equip flag; double-tap-space |
| `torch_placeable` | placeable | $30 | 8 | Equip + place with G |
| `medkit` | consumable | $80 | 4 | Instantly heal +60 HP |
| `potion_health` | consumable | $60 | 8 | Heal +60 HP over 4s |
| `potion_speed` | consumable | $90 | 8 | +50% move speed, 12s |
| `potion_jump` | consumable | $70 | 8 | +50% jump impulse, 12s |
| `potion_fuel` | consumable | $120 | 8 | Refill jetpack fuel instantly |
| `potion_damage` | consumable | $150 | 8 | +25% damage dealt, 20s |
| `backpack_small` | gear | $300 | 1 | Stash row 1 (+9 slots) |
| `backpack_large` | gear | $800 | 1 | Stash row 2 (+9 slots, requires small) |

**Jetpack:**
- Server-recognized: `players[id].hasJetpack = true` after purchase.
- Client: mirror `wLastTapTime` double-tap pattern ([player.js:284](public/src/player.js#L284)). Add `spaceLastTapTime` in `state.js`. In keydown Space handler ([player.js:300](public/src/player.js#L300)): if `game.hasJetpack && now - spaceLastTapTime < 280 && game.localPlayerIsAlive` → toggle `game.jetpackActive = true`.
- While active + Space held: `playerVelY = min(playerVelY + 28*dt, 12)`, drain `game.jetpackFuel` (max 100, refills 20/s on ground). Disable on Space release or fuel=0.
- Server: trust client `vy` but clamp upward to 12 m/s; existing position validation catches teleports.
- Visual: small particle emitter at player feet (reuse `spawnParticles`), looped jet SFX (low priority — placeholder OK for v1).

**Day/Night cycle:** new file `public/src/dayNight.js`.
- 180s cycle = 120s day + 60s night (2:1 ratio user requested).
- `theta = (dayTimeSec / 180) * 2π`. Sun direction `(cos θ, sin(θ + 0.1), 0.3*sin(2θ))` normalized × 200.
- Per-frame `tickDayNight(dt)`:
  - `sunLight.position` updated.
  - `sunLight.intensity = lerp(0.05, 1.1, max(0, sinY))`.
  - `sunLight.color` lerps through sunrise/midday/sunset palettes.
  - `scene.background` + `scene.fog.color` lerp between biome `day`/`night` palettes.
  - `hemisphereLight.intensity` lerps.
- `sunLight.shadow.needsUpdate = true` only every 4th frame to avoid per-frame shadow-map regen.
- Server is authoritative for `dayTimeSec`. Broadcast `worldTime { dayTimeSec, serverNow }` on match start and every 10s; client interpolates locally between syncs.

### Phase 4.5 — Inventory + hotbar overhaul (Minecraft-style)

Survival replaces the rigid `Digit1..Digit9 → WEAPON_ORDER[i]` mapping ([player.js:309](public/src/player.js#L309)) with a **per-player inventory of 9 slots** that the player drags to reorder. Backpacks add 9 or 18 extra "stash" slots that are visible only when the inventory panel is open. Other modes keep the existing weapon-cycle behaviour untouched — this is a Survival-gated change.

**Server data model** (in `players[id]`):
- `inventory: Array<Slot | null>` length 9 (hotbar) + 0/9/18 stash depending on backpack tier. `Slot = { itemId: string, qty: number }`.
- `inventoryWidth: 9` (hotbar) constant; total length depends on `backpackTier` (0/1/2 → 9/18/27).
- `activeSlot: number` 0–8 — which hotbar slot is currently equipped/held.
- `effects: { speed?: { until }, jump?: { until }, damage?: { until } }` — active potion timers.

On match start (`startSurvivalMatch`): `inventory[0] = { itemId:'pistol', qty:1 }`, rest `null`. `backpackTier = 0`, `activeSlot = 0`.

**Adding to inventory** (called from `shopPurchase`, `pickupSpawned`, weapon drops):
1. If item is stackable (`stackSize > 1`), find a slot with matching `itemId` and `qty < stackSize`; add there.
2. Else find first empty slot. Hotbar (0..8) first, then stash.
3. If full → server emits `inventoryFull { itemId }`; shop refunds money (don't deduct on `shopPurchase` until add succeeds).

**Socket events** (all rate-limited 250ms via `checkRateLimit`):
- `inventoryReorder { from: int, to: int }` (C→S) — swap two slots. Server validates indices, applies swap, emits `inventorySynced { inventory, activeSlot, effects }`.
- `inventorySetActive { slot: int }` (C→S) — change hotbar active slot. Server broadcasts to other players for third-person visuals.
- `inventoryUseSlot { slot: int }` (C→S) — for consumables. Server applies effect, decrements qty, emits `inventorySynced`.
- `inventorySynced { inventory, activeSlot, effects }` (S→owner) on any change.

**Client UI** — new `public/src/ui/inventoryUI.js` + markup in [public/index.html](public/index.html):
- **Hotbar:** 9 slot tiles fixed bottom-center of screen. Active slot has a highlighted ring. Each tile shows item icon + qty badge (top-right) for stackables. Hidden in non-Survival modes.
- **Inventory panel:** open with `Tab` (or `I`); shows hotbar row + stash rows. Drag a slot onto another → emits `inventoryReorder`. Optimistic local swap immediately; server `inventorySynced` is authoritative.
- **Mouse wheel** cycles `activeSlot` ±1 (Survival only; replaces existing `cycleWeapon` for Survival).

**Digit-key handler** ([player.js:309-321](public/src/player.js#L309-L321)) — gate the existing `WEAPON_ORDER` loop behind `if (game.mode !== 'SURVIVAL')`. In Survival branch:
```js
if (digitMatch) {
  const slot = Number(digitMatch[1]) - 1;
  game.socket.emit('inventorySetActive', { slot });
}
```

**Using a slot:** if the active slot's item is a `weapon` kind → it's equipped (existing weapon system unchanged downstream of `game.currentWeapon`). If it's a `consumable` → primary-fire (LMB) or a dedicated `Q` key triggers `inventoryUseSlot`. If it's `placeable` (torch) → `G` triggers placement and decrements qty.

**Effect application** (server-side per-tick in `tickSurvival`):
- Sweep `players[id].effects` — expire timers, broadcast `effectExpired { kind }`.
- Client visuals: small icon row above the hotbar showing active effects + countdown.

**Backpacks:** purchasing `backpack_small` sets `backpackTier = max(1, current)` and grows `inventory.length` to 18 (preserving existing items). `backpack_large` requires `backpackTier >= 1` and grows to 27. Backpacks can't be sold back in v1.

**Permadeath wipe:** clear `inventory` to default, `backpackTier = 0`, `money = 0`. Best-run stats keep their post-mortem snapshot.

### Phase 5 — Biomes (4)

| Biome | Vibe | Ground tint | Fog tint | Tree GLB (placeholder if missing) | Enemy weights (skel/soldier/dog/mini) | Money ×  |
|---|---|---|---|---|---|---|
| Meadow | Valheim spawn meadow | `#6fa84a` | `#cfe6c2` | broadleaf | 70/25/5/0 | 1.0 |
| Frostpine | dark conifer + snow patches | `#aabfd6` | `#b8c6d6` | pine | 40/30/25/5 | 1.4 |
| Ashfen | volcanic charcoal + embers | `#3a322e` | `#5a3a30` | burnt snag | 30/20/40/10 | 1.7 |
| Crimson | DRG-style hostile depths | `#7a2418` | `#3a0c0c` | crystal spire | 10/30/40/20 | 2.2 |

Biome boundaries: separate low-frequency simplex (period ~400u) thresholded into 4 zones; smooth vertex-color blending over ~20u at borders. Trees per chunk capped 12, rocks 8.

### Phase 6 — Destructible trees + rocks

Reuses existing pipeline: `loadDestructibleJson` ([mapLoader.js:405](public/src/mapLoader.js#L405)) → `triggerDestructible(propId, origin, processHit)` ([combat.js:697](public/src/combat.js#L697)) → `propDestroyed` broadcast. Apply the same shape to procedural trees/rocks:
- On chunk load, push destructible entries into `game.destructibles` (client) and `gameState.chunkDestructibles[chunkKey]` (server) with deterministic ids.
- Tree HP: ~30 (pistol-killable in 1 mag). Rock HP: ~80 (gates Crimson ore behind shotgun+).
- On destroy: emit `propDestroyed` (existing), spawn money/wood/stone pickup at base via a new `pickupSpawned { id, kind:'wood'|'stone'|'money', x, z, amount }` (mirrors `weaponDropSpawned` net pattern). Trees do a 0.6s client-side fall-over animation before despawning.

Wood/stone is **money-on-pickup** for v1 (i.e. they convert to currency, no crafting). Decision room kept open for V2 crafting.

### Phase 7 — Torches (equip + place)

- Buy `torch_placeable` from shop → stacks into inventory (Phase 4.5).
- **Equipped torch:** when the active hotbar slot is `torch_placeable`, attach a `PointLight(0xffaa55, 1.4, 12)` to the held-item bone in the FPV rig and show a placeholder torch mesh. No damage, no muzzle. This piggybacks on the existing first-person mount used by weapons.
- **Placement:** press `G` while a torch is the active hotbar slot → `placeTorch { x, z }` to server. Server validates ground via `sampleHeight`, decrements the slot's qty (deleting the slot if qty hits 0), assigns id, broadcasts `torchPlaced { id, ownerId, x, y, z }`. Persists in `gameState.placedTorches[]`. Client adds mesh + point light.
- Hard cap: 8 simultaneously-rendered point lights (Three.js perf cliff). Implement `nearestNLights(playerPos, n)` filter per frame; extra torches keep their mesh but no light.

### Phase 8 — Creative additions

All shipping in v1 per user choice:

1. **Blood Moon** — random night every ~5 nights (deterministic per seed + day count): red fog, sun moon turns crimson, enemy density ×3, enemy speed ×1.2, all kills pay ×2. Flag broadcast in next `worldTime` packet.
2. **Ore veins** in Frostpine/Crimson — rare glowing destructible rocks; drop `iron`/`crystal` as a second-tier currency for top-shelf shop items.
3. **Scout Drones** — passive flying enemy; on spotting a player, pings their location for 30s so nearby enemies converge. Forces movement.
4. **Crashed Supply Pods** — every ~3 in-game days a pod streaks across the sky and lands at a seeded chunk; opening it grants a random rare weapon or large cash. Visible flare from anywhere on the map.
5. **Roaming Champion** — every 4 days, a "Forgotten Champion" miniboss spawns deterministically at a far chunk; rare drops.
6. **Caravan event** — once per day an NPC vendor with a different (premium) catalog spawns at a random chunk for 90s; map ping hint.
7. **Endless Distance Records** — surface `survivalDeepestDistance` in HUD + persist; long-term progression with zero new systems.
8. **Weather** *(stretch within the drop)* — fog banks roll across Ashfen at random; if dev time is tight, ship without this.

---

## Critical Files

- [server.js](server.js) — add `startSurvivalMatch`, `tickSurvival`, money + permadeath + outpost validation, server-side noise + chunk obstacles.
- [public/src/collision.js](public/src/collision.js) — heightfield-aware `getSupportHeight`, gated `HALF` clamp in `bulletHitObstacle`.
- [public/src/player.js](public/src/player.js) — double-tap-space jetpack, gated `HALF` movement clamp, torch `G`-place key.
- [public/src/mapLoader.js](public/src/mapLoader.js) — outpost JSON loading reuses existing flow; destructible registration helpers extracted for chunk reuse.
- [public/src/network.js](public/src/network.js) — handlers for `moneyUpdated`, `shopPurchased`, `shopRejected`, `torchPlaced`, `pickupSpawned`, `worldTime`, `survivalRunEnded`.
- [public/src/scene.js](public/src/scene.js) — wire up `tickDayNight` into the render loop; switch sun light to mutable position.
- [public/src/ui.js](public/src/ui.js), [public/index.html](public/index.html) — fifth mode card, HUD money/distance, run-ended screen.
- [public/src/config.js](public/src/config.js) — add Survival entry to `MAP_DEFS`-style lookup if relevant; add `'torch_held'` to `WEAPON_ORDER` so number-key bind works.

**New files:**
- `public/src/shared/noise.js`, `public/src/shared/survivalConfig.js`
- `public/src/chunkManager.js`
- `public/src/dayNight.js`
- `public/src/ui/shopUI.js`
- `public/src/ui/inventoryUI.js`
- `public/maps/survival_outpost.json`

---

## Reused Existing Systems (do not rewrite)

- **GLB cache + loader**: `_glbCache` / `_gltfLoader` ([mapLoader.js:313](public/src/mapLoader.js#L313)).
- **Destructible registration**: `loadDestructibleJson` pattern ([mapLoader.js:405](public/src/mapLoader.js#L405)) — clone, push to `game.destructibles`, push AABB to `game.oBs`.
- **Destructible trigger**: `triggerDestructible` ([combat.js:697](public/src/combat.js#L697)) and `propDestroyed` broadcast.
- **Item-drop networking**: `weaponDropSpawned` / `pickupWeaponDrop` ([server.js:1183 area](server.js#L1183)) — copy shape for `pickupSpawned` and `torchPlaced`.
- **Rate-limit helper**: `checkRateLimit` ([server.js:436](server.js#L436)) — wrap new events (`shopPurchase` 500ms, `placeTorch` 250ms, `startSurvivalMatch` 750ms).
- **Reconnect / epoch**: `gameState.matchEpoch` + `recentlyDisconnected[token]` work as-is because Survival lives inside `gameState`.
- **Pause**: `isGamePausedForAlivePlayers` ([server.js:681](server.js#L681)) — extend to also pause `tickSurvival` (skip the call when paused, mirroring `tickWave`).
- **Career stats**: append `survivalBestMoney`, `survivalDeepestDistance`, `survivalDeathCount` to the existing 5s debounced save at [server.js:234](server.js#L234).
- **Weapon hotkey loop**: the `Digit1..Digit9 → WEAPON_ORDER[i]` regex loop in [player.js:309](public/src/player.js#L309) means adding `torch_held` to `WEAPON_ORDER` auto-wires its number key.

---

## Risks & Mitigations

1. **Float-point determinism between server (Node) and browser (V8 too, but different version possible)** — ship one `noise.js`, no NPM port. Add a debug socket round-trip `debugSampleHeight {x,z}` for hot-spotting drift during dev.
2. **Heightfield collision under jetpack landings on slopes** — `getSupportHeight` is point-sample. Add a 3-sample downward check (forward-of-velocity, current, behind) and take max; snap when within 0.3u of terrain.
3. **Enemy AI on hills** — current AI assumes flat ground. Add a single-step slope check: `if (slope > 0.7) sidestep instead of advance`. Cap enemy speed by local slope: `spd *= 1 - clamp(slope, 0, 0.6)`. Defer real navmesh.
4. **Network volume with players far apart** — server broadcasts all enemy events globally. Mitigation: filter `enemySpawned`/`enemyMoved` by player distance (>250u → skip). Wrap in `io.to(socketId).emit` — modest change inside `tickSurvival`'s broadcast loop.
5. **Dynamic shadow regen cost during day/night** — update `sunLight.shadow.needsUpdate` every 4th frame, not every frame. Follow shadow camera to player (frustum ±60).
6. **GPU memory leaks from per-chunk materials** — one shared `MeshStandardMaterial` per biome with vertex colors. Strict `geometry.dispose()` on chunk unload. Tree/rock destructibles dispose on `propDestroyed`.
7. **Outpost grief** — server-enforce "no weapon fire within 12u of vendor" rule; spectators in outpost can't be damaged.
8. **Permadeath edge case** — what if a 4th player joins mid-run after a wipe? Decision: rejoin only allowed during an active (non-ended) run; party-wipe ends run and forces a fresh `startSurvivalMatch`. Document in the lobby UI ("Joining a Survival run mid-game is allowed; the run ends when everyone dies at once").

---

## Verification

End-to-end checks (in order):

1. **Syntax + boot** — `node --check` every touched file. Start server on a non-default port (`PORT=3091 node server.js`) and confirm `GET /`, `/api/character-config`, `/api/leaderboard` return 200.
2. **Determinism** — open two clients on the same `terrainSeed`. Walk to a tree at (cx=3, cz=-2). Both clients see the tree at the exact same world position. The new `debugSampleHeight` round-trip returns a value within 1e-5 of the local result for 20 random points.
3. **Chunk streaming** — instrument `game.chunks.size` in the HUD. Spawn → 49. Walk 200u east → 49 (different keys). Walk back → 49. Idle for 30s → no GC leak; `game.oBs.length` stable after a full traverse loop.
4. **Heightfield collision** — sprint up a hill of slope ~0.4; player follows terrain without floating or sinking. Jetpack to 60u altitude, cut engine, fall onto a 30° slope; no clipping into mesh.
5. **Day/night** — clock advances 0→180s and loops. Sun arcs sky in matching arc on two clients. Drift correction `worldTime` packet every 10s shows |client - server| < 0.5s after correction.
6. **Money + shop** — kill a meadow skeleton → +$5 toast, HUD updates. Walk 300u into Crimson → kill same skeleton type → ~+$11 (1.0 × 1+300/120 ≈ 3.5x × no-biome-bonus). Open vendor → buy jetpack → money decremented server-authoritative; reject if you try to buy beyond 3u radius.
7. **Jetpack** — double-tap space; thrust drains fuel; lands cleanly. Disable on Space release or empty fuel. Verify second client sees the lift via existing position broadcast.
8. **Destructibles** — shoot a tree → falls + drops money pickup; rock smashes after ~3 shotgun hits → drops stone. Both clients see same destruction.
9. **Inventory** — buy a shotgun + 5 health potions + a torch + small backpack. Hotbar shows them in arrival slots. Press `Tab` → drag shotgun from slot 1 to slot 4; reorder persists after server roundtrip. Press `4` → shotgun equips. Press `5` (potions) → consume one, qty decrements 5→4, HP heals over 4s. Stash row appears with backpack.
10. **Torches** — buy 3 torches; equip via the slot you placed them in; press `G` to place 3 in a triangle; remove one client and confirm all 3 lights persist for the remaining client.
11. **Permadeath** — solo: die → respawn at outpost with $0 and default 9-slot inventory (pistol in slot 0). 2-player party wipe: both downed simultaneously → 3s later `survivalRunEnded` broadcast and gameover screen. Backpacks lost on wipe.
12. **Other modes still work** — start an Endless match, a Campaign match, a PvP and an FFA. No regressions: HP, weapons, wave timing all unchanged. Number keys 1–8 still cycle weapons by `WEAPON_ORDER` index outside Survival (no hotbar UI shown).
13. **Cross-mode shared upgrades** — heightfield collision shouldn't activate in non-Survival modes (`game.mode` guard). Run Endless and confirm flat-ground behaviour identical to pre-change.

Survival is "ready" when steps 1–13 pass and `survivalBestMoney` persists across a server restart.
