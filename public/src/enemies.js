import * as THREE from "three";

import { ARENA_SIZE, EPS, HALF, P_RAD } from "./config.js";
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

const BOSS_ESCAPE_HEIGHT = 50 / 6;
const MAX_LIVE_ENEMIES = 60;
const MAX_SKELETON_CORPSES = 5;

const BOSS_ESCAPE_GRAVITY = 180;
const BOSS_ESCAPE_JUMP_VELOCITY = Math.sqrt(2 * BOSS_ESCAPE_GRAVITY * BOSS_ESCAPE_HEIGHT);
const BOSS_ESCAPE_FORWARD_SPEED = 14;

const ENEMY_BULLET_SPD = 28;
const ENEMY_BULLET_DMG = 25;
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

  group.position.copy(position);
  game.scene.add(group);

  const hpMax = Math.round((58 + game.wave * 12) * Math.pow(1.1, game.wave));
  const { hpBar, hpFill } = createHealthBar(game.shared.hpFgMatSoldier);
  const speed = 3.5 + Math.random() * 1.5 + game.wave * 0.2;
  const fireInterval = Math.max(0.8, 2.2 - game.wave * 0.1) + Math.random() * 0.4;

  game.enemies.push({
    id,
    type: "soldier",
    group,
    torso,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    flashPart: torso,
    radius: 0.6,
    hp: hpMax,
    maxHp: hpMax,
    spd: speed,
    fireInt: fireInterval,
    fireTmr: fireInterval * 0.5 + Math.random() * fireInterval * 0.5,
    flashTmr: 0,
    walkT: Math.random() * 6,
    hpBar,
    hpFg: hpFill,
  });
}

export function createDog(position, id = Math.random()) {
  const group = new THREE.Group();
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

  group.position.copy(position);
  game.scene.add(group);

  const hpMax = Math.round((46 + game.wave * 10) * Math.pow(1.1, game.wave));
  const { hpBar, hpFill } = createHealthBar(game.shared.hpFgMatDog);
  const speed = 8 + Math.random() * 2 + game.wave * 0.3;

  game.enemies.push({
    id,
    type: "dog",
    group,
    body,
    leftFrontLeg,
    rightFrontLeg,
    leftBackLeg,
    rightBackLeg,
    tail,
    flashPart: body,
    radius: 0.7,
    hp: hpMax,
    maxHp: hpMax,
    spd: speed,
    atkDmg: 12 + game.wave * 2,
    atkTmr: 0,
    flashTmr: 0,
    walkT: Math.random() * 6,
    hpBar,
    hpFg: hpFill,
  });
}

export function createBoss(position, id = Math.random(), options = {}) {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.5, 1.2), enemyMaterials.bossBody);
  torso.position.y = 2.35;
  group.add(torso);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.2, 1.32), enemyMaterials.bossArmor);
  chest.position.set(0, 2.45, 0.08);
  group.add(chest);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), enemyMaterials.bossBody);
  head.position.y = 4.15;
  group.add(head);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.65), enemyMaterials.bossBody);
  jaw.position.set(0, 3.72, 0.12);
  group.add(jaw);

  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.04), enemyMaterials.bossEye);
  eyes.position.set(0, 4.18, -0.46);
  group.add(eyes);

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.75, 0.45), enemyMaterials.bossBody);
  leftArm.position.set(-1.22, 2.45, 0);
  group.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.75, 0.45), enemyMaterials.bossBody);
  rightArm.position.set(1.22, 2.45, 0);
  group.add(rightArm);

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.9, 0.55), enemyMaterials.bossBody);
  leftLeg.position.set(-0.52, 0.98, 0);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.9, 0.55), enemyMaterials.bossBody);
  rightLeg.position.set(0.52, 0.98, 0);
  group.add(rightLeg);

  const club = new THREE.Group();
  const clubHandle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.11, 2.7, 8),
    game.shared.worldMaterials.crateMat,
  );
  clubHandle.rotation.z = Math.PI / 2;
  club.add(clubHandle);
  const clubHead = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.58, 0.58), enemyMaterials.bossArmor);
  clubHead.position.x = 1.15;
  club.add(clubHead);
  club.position.set(1.75, 2.3, -0.05);
  group.add(club);

  group.position.copy(position);
  game.scene.add(group);

  const hpMultiplier = options.hpMultiplier ?? 1;
  const hpMax = Math.round(3600 * Math.pow(1.1, game.wave) * hpMultiplier);
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
    torso,
    chest,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    club,
    flashPart: chest,
    radius: 1.45,
    hp: hpMax,
    maxHp: hpMax,
    spd: 12,
    atkDmg: 100 + game.wave * 10,
    atkTmr: 0,
    swingTmr: 0,
    windupTmr: 0,
    flashTmr: 0,
    walkT: 0,
    velX: 0,
    velZ: 0,
    velY: 0,
    stuckTmr: 0,
    lastTrackedX: position.x,
    lastTrackedZ: position.z,
    hpBar,
    hpFg: hpFill,
    bossName: hpMultiplier > 1 ? "TITAN BRUTE ELITE" : "TITAN BRUTE",
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
    hp: 1,
    maxHp: 1,
    spd: 9 + Math.random() * 2.5,
    atkDmg: 8 + game.wave,
    atkTmr: 0,
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

export function removeEnemy(index) {
  const enemy = game.enemies[index];
  if (!enemy) {
    return;
  }

  if (enemy.type === "skeleton" && enemy.mixer) {
    playSkeletonDeathEffect(enemy.group.position, enemy.group.rotation.y);
    enemy.mixer.stopAllAction();
  }

  game.scene.remove(enemy.group);
  disposeObject3D(enemy.group);
  game.scene.remove(enemy.hpBar);
  disposeObject3D(enemy.hpBar);
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
  if (game.mode === "PVP") {
    return;
  }

  // All clients are now thin renderers â€” server owns all AI and position authority.
  game.enemies.forEach((enemy) => {
    // Lerp toward server-authoritative position (serverX/serverZ set by network.js)
    if (enemy.serverX !== undefined) {
      enemy.group.position.x += (enemy.serverX - enemy.group.position.x) * Math.min(1, 15 * game.dt);
      enemy.group.position.z += (enemy.serverZ - enemy.group.position.z) * Math.min(1, 15 * game.dt);
    }
    if (enemy.serverY !== undefined) {
      enemy.group.position.y += (enemy.serverY - enemy.group.position.y) * Math.min(1, 12 * game.dt);
    }
    updateHealthBar(enemy);
    if (enemy.mixer) {
      const camDx = enemy.group.position.x - game.camera.position.x;
      const camDz = enemy.group.position.z - game.camera.position.z;
      if (camDx * camDx + camDz * camDz < 65 * 65) {
        enemy.mixer.update(game.dt);
      }
    }
  });
  updateSkeletonCorpses();
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
  const hpY = enemy.type === "soldier" ? 2.3 : enemy.type === "dog" ? 1.3 : 5.3;
  enemy.hpBar.position.copy(enemy.group.position).setY(enemy.group.position.y + hpY);
  enemy.hpBar.lookAt(game.camera.position);
  enemy.hpFg.scale.x = Math.max(0, enemy.hp / enemy.maxHp);
}

export function updateWaves() {
  if (game.mode === "PVP") return;

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


export function announceWave() {
  if (!game.dom?.waveAnnounce) return;
  const title = game.dom.waveAnnounce.querySelector(".wa-title");
  const subtitle = game.dom.waveAnnounce.querySelector(".wa-sub");
  const bossWave = game.wave % 5 === 0;
  const { bossCount, hpMultiplier } = bossWave ? getBossWaveConfig() : { bossCount: 0, hpMultiplier: 1 };
  title.textContent = `WAVE ${game.wave}`;
  if (bossWave) {
    if (bossCount > 1 && hpMultiplier > 1) {
      subtitle.textContent = `${bossCount}x ${hpMultiplier}HP BOSSES INCOMING`;
    } else if (bossCount > 1) {
      subtitle.textContent = `${bossCount} BOSSES INCOMING`;
    } else if (hpMultiplier > 1) {
      subtitle.textContent = `${hpMultiplier}X HP BOSS INCOMING`;
    } else {
      subtitle.textContent = "BOSS INCOMING";
    }
  } else {
    if (game.wave >= 6) {
      subtitle.textContent = "DOGS & SKELETONS INCOMING";
    } else if (game.wave >= 3) {
      subtitle.textContent = "DOGS INCOMING";
    } else {
      subtitle.textContent = "";
    }
  }
  subtitle.style.display = game.wave >= 3 || bossWave ? "block" : "none";
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

  // PvP: sword hits remote players. Non-host is allowed so anyone can swing.
  if (game.mode === "PVP") {
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
      // Use enemy.hp as the damage value so damageDealt stat reflects actual HP removed,
      // not an arbitrary instakill constant. Boss capped at 160 per swing by design.
      const swordDmg = enemy.type === "boss" ? Math.min(160, enemy.hp) : enemy.hp;
      processHit(enemy, swordDmg, enemy.group.position.clone().setY(1.5));
    }
  }
}
