import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import { ARENA_SIZE, CHARACTERS, HALF, MAP_DEFS, WALL_H } from "./config.js";
import { game } from "./state.js";
import { disposeObject3D } from "./utils.js";
import { buildMapFromJson } from "./mapLoader.js";
import { sampleHeight } from "./shared/noise.js";
import { disposeAllChunks } from "./chunkManager.js";

export function applyCharacterHead(headGroup, characterId, options = {}) {
  for (let i = headGroup.children.length - 1; i >= 0; i -= 1) {
    const child = headGroup.children[i];
    headGroup.remove(child);
    disposeObject3D(child);
  }

  const character = CHARACTERS[characterId];
  const gltf = game.shared?.characterHeadGltfs?.[characterId];
  let usedGlb = false;

  if (gltf) {
    const model = gltf.scene.clone(true);
    model.rotation.y = gltf.userData.rotY ?? Math.PI; // face forward
    const bbox = new THREE.Box3().setFromObject(model);
    const dims = new THREE.Vector3();
    bbox.getSize(dims);
    const largestAxis = Math.max(dims.x, dims.y, dims.z) || 1;
    // 60% bigger than the box-head target size.
    const targetSize = 0.5 * (character?.headScale ?? 1.0) * 1.6;
    const scale = targetSize / largestAxis;
    model.scale.setScalar(scale);
    // Recenter so the mesh's bbox origin sits at the headGroup anchor.
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    model.position.sub(center.multiplyScalar(scale));
    // Put every head mesh on layer 1 (in addition to 0) and tune its material
    // to reflect more light — no emissive, just a slightly brighter diffuse
    // response and lower roughness so the fill light shows up.
    model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        node.layers.enable(1);
        const mat = node.material;
        if (mat && mat.color && !mat.userData.__tunedForHeadLight) {
          const tuned = mat.clone();
          if ("roughness" in tuned) tuned.roughness = Math.min(tuned.roughness ?? 1, 0.55);
          if ("metalness" in tuned) tuned.metalness = Math.min(tuned.metalness ?? 0, 0.05);
          // Clear any emissive the source model shipped with — we want pure reflection.
          if (tuned.emissive) tuned.emissive.setScalar(0);
          tuned.emissiveIntensity = 0;
          tuned.userData.__tunedForHeadLight = true;
          node.material = tuned;
        }
      }
    });
    headGroup.add(model);

    // Dedicated reflective fill light: only affects meshes on layer 1, so the
    // head is visibly brighter without altering any other object in the scene.
    const fillLight = new THREE.PointLight(0xffffff, 2.4, 2.5, 1.6);
    fillLight.position.set(0, 0.15, -0.25); // slightly above + in front of the face
    fillLight.layers.set(1);
    headGroup.add(fillLight);

    // Soft ambient kicker so the back/sides of the head aren't pitch black
    // when the fill light is occluded by the face geometry itself.
    const softBounce = new THREE.PointLight(0xffffff, 0.9, 1.5, 2);
    softBounce.position.set(0, 0, 0.2);
    softBounce.layers.set(1);
    headGroup.add(softBounce);

    usedGlb = true;
  }

  headGroup.userData.characterId = characterId || null;
  headGroup.userData.usedGlb = usedGlb;

  // Visor sits at head height and looks wrong over a detailed face model. Hide
  // it when a GLB head is in use.
  if (options.visor) {
    options.visor.visible = !usedGlb;
  }
}

// Cached character config loaded from /assets/characterConfig.json at startup.
let _charConfig = null;

async function loadCharConfig() {
  try {
    const res = await fetch('/api/character-config');
    if (res.ok) _charConfig = await res.json();
  } catch { /* offline / no server — ignore */ }
}

export function applyCharConfig() {
  if (!_charConfig) return;
  const wc = _charConfig.weapons;
  if (wc && game.visuals?.weapon?.weaponModels) {
    for (const [id, overrides] of Object.entries(wc)) {
      const model = game.visuals.weapon.weaponModels[id];
      if (!model) continue;
      if (overrides.fpPos)    model.fpPos    = overrides.fpPos;
      if (overrides.fpAdsPos) model.fpAdsPos = overrides.fpAdsPos;
      if (overrides.fpScale)  model.fpScale  = overrides.fpScale;
      if (overrides.tpPos)    model.tpPos    = overrides.tpPos;
      if (overrides.tpScale)  model.tpScale  = overrides.tpScale;
      if (typeof overrides.tpMuzzleZ === 'number') model.tpMuzzleZ = overrides.tpMuzzleZ;
      if (typeof overrides.fpMuzzleZ === 'number') model.fpMuzzleZ = overrides.fpMuzzleZ;
    }
  }
  const glbOverrides = _charConfig.weaponGlbs;
  if (glbOverrides && game.visuals?.weapon?.glbGroups) {
    for (const [id, ov] of Object.entries(glbOverrides)) {
      const grp = game.visuals.weapon.glbGroups[id];
      if (!grp) continue;
      const fpCopy = grp.fpGroup?.children[0];
      const tpCopy = grp.tpGroup?.children[0];
      [fpCopy, tpCopy].forEach((obj) => {
        if (!obj) return;
        if (typeof ov.scale === 'number') obj.scale.setScalar(ov.scale);
        if (typeof ov.rotY  === 'number') obj.rotation.y = ov.rotY;
        if (typeof ov.posY  === 'number') obj.position.y = ov.posY;
        if (typeof ov.posZ  === 'number') obj.position.z = ov.posZ;
      });
    }
  }
  // Player body part overrides
  const pb = _charConfig.playerBody;
  if (pb && game.visuals?.player) {
    const pv = game.visuals.player;
    const Y = -0.06;
    const applyPart = (mesh, def) => {
      if (!mesh || !def) return;
      if (def.pos) mesh.position.set(def.pos[0], def.pos[1] + Y, def.pos[2] ?? 0);
      if (def.size) {
        const g = new THREE.BoxGeometry(def.size[0], def.size[1], def.size[2]);
        mesh.geometry.dispose();
        mesh.geometry = g;
      }
    };
    if (pb.torso)      applyPart(pv.torso,      pb.torso);
    if (pb.leftArm)    applyPart(pv.leftArm,    pb.leftArm);
    if (pb.rightArm)   applyPart(pv.rightArm,   pb.rightArm);
    if (pb.leftLeg)    applyPart(pv.leftLeg,    pb.leftLeg);
    if (pb.rightLeg)   applyPart(pv.rightLeg,   pb.rightLeg);
    if (pb.leftBoot)   applyPart(pv.leftBoot,   pb.leftBoot);
    if (pb.rightBoot)  applyPart(pv.rightBoot,  pb.rightBoot);
    if (pb.headGroup && typeof pb.headGroup.posY === 'number') {
      pv.headGroup.position.y = pb.headGroup.posY + Y;
    }
    if (pb.visor && pv.visor) applyPart(pv.visor, pb.visor);
  }
  // The weapon model's fpPos/tpPos/muzzleZ values were just rewritten above,
  // but the live scene objects still hold positions baked in at boot. Re-run
  // applyWeaponModel so the saved editor positions actually take effect.
  if (game.visuals?.weapon?.weaponModels?.[game.currentWeapon]) {
    applyWeaponModel();
  }
}

export function initScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1b2734, 0.005);
  scene.background = new THREE.Color(0x1b2734);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 12, 30);
  camera.rotation.order = "YXZ";

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // softer, more realistic shadow edges
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  game.dom.gameContainer.appendChild(renderer.domElement);

  game.scene = scene;
  game.camera = camera;
  game.renderer = renderer;

  // Post-processing: subtle bloom so muzzle flashes and bright particles glow
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.18,  // strength — subtle glow for muzzle flashes and explosions
    0.55,  // radius
    0.82,  // threshold — only very bright surfaces bloom
  ));
  game.composer = composer;

  addPermanentLighting();
  buildPlayer();
  buildWeaponVisuals();
  buildGrappleVisuals();
  buildSharedRuntimeAssets();
  preloadHDRSkies();
  // Load editor overrides asynchronously — apply once everything is built
  loadCharConfig().then(applyCharConfig);
}

function buildGrappleVisuals() {
  // Lure body: elongated orange sphere like a fishing lure
  const lureMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.25, metalness: 0.7, emissive: 0xff3300, emissiveIntensity: 0.3 });
  const lureGeo = new THREE.SphereGeometry(0.07, 8, 6);
  const hookMesh = new THREE.Mesh(lureGeo, lureMat);
  hookMesh.scale.set(1, 2.2, 1);
  hookMesh.visible = false;
  game.scene.add(hookMesh);

  // Rope: a Line between two points updated every frame
  const ropeGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(6); // two Vector3s
  ropeGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const ropeMat = new THREE.LineBasicMaterial({ color: 0xaaaaaa });
  const rope = new THREE.Line(ropeGeo, ropeMat);
  rope.visible = false;
  rope.frustumCulled = false;
  game.scene.add(rope);

  game.visuals.grapple = { hookMesh, rope };
}

const _rgbeLoader = new RGBELoader();

const HDR_ENV_INTENSITY = 0.38;

// Pre-processed HDR cache: path → { bg: Texture, env: Texture|null }
// Populated at startup so map transitions apply skyboxes instantly.
const _hdrCache = new Map();

const HDR_SKY_PATHS = {
  arena:  '/assets/Skies/arenasky.hdr',
  desert: '/assets/Skies/desertsky.hdr',
  city:   '/assets/Skies/Citysky.hdr',
};

const SURVIVAL_SKY_PATHS = {
  day: HDR_SKY_PATHS.desert,
  night: HDR_SKY_PATHS.arena,
};

function _applyHDRToScene(bg, env) {
  game.scene.background = bg;
  game.scene.environment = env ?? null;
  if (env) {
    game.scene.traverse((node) => {
      if (!node.isMesh) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) if (mat) mat.envMapIntensity = HDR_ENV_INTENSITY;
    });
  }
}

function preloadHDRSkies() {
  for (const path of Object.values(HDR_SKY_PATHS)) {
    _rgbeLoader.load(path, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(game.renderer);
      pmrem.compileEquirectangularShader();
      const env = pmrem.fromEquirectangular(tex).texture;
      pmrem.dispose();
      _hdrCache.set(path, { bg: tex, env });
    });
  }
}

function loadHDRSky(path, useAsEnv = false) {
  game.scene.background = null;
  game.scene.environment = null;
  const cached = _hdrCache.get(path);
  if (cached) {
    _applyHDRToScene(cached.bg, useAsEnv ? cached.env : null);
    return;
  }
  // Cache miss (shouldn't happen after startup) — load and cache on the fly
  _rgbeLoader.load(path, (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(game.renderer);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    _hdrCache.set(path, { bg: tex, env });
    _applyHDRToScene(tex, useAsEnv ? env : null);
  });
}

export function setSurvivalSkyForTime(night) {
  if (!game.scene) return;
  const nextMode = night ? "night" : "day";
  if (game.shared.survivalSkyMode === nextMode) return;
  game.shared.survivalSkyMode = nextMode;
  loadHDRSky(SURVIVAL_SKY_PATHS[nextMode], true);
}

export async function rebuildArena(mapId) {
  // Remove old arena objects.
  if (game.arenaGroup) {
    game.scene.remove(game.arenaGroup);
    disposeObject3D(game.arenaGroup);
  }
  // Clear sky references — don't dispose, textures stay in the HDR cache for reuse
  game.scene.background = null;
  game.scene.environment = null;
  for (const light of game.arenaLights) {
    game.scene.remove(light);
  }
  game.arenaLights = [];
  game.oBs.length = 0;
  game.ladders.length = 0;
  game.destructibles.length = 0;
  if (game.chunks) disposeAllChunks();

  game.arenaGroup = new THREE.Group();
  game.scene.add(game.arenaGroup);

  if (mapId === 'survival') {
    buildSurvivalSceneChrome();
    // Outpost JSON loaded on top of the procedural world
    try { await buildMapFromJson('survival_outpost'); } catch { /* missing JSON is OK */ }
    // Wild outposts: cheap procedural buildings placed at deterministic positions
    buildWildOutposts();
    // Ore veins: glowing destructibles at deterministic positions
    buildOreVeinMeshes();
    // Enemy camps: campfire + crude totem so the territorial cluster is visible
    buildCampMarkers();
    return;
  }

  await buildMapFromJson(mapId);

  if (HDR_SKY_PATHS[mapId]) loadHDRSky(HDR_SKY_PATHS[mapId], true);
}

const _placedTorches = new Map();
let _sharedTorchGeo = null;
let _sharedTorchMat = null;

if (typeof window !== 'undefined') {
  window.__addPlacedTorchMesh = function (data) {
    if (!game.scene || _placedTorches.has(data.id)) return;
    if (!_sharedTorchGeo) {
      _sharedTorchGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.7, 6);
      _sharedTorchGeo.translate(0, 0.35, 0);
      _sharedTorchMat = new THREE.MeshStandardMaterial({ color: 0x3a2210, roughness: 0.9 });
    }
    const torch = new THREE.Group();
    const stick = new THREE.Mesh(_sharedTorchGeo, _sharedTorchMat);
    torch.add(stick);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xff7a20 }),
    );
    flame.position.y = 0.78;
    torch.add(flame);
    const light = new THREE.PointLight(0xffaa55, 1.4, 12);
    light.position.y = 0.85;
    torch.add(light);
    torch.position.set(data.x, data.y, data.z);
    game.scene.add(torch);
    _placedTorches.set(data.id, torch);
  };
}

// ── Tank missiles (server-driven homing projectiles) ───────────────────────────

const _missileMeshes = new Map(); // id -> { group, targetX,targetY,targetZ }
function ensureMissileMesh(id, data) {
  if (_missileMeshes.has(id)) return _missileMeshes.get(id);
  const group = new THREE.Group();
  const gltf = game.shared.missileGltf;
  if (gltf) {
    const model = gltf.scene.clone(true);
    // GLB ships with the nose pointing along +X; rotate -90° about Y so the
    // nose lies along +Z to match our velocity-driven yaw math below.
    model.rotation.y = -Math.PI / 2;
    model.scale.setScalar(0.15);
    group.add(model);
  } else {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.5 }),
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);
    const fin = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.4, 4),
      new THREE.MeshBasicMaterial({ color: 0xffaa00 }),
    );
    fin.position.z = 0.55;
    fin.rotation.x = Math.PI / 2;
    group.add(fin);
  }
  group.position.set(data.x, data.y, data.z);
  game.scene.add(group);
  const rec = { group, x: data.x, y: data.y, z: data.z, tx: data.x, ty: data.y, tz: data.z };
  _missileMeshes.set(id, rec);
  return rec;
}

if (typeof window !== 'undefined') {
  window.__missileSpawned = (data) => {
    ensureMissileMesh(data.id, data);
  };
  window.__missilesSync = (list) => {
    for (const m of list) {
      const rec = _missileMeshes.get(m.id);
      if (!rec) { ensureMissileMesh(m.id, m); continue; }
      rec.tx = m.x; rec.ty = m.y; rec.tz = m.z;
      // Orient toward velocity
      const vx = m.vx ?? (m.x - rec.x);
      const vz = m.vz ?? (m.z - rec.z);
      rec.group.rotation.y = Math.atan2(vx, vz);
      rec.group.rotation.x = -Math.atan2(m.vy ?? 0, Math.hypot(vx, vz) || 1);
    }
  };
  window.__missileExploded = (data) => {
    const rec = _missileMeshes.get(data.id);
    if (rec) { rec.group.parent?.remove(rec.group); _missileMeshes.delete(data.id); }
    // Burst of orange/yellow particles via global hook (set by combat.js)
    if (window.__spawnExplosion) window.__spawnExplosion(data.x, data.y, data.z);
  };
  // Returns the id of any missile whose hitbox intersects the bullet segment,
  // or null. Used by combat.js so bullets can shoot missiles down.
  window.__findMissileHit = (prev, cur) => {
    if (_missileMeshes.size === 0) return null;
    const RADIUS_SQ = 0.8 * 0.8;
    for (const [id, rec] of _missileMeshes) {
      const dx = rec.x - cur.x;
      const dy = rec.y - cur.y;
      const dz = rec.z - cur.z;
      if (dx * dx + dy * dy + dz * dz < RADIUS_SQ) return id;
    }
    return null;
  };
}

// Smooth-lerp missiles each frame
export function tickMissileMeshes(dt) {
  if (_missileMeshes.size === 0) return;
  for (const [, rec] of _missileMeshes) {
    rec.x += (rec.tx - rec.x) * Math.min(1, 18 * dt);
    rec.y += (rec.ty - rec.y) * Math.min(1, 18 * dt);
    rec.z += (rec.tz - rec.z) * Math.min(1, 18 * dt);
    rec.group.position.set(rec.x, rec.y, rec.z);
  }
}

// ── Roaming-boss arena dome ────────────────────────────────────────────────────

let _arenaDome = null;
let _arenaInfo = null; // { x, z, radius, bossId }

if (typeof window !== 'undefined') {
  window.__roamingArenaSpawned = (arena) => {
    if (_arenaDome) { _arenaDome.parent?.remove(_arenaDome); _arenaDome = null; }
    _arenaInfo = arena;
    game.activeBossArena = arena;
    const geo = new THREE.SphereGeometry(arena.radius, 24, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff5544, transparent: true, opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.position.set(arena.x, 0, arena.z);
    game.scene.add(dome);
    _arenaDome = dome;
  };
  window.__roamingArenaCleared = () => {
    if (_arenaDome) { _arenaDome.parent?.remove(_arenaDome); _arenaDome = null; }
    _arenaInfo = null;
    game.activeBossArena = null;
  };
}

export function tickBossArenaDome() {
  if (_arenaDome) {
    const t = performance.now() / 600;
    _arenaDome.material.opacity = 0.14 + 0.08 * Math.sin(t);
    _arenaDome.rotation.y += 0.003;
  }
}

// Confines the player inside the dome (called by player.js after movement).
export function clampPlayerInsideArena(playerGroup) {
  if (!_arenaInfo) return;
  const dx = playerGroup.position.x - _arenaInfo.x;
  const dz = playerGroup.position.z - _arenaInfo.z;
  const d = Math.hypot(dx, dz);
  const maxR = _arenaInfo.radius - 1.0;
  if (d > maxR) {
    playerGroup.position.x = _arenaInfo.x + (dx / d) * maxR;
    playerGroup.position.z = _arenaInfo.z + (dz / d) * maxR;
  }
}

// ── Driveable vehicles (Jeep / Tank corpse) ────────────────────────────────────

const _vehicleMeshes = new Map(); // id -> { group, kind, x, y, z, rot, occupantId }

function buildVehicleMesh(data) {
  const group = new THREE.Group();
  const isJeep = data.kind === 'jeep';
  const gltf = isJeep ? game.shared.jeepGltf : game.shared.tankGltf;
  if (gltf) {
    const model = gltf.scene.clone(true);
    model.scale.setScalar(isJeep ? 1.0 : 1.4);
    model.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    // Lift model so its bottom sits at y=0 within the group (avoids sinking into terrain)
    const bbox = new THREE.Box3().setFromObject(model);
    model.position.y = -bbox.min.y;
    group.add(model);
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: isJeep ? 0x6a8d4a : 0x4a5040, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 4.0), mat);
    body.position.y = 0.7;
    group.add(body);
  }
  group.position.set(data.x, data.y || 0, data.z);
  group.rotation.y = data.rot || 0;
  game.scene.add(group);
  return group;
}

if (typeof window !== 'undefined') {
  window.__vehicleSpawned = (data) => {
    if (_vehicleMeshes.has(data.id)) return;
    const group = buildVehicleMesh(data);
    _vehicleMeshes.set(data.id, {
      group, kind: data.kind,
      x: data.x, y: data.y || 0, z: data.z, rot: data.rot || 0,
      tx: data.x, ty: data.y || 0, tz: data.z, trot: data.rot || 0,
      occupantId: data.occupantId || null,
    });
    if (!Array.isArray(game.vehicles)) game.vehicles = [];
    game.vehicles.push({
      id: data.id, kind: data.kind,
      x: data.x, y: data.y || 0, z: data.z, rot: data.rot || 0,
      occupantId: data.occupantId || null,
    });
  };
  window.__vehicleSync = (data) => {
    const rec = _vehicleMeshes.get(data.id);
    if (!rec) return;
    rec.tx = data.x; rec.ty = data.y; rec.tz = data.z; rec.trot = data.rot;
    const v = (game.vehicles || []).find(x => x.id === data.id);
    if (v) { v.x = data.x; v.y = data.y; v.z = data.z; v.rot = data.rot; }
  };
  window.__vehicleOccupied = (data) => {
    const rec = _vehicleMeshes.get(data.vehicleId);
    if (rec) rec.occupantId = data.occupantId;
    const v = (game.vehicles || []).find(x => x.id === data.vehicleId);
    if (v) v.occupantId = data.occupantId;
    if (data.occupantId === game.socket?.id) {
      game.inVehicleId = data.vehicleId;
    } else if (game.inVehicleId === data.vehicleId) {
      game.inVehicleId = null;
    }
  };
  window.__vehicleRemoved = (id) => {
    const rec = _vehicleMeshes.get(id);
    if (rec) { rec.group.parent?.remove(rec.group); _vehicleMeshes.delete(id); }
    if (Array.isArray(game.vehicles)) game.vehicles = game.vehicles.filter(v => v.id !== id);
  };
}

export function tickVehicleMeshes(dt) {
  for (const [, rec] of _vehicleMeshes) {
    rec.x += (rec.tx - rec.x) * Math.min(1, 18 * dt);
    rec.y += (rec.ty - rec.y) * Math.min(1, 18 * dt);
    rec.z += (rec.tz - rec.z) * Math.min(1, 18 * dt);
    // Smooth rotation lerp (handle wrap)
    let dr = rec.trot - rec.rot;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    rec.rot += dr * Math.min(1, 12 * dt);
    rec.group.position.set(rec.x, rec.y, rec.z);
    rec.group.rotation.y = rec.rot;
  }
}

// Direct write from local driver — call this when the player is driving so the
// mesh tracks the player's position instantly (no lerp lag for the driver).
export function setOwnedVehiclePose(id, x, y, z, rot) {
  const rec = _vehicleMeshes.get(id);
  if (!rec) return;
  rec.x = rec.tx = x;
  rec.y = rec.ty = y;
  rec.z = rec.tz = z;
  rec.rot = rec.trot = rot;
  rec.group.position.set(x, y, z);
  rec.group.rotation.y = rot;
}

let _jetpackMounted = false;
if (typeof window !== 'undefined') {
  window.__attachJetpackVisual = () => attachJetpackToPlayer();
  window.__detachJetpackVisual = () => detachJetpackFromPlayer();
}
export function attachJetpackToPlayer() {
  const pv = game.visuals?.player;
  if (!pv?.jetpackGroup) return;
  pv.jetpackGroup.visible = true;
  if (_jetpackMounted) return;
  const gltf = game.shared.jetpackGltf;
  if (!gltf) return; // model not loaded yet; will retry on load
  const model = gltf.scene.clone(true);
  model.scale.setScalar(0.06);
  // Orient so the pack faces backwards; tweak in-engine if needed.
  model.rotation.y = Math.PI;
  pv.jetpackGroup.add(model);
  _jetpackMounted = true;
}

export function detachJetpackFromPlayer() {
  const pv = game.visuals?.player;
  if (!pv?.jetpackGroup) return;
  pv.jetpackGroup.visible = false;
}

// Called from main render loop while game.jetpackActive — emit a stream of
// flame-coloured particles from each thruster.
let _jetpackParticleTmr = 0;
export function tickJetpackParticles(dt, spawnParticlesFn) {
  if (!game.jetpackActive || !game.hasJetpack) return;
  const pv = game.visuals?.player;
  if (!pv?.leftThruster || !pv?.rightThruster) return;
  _jetpackParticleTmr -= dt;
  if (_jetpackParticleTmr > 0) return;
  _jetpackParticleTmr = 0.04; // ~25/s per thruster
  const lp = new THREE.Vector3(); pv.leftThruster.getWorldPosition(lp);
  const rp = new THREE.Vector3(); pv.rightThruster.getWorldPosition(rp);
  spawnParticlesFn(lp, 2, 0xff8030, 5, false);
  spawnParticlesFn(rp, 2, 0xff8030, 5, false);
  if (Math.random() < 0.3) spawnParticlesFn(lp, 1, 0xffd060, 4, true);
  if (Math.random() < 0.3) spawnParticlesFn(rp, 1, 0xffd060, 4, true);
}

// Wires the dynamic sun + hemisphere light that dayNight.js animates, and sets
// scene background/fog defaults. Stores refs in game.shared for tickDayNight.
function buildSurvivalSceneChrome() {
  game.shared.survivalSkyMode = null;
  setSurvivalSkyForTime(false);
  // Slightly denser fog so the 5×5 chunk boundary stays hidden
  game.scene.fog = new THREE.FogExp2(0xcde0ea, 0.016);

  const hemi = new THREE.HemisphereLight(0xb8d6f0, 0x3a4030, 1.2);
  game.scene.add(hemi);
  game.arenaLights.push(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  // Smaller shadow map + tighter frustum — the dynamic sun only needs to
  // cover the immediate area around the player, not the full chunk horizon.
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.target = new THREE.Object3D();
  game.scene.add(sun.target);
  game.scene.add(sun);
  game.arenaLights.push(sun);

  game.shared.sunLight = sun;
  game.shared.hemiLight = hemi;
}

// ── Survival: wild outposts, ore veins, supply pods, caravan ───────────────────

const _outpostMeshes = new Map();   // baseId -> THREE.Group
const _oreMeshes = new Map();       // veinId -> { mesh, x, z, kind }
const _supplyPodMeshes = new Map(); // podId -> { group, landAt }
let _caravanMesh = null;
let _weatherFogOriginal = null;

function buildWildOutposts() {
  for (const [, g] of _outpostMeshes) g.parent?.remove(g);
  _outpostMeshes.clear();
  // Also clear pods + caravan + camp markers from any previous match
  for (const [, rec] of _supplyPodMeshes) rec.group?.parent?.remove(rec.group);
  _supplyPodMeshes.clear();
  if (_caravanMesh) { _caravanMesh.parent?.remove(_caravanMesh); _caravanMesh = null; }
  for (const [, g] of _campMarkers) g.parent?.remove(g);
  _campMarkers.clear();
  if (_weatherFogOriginal != null && game.scene?.fog) {
    game.scene.fog.density = _weatherFogOriginal;
    _weatherFogOriginal = null;
  }
  const outposts = game.outposts || [];
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.9 });
  const wallMat  = new THREE.MeshStandardMaterial({ color: 0x707080, roughness: 0.85 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x202028, roughness: 0.9 });
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0x00ffaa, emissive: 0x00ffaa, emissiveIntensity: 1.4 });
  for (const o of outposts) {
    if (o.id === 'origin') continue;
    const y = sampleHeight(o.x, o.z, game.terrainSeed | 0);
    const group = new THREE.Group();
    group.position.set(o.x, y, o.z);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.4, 20), floorMat);
    floor.position.y = 0.2;
    floor.receiveShadow = true;
    group.add(floor);

    // Two L-shaped walls so the player can shelter inside but still see out
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(20, 4, 0.4), wallMat);
    w1.position.set(0, 2.2, -10);
    w1.castShadow = true;
    group.add(w1);
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 20), wallMat);
    w2.position.set(-10, 2.2, 0);
    w2.castShadow = true;
    group.add(w2);

    // Vendor stall in the centre (looks like the origin outpost's vendor block)
    const vendor = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 1.2), pillarMat);
    vendor.position.set(0, 1.2, -6);
    vendor.castShadow = true;
    group.add(vendor);

    // Glowing beacon — emissive mesh, no PointLight (saves per-fragment shading cost)
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 5, 8), beaconMat);
    beacon.position.set(0, 3, 0);
    group.add(beacon);

    game.scene.add(group);
    _outpostMeshes.set(o.id, group);

    // Push collision boxes (in world coords) so player can stand on the floor
    const baseFloorHalf = 10;
    game.oBs.push({
      min: { x: o.x - baseFloorHalf, z: o.z - baseFloorHalf },
      max: { x: o.x + baseFloorHalf, z: o.z + baseFloorHalf },
      h: y + 0.4, yMin: y,
    });
  }
}

const _campMarkers = new Map(); // campId -> THREE.Group
let _campMats = null;

function _getCampMats() {
  if (!_campMats) {
    _campMats = {
      stone:    new THREE.MeshStandardMaterial({ color: 0x44423a, roughness: 0.95, flatShading: true }),
      charcoal: new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.9 }),
      flame:    new THREE.MeshBasicMaterial({ color: 0xff9040 }),
      totem:    new THREE.MeshStandardMaterial({ color: 0x3a2110, roughness: 0.9 }),
      skull:    new THREE.MeshStandardMaterial({ color: 0xd8d2bf, roughness: 0.7 }),
      boundary: new THREE.MeshBasicMaterial({
        color: 0xff4422, transparent: true, opacity: 0.28,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    };
  }
  return _campMats;
}

function _buildOneCampMarker(camp) {
  if (_campMarkers.has(camp.id) || !game.scene) return;
  const { stone: stoneMat, charcoal: charcoalMat, flame: flameMat, totem: totemMat, skull: totemSkullMat, boundary: boundaryMat } = _getCampMats();
  const y = sampleHeight(camp.x, camp.z, game.terrainSeed | 0);
  const group = new THREE.Group();
  group.position.set(camp.x, y, camp.z);

  const stoneGeo = new THREE.IcosahedronGeometry(0.32, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    stone.position.set(Math.cos(a) * 0.7, 0.15, Math.sin(a) * 0.7);
    stone.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    group.add(stone);
  }
  const log1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), charcoalMat);
  log1.rotation.z = Math.PI / 2; log1.position.y = 0.18;
  group.add(log1);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 6), flameMat);
  flame.position.y = 0.7;
  group.add(flame);
  // No PointLight — emissive flame mesh is visually identical but costs nothing
  // extra in lighting. One PointLight per camp × many camps = huge fragment cost.
  const totemH = 1.4 + camp.size * 0.18;
  const totem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, totemH, 7), totemMat);
  totem.position.set(2.4, totemH / 2, 0);
  group.add(totem);
  const skullMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), totemSkullMat);
  skullMesh.position.set(2.4, totemH + 0.12, 0);
  group.add(skullMesh);

  // Ground ring showing the camp's patrol boundary
  const campRadius = 15 + camp.size * 1.5;
  const ringGeo = new THREE.RingGeometry(campRadius - 0.5, campRadius, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, boundaryMat);
  ring.position.y = 0.12;
  group.add(ring);

  game.scene.add(group);
  _campMarkers.set(camp.id, group);
}

function buildCampMarkers() {
  for (const [, g] of _campMarkers) g.parent?.remove(g);
  _campMarkers.clear();
  _campMats = null;
  for (const camp of (game.camps || [])) _buildOneCampMarker(camp);
}

export function addCampMarker(camp) {
  _buildOneCampMarker(camp);
}

let _oreVeinMats = null;
function _getOreVeinMats() {
  if (!_oreVeinMats) {
    _oreVeinMats = {
      iron:    new THREE.MeshStandardMaterial({ color: 0xd3d8e0, emissive: 0x303a44, emissiveIntensity: 0.6, roughness: 0.55, metalness: 0.4 }),
      crystal: new THREE.MeshStandardMaterial({ color: 0xff66c8, emissive: 0xc01a80, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.2 }),
    };
  }
  return _oreVeinMats;
}

function _buildOneOreVeinMesh(v) {
  if (_oreMeshes.has(v.id) || !game.scene) return;
  const mats = _getOreVeinMats();
  const y = sampleHeight(v.x, v.z, game.terrainSeed | 0);
  const geo = v.kind === 'crystal' ? new THREE.OctahedronGeometry(1.0, 0) : new THREE.IcosahedronGeometry(0.9, 0);
  const mesh = new THREE.Mesh(geo, mats[v.kind] || mats.iron);
  mesh.position.set(v.x, y + 0.7, v.z);
  mesh.castShadow = true;
  game.scene.add(mesh);
  _oreMeshes.set(v.id, { mesh, x: v.x, z: v.z, kind: v.kind });
}

function buildOreVeinMeshes() {
  for (const [, rec] of _oreMeshes) rec.mesh?.parent?.remove(rec.mesh);
  _oreMeshes.clear();
  _oreVeinMats = null;
  for (const v of (game.oreVeins || [])) _buildOneOreVeinMesh(v);
}

export function addOreVeinMesh(vein) {
  _buildOneOreVeinMesh(vein);
}

if (typeof window !== 'undefined') {
  // Called whenever the player is within reach of an ore vein and presses F.
  window.tryCollectOreVein = function () {
    if (!game.socket) return;
    const pp = game.visuals?.player?.playerGroup?.position;
    if (!pp) return;
    for (const [veinId, rec] of _oreMeshes) {
      const dx = pp.x - rec.x, dz = pp.z - rec.z;
      if (dx * dx + dz * dz < 25) {
        game.socket.emit('collectOreVein', { veinId });
        return;
      }
    }
    // Also try supply pods on the same key
    for (const [podId, rec] of _supplyPodMeshes) {
      const dx = pp.x - rec.x, dz = pp.z - rec.z;
      if (dx * dx + dz * dz < 36) {
        game.socket.emit('collectSupplyPod', { podId });
        return;
      }
    }
  };

  window.removeOreVeinMesh = function (veinId) {
    const rec = _oreMeshes.get(veinId);
    if (!rec) return;
    rec.mesh?.parent?.remove(rec.mesh);
    _oreMeshes.delete(veinId);
  };

  window.addSupplyPodMesh = function (data) {
    if (_supplyPodMeshes.has(data.id)) return;
    const group = new THREE.Group();
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xb0a08c, roughness: 0.6, metalness: 0.4 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 1.0 });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 2.2, 8), shellMat);
    shell.position.y = 1.1;
    shell.castShadow = true;
    group.add(shell);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.3, 8), stripeMat);
    stripe.position.y = 1.8;
    group.add(stripe);
    const beacon = new THREE.PointLight(0xffaa00, 2.0, 30);
    beacon.position.y = 4.0;
    group.add(beacon);
    // Visible smoke flare cylinder shooting up
    const flare = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 12, 6),
      new THREE.MeshBasicMaterial({ color: 0xff9020, transparent: true, opacity: 0.55 }),
    );
    flare.position.y = 8;
    group.add(flare);
    group.position.set(data.x, data.y ?? 0, data.z);
    game.scene.add(group);
    _supplyPodMeshes.set(data.id, { group, x: data.x, z: data.z, landAt: data.landAt || Date.now() });
  };

  window.removeSupplyPodMesh = function (podId) {
    const rec = _supplyPodMeshes.get(podId);
    if (!rec) return;
    rec.group?.parent?.remove(rec.group);
    _supplyPodMeshes.delete(podId);
  };

  window.addCaravanMesh = function (data) {
    if (_caravanMesh) { _caravanMesh.parent?.remove(_caravanMesh); _caravanMesh = null; }
    const group = new THREE.Group();
    const wagonMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1c, roughness: 0.85 });
    const tarpMat = new THREE.MeshStandardMaterial({ color: 0xaa3030, roughness: 0.7 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0xffaa00, emissiveIntensity: 1.4 });
    const wagon = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 1.8), wagonMat);
    wagon.position.y = 1.0;
    wagon.castShadow = true;
    group.add(wagon);
    const tarp = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.0, 8, 1, false, 0, Math.PI), tarpMat);
    tarp.rotation.z = Math.PI / 2;
    tarp.position.y = 2.2;
    group.add(tarp);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lampMat);
    lamp.position.set(0, 3.4, 0);
    group.add(lamp);
    const lampLight = new THREE.PointLight(0xffaa00, 1.6, 18);
    lampLight.position.set(0, 3.4, 0);
    group.add(lampLight);
    group.position.set(data.x, data.y ?? 0, data.z);
    game.scene.add(group);
    _caravanMesh = group;
  };

  window.removeCaravanMesh = function () {
    if (_caravanMesh) { _caravanMesh.parent?.remove(_caravanMesh); _caravanMesh = null; }
  };

  // Weather: thickens the fog and tints it ashen for a foggy roll-through
  window.applySurvivalWeather = function (active) {
    if (!game.scene?.fog) return;
    if (active) {
      if (_weatherFogOriginal == null) _weatherFogOriginal = game.scene.fog.density;
      game.scene.fog.density = Math.max(0.022, (_weatherFogOriginal ?? 0.012) * 2.4);
    } else {
      if (_weatherFogOriginal != null) game.scene.fog.density = _weatherFogOriginal;
    }
  };
}

function addPermanentLighting() {
  // Hemisphere always present — per-map sun and accents are added in rebuildArena.
  game.scene.add(new THREE.HemisphereLight(0x8fb7ff, 0x24303c, 0.28));
}


function buildPlayer() {
  const playerGroup = new THREE.Group();
  game.scene.add(playerGroup);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 0.8 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a3820, roughness: 0.85 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x00ccaa,
    emissive: 0x00ccaa,
    emissiveIntensity: 1.2,
  });

  // All Y positions are offset -0.06 so boot bottoms overlap the ground plane,
  // eliminating the visible floating gap in third-person view.
  const Y = -0.06;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.4), bodyMat);
  torso.position.y = 1.2 + Y;
  playerGroup.add(torso);

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.9 + Y;
  playerGroup.add(headGroup);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.02), visorMat);
  visor.position.set(0, 1.92 + Y, -0.18);
  playerGroup.add(visor);

  applyCharacterHead(headGroup, game.myCharacter, { visor });

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), bodyMat);
  leftArm.position.set(-0.55, 1.3 + Y, 0);
  playerGroup.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), bodyMat);
  rightArm.position.set(0.55, 1.3 + Y, 0);
  playerGroup.add(rightArm);

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), legMat);
  leftLeg.position.set(-0.2, 0.4 + Y, 0);
  playerGroup.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), legMat);
  rightLeg.position.set(0.2, 0.4 + Y, 0);
  playerGroup.add(rightLeg);

  const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.35), bootMat);
  leftBoot.position.set(-0.2, 0.08 + Y, 0);
  playerGroup.add(leftBoot);

  const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.35), bootMat);
  rightBoot.position.set(0.2, 0.08 + Y, 0);
  playerGroup.add(rightBoot);

  // Jetpack mount: hangs off the back of the torso. Hidden until equipped.
  // The actual mesh is swapped in once Jetpack.glb finishes loading.
  const jetpackGroup = new THREE.Group();
  jetpackGroup.position.set(0, 1.25 + Y, 0.28); // sits on back of torso
  jetpackGroup.visible = false;
  playerGroup.add(jetpackGroup);
  // Two thruster emitters (bottom of the pack)
  const leftThruster = new THREE.Object3D();
  leftThruster.position.set(-0.12, -0.2, 0);
  jetpackGroup.add(leftThruster);
  const rightThruster = new THREE.Object3D();
  rightThruster.position.set(0.12, -0.2, 0);
  jetpackGroup.add(rightThruster);

  game.visuals.player = {
    playerGroup,
    bodyMat,
    legMat, // This line was not changed, but was included in the original diff.
    visorMat,
    torso,
    headGroup,
    visor,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftBoot,
    rightBoot,
    jetpackGroup,
    leftThruster,
    rightThruster,
  };
}

function buildWeaponVisuals() {
  const firstPersonGun = new THREE.Group();
  firstPersonGun.position.set(0.25, -0.2, -0.5);
  firstPersonGun.visible = false;
  game.camera.add(firstPersonGun);
  game.scene.add(game.camera);

  const fpMuzzle = new THREE.Object3D();
  fpMuzzle.position.set(0, 0, -0.6);
  firstPersonGun.add(fpMuzzle);

  const tpMuzzle = new THREE.Object3D();
  tpMuzzle.position.set(0.5, 1.35, -0.8);
  game.visuals.player.playerGroup.add(tpMuzzle);

  game.visuals.weapon = {
    firstPersonGun,
    tpMuzzle,
    fpMuzzle,
    weaponModels: {
      pistol: {
        tpPos: [0.48, 1.3, -0.22],
        tpScale: [0.8, 0.8, 0.7],
        tpMuzzleZ: -0.38,
        fpPos: [0.22, -0.24, -0.42],
        fpAdsPos: [0.01, -0.12, -0.34],
        fpScale: [0.8, 0.8, 0.72],
        fpMuzzleZ: -0.38,
      },
      sword: {
        tpPos: [0.5, 1.2, -0.2],
        tpScale: [1, 1, 1],
        tpMuzzleZ: -0.2,
        fpPos: [0.4, -0.4, -0.6],
        fpAdsPos: [0.1, -0.2, -0.5],
        fpScale: [1, 1, 1],
        fpMuzzleZ: 0,
      },
      assault: {
        tpPos: [0.5, 1.35, -0.3],
        tpScale: [1, 1, 1],
        tpMuzzleZ: -0.6,
        fpPos: [0.25, -0.2, -0.5],
        fpAdsPos: [0.02, -0.1, -0.36],
        fpScale: [1, 1, 1],
        fpMuzzleZ: -0.6,
      },
      shotgun: {
        tpPos: [0.54, 1.32, -0.28],
        tpScale: [1.28, 1.1, 0.95],
        tpMuzzleZ: -0.74,
        fpPos: [0.28, -0.18, -0.58],
        fpAdsPos: [0.0, -0.08, -0.35],
        fpScale: [1.3, 1.08, 1.02],
        fpMuzzleZ: -0.74,
      },
      sniper: {
        tpPos: [0.56, 1.38, -0.36],
        tpScale: [0.9, 0.95, 1.8],
        tpMuzzleZ: -0.88,
        fpPos: [0.2, -0.15, -0.72],
        fpAdsPos: [0.0, -0.09, -0.28],
        fpScale: [0.92, 0.95, 1.85],
        fpMuzzleZ: -0.88,
      },
      grapple: {
        tpPos: [0.48, 1.3, -0.22],
        tpScale: [0.8, 0.8, 0.7],
        tpMuzzleZ: -0.38,
        fpPos: [0.22, -0.24, -0.42],
        fpAdsPos: [0.01, -0.12, -0.34],
        fpScale: [0.8, 0.8, 0.72],
        fpMuzzleZ: -0.38,
      },
      bazooka: {
        tpPos: [0.55, 1.32, -0.32],
        tpScale: [1, 1, 1],
        tpMuzzleZ: -0.75,
        fpPos: [0.18, -0.16, -0.38],
        fpAdsPos: [0.0, -0.08, -0.30],
        fpScale: [1, 1, 1],
        fpMuzzleZ: -0.75,
      },
      minigun: {
        tpPos: [0.5, 1.3, -0.28],
        tpScale: [1.1, 1.1, 1.1],
        tpMuzzleZ: -0.7,
        fpPos: [0.26, -0.22, -0.52],
        fpAdsPos: [0.02, -0.10, -0.38],
        fpScale: [1.1, 1.1, 1.1],
        fpMuzzleZ: -0.7,
      },
    },
  };

  const muzzleFlashLight = new THREE.PointLight(0xfffce8, 0, 12);
  muzzleFlashLight.visible = false;
  game.scene.add(muzzleFlashLight);
  game.visuals.weapon.muzzleFlashLight = muzzleFlashLight;

  const weaponGlbDefs = {
    pistol:  { file: "/assets/models/Pistol.glb",        scale: 0.125, rotY: 0 },
    assault: { file: "/assets/models/Assault Rifle.glb", scale: 0.125, rotY: 0 },
    shotgun: { file: "/assets/models/Shotgun.glb",       scale: 0.125, rotY: Math.PI / 2, posZ: 0.4 },
    sniper:  { file: "/assets/models/Sniper Rifle.glb",  scale: 0.125, rotY: Math.PI / 2, posZ: 0.4 },
    sword:   { file: "/assets/models/Katana.glb",        scale: 0.16,  rotY: Math.PI, posY: -0.6 },
    grapple: { file: "/assets/models/Lure.glb",           scale: 0.375, rotY: Math.PI / 2 },
    bazooka: { file: "/assets/models/Bazooka.glb",       scale: 0.38,  rotY: 0 },
    minigun: { file: "/assets/models/gatling_gun.glb",   scale: 0.28,  rotY: Math.PI },
  };

  const glbGroups = {};
  for (const [key, { file, scale, rotY, posY = 0, posZ = 0 }] of Object.entries(weaponGlbDefs)) {
    const fpGroup = new THREE.Group();
    fpGroup.visible = false;
    firstPersonGun.add(fpGroup);

    const tpGroup = new THREE.Group();
    tpGroup.visible = false;
    game.visuals.player.playerGroup.add(tpGroup);

    glbGroups[key] = { fpGroup, tpGroup, loaded: false };

    new GLTFLoader().load(file, (gltf) => {
      const fpCopy = gltf.scene.clone(true);
      fpCopy.scale.setScalar(scale);
      fpCopy.rotation.y = rotY;
      fpCopy.position.set(0, posY, posZ);
      fpGroup.add(fpCopy);

      const tpCopy = gltf.scene.clone(true);
      tpCopy.scale.setScalar(scale);
      tpCopy.rotation.y = rotY;
      tpCopy.position.set(0, posY, posZ);
      tpGroup.add(tpCopy);

      glbGroups[key].loaded = true;
      if (game.currentWeapon === key) applyWeaponModel();
    });
  }

  game.visuals.weapon.glbGroups = glbGroups;
}

// Swaps an enemy's placeholder box children for a GLB model and starts its walk animation.
function applyEnemyGlb(enemy, gltf, scale) {
  // Remove existing placeholder meshes
  while (enemy.group.children.length > 0) {
    const child = enemy.group.children[0];
    enemy.group.remove(child);
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
    else child.material?.dispose();
  }

  const model = cloneSkinnedScene(gltf.scene);
  model.scale.setScalar(scale);
  model.rotation.y = Math.PI;
  model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  enemy.group.add(model);

  const mixer = new THREE.AnimationMixer(model);
  if (gltf.animations?.length > 0) {
    if (enemy.type === "soldier") {
      const runClip = gltf.animations.find((a) => a.name === "CharacterArmature|Run")
        ?? gltf.animations.find((a) => /run|walk/i.test(a.name))
        ?? gltf.animations[0];
      const shootClip = gltf.animations.find((a) => a.name === "CharacterArmature|Run_Shoot")
        ?? gltf.animations.find((a) => a.name === "CharacterArmature|Gun_Shoot")
        ?? gltf.animations.find((a) => /shoot|gun/i.test(a.name));
      const deathClip = gltf.animations.find((a) => a.name === "CharacterArmature|Death")
        ?? gltf.animations.find((a) => /death|die/i.test(a.name));
      enemy.walkAction = runClip ? mixer.clipAction(runClip) : null;
      enemy.shootAction = shootClip ? mixer.clipAction(shootClip) : null;
      enemy.deathAction = deathClip ? mixer.clipAction(deathClip) : null;
      if (enemy.walkAction) {
        enemy.walkAction.play();
        enemy.currentAction = enemy.walkAction;
      }
    } else {
      const walkClip = gltf.animations.find((a) => a.name === "Walk")
        ?? gltf.animations.find((a) => /walk|run|gallop/i.test(a.name))
        ?? gltf.animations[0];
      const walkAction = mixer.clipAction(walkClip);
      walkAction.play();
      enemy.walkAction = walkAction;
      enemy.currentAction = walkAction;
    }
  }
  enemy.mixer = mixer;
  enemy.flashPart = null; // can't flash individual GLB meshes easily
}

function buildSharedRuntimeAssets() {
  game.shared.skeletonGltf = null;
  new GLTFLoader().load("/assets/models/Skeleton.glb", (gltf) => {
    game.shared.skeletonGltf = gltf;
  });

  game.shared.swatGltf = null;
  new GLTFLoader().load("/assets/models/SWAT.glb", (gltf) => {
    game.shared.swatGltf = gltf;
    // Swap in the GLB model on any soldiers already in the scene
    for (const enemy of game.enemies) {
      if (enemy.type === "soldier" && !enemy.mixer) {
        applyEnemyGlb(enemy, gltf, 1.0);
      }
    }
  });

  game.shared.wolfGltf = null;
  new GLTFLoader().load("/assets/models/Wolf.glb", (gltf) => {
    game.shared.wolfGltf = gltf;
    // Swap in the GLB model on any dogs already in the scene
    for (const enemy of game.enemies) {
      if (enemy.type === "dog" && !enemy.mixer) {
        applyEnemyGlb(enemy, gltf, 1.0);
      }
    }
  });

  game.shared.mechGltf = null;
  new GLTFLoader().load("/assets/models/Mech.glb", (gltf) => {
    game.shared.mechGltf = gltf;
  });

  game.shared.tankGltf = null;
  new GLTFLoader().load("/assets/models/Tank.glb", (gltf) => {
    gltf.scene.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    game.shared.tankGltf = gltf;
  });

  game.shared.missileGltf = null;
  new GLTFLoader().load("/assets/models/Missile.glb", (gltf) => {
    gltf.scene.traverse((n) => { if (n.isMesh) { n.castShadow = true; } });
    game.shared.missileGltf = gltf;
  });

  game.shared.jeepGltf = null;
  new GLTFLoader().load("/assets/models/Jeep.glb", (gltf) => {
    gltf.scene.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    game.shared.jeepGltf = gltf;
  });

  game.shared.jetpackGltf = null;
  new GLTFLoader().load("/assets/models/Jetpack.glb", (gltf) => {
    gltf.scene.traverse((n) => { if (n.isMesh) { n.castShadow = true; } });
    game.shared.jetpackGltf = gltf;
    // If the local player already owns a jetpack, mount it now
    if (game.hasJetpack) attachJetpackToPlayer();
  });

  game.shared.droneGltf = null;
  new GLTFLoader().load("/assets/models/Drone.glb", (gltf) => {
    gltf.scene.traverse((n) => { if (n.isMesh) { n.castShadow = true; } });
    game.shared.droneGltf = gltf;
    // Swap in the GLB model on any drones already in the scene
    for (const enemy of game.enemies) {
      if (enemy.isScoutDrone && enemy.group && !enemy._droneModelApplied) {
        // Strip placeholder children, attach the drone GLB
        const ghost = enemy.group;
        while (ghost.children.length) ghost.remove(ghost.children[0]);
        const model = gltf.scene.clone(true);
        model.scale.setScalar(0.6);
        ghost.add(model);
        enemy._droneModelApplied = true;
      }
    }
  });

  game.shared.characterHeadGltfs = {};
  const characterHeadDefs = {
    patrick: { file: "/assets/models/PatrickHead.glb" },
    iestyn:  { file: "/assets/models/iestynhead.glb" },
    will:    { file: "/assets/models/WillHead.glb" },
    matt:    { file: "/assets/models/MattHead.glb", rotY: -Math.PI / 2 },
  };
  for (const [characterId, def] of Object.entries(characterHeadDefs)) {
    new GLTFLoader().load(def.file, (gltf) => {
      gltf.userData.rotY = def.rotY ?? Math.PI;
      game.shared.characterHeadGltfs[characterId] = gltf;
      if (game.myCharacter === characterId && game.visuals?.player?.headGroup) {
        applyCharacterHead(game.visuals.player.headGroup, characterId, { visor: game.visuals.player.visor });
      }
      for (const remote of Object.values(game.remotePlayers)) {
        if (remote.character === characterId && remote.headGroup) {
          applyCharacterHead(remote.headGroup, characterId, { visor: remote.visor });
        }
      }
    });
  }

  game.shared.bulletGeo = new THREE.SphereGeometry(0.06, 6, 6);
  game.shared.trailGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4);
  game.shared.trailGeo.rotateX(Math.PI / 2);
  game.shared.playerBulletMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
  game.shared.enemyBulletMat = new THREE.MeshBasicMaterial({ color: 0xff5533 });
  game.shared.partGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  game.shared.smokeGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
  game.shared.bigPartGeo = new THREE.BoxGeometry(0.38, 0.38, 0.38); // 3× size for explosions
  game.shared.hpBgGeo = new THREE.PlaneGeometry(1.2, 0.1);
  game.shared.hpFgGeo = new THREE.PlaneGeometry(1.2, 0.08);
  game.shared.hpFgGeo.translate(0.6, 0, 0);
  game.shared.hpBgMat = new THREE.MeshBasicMaterial({ color: 0x331111, side: THREE.DoubleSide });
  game.shared.hpFgMatSoldier = new THREE.MeshBasicMaterial({ color: 0xff2244, side: THREE.DoubleSide });
  game.shared.hpFgMatDog = new THREE.MeshBasicMaterial({ color: 0xff8833, side: THREE.DoubleSide });
  game.shared.hpFgMatSkeleton = new THREE.MeshBasicMaterial({ color: 0xc0ccff, side: THREE.DoubleSide });

  game.shared.worldMaterials = {
    crateMat: new THREE.MeshStandardMaterial({ color: 0x86664a, roughness: 0.92 }),
    metalMat: new THREE.MeshStandardMaterial({ color: 0x7ba1ac, roughness: 0.34, metalness: 0.66 }),
    darkMat:  new THREE.MeshStandardMaterial({ color: 0x22343d, roughness: 0.56, metalness: 0.24 }),
  };

  // Preload weapon drop GLBs so they're ready when the first wave ends
  game.shared.weaponDropGltfs = {};
  const WEAPON_DROP_PATHS = {
    pistol:  '/assets/models/Pistol.glb',
    assault: '/assets/models/Assault%20Rifle.glb',
    shotgun: '/assets/models/Shotgun.glb',
    sniper:  '/assets/models/Sniper%20Rifle.glb',
    sword:   '/assets/models/Katana.glb',
    grapple: '/assets/models/Lure.glb',
    bazooka: '/assets/models/Bazooka.glb',
  };
  for (const [weaponId, path] of Object.entries(WEAPON_DROP_PATHS)) {
    new GLTFLoader().load(path, (gltf) => {
      game.shared.weaponDropGltfs[weaponId] = gltf;
    });
  }
}

function createNametag(name, level) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 56;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0.52)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const safeName = (name || "?").toUpperCase();
  const lvText = (typeof level === "number" && level > 0) ? `LV ${level}` : "";
  if (lvText) {
    // Draw level prefix in gold, then name in teal next to it
    ctx.font = "bold 24px Rajdhani, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const lvWidth = ctx.measureText(lvText).width;
    ctx.font = "bold 30px Rajdhani, sans-serif";
    const nameWidth = ctx.measureText(safeName).width;
    const gap = 10;
    const total = lvWidth + gap + nameWidth;
    const x = (canvas.width - total) / 2;
    ctx.font = "bold 24px Rajdhani, sans-serif";
    ctx.fillStyle = "#ffd66b";
    ctx.fillText(lvText, x, canvas.height / 2);
    ctx.font = "bold 30px Rajdhani, sans-serif";
    ctx.fillStyle = "#00ffcc";
    ctx.fillText(safeName, x + lvWidth + gap, canvas.height / 2);
  } else {
    ctx.font = "bold 30px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#00ffcc";
    ctx.fillText(safeName, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.1, 0.37, 1);
  sprite.position.set(0, 2.4, 0);
  return sprite;
}

export function updateRemotePlayerNametag(remotePlayer, newName) {
  if (newName !== undefined) remotePlayer.playerName = newName;
  if (remotePlayer.nametag) {
    remotePlayer.group.remove(remotePlayer.nametag);
    // Dispose of the old nametag's texture and material to prevent memory leaks
    if (remotePlayer.nametag.material.map) {
      remotePlayer.nametag.material.map.dispose();
    }
    remotePlayer.nametag.material.dispose();
    // Sprites don't typically have geometry, but dispose if it exists for robustness
    remotePlayer.nametag.geometry?.dispose();
  }
  remotePlayer.nametag = createNametag(remotePlayer.playerName, remotePlayer.level);
  remotePlayer.group.add(remotePlayer.nametag);
}

export function createRemotePlayer(id, initialData = {}) {
  if (game.remotePlayers[id]) {
    return game.remotePlayers[id];
  }

  const { bodyMat, legMat, visorMat } = game.visuals.player;
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.8 });
  const group = new THREE.Group();

  const RY = -0.06; // same ground offset as local player
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.4), bodyMat);
  torso.position.y = 1.2 + RY;
  group.add(torso);

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.9 + RY;
  group.add(headGroup);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.02), visorMat);
  visor.position.set(0, 1.92 + RY, -0.18);
  group.add(visor);

  applyCharacterHead(headGroup, initialData.character || null, { visor });

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), bodyMat);
  leftArm.position.set(-0.55, 1.3 + RY, 0);
  group.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), bodyMat);
  rightArm.position.set(0.55, 1.3 + RY, 0);
  group.add(rightArm);

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), legMat);
  leftLeg.position.set(-0.2, 0.4 + RY, 0);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), legMat);
  rightLeg.position.set(0.2, 0.4 + RY, 0);
  group.add(rightLeg);

  const remoteGun = new THREE.Group();
  remoteGun.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.3), gunMat));
  const remoteBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), gunMat);
  remoteBarrel.position.set(0, 0, -0.35);
  remoteGun.add(remoteBarrel);
  remoteGun.position.set(0.5, 1.35 + RY, -0.3);
  group.add(remoteGun);

  const playerName = initialData.playerName || `Player ${id.slice(0, 8)}`;
  // Pull level from the latest server broadcast if it has one already.
  const initialLevel = game.playerLevels?.[id];
  const nametag = createNametag(playerName, initialLevel);
  group.add(nametag);

  group.position.set(initialData.x ?? 0, initialData.y ?? 0, initialData.z ?? 0);
  game.scene.add(group);

  game.remotePlayers[id] = {
    group,
    headGroup,
    visor,
    remoteGun,
    torso,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    nametag,
    character: initialData.character || null,
    currentWeapon: initialData.currentWeapon || "pistol",
    isCrouching: false,
    walkT: 0,
    prevX: 0,
    prevZ: 0,
    isAlive: initialData.isAlive ?? true,
    isDowned: initialData.isDowned ?? false,
    isSpectating: initialData.isSpectating ?? false,
    hp: initialData.hp ?? 100,
    kills: initialData.kills ?? 0,
    dogKills: initialData.dogKills ?? 0,
    bossKills: initialData.bossKills ?? 0,
    totalKills: initialData.totalKills ?? initialData.kills ?? 0,
    score: initialData.score ?? 0,
    wave: initialData.wave ?? 0,
    playerName,
    playerId: id,
    level: initialLevel,
    stats: initialData.stats || {},
  };

  // Allow network.js to trigger a nametag rebuild when this player's level
  // changes. updateRemotePlayerNametag reads remote.level + remote.playerName.
  game.remotePlayers[id].refreshNametag = function refreshNametag() {
    updateRemotePlayerNametag(this);
  };

  return game.remotePlayers[id];
}

export function updateRemotePlayerVisuals() {
  for (const remote of Object.values(game.remotePlayers)) {
    const pos = remote.group.position;
    const prevX = remote.prevX ?? pos.x;
    const prevZ = remote.prevZ ?? pos.z;
    const dx = pos.x - prevX;
    const dz = pos.z - prevZ;
    const speed = game.dt > 0 ? Math.hypot(dx, dz) / game.dt : 0;
    remote.prevX = pos.x;
    remote.prevZ = pos.z;

    // Walk cycle — drive leg + arm swings from speed, fall-off when idle.
    if (remote.isAlive && !remote.pvpDying && speed > 0.6) {
      const rate = remote.isSprinting || speed > 10 ? 12 : 8;
      remote.walkT = (remote.walkT || 0) + game.dt * rate;
      const swing = Math.sin(remote.walkT) * 0.45;
      if (remote.leftLeg) remote.leftLeg.rotation.x = swing;
      if (remote.rightLeg) remote.rightLeg.rotation.x = -swing;
      if (remote.leftArm) remote.leftArm.rotation.x = -swing * 0.4;
      if (remote.rightArm) remote.rightArm.rotation.x = swing * 0.4;
    } else {
      if (remote.leftLeg) remote.leftLeg.rotation.x *= 0.88;
      if (remote.rightLeg) remote.rightLeg.rotation.x *= 0.88;
      if (remote.leftArm) remote.leftArm.rotation.x *= 0.88;
      if (remote.rightArm) remote.rightArm.rotation.x *= 0.88;
    }

    // Crouch: smoothly squish Y scale.
    const crouchTarget = remote.isCrouching ? 0.65 : 1.0;
    remote.group.scale.y += (crouchTarget - remote.group.scale.y) * Math.min(1, 14 * game.dt);

    // PvP death tilt: rotate torso forward over ~0.9s.
    if (remote.pvpDying) {
      remote.group.rotation.x += (Math.PI / 2 - remote.group.rotation.x) * Math.min(1, 5 * game.dt);
    } else if (Math.abs(remote.group.rotation.x) > 0.01) {
      remote.group.rotation.x += (0 - remote.group.rotation.x) * Math.min(1, 10 * game.dt);
    }

    // Sword swing animation.
    if (remote.currentWeapon === "sword" && remote.swordSwingProgress > 0 && remote.swordSwingProgress < 1) {
      const s = Math.sin(remote.swordSwingProgress * Math.PI);
      if (remote.swordMesh) remote.swordMesh.rotation.set(s * -0.3, s * 2, 0.8);
      if (remote.rightArm) remote.rightArm.rotation.x = -1.0 + s * 1.8;
    } else if (remote.swordMesh) {
      remote.swordMesh.rotation.set(0, 0, 0);
    }

    // Downed remote: tilt toward ground.
    if (remote.isDowned && !remote.pvpDying) {
      remote.group.rotation.x += (Math.PI / 2 - remote.group.rotation.x) * Math.min(1, 6 * game.dt);
    }
  }
}

export function removeRemotePlayer(id) {
  const remotePlayer = game.remotePlayers[id];
  if (!remotePlayer) {
    return;
  }

  game.scene.remove(remotePlayer.group);
  delete game.remotePlayers[id];
}

export function applyWeaponModel() {
  const model = game.visuals.weapon.weaponModels[game.currentWeapon];
  const wv = game.visuals.weapon;

  wv.firstPersonGun.position.set(...model.fpPos);
  wv.firstPersonGun.scale.set(1, 1, 1);
  wv.firstPersonGun.rotation.set(0, 0, 0);
  wv.fpMuzzle.position.set(0, 0, model.fpMuzzleZ);
  wv.tpMuzzle.position.set(model.tpPos[0], model.tpPos[1], model.tpPos[2] + model.tpMuzzleZ);

  if (wv.glbGroups) {
    for (const [key, g] of Object.entries(wv.glbGroups)) {
      const active = key === game.currentWeapon && g.loaded;
      g.fpGroup.visible = active;
      g.tpGroup.visible = active;
      if (active) {
        g.tpGroup.position.set(...model.tpPos);
        g.tpGroup.scale.set(1, 1, 1);
      }
    }
  }
}
