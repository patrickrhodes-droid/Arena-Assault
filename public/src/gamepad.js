import { game } from "./state.js";
import { cycleWeapon, cycleWeaponBack, getWeapon, startReload, usingFirstPersonView } from "./combat.js";

const DEADZONE = 0.15;
const TRIGGER_THRESHOLD = 0.15;
const MENU_NAV_REPEAT = 0.18;
const STICK_NAV_THRESHOLD = 0.5;

const prev = new Array(20).fill(false);
let prevRt = false;
let menuNavCooldown = 0;

// Double-tap left stick forward → sprint (mirrors keyboard double-tap W)
let stickFwdLastTap = 0;
let prevStickFwd = false;

function dead(v) {
  return Math.abs(v) < DEADZONE ? 0 : v;
}

// Auto-fill player name when a controller connects (so no keyboard required)
window.addEventListener("gamepadconnected", () => {
  const nameInput = document.getElementById("player-name");
  if (nameInput && !nameInput.value.trim()) {
    nameInput.value = "Operator";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
});

// ── Menu navigation ───────────────────────────────────────────────────────────

function getMenuContainer() {
  if (game.state === "PAUSED")   return document.getElementById("pause-panel");
  if (game.state === "GAMEOVER") return document.querySelector(".gameover-panel");
  if (game.state === "CUTSCENE") {
    const charPanel = document.getElementById("cutscene-char-panel");
    if (charPanel && getComputedStyle(charPanel).display !== "none") return charPanel;
    return null;
  }
  if (game.state === "MENU") {
    return document.querySelector(".lobby-screen.active .lobby-panel");
  }
  return null;
}

function getFocusables(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    "button:not([disabled]):not([hidden]), summary, input[type='range'], select, input[type='checkbox'], [tabindex='0']"
  )).filter((el) => el.offsetParent !== null);
}

function navigateMenus(gp) {
  if (menuNavCooldown > 0) { menuNavCooldown -= game.dt; return; }

  const lx = gp.axes[0] ?? 0;
  const ly = gp.axes[1] ?? 0;
  // D-pad: continuous press (cooldown throttles repeat)
  const dUp    = gp.buttons[12]?.pressed ?? false;
  const dDown  = gp.buttons[13]?.pressed ?? false;
  const dLeft  = gp.buttons[14]?.pressed ?? false;
  const dRight = gp.buttons[15]?.pressed ?? false;
  // Action buttons: one-shot
  const aBtn   = (gp.buttons[0]?.pressed  ?? false) && !prev[0];
  const bBtn   = (gp.buttons[1]?.pressed  ?? false) && !prev[1];
  const startBtn = (gp.buttons[9]?.pressed ?? false) && !prev[9];

  // Left stick + D-pad: up/left = back, down/right = forward
  const stickUp    = ly < -STICK_NAV_THRESHOLD;
  const stickDown  = ly >  STICK_NAV_THRESHOLD;
  const stickLeft  = lx < -STICK_NAV_THRESHOLD;
  const stickRight = lx >  STICK_NAV_THRESHOLD;
  const navBack    = dUp    || dLeft    || stickUp    || stickLeft;
  const navForward = dDown  || dRight   || stickDown  || stickRight;

  // Start / B → resume if paused
  if ((startBtn || bBtn) && game.state === "PAUSED") {
    document.getElementById("resume-btn")?.click();
    menuNavCooldown = MENU_NAV_REPEAT;
    return;
  }

  const container  = getMenuContainer();
  const focusables = getFocusables(container);
  if (focusables.length === 0) return;

  const activeEl = document.activeElement;
  let idx = focusables.indexOf(activeEl);
  if (idx < 0) idx = 0;

  if (navForward) {
    idx = (idx + 1) % focusables.length;
    focusables[idx].focus();
    menuNavCooldown = MENU_NAV_REPEAT;
  } else if (navBack) {
    idx = (idx - 1 + focusables.length) % focusables.length;
    focusables[idx].focus();
    menuNavCooldown = MENU_NAV_REPEAT;
  }

  const focused = document.activeElement;

  // A → activate focused element
  if (aBtn && focused && container?.contains(focused)) {
    if (focused.tagName === "SUMMARY") {
      focused.parentElement.open = !focused.parentElement.open;
    } else if (focused.type === "checkbox") {
      focused.checked = !focused.checked;
      focused.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      focused.click();
    }
    menuNavCooldown = MENU_NAV_REPEAT;
  }

  // Range: left/up = decrease, right/down = increase (continuous via cooldown)
  if (focused?.type === "range") {
    const step = Number(focused.step) || 1;
    let val = Number(focused.value);
    if (dRight || dDown) { val = Math.min(Number(focused.max), val + step); focused.value = val; focused.dispatchEvent(new Event("input", { bubbles: true })); menuNavCooldown = 0.08; }
    if (dLeft  || dUp)   { val = Math.max(Number(focused.min), val - step); focused.value = val; focused.dispatchEvent(new Event("input", { bubbles: true })); menuNavCooldown = 0.08; }
  }

  // Select: left/up = prev option, right/down = next option
  if (focused?.tagName === "SELECT") {
    if ((dRight || dDown) && focused.selectedIndex < focused.options.length - 1) { focused.selectedIndex++; focused.dispatchEvent(new Event("change", { bubbles: true })); menuNavCooldown = MENU_NAV_REPEAT; }
    if ((dLeft  || dUp)  && focused.selectedIndex > 0)                           { focused.selectedIndex--; focused.dispatchEvent(new Event("change", { bubbles: true })); menuNavCooldown = MENU_NAV_REPEAT; }
  }
}

// ── Main poll (called every frame from animate) ───────────────────────────────

export function pollGamepad(actions) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const pad of pads) {
    if (pad?.connected) { gp = pad; break; }
  }
  if (!gp) {
    game.gpForward = false;
    game.gpBack    = false;
    game.gpLeft    = false;
    game.gpRight   = false;
    return;
  }

  // ── Cutscene dialogue advance (A or Start) — char-select navigated via menus below
  if (game.state === "CUTSCENE") {
    const charPanel    = document.getElementById("cutscene-char-panel");
    const charVisible  = charPanel && getComputedStyle(charPanel).display !== "none";
    if (charVisible) {
      navigateMenus(gp);
    } else {
      const aJust     = (gp.buttons[0]?.pressed ?? false) && !prev[0];
      const startJust = (gp.buttons[9]?.pressed ?? false) && !prev[9];
      if (aJust || startJust) {
        document.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", bubbles: true }));
      }
    }
    for (let i = 0; i < Math.min(gp.buttons.length, prev.length); i++) {
      prev[i] = gp.buttons[i]?.pressed ?? false;
    }
    return;
  }

  if (game.state !== "PLAYING") {
    navigateMenus(gp);
    for (let i = 0; i < Math.min(gp.buttons.length, prev.length); i++) {
      prev[i] = gp.buttons[i]?.pressed ?? false;
    }
    return;
  }

  // ── PLAYING ───────────────────────────────────────────────────────────────

  // Hide click-to-aim prompt — controller doesn't need pointer lock
  if (game.dom?.clickPrompt) game.dom.clickPrompt.style.display = "none";

  // ── Start (button 9) → pause ──────────────────────────────────────────────
  if ((gp.buttons[9]?.pressed ?? false) && !prev[9]) {
    actions.pauseGame();
  }

  // ── Left stick → movement ─────────────────────────────────────────────────
  const lx = dead(gp.axes[0] ?? 0);
  const ly = dead(gp.axes[1] ?? 0);
  game.gpForward = ly < -0.3;
  game.gpBack    = ly >  0.3;
  game.gpLeft    = lx < -0.3;
  game.gpRight   = lx >  0.3;

  // ── L3 (button 10) → sprint toggle ───────────────────────────────────────
  if ((gp.buttons[10]?.pressed ?? false) && !prev[10] && !game.isCrouching) {
    game.sprintLocked = !game.sprintLocked;
  }

  // ── Double-tap left stick forward → sprint (Minecraft style) ─────────────
  const stickFwd = ly < -0.6; // must push reasonably hard forward
  if (stickFwd && !prevStickFwd && !game.isCrouching) {
    const now = performance.now();
    if (now - stickFwdLastTap < 300) game.sprintLocked = true;
    stickFwdLastTap = now;
  }
  if (!stickFwd) prevStickFwd = false;
  else prevStickFwd = stickFwd;

  // ── R3 (button 11) → grapple ─────────────────────────────────────────────
  if ((gp.buttons[11]?.pressed ?? false) && !prev[11]) actions.fireGrapple();

  // ── Right stick → camera (half sens when ADS) ────────────────────────────
  const aimSens = game.isAiming ? game.gpSens * 0.5 : game.gpSens;
  const rx = dead(gp.axes[2] ?? 0);
  const ry = dead(gp.axes[3] ?? 0);
  if (rx !== 0) game.camTheta -= rx * aimSens * game.dt;
  if (ry !== 0) {
    if (usingFirstPersonView()) {
      game.camPhi = Math.max(-1.25, Math.min(1.5, game.camPhi + ry * aimSens * game.dt));
    } else {
      game.camPhi = Math.max(-0.55, Math.min(0.85, game.camPhi - ry * aimSens * game.dt));
    }
  }

  // ── RT (button 7) → fire ─────────────────────────────────────────────────
  const rtDown = (gp.buttons[7]?.value ?? 0) > TRIGGER_THRESHOLD;
  if (rtDown && !prevRt) game.mouseClicked = true;
  game.mouseDown = rtDown;
  prevRt = rtDown;

  // ── LT (button 6) → aim ──────────────────────────────────────────────────
  game.isAiming = (gp.buttons[6]?.value ?? 0) > TRIGGER_THRESHOLD;

  // ── A (button 0) → jump ──────────────────────────────────────────────────
  if ((gp.buttons[0]?.pressed ?? false) && !prev[0]) actions.tryJump();

  // ── B (button 1) → held = pick up weapon / revive (KeyE analog) ──────────
  game.keys.KeyE = gp.buttons[1]?.pressed ?? false;

  // ── X (button 2) → reload ────────────────────────────────────────────────
  if ((gp.buttons[2]?.pressed ?? false) && !prev[2] && !game.isReloading && game.currentWeapon !== "grapple" && game.ammo < getWeapon().mag) {
    startReload();
    actions.updateHUD();
  }

  // ── Y (button 3) → crouch toggle ─────────────────────────────────────────
  if ((gp.buttons[3]?.pressed ?? false) && !prev[3] && game.localPlayerIsAlive && !game.isOnLadder) {
    game.isCrouching = !game.isCrouching;
    if (game.isCrouching) game.sprintLocked = false;
  }

  // ── LB (button 4) → cycle weapon back ────────────────────────────────────
  if ((gp.buttons[4]?.pressed ?? false) && !prev[4]) { cycleWeaponBack(); actions.updateHUD(); }

  // ── RB (button 5) → cycle weapon forward ─────────────────────────────────
  if ((gp.buttons[5]?.pressed ?? false) && !prev[5]) { cycleWeapon(); actions.updateHUD(); }

  // ── Update previous button states ─────────────────────────────────────────
  for (let i = 0; i < Math.min(gp.buttons.length, prev.length); i++) {
    prev[i] = gp.buttons[i]?.pressed ?? false;
  }
}
