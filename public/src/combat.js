import * as THREE from "three";

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { B_SPD_E, DEFAULT_WEAPON, P_MAX_HP, WEAPON_DEFS, WEAPON_ORDER } from "./config.js";
import { game } from "./state.js";
import { bulletHitObstacle } from "./collision.js";
import { applyWeaponModel } from "./scene.js";
import { disposeObject3D } from "./utils.js";

export function getWeapon() {
  return WEAPON_DEFS[game.currentWeapon];
}

// ── Floating damage numbers ────────────────────────────────────────────────
// Spawned when the local player damages an enemy. Sprite drawn from a 2D
// canvas so it always faces the camera; floats up and fades out over ~0.85s.
const _damageNumbers = [];
const MAX_DAMAGE_NUMBERS = 24;

function makeDamageNumberSprite(damage, isBig) {
  const canvas = document.createElement("canvas");
  canvas.width  = 96;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  ctx.font = `bold ${isBig ? 32 : 26}px Rajdhani, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle   = isBig ? "#ffd33d" : "#ffffff";
  const text = String(Math.round(damage));
  ctx.strokeText(text, 48, 24);
  ctx.fillText(text, 48, 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.4, 0.7, 1);
  return sprite;
}

export function spawnDamageNumber(position, damage) {
  if (!game.scene || damage <= 0) return;
  if (!game.damageNumbersEnabled) return; // disabled in settings
  // Trim oldest to keep frame-time bounded
  while (_damageNumbers.length >= MAX_DAMAGE_NUMBERS) {
    const old = _damageNumbers.shift();
    game.scene.remove(old.sprite);
    old.sprite.material.map?.dispose();
    old.sprite.material.dispose();
  }
  const isBig = damage >= 80; // crit-feeling threshold
  const sprite = makeDamageNumberSprite(damage, isBig);
  sprite.position.set(
    position.x + (Math.random() - 0.5) * 0.4,
    position.y + 1.7,
    position.z + (Math.random() - 0.5) * 0.4,
  );
  game.scene.add(sprite);
  _damageNumbers.push({ sprite, age: 0, life: 0.85, vy: 1.6 });
}

export function tickDamageNumbers(dt) {
  for (let i = _damageNumbers.length - 1; i >= 0; i -= 1) {
    const dn = _damageNumbers[i];
    dn.age += dt;
    if (dn.age >= dn.life) {
      game.scene.remove(dn.sprite);
      dn.sprite.material.map?.dispose();
      dn.sprite.material.dispose();
      _damageNumbers.splice(i, 1);
      continue;
    }
    dn.sprite.position.y += dn.vy * dt;
    dn.vy *= 0.94; // ease out
    dn.sprite.material.opacity = 1 - dn.age / dn.life;
  }
}

// ── Bullet-hole decals using DecalGeometry ────────────────────────────────────
const _decals      = [];
const MAX_DECALS   = 60;
const _bhRaycaster = new THREE.Raycaster();
const _bhSize      = new THREE.Vector3();
const _bhOrientation = new THREE.Euler();
const _bhNormalMatrix = new THREE.Matrix3();

const _bhTex = new THREE.TextureLoader().load("/assets/Images/bullet-holes.png");
_bhTex.colorSpace = THREE.SRGBColorSpace;

const _bhMaterial = new THREE.MeshStandardMaterial({
  map: _bhTex,
  transparent: true,
  depthTest: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  roughness: 0.8,
});

const _bhOrigin = new THREE.Vector3();

function spawnBulletHole(prevPos, dir, stepDist) {
  if (!game.scene || !game.arenaGroup) return;

  // Back the origin up half a unit so it starts outside the surface even if
  // prevPos landed exactly on (or just inside) the wall due to float imprecision.
  _bhOrigin.copy(prevPos).addScaledVector(dir, -0.5);
  _bhRaycaster.set(_bhOrigin, dir);
  _bhRaycaster.far = stepDist + 1.5;
  const hits = _bhRaycaster.intersectObject(game.arenaGroup, true);

  // Find first hit that is a static mesh (skip SkinnedMesh — bind-pose vertices misalign with animated pose)
  const hit = hits.find(h => h.object.isMesh && !h.object.isSkinnedMesh && h.face);
  if (!hit) return;

  const targetMesh = hit.object;

  // Surface-specific impact particles
  if (game.particlesEnabled) {
    const mat = targetMesh.material;
    let pColor = 0xbbbbbb;
    if (mat?.color) {
      const { r, g } = mat.color;
      if (r > 0.55 && r > g * 1.25) pColor = 0xd4a06a; // warm/sandy
      else if (r < 0.18 && g < 0.25) pColor = 0x4a6070; // dark blacksite
    }
    spawnParticles(hit.point.clone(), 5, pColor, 2.2, false, 12);
  }

  // Transform face normal to world space
  _bhNormalMatrix.getNormalMatrix(targetMesh.matrixWorld);
  const worldNormal = hit.face.normal.clone().applyNormalMatrix(_bhNormalMatrix).normalize();

  // Orient a dummy along the surface normal, then spin around the local projection axis
  const dummy = new THREE.Object3D();
  dummy.position.copy(hit.point);
  dummy.lookAt(hit.point.clone().add(worldNormal));
  dummy.rotateZ(Math.random() * Math.PI * 2);
  _bhOrientation.copy(dummy.rotation);

  const scale = 0.28 + Math.random() * 0.20;
  _bhSize.set(scale, scale, scale);

  let geom;
  try {
    geom = new DecalGeometry(targetMesh, hit.point, _bhOrientation, _bhSize);
  } catch {
    return; // non-indexed geometry — skip silently
  }

  const decal = new THREE.Mesh(geom, _bhMaterial);
  decal.renderOrder = 3 + (_decals.length % 60);
  targetMesh.attach(decal);
  _decals.push(decal);
  game.audio?.wallImpact?.();

  if (_decals.length > MAX_DECALS) {
    const old = _decals.shift();
    old.parent?.remove(old);
    old.geometry.dispose();
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

export function cycleWeaponBack() {
  const available = game.mode === 'COOP'
    ? WEAPON_ORDER.filter(id => game.collectedWeapons?.has(id))
    : WEAPON_ORDER;
  const index = available.indexOf(game.currentWeapon);
  return setWeapon(available[(index - 1 + available.length) % available.length]);
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
      if (bullet.splashRadius > 0) spawnParticles(position, 72, 0xff6600, 30, true);
      // Bullet hole decal on the wall/floor surface
      if (!bullet.splashRadius && bullet.isPlayer) spawnBulletHole(bullet.prevPos, bullet.dir, step);
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
        const enemyHeight =
          enemy.type === "soldier" ? 1.2 :
          enemy.type === "dog" ? 0.6 :
          enemy.type === "miniboss" ? 1.15 :
          2.4;
        const hitRadiusSq =
          enemy.type === "boss" ? 5.2 :
          enemy.type === "miniboss" ? 1.6 :
          enemy.type === "skeleton" ? 2.2 :
          1.0;
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
  // Kill slow-mo: brief world time-scale dip on the killing blow
  if (damage >= (enemy.hp || 0) && (enemy.hp || 0) > 0) {
    game.killSlowTmr = 0.12;
  }

  // Local audio + particles for instant feedback.
  game.audio.hit();
  game.audio.enemyHit(enemy.type);
  spawnParticles(particlePosition, 5, 0xff6622, 4);
  spawnDamageNumber(enemy.group.position, Math.min(damage, Math.max(0, enemy.hp || damage)));
  game.stats.shotsHit += 1;
  // Cap by enemy.hp so we record actual damage dealt, not overkill damage.
  game.stats.damageDealt += Math.min(damage, Math.max(0, enemy.hp));

  // Knockback: push enemy away from player. Boss gets a small nudge only from bazooka.
  const isBoss = enemy.type === "boss";
  const isBazooka = game.currentWeapon === "bazooka";
  if (!isBoss || isBazooka) {
    const playerPos = game.visuals?.player?.playerGroup?.position;
    if (playerPos) {
      const dx = enemy.group.position.x - playerPos.x;
      const dz = enemy.group.position.z - playerPos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const force = isBoss ? 0.4 : game.currentWeapon === "sword" ? 2.5 : 0.8;
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

// ── Bullet tracers ────────────────────────────────────────────────────────────
const _tracers = [];

export function spawnTracer(position, direction) {
  if (!game.scene || !game.particlesEnabled) return;
  const end = position.clone().addScaledVector(direction, 16);
  const geo = new THREE.BufferGeometry().setFromPoints([position.clone(), end]);
  const mat = new THREE.LineBasicMaterial({ color: 0xfff6aa, transparent: true, opacity: 0.65 });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  game.scene.add(line);
  _tracers.push({ line, mat, life: 0.06, maxLife: 0.06 });
}

export function updateTracers() {
  for (let i = _tracers.length - 1; i >= 0; i--) {
    const t = _tracers[i];
    t.life -= game.dt;
    t.mat.opacity = Math.max(0, (t.life / t.maxLife) * 0.65);
    if (t.life <= 0) {
      game.scene.remove(t.line);
      t.line.geometry.dispose();
      t.mat.dispose();
      _tracers.splice(i, 1);
    }
  }
}

// ── Shell ejection ────────────────────────────────────────────────────────────
const _shells = [];
const _shellGeo = new THREE.BoxGeometry(0.05, 0.018, 0.018);

export function spawnShell(position, rightVec) {
  if (!game.scene || !game.particlesEnabled) return;
  const mat = new THREE.MeshStandardMaterial({ color: 0xcc9922, roughness: 0.35, metalness: 0.85, transparent: true });
  const mesh = new THREE.Mesh(_shellGeo, mat);
  mesh.position.copy(position);
  const spd = 2.5 + Math.random() * 1.5;
  game.scene.add(mesh);
  _shells.push({
    mesh, mat,
    vx: rightVec.x * spd + (Math.random() - 0.5),
    vy: 1.8 + Math.random() * 1.4,
    vz: rightVec.z * spd + (Math.random() - 0.5),
    rx: (Math.random() - 0.5) * 20,
    rz: (Math.random() - 0.5) * 20,
    bounced: false,
    life: 2.2 + Math.random() * 0.6,
    maxLife: 2.8,
  });
}

export function updateShells() {
  for (let i = _shells.length - 1; i >= 0; i--) {
    const s = _shells[i];
    s.vy -= 18 * game.dt;
    s.mesh.position.x += s.vx * game.dt;
    s.mesh.position.y += s.vy * game.dt;
    s.mesh.position.z += s.vz * game.dt;
    s.mesh.rotation.x += s.rx * game.dt;
    s.mesh.rotation.z += s.rz * game.dt;

    if (!s.bounced && s.mesh.position.y <= 0.02) {
      s.mesh.position.y = 0.02;
      s.vy = Math.abs(s.vy) * 0.35;
      s.vx *= 0.55; s.vz *= 0.55;
      s.bounced = true;
    }

    s.life -= game.dt;
    if (s.life < 0.5) s.mat.opacity = s.life / 0.5;
    if (s.life <= 0) {
      game.scene.remove(s.mesh);
      s.mat.dispose();
      _shells.splice(i, 1);
    }
  }
}

const MAX_PARTICLES = 200;

export function spawnParticles(position, count, color, speed, big = false, gravity = 20) {
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
      gravity,
    };
    particle.maxLife = particle.life;
    game.particles.push(particle);
  }
}

// Muzzle smoke: tiny particles, purely horizontal drift, no vertical movement.
export function spawnSmoke(position, count) {
  if (!game.particlesEnabled || !game.shared?.smokeGeo) return;
  while (game.particles.length + count > MAX_PARTICLES && game.particles.length > 0) {
    const old = game.particles.shift();
    game.scene.remove(old.mesh);
    old.mesh.geometry.dispose();
    old.mesh.material.dispose();
  }
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(game.shared.smokeGeo, new THREE.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true }));
    mesh.position.copy(position);
    game.scene.add(mesh);
    const spd = 0.4 + Math.random() * 0.5;
    const angle = Math.random() * Math.PI * 2;
    const particle = {
      mesh, vx: Math.cos(angle) * spd, vy: 0, vz: Math.sin(angle) * spd,
      life: 0.35 + Math.random() * 0.25, maxLife: 0.6,
      rx: 0, rz: 0, gravity: 0,
    };
    particle.maxLife = particle.life;
    game.particles.push(particle);
  }
}

export function updateParticles() {
  for (let index = game.particles.length - 1; index >= 0; index -= 1) {
    const particle = game.particles[index];
    particle.vy -= (particle.gravity ?? 20) * game.dt;
    particle.mesh.position.x += particle.vx * game.dt;
    particle.mesh.position.y += particle.vy * game.dt;
    particle.mesh.position.z += particle.vz * game.dt;
    particle.mesh.rotation.x += particle.rx * game.dt;
    particle.mesh.rotation.z += particle.rz * game.dt;

    if ((particle.gravity ?? 20) > 0 && particle.mesh.position.y < 0.06) {
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
  game.audio?.propBreak?.();
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
  const hits = [];

  for (const enemy of game.enemies) {
    if (enemy === directHitEnemy) continue;
    const dx = enemy.group.position.x - origin.x;
    const dz = enemy.group.position.z - origin.z;
    const distSq = dx * dx + dz * dz;
    if (distSq >= rSq) continue;
    const frac = 1 - Math.sqrt(distSq) / r;
    const dmg = Math.round(bullet.splashDamage * frac);
    if (dmg <= 0) continue;

    // Local feedback per splash enemy (lighter than processHit — no hit-marker spam)
    spawnParticles(origin, 3, 0xff6622, 4);
    spawnDamageNumber(enemy.group.position, Math.min(dmg, Math.max(0, enemy.hp)));
    game.stats.shotsHit += 1;
    game.stats.damageDealt += Math.min(dmg, Math.max(0, enemy.hp));

    hits.push({ enemyId: enemy.id, damage: dmg });
  }

  // Send all splash hits in one event so the per-bullet rate limit doesn't drop them
  if (hits.length > 0) {
    game.socket?.emit('splashHit', { hits, weapon: game.currentWeapon });
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
    game.audio?.healthPickup?.();
    game.socket?.emit("pickupHealthPack", { packId: pack.id });
    break;
  }
}

export function resetCombatState() {
  game.currentWeapon = DEFAULT_WEAPON;
  syncCurrentAmmo();
  applyWeaponModel();
  // Clear bullet hole decals
  for (const d of _decals) { d.parent?.remove(d); d.geometry.dispose(); }
  _decals.length = 0;
  // Clear any leftover floating damage numbers from the previous match
  for (const dn of _damageNumbers) {
    game.scene?.remove(dn.sprite);
    dn.sprite.material.map?.dispose();
    dn.sprite.material.dispose();
  }
  _damageNumbers.length = 0;
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
  _pickupPromptEl.textContent = show ? `Press E / B to pick up ${weaponId.toUpperCase()}` : '';
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
