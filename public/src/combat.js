import * as THREE from "three";

import { B_SPD_E, DEFAULT_WEAPON, P_MAX_HP, WEAPON_DEFS, WEAPON_ORDER } from "./config.js";
import { game } from "./state.js";
import { bulletHitObstacle } from "./collision.js";
import { applyWeaponModel } from "./scene.js";

export function getWeapon() {
  return WEAPON_DEFS[game.currentWeapon];
}

export function lowAmmoThreshold(definition) {
  return Math.max(2, Math.ceil(definition.mag * 0.2));
}

export function syncCurrentAmmo() {
  game.ammo = game.weaponAmmo[game.currentWeapon];
}

export function usingScopedSniperView() {
  return game.currentWeapon === "sniper" && game.isAiming;
}

export function usingFirstPersonView() {
  return game.isFPS || usingScopedSniperView();
}

export function setWeapon(id) {
  if (!WEAPON_DEFS[id] || id === game.currentWeapon) {
    return false;
  }

  game.weaponAmmo[game.currentWeapon] = game.ammo;
  game.currentWeapon = id;
  syncCurrentAmmo();
  game.isReloading = false;
  game.reloadTmr = 0;
  game.isAiming = false;
  applyWeaponModel();
  return true;
}

export function cycleWeapon() {
  const index = WEAPON_ORDER.indexOf(game.currentWeapon);
  return setWeapon(WEAPON_ORDER[(index + 1) % WEAPON_ORDER.length]);
}

export function startReload() {
  const weapon = getWeapon();
  if (game.isReloading || game.ammo === weapon.mag || weapon.mode === "sword") {
    return;
  }

  game.isReloading = true;
  game.reloadTmr = weapon.reload;
  game.audio.reload();
}

export function applySpread(direction, spread) {
  if (spread <= 0) {
    return direction.clone();
  }

  return direction.clone().add(
    new THREE.Vector3(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
    ),
  ).normalize();
}

export function bulletDamageAtDistance(bullet) {
  if (
    typeof bullet.minDamage !== "number"
    || typeof bullet.falloffStart !== "number"
    || typeof bullet.falloffEnd !== "number"
  ) {
    return bullet.damage;
  }

  if (bullet.distance <= bullet.falloffStart) {
    return bullet.damage;
  }

  if (bullet.distance >= bullet.falloffEnd) {
    return bullet.minDamage;
  }

  const progress = (bullet.distance - bullet.falloffStart) / (bullet.falloffEnd - bullet.falloffStart);
  return bullet.damage + (bullet.minDamage - bullet.damage) * progress;
}

export function spawnBullet(position, direction, isPlayer, options = {}, fromRemote = false) {
  if (isPlayer && !fromRemote) {
    game.stats.shotsFired += 1;
  }

  const group = new THREE.Group();
  const head = new THREE.Mesh(
    game.shared.bulletGeo,
    isPlayer ? game.shared.playerBulletMat : game.shared.enemyBulletMat,
  );
  group.add(head);

  const trail = new THREE.Mesh(
    game.shared.trailGeo,
    isPlayer ? game.shared.playerBulletMat : game.shared.enemyBulletMat,
  );
  trail.position.z = 0.2;
  group.add(trail);

  group.position.copy(position);
  group.lookAt(position.clone().add(direction));
  game.scene.add(group);

  const shooterId = options.shooterId ?? (isPlayer && !fromRemote ? game.socket?.id : null);

  game.bullets.push({
    mesh: group,
    dir: direction.clone(),
    spd: options.spd ?? (isPlayer ? 90 : B_SPD_E),
    life: options.life ?? (isPlayer ? 3 : 4),
    isPlayer,
    damage: options.damage ?? 25,
    minDamage: options.minDamage,
    falloffStart: options.falloffStart,
    falloffEnd: options.falloffEnd,
    distance: 0,
    shooterId,
    fromRemote,
    weapon: options.weapon ?? null,
  });
}

export function updateBullets({ processHit, playerDiedLocal, showDamage, addShake, updateHUD } = {}) {
  for (let index = game.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = game.bullets[index];
    const step = bullet.spd * game.dt;
    const previousPosition = bullet.mesh.position.clone();
    bullet.mesh.position.addScaledVector(bullet.dir, step);
    bullet.distance += step;
    bullet.life -= game.dt;

    const position = bullet.mesh.position;
    let shouldRemove = bullet.life <= 0;

    if (!shouldRemove && bulletHitObstacle(position.x, position.y, position.z)) {
      shouldRemove = true;
      spawnParticles(position, 2, 0xff8844, 2);
    }

    if (!shouldRemove && bullet.isPlayer) {
      for (let enemyIndex = game.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = game.enemies[enemyIndex];
        const enemyHeight = enemy.type === "soldier" ? 1.2 : enemy.type === "dog" ? 0.6 : 2.4;
        const hitRadiusSq = enemy.type === "boss" ? 5.2 : 1.0;
        const enemyCenter = new THREE.Vector3(
          enemy.group.position.x,
          enemy.group.position.y + enemyHeight,
          enemy.group.position.z,
        );

        if (distanceSqPointToSegment(enemyCenter, previousPosition, position) < hitRadiusSq) {
          processHit?.(enemy, bulletDamageAtDistance(bullet), position.clone());
          shouldRemove = true;
          break;
        }
      }
    }

    if (!shouldRemove && bullet.isPlayer && game.mode === "PVP"
      && bullet.shooterId === game.socket?.id && !bullet.fromRemote) {
      const prevXZ = new THREE.Vector3(previousPosition.x, 0, previousPosition.z);
      const currXZ = new THREE.Vector3(position.x, 0, position.z);
      const seg = currXZ.clone().sub(prevXZ);
      const segLenSq = seg.lengthSq();

      for (const [remoteId, remote] of Object.entries(game.remotePlayers)) {
        if (!remote.isAlive || remote.isDowned || remote.isSpectating) continue;

        const rx = remote.group.position.x;
        const ry = remote.group.position.y;
        const rz = remote.group.position.z;

        // Tall cylinder hitbox: XZ distance first, then vertical range.
        const targetXZ = new THREE.Vector3(rx, 0, rz);
        const xzDistSq = distanceSqPointToSegment(targetXZ, prevXZ, currXZ);
        if (xzDistSq > 1.5) continue; // ~1.22m lateral radius — generous for sniping

        const t = segLenSq > 1e-5
          ? Math.max(0, Math.min(1, targetXZ.clone().sub(prevXZ).dot(seg) / segLenSq))
          : 0;
        const bulletYAtClosest = previousPosition.y + (position.y - previousPosition.y) * t;
        if (bulletYAtClosest < ry - 0.2 || bulletYAtClosest > ry + 2.4) continue;

        const damage = bulletDamageAtDistance(bullet);
        game.stats.shotsHit += 1;
        game.stats.damageDealt += damage;
        spawnParticles(position.clone(), 4, 0xff6622, 3);
        game.socket?.emit("pvpDamage", {
          targetId: remoteId,
          damage,
          weapon: bullet.weapon || game.currentWeapon,
        });
        shouldRemove = true;
        break;
      }
    }

    if (!shouldRemove && !bullet.isPlayer && !bullet.fromRemote) {
      const playerGroup = game.visuals.player.playerGroup;
      const playerCenter = new THREE.Vector3(
        playerGroup.position.x,
        playerGroup.position.y + 1.2,
        playerGroup.position.z,
      );

      if (distanceSqPointToSegment(playerCenter, previousPosition, position) < 1.1) {
        if (game.localPlayerIsAlive && !game.localPlayerIsDowned && !game.invincibilityMode) {
          game.hp -= bullet.damage || 10;
          game.audio.damage();
          showDamage?.();
          addShake?.(0.15);
          spawnParticles(position, 4, 0xff4422, 3);

          if (game.hp <= 0) {
            game.hp = 0;
            playerDiedLocal?.();
          }

          updateHUD?.();
        }

        shouldRemove = true;
      }

    }

    if (shouldRemove) {
      game.scene.remove(bullet.mesh);
      game.bullets.splice(index, 1);
    }
  }
}

export function processHit(enemy, damage, particlePosition) {
  if (enemy.type === "boss" && game.currentWeapon !== "sword" && game.currentWeapon !== "pistol") {
    return;
  }

  if (game.socket) {
    game.socket.emit("enemyHit", { id: enemy.id, damage });
  }

  game.stats.shotsHit += 1;
  game.stats.damageDealt += damage;
  game.audio.hit();
  spawnParticles(particlePosition, 5, 0xff6622, 4);

  if (enemy.hp - damage <= 0) {
    game.audio.death();
    spawnParticles(enemy.group.position.clone().setY(1), 18, 0xcc2200, 8);

    if (enemy.type === "boss") {
      game.stats.bossKills += 1;
      game.score += 2500;
    } else if (enemy.type === "dog") {
      game.stats.dogKills += 1;
      game.score += 150;
    } else if (enemy.type === "skeleton") {
      game.stats.kills += 1;
      game.score += 25;
    } else {
      game.stats.kills += 1;
      game.score += 100;
    }

    game.shakeAmt = Math.max(game.shakeAmt, 0.1);

    if (game.isHost && Math.random() < 0.1) {
      spawnHealthPackAt(enemy.group.position.clone());
    }
  }
}

const MAX_PARTICLES = 400;

export function spawnParticles(position, count, color, speed) {
  const allowed = Math.min(count, Math.max(0, MAX_PARTICLES - game.particles.length));
  for (let index = 0; index < allowed; index += 1) {
    const mesh = new THREE.Mesh(
      game.shared.partGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true }),
    );
    mesh.position.copy(position);
    game.scene.add(mesh);

    const particle = {
      mesh,
      vx: (Math.random() - 0.5) * speed * 2,
      vy: Math.random() * speed * 1.5,
      vz: (Math.random() - 0.5) * speed * 2,
      life: 0.8 + Math.random() * 1.2,
      maxLife: 0,
      rx: Math.random() * 6,
      rz: Math.random() * 6,
    };
    particle.maxLife = particle.life;
    game.particles.push(particle);
  }
}

export function updateParticles() {
  for (let index = game.particles.length - 1; index >= 0; index -= 1) {
    const particle = game.particles[index];
    particle.vy -= 20 * game.dt;
    particle.mesh.position.x += particle.vx * game.dt;
    particle.mesh.position.y += particle.vy * game.dt;
    particle.mesh.position.z += particle.vz * game.dt;
    particle.mesh.rotation.x += particle.rx * game.dt;
    particle.mesh.rotation.z += particle.rz * game.dt;

    if (particle.mesh.position.y < 0.06) {
      particle.mesh.position.y = 0.06;
      particle.vy *= -0.3;
      particle.vx *= 0.7;
      particle.vz *= 0.7;
    }

    particle.life -= game.dt;
    particle.mesh.material.opacity = Math.max(0, particle.life / particle.maxLife);

    if (particle.life <= 0) {
      game.scene.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      particle.mesh.material.dispose();
      game.particles.splice(index, 1);
    }
  }
}

export function spawnHealthPackVisual(id, position) {
  const packMat = new THREE.MeshStandardMaterial({
    color: 0x22dd55,
    emissive: 0x00aa33,
    emissiveIntensity: 0.8,
    roughness: 0.4,
  });
  const crossMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.2,
  });

  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.55), packMat);
  const horizontalBar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.1), crossMat);
  const verticalBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.35), crossMat);

  group.add(base);
  group.add(horizontalBar);
  group.add(verticalBar);
  group.position.copy(position);
  group.position.y = 0.3;
  game.scene.add(group);

  game.healthPacks.push({
    id,
    mesh: group,
    pos: position.clone(),
    bobT: Math.random() * Math.PI * 2,
  });
}

export function spawnHealthPackAt(position) {
  const id = `hp_${Math.random().toString(36).slice(2)}`;
  spawnHealthPackVisual(id, position);
  game.socket?.emit("healthPackSpawned", { id, x: position.x, y: position.y, z: position.z });
  return id;
}

export function updateHealthPacks(updateHUD) {
  const playerGroup = game.visuals.player.playerGroup;

  for (const pack of game.healthPacks) {
    pack.bobT += game.dt * 2.2;
    pack.mesh.position.y = 0.3 + Math.sin(pack.bobT) * 0.12;
    pack.mesh.rotation.y += game.dt * 1.5;

    if (!game.localPlayerIsAlive || game.localPlayerIsDowned) {
      continue;
    }

    const dx = playerGroup.position.x - pack.pos.x;
    const dz = playerGroup.position.z - pack.pos.z;
    if (dx * dx + dz * dz >= 1.5 || game.hp >= P_MAX_HP) {
      continue;
    }

    if (game.isHost) {
      const index = game.healthPacks.indexOf(pack);
      game.scene.remove(pack.mesh);
      game.healthPacks.splice(index, 1);
      game.hp = Math.min(P_MAX_HP, game.hp + 150);
      game.audio.reviveComplete();
      updateHUD?.();
      game.socket?.emit("healthPackPickedUp", { packId: pack.id, playerId: game.socket.id });
    } else {
      game.socket?.emit("pickupHealthPack", { packId: pack.id });
    }
    break;
  }
}

export function resetCombatState() {
  game.currentWeapon = DEFAULT_WEAPON;
  syncCurrentAmmo();
  applyWeaponModel();
}

function distanceSqPointToSegment(point, start, end) {
  const segment = end.clone().sub(start);
  const segmentLengthSq = segment.lengthSq();
  if (segmentLengthSq <= 0.000001) {
    return point.distanceToSquared(start);
  }

  const t = Math.max(0, Math.min(1, point.clone().sub(start).dot(segment) / segmentLengthSq));
  const projection = start.clone().addScaledVector(segment, t);
  return point.distanceToSquared(projection);
}
