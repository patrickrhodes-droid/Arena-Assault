// Deterministic noise + seeded helpers shared between server and client.
// Identical input -> identical output on both Node V8 and browser V8.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(ix, iz, seed) {
  let h = Math.imul(ix | 0, 374761393);
  h = (h + Math.imul(iz | 0, 668265263)) >>> 0;
  h = (h ^ (seed | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const _grad2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function _gradIdx(ix, iz, seed) {
  return hash2(ix, iz, seed) & 7;
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export function simplex2(x, z, seed = 0) {
  const s = (x + z) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(z + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = z - Y0;
  let i1, j1;
  if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const g0 = _grad2[_gradIdx(i, j, seed)];
  const g1 = _grad2[_gradIdx(i + i1, j + j1, seed)];
  const g2 = _grad2[_gradIdx(i + 1, j + 1, seed)];
  let n0, n1, n2;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 < 0) n0 = 0; else { t0 *= t0; n0 = t0 * t0 * (g0[0] * x0 + g0[1] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 < 0) n1 = 0; else { t1 *= t1; n1 = t1 * t1 * (g1[0] * x1 + g1[1] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 < 0) n2 = 0; else { t2 *= t2; n2 = t2 * t2 * (g2[0] * x2 + g2[1] * y2); }
  return 70 * (n0 + n1 + n2);
}

export function fbm2(x, z, seed = 0, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  let amp = 1.0;
  let freq = 1.0;
  let sum = 0.0;
  let max = 0.0;
  for (let o = 0; o < octaves; o++) {
    sum += simplex2(x * freq, z * freq, seed + o) * amp;
    max += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / max;
}

// Canonical heightfield for Survival. Returns y in world units.
// Layered noise: low-frequency rolling hills + ridge-like mid frequency for
// distinct slopes + small detail bumpiness.
export function sampleHeight(x, z, seed = 0) {
  const continents = fbm2(x * 0.006, z * 0.006, seed, 4) * 22;
  const hills      = fbm2(x * 0.018, z * 0.018, seed ^ 1, 3) * 6;
  const detail     = fbm2(x * 0.06,  z * 0.06,  seed ^ 7, 2) * 1.4;
  // Smooth dome around the origin so the outpost sits on flatter ground.
  const distFromOrigin = Math.sqrt(x * x + z * z);
  const outpostFlatten = Math.max(0, 1 - distFromOrigin / 30); // 0..1 inside 30u of origin
  const h = continents + hills + detail;
  return h * (1 - outpostFlatten * 0.92);
}

export const BIOME_MEADOW    = 0;
export const BIOME_FROSTPINE = 1;
export const BIOME_ASHFEN    = 2;
export const BIOME_CRIMSON   = 3;
export const BIOME_NAMES = ['meadow', 'frostpine', 'ashfen', 'crimson'];

// Low-frequency 2-axis split into 4 biomes. Smooth at borders via t-blend.
export function sampleBiome(x, z, seed = 0) {
  const a = simplex2(x * 0.0025, z * 0.0025, seed ^ 13);
  const b = simplex2(x * 0.0028, z * 0.0028, seed ^ 27);
  let id;
  if (a > 0) id = b > 0 ? BIOME_CRIMSON : BIOME_FROSTPINE;
  else       id = b > 0 ? BIOME_ASHFEN : BIOME_MEADOW;
  // t is how deep we are inside the biome (0 = on border, 1 = centre)
  const t = Math.min(Math.abs(a), Math.abs(b));
  return { id, t };
}

// Slope magnitude via finite difference. Useful for rejecting prop spawns
// on cliffs and capping enemy speed on steep ground.
export function sampleSlope(x, z, seed = 0) {
  const eps = 0.5;
  const h0 = sampleHeight(x, z, seed);
  const hx = sampleHeight(x + eps, z, seed);
  const hz = sampleHeight(x, z + eps, seed);
  const dx = (hx - h0) / eps;
  const dz = (hz - h0) / eps;
  return Math.sqrt(dx * dx + dz * dz);
}
