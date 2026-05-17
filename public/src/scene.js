import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

import { ARENA_SIZE, CHARACTERS, HALF, MAP_DEFS, WALL_H } from "./config.js";
import { game } from "./state.js";
import { disposeObject3D } from "./utils.js";
import { buildMapFromJson } from "./mapLoader.js";

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
    model.rotation.y = Math.PI; // face forward (GLB imports facing +Z)
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
  } else {
    const color = character ? character.headColor : 0x3a4a30;
    const boxScale = character ? character.headScale : 1.0;
    const size = 0.35 * boxScale;
    const headMat = new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), headMat);
    mesh.castShadow = true;
    headGroup.add(mesh);
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

  addPermanentLighting();
  buildPlayer();
  buildWeaponVisuals();
  buildGrappleVisuals();
  buildSharedRuntimeAssets();
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

function loadHDRSky(path) {
  // Dispose previous texture background if any
  if (game.scene.background?.isTexture) game.scene.background.dispose();
  _rgbeLoader.load(path, (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    game.scene.background = tex;
  });
}

export async function rebuildArena(mapId) {
  // Remove old arena objects.
  if (game.arenaGroup) {
    game.scene.remove(game.arenaGroup);
    disposeObject3D(game.arenaGroup);
  }
  // Dispose HDR sky texture if present
  if (game.scene.background?.isTexture) {
    game.scene.background.dispose();
    game.scene.background = null;
  }
  for (const light of game.arenaLights) {
    game.scene.remove(light);
  }
  game.arenaLights = [];
  game.oBs.length = 0;
  game.ladders.length = 0;
  game.destructibles.length = 0;

  game.arenaGroup = new THREE.Group();
  game.scene.add(game.arenaGroup);

  await buildMapFromJson(mapId);

  // Load HDR sky — runs for both JSON and legacy paths so the sky is always applied.
  const HDR_SKIES = {
    arena:   '/assets/Skies/arenasky.hdr',
    desert:  '/assets/Skies/desertsky.hdr',
    city:    '/assets/Skies/Citysky.hdr',
  };
  if (HDR_SKIES[mapId]) loadHDRSky(HDR_SKIES[mapId]);
}

function addPermanentLighting() {
  // Hemisphere always present — per-map sun and accents are added in rebuildArena.
  game.scene.add(new THREE.HemisphereLight(0x8fb7ff, 0x24303c, 0.55));
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
    },
  };

  const weaponGlbDefs = {
    pistol:  { file: "/assets/models/Pistol.glb",        scale: 0.125, rotY: 0 },
    assault: { file: "/assets/models/Assault Rifle.glb", scale: 0.125, rotY: 0 },
    shotgun: { file: "/assets/models/Shotgun.glb",       scale: 0.125, rotY: Math.PI / 2, posZ: 0.4 },
    sniper:  { file: "/assets/models/Sniper Rifle.glb",  scale: 0.125, rotY: Math.PI / 2, posZ: 0.4 },
    sword:   { file: "/assets/models/Katana.glb",        scale: 0.16,  rotY: Math.PI, posY: -0.6 },
    grapple: { file: "/assets/models/Lure.glb",           scale: 0.375, rotY: Math.PI / 2 },
    bazooka: { file: "/assets/models/Bazooka.glb",       scale: 0.38,  rotY: 0 },
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

  game.shared.characterHeadGltfs = {};
  const characterHeadDefs = {
    patrick: { file: "/assets/models/PatrickHead.glb" },
    iestyn: { file: "/assets/models/iestynhead.glb" }, // Assuming IestynHead.glb exists
    will: { file: "/assets/models/WillHead.glb" },     // Assuming WillHead.glb exists
  };
  for (const [characterId, def] of Object.entries(characterHeadDefs)) {
    new GLTFLoader().load(def.file, (gltf) => {
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
