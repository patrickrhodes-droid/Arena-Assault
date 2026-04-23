import * as THREE from "three";

import { ARENA_SIZE, EPS, HALF, P_RAD } from "./config.js";
import { game } from "./state.js";
import { resolveCircleBox } from "./collision.js";
import { processHit, spawnBullet, spawnParticles } from "./combat.js";
import { disposeObject3D } from "./utils.js";

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

export function getBossEnemy() {
  return game.enemies.find((enemy) => enemy.type === "boss") || null;
}

function createHealthBar(colorMaterial) {
  const hpBar = new THREE.Mesh(game.shared.hpBgGeo, game.shared.hpBgMat);
  const hpFill = new THREE.Mesh(game.shared.hpFgGeo, colorMaterial);
  game.scene.add(hpBar);
  game.scene.add(hpFill);
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

  const hpMax = 58 + game.wave * 12;
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

  const hpMax = 46 + game.wave * 10;
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

export function createBoss(position, id = Math.random()) {
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

  const hpMax = 3600;
  const hpBar = new THREE.Mesh(game.shared.hpBgGeo, game.shared.hpBgMat);
  const hpFill = new THREE.Mesh(
    game.shared.hpFgGeo,
    new THREE.MeshBasicMaterial({ color: 0xffb347, side: THREE.DoubleSide }),
  );
  game.scene.add(hpBar);
  game.scene.add(hpFill);

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
    spd: 2.6,
    atkDmg: 28,
    atkTmr: 0,
    swingTmr: 0,
    windupTmr: 0,
    flashTmr: 0,
    walkT: 0,
    hpBar,
    hpFg: hpFill,
    bossName: "TITAN BRUTE",
  });
}

export function removeEnemy(index) {
  const enemy = game.enemies[index];
  if (!enemy) {
    return;
  }

  game.scene.remove(enemy.group);
  disposeObject3D(enemy.group);
  game.scene.remove(enemy.hpBar);
  enemy.hpBar.geometry.dispose();
  enemy.hpBar.material.dispose();
  game.scene.remove(enemy.hpFg);
  enemy.hpFg.geometry.dispose();
  enemy.hpFg.material.dispose();
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
    game.enemies.forEach((enemy) => updateHealthBar(enemy));
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
      if (isLocalTarget) {
        if (!game.localPlayerIsAlive || game.localPlayerIsDowned) {
          return;
        }

        game.hp = Math.max(0, game.hp - damage);
        game.audio.damage();
        showDamage?.();
        addShake?.(0.2);
        spawnParticles(playerPosition.clone().setY(1), 4, 0xff4422, 3);

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
    } else {
      const ndx = distance > EPS ? dx / distance : 0;
      const ndz = distance > EPS ? dz / distance : 0;
      const moveSpeed = distance > 4.4 ? enemy.spd : enemy.spd * 0.25;
      enemyPosition.x += ndx * moveSpeed * game.dt;
      enemyPosition.z += ndz * moveSpeed * game.dt;

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
    }

    for (const obstacle of game.oBs) {
      resolveCircleBox(enemyPosition, enemy.radius || P_RAD, obstacle);
    }

    const enemyRadius = enemy.radius || P_RAD;
    enemyPosition.x = Math.max(-HALF + 1.5 + enemyRadius * 0.35, Math.min(HALF - 1.5 - enemyRadius * 0.35, enemyPosition.x));
    enemyPosition.z = Math.max(-HALF + 1.5 + enemyRadius * 0.35, Math.min(HALF - 1.5 - enemyRadius * 0.35, enemyPosition.z));

    updateHealthBar(enemy);
  }

  if (game.socket) {
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
    for (let second = first + 1; second < game.enemies.length; second += 1) {
      const a = game.enemies[first].group.position;
      const b = game.enemies[second].group.position;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const minDistance = (game.enemies[first].radius || 0.6) + (game.enemies[second].radius || 0.6);

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
}

function updateHealthBar(enemy) {
  const hpY = enemy.type === "soldier" ? 2.3 : enemy.type === "dog" ? 1.3 : 5.3;
  const hpPosition = enemy.group.position.clone().setY(enemy.group.position.y + hpY);
  enemy.hpBar.position.copy(hpPosition);
  enemy.hpBar.lookAt(game.camera.position);
  enemy.hpFg.position.copy(hpPosition);
  enemy.hpFg.position.z += 0.01;
  enemy.hpFg.lookAt(game.camera.position);
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

      if (game.wave === 5) {
        game.enemiesToSpawn = 0;
        game.spawnTmr = 0;
        game.waveState = "ACTIVE";
        spawnBoss();
      } else {
        game.enemiesToSpawn = 2 + game.wave * 2;
        game.spawnTmr = 0;
        game.waveState = "SPAWNING";
      }

      game.socket?.emit("waveUpdate", { wave: game.wave, state: game.waveState, tmr: game.waveTmr });
      announceWave();
    }
  } else if (game.waveState === "SPAWNING") {
    game.spawnTmr -= game.dt;
    if (game.spawnTmr <= 0 && game.enemiesToSpawn > 0) {
      spawnEnemy();
      game.enemiesToSpawn -= 1;
      game.spawnTmr = 0.5;
    }

    if (game.enemiesToSpawn <= 0) {
      game.waveState = "ACTIVE";
    }

    game.socket?.emit("waveUpdate", { wave: game.wave, state: game.waveState, tmr: game.waveTmr });
  } else if (game.waveState === "ACTIVE" && game.enemies.length === 0) {
    finishWave();
  }
}

export function spawnBoss() {
  let x = 0;
  let z = -(HALF - 6);
  let attempts = 0;
  const playerGroup = game.visuals.player.playerGroup;

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
  } while (Math.hypot(x - playerGroup.position.x, z - playerGroup.position.z) < 22 && attempts < 20);

  createBoss(new THREE.Vector3(x, 0, z));
}

export function spawnEnemy() {
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
  title.textContent = `WAVE ${game.wave}`;
  subtitle.textContent = game.wave === 5 ? "BOSS INCOMING" : game.wave >= 3 ? "DOGS INCOMING" : "";
  subtitle.style.display = game.wave >= 3 || game.wave === 5 ? "block" : "none";
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
    if (distance >= 4.5) {
      continue;
    }

    const toEnemy = enemy.group.position.clone().sub(game.visuals.player.playerGroup.position).normalize();
    if (toEnemy.dot(cameraDirection) > 0.8) {
      processHit(enemy, enemy.type === "boss" ? 160 : 9999, enemy.group.position.clone().setY(1.5));
    }
  }
}
