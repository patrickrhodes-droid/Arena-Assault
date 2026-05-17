import * as THREE from "three";

import {
  BASE_FOV,
  EYE_H,
  GRAPPLE_TUNING,
  GRAV,
  HALF,
  JUMP_VEL,
  LAND_SNAP,
  PLAYER_MOVEMENT,
  P_RAD,
  REVIVE_TUNING,
} from "./config.js";
import { game } from "./state.js";
import { addShake } from "./state.js";
import { getSupportHeight, resolveCircleBox } from "./collision.js";
import {
  applySpread,
  cycleWeapon,
  getWeapon,
  processHit,
  spawnBullet,
  spawnParticles,
  startReload,
  usingFirstPersonView,
  usingScopedSniperView,
} from "./combat.js";
import { getBossEnemy } from "./enemies.js";

let bossAlertCooldown = 0;
let _prevVelY       = 0; // track vertical velocity between frames for landing detection
let _stepTmr        = 0; // footstep interval timer
let _landDip        = 0; // camera dip magnitude on landing, decays each frame
let _hbTimer        = 0; // low-health heartbeat interval timer
const _aimRaycaster = new THREE.Raycaster(); // reused for crosshair→world aim point
let _swayX          = 0; // current weapon sway offset X
let _swayY          = 0; // current weapon sway offset Y
let _mouseDeltaX    = 0; // accumulated mouse X delta since last weapon update
let _mouseDeltaY    = 0;

function findEnemyFromHit(object) {
  let current = object;
  while (current) {
    const enemy = game.enemies.find((candidate) => candidate.group === current);
    if (enemy) return enemy;
    current = current.parent;
  }
  return null;
}

function findRemotePlayerFromHit(object) {
  let current = object;
  while (current) {
    const rp = Object.values(game.remotePlayers).find((r) => r.group === current);
    if (rp) return rp;
    current = current.parent;
  }
  return null;
}

function tryGrapplePlayerPull() {
  if (game.currentWeapon !== "grapple") return false;
  if (game.mode !== "PVP" && game.mode !== "FFA") return false;

  const aliveRemotes = Object.values(game.remotePlayers).filter(
    (r) => r.isAlive && !r.isDowned && !r.isSpectating,
  );
  if (aliveRemotes.length === 0) return false;

  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(0, 0), game.camera);
  rc.far = GRAPPLE_TUNING.maxDistance;
  const hits = rc.intersectObjects(aliveRemotes.map((r) => r.group), true);
  if (hits.length === 0) return false;

  const hitPlayer = findRemotePlayerFromHit(hits[0].object);
  if (!hitPlayer) return false;

  const playerPos = game.visuals.player.playerGroup.position;
  game.socket?.emit("pvpGrapplePull", {
    targetId: hitPlayer.playerId,
    shooterX: playerPos.x,
    shooterY: playerPos.y,
    shooterZ: playerPos.z,
    damage: getWeapon().damage,
  });

  // Show hook flash at the hit point for 0.4 s then auto-release.
  game.grapplePoint = hits[0].point.clone();
  game.grappleState = "hooked";
  game.audio?.grappleHit?.();
  window.setTimeout(() => {
    if (game.grappleState === "hooked") releaseGrapple();
  }, 400);

  return true;
}

function tryGrappleEnemyPull() {
  if (game.currentWeapon !== "grapple") {
    return false;
  }

  const enemyGroups = game.enemies.map((enemy) => enemy.group);
  if (enemyGroups.length === 0) {
    return false;
  }

  const enemyRaycaster = new THREE.Raycaster();
  enemyRaycaster.setFromCamera(new THREE.Vector2(0, 0), game.camera);
  enemyRaycaster.far = GRAPPLE_TUNING.maxDistance;
  const enemyHits = enemyRaycaster.intersectObjects(enemyGroups, true);
  if (enemyHits.length === 0) {
    return false;
  }

  const enemy = findEnemyFromHit(enemyHits[0].object);
  if (!enemy) {
    return false;
  }

  const playerPos = game.visuals.player.playerGroup.position;
  const enemyPos = enemy.group.position.clone();
  processHit(enemy, getWeapon().damage, enemyHits[0].point.clone());
  if (enemy.type === "boss") {
    game.grappleEnemyId = enemy.id;
    game.grapplePoint = enemyPos.clone().setY(enemyPos.y + GRAPPLE_TUNING.bossAttachHeight);
    game.grappleState = "hooked";
    return true;
  }

  const distance = playerPos.distanceTo(enemyPos);
  if (distance <= GRAPPLE_TUNING.enemyPullStopDistance) {
    return true;
  }

  const direction = enemyPos.sub(playerPos).normalize();
  const targetPos = playerPos.clone().addScaledVector(direction, GRAPPLE_TUNING.enemyPullStopDistance);
  enemy.group.position.copy(targetPos);
  enemy.serverX = targetPos.x;
  enemy.serverY = targetPos.y;
  enemy.serverZ = targetPos.z;
  game.socket?.emit("grappleEnemy", {
    enemyId: enemy.id,
    x: targetPos.x,
    y: targetPos.y,
    z: targetPos.z,
    weapon: game.currentWeapon,
  });
  return true;
}

// ── Grappling hook ────────────────────────────────────────────────────────────

export function fireGrapple() {
  if (!game.localPlayerIsAlive || game.localPlayerIsDowned) return;
  if (game.state !== "PLAYING") return;

  if (game.grappleState === "hooked") {
    releaseGrapple();
    return;
  }

  if (game.grappleCooldown > 0) return;

  if (tryGrapplePlayerPull()) return;
  if (tryGrappleEnemyPull()) return;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), game.camera);
  raycaster.far = GRAPPLE_TUNING.maxDistance;

  const arenaChildren = game.arenaGroup ? game.arenaGroup.children : [];
  const hits = raycaster.intersectObjects(arenaChildren, true);

  let attachPoint = null;

  if (hits.length > 0) {
    attachPoint = hits[0].point.clone();
  } else {
    // Fall back to floor (y = 0 plane) if no obstacle was hit
    const dir = raycaster.ray.direction;
    const orig = raycaster.ray.origin;
    if (dir.y < -0.01) {
      const t = -orig.y / dir.y;
      if (t > 0 && t < 250) {
        attachPoint = orig.clone().addScaledVector(dir, t);
      }
    }
  }

  if (!attachPoint) return;

  const dist = game.visuals.player.playerGroup.position.distanceTo(attachPoint);
  if (dist < GRAPPLE_TUNING.minAttachDistance) return; // too close

  game.grapplePoint = attachPoint;
  game.grappleState = "hooked";
}

function releaseGrapple() {
  game.grappleState = "idle";
  game.grapplePoint = null;
  game.grappleEnemyId = null;
  game.grappleCooldown = GRAPPLE_TUNING.releaseCooldown;
  if (game.visuals.grapple) {
    game.visuals.grapple.hookMesh.visible = false;
    game.visuals.grapple.rope.visible = false;
  }
}

export function updateGrapple() {
  if (game.grappleCooldown > 0) game.grappleCooldown -= game.dt;

  const gv = game.visuals.grapple;
  if (!gv) return;

  if (game.grappleState !== "hooked" || !game.grapplePoint) {
    gv.hookMesh.visible = false;
    gv.rope.visible = false;
    return;
  }

  if (game.grappleEnemyId) {
    const grappleEnemy = game.enemies.find((enemy) => enemy.id === game.grappleEnemyId);
    if (!grappleEnemy || grappleEnemy.hp <= 0) {
      releaseGrapple();
      return;
    }
    game.grapplePoint = grappleEnemy.group.position.clone().setY(grappleEnemy.group.position.y + GRAPPLE_TUNING.bossAttachHeight);
  }

  // Cancel if player died
  if (!game.localPlayerIsAlive || game.localPlayerIsDowned) {
    releaseGrapple();
    return;
  }

  const playerPos = game.visuals.player.playerGroup.position;
  const hook = game.grapplePoint;
  const dx = hook.x - playerPos.x;
  const dy = hook.y - playerPos.y;
  const dz = hook.z - playerPos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist < GRAPPLE_TUNING.releaseDistance) {
    releaseGrapple();
    return;
  }

  const speed = GRAPPLE_TUNING.pullSpeed;
  const ndx = dx / dist, ndy = dy / dist, ndz = dz / dist;
  playerPos.x += ndx * speed * game.dt;
  playerPos.y = Math.max(0, playerPos.y + ndy * speed * game.dt);
  playerPos.z += ndz * speed * game.dt;
  if (ndy > 0.1) game.playerVelY = ndy * speed * 0.5;

  // Hook visual
  gv.hookMesh.position.copy(hook);
  gv.hookMesh.visible = true;

  // Rope between player chest and hook
  const handPos = playerPos.clone().setY(playerPos.y + 1.4);
  const pos = gv.rope.geometry.attributes.position;
  pos.setXYZ(0, handPos.x, handPos.y, handPos.z);
  pos.setXYZ(1, hook.x, hook.y, hook.z);
  pos.needsUpdate = true;
  gv.rope.visible = true;
}

export function setupInput(actions) {
  document.addEventListener("keydown", (event) => {
    // Don't intercept keys while the user is typing in a text/password input
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    game.keys[event.code] = true;

    if (event.code === "KeyW" && game.state === "PLAYING" && !event.repeat) {
      const now = performance.now();
      if (now - game.wLastTapTime < 300) {
        game.sprintLocked = true;
      }
      game.wLastTapTime = now;
    }

    if (event.code === "ControlLeft" || event.code === "ControlRight") {
      if (game.state === "PLAYING" && game.localPlayerIsAlive && !game.isOnLadder) {
        game.isCrouching = !game.isCrouching;
        if (game.isCrouching) {
          game.sprintLocked = false;
        }
      }
    }

    if (event.code === "Space") {
      if (game.localPlayerIsAlive) {
        event.preventDefault();
      }
      if (game.state === "PLAYING") {
        tryJump();
      }
    }

    if (game.mode !== "PVP") {
      if (event.code === "Digit1") actions.setWeapon("pistol");
      if (event.code === "Digit2") actions.setWeapon("assault");
      if (event.code === "Digit3") actions.setWeapon("shotgun");
      if (event.code === "Digit4") actions.setWeapon("sniper");
      if (event.code === "Digit5") actions.setWeapon("sword");
      if (event.code === "Digit6") actions.setWeapon("bazooka");
      if (event.code === "Digit7") actions.setWeapon("grapple");
      if (event.code === "KeyQ") {
        cycleWeapon();
        actions.updateHUD();
      }
    }
    if (event.code === "KeyR" && game.state === "PLAYING" && !game.isReloading && game.currentWeapon !== "grapple" && game.ammo < getWeapon().mag) {
      startReload();
      actions.updateHUD();
    }

    if (event.code === "KeyG" && game.state === "PLAYING") {
      actions.fireGrapple();
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.target?.tagName === "INPUT" || event.target?.tagName === "TEXTAREA") return;
    game.keys[event.code] = false;
    if (event.code === "KeyW") {
      game.sprintLocked = false;
    }
  });

  document.addEventListener("mousedown", (event) => {
    if (event.button === 0) {
      game.mouseDown = true;
      game.mouseClicked = true;
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

    // Accumulate for weapon sway
    _mouseDeltaX += event.movementX;
    _mouseDeltaY += event.movementY;
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
  if (!game.isGrounded && !game.isOnLadder && game.grappleState !== "hooked" && game.coyoteTmr <= 0) {
    return;
  }

  game.coyoteTmr = 0; // consume coyote window

  // Release grapple on jump — lets the player swing and release mid-air
  if (game.grappleState === "hooked") {
    game.grappleState = "idle";
    game.grapplePoint = null;
    game.grappleEnemyId = null;
    game.grappleCooldown = GRAPPLE_TUNING.jumpReleaseCooldown;
  }

  game.isGrounded = false;
  game.isOnLadder = false;
  game.ladderCooldown = 0.7;
  game.isCrouching = false;
  game.playerVelY = JUMP_VEL;
}

export function updatePlayer(actions) {
  const wasGrounded = game.isGrounded;
  const prevY = game.visuals.player.playerGroup.position.y;
  const prevX = game.visuals.player.playerGroup.position.x;
  const prevZ = game.visuals.player.playerGroup.position.z;
  const inFirstPerson = usingFirstPersonView();
  let ladderBeforeMove = null;
  if (game.ladderCooldown <= 0 && game.localPlayerIsAlive) {
    for (const ladder of game.ladders) {
      if (
        prevX >= ladder.xMin && prevX <= ladder.xMax
        && prevZ >= ladder.zMin && prevZ <= ladder.zMax
        && prevY <= ladder.yMax
      ) {
        ladderBeforeMove = ladder;
        break;
      }
    }
  }
  const forward = new THREE.Vector3(-Math.sin(game.camTheta), 0, -Math.cos(game.camTheta));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const moveDirection = new THREE.Vector3();

  if (!ladderBeforeMove) {
    if (game.keys.KeyW || game.gpForward) moveDirection.add(forward);
    if (game.keys.KeyS || game.gpBack)    moveDirection.sub(forward);
    if (game.keys.KeyD || game.gpRight)   moveDirection.add(right);
    if (game.keys.KeyA || game.gpLeft)    moveDirection.sub(right);
  }

  const shiftHeld = !!(game.keys.ShiftLeft || game.keys.ShiftRight);
  game.isSprinting = (game.sprintLocked || shiftHeld) && (!!game.keys.KeyW || game.gpForward) && game.localPlayerIsAlive && !game.isCrouching;
  game.isMoving = moveDirection.lengthSq() > 0 && game.localPlayerIsAlive;

  if (!inFirstPerson) {
    game.visuals.player.playerGroup.rotation.y = game.camTheta;
  }

  if (game.isMoving) {
    moveDirection.normalize();
    const speed = game.isSprinting
      ? PLAYER_MOVEMENT.walkSpeed * PLAYER_MOVEMENT.sprintMultiplier
      : game.isCrouching ? PLAYER_MOVEMENT.crouchSpeed : PLAYER_MOVEMENT.walkSpeed;
    game.visuals.player.playerGroup.position.addScaledVector(moveDirection, speed * game.dt);
    if (inFirstPerson) {
      game.visuals.player.playerGroup.rotation.y = game.camTheta;
    }

    // Footstep audio — only when grounded (y near floor level)
    const grounded = game.visuals.player.playerGroup.position.y < 0.15;
    if (grounded && !game.isOnLadder) {
      _stepTmr -= game.dt;
      if (_stepTmr <= 0) {
        _stepTmr = game.isSprinting ? 0.30 : game.isCrouching ? 0.60 : 0.44;
        const surf = game.selectedMap === 'blacksite' ? 'carpet'
                   : game.selectedMap === 'desert'   ? 'grass'
                   : 'concrete';
        game.audio?.footstep?.(surf);
      }
    }
  } else {
    _stepTmr = 0;
  }

  // ── Ladder cooldown ──
  if (game.ladderCooldown > 0) {
    game.ladderCooldown -= game.dt;
  }

  // ── Ladder zone check ──
  let activeLadder = null;
  if (game.ladderCooldown <= 0 && game.localPlayerIsAlive) {
    const pp = game.visuals.player.playerGroup.position;
    for (const ladder of game.ladders) {
      if (
        pp.x >= ladder.xMin && pp.x <= ladder.xMax
        && pp.z >= ladder.zMin && pp.z <= ladder.zMax
        && pp.y <= ladder.yMax
      ) {
        activeLadder = ladder;
        break;
      }
    }
  }
  game.isOnLadder = activeLadder !== null;

  if (game.isOnLadder) {
    game.visuals.player.playerGroup.position.x = prevX;
    game.visuals.player.playerGroup.position.z = prevZ;
    game.isCrouching = false;
    const pp = game.visuals.player.playerGroup.position;

    // Near the top — exit ladder so the player can step onto the platform
    if (pp.y >= activeLadder.yMax - 0.3) {
      game.isOnLadder = false;
      game.ladderCooldown = 0.4;
    } else {
      game.playerVelY = 0;
      game.isGrounded = false;
      const climbSpeed = (game.keys.KeyW || game.gpForward)
        ? PLAYER_MOVEMENT.ladderClimbSpeed
        : (game.keys.KeyS || game.gpBack) ? -PLAYER_MOVEMENT.ladderClimbSpeed : 0;
      pp.y = Math.max(0, Math.min(activeLadder.yMax, pp.y + climbSpeed * game.dt));
    }
  }

  if (!game.isOnLadder) {
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
      if (_prevVelY < -4) game.audio?.land?.(_prevVelY < -10);
      game.playerVelY = 0;
      game.isGrounded = true;
    } else if (game.visuals.player.playerGroup.position.y <= 0) {
      game.visuals.player.playerGroup.position.y = 0;
      if (_prevVelY < -4) game.audio?.land?.(_prevVelY < -10);
      game.playerVelY = 0;
      game.isGrounded = true;
    } else {
      game.isGrounded = false;
    }
  }

  _prevVelY = game.playerVelY;

  // Coyote time: allow jump for 80 ms after walking off a ledge
  if (wasGrounded && !game.isGrounded && !game.isOnLadder && game.playerVelY <= 0) {
    game.coyoteTmr = 0.08;
  }
  if (game.coyoteTmr > 0) game.coyoteTmr -= game.dt;

  // ── Crouch visual: smoothly squish/unsquish the player model ──
  const crouchTargetScale = game.isCrouching ? PLAYER_MOVEMENT.crouchScale : 1.0;
  const pv = game.visuals.player;
  pv.playerGroup.scale.y += (crouchTargetScale - pv.playerGroup.scale.y) * Math.min(1, PLAYER_MOVEMENT.crouchLerp * game.dt);

  for (const obstacle of game.oBs) {
    resolveCircleBox(game.visuals.player.playerGroup.position, P_RAD, obstacle, game.visuals.player.playerGroup.position.y);
  }

  if (game.knockbackX !== 0 || game.knockbackZ !== 0) {
    let kdx = game.knockbackX * game.dt;
    let kdz = game.knockbackZ * game.dt;
    // Cap per-frame displacement so large forces slide smoothly rather than teleport
    const kLen = Math.sqrt(kdx * kdx + kdz * kdz);
    if (kLen > 0.6) { const s = 0.6 / kLen; kdx *= s; kdz *= s; }
    game.visuals.player.playerGroup.position.x += kdx;
    game.visuals.player.playerGroup.position.z += kdz;
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

  // ── Landing impact ──────────────────────────────────────────────────────
  const justLanded = !wasGrounded && game.isGrounded && _prevVelY < -7;
  if (justLanded) {
    const impactAmt = Math.min(0.55, Math.abs(_prevVelY) * 0.018);
    _landDip = Math.min(0.18, Math.abs(_prevVelY) * 0.013);
    addShake(impactAmt);
    // Squish player model briefly (lerps back in animatePlayerBody)
    game.visuals.player.playerGroup.scale.y = Math.max(0.5, game.visuals.player.playerGroup.scale.y - impactAmt * 1.8);
    // Landing flash overlay
    const lf = game.dom?.landingFlash;
    if (lf) {
      lf.classList.remove("active");
      void lf.offsetWidth;
      lf.classList.add("active");
    }
  }
  _prevVelY = game.playerVelY;

  // ── Low health heartbeat ─────────────────────────────────────────────────
  const lowHp = game.localPlayerIsAlive && !game.localPlayerIsDowned && game.hp > 0 && game.hp < (game.effectiveMaxHP ?? 1000) * 0.25;
  if (lowHp) {
    _hbTimer -= game.dt;
    if (_hbTimer <= 0) {
      _hbTimer = 0.85;
      game.audio?.heartbeat?.();
    }
  } else {
    _hbTimer = 0;
  }

  // ── Crosshair spread class ───────────────────────────────────────────────
  const xh = game.dom?.crosshair;
  if (xh) {
    const isScopedOrRed = usingScopedSniperView() ||
      (game.isAiming && (game.currentWeapon === "pistol" || game.currentWeapon === "assault"));
    if (!isScopedOrRed) {
      if (game.isAiming) {
        xh.classList.add("xh-tight");
        xh.classList.remove("xh-spread");
      } else if (game.isSprinting && game.isMoving) {
        xh.classList.add("xh-spread");
        xh.classList.remove("xh-tight");
      } else {
        xh.classList.remove("xh-spread", "xh-tight");
      }
    }
  }


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
  const reviveRange = REVIVE_TUNING.range;
  const reviveTime = REVIVE_TUNING.holdTime;
  let nearDowned = null;

  if (game.localPlayerIsAlive && !game.localPlayerIsDowned && game.state === "PLAYING") {
    for (const remotePlayer of Object.values(game.remotePlayers)) {
      if (!remotePlayer.isDowned) {
        continue;
      }
      const distance = game.visuals.player.playerGroup.position.distanceTo(remotePlayer.group.position);
      if (distance < reviveRange) {
        nearDowned = { id: remotePlayer.playerId, remotePlayer };
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

  const triggerDown = weapon.mode === "pistol" || weapon.mode === "grapple" || weapon.mode === "bazooka"
    ? game.mouseClicked
    : game.mouseDown;
  const emptyClick = triggerDown && game.localPlayerIsAlive && !game.isReloading
    && game.ammo <= 0 && weapon.mode !== "sword" && weapon.mode !== "grapple" && game.fireTmr <= 0;
  if (emptyClick) { game.audio?.emptyMag?.(); game.fireTmr = 0.3; }

  if (
    !triggerDown
    || !game.localPlayerIsAlive
    || game.fireTmr > 0
    || game.isReloading
    || (game.ammo <= 0 && weapon.mode !== "sword" && weapon.mode !== "grapple")
    || document.pointerLockElement !== game.renderer.domElement
  ) {
    updateWeaponVisuals();
    return;
  }

  const bossIsActive = game.currentWeapon !== "sword" && game.currentWeapon !== "pistol" && game.currentWeapon !== "grapple" && game.currentWeapon !== "bazooka" && Boolean(getBossEnemy());

  game.fireTmr = weapon.fireRate;
  if (weapon.mode === "pistol" || weapon.mode === "grapple" || weapon.mode === "bazooka") game.mouseClicked = false;
  if (weapon.mode === "sword") {
    game.audio.sword();
    game.swordSwingProgress = 0.001;
    actions.handleSwordAttack();
  } else if (weapon.mode === "grapple") {
    game.audio.playWeapon(weapon);
    actions.fireGrapple();
  } else {
    game.ammo -= 1;
    game.weaponAmmo[game.currentWeapon] = game.ammo;
    if (bossIsActive && bossAlertCooldown <= 0) {
      actions.showBossImperviousAlert?.();
      bossAlertCooldown = 2.5;
    }
    if (bossAlertCooldown > 0) bossAlertCooldown -= game.dt;
    game.audio.playWeapon(weapon);
    addShake(weapon.shake);
    const adsRecoilMult = (game.isAiming && weapon.mode !== "bazooka") ? 0.25 : 1;
    game.fpRecoilZ  = weapon.recoilZ  * adsRecoilMult;
    game.fpRecoilRX = weapon.recoilRX * adsRecoilMult;

    // Camera recoil kick — snaps up, then auto-recovers in updateCamera
    game.recoilOffset += weapon.recoilRX * 1.2 * adsRecoilMult;
    game.recoilOffset  = Math.min(0.14, game.recoilOffset); // capped at half the old value

    // Bazooka self-knockback — push player away from aim direction
    if (weapon.mode === "bazooka") {
      const phi  = game.camPhi + game.recoilOffset;
      const aimX = -Math.sin(game.camTheta) * Math.cos(phi);
      const aimY = Math.sin(phi);
      const aimZ = -Math.cos(game.camTheta) * Math.cos(phi);
      const bazForce = 34;
      game.knockbackX -= aimX * bazForce;
      game.knockbackZ -= aimZ * bazForce;
      // Aimed downward → rocket-jump: push upward proportionally
      if (aimY < -0.15) {
        game.playerVelY = Math.max(game.playerVelY, -aimY * bazForce * 0.6);
        game.isGrounded  = false;
      }
    }

    const muzzlePosition = new THREE.Vector3();
    (usingFirstPersonView() ? game.visuals.weapon.fpMuzzle : game.visuals.weapon.tpMuzzle).getWorldPosition(muzzlePosition);

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
        // Raycast from camera through crosshair centre to find the real world aim point.
        // Without this, bullets fire from the off-centre muzzle toward a fixed point
        // 160 u ahead of the camera, creating a parallax gap at close range.
        _aimRaycaster.set(game.camera.position, aimDirection);
        _aimRaycaster.near = 0.5;
        _aimRaycaster.far  = 300;
        const wallHits = game.arenaGroup
          ? _aimRaycaster.intersectObject(game.arenaGroup, true).filter(h => !h.object.isSkinnedMesh)
          : [];
        const aimPoint = wallHits.length > 0
          ? wallHits[0].point.clone()
          : game.camera.position.clone().addScaledVector(aimDirection, 300);
        bulletDirection = aimPoint.sub(muzzlePosition).normalize();
        bulletPosition  = muzzlePosition.clone().addScaledVector(bulletDirection, 0.2);
      }
      spawnBullet(bulletPosition, bulletDirection, true, {
        spd: weapon.bulletSpeed,
        life: weapon.bulletLife,
        damage: weapon.damage,
        minDamage: weapon.minDamage,
        falloffStart: weapon.falloffStart,
        falloffEnd: weapon.falloffEnd,
        splashRadius: weapon.splashRadius ?? 0,
        splashDamage: weapon.splashDamage ?? 0,
        shooterId: game.socket?.id,
        weapon: game.currentWeapon,
      });
      // Muzzle smoke — small grey puff (skip bazooka/grapple/sword which have their own effects)
      if (weapon.mode !== 'bazooka' && weapon.mode !== 'grapple' && weapon.mode !== 'sword') {
        spawnParticles(muzzlePosition.clone(), 3, 0xbbbbbb, 1.4);
      }
      // Broadcast for visibility on other clients (visual-only bullet there).
      game.socket?.emit("fireBullet", {
        x: bulletPosition.x,
        y: bulletPosition.y,
        z: bulletPosition.z,
        dx: bulletDirection.x,
        dy: bulletDirection.y,
        dz: bulletDirection.z,
        spd: weapon.bulletSpeed,
        life: weapon.bulletLife,
        weapon: game.currentWeapon,
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

  game.fpRecoilZ  *= PLAYER_MOVEMENT.recoilDecay;
  game.fpRecoilRX *= PLAYER_MOVEMENT.recoilDecay;

  // ── Weapon sway from mouse movement ──────────────────────────────────────
  const swayStrength = game.isAiming ? 0.00012 : 0.00028;
  _swayX += (_mouseDeltaX * swayStrength - _swayX) * 0.25;
  _swayY += (_mouseDeltaY * swayStrength - _swayY) * 0.25;
  _mouseDeltaX *= 0.8;
  _mouseDeltaY *= 0.8;
  // Zero-clamp so a tiny residual delta doesn't bias sway after the mouse stops.
  if (Math.abs(_mouseDeltaX) < 0.05) _mouseDeltaX = 0;
  if (Math.abs(_mouseDeltaY) < 0.05) _mouseDeltaY = 0;

  // ── Idle weapon breathe (only when still) ────────────────────────────────
  const t = performance.now() * 0.001;
  const idleX = game.isMoving ? 0 : Math.sin(t * 0.85) * 0.0035;
  const idleY = game.isMoving ? 0 : Math.sin(t * 1.7)  * 0.0025;

  const model       = game.visuals.weapon.weaponModels[game.currentWeapon];
  const basePosition = game.isAiming ? model.fpAdsPos : model.fpPos;
  const targetX = basePosition[0] + _swayX + idleX;
  const targetY = basePosition[1] + _swayY + idleY;
  const targetZ = basePosition[2] + game.fpRecoilZ;

  game.visuals.weapon.firstPersonGun.position.x += (targetX - game.visuals.weapon.firstPersonGun.position.x) * 0.22;
  game.visuals.weapon.firstPersonGun.position.y += (targetY - game.visuals.weapon.firstPersonGun.position.y) * 0.22;
  game.visuals.weapon.firstPersonGun.position.z += (targetZ  - game.visuals.weapon.firstPersonGun.position.z) * 0.22;
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

  const sprintFovBonus = (game.isSprinting && game.isMoving && !game.isAiming) ? 8 : 0;
  const targetFov = game.isAiming ? weapon.aimFov : BASE_FOV + sprintFovBonus;
  if (Math.abs(game.camera.fov - targetFov) > 0.05) {
    game.camera.fov += (targetFov - game.camera.fov) * Math.min(1, 10 * game.dt);
    game.camera.updateProjectionMatrix();
  }

  const eyeH = game.isCrouching ? 1.1 : EYE_H;

  let target;
  if (inFirstPerson) {
    target = game.visuals.player.playerGroup.position.clone();
    target.y += eyeH;
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

  // FPS head-bob: gentle vertical oscillation when walking in first-person
  if (inFirstPerson && game.isMoving && game.isGrounded && !game.isCrouching) {
    target.y += Math.sin(game.walkTime) * (game.isSprinting ? 0.055 : 0.038);
  }

  // Landing camera dip — quick downward punch that springs back
  if (_landDip > 0.001) {
    target.y -= _landDip;
    _landDip *= Math.pow(0.002, game.dt);
  } else {
    _landDip = 0;
  }

  game.camera.position.lerp(target, Math.min(1, 12 * game.dt));

  if (game.shakeAmt > 0.001) {
    game.camera.position.x += (Math.random() - 0.5) * game.shakeAmt * 2;
    game.camera.position.y += (Math.random() - 0.5) * game.shakeAmt * 2;
    game.shakeAmt *= Math.exp(-12 * game.dt);
  } else {
    game.shakeAmt = 0;
  }

  // Decay camera recoil offset — recovers to zero in ~0.18 s
  if (game.recoilOffset > 0.001) {
    game.recoilOffset *= Math.pow(0.04, game.dt);
  } else {
    game.recoilOffset = 0;
  }

  if (inFirstPerson) {
    game.camera.rotation.y = game.camTheta;
    game.camera.rotation.x = -(game.camPhi + game.recoilOffset); // include recoil kick

    // Sprint tilt: very subtle lean into strafe direction
    const strafeInput = (game.keys.KeyD ? 1 : 0) - (game.keys.KeyA ? 1 : 0);
    const targetRoll = game.isSprinting && game.isMoving ? strafeInput * -0.016 : 0;
    game.camera.rotation.z += (targetRoll - game.camera.rotation.z) * Math.min(1, 6 * game.dt);
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
    isCrouching: game.isCrouching,
    isSprinting: game.isSprinting,
    currentWeapon: game.currentWeapon,
    swordSwing: game.swordSwingProgress > 0 && game.swordSwingProgress < 1 ? game.swordSwingProgress : 0,
    pvpDying: Boolean(game.pvpDying),
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
