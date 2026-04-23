import * as THREE from "three";

import { BASE_FOV, EYE_H, GRAV, HALF, JUMP_VEL, LAND_SNAP, P_RAD } from "./config.js";
import { game } from "./state.js";
import { addShake } from "./state.js";
import { getSupportHeight, resolveCircleBox } from "./collision.js";
import {
  applySpread,
  cycleWeapon,
  getWeapon,
  spawnBullet,
  startReload,
  usingFirstPersonView,
  usingScopedSniperView,
} from "./combat.js";

export function setupInput(actions) {
  document.addEventListener("keydown", (event) => {
    game.keys[event.code] = true;

    if (event.code === "KeyW" && game.state === "PLAYING") {
      const now = performance.now();
      if (now - game.wLastTapTime < 300) {
        game.sprintLocked = true;
      }
      game.wLastTapTime = now;
    }

    if (event.code === "Space") {
      if (game.localPlayerIsAlive) {
        event.preventDefault();
      }
      if (game.state === "PLAYING") {
        tryJump();
      }
    }

    if (event.code === "Digit1") actions.setWeapon("pistol");
    if (event.code === "Digit2") actions.setWeapon("assault");
    if (event.code === "Digit3") actions.setWeapon("shotgun");
    if (event.code === "Digit4") actions.setWeapon("sniper");
    if (event.code === "Digit5") actions.setWeapon("sword");
    if (event.code === "KeyQ") {
      cycleWeapon();
      actions.updateHUD();
    }
    if (event.code === "KeyR" && game.state === "PLAYING" && !game.isReloading && game.ammo < getWeapon().mag) {
      startReload();
      actions.updateHUD();
    }
  });

  document.addEventListener("keyup", (event) => {
    if (game.localPlayerIsAlive) {
      game.keys[event.code] = false;
    }
    if (event.code === "KeyW") {
      game.sprintLocked = false;
    }
  });

  document.addEventListener("mousedown", (event) => {
    if (event.button === 0) {
      game.mouseDown = true;
    }
    if (event.button === 2 && game.state === "PLAYING") {
      event.preventDefault();
      game.isAiming = true;
    }
  });

  document.addEventListener("mouseup", (event) => {
    if (event.button === 0) {
      game.mouseDown = false;
    }
    if (event.button === 2) {
      game.isAiming = false;
    }
  });

  document.addEventListener("contextmenu", (event) => event.preventDefault());

  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== game.renderer.domElement) {
      return;
    }

    game.camTheta -= event.movementX * game.sens;
    if (usingFirstPersonView()) {
      game.camPhi = Math.max(-1.25, Math.min(1.5, game.camPhi + event.movementY * game.sens));
    } else {
      game.camPhi = Math.max(-0.55, Math.min(0.85, game.camPhi - event.movementY * game.sens));
    }
  });

  document.addEventListener("wheel", (event) => {
    if (usingFirstPersonView() || document.pointerLockElement !== game.renderer.domElement) return;
    game.camDist = Math.max(3, Math.min(20, game.camDist + event.deltaY * 0.01));
  }, { passive: true });

  document.addEventListener("pointerlockchange", actions.onPointerLockChange);
  document.addEventListener("pointerlockerror", actions.onPointerLockError);
}

export function tryPointerLock() {
  if (!game.renderer.domElement.requestPointerLock) {
    return;
  }

  const result = game.renderer.domElement.requestPointerLock();
  if (result && typeof result.catch === "function") {
    result.catch(() => {});
  }
}

export function tryJump() {
  if (!game.isGrounded) {
    return;
  }

  game.isGrounded = false;
  game.playerVelY = JUMP_VEL;
}

export function updatePlayer(actions) {
  const prevY = game.visuals.player.playerGroup.position.y;
  const inFirstPerson = usingFirstPersonView();
  const forward = new THREE.Vector3(-Math.sin(game.camTheta), 0, -Math.cos(game.camTheta));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const moveDirection = new THREE.Vector3();

  if (game.keys.KeyW) moveDirection.add(forward);
  if (game.keys.KeyS) moveDirection.sub(forward);
  if (game.keys.KeyD) moveDirection.add(right);
  if (game.keys.KeyA) moveDirection.sub(right);

  game.isSprinting = game.sprintLocked && !!game.keys.KeyW && game.localPlayerIsAlive;
  game.isMoving = moveDirection.lengthSq() > 0 && game.localPlayerIsAlive;

  if (!inFirstPerson) {
    game.visuals.player.playerGroup.rotation.y = game.camTheta;
  }

  if (game.isMoving) {
    moveDirection.normalize();
    const speed = 6 * (game.isSprinting ? 3.1 : 1);
    game.visuals.player.playerGroup.position.addScaledVector(moveDirection, speed * game.dt);
    if (inFirstPerson) {
      game.visuals.player.playerGroup.rotation.y = game.camTheta;
    }
  }

  game.playerVelY -= GRAV * game.dt;
  game.visuals.player.playerGroup.position.y += game.playerVelY * game.dt;

  const supportY = getSupportHeight(
    prevY,
    game.visuals.player.playerGroup.position.y,
    game.visuals.player.playerGroup.position.x,
    game.visuals.player.playerGroup.position.z,
  );

  if (game.playerVelY <= 0 && supportY > 0 && game.visuals.player.playerGroup.position.y <= supportY + LAND_SNAP) {
    game.visuals.player.playerGroup.position.y = supportY;
    game.playerVelY = 0;
    game.isGrounded = true;
  } else if (game.visuals.player.playerGroup.position.y <= 0) {
    game.visuals.player.playerGroup.position.y = 0;
    game.playerVelY = 0;
    game.isGrounded = true;
  } else {
    game.isGrounded = false;
  }

  for (const obstacle of game.oBs) {
    resolveCircleBox(game.visuals.player.playerGroup.position, P_RAD, obstacle, game.visuals.player.playerGroup.position.y);
  }

  if (game.knockbackX !== 0 || game.knockbackZ !== 0) {
    game.visuals.player.playerGroup.position.x += game.knockbackX * game.dt;
    game.visuals.player.playerGroup.position.z += game.knockbackZ * game.dt;
    const decay = Math.pow(0.04, game.dt);
    game.knockbackX *= decay;
    game.knockbackZ *= decay;
    if (Math.abs(game.knockbackX) < 0.05 && Math.abs(game.knockbackZ) < 0.05) {
      game.knockbackX = 0;
      game.knockbackZ = 0;
    }
  }

  game.visuals.player.playerGroup.position.x = Math.max(-HALF + 1.5, Math.min(HALF - 1.5, game.visuals.player.playerGroup.position.x));
  game.visuals.player.playerGroup.position.z = Math.max(-HALF + 1.5, Math.min(HALF - 1.5, game.visuals.player.playerGroup.position.z));

  animatePlayerBody();
  handleReload();
  handleRevive(actions);
  handleFiring(actions);

  game.visuals.player.playerGroup.visible = !inFirstPerson;
  game.visuals.weapon.firstPersonGun.visible = inFirstPerson;
}

function animatePlayerBody() {
  const body = game.visuals.player;

  if (game.isMoving && game.isGrounded) {
    game.walkTime += game.dt * (game.isSprinting ? 12 : 8);
    const swing = Math.sin(game.walkTime) * 0.45;
    body.leftLeg.rotation.x = swing;
    body.rightLeg.rotation.x = -swing;
    body.leftArm.rotation.x = -swing * 0.5;
    body.rightArm.rotation.x = swing * 0.5;
    body.leftBoot.position.z = Math.sin(game.walkTime) * 0.15;
    body.rightBoot.position.z = -Math.sin(game.walkTime) * 0.15;
    body.torso.position.y = 1.2 + Math.abs(Math.sin(game.walkTime)) * 0.05;
  } else if (!game.isGrounded) {
    body.leftLeg.rotation.x += (0.45 - body.leftLeg.rotation.x) * 0.12;
    body.rightLeg.rotation.x += (-0.2 - body.rightLeg.rotation.x) * 0.12;
    body.leftArm.rotation.x += (-0.25 - body.leftArm.rotation.x) * 0.12;
    body.rightArm.rotation.x += (0.25 - body.rightArm.rotation.x) * 0.12;
    body.leftBoot.position.z *= 0.9;
    body.rightBoot.position.z *= 0.9;
    body.torso.position.y += (1.24 - body.torso.position.y) * 0.12;
  } else {
    game.walkTime = 0;
    body.leftLeg.rotation.x *= 0.88;
    body.rightLeg.rotation.x *= 0.88;
    body.leftArm.rotation.x *= 0.88;
    body.rightArm.rotation.x *= 0.88;
    body.leftBoot.position.z *= 0.88;
    body.rightBoot.position.z *= 0.88;
    body.torso.position.y += (1.2 - body.torso.position.y) * 0.1;
  }
}

function handleReload() {
  if (!game.isReloading) {
    return;
  }

  game.reloadTmr -= game.dt;
  if (game.reloadTmr <= 0) {
    game.isReloading = false;
    game.ammo = getWeapon().mag;
    game.weaponAmmo[game.currentWeapon] = game.ammo;
    game.audio.reload();
  }
}

function handleRevive(actions) {
  const reviveRange = 2.8;
  const reviveTime = 3.0;
  let nearDowned = null;

  if (game.localPlayerIsAlive && !game.localPlayerIsDowned && game.state === "PLAYING") {
    for (const [id, remotePlayer] of Object.entries(game.remotePlayers)) {
      if (!remotePlayer.isDowned) {
        continue;
      }
      const distance = game.visuals.player.playerGroup.position.distanceTo(remotePlayer.group.position);
      if (distance < reviveRange) {
        nearDowned = { id, remotePlayer };
        break;
      }
    }
  }

  if (nearDowned) {
    game.dom.revivePromptHud.style.display = "block";
    if (game.keys.KeyE) {
      game.reviveHoldTime += game.dt;
      game.dom.reviveProgressBg.style.display = "block";
      game.dom.reviveProgressFill.style.width = `${Math.min(100, (game.reviveHoldTime / reviveTime) * 100)}%`;

      if (game.reviveHoldTime >= reviveTime) {
        game.reviveHoldTime = 0;
        game.dom.reviveProgressBg.style.display = "none";
        game.dom.reviveProgressFill.style.width = "0%";
        game.audio.reviveComplete();
        game.socket?.emit("revivePlayer", { targetId: nearDowned.id, reviverName: game.playerName });
      } else {
        game.audio.reviveProgress();
        game.socket?.emit("reviveProgress", {
          targetId: nearDowned.id,
          progress: game.reviveHoldTime / reviveTime,
          reviverName: game.playerName,
        });
      }
    } else {
      game.reviveHoldTime = Math.max(0, game.reviveHoldTime - game.dt * 2);
      if (game.reviveHoldTime === 0) {
        game.dom.reviveProgressBg.style.display = "none";
        game.dom.reviveProgressFill.style.width = "0%";
      }
    }
  } else {
    game.dom.revivePromptHud.style.display = "none";
    game.reviveHoldTime = 0;
    game.dom.reviveProgressBg.style.display = "none";
    game.dom.reviveProgressFill.style.width = "0%";
  }
}

function handleFiring(actions) {
  const weapon = getWeapon();
  game.fireTmr -= game.dt;

  if (
    !game.mouseDown
    || game.fireTmr > 0
    || game.isReloading
    || (game.ammo <= 0 && weapon.mode !== "sword")
    || document.pointerLockElement !== game.renderer.domElement
  ) {
    updateWeaponVisuals();
    return;
  }

  game.fireTmr = weapon.fireRate;
  if (weapon.mode === "sword") {
    game.audio.sword();
    game.swordSwingProgress = 0.001;
    actions.handleSwordAttack();
  } else {
    game.ammo -= 1;
    game.weaponAmmo[game.currentWeapon] = game.ammo;
    game.audio.playWeapon(weapon);
    addShake(weapon.shake);
    game.fpRecoilZ = weapon.recoilZ;
    game.fpRecoilRX = weapon.recoilRX;

    const muzzlePosition = new THREE.Vector3();
    (usingFirstPersonView() ? game.visuals.weapon.fpMuzzle : game.visuals.weapon.tpMuzzle).getWorldPosition(muzzlePosition);
    game.visuals.weapon.flashMesh.position.copy(muzzlePosition);
    game.visuals.weapon.flashMesh.visible = true;
    game.visuals.weapon.flashLight.position.copy(muzzlePosition);
    game.visuals.weapon.flashLight.visible = true;
    game.muzzleTmr = 0.04;

    const pelletCount = weapon.pellets || 1;
    const spread = game.isAiming ? weapon.spreadAim : weapon.spreadHip;
    for (let index = 0; index < pelletCount; index += 1) {
      const aimDirection = applySpread(
        new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion).normalize(),
        spread,
      );
      let bulletPosition = muzzlePosition.clone();
      let bulletDirection = aimDirection;
      if (!usingFirstPersonView()) {
        const aimPoint = game.camera.position.clone().addScaledVector(aimDirection, 160);
        bulletDirection = aimPoint.sub(muzzlePosition).normalize();
        bulletPosition = muzzlePosition.clone().addScaledVector(bulletDirection, 0.2);
      }
      spawnBullet(bulletPosition, bulletDirection, true, {
        spd: weapon.bulletSpeed,
        life: weapon.bulletLife,
        damage: weapon.damage,
        minDamage: weapon.minDamage,
        falloffStart: weapon.falloffStart,
        falloffEnd: weapon.falloffEnd,
      });
    }
  }

  if (game.ammo <= 0) {
    startReload();
  }

  actions.updateHUD();
  updateWeaponVisuals();
}

function updateWeaponVisuals() {
  if (game.currentWeapon === "sword" && game.swordSwingProgress > 0) {
    game.swordSwingProgress += game.dt / getWeapon().fireRate;
    const wv = game.visuals.weapon;
    if (game.swordSwingProgress >= 1) {
      game.swordSwingProgress = 0;
      wv.firstPersonGun.rotation.set(0, 0, 0);
      const swordTp = wv.glbGroups?.sword?.tpGroup;
      if (swordTp) swordTp.rotation.set(0, 0, 0);
    } else {
      const s = Math.sin(game.swordSwingProgress * Math.PI);
      wv.firstPersonGun.rotation.set(s * 0.5, s * -1, 1);
      const swordTp = wv.glbGroups?.sword?.tpGroup;
      if (swordTp) swordTp.rotation.set(s * -0.3, s * 2, 0.8);
    }
  }

  if (game.muzzleTmr > 0) {
    game.muzzleTmr -= game.dt;
    if (game.muzzleTmr <= 0) {
      game.visuals.weapon.flashMesh.visible = false;
      game.visuals.weapon.flashLight.visible = false;
    }
  }

  game.fpRecoilZ *= 0.85;
  game.fpRecoilRX *= 0.85;

  const model = game.visuals.weapon.weaponModels[game.currentWeapon];
  const basePosition = game.isAiming ? model.fpAdsPos : model.fpPos;
  game.visuals.weapon.firstPersonGun.position.x += (basePosition[0] - game.visuals.weapon.firstPersonGun.position.x) * 0.22;
  game.visuals.weapon.firstPersonGun.position.y += (basePosition[1] - game.visuals.weapon.firstPersonGun.position.y) * 0.22;
  game.visuals.weapon.firstPersonGun.position.z += ((basePosition[2] + game.fpRecoilZ) - game.visuals.weapon.firstPersonGun.position.z) * 0.22;
  game.visuals.weapon.firstPersonGun.rotation.x += (game.fpRecoilRX - game.visuals.weapon.firstPersonGun.rotation.x) * 0.18;
}

export function updateCamera() {
  if (game.state === "SPECTATING") {
    updateSpectatorCamera();
    return;
  }

  const weapon = getWeapon();
  const inFirstPerson = usingFirstPersonView();
  const scopedSniper = usingScopedSniperView();
  const aimDirection = new THREE.Vector3(
    -Math.sin(game.camTheta) * Math.cos(game.camPhi),
    Math.sin(game.camPhi),
    -Math.cos(game.camTheta) * Math.cos(game.camPhi),
  ).normalize();

  const targetFov = game.isAiming ? weapon.aimFov : BASE_FOV;
  if (Math.abs(game.camera.fov - targetFov) > 0.05) {
    game.camera.fov += (targetFov - game.camera.fov) * Math.min(1, 10 * game.dt);
    game.camera.updateProjectionMatrix();
  }

  let target;
  if (inFirstPerson) {
    target = game.visuals.player.playerGroup.position.clone();
    target.y += EYE_H;
    if (!game.isFPS) {
      target.x -= Math.sin(game.camTheta) * 0.05;
      target.z -= Math.cos(game.camTheta) * 0.05;
    }
  } else {
    const pivot = game.visuals.player.playerGroup.position.clone();
    pivot.y += 1.7;
    const shoulder = new THREE.Vector3(Math.cos(game.camTheta), 0, -Math.sin(game.camTheta))
      .multiplyScalar(game.isAiming ? 0.75 : 1.35);
    const targetDistance = game.isAiming ? weapon.aimCamDist : game.camDist;
    target = pivot.clone().sub(aimDirection.clone().multiplyScalar(targetDistance)).add(shoulder);
    target.y += game.isAiming ? 0.2 : 0.45;
    target.x = Math.max(-HALF + 1, Math.min(HALF - 1, target.x));
    target.z = Math.max(-HALF + 1, Math.min(HALF - 1, target.z));
    target.y = Math.max(1.6, target.y);
  }

  game.camera.position.lerp(target, Math.min(1, 12 * game.dt));

  if (game.shakeAmt > 0.001) {
    game.camera.position.x += (Math.random() - 0.5) * game.shakeAmt * 2;
    game.camera.position.y += (Math.random() - 0.5) * game.shakeAmt * 2;
    game.shakeAmt *= Math.exp(-12 * game.dt);
  } else {
    game.shakeAmt = 0;
  }

  if (inFirstPerson) {
    game.camera.rotation.y = game.camTheta;
    game.camera.rotation.x = -game.camPhi;
    game.camera.rotation.z = 0;
  } else {
    const lookTarget = game.visuals.player.playerGroup.position.clone();
    lookTarget.y += 1.65;
    lookTarget.addScaledVector(aimDirection, 22);
    game.camera.lookAt(lookTarget);
  }

  const hasRedDot = game.isAiming && (game.currentWeapon === "pistol" || game.currentWeapon === "assault");
  game.dom.crosshair.classList.toggle("hidden", scopedSniper || hasRedDot);
  game.dom.scopeOverlay.classList.toggle("show", scopedSniper);
  game.dom.redDotOverlay.classList.toggle("show", hasRedDot);

  const sniperFpGroup = game.visuals.weapon.glbGroups?.sniper?.fpGroup;
  if (sniperFpGroup) sniperFpGroup.visible = game.currentWeapon === "sniper" && !scopedSniper && game.visuals.weapon.glbGroups.sniper.loaded;
}

export function resetViewState() {
  game.camTheta = 0;
  game.camPhi = 0.45;
  game.camDist = 8;
  game.camera.fov = BASE_FOV;
  game.camera.updateProjectionMatrix();
  game.dom.crosshair.classList.remove("hidden");
  game.dom.scopeOverlay.classList.remove("show");
}

export function syncLocalPlayerState(force = false) {
  if (!game.socket || (game.state !== "PLAYING" && game.state !== "DOWNED" && game.state !== "SPECTATING")) {
    return;
  }

  game.netSyncTmr -= game.dt;
  if (!force && game.netSyncTmr > 0) {
    return;
  }

  game.netSyncTmr = 0.05;
  game.socket.emit("playerMovement", {
    x: game.visuals.player.playerGroup.position.x,
    y: game.visuals.player.playerGroup.position.y,
    z: game.visuals.player.playerGroup.position.z,
    rotation: game.camTheta,
    score: game.score,
    kills: game.stats.kills,
    dogKills: game.stats.dogKills,
    bossKills: game.stats.bossKills,
    totalKills: game.stats.kills + game.stats.dogKills + game.stats.bossKills,
    wave: game.wave,
    hp: game.hp,
    isAlive: game.localPlayerIsAlive,
    isDowned: game.localPlayerIsDowned,
    isSpectating: game.localPlayerIsSpectating,
    stats: {
      score: game.score,
      kills: game.stats.kills,
      dogKills: game.stats.dogKills,
      bossKills: game.stats.bossKills,
      totalKills: game.stats.kills + game.stats.dogKills + game.stats.bossKills,
      damageDealt: game.stats.damageDealt,
      shotsFired: game.stats.shotsFired,
      shotsHit: game.stats.shotsHit,
      wave: game.wave,
    },
  });
}

function updateSpectatorCamera() {
  const livingTargets = Object.values(game.remotePlayers)
    .filter((player) => player.isAlive && !player.isDowned && !player.isSpectating);

  if (livingTargets.length > 0) {
    const targetPlayer = livingTargets[0];
    const focus = targetPlayer.group.position.clone();
    focus.y += 1.7;
    const behind = new THREE.Vector3(0, 2.6, 6.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), targetPlayer.group.rotation.y);
    const targetCameraPos = focus.clone().add(behind);
    game.camera.position.lerp(targetCameraPos, Math.min(1, 8 * game.dt));
    game.camera.lookAt(focus);
    return;
  }

  const fallback = new THREE.Vector3(
    Math.sin(performance.now() * 0.0002) * 18,
    14,
    Math.cos(performance.now() * 0.0002) * 18,
  );
  game.camera.position.lerp(fallback, Math.min(1, 4 * game.dt));
  game.camera.lookAt(0, 1.5, 0);
}
