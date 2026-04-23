import * as THREE from "three";

import { P_MAX_HP } from "./config.js";
import { game } from "./state.js";
import { spawnBullet, spawnHealthPackVisual } from "./combat.js";
import { createBoss, createDog, createSoldier, handleEnemyDamaged, removeEnemy } from "./enemies.js";
import { createRemotePlayer, removeRemotePlayer } from "./scene.js";
import { updateLobbyUI } from "./ui.js";

export function initNetworking(actions) {
  if (game.socket) {
    return;
  }

  game.socket = window.io();
  game.socket.emit("playerNameUpdate", { playerName: "" });

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
      remote.playerName = player.playerName || remote.playerName;
      remote.isAlive = player.isAlive ?? remote.isAlive;
      remote.isDowned = player.isDowned ?? remote.isDowned;
      remote.isSpectating = player.isSpectating ?? remote.isSpectating;
      remote.score = player.score ?? remote.score;
      remote.kills = player.kills ?? remote.kills;
      remote.dogKills = player.dogKills ?? remote.dogKills;
      remote.bossKills = player.bossKills ?? remote.bossKills;
      remote.totalKills = player.totalKills ?? remote.totalKills;
      remote.wave = player.wave ?? remote.wave;
    });
    updateLobbyUI(players);
  });

  game.socket.on("matchStarted", () => {
    actions.startGame();
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
    if (game.isHost) {
      return;
    }
    game.wave = data.wave;
    game.waveState = data.state;
    game.waveTmr = data.tmr;
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
    if (game.hp <= 0) {
      game.hp = 0;
      actions.playerDiedLocal();
    }
    actions.updateHUD();
  });

  game.socket.on("enemiesSynced", (syncList) => {
    if (game.isHost) {
      return;
    }

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
        else if (entry.type === "boss") createBoss(new THREE.Vector3(entry.x, entry.y, entry.z), entry.id);
        enemy = game.enemies[game.enemies.length - 1];
      }

      if (!enemy) {
        return;
      }

      enemy.group.position.set(entry.x, entry.y, entry.z);
      enemy.group.rotation.y = entry.rot;
      enemy.hp = entry.hp;
      enemy.walkT = entry.walkT;
    });
  });

  game.socket.on("playerMoved", (player) => {
    const remote = createRemotePlayer(player.playerId, player);
    remote.group.position.set(player.x, player.y, player.z);
    remote.group.rotation.y = player.rotation;
    remote.isAlive = player.isAlive ?? remote.isAlive;
    remote.isDowned = player.isDowned ?? remote.isDowned;
    remote.isSpectating = player.isSpectating ?? remote.isSpectating;
    remote.score = player.score ?? remote.score;
    remote.kills = player.kills ?? remote.kills;
    remote.dogKills = player.dogKills ?? remote.dogKills;
    remote.bossKills = player.bossKills ?? remote.bossKills;
    remote.totalKills = player.totalKills ?? remote.totalKills;
    remote.wave = player.wave ?? remote.wave;
    remote.stats = player.stats ?? remote.stats;
    remote.playerName = player.playerName || remote.playerName;
  });

  game.socket.on("playerDisconnected", (id) => {
    removeRemotePlayer(id);
  });

  game.socket.on("playerDied", (data) => {
    const remote = game.remotePlayers[data.playerId];
    if (remote) {
      remote.isAlive = false;
      remote.isDowned = true;
      remote.isSpectating = false;
      remote.stats = data.stats;
      remote.score = data.stats?.score || 0;
      remote.kills = data.stats?.kills || 0;
      remote.dogKills = data.stats?.dogKills || 0;
      remote.bossKills = data.stats?.bossKills || 0;
      remote.totalKills = data.stats?.totalKills || data.stats?.kills || 0;
      remote.wave = data.stats?.wave || remote.wave;
    }
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
    if (!game.isHost) {
      spawnHealthPackVisual(data.id, new THREE.Vector3(data.x, data.y, data.z));
    }
  });

  game.socket.on("enemyBulletFired", (data) => {
    if (game.isHost) {
      return;
    }
    spawnBullet(
      new THREE.Vector3(data.x, data.y, data.z),
      new THREE.Vector3(data.dx, data.dy, data.dz).normalize(),
      false,
      { damage: data.damage, spd: data.spd, life: data.life },
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
      game.hp = Math.min(P_MAX_HP, game.hp + 30);
      game.audio.reviveComplete();
      actions.updateHUD();
    }
  });

  game.socket.on("globalGameOver", (rankings) => {
    actions.gameOver(rankings);
  });

  game.socket.on("clientPickupHealthPack", (data) => {
    if (!game.isHost) {
      return;
    }

    const index = game.healthPacks.findIndex((pack) => pack.id === data.packId);
    if (index !== -1) {
      game.scene.remove(game.healthPacks[index].mesh);
      game.healthPacks.splice(index, 1);
      game.socket.emit("healthPackPickedUp", { packId: data.packId, playerId: data.playerId });
    }
  });
}
