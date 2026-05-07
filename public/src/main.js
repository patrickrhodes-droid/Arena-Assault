import { P_MAX_HP, PVP_CORNERS, WEAPON_ORDER } from "./config.js";
import { createAudioController } from "./audio.js";
import { collectWeapon, processHit, removeWeaponPickup, resetCombatState, setWeapon, updateBullets, updateHealthPacks, updateParticles, updateWeaponPickups } from "./combat.js";
import { initNetworking } from "./network.js";
import { updateEnemies, updateWaves, trySwordHit } from "./enemies.js";
import { syncLocalPlayerState, updateCamera, updatePlayer, setupInput, tryPointerLock, resetViewState, fireGrapple, updateGrapple } from "./player.js";
import { applyCharacterHead, applyWeaponModel, initScene, rebuildArena, updateRemotePlayerVisuals } from "./scene.js";
import { addShake, game, resetSessionState } from "./state.js";
import {
  cacheDom,
  bindMenuControls,
  drawMinimap,
  hideRankings,
  pushKillFeed,
  renderJoinLinkControls,
  setCopyJoinLinkStatus,
  showBossImperviousAlert,
  showDamage,
  showPvPRankings,
  showRankings,
  showWaveClear,
  updateHUD,
  updateStatusIndicators,
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
  startPvPGame,
  pvpMatchOver,
  startMatch: () => {
    if (game.isHost) {
      game.audio.init();
      game.socket?.emit("startMatch", {
        startingWave: game.startingWave || 1,
        invincibility: Boolean(game.invincibilityMode),
        gameMode: game.selectedGameMode || 'endless',
      });
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
  fireGrapple: () => fireGrapple(),
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
      game.socket?.emit("playerPaused", { paused: false });
      return;
    }

    document.body.classList.remove("locked");
    game.isAiming = false;
    game.dom.crosshair.classList.remove("hidden");
    game.dom.scopeOverlay.classList.remove("show");
    if (game.state === "PLAYING") {
      game.state = "PAUSED";
      game.dom.pause.style.display = "flex";
      game.socket?.emit("playerPaused", { paused: true });
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

function hideAllLobbyScreens() {
  ["screen-player", "screen-map"].forEach((id) => {
    document.getElementById(id)?.classList.remove("active");
  });
}

async function startGame() {
  game.mode = "COOP";
  game.state = "PLAYING";
  game.audio.stopBackgroundMusic();
  hideAllLobbyScreens();
  if (game.dom.lobbyBg) game.dom.lobbyBg.style.display = "none";
  game.dom.gameOver.style.display = "none";
  game.dom.pause.style.display = "none";
  game.dom.hud.style.display = "block";
  game.dom.pvpScore.hidden = true;
  await rebuildArena(game.selectedMap);
  // Set collected weapons based on mode
  if (game.gameMode === 'campaign') {
    game.collectedWeapons = new Set(['pistol']);
  } else {
    game.collectedWeapons = new Set(WEAPON_ORDER);
  }

  const playerCount = 1 + Object.keys(game.remotePlayers).length;
  game.effectiveMaxHP = Math.max(1, Math.round(P_MAX_HP / playerCount));
  resetSessionState();
  game.hp = game.effectiveMaxHP; // override resetSessionState's P_MAX_HP default
  cleanupGame();

  hideRankings();
  resetCombatState();
  resetViewState();
  if (game.visuals.player.headGroup && game.myCharacter) {
    applyCharacterHead(game.visuals.player.headGroup, game.myCharacter, { visor: game.visuals.player.visor });
  }
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
  game.audio.startBackgroundMusic(game.selectedMap, game.mode);
  game.lastTime = performance.now();
}

async function startPvPGame() {
  game.mode = "PVP";
  game.state = "PLAYING";
  game.audio.stopBackgroundMusic();
  hideAllLobbyScreens();
  if (game.dom.lobbyBg) game.dom.lobbyBg.style.display = "none";
  await rebuildArena(game.selectedMap);
  game.dom.gameOver.style.display = "none";
  game.dom.pause.style.display = "none";
  game.dom.hud.style.display = "block";

  game.effectiveMaxHP = P_MAX_HP;
  resetSessionState();
  game.mode = "PVP";
  game.hp = game.effectiveMaxHP;
  cleanupGame();

  hideRankings();
  resetCombatState();
  // Override starting weapon: PvP always begins with pistol.
  setWeapon("pistol");
  game.pvpKills = 0;
  game.pvpSwordKills = 0;
  game.pvpWeaponIdx = 0;

  resetViewState();
  if (game.visuals.player.headGroup && game.myCharacter) {
    applyCharacterHead(game.visuals.player.headGroup, game.myCharacter, { visor: game.visuals.player.visor });
  }

  const cornerIdx = game.pvpSpawnAssignments?.[game.socket?.id] ?? 0;
  const [cx, cz] = PVP_CORNERS[cornerIdx % PVP_CORNERS.length];
  game.visuals.player.playerGroup.position.set(cx, 0, cz);
  game.visuals.player.playerGroup.rotation.set(0, Math.atan2(-cx, -cz), 0);
  game.camTheta = Math.atan2(-cx, -cz);
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
  game.audio.startBackgroundMusic(game.selectedMap, game.mode);
  game.lastTime = performance.now();
}

function pickFurthestCorner() {
  const livingRemotes = Object.values(game.remotePlayers).filter((r) => r.isAlive && !r.isDowned && !r.isSpectating);
  if (livingRemotes.length === 0) {
    return PVP_CORNERS[Math.floor(Math.random() * PVP_CORNERS.length)];
  }

  let bestCorner = PVP_CORNERS[0];
  let bestScore = -Infinity;
  for (const corner of PVP_CORNERS) {
    const [cx, cz] = corner;
    let minDist = Infinity;
    for (const r of livingRemotes) {
      const dx = r.group.position.x - cx;
      const dz = r.group.position.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < minDist) minDist = d2;
    }
    if (minDist > bestScore) {
      bestScore = minDist;
      bestCorner = corner;
    }
  }
  return bestCorner;
}

function pvpMatchOver(data) {
  game.mode = "COOP";
  game.state = "GAMEOVER";
  game.audio.stopBackgroundMusic();
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
  game.dom.pvpScore.hidden = true;

  showPvPRankings(data.rankings || [], data.winnerId);

  if (document.pointerLockElement === game.renderer.domElement) {
    document.exitPointerLock();
  }
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

  game.weaponPickups.forEach((pickup) => {
    game.scene.remove(pickup.group);
  });
  game.weaponPickups.length = 0;
}

function playerDiedLocal() {
  if (!game.localPlayerIsAlive) {
    return;
  }

  if (game.mode === "PVP") {
    playerDiedLocalPvP();
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

function playerDiedLocalPvP() {
  game.localPlayerIsAlive = false;
  game.localPlayerIsDowned = false;
  game.localPlayerIsSpectating = false;
  game.pvpDying = true;
  // Flush all held input so stale keys don't corrupt movement on respawn.
  game.keys = {};
  game.mouseDown = false;
  game.mouseClicked = false;
  game.sprintLocked = false;
  game.isAiming = false;
  game.audio.death();
  game.socket?.emit("playerDied", {
    mode: "PVP",
    killerId: game.lastDamageShooter || null,
    killerWeapon: game.lastDamageWeapon || null,
    stats: {
      score: game.pvpKills,
      kills: game.pvpKills,
      totalKills: game.pvpKills,
      wave: 0,
    },
  });
  game.lastDamageShooter = null;
  game.lastDamageWeapon = null;

  // Keep the body visible during the fall so third-person cameras (yours or
  // other players' eventually) can see it tip over.
  game.visuals.player.playerGroup.visible = true;
  game.visuals.weapon.firstPersonGun.visible = false;
  game.dom.crosshair.classList.add("hidden");

  // Tween rotation.x to tip over. Pivot is at feet, so a 90° tilt lays the
  // body forward — no Y adjustment needed (works whether on ground or tower).
  const startRotX = game.visuals.player.playerGroup.rotation.x;
  const fallStart = performance.now();
  const fallDuration = 750;
  function stepFall() {
    if (!game.pvpDying) return;
    const elapsed = performance.now() - fallStart;
    const t = Math.min(1, elapsed / fallDuration);
    const eased = 1 - Math.pow(1 - t, 3);
    game.visuals.player.playerGroup.rotation.x = startRotX + (Math.PI / 2 - startRotX) * eased;
    if (t < 1) requestAnimationFrame(stepFall);
  }
  requestAnimationFrame(stepFall);

  // After the fall finishes, hold on the black fade and respawn.
  window.setTimeout(() => {
    game.dom.respawnFade.classList.add("full");
  }, 850);

  window.setTimeout(() => {
    if (game.mode !== "PVP" || game.state === "GAMEOVER") {
      game.dom.respawnFade.classList.remove("full");
      game.pvpDying = false;
      return;
    }
    const [cx, cz] = pickFurthestCorner();
    game.keys = {};
    game.mouseDown = false;
    game.mouseClicked = false;
    game.sprintLocked = false;
    game.localPlayerIsAlive = true;
    game.localPlayerIsDowned = false;
    game.pvpDying = false;
    game.state = "PLAYING";
    game.hp = game.effectiveMaxHP;
    game.isAiming = false;
    game.isReloading = false;
    game.reloadTmr = 0;
    game.fireTmr = 0;
    game.visuals.player.playerGroup.position.set(cx, 0, cz);
    game.visuals.player.playerGroup.rotation.set(0, Math.atan2(-cx, -cz), 0);
    game.camTheta = Math.atan2(-cx, -cz);
    game.camPhi = 0.1;
    // Snap camera directly to spawn position so the fade-in doesn't show the
    // old location while lerp catches up.
    const spawnEyeH = game.isCrouching ? 1.1 : 2.15;
    game.camera.position.set(cx, spawnEyeH, cz);
    game.camera.rotation.set(0, game.camTheta, 0);
    game.visuals.player.playerGroup.visible = !game.isFPS;
    game.visuals.weapon.firstPersonGun.visible = game.isFPS;
    game.dom.crosshair.classList.remove("hidden");
    setWeapon(WEAPON_ORDER[game.pvpWeaponIdx] || "pistol");
    game.socket?.emit("playerRevived", { playerId: game.socket.id });
    updateHUD();
    // Trigger the fade-in: remove the .full class so opacity transitions from
    // 1 → 0 over 1.4s (per CSS rule).
    window.setTimeout(() => {
      game.dom.respawnFade.classList.remove("full");
    }, 60);
  }, 1800);
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
  game.hp = game.effectiveMaxHP;
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
  game.audio.stopBackgroundMusic();
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
  game.frameIndex = (game.frameIndex + 1) % 120;
  // Stagger slow updates: HUD every 2 frames, minimap every 3 frames.
  const doHUD      = game.frameIndex % 2 === 0;
  const doMinimap  = game.frameIndex % 3 === 0;

  if (game.state === "PLAYING") {
    updatePlayer(actions);
    updateGrapple();
    syncLocalPlayerState();
    updateEnemies(actions);
    updateBullets({ ...actions, processHit });
    updateParticles();
    updateHealthPacks(doHUD ? updateHUD : undefined);
    updateWeaponPickups(doHUD ? updateHUD : undefined);
    updateWaves();
    updateRemotePlayerVisuals();
    updateCamera();
    if (doHUD) { updateHUD(); updateStatusIndicators(); }
    if (doMinimap) drawMinimap();
  } else if (game.state === "PAUSED") {
    if (!game.worldPaused) {
      updateEnemies(actions);
      updateBullets({ ...actions, processHit });
      updateParticles();
      updateHealthPacks(updateHUD);
      updateWeaponPickups(updateHUD);
      updateWaves();
    }
    updateRemotePlayerVisuals();
    updateCamera();
    if (doHUD) { updateHUD(); updateStatusIndicators(); }
    if (doMinimap) drawMinimap();
  } else if (game.state === "DOWNED") {
    syncLocalPlayerState();
    game.downedTime += game.dt;
    updateEnemies(actions);
    updateBullets({ ...actions, processHit });
    updateParticles();
    updateHealthPacks(doHUD ? updateHUD : undefined);
    updateWeaponPickups(doHUD ? updateHUD : undefined);
    updateWaves();
    updateRemotePlayerVisuals();
    updateCamera();
    if (doHUD) { updateHUD(); updateStatusIndicators(); }
    if (doMinimap) drawMinimap();
    game.dom.reviveBarFill.style.width = `${Math.min(100, (game.downedTime / 45) * 100)}%`;
  } else if (game.state === "SPECTATING") {
    syncLocalPlayerState();
    updateEnemies(actions);
    updateBullets({ ...actions, processHit });
    updateParticles();
    updateHealthPacks(doHUD ? updateHUD : undefined);
    updateWeaponPickups(doHUD ? updateHUD : undefined);
    updateWaves();
    updateRemotePlayerVisuals();
    updateCamera();
    if (doHUD) { updateHUD(); updateStatusIndicators(); }
    if (doMinimap) drawMinimap();
  }

  game.renderer.render(game.scene, game.camera);
  requestAnimationFrame(animate);
}
