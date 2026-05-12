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
let _previewRenderer = null;
let _previewScene    = null;
let _previewCamera   = null;
let _previewHead     = null;
let _previewAnimId   = null;
let _previewTarget   = null;
let _previewMode     = "spin"; // "spin" | "sway"

function ensurePreviewRenderer() {
  if (_previewRenderer) return;
  const offscreen = document.createElement("canvas");
  offscreen.width  = 160;
  offscreen.height = 160;
  _previewRenderer = new THREE.WebGLRenderer({ canvas: offscreen, antialias: true, alpha: true });
  _previewRenderer.setSize(160, 160);
  _previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _previewRenderer.setClearColor(0x000000, 0);
  _previewScene  = new THREE.Scene();
  _previewCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  _previewCamera.position.set(0, 0.1, 2.8);
  _previewScene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const kl = new THREE.DirectionalLight(0xffffff, 1.6);
  kl.position.set(1.5, 2.5, 2.5);
  _previewScene.add(kl);
  const fl = new THREE.DirectionalLight(0x88aaff, 0.55);
  fl.position.set(-1.5, 0.5, 1);
  _previewScene.add(fl);
  _previewHead = new THREE.Group();
  _previewScene.add(_previewHead);
}

function loadHeadIntoPreview(characterId, { spinSpeed = 0.02 } = {}) {
  ensurePreviewRenderer();
  while (_previewHead.children.length > 0) _previewHead.remove(_previewHead.children[0]);
  const gltf = game.shared?.characterHeadGltfs?.[characterId];
  if (gltf) {
    const model = gltf.scene.clone(true);
    model.rotation.y = 0;
    const bbox = new THREE.Box3().setFromObject(model);
    const dims = new THREE.Vector3(); bbox.getSize(dims);
    const largestAxis = Math.max(dims.x, dims.y, dims.z) || 1;
    const scale = 1.55 / largestAxis;
    model.scale.setScalar(scale);
    const center = new THREE.Vector3(); bbox.getCenter(center);
    model.position.sub(center.multiplyScalar(scale));
    _previewHead.add(model);
  } else {
    const colors = { iestyn: 0xff5544, patrick: 0x55aaff, will: 0x66dd66, matt: 0xffcc33 };
    _previewHead.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 16, 12),
      new THREE.MeshStandardMaterial({ color: colors[characterId] || 0xaaaaaa, roughness: 0.55 }),
    ));
  }
  _previewHead.userData.spinSpeed = spinSpeed;
}

function stopPreviewLoop() {
  if (_previewAnimId) { cancelAnimationFrame(_previewAnimId); _previewAnimId = null; }
}

function startPreviewLoop() {
  stopPreviewLoop();
  function loop() {
    _previewAnimId = requestAnimationFrame(loop);
    if (!_previewRenderer) return;
    if (_previewMode === "sway") {
      const t = performance.now() * 0.001;
      _previewHead.rotation.y = Math.sin(t * 0.65) * 0.07;
      _previewHead.rotation.x = Math.sin(t * 0.9)  * 0.022;
      _previewHead.position.y = Math.sin(t * 1.3)  * 0.035;
    } else {
      _previewHead.rotation.y += (_previewHead.userData.spinSpeed ?? 0.02);
      _previewHead.rotation.x  = 0;
      _previewHead.position.y  = 0;
    }
    _previewRenderer.render(_previewScene, _previewCamera);
    if (_previewTarget) {
      const ctx = _previewTarget.getContext("2d");
      ctx.clearRect(0, 0, _previewTarget.width, _previewTarget.height);
      ctx.drawImage(_previewRenderer.domElement, 0, 0, _previewTarget.width, _previewTarget.height);
    }
  }
  loop();
}

// ── Public API for character-select preview ───────────────────────────────────
export function setCharacterPreview(characterId, targetCanvas) {
  ensurePreviewRenderer();
  _previewMode   = "spin";
  _previewTarget = targetCanvas;
  loadHeadIntoPreview(characterId);
  if (!_previewAnimId) startPreviewLoop();
}

export function stopCharacterPreview() {
  stopPreviewLoop();
  _previewTarget = null;
}

// ── Paint all character-select cards once ─────────────────────────────────────
export function paintAllCharacterPreviews() {
  const cards = document.querySelectorAll(".character-card[data-character]");
  if (!cards.length) return;
  ensurePreviewRenderer();
  cards.forEach((card) => {
    const id = card.dataset.character;
    const cv = card.querySelector(".char-card-canvas");
    if (!cv || !id) return;
    loadHeadIntoPreview(id, { spinSpeed: 0 });
    _previewRenderer.render(_previewScene, _previewCamera);
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(_previewRenderer.domElement, 0, 0, cv.width, cv.height);
  });
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
    _previewMode   = "sway";
    _previewTarget = canvas;
    if (_previewHead) { _previewHead.rotation.set(0, 0, 0); _previewHead.position.set(0, 0, 0); }
    loadHeadIntoPreview(line.s);
    if (!_previewAnimId) startPreviewLoop();
  }
  _charIndex = 0;
  const full = line.t;
  _typeTimer = setInterval(() => {
    _charIndex++;
    if (textEl) textEl.textContent = full.slice(0, _charIndex);
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
  stopPreviewLoop();
  _previewTarget = null;
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
  const unlocked = getUnlockedCharacters();

  // Announce newly unlocked characters if any
  const newUnlocks = (_pendingUnlocks || []).filter((id) => !Array.from(unlocked).includes(id) || true);
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
      // Render preview
      ensurePreviewRenderer();
      _previewMode   = "spin";
      _previewTarget = cv;
      loadHeadIntoPreview(id, { spinSpeed: 0 });
      _previewRenderer.render(_previewScene, _previewCamera);
      const ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, 88, 88);
      ctx.drawImage(_previewRenderer.domElement, 0, 0, 88, 88);

      card.addEventListener("click", () => {
        selected = id;
        grid.querySelectorAll(".cs-char-card").forEach((c) => {
          c.classList.toggle("selected", c.dataset.char === id);
        });
        setCharacterPreview(id, cv);
      });
    }
  });

  panel.style.display = "flex";

  confirm.onclick = () => {
    game.myCharacter = selected;
    game.socket?.emit("playerCharacterUpdate", { character: selected });
    closeFullCutscene();
  };
}

function closeFullCutscene() {
  stopPreviewLoop();
  _previewTarget = null;
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

// ── Public: show cutscene ─────────────────────────────────────────────────────
let _pendingUnlocks = [];

export function showCampaignCutscene(mapId) {
  const storyDef = CAMPAIGN_STORY[mapId];
  if (!storyDef) return Promise.resolve();

  // Queue unlocks that happen when reaching this map
  _pendingUnlocks = MAP_UNLOCK_EVENTS[mapId] || [];

  return new Promise(async (resolve) => {
    _cutsceneResolve = resolve;
    _lines     = storyDef.lines || [];
    _lineIndex = 0;

    ensurePreviewRenderer();

    const ov = document.getElementById("cutscene-overlay");
    if (!ov) { resolve(); return; }

    ["screen-player", "screen-map"].forEach((id) => {
      document.getElementById(id)?.classList.remove("active");
    });
    const lobbyBg = document.getElementById("lobby-bg");
    if (lobbyBg) lobbyBg.style.display = "none";

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
