import * as THREE from "three";

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { B_SPD_E, DEFAULT_WEAPON, P_MAX_HP, WEAPON_DEFS, WEAPON_ORDER } from "./config.js";
import { game } from "./state.js";
import { bulletHitObstacle } from "./collision.js";
import { applyWeaponModel } from "./scene.js";
import { disposeObject3D } from "./utils.js";

export function getWeapon() {
  return WEAPON_DEFS[game.currentWeapon];
}

// ── Wall-hit decals (Sprite so they're camera-facing and visible on any surface) ──
const _decals    = [];
const MAX_DECALS = 80;

function spawnWallDecal(pos) {
  if (!game.scene) return;
  // Sprite is always camera-facing — works on walls, boxes, and floor alike
  const mat = new THREE.SpriteMaterial({
    color: 0x050505,
    transparent: true,
    opacity: 0.70,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(mat);
  const sz = 0.10 + Math.random() * 0.06; // slight size variety
  sprite.scale.set(sz, sz, 1);
  sprite.position.set(pos.x, pos.y, pos.z);
  sprite.renderOrder = 2;
  game.scene.add(sprite);
  _decals.push(sprite);
  if (_decals.length > MAX_DECALS) {
    const old = _decals.shift();
    game.scene.remove(old);
    old.material.dispose();
  }
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
  // In COOP mode, only switch to weapons that have been collected/unlocked
  if (game.mode === 'COOP' && !(game.collectedWeapons?.has(id))) {
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
  const available = game.mode === 'COOP'
    ? WEAPON_ORDER.filter(id => game.collectedWeapons?.has(id))
    : WEAPON_ORDER;
  const index = available.indexOf(game.currentWeapon);
  return setWeapon(available[(index + 1) % available.length]);
}

export function collectWeapon(weaponId) {
  if (!WEAPON_DEFS[weaponId]) return;
  game.collectedWeapons.add(weaponId);
  game.weaponAmmo[weaponId] = WEAPON_DEFS[weaponId].mag;
}

export function startReload() {
  const weapon = getWeapon();
  if (game.isReloading || game.ammo === weapon.mag || weapon.mode === "sword" || weapon.mode === "grapple") {
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
    splashRadius: options.splashRadius ?? 0,
    splashDamage: options.splashDamage ?? 0,
    distance: 0,
    prevPos: position.clone(), // cached to avoid clone() each frame
    shooterId,
    fromRemote,
    weapon: options.weapon ?? null,
  });
}

// Reused each frame to avoid per-bullet/per-enemy allocations.
const _enemyCenterVec = new THREE.Vector3();
const _hitPosVec = new THREE.Vector3();

export function updateBullets({ processHit, playerDiedLocal, showDamage, addShake, updateHUD } = {}) {
  for (let index = game.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = game.bullets[index];
    const step = bullet.spd * game.dt;
    // Store previous position in the bullet's own cached vector (avoids clone()).
    bullet.prevPos.copy(bullet.mesh.position);
    bullet.mesh.position.addScaledVector(bullet.dir, step);
    bullet.distance += step;
    bullet.life -= game.dt;

    const position = bullet.mesh.position;
    let shouldRemove = bullet.life <= 0;

    if (!shouldRemove && bulletHitObstacle(position.x, position.y, position.z)) {
      shouldRemove = true;
      spawnParticles(position, bullet.splashRadius > 0 ? 72 : 2, bullet.splashRadius > 0 ? 0xff6600 : 0xff8844, bullet.splashRadius > 0 ? 30 : 2, bullet.splashRadius > 0);
      // Wall-hit decal (bullet hole mark) — skip for bazooka/splash since it leaves a big crater
      if (!bullet.splashRadius && bullet.isPlayer) spawnWallDecal(position);
      if (bullet.splashRadius > 0 && bullet.isPlayer && !bullet.fromRemote) {
        applySplashDamage(bullet, position, processHit);
      }
      // Check if the bullet hit a destructible prop (any weapon can trigger).
      if (bullet.isPlayer && !bullet.fromRemote) {
        const dest = findNearbyDestructible(position.x, position.z);
        if (dest) triggerDestructible(dest.id, position.clone(), processHit);
      }
    }

    if (!shouldRemove && bullet.isPlayer && !bullet.fromRemote) {
      // Find the NEAREST enemy whose hitbox intersects this bullet's path segment.
      // Using nearest (not first-in-array) ensures different spread pellets (shotgun)
      // correctly hit different enemies rather than all converging on one.
      let hitEnemy    = null;
      let hitDist2    = Infinity;

      for (let enemyIndex = game.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = game.enemies[enemyIndex];
        const enemyHeight = enemy.type === "soldier" ? 1.2 : enemy.type === "dog" ? 0.6 : 2.4;
        const hitRadiusSq = enemy.type === "boss" ? 5.2 : enemy.type === "skeleton" ? 2.2 : 1.0;
        _enemyCenterVec.set(
          enemy.group.position.x,
          enemy.group.position.y + enemyHeight,
          enemy.group.position.z,
        );
        const d2 = distanceSqPointToSegment(_enemyCenterVec, bullet.prevPos, position);
        if (d2 < hitRadiusSq && d2 < hitDist2) {
          hitDist2  = d2;
          hitEnemy  = enemy;
        }
      }

      if (hitEnemy !== null) {
        _hitPosVec.copy(position);
        processHit?.(hitEnemy, bulletDamageAtDistance(bullet), _hitPosVec);
        shouldRemove = true;
        if (bullet.splashRadius > 0) {
          spawnParticles(position, 72, 0xff6600, 30, true);
          applySplashDamage(bullet, position, processHit, hitEnemy);
        }
      }
    }

    if (!shouldRemove && bullet.isPlayer && (game.mode === "PVP" || game.mode === "FFA")
      && bullet.shooterId === game.socket?.id && !bullet.fromRemote) {
      const prevXZ = new THREE.Vector3(bullet.prevPos.x, 0, bullet.prevPos.z);
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
        const bulletYAtClosest = bullet.prevPos.y + (position.y - bullet.prevPos.y) * t;
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
      // Check local player
      const playerGroup = game.visuals.player.playerGroup;
      const playerCenter = new THREE.Vector3(
        playerGroup.position.x,
        playerGroup.position.y + 1.2,
        playerGroup.position.z,
      );

      if (distanceSqPointToSegment(playerCenter, bullet.prevPos, position) < 1.1) {
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
  // Crosshair hit flash
  const dot = game.dom?.crosshair?.querySelector("#crosshair-dot");
  if (dot) {
    dot.classList.remove("hit");
    void dot.offsetWidth;
    dot.classList.add("hit");
  }
  // Local audio + particles for instant feedback.
  game.audio.hit();
  spawnParticles(particlePosition, 5, 0xff6622, 4);
  game.stats.shotsHit += 1;
  // Cap by enemy.hp so we record actual damage dealt, not overkill damage.
  game.stats.damageDealt += Math.min(damage, Math.max(0, enemy.hp));

  // Knockback: push enemy away from the player on every hit so melee enemies
  // can't immediately follow up. Boss doesn't get pushed (too heavy).
  if (enemy.type !== "boss") {
    const playerPos = game.visuals?.player?.playerGroup?.position;
    if (playerPos) {
      const dx = enemy.group.position.x - playerPos.x;
      const dz = enemy.group.position.z - playerPos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      // Sword hits punch harder; bullets just nudge slightly
      const force = game.currentWeapon === "sword" ? 2.5 : 0.8;
      enemy.group.position.x += (dx / len) * force;
      enemy.group.position.z += (dz / len) * force;
      enemy.serverX = enemy.group.position.x;
      enemy.serverZ = enemy.group.position.z;
      game.socket?.emit("grappleEnemy", {
        enemyId: enemy.id,
        x: enemy.serverX, y: enemy.group.position.y, z: enemy.serverZ,
        weapon: game.currentWeapon,
      });
    }
  }

  // Server is now authoritative: report the hit. Server validates weapon restriction,
  // applies damage, awards kill credit, and drops health packs.
  game.socket?.emit("bulletHit", {
    enemyId: enemy.id,
    damage,
    weapon: game.currentWeapon,
  });
}

const MAX_PARTICLES = 200;

export function spawnParticles(position, count, color, speed, big = false) {
  if (!game.particlesEnabled) return; // graphics quality setting
  // Drop oldest particles if we're at the cap to prevent mass-death frame spikes.
  while (game.particles.length + count > MAX_PARTICLES && game.particles.length > 0) {
    const old = game.particles.shift();
    game.scene.remove(old.mesh);
    old.mesh.geometry.dispose();
    old.mesh.material.dispose();
  }
  const geo = (big && game.shared.bigPartGeo) ? game.shared.bigPartGeo : game.shared.partGeo;
  for (let index = 0; index < count; index += 1) {
    const mesh = new THREE.Mesh(
      geo,
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

// Check if a world position is near any alive destructible prop.
function findNearbyDestructible(x, z) {
  for (const d of game.destructibles) {
    if (!d.alive) continue;
    const dx = d.x - x, dz = d.z - z;
    if (dx * dx + dz * dz < d.triggerRadius * d.triggerRadius) return d;
  }
  return null;
}

// Destroy a destructible prop: big particle burst, AOE enemy damage, remove mesh + collision.
export function triggerDestructible(propId, origin, processHit) {
  const d = game.destructibles.find((p) => p.id === propId && p.alive);
  if (!d) return;
  d.alive = false;
  // Remove mesh from scene
  if (d.mesh?.parent) d.mesh.parent.remove(d.mesh);
  // Deactivate collision entry (push it out of reach)
  if (d.obsEntry) { d.obsEntry.h = -9999; }
  // Big explosion particles — 3× size cubes for dramatic barrel explosions
  spawnParticles(origin, 32, 0xff5500, 14, true);
  spawnParticles(origin, 16, 0xffcc00, 8, true);
  // AOE damage to enemies within 7 units
  for (const enemy of game.enemies) {
    const dx = enemy.group.position.x - origin.x;
    const dz = enemy.group.position.z - origin.z;
    const distSq = dx * dx + dz * dz;
    const aoeSq = 7 * 7;
    if (distSq < aoeSq) {
      const dmg = Math.round(200 * (1 - Math.sqrt(distSq) / 7));
      if (dmg > 0) processHit?.(enemy, dmg, origin.clone());
    }
  }
  // Broadcast destruction so all clients see it
  if (game.socket && game.isHost) {
    game.socket.emit("propDestroyed", { propId, x: origin.x, y: origin.y, z: origin.z });
  }
}

function applySplashDamage(bullet, origin, processHit, directHitEnemy = null) {
  const r = bullet.splashRadius;
  const rSq = r * r;
  for (const enemy of game.enemies) {
    if (enemy === directHitEnemy) continue; // direct hit already processed
    const dx = enemy.group.position.x - origin.x;
    const dz = enemy.group.position.z - origin.z;
    const distSq = dx * dx + dz * dz;
    if (distSq >= rSq) continue;
    const frac = 1 - Math.sqrt(distSq) / r; // 1 at centre, 0 at edge
    const dmg = Math.round(bullet.splashDamage * frac);
    if (dmg > 0) processHit?.(enemy, dmg, origin.clone());
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

    // Server validates and broadcasts removal; all clients use the same path.
    game.socket?.emit("pickupHealthPack", { packId: pack.id });
    break;
  }
}

export function resetCombatState() {
  game.currentWeapon = DEFAULT_WEAPON;
  syncCurrentAmmo();
  applyWeaponModel();
  // Clear wall decals on new round
  for (const d of _decals) { game.scene?.remove(d); d.material?.dispose(); }
  _decals.length = 0;
}

// ── Weapon Drop Pickups ───────────────────────────────────────────────────────

const WEAPON_DROP_PATHS = {
  pistol:  '/assets/models/Pistol.glb',
  assault: '/assets/models/Assault%20Rifle.glb',
  shotgun: '/assets/models/Shotgun.glb',
  sniper:  '/assets/models/Sniper%20Rifle.glb',
  sword:   '/assets/models/Katana.glb',
  grapple: '/assets/models/Lure.glb',
  bazooka: '/assets/models/Bazooka.glb',
};

const WEAPON_DROP_SCALES = {
  pistol: 0.8, assault: 0.8, shotgun: 0.7, sniper: 0.7,
  sword: 0.9, grapple: 0.8, bazooka: 0.7,
};

function applyGlbToPickup(pickup, gltf) {
  if (pickup.collected || pickup.glbLoaded) return;
  const model = gltf.scene.clone(true);
  model.scale.setScalar(WEAPON_DROP_SCALES[pickup.weaponId] ?? 0.8);
  model.traverse((n) => { if (n.isMesh) n.castShadow = true; });
  pickup.group.add(model);
  pickup.glbLoaded = true;
}

export function spawnWeaponPickupVisual(id, weaponId, position) {
  const group = new THREE.Group();
  group.position.set(position.x, 1.0, position.z);
  game.scene.add(group);

  // Horizontal glow ring — MeshBasicMaterial so always visible regardless of lighting
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.07, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffee00 }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // Bright glowing sphere in the centre so it's visible from any angle
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  group.add(glow);

  const pickup = {
    id, weaponId, group,
    pos: new THREE.Vector3(position.x, 0, position.z),
    bobT: Math.random() * Math.PI * 2,
    glbLoaded: false,
    collected: false,
  };
  game.weaponPickups.push(pickup);

  // Use GLB if already preloaded in game.shared (see scene.js buildSharedRuntimeAssets)
  const cached = game.shared?.weaponDropGltfs?.[weaponId];
  if (cached) {
    applyGlbToPickup(pickup, cached);
  } else {
    // Load on demand using static GLTFLoader (importmap-safe, no dynamic import)
    const path = WEAPON_DROP_PATHS[weaponId];
    if (path) {
      new GLTFLoader().load(path, (gltf) => {
        if (!game.shared.weaponDropGltfs) game.shared.weaponDropGltfs = {};
        game.shared.weaponDropGltfs[weaponId] = gltf;
        applyGlbToPickup(pickup, gltf);
      });
    }
  }
}

export function updateWeaponPickups(updateHUD) {
  const playerGroup = game.visuals.player.playerGroup;
  const ePressed = game.keys['KeyE'];

  for (let i = game.weaponPickups.length - 1; i >= 0; i--) {
    const pickup = game.weaponPickups[i];
    pickup.bobT += game.dt * 1.8;
    pickup.group.position.y = 1.2 + Math.sin(pickup.bobT) * 0.18;
    pickup.group.rotation.y += game.dt * 1.2;

    if (!game.localPlayerIsAlive || game.localPlayerIsDowned) continue;

    const dx = playerGroup.position.x - pickup.pos.x;
    const dz = playerGroup.position.z - pickup.pos.z;
    const distSq = dx * dx + dz * dz;

    if (distSq < 4) {
      // Show prompt overlay (simple approach: use existing HUD element)
      if (!pickup._promptVisible) {
        pickup._promptVisible = true;
        showWeaponPickupPrompt(pickup.weaponId, true);
      }
      if (ePressed && !pickup._eWasDown) {
        pickup._eWasDown = true;
        // Emit to server to remove drop for everyone; on removal we collect locally
        game.socket?.emit('pickupWeaponDrop', { dropId: pickup.id });
      } else if (!ePressed) {
        pickup._eWasDown = false;
      }
    } else {
      if (pickup._promptVisible) {
        pickup._promptVisible = false;
        showWeaponPickupPrompt(pickup.weaponId, false);
      }
    }
  }
}

let _pickupPromptEl = null;
function showWeaponPickupPrompt(weaponId, show) {
  if (!_pickupPromptEl) {
    _pickupPromptEl = document.getElementById('weapon-pickup-prompt');
  }
  if (!_pickupPromptEl) return;
  _pickupPromptEl.textContent = show ? `Press E to pick up ${weaponId.toUpperCase()}` : '';
  _pickupPromptEl.style.display = show ? 'block' : 'none';
}

export function removeWeaponPickup(id) {
  const idx = game.weaponPickups.findIndex(p => p.id === id);
  if (idx === -1) return;
  const pickup = game.weaponPickups[idx];
  pickup.collected = true;
  pickup._promptVisible = false;
  showWeaponPickupPrompt(pickup.weaponId, false);
  game.scene.remove(pickup.group);
  disposeObject3D(pickup.group);
  game.weaponPickups.splice(idx, 1);
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
