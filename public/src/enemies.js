import * as THREE from "three";

import {
  ARENA_SIZE,
  BOSS_TUNING,
  DOG_TUNING,
  EPS,
  HALF,
  P_RAD,
  SKELETON_TUNING,
  SOLDIER_TUNING,
} from "./config.js";
import { game } from "./state.js";
import { resolveCircleBox } from "./collision.js";
import { processHit, spawnBullet, spawnParticles } from "./combat.js";
import { disposeObject3D } from "./utils.js";

function cloneSkinnedScene(source) {
  const cloned = source.clone(true);

  const srcBones = [];
  const dstBones = [];
  source.traverse((n) => { if (n.isBone) srcBones.push(n); });
  cloned.traverse((n) => { if (n.isBone) dstBones.push(n); });

  cloned.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    const sk = node.skeleton;
    const newBones = sk.bones.map((bone) => {
      const i = srcBones.indexOf(bone);
      return i !== -1 ? dstBones[i] : bone;
    });
    node.bind(new THREE.Skeleton(newBones, sk.boneInverses.slice()), node.bindMatrix);
  });

  return cloned;
}

const enemyMaterials = {
  body: new THREE.MeshStandardMaterial({ color: 0x3a2222, roughness: 0.8 }),
  head: new THREE.MeshStandardMaterial({ color: 0x443333, roughness: 0.7 }),
  eye: new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.5 }),
  gun: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 }),
  dogBody: new THREE.MeshStandardMaterial({ color: 0x3a2518, roughness: 0.85 }),
  dogEye: new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 2 }),
  flash: new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 2, roughness: 0.5 }),
  bossBody: new THREE.MeshStandardMaterial({ color: 0x6a4030, roughness: 0.78, metalness: 0.1 }),
  bossArmor: new THREE.MeshStandardMaterial({ color: 0x4e4f59, roughness: 0.45, metalness: 0.55 }),
  bossEye: new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8833, emissiveIntensity: 2.5 }),
};

const BOSS_ESCAPE_HEIGHT = (50 / 6) * 2; // doubled so the mech leaps twice as high
const MAX_LIVE_ENEMIES = 60;
const MAX_SKELETON_CORPSES = 5;

const BOSS_ESCAPE_GRAVITY = 180;
const BOSS_ESCAPE_JUMP_VELOCITY = Math.sqrt(2 * BOSS_ESCAPE_GRAVITY * BOSS_ESCAPE_HEIGHT);
const BOSS_ESCAPE_FORWARD_SPEED = 14;

const ENEMY_BULLET_SPD = SOLDIER_TUNING.bulletSpeed;
const ENEMY_BULLET_DMG = SOLDIER_TUNING.bulletDamage;
const OWNED_SYNC_RATE = 0.05; // 20 Hz sync of owned enemy positions to server

let ownedSyncTmr = 0;

export function getBossEnemy() {
  return game.enemies.find((enemy) => enemy.type === "boss") || null;
}

export function getBossEnemies() {
  return game.enemies.filter((enemy) => enemy.type === "boss");
}

function getBossWaveNumber() {
  return Math.floor(game.wave / 5);
}

function getBossWaveConfig() {
  const bossWaveNumber = getBossWaveNumber();
  if (bossWaveNumber <= 1) {
    return { bossCount: 1, hpMultiplier: 1 };
  }

  return {
    bossCount: Math.floor((bossWaveNumber + 2) / 2),
    hpMultiplier: 2 ** Math.floor((bossWaveNumber - 1) / 2),
  };
}

function createHealthBar(colorMaterial) {
  const hpBar = new THREE.Group();
  const bg = new THREE.Mesh(game.shared.hpBgGeo, game.shared.hpBgMat);
  const hpFill = new THREE.Mesh(game.shared.hpFgGeo, colorMaterial);
  hpFill.position.set(-0.6, 0, 0.002);
  hpBar.add(bg);
  hpBar.add(hpFill);
  game.scene.add(hpBar);
  return { hpBar, hpFill };
}

export function createSoldier(position, id = Math.random()) {
  const group = new THREE.Group();
  let mixer = null;
  let flashPart = null;
  let walkAction = null;   // CharacterArmature|Run
  let shootAction = null;  // CharacterArmature|Run_Shoot / Gun_Shoot
  let deathAction = null;  // CharacterArmature|Death
  let currentAction = null;

  const swatGltf = game.shared.swatGltf;
  if (swatGltf) {
    const model = cloneSkinnedScene(swatGltf.scene);
    model.scale.setScalar(1.7);
    model.rotation.y = Math.PI;
    model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    group.add(model);
    mixer = new THREE.AnimationMixer(model);
    const anims = swatGltf.animations ?? [];
    const runClip = anims.find((a) => a.name === "CharacterArmature|Run")
      ?? anims.find((a) => /run|walk/i.test(a.name));
    const shootClip = anims.find((a) => a.name === "CharacterArmature|Run_Shoot")
      ?? anims.find((a) => a.name === "CharacterArmature|Gun_Shoot")
      ?? anims.find((a) => /shoot|gun/i.test(a.name));
    const deathClip = anims.find((a) => a.name === "CharacterArmature|Death")
      ?? anims.find((a) => /death|die/i.test(a.name));
    if (runClip)   { walkAction  = mixer.clipAction(runClip);   walkAction.play();  currentAction = walkAction; }
    if (shootClip) { shootAction = mixer.clipAction(shootClip); }
    if (deathClip) { deathAction = mixer.clipAction(deathClip); }
  } else {
    // Placeholder box model — replaced automatically when SWAT.glb finishes loading
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.35), enemyMaterials.body);
    torso.position.y = 1.15;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), enemyMaterials.head);
    head.position.y = 1.8;
    group.add(head);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 0.02), enemyMaterials.eye);
    eyes.position.set(0, 1.82, -0.18);
    group.add(eyes);
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 0.15), enemyMaterials.body);
    leftArm.position.set(-0.45, 1.2, 0);
    group.add(leftArm);
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 0.15), enemyMaterials.body);
    rightArm.position.set(0.45, 1.2, 0);
    group.add(rightArm);
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), enemyMaterials.body);
    leftLeg.position.set(-0.15, 0.35, 0);
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), enemyMaterials.body);
    rightLeg.position.set(0.15, 0.35, 0);
    group.add(rightLeg);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.35), enemyMaterials.gun);
    gun.position.set(0.45, 1.2, -0.25);
    group.add(gun);
    flashPart = torso;
  }

  group.position.copy(position);
  game.scene.add(group);

  const hpMax = Math.round(
    (SOLDIER_TUNING.baseHp + game.wave * SOLDIER_TUNING.hpPerWave) * Math.pow(SOLDIER_TUNING.hpScale, game.wave),
  );
  const { hpBar, hpFill } = createHealthBar(game.shared.hpFgMatSoldier);
  const speed = SOLDIER_TUNING.baseSpeed
    + Math.random() * SOLDIER_TUNING.speedRandom
    + game.wave * SOLDIER_TUNING.speedWaveBonus;
  const fireInterval = Math.max(
    SOLDIER_TUNING.fireIntervalMin,
    SOLDIER_TUNING.fireIntervalBase - game.wave * SOLDIER_TUNING.fireIntervalWaveReduction,
  ) + Math.random() * SOLDIER_TUNING.fireIntervalRandom;

  game.enemies.push({
    id,
    type: "soldier",
    group,
    mixer,
    flashPart,
    walkAction,
    shootAction,
    deathAction,
    currentAction,
    shootAnimTmr: 0,
    radius: 0.6,
    hp: hpMax,
    maxHp: hpMax,
    spd: speed,
    fireInt: fireInterval,
    fireTmr: fireInterval * 0.5 + Math.random() * fireInterval * 0.5,
    avoidCheckTmr: 2.0,
    avoidTmr: 0,
    avoidDirX: 0,
    avoidDirZ: 0,
    flashTmr: 0,
    walkT: Math.random() * 6,
    hpBar,
    hpFg: hpFill,
  });
}

export function createDog(position, id = Math.random()) {
  const group = new THREE.Group();
  let mixer = null;
  let flashPart = null;
  let walkAction   = null;  // Walk  — used when idle / close
  let gallopAction = null;  // Gallop — used when charging
  let attackAction = null;  // Attack — used on bite
  let currentAction = null;

  const wolfGltf = game.shared.wolfGltf;
  if (wolfGltf) {
    const model = cloneSkinnedScene(wolfGltf.scene);
    model.scale.setScalar(0.55);
    model.rotation.y = Math.PI;
    model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    group.add(model);
    mixer = new THREE.AnimationMixer(model);
    const anims = wolfGltf.animations ?? [];
    const walkClip   = anims.find((a) => a.name === "Walk");
    const gallopClip = anims.find((a) => a.name === "Gallop");
    const attackClip = anims.find((a) => a.name === "Attack");
    if (walkClip)   walkAction   = mixer.clipAction(walkClip);
    if (gallopClip) gallopAction = mixer.clipAction(gallopClip);
    if (attackClip) attackAction = mixer.clipAction(attackClip);
    // Start with gallop since dogs always charge
    const startAction = gallopAction ?? walkAction;
    if (startAction) { startAction.play(); currentAction = startAction; }
  } else {
    // Placeholder box model — replaced automatically when Wolf.glb finishes loading
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 1.2), enemyMaterials.dogBody);
    body.position.y = 0.6;
    group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.4), enemyMaterials.dogBody);
    head.position.set(0, 0.8, -0.8);
    group.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.2), enemyMaterials.dogBody);
    snout.position.set(0, 0.73, -1.1);
    group.add(snout);
    const leftEar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.06), enemyMaterials.dogBody);
    leftEar.position.set(-0.12, 1.0, -0.85);
    group.add(leftEar);
    const rightEar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.06), enemyMaterials.dogBody);
    rightEar.position.set(0.12, 1.0, -0.85);
    group.add(rightEar);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.02), enemyMaterials.dogEye);
    eyes.position.set(0, 0.85, -1.0);
    group.add(eyes);
    const leftFrontLeg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), enemyMaterials.dogBody);
    leftFrontLeg.position.set(-0.25, 0.2, -0.4);
    group.add(leftFrontLeg);
    const rightFrontLeg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), enemyMaterials.dogBody);
    rightFrontLeg.position.set(0.25, 0.2, -0.4);
    group.add(rightFrontLeg);
    const leftBackLeg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), enemyMaterials.dogBody);
    leftBackLeg.position.set(-0.25, 0.2, 0.4);
    group.add(leftBackLeg);
    const rightBackLeg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), enemyMaterials.dogBody);
    rightBackLeg.position.set(0.25, 0.2, 0.4);
    group.add(rightBackLeg);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), enemyMaterials.dogBody);
    tail.position.set(0, 0.7, 0.75);
    group.add(tail);
    flashPart = body;
  }

  group.position.copy(position);
  game.scene.add(group);

  const hpMax = Math.round(
    (DOG_TUNING.baseHp + game.wave * DOG_TUNING.hpPerWave) * Math.pow(DOG_TUNING.hpScale, game.wave),
  );
  const { hpBar, hpFill } = createHealthBar(game.shared.hpFgMatDog);
  const speed = DOG_TUNING.baseSpeed + Math.random() * DOG_TUNING.speedRandom + game.wave * DOG_TUNING.speedWaveBonus;

  game.enemies.push({
    id,
    type: "dog",
    group,
    mixer,
    flashPart,
    walkAction,
    gallopAction,
    attackAction,
    currentAction,
    radius: 0.7,
    hp: hpMax,
    maxHp: hpMax,
    spd: speed,
    atkDmg: DOG_TUNING.attackDamageBase + game.wave * DOG_TUNING.attackDamagePerWave,
    atkTmr: 0,
    avoidCheckTmr: 2.0,
    avoidTmr: 0,
    avoidDirX: 0,
    avoidDirZ: 0,
    flashTmr: 0,
    walkT: Math.random() * 6,
    hpBar,
    hpFg: hpFill,
  });
}

export function createBoss(position, id = Math.random(), options = {}) {
  const group = new THREE.Group();

  let mixer = null;
  let walkAction = null;
  let jumpAction = null;
  let landingAction = null;
  let kickAction = null;
  let hitAction = null;
  let deathAction = null;
  let currentAction = null;
  let flashPart = null;

  const mechGltf = game.shared.mechGltf;
  let mechBoundsRadius = 0;
  let mechBoundsHeight = 0;
  if (mechGltf) {
    const model = cloneSkinnedScene(mechGltf.scene);
    // Render the mech at its native size — no scaling.
    model.rotation.y = Math.PI; // face forward
    model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    group.add(model);

    // Measure the model so the collision hitbox matches its visual size.
    const bbox = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    mechBoundsHeight = size.y;
    mechBoundsRadius = Math.max(size.x, size.z) * 0.5;

    mixer = new THREE.AnimationMixer(model);
    const anims = mechGltf.animations ?? [];
    const findClip = (...names) => {
      for (const n of names) {
        const exact = anims.find((a) => a.name === n);
        if (exact) return exact;
      }
      for (const n of names) {
        const fuzzy = anims.find((a) => new RegExp(n, "i").test(a.name));
        if (fuzzy) return fuzzy;
      }
      return null;
    };
    const walkClip    = findClip("Walk", "walk");
    const jumpClip    = findClip("Jump", "jump");
    const landingClip = findClip("Jump_Landing", "Landing", "land");
    const kickClip    = findClip("Kick", "kick");
    const hitClip     = findClip("HitRecieve_2", "HitReceive_2", "HitRecieve", "HitReceive", "Hit");
    const deathClip   = findClip("Death", "Die");

    if (walkClip)    { walkAction    = mixer.clipAction(walkClip);    walkAction.setLoop(THREE.LoopRepeat, Infinity); walkAction.play(); currentAction = walkAction; }
    if (jumpClip)    { jumpAction    = mixer.clipAction(jumpClip);    jumpAction.setLoop(THREE.LoopOnce);    jumpAction.clampWhenFinished = false; }
    if (landingClip) { landingAction = mixer.clipAction(landingClip); landingAction.setLoop(THREE.LoopOnce); landingAction.clampWhenFinished = false; }
    if (kickClip)    { kickAction    = mixer.clipAction(kickClip);    kickAction.setLoop(THREE.LoopOnce);    kickAction.clampWhenFinished = false; }
    if (hitClip)     { hitAction     = mixer.clipAction(hitClip);     hitAction.setLoop(THREE.LoopOnce);     hitAction.clampWhenFinished = false; }
    if (deathClip)   { deathAction   = mixer.clipAction(deathClip);   deathAction.setLoop(THREE.LoopOnce);   deathAction.clampWhenFinished = true; }
  } else {
    // Fallback box boss if Mech.glb hasn't loaded yet
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.5, 1.2), enemyMaterials.bossBody);
    torso.position.y = 2.35;
    group.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.2, 1.32), enemyMaterials.bossArmor);
    chest.position.set(0, 2.45, 0.08);
    group.add(chest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), enemyMaterials.bossBody);
    head.position.y = 4.15;
    group.add(head);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.04), enemyMaterials.bossEye);
    eyes.position.set(0, 4.18, -0.46);
    group.add(eyes);
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.9, 0.55), enemyMaterials.bossBody);
    leftLeg.position.set(-0.52, 0.98, 0);
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.9, 0.55), enemyMaterials.bossBody);
    rightLeg.position.set(0.52, 0.98, 0);
    group.add(rightLeg);
    flashPart = chest;
  }

  group.position.copy(position);
  game.scene.add(group);

  const hpMultiplier = options.hpMultiplier ?? 1;
  const hpMax = Math.round(BOSS_TUNING.baseHp * Math.pow(BOSS_TUNING.hpScale, game.wave) * hpMultiplier);
  const hpBar = new THREE.Group();
  const hpBarBg = new THREE.Mesh(game.shared.hpBgGeo, game.shared.hpBgMat);
  const hpFill = new THREE.Mesh(
    game.shared.hpFgGeo,
    new THREE.MeshBasicMaterial({ color: 0xffb347, side: THREE.DoubleSide }),
  );
  hpFill.position.set(-0.6, 0, 0.002);
  hpBar.add(hpBarBg);
  hpBar.add(hpFill);
  game.scene.add(hpBar);

  game.enemies.push({
    id,
    type: "boss",
    group,
    mixer,
    walkAction,
    jumpAction,
    landingAction,
    kickAction,
    hitAction,
    deathAction,
    currentAction,
    flashPart,
    // Hitbox matches the actual GLB bounds when available; falls back to the box-boss radius.
    radius: mechBoundsRadius > 0 ? mechBoundsRadius : 1.45,
    bossHeight: mechBoundsHeight > 0 ? mechBoundsHeight : 4.6,
    hp: hpMax,
    maxHp: hpMax,
    spd: BOSS_TUNING.moveSpeed,
    atkDmg: BOSS_TUNING.attackDamageBase + game.wave * BOSS_TUNING.attackDamagePerWave,
    atkTmr: 0,
    swingTmr: 0,
    windupTmr: 0,
    flashTmr: 0,
    walkT: 0,
    velX: 0,
    velZ: 0,
    velY: 0,
    stuckTmr: 0,
    lastTrackX: position.x,
    lastTrackZ: position.z,
    hpBar,
    hpFg: hpFill,
    bossName: hpMultiplier > 1 ? "TITAN BRUTE ELITE" : "TITAN BRUTE",
  });
}

// Mini-boss: same model as boss at 0.5 scale, all weapons effective, no Phase 2
export function createMiniBoss(position, id = Math.random(), options = {}) {
  const group = new THREE.Group();

  let mixer = null;
  let walkAction = null;
  let jumpAction = null;
  let landingAction = null;
  let kickAction = null;
  let hitAction = null;
  let deathAction = null;
  let currentAction = null;
  let flashPart = null;

  const mechGltf = game.shared.mechGltf;
  let mechBoundsRadius = 0;
  let mechBoundsHeight = 0;
  if (mechGltf) {
    const model = cloneSkinnedScene(mechGltf.scene);
    model.scale.setScalar(0.5);
    model.rotation.y = Math.PI;
    model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    group.add(model);

    const bbox = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    mechBoundsHeight = size.y;
    mechBoundsRadius = Math.max(size.x, size.z) * 0.5;

    mixer = new THREE.AnimationMixer(model);
    const anims = mechGltf.animations ?? [];
    const findClip = (...names) => {
      for (const n of names) { const exact = anims.find((a) => a.name === n); if (exact) return exact; }
      for (const n of names) { const fuzzy = anims.find((a) => new RegExp(n, "i").test(a.name)); if (fuzzy) return fuzzy; }
      return null;
    };
    const walkClip    = findClip("Walk", "walk");
    const jumpClip    = findClip("Jump", "jump");
    const landingClip = findClip("Jump_Landing", "Landing", "land");
    const kickClip    = findClip("Kick", "kick");
    const hitClip     = findClip("HitRecieve_2", "HitReceive_2", "HitRecieve", "HitReceive", "Hit");
    const deathClip   = findClip("Death", "Die");

    if (walkClip)    { walkAction    = mixer.clipAction(walkClip);    walkAction.setLoop(THREE.LoopRepeat, Infinity); walkAction.play(); currentAction = walkAction; }
    if (jumpClip)    { jumpAction    = mixer.clipAction(jumpClip);    jumpAction.setLoop(THREE.LoopOnce);    jumpAction.clampWhenFinished = false; }
    if (landingClip) { landingAction = mixer.clipAction(landingClip); landingAction.setLoop(THREE.LoopOnce); landingAction.clampWhenFinished = false; }
    if (kickClip)    { kickAction    = mixer.clipAction(kickClip);    kickAction.setLoop(THREE.LoopOnce);    kickAction.clampWhenFinished = false; }
    if (hitClip)     { hitAction     = mixer.clipAction(hitClip);     hitAction.setLoop(THREE.LoopOnce);     hitAction.clampWhenFinished = false; }
    if (deathClip)   { deathAction   = mixer.clipAction(deathClip);   deathAction.setLoop(THREE.LoopOnce);   deathAction.clampWhenFinished = true; }
  } else {
    // Fallback box mini-boss: scaled-down version of box boss
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.25, 0.6), enemyMaterials.bossBody);
    torso.position.y = 1.175;
    group.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(1.075, 0.6, 0.66), enemyMaterials.bossArmor);
    chest.position.set(0, 1.225, 0.04);
    group.add(chest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.475, 0.475, 0.475), enemyMaterials.bossBody);
    head.position.y = 2.075;
    group.add(head);
    flashPart = chest;
  }

  group.position.copy(position);
  game.scene.add(group);

  const hpMax = options.hp ?? Math.round(3 * (58 + game.wave * 12) * Math.pow(1.1, game.wave));
  const hpBar = new THREE.Group();
  const hpBarBg = new THREE.Mesh(game.shared.hpBgGeo, game.shared.hpBgMat);
  const hpFill = new THREE.Mesh(
    game.shared.hpFgGeo,
    new THREE.MeshBasicMaterial({ color: 0xff4400, side: THREE.DoubleSide }),
  );
  hpFill.position.set(-0.6, 0, 0.002);
  hpBar.add(hpBarBg);
  hpBar.add(hpFill);
  game.scene.add(hpBar);

  game.enemies.push({
    id,
    type: "miniboss",
    group,
    mixer,
    walkAction,
    jumpAction,
    landingAction,
    kickAction,
    hitAction,
    deathAction,
    currentAction,
    flashPart,
    radius: mechBoundsRadius > 0 ? mechBoundsRadius : 0.725,
    bossHeight: mechBoundsHeight > 0 ? mechBoundsHeight : 2.3,
    hp: hpMax,
    maxHp: hpMax,
    spd: 13.8,
    atkDmg: Math.round((100 + game.wave * 10) * 0.4),
    atkTmr: 0,
    swingTmr: 0,
    windupTmr: 0,
    flashTmr: 0,
    walkT: 0,
    velX: 0,
    velZ: 0,
    velY: 0,
    stuckTmr: 0,
    lastTrackX: position.x,
    lastTrackZ: position.z,
    hpBar,
    hpFg: hpFill,
    bossName: "TITAN SCOUT",
  });
}

export function createSkeleton(position, id = Math.random()) {
  const group = new THREE.Group();
  let mixer = null;

  const gltf = game.shared.skeletonGltf;
  if (gltf) {
    const model = cloneSkinnedScene(gltf.scene);
    model.scale.setScalar(0.75);
    model.rotation.y = Math.PI;
    group.add(model);

    mixer = new THREE.AnimationMixer(model);
    if (gltf.animations && gltf.animations.length > 0) {
      const walkClip = gltf.animations[gltf.animations.length - 1];
      const walkAction = mixer.clipAction(walkClip);
      walkAction.play();
    }
  } else {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 1.1, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.9 }),
    );
    body.position.y = 0.8;
    group.add(body);
  }

  group.position.copy(position);
  game.scene.add(group);

  // Skeletons have 1 HP â€” no health bar shown
  const hpBar = new THREE.Group();
  const hpFill = new THREE.Mesh(game.shared.hpFgGeo, game.shared.hpFgMatSkeleton);
  hpBar.add(hpFill);

  game.enemies.push({
    id,
    type: "skeleton",
    group,
    mixer,
    flashPart: null,
    radius: 0.4,
    hp: SKELETON_TUNING.hp,
    maxHp: SKELETON_TUNING.hp,
    spd: SKELETON_TUNING.baseSpeed + Math.random() * SKELETON_TUNING.speedRandom,
    atkDmg: SKELETON_TUNING.attackDamageBase + game.wave * SKELETON_TUNING.attackDamagePerWave,
    atkTmr: 0,
    avoidCheckTmr: 2.0,
    avoidTmr: 0,
    avoidDirX: 0,
    avoidDirZ: 0,
    flashTmr: 0,
    walkT: Math.random() * 6,
    hpBar,
    hpFg: hpFill,
  });
}

function playSkeletonDeathEffect(position, rotationY) {
  const gltf = game.shared.skeletonGltf;
  if (!gltf || !gltf.animations || gltf.animations.length < 2) {
    return;
  }
  if (game.skeletonCorpses.length >= MAX_SKELETON_CORPSES) {
    return;
  }

  const model = cloneSkinnedScene(gltf.scene);
  model.scale.setScalar(0.75);
  model.position.copy(position);
  model.rotation.y = rotationY + Math.PI;
  game.scene.add(model);

  const deathClip = gltf.animations[1];
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(deathClip);
  action.setLoop(THREE.LoopOnce);
  action.clampWhenFinished = true;
  action.play();

  game.skeletonCorpses.push({ model, mixer, elapsed: 0, duration: deathClip.duration + 0.4 });
}

function playBossDeathEffect(enemy) {
  const gltf = game.shared.mechGltf;
  if (!gltf) return;
  const deathClip = gltf.animations?.find((c) => c.name === "Death")
    ?? gltf.animations?.find((c) => /death|die/i.test(c.name));
  if (!deathClip) return;

  const model = cloneSkinnedScene(gltf.scene);
  // Native scale — matches createBoss
  model.position.copy(enemy.group.position);
  model.rotation.y = enemy.group.rotation.y;
  model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  game.scene.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(deathClip);
  action.setLoop(THREE.LoopOnce);
  action.clampWhenFinished = true;
  action.play();

  game.skeletonCorpses.push({ model, mixer, elapsed: 0, duration: deathClip.duration + 0.6 });
}

function playSwatDeathEffect(position, rotationY) {
  const gltf = game.shared.swatGltf;
  if (!gltf || !gltf.animations?.length || game.skeletonCorpses.length >= MAX_SKELETON_CORPSES) {
    return;
  }

  const deathClip = gltf.animations.find((clip) => clip.name === "CharacterArmature|Death")
    ?? gltf.animations.find((clip) => /death|die/i.test(clip.name));
  if (!deathClip) {
    return;
  }

  const model = cloneSkinnedScene(gltf.scene);
  model.scale.setScalar(1.7);
  model.position.copy(position);
  model.rotation.y = rotationY + Math.PI;
  model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  game.scene.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(deathClip);
  action.setLoop(THREE.LoopOnce);
  action.clampWhenFinished = true;
  action.play();

  game.skeletonCorpses.push({ model, mixer, elapsed: 0, duration: deathClip.duration + 0.45 });
}

export function removeEnemy(index) {
  const enemy = game.enemies[index];
  if (!enemy) {
    return;
  }

  if (enemy.type === "skeleton" && enemy.mixer) {
    playSkeletonDeathEffect(enemy.group.position, enemy.group.rotation.y);
    enemy.mixer.stopAllAction();
  } else if (enemy.type === "soldier" && game.shared.swatGltf) {
    playSwatDeathEffect(enemy.group.position, enemy.group.rotation.y);
  } else if ((enemy.type === "boss" || enemy.type === "miniboss") && enemy.deathAction && enemy.mixer) {
    playBossDeathEffect(enemy);
  }

  game.scene.remove(enemy.group);
  disposeObject3D(enemy.group);
  if (enemy.hpBar) {
    game.scene.remove(enemy.hpBar);
    disposeObject3D(enemy.hpBar);
  }
  game.enemies.splice(index, 1);

  if (
    game.enemies.length === 0
    && game.enemiesToSpawn <= 0
    && (game.waveState === "SPAWNING" || game.waveState === "ACTIVE")
  ) {
    finishWave();
  }
}

export function finishWave() {
  game.score += game.wave * 50;
  game.waveState = "WAIT";
  game.waveTmr = 2.5;
  game.waveElapsed = 0;
  game.nextEnemyPing = 60;
  game.enemyPingTmr = 0;
}

export function updateEnemies() {
  if (game.mode === "PVP" || game.mode === "FFA") return;

  // Host client runs Three.js AI for all enemies (wall collision, targeting, firing).
  // Non-host clients lerp toward server-broadcast positions.
  const runAI = game.isHost;
  ownedSyncTmr -= game.dt;
  const doSync = runAI && ownedSyncTmr <= 0;
  if (doSync) ownedSyncTmr = OWNED_SYNC_RATE;
  const syncBatch = [];

  game.enemies.forEach((enemy) => {
    // Boss/mini-boss hit-reaction timer + walk fallback (runs on every client)
    if (enemy.type === "boss" || enemy.type === "miniboss") {
      if ((enemy.hitCooldown || 0) > 0) enemy.hitCooldown -= game.dt;
      if ((enemy.hitTmr || 0) > 0) enemy.hitTmr -= game.dt;
      if (
        enemy.walkAction
        && enemy.currentAction !== enemy.walkAction
        && !enemy.escaping
        && (enemy.hitTmr || 0) <= 0
        && (enemy.landingTmr || 0) <= 0
        && (enemy.swingTmr || 0) <= 0
        && (enemy.windupTmr || 0) <= 0
      ) {
        crossfadeToAction(enemy, enemy.walkAction, 0.15);
      }
    }
    if (runAI) {
      runOwnedEnemyAI(enemy);
      if (doSync) {
        const p = enemy.group.position;
        syncBatch.push({ id: enemy.id, x: p.x, y: p.y, z: p.z, rot: enemy.group.rotation.y, walkT: enemy.walkT || 0 });
      }
    } else {
      const isBossType = enemy.type === "boss" || enemy.type === "miniboss";
      const lerpXZ = isBossType ? 25 : 15;
      const lerpY  = isBossType ? 20 : 12;
      if (enemy.serverX !== undefined) {
        enemy.group.position.x += (enemy.serverX - enemy.group.position.x) * Math.min(1, lerpXZ * game.dt);
        enemy.group.position.z += (enemy.serverZ - enemy.group.position.z) * Math.min(1, lerpXZ * game.dt);
      }
      if (enemy.serverY !== undefined) {
        enemy.group.position.y += (enemy.serverY - enemy.group.position.y) * Math.min(1, lerpY * game.dt);
      }
    }
    updateHealthBar(enemy);
    if (enemy.mixer) {
      // Boss/mini-boss always animated; smaller enemies skip past 30 units to save cycles
      if (enemy.type === "boss" || enemy.type === "miniboss") {
        enemy.mixer.update(game.dt);
      } else {
        const camDx = enemy.group.position.x - game.camera.position.x;
        const camDz = enemy.group.position.z - game.camera.position.z;
        if (camDx * camDx + camDz * camDz < 30 * 30) enemy.mixer.update(game.dt);
      }
    }
  });

  if (syncBatch.length > 0) game.socket?.emit("ownedEnemiesSync", syncBatch);
  updateSkeletonCorpses();
}

// ── Enemy AI helpers (host-client Three.js simulation) ────────────────────────

function getTargets() {
  const targets = [];
  if (game.localPlayerIsAlive && !game.localPlayerIsDowned) {
    targets.push({ pos: game.visuals.player.playerGroup.position, id: game.socket?.id, isLocal: true });
  }
  for (const [id, remote] of Object.entries(game.remotePlayers)) {
    if (remote.isAlive && !remote.isDowned && !remote.isSpectating) {
      targets.push({ pos: remote.group.position, id, isLocal: false });
    }
  }
  return targets;
}

function moveEnemyWithCollision(pos, ndx, ndz, spd) {
  pos.x = Math.max(-HALF + 1, Math.min(HALF - 1, pos.x + ndx * spd * game.dt));
  pos.z = Math.max(-HALF + 1, Math.min(HALF - 1, pos.z + ndz * spd * game.dt));
  for (const obs of game.oBs) resolveCircleBox(pos, 0.7, obs, 0);
}

function segmentIntersectsExpandedBox(startX, startZ, endX, endZ, obs, pad = 0) {
  const minX = obs.min.x - pad;
  const maxX = obs.max.x + pad;
  const minZ = obs.min.z - pad;
  const maxZ = obs.max.z + pad;
  const dx = endX - startX;
  const dz = endZ - startZ;
  let tmin = 0;
  let tmax = 1;

  if (Math.abs(dx) > 1e-9) {
    const t1 = (minX - startX) / dx;
    const t2 = (maxX - startX) / dx;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (startX < minX || startX > maxX) {
    return false;
  }

  if (Math.abs(dz) > 1e-9) {
    const t1 = (minZ - startZ) / dz;
    const t2 = (maxZ - startZ) / dz;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (startZ < minZ || startZ > maxZ) {
    return false;
  }

  return tmin <= tmax;
}

function hasBlockingObstacle(startX, startZ, endX, endZ, pad = 0) {
  return game.oBs.some((obs) => segmentIntersectsExpandedBox(startX, startZ, endX, endZ, obs, pad));
}

function getDetourDirection(pos, targetPos) {
  const clearance = 1.5;
  let blockingObs = null;
  let bestDistSq = Infinity;

  for (const obs of game.oBs) {
    if (!segmentIntersectsExpandedBox(pos.x, pos.z, targetPos.x, targetPos.z, obs, clearance)) continue;
    const centerX = (obs.min.x + obs.max.x) * 0.5;
    const centerZ = (obs.min.z + obs.max.z) * 0.5;
    const dx = centerX - pos.x;
    const dz = centerZ - pos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      blockingObs = obs;
    }
  }

  if (!blockingObs) return null;

  const points = [
    { x: blockingObs.min.x - clearance, z: blockingObs.min.z - clearance },
    { x: blockingObs.min.x - clearance, z: blockingObs.max.z + clearance },
    { x: blockingObs.max.x + clearance, z: blockingObs.min.z - clearance },
    { x: blockingObs.max.x + clearance, z: blockingObs.max.z + clearance },
  ];

  let bestPoint = null;
  let bestScore = Infinity;
  for (const point of points) {
    const d1 = (point.x - pos.x) ** 2 + (point.z - pos.z) ** 2;
    const d2 = (targetPos.x - point.x) ** 2 + (targetPos.z - point.z) ** 2;
    const score = d1 + d2;
    if (score < bestScore) {
      bestScore = score;
      bestPoint = point;
    }
  }

  if (!bestPoint) return null;
  const dx = bestPoint.x - pos.x;
  const dz = bestPoint.z - pos.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

function updateDetourState(enemy, pos, targetPos, movedDistSq, attackRange) {
  enemy.avoidCheckTmr = (enemy.avoidCheckTmr || 0) - game.dt;
  enemy.avoidTmr = Math.max(0, (enemy.avoidTmr || 0) - game.dt);

  if (enemy.avoidCheckTmr > 0) return;
  enemy.avoidCheckTmr = 2.0;

  const distSq = (targetPos.x - pos.x) ** 2 + (targetPos.z - pos.z) ** 2;
  if (distSq <= attackRange * attackRange) {
    enemy.avoidTmr = 0;
    return;
  }

  const movedEnough = movedDistSq > 0.09;
  const blocked = hasBlockingObstacle(pos.x, pos.z, targetPos.x, targetPos.z, 0.2);
  if (movedEnough || !blocked) {
    enemy.avoidTmr = 0;
    return;
  }

  const detour = getDetourDirection(pos, targetPos);
  if (detour) {
    enemy.avoidDirX = detour.x;
    enemy.avoidDirZ = detour.z;
    enemy.avoidTmr = 2.0;
  }
}

function applyMeleeDamage(enemy, target, damage) {
  const pos = enemy.group.position;
  const dx = target.pos.x - pos.x, dz = target.pos.z - pos.z;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  // Knockback force — boss retains full push; dog and skeleton both 10
  const force = enemy.type === "boss" ? 185 : 10;
  game.socket?.emit("enemyMeleeAttempt", {
    enemyId: enemy.id, targetId: target.id, damage,
    ex: pos.x, ey: pos.y, ez: pos.z,
    knockbackX: (dx / len) * force,
    knockbackZ: (dz / len) * force,
  });
}

// Smoothly crossfade an enemy's animation to a new action.
function crossfadeToAction(enemy, toAction, duration) {
  if (!toAction || !enemy.mixer || enemy.currentAction === toAction) return;
  // Always reset+play the target action so a previously clamped one-shot
  // (e.g. Walk that finished, or Hit that ended) starts driving the skeleton again.
  toAction.reset();
  toAction.setEffectiveWeight(1);
  toAction.play();
  if (enemy.currentAction) enemy.currentAction.crossFadeTo(toAction, duration, false);
  enemy.currentAction = toAction;
}

function runOwnedEnemyAI(enemy) {
  const pos = enemy.group.position;
  const targets = getTargets();
  if (targets.length === 0) return;

  // ── Awareness: brief look-up pause the FIRST time an enemy spots a player ──
  // Enemies move normally until within detection range; then pause once, then charge.
  if (!enemy.noticed) {
    const detectionR2 = enemy.type === "boss" ? 2500 : 1600; // 50 or 40 units
    for (const t of targets) {
      const dx = t.pos.x - pos.x, dz = t.pos.z - pos.z;
      if (dx * dx + dz * dz < detectionR2) {
        enemy.noticed   = true;
        enemy.noticeTmr = enemy.type === "boss" ? 0.55 : 0.28;
        break;
      }
    }
    // NOT noticed yet — fall through to normal AI (enemies still pathfind toward player)
  }
  if (enemy.noticeTmr > 0) {
    enemy.noticeTmr -= game.dt;
    // Face the nearest target but hold position during the notice beat
    const closest = targets.reduce((best, t) => {
      const dx = t.pos.x - pos.x, dz = t.pos.z - pos.z;
      const d2 = dx * dx + dz * dz;
      return d2 < best.d2 ? { t, d2 } : best;
    }, { d2: Infinity }).t;
    if (closest) {
      const dx = closest.pos.x - pos.x, dz = closest.pos.z - pos.z;
      enemy.group.rotation.y = Math.atan2(dx, dz) + Math.PI;
    }
    return;
  }
  let closest = null, closestDist = Infinity;
  for (const t of targets) {
    const ddx = t.pos.x - pos.x, ddz = t.pos.z - pos.z;
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d < closestDist) { closestDist = d; closest = t; }
  }
  if (!closest) return;
  const dx = closest.pos.x - pos.x, dz = closest.pos.z - pos.z;
  const dist = Math.max(closestDist, 0.001);
  const ndx = dx / dist, ndz = dz / dist;
  enemy.group.rotation.y = Math.atan2(ndx, ndz) + Math.PI;
  if (enemy.type === "soldier")       ownedSoldierAI(enemy, pos, closest, dist, ndx, ndz);
  else if (enemy.type === "dog") {
    ownedMeleeAI(enemy, pos, closest, dist, ndx, ndz, DOG_TUNING.attackRange, DOG_TUNING.attackFrequency, 12);
  } else if (enemy.type === "skeleton") {
    ownedMeleeAI(
      enemy,
      pos,
      closest,
      dist,
      ndx,
      ndz,
      SKELETON_TUNING.attackRange,
      SKELETON_TUNING.attackFrequency,
      12,
    );
  }
  else if (enemy.type === "boss" || enemy.type === "miniboss") ownedBossAI(enemy, pos, closest, dist, ndx, ndz);
}

function ownedSoldierAI(enemy, pos, closest, dist, ndx, ndz) {
  const moveSpd = dist > SOLDIER_TUNING.kiteAdvanceDistance
    ? enemy.spd
    : dist < SOLDIER_TUNING.kiteRetreatDistance ? -enemy.spd * SOLDIER_TUNING.retreatSpeedMultiplier : 0;
  const prevX = pos.x;
  const prevZ = pos.z;
  const dirX = enemy.avoidTmr > 0 ? enemy.avoidDirX : ndx;
  const dirZ = enemy.avoidTmr > 0 ? enemy.avoidDirZ : ndz;
  moveEnemyWithCollision(pos, dirX, dirZ, moveSpd);
  updateDetourState(
    enemy,
    pos,
    closest.pos,
    (pos.x - prevX) ** 2 + (pos.z - prevZ) ** 2,
    SOLDIER_TUNING.kiteRetreatDistance,
  );
  trackStuck(enemy, pos, closest.pos);
  enemy.walkT = (enemy.walkT || 0) + game.dt * 8;

  // Tick shoot animation timer; blend back to run when it expires
  if ((enemy.shootAnimTmr || 0) > 0) {
    enemy.shootAnimTmr -= game.dt;
  } else if (enemy.walkAction && enemy.currentAction === enemy.shootAction) {
    crossfadeToAction(enemy, enemy.walkAction, 0.2);
  }

  if (dist < SOLDIER_TUNING.attackRange) {
    enemy.fireTmr = (enemy.fireTmr || 0) - game.dt;
    if (enemy.fireTmr <= 0) {
      enemy.fireTmr = enemy.fireInt || 1.5;
      // Switch to shoot animation for ~0.7 s
      if (enemy.shootAction) {
        crossfadeToAction(enemy, enemy.shootAction, 0.08);
        enemy.shootAnimTmr = SOLDIER_TUNING.shootAnimDuration;
      }
      const spreadH = (Math.random() - 0.5) * SOLDIER_TUNING.bulletSpreadH;
      const horizontalX = ndx + spreadH;
      const horizontalZ = ndz + spreadH;
      const horizontalLen = Math.sqrt(horizontalX ** 2 + horizontalZ ** 2) || 1;
      const verticalDir = dist > 0 ? ((closest.pos.y + 1.2) - (pos.y + 1.2)) / dist : 0;
      const bDir = new THREE.Vector3(horizontalX / horizontalLen, verticalDir, horizontalZ / horizontalLen).normalize();
      const bPos = pos.clone().addScaledVector(bDir, 0.6).setY(1.2);
      spawnBullet(
        bPos.clone(),
        bDir.clone(),
        false,
        { damage: ENEMY_BULLET_DMG, spd: ENEMY_BULLET_SPD, life: SOLDIER_TUNING.bulletLife },
        false,
      );
      game.socket?.emit("ownerEnemyFired", {
        enemyId: enemy.id, x: bPos.x, y: bPos.y, z: bPos.z,
        dx: bDir.x, dy: bDir.y, dz: bDir.z, spd: ENEMY_BULLET_SPD, life: SOLDIER_TUNING.bulletLife,
        damage: ENEMY_BULLET_DMG,
      });
    }
  }
}

// Teleports a hopelessly stuck non-boss enemy to a clear position near its closest target.
function unstuckTeleport(enemy, pos, targetPos) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 6 + Math.random() * 6;
  pos.x = Math.max(-HALF + 2, Math.min(HALF - 2, targetPos.x + Math.cos(angle) * radius));
  pos.z = Math.max(-HALF + 2, Math.min(HALF - 2, targetPos.z + Math.sin(angle) * radius));
  enemy._stuckSecs = 0;
  enemy._stuckCheckX = pos.x;
  enemy._stuckCheckZ = pos.z;
}

// Accumulates per-second movement checks; calls unstuckTeleport after 15 s without progress.
function trackStuck(enemy, pos, targetPos) {
  enemy._stuckCheckTmr = (enemy._stuckCheckTmr || 0) + game.dt;
  if (enemy._stuckCheckTmr < 1.0) return;
  enemy._stuckCheckTmr = 0;
  const cx = enemy._stuckCheckX ?? pos.x;
  const cz = enemy._stuckCheckZ ?? pos.z;
  const movedSq = (pos.x - cx) ** 2 + (pos.z - cz) ** 2;
  enemy._stuckCheckX = pos.x;
  enemy._stuckCheckZ = pos.z;
  enemy._stuckSecs = movedSq < 0.5 ? (enemy._stuckSecs || 0) + 1 : 0;
  if (enemy._stuckSecs >= 15) unstuckTeleport(enemy, pos, targetPos);
}

function ownedMeleeAI(enemy, pos, closest, dist, ndx, ndz, range, freq, walkMult) {
  const prevX = pos.x;
  const prevZ = pos.z;
  const dirX = enemy.avoidTmr > 0 ? enemy.avoidDirX : ndx;
  const dirZ = enemy.avoidTmr > 0 ? enemy.avoidDirZ : ndz;
  moveEnemyWithCollision(pos, dirX, dirZ, enemy.spd);
  updateDetourState(enemy, pos, closest.pos, (pos.x - prevX) ** 2 + (pos.z - prevZ) ** 2, range);
  trackStuck(enemy, pos, closest.pos);
  enemy.walkT = (enemy.walkT || 0) + game.dt * walkMult;
  enemy.atkTmr = (enemy.atkTmr || 0) - game.dt;

  if (dist < range && enemy.atkTmr <= 0) {
    enemy.atkTmr = freq;
    if (enemy.attackAction) crossfadeToAction(enemy, enemy.attackAction, 0.05);
    applyMeleeDamage(enemy, closest, enemy.atkDmg);
  } else if (dist >= range) {
    enemy.atkTmr = Math.min(enemy.atkTmr || 0, 0.3);
    // Charging: use gallop if available, otherwise walk
    const moveAnim = dist > range + 1 ? (enemy.gallopAction ?? enemy.walkAction) : enemy.walkAction;
    if (moveAnim) crossfadeToAction(enemy, moveAnim, 0.2);
  }
}

function activateBossPhase2(enemy) {
  enemy.bossPhase2 = true;
  enemy.spd = BOSS_TUNING.moveSpeed * 1.55;   // 18.6 units/s
  // Visual: make the boss glow orange-red to signal enrage
  enemy.group.traverse((node) => {
    if (node.isMesh && node.material) {
      const m = node.material.clone();
      m.emissive = new THREE.Color(0xff3300);
      m.emissiveIntensity = 0.55;
      node.material = m;
    }
  });
  // Phase 2 roar: heavy screen shake + red flash overlay
  if (game.shakeAmt !== undefined) game.shakeAmt = Math.max(game.shakeAmt, 0.85);
  const flash = document.createElement("div");
  flash.style.cssText = "position:fixed;inset:0;background:rgba(200,0,0,0);z-index:59;pointer-events:none;transition:background 0.12s";
  document.body.appendChild(flash);
  requestAnimationFrame(() => { flash.style.background = "rgba(200,0,0,0.45)"; });
  setTimeout(() => { flash.style.background = "rgba(200,0,0,0)"; }, 160);
  setTimeout(() => { flash.remove(); }, 700);
  // Show a HUD alert
  const alert = document.getElementById("boss-impervious-alert");
  if (alert) {
    alert.textContent = "⚠ TITAN BRUTE — PHASE 2 — ENRAGED";
    alert.classList.remove("show");
    void alert.offsetWidth;
    alert.classList.add("show");
  }
}

function ownedBossAI(enemy, pos, closest, dist, ndx, ndz) {
  // ── Phase 2 transition (regular boss only) ───────────────────────────────
  // Triggers at 1/3 HP so phase 1 takes ~2/3 of the bar (same damage as the
  // previous 50% slice of a larger bar) and phase 2 takes the remaining 1/3.
  if (enemy.type === "boss" && !enemy.bossPhase2 && enemy.hp <= enemy.maxHp / 3) {
    activateBossPhase2(enemy);
  }
  const atkFrequency = enemy.bossPhase2 ? 0.65 : 1.1; // faster attack rate in phase 2

  if (enemy.escaping) {
    enemy.bossVelY = (enemy.bossVelY || 0) - BOSS_ESCAPE_GRAVITY * game.dt;
    pos.y = Math.max(0, pos.y + enemy.bossVelY * game.dt);
    pos.x = Math.max(-HALF + 1, Math.min(HALF - 1, pos.x + (enemy.bossEfx || 0) * BOSS_ESCAPE_FORWARD_SPEED * game.dt));
    pos.z = Math.max(-HALF + 1, Math.min(HALF - 1, pos.z + (enemy.bossEfz || 0) * BOSS_ESCAPE_FORWARD_SPEED * game.dt));

    // Body-slam: damage any target the boss flies into while airborne
    if (!enemy.bossBumpFired) {
      const bdx = closest.pos.x - pos.x;
      const bdz = closest.pos.z - pos.z;
      const bumpDist = Math.sqrt(bdx * bdx + bdz * bdz);
      const bumpDy   = Math.abs(closest.pos.y - pos.y);
      if (bumpDist < enemy.radius + 1.5 && bumpDy < 3.5) {
        applyMeleeDamage(enemy, closest, Math.round(enemy.atkDmg * 0.75));
        enemy.bossBumpFired = true;
      }
    }

    if (pos.y <= 0) {
      pos.y = 0; enemy.bossVelY = 0; enemy.escaping = false;
      enemy.bossBumpFired = false;
      // Play landing animation on touchdown
      if (enemy.landingAction) {
        enemy.landingAction.reset();
        crossfadeToAction(enemy, enemy.landingAction, 0.06);
        enemy.landingTmr = enemy.landingAction.getClip().duration;
      }
    }
    return;
  }
  // While landing animation plays, hold movement so the recovery reads cleanly
  if ((enemy.landingTmr || 0) > 0) {
    enemy.landingTmr -= game.dt;
    if (enemy.landingTmr <= 0 && enemy.walkAction) crossfadeToAction(enemy, enemy.walkAction, 0.15);
  }
  const prevX = pos.x;
  const prevZ = pos.z;
  const inAttackRange = dist < 7.8;
  const playerElevated = closest.pos.y > pos.y + 2.5;
  const isSwinging = (enemy.swingTmr || 0) > 0;
  // Move toward player at full speed when out of range; half-speed during wind-up so boss can close the gap.
  if (!inAttackRange) {
    moveEnemyWithCollision(pos, ndx, ndz, enemy.spd);
  } else if ((enemy.windupTmr || 0) > 0) {
    moveEnemyWithCollision(pos, ndx, ndz, enemy.spd * 0.5);
  }
  const movedDistSq = (pos.x - prevX) ** 2 + (pos.z - prevZ) ** 2;
  enemy.walkT = (enemy.walkT || 0) + game.dt * 6;
  if ((enemy.windupTmr || 0) > 0) {
    enemy.windupTmr -= game.dt;
    if (enemy.windupTmr <= 0) { enemy.windupTmr = 0; enemy.swingTmr = 0.22; }
  } else if (isSwinging) {
    const prev = enemy.swingTmr;
    enemy.swingTmr -= game.dt;
    // Fire damage when swing timer crosses 0.09 — no extra distance gate since wind-up already validated range.
    if (prev > 0.09 && enemy.swingTmr <= 0.09) applyMeleeDamage(enemy, closest, enemy.atkDmg);
    if (enemy.swingTmr <= 0) enemy.swingTmr = 0;
  } else {
    enemy.atkTmr = (enemy.atkTmr || 0) - game.dt;
    if (enemy.atkTmr <= 0 && inAttackRange) { enemy.atkTmr = atkFrequency; enemy.windupTmr = 0.2; }
  }

  if (!inAttackRange && movedDistSq < 0.04) enemy.stuckTmr = (enemy.stuckTmr || 0) + game.dt;
  else enemy.stuckTmr = 0;

  // Frustration: boss is horizontally close but player is elevated out of melee reach
  if (inAttackRange && playerElevated) {
    enemy.bossFrustrationTmr = (enemy.bossFrustrationTmr || 0) + game.dt;
  } else {
    enemy.bossFrustrationTmr = Math.max(0, (enemy.bossFrustrationTmr || 0) - game.dt * 2);
  }

  const stuckJump = !inAttackRange && (enemy.stuckTmr || 0) >= 0.9;
  const frustrationJump = inAttackRange && playerElevated && (enemy.bossFrustrationTmr || 0) >= 1.5;
  if (!enemy.escaping && pos.y === 0 && (stuckJump || frustrationJump)) {
    enemy.bossEfx = ndx; enemy.bossEfz = ndz;
    enemy.bossVelY = BOSS_ESCAPE_JUMP_VELOCITY; enemy.escaping = true;
    enemy.stuckTmr = 0;
    enemy.bossFrustrationTmr = 0;
    // Clear attack timers so a ghost hit can't fire after landing somewhere new.
    enemy.windupTmr = 0; enemy.swingTmr = 0;
    // Switch to jump animation while airborne
    if (enemy.jumpAction) { enemy.jumpAction.reset(); crossfadeToAction(enemy, enemy.jumpAction, 0.05); }
  }

  // Drive the boss locomotion / attack animation between Walk and Kick
  if (enemy.mixer && !(enemy.landingTmr > 0) && !(enemy.hitTmr > 0)) {
    const swinging = (enemy.swingTmr || 0) > 0 || (enemy.windupTmr || 0) > 0;
    if (swinging && enemy.kickAction) {
      if (enemy.currentAction !== enemy.kickAction) {
        enemy.kickAction.reset();
        crossfadeToAction(enemy, enemy.kickAction, 0.05);
      }
    } else if (!swinging && enemy.walkAction && enemy.currentAction !== enemy.walkAction) {
      crossfadeToAction(enemy, enemy.walkAction, 0.15);
    }
  }
}


function updateSkeletonCorpses() {
  for (let i = game.skeletonCorpses.length - 1; i >= 0; i -= 1) {
    const corpse = game.skeletonCorpses[i];
    corpse.mixer.update(game.dt);
    corpse.elapsed += game.dt;
    if (corpse.elapsed >= corpse.duration) {
      game.scene.remove(corpse.model);
      disposeObject3D(corpse.model);
      game.skeletonCorpses.splice(i, 1);
    }
  }
}

function updateHealthBar(enemy) {
  if (enemy.type === "skeleton") {
    return;
  }
  const hpY = enemy.type === "soldier"
    ? 2.3
    : enemy.type === "dog"
      ? 1.3
      : ((enemy.bossHeight || 4.6) + 0.6);
  enemy.hpBar.position.copy(enemy.group.position).setY(enemy.group.position.y + hpY);
  enemy.hpBar.lookAt(game.camera.position);
  enemy.hpFg.scale.x = Math.max(0, enemy.hp / enemy.maxHp);
}

export function updateWaves() {
  if (game.mode === "PVP" || game.mode === "FFA") return;

  // Server drives all wave logic. Clients just maintain the minimap enemy-ping timer.
  if ((game.waveState === "SPAWNING" || game.waveState === "ACTIVE") && game.enemies.length > 0) {
    game.waveElapsed += game.dt;
    if (game.waveElapsed >= game.nextEnemyPing) {
      game.enemyPingTmr = 4;
      game.nextEnemyPing += 60;
    }
  } else if (game.waveState === "WAIT") {
    game.waveElapsed = 0;
    game.nextEnemyPing = 60;
    game.enemyPingTmr = 0;
  }
  if (game.enemyPingTmr > 0) {
    game.enemyPingTmr = Math.max(0, game.enemyPingTmr - game.dt);
  }
}


function isCampaignBossWave() {
  return game.gameMode === 'campaign' && game.wave === (game.campaignMapStartWave || 0) + 7;
}

export function announceWave() {
  if (!game.dom?.waveAnnounce) return;
  if (game.gameMode === 'campaign') return; // campaign has no wave banner
  const title = game.dom.waveAnnounce.querySelector(".wa-title");
  const subtitle = game.dom.waveAnnounce.querySelector(".wa-sub");
  const isCampaign = game.gameMode === 'campaign';
  const bossWave = isCampaign ? isCampaignBossWave() : (game.wave >= 7 && (game.wave - 7) % 5 === 0);
  const { bossCount, hpMultiplier } = bossWave ? getBossWaveConfig() : { bossCount: 0, hpMultiplier: 1 };
  const miniBossGuarantee =
    (!isCampaign && game.wave === 8) ||
    (isCampaign && game.wave === 1 && game.selectedMap !== 'arena');

  title.textContent = `WAVE ${game.wave}`;
  if (bossWave) {
    if (bossCount > 1 && hpMultiplier > 1) {
      subtitle.textContent = `${bossCount}× TITAN BRUTES (${hpMultiplier}× HP)`;
    } else if (bossCount > 1) {
      subtitle.textContent = `${bossCount} TITAN BRUTES`;
    } else if (hpMultiplier > 1) {
      subtitle.textContent = `TITAN BRUTE — ${hpMultiplier}× HP`;
    } else {
      subtitle.textContent = "TITAN BRUTE";
    }
  } else if (miniBossGuarantee) {
    subtitle.textContent = "TITAN SCOUT DETECTED";
  } else if (game.wave <= 6) {
    // Rounds 1-6 unified text (same for both modes)
    if (game.wave >= 5) subtitle.textContent = "SKELETONS, SOLDIERS & DOGS";
    else if (game.wave >= 3) subtitle.textContent = "SKELETONS & SOLDIERS";
    else subtitle.textContent = "";
  } else {
    // Endless rounds 8+ (campaign never reaches here — it transitions after round 7)
    subtitle.textContent = "DOGS & SHOOTERS";
  }
  const showSub = bossWave || miniBossGuarantee || game.wave >= 3;
  subtitle.style.display = showSub ? "block" : "none";
  game.dom.waveAnnounce.classList.remove("show");
  void game.dom.waveAnnounce.offsetWidth;
  game.dom.waveAnnounce.classList.add("show");
  window.setTimeout(() => game.dom.waveAnnounce.classList.remove("show"), 2300);
}

export function handleEnemyDamaged(data) {
  const enemy = game.enemies.find((candidate) => candidate.id === data.id);
  if (!enemy) return;
  enemy.hp -= data.damage;
  enemy.flashTmr = 0.1;
  // Boss/mini-boss hit-reaction: play HitRecieve_2 briefly without breaking the AI loop
  if ((enemy.type === "boss" || enemy.type === "miniboss") && enemy.hitAction && !enemy.escaping && enemy.hp > 0) {
    if ((enemy.hitCooldown || 0) <= 0) {
      enemy.hitAction.reset();
      crossfadeToAction(enemy, enemy.hitAction, 0.05);
      enemy.hitTmr = Math.min(0.35, enemy.hitAction.getClip().duration);
      enemy.hitCooldown = 0.6; // throttle so rapid bullets don't spam the clip
    }
  }
  // Server handles enemy death; the enemy vanishes from the next enemiesSynced broadcast.
}

export function trySwordHit() {
  if (game.currentWeapon !== "sword") {
    return;
  }

  const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion).normalize();
  const camFlat = new THREE.Vector3(cameraDirection.x, 0, cameraDirection.z);
  if (camFlat.lengthSq() > 0) camFlat.normalize();
  const playerPos = game.visuals.player.playerGroup.position;

  // PvP/FFA: sword hits remote players. Non-host is allowed so anyone can swing.
  if (game.mode === "PVP" || game.mode === "FFA") {
    for (const [remoteId, remote] of Object.entries(game.remotePlayers)) {
      if (!remote.isAlive || remote.isDowned || remote.isSpectating) continue;

      const dx = remote.group.position.x - playerPos.x;
      const dz = remote.group.position.z - playerPos.z;
      const verticalGap = Math.abs(remote.group.position.y - playerPos.y);
      const planarDistance = Math.hypot(dx, dz);
      if (planarDistance >= 5.5 || verticalGap > 2.5) continue;

      const toRemote = new THREE.Vector3(dx, 0, dz).normalize();
      if (toRemote.dot(camFlat) < 0.3) continue;

      game.socket?.emit("pvpDamage", {
        targetId: remoteId,
        damage: 999,
        weapon: "sword",
      });
      game.stats.shotsHit += 1;
      game.stats.damageDealt += 999;
      spawnParticles(remote.group.position.clone().setY(1.5), 8, 0xff6622, 5);
    }
    return;
  }

  // All clients can report sword hits; server validates and applies damage.
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0) continue;

    const distance = playerPos.distanceTo(enemy.group.position);
    if (distance >= 6.5) continue;

    const toEnemy = enemy.group.position.clone().sub(playerPos).normalize();
    if (toEnemy.dot(cameraDirection) > 0.5) {
      const swordDmg = enemy.type === "boss" ? 250 : 500;
      processHit(enemy, swordDmg, enemy.group.position.clone().setY(1.5));
    }
  }
}
