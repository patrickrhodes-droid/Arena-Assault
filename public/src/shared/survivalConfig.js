// Tunables for Survival mode. Imported by both server and client.

export const CHUNK_SIZE = 64;       // world units per chunk side
export const CHUNK_RES  = 24;       // vertices per chunk side (23x23 quads ~= 1k tris/chunk)
export const LOAD_RADIUS   = 3;     // 7x7 chunks around player
export const UNLOAD_RADIUS = 4;     // hysteresis before disposal

export const OUTPOST_RADIUS = 18;   // no-fire / no-spawn safe radius around origin
export const VENDOR_REACH   = 6;    // E key opens shop within this distance from vendor
// Vendor world position (matches survival_outpost.json `outpost_vendor`).
export const VENDOR_POS = { x: 0, z: -6 };

export const SOFT_WORLD_BOUND = 4000; // bullets despawn outside this box

// Day/night cycle (seconds)
export const DAY_DURATION   = 120;
export const NIGHT_DURATION = 60;
export const FULL_CYCLE     = DAY_DURATION + NIGHT_DURATION; // 180s

// Difficulty scaling -- HP/dmg roughly doubles every 120 units from origin
export function difficultyAt(x, z) {
  return 1 + Math.hypot(x, z) / 120;
}

export function biomeBonus(biomeId) {
  // Matches plan: meadow 1.0, frostpine 1.4, ashfen 1.7, crimson 2.2
  return [1.0, 1.4, 1.7, 2.2][biomeId | 0] ?? 1.0;
}

export function worldToChunk(x, z) {
  return [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
}

export function chunkKey(cx, cz) {
  return `${cx}|${cz}`;
}
