import { P_MAX_HP } from "./config.js";
import { createAudioController } from "./audio.js";
import { processHit, resetCombatState, setWeapon, updateBullets, updateHealthPacks, updateParticles } from "./combat.js";
import { initNetworking } from "./network.js";
import { updateEnemies, updateWaves, trySwordHit } from "./enemies.js";
import { syncLocalPlayerState, updateCamera, updatePlayer, setupInput, tryPointerLock, resetViewState } from "./player.js";
import { applyWeaponModel, initScene } from "./scene.js";
import { addShake, game, resetSessionState } from "./state.js";
import {
  cacheDom,
  bindMenuControls,
  drawMinimap,
  hideRankings,
  renderJoinLinkControls,
  setCopyJoinLinkStatus,
  showBossImperviousAlert,
  showDamage,
  showRankings,
  updateHUD,
} from "./ui.js";
import { disposeObject3D } from "./utils.js";

cacheDom();
game.audio = createAudioController();
initScene();
applyWeaponModel();

const actions = {
  addShake,
  audioInit: () => game.audio.init(),
  copyJoinLink: async () => {
    if (!game.joinLink) {
      setCopyJoinLinkStatus("Join link unavailable.", true);
      return;
    }

    try {
      await navigator.clipboard.writeText(game.joinLink);
      setCopyJoinLinkStatus(`Copied: ${game.joinLink}`);
    } catch {
      setCopyJoinLinkStatus("Clipboard access failed.", true);
    }

    window.clearTimeout(game.copyJoinLinkTimeout);
    game.copyJoinLinkTimeout = window.setTimeout(() => {
      setCopyJoinLinkStatus("");
    }, 2500);
  },
  gameOver,
  handleSwordAttack: () => trySwordHit(),
  playerDiedLocal,
  enterSpectatorMode,
  readyUp: () => game.socket?.emit("playerReady"),
  reloadPage: () => window.location.reload(),
  resumeGame: () => {
    if (game.state === "PAUSED") {
      game.state = "PLAYING";
      if (game.localPlayerIsSpectating) {
        game.state = "SPECTATING";
      } else if (game.localPlayerIsDowned) {
        game.state = "DOWNED";
      }
      game.dom.pause.style.display = "none";
      game.dom.hud.style.display = "block";
    }
    tryPointerLock();
  },
  respawnPlayerLocal,
  revivePlayerLocal,
  setWeapon: (id) => {
    if (setWeapon(id)) {
      updateHUD();
    }
  },
  showBossImperviousAlert,
  showDamage,
  startGame,
  startMatch: () => {
    if (game.isHost) {
      game.audio.init();
      game.socket?.emit("startMatch");
    }
  },
  toggleView: () => {
    game.isFPS = !game.isFPS;
    game.dom.viewBtn.textContent = game.isFPS ? "VIEW: THIRD PERSON" : "VIEW: FIRST PERSON";
    try {
      window.localStorage.setItem("arena_fps_pref", game.isFPS ? "1" : "0");
    } catch {
      // Ignore local storage failures.
    }
  },
  tryPointerLock,
  updateHUD,
  updatePlayerName: (event) => {
    game.playerName = event.target.value.trim() || "";
    event.target.style.borderColor = game.playerName ? "var(--border)" : "";
    try { window.localStorage.setItem("arena_player_name", game.playerName); } catch { }
    game.socket?.emit("playerNameUpdate", { playerName: game.playerName || "Anonymous" });
  },
  updateSensitivity: () => {
    const value = Number(game.dom.sensSlider.value);
    game.sens = 0.001 * value;
    game.dom.sensVal.textContent = value;
  },
  onPointerLockChange: () => {
    if (document.pointerLockElement === game.renderer.domElement) {
      document.body.classList.add("locked");
      if (game.state === "MENU") {
        startGame();
      } else if (game.state === "PAUSED") {
        game.state = "PLAYING";
        game.dom.pause.style.display = "none";
        game.dom.hud.style.display = "block";
      }
      game.dom.clickPrompt.style.display = "none";
      return;
    }

    document.body.classList.remove("locked");
    game.isAiming = false;
    game.dom.crosshair.classList.remove("hidden");
    game.dom.scopeOverlay.classList.remove("show");
    if (game.state === "PLAYING") {
      game.state = "PAUSED";
      game.dom.pause.style.display = "flex";
    }
    if (game.state === "PLAYING" || game.state === "PAUSED") {
      game.dom.clickPrompt.style.display = "block";
    }
  },
  onPointerLockError: () => {
    document.body.classList.remove("locked");
    game.isAiming = false;
    game.dom.crosshair.classList.remove("hidden");
    game.dom.scopeOverlay.classList.remove("show");
    if (game.state === "PLAYING" || game.state === "PAUSED") {
      game.dom.clickPrompt.style.display = "block";
    }
  },
};

bindMenuControls(actions);
setupInput(actions);
initNetworking(actions);

game.renderer.domElement.addEventListener("click", () => {
  if ((game.state === "PLAYING" || game.state === "PAUSED") && document.pointerLockElement !== game.renderer.domElement) {
    tryPointerLock();
  }
});

window.addEventListener("resize", () => {
  game.camera.aspect = window.innerWidth / window.innerHeight;
  game.camera.updateProjectionMatrix();
  game.renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("load", () => {
  try {
    const saved = window.localStorage.getItem("arena_fps_pref");
    if (saved !== null) {
      game.isFPS = saved === "1";
    }
  } catch {
    // Ignore local storage failures.
  }

  try {
    const savedName = window.localStorage.getItem("arena_player_name");
    if (savedName) {
      game.playerName = savedName;
      game.dom.playerName.value = savedName;
      game.socket?.emit("playerNameUpdate", { playerName: savedName });
    }
  } catch {
    // Ignore local storage failures.
  }

  game.dom.viewBtn.textContent = game.isFPS ? "VIEW: THIRD PERSON" : "VIEW: FIRST PERSON";
});

requestAnimationFrame((time) => {
  game.lastTime = time;
  animate(time);
});

function startGame() {
  game.state = "PLAYING";
  game.dom.menu.style.display = "none";
  game.dom.gameOver.style.display = "none";
  game.dom.pause.style.display = "none";
  game.dom.hud.style.display = "block";

  const playerCount = 1 + Object.keys(game.remotePlayers).length;
  game.effectiveMaxHP = Math.max(1, Math.round(P_MAX_HP / playerCount));
  game.hp = game.effectiveMaxHP;
  resetSessionState();
  game.hp = game.effectiveMaxHP;
  cleanupGame();

  if (game.isHost && game.startingWave > 1) {
    game.wave = game.startingWave - 1;
    game.waveTmr = 0.1;
  }
  hideRankings();
  resetCombatState();
  resetViewState();
  game.visuals.player.playerGroup.position.set(0, 0, 0);
  game.visuals.player.playerGroup.rotation.set(0, 0, 0);
  game.visuals.player.playerGroup.visible = !game.isFPS;
  game.visuals.weapon.firstPersonGun.visible = game.isFPS;
  game.dom.reviveOverlay.style.display = "none";
  game.dom.spectatorOverlay.style.display = "none";
  game.dom.revivePromptHud.style.display = "none";
  game.dom.reviveProgressBg.style.display = "none";
  game.dom.reviveProgressFill.style.width = "0%";
  game.dom.viewBtn.textContent = game.isFPS ? "VIEW: THIRD PERSON" : "VIEW: FIRST PERSON";
  renderJoinLinkControls();
  updateHUD();
  drawMinimap();
  game.lastTime = performance.now();
}

function cleanupGame() {
  game.bullets.forEach((bullet) => {
    game.scene.remove(bullet.mesh);
    disposeObject3D(bullet.mesh);
  });
  game.bullets.length = 0;

  game.particles.forEach((particle) => {
    game.scene.remove(particle.mesh);
    particle.mesh.geometry.dispose();
    particle.mesh.material.dispose();
  });
  game.particles.length = 0;

  game.enemies.forEach((enemy) => {
    game.scene.remove(enemy.group);
    disposeObject3D(enemy.group);
    game.scene.remove(enemy.hpBar);
    game.scene.remove(enemy.hpFg);
    enemy.hpBar.geometry?.dispose();
    enemy.hpBar.material?.dispose();
    enemy.hpFg.geometry?.dispose();
    enemy.hpFg.material?.dispose();
  });
  game.enemies.length = 0;

  game.skeletonCorpses.forEach((corpse) => {
    game.scene.remove(corpse.model);
    disposeObject3D(corpse.model);
  });
  game.skeletonCorpses.length = 0;

  game.healthPacks.forEach((pack) => {
    game.scene.remove(pack.mesh);
  });
  game.healthPacks.length = 0;
}

function playerDiedLocal() {
  if (!game.localPlayerIsAlive) {
    return;
  }

  game.localPlayerIsAlive = false;
  game.localPlayerIsDowned = true;
  game.localPlayerIsSpectating = false;
  game.state = "DOWNED";
  game.downedTime = 0;
  game.isAiming = false;
  game.isReloading = false;
  game.reloadTmr = 0;
  game.fireTmr = 0;
  game.visuals.player.playerGroup.visible = true;
  game.visuals.weapon.firstPersonGun.visible = false;
  game.dom.crosshair.classList.add("hidden");
  game.dom.scopeOverlay.classList.remove("show");
  game.dom.reviveOverlay.style.display = "flex";
  game.dom.revivePrompt.textContent = "Waiting for revive...";
  game.dom.reviveBarFill.style.width = "0%";
  game.dom.revivePromptHud.style.display = "none";
  game.dom.reviveProgressBg.style.display = "none";
  game.dom.reviveProgressFill.style.width = "0%";
  game.audio.death();
  game.socket?.emit("playerDied", {
    stats: {
      score: game.score,
      kills: game.stats.kills,
      dogKills: game.stats.dogKills,
      bossKills: game.stats.bossKills,
      totalKills: game.stats.kills + game.stats.dogKills + game.stats.bossKills,
      wave: game.wave,
    },
  });

  if (Object.keys(game.remotePlayers).length === 0) {
    game.dom.reviveOverlay.style.display = "none";
    gameOver();
    return;
  }

  window.clearTimeout(game.reviveTimeout);
  game.reviveTimeout = window.setTimeout(() => {
    if (game.localPlayerIsDowned) {
      game.dom.reviveOverlay.style.display = "none";
      enterSpectatorMode();
    }
  }, 45000);
}

function enterSpectatorMode() {
  if (game.localPlayerIsSpectating || game.state === "GAMEOVER") {
    return;
  }

  game.localPlayerIsAlive = false;
  game.localPlayerIsDowned = false;
  game.localPlayerIsSpectating = true;
  game.state = "SPECTATING";
  game.isAiming = false;
  game.isReloading = false;
  game.reloadTmr = 0;
  game.fireTmr = 0;
  game.visuals.player.playerGroup.visible = true;
  game.visuals.weapon.firstPersonGun.visible = false;
  game.dom.crosshair.classList.add("hidden");
  game.dom.scopeOverlay.classList.remove("show");
  game.dom.reviveOverlay.style.display = "none";
  game.dom.spectatorOverlay.style.display = "flex";
  game.dom.revivePromptHud.style.display = "none";
  game.dom.reviveProgressBg.style.display = "none";
  game.dom.reviveProgressFill.style.width = "0%";
  window.clearTimeout(game.reviveTimeout);
  game.socket?.emit("playerSpectating", {
    stats: {
      score: game.score,
      kills: game.stats.kills,
      dogKills: game.stats.dogKills,
      bossKills: game.stats.bossKills,
      totalKills: game.stats.kills + game.stats.dogKills + game.stats.bossKills,
      wave: game.wave,
    },
  });
  updateHUD();
}

function revivePlayerLocal(emitToServer = true) {
  if (!game.localPlayerIsDowned) {
    return;
  }

  game.localPlayerIsAlive = true;
  game.localPlayerIsDowned = false;
  game.localPlayerIsSpectating = false;
  game.state = "PLAYING";
  game.dom.reviveOverlay.style.display = "none";
  game.dom.spectatorOverlay.style.display = "none";
  game.visuals.player.playerGroup.visible = !game.isFPS;
  game.visuals.weapon.firstPersonGun.visible = game.isFPS;
  game.dom.revivePromptHud.style.display = "none";
  game.dom.reviveProgressBg.style.display = "none";
  game.dom.reviveProgressFill.style.width = "0%";
  game.hp = Math.max(1, Math.floor(game.effectiveMaxHP * 0.3));
  game.netSyncTmr = 0;
  window.clearTimeout(game.reviveTimeout);
  if (emitToServer) {
    game.socket?.emit("playerRevived", { playerId: game.socket.id });
  }
  game.audio.reviveComplete();
  updateHUD();
}

function respawnPlayerLocal(emitToServer = true) {
  if (game.localPlayerIsAlive && !game.localPlayerIsSpectating && !game.localPlayerIsDowned) {
    return;
  }

  game.localPlayerIsAlive = true;
  game.localPlayerIsDowned = false;
  game.localPlayerIsSpectating = false;
  game.state = "PLAYING";
  game.hp = game.effectiveMaxHP;
  game.isAiming = false;
  game.isReloading = false;
  game.reloadTmr = 0;
  game.fireTmr = 0;
  game.visuals.player.playerGroup.position.set(0, 0, 0);
  game.visuals.player.playerGroup.rotation.set(0, 0, 0);
  game.visuals.player.playerGroup.visible = !game.isFPS;
  game.visuals.weapon.firstPersonGun.visible = game.isFPS;
  game.dom.reviveOverlay.style.display = "none";
  game.dom.spectatorOverlay.style.display = "none";
  game.dom.revivePromptHud.style.display = "none";
  game.dom.reviveProgressBg.style.display = "none";
  game.dom.reviveProgressFill.style.width = "0%";
  game.dom.hud.style.display = "block";
  game.dom.crosshair.classList.remove("hidden");
  game.dom.scopeOverlay.classList.remove("show");
  game.netSyncTmr = 0;
  window.clearTimeout(game.reviveTimeout);
  if (emitToServer) {
    game.socket?.emit("playerRevived", { playerId: game.socket.id });
  }
  updateHUD();
}

function gameOver(rankings = null) {
  game.state = "GAMEOVER";
  game.isAiming = false;
  game.isReloading = false;
  game.reloadTmr = 0;
  game.fireTmr = 0;
  game.visuals.player.playerGroup.visible = true;
  game.visuals.weapon.firstPersonGun.visible = false;
  game.dom.crosshair.classList.remove("hidden");
  game.dom.scopeOverlay.classList.remove("show");
  game.dom.reviveOverlay.style.display = "none";
  game.dom.spectatorOverlay.style.display = "none";
  game.dom.revivePromptHud.style.display = "none";
  game.dom.reviveProgressBg.style.display = "none";
  game.dom.reviveProgressFill.style.width = "0%";
  game.dom.gameOver.style.display = "flex";
  game.dom.hud.style.display = "none";

  const accuracy = game.stats.shotsFired > 0
    ? Math.round((game.stats.shotsHit / game.stats.shotsFired) * 100)
    : 0;

  game.dom.goScore.textContent = game.score;
  game.dom.goWaves.textContent = game.wave;
  game.dom.goKills.textContent = game.stats.kills + game.stats.dogKills + game.stats.bossKills;
  game.dom.goDogKills.textContent = game.stats.dogKills;
  game.dom.goBossKills.textContent = game.stats.bossKills;
  game.dom.goAccuracy.textContent = `${accuracy}%`;
  game.dom.goDamage.textContent = Math.round(game.stats.damageDealt);
  if (rankings) {
    showRankings(rankings);
  } else {
    hideRankings();
  }

  if (document.pointerLockElement === game.renderer.domElement) {
    document.exitPointerLock();
  }
}

function animate(time) {
  game.dt = Math.min(0.03, (time - game.lastTime) / 1000);
  game.lastTime = time;

  if (game.state === "PLAYING") {
    updatePlayer(actions);
    syncLocalPlayerState();
    updateEnemies(actions);
    updateBullets({ ...actions, processHit });
    updateParticles();
    updateHealthPacks(updateHUD);
    updateWaves();
    updateCamera();
    updateHUD();
    drawMinimap();
  } else if (game.state === "PAUSED") {
    updateEnemies(actions);
    updateBullets({ ...actions, processHit });
    updateParticles();
    updateHealthPacks(updateHUD);
    updateWaves();
    updateCamera();
    updateHUD();
    drawMinimap();
  } else if (game.state === "DOWNED") {
    syncLocalPlayerState();
    game.downedTime += game.dt;
    updateEnemies(actions);
    updateBullets({ ...actions, processHit });
    updateParticles();
    updateHealthPacks(updateHUD);
    updateWaves();
    updateCamera();
    updateHUD();
    drawMinimap();
    game.dom.reviveBarFill.style.width = `${Math.min(100, (game.downedTime / 45) * 100)}%`;
  } else if (game.state === "SPECTATING") {
    syncLocalPlayerState();
    updateEnemies(actions);
    updateBullets({ ...actions, processHit });
    updateParticles();
    updateHealthPacks(updateHUD);
    updateWaves();
    updateCamera();
    updateHUD();
    drawMinimap();
  }

  game.renderer.render(game.scene, game.camera);
  requestAnimationFrame(animate);
}
