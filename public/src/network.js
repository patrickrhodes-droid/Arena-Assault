import * as THREE from "three";

import { P_MAX_HP, WEAPON_ORDER, WEAPON_DEFS, PVP_KILLS_PER_WEAPON } from "./config.js";
import { game } from "./state.js";
import { setWeapon, spawnBullet, spawnHealthPackVisual } from "./combat.js";
import { announceWave, createBoss, createDog, createSkeleton, createSoldier, handleEnemyDamaged, removeEnemy } from "./enemies.js";
import { applyCharacterHead, createRemotePlayer, removeRemotePlayer, updateRemotePlayerNametag } from "./scene.js";
import { setJoinLinkState, syncMapCards, updateLobbyUI, showTeammateDownAlert, showPvPRankings, showWeaponUnlockAlert } from "./ui.js";
import { spawnParticles } from "./combat.js";

export function initNetworking(actions) {
  if (game.socket) {
    return;
  }

  game.socket = window.io();
  game.socket.emit("playerNameUpdate", { playerName: "" });

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
    game.wave = data.wave;
    game.waveState = data.state;
    game.waveTmr = data.tmr;
    if (data.wave > prevWave) {
      announceWave();
    }
    actions.updateHUD();
  });

  game.socket.on("enemyDamaged", (data) => {
    handleEnemyDamaged(data);
  });

  game.socket.on("playerDamaged", (data) => {
    if (data.targetId !== game.socket.id || !game.localPlayerIsAlive || game.localPlayerIsDowned) {
      return;
    }
    game.hp = Math.max(0, game.hp - data.damage);
    game.audio.damage();
    actions.showDamage();
    actions.addShake(0.15);
    if (data.shooterId) {
      game.lastDamageShooter = data.shooterId;
      game.lastDamageWeapon = data.weapon || null;
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
    // All clients (including former host) receive visual-only enemy bullets.
    spawnBullet(
      new THREE.Vector3(data.x, data.y, data.z),
      new THREE.Vector3(data.dx, data.dy, data.dz).normalize(),
      false,
      { damage: 0, spd: data.spd, life: data.life },
      true,
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
    spawnParticles(new THREE.Vector3(data.x, 1, data.z), 18, 0xcc2200, 8);
    // The enemy object is removed from game.enemies by the next enemiesSynced cleanup.
  });
}
