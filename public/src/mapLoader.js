/**
 * mapLoader.js — client-side map JSON loader
 *
 * Fetches /maps/<mapId>.json, caches results, normalises defaults,
 * and builds the Three.js scene from the declarative object list.
 *
 * Usage:
 *   import { buildMapFromJson } from "./mapLoader.js";
 *   await buildMapFromJson(mapId);          // returns { ok: true } or { ok: false }
 *
 * Returns false when the JSON cannot be fetched so callers can fall back to the
 * legacy hard-coded builders.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { game } from "./state.js";

export async function loadMapDefinition(mapId) {
  try {
    // cache: 'no-cache' — always revalidate with the server so edits made in the
    // map editor are picked up without requiring a hard browser refresh.
    const res = await fetch(`/maps/${encodeURIComponent(mapId)}.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** No-op kept for call-site compatibility. */
export function invalidateMapCache(_mapId) {}

// ── Per-theme material factories ──────────────────────────────────────────────
// These replicate the same solid-colour values used by the legacy builders so
// the visual appearance is consistent for the editable objects.

const _mats = {};

function getMat(key, factory) {
  if (!_mats[key]) _mats[key] = factory();
  return _mats[key];
}

function materials(theme) {
  const base = {
    metal:     getMat('metal',     () => new THREE.MeshStandardMaterial({ color: 0x7ba1ac, roughness: 0.34, metalness: 0.66 })),
    crate:     getMat('crate',     () => new THREE.MeshStandardMaterial({ color: 0x86664a, roughness: 0.92 })),
    concrete:  getMat('concrete',  () => new THREE.MeshStandardMaterial({ color: 0xa39a8b, roughness: 0.84 })),
    sandstone: getMat('sandstone', () => new THREE.MeshStandardMaterial({ color: 0xc2906a, roughness: 0.9 })),
    blacksite: getMat('blacksite', () => new THREE.MeshStandardMaterial({ color: 0x22343d, roughness: 0.56, metalness: 0.24 })),
  };
  // Theme-specific wall material override for the outer walls
  const wallOverrides = {
    arena:     getMat('wall_arena',     () => makeMetalPanelMat()),
    desert:    getMat('wall_desert',    () => makeSandstoneMat()),
    city:      getMat('wall_city',      () => makeBrickMat()),
    blacksite: getMat('wall_bs',        () => makeMetalPanelMat()),
  };
  return { ...base, _wallOverride: wallOverrides[theme] || base.metal };
}

function makeMetalPanelMat() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#2e4550"; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#1e3038"; ctx.lineWidth = 3;
  for (let y = 0; y <= 256; y += 64) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(256,y); ctx.stroke(); }
  ctx.lineWidth = 2;
  for (let x = 0; x <= 256; x += 128) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,256); ctx.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(18, 5);
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, map: tex });
}

function makeSandstoneMat() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#b8844e"; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(90,55,20,0.4)"; ctx.lineWidth = 2;
  for (let row = 0; row * 48 <= 256; row++) {
    ctx.beginPath(); ctx.moveTo(0, row*48); ctx.lineTo(256, row*48); ctx.stroke();
    const off = (row % 2) * 64;
    for (let x = off - 128; x <= 256; x += 128) { ctx.beginPath(); ctx.moveTo(x, row*48); ctx.lineTo(x, (row+1)*48); ctx.stroke(); }
  }
  const d = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random()-0.5)*28; d.data[i]=Math.max(0,Math.min(255,d.data[i]+n)); d.data[i+1]=Math.max(0,Math.min(255,d.data[i+1]+n*0.85)); d.data[i+2]=Math.max(0,Math.min(255,d.data[i+2]+n*0.6)); }
  ctx.putImageData(d, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(18, 5);
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, map: tex });
}

function makeBrickMat() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#8a8070"; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(55,50,44,0.55)"; ctx.lineWidth = 2;
  for (let row = 0; row * 32 <= 256; row++) {
    ctx.beginPath(); ctx.moveTo(0, row*32); ctx.lineTo(256, row*32); ctx.stroke();
    const off = (row % 2) * 64;
    for (let x = off - 128; x <= 256; x += 128) { ctx.beginPath(); ctx.moveTo(x, row*32); ctx.lineTo(x, (row+1)*32); ctx.stroke(); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(18, 5);
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, map: tex });
}

// ── Ground builders ───────────────────────────────────────────────────────────

function buildGround(mapDef, arenaGroup, ARENA_SIZE) {
  const material = mapDef.ground?.material || 'arenaGround';
  const bg = mapDef.background ? parseInt(mapDef.background.replace('#',''), 16) : 0x1b2734;

  let mat;
  if (material === 'sandGround') {
    mat = buildSandGroundMat();
  } else if (material === 'asphaltGround') {
    mat = buildAsphaltMat();
  } else if (material === 'blacksiteFloor') {
    mat = buildBlacksiteFloorMat();
  } else {
    mat = buildArenaGroundMat();
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE), mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  arenaGroup.add(ground);
}

function buildArenaGroundMat() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#243640"; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "#35515f"; ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) { const p = i*64; ctx.beginPath(); ctx.moveTo(p,0); ctx.lineTo(p,512); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,p); ctx.lineTo(512,p); ctx.stroke(); }
  const d = ctx.getImageData(0,0,512,512); for (let i=0;i<d.data.length;i+=4){const n=(Math.random()-0.5)*18;d.data[i]+=n;d.data[i+1]+=n;d.data[i+2]+=n;} ctx.putImageData(d,0,0);
  const tex = new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(12,12);
  return new THREE.MeshStandardMaterial({ map: tex, color: 0xaec8cf, roughness: 0.92 });
}

function buildSandGroundMat() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#d4a46a"; ctx.fillRect(0,0,512,512);
  const d = ctx.getImageData(0,0,512,512); for (let i=0;i<d.data.length;i+=4){const n=(Math.random()-0.5)*30;d.data[i]=Math.max(0,Math.min(255,d.data[i]+n));d.data[i+1]=Math.max(0,Math.min(255,d.data[i+1]+n*0.88));d.data[i+2]=Math.max(0,Math.min(255,d.data[i+2]+n*0.62));} ctx.putImageData(d,0,0);
  const tex = new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(10,10);
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, map: tex });
}

function buildAsphaltMat() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#4e4b47"; ctx.fillRect(0,0,512,512);
  const d = ctx.getImageData(0,0,512,512); for (let i=0;i<d.data.length;i+=4){const n=(Math.random()-0.5)*22;d.data[i]=Math.max(0,Math.min(255,d.data[i]+n));d.data[i+1]=Math.max(0,Math.min(255,d.data[i+1]+n));d.data[i+2]=Math.max(0,Math.min(255,d.data[i+2]+n));} ctx.putImageData(d,0,0);
  const tex = new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(10,10);
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, map: tex });
}

function buildBlacksiteFloorMat() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1c2028"; ctx.fillRect(0,0,512,512);
  ctx.strokeStyle = "#13171c"; ctx.lineWidth = 1.5;
  for (let i = 0; i <= 512; i += 32) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,512); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(512,i); ctx.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(14,14);
  return new THREE.MeshStandardMaterial({ map: tex, color: 0xaabbcc, roughness: 0.9 });
}

// ── Lighting ──────────────────────────────────────────────────────────────────

function applyMapLighting(mapDef, scene, arenaLights) {
  // Fog & background
  const fogColor = mapDef.fog?.color || '#1b2734';
  const fogDensity = mapDef.fog?.density ?? 0.005;
  scene.fog = new THREE.FogExp2(parseInt(fogColor.replace('#', ''), 16), fogDensity);
  scene.background = new THREE.Color(parseInt((mapDef.background || fogColor).replace('#', ''), 16));

  // Extra hemisphere for city/blacksite themes
  if (mapDef.theme === 'city') {
    const h = new THREE.HemisphereLight(0xbfe2ff, 0x8f785f, 1.1);
    scene.add(h); arenaLights.push(h);
  } else if (mapDef.theme === 'blacksite') {
    const h = new THREE.HemisphereLight(0x44ff88, 0x1a4030, 2.2);
    scene.add(h); arenaLights.push(h);
  }

  // Suns
  for (const sun of (mapDef.lighting?.suns || defaultSuns(mapDef.theme))) {
    const col = parseInt(String(sun.color).replace('#', ''), 16);
    const dir = new THREE.DirectionalLight(col, sun.intensity);
    dir.position.set(...sun.position);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = dir.shadow.camera.bottom = -80;
    dir.shadow.camera.right = dir.shadow.camera.top = 80;
    dir.shadow.camera.near = 1; dir.shadow.camera.far = 160;
    dir.shadow.bias = -0.001;
    scene.add(dir); arenaLights.push(dir);
  }
}

function defaultSuns(theme) {
  if (theme === 'desert')    return [{ color: '#fffef0', intensity: 2.5,  position: [50, 80, 10] }];
  if (theme === 'city')      return [{ color: '#fff4d6', intensity: 2.85, position: [34, 78, -24] }, { color: '#ffd1a8', intensity: 0.8, position: [-18, 36, 30] }];
  if (theme === 'blacksite') return [{ color: '#33ff77', intensity: 1.6,  position: [0, -10, 0] }];
  return [{ color: '#dff7ff', intensity: 1.8, position: [36, 64, 18] }]; // arena
}

// ── Object builders ───────────────────────────────────────────────────────────

const _gltfLoader = new GLTFLoader();
const _glbCache = new Map();

function addBox(obj, mats, arenaGroup) {
  const isWall = obj.label?.includes('Wall North') || obj.label?.includes('Wall South')
               || obj.label?.includes('Wall West')  || obj.label?.includes('Wall East');
  const mat = isWall
    ? (mats._wallOverride || mats.metal)
    : (mats[obj.material] || mats.metal);

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(obj.size[0], obj.size[1], obj.size[2]),
    mat,
  );
  mesh.position.set(...obj.position);
  if (obj.rotation) mesh.rotation.set(...obj.rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  arenaGroup.add(mesh);

  if (obj.collidable !== false) {
    game.oBs.push({
      min: { x: obj.position[0] - obj.size[0] / 2, z: obj.position[2] - obj.size[2] / 2 },
      max: { x: obj.position[0] + obj.size[0] / 2, z: obj.position[2] + obj.size[2] / 2 },
      h: obj.position[1] + obj.size[1] / 2,
    });
  }
}

function addLadder(obj) {
  if (obj.bounds) {
    game.ladders.push({
      xMin: obj.bounds.xMin,
      xMax: obj.bounds.xMax,
      zMin: obj.bounds.zMin,
      zMax: obj.bounds.zMax,
      yMax: obj.bounds.yMax,
    });
  }
}

function loadPropJson(obj, arenaGroup) {
  const targetGroup = arenaGroup;
  const cachedGltf = _glbCache.get(obj.model);

  function instantiate(gltf) {
    if (game.arenaGroup !== targetGroup) return;
    const model = gltf.scene.clone(true);
    const scale = Array.isArray(obj.scale) ? obj.scale[0] : (obj.scale ?? 1);
    model.scale.setScalar(scale);
    if (obj.rotation) model.rotation.set(...obj.rotation);
    model.position.set(...obj.position);
    model.traverse((node) => {
      if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    targetGroup.add(model);

    if (obj.collidable !== false) {
      if (obj.collider?.size) {
        // Manual collider box overrides the mesh AABB
        const [cx, cy, cz] = obj.collider.position || obj.position;
        const [cw, ch, cd] = obj.collider.size;
        game.oBs.push({
          min: { x: cx - cw / 2, z: cz - cd / 2 },
          max: { x: cx + cw / 2, z: cz + cd / 2 },
          h: cy + ch / 2,
        });
      } else {
        model.updateWorldMatrix(true, true);
        const bbox = new THREE.Box3().setFromObject(model);
        if (bbox.min.x < bbox.max.x && bbox.min.z < bbox.max.z) {
          game.oBs.push({
            min: { x: bbox.min.x, z: bbox.min.z },
            max: { x: bbox.max.x, z: bbox.max.z },
            h: bbox.max.y,
          });
        }
      }
    }
  }

  if (cachedGltf) { instantiate(cachedGltf); return; }
  _gltfLoader.load(obj.model, (gltf) => { _glbCache.set(obj.model, gltf); instantiate(gltf); });
}

function loadDestructibleJson(obj, arenaGroup) {
  const targetGroup = arenaGroup;
  const propId = `${Math.round(obj.position[0] * 10)}_${Math.round(obj.position[2] * 10)}`;
  const cachedGltf = _glbCache.get(obj.model);

  function instantiate(gltf) {
    if (game.arenaGroup !== targetGroup) return;
    const model = gltf.scene.clone(true);
    const scale = Array.isArray(obj.scale) ? obj.scale[0] : (obj.scale ?? 1);
    model.scale.setScalar(scale);
    if (obj.rotation) model.rotation.set(...obj.rotation);
    model.position.set(...obj.position);
    model.traverse((node) => {
      if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    targetGroup.add(model);

    model.updateWorldMatrix(true, true);
    const bbox = new THREE.Box3().setFromObject(model);
    let obsEntry = null;
    if (bbox.min.x < bbox.max.x && bbox.min.z < bbox.max.z) {
      obsEntry = { min: { x: bbox.min.x, z: bbox.min.z }, max: { x: bbox.max.x, z: bbox.max.z }, h: bbox.max.y };
      game.oBs.push(obsEntry);
    }
    game.destructibles.push({
      id: propId, mesh: model,
      x: obj.position[0], z: obj.position[2],
      triggerRadius: obj.triggerRadius ?? 2.2,
      obsEntry, alive: true,
    });
  }

  if (cachedGltf) { instantiate(cachedGltf); return; }
  _gltfLoader.load(obj.model, (gltf) => { _glbCache.set(obj.model, gltf); instantiate(gltf); });
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Attempts to fetch + render a map from JSON.
 * Returns { ok: true } on success, { ok: false } if the JSON does not exist
 * so the caller can fall back to legacy builders.
 */
export async function buildMapFromJson(mapId, { scene, arenaGroup, arenaLights, ARENA_SIZE: arenaSize } = {}) {
  scene      = scene      || game.scene;
  arenaGroup = arenaGroup || game.arenaGroup;
  arenaLights = arenaLights || game.arenaLights;
  arenaSize  = arenaSize  || 144;

  const mapDef = await loadMapDefinition(mapId);
  if (!mapDef) return { ok: false };

  applyMapLighting(mapDef, scene, arenaLights);
  buildGround(mapDef, arenaGroup, arenaSize);

  const mats = materials(mapDef.theme || 'arena');

  for (const obj of (mapDef.objects || [])) {
    switch (obj.type) {
      case 'box':
        addBox(obj, mats, arenaGroup);
        break;
      case 'ladder':
        addLadder(obj);
        break;
      case 'prop':
        loadPropJson(obj, arenaGroup);
        break;
      case 'destructible':
        loadDestructibleJson(obj, arenaGroup);
        break;
      // 'spawn' objects are ignored at runtime
    }
  }

  return { ok: true };
}

