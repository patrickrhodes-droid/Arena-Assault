import { ARENA_SIZE, CHARACTERS, HALF, MAP_DEFS, P_MAX_HP, PVP_WIN_KILLS, WEAPON_DEFS, WEAPON_ORDER } from "./config.js";
import { game } from "./state.js";
import { getWeapon, lowAmmoThreshold } from "./combat.js";
import { getBossEnemies } from "./enemies.js";
import { applyCharacterHead } from "./scene.js";

export function cacheDom() {
  game.dom = {
    gameContainer: document.getElementById("game-container"),
    menu: document.getElementById("screen-player"), // kept as alias
    screenPlayer: document.getElementById("screen-player"),
    screenMap: document.getElementById("screen-map"),
    screenLobby: document.getElementById("screen-lobby"),
    btnToMap: document.getElementById("btn-to-map"),
    btnToPlayer: document.getElementById("btn-to-player"),
    btnToLobby: document.getElementById("btn-to-lobby"),
    btnToMapFromLobby: document.getElementById("btn-to-map-from-lobby"),
    mapCards: document.querySelectorAll(".map-card"),
    mapChosenLabel: document.getElementById("map-chosen-label"),
    mapHostNote: document.getElementById("map-host-note"),
    hud: document.getElementById("hud"),
    pause: document.getElementById("pause-menu"),
    gameOver: document.getElementById("gameover-screen"),
    damageOverlay: document.getElementById("damage-overlay"),
    hpFill: document.getElementById("health-bar-fill"),
    hpText: document.getElementById("health-text"),
    ammoCurrent: document.getElementById("ammo-current"),
    ammoMax: document.getElementById("ammo-max"),
    reloadText: document.getElementById("reload-text"),
    weaponName: document.getElementById("weapon-name"),
    scoreValue: document.getElementById("score-value"),
    waveValue: document.getElementById("wave-value"),
    bossWrap: document.getElementById("boss-health-wrap"),
    bossFill: document.getElementById("boss-health-fill"),
    bossName: document.getElementById("boss-health-name"),
    waveAnnounce: document.getElementById("wave-announce"),
    clickPrompt: document.getElementById("click-prompt"),
    viewBtn: document.getElementById("view-btn"),
    sensSlider: document.getElementById("sens-slider"),
    sensVal: document.getElementById("sens-val"),
    minimap: document.getElementById("minimap"),
    crosshair: document.getElementById("crosshair"),
    scopeOverlay: document.getElementById("scope-overlay"),
    reviveOverlay: document.getElementById("revive-overlay"),
    spectatorOverlay: document.getElementById("spectator-overlay"),
    reviveText: document.getElementById("revive-text"),
    revivePrompt: document.getElementById("revive-prompt"),
    reviveBarFill: document.getElementById("revive-bar-fill"),
    revivePromptHud: document.getElementById("revive-prompt-hud"),
    reviveProgressBg: document.getElementById("revive-progress-bar-bg"),
    reviveProgressFill: document.getElementById("revive-progress-bar-fill"),
    lobbyList: document.getElementById("player-list"),
    playerName: document.getElementById("player-name"),
    deployBtn: document.getElementById("deploy-btn"),
    joinLinkBox: document.getElementById("join-link-box"),
    copyJoinLinkBtn: document.getElementById("copy-join-link-btn"),
    copyJoinLinkStatus: document.getElementById("copy-join-link-status"),
    skipWaveSelect: document.getElementById("skip-wave-select"),
    invincibilityToggle: document.getElementById("invincibility-toggle"),
    resumeBtn: document.getElementById("resume-btn"),
    exitBtn: document.getElementById("exit-btn"),
    redeployBtn: document.getElementById("redeploy-btn"),
    gameOverTitle: document.getElementById("gameover-title"),
    gameOverSubtitle: document.getElementById("gameover-subtitle"),
    rankingsSection: document.getElementById("rankings-section"),
    rankingsContent: document.getElementById("rankings-content"),
    goScore: document.getElementById("go-score"),
    goWaves: document.getElementById("go-waves"),
    goKills: document.getElementById("go-kills"),
    goDogKills: document.getElementById("go-dogkills"),
    goBossKills: document.getElementById("go-bosskills"),
    goAccuracy: document.getElementById("go-acc"),
    goDamage: document.getElementById("go-dmg"),
    redDotOverlay: document.getElementById("red-dot-overlay"),
    teammatePanel: document.getElementById("teammate-panel"),
    teammateAlert: document.getElementById("teammate-alert"),
    bossImperviousAlert: document.getElementById("boss-impervious-alert"),
    inventoryBar: document.getElementById("inventory-bar"),
    pvpMatchBtn: document.getElementById("pvp-match-btn"),
    characterSelect: document.getElementById("character-select"),
    characterCards: document.querySelectorAll(".character-card"),
    pvpScore: document.getElementById("pvp-score"),
    pvpKills: document.getElementById("pvp-kills"),
    pvpKillsMax: document.getElementById("pvp-kills-max"),
    pvpRank: document.getElementById("pvp-rank"),
    waveDisplay: document.getElementById("wave-display"),
    statsGrid: document.getElementById("stats-grid"),
    weaponUnlockAlert: document.getElementById("weapon-unlock-alert"),
    respawnFade: document.getElementById("respawn-fade"),
    fullscreenBtn: document.getElementById("fullscreen-btn"),
  };

  game.dom.minimapContext = game.dom.minimap.getContext("2d");
}

function showScreen(id) {
  ["screen-player", "screen-map", "screen-lobby"].forEach((s) => {
    document.getElementById(s)?.classList.toggle("active", s === id);
  });
}

export function bindMenuControls(actions) {
  const { audioInit, startMatch, readyUp, toggleView, updateSensitivity, updatePlayerName, reloadPage, copyJoinLink } = actions;

  // ── Screen navigation ──
  game.dom.btnToMap.addEventListener("click", () => {
    if (!game.myCharacter || !game.dom.playerName.value.trim()) return;
    // Improvement: If you are not the host, skip past the map selection.
    if (!game.isHost) {
      showScreen("screen-lobby");
      return;
    }
    showScreen("screen-map");
    // Sync host-selected map highlight.
    syncMapCards(game.selectedMap);
    const isHost = game.isHost;
    game.dom.mapHostNote.style.display = isHost ? "none" : "block";
    game.dom.mapCards.forEach((c) => { c.disabled = !isHost; });
  });

  game.dom.btnToPlayer.addEventListener("click", () => showScreen("screen-player"));
  game.dom.btnToLobby.addEventListener("click", () => showScreen("screen-lobby"));
  game.dom.btnToMapFromLobby.addEventListener("click", () => showScreen("screen-map"));

  // ── Map cards ──
  game.dom.mapCards.forEach((card) => {
    card.addEventListener("click", () => {
      if (!game.isHost) return;
      const mapId = card.dataset.map;
      if (!mapId) return;
      game.selectedMap = mapId;
      syncMapCards(mapId);
      game.socket?.emit("hostSelectMap", { map: mapId });
      updateMapChosenLabel(mapId);
    });
  });

  game.dom.deployBtn.addEventListener("click", () => {
    const name = game.dom.playerName.value.trim();
    if (!name) {
      game.dom.playerName.style.borderColor = "var(--danger)";
      game.dom.playerName.placeholder = "Name required!";
      return;
    }

    if (!game.myCharacter) {
      game.dom.characterSelect.style.borderColor = "var(--danger)";
      return;
    }

    audioInit();

    if (game.isHost && game.dom.deployBtn.textContent === "START MISSION") {
      startMatch();
      return;
    }

    readyUp();
    game.dom.deployBtn.disabled = true;
    game.dom.deployBtn.style.opacity = "0.5";
  });

  game.dom.characterCards.forEach((card) => {
    card.addEventListener("click", () => {
      const characterId = card.dataset.character;
      if (!characterId || !CHARACTERS[characterId]) return;
      game.myCharacter = characterId;
      game.dom.characterCards.forEach((c) => c.classList.toggle("selected", c === card));
      game.dom.characterSelect.style.borderColor = "";
      if (game.visuals?.player?.headGroup) {
        applyCharacterHead(game.visuals.player.headGroup, characterId, { visor: game.visuals.player.visor });
      }
      game.socket?.emit("playerCharacterUpdate", { character: characterId });
    });
  });

  game.dom.pvpMatchBtn.addEventListener("click", () => {
    if (!game.isHost) return;
    audioInit();
    game.socket?.emit("startPvPMatch");
  });

  game.dom.resumeBtn.addEventListener("click", actions.resumeGame);
  game.dom.exitBtn.addEventListener("click", reloadPage);
  game.dom.redeployBtn.addEventListener("click", reloadPage);
  game.dom.viewBtn.addEventListener("click", toggleView);
  if (game.dom.fullscreenBtn) {
    game.dom.fullscreenBtn.addEventListener("click", () => {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    });
    document.addEventListener("fullscreenchange", () => {
      game.dom.fullscreenBtn.textContent = document.fullscreenElement ? "EXIT FULLSCREEN" : "FULLSCREEN";
    });
  }
  game.dom.sensSlider.addEventListener("input", updateSensitivity);
  game.dom.playerName.addEventListener("input", updatePlayerName);
  game.dom.copyJoinLinkBtn.addEventListener("click", copyJoinLink);

  for (let w = 1; w <= 30; w += 1) {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = w;
    game.dom.skipWaveSelect.appendChild(opt);
  }

  game.dom.skipWaveSelect.addEventListener("change", () => {
    game.startingWave = Number(game.dom.skipWaveSelect.value);
  });

  game.dom.invincibilityToggle.addEventListener("change", () => {
    game.invincibilityMode = game.dom.invincibilityToggle.checked;
  });
}

export function syncMapCards(mapId) {
  game.dom.mapCards.forEach((c) => {
    c.classList.toggle("selected", c.dataset.map === mapId);
  });
}

export function updateMapChosenLabel(mapId) {
  const def = MAP_DEFS[mapId];
  if (game.dom.mapChosenLabel) {
    game.dom.mapChosenLabel.textContent = def ? `MAP: ${def.name}` : "";
  }
}

export function updateLobbyUI(players) {
  const list = game.dom.lobbyList;
  list.innerHTML = "";
  let playerCount = 0;
  let namedPlayersWithCharacter = 0;

  Object.values(players).forEach((player) => {
    const displayName = (player.playerName || "").trim();
    if (!displayName || displayName === "Soldier") {
      return;
    }

    playerCount += 1;
    if (player.character) namedPlayersWithCharacter += 1;

    const characterInfo = player.character && CHARACTERS[player.character];
    const characterLabel = characterInfo
      ? `<span class="lobby-character" style="color:#${characterInfo.headColor.toString(16).padStart(6, "0")}">${characterInfo.name.toUpperCase()}</span>`
      : '<span class="lobby-character" style="color:var(--muted)">PICKING...</span>';

    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `<span>${displayName} ${player.isHost ? '<span style="color:var(--muted);font-size:11px">(HOST)</span>' : ""} ${characterLabel}</span>
      <span class="${player.isReady ? "player-ready" : "player-waiting"}">${player.isReady ? "READY" : "WAITING"}</span>`;
    list.appendChild(row);

    if (player.playerId === game.socket?.id) {
      game.isHost = player.isHost;
    }
  });

  if (playerCount === 0) {
    list.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:4px">Enter your name to join the lobby</div>';
  }

  const localPlayer = players[game.socket?.id];
  if (!localPlayer || game.state !== "MENU") {
    return;
  }

  const hasName = Boolean(localPlayer.playerName);
  game.dom.characterSelect.hidden = !hasName;

  // NEXT button on screen 1 requires both name and character.
  const canAdvance = hasName && Boolean(game.myCharacter);
  game.dom.btnToMap.disabled = !canAdvance;

  game.dom.deployBtn.style.display = "block";
  game.dom.deployBtn.disabled = false;
  game.dom.deployBtn.style.opacity = "1";
  const allReady = Object.values(players).every((player) => player.isReady);
  game.dom.deployBtn.textContent = localPlayer.isHost && allReady ? "START MISSION" : "READY UP";

  const showPvPBtn = localPlayer.isHost
    && hasName
    && Boolean(game.myCharacter)
    && playerCount >= 2
    && namedPlayersWithCharacter >= 2;
  game.dom.pvpMatchBtn.hidden = !showPvPBtn;

  // Keep the map chosen label in sync.
  updateMapChosenLabel(game.selectedMap);

  renderJoinLinkControls();
}

export function setJoinLinkState({ canCopyJoinLink, joinLink, clientIp }) {
  game.canCopyJoinLink = Boolean(canCopyJoinLink);
  game.joinLink = joinLink || "";
  game.clientIp = clientIp || "";
  renderJoinLinkControls();
}

export function setCopyJoinLinkStatus(message, isError = false) {
  game.copyJoinLinkMessage = message || "";
  game.dom.copyJoinLinkStatus.textContent = game.copyJoinLinkMessage;
  game.dom.copyJoinLinkStatus.style.color = isError ? "var(--warn)" : "var(--muted)";
}

export function renderJoinLinkControls() {
  const shouldShow = game.state === "MENU" && game.canCopyJoinLink && Boolean(game.joinLink);
  game.dom.joinLinkBox.hidden = !shouldShow;
  game.dom.copyJoinLinkStatus.textContent = game.copyJoinLinkMessage || "";
}

export function updateHUD() {
  const weapon = getWeapon();
  const bosses = getBossEnemies();
  const percent = Math.max(0, game.hp / game.effectiveMaxHP);
  game.dom.hpFill.style.width = `${percent * 100}%`;
  game.dom.hpText.textContent = Math.ceil(game.hp);

  const isPvP = game.mode === "PVP";
  game.dom.pvpScore.hidden = !isPvP;
  game.dom.waveDisplay.style.display = isPvP ? "none" : "";
  game.dom.inventoryBar.style.display = isPvP ? "none" : "";
  if (isPvP) {
    game.dom.pvpKills.textContent = game.pvpKills;
    game.dom.pvpKillsMax.textContent = PVP_WIN_KILLS;
    const selfKills = game.pvpKills;
    const remoteKillCounts = Object.values(game.remotePlayers).map((r) => r.pvpKills ?? 0);
    const rank = 1 + remoteKillCounts.filter((k) => k > selfKills).length;
    game.dom.pvpRank.textContent = `#${rank}`;
  }
  game.dom.ammoCurrent.textContent = game.localPlayerIsAlive
    ? (game.isReloading ? "--" : game.ammo)
    : (game.localPlayerIsDowned ? "DOWNED" : game.localPlayerIsSpectating ? "SPEC" : "DEAD");
  game.dom.ammoMax.textContent = weapon.mag;
  game.dom.weaponName.textContent = weapon.label;
  game.dom.ammoCurrent.style.color = game.localPlayerIsAlive
    ? (game.ammo <= lowAmmoThreshold(weapon) && !game.isReloading ? "#ff4444" : "#00ffcc")
    : (game.localPlayerIsSpectating ? "#9aa7b5" : "#ffbb55");
  game.dom.reloadText.style.display = game.isReloading ? "block" : "none";
  game.dom.scoreValue.textContent = game.score;
  game.dom.waveValue.textContent = game.wave || "-";
  game.dom.bossWrap.style.display = bosses.length > 0 ? "block" : "none";

  if (bosses.length > 0) {
    if (bosses.length === 1) {
      game.dom.bossName.textContent = bosses[0].bossName || "TITAN BRUTE";
      game.dom.bossFill.style.width = `${Math.max(0, bosses[0].hp / bosses[0].maxHp) * 100}%`;
    } else {
      const totalHp = bosses.reduce((sum, b) => sum + b.hp, 0);
      const totalMaxHp = bosses.reduce((sum, b) => sum + b.maxHp, 0);
      game.dom.bossName.textContent = "TITAN BOSSES";
      game.dom.bossFill.style.width = `${Math.max(0, totalHp / totalMaxHp) * 100}%`;
    }
  }

  const remotes = Object.values(game.remotePlayers);
  if (remotes.length > 0) {
    game.dom.teammatePanel.innerHTML = remotes.map((r) => {
      const maxHp = game.effectiveMaxHP ?? P_MAX_HP;
      const hpPct = r.isAlive && !r.isDowned
        ? Math.max(0, Math.min(100, ((r.hp ?? maxHp) / maxHp) * 100))
        : 0;
      const statusClass = r.isSpectating ? "spectating" : r.isDowned ? "downed" : "alive";
      const statusText = r.isSpectating ? "SPEC" : r.isDowned ? "DOWN" : "ALIVE";
      return `<div class="teammate-row">
        <div class="teammate-name">${r.playerName || "??"}</div>
        <div class="teammate-hp-bg"><div class="teammate-hp-fill" style="width:${hpPct}%"></div></div>
        <div class="teammate-status ${statusClass}">${statusText}</div>
      </div>`;
    }).join("");
    game.dom.teammatePanel.style.display = "block";
  } else {
    game.dom.teammatePanel.style.display = "none";
  }

  game.dom.inventoryBar.innerHTML = WEAPON_ORDER.map((id, idx) => {
    const def = WEAPON_DEFS[id];
    const isActive = game.currentWeapon === id;
    const shortName = def.label.split(" ").pop();
    return `<div class="inv-slot${isActive ? " active" : ""}">
      <div class="inv-key">${idx + 1}</div>
      <div class="inv-name">${shortName}</div>
    </div>`;
  }).join("");
}

export function showDamage() {
  game.dom.damageOverlay.style.opacity = "0.7";
  window.clearTimeout(game.damageTimeout);
  game.damageTimeout = window.setTimeout(() => {
    game.dom.damageOverlay.style.opacity = "0";
  }, 150);
}

export function showTeammateDownAlert(name) {
  const el = game.dom.teammateAlert;
  el.textContent = `! TEAMMATE DOWN: ${(name || "TEAMMATE").toUpperCase()}`;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  game.teammateAlertPulse = 4;
}

export function showWeaponUnlockAlert(weaponLabel) {
  const el = game.dom.weaponUnlockAlert;
  el.textContent = `${(weaponLabel || "WEAPON").toUpperCase()} UNLOCKED`;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

export function showBossImperviousAlert() {
  const el = game.dom.bossImperviousAlert;
  el.textContent = "ONLY THE PISTOL AND SWORD CAN HURT TITAN BRUTE";
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

export function drawMinimap() {
  const context = game.dom.minimapContext;
  // Use the actual canvas pixel dimensions so nothing is clipped.
  const width = context.canvas.width;
  const height = context.canvas.height;
  const scale = width / ARENA_SIZE;

  if (game.teammateAlertPulse > 0) {
    game.teammateAlertPulse = Math.max(0, game.teammateAlertPulse - game.dt);
  }

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(5,10,15,0.85)";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#2a3344";
  for (const obstacle of game.oBs) {
    context.fillRect(
      (obstacle.min.x + HALF) * scale,
      (obstacle.min.z + HALF) * scale,
      (obstacle.max.x - obstacle.min.x) * scale,
      (obstacle.max.z - obstacle.min.z) * scale,
    );
  }

  for (const enemy of game.enemies) {
    const pingActive = game.enemyPingTmr > 0;
    const pulse = pingActive ? 0.5 + 0.5 * Math.sin((4 - game.enemyPingTmr) * 12) : 0;
    const radius = pingActive ? 3.5 + pulse * 2.5 : 3;
    context.fillStyle = pingActive
      ? (enemy.type === "dog" ? "rgba(255,200,90,0.95)" : enemy.type === "skeleton" ? "rgba(220,230,255,0.95)" : "rgba(255,120,120,0.98)")
      : (enemy.type === "dog" ? "#ff8833" : enemy.type === "skeleton" ? "#c8d4f0" : "#ff3344");

    context.beginPath();
    context.arc((enemy.group.position.x + HALF) * scale, (enemy.group.position.z + HALF) * scale, radius, 0, Math.PI * 2);
    context.fill();

    if (pingActive) {
      context.strokeStyle = enemy.type === "dog" ? "rgba(255,190,80,0.6)" : "rgba(255,90,90,0.65)";
      context.lineWidth = 1.25;
      context.beginPath();
      context.arc(
        (enemy.group.position.x + HALF) * scale,
        (enemy.group.position.z + HALF) * scale,
        radius + 2 + pulse * 3,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
  }

  for (const player of Object.values(game.remotePlayers)) {
    const x = (player.group.position.x + HALF) * scale;
    const y = (player.group.position.z + HALF) * scale;
    const alertActive = game.teammateAlertPulse > 0 && player.isDowned;
    const pulse = alertActive ? 0.5 + 0.5 * Math.sin((4 - game.teammateAlertPulse) * 10) : 0;
    const dotRadius = 3.5 + (alertActive ? pulse * 2.5 : 0);
    context.fillStyle = player.isSpectating
      ? "#9aa7b5"
      : player.isDowned
        ? (alertActive ? `rgba(255,${140 + Math.round(pulse * 60)},80,0.95)` : "#ffbb55")
        : "#66b3ff";
    context.beginPath();
    context.arc(x, y, dotRadius, 0, Math.PI * 2);
    context.fill();
    if (alertActive) {
      context.strokeStyle = "rgba(255,120,60,0.7)";
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(x, y, dotRadius + 3 + pulse * 3, 0, Math.PI * 2);
      context.stroke();
    }
    const initial = (player.playerName || "?").charAt(0).toUpperCase();
    context.fillStyle = "#dfe8f1";
    context.font = "9px Rajdhani";
    context.textAlign = "center";
    context.fillText(initial, x, y - 6);
  }

  const player = game.visuals.player.playerGroup.position;
  const px = (player.x + HALF) * scale;
  const py = (player.z + HALF) * scale;
  context.fillStyle = "#00ffaa";
  context.beginPath();
  context.arc(px, py, 4, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "#00ffaa";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(px, py);
  context.lineTo(px - Math.sin(game.camTheta) * 8, py - Math.cos(game.camTheta) * 8);
  context.stroke();
}

export function showRankings(rankings) {
  let finalRankings = rankings;
  if (!finalRankings) {
    finalRankings = [
      {
        playerName: game.playerName,
        playerId: game.socket?.id,
        score: game.score,
        kills: game.stats.kills + game.stats.dogKills + game.stats.bossKills,
        wave: game.wave,
        status: game.localPlayerIsSpectating ? "SPECTATING" : "DEAD",
      },
      ...Object.entries(game.remotePlayers).map(([id, player]) => ({
        playerName: player.playerName || `Player ${id.slice(0, 8)}`,
        playerId: id,
        score: player.score || 0,
        kills: player.totalKills || player.kills || 0,
        wave: player.wave || game.wave,
        status: player.isSpectating ? "SPECTATING" : player.isDowned ? "DOWNED" : "DEAD",
      })),
    ].sort((left, right) => right.score - left.score);
  }

  const rows = finalRankings.map((player, index) => {
    const isYou = player.playerId === game.socket?.id || player.playerId === game.socket?.id?.slice(0, 8);
    const statusClass = player.status === "DOWNED"
      ? "downed"
      : player.status === "SPECTATING"
        ? "spectating"
        : "dead";
    return `
      <tr class="${isYou ? "is-you" : ""}">
        <td class="rankings-rank">${index + 1}</td>
        <td class="rankings-name ${isYou ? "is-you" : ""}">${player.playerName || player.playerId}${isYou ? " (YOU)" : ""}</td>
        <td class="center">${player.score || 0}</td>
        <td class="center">${player.kills || 0}</td>
        <td class="center">${player.wave || game.wave}</td>
        <td class="center rankings-status ${statusClass}">${player.status}</td>
      </tr>
    `;
  }).join("");

  game.dom.rankingsContent.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>RANK</th>
          <th>PLAYER</th>
          <th class="center">SCORE</th>
          <th class="center">TOTAL KILLS</th>
          <th class="center">WAVES</th>
          <th class="center">STATUS</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  game.dom.gameOverTitle.textContent = "MISSION REPORT";
  game.dom.gameOverSubtitle.textContent = "Final stats and team standings";
  game.dom.rankingsSection.hidden = false;
}

export function showPvPRankings(rankings, winnerId) {
  const rows = rankings.map((player, index) => {
    const isYou = player.playerId === game.socket?.id;
    const isWinner = player.playerId === winnerId;
    return `
      <tr class="${isYou ? "is-you" : ""} ${isWinner ? "is-winner" : ""}">
        <td class="rankings-rank">${index + 1}</td>
        <td class="rankings-name ${isYou ? "is-you" : ""}">${player.playerName || player.playerId}${isYou ? " (YOU)" : ""}${isWinner ? " <span style='color:#ffcc33'>WINNER</span>" : ""}</td>
        <td class="center">${player.kills || 0}</td>
        <td class="center">${player.swordKills || 0}</td>
        <td class="center">${player.weaponsUnlocked || 1}/5</td>
      </tr>
    `;
  }).join("");

  game.dom.rankingsContent.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>RANK</th>
          <th>PLAYER</th>
          <th class="center">KILLS</th>
          <th class="center">SWORD KILLS</th>
          <th class="center">WEAPONS UNLOCKED</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  game.dom.gameOverTitle.textContent = winnerId === game.socket?.id ? "VICTORY" : "MATCH COMPLETE";
  game.dom.gameOverSubtitle.textContent = "Gun-game standings";
  game.dom.rankingsSection.hidden = false;
  game.dom.statsGrid.style.display = "none";
}

export function hideRankings() {
  game.dom.gameOverTitle.textContent = "K.I.A.";
  game.dom.gameOverSubtitle.textContent = "Mission failed";
  game.dom.rankingsSection.hidden = true;
  game.dom.rankingsContent.innerHTML = "";
  game.dom.statsGrid.style.display = "";
}
