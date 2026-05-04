// Re-export shared constants from the single source of truth.
// Server.js keeps its own copies — see gameConstants.js for the canonical values.
export {
  ARENA_SIZE, HALF, WALL_H, P_RAD, P_MAX_HP,
  BASE_FOV, GRAV, JUMP_VEL, EYE_H, EPS,
  WEAPON_ORDER,
} from "./gameConstants.js";
// PVP_WIN_KILLS, PVP_KILLS_PER_WEAPON, PVP_SWORD_KILLS_TO_WIN, PVP_CORNERS are declared
// directly below — do NOT re-export them here or the module gets a duplicate-export SyntaxError.

export const B_SPD_E = 28;         // alias kept for backward compatibility (= ENEMY_BULLET_SPEED)
export const LAND_SNAP = 0.35;
export const LEDGE_GRACE = 0.35;
export const DEFAULT_WEAPON = "pistol";

export const PLAYER_MOVEMENT = {
  walkSpeed: 6,
  sprintMultiplier: 2.9,
  crouchSpeed: 2.7,
  ladderClimbSpeed: 4.5,
  crouchScale: 0.65,    // visual squish applied to playerGroup.scale.y when crouching
  recoilDecay: 0.85,    // multiplied each frame to decay first-person recoil
  crouchLerp: 14,       // lerp rate for crouch scale animation
};

export const GRAPPLE_TUNING = {
  maxDistance: 45,
  minAttachDistance: 2,
  pullSpeed: 60,
  releaseDistance: 1.5,
  releaseCooldown: 0.8,
  jumpReleaseCooldown: 0.5,
  enemyPullStopDistance: 8,
  bossAttachHeight: 1.5,
};

export const REVIVE_TUNING = {
  range: 2.8,
  holdTime: 3.0,
};

export const SKELETON_TUNING = {
  hp: 1,
  baseSpeed: 9,
  speedRandom: 2.5,
  attackDamageBase: 8,
  attackDamagePerWave: 1,
  attackRange: 2.0,
  attackFrequency: 0.8,
};

export const DOG_TUNING = {
  baseHp: 46,
  hpPerWave: 10,
  hpScale: 1.1,
  baseSpeed: 8,
  speedRandom: 2,
  speedWaveBonus: 0.3,
  attackDamageBase: 12,
  attackDamagePerWave: 2,
  attackRange: 2.5,
  attackFrequency: 1.0,
};

export const SOLDIER_TUNING = {
  baseHp: 58,
  hpPerWave: 12,
  hpScale: 1.1,
  baseSpeed: 3.5,
  speedRandom: 1.5,
  speedWaveBonus: 0.2,
  fireIntervalMin: 0.8,
  fireIntervalBase: 2.2,
  fireIntervalWaveReduction: 0.1,
  fireIntervalRandom: 0.4,
  kiteAdvanceDistance: 14,
  kiteRetreatDistance: 7,
  retreatSpeedMultiplier: 0.4,
  attackRange: 50,
  bulletDamage: 25,
  bulletSpeed: 28,
  bulletLife: 4,
  shootAnimDuration: 0.7,
  bulletSpreadH: 0.24,  // horizontal spread added to each shot
};

export const BOSS_TUNING = {
  baseHp: 3600,
  hpScale: 1.1,
  moveSpeed: 12,
  attackDamageBase: 100,
  attackDamagePerWave: 10,
};

export const WEAPON_DEFS = {
  pistol: {
    label: "SERVICE PISTOL",
    mag: 14,
    fireRate: 0.3,
    reload: 1.2,
    pellets: 1,
    damage: 102,
    spreadHip: 0.018,
    spreadAim: 0.007,
    bulletSpeed: 96,
    bulletLife: 2.7,
    aimFov: 28,
    aimCamDist: 6.2,
    recoilZ: 0.05,
    recoilRX: 0.04,
    shake: 0.04,
    mode: "pistol",
  },
  assault: {
    label: "ASSAULT RIFLE",
    mag: 30,
    fireRate: 0.09,
    reload: 1.6,
    pellets: 1,
    damage: 46,
    spreadHip: 0.022,
    spreadAim: 0.008,
    bulletSpeed: 90,
    bulletLife: 3,
    aimFov: 28,
    aimCamDist: 6.5,
    recoilZ: 0.08,
    recoilRX: 0.05,
    shake: 0.06,
    mode: "assault",
  },
  shotgun: {
    label: "SHOTGUN",
    mag: 8,
    fireRate: 0.72,
    reload: 2.2,
    pellets: 8,
    damage: 72,
    minDamage: 8,
    falloffStart: 8,
    falloffEnd: 30,
    spreadHip: 0.12,
    spreadAim: 0.06,
    bulletSpeed: 78,
    bulletLife: 0.75,
    aimFov: 60,
    aimCamDist: 6.2,
    recoilZ: 0.14,
    recoilRX: 0.1,
    shake: 0.1,
    mode: "shotgun",
  },
  sniper: {
    label: "SNIPER",
    mag: 5,
    fireRate: 1.15,
    reload: 2.6,
    pellets: 1,
    damage: 500,
    spreadHip: 0.012,
    spreadAim: 0.0015,
    bulletSpeed: 160,
    bulletLife: 3.5,
    aimFov: 19,
    aimCamDist: 6.8,
    recoilZ: 0.18,
    recoilRX: 0.14,
    shake: 0.14,
    mode: "sniper",
  },
  sword: {
    label: "TACTICAL BLADE",
    mag: 1,
    fireRate: 0.4,
    reload: 0.1,
    pellets: 0,
    damage: 500,
    range: 4.5,
    arc: 1.2,
    bulletSpeed: 0,
    bulletLife: 0,
    aimFov: 75,
    aimCamDist: 5.5,
    mode: "sword",
  },
  grapple: {
    label: "GRAPPLE HOOK",
    mag: 0,
    fireRate: 0.3,
    reload: 0,
    pellets: 0,
    damage: 80,
    spreadHip: 0,
    spreadAim: 0,
    bulletSpeed: 0,
    bulletLife: 0,
    aimFov: 55,
    aimCamDist: 5.5,
    recoilZ: 0.06,
    recoilRX: 0.04,
    shake: 0.05,
    mode: "grapple",
  },
};

export const CHARACTERS = {
  iestyn:  { name: "Iestyn",  headColor: 0xff5544, headScale: 1 },
  patrick: { name: "Patrick", headColor: 0x55aaff, headScale: 1},
  will:    { name: "Will",    headColor: 0x66dd66, headScale: 1 },
  matt:    { name: "Matt",    headColor: 0xffcc33, headScale: 1 },
};

export const CHARACTER_ORDER = ["iestyn", "patrick", "will", "matt"];

export const PVP_WIN_KILLS = 13;
export const PVP_KILLS_PER_WEAPON = 2;
export const PVP_SWORD_KILLS_TO_WIN = 5;
export const PVP_CORNERS = [
  [-60, -60],
  [60, -60],
  [-60, 60],
  [60, 60],
];

export const MAP_DEFS = {
  arena: {
    name: "COMBAT ARENA",
    subtitle: "Industrial Training Facility",
    accentColor: "#2de1d0",
    previewGradient: "linear-gradient(135deg,#10242c 0%,#1f4048 52%,#0d171c 100%)",
  },
  desert: {
    name: "DUST BOWL",
    subtitle: "Abandoned Desert Outpost",
    accentColor: "#ff9933",
    previewGradient: "linear-gradient(135deg,#c27a30 0%,#8B5A20 50%,#d48840 100%)",
  },
  city: {
    name: "DOWNTOWN",
    subtitle: "Sunlit Urban Warzone",
    accentColor: "#ff8a3d",
    previewGradient: "linear-gradient(135deg,#8ec5f4 0%,#d8b27a 52%,#f2dfbf 100%)",
  },
};

export const MAP_ORDER = ["arena", "desert", "city"];

export function createWeaponAmmo() {
  return Object.fromEntries(
    Object.entries(WEAPON_DEFS).map(([id, def]) => [id, def.mag]),
  );
}

export function createStats() {
  return {
    kills: 0,
    dogKills: 0,
    bossKills: 0,
    shotsFired: 0,
    shotsHit: 0,
    damageDealt: 0,
  };
}
