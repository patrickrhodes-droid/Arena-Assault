import { ARENA_SIZE, CHARACTERS, HALF, MAP_DEFS, P_MAX_HP, PVP_WIN_KILLS, WEAPON_DEFS, WEAPON_ORDER } from "./config.js";
import { game } from "./state.js";
import { getWeapon, lowAmmoThreshold } from "./combat.js";
import { getBossEnemies } from "./enemies.js";
import { applyCharacterHead, rebuildArena } from "./scene.js";
import { setCharacterPreview, stopCharacterPreview, paintAllCharacterPreviews, initCharCardAnimations, setSelectedCharCard } from "./story.js";
import { renderCareerStatsInto } from "./features.js";

export function cacheDom() {
  game.dom = {
    gameContainer: document.getElementById("game-container"),
    menu: document.getElementById("screen-player"), // kept as alias
    screenConnect: document.getElementById("screen-connect"),
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
    gpSensSlider: document.getElementById("gp-sens-slider"),
    gpSensVal: document.getElementById("gp-sens-val"),
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
    startMissionBtn: document.getElementById("start-mission-btn"),
    modeCards: document.querySelectorAll(".mode-card"),
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
    ffaMatchBtn: document.getElementById("ffa-match-btn"),
    ffaTimeWrap: document.getElementById("ffa-time-wrap"),
    ffaDurationSelect: document.getElementById("ffa-duration-select"),
    ffaScore: document.getElementById("ffa-score"),
    ffaKillsEl: document.getElementById("ffa-kills"),
    ffaRankEl: document.getElementById("ffa-rank"),
    ffaHud: document.getElementById("ffa-hud"),
    ffaPosition: document.getElementById("ffa-position"),
    ffaTimer: document.getElementById("ffa-timer"),
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
    statusSprint: document.getElementById("status-sprint"),
    statusCrouch: document.getElementById("status-crouch"),
    grappleReadyLabel: document.getElementById("grapple-ready-label"),
    grappleCooldownFill: document.getElementById("grapple-cooldown-bar-fill"),
    killFeed: document.getElementById("kill-feed"),
    waveClear: document.getElementById("wave-clear"),
    giveUpBtn: document.getElementById("give-up-btn"),
    passwordOverlay: document.getElementById("password-overlay"),
    passwordEntry: document.getElementById("password-entry"),
    passwordSubmitBtn: document.getElementById("password-submit-btn"),
    passwordError: document.getElementById("password-error"),
    roomPasswordInput: document.getElementById("room-password-input"),
    leaderboardBtn: document.getElementById("leaderboard-btn"),
    leaderboardSection: document.getElementById("leaderboard-section"),
    leaderboardContent: document.getElementById("leaderboard-content"),
    lobbyBg: document.getElementById("lobby-bg"),
    pauseGiveUpBtn: document.getElementById("pause-give-up-btn"),
    dmgDir: document.getElementById("dmg-dir"),
    waveEnemyBar: document.getElementById("wave-enemy-bar"),
    waveEnemyCount: document.getElementById("wave-enemy-count"),
    bossPhaseLabel: document.getElementById("boss-phase-label"),
    scorePopups: document.getElementById("score-popups"),
    vignette: document.getElementById("vignette"),
    landingFlash: document.getElementById("landing-flash"),
    lobbyCanvas: document.getElementById("lobby-canvas"),
    barrelWarning: document.getElementById("barrel-warning"),
    pingDisplay: document.getElementById("ping-display"),
    lobbyChatPanel: document.getElementById("lobby-chat-panel"),
    lobbyChatLog: document.getElementById("lobby-chat-log"),
    lobbyChatInput: document.getElementById("lobby-chat-input"),
  };

  game.dom.minimapContext = game.dom.minimap.getContext("2d");
}

function showScreen(id) {
  ["screen-connect", "screen-player", "screen-map"].forEach((s) => {
    document.getElementById(s)?.classList.toggle("active", s === id);
  });
}

function applyMapScreenRole() {
  const hostSection = document.getElementById('host-map-section');
  const guestSection = document.getElementById('guest-map-section');
  if (hostSection) hostSection.style.display = game.isHost ? 'block' : 'none';
  if (guestSection) guestSection.style.display = game.isHost ? 'none' : 'block';
  if (game.isHost) {
    // Always keep start buttons hidden until a mode card is explicitly clicked
    if (game.dom.startMissionBtn) game.dom.startMissionBtn.hidden = true;
    if (game.dom.pvpMatchBtn) game.dom.pvpMatchBtn.hidden = true;
    if (game.dom.ffaMatchBtn) game.dom.ffaMatchBtn.hidden = true;
    // Re-sync visual state if a mode was already selected (e.g. navigating back)
    if (game.selectedGameMode) applyModeSelection(game.selectedGameMode);
    // PvP modes only available with 2+ players
    const solo = Object.keys(game.remotePlayers).length === 0;
    const pvpCard = document.querySelector('.mode-card[data-mode="pvp"]');
    if (pvpCard) pvpCard.hidden = solo;
    const ffaCard = document.querySelector('.mode-card[data-mode="ffa"]');
    if (ffaCard) ffaCard.hidden = solo;
  }
  // Refresh campaign locks every render so a freshly unlocked character
  // becomes selectable as soon as the player returns to the lobby.
  updateLobbyCharacterLocks();
  renderJoinLinkControls();
}

function applyModeSelection(mode) {
  const isCampaign = mode === 'campaign';
  const isPvP = mode === 'pvp';
  const isFFA = mode === 'ffa';
  const mapWrap = document.getElementById('map-grid-wrap');
  if (mapWrap) mapWrap.style.display = isCampaign ? 'none' : 'block';
  if (game.dom.startMissionBtn) game.dom.startMissionBtn.hidden = isPvP || isFFA;
  if (game.dom.pvpMatchBtn) game.dom.pvpMatchBtn.hidden = !isPvP;
  if (game.dom.ffaMatchBtn) game.dom.ffaMatchBtn.hidden = !isFFA;
  if (game.dom.ffaTimeWrap) game.dom.ffaTimeWrap.style.display = isFFA ? 'block' : 'none';
  updateLobbyCharacterLocks(mode);
  // Refresh the host's "Start At Wave" dropdown to match the chosen mode.
  populateWaveSelect(mode);
}

// Rebuilds the #skip-wave-select dropdown contents for the current game mode.
// Campaign mode lists "Arena W1..W7, Desert W1..W7, City W1..W7, Blacksite W1..W7";
// other modes list plain wave numbers 1-30.
function populateWaveSelect(mode) {
  const sel = game.dom?.skipWaveSelect;
  if (!sel) return;
  sel.innerHTML = "";
  if (mode === "campaign") {
    const MAPS = [
      { idx: 0, label: "Arena" },
      { idx: 1, label: "Desert" },
      { idx: 2, label: "City" },
      { idx: 3, label: "Blacksite" },
    ];
    for (const { idx, label } of MAPS) {
      for (let w = 1; w <= 7; w += 1) {
        const opt = document.createElement("option");
        opt.value = `${idx}:${w}`;
        opt.textContent = `${label} W${w}`;
        sel.appendChild(opt);
      }
    }
    // Default selection — first wave of the first map
    sel.value = "0:1";
    game.startingMapIndex = 0;
    game.startingWave = 1;
  } else {
    for (let w = 1; w <= 30; w += 1) {
      const opt = document.createElement("option");
      opt.value = String(w);
      opt.textContent = String(w);
      sel.appendChild(opt);
    }
    sel.value = "1";
    game.startingMapIndex = 0;
    game.startingWave = 1;
  }
}

// Locks Will/Matt cards in the lobby character grid until they've been unlocked
// (introduced during the campaign after beating the Arena map). Non-campaign
// modes leave every operator selectable.
//
// In campaign mode the lock state is forced to the baseline (iestyn + patrick)
// when starting from Arena, regardless of localStorage — so a player who has
// unlocked Will/Matt in a previous run still has to "meet" them again on a
// fresh campaign start. If the host has used the wave dropdown to jump past
// Arena (startingMapIndex >= 1), the persisted unlock state is honoured.
export function updateLobbyCharacterLocks(mode = game.selectedGameMode) {
  const isCampaign = mode === 'campaign';
  const startingPastArena = (game.startingMapIndex || 0) >= 1;
  let effectiveUnlocked;
  if (!isCampaign) {
    effectiveUnlocked = new Set(["iestyn", "patrick", "will", "matt"]);
  } else if (startingPastArena) {
    // Host has chosen to skip past the arena intro — the player would have
    // met Matt and Will by then, so they're playable.
    effectiveUnlocked = new Set(["iestyn", "patrick", "will", "matt"]);
  } else {
    // Fresh campaign run — only the starter pair, regardless of any unlock
    // state persisted from a previous playthrough.
    effectiveUnlocked = new Set(["iestyn", "patrick"]);
  }
  game.dom.characterCards.forEach((card) => {
    const charId = card.dataset.character;
    const isLocked = isCampaign && !effectiveUnlocked.has(charId);
    card.classList.toggle("locked", isLocked);
    const nameEl = card.querySelector(".character-name");
    if (nameEl) {
      if (isLocked) {
        if (!nameEl.dataset.origName) nameEl.dataset.origName = nameEl.textContent;
        nameEl.textContent = "🔒 LOCKED";
      } else if (nameEl.dataset.origName) {
        nameEl.textContent = nameEl.dataset.origName;
      }
    }
    // If currently-selected character is now locked, clear the selection
    if (isLocked && game.myCharacter === charId) {
      game.myCharacter = null;
      card.classList.remove("selected");
    }
  });
}

// ── Lobby settings overlay ────────────────────────────────────────────────────
// Reuses the pause panel but hides game-only controls and shows a Close button.

function openLobbySettings() {
  const panel = document.getElementById("pause-panel");
  const title = document.getElementById("pause-title");
  const closeBtn = document.getElementById("settings-close-btn");
  if (panel) panel.classList.add("lobby-mode");
  if (title) title.textContent = "SETTINGS";
  if (closeBtn) closeBtn.style.display = "";
  if (game.dom.pause) game.dom.pause.style.display = "flex";
}

function closeLobbySettings() {
  const panel = document.getElementById("pause-panel");
  const title = document.getElementById("pause-title");
  const closeBtn = document.getElementById("settings-close-btn");
  if (panel) panel.classList.remove("lobby-mode");
  if (title) title.textContent = "PAUSED";
  if (closeBtn) closeBtn.style.display = "none";
  if (game.dom.pause) game.dom.pause.style.display = "none";
}

// ── LAN connection screen ─────────────────────────────────────────────────────

export function bindConnectScreen() {
  // If accessed via a non-localhost address the user already picked a server —
  // jump straight to the lobby.
  const h = window.location.hostname;
  if (h !== 'localhost' && h !== '127.0.0.1') {
    showScreen('screen-player');
    return;
  }

  const selfDetail = document.getElementById('connect-self-detail');
  const selfIp     = document.getElementById('connect-self-ip');
  const listEl     = document.getElementById('lan-server-list');
  const playBtn    = document.getElementById('btn-play-here');
  const refreshBtn = document.getElementById('btn-refresh-lan');

  playBtn?.addEventListener('click', () => showScreen('screen-player'));

  // Back button on the operator/ready-up screen → return to the LAN list.
  document.getElementById('back-to-connect-btn')?.addEventListener('click', () => {
    showScreen('screen-connect');
  });

  function renderServer(s) {
    const stateLabel = s.state === 'IN GAME' ? `Wave ${s.wave}` : 'LOBBY';
    const mapLabel   = s.map ? ` · ${s.map.toUpperCase()}` : '';
    const div = document.createElement('div');
    div.className = 'lan-server-entry';
    div.innerHTML = `
      <div class="lan-server-info">
        <div class="lan-server-name">${s.name || s.ip}</div>
        <div class="lan-server-detail">${s.players}/4 players · ${stateLabel}${mapLabel}</div>
      </div>
      <button class="lan-join-btn">JOIN</button>`;
    div.querySelector('.lan-join-btn').addEventListener('click', () => {
      window.location.href = s.url;
    });
    return div;
  }

  async function refresh() {
    // Load self info
    try {
      const self = await fetch('/api/self').then(r => r.json());
      const stateLabel = self.state === 'IN GAME' ? `Wave ${self.wave}` : 'LOBBY';
      if (selfDetail) selfDetail.textContent = `${self.players}/4 players · ${stateLabel}`;
      if (selfIp && self.ips?.length) {
        selfIp.textContent = `Share: ${self.ips.map(ip => `${ip}:${self.port}`).join('  ·  ')}`;
      }
    } catch { if (selfDetail) selfDetail.textContent = 'Server running'; }

    // Load discovered LAN servers
    try {
      const servers = await fetch('/api/lan-servers').then(r => r.json());
      if (!listEl) return;
      listEl.innerHTML = '';
      if (!servers.length) {
        listEl.innerHTML = '<div class="lan-status">No games found on this network</div>';
      } else {
        servers.forEach(s => listEl.appendChild(renderServer(s)));
      }
    } catch {
      if (listEl) listEl.innerHTML = '<div class="lan-status lan-error">Could not scan network</div>';
    }
  }

  refreshBtn?.addEventListener('click', refresh);
  refresh();
  const _poll = setInterval(() => {
    if (!document.getElementById('screen-connect')?.classList.contains('active')) {
      clearInterval(_poll);
      return;
    }
    refresh();
  }, 3000);
}

export function bindMenuControls(actions) {
  const { audioInit, startMatch, readyUp, toggleView, updateSensitivity, updatePlayerName, reloadPage, copyJoinLink } = actions;

  // ── Ready Up button (screen-player) — character is chosen right before playing ──
  game.dom.deployBtn.addEventListener("click", () => {
    const name = game.dom.playerName.value.trim();
    if (!name) {
      game.dom.playerName.style.borderColor = "var(--danger)";
      game.dom.playerName.placeholder = "Name required!";
      return;
    }
    audioInit();
    game.audio?.uiConfirm?.();
    readyUp();
    game.dom.deployBtn.disabled = true;
    game.dom.deployBtn.style.opacity = "0.5";
    game.dom.deployBtn.textContent = "READY ✓";
    showScreen("screen-map");
    applyMapScreenRole();
  });

  // ── Mode selection cards ──
  if (game.dom.modeCards) {
    game.dom.modeCards.forEach((card) => {
      card.addEventListener("click", () => {
        if (!game.isHost) return;
        const mode = card.dataset.mode;
        if (!mode) return;
        game.dom.modeCards.forEach(c => c.classList.toggle("selected", c === card));
        game.selectedGameMode = mode;
        applyModeSelection(mode);
        game.socket?.emit("hostSelectMode", { gameMode: mode });
      });
    });
  }

  // ── Map cards ──
  game.dom.mapCards.forEach((card) => {
    card.addEventListener("click", () => {
      if (!game.isHost) return;
      if (game.selectedGameMode === 'campaign') return; // campaign auto-selects maps
      const mapId = card.dataset.map;
      if (!mapId) return;
      game.selectedMap = mapId;
      syncMapCards(mapId);
      game.socket?.emit("hostSelectMap", { map: mapId });
      updateMapChosenLabel(mapId);
    });
  });

  // ── Start Mission button (screen-map, host only) ──
  if (game.dom.startMissionBtn) {
    game.dom.startMissionBtn.addEventListener("click", () => {
      if (!game.isHost) return;
      audioInit();
      game.matchStarting = true;
      renderJoinLinkControls();
      startMatch();
    });
  }

  if (game.dom.pvpMatchBtn) {
    game.dom.pvpMatchBtn.addEventListener("click", () => {
      if (!game.isHost) return;
      audioInit();
      game.matchStarting = true;
      renderJoinLinkControls();
      game.socket?.emit("startPvPMatch");
    });
  }

  if (game.dom.ffaMatchBtn) {
    game.dom.ffaMatchBtn.addEventListener("click", () => {
      if (!game.isHost) return;
      audioInit();
      const duration = parseInt(game.dom.ffaDurationSelect?.value || "300", 10);
      game.matchStarting = true;
      renderJoinLinkControls();
      game.socket?.emit("startFFAMatch", { duration });
    });
  }

  game.dom.resumeBtn.addEventListener("click", actions.resumeGame);
  game.dom.exitBtn.addEventListener("click", reloadPage);
  game.dom.redeployBtn.addEventListener("click", reloadPage);
  if (game.dom.giveUpBtn) {
    game.dom.giveUpBtn.addEventListener("click", () => {
      if (game.localPlayerIsDowned) actions.enterSpectatorMode?.();
    });
  }

  if (game.dom.pauseGiveUpBtn) {
    game.dom.pauseGiveUpBtn.addEventListener("click", () => {
      game.dom.pause.style.display = "none";
      actions.gameOver();
    });
  }

  // ── Career stats modal (lifetime totals from localStorage) ────────────────
  const careerModal     = document.getElementById("career-stats-modal");
  const careerBody      = document.getElementById("career-stats-body");
  const careerCloseBtn  = document.getElementById("career-stats-close");
  const careerLobbyBtn  = document.getElementById("career-stats-btn");
  const pauseCareerBtn  = document.getElementById("pause-career-btn");
  function openCareerModal() {
    // Prefer the server-pushed career data (game.career) over localStorage
    // when the player has a registered name; falls back inside the helper.
    renderCareerStatsInto(careerBody, game.career);
    if (careerModal) careerModal.classList.add("open");
  }
  function closeCareerModal() {
    if (careerModal) careerModal.classList.remove("open");
  }
  careerLobbyBtn?.addEventListener("click", openCareerModal);
  pauseCareerBtn?.addEventListener("click", openCareerModal);
  careerCloseBtn?.addEventListener("click", closeCareerModal);
  careerModal?.addEventListener("click", (e) => {
    // Backdrop click closes; clicks inside the panel don't.
    if (e.target === careerModal) closeCareerModal();
  });

  // Room password: host input — debounce emit to server
  if (game.dom.roomPasswordInput) {
    let pwDebounce = null;
    game.dom.roomPasswordInput.addEventListener("input", () => {
      clearTimeout(pwDebounce);
      pwDebounce = setTimeout(() => {
        if (game.isHost) {
          game.socket?.emit("hostSetPassword", { password: game.dom.roomPasswordInput.value.trim() });
        }
      }, 600);
    });
  }

  // Password prompt for non-hosts joining a locked room
  if (game.dom.passwordSubmitBtn) {
    const submitPw = () => {
      const pw = (game.dom.passwordEntry?.value || "").trim();
      if (!pw) return;
      game.socket?.emit("submitPassword", { password: pw });
    };
    game.dom.passwordSubmitBtn.addEventListener("click", submitPw);
    game.dom.passwordEntry?.addEventListener("keydown", (e) => { if (e.key === "Enter") submitPw(); });
  }
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

  // ── Controller sensitivity slider ─────────────────────────────────────────
  if (game.dom.gpSensSlider) {
    try {
      const saved = localStorage.getItem("arena_gp_sens");
      if (saved !== null) {
        game.dom.gpSensSlider.value = saved;
        game.gpSens = Number(saved) * 0.5;
        if (game.dom.gpSensVal) game.dom.gpSensVal.textContent = saved;
      }
    } catch {}
    game.dom.gpSensSlider.addEventListener("input", () => {
      const v = Number(game.dom.gpSensSlider.value);
      game.gpSens = v * 0.5;
      if (game.dom.gpSensVal) game.dom.gpSensVal.textContent = v;
      try { localStorage.setItem("arena_gp_sens", v); } catch {}
    });
  }

  // ── Audio volume sliders ──────────────────────────────────────────────────
  const volMaster  = document.getElementById("vol-master");
  const volMusic   = document.getElementById("vol-music");
  const volSfx     = document.getElementById("vol-sfx");
  const volMasterV = document.getElementById("vol-master-val");
  const volMusicV  = document.getElementById("vol-music-val");
  const volSfxV    = document.getElementById("vol-sfx-val");

  function syncVolSliders() {
    const v = game.audio?.getVolumes?.();
    if (!v) return;
    if (volMaster) { volMaster.value = Math.round(v.master * 100); if (volMasterV) volMasterV.textContent = volMaster.value; }
    if (volMusic)  { volMusic.value  = Math.round(v.music  * 100); if (volMusicV)  volMusicV.textContent  = volMusic.value; }
    if (volSfx)    { volSfx.value    = Math.round(v.sfx    * 100); if (volSfxV)    volSfxV.textContent    = volSfx.value; }
  }
  syncVolSliders();

  function applyVolumes() {
    const m  = (volMaster?.value  ?? 80) / 100;
    const mu = (volMusic?.value   ?? 60) / 100;
    const s  = (volSfx?.value     ?? 80) / 100;
    if (volMasterV) volMasterV.textContent = Math.round(m  * 100);
    if (volMusicV)  volMusicV.textContent  = Math.round(mu * 100);
    if (volSfxV)    volSfxV.textContent    = Math.round(s  * 100);
    game.audio?.setVolumes?.(m, mu, s);
  }

  [volMaster, volMusic, volSfx].forEach((el) => el?.addEventListener("input", applyVolumes));

  // ── Graphics quality toggles ──────────────────────────────────────────────
  function applyGraphicsSetting(key, value) {
    if (key === "shadows") {
      if (game.renderer) {
        game.renderer.shadowMap.enabled = value;
        if (value) game.renderer.shadowMap.needsUpdate = true;
      }
    } else if (key === "particles") {
      game.particlesEnabled = value;
    }
    try { localStorage.setItem(`arena_${key}`, value ? "1" : "0"); } catch {}
  }

  const settingShadows   = document.getElementById("setting-shadows");
  const settingParticles = document.getElementById("setting-particles");

  if (settingShadows) {
    // Load persisted value
    const saved = (() => { try { return localStorage.getItem("arena_shadows"); } catch { return null; } })();
    if (saved === "0") settingShadows.checked = false;
    settingShadows.addEventListener("change", function () {
      applyGraphicsSetting("shadows", this.checked);
    });
  }

  if (settingParticles) {
    const saved = (() => { try { return localStorage.getItem("arena_particles"); } catch { return null; } })();
    if (saved === "0") settingParticles.checked = false;
    settingParticles.addEventListener("change", function () {
      applyGraphicsSetting("particles", this.checked);
    });
  }

  // Apply stored values to the game engine (defer one tick so renderer is ready)
  requestAnimationFrame(() => {
    try {
      if (localStorage.getItem("arena_shadows") === "0")   applyGraphicsSetting("shadows",   false);
      if (localStorage.getItem("arena_particles") === "0") applyGraphicsSetting("particles", false);
    } catch {}
  });

  // ── Crosshair style ───────────────────────────────────────────────────────
  const settingCrosshair = document.getElementById("setting-crosshair");
  function applyCrosshairStyle(style) {
    const ch = document.getElementById("crosshair");
    if (!ch) return;
    // Strip any previously-applied xh-style-* class
    [...ch.classList].forEach((c) => { if (c.startsWith("xh-style-")) ch.classList.remove(c); });
    if (style && style !== "default") ch.classList.add(`xh-style-${style}`);
    try { localStorage.setItem("arena_crosshair_style", style || "default"); } catch {}
  }
  if (settingCrosshair) {
    const saved = (() => { try { return localStorage.getItem("arena_crosshair_style"); } catch { return null; } })();
    if (saved) settingCrosshair.value = saved;
    applyCrosshairStyle(settingCrosshair.value);
    settingCrosshair.addEventListener("change", function () {
      applyCrosshairStyle(this.value);
    });
  }

  // ── Damage numbers toggle ─────────────────────────────────────────────────
  const settingDmgNumbers = document.getElementById("setting-damage-numbers");
  if (settingDmgNumbers) {
    const saved = (() => { try { return localStorage.getItem("arena_damage_numbers"); } catch { return null; } })();
    if (saved === "0") settingDmgNumbers.checked = false;
    game.damageNumbersEnabled = settingDmgNumbers.checked;
    settingDmgNumbers.addEventListener("change", function () {
      game.damageNumbersEnabled = this.checked;
      try { localStorage.setItem("arena_damage_numbers", this.checked ? "1" : "0"); } catch {}
    });
  }

  // Sync sliders when pause opens
  game.dom.resumeBtn.addEventListener("mouseenter", syncVolSliders, { once: false });
  game.dom.playerName.addEventListener("input", updatePlayerName);
  game.dom.copyJoinLinkBtn.addEventListener("click", copyJoinLink);

  // Populate the wave selector based on the current game mode. Endless lists
  // 1-30; campaign lists each map's 7 waves prefixed by the map name so the
  // host can jump straight to e.g. "Desert W3".
  populateWaveSelect(game.selectedGameMode || "endless");

  game.dom.skipWaveSelect.addEventListener("change", () => {
    const raw = game.dom.skipWaveSelect.value;
    if (raw.includes(":")) {
      // Campaign option format "mapIdx:wave"
      const [mapIdx, wave] = raw.split(":").map(Number);
      game.startingMapIndex = mapIdx;
      game.startingWave = wave;
    } else {
      game.startingMapIndex = 0;
      game.startingWave = Number(raw) || 1;
    }
    // The lobby char-select lock state depends on startingMapIndex (jumping
    // past arena unlocks Will/Matt), so refresh the cards.
    updateLobbyCharacterLocks();
  });

  game.dom.invincibilityToggle.addEventListener("change", () => {
    game.invincibilityMode = game.dom.invincibilityToggle.checked;
    if (game.isHost) {
      game.socket?.emit("hostSetInvincibility", { enabled: game.invincibilityMode });
    }
  });

  // ── Lobby settings (⚙ buttons on player / map screens) ─────────────────────
  document.querySelectorAll(".lobby-settings-trigger").forEach((btn) => {
    btn.addEventListener("click", openLobbySettings);
  });
  const settingsCloseBtn = document.getElementById("settings-close-btn");
  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener("click", closeLobbySettings);
  }

  if (game.dom.leaderboardBtn) {
    game.dom.leaderboardBtn.addEventListener("click", () => {
      const sec = game.dom.leaderboardSection;
      if (!sec.hidden) { sec.hidden = true; return; }
      fetch("/api/leaderboard")
        .then((r) => r.json())
        .then((lb) => {
          const coopRows = (lb.coop || []).map((e, i) =>
            `<tr><td>${i + 1}</td><td>${e.playerName}</td><td class="center">${e.score}</td><td class="center">${e.wave}</td><td class="center">${e.kills}</td><td>${e.date}</td></tr>`
          ).join("") || "<tr><td colspan='6' style='text-align:center;color:var(--muted)'>No entries yet</td></tr>";
          const pvpRows = (lb.pvp || []).map((e, i) =>
            `<tr><td>${i + 1}</td><td>${e.playerName}</td><td class="center">${e.kills}</td><td>${e.date}</td></tr>`
          ).join("") || "<tr><td colspan='4' style='text-align:center;color:var(--muted)'>No entries yet</td></tr>";
          game.dom.leaderboardContent.innerHTML = `
            <h3 style="color:var(--warn);letter-spacing:2px;margin:12px 0 6px">CO-OP HIGH SCORES</h3>
            <table><thead><tr><th>#</th><th>PLAYER</th><th class="center">SCORE</th><th class="center">WAVE</th><th class="center">KILLS</th><th>DATE</th></tr></thead>
            <tbody>${coopRows}</tbody></table>
            <h3 style="color:var(--accent);letter-spacing:2px;margin:16px 0 6px">PVP LEADERBOARD</h3>
            <table><thead><tr><th>#</th><th>PLAYER</th><th class="center">KILLS</th><th>DATE</th></tr></thead>
            <tbody>${pvpRows}</tbody></table>`;
          sec.hidden = false;
        })
        .catch(() => { game.dom.leaderboardContent.innerHTML = "<p style='color:var(--warn)'>Could not load leaderboard.</p>"; sec.hidden = false; });
    });
  }

  // ── UI sound delegation — lobby screens only, not during gameplay ─────────
  document.addEventListener("click", (e) => {
    if (game.state === "PLAYING") return;
    if (e.target.closest("button, summary, .mode-card, .map-card, .lan-join-btn")) {
      game.audio?.uiClick?.();
    }
  }, true);

  document.addEventListener("mouseover", (e) => {
    if (game.state === "PLAYING") return;
    const btn = e.target.closest("button, .mode-card, .map-card, .lan-join-btn");
    if (btn && btn !== document._lastHoveredBtn) {
      document._lastHoveredBtn = btn;
      game.audio?.uiHover?.();
    }
  }, true);

  document.addEventListener("mouseout", (e) => {
    if (e.target === document._lastHoveredBtn) document._lastHoveredBtn = null;
  }, true);

  // Toggles and selects → switch sound
  document.addEventListener("change", (e) => {
    if (game.state === "PLAYING") return;
    if (e.target.matches("input[type='checkbox'], select, input[type='range']")) {
      game.audio?.uiSwitch?.();
    }
  }, true);
}

export function syncMapCards(mapId) {
  game.dom.mapCards.forEach((c) => {
    c.classList.toggle("selected", c.dataset.map === mapId);
  });
  if (mapId && game.state === "MENU") {
    if (game.dom.lobbyBg) game.dom.lobbyBg.style.display = "none";
    rebuildArena(mapId);
  }
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

    // Server pushes a { socketId: level } map after every level change.
    // Level is gated behind a non-empty playerName so it's safe to show here.
    const level = game.playerLevels?.[player.playerId];
    const levelBadge = (typeof level === "number" && level > 0)
      ? `<span class="lobby-level">Lv ${level}</span> `
      : "";

    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `<span>${levelBadge}${displayName} ${player.isHost ? '<span style="color:var(--muted);font-size:11px">(HOST)</span>' : ""} ${characterLabel}</span>
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

  // Ready button: only name required — character is picked right before playing
  if (!localPlayer.isReady) {
    game.dom.deployBtn.disabled = !hasName;
    game.dom.deployBtn.style.opacity = hasName ? "1" : "0.5";
    game.dom.deployBtn.textContent = "READY UP";
  }

  // Hide PvP mode cards when only 1 player in lobby
  const pvpCard = document.querySelector('.mode-card[data-mode="pvp"]');
  if (pvpCard) pvpCard.hidden = playerCount < 2;
  const ffaCard2 = document.querySelector('.mode-card[data-mode="ffa"]');
  if (ffaCard2) ffaCard2.hidden = playerCount < 2;

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
  const shouldShow =
    game.state === "MENU"
    && !game.matchStarting
    && game.canCopyJoinLink
    && Boolean(game.joinLink);
  game.dom.joinLinkBox.hidden = !shouldShow;
  game.dom.copyJoinLinkStatus.textContent = game.copyJoinLinkMessage || "";
}

export function updateHUD() {
  const weapon = getWeapon();
  const bosses = getBossEnemies();
  const percent = Math.max(0, game.hp / game.effectiveMaxHP);
  game.dom.hpFill.style.width = `${percent * 100}%`;
  game.dom.hpText.textContent = Math.ceil(game.hp);

  // Health bar color: green → yellow → red
  if (percent > 0.6) {
    game.dom.hpFill.style.background = "linear-gradient(90deg,#22bb44,#44ee66)";
  } else if (percent > 0.3) {
    game.dom.hpFill.style.background = "linear-gradient(90deg,#cc8800,#ffcc33)";
  } else {
    game.dom.hpFill.style.background = "linear-gradient(90deg,var(--danger),#ff6644)";
  }

  // Low-health vignette pulse
  if (game.dom.vignette) {
    game.dom.vignette.classList.toggle("low-health", percent < 0.3 && game.state === "PLAYING");
  }

  const isPvP = game.mode === "PVP";
  const isFFA = game.mode === "FFA";
  const isCompetitive = isPvP || isFFA;
  game.dom.pvpScore.hidden = !isPvP;
  if (game.dom.ffaScore) game.dom.ffaScore.hidden = !isFFA;
  // Use style.display explicitly — the element has inline display:flex which can
  // override the [hidden] attribute in some browsers.
  if (game.dom.ffaHud) {
    game.dom.ffaHud.hidden = !isFFA;
    game.dom.ffaHud.style.display = isFFA ? "flex" : "none";
  }
  game.dom.waveDisplay.style.display = isCompetitive ? "none" : "";
  game.dom.inventoryBar.style.display = isPvP ? "none" : "";
  if (isPvP) {
    game.dom.pvpKills.textContent = game.pvpKills;
    game.dom.pvpKillsMax.textContent = PVP_WIN_KILLS;
    const selfKills = game.pvpKills;
    const remoteKillCounts = Object.values(game.remotePlayers).map((r) => r.pvpKills ?? 0);
    const rank = 1 + remoteKillCounts.filter((k) => k > selfKills).length;
    game.dom.pvpRank.textContent = `#${rank}`;
  }
  if (isFFA) {
    const selfKills = game.ffaKills || 0;
    if (game.dom.ffaKillsEl) game.dom.ffaKillsEl.textContent = selfKills;
    const remoteKillCounts = Object.values(game.remotePlayers).map((r) => r.ffaKills ?? 0);
    const rank = 1 + remoteKillCounts.filter((k) => k > selfKills).length;
    const rankText = `#${rank}`;
    if (game.dom.ffaRankEl) game.dom.ffaRankEl.textContent = rankText;
    if (game.dom.ffaPosition) game.dom.ffaPosition.textContent = rankText;
    if (game.dom.ffaTimer) {
      const t = Math.max(0, Math.ceil(game.ffaTimeLeft || 0));
      const mins = Math.floor(t / 60);
      const secs = String(t % 60).padStart(2, "0");
      game.dom.ffaTimer.textContent = `${mins}:${secs}`;
    }
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
      if (game.dom.bossPhaseLabel) {
        game.dom.bossPhaseLabel.textContent = bosses[0].bossPhase2 ? "PHASE 2 — ENRAGED" : "PHASE 1";
        game.dom.bossPhaseLabel.style.color = bosses[0].bossPhase2 ? "#ff5533" : "rgba(255,180,100,0.75)";
      }
    } else {
      const totalHp = bosses.reduce((sum, b) => sum + b.hp, 0);
      const totalMaxHp = bosses.reduce((sum, b) => sum + b.maxHp, 0);
      game.dom.bossName.textContent = "TITAN BOSSES";
      game.dom.bossFill.style.width = `${Math.max(0, totalHp / totalMaxHp) * 100}%`;
      if (game.dom.bossPhaseLabel) game.dom.bossPhaseLabel.textContent = "";
    }
  } else if (game.dom.bossPhaseLabel) {
    game.dom.bossPhaseLabel.textContent = "";
  }

  // Wave enemy progress bar
  if (game.dom.waveEnemyBar && game.dom.waveEnemyCount) {
    const active = game.waveState === "SPAWNING" || game.waveState === "ACTIVE";
    if (active && game.mode !== "PVP") {
      const remaining = game.enemies.length;
      const total = Math.max(game.waveSpawnedTotal, remaining, 1);
      const pct = Math.round(Math.max(0, Math.min(100, ((total - remaining) / total) * 100)));
      game.dom.waveEnemyBar.style.width = `${pct}%`;
      game.dom.waveEnemyCount.textContent = remaining > 0 ? `${remaining} LEFT` : "";
    } else {
      game.dom.waveEnemyBar.style.width = "0%";
      game.dom.waveEnemyCount.textContent = "";
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

  const visibleWeapons = game.mode === 'COOP'
    ? WEAPON_ORDER.filter(id => game.collectedWeapons?.has(id))
    : WEAPON_ORDER;

  game.dom.inventoryBar.innerHTML = visibleWeapons.map((id) => {
    const def = WEAPON_DEFS[id];
    const isActive = game.currentWeapon === id;
    const shortName = def.label.split(" ").pop();
    const slotNum = WEAPON_ORDER.indexOf(id) + 1;
    return `<div class="inv-slot${isActive ? " active" : ""}">
      <div class="inv-key">${slotNum}</div>
      <div class="inv-name">${shortName}</div>
    </div>`;
  }).join("");
}

export function showDamage() {
  game.dom.damageOverlay.style.opacity = "0.7";
  window.clearTimeout(game.damageTimeout);
  game.damageTimeout = window.setTimeout(() => {
    game.dom.damageOverlay.style.opacity = "0";
  }, 80);
}

// ── Kill feed ──────────────────────────────────────────────────────────────────
const KILL_FEED_MAX = 5;
const killFeedTimers = [];

export function pushKillFeed(text, type = "") {
  if (!game.dom.killFeed) return;
  const entry = document.createElement("div");
  entry.className = `kill-entry${type ? ` ${type}` : ""}`;
  entry.textContent = text;
  game.dom.killFeed.appendChild(entry);
  while (game.dom.killFeed.children.length > KILL_FEED_MAX) {
    game.dom.killFeed.removeChild(game.dom.killFeed.firstChild);
  }
  const t = window.setTimeout(() => {
    entry.remove();
  }, 4000);
  killFeedTimers.push(t);
}

// ── Score pop-ups ──────────────────────────────────────────────────────────────
export function showScorePopup(score, type = "") {
  const container = game.dom?.scorePopups;
  if (!container) return;
  const el = document.createElement("div");
  el.className = `score-popup${type === "boss" ? " boss" : type === "dog" ? " dog" : ""}`;
  el.textContent = `+${score}`;
  container.appendChild(el);
  window.setTimeout(() => el.remove(), 1200);
}

// ── Wave-clear banner ──────────────────────────────────────────────────────────
export function showWaveClear(wave) {
  const el = game.dom.waveClear;
  if (!el) return;
  el.textContent = `WAVE ${wave} CLEARED`;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  window.clearTimeout(game._waveClearTimer);
  game._waveClearTimer = window.setTimeout(() => el.classList.remove("show"), 2400);
}

// ── Status indicators (sprint / crouch / grapple cooldown) ────────────────────
export function updateStatusIndicators() {
  if (!game.dom.statusSprint) return;
  game.dom.statusSprint.classList.toggle("active", !!game.isSprinting);
  game.dom.statusCrouch.classList.toggle("active", !!game.isCrouching);

  const cooldown = game.grappleCooldown ?? 0;
  const maxCd = 0.8; // matches GRAPPLE_TUNING.releaseCooldown
  const isReady = cooldown <= 0;
  game.dom.grappleReadyLabel.classList.toggle("ready", isReady);
  game.dom.grappleReadyLabel.textContent = isReady ? "GRAPPLE ✓" : "GRAPPLE";
  game.dom.grappleCooldownFill.style.width = isReady
    ? "100%"
    : `${Math.max(0, (1 - cooldown / maxCd)) * 100}%`;
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

// World units visible from the player in each direction on the minimap.
const MINIMAP_VIEW_RADIUS = 48;

export function drawMinimap() {
  const ctx = game.dom.minimapContext;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  // Pixels per world unit: canvas half-size / view radius
  const scale = cx / MINIMAP_VIEW_RADIUS;

  if (game.teammateAlertPulse > 0) {
    game.teammateAlertPulse = Math.max(0, game.teammateAlertPulse - game.dt);
  }

  const playerPos = game.visuals.player.playerGroup.position;
  // Convert a world position to canvas pixel coordinates (player-centred).
  const toCanvas = (wx, wz) => ({
    x: cx + (wx - playerPos.x) * scale,
    y: cy + (wz - playerPos.z) * scale,
  });

  ctx.clearRect(0, 0, W, H);

  // Circular clip so nothing bleeds outside the round minimap feel.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, cx, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = "rgba(5,10,15,0.88)";
  ctx.fillRect(0, 0, W, H);

  // Obstacles
  ctx.fillStyle = "#2a3344";
  for (const obs of game.oBs) {
    const topLeft = toCanvas(obs.min.x, obs.min.z);
    const w = (obs.max.x - obs.min.x) * scale;
    const h = (obs.max.z - obs.min.z) * scale;
    ctx.fillRect(topLeft.x, topLeft.y, w, h);
  }

  // Enemies — dots for visible, directional arc on rim for off-screen
  const pingActive = game.enemyPingTmr > 0;
  const ping = pingActive ? 0.5 + 0.5 * Math.sin((4 - game.enemyPingTmr) * 12) : 0;

  // Pre-collect off-screen enemies to draw their rim arcs after the dots
  const offScreenEnemies = [];

  for (const enemy of game.enemies) {
    const dx = enemy.group.position.x - playerPos.x;
    const dz = enemy.group.position.z - playerPos.z;
    const worldDist = Math.sqrt(dx * dx + dz * dz);

    if (worldDist > MINIMAP_VIEW_RADIUS) {
      offScreenEnemies.push({ enemy, dx, dz });
      continue;
    }

    const ep = toCanvas(enemy.group.position.x, enemy.group.position.z);
    const r = pingActive ? 3.5 + ping * 2.5 : 3;
    ctx.fillStyle = pingActive
      ? (enemy.type === "dog" ? "rgba(255,200,90,0.95)" : enemy.type === "skeleton" ? "rgba(220,230,255,0.95)" : "rgba(255,120,120,0.98)")
      : (enemy.type === "dog" ? "#ff8833" : enemy.type === "skeleton" ? "#c8d4f0" : "#ff3344");
    ctx.beginPath(); ctx.arc(ep.x, ep.y, r, 0, Math.PI * 2); ctx.fill();
    if (pingActive) {
      ctx.strokeStyle = enemy.type === "dog" ? "rgba(255,190,80,0.6)" : "rgba(255,90,90,0.65)";
      ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.arc(ep.x, ep.y, r + 2 + ping * 3, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Directional rim arcs for off-screen enemies.
  // Each arc illuminates a ~12° segment of the minimap circumference in the
  // direction of the enemy, so you always know where threats are lurking.
  if (offScreenEnemies.length > 0) {
    const rimR = cx - 7;         // just inside the border ring
    const arcHalf = 0.105;       // half-arc ≈ 6°
    const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 320);
    for (const { enemy, dx, dz } of offScreenEnemies) {
      // Canvas angle: +x=east=right, +z=south=down → atan2(dz, dx) is correct.
      const angle = Math.atan2(dz, dx);
      const isBoss = enemy.type === "boss";
      const baseColor = isBoss ? [255, 179, 71]
        : enemy.type === "dog"      ? [255, 136, 51]
        : enemy.type === "skeleton" ? [200, 212, 240]
        : [255, 51, 68];
      const alpha = isBoss ? pulse : 0.85;
      ctx.strokeStyle = `rgba(${baseColor[0]},${baseColor[1]},${baseColor[2]},${alpha})`;
      ctx.lineWidth = isBoss ? 6 : 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx, cy, rimR, angle - arcHalf, angle + arcHalf);
      ctx.stroke();
      // Boss gets a second, wider halo arc
      if (isBoss) {
        ctx.strokeStyle = `rgba(255,179,71,${alpha * 0.35})`;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(cx, cy, rimR, angle - arcHalf * 2.5, angle + arcHalf * 2.5);
        ctx.stroke();
      }
    }
    ctx.lineCap = "butt"; // reset
  }

  // Remote players
  for (const rp of Object.values(game.remotePlayers)) {
    const rpos = toCanvas(rp.group.position.x, rp.group.position.z);
    const alertActive = game.teammateAlertPulse > 0 && rp.isDowned;
    const apulse = alertActive ? 0.5 + 0.5 * Math.sin((4 - game.teammateAlertPulse) * 10) : 0;
    const dr = 3.5 + (alertActive ? apulse * 2.5 : 0);
    ctx.fillStyle = rp.isSpectating ? "#9aa7b5"
      : rp.isDowned ? (alertActive ? `rgba(255,${140 + Math.round(apulse * 60)},80,0.95)` : "#ffbb55")
      : "#66b3ff";
    ctx.beginPath(); ctx.arc(rpos.x, rpos.y, dr, 0, Math.PI * 2); ctx.fill();
    if (alertActive) {
      ctx.strokeStyle = "rgba(255,120,60,0.7)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(rpos.x, rpos.y, dr + 3 + apulse * 3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = "#dfe8f1"; ctx.font = "9px Rajdhani"; ctx.textAlign = "center";
    ctx.fillText((rp.playerName || "?").charAt(0).toUpperCase(), rpos.x, rpos.y - 6);
  }

  // Health packs
  if (game.healthPacks?.length > 0) {
    const bob = 0.5 + 0.5 * Math.sin(performance.now() / 400);
    ctx.fillStyle = `rgba(80,255,140,${0.65 + bob * 0.3})`;
    for (const pack of game.healthPacks) {
      const hp = toCanvas(pack.mesh.position.x, pack.mesh.position.z);
      ctx.fillRect(hp.x - 3, hp.y - 1.5, 6, 3);
      ctx.fillRect(hp.x - 1.5, hp.y - 3, 3, 6);
    }
  }

  // Local player (always at centre)
  ctx.fillStyle = "#00ffaa";
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#00ffaa"; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - Math.sin(game.camTheta) * 9, cy - Math.cos(game.camTheta) * 9);
  ctx.stroke();

  ctx.restore();

  // Border ring
  ctx.strokeStyle = "rgba(0,204,170,0.35)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, cx - 0.5, 0, Math.PI * 2); ctx.stroke();
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

export function showFFARankings(rankings, winnerId) {
  const rows = rankings.map((player, index) => {
    const isYou = player.playerId === game.socket?.id;
    const isWinner = player.playerId === winnerId;
    return `
      <tr class="${isYou ? "is-you" : ""} ${isWinner ? "is-winner" : ""}">
        <td class="rankings-rank">${index + 1}</td>
        <td class="rankings-name ${isYou ? "is-you" : ""}">${player.playerName || player.playerId}${isYou ? " (YOU)" : ""}${isWinner ? " <span style='color:#ffcc33'>WINNER</span>" : ""}</td>
        <td class="center">${player.kills || 0}</td>
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
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  game.dom.gameOverTitle.textContent = winnerId === game.socket?.id ? "VICTORY" : "MATCH COMPLETE";
  game.dom.gameOverSubtitle.textContent = "Free-for-all standings";
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
