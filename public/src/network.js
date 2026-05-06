import * as THREE from "three";

import { P_MAX_HP, WEAPON_ORDER, WEAPON_DEFS, PVP_KILLS_PER_WEAPON } from "./config.js";
import { game } from "./state.js";
import { setWeapon, spawnBullet, spawnHealthPackVisual, spawnParticles, triggerDestructible } from "./combat.js";
import { announceWave, createBoss, createDog, createSkeleton, createSoldier, handleEnemyDamaged, removeEnemy } from "./enemies.js";
import { applyCharacterHead, createRemotePlayer, removeRemotePlayer, updateRemotePlayerNametag } from "./scene.js";
import { setJoinLinkState, syncMapCards, updateLobbyUI, showTeammateDownAlert, showPvPRankings, showWeaponUnlockAlert, pushKillFeed, showWaveClear, showScorePopup } from "./ui.js";

function recordDamageAngle(sourceX, sourceZ) {
  const playerPos = game.visuals?.player?.playerGroup?.position;
  if (!playerPos) return;
  const dx = sourceX - playerPos.x;
  const dz = sourceZ - playerPos.z;
  const cos = Math.cos(-game.camTheta);
  const sin = Math.sin(-game.camTheta);
  const screenX = dx * cos - dz * sin;
  const screenZ = dx * sin + dz * cos;
  game.lastDamageAngle = Math.atan2(screenX, -screenZ) * 180 / Math.PI;
  const el = game.dom?.dmgDir;
  if (el) {
    el.style.transform = `translate(-50%, -50%) rotate(${game.lastDamageAngle}deg)`;
    el.classList.remove("hit");
    void el.offsetWidth;
    el.classList.add("hit");
  }
}

export function initNetworking(actions) {
  if (game.socket) {
    return;
  }

  game.socket = window.io();
  game.socket.emit("playerNameUpdate", { playerName: "" });

  // Retrieve or create a persistent session token stored in localStorage.
  // This is a unique identifier that survives page refreshes and lets the server
  // restore mid-game state after a brief disconnection, without relying on playerName.
  let sessionToken = null;
  try {
    sessionToken = localStorage.getItem("arena_session_token");
    if (!sessionToken) {
      sessionToken = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem("arena_session_token", sessionToken);
    }
  } catch { /* localStorage unavailable (private browsing etc.) — use in-memory only */ }
  game.sessionToken = sessionToken;

  // On connect/reconnect: register the token and attempt state restore if mid-game.
  game.socket.on("connect", () => {
    if (sessionToken) game.socket.emit("registerToken", { token: sessionToken });
    if (game.state === "PLAYING" && sessionToken) {
      game.socket.emit("rejoin", { token: sessionToken });
    }
  });

  // Room lock status — show password prompt to non-hosts if room is locked.
  game.socket.on("roomInfo", (data) => {
    game.roomLocked = !!data?.locked;
    if (game.roomLocked && !game.isHost) {
      const overlay = game.dom?.passwordOverlay;
      if (overlay) { overlay.style.display = "flex"; }
    }
  });

  game.socket.on("passwordResult", (data) => {
    if (data?.ok) {
      const overlay = game.dom?.passwordOverlay;
      if (overlay) overlay.style.display = "none";
    } else {
      const errEl = game.dom?.passwordError;
      if (errEl) { errEl.style.display = "block"; setTimeout(() => { errEl.style.display = "none"; }, 2500); }
    }
  });

  game.socket.on("serverMessage", (data) => {
    if (data?.level === "error") console.warn("[Server]", data.text);
  });

  game.socket.on("stateRestored", (data) => {
    if (typeof data.wave === "number") game.wave = data.wave;
    if (typeof data.hp === "number") game.hp = data.hp;
    if (typeof data.isAlive === "boolean") game.localPlayerIsAlive = data.isAlive;
    if (typeof data.isDowned === "boolean") game.localPlayerIsDowned = data.isDowned;
    if (data.currentWeapon) setWeapon(data.currentWeapon);
    actions.updateHUD();
  });

  game.socket.on("serverInfo", (info) => {
    setJoinLinkState({
      canCopyJoinLink: info?.isServerPc,
      joinLink: info?.joinLink,
      clientIp: info?.clientIp,
    });
  });

  game.socket.on("currentPlayers", (players) => {
    updateLobbyUI(players);
    Object.entries(players).forEach(([id, player]) => {
      if (id !== game.socket.id) {
        createRemotePlayer(id, player);
      }
    });
  });

  game.socket.on("updateLobby", (players) => {
    Object.entries(players).forEach(([id, player]) => {
      if (id === game.socket.id) {
        return;
      }
      const remote = createRemotePlayer(id, player);
      const oldPlayerName = remote.playerName;
      remote.playerName = player.playerName || remote.playerName;
      if (remote.playerName !== oldPlayerName) {
        updateRemotePlayerNametag(remote, remote.playerName);
      }
      remote.isAlive = player.isAlive ?? remote.isAlive;
      remote.isDowned = player.isDowned ?? remote.isDowned;
      remote.isSpectating = player.isSpectating ?? remote.isSpectating;
      remote.score = player.score ?? remote.score;
      remote.kills = player.kills ?? remote.kills;
      remote.dogKills = player.dogKills ?? remote.dogKills;
      remote.bossKills = player.bossKills ?? remote.bossKills;
      remote.totalKills = player.totalKills ?? remote.totalKills;
      remote.wave = player.wave ?? remote.wave;
      if (player.character && player.character !== remote.character) {
        remote.character = player.character;
        if (remote.headGroup) {
          applyCharacterHead(remote.headGroup, player.character, { visor: remote.visor });
        }
      }
    });
    updateLobbyUI(players);
  });

  game.socket.on("mapSelected", (data) => {
    if (!data?.map) return;
    game.selectedMap = data.map;
    syncMapCards(data.map);
    // Show non-host players what the host picked.
    if (!game.isHost && game.dom.mapChosenLabel) {
      game.dom.mapChosenLabel.textContent = `HOST CHOSE: ${(data.map).toUpperCase()}`;
    }
  });

  game.socket.on("matchStarted", (payload) => {
    const mode = payload?.mode || "COOP";
    if (payload?.map) game.selectedMap = payload.map;
    if (mode === "PVP") {
      game.pvpSpawnAssignments = payload?.spawnAssignments || {};
      actions.startPvPGame();
    } else {
      actions.startGame();
    }
    actions.tryPointerLock();
  });

  game.socket.on("newPlayer", (playerInfo) => {
    createRemotePlayer(playerInfo.playerId, playerInfo);
  });

  game.socket.on("newHost", (id) => {
    if (game.socket.id === id) {
      game.isHost = true;
    }
  });

  game.socket.on("syncWave", (data) => {
    const prevWave = game.wave;
    const prevState = game.waveState;
    game.wave = data.wave;
    game.waveState = data.state;
    game.waveTmr = data.tmr;
    if (data.state === "SPAWNING" && prevState !== "SPAWNING") {
      game.waveSpawnedTotal = 0;
    }
    if (data.wave > prevWave) {
      announceWave();
    }
    // Show wave-clear banner when wave ends (state transitions from ACTIVE → WAIT).
    if (prevState === "ACTIVE" && data.state === "WAIT" && prevWave > 0) {
      showWaveClear(prevWave);
      pushKillFeed(`WAVE ${prevWave} CLEARED`, "wave-start");
    }
    actions.updateHUD();
  });

  game.socket.on("pauseState", (data) => {
    game.worldPaused = !!data?.paused;
  });

  game.socket.on("invincibilityChanged", (data) => {
    game.invincibilityMode = !!data?.enabled;
    if (game.dom?.invincibilityToggle) {
      game.dom.invincibilityToggle.checked = game.invincibilityMode;
    }
  });

  game.socket.on("enemyDamaged", (data) => {
    handleEnemyDamaged(data);
  });

  game.socket.on("enemyPulled", (data) => {
    if (!data || typeof data.id !== "string") return;
    const enemy = game.enemies.find((entry) => entry.id === data.id);
    if (!enemy) return;
    if (typeof data.x === "number") enemy.group.position.x = data.x;
    if (typeof data.y === "number") enemy.group.position.y = data.y;
    if (typeof data.z === "number") enemy.group.position.z = data.z;
    enemy.serverX = data.x;
    enemy.serverY = data.y;
    enemy.serverZ = data.z;
  });

  game.socket.on("enemyMeleeAttempt", (data) => {
    if (!data || data.targetId !== game.socket.id || !game.localPlayerIsAlive || game.localPlayerIsDowned) {
      return;
    }
    if (game.mode === "COOP" && game.invincibilityMode) {
      return;
    }

    const enemy = game.enemies.find((entry) => entry.id === data.enemyId);
    const enemyType = enemy?.type || data.enemyType || "skeleton";
    const enemyReach = enemyType === "boss" ? 7.8 : enemyType === "dog" ? 2.5 : 2.0;
    const enemyHeight = enemyType === "boss" ? 4.8 : enemyType === "dog" ? 1.0 : 1.35;
    const enemyX = typeof data.ex === "number" ? data.ex : enemy?.group.position.x;
    const enemyY = typeof data.ey === "number" ? data.ey : enemy?.group.position.y;
    const enemyZ = typeof data.ez === "number" ? data.ez : enemy?.group.position.z;

    if (typeof enemyX !== "number" || typeof enemyY !== "number" || typeof enemyZ !== "number") {
      return;
    }

    const playerPos = game.visuals.player.playerGroup.position;
    const dx = enemyX - playerPos.x;
    const dz = enemyZ - playerPos.z;
    if (dx * dx + dz * dz > enemyReach * enemyReach) return;
    if (Math.abs(enemyY - playerPos.y) > enemyHeight) return;

    game.hp = Math.max(0, game.hp - data.damage);
    game.audio.damage();
    actions.showDamage();
    actions.addShake(0.15);
    if (data.knockbackX || data.knockbackZ) {
      game.knockbackX = data.knockbackX;
      game.knockbackZ = data.knockbackZ;
    }
    recordDamageAngle(enemyX, enemyZ);
    if (data.enemyId) {
      game.lastDamageShooter = data.enemyId;
      game.lastDamageWeapon = "melee";
    }
    if (game.hp <= 0) {
      game.hp = 0;
      actions.playerDiedLocal();
    }
    actions.updateHUD();
  });

  game.socket.on("playerDamaged", (data) => {
    if (data.targetId !== game.socket.id || !game.localPlayerIsAlive || game.localPlayerIsDowned) {
      return;
    }
    if (game.mode === "COOP" && game.invincibilityMode) {
      return;
    }
    game.hp = Math.max(0, game.hp - data.damage);
    game.audio.damage();
    actions.showDamage();
    actions.addShake(0.15);
    if (data.knockbackX || data.knockbackZ) {
      game.knockbackX = data.knockbackX;
      game.knockbackZ = data.knockbackZ;
    }
    if (data.shooterId) {
      game.lastDamageShooter = data.shooterId;
      game.lastDamageWeapon = data.weapon || null;
      const shooter = game.enemies.find((e) => e.id === data.shooterId);
      if (shooter) recordDamageAngle(shooter.group.position.x, shooter.group.position.z);
    }
    if (game.hp <= 0) {
      game.hp = 0;
      actions.playerDiedLocal();
    }
    actions.updateHUD();
  });

  game.socket.on("enemiesSynced", (syncList) => {
    const serverIds = syncList.map((entry) => entry.id);
    for (let index = game.enemies.length - 1; index >= 0; index -= 1) {
      if (!serverIds.includes(game.enemies[index].id)) {
        removeEnemy(index);
      }
    }

    syncList.forEach((entry) => {
      let enemy = game.enemies.find((candidate) => candidate.id === entry.id);
      if (!enemy) {
        if (entry.type === "soldier") createSoldier(new THREE.Vector3(entry.x, entry.y, entry.z), entry.id);
        else if (entry.type === "dog") createDog(new THREE.Vector3(entry.x, entry.y, entry.z), entry.id);
        else if (entry.type === "skeleton") createSkeleton(new THREE.Vector3(entry.x, entry.y, entry.z), entry.id);
        else if (entry.type === "boss") createBoss(new THREE.Vector3(entry.x, entry.y, entry.z), entry.id);
        enemy = game.enemies[game.enemies.length - 1];
      }

      if (!enemy) {
        return;
      }

      // Store server positions for non-owned lerp; ownerId drives AI split.
      enemy.ownerId = entry.ownerId ?? null;
      // Only overwrite position with server data if this client doesn't own the enemy
      // (owner's Three.js simulation is the source of truth for position).
      if (entry.ownerId !== game.socket?.id) {
        enemy.serverX = entry.x;
        enemy.serverZ = entry.z;
        enemy.serverY = entry.y ?? 0;
        enemy.group.rotation.y = entry.rot;
        enemy.walkT = entry.walkT;
      }
      enemy.hp = entry.hp;
      if (entry.maxHp) enemy.maxHp = entry.maxHp;
    });
  });

  // Server spawns a new enemy — create the visual and stamp AI fields from server data.
  game.socket.on("enemySpawned", (data) => {
    if (game.enemies.find((e) => e.id === data.id)) return; // already exists
    game.waveSpawnedTotal += 1;
    let pos = new THREE.Vector3(data.x, 0, data.z);
    if (data.type === "soldier") createSoldier(pos, data.id);
    else if (data.type === "dog") createDog(pos, data.id);
    else if (data.type === "skeleton") createSkeleton(pos, data.id);
    else if (data.type === "boss") createBoss(pos, data.id);
    const enemy = game.enemies[game.enemies.length - 1];
    if (!enemy) return;
    // Stamp AI fields with server values so owned-client AI is accurate.
    if (typeof data.spd === "number") enemy.spd = data.spd;
    if (typeof data.fireInt === "number") enemy.fireInt = data.fireInt;
    if (typeof data.fireTmr === "number") enemy.fireTmr = data.fireTmr;
    if (typeof data.atkDmg === "number") enemy.atkDmg = data.atkDmg;
    if (typeof data.atkTmr === "number") enemy.atkTmr = data.atkTmr;
    enemy.ownerId = data.ownerId ?? null;
  });

  // Server reassigns enemy ownership (e.g. when a player dies/disconnects).
  game.socket.on("enemyOwnership", (changes) => {
    for (const { id, ownerId } of changes) {
      const enemy = game.enemies.find((e) => e.id === id);
      if (enemy) enemy.ownerId = ownerId;
    }
  });

  game.socket.on("playerMoved", (player) => {
    const remote = createRemotePlayer(player.playerId, player);
    remote.group.position.set(player.x, player.y, player.z);
    remote.group.rotation.y = player.rotation;
    remote.isAlive = player.isAlive ?? remote.isAlive;
    remote.isDowned = player.isDowned ?? remote.isDowned;
    remote.isSpectating = player.isSpectating ?? remote.isSpectating;
    remote.hp = player.hp ?? remote.hp;
    remote.score = player.score ?? remote.score;
    remote.kills = player.kills ?? remote.kills;
    const oldPlayerName = remote.playerName;
    remote.playerName = player.playerName || remote.playerName;
    if (remote.playerName !== oldPlayerName) {
      updateRemotePlayerNametag(remote, remote.playerName);
    }
    remote.dogKills = player.dogKills ?? remote.dogKills;
    remote.bossKills = player.bossKills ?? remote.bossKills;
    remote.totalKills = player.totalKills ?? remote.totalKills;
    remote.wave = player.wave ?? remote.wave;
    remote.stats = player.stats ?? remote.stats;
    remote.playerName = player.playerName || remote.playerName;
    if (typeof player.isCrouching === "boolean") remote.isCrouching = player.isCrouching;
    if (typeof player.isSprinting === "boolean") remote.isSprinting = player.isSprinting;
    if (typeof player.currentWeapon === "string" && player.currentWeapon !== remote.currentWeapon) {
      updateRemoteWeaponMesh(remote);
    }
    if (typeof player.swordSwing === "number") remote.swordSwingProgress = player.swordSwing;
    if (typeof player.pvpDying === "boolean") remote.pvpDying = player.pvpDying;
    if (player.character && player.character !== remote.character) {
      remote.character = player.character;
      if (remote.headGroup) {
        applyCharacterHead(remote.headGroup, player.character, { visor: remote.visor });
      }
    }
  });

  function updateRemoteWeaponMesh(remote) {
    if (!remote.remoteGun) return;
    remote.remoteGun.visible = remote.currentWeapon !== "sword";
    if (remote.swordMesh) {
      remote.swordMesh.visible = remote.currentWeapon === "sword";
    } else if (remote.currentWeapon === "sword") {
      const swordMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.2, metalness: 0.9, emissive: 0x223344, emissiveIntensity: 0.4 });
      const sword = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.14), swordMat);
      blade.position.y = 0.55;
      sword.add(blade);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.18), swordMat);
      sword.add(guard);
      sword.position.set(0.55, 1.2, -0.15);
      remote.group.add(sword);
      remote.swordMesh = sword;
      remote.swordMesh.visible = true;
    }

    // Scale gun box to suggest weapon type.
    if (remote.remoteGun.visible) {
      const w = remote.currentWeapon;
      if (w === "shotgun") remote.remoteGun.scale.set(1.15, 1.1, 0.85);
      else if (w === "sniper") remote.remoteGun.scale.set(0.9, 0.9, 1.9);
      else if (w === "assault") remote.remoteGun.scale.set(1.0, 1.0, 1.1);
      else remote.remoteGun.scale.set(0.75, 0.9, 0.75);
    }
  }

  game.socket.on("playerDisconnected", (id) => {
    removeRemotePlayer(id);
  });

  game.socket.on("playerDied", (data) => {
    const remote = game.remotePlayers[data.playerId];
    if (remote) {
      const isPvP = data.mode === "PVP";
      remote.isAlive = false;
      remote.isDowned = !isPvP;
      remote.isSpectating = false;
      remote.hp = 0;
      remote.stats = data.stats;
      remote.score = data.stats?.score || 0;
      remote.kills = data.stats?.kills || 0;
      remote.dogKills = data.stats?.dogKills || 0;
      remote.bossKills = data.stats?.bossKills || 0;
      remote.totalKills = data.stats?.totalKills || data.stats?.kills || 0;
      remote.wave = data.stats?.wave || remote.wave;
      if (!isPvP) {
        showTeammateDownAlert(remote.playerName);
      }
    }
  });

  game.socket.on("pvpKill", (data) => {
    if (!data) return;
    Object.entries(data.standings || {}).forEach(([id, s]) => {
      if (id === game.socket?.id) {
        game.pvpKills = s.pvpKills;
        game.pvpSwordKills = s.pvpSwordKills;
        const newIdx = s.pvpWeaponIdx;
        if (newIdx !== game.pvpWeaponIdx) {
          const prevIdx = game.pvpWeaponIdx;
          game.pvpWeaponIdx = newIdx;
          const newWeaponId = WEAPON_ORDER[newIdx];
          setWeapon(newWeaponId);
          if (newIdx > prevIdx) {
            const def = WEAPON_DEFS[newWeaponId];
            showWeaponUnlockAlert(def?.label || newWeaponId);
          }
        }
      } else if (game.remotePlayers[id]) {
        game.remotePlayers[id].pvpKills = s.pvpKills;
        game.remotePlayers[id].pvpSwordKills = s.pvpSwordKills;
        game.remotePlayers[id].pvpWeaponIdx = s.pvpWeaponIdx;
      }
    });
    actions.updateHUD();
  });

  game.socket.on("pvpMatchOver", (data) => {
    actions.pvpMatchOver(data);
  });

  game.socket.on("playerSpectating", (data) => {
    const remote = game.remotePlayers[data.playerId];
    if (remote) {
      remote.isAlive = false;
      remote.isDowned = false;
      remote.isSpectating = true;
      remote.stats = data.stats || remote.stats;
      remote.score = data.stats?.score || remote.score;
      remote.kills = data.stats?.kills || remote.kills;
      remote.dogKills = data.stats?.dogKills || remote.dogKills;
      remote.bossKills = data.stats?.bossKills || remote.bossKills;
      remote.totalKills = data.stats?.totalKills || remote.totalKills;
      remote.wave = data.stats?.wave || remote.wave;
    }
  });

  game.socket.on("playerRevived", (data) => {
    const remote = game.remotePlayers[data.playerId];
    if (remote) {
      remote.isAlive = true;
      remote.isDowned = false;
      remote.isSpectating = false;
    }
    if (data.playerId === game.socket.id && game.localPlayerIsDowned) {
      actions.revivePlayerLocal(false);
    }
  });

  game.socket.on("playerRespawned", (data) => {
    const remote = game.remotePlayers[data.playerId];
    if (remote) {
      remote.isAlive = true;
      remote.isDowned = false;
      remote.isSpectating = false;
    }
    if (data.playerId === game.socket.id) {
      actions.respawnPlayerLocal(false);
    }
  });

  game.socket.on("reviveProgress", (data) => {
    if (data.targetId !== game.socket.id || !game.localPlayerIsDowned) {
      return;
    }
    game.dom.reviveBarFill.style.width = `${data.progress * 100}%`;
    game.dom.revivePrompt.textContent = `Being revived by ${data.reviverName || "teammate"}...`;
  });

  game.socket.on("healthPackSpawned", (data) => {
    spawnHealthPackVisual(data.id, new THREE.Vector3(data.x, data.y, data.z));
  });

  game.socket.on("bulletFired", (data) => {
    // Visual-only bullet from another player's shot. We pass fromRemote=true so
    // the local client never runs hit detection on it — the shooter authoritative.
    spawnBullet(
      new THREE.Vector3(data.x, data.y, data.z),
      new THREE.Vector3(data.dx, data.dy, data.dz).normalize(),
      true,
      {
        spd: data.spd,
        life: data.life,
        damage: 0,
        shooterId: data.playerId,
        weapon: data.weapon,
      },
      true,
    );
  });

  game.socket.on("enemyBulletFired", (data) => {
    // Spawn with real damage and NOT fromRemote so each client runs its own
    // hit detection against their local player — visual and damage are then
    // perfectly in sync on every machine.
    spawnBullet(
      new THREE.Vector3(data.x, data.y, data.z),
      new THREE.Vector3(data.dx, data.dy, data.dz).normalize(),
      false,
      { damage: data.damage || 25, spd: data.spd, life: data.life },
      false,
    );
  });

  game.socket.on("healthPackRemoved", (data) => {
    const index = game.healthPacks.findIndex((pack) => pack.id === data.packId);
    if (index !== -1) {
      game.scene.remove(game.healthPacks[index].mesh);
      game.healthPacks.splice(index, 1);
    }

    if (data.playerId === game.socket.id) {
      game.hp = Math.min(game.effectiveMaxHP ?? P_MAX_HP, game.hp + 150);
      game.audio.reviveComplete();
      actions.updateHUD();
    }
  });

  game.socket.on("globalGameOver", (rankings) => {
    actions.gameOver(rankings);
  });

  // Server awards kill credit to the shooter
  game.socket.on("killCredit", (data) => {
    const typeLabel = data.type === "boss" ? "TITAN BRUTE" : data.type === "dog" ? "DOG" : data.type === "skeleton" ? "SKELETON" : "SOLDIER";
    pushKillFeed(`${game.playerName || "YOU"} → ${typeLabel} +${data.score}`, data.type === "boss" ? "boss-kill" : "");
    showScorePopup(data.score, data.type);
    if (data.type === "boss") {
      game.stats.bossKills += 1;
      game.score += data.score;
    } else if (data.type === "dog") {
      game.stats.dogKills += 1;
      game.score += data.score;
    } else {
      game.stats.kills += 1;
      game.score += data.score;
    }
    game.shakeAmt = Math.max(game.shakeAmt, 0.1);
    game.audio.death();
    actions.updateHUD();
  });

  // Server broadcasts enemy death for visual effects (particles etc.)
  game.socket.on("enemyKilled", (data) => {
    const color = data.type === "boss" ? 0xffd700
      : data.type === "dog" ? 0xff6600
      : data.type === "soldier" ? 0x880011
      : 0xeeeeee;
    const count = data.type === "boss" ? 40 : 18;
    spawnParticles(new THREE.Vector3(data.x, 1, data.z), count, color, data.type === "boss" ? 12 : 8, data.type === "boss");
    // The enemy object is removed from game.enemies by the next enemiesSynced cleanup.
  });

  // Host relays prop destruction; non-host clients apply it locally.
  game.socket.on("propDestroyed", (data) => {
    if (!data?.propId || game.isHost) return; // host already handled it locally
    const origin = new THREE.Vector3(data.x ?? 0, data.y ?? 0, data.z ?? 0);
    triggerDestructible(data.propId, origin, null); // null processHit — visual only on non-host
  });
}
