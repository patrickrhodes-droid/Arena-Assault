import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { game } from "./state.js";
import {
  CHUNK_SIZE, CHUNK_RES, LOAD_RADIUS, UNLOAD_RADIUS,
  OUTPOST_RADIUS, OUTPOST_BUILD_RADIUS, worldToChunk, chunkKey,
} from "./shared/survivalConfig.js";
import {
  sampleHeight, sampleBiome, sampleSlope, hash2, mulberry32,
  BIOME_MEADOW, BIOME_FROSTPINE, BIOME_ASHFEN, BIOME_CRIMSON,
} from "./shared/noise.js";

function isInsideAnyOutpost(wx, wz) {
  if (Math.hypot(wx, wz) < OUTPOST_RADIUS + 4) return true;
  const outposts = game.outposts || [];
  for (const o of outposts) {
    if (o.id === 'origin') continue;
    const dx = wx - o.x, dz = wz - o.z;
    if (dx * dx + dz * dz < (OUTPOST_BUILD_RADIUS + 4) * (OUTPOST_BUILD_RADIUS + 4)) return true;
  }
  return false;
}

const _gltfLoader = new GLTFLoader();
const _propCache = new Map(); // url -> Promise<GLTF>

// Per-biome scatter prop GLBs. Loaded lazily, cached forever, cloned per instance.
const TREE_GLB_BY_BIOME = {
  [BIOME_MEADOW]:    ['/assets/models/City Props asset pack/Tree.glb'],
  [BIOME_FROSTPINE]: ['/assets/models/City Props asset pack/Tree Long.glb'],
  [BIOME_ASHFEN]:    ['/assets/models/City Props asset pack/Tree.glb'],
  [BIOME_CRIMSON]:   [], // crimson uses primitive crystal spires
};
// Generic ambient scatter — rare props that decorate every biome.
const SCATTER_PROPS = [
  '/assets/models/City Props asset pack/Small Bush.glb',
  '/assets/models/City Props asset pack/Long Bush.glb',
  '/assets/models/shooter asset pack/Crate.glb',
  '/assets/models/shooter asset pack/Pallet.glb',
  '/assets/models/shooter asset pack/Exploding Barrel.glb',
  '/assets/models/shooter asset pack/Cardboard Boxes.glb',
  '/assets/models/shooter asset pack/Sack Trench.glb',
];

function loadGlb(url) {
  if (_propCache.has(url)) return _propCache.get(url);
  const p = new Promise((resolve) => {
    _gltfLoader.load(url, (gltf) => {
      gltf.scene.traverse((n) => {
        if (n.isMesh) { n.castShadow = false; n.receiveShadow = false; }
      });
      resolve(gltf);
    }, undefined, () => resolve(null));
  });
  _propCache.set(url, p);
  return p;
}

const BIOME_COLORS = {
  [BIOME_MEADOW]:    new THREE.Color(0x6fa84a),
  [BIOME_FROSTPINE]: new THREE.Color(0xaabfd6),
  [BIOME_ASHFEN]:    new THREE.Color(0x3a322e),
  [BIOME_CRIMSON]:   new THREE.Color(0x7a2418),
};

const TRUNK_COLOR  = new THREE.Color(0x4a2d1a);
const CROWN_COLOR = {
  [BIOME_MEADOW]:    new THREE.Color(0x3f7a2a),
  [BIOME_FROSTPINE]: new THREE.Color(0x2a4a2a),
  [BIOME_ASHFEN]:    new THREE.Color(0x1a1612),
  [BIOME_CRIMSON]:   new THREE.Color(0xd84020),
};
const ROCK_COLOR = {
  [BIOME_MEADOW]:    new THREE.Color(0x6a6a64),
  [BIOME_FROSTPINE]: new THREE.Color(0x9aa8b4),
  [BIOME_ASHFEN]:    new THREE.Color(0x2a2018),
  [BIOME_CRIMSON]:   new THREE.Color(0x5a1810),
};

// Cached shared materials/geometries — never per-chunk allocations.
let _terrainMaterial = null;
let _trunkGeo = null;
let _trunkMat = null;
let _crownGeoBy = null;
let _crownMatBy = null;
let _rockGeo = null;
let _rockMatBy = null;

function ensureSharedAssets() {
  if (_terrainMaterial) return;
  _terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.02,
    flatShading: false,
  });
  _trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.2, 6);
  _trunkGeo.translate(0, 1.1, 0);
  _trunkMat = new THREE.MeshStandardMaterial({ color: TRUNK_COLOR, roughness: 0.95, flatShading: true });
  _crownGeoBy = {};
  _crownMatBy = {};
  _crownGeoBy[BIOME_MEADOW] = new THREE.ConeGeometry(1.0, 2.4, 7);
  _crownGeoBy[BIOME_MEADOW].translate(0, 3.0, 0);
  _crownGeoBy[BIOME_FROSTPINE] = new THREE.ConeGeometry(0.8, 3.6, 7);
  _crownGeoBy[BIOME_FROSTPINE].translate(0, 3.6, 0);
  _crownGeoBy[BIOME_ASHFEN] = new THREE.ConeGeometry(0.5, 1.6, 5);
  _crownGeoBy[BIOME_ASHFEN].translate(0, 2.6, 0);
  _crownGeoBy[BIOME_CRIMSON] = new THREE.OctahedronGeometry(1.0, 0);
  _crownGeoBy[BIOME_CRIMSON].scale(0.7, 1.6, 0.7);
  _crownGeoBy[BIOME_CRIMSON].translate(0, 2.6, 0);
  for (const b of [BIOME_MEADOW, BIOME_FROSTPINE, BIOME_ASHFEN, BIOME_CRIMSON]) {
    _crownMatBy[b] = new THREE.MeshStandardMaterial({
      color: CROWN_COLOR[b], roughness: 0.85, flatShading: true,
      emissive: b === BIOME_CRIMSON ? new THREE.Color(0x3a0a05) : new THREE.Color(0x000000),
      emissiveIntensity: b === BIOME_CRIMSON ? 0.45 : 0,
    });
  }
  _rockGeo = new THREE.IcosahedronGeometry(0.6, 0);
  _rockMatBy = {};
  for (const b of [BIOME_MEADOW, BIOME_FROSTPINE, BIOME_ASHFEN, BIOME_CRIMSON]) {
    _rockMatBy[b] = new THREE.MeshStandardMaterial({
      color: ROCK_COLOR[b], roughness: 0.95, flatShading: true,
    });
  }
}

// ── InstancedMesh pool (one trunk IM, one crown IM per biome, one rock IM per biome) ──
// Minecraft's core trick: merge all same-material geometry into a single draw call.
// Going from ~1800 individual meshes → ~9 InstancedMesh objects.

const _BIOMES = [BIOME_MEADOW, BIOME_FROSTPINE, BIOME_ASHFEN, BIOME_CRIMSON];

// Cap at (LOAD_RADIUS*2+1)^2 * max density + 30% headroom.
// With LOAD_RADIUS=2: 5×5=25 chunks. 25×8 trees = 200 trunk/crown slots.
// 25×7 rocks = 175, round up.
const TREE_CAPACITY = 256;
const ROCK_CAPACITY = 256;

let _trunkIM = null;
let _trunkAlloc = null;
const _crownIM = {};
const _crownAlloc = {};
const _rockIM = {};
const _rockAlloc = {};

const _dummy = new THREE.Object3D();
const _hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

class SlotAllocator {
  constructor(capacity) {
    this._free = [];
    for (let i = capacity - 1; i >= 0; i--) this._free.push(i);
  }
  alloc() { return this._free.pop(); } // undefined when full
  release(slot) { if (slot != null) this._free.push(slot); }
  releaseAll(slots) { for (const s of slots) this.release(s); }
}

function ensureInstances() {
  if (_trunkIM) return;
  ensureSharedAssets();

  _trunkIM = new THREE.InstancedMesh(_trunkGeo, _trunkMat, TREE_CAPACITY);
  _trunkIM.castShadow = false;
  _trunkIM.receiveShadow = false;
  _trunkIM.frustumCulled = false;
  for (let i = 0; i < TREE_CAPACITY; i++) _trunkIM.setMatrixAt(i, _hiddenMatrix);
  _trunkIM.instanceMatrix.needsUpdate = true;
  game.scene.add(_trunkIM);
  _trunkAlloc = new SlotAllocator(TREE_CAPACITY);

  for (const b of _BIOMES) {
    const cim = new THREE.InstancedMesh(_crownGeoBy[b], _crownMatBy[b], TREE_CAPACITY);
    cim.castShadow = false;
    cim.receiveShadow = false;
    cim.frustumCulled = false;
    for (let i = 0; i < TREE_CAPACITY; i++) cim.setMatrixAt(i, _hiddenMatrix);
    cim.instanceMatrix.needsUpdate = true;
    game.scene.add(cim);
    _crownIM[b] = cim;
    _crownAlloc[b] = new SlotAllocator(TREE_CAPACITY);

    const rim = new THREE.InstancedMesh(_rockGeo, _rockMatBy[b], ROCK_CAPACITY);
    rim.castShadow = false;
    rim.receiveShadow = false;
    rim.frustumCulled = false;
    for (let i = 0; i < ROCK_CAPACITY; i++) rim.setMatrixAt(i, _hiddenMatrix);
    rim.instanceMatrix.needsUpdate = true;
    game.scene.add(rim);
    _rockIM[b] = rim;
    _rockAlloc[b] = new SlotAllocator(ROCK_CAPACITY);
  }
}

function teardownInstances() {
  if (_trunkIM) { game.scene?.remove(_trunkIM); _trunkIM = null; _trunkAlloc = null; }
  for (const b of _BIOMES) {
    if (_crownIM[b]) { game.scene?.remove(_crownIM[b]); delete _crownIM[b]; delete _crownAlloc[b]; }
    if (_rockIM[b])  { game.scene?.remove(_rockIM[b]);  delete _rockIM[b];  delete _rockAlloc[b]; }
  }
}

// ── Terrain mesh (one per chunk, ~450 triangles at CHUNK_RES=16) ──────────────

function buildChunkMesh(cx, cz, seed) {
  ensureSharedAssets();
  const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_RES - 1, CHUNK_RES - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  for (let i = 0; i < pos.count; i++) {
    const localX = pos.getX(i);
    const localZ = pos.getZ(i);
    const wx = baseX + localX + CHUNK_SIZE / 2;
    const wz = baseZ + localZ + CHUNK_SIZE / 2;
    const h = sampleHeight(wx, wz, seed);
    pos.setY(i, h);
    const { id: biomeId } = sampleBiome(wx, wz, seed);
    const c = BIOME_COLORS[biomeId];
    colors[i * 3]     = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, _terrainMaterial);
  mesh.receiveShadow = true;
  // Terrain doesn't need to cast shadow — the shadow comes from above and the
  // ground receiving is what matters. Disabling castShadow halves shadow draw calls.
  mesh.castShadow = false;
  mesh.position.set(baseX + CHUNK_SIZE / 2, 0, baseZ + CHUNK_SIZE / 2);
  return mesh;
}

function getCachedGlbSync(url) {
  const entry = _propCache.get(url);
  if (!entry) return null;
  return entry.__resolved || null;
}

let _glbPreloadStarted = false;
function preloadSurvivalGlbs() {
  if (_glbPreloadStarted) return;
  _glbPreloadStarted = true;
  const urls = new Set(SCATTER_PROPS);
  for (const arr of Object.values(TREE_GLB_BY_BIOME)) arr.forEach(u => urls.add(u));
  for (const url of urls) {
    const p = loadGlb(url);
    p.then((gltf) => { if (gltf) p.__resolved = gltf; });
  }
}

function placeProp(rng, props, x, z, minDist) {
  for (const p of props) {
    const dx = p.x - x, dz = p.z - z;
    if (dx * dx + dz * dz < minDist * minDist) return false;
  }
  props.push({ x, z });
  return true;
}

// ── Chunk props: trees + rocks via InstancedMesh, scatter props as individual meshes ─

function buildChunkProps(cx, cz, seed) {
  ensureSharedAssets();
  ensureInstances();

  const scatterGroup = new THREE.Group(); // only scatter GLB props go here
  const props = [];           // spatial de-overlap list
  const destructibles = [];
  const obstacleEntries = [];
  const treeSlots = [];       // { trunkSlot, crownSlot, biome } — for cleanup
  const rockSlots = [];       // { slot, biome } — for cleanup

  const rng = mulberry32(hash2(cx, cz, seed));
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;

  const cxw = baseX + CHUNK_SIZE / 2;
  const czw = baseZ + CHUNK_SIZE / 2;
  const { id: chunkBiome } = sampleBiome(cxw, czw, seed);

  const treeDensity = { [BIOME_MEADOW]: 6, [BIOME_FROSTPINE]: 8, [BIOME_ASHFEN]: 4, [BIOME_CRIMSON]: 5 }[chunkBiome] ?? 5;
  const rockDensity = { [BIOME_MEADOW]: 3, [BIOME_FROSTPINE]: 4, [BIOME_ASHFEN]: 6, [BIOME_CRIMSON]: 7 }[chunkBiome] ?? 4;

  // ── Trees (instanced trunk + crown, no shadow, one draw call each across all chunks) ──
  for (let i = 0; i < treeDensity; i++) {
    const wx = baseX + rng() * CHUNK_SIZE;
    const wz = baseZ + rng() * CHUNK_SIZE;
    if (isInsideAnyOutpost(wx, wz)) continue;
    if (sampleSlope(wx, wz, seed) > 0.45) continue;
    if (!placeProp(rng, props, wx, wz, 3.5)) continue;

    const y = sampleHeight(wx, wz, seed);
    const { id: localBiome } = sampleBiome(wx, wz, seed);
    const s = 0.9 + rng() * 0.45;
    const ry = rng() * Math.PI * 2;

    const trunkSlot = _trunkAlloc?.alloc();
    const crownSlot = _crownAlloc[localBiome]?.alloc();

    if (trunkSlot != null && crownSlot != null) {
      // Write trunk instance matrix
      _dummy.position.set(wx, y, wz);
      _dummy.rotation.set(0, ry, 0);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      _trunkIM.setMatrixAt(trunkSlot, _dummy.matrix);
      _trunkIM.instanceMatrix.needsUpdate = true;

      // Crown shares the same world transform (geometry is pre-shifted upward)
      _crownIM[localBiome].setMatrixAt(crownSlot, _dummy.matrix);
      _crownIM[localBiome].instanceMatrix.needsUpdate = true;

      const propId = `tree_${cx}_${cz}_${i}`;
      const half = 0.9 * s;
      const obsEntry = {
        min: { x: wx - half, z: wz - half },
        max: { x: wx + half, z: wz + half },
        h: y + 4.5 * s, yMin: y,
      };
      game.oBs.push(obsEntry);
      obstacleEntries.push(obsEntry);

      // Close over the slot indices so triggerDestructible can hide just this instance.
      const _ts = trunkSlot, _cs = crownSlot, _lb = localBiome;
      const hideInst = () => {
        _trunkIM.setMatrixAt(_ts, _hiddenMatrix);
        _trunkIM.instanceMatrix.needsUpdate = true;
        _trunkAlloc?.release(_ts);
        _crownIM[_lb]?.setMatrixAt(_cs, _hiddenMatrix);
        if (_crownIM[_lb]) _crownIM[_lb].instanceMatrix.needsUpdate = true;
        _crownAlloc[_lb]?.release(_cs);
        // Remove from tracking so destroyChunk doesn't double-free
        const idx = treeSlots.findIndex(t => t.trunkSlot === _ts);
        if (idx >= 0) treeSlots.splice(idx, 1);
      };

      treeSlots.push({ trunkSlot, crownSlot, biome: localBiome });
      const destEntry = {
        id: propId, hideInst,
        x: wx, z: wz,
        triggerRadius: 2.4 * s,
        obsEntry, alive: true,
        kind: 'tree', biome: localBiome,
        hp: 30, maxHp: 30,
      };
      game.destructibles.push(destEntry);
      destructibles.push(destEntry);
    }
  }

  // ── Rocks (instanced per biome, no shadow) ────────────────────────────────────
  for (let i = 0; i < rockDensity; i++) {
    const wx = baseX + rng() * CHUNK_SIZE;
    const wz = baseZ + rng() * CHUNK_SIZE;
    if (isInsideAnyOutpost(wx, wz)) continue;
    if (!placeProp(rng, props, wx, wz, 2.5)) continue;

    const y = sampleHeight(wx, wz, seed);
    const { id: localBiome } = sampleBiome(wx, wz, seed);
    const s = 0.6 + rng() * 1.4;

    const slot = _rockAlloc[localBiome]?.alloc();
    if (slot != null) {
      _dummy.position.set(wx, y + 0.15 * s, wz);
      _dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      _rockIM[localBiome].setMatrixAt(slot, _dummy.matrix);
      _rockIM[localBiome].instanceMatrix.needsUpdate = true;

      const propId = `rock_${cx}_${cz}_${i}`;
      const halfRock = 0.6 * s;
      const obsEntry = {
        min: { x: wx - halfRock, z: wz - halfRock },
        max: { x: wx + halfRock, z: wz + halfRock },
        h: y + 0.5 * s, yMin: y,
      };
      game.oBs.push(obsEntry);
      obstacleEntries.push(obsEntry);

      const _sl = slot, _lb = localBiome;
      const hideInst = () => {
        _rockIM[_lb]?.setMatrixAt(_sl, _hiddenMatrix);
        if (_rockIM[_lb]) _rockIM[_lb].instanceMatrix.needsUpdate = true;
        _rockAlloc[_lb]?.release(_sl);
        const idx = rockSlots.findIndex(r => r.slot === _sl);
        if (idx >= 0) rockSlots.splice(idx, 1);
      };

      rockSlots.push({ slot, biome: localBiome });
      const destEntry = {
        id: propId, hideInst,
        x: wx, z: wz,
        triggerRadius: 1.4 * s,
        obsEntry, alive: true,
        kind: 'rock', biome: localBiome,
        hp: 80, maxHp: 80,
      };
      game.destructibles.push(destEntry);
      destructibles.push(destEntry);
    }
  }

  // ── Scatter props (GLB-based decorative clutter, rare) ───────────────────────
  const scatterDensity = 3;
  for (let i = 0; i < scatterDensity; i++) {
    if (rng() > 0.55) continue;
    const wx = baseX + rng() * CHUNK_SIZE;
    const wz = baseZ + rng() * CHUNK_SIZE;
    if (isInsideAnyOutpost(wx, wz)) continue;
    if (sampleSlope(wx, wz, seed) > 0.5) continue;
    if (!placeProp(rng, props, wx, wz, 2.2)) continue;
    const url = SCATTER_PROPS[Math.floor(rng() * SCATTER_PROPS.length)];
    const cached = getCachedGlbSync(url);
    if (!cached) continue;
    const propMesh = cached.scene.clone(true);
    propMesh.traverse((n) => { if (n.isMesh) { n.castShadow = false; n.receiveShadow = false; } });
    const s = 0.7 + rng() * 0.6;
    propMesh.scale.setScalar(s);
    propMesh.rotation.y = rng() * Math.PI * 2;
    propMesh.position.set(wx, sampleHeight(wx, wz, seed), wz);
    scatterGroup.add(propMesh);
  }

  return { scatterGroup, destructibles, obstacleEntries, treeSlots, rockSlots };
}

function destroyChunk(record) {
  // Remove terrain mesh
  if (record.mesh) {
    record.mesh.geometry?.dispose();
    record.mesh.parent?.remove(record.mesh);
  }
  // Remove scatter props
  if (record.scatterGroup) {
    record.scatterGroup.parent?.remove(record.scatterGroup);
  }
  // Release tree instance slots
  for (const ts of record.treeSlots || []) {
    if (_trunkIM) { _trunkIM.setMatrixAt(ts.trunkSlot, _hiddenMatrix); _trunkIM.instanceMatrix.needsUpdate = true; }
    _trunkAlloc?.release(ts.trunkSlot);
    if (_crownIM[ts.biome]) { _crownIM[ts.biome].setMatrixAt(ts.crownSlot, _hiddenMatrix); _crownIM[ts.biome].instanceMatrix.needsUpdate = true; }
    _crownAlloc[ts.biome]?.release(ts.crownSlot);
  }
  // Release rock instance slots
  for (const rs of record.rockSlots || []) {
    if (_rockIM[rs.biome]) { _rockIM[rs.biome].setMatrixAt(rs.slot, _hiddenMatrix); _rockIM[rs.biome].instanceMatrix.needsUpdate = true; }
    _rockAlloc[rs.biome]?.release(rs.slot);
  }
  // Remove obstacle entries
  for (const entry of record.obstacleEntries) {
    const idx = game.oBs.indexOf(entry);
    if (idx >= 0) game.oBs.splice(idx, 1);
  }
  // Remove destructibles owned by this chunk
  for (const d of record.destructibles) {
    const idx = game.destructibles.indexOf(d);
    if (idx >= 0) game.destructibles.splice(idx, 1);
  }
}

// Cap how many chunks we build per frame.
const MAX_CHUNK_BUILDS_PER_FRAME = 2;

export function updateChunkStreaming(playerPos) {
  if (game.mode !== 'SURVIVAL') return;
  if (!game.scene || !game.arenaGroup) return;
  preloadSurvivalGlbs();
  const seed = game.terrainSeed | 0;
  const [pcx, pcz] = worldToChunk(playerPos.x, playerPos.z);
  const want = new Set();
  for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
    for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
      want.add(chunkKey(pcx + dx, pcz + dz));
    }
  }
  // Sort missing chunks by proximity so the player's immediate area loads first.
  const missing = [];
  for (const key of want) {
    if (game.chunks.has(key)) continue;
    const [cx, cz] = key.split('|').map(Number);
    const ddx = cx - pcx, ddz = cz - pcz;
    missing.push({ key, cx, cz, dist: ddx * ddx + ddz * ddz });
  }
  missing.sort((a, b) => a.dist - b.dist);
  const budget = Math.min(MAX_CHUNK_BUILDS_PER_FRAME, missing.length);
  for (let i = 0; i < budget; i++) {
    const { key, cx, cz } = missing[i];
    const mesh = buildChunkMesh(cx, cz, seed);
    game.arenaGroup.add(mesh);
    const { scatterGroup, destructibles, obstacleEntries, treeSlots, rockSlots } = buildChunkProps(cx, cz, seed);
    game.arenaGroup.add(scatterGroup);
    game.chunks.set(key, { mesh, scatterGroup, destructibles, obstacleEntries, treeSlots, rockSlots, cx, cz });
  }
  // Unload chunks outside the unload radius
  for (const [key, record] of game.chunks) {
    const dx = record.cx - pcx;
    const dz = record.cz - pcz;
    if (Math.abs(dx) > UNLOAD_RADIUS || Math.abs(dz) > UNLOAD_RADIUS) {
      destroyChunk(record);
      game.chunks.delete(key);
    }
  }
}

export function disposeAllChunks() {
  for (const [, record] of game.chunks) destroyChunk(record);
  game.chunks.clear();
  teardownInstances();
}
