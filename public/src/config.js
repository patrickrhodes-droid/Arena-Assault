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
};

export const CHARACTERS = {
  iestyn:  { name: "Iestyn",  headColor: 0xff5544, headScale: 1 },
  patrick: { name: "Patrick", headColor: 0x55aaff, headScale: 1.0 },
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
    accentColor: "#3ce6cb",
    previewGradient: "linear-gradient(135deg,#1b2734 0%,#2a3c4e 50%,#152030 100%)",
  },
  desert: {
    name: "DUST BOWL",
    subtitle: "Abandoned Desert Outpost",
    accentColor: "#ff9933",
    previewGradient: "linear-gradient(135deg,#c27a30 0%,#8B5A20 50%,#d48840 100%)",
  },
  city: {
    name: "DOWNTOWN",
    subtitle: "Urban Combat Zone",
    accentColor: "#4488ff",
    previewGradient: "linear-gradient(135deg,#0a0f1a 0%,#1a2040 50%,#080c14 100%)",
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
