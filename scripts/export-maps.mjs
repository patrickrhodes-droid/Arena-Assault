/**
 * One-time map migration script.
 * Run: node scripts/export-maps.mjs
 *
 * Reads geometry from the same coordinates used by public/src/scene.js and
 * emits public/maps/arena.json, desert.json, city.json, blacksite.json.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = join(__dirname, '../public/maps');
mkdirSync(MAPS_DIR, { recursive: true });

const ARENA_SIZE = 144;
const HALF = 72;
const WALL_H = 6;
const SA = '/assets/models/shooter asset pack/';
const CP = '/assets/models/City Props asset pack/';
const PI = Math.PI;

// ── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0;
function uid(prefix) {
  return `${prefix}_${String(++_seq).padStart(3, '0')}`;
}
function resetSeq() { _seq = 0; }

function r(v) { return Math.round(v * 1000) / 1000; }

function box(label, x, y, z, w, h, d, material = 'metal', collidable = true) {
  return {
    id: uid(material.slice(0, 3)),
    type: 'box', label,
    position: [r(x), r(y), r(z)],
    rotation: [0, 0, 0],
    size: [r(w), r(h), r(d)],
    material, collidable,
  };
}

function prop(label, model, x, y, z, scale = 1, rotY = 0, collidable = true) {
  return {
    id: uid('prp'),
    type: 'prop', label, model,
    position: [r(x), r(y), r(z)],
    rotation: [0, r(rotY), 0],
    scale: [r(scale), r(scale), r(scale)],
    collidable,
  };
}

function destr(label, model, x, y, z, scale = 1, rotY = 0, triggerRadius = 2.2) {
  return {
    id: uid('dst'),
    type: 'destructible', label, model,
    position: [r(x), r(y), r(z)],
    rotation: [0, r(rotY), 0],
    scale: [r(scale), r(scale), r(scale)],
    triggerRadius, collidable: true,
  };
}

function ladder(label, xMin, xMax, zMin, zMax, yMax) {
  const cx = (xMin + xMax) / 2;
  const cz = (zMin + zMax) / 2;
  const w = xMax - xMin;
  const depth = Math.max(0.2, zMax - zMin);
  return {
    id: uid('ldr'),
    type: 'ladder', label,
    position: [r(cx), r(yMax / 2), r(cz)],
    rotation: [0, 0, 0],
    size: [r(w), r(yMax), r(depth)],
    bounds: { xMin, xMax, zMin, zMax, yMax },
  };
}

function outerWalls(mapLabel, material = 'metal') {
  return [
    box(`${mapLabel} / Wall North`,  0,  WALL_H / 2, -HALF, ARENA_SIZE, WALL_H,        1, material),
    box(`${mapLabel} / Wall South`,  0,  WALL_H / 2,  HALF, ARENA_SIZE, WALL_H,        1, material),
    box(`${mapLabel} / Wall West`, -HALF, WALL_H / 2,    0,          1, WALL_H, ARENA_SIZE, material),
    box(`${mapLabel} / Wall East`,  HALF, WALL_H / 2,    0,          1, WALL_H, ARENA_SIZE, material),
  ];
}

// ── ARENA ─────────────────────────────────────────────────────────────────────

resetSeq();

// addTowerLadder(tx, tz, faceSign):  faceZ = tz + faceSign*2.5,  lz = faceZ + faceSign*0.07
// zMin = faceSign>0 ? faceZ-0.3 : faceZ-1.8,  zMax = faceSign>0 ? faceZ+1.8 : faceZ+0.3
function towerLadder(label, tx, tz, faceSign) {
  const faceZ = tz + faceSign * 2.5;
  const zMin = faceSign > 0 ? faceZ - 0.3 : faceZ - 1.8;
  const zMax = faceSign > 0 ? faceZ + 1.8 : faceZ + 0.3;
  return ladder(label, tx - 1.4, tx + 1.4, zMin, zMax, 10.3);
}

const arenaObjects = [
  ...outerWalls('Arena'),

  // Center hub — 4 metal barriers in a cross
  box('Arena / Hub Barrier N',  0, 1.0, -14, 5, 2, 0.4),
  box('Arena / Hub Barrier S',  0, 1.0,  14, 5, 2, 0.4),
  box('Arena / Hub Barrier W', -14, 1.0, 0, 0.4, 2, 5),
  box('Arena / Hub Barrier E',  14, 1.0, 0, 0.4, 2, 5),

  // Inner metal staircase (center-right)
  box('Arena / Metal Stair 1', -11, 0.55,  16, 3.2, 1.1, 3.2),
  box('Arena / Metal Stair 2',  -3, 1.05,  16, 3.2, 2.1, 3.2),
  box('Arena / Metal Stair 3',   5, 1.55,  16, 3.2, 3.1, 3.2),

  // Inner dark staircase (center-left)
  box('Arena / Dark Stair 1',  -5, 0.55, -16, 3.2, 1.1, 3.2, 'blacksite'),
  box('Arena / Dark Stair 2',   3, 1.05, -16, 3.2, 2.1, 3.2, 'blacksite'),
  box('Arena / Dark Stair 3',  11, 1.55, -16, 3.2, 3.1, 3.2, 'blacksite'),

  // NW crate cluster
  box('Arena / NW Crate A', -27,   0.75, -27,   1.5, 1.5, 1.5, 'crate'),
  box('Arena / NW Crate B', -25.5, 0.75, -27,   1.5, 1.5, 1.5, 'crate'),
  box('Arena / NW Crate C', -27,   0.75, -25.5, 1.5, 1.5, 1.5, 'crate'),
  box('Arena / NW Crate D', -27,   1.5,  -27,   1.5, 1.5, 1.5, 'crate'),

  // SE crate cluster
  box('Arena / SE Crate A',  27,   0.75,  27,   1.5, 1.5, 1.5, 'crate'),
  box('Arena / SE Crate B',  25.5, 0.75,  27,   1.5, 1.5, 1.5, 'crate'),
  box('Arena / SE Crate C',  27,   0.75,  25.5, 1.5, 1.5, 1.5, 'crate'),

  // Mid barriers
  box('Arena / Mid Barrier 01',   0, 0.6, -22, 3,   1.2, 0.4),
  box('Arena / Mid Barrier 02',  14, 0.6,   9, 3,   1.2, 0.4),
  box('Arena / Mid Barrier 03', -32, 0.6,   0, 0.4, 1.2, 3),
  box('Arena / Mid Barrier 04',   9, 0.6, -46, 3,   1.2, 0.4),
  box('Arena / Mid Barrier 05',  -9, 0.6,  28, 0.4, 1.2, 3),
  box('Arena / Mid Barrier 06',  22, 0.6, -14, 3,   1.2, 0.4),
  box('Arena / Mid Barrier 07', -15, 0.6, -36, 3,   1.2, 0.4),
  box('Arena / Mid Barrier 08',  15, 0.6,  36, 3,   1.2, 0.4),
  box('Arena / Mid Barrier 09', -36, 0.6,  15, 0.4, 1.2, 3),
  box('Arena / Mid Barrier 10',  36, 0.6, -15, 0.4, 1.2, 3),

  // North bunker
  box('Arena / North Bunker Wall W',  -6, 1.2, -50, 0.4, 2.4,  9),
  box('Arena / North Bunker Wall E',   6, 1.2, -50, 0.4, 2.4,  9),
  box('Arena / North Bunker Back',     0, 1.2, -54, 12,  2.4, 0.4),
  box('Arena / North Bunker Crate',    0, 0.75,-48, 1.5, 1.5, 1.5, 'crate'),

  // South bunker
  box('Arena / South Bunker Wall W',  -6, 1.2,  50, 0.4, 2.4,  9),
  box('Arena / South Bunker Wall E',   6, 1.2,  50, 0.4, 2.4,  9),
  box('Arena / South Bunker Back',     0, 1.2,  54, 12,  2.4, 0.4),

  // East tower
  box('Arena / East Tower Base',  50, 0.7,  0, 4.5, 1.4,  4.5, 'blacksite'),
  box('Arena / East Tower Mid',   50, 2.3,  0, 3.2, 4.6,  3.2, 'blacksite'),
  box('Arena / East Tower Top',   50, 5.5,  0, 2.2, 11.0, 2.2, 'blacksite'),

  // West tower
  box('Arena / West Tower Base', -50, 0.7,  0, 4.5, 1.4,  4.5, 'blacksite'),
  box('Arena / West Tower Mid',  -50, 2.3,  0, 3.2, 4.6,  3.2, 'blacksite'),
  box('Arena / West Tower Top',  -50, 5.5,  0, 2.2, 11.0, 2.2, 'blacksite'),

  // NE dark staircase
  box('Arena / NE Dark Stair 1', 36, 0.7,  -36, 3.6, 1.4, 3.6, 'blacksite'),
  box('Arena / NE Dark Stair 2', 44, 1.15, -36, 3.6, 2.3, 3.6, 'blacksite'),
  box('Arena / NE Dark Stair 3', 52, 1.55, -36, 3.6, 3.1, 3.6, 'blacksite'),

  // SW crate staircase
  box('Arena / SW Crate Stair 1', -40, 0.5,  36, 2.6, 1.0, 2.6, 'crate'),
  box('Arena / SW Crate Stair 2', -33, 0.95, 36, 2.6, 1.9, 2.6, 'crate'),
  box('Arena / SW Crate Stair 3', -27, 1.35, 36, 2.6, 2.7, 2.6, 'crate'),

  // NW crate staircase
  box('Arena / NW Crate Stair 1', -40, 0.5,  -12, 2.6, 1.0, 2.6, 'crate'),
  box('Arena / NW Crate Stair 2', -33, 0.95, -12, 2.6, 1.9, 2.6, 'crate'),
  box('Arena / NW Crate Stair 3', -27, 1.35, -12, 2.6, 2.7, 2.6, 'crate'),

  // SE metal staircase
  box('Arena / SE Metal Stair 1', 28, 0.55,  38, 3.2, 1.1, 3.2),
  box('Arena / SE Metal Stair 2', 36, 1.05,  38, 3.2, 2.1, 3.2),
  box('Arena / SE Metal Stair 3', 44, 1.55,  38, 3.2, 3.1, 3.2),

  // Outer diagonal cover
  box('Arena / Diag Cover SW', -28, 0.6,  28, 4,   1.2, 0.4),
  box('Arena / Diag Cover NE',  28, 0.6, -28, 4,   1.2, 0.4),
  box('Arena / Diag Cover NW', -28, 0.6, -28, 0.4, 1.2, 4),
  box('Arena / Diag Cover SE',  28, 0.6,  28, 0.4, 1.2, 4),

  // Outer wall barriers
  box('Arena / Wall Barrier E1',  60, 0.6, -24, 0.4, 1.2, 10),
  box('Arena / Wall Barrier W1', -60, 0.6,  24, 0.4, 1.2, 10),
  box('Arena / Wall Barrier S1',  24, 0.6,  62, 10,  1.2, 0.4),
  box('Arena / Wall Barrier N1', -24, 0.6, -62, 10,  1.2, 0.4),
  box('Arena / Wall Barrier W2', -62, 0.6, -24, 0.4, 1.2, 10),
  box('Arena / Wall Barrier E2',  62, 0.6,  24, 0.4, 1.2, 10),

  // Sniper perch pillars
  box('Arena / Sniper Perch NE',  58, 5.0, -58, 5.0, 10.0, 5.0, 'blacksite'),
  box('Arena / Sniper Perch SW', -58, 5.0,  58, 5.0, 10.0, 5.0, 'blacksite'),
  box('Arena / Sniper Perch SE',  58, 5.0,  58, 5.0, 10.0, 5.0, 'blacksite'),
  box('Arena / Sniper Perch NW', -58, 5.0, -58, 5.0, 10.0, 5.0, 'blacksite'),

  // Tower ladders
  towerLadder('Arena / Tower Ladder NE',  58, -58,  1),
  towerLadder('Arena / Tower Ladder NW', -58, -58,  1),
  towerLadder('Arena / Tower Ladder SE',  58,  58, -1),
  towerLadder('Arena / Tower Ladder SW', -58,  58, -1),

  // Scattered mid-field crates
  box('Arena / Mid Crate NW A', -35,   0.75,  20,   1.5, 1.5, 1.5, 'crate'),
  box('Arena / Mid Crate NW B', -33.5, 0.75,  20,   1.5, 1.5, 1.5, 'crate'),
  box('Arena / Mid Crate NW C', -35,   1.5,   20,   1.5, 1.5, 1.5, 'crate'),
  box('Arena / Mid Crate SE A',  35,   0.75, -20,   1.5, 1.5, 1.5, 'crate'),
  box('Arena / Mid Crate SE B',  33.5, 0.75, -20,   1.5, 1.5, 1.5, 'crate'),
  box('Arena / Mid Crate S A',   20,   0.75,  38,   1.5, 1.5, 1.5, 'crate'),
  box('Arena / Mid Crate S B',   21.5, 0.75,  38,   1.5, 1.5, 1.5, 'crate'),
  box('Arena / Mid Crate N A',  -20,   0.75, -38,   1.5, 1.5, 1.5, 'crate'),
  box('Arena / Mid Crate N B',  -21.5, 0.75, -38,   1.5, 1.5, 1.5, 'crate'),

  // Destructibles
  destr('Arena / Barrel NW',  SA + 'Exploding Barrel.glb', -28, 0, -28),
  destr('Arena / Barrel SE',  SA + 'Exploding Barrel.glb',  28, 0,  28),
  destr('Arena / Barrel NE',  SA + 'Exploding Barrel.glb', -20, 0, -38),
  destr('Arena / Barrel SW',  SA + 'Exploding Barrel.glb',  20, 0,  38),
  destr('Arena / Gas Tank E', SA + 'Gas Tank.glb',           48, 0,  -4),
  destr('Arena / Gas Tank W', SA + 'Gas Tank.glb',          -48, 0,   4),

  // Props
  prop('Arena / Water Tank E',   SA + 'Water Tank.glb',       52, 0,   8, 1.2),
  prop('Arena / Water Tank W',   SA + 'Water Tank.glb',      -52, 0,  -8, 1.2),
  prop('Arena / Pallet SW',      SA + 'Pallet.glb',          -42, 0,  36, 1.0, PI * 0.25),
  prop('Arena / Pallet NE',      SA + 'Pallet.glb',           42, 0, -36, 1.0),
  prop('Arena / Tires N',        SA + 'Tires.glb',             0, 0, -30, 1.0),
  prop('Arena / Tires S',        SA + 'Tires.glb',             0, 0,  30, 1.0),
  prop('Arena / Tires W',        SA + 'Tires.glb',           -30, 0,   0, 1.0),
  prop('Arena / Crate N',        SA + 'Crate.glb',             0, 0, -50, 1.0),
  prop('Arena / Crate S',        SA + 'Crate.glb',             0, 0,  50, 1.0),
  prop('Arena / Sack Trench NW', SA + 'Sack Trench.glb',    -18, 0, -26, 1.5),
  prop('Arena / Sack Trench SE', SA + 'Sack Trench.glb',     18, 0,  26, 1.5, PI),
  prop('Arena / Dumpster NW',    SA + 'Dumpster.glb',        -10, 0, -51, 1.2, PI * 0.5),
  prop('Arena / Dumpster SE',    SA + 'Dumpster.glb',         10, 0,  51, 1.2, PI * 0.5),
  prop('Arena / Debris E',       SA + 'Debris Papers.glb',    8, 0, -16, 1.0),
  prop('Arena / Debris W',       SA + 'Debris Papers.glb',   -8, 0,  16, 1.0),
  prop('Arena / Cardboard NW',   SA + 'Cardboard Boxes.glb', -35, 0,  20, 0.9),
  prop('Arena / Cardboard SE',   SA + 'Cardboard Boxes.glb',  35, 0, -20, 0.9),
];

const arena = {
  version: 2, id: 'arena',
  name: 'COMBAT ARENA', subtitle: 'Industrial Training Facility',
  theme: 'arena', arenaSize: 144,
  fog: { color: '#10242c', density: 0.0054 },
  background: '#10242c',
  ground: { type: 'procedural', material: 'arenaGround' },
  objects: arenaObjects,
};

// ── DESERT ────────────────────────────────────────────────────────────────────

resetSeq();

const desertObjects = [
  ...outerWalls('Desert', 'sandstone'),

  // Central ruined archway pillars
  box('Desert / Archway Pillar W', -6, 3,   0, 2.5, 6,   2.5, 'sandstone'),
  box('Desert / Archway Pillar E',  6, 3,   0, 2.5, 6,   2.5, 'sandstone'),
  box('Desert / Archway Top',       0, 6.5, 0, 15,  1.2, 2.5, 'sandstone'),

  // Sand dune ridges
  box('Desert / Dune NW',  -22, 0.8,  18, 14,  1.6, 3.5, 'sandstone'),
  box('Desert / Dune SE',   22, 0.8, -18, 14,  1.6, 3.5, 'sandstone'),
  box('Desert / Dune NE',  -18, 0.8, -22, 3.5, 1.6, 14,  'sandstone'),
  box('Desert / Dune SW',   18, 0.8,  22, 3.5, 1.6, 14,  'sandstone'),
  box('Desert / Dune S',     0, 0.6,  32, 10,  1.2, 3,   'sandstone'),
  box('Desert / Dune N',     0, 0.6, -32, 10,  1.2, 3,   'sandstone'),
  box('Desert / Dune E',    32, 0.6,   0, 3,   1.2, 10,  'sandstone'),
  box('Desert / Dune W',   -32, 0.6,   0, 3,   1.2, 10,  'sandstone'),

  // North oasis walls
  box('Desert / Oasis N Wall W', -8, 1.4, -46, 0.6, 2.8, 12, 'sandstone'),
  box('Desert / Oasis N Wall E',  8, 1.4, -46, 0.6, 2.8, 12, 'sandstone'),
  box('Desert / Oasis N Back',    0, 1.4, -52, 18,  2.8, 0.6, 'sandstone'),

  // South oasis walls
  box('Desert / Oasis S Wall W', -8, 1.4,  46, 0.6, 2.8, 12, 'sandstone'),
  box('Desert / Oasis S Wall E',  8, 1.4,  46, 0.6, 2.8, 12, 'sandstone'),
  box('Desert / Oasis S Back',    0, 1.4,  52, 18,  2.8, 0.6, 'sandstone'),

  // Stone pillar clusters
  box('Desert / Pillar NW A', -38, 2,  10, 3, 4, 3, 'sandstone'),
  box('Desert / Pillar NW B', -42, 2,  14, 2, 4, 2, 'sandstone'),
  box('Desert / Pillar SE A',  38, 2, -10, 3, 4, 3, 'sandstone'),
  box('Desert / Pillar SE B',  42, 2, -14, 2, 4, 2, 'sandstone'),
  box('Desert / Pillar SW',    12, 2,  38, 3, 4, 3, 'sandstone'),
  box('Desert / Pillar NE',   -12, 2, -38, 3, 4, 3, 'sandstone'),

  // Stepped pyramid NE  (3 tiers + ladder)
  box('Desert / Pyramid NE Base',  50, 1.1, -50, 8,   2.2, 8,   'sandstone'),
  box('Desert / Pyramid NE Mid',   52, 3.3, -52, 4.5, 2.2, 4.5, 'sandstone'),
  box('Desert / Pyramid NE Top',   53, 5.4, -53, 2.5, 2.2, 2.5, 'sandstone'),
  ladder('Desert / Pyramid NE Ladder', 46, 54, -54, -46, 6.5),

  // Stepped pyramid SW  (3 tiers + ladder)
  box('Desert / Pyramid SW Base', -50, 1.1,  50, 8,   2.2, 8,   'sandstone'),
  box('Desert / Pyramid SW Mid',  -52, 3.3,  52, 4.5, 2.2, 4.5, 'sandstone'),
  box('Desert / Pyramid SW Top',  -53, 5.4,  53, 2.5, 2.2, 2.5, 'sandstone'),
  ladder('Desert / Pyramid SW Ladder', -54, -46, 46, 54, 6.5),

  // Scattered rubble
  box('Desert / Rubble W1',  -55, 0.5, -10, 2,   1, 2,   'sandstone'),
  box('Desert / Rubble E1',   55, 0.5,  10, 2,   1, 2,   'sandstone'),
  box('Desert / Rubble S1',  -14, 0.5,  55, 2,   1, 2,   'sandstone'),
  box('Desert / Rubble N1',   14, 0.5, -55, 2,   1, 2,   'sandstone'),
  box('Desert / Rubble SW1', -30, 0.5,  45, 1.5, 1, 1.5, 'sandstone'),
  box('Desert / Rubble NE1',  30, 0.5, -45, 1.5, 1, 1.5, 'sandstone'),
  box('Desert / Rubble E2',   45, 0.5,  30, 1.5, 1, 1.5, 'sandstone'),
  box('Desert / Rubble W2',  -45, 0.5, -30, 1.5, 1, 1.5, 'sandstone'),

  // Destructibles
  destr('Desert / Barrel Oasis N W', SA + 'Exploding Barrel.glb', -12, 0, -48),
  destr('Desert / Barrel Oasis N E', SA + 'Exploding Barrel.glb',  12, 0, -48),
  destr('Desert / Barrel Oasis S W', SA + 'Exploding Barrel.glb', -12, 0,  48),
  destr('Desert / Barrel Oasis S E', SA + 'Exploding Barrel.glb',  12, 0,  48),
  destr('Desert / Gas Can NW',       SA + 'Gas Can.glb',          -25, 0,   8, 0.8),
  destr('Desert / Gas Can SE',       SA + 'Gas Can.glb',           25, 0,  -8, 0.8),
  destr('Desert / Gas Can NE',       SA + 'Gas Can.glb',           10, 0, -35, 0.8),

  // Props
  prop('Desert / Tires NE',          SA + 'Tires.glb',                  46,    0, -46, 1.0),
  prop('Desert / Tires SW',          SA + 'Tires.glb',                 -46,    0,  46, 1.0),
  prop('Desert / Crate N1',          SA + 'Crate.glb',                  -4,    0, -50, 1.0),
  prop('Desert / Crate S1',          SA + 'Crate.glb',                   4,    0,  50, 1.0),
  prop('Desert / Crate N2',          SA + 'Crate.glb',                   4,    0, -50, 1.0),
  prop('Desert / Sack Trench W',     SA + 'Sack Trench.glb',           -30,    0,   0, 1.5),
  prop('Desert / Sack Trench E',     SA + 'Sack Trench.glb',            30,    0,   0, 1.5, PI),
  prop('Desert / Sack Trench Sm N',  SA + 'Sack Trench Small.glb',       0,    0,  35, 1.2),
  prop('Desert / Sack Trench Sm S',  SA + 'Sack Trench Small.glb',       0,    0, -35, 1.2, PI),
  prop('Desert / Pallet N',          SA + 'Pallet.glb',                -12,    0, -44, 1.0),
  prop('Desert / Pallet S',          SA + 'Pallet.glb',                 12,    0,  44, 1.0),
  prop('Desert / Broken Car NW',     SA + 'Broken Car.glb',             20,    0,  20, 1.5, PI * 0.3),
  prop('Desert / Broken Car SE',     SA + 'Broken Car.glb',            -20,    0, -20, 1.5, PI * 0.7),
  prop('Desert / Tank NE',           SA + 'Tank.glb',                   52,    0, -52, 1.5, PI * 0.25),
  prop('Desert / Trash N',           SA + 'Trash Container Open.glb',   -5,    0,  48, 1.0),
  prop('Desert / Trash S',           SA + 'Trash Container Open.glb',    5,    0, -48, 1.0),
  prop('Desert / Debris C',          SA + 'Debris Papers.glb',           0,    0,   0, 1.0),
  prop('Desert / Debris NW',         SA + 'Debris Papers.glb',         -15,    0,  15, 1.0),
];

const desert = {
  version: 2, id: 'desert',
  name: 'DUST BOWL', subtitle: 'Abandoned Desert Outpost',
  theme: 'desert', arenaSize: 144,
  fog: { color: '#dbb07d', density: 0.004 },
  background: '#e3c4a1',
  ground: { type: 'procedural', material: 'sandGround' },
  objects: desertObjects,
};

// ── CITY ──────────────────────────────────────────────────────────────────────

resetSeq();

const lampPositions = [
  [-20, -22], [20, -22], [-20, 22], [20, 22],
  [-55, -18], [-55, 18], [55, -18], [55, 18],
  [-20, -50], [20, -50], [-20, 50], [20, 50],
];
const treePositions = [
  [-60, -60, 2.5], [60, -60, 2.5], [-60, 60, 2.5], [60, 60, 2.5],
  [-50, -38, 2.0], [50, -38, 2.0], [-50, 38, 2.0], [50, 38, 2.0],
];
const treeShortPositions = [[-28, -50], [28, -50], [-28, 50], [28, 50]];
const trashCanPositions = [
  [-46, -25], [46, -25], [-46, 25], [46, 25],
  [-25, -46], [25, -46], [-25, 46], [25, 46],
];
const hydrantPositions = [[-8, -22], [8, -22], [-8, 22], [8, 22], [-22, -8], [22, -8]];
const bollardPositions = [[-5, -5], [5, -5], [-5, 5], [5, 5], [-5, 0], [5, 0], [0, -5], [0, 5]];
const conePositions = [[-12, -15], [-14, -13], [12, -15], [14, -13], [-12, 15], [14, 15]];
const manholePositions = [[-8, 0], [8, 0], [0, -10], [0, 10], [25, -30], [-25, 30]];
const trashBagPositions = [[-21, -9], [21, 9], [9, -21], [-9, 21], [-55, -22], [55, 22]];
const boxPilePositions = [[-48, -48], [48, 48], [-48, 48], [48, -48]];
const floorTrashPositions = [[-30, -10], [30, 10], [-10, 30], [10, -30]];
const neonBuildingPositions = [[-38, -30], [38, -30], [-38, 30], [38, 30]];
const smallBushPositions = [[-12, -12], [12, -12], [-12, 12], [12, 12]];
const debrisPositions = [[-5, -28], [5, 28], [-28, 5], [28, -5]];

const cityObjects = [
  ...outerWalls('City', 'concrete'),

  // Central plaza
  box('City / Plaza Base',    0, 0.6, 0, 8,   1.2, 8,   'concrete'),
  box('City / Fountain Lip',  0, 1.3, 0, 5,   0.2, 5,   'metal'),
  box('City / Fountain W',  -3.5, 1.2, 0, 0.4, 1.8, 3.5, 'concrete'),
  box('City / Fountain E',   3.5, 1.2, 0, 0.4, 1.8, 3.5, 'concrete'),
  box('City / Fountain N',   0, 1.2, -3.5, 3.5, 1.8, 0.4, 'concrete'),
  box('City / Fountain S',   0, 1.2,  3.5, 3.5, 1.8, 0.4, 'concrete'),

  // Quadrant buildings + rooftops
  box('City / Building NW',      -38, 5,    -38, 16, 10, 16, 'concrete'),
  box('City / Building NW Roof', -38, 10.5, -38, 10,  1, 10, 'concrete'),
  box('City / Building NE',       38, 5,    -38, 16, 10, 16, 'concrete'),
  box('City / Building NE Roof',  38, 10.5, -38, 10,  1, 10, 'concrete'),
  box('City / Building SW',      -38, 5,     38, 16, 10, 16, 'concrete'),
  box('City / Building SW Roof', -38, 10.5,  38, 10,  1, 10, 'concrete'),
  box('City / Building SE',       38, 5,     38, 16, 10, 16, 'concrete'),
  box('City / Building SE Roof',  38, 10.5,  38, 10,  1, 10, 'concrete'),

  // Fire escape staircases + ladders
  box('City / Fire Escape NW 1', -30.5, 0.7, -28, 3, 1.4, 3, 'metal'),
  box('City / Fire Escape NW 2', -30.5, 2.1, -30, 3, 4.2, 3, 'metal'),
  ladder('City / Ladder NW', -32, -29, -32, -26, 10.5),

  box('City / Fire Escape NE 1',  30.5, 0.7, -28, 3, 1.4, 3, 'metal'),
  box('City / Fire Escape NE 2',  30.5, 2.1, -30, 3, 4.2, 3, 'metal'),
  ladder('City / Ladder NE', 29, 32, -32, -26, 10.5),

  box('City / Fire Escape SW 1', -30.5, 0.7,  28, 3, 1.4, 3, 'metal'),
  box('City / Fire Escape SW 2', -30.5, 2.1,  30, 3, 4.2, 3, 'metal'),
  ladder('City / Ladder SW', -32, -29, 26, 32, 10.5),

  box('City / Fire Escape SE 1',  30.5, 0.7,  28, 3, 1.4, 3, 'metal'),
  box('City / Fire Escape SE 2',  30.5, 2.1,  30, 3, 4.2, 3, 'metal'),
  ladder('City / Ladder SE', 29, 32, 26, 32, 10.5),

  // Jersey barriers
  box('City / Barrier NW', -14, 0.65, -14, 5,   1.3, 1.2, 'concrete'),
  box('City / Barrier NE',  14, 0.65, -14, 5,   1.3, 1.2, 'concrete'),
  box('City / Barrier SW', -14, 0.65,  14, 5,   1.3, 1.2, 'concrete'),
  box('City / Barrier SE',  14, 0.65,  14, 5,   1.3, 1.2, 'concrete'),
  box('City / Barrier W',  -14, 0.65,   0, 1.2, 1.3, 5,   'concrete'),
  box('City / Barrier E',   14, 0.65,   0, 1.2, 1.3, 5,   'concrete'),
  box('City / Barrier N',    0, 0.65, -48, 12,  1.3, 1.2, 'concrete'),
  box('City / Barrier S',    0, 0.65,  48, 12,  1.3, 1.2, 'concrete'),
  box('City / Barrier Wl', -48, 0.65,   0, 1.2, 1.3, 12,  'concrete'),
  box('City / Barrier El',  48, 0.65,   0, 1.2, 1.3, 12,  'concrete'),

  // Dumpsters / debris
  box('City / Dumpster NW',  -20, 0.7,  -8, 2,   1.4, 3.5, 'blacksite'),
  box('City / Dumpster SE',   20, 0.7,   8, 2,   1.4, 3.5, 'blacksite'),
  box('City / Dumpster NE',    8, 0.7, -20, 3.5, 1.4, 2,   'blacksite'),
  box('City / Dumpster SW',   -8, 0.7,  20, 3.5, 1.4, 2,   'blacksite'),
  box('City / Dumpster Ow1', -55, 0.7, -20, 2.5, 1.4, 2.5, 'blacksite'),
  box('City / Dumpster Oe1',  55, 0.7,  20, 2.5, 1.4, 2.5, 'blacksite'),
  box('City / Dumpster On1',  20, 0.7, -55, 2.5, 1.4, 2.5, 'blacksite'),
  box('City / Dumpster Os1', -20, 0.7,  55, 2.5, 1.4, 2.5, 'blacksite'),

  // Street lights
  ...lampPositions.map(([lx, lz]) => prop('City / Street Light', CP + 'Street Light.glb', lx, 0, lz, 2.0)),

  // Trees — far corners and building sides
  ...treePositions.map(([tx, tz, s]) => prop('City / Tree Long', CP + 'Tree Long.glb', tx, 0, tz, s, Math.random() * PI * 2)),
  ...treeShortPositions.map(([tx, tz]) => prop('City / Tree', CP + 'Tree.glb', tx, 0, tz, 2.0)),

  // Trash cans
  ...trashCanPositions.map(([cx, cz]) => prop('City / Trash Can', CP + 'Trash Can.glb', cx, 0, cz, 1.0)),

  // Fire hydrants
  ...hydrantPositions.map(([hx, hz]) => prop('City / Fire Hydrant', CP + 'Fire Hydrant.glb', hx, 0, hz, 0.8)),

  // Bollards
  ...bollardPositions.map(([bx, bz]) => prop('City / Bollard', CP + 'Bollard.glb', bx, 0, bz, 0.8)),

  // Benches
  prop('City / Bench W', CP + 'Bench.glb', -9, 0, 0, 1.0, PI * 0.5),
  prop('City / Bench E', CP + 'Bench.glb',  9, 0, 0, 1.0, PI * 0.5),
  prop('City / Bench N', CP + 'Bench.glb',  0, 0, -9, 1.0),
  prop('City / Bench S', CP + 'Bench.glb',  0, 0,  9, 1.0),

  // Traffic cones
  ...conePositions.map(([tcx, tcz]) => prop('City / Traffic Cone', CP + 'Traffic Cone.glb', tcx, 0, tcz, 0.8)),

  // Traffic lights
  prop('City / Traffic Light NW', CP + 'Traffic Light.glb', -22, 0, -22, 2.0),
  prop('City / Traffic Light SE', CP + 'Traffic Light.glb',  22, 0,  22, 2.0, PI),
  prop('City / Traffic Light NE', CP + 'Traffic Light.glb',  22, 0, -22, 2.0, PI * 1.5),

  // Stop signs
  prop('City / Stop Sign SW', CP + 'Stop Sign.glb', -22, 0,  22, 1.5),
  prop('City / Stop Sign NE', CP + 'Stop Sign.glb',  22, 0, -22, 1.5, PI),

  // Manhole covers
  ...manholePositions.map(([mx, mz]) => prop('City / Manhole', CP + 'Manhole.glb', mx, 0.01, mz, 2.0)),

  // Trash bags
  ...trashBagPositions.map(([tx, tz]) => prop('City / Trash Bag', CP + 'Trash Bag.glb', tx, 0, tz, 0.8)),

  // Bike racks
  prop('City / Bike Rack W', CP + 'Bike Rack.glb', -44, 0, -30, 1.0, PI * 0.5),
  prop('City / Bike Rack E', CP + 'Bike Rack.glb',  44, 0,  30, 1.0, PI * 0.5),

  // Concrete barriers
  prop('City / Concrete Barrier W', CP + 'Concrete Barrier.glb', -55, 0, -5, 1.5),
  prop('City / Concrete Barrier E', CP + 'Concrete Barrier.glb',  55, 0,  5, 1.5, PI),

  // Box piles
  ...boxPilePositions.map(([bx, bz]) => prop('City / Box Pile', CP + 'Box Pile.glb', bx, 0, bz, 1.0)),

  // Floor trash
  ...floorTrashPositions.map(([fx, fz]) => prop('City / Floor Trash', CP + 'Floor Trash.glb', fx, 0, fz, 1.0)),

  // Bushes
  prop('City / Long Bush W', CP + 'Long Bush.glb', -46, 0, -44, 1.2),
  prop('City / Long Bush E', CP + 'Long Bush.glb',  46, 0,  44, 1.2),
  ...smallBushPositions.map(([bx, bz]) => prop('City / Small Bush', CP + 'Small Bush.glb', bx, 0, bz, 1.0)),

  // Fallen leaves
  ...([[-60, -60], [60, -60], [-60, 60], [60, 60]]).map(([lx, lz]) => prop('City / Fallen Leaves', CP + 'Fallen Leaves.glb', lx + 3, 0, lz + 3, 1.5)),

  // Shooter pack: dumpsters, broken cars, containers, debris
  prop('City / Dumpster SA NW', SA + 'Dumpster.glb', -21, 0,  -8, 1.2),
  prop('City / Dumpster SA SE', SA + 'Dumpster.glb',  21, 0,   8, 1.2),
  prop('City / Dumpster SA NE', SA + 'Dumpster.glb',   9, 0, -21, 1.2, PI * 0.5),
  prop('City / Broken Car NW',  SA + 'Broken Car.glb', -26, 0, -8, 1.5, PI * 0.1),
  prop('City / Broken Car SE',  SA + 'Broken Car.glb',  26, 0,  8, 1.5, PI * 1.1),
  prop('City / Container SW',   SA + 'Shipping Container.glb', -55, 0, -48, 2.0),
  prop('City / Container NE',   SA + 'Shipping Container.glb',  55, 0,  48, 2.0, PI),
  prop('City / Container NW',   SA + 'Shipping Container.glb', -48, 0,  55, 2.0, PI * 0.5),
  prop('City / Tires W',        SA + 'Tires.glb',       -44, 0,  5, 1.0),
  prop('City / Tires E',        SA + 'Tires.glb',        44, 0, -5, 1.0),
  prop('City / Crate W',        SA + 'Crate.glb',       -55, 0, -40, 1.0),
  prop('City / Crate E',        SA + 'Crate.glb',        55, 0,  40, 1.0),
  prop('City / Cardboard SW',   SA + 'Cardboard Boxes.glb', -40, 0, -55, 0.8),
  prop('City / Cardboard NE',   SA + 'Cardboard Boxes.glb',  40, 0,  55, 0.8),
  prop('City / Sign NW',        SA + 'Sign.glb',        -18, 0, -18, 1.5),
  prop('City / Sign SE',        SA + 'Sign.glb',         18, 0,  18, 1.5, PI),
  ...debrisPositions.map(([px, pz]) => prop('City / Debris Papers', SA + 'Debris Papers.glb', px, 0, pz, 1.0)),
];

const city = {
  version: 2, id: 'city',
  name: 'DOWNTOWN', subtitle: 'Sunlit Urban Warzone',
  theme: 'city', arenaSize: 144,
  fog: { color: '#c9d8e4', density: 0.0018 },
  background: '#87b8e8',
  ground: { type: 'procedural', material: 'asphaltGround' },
  objects: cityObjects,
};

// ── BLACKSITE ─────────────────────────────────────────────────────────────────

resetSeq();

const WH = 7;   // wall height
const W  = 2;   // wall thickness
const CW = 12;  // half-width of corridors

function catwalkLadder(label, xMin, xMax, zMin, zMax) {
  return ladder(label, xMin, xMax, zMin, zMax, 4.9);
}

// Catwalk support pillars  (from addCatwalk inner logic)
function catwalkPillars(cx, cz, w, d) {
  const hw = w / 2 - 0.6;
  const hd = d / 2 - 0.6;
  return [
    box(`BS / Catwalk Pillar`, cx - hw, 2.3, cz - hd, 0.5, 4.6, 0.5, 'metal'),
    box(`BS / Catwalk Pillar`, cx + hw, 2.3, cz - hd, 0.5, 4.6, 0.5, 'metal'),
    box(`BS / Catwalk Pillar`, cx - hw, 2.3, cz + hd, 0.5, 4.6, 0.5, 'metal'),
    box(`BS / Catwalk Pillar`, cx + hw, 2.3, cz + hd, 0.5, 4.6, 0.5, 'metal'),
  ];
}

// Catwalk floor as a collidable box (top h = 4.775 ≈ 4.78)
function catwalkFloor(label, cx, cz, w, d) {
  return box(label, cx, 4.6, cz, w, 0.35, d, 'metal');
}

// Catwalk railing (hub-facing edge)
function catwalkRail(cx, cz, w, d) {
  const hw = w / 2;
  const hd = d / 2;
  if (Math.abs(cz) > Math.abs(cx)) {
    const railZ = cz < 0 ? cz + hd - 0.2 : cz - hd + 0.2;
    return box('BS / Catwalk Rail', cx, 5.2, railZ, w, 0.8, 0.35, 'metal');
  } else {
    const railX = cx > 0 ? cx - hw + 0.2 : cx + hw - 0.2;
    return box('BS / Catwalk Rail', railX, 5.2, cz, 0.35, 0.8, d, 'metal');
  }
}

const blacksiteObjects = [
  ...outerWalls('Blacksite', 'metal'),

  // Hub pillars
  box('BS / Hub Pillar NW', -20, WH / 2, -20, 3.5, WH, 3.5, 'metal'),
  box('BS / Hub Pillar NE',  20, WH / 2, -20, 3.5, WH, 3.5, 'metal'),
  box('BS / Hub Pillar SW', -20, WH / 2,  20, 3.5, WH, 3.5, 'metal'),
  box('BS / Hub Pillar SE',  20, WH / 2,  20, 3.5, WH, 3.5, 'metal'),

  // North corridor walls
  box('BS / N Corridor Wall W', -(CW + 1), WH / 2, -37, W, WH, 30, 'concrete'),
  box('BS / N Corridor Wall E',  (CW + 1), WH / 2, -37, W, WH, 30, 'concrete'),

  // South corridor walls
  box('BS / S Corridor Wall W', -(CW + 1), WH / 2,  37, W, WH, 30, 'concrete'),
  box('BS / S Corridor Wall E',  (CW + 1), WH / 2,  37, W, WH, 30, 'concrete'),

  // East corridor walls
  box('BS / E Corridor Wall N',  37, WH / 2, -(CW + 1), 30, WH, W, 'concrete'),
  box('BS / E Corridor Wall S',  37, WH / 2,  (CW + 1), 30, WH, W, 'concrete'),

  // West corridor walls
  box('BS / W Corridor Wall N', -37, WH / 2, -(CW + 1), 30, WH, W, 'concrete'),
  box('BS / W Corridor Wall S', -37, WH / 2,  (CW + 1), 30, WH, W, 'concrete'),

  // North wing solid masses
  box('BS / N Wing Door W',  -25, WH / 2, -52, 26, WH, W, 'concrete'),
  box('BS / N Wing Door E',   25, WH / 2, -52, 26, WH, W, 'concrete'),
  box('BS / N Wing Mass W',  -55, WH / 2, -61, 36, WH, 18, 'concrete'),
  box('BS / N Wing Mass E',   55, WH / 2, -61, 36, WH, 18, 'concrete'),

  // South wing solid masses
  box('BS / S Wing Door W',  -25, WH / 2,  52, 26, WH, W, 'concrete'),
  box('BS / S Wing Door E',   25, WH / 2,  52, 26, WH, W, 'concrete'),
  box('BS / S Wing Mass W',  -55, WH / 2,  61, 36, WH, 18, 'concrete'),
  box('BS / S Wing Mass E',   55, WH / 2,  61, 36, WH, 18, 'concrete'),

  // East wing
  box('BS / E Wing Wall N',  52, WH / 2, -25, W, WH, 26, 'concrete'),
  box('BS / E Wing Wall S',  52, WH / 2,  25, W, WH, 26, 'concrete'),
  box('BS / E Wing Mass N',  61, WH / 2, -55, 18, WH, 36, 'concrete'),
  box('BS / E Wing Mass S',  61, WH / 2,  55, 18, WH, 36, 'concrete'),

  // West wing
  box('BS / W Wing Wall N', -52, WH / 2, -25, W, WH, 26, 'concrete'),
  box('BS / W Wing Wall S', -52, WH / 2,  25, W, WH, 26, 'concrete'),
  box('BS / W Wing Mass N', -61, WH / 2, -55, 18, WH, 36, 'concrete'),
  box('BS / W Wing Mass S', -61, WH / 2,  55, 18, WH, 36, 'concrete'),

  // Corner room dividers (NW, NE, SW, SE)
  box('BS / Corner NW Div N', -55, WH / 2, -66, W, WH, 12, 'blacksite'),
  box('BS / Corner NW Div S', -55, WH / 2, -45, W, WH, 10, 'blacksite'),
  box('BS / Corner NE Div N',  55, WH / 2, -66, W, WH, 12, 'blacksite'),
  box('BS / Corner NE Div S',  55, WH / 2, -45, W, WH, 10, 'blacksite'),
  box('BS / Corner SW Div N', -55, WH / 2,  66, W, WH, 12, 'blacksite'),
  box('BS / Corner SW Div S', -55, WH / 2,  45, W, WH, 10, 'blacksite'),
  box('BS / Corner SE Div N',  55, WH / 2,  66, W, WH, 12, 'blacksite'),
  box('BS / Corner SE Div S',  55, WH / 2,  45, W, WH, 10, 'blacksite'),

  // Catwalks: floor (collidable) + support pillars + railings + ladders
  // N catwalk (cx=0, cz=-62, w=30, d=10, ladder xMin=-4..4, zMin=-58..-52)
  catwalkFloor('BS / Catwalk N Floor', 0, -62, 30, 10),
  ...catwalkPillars(0, -62, 30, 10),
  catwalkRail(0, -62, 30, 10),
  catwalkLadder('BS / Catwalk N Ladder', -4, 4, -58, -52),

  // S catwalk (cx=0, cz=62, w=30, d=10, ladder xMin=-4..4, zMin=52..58)
  catwalkFloor('BS / Catwalk S Floor', 0, 62, 30, 10),
  ...catwalkPillars(0, 62, 30, 10),
  catwalkRail(0, 62, 30, 10),
  catwalkLadder('BS / Catwalk S Ladder', -4, 4, 52, 58),

  // E catwalk (cx=62, cz=0, w=10, d=30, ladder xMin=58..62, zMin=-4..4)
  catwalkFloor('BS / Catwalk E Floor', 62, 0, 10, 30),
  ...catwalkPillars(62, 0, 10, 30),
  catwalkRail(62, 0, 10, 30),
  catwalkLadder('BS / Catwalk E Ladder', 58, 62, -4, 4),

  // W catwalk (cx=-62, cz=0, w=10, d=30, ladder xMin=-62..-58, zMin=-4..4)
  catwalkFloor('BS / Catwalk W Floor', -62, 0, 10, 30),
  ...catwalkPillars(-62, 0, 10, 30),
  catwalkRail(-62, 0, 10, 30),
  catwalkLadder('BS / Catwalk W Ladder', -62, -58, -4, 4),

  // Central raised observation deck
  box('BS / Obs Deck', 0, 4.0, 0, 12, 8, 12, 'metal'),
  // Railings on top
  box('BS / Obs Rail N',  0, 8.5, -6.2, 12,   1.0, 0.35, 'metal'),
  box('BS / Obs Rail S',  0, 8.5,  6.2, 12,   1.0, 0.35, 'metal'),
  box('BS / Obs Rail W', -6.2, 8.5, 0, 0.35, 1.0, 12,   'metal'),
  box('BS / Obs Rail E',  6.2, 8.5, 0, 0.35, 1.0, 12,   'metal'),
  // Ladder on north face
  ladder('BS / Obs Deck Ladder', -3, 3, -8, -6, 8.1),

  // Corridor cover — Concrete Barriers
  prop('BS / Cover N',  SA + 'Concrete Barrier.glb',   0, 0, -37, 1.4, PI * 0.5),
  prop('BS / Cover S',  SA + 'Concrete Barrier.glb',   0, 0,  37, 1.4, PI * 0.5),
  prop('BS / Cover W',  SA + 'Concrete Barrier.glb', -37, 0,   0, 1.4),
  prop('BS / Cover E',  SA + 'Concrete Barrier.glb',  37, 0,   0, 1.4),

  // Hub: server rack structures
  prop('BS / Server Rack W', SA + 'Shipping Container Structure.glb', -30, 0, -18, 1.5, 0,      false),
  prop('BS / Server Rack E', SA + 'Shipping Container Structure.glb',  30, 0, -18, 1.5, PI,     false),

  // Corridor barrels (destructible)
  ...([[-6,-42],[6,-42],[-6,42],[6,42],[-42,-6],[-42,6],[42,-6],[42,6]]).map(
    ([bx, bz]) => destr('BS / Corridor Barrel', SA + 'Exploding Barrel.glb', bx, 0, bz, 0.9),
  ),

  // North wing props
  prop('BS / N Water Tank W',  SA + 'Water Tank.glb', -20, 0, -62, 1.2),
  prop('BS / N Water Tank E',  SA + 'Water Tank.glb',  20, 0, -62, 1.2),
  prop('BS / N Gas Tank W',    SA + 'Gas Tank.glb',   -10, 0, -65, 1.0),
  prop('BS / N Gas Tank E',    SA + 'Gas Tank.glb',    10, 0, -65, 1.0),
  prop('BS / N Crate W',       SA + 'Crate.glb',      -30, 0, -64, 1.0),
  prop('BS / N Crate E',       SA + 'Crate.glb',       30, 0, -64, 1.0),
  prop('BS / N Pallet',        SA + 'Pallet.glb',       0, 0, -67, 1.1),

  // South wing props
  prop('BS / S Cardboard W',   SA + 'Cardboard Boxes.glb', -20, 0,  60, 0.9),
  prop('BS / S Cardboard E',   SA + 'Cardboard Boxes.glb',  20, 0,  60, 0.9),
  prop('BS / S Pallet Broken', SA + 'Pallet Broken.glb',    -5, 0,  65, 1.0),
  prop('BS / S Pallet',        SA + 'Pallet.glb',            5, 0,  65, 1.0),
  prop('BS / S Gas Can W',     SA + 'Gas Can.glb',          -28, 0, 63, 0.8),
  prop('BS / S Gas Can E',     SA + 'Gas Can.glb',           28, 0, 63, 0.8),

  // East wing props
  prop('BS / E Sack Trench N', SA + 'Sack Trench.glb',  62, 0, -20, 1.3),
  prop('BS / E Sack Trench S', SA + 'Sack Trench.glb',  62, 0,  20, 1.3, PI),
  prop('BS / E Crate',         SA + 'Crate.glb',         65, 0,   0, 1.0),

  // West wing props
  prop('BS / W Barrier N',     SA + 'Barrier Fixed.glb', -60, 0, -18, 1.2),
  prop('BS / W Barrier S',     SA + 'Barrier Fixed.glb', -60, 0,  18, 1.2, PI),
  prop('BS / W Dumpster',      SA + 'Dumpster.glb',      -63, 0,   0, 1.1, PI * 0.5),

  // Corner rooms: one barrel + debris each
  ...([ [-62,-62,0.2], [62,-62,0.6], [-62,62,1.4], [62,62,1.8] ]).flatMap(([rx, rz, rot]) => [
    destr('BS / Corner Barrel', SA + 'Exploding Barrel.glb', rx, 0, rz, 1.0),
    prop('BS / Corner Debris',  SA + 'Debris Papers.glb', rx + 5, 0, rz + 5, 1.0, rot),
  ]),

  // Hub centre: wreckage
  prop('BS / Hub Barrier W',  SA + 'Barrier Single.glb', -8, 0,  0, 1.3),
  prop('BS / Hub Barrier E',  SA + 'Barrier Single.glb',  8, 0,  0, 1.3, PI),
  prop('BS / Hub Debris',     SA + 'Debris Pile.glb',     0, 0,  0, 1.1, 0, false),
];

const blacksite = {
  version: 2, id: 'blacksite',
  name: 'BLACKSITE', subtitle: 'Abandoned Research Compound',
  theme: 'blacksite', arenaSize: 144,
  fog: { color: '#071210', density: 0.005 },
  background: '#071210',
  ground: { type: 'procedural', material: 'blacksiteFloor' },
  objects: blacksiteObjects,
};

// ── Write files ───────────────────────────────────────────────────────────────

for (const map of [arena, desert, city, blacksite]) {
  const file = join(MAPS_DIR, `${map.id}.json`);
  writeFileSync(file, JSON.stringify(map, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${map.id}.json  (${map.objects.length} objects)`);
}
