import * as THREE from "three";

import { P_MAX_HP, WEAPON_ORDER, WEAPON_DEFS, PVP_KILLS_PER_WEAPON } from "./config.js";
import { game } from "./state.js";
import { collectWeapon, removeWeaponPickup, setWeapon, spawnBullet, spawnHealthPackVisual, spawnParticles, spawnWeaponPickupVisual, triggerDestructible } from "./combat.js";
import { announceWave, createBoss, createMiniBoss, createDog, createSkeleton, createSoldier, handleEnemyDamaged, removeEnemy } from "./enemies.js";
import { applyCharacterHead, createRemotePlayer, rebuildArena, removeRemotePlayer, updateRemotePlayerNametag } from "./scene.js";
import { setJoinLinkState, syncMapCards, updateLobbyUI, showTeammateDownAlert, showPvPRankings, showWeaponUnlockAlert, pushKillFeed, showWaveClear, showScorePopup } from "./ui.js";
import { showCampaignCutscene, showPreGameCharSelect, updateCutsceneReadyStatus, finishCampaignCutscene } from "./story.js";
import { fireBanter } from "./banter.js";
import { registerKillForCombo, resetComboState, bumpCareerStat, recordMatchResult } from "./features.js";

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

  // On connect/reconnect: register the token and — if we left a match marker
  // behind from before a refresh — attempt to rejoin straight back into it.
  game.socket.on("connect", () => {
    if (sessionToken) game.socket.emit("registerToken", { token: sessionToken });
    let activeMatch = null;
    try { activeMatch = JSON.parse(localStorage.getItem("arena_active_match") || "null"); } catch {}
    const haveActiveMatch = game.state === "PLAYING" || !!activeMatch;
    if (sessionToken && haveActiveMatch) {
      game.socket.emit("rejoin", { token: sessionToken });
    }
  });

  // ── Ping round-trip ──────────────────────────────────────────────────────
  game.socket.on("serverPong", (sentAt) => {
    const ms = Math.round(performance.now() - sentAt);
    game.ping = ms;
    const el = game.dom?.pingDisplay;
    if (!el) return;
    el.textContent = `${ms} ms`;
    el.className = ms < 60 ? "good" : ms < 150 ? "ok" : "bad";
  });

  // ── Lobby chat ───────────────────────────────────────────────────────────
  const appendChatRow = (playerName, text, isSelf = false) => {
    const log = game.dom?.lobbyChatLog ?? document.getElementById("lobby-chat-log");
    if (!log) return;
    const row = document.createElement("div");
    row.className = "chat-msg" + (isSelf ? " self" : "");
    const nameSpan = document.createElement("span");
    nameSpan.className = "chat-name";
    nameSpan.textContent = (playerName || "?").slice(0, 20) + ":";
    row.appendChild(nameSpan);
    row.appendChild(document.createTextNode(" " + String(text || "").slice(0, 120)));
    log.appendChild(row);
    while (log.children.length > 40) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  };

  game.socket.on("chatMessage", (data) => {
    // Server broadcasts to everyone EXCEPT the sender (sender shows an
    // optimistic local echo), so any chatMessage we receive is from another
    // player and should always be displayed.
    appendChatRow(data?.playerName, data?.text, false);
  });

  // Bind floating chat panel send button + Enter key
  const chatInput  = document.getElementById("lobby-chat-input");
  const chatSendBtn = document.getElementById("lobby-chat-send");
  if (chatInput && chatSendBtn && !chatSendBtn._chatBound) {
    chatSendBtn._chatBound = true;
    const sendMsg = () => {
      const text = chatInput.value.trim();
      if (!text) return;
      // Optimistic local echo so the message shows up instantly
      const myName = game.dom?.playerName?.value?.trim() || "You";
      appendChatRow(myName, text, true);
      game.socket?.emit("chatMessage", { text });
      chatInput.value = "";
      // Hand focus back to the game during a match so movement keys aren't
      // swallowed by the input; stay focused during the lobby for quick replies.
      if (game.state === "PLAYING") chatInput.blur();
      else chatInput.focus();
    };
    chatSendBtn.addEventListener("click", sendMsg);
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); sendMsg(); }
      e.stopPropagation();
    });

    // Quick-chat preset buttons — click to instantly broadcast a canned line.
    // Each is throttled by the same server-side rate limit (500ms) as typed
    // messages so spamming is naturally bounded.
    document.querySelectorAll("#lobby-chat-quick .qc-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const text = btn.dataset.msg;
        if (!text) return;
        const myName = game.dom?.playerName?.value?.trim() || "You";
        appendChatRow(myName, text, true);
        game.socket?.emit("chatMessage", { text });
      });
    });
  }

  // Room lock status — show password prompt to non-hosts if room is locked.
  game.socket.on("roomInfo", (data) => {
    game.roomLocked = !!data?.locked;
    if (game.roomLocked && !game.isHost) {
      const overlay = game.dom?.passwordOverlay;
      if (overlay) { overlay.style.display = "flex"; }
    }
  });

  game.socket.on("matchStartError", (data) => {
    // Re-show host controls so the host can try again
    game.matchStarting = false;
    const el = document.getElementById("match-start-error");
    if (!el) return;
    el.textContent = data?.reason || "Could not start match.";
    el.style.display = "block";
    clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(() => { el.style.display = "none"; }, 5000);
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

  // Persistent career stats (per username, stored server-side). Pushed when
  // we set our name, after every kill, and at every match end.
  game.socket.on("careerStats", (data) => {
    if (!data) return;
    game.career = data;
    actions.updateHUD?.();
  });

  // Compact { socketId: level } map covering every connected player.
  // Used by the lobby list and remote nameplates to render "[Lv N]".
  game.socket.on("playerLevels", (data) => {
    game.playerLevels = data || {};
    // Re-render nameplates for any remote players whose level changed.
    for (const [id, remote] of Object.entries(game.remotePlayers || {})) {
      const newLevel = game.playerLevels[id];
      if (newLevel !== remote.level) {
        remote.level = newLevel;
        if (typeof remote.refreshNametag === "function") remote.refreshNametag();
      }
    }
  });

  // Full mid-match rejoin: server confirmed our token belongs to the current
  // match and is replaying the player's saved state. Drop into the same
  // start-match flow as a fresh start so the scene gets rebuilt correctly,
  // then overwrite the fields the start function reset to their saved values.
  game.socket.on("stateRestored", async (data) => {
    if (data.map) game.selectedMap = data.map;
    if (data.gameMode) game.gameMode = data.gameMode;
    if (data.character) game.myCharacter = data.character;
    if (data.playerName && game.dom?.playerName) game.dom.playerName.value = data.playerName;
    if (typeof data.isHost === "boolean") game.isHost = data.isHost;

    // Seed collectedWeapons before startGame so the HUD picks them up.
    if (Array.isArray(data.collectedWeapons)) {
      game.collectedWeapons = new Set(data.collectedWeapons);
    }

    // Dispatch to the same start function the normal lobby flow would use.
    const mode = data.mode || "COOP";
    if (mode === "PVP") {
      game.pvpKills = data.pvpKills || 0;
      game.pvpSwordKills = data.pvpSwordKills || 0;
      game.pvpWeaponIdx = data.pvpWeaponIdx || 0;
      await actions.startPvPGame();
    } else if (mode === "FFA") {
      game.ffaKills = data.ffaKills || 0;
      game.ffaTimeLeft = data.ffaTimeLeft || 0;
      await actions.startFFAGame();
    } else {
      // COOP — make sure the wave the server is on isn't overwritten by the
      // start function (it pulls game.wave from server syncWave afterwards).
      game.startingWave = (data.wave || 0) + 1;
      await actions.startGame();
    }

    // After the start function has rebuilt the scene and reset session state,
    // re-apply the saved fields the server actually authoritative for.
    if (typeof data.wave === "number") game.wave = data.wave;
    if (typeof data.hp === "number") game.hp = data.hp;
    if (typeof data.score === "number") game.score = data.score;
    if (typeof data.kills === "number") game.kills = data.kills;
    if (typeof data.dogKills === "number") game.dogKills = data.dogKills;
    if (typeof data.bossKills === "number") game.bossKills = data.bossKills;
    if (typeof data.totalKills === "number") game.totalKills = data.totalKills;
    if (typeof data.isAlive === "boolean") game.localPlayerIsAlive = data.isAlive;
    if (typeof data.isDowned === "boolean") game.localPlayerIsDowned = data.isDowned;
    if (typeof data.isSpectating === "boolean") game.localPlayerIsSpectating = data.isSpectating;
    if (data.currentWeapon) setWeapon(data.currentWeapon);

    // Snap back to the saved position/facing.
    const pg = game.visuals?.player?.playerGroup;
    if (pg && (typeof data.x === "number" || typeof data.z === "number")) {
      pg.position.set(data.x || 0, data.y || 0, data.z || 0);
      pg.rotation.y = data.rotation || 0;
      game.camTheta = data.rotation || 0;
    }

    actions.updateHUD();
  });

  // Server told us the rejoin can't happen (match ended, stale epoch, etc.).
  // Clear the marker so we don't keep trying on the next reload.
  game.socket.on("rejoinFailed", () => {
    try { localStorage.removeItem("arena_active_match"); } catch {}
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
    // Update guest display
    if (!game.isHost) {
      const hostDisplay = document.getElementById('host-selection-display');
      if (hostDisplay) {
        const modeLabel = { endless: 'ENDLESS', campaign: 'CAMPAIGN', pvp: 'GUN GAME', ffa: 'FREE FOR ALL' }[game.selectedGameMode] || '';
        hostDisplay.textContent = `${modeLabel ? `MODE: ${modeLabel}  ·  ` : ''}MAP: ${data.map.toUpperCase()}`;
      }
    }
  });

  let _matchHandling = false; // guard against duplicate matchStarted events
  game.socket.on("matchStarted", async (payload) => {
    if (_matchHandling) return;
    _matchHandling = true;
    const mode = payload?.mode || "COOP";
    if (payload?.map) game.selectedMap = payload.map;
    if (payload?.gameMode) game.gameMode = payload.gameMode;
    if (typeof payload?.startingWave === 'number') game.startingWave = payload.startingWave;
    // Reset wave tracking so a fresh match never inherits state from the previous one
    game.campaignMapStartWave = 0;

    if (mode === "FFA") {
      game.collectedWeapons = new Set(WEAPON_ORDER);
      game.pvpSpawnAssignments = payload?.spawnAssignments || {};
      game.ffaDuration = payload?.ffaDuration || 300;
      game.ffaTimeLeft = game.ffaDuration;
      game.ffaKills = 0;
      await showPreGameCharSelect();
      actions.startFFAGame();
    } else if (mode === "PVP") {
      game.collectedWeapons = new Set(WEAPON_ORDER);
      game.pvpSpawnAssignments = payload?.spawnAssignments || {};
      await showPreGameCharSelect();
      actions.startPvPGame();
    } else {
      // COOP (both campaign and endless)
      const WAVE_DROPS = { 1:'assault', 2:'shotgun', 3:'sniper', 4:'sword', 5:'grapple', 6:'bazooka', 7:'pistol' };
      const sw = game.startingWave || 1;
      game.collectedWeapons = new Set(['pistol']);
      for (let w = 1; w < sw && w <= 7; w++) {
        const drop = WAVE_DROPS[w];
        if (drop) game.collectedWeapons.add(drop);
      }
      if (sw > 7) WEAPON_ORDER.forEach(id => game.collectedWeapons.add(id));

      if (game.gameMode === "campaign") {
        const mapId = game.selectedMap || "arena";
        const campaignMapIndex = payload?.campaignMapIndex ?? 0;
        if (campaignMapIndex >= 1) {
          try {
            const stored = JSON.parse(localStorage.getItem("arena_unlocked_chars") || "null");
            const set = new Set(Array.isArray(stored) ? stored : ["iestyn", "patrick"]);
            set.add("iestyn"); set.add("patrick"); set.add("matt"); set.add("will");
            localStorage.setItem("arena_unlocked_chars", JSON.stringify([...set]));
          } catch {}
        }
        // Campaign cutscene already contains a char select — no separate step needed.
        if (sw === 1) {
          await showCampaignCutscene(mapId);
        } else {
          // Mid-campaign start: still let players pick their operator
          await showPreGameCharSelect();
        }
      } else {
        // Endless mode
        await showPreGameCharSelect();
      }
      actions.startGame();
    }
    actions.tryPointerLock();
    _matchHandling = false;
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
    if (data.gameMode) game.gameMode = data.gameMode;
    if (typeof data.campaignMapStartWave === "number") game.campaignMapStartWave = data.campaignMapStartWave;
    if (data.state === "SPAWNING" && prevState !== "SPAWNING") {
      game.waveSpawnedTotal = 0;
    }
    if (data.wave > prevWave) {
      announceWave();
      // Squad commentary for the new wave (campaign only)
      fireBanter("wave_start", data.wave);
    }
    // Show wave-clear banner when wave ends (state transitions from ACTIVE → WAIT).
    if (prevState === "ACTIVE" && data.state === "WAIT" && prevWave > 0) {
      showWaveClear(prevWave);
      pushKillFeed(`WAVE ${prevWave} CLEARED`, "wave-start");
      fireBanter("wave_clear", prevWave);
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
    const enemyReach  = enemyType === "boss" ? 7.8 : enemyType === "miniboss" ? 4.5 : enemyType === "dog" ? 2.5 : 2.0;
    const enemyHeight = enemyType === "boss" ? 4.8 : enemyType === "miniboss" ? 2.8 : enemyType === "dog" ? 1.0 : 1.35;
    const enemyX = typeof data.ex === "number" ? data.ex : enemy?.group.position.x;
    const enemyY = typeof data.ey === "number" ? data.ey : enemy?.group.position.y;
    const enemyZ = typeof data.ez === "number" ? data.ez : enemy?.group.position.z;

    if (typeof enemyX !== "number" || typeof enemyY !== "number" || typeof enemyZ !== "number") {
      return;
    }

    // Snap boss visual position to the authoritative attack origin so the
    // attack never appears to come from an "invisible" lagged position.
    if (enemyType === "boss" && enemy && typeof data.ex === "number") {
      enemy.group.position.set(data.ex, data.ey ?? enemy.group.position.y, data.ez ?? enemy.group.position.z);
      enemy.serverX = data.ex;
      enemy.serverY = data.ey ?? enemy.group.position.y;
      enemy.serverZ = data.ez ?? enemy.group.position.z;
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

  // Received when another player lands a grapple hook on us — pull toward shooter.
  game.socket.on("pvpGrapplePull", (data) => {
    if (!game.localPlayerIsAlive || game.localPlayerIsDowned) return;
    const pp = game.visuals.player.playerGroup.position;
    const dx = data.shooterX - pp.x;
    const dy = data.shooterY - pp.y;
    const dz = data.shooterZ - pp.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    // Apply a strong knockback impulse toward the shooter (negative = away from player).
    game.knockbackX = (dx / len) * 260;
    game.knockbackZ = (dz / len) * 260;
    if (dy > 0) game.playerVelY = (dy / len) * 30;
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
        else if (entry.type === "miniboss") createMiniBoss(new THREE.Vector3(entry.x, entry.y, entry.z), entry.id);
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
    else if (data.type === "miniboss") createMiniBoss(pos, data.id);
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
      const isCompetitive = data.mode === "PVP" || data.mode === "FFA";
      remote.isAlive = false;
      remote.isDowned = !isCompetitive;
      remote.isSpectating = false;
      remote.hp = 0;
      remote.stats = data.stats;
      remote.score = data.stats?.score || 0;
      remote.kills = data.stats?.kills || 0;
      remote.dogKills = data.stats?.dogKills || 0;
      remote.bossKills = data.stats?.bossKills || 0;
      remote.totalKills = data.stats?.totalKills || data.stats?.kills || 0;
      remote.wave = data.stats?.wave || remote.wave;
      if (!isCompetitive) {
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
    resetComboState();
    recordMatchResult({
      mode: "PVP",
      won: data?.winnerId === game.socket?.id,
      score: game.score,
    });
  });

  game.socket.on("ffaKill", (data) => {
    if (!data) return;
    Object.entries(data.standings || {}).forEach(([id, s]) => {
      if (id === game.socket?.id) {
        game.ffaKills = s.ffaKills;
      } else if (game.remotePlayers[id]) {
        game.remotePlayers[id].ffaKills = s.ffaKills;
      }
    });
    actions.updateHUD();
    const victim = game.remotePlayers[data.victimId];
    const shooterName = data.shooterId === game.socket?.id
      ? "You"
      : (game.remotePlayers[data.shooterId]?.playerName || "?");
    const victimName = data.victimId === game.socket?.id
      ? "You"
      : (victim?.playerName || "?");
    actions.pushKillFeed?.(`${shooterName} eliminated ${victimName}`);
  });

  game.socket.on("ffaTimeUpdate", (data) => {
    if (typeof data?.timeLeft === "number") {
      game.ffaTimeLeft = data.timeLeft;
      actions.updateHUD();
    }
  });

  game.socket.on("ffaMatchOver", (data) => {
    actions.ffaMatchOver(data);
    resetComboState();
    recordMatchResult({
      mode: "FFA",
      won: data?.winnerId === game.socket?.id,
      score: game.ffaKills || 0,
    });
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
    resetComboState();
    bumpCareerStat("deaths");
    recordMatchResult({
      mode: "COOP",
      // Any survivor counts as a "win"; everyone-dead is a loss.
      won: !!(game.localPlayerIsAlive && !game.localPlayerIsDowned),
      wave: game.wave,
      score: game.score,
    });
  });

  // Server awards kill credit to the shooter
  game.socket.on("killCredit", (data) => {
    const typeLabel = data.type === "boss" ? "TITAN BRUTE" : data.type === "miniboss" ? "TITAN SCOUT" : data.type === "dog" ? "DOG" : data.type === "skeleton" ? "SKELETON" : "SOLDIER";
    pushKillFeed(`${game.playerName || "YOU"} → ${typeLabel} +${data.score}`, data.type === "boss" ? "boss-kill" : "");
    showScorePopup(data.score, data.type);
    if (data.type === "boss") {
      game.stats.bossKills += 1;
      game.score += data.score;
    } else if (data.type === "miniboss") {
      game.stats.kills += 1;
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
    registerKillForCombo();
    bumpCareerStat(data.type === "boss" ? "bossKills" : "kills");
  });

  // Server broadcasts enemy death for visual effects (particles etc.)
  game.socket.on("enemyKilled", (data) => {
    const color = data.type === "boss" ? 0xffd700
      : data.type === "miniboss" ? 0xff4400
      : data.type === "dog" ? 0xff6600
      : data.type === "soldier" ? 0x880011
      : 0xeeeeee;
    const count = data.type === "boss" ? 40 : data.type === "miniboss" ? 26 : 18;
    spawnParticles(new THREE.Vector3(data.x, 1, data.z), count, color, data.type === "boss" ? 12 : data.type === "miniboss" ? 9 : 8, data.type === "boss");
    // The enemy object is removed from game.enemies by the next enemiesSynced cleanup.
  });

  // Host relays prop destruction; non-host clients apply it locally.
  game.socket.on("propDestroyed", (data) => {
    if (!data?.propId || game.isHost) return; // host already handled it locally
    const origin = new THREE.Vector3(data.x ?? 0, data.y ?? 0, data.z ?? 0);
    triggerDestructible(data.propId, origin, null); // null processHit — visual only on non-host
  });

  // ── Weapon drop pickups ───────────────────────────────────────────────────
  game.socket.on("weaponDropSpawned", (data) => {
    spawnWeaponPickupVisual(data.id, data.weaponId, new THREE.Vector3(data.x, 0, data.z));
  });

  game.socket.on("weaponDropRemoved", (data) => {
    removeWeaponPickup(data.dropId);
    if (data.playerId === game.socket?.id) {
      collectWeapon(data.weaponId);
      actions.setWeapon(data.weaponId);
      actions.updateHUD();
    }
  });

  // ── Campaign cutscene team-ready sync ────────────────────────────────────
  game.socket.on("campaignReadyUpdate", (data) => {
    updateCutsceneReadyStatus(data?.ready ?? 0, data?.total ?? 1);
  });
  game.socket.on("campaignAllReady", () => {
    finishCampaignCutscene();
  });

  // ── Campaign map transition ──────────────────────────────────────────────
  game.socket.on("campaignNextMap", async (data) => {
    if (!data?.map) return;
    game.selectedMap = data.map;

    // Freeze the world: release pointer lock, clear enemies/bullets, set CUTSCENE state.
    // Camera will orbit the current map during the cutscene.
    actions.enterCutsceneMode?.();

    // Show the story cutscene (story + between-map character select).
    await showCampaignCutscene(data.map);

    // Rebuild arena for the new map
    await rebuildArena(data.map);

    // Apply character choice made in the cutscene char select
    if (game.visuals?.player?.headGroup && game.myCharacter) {
      const { applyCharacterHead } = await import("./scene.js");
      applyCharacterHead(game.visuals.player.headGroup, game.myCharacter, { visor: game.visuals.player.visor });
    }
    game.socket?.emit("playerCharacterUpdate", { character: game.myCharacter });

    // Keep all weapons collected so far — players carry their loadout into the next map.
    // Ensure the current weapon is still valid (it always should be, but guard anyway).
    if (!game.collectedWeapons?.has(game.currentWeapon)) {
      actions.setWeapon("pistol");
    }
    actions.updateHUD();

    // Restore PLAYING state (we were in CUTSCENE) and re-hide the chat panel
    game.state = "PLAYING";
    if (game.dom?.hud) game.dom.hud.style.display = "block";
    actions.syncChatVisibility?.();
  });

  // ── Mode selection from host (non-host clients receive this) ─────────────
  game.socket.on("gameModeSelected", (data) => {
    game.gameMode = data.gameMode || 'endless';
    game.selectedGameMode = data.gameMode || 'endless';
    // Update guest display
    const hostDisplay = document.getElementById('host-selection-display');
    if (hostDisplay) {
      const modeLabel = { endless: 'ENDLESS', campaign: 'CAMPAIGN', pvp: 'GUN GAME' }[data.gameMode] || data.gameMode;
      hostDisplay.textContent = `MODE: ${modeLabel}`;
    }
    // For host: apply the mode selection visually
    if (game.isHost) {
      const { applyModeSelectionFromNetwork } = actions;
      if (typeof applyModeSelectionFromNetwork === 'function') applyModeSelectionFromNetwork(data.gameMode);
    }
  });

  game.socket.on("allPlayersReady", () => {
    // Backup navigation: if somehow still on screen-player, switch to screen-map
    if (document.getElementById('screen-player')?.classList.contains('active')) {
      document.getElementById('screen-player').classList.remove('active');
      const screenMap = document.getElementById('screen-map');
      if (screenMap) screenMap.classList.add('active');
      // Apply host/guest layout
      const hostSection = document.getElementById('host-map-section');
      const guestSection = document.getElementById('guest-map-section');
      if (hostSection) hostSection.style.display = game.isHost ? 'block' : 'none';
      if (guestSection) guestSection.style.display = game.isHost ? 'none' : 'block';
    }
  });
}
