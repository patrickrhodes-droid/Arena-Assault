import * as THREE from "three";
import { game } from "./state.js";
import { FULL_CYCLE, DAY_DURATION } from "./shared/survivalConfig.js";

// Palette stops for the dynamic sky / fog / ambient. Sun's vertical position
// (-1..1) is the mix value.
const SKY_NIGHT  = new THREE.Color(0x0a1424);
const SKY_DUSK   = new THREE.Color(0x6a3a2a);
const SKY_DAY    = new THREE.Color(0x8ac0e4);
const FOG_NIGHT  = new THREE.Color(0x0c1424);
const FOG_DUSK   = new THREE.Color(0x5a4030);
const FOG_DAY    = new THREE.Color(0xcde0ea);
const SUN_DAWN   = new THREE.Color(0xffc080);
const SUN_NOON   = new THREE.Color(0xffffff);
const SUN_NIGHT  = new THREE.Color(0x6b88c8);
const BLOOD_FOG  = new THREE.Color(0x3a0a0a);
const BLOOD_SKY  = new THREE.Color(0x4a0e0e);

const _tmpA = new THREE.Color();
const _tmpB = new THREE.Color();

// Quadratic interp between three palette stops based on signed t in [-1..1].
function ternaryLerp(out, low, mid, high, t) {
  if (t <= 0) {
    out.copy(low).lerp(mid, t + 1);
  } else {
    out.copy(mid).lerp(high, t);
  }
  return out;
}

let _shadowUpdateCounter = 0;

// Advance the local clock between server `worldTime` syncs.
export function tickDayNight(dt) {
  game.dayTimeSec = (game.dayTimeSec + dt) % FULL_CYCLE;

  if (!game.shared.sunLight || !game.scene) return;

  const theta = (game.dayTimeSec / FULL_CYCLE) * Math.PI * 2;
  // Day is 120s of 180s → arc spends 2/3 of cycle above horizon. We map theta
  // so that sin(theta + offset) > 0 for the day window.
  // Offset shifts the start of the cycle to "dawn".
  const offset = -Math.PI * 0.5; // theta=0 begins at horizon (dawn)
  const sunY = Math.sin(theta + offset);
  const sunX = Math.cos(theta + offset);
  const sunZ = 0.3 * Math.sin((theta + offset) * 2);

  const sun = game.shared.sunLight;
  sun.position.set(sunX * 200, Math.max(8, sunY * 200), sunZ * 200);
  // Intensity ramps from near-zero to bright midday
  const tDay = THREE.MathUtils.clamp(sunY, -1, 1);
  sun.intensity = Math.max(0.04, sunY > 0 ? 0.3 + sunY * 1.4 : 0.04);

  // Sun colour — dusk/dawn warm, night cool, midday white
  ternaryLerp(sun.color, SUN_NIGHT, SUN_DAWN, SUN_NOON, tDay);

  // Sky + fog
  ternaryLerp(_tmpA, SKY_NIGHT, SKY_DUSK, SKY_DAY, tDay);
  ternaryLerp(_tmpB, FOG_NIGHT, FOG_DUSK, FOG_DAY, tDay);
  if (game.bloodMoon && sunY < 0.1) {
    _tmpA.lerp(BLOOD_SKY, 0.7);
    _tmpB.lerp(BLOOD_FOG, 0.7);
    sun.color.lerp(BLOOD_SKY, 0.4);
  }
  game.scene.background = _tmpA;
  if (game.scene.fog) game.scene.fog.color.copy(_tmpB);

  // Hemisphere lift
  if (game.shared.hemiLight) {
    game.shared.hemiLight.intensity = 0.25 + Math.max(0, sunY) * 0.95;
  }

  // Only regen shadow map every 4th frame
  if (sun.shadow) {
    _shadowUpdateCounter = (_shadowUpdateCounter + 1) % 4;
    sun.shadow.needsUpdate = _shadowUpdateCounter === 0;
  }

  // Follow shadow camera to player so the cascade frustum is centred on the action
  if (game.visuals?.player?.playerGroup && sun.shadow) {
    const pp = game.visuals.player.playerGroup.position;
    sun.target.position.set(pp.x, 0, pp.z);
    sun.target.updateMatrixWorld();
  }
}

// Called from network.js when a `worldTime` sync arrives — snap the clock.
export function syncDayTime(serverDayTimeSec) {
  if (typeof serverDayTimeSec === 'number' && Number.isFinite(serverDayTimeSec)) {
    game.dayTimeSec = ((serverDayTimeSec % FULL_CYCLE) + FULL_CYCLE) % FULL_CYCLE;
    game.dayTimeSyncedAt = performance.now();
  }
}

export function isNight() {
  // Night = the bottom 60s of the 180s arc
  return game.dayTimeSec > DAY_DURATION;
}
