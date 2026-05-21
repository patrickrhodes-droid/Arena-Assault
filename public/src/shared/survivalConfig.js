// Tunables for Survival mode. Imported by both server and client.

export const CHUNK_SIZE = 64;       // world units per chunk side
export const CHUNK_RES  = 16;       // vertices per chunk side (15x15 quads ~= 450 tris/chunk)
export const LOAD_RADIUS   = 2;     // 5x5 chunks around player
export const UNLOAD_RADIUS = 3;     // hysteresis before disposal

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

// Deterministic list of outpost locations for a given terrain seed.
// Index 0 is always the origin home base; the others are spread out far
// apart in a rough ring so players have meaningful travel between them.
// Returns: [{ id, x, z, name }]
export function getOutpostLocations(seed) {
  const out = [{ id: 'origin', x: 0, z: 0, name: 'HOME OUTPOST' }];
  // Mulberry32 inline so this file stays standalone for both client + server
  let a = (seed | 0) >>> 0;
  const rnd = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const NAMES = ['NORTH POST', 'EAST POST', 'SOUTH POST', 'WEST POST', 'FAR POST'];
  const RING = [
    { ang: 0,            r: 320 },
    { ang: Math.PI / 2,  r: 380 },
    { ang: Math.PI,      r: 340 },
    { ang: 3 * Math.PI / 2, r: 420 },
    { ang: Math.PI / 4,  r: 520 },
  ];
  for (let i = 0; i < RING.length; i++) {
    const jitter = 0.4 * (rnd() - 0.5);
    const radJitter = 1 + 0.3 * (rnd() - 0.5);
    const ang = RING[i].ang + jitter;
    const r = RING[i].r * radJitter;
    const x = Math.round(Math.cos(ang) * r);
    const z = Math.round(Math.sin(ang) * r);
    out.push({ id: `wild_${i}`, x, z, name: NAMES[i] || `OUTPOST ${i + 1}` });
  }
  return out;
}

export const OUTPOST_BUILD_RADIUS = 14; // visual + spawn-safe zone for wild outposts
export const HOME_BASE_REACH = 6;       // press button to set home within this range

