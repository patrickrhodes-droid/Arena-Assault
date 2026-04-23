export const ARENA_SIZE = 72;
export const HALF = ARENA_SIZE / 2;
export const WALL_H = 6;
export const P_RAD = 0.5;
export const P_MAX_HP = 100;
export const B_SPD_E = 28;
export const BASE_FOV = 70;
export const GRAV = 20;
export const JUMP_VEL = 11.2;
export const EYE_H = 2.15;
export const LAND_SNAP = 0.35;
export const LEDGE_GRACE = 0.35;
export const EPS = 0.0001;
export const DEFAULT_WEAPON = "pistol";
export const WEAPON_ORDER = ["pistol", "assault", "shotgun", "sniper", "sword"];

export const WEAPON_DEFS = {
  pistol: {
    label: "SERVICE PISTOL",
    mag: 14,
    fireRate: 0.18,
    reload: 1.2,
    pellets: 1,
    damage: 34,
    spreadHip: 0.018,
    spreadAim: 0.007,
    bulletSpeed: 96,
    bulletLife: 2.7,
    aimFov: 62,
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
    damage: 25,
    spreadHip: 0.022,
    spreadAim: 0.008,
    bulletSpeed: 90,
    bulletLife: 3,
    aimFov: 56,
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
    damage: 18,
    minDamage: 4,
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
    damage: 240,
    spreadHip: 0.012,
    spreadAim: 0.0015,
    bulletSpeed: 160,
    bulletLife: 3.5,
    aimFov: 28,
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
    damage: 999,
    range: 4.5,
    arc: 1.2,
    bulletSpeed: 0,
    bulletLife: 0,
    aimFov: 75,
    aimCamDist: 5.5,
    mode: "sword",
  },
};

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
