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

let syncEnemiesTmr = 0;
const BOSS_ESCAPE_GRAVITY = 180;
const BOSS_ESCAPE_JUMP_VELOCITY = Math.sqrt(2 * BOSS_ESCAPE_GRAVITY * BOSS_ESCAPE_HEIGHT);
const BOSS_ESCAPE_FORWARD_SPEED = 14;
const BOSS_AIR_ACCEL = 22;

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
    atkDmg: 56,
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

  // Skeletons have 1 HP — no health bar shown
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

export function updateEnemies({ showDamage, addShake, updateHUD, playerDiedLocal } = {}) {
  if (!game.isHost) {
    game.enemies.forEach((enemy) => {
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
    return;
  }

  const targets = [
    { group: game.visuals.player.playerGroup, socketId: game.socket ? game.socket.id : null },
    ...Object.entries(game.remotePlayers).map(([id, remotePlayer]) => ({
      group: remotePlayer.group,
      socketId: id,
    })),
  ];

  for (const enemy of game.enemies) {
    const enemyPosition = enemy.group.position;
    let closestTarget = null;
    let minDistance = Infinity;

    targets.forEach((target) => {
      if (target.socketId !== game.socket?.id) {
        const remotePlayer = game.remotePlayers[target.socketId];
        if (remotePlayer && (!remotePlayer.isAlive || remotePlayer.isDowned)) {
          return;
        }
      } else if (!game.localPlayerIsAlive || game.localPlayerIsDowned) {
        return;
      }

      const distance = enemyPosition.distanceTo(target.group.position);
      if (distance < minDistance) {
        minDistance = distance;
        closestTarget = target;
      }
    });

    if (!closestTarget) {
      continue;
    }

    const playerPosition = closestTarget.group.position;
    const dx = playerPosition.x - enemyPosition.x;
    const dz = playerPosition.z - enemyPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const isLocalTarget = closestTarget.socketId === game.socket?.id;

    const applyMeleeDamage = (damage) => {
      if (game.invincibilityMode) {
        return;
      }

      if (isLocalTarget) {
        if (!game.localPlayerIsAlive || game.localPlayerIsDowned) {
          return;
        }

        game.hp = Math.max(0, game.hp - damage);
        game.audio.damage();
        showDamage?.();
        addShake?.(0.2);
        spawnParticles(playerPosition.clone().setY(1), 4, 0xff4422, 3);

        if (enemy.type === "boss") {
          const knockDir = new THREE.Vector3(dx, 0, dz).normalize();
          const speed = 6 * 3.1 * 10;
          game.knockbackX = knockDir.x * speed;
          game.knockbackZ = knockDir.z * speed;
        }

        if (game.hp <= 0) {
          game.hp = 0;
          playerDiedLocal?.();
        }

        updateHUD?.();
      } else if (game.socket) {
        game.socket.emit("damagePlayer", { targetId: closestTarget.socketId, damage });
        spawnParticles(playerPosition.clone().setY(1), 4, 0xff4422, 3);
      }
    };

    enemy.group.rotation.y = Math.atan2(dx, dz) + Math.PI;

    if (enemy.flashTmr > 0) {
      enemy.flashTmr -= game.dt;
      if (enemy.flashPart) {
        if (enemy.type === "soldier") {
          enemy.flashPart.material = enemy.flashTmr > 0 ? enemyMaterials.flash : enemyMaterials.body;
        } else if (enemy.type === "dog") {
          enemy.flashPart.material = enemy.flashTmr > 0 ? enemyMaterials.flash : enemyMaterials.dogBody;
        } else {
          enemy.flashPart.material = enemy.flashTmr > 0 ? enemyMaterials.flash : enemyMaterials.bossArmor;
        }
      }
    }

    if (enemy.type === "soldier") {
      const ndx = distance > EPS ? dx / distance : 0;
      const ndz = distance > EPS ? dz / distance : 0;
      let moveSpeed = 0;
      if (distance > 14) {
        moveSpeed = enemy.spd;
      } else if (distance < 7) {
        moveSpeed = -enemy.spd * 0.4;
      }

      if (moveSpeed !== 0) {
        enemyPosition.x += ndx * moveSpeed * game.dt;
        enemyPosition.z += ndz * moveSpeed * game.dt;
      }

      enemy.walkT += game.dt * (moveSpeed > 0 ? 8 : 4);
      const swing = Math.sin(enemy.walkT) * 0.45;
      enemy.leftLeg.rotation.x = swing;
      enemy.rightLeg.rotation.x = -swing;
      enemy.leftArm.rotation.x = -swing * 0.5;
      enemy.rightArm.rotation.x = swing * 0.5;

      enemy.fireTmr -= game.dt;
      if (enemy.fireTmr <= 0 && distance < 50) {
        enemy.fireTmr = enemy.fireInt;
        const targetAimY = playerPosition.y + 1.2;
        const enemyAimY = enemyPosition.y + 1.2;
        const direction = new THREE.Vector3(
          ndx + (Math.random() - 0.5) * 0.24,
          ((targetAimY - enemyAimY) / Math.max(distance, 1)) + (Math.random() - 0.5) * 0.03,
          ndz + (Math.random() - 0.5) * 0.24,
        ).normalize();
        const bulletPosition = enemyPosition.clone();
        bulletPosition.y += 1.2;
        bulletPosition.x += ndx * 0.6;
        bulletPosition.z += ndz * 0.6;
        spawnBullet(bulletPosition, direction, false);
        game.socket?.emit("enemyBulletFired", {
          x: bulletPosition.x,
          y: bulletPosition.y,
          z: bulletPosition.z,
          dx: direction.x,
          dy: direction.y,
          dz: direction.z,
          damage: 25,
          spd: 28,
          life: 4,
        });
      }
    } else if (enemy.type === "dog") {
      const ndx = distance > EPS ? dx / distance : 0;
      const ndz = distance > EPS ? dz / distance : 0;
      enemyPosition.x += ndx * enemy.spd * game.dt;
      enemyPosition.z += ndz * enemy.spd * game.dt;

      enemy.walkT += game.dt * 12;
      const swing = Math.sin(enemy.walkT) * 0.6;
      enemy.leftFrontLeg.rotation.x = swing;
      enemy.rightFrontLeg.rotation.x = -swing;
      enemy.leftBackLeg.rotation.x = -swing;
      enemy.rightBackLeg.rotation.x = swing;
      enemy.body.position.y = 0.6 + Math.abs(Math.sin(enemy.walkT * 2)) * 0.08;
      enemy.tail.rotation.y = Math.sin(enemy.walkT * 3) * 0.5;

      const verticalGap = Math.abs((playerPosition.y + 0.9) - (enemyPosition.y + 0.6));
      if (distance < 2.5 && verticalGap < 1.4) {
        enemy.atkTmr -= game.dt;
        if (enemy.atkTmr <= 0) {
          enemy.atkTmr = 1;
          applyMeleeDamage(enemy.atkDmg);
        }
      } else {
        enemy.atkTmr = Math.min(enemy.atkTmr, 0.3);
      }
    } else if (enemy.type === "skeleton") {
      if (enemy.mixer) {
        const camDx = enemy.group.position.x - game.camera.position.x;
        const camDz = enemy.group.position.z - game.camera.position.z;
        if (camDx * camDx + camDz * camDz < 65 * 65) {
          enemy.mixer.update(game.dt);
        }
      }

      const ndx = distance > EPS ? dx / distance : 0;
      const ndz = distance > EPS ? dz / distance : 0;
      enemyPosition.x += ndx * enemy.spd * game.dt;
      enemyPosition.z += ndz * enemy.spd * game.dt;

      enemy.walkT += game.dt * 10;
      enemy.group.position.y = Math.abs(Math.sin(enemy.walkT * 2)) * 0.06;

      const skelVerticalGap = Math.abs((playerPosition.y + 0.9) - (enemyPosition.y + 0.7));
      if (distance < 2.0 && skelVerticalGap < 1.4) {
        enemy.atkTmr -= game.dt;
        if (enemy.atkTmr <= 0) {
          enemy.atkTmr = 0.8;
          applyMeleeDamage(enemy.atkDmg);
        }
      } else {
        enemy.atkTmr = Math.min(enemy.atkTmr, 0.3);
      }
    } else {
      const ndx = distance > EPS ? dx / distance : 0;
      const ndz = distance > EPS ? dz / distance : 0;
      let moveSpeed = 0;
      if (distance > 5.5) {
        moveSpeed = enemy.spd;
      } else if (distance < 3.5) {
        moveSpeed = -enemy.spd * 0.5;
      }
      if (enemyPosition.y <= 0.001) {
        enemyPosition.x += ndx * moveSpeed * game.dt;
        enemyPosition.z += ndz * moveSpeed * game.dt;
        enemy.velX = ndx * moveSpeed;
        enemy.velZ = ndz * moveSpeed;
      } else {
        enemy.velX += ndx * BOSS_AIR_ACCEL * game.dt;
        enemy.velZ += ndz * BOSS_AIR_ACCEL * game.dt;
      }

      enemy.walkT += game.dt * 4.2;
      const swing = Math.sin(enemy.walkT) * 0.35;
      enemy.leftLeg.rotation.x = swing;
      enemy.rightLeg.rotation.x = -swing;
      enemy.leftArm.rotation.x = -0.18 - swing * 0.25;
      enemy.rightArm.rotation.x = 0.24 + swing * 0.18;
      enemy.club.rotation.z = -0.18;

      if (enemy.windupTmr > 0) {
        enemy.windupTmr -= game.dt;
        enemy.rightArm.rotation.x = -1.2;
        enemy.club.rotation.z = -1.1;
        if (enemy.windupTmr <= 0) {
          enemy.swingTmr = 0.38;
        }
      } else if (enemy.swingTmr > 0) {
        enemy.swingTmr -= game.dt;
        const progress = 1 - enemy.swingTmr / 0.38;
        enemy.rightArm.rotation.x = -1.2 + progress * 2.1;
        enemy.club.rotation.z = -1.1 + progress * 1.8;
      }

      const verticalGap = Math.abs((playerPosition.y + 1.1) - (enemyPosition.y + 2.2));
      if (distance < 5.2 && verticalGap < 2.8) {
        enemy.atkTmr -= game.dt;
        if (enemy.atkTmr <= 0 && enemy.windupTmr <= 0 && enemy.swingTmr <= 0) {
          enemy.atkTmr = 2.2;
          enemy.windupTmr = 0.4;
        }

        if (enemy.swingTmr > 0.16 && enemy.swingTmr < 0.24) {
          enemy.swingTmr = 0.15;
          addShake?.(0.35);
          applyMeleeDamage(enemy.atkDmg);
        }
      }

      if (enemy.velY !== 0 || enemyPosition.y > 0) {
        enemyPosition.x += enemy.velX * game.dt;
        enemyPosition.z += enemy.velZ * game.dt;
        enemyPosition.y += enemy.velY * game.dt;
        enemy.velY -= BOSS_ESCAPE_GRAVITY * game.dt;
        const airSpeed = Math.hypot(enemy.velX, enemy.velZ);
        const maxAirSpeed = Math.max(BOSS_ESCAPE_FORWARD_SPEED * 1.7, enemy.spd * 1.35);
        if (airSpeed > maxAirSpeed) {
          const clamp = maxAirSpeed / airSpeed;
          enemy.velX *= clamp;
          enemy.velZ *= clamp;
        }
        enemy.velX *= Math.pow(0.82, game.dt);
        enemy.velZ *= Math.pow(0.82, game.dt);
        if (enemyPosition.y <= 0) {
          enemyPosition.y = 0;
          enemy.velX = 0;
          enemy.velZ = 0;
          enemy.velY = 0;
        }
      }

      if (enemyPosition.y <= 0.001 && enemy.velY === 0) {
        if (enemy.stuckTmr <= 0) {
          enemy.lastTrackedX = enemyPosition.x;
          enemy.lastTrackedZ = enemyPosition.z;
        }

        enemy.stuckTmr += game.dt;
        if (enemy.stuckTmr >= 1) {
          const movedDistance = Math.hypot(enemyPosition.x - enemy.lastTrackedX, enemyPosition.z - enemy.lastTrackedZ);
          enemy.stuckTmr = 0;
          enemy.lastTrackedX = enemyPosition.x;
          enemy.lastTrackedZ = enemyPosition.z;

          if (movedDistance < 0.5) {
            const launchSpeed = Math.max(BOSS_ESCAPE_FORWARD_SPEED, moveSpeed);
            enemy.velX = ndx * launchSpeed;
            enemy.velZ = ndz * launchSpeed;
            enemy.velY = BOSS_ESCAPE_JUMP_VELOCITY;
            enemy.windupTmr = 0;
            enemy.swingTmr = 0;
            enemy.atkTmr = Math.max(enemy.atkTmr, 0.9);
          }
        }
      } else {
        enemy.stuckTmr = 0;
        enemy.lastTrackedX = enemyPosition.x;
        enemy.lastTrackedZ = enemyPosition.z;
      }
    }

    for (const obstacle of game.oBs) {
      if (enemy.type === "boss" && enemyPosition.y > 0.001) {
        continue;
      }
      resolveCircleBox(enemyPosition, enemy.radius || P_RAD, obstacle);
    }

    const enemyRadius = enemy.radius || P_RAD;
    enemyPosition.x = Math.max(-HALF + 1.5 + enemyRadius * 0.35, Math.min(HALF - 1.5 - enemyRadius * 0.35, enemyPosition.x));
    enemyPosition.z = Math.max(-HALF + 1.5 + enemyRadius * 0.35, Math.min(HALF - 1.5 - enemyRadius * 0.35, enemyPosition.z));

    updateHealthBar(enemy);
  }

  syncEnemiesTmr -= game.dt;
  if (game.socket && syncEnemiesTmr <= 0) {
    syncEnemiesTmr = 0.1;
    game.socket.emit(
      "syncEnemies",
      game.enemies.map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        x: enemy.group.position.x,
        y: enemy.group.position.y,
        z: enemy.group.position.z,
        rot: enemy.group.rotation.y,
        hp: enemy.hp,
        walkT: enemy.walkT,
      })),
    );
  }

  for (let first = 0; first < game.enemies.length; first += 1) {
    const ea = game.enemies[first];
    for (let second = first + 1; second < game.enemies.length; second += 1) {
      const eb = game.enemies[second];
      // Skeletons are tiny and numerous — skip skel-skel separation entirely
      if (ea.type === "skeleton" && eb.type === "skeleton") {
        continue;
      }
      const a = ea.group.position;
      const b = eb.group.position;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const minDistance = (ea.radius || 0.6) + (eb.radius || 0.6);
      // Cheap axis-aligned early-out avoids sqrt for most pairs
      if (Math.abs(dx) >= minDistance || Math.abs(dz) >= minDistance) {
        continue;
      }
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance < minDistance && distance > EPS) {
        const push = (minDistance - distance) * 0.5;
        const nx = dx / distance;
        const nz = dz / distance;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
      }
    }
  }

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
  if (!game.isHost) {
    return;
  }

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

  if (game.waveState === "WAIT") {
    game.waveTmr -= game.dt;
    if (game.waveTmr <= 0) {
      game.wave += 1;
      game.waveElapsed = 0;
      game.nextEnemyPing = 60;
      game.enemyPingTmr = 0;

      if (game.wave % 5 === 0) {
        game.enemiesToSpawn = 0;
        game.skeletonGroupsToSpawn = 0;
        game.spawnTmr = 0;
        game.waveState = "ACTIVE";
        spawnBoss();
      } else {
        game.enemiesToSpawn = Math.min(2 + game.wave * 2, 30);
        game.skeletonGroupsToSpawn = game.wave >= 6 ? Math.min(4 + (game.wave - 6), 8) : 0;
        game.spawnTmr = 0;
        game.waveState = "SPAWNING";
      }

      game.socket?.emit("waveUpdate", { wave: game.wave, state: game.waveState, tmr: game.waveTmr });
      announceWave();
    }
  } else if (game.waveState === "SPAWNING") {
    game.spawnTmr -= game.dt;
    if (game.spawnTmr <= 0 && (game.enemiesToSpawn > 0 || game.skeletonGroupsToSpawn > 0)) {
      if (game.skeletonGroupsToSpawn > 0 && (game.enemiesToSpawn === 0 || Math.random() < 0.35)) {
        spawnSkeletonGroup();
        game.skeletonGroupsToSpawn -= 1;
        game.spawnTmr = 1.2;
      } else if (game.enemiesToSpawn > 0) {
        spawnEnemy();
        game.enemiesToSpawn -= 1;
        game.spawnTmr = 0.5;
      }
    }

    if (game.enemiesToSpawn <= 0 && game.skeletonGroupsToSpawn <= 0) {
      game.waveState = "ACTIVE";
    }

    game.socket?.emit("waveUpdate", { wave: game.wave, state: game.waveState, tmr: game.waveTmr });
  } else if (game.waveState === "ACTIVE" && game.enemies.length === 0) {
    finishWave();
  }
}

export function spawnBoss() {
  const playerGroup = game.visuals.player.playerGroup;
  const { bossCount, hpMultiplier } = getBossWaveConfig();

  for (let bossIndex = 0; bossIndex < bossCount; bossIndex += 1) {
    let x = 0;
    let z = -(HALF - 6);
    let attempts = 0;

    do {
      const side = Math.floor(Math.random() * 4);
      const offset = (Math.random() - 0.5) * (ARENA_SIZE - 14);
      if (side === 0) {
        x = offset;
        z = -(HALF - 6);
      } else if (side === 1) {
        x = offset;
        z = HALF - 6;
      } else if (side === 2) {
        x = -(HALF - 6);
        z = offset;
      } else {
        x = HALF - 6;
        z = offset;
      }
      attempts += 1;
    } while (
      (
        Math.hypot(x - playerGroup.position.x, z - playerGroup.position.z) < 22
        || game.enemies.some((enemy) => enemy.type === "boss" && Math.hypot(x - enemy.group.position.x, z - enemy.group.position.z) < 12)
      )
      && attempts < 30
    );

    createBoss(new THREE.Vector3(x, 0, z), Math.random(), { hpMultiplier });
  }
}

export function spawnSkeletonGroup() {
  if (game.enemies.length >= MAX_LIVE_ENEMIES) {
    return;
  }
  const playerGroup = game.visuals.player.playerGroup;
  let cx;
  let cz;
  let attempts = 0;

  do {
    const side = Math.floor(Math.random() * 4);
    const offset = (Math.random() - 0.5) * (ARENA_SIZE - 6);
    if (side === 0) {
      cx = offset;
      cz = -(HALF - 2);
    } else if (side === 1) {
      cx = offset;
      cz = HALF - 2;
    } else if (side === 2) {
      cx = -(HALF - 2);
      cz = offset;
    } else {
      cx = HALF - 2;
      cz = offset;
    }
    attempts += 1;
  } while (Math.hypot(cx - playerGroup.position.x, cz - playerGroup.position.z) < 15 && attempts < 20);

  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    const x = cx + Math.cos(angle) * 1.8;
    const z = cz + Math.sin(angle) * 1.8;
    createSkeleton(new THREE.Vector3(x, 0, z));
  }
}

export function spawnEnemy() {
  if (game.enemies.length >= MAX_LIVE_ENEMIES) {
    return;
  }
  const playerGroup = game.visuals.player.playerGroup;
  let x;
  let z;
  let attempts = 0;

  do {
    const side = Math.floor(Math.random() * 4);
    const offset = (Math.random() - 0.5) * (ARENA_SIZE - 6);
    if (side === 0) {
      x = offset;
      z = -(HALF - 2);
    } else if (side === 1) {
      x = offset;
      z = HALF - 2;
    } else if (side === 2) {
      x = -(HALF - 2);
      z = offset;
    } else {
      x = HALF - 2;
      z = offset;
    }
    attempts += 1;
  } while (Math.hypot(x - playerGroup.position.x, z - playerGroup.position.z) < 15 && attempts < 20);

  const dogChance = game.wave >= 3 ? Math.min(0.55, 0.12 + (game.wave - 3) * 0.12) : 0;
  if (Math.random() < dogChance) {
    createDog(new THREE.Vector3(x, 0, z));
  } else {
    createSoldier(new THREE.Vector3(x, 0, z));
  }
}

export function announceWave() {
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
  if (!enemy) {
    return;
  }

  enemy.hp -= data.damage;
  enemy.flashTmr = 0.1;

  if (enemy.hp <= 0 && game.isHost) {
    removeEnemy(game.enemies.indexOf(enemy));
  }
}

export function trySwordHit() {
  if (game.currentWeapon !== "sword" || !game.isHost) {
    return;
  }

  const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion).normalize();
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0) {
      continue;
    }

    const distance = game.visuals.player.playerGroup.position.distanceTo(enemy.group.position);
    if (distance >= 6.5) {
      continue;
    }

    const toEnemy = enemy.group.position.clone().sub(game.visuals.player.playerGroup.position).normalize();
    if (toEnemy.dot(cameraDirection) > 0.5) {
      processHit(enemy, enemy.type === "boss" ? 160 : 9999, enemy.group.position.clone().setY(1.5));
    }
  }
}
