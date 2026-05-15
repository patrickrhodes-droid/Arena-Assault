import * as THREE from "three";
import { game } from "./state.js";

// ── Character unlock system ────────────────────────────────────────────────────
const STORAGE_KEY = "arena_unlocked_chars";

export function getUnlockedCharacters() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set(["iestyn", "patrick"]);
}

function saveUnlocked(set) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...set])); } catch {}
}

export function unlockCharacter(id) {
  const current = getUnlockedCharacters();
  if (current.has(id)) return false; // already unlocked
  current.add(id);
  saveUnlocked(current);
  return true;
}

// Characters unlocked by reaching each map for the first time
const MAP_UNLOCK_EVENTS = {
  desert: ["matt", "will"], // meeting after Arena
};

// ── Campaign narrative ─────────────────────────────────────────────────────────
// Each entry is the scene that plays BEFORE that map loads.
const CAMPAIGN_STORY = {
  arena: {
    chapter:  "CHAPTER 1",
    location: "COMBAT ARENA",
    subtitle: "Training Facility — Outbreak Event",
    lines: [
      { s: "iestyn",  t: "The facility went dark ninety minutes ago. No comms, no response. We're going in." },
      { s: "patrick", t: "Last ping from inside suggested a containment breach. Something in the lower labs." },
      { s: "iestyn",  t: "Whatever it is, we neutralise it. Two operators, no support. Move fast and stay sharp." },
      { s: "patrick", t: "Iestyn — whatever broke out in there, the data suggests it doesn't stop. It just keeps coming." },
      { s: "patrick", t: "Thermal signatures suggest multiple mech-class units. Full-size and... smaller variants. Scout class, maybe. Same machine, half the size." },
      { s: "iestyn",  t: "Then so do we." },
    ],
  },

  desert: {
    chapter:  "CHAPTER 2",
    location: "DUST BOWL",
    subtitle: "Military Research Post — 30 Miles East",
    lines: [
      { s: "iestyn",  t: "Arena's cleared. But this wasn't the origin point." },
      { s: "patrick", t: "Tracks leading east — heavy boot prints, recent. Someone else was here." },
      // Matt and Will arrive
      { s: "will",    t: "Finally. We've been waiting out here for two hours." },
      { s: "matt",    t: "You're the backup? There's only two of you." },
      { s: "iestyn",  t: "Who are you?" },
      { s: "will",    t: "Will. I was running recon on the desert facility when this kicked off." },
      { s: "matt",    t: "Matt. I pulled him out of a ditch full of skeletons. He's been grateful ever since." },
      { s: "will",    t: "I was handling it." },
      { s: "patrick", t: "The research post east of here — that's where the infection spread from. We need to shut it down." },
      { s: "matt",    t: "Four's better than two. Marginally." },
      { s: "will",    t: "We saw some of those smaller mechs out here — half the size of the big ones. Faster too." },
      { s: "patrick", t: "Scout units. All weapons effective on them, unlike the full-size Brute. Still — don't get cocky, they hit hard enough." },
      { s: "iestyn",  t: "Welcome to the team. Try to keep up." },
    ],
  },

  city: {
    chapter:  "CHAPTER 3",
    location: "DOWNTOWN",
    subtitle: "Urban Zone — 36 Hours Dark",
    lines: [
      { s: "patrick", t: "The research at that post was weapons development — someone was intentionally weaponising the pathogen." },
      { s: "will",    t: "And they lost control of it. Brilliant." },
      { s: "matt",    t: "I picked up a broadcast signal. Urban frequency. Coming from the city." },
      { s: "iestyn",  t: "The city's been completely silent for thirty-six hours. No civilian traffic, no emergency response." },
      { s: "patrick", t: "Someone is transmitting from inside. That signal is deliberate — it's a beacon or a command source." },
      { s: "will",    t: "If someone's running this thing, we find them. Simple." },
      { s: "matt",    t: "Nothing about this has been simple." },
      { s: "iestyn",  t: "We go in, we find that signal. All of us." },
    ],
  },

  blacksite: {
    chapter:  "CHAPTER 4",
    location: "BLACKSITE",
    subtitle: "Abandoned Research Compound — Origin Point",
    lines: [
      { s: "patrick", t: "I isolated the source. The signal is coming from an abandoned research compound — the original blacksite. This is where the project started." },
      { s: "matt",    t: "Who runs a project like this and then abandons it?" },
      { s: "patrick", t: "Someone who lost control of it the first time and decided to try again somewhere else." },
      { s: "will",    t: "So everything — every wave, every city block — it all leads back here." },
      { s: "iestyn",  t: "We end it here. No retreat. If there's something in that compound controlling this, we destroy it." },
      { s: "matt",    t: "And if there isn't?" },
      { s: "patrick", t: "Then we burn the building down and hope that's enough." },
      { s: "will",    t: "Now you're thinking like a soldier." },
      { s: "iestyn",  t: "Move out. All of us. Let's finish this." },
    ],
  },
};

const CHAR_COLORS = { iestyn: "#ff6655", patrick: "#55aaff", will: "#66dd66", matt: "#ffcc33" };
const CHAR_NAMES  = { iestyn: "IESTYN",  patrick: "PATRICK",  will: "WILL",    matt: "MATT" };

// ── Mini Three.js preview renderer ────────────────────────────────────────────
let _renderer  = null;
let _scene     = null;
let _camera    = null;
let _animId    = null;

// Per-character persistent Groups (built once, swapped in/out for each render)
const _charGroups = {}; // charId → THREE.Group

// Per-card animation state for the character-select grid
const _cardAnims  = []; // [{ charId, canvas, rotY, isSelected, phase }]
// Separate anims for the campaign between-map char select
const _csCardAnims = []; // [{ charId, canvas, rotY, posY, isSelected, phase }]

// Portrait mode for cutscene (single canvas, sway animation)
let _portraitTarget = null; // 2D canvas
let _portraitCharId = null;
let _portraitRotY   = 0;
let _portraitPosY   = 0;

const HEAD_FALLBACK_COLORS = { iestyn: 0xff5544, patrick: 0x55aaff, will: 0x66dd66, matt: 0xffcc33 };

function ensureRenderer() {
  if (_renderer) return;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 160;
  _renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  _renderer.setSize(160, 160);
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _renderer.setClearColor(0x000000, 0);
  _scene  = new THREE.Scene();
  _camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  _camera.position.set(0, 0.1, 2.8);
  _scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const kl = new THREE.DirectionalLight(0xffffff, 1.6);
  kl.position.set(1.5, 2.5, 2.5); _scene.add(kl);
  const fl = new THREE.DirectionalLight(0x88aaff, 0.55);
  fl.position.set(-1.5, 0.5, 1);  _scene.add(fl);
}

function applyGlbToGroup(group, characterId) {
  const gltf = game.shared?.characterHeadGltfs?.[characterId];
  if (!gltf) return false;
  const model = gltf.scene.clone(true);
  model.rotation.y = 0;
  const bbox = new THREE.Box3().setFromObject(model);
  const dims = new THREE.Vector3(); bbox.getSize(dims);
  const s = 1.55 / (Math.max(dims.x, dims.y, dims.z) || 1);
  model.scale.setScalar(s);
  const center = new THREE.Vector3(); bbox.getCenter(center);
  model.position.sub(center.multiplyScalar(s));
  group.add(model);
  group._hasGlb = true;
  return true;
}

function buildCharGroup(characterId) {
  if (_charGroups[characterId]) return;
  ensureRenderer();
  const group = new THREE.Group();
  group.visible = false;
  group._hasGlb = false;
  _scene.add(group);
  _charGroups[characterId] = group;

  if (!applyGlbToGroup(group, characterId)) {
    // GLB not loaded yet — use fallback sphere; loop will swap it when ready
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 16, 12),
      new THREE.MeshStandardMaterial({ color: HEAD_FALLBACK_COLORS[characterId] ?? 0xaaaaaa, roughness: 0.55 }),
    ));
  }
}

// Rebuild a char group when its GLB loads later (called externally or by auto-refresh)
export function refreshCharGroup(characterId) {
  const grp = _charGroups[characterId];
  if (!grp || grp._hasGlb) return; // nothing to do
  while (grp.children.length) grp.remove(grp.children[0]);
  applyGlbToGroup(grp, characterId);
}

// Auto-refresh any groups still using the fallback sphere now that GLBs are loaded
function autoRefreshStaleGroups() {
  for (const [id, grp] of Object.entries(_charGroups)) {
    if (!grp._hasGlb && game.shared?.characterHeadGltfs?.[id]) {
      while (grp.children.length) grp.remove(grp.children[0]);
      applyGlbToGroup(grp, id);
    }
  }
}

function renderCharToCanvas(characterId, rotY, posY, canvas) {
  // Show only this character's group
  for (const [id, grp] of Object.entries(_charGroups)) grp.visible = id === characterId;
  const grp = _charGroups[characterId];
  if (!grp) return;
  grp.rotation.set(0, rotY, 0);
  grp.position.y = posY;
  _renderer.render(_scene, _camera);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(_renderer.domElement, 0, 0, canvas.width, canvas.height);
}

function stopLoop() {
  if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
}

function startLoop() {
  stopLoop();
  function loop() {
    _animId = requestAnimationFrame(loop);
    if (!_renderer) return;
    const t = performance.now() * 0.001;

    // Swap fallback spheres for real GLB heads as soon as they finish loading
    autoRefreshStaleGroups();

    // ── Character-select card animations (lobby + campaign) ──────────────────
    for (const anim of [..._cardAnims, ..._csCardAnims]) {
      if (!anim.canvas) continue;
      if (anim.isSelected) {
        anim.rotY += 0.022; // full spin when selected
        anim.posY  = 0;
      } else {
        // Gentle bob + slight sway when idle
        anim.rotY = Math.sin(t * 0.55 + anim.phase) * 0.14;
        anim.posY = Math.sin(t * 1.1  + anim.phase) * 0.04;
      }
      renderCharToCanvas(anim.charId, anim.rotY, anim.posY, anim.canvas);
    }

    // ── Cutscene portrait sway ───────────────────────────────────────────────
    if (_portraitTarget && _portraitCharId) {
      for (const [id, grp] of Object.entries(_charGroups)) grp.visible = id === _portraitCharId;
      const grp = _charGroups[_portraitCharId];
      if (grp) {
        grp.rotation.y = Math.sin(t * 0.65) * 0.07;
        grp.rotation.x = Math.sin(t * 0.9)  * 0.022;
        grp.position.y = Math.sin(t * 1.3)  * 0.035;
        _renderer.render(_scene, _camera);
        const ctx = _portraitTarget.getContext("2d");
        ctx.clearRect(0, 0, _portraitTarget.width, _portraitTarget.height);
        ctx.drawImage(_renderer.domElement, 0, 0, _portraitTarget.width, _portraitTarget.height);
      }
    }
  }
  loop();
}

// ── Public API: character-select card animations ──────────────────────────────

export function initCharCardAnimations() {
  ensureRenderer();
  const cards = document.querySelectorAll(".character-card[data-character]");
  _cardAnims.length = 0;
  const phaseStep = (Math.PI * 2) / Math.max(cards.length, 1);
  cards.forEach((card, i) => {
    const charId = card.dataset.character;
    const canvas = card.querySelector(".char-card-canvas");
    if (!charId || !canvas) return;
    buildCharGroup(charId);
    _cardAnims.push({ charId, canvas, rotY: 0, posY: 0, isSelected: false, phase: i * phaseStep });
  });
  if (!_animId) startLoop();
}

export function setCsCharSelectedAnim(charId) {
  for (const anim of _csCardAnims) {
    anim.isSelected = anim.charId === charId;
    if (anim.isSelected) anim.rotY = 0;
  }
}

function startCsCharAnimations(grid, selectedId) {
  ensureRenderer();
  _csCardAnims.length = 0;
  const cards = grid.querySelectorAll(".cs-char-card[data-char]");
  const phaseStep = (Math.PI * 2) / Math.max(cards.length, 1);
  cards.forEach((card, i) => {
    const charId = card.dataset.char;
    const canvas = card.querySelector(".char-card-canvas");
    if (!charId || !canvas) return;
    buildCharGroup(charId);
    _csCardAnims.push({ charId, canvas, rotY: 0, posY: 0, isSelected: charId === selectedId, phase: i * phaseStep });
  });
  if (!_animId) startLoop();
}

export function setSelectedCharCard(charId) {
  for (const anim of _cardAnims) {
    anim.isSelected = anim.charId === charId;
    if (anim.isSelected) anim.rotY = 0; // reset so spin starts facing front
  }
}

// Legacy shims kept so existing callers don't break
export function setCharacterPreview(characterId, targetCanvas) {
  // Just mark this card as selected so it spins; hover no longer needed
  setSelectedCharCard(characterId);
}

export function stopCharacterPreview() { /* no-op — cards animate continuously */ }

export function paintAllCharacterPreviews() {
  initCharCardAnimations(); // re-init to ensure canvases are up to date
}

// ── Public API: cutscene portrait ─────────────────────────────────────────────
function setPortrait(characterId, canvas) {
  ensureRenderer();
  buildCharGroup(characterId);
  _portraitCharId = characterId;
  _portraitTarget = canvas;
  if (!_animId) startLoop();
}

function clearPortrait() {
  _portraitCharId = null;
  _portraitTarget = null;
}

// ── Cutscene engine ────────────────────────────────────────────────────────────
let _lines         = [];
let _lineIndex     = 0;
let _charIndex     = 0;
let _typeTimer     = null;
let _cutsceneResolve = null;

function getOverlayEls() {
  const ov      = document.getElementById("cutscene-overlay");
  const nameEl  = ov?.querySelector(".cutscene-speaker-name");
  const textEl  = ov?.querySelector(".cutscene-text");
  const canvas  = ov?.querySelector("#cutscene-portrait-canvas");
  return { ov, nameEl, textEl, canvas };
}

function displayLine(idx) {
  clearInterval(_typeTimer);
  const line = _lines[idx];
  if (!line) return;
  const { nameEl, textEl, canvas } = getOverlayEls();
  if (nameEl) { nameEl.textContent = CHAR_NAMES[line.s] || line.s.toUpperCase(); nameEl.style.color = CHAR_COLORS[line.s] || "#fff"; }
  if (textEl) textEl.textContent = "";
  if (canvas) {
    setPortrait(line.s, canvas);
  }
  _charIndex = 0;
  const full = line.t;
  _typeTimer = setInterval(() => {
    _charIndex++;
    if (textEl) textEl.textContent = full.slice(0, _charIndex);
    const ch = full[_charIndex - 1];
    if (ch && ch !== " " && game.audio?.dialogueTick) game.audio.dialogueTick();
    if (_charIndex >= full.length) clearInterval(_typeTimer);
  }, 26);
}

function advanceLine() {
  const { textEl } = getOverlayEls();
  const line = _lines[_lineIndex];
  if (line && _charIndex < line.t.length) {
    clearInterval(_typeTimer);
    _charIndex = line.t.length;
    if (textEl) textEl.textContent = line.t;
    return;
  }
  _lineIndex++;
  if (_lineIndex >= _lines.length) {
    endDialogue();
  } else {
    displayLine(_lineIndex);
  }
}

function endDialogue() {
  clearInterval(_typeTimer);
  clearPortrait();
  // Hide dialogue bar, show character select panel
  const bar = document.getElementById("cutscene-bar");
  if (bar) bar.style.display = "none";
  showCharSelect();
}

// ── Chapter title card ────────────────────────────────────────────────────────
function showChapterCard(storyDef) {
  return new Promise((resolve) => {
    const card = document.getElementById("cutscene-chapter-card");
    if (!card) { resolve(); return; }
    card.querySelector(".chapter-eyebrow").textContent  = storyDef.chapter  || "";
    card.querySelector(".chapter-title").textContent    = storyDef.location || "";
    card.querySelector(".chapter-location").textContent = storyDef.subtitle || "";
    card.style.display = "flex";
    card.classList.remove("show");
    void card.offsetWidth;
    card.classList.add("show");
    setTimeout(() => {
      card.classList.remove("show");
      setTimeout(() => { card.style.display = "none"; resolve(); }, 500);
    }, 2000);
  });
}

// ── Between-map character select ──────────────────────────────────────────────
function showCharSelect() {
  const panel    = document.getElementById("cutscene-char-panel");
  const grid     = document.getElementById("cs-char-grid");
  const banner   = document.getElementById("cs-unlock-banner");
  const confirm  = document.getElementById("cs-deploy-btn");

  // Arena is the very first map. On a fresh campaign run we hard-reset the
  // persisted unlock set so previously unlocked Will/Matt are properly locked
  // again — the player has to play through the desert intro to "meet" them.
  const isFirstMap = (_currentMapId === "arena");
  if (isFirstMap) {
    saveUnlocked(new Set(["iestyn", "patrick"]));
  }

  // Announce newly unlocked characters if any
  if (_pendingUnlocks?.length) {
    const names = _pendingUnlocks.map((id) => CHAR_NAMES[id] || id).join(" & ");
    banner.textContent  = `🔓 NEW OPERATOR${_pendingUnlocks.length > 1 ? "S" : ""} UNLOCKED: ${names}`;
    banner.style.display = "block";
    _pendingUnlocks.forEach((id) => unlockCharacter(id));
    _pendingUnlocks = [];
  } else {
    banner.style.display = "none";
  }

  const freshUnlocked = getUnlockedCharacters();
  const ALL_CHARS = [
    { id: "iestyn",  name: "IESTYN",  color: "#ff6655" },
    { id: "patrick", name: "PATRICK", color: "#55aaff" },
    { id: "will",    name: "WILL",    color: "#66dd66" },
    { id: "matt",    name: "MATT",    color: "#ffcc33" },
  ];

  let selected = game.myCharacter || "iestyn";
  // If current selection is locked, pick first available
  if (!freshUnlocked.has(selected)) selected = [...freshUnlocked][0] || "iestyn";

  grid.innerHTML = "";
  ALL_CHARS.forEach(({ id, name, color }) => {
    const isLocked = !freshUnlocked.has(id);
    const card = document.createElement("div");
    card.className = `cs-char-card${id === selected ? " selected" : ""}${isLocked ? " locked" : ""}`;
    card.dataset.char = id;
    if (!isLocked) card.tabIndex = 0;
    card.style.setProperty("--char-color", color);

    const cv = document.createElement("canvas");
    cv.className = "char-card-canvas";
    cv.width = cv.height = 88;

    const nameDiv = document.createElement("div");
    nameDiv.className = "character-name";
    nameDiv.textContent = isLocked ? "🔒 LOCKED" : name;

    card.appendChild(cv);
    card.appendChild(nameDiv);
    grid.appendChild(card);

    if (!isLocked) {
      // Static first frame; the loop will animate it once startCsCharAnimations runs
      ensureRenderer();
      buildCharGroup(id);
      renderCharToCanvas(id, 0, 0, cv);

      const selectCard = () => {
        selected = id;
        grid.querySelectorAll(".cs-char-card").forEach((c) => {
          c.classList.toggle("selected", c.dataset.char === id);
        });
        setCsCharSelectedAnim(id);
      };

      card.addEventListener("click", selectCard);
      // Auto-select when focused by keyboard/controller so D-pad navigation
      // immediately moves the highlight without needing a separate A press.
      card.addEventListener("focus", selectCard);
    }
  });

  panel.style.display = "flex";
  startCsCharAnimations(grid, selected);

  // Reset the waiting status from any previous cutscene
  const waitStatus = document.getElementById("cs-waiting-status");
  if (waitStatus) waitStatus.style.display = "none";
  confirm.disabled = false;
  confirm.textContent = "DEPLOY";

  confirm.onclick = () => {
    game.myCharacter = selected;
    game.socket?.emit("playerCharacterUpdate", { character: selected });
    // Tell the server we're ready and wait for the rest of the team. The
    // cutscene will close in response to campaignAllReady (handled in
    // network.js, which calls finishCampaignCutscene below).
    game.socket?.emit("campaignReady", { character: selected });
    confirm.disabled = true;
    confirm.textContent = "READY ✓";
    if (waitStatus) {
      waitStatus.style.display = "block";
      waitStatus.textContent = "WAITING FOR TEAMMATES…";
    }
  };
}

// Pre-game character select for non-campaign modes — shows the same char panel
// as the campaign cutscene but without dialogue or server campaignReady handshake.
// Returns a Promise that resolves with the chosen character id.
export function showPreGameCharSelect() {
  return new Promise((resolve) => {
    const ov      = document.getElementById('cutscene-overlay');
    const panel   = document.getElementById('cutscene-char-panel');
    const grid    = document.getElementById('cs-char-grid');
    const confirm = document.getElementById('cs-deploy-btn');
    const bar     = document.getElementById('cutscene-bar');
    const chCard  = document.getElementById('cutscene-chapter-card');
    const banner  = document.getElementById('cs-unlock-banner');
    const waitSt  = document.getElementById('cs-waiting-status');
    if (!ov || !panel || !grid || !confirm) { resolve(game.myCharacter || 'iestyn'); return; }

    // Hide story elements — pure operator select
    if (bar)    bar.style.display    = 'none';
    if (chCard) { chCard.classList.remove('show'); chCard.style.display = 'none'; }
    if (banner) banner.style.display = 'none';
    if (waitSt) waitSt.style.display = 'none';

    ov.style.display = 'flex';
    void ov.offsetWidth;
    ov.classList.add('show');

    const ALL_CHARS = [
      { id: 'iestyn', name: 'IESTYN', color: '#ff6655' },
      { id: 'patrick', name: 'PATRICK', color: '#55aaff' },
      { id: 'will',   name: 'WILL',   color: '#66dd66' },
      { id: 'matt',   name: 'MATT',   color: '#ffcc33' },
    ];
    let selected = game.myCharacter || 'iestyn';

    grid.innerHTML = '';
    ALL_CHARS.forEach(({ id, name, color }) => {
      const card = document.createElement('div');
      card.className = `cs-char-card${id === selected ? ' selected' : ''}`;
      card.dataset.char = id;
      card.tabIndex = 0;
      card.style.setProperty('--char-color', color);
      const cv = document.createElement('canvas');
      cv.className = 'char-card-canvas'; cv.width = cv.height = 88;
      const nameDiv = document.createElement('div');
      nameDiv.className = 'character-name'; nameDiv.textContent = name;
      card.appendChild(cv); card.appendChild(nameDiv); grid.appendChild(card);
      ensureRenderer(); buildCharGroup(id); renderCharToCanvas(id, 0, 0, cv);
      const sel = () => {
        selected = id;
        grid.querySelectorAll('.cs-char-card').forEach(c => c.classList.toggle('selected', c.dataset.char === id));
        setCsCharSelectedAnim(id);
      };
      card.addEventListener('click', sel);
      card.addEventListener('focus', sel);
    });

    panel.style.display = 'flex';
    startCsCharAnimations(grid, selected);

    confirm.disabled = false;
    confirm.textContent = 'DEPLOY';
    confirm.onclick = () => {
      game.myCharacter = selected;
      game.socket?.emit('playerCharacterUpdate', { character: selected });
      ov.classList.remove('show');
      setTimeout(() => {
        ov.style.display = 'none';
        panel.style.display = 'none';
        if (bar) bar.style.display = '';
      }, 420);
      resolve(selected);
    };
  });
}

// Allows network.js to update the "waiting for X/Y" status during a cutscene.
export function updateCutsceneReadyStatus(ready, total) {
  const waitStatus = document.getElementById("cs-waiting-status");
  if (!waitStatus) return;
  if (total <= 1 || ready >= total) {
    waitStatus.style.display = "none";
  } else {
    waitStatus.style.display = "block";
    waitStatus.textContent = `WAITING FOR TEAMMATES… (${ready}/${total})`;
  }
}

// Called by network.js when the server emits campaignAllReady — every player
// has clicked DEPLOY, so the cutscene can finally close.
export function finishCampaignCutscene() {
  closeFullCutscene();
}

function closeFullCutscene() {
  clearPortrait();
  const ov = document.getElementById("cutscene-overlay");
  if (!ov) return;
  ov.classList.remove("show");
  ov._advanceClick && ov.removeEventListener("click", ov._advanceClick);
  ov._advanceKey   && document.removeEventListener("keydown", ov._advanceKey);
  ov._advanceClick = null;
  ov._advanceKey   = null;
  // Reset child panels for next time
  const bar   = document.getElementById("cutscene-bar");
  const panel = document.getElementById("cutscene-char-panel");
  setTimeout(() => {
    if (ov) ov.style.display = "none";
    if (bar)   bar.style.display   = "";
    if (panel) panel.style.display = "none";
  }, 420);
  if (_cutsceneResolve) {
    const r = _cutsceneResolve;
    _cutsceneResolve = null;
    r();
  }
}

// Cutscene backgrounds per campaign map. Real JPGs exist for arena and
// desert; city and blacksite use a tinted gradient placeholder until art
// is added to /assets/Images.
const CUTSCENE_BG_IMAGE = {
  arena:     "/assets/Images/arenabackground.jpg",
  desert:    "/assets/Images/desertbackground.jpg",
  city:      "/assets/Images/Citybackground.png",
  blacksite: "/assets/Images/blacksitebackground.png",
};
const CUTSCENE_BG_FALLBACK = {
  // Used when the JPG can't be loaded — distinct tints per map so the
  // scene still reads as the right location.
  arena:     "radial-gradient(ellipse at 50% 40%, #2a3340 0%, #0b1118 65%, #050709 100%)",
  desert:    "radial-gradient(ellipse at 50% 40%, #6b4a26 0%, #2b1c0e 60%, #110903 100%)",
  city:      "radial-gradient(ellipse at 50% 35%, #3a2030 0%, #1a0d18 55%, #060306 100%)",
  blacksite: "radial-gradient(ellipse at 50% 50%, #401418 0%, #18060a 50%, #050102 100%)",
};
function applyCutsceneBackground(ov, mapId) {
  const url = CUTSCENE_BG_IMAGE[mapId];
  const fallback = CUTSCENE_BG_FALLBACK[mapId] || CUTSCENE_BG_FALLBACK.arena;
  // Layer the existing letter-box darkening gradient on top of the image so
  // text stays readable. If the image 404s the gradient alone still looks fine.
  const overlay =
    "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.85) 100%)";
  if (url) {
    ov.style.background = `${overlay}, url("${url}") center/cover no-repeat, ${fallback}`;
  } else {
    ov.style.background = `${overlay}, ${fallback}`;
  }
}

// ── Public: show cutscene ─────────────────────────────────────────────────────
let _pendingUnlocks = [];
let _currentMapId   = "";

export function showCampaignCutscene(mapId) {
  const storyDef = CAMPAIGN_STORY[mapId];
  if (!storyDef) return Promise.resolve();

  // Queue unlocks that happen when reaching this map
  _pendingUnlocks = MAP_UNLOCK_EVENTS[mapId] || [];

  return new Promise(async (resolve) => {
    _cutsceneResolve = resolve;
    _lines       = storyDef.lines || [];
    _lineIndex   = 0;
    _currentMapId = mapId;

    ensureRenderer();

    const ov = document.getElementById("cutscene-overlay");
    if (!ov) { resolve(); return; }

    ["screen-player", "screen-map"].forEach((id) => {
      document.getElementById(id)?.classList.remove("active");
    });
    const lobbyBg = document.getElementById("lobby-bg");
    if (lobbyBg) lobbyBg.style.display = "none";

    // Apply the map-specific cutscene background. Arena and desert have real
    // JPGs; city and blacksite fall back to a styled CSS gradient until art
    // is dropped into /assets/Images.
    applyCutsceneBackground(ov, mapId);

    ov.style.display = "flex";
    void ov.offsetWidth;
    ov.classList.add("show");

    // Show chapter title first
    await showChapterCard(storyDef);

    if (_lines.length === 0) {
      showCharSelect();
      return;
    }

    displayLine(0);

    const advanceClick = (e) => {
      if (e.target.closest("#cutscene-char-panel")) return; // don't advance when clicking char select
      advanceLine();
    };
    const advanceKey = (e) => {
      if (["Enter", "Space", "KeyE"].includes(e.code)) advanceLine();
    };
    ov.addEventListener("click", advanceClick);
    document.addEventListener("keydown", advanceKey);
    ov._advanceClick = advanceClick;
    ov._advanceKey   = advanceKey;
  });
}
