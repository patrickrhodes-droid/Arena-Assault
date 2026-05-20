import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { game } from "./state.js";
import {
  CHUNK_SIZE, CHUNK_RES, LOAD_RADIUS, UNLOAD_RADIUS,
  OUTPOST_RADIUS, worldToChunk, chunkKey,
} from "./shared/survivalConfig.js";
import {
  sampleHeight, sampleBiome, sampleSlope, hash2, mulberry32,
  BIOME_MEADOW, BIOME_FROSTPINE, BIOME_ASHFEN, BIOME_CRIMSON,
} from "./shared/noise.js";

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
        if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; }
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
const TRUNK_SNOWY  = new THREE.Color(0x3d2614);
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
  // Meadow: rounded conifer-y blob
  _crownGeoBy[BIOME_MEADOW] = new THREE.ConeGeometry(1.0, 2.4, 7);
  _crownGeoBy[BIOME_MEADOW].translate(0, 3.0, 0);
  // Frostpine: pine, taller + narrower
  _crownGeoBy[BIOME_FROSTPINE] = new THREE.ConeGeometry(0.8, 3.6, 7);
  _crownGeoBy[BIOME_FROSTPINE].translate(0, 3.6, 0);
  // Ashfen: bare burnt trunk top — use a thin cone for branch silhouette
  _crownGeoBy[BIOME_ASHFEN] = new THREE.ConeGeometry(0.5, 1.6, 5);
  _crownGeoBy[BIOME_ASHFEN].translate(0, 2.6, 0);
  // Crimson: crystal spire — sharp octahedron
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
  mesh.position.set(baseX + CHUNK_SIZE / 2, 0, baseZ + CHUNK_SIZE / 2);
  return mesh;
}

function getCachedGlbSync(url) {
  // Promise resolved? Return the GLTF; otherwise return null.
  const entry = _propCache.get(url);
  if (!entry) return null;
  // Trick: if the promise has a .__resolved property we set ourselves, return it.
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

function buildChunkProps(cx, cz, seed) {
  ensureSharedAssets();
  const group = new THREE.Group();
  const props = [];
  const destructibles = [];
  const obstacleEntries = [];

  const rng = mulberry32(hash2(cx, cz, seed));
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;

  // Determine "dominant" biome at the chunk centre for prop density
  const cxw = baseX + CHUNK_SIZE / 2;
  const czw = baseZ + CHUNK_SIZE / 2;
  const { id: chunkBiome } = sampleBiome(cxw, czw, seed);

  const treeDensity = { [BIOME_MEADOW]: 8, [BIOME_FROSTPINE]: 12, [BIOME_ASHFEN]: 4, [BIOME_CRIMSON]: 6 }[chunkBiome] ?? 6;
  const rockDensity = { [BIOME_MEADOW]: 4, [BIOME_FROSTPINE]: 6, [BIOME_ASHFEN]: 9, [BIOME_CRIMSON]: 10 }[chunkBiome] ?? 5;

  // Trees — prefer real GLBs when cached, fall back to primitive cones.
  for (let i = 0; i < treeDensity; i++) {
    const wx = baseX + rng() * CHUNK_SIZE;
    const wz = baseZ + rng() * CHUNK_SIZE;
    // Skip outpost safe zone
    if (Math.hypot(wx, wz) < OUTPOST_RADIUS + 4) continue;
    // Skip steep slopes
    if (sampleSlope(wx, wz, seed) > 0.45) continue;
    if (!placeProp(rng, props, wx, wz, 3.5)) continue;
    const y = sampleHeight(wx, wz, seed);
    const { id: localBiome } = sampleBiome(wx, wz, seed);

    const tree = new THREE.Group();
    const glbUrls = TREE_GLB_BY_BIOME[localBiome] || [];
    const glbUrl = glbUrls[Math.floor(rng() * glbUrls.length)] || null;
    const cached = glbUrl ? getCachedGlbSync(glbUrl) : null;
    if (cached) {
      const clone = cached.scene.clone(true);
      clone.traverse((n) => { if (n.isMesh) n.castShadow = true; });
      tree.add(clone);
    } else {
      const trunk = new THREE.Mesh(_trunkGeo, _trunkMat);
      const crown = new THREE.Mesh(_crownGeoBy[localBiome], _crownMatBy[localBiome]);
      tree.add(trunk);
      tree.add(crown);
      trunk.castShadow = true;
      crown.castShadow = true;
    }
    const s = 0.9 + rng() * 0.45;
    tree.scale.setScalar(s);
    tree.rotation.y = rng() * Math.PI * 2;
    tree.position.set(wx, y, wz);
    group.add(tree);

    const propId = `tree_${cx}_${cz}_${i}`;
    const halfTrunk = 0.32 * s;
    const obsEntry = {
      min: { x: wx - halfTrunk, z: wz - halfTrunk },
      max: { x: wx + halfTrunk, z: wz + halfTrunk },
      h: y + 0.6, yMin: y,
    };
    game.oBs.push(obsEntry);
    obstacleEntries.push(obsEntry);
    const destEntry = {
      id: propId, mesh: tree,
      x: wx, z: wz,
      triggerRadius: 1.8 * s,
      obsEntry, alive: true,
      kind: 'tree', biome: localBiome,
      hp: 30, maxHp: 30,
    };
    game.destructibles.push(destEntry);
    destructibles.push(destEntry);
  }

  // Rocks
  for (let i = 0; i < rockDensity; i++) {
    const wx = baseX + rng() * CHUNK_SIZE;
    const wz = baseZ + rng() * CHUNK_SIZE;
    if (Math.hypot(wx, wz) < OUTPOST_RADIUS + 4) continue;
    if (!placeProp(rng, props, wx, wz, 2.5)) continue;
    const y = sampleHeight(wx, wz, seed);
    const { id: localBiome } = sampleBiome(wx, wz, seed);
    const rock = new THREE.Mesh(_rockGeo, _rockMatBy[localBiome]);
    const s = 0.6 + rng() * 1.4;
    rock.scale.setScalar(s);
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    rock.position.set(wx, y + 0.15 * s, wz);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);

    const propId = `rock_${cx}_${cz}_${i}`;
    const halfRock = 0.6 * s;
    const obsEntry = {
      min: { x: wx - halfRock, z: wz - halfRock },
      max: { x: wx + halfRock, z: wz + halfRock },
      h: y + 0.5 * s, yMin: y,
    };
    game.oBs.push(obsEntry);
    obstacleEntries.push(obsEntry);
    const destEntry = {
      id: propId, mesh: rock,
      x: wx, z: wz,
      triggerRadius: 1.4 * s,
      obsEntry, alive: true,
      kind: 'rock', biome: localBiome,
      hp: 80, maxHp: 80,
    };
    game.destructibles.push(destEntry);
    destructibles.push(destEntry);
  }

  // Scatter props (non-destructible decor — bushes, crates, barrels)
  const scatterDensity = 3;
  for (let i = 0; i < scatterDensity; i++) {
    if (rng() > 0.55) continue;
    const wx = baseX + rng() * CHUNK_SIZE;
    const wz = baseZ + rng() * CHUNK_SIZE;
    if (Math.hypot(wx, wz) < OUTPOST_RADIUS + 4) continue;
    if (sampleSlope(wx, wz, seed) > 0.5) continue;
    if (!placeProp(rng, props, wx, wz, 2.2)) continue;
    const url = SCATTER_PROPS[Math.floor(rng() * SCATTER_PROPS.length)];
    const cached = getCachedGlbSync(url);
    if (!cached) continue;
    const propMesh = cached.scene.clone(true);
    propMesh.traverse((n) => { if (n.isMesh) n.castShadow = true; });
    const s = 0.7 + rng() * 0.6;
    propMesh.scale.setScalar(s);
    propMesh.rotation.y = rng() * Math.PI * 2;
    propMesh.position.set(wx, sampleHeight(wx, wz, seed), wz);
    group.add(propMesh);
  }

  return { group, destructibles, obstacleEntries };
}

function destroyChunk(record) {
  // Remove mesh + props from scene
  if (record.mesh) {
    record.mesh.geometry?.dispose();
    record.mesh.parent?.remove(record.mesh);
  }
  if (record.propsGroup) {
    record.propsGroup.traverse((node) => {
      if (node.isMesh && node !== record.mesh) {
        // Don't dispose shared materials/geometries
      }
    });
    record.propsGroup.parent?.remove(record.propsGroup);
  }
  // Remove obstacle entries (splice each)
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
  // Load missing
  for (const key of want) {
    if (game.chunks.has(key)) continue;
    const [cx, cz] = key.split('|').map(Number);
    const mesh = buildChunkMesh(cx, cz, seed);
    game.arenaGroup.add(mesh);
    const { group, destructibles, obstacleEntries } = buildChunkProps(cx, cz, seed);
    game.arenaGroup.add(group);
    game.chunks.set(key, { mesh, propsGroup: group, destructibles, obstacleEntries, cx, cz });
  }
  // Unload chunks outside the unload radius (hysteresis)
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
}
