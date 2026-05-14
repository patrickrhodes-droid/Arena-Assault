import { game } from "./state.js";
import { getUnlockedCharacters } from "./story.js";

const COLORS = { iestyn: "#ff6655", patrick: "#55aaff", will: "#66dd66", matt: "#ffcc33" };
const NAMES  = { iestyn: "IESTYN", patrick: "PATRICK", will: "WILL", matt: "MATT" };

// ── Tiny character face renderer (Canvas 2D, prerendered once) ────────────────
const _faceCache = {}; // charId → ImageBitmap

function drawFace(canvas, charId) {
  const ctx = canvas.getContext("2d");
  const s   = canvas.width; // 34

  ctx.clearRect(0, 0, s, s);

  // Background with subtle character tint
  const bgTints = { iestyn: "rgba(80,14,8,0.9)", patrick: "rgba(8,22,58,0.9)", will: "rgba(8,30,12,0.9)", matt: "rgba(30,24,6,0.9)" };
  ctx.fillStyle = bgTints[charId] || "rgba(10,14,18,0.9)";
  roundRect(ctx, 0, 0, s, s, 4);
  ctx.fill();

  const cx = s / 2;

  // Head oval
  ctx.fillStyle = "#c2956a";
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.54, s * 0.3, s * 0.33, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  const hairColors = { iestyn: "#a83820", patrick: "#2a5090", will: "#2a3018", matt: "#1a1408" };
  ctx.fillStyle = hairColors[charId] || "#333";

  if (charId === "iestyn") {
    // Military short cut — flat top
    ctx.beginPath();
    ctx.ellipse(cx, s * 0.25, s * 0.3, s * 0.16, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Sideburns
    ctx.fillRect(s * 0.2, s * 0.3, s * 0.08, s * 0.14);
    ctx.fillRect(s * 0.72, s * 0.3, s * 0.08, s * 0.14);
  } else if (charId === "patrick") {
    // Neat side parted hair
    ctx.beginPath();
    ctx.ellipse(cx, s * 0.24, s * 0.3, s * 0.18, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Parting highlight
    ctx.fillStyle = "#3860b0";
    ctx.beginPath();
    ctx.moveTo(s * 0.2, s * 0.26);
    ctx.quadraticCurveTo(cx * 0.9, s * 0.12, s * 0.8, s * 0.3);
    ctx.lineTo(s * 0.8, s * 0.22);
    ctx.quadraticCurveTo(cx * 0.9, s * 0.06, s * 0.2, s * 0.18);
    ctx.closePath();
    ctx.fill();
  } else if (charId === "will") {
    // Very close shaved — just a thin strip
    ctx.fillStyle = "#22280f";
    ctx.beginPath();
    ctx.ellipse(cx, s * 0.22, s * 0.28, s * 0.12, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  } else if (charId === "matt") {
    // Dark flat hair, slightly longer sides
    ctx.beginPath();
    ctx.ellipse(cx, s * 0.24, s * 0.3, s * 0.18, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  // Eyes
  ctx.fillStyle = "#1a1008";
  ctx.beginPath(); ctx.ellipse(cx - s * 0.1, s * 0.5, s * 0.045, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + s * 0.1, s * 0.5, s * 0.045, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  // Eye whites
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath(); ctx.ellipse(cx - s * 0.098, s * 0.498, s * 0.02, s * 0.015, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + s * 0.098, s * 0.498, s * 0.02, s * 0.015, 0, 0, Math.PI * 2); ctx.fill();

  // Character-specific features
  if (charId === "iestyn") {
    // Teal tactical visor strip
    ctx.fillStyle = "rgba(0,200,165,0.8)";
    ctx.fillRect(s * 0.22, s * 0.44, s * 0.56, s * 0.07);
    // Strong jaw
    ctx.fillStyle = "#b0855a";
    ctx.beginPath();
    ctx.ellipse(cx, s * 0.76, s * 0.2, s * 0.1, 0, 0, Math.PI);
    ctx.fill();
  } else if (charId === "patrick") {
    // Slim glasses frames
    ctx.strokeStyle = "rgba(100,160,255,0.9)";
    ctx.lineWidth = 0.8;
    roundRect(ctx, cx - s * 0.24, s * 0.44, s * 0.19, s * 0.12, 2);
    ctx.stroke();
    roundRect(ctx, cx + s * 0.05, s * 0.44, s * 0.19, s * 0.12, 2);
    ctx.stroke();
    // Bridge
    ctx.beginPath(); ctx.moveTo(cx - s * 0.05, s * 0.50); ctx.lineTo(cx + s * 0.05, s * 0.50); ctx.stroke();
    // Slight smirk
    ctx.strokeStyle = "rgba(160,120,80,0.8)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - s * 0.1, s * 0.67); ctx.quadraticCurveTo(cx + s * 0.04, s * 0.70, cx + s * 0.12, s * 0.66); ctx.stroke();
  } else if (charId === "will") {
    // Heavy brow furrow
    ctx.strokeStyle = "rgba(40,55,20,0.9)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx - s * 0.22, s * 0.41); ctx.lineTo(cx - s * 0.06, s * 0.44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + s * 0.22, s * 0.41); ctx.lineTo(cx + s * 0.06, s * 0.44); ctx.stroke();
    // Scar across left eye
    ctx.strokeStyle = "rgba(160,100,60,0.8)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(cx + s * 0.06, s * 0.43); ctx.lineTo(cx + s * 0.15, s * 0.55); ctx.stroke();
    // Grin
    ctx.strokeStyle = "rgba(160,100,60,0.8)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - s * 0.12, s * 0.67); ctx.quadraticCurveTo(cx, s * 0.73, cx + s * 0.12, s * 0.67); ctx.stroke();
  } else if (charId === "matt") {
    // Flat neutral mouth — barely there
    ctx.strokeStyle = "rgba(130,105,65,0.7)"; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(cx - s * 0.1, s * 0.67); ctx.lineTo(cx + s * 0.1, s * 0.67); ctx.stroke();
    // Slight stubble shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(cx, s * 0.73, s * 0.22, s * 0.1, 0, 0, Math.PI);
    ctx.fill();
  }

  // Character-color border glow
  ctx.strokeStyle = COLORS[charId] || "#00ffcc";
  ctx.lineWidth = 1.5;
  roundRect(ctx, 0.75, 0.75, s - 1.5, s - 1.5, 3.5);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function getOrDrawFace(charId) {
  if (_faceCache[charId]) return _faceCache[charId];
  const cv = document.createElement("canvas"); cv.width = cv.height = 34;
  drawFace(cv, charId);
  _faceCache[charId] = cv;
  return cv;
}

// ── Banter lines — correct campaign wave structure ────────────────────────────
// Campaign: waves 1-2 = skeletons only, 3-4 = skeletons+SOLDIERS, 5-6 = all+DOGS, 7 = boss
const LINES = {
  wave_start: {
    1: [
      { c: "iestyn",  t: "First contact. Keep tight, keep moving." },
      { c: "will",    t: "Finally. Let's get to work." },
      { c: "patrick", t: "Skeleton class hostiles. Fragile individually but they mass well." },
      { c: "matt",    t: "Here we go then." },
    ],
    2: [
      { c: "will",    t: "More of them. Good." },
      { c: "matt",    t: "Right on schedule." },
      { c: "iestyn",  t: "Second wave — more of the same. Stay sharp." },
      { c: "patrick", t: "Wave two. Elevated numbers, same threat profile." },
    ],
    3: [
      { c: "iestyn",  t: "Armed soldiers now. They shoot back — find cover!" },
      { c: "will",    t: "Right, now it's a proper fight." },
      { c: "patrick", t: "Armed units. Different tactical profile — they'll engage at range." },
      { c: "matt",    t: "Great. Now they've got guns." },
    ],
    4: [
      { c: "matt",    t: "Mixed contact. Skeletons and shooters. Triage accordingly." },
      { c: "iestyn",  t: "Keep suppressing the soldiers — let the skeletons come to you." },
      { c: "will",    t: "This is what it's supposed to feel like." },
      { c: "patrick", t: "Soldiers are the priority. Suppress them first." },
    ],
    5: [
      { c: "iestyn",  t: "Dogs! They're fast and they hit hard — watch your feet!" },
      { c: "will",    t: "Oh brilliant, they've thrown dogs at us." },
      { c: "patrick", t: "Canine units. High speed, close-range priority. Don't let them flank you." },
      { c: "matt",    t: "Of course there are dogs." },
    ],
    6: [
      { c: "matt",    t: "Everything at once now. Manage the threat types." },
      { c: "iestyn",  t: "Heavy contact. Soldiers, skeletons, dogs — stay mobile." },
      { c: "will",    t: "All three types. Now we're getting somewhere." },
      { c: "patrick", t: "Full mixed engagement. Prioritise the shooters then clean the rest up." },
    ],
    7: [
      { c: "iestyn",  t: "Final wave. Something big is incoming — this is the boss." },
      { c: "matt",    t: "I can feel the ground vibrating. Something's coming." },
      { c: "will",    t: "THE BIG ONE. Let's see what you've got." },
      { c: "patrick", t: "Anomalous contact on approach. Extreme caution — conventional weapons won't cut it." },
    ],
  },

  wave_clear: [
    { c: "iestyn",  t: "Area clear. Reload — next one's incoming." },
    { c: "will",    t: "Clean. What's next?" },
    { c: "matt",    t: "Clear. For now." },
    { c: "patrick", t: "Wave neutralised. Use the time." },
    { c: "will",    t: "That's what I'm talking about." },
    { c: "iestyn",  t: "Good work. Stay sharp." },
    { c: "matt",    t: "Still standing. I'll take it." },
    { c: "patrick", t: "All down. Brief window — make it count." },
  ],

  boss_spotted: [
    { c: "iestyn",  t: "TITAN BRUTE! Switch to pistol or sword — it's impervious to everything else!" },
    { c: "matt",    t: "That thing is enormous. And apparently bulletproof. Of course it is." },
    { c: "will",    t: "COME ON THEN. Let's go." },
    { c: "patrick", t: "Boss unit confirmed. Standard weapons deflect off its hide — pistol and sword only." },
  ],

  miniboss_spotted: [
    { c: "iestyn",  t: "TITAN SCOUT! Compact version of the Brute — hit it with anything, but move fast!" },
    { c: "matt",    t: "Oh brilliant. They've made a pocket-sized version. Still going to hurt." },
    { c: "will",    t: "Smaller target, faster moves. I like it. Let's see what it's got." },
    { c: "patrick", t: "Scout-class mech confirmed. All weapons effective — unlike the Brute. Eliminate it quickly." },
  ],

  first_dog: [
    { c: "will",    t: "DOGS! Stay on your feet or you're getting bitten!" },
    { c: "iestyn",  t: "Canine hostiles! Fast and aggressive — don't let them flank you!" },
    { c: "matt",    t: "Ah. Dogs." },
    { c: "patrick", t: "Hostile canines. Speed advantage over infantry — close the distance first." },
  ],

  first_soldier: [
    { c: "patrick", t: "Armed soldiers have entered the field. They return fire — play it smart." },
    { c: "iestyn",  t: "Shooters! Cover and flank — don't stand in the open!" },
    { c: "will",    t: "Finally something that fights back. Better." },
    { c: "matt",    t: "Great. Guns." },
  ],

  idle: [
    { c: "matt",    t: "I can't tell if there are fewer of them, or I've just stopped feeling it." },
    { c: "patrick", t: "At current spawn rates we're looking at continued escalation. Manageable, for now." },
    { c: "will",    t: "Every wave the same. Every wave I come out on top." },
    { c: "iestyn",  t: "Check your corners. They come from everywhere." },
    { c: "matt",    t: "For the record — this was listed as a voluntary mission." },
    { c: "will",    t: "Is it just me or are they getting uglier?" },
    { c: "patrick", t: "Seventeen distinct movement patterns catalogued. Interesting." },
    { c: "iestyn",  t: "Nobody dies today. That's an order." },
    { c: "matt",    t: "I've had worse. I'm trying to think of when." },
    { c: "will",    t: "I could do this all day. Might have to." },
    { c: "iestyn",  t: "Eyes on the perimeter. They like to flank." },
    { c: "patrick", t: "The rate is escalating with each wave. Expected, but not ideal." },
    { c: "matt",    t: "Whatever's driving them — it doesn't stop. Not for anything." },
    { c: "will",    t: "That's it! Keep it coming!" },
    { c: "patrick", t: "Architecturally speaking, this position is defensible. We're using it well." },
    { c: "matt",    t: "Any chance we just... walk away from this? No. Didn't think so." },
  ],
};

// ── Queue + display state ──────────────────────────────────────────────────────
let _queue     = [];
let _showing   = false;
let _dismissAt = 0;

let _idleTimer  = 0;
const IDLE_MIN  = 40;
const IDLE_MAX  = 68;
let _nextIdle   = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);

let _seenTypes   = new Set();
let _currentWave = 0;

function getBox()  { return document.getElementById("banter-box"); }
function getFace() { return getBox()?.querySelector(".banter-face"); }
function getSpkr() { return getBox()?.querySelector(".banter-speaker"); }
function getText() { return getBox()?.querySelector(".banter-text"); }

function showLine({ c, t }) {
  _showing   = true;
  _dismissAt = performance.now() + 5000;

  // Face
  const faceEl = getFace();
  if (faceEl) {
    const src = getOrDrawFace(c);
    const ctx = faceEl.getContext("2d");
    ctx.clearRect(0, 0, faceEl.width, faceEl.height);
    ctx.drawImage(src, 0, 0, faceEl.width, faceEl.height);
    faceEl.style.boxShadow = `0 0 5px ${COLORS[c]}55`;
  }

  const spkr = getSpkr();
  if (spkr) { spkr.textContent = NAMES[c] || c.toUpperCase(); spkr.style.color = COLORS[c] || "#fff"; }
  const textEl = getText();
  if (textEl) textEl.textContent = t;

  const box = getBox();
  if (box) {
    box.classList.remove("show");
    void box.offsetWidth;
    box.classList.add("show");
  }
}

function dismiss() {
  if (!_showing) return;
  _showing = false;
  getBox()?.classList.remove("show");
  if (_queue.length > 0) setTimeout(processQueue, 320);
}

function processQueue() {
  if (_showing || _queue.length === 0) return;
  showLine(_queue.shift());
}

function pickUnlocked(arr) {
  // Only use lines spoken by characters who have been introduced in the story.
  const unlocked = getUnlockedCharacters();
  const available = arr.filter((line) => unlocked.has(line.c));
  // Fall back to full pool if filtering leaves nothing (shouldn't happen in practice).
  const pool = available.length > 0 ? available : arr;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function fireBanter(eventType, wave) {
  if (game.gameMode !== "campaign") return;
  let pool;
  if (eventType === "wave_start") pool = LINES.wave_start[wave] || LINES.wave_clear;
  else pool = LINES[eventType];
  if (!pool?.length) return;
  const delay = (eventType === "wave_start" || eventType === "wave_clear") ? 1300 : 450;
  setTimeout(() => {
    _queue.push(pickUnlocked(pool));
    processQueue();
  }, delay);
}

export function tickBanter(dt) {
  if (game.state !== "PLAYING" || game.gameMode !== "campaign") return;

  if (_showing && performance.now() >= _dismissAt) dismiss();

  // Reset per-wave enemy tracking when wave changes
  if (game.wave !== _currentWave) {
    _currentWave = game.wave;
    _seenTypes.clear();
  }

  // Detect first appearances of enemy types mid-wave
  for (const e of game.enemies) {
    if (e.type === "dog" && !_seenTypes.has("dog")) {
      _seenTypes.add("dog");
      fireBanter("first_dog");
    }
    if (e.type === "soldier" && !_seenTypes.has("soldier")) {
      _seenTypes.add("soldier");
      fireBanter("first_soldier");
    }
    if (e.type === "boss" && !_seenTypes.has("boss")) {
      _seenTypes.add("boss");
      fireBanter("boss_spotted");
    }
    if (e.type === "miniboss" && !_seenTypes.has("miniboss")) {
      _seenTypes.add("miniboss");
      fireBanter("miniboss_spotted");
    }
  }

  // Idle lines during active combat
  if (game.waveState === "ACTIVE" || game.waveState === "SPAWNING") {
    _idleTimer += dt;
    if (_idleTimer >= _nextIdle && _queue.length === 0 && !_showing) {
      _idleTimer  = 0;
      _nextIdle   = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
      _queue.push(pickUnlocked(LINES.idle));
      processQueue();
    }
  } else {
    _idleTimer = 0;
  }
}
