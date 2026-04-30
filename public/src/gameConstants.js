// ── Shared game constants ─────────────────────────────────────────────────────
// Single source of truth for values used by both client code and server.js.
// server.js duplicates these as plain consts — if you change any value here,
// update the matching line in server.js too (search for the constant name).

export const ARENA_SIZE = 144;
export const HALF = ARENA_SIZE / 2;           // 72
export const WALL_H = 6;
export const P_RAD = 0.5;
export const P_MAX_HP = 1000;
export const ENEMY_BULLET_SPEED = 28;         // server: B_SPD_E
export const BASE_FOV = 70;
export const GRAV = 20;
export const JUMP_VEL = 11.2;
export const EYE_H = 2.15;
export const LAND_SNAP = 0.18;
export const EPS = 1e-6;

export const WEAPON_ORDER = ["pistol", "assault", "shotgun", "sniper", "sword", "grapple"];

export const PVP_WIN_KILLS = 6;
export const PVP_KILLS_PER_WEAPON = 1;
export const PVP_SWORD_KILLS_TO_WIN = 2;
export const PVP_CORNERS = [[-60, -60], [60, -60], [-60, 60], [60, 60]];

export const BOSS_ESCAPE_HEIGHT = 50 / 6;
export const BOSS_ESCAPE_GRAVITY = 180;
export const BOSS_ESCAPE_JUMP_VELOCITY = Math.sqrt(2 * BOSS_ESCAPE_GRAVITY * BOSS_ESCAPE_HEIGHT);
export const BOSS_ESCAPE_FORWARD_SPEED = 14;
