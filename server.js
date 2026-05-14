import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { join, dirname } from 'path';
import { networkInterfaces } from 'os';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { readFile, writeFile, readdir } from 'fs/promises';
import {
  ARENA_SIZE, HALF, P_MAX_HP, WEAPON_ORDER,
  PVP_WIN_KILLS, PVP_KILLS_PER_WEAPON, PVP_CORNERS,
  BOSS_ESCAPE_GRAVITY, BOSS_ESCAPE_HEIGHT, BOSS_ESCAPE_JUMP_VELOCITY, BOSS_ESCAPE_FORWARD_SPEED,
} from './public/src/gameConstants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const http = createServer(app);
const io = new Server(http);

const PORT = 3001;
const publicDir = join(__dirname, 'public');

// ── Network utilities ─────────────────────────────────────────────────────────

function normalizeIpAddress(address) {
    if (!address) return '';
    if (address.startsWith('::ffff:')) return address.slice(7);
    if (address === '::1') return '127.0.0.1';
    return address;
}

function getServerIpv4Addresses() {
    const interfaces = networkInterfaces();
    const addresses = [];
    Object.values(interfaces).forEach((entries) => {
        (entries || []).forEach((entry) => {
            const family = typeof entry.family === 'string' ? entry.family : String(entry.family);
            if (family !== 'IPv4' || entry.internal) return;
            addresses.push(entry.address);
        });
    });
    return [...new Set(addresses)];
}

function createConnectionInfo(address) {
    const serverIps = getServerIpv4Addresses();
    const normalizedAddress = normalizeIpAddress(address);
    const isLoopback = normalizedAddress === '127.0.0.1';
    const isServerPc = isLoopback || serverIps.includes(normalizedAddress);
    const preferredHost = serverIps[0] || 'localhost';
    return { clientIp: normalizedAddress, isServerPc, joinLink: `http://${preferredHost}:${PORT}`, serverIps };
}

app.use(express.static(publicDir));
app.get('/', (req, res) => res.sendFile(join(publicDir, 'index.html')));
app.get('/arenatest.html', (req, res) => res.redirect('/'));

// ── Persistent leaderboard ────────────────────────────────────────────────────

const LEADERBOARD_FILE = join(__dirname, 'leaderboard.json');
const LEADERBOARD_MAX = 20; // keep top 20 entries per mode

function loadLeaderboard() {
    try {
        if (existsSync(LEADERBOARD_FILE)) {
            return JSON.parse(readFileSync(LEADERBOARD_FILE, 'utf8'));
        }
    } catch { /* corrupt file — start fresh */ }
    return { coop: [], pvp: [] };
}

function saveLeaderboard(lb) {
    try { writeFileSync(LEADERBOARD_FILE, JSON.stringify(lb, null, 2)); } catch { /* disk full etc. */ }
}

let leaderboard = loadLeaderboard();

function recordCoopGame(rankings, wave, tokenMap) {
    const date = new Date().toISOString().slice(0, 10);
    for (const r of rankings) {
        if (!r.playerName || r.score <= 0) continue;
        const token = tokenMap?.[r.playerId] ?? null;
        // Dedup: if this session token already has an entry, update only if score improved
        if (token) {
            const idx = leaderboard.coop.findIndex(e => e.token === token);
            if (idx !== -1) {
                if (r.score > leaderboard.coop[idx].score) {
                    leaderboard.coop[idx] = { playerName: r.playerName, score: r.score, wave: r.wave || wave, kills: r.kills || 0, date, token };
                }
                continue;
            }
        }
        leaderboard.coop.push({ playerName: r.playerName, score: r.score, wave: r.wave || wave, kills: r.kills || 0, date, token });
    }
    leaderboard.coop.sort((a, b) => b.score - a.score);
    leaderboard.coop = leaderboard.coop.slice(0, LEADERBOARD_MAX);
    saveLeaderboard(leaderboard);
}

function recordPvpGame(rankings, tokenMap) {
    const date = new Date().toISOString().slice(0, 10);
    for (const r of rankings) {
        if (!r.playerName) continue;
        const token = tokenMap?.[r.playerId] ?? null;
        if (token) {
            const idx = leaderboard.pvp.findIndex(e => e.token === token);
            if (idx !== -1) {
                if ((r.kills || 0) > leaderboard.pvp[idx].kills) {
                    leaderboard.pvp[idx] = { playerName: r.playerName, kills: r.kills || 0, date, token };
                }
                continue;
            }
        }
        leaderboard.pvp.push({ playerName: r.playerName, kills: r.kills || 0, date, token });
    }
    leaderboard.pvp.sort((a, b) => b.kills - a.kills);
    leaderboard.pvp = leaderboard.pvp.slice(0, LEADERBOARD_MAX);
    saveLeaderboard(leaderboard);
}

app.get('/api/leaderboard', (_req, res) => {
    res.json(leaderboard);
});

// ── Persistent career stats (keyed by player name) ────────────────────────────
//
// Stored on disk so they survive restarts. The key is the trimmed playerName
// (case-sensitive). Anonymous / empty names are never persisted.

const CAREER_FILE = join(__dirname, 'careerStats.json');

function loadCareerStats() {
    try {
        if (existsSync(CAREER_FILE)) return JSON.parse(readFileSync(CAREER_FILE, 'utf8'));
    } catch { /* corrupt — start fresh */ }
    return {};
}

function saveCareerStats() {
    try { writeFileSync(CAREER_FILE, JSON.stringify(careerStats, null, 2)); } catch { /* disk full etc. */ }
}

const careerStats = loadCareerStats();
let _careerDirty = false;
function markCareerDirty() { _careerDirty = true; }

// Debounced periodic save so each kill doesn't hammer the disk.
setInterval(() => { if (_careerDirty) { saveCareerStats(); _careerDirty = false; } }, 5000);
process.on('SIGINT',  () => { if (_careerDirty) saveCareerStats(); process.exit(0); });
process.on('SIGTERM', () => { if (_careerDirty) saveCareerStats(); process.exit(0); });

// Level curve: Lv N reached at xpThreshold(N).
//   Lv 1: 0, Lv 2: 50, Lv 3: 200, Lv 4: 450, Lv 5: 800, Lv 10: 4050, Lv 20: 18050
function xpThreshold(level) { return Math.floor(50 * (level - 1) * (level - 1)); }
function levelFromXp(xp) { return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 50)); }

const KILL_XP = { skeleton: 5, soldier: 10, dog: 25, boss: 200 };
const MATCH_BONUS_XP = 25;
const WIN_BONUS_XP   = 75;

function defaultCareerEntry() {
    return {
        kills: 0,
        bossKills: 0,
        matchesPlayed: 0,
        wins: 0,
        pvpWins: 0,
        ffaWins: 0,
        bestWave: 0,
        bestScore: 0,
        deaths: 0,
        xp: 0,
    };
}

function getCareer(name) {
    if (!name) return null;
    if (!careerStats[name]) careerStats[name] = defaultCareerEntry();
    // Backfill any new fields on existing records
    careerStats[name] = { ...defaultCareerEntry(), ...careerStats[name] };
    return careerStats[name];
}

// Bundle the player's career payload with derived level info for emission.
function careerPayloadFor(name) {
    const c = getCareer(name);
    if (!c) return null;
    const level = levelFromXp(c.xp);
    return {
        playerName: name,
        stats: c,
        level,
        xpIntoLevel: c.xp - xpThreshold(level),
        xpForNextLevel: xpThreshold(level + 1) - xpThreshold(level),
    };
}

function emitCareerToSocket(socketId, name) {
    const payload = careerPayloadFor(name);
    if (!payload) return;
    const s = io.sockets.sockets.get(socketId);
    s?.emit('careerStats', payload);
}

function awardKillXp(name, type) {
    if (!name) return;
    const c = getCareer(name);
    if (!c) return;
    const xp = KILL_XP[type] ?? 5;
    const prevLevel = levelFromXp(c.xp);
    if (type === 'boss') c.bossKills += 1; else c.kills += 1;
    c.xp += xp;
    const newLevel = levelFromXp(c.xp);
    markCareerDirty();
    // If the kill earned them a level, broadcast the new level so other
    // clients update their nameplates immediately.
    if (newLevel !== prevLevel) broadcastPlayerLevels();
    return { leveledUp: newLevel > prevLevel, newLevel };
}

function recordCareerMatch(name, payload) {
    if (!name) return;
    const c = getCareer(name);
    if (!c) return;
    const prevLevel = levelFromXp(c.xp);
    c.matchesPlayed += 1;
    if (typeof payload?.wave === 'number' && payload.wave > c.bestWave) c.bestWave = payload.wave;
    if (typeof payload?.score === 'number' && payload.score > c.bestScore) c.bestScore = payload.score;
    if (payload?.won) {
        c.wins += 1;
        if (payload.mode === 'PVP') c.pvpWins += 1;
        if (payload.mode === 'FFA') c.ffaWins += 1;
        c.xp += WIN_BONUS_XP;
    } else {
        c.xp += MATCH_BONUS_XP;
    }
    if (payload?.died) c.deaths += 1;
    markCareerDirty();
    const newLevel = levelFromXp(c.xp);
    if (newLevel !== prevLevel) broadcastPlayerLevels();
}

// Broadcast a snapshot of every connected player's current level so all
// clients can show "[Lv X]" next to remote nameplates. Cheap — ~10 ints.
function broadcastPlayerLevels() {
    const map = {};
    for (const [id, p] of Object.entries(players)) {
        const name = p?.playerName?.trim();
        if (!name) continue;
        const c = careerStats[name];
        if (!c) continue;
        map[id] = levelFromXp(c.xp);
    }
    io.emit('playerLevels', map);
}

app.get('/api/career/:name', (req, res) => {
    const name = String(req.params.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    res.json(careerPayloadFor(name));
});

// ── Editor API: maps ───────────────────────────────────────────────────────────
const _editorMapsDir = join(__dirname, 'public', 'maps');
const _assetsDir     = join(__dirname, 'public', 'assets', 'models');

app.get('/api/maps', async (_req, res) => {
    try {
        const files = await readdir(_editorMapsDir);
        const maps = files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
        res.json({ maps });
    } catch { res.json({ maps: [] }); }
});

app.get('/api/maps/:name', async (req, res) => {
    const name = req.params.name.replace(/[^a-zA-Z0-9_\-]/g, '');
    const file = join(_editorMapsDir, `${name}.json`);
    try {
        const text = await readFile(file, 'utf8');
        res.json(JSON.parse(text));
    } catch { res.status(404).json({ error: 'Not found' }); }
});

app.put('/api/maps/:name', express.json({ limit: '4mb' }), async (req, res) => {
    const name = req.params.name.replace(/[^a-zA-Z0-9_\-]/g, '');
    if (!name) return res.status(400).json({ error: 'Invalid name' });
    const file = join(_editorMapsDir, `${name}.json`);
    try {
        await writeFile(file, JSON.stringify(req.body, null, 2) + '\n', 'utf8');
        _mapJsonCache.delete(name); // bust server-side cache
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Recursively list GLB files for the asset picker
async function listGlbs(dir, base = '') {
    let results = [];
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return results; }
    for (const entry of entries) {
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            results = results.concat(await listGlbs(join(dir, entry.name), rel));
        } else if (entry.name.endsWith('.glb')) {
            results.push(`/assets/models/${rel}`);
        }
    }
    return results;
}

app.get('/api/assets', async (_req, res) => {
    const assets = await listGlbs(_assetsDir);
    res.json({ assets });
});

// ── Editor API: character config ──────────────────────────────────────────────
const _charConfigFile = join(__dirname, 'public', 'assets', 'characterConfig.json');

app.get('/api/character-config', (_req, res) => {
    try {
        const text = existsSync(_charConfigFile) ? readFileSync(_charConfigFile, 'utf8') : '{}';
        res.json(JSON.parse(text));
    } catch { res.json({}); }
});

app.put('/api/character-config', express.json({ limit: '512kb' }), (req, res) => {
    try {
        writeFileSync(_charConfigFile, JSON.stringify(req.body, null, 2) + '\n', 'utf8');
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Constants now imported from gameConstants.js (single source of truth) ────
// Aliases kept so existing server code that uses old names still compiles.
const B_SPD_E          = 28;   // enemy bullet speed — server-only constant
const BOSS_ESCAPE_GRAV = BOSS_ESCAPE_GRAVITY;
const BOSS_ESCAPE_JUMP_VEL = BOSS_ESCAPE_JUMP_VELOCITY;
const BOSS_ESCAPE_FWD_SPD  = BOSS_ESCAPE_FORWARD_SPEED;
const BOSS_ATTACK_REACH = 7.8;
const BOSS_ATTACK_FREQ  = 1.1;
const BOSS_WINDUP       = 0.2;
const BOSS_SWING        = 0.22;
const MAX_LIVE_ENEMIES  = 35;

// ── Rate limiting (bulletHit, enemyMeleeAttempt, chatMessage) ────────────────
const _socketRateLimits = new Map(); // socketId → { event: lastTimestamp }

function checkRateLimit(socketId, event, minMs) {
    const now = Date.now();
    const limits = _socketRateLimits.get(socketId) ?? {};
    if (now - (limits[event] ?? 0) < minMs) return false;
    limits[event] = now;
    _socketRateLimits.set(socketId, limits);
    return true;
}

// ── JSON-driven map data ──────────────────────────────────────────────────────
// Replaces the old hard-coded MAP_OBSTACLES table.
// Maps are loaded from public/maps/<id>.json on first use and cached.

const _mapJsonCache = new Map();  // mapId → parsed JSON
const _mapsDir = join(__dirname, 'public', 'maps');

async function loadMapJson(mapId) {
    if (_mapJsonCache.has(mapId)) return _mapJsonCache.get(mapId);
    try {
        const text = await readFile(join(_mapsDir, `${mapId}.json`), 'utf8');
        const data = JSON.parse(text);
        _mapJsonCache.set(mapId, data);
        return data;
    } catch {
        _mapJsonCache.set(mapId, null);
        return null;
    }
}

/** Derives a flat AABB obstacle list from a map JSON definition. */
function buildObstaclesFromJson(mapDef) {
    if (!mapDef?.objects) return [];
    const obs = [];
    for (const obj of mapDef.objects) {
        if (!obj.collidable) continue;
        if (obj.type === 'box') {
            const [x, , z] = obj.position;
            const [w, , d] = obj.size;
            obs.push({ min: { x: x - w / 2, z: z - d / 2 }, max: { x: x + w / 2, z: z + d / 2 } });
        } else if ((obj.type === 'prop' || obj.type === 'destructible') && obj.collider) {
            const c = obj.collider;
            const [cx, , cz] = c.position || obj.position;
            const [cw, , cd] = c.size || [1, 1, 1];
            obs.push({ min: { x: cx - cw / 2, z: cz - cd / 2 }, max: { x: cx + cw / 2, z: cz + cd / 2 } });
        }
    }
    return obs;
}

/** Returns the pre-built obstacle array for the current map (sync after preload). */
function getMapObstacles(mapId) {
    const def = _mapJsonCache.get(mapId);
    return def ? buildObstaclesFromJson(def) : [];
}

/** Returns enemy spawn zones from JSON, or null if map has none. */
function getMapSpawnZones(mapId) {
    const def = _mapJsonCache.get(mapId);
    if (!def?.objects) return null;
    const zones = def.objects.filter(o => o.type === 'spawn' && o.spawnType === 'enemy');
    return zones.length > 0 ? zones : null;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function dist2(ax, az, bx, bz) {
    const dx = ax - bx, dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
}

function norm2(dx, dz) {
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    return [dx / l, dz / l];
}

// Push a point (ex, ez) outside all overlapping obstacle AABBs.
function resolveEnemyObstacles(enemy, obstacles) {
    const radius = 0.7;
    for (const obs of obstacles) {
        const cx = Math.max(obs.min.x, Math.min(obs.max.x, enemy.x));
        const cz = Math.max(obs.min.z, Math.min(obs.max.z, enemy.z));
        const dx = enemy.x - cx;
        const dz = enemy.z - cz;
        const distSq = dx * dx + dz * dz;
        if (distSq === 0) {
            // Fully inside — push toward nearest edge
            const edges = [
                enemy.x - obs.min.x, obs.max.x - enemy.x,
                enemy.z - obs.min.z, obs.max.z - enemy.z,
            ];
            const idx = edges.indexOf(Math.min(...edges));
            if (idx === 0) enemy.x = obs.min.x - radius;
            else if (idx === 1) enemy.x = obs.max.x + radius;
            else if (idx === 2) enemy.z = obs.min.z - radius;
            else               enemy.z = obs.max.z + radius;
        } else if (distSq < radius * radius) {
            const dist = Math.sqrt(distSq);
            const push = radius - dist;
            enemy.x += (dx / dist) * push;
            enemy.z += (dz / dist) * push;
        }
    }
}

// Returns false if any obstacle AABB intersects the segment (ox,oz)→(tx,tz).
function hasLineOfSight(ox, oz, tx, tz, obstacles) {
    const dx = tx - ox, dz = tz - oz;
    for (const obs of obstacles) {
        let tmin = 0, tmax = 1;
        if (Math.abs(dx) > 1e-9) {
            const t1 = (obs.min.x - ox) / dx;
            const t2 = (obs.max.x - ox) / dx;
            tmin = Math.max(tmin, Math.min(t1, t2));
            tmax = Math.min(tmax, Math.max(t1, t2));
        } else if (ox < obs.min.x || ox > obs.max.x) continue;
        if (Math.abs(dz) > 1e-9) {
            const t1 = (obs.min.z - oz) / dz;
            const t2 = (obs.max.z - oz) / dz;
            tmin = Math.max(tmin, Math.min(t1, t2));
            tmax = Math.min(tmax, Math.max(t1, t2));
        } else if (oz < obs.min.z || oz > obs.max.z) continue;
        if (tmin <= tmax) return false;
    }
    return true;
}

function segmentIntersectsExpandedBox(ox, oz, tx, tz, obs, pad = 0) {
    const minX = obs.min.x - pad;
    const maxX = obs.max.x + pad;
    const minZ = obs.min.z - pad;
    const maxZ = obs.max.z + pad;
    const dx = tx - ox;
    const dz = tz - oz;
    let tmin = 0;
    let tmax = 1;

    if (Math.abs(dx) > 1e-9) {
        const t1 = (minX - ox) / dx;
        const t2 = (maxX - ox) / dx;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (ox < minX || ox > maxX) {
        return false;
    }

    if (Math.abs(dz) > 1e-9) {
        const t1 = (minZ - oz) / dz;
        const t2 = (maxZ - oz) / dz;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (oz < minZ || oz > maxZ) {
        return false;
    }

    return tmin <= tmax;
}

function getDetourDirection(enemy, target, obstacles) {
    const clearance = 1.5;
    let blockingObs = null;
    let bestDistSq = Infinity;

    for (const obs of obstacles) {
        if (!segmentIntersectsExpandedBox(enemy.x, enemy.z, target.x, target.z, obs, clearance)) continue;
        const centerX = (obs.min.x + obs.max.x) * 0.5;
        const centerZ = (obs.min.z + obs.max.z) * 0.5;
        const dx = centerX - enemy.x;
        const dz = centerZ - enemy.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            blockingObs = obs;
        }
    }

    if (!blockingObs) return null;

    const points = [
        { x: blockingObs.min.x - clearance, z: blockingObs.min.z - clearance },
        { x: blockingObs.min.x - clearance, z: blockingObs.max.z + clearance },
        { x: blockingObs.max.x + clearance, z: blockingObs.min.z - clearance },
        { x: blockingObs.max.x + clearance, z: blockingObs.max.z + clearance },
    ];

    let bestPoint = null;
    let bestScore = Infinity;
    for (const point of points) {
        const d1 = dist2(enemy.x, enemy.z, point.x, point.z);
        const d2 = dist2(point.x, point.z, target.x, target.z);
        const score = d1 + d2;
        if (score < bestScore) {
            bestScore = score;
            bestPoint = point;
        }
    }

    if (!bestPoint) return null;
    const [adx, adz] = norm2(bestPoint.x - enemy.x, bestPoint.z - enemy.z);
    return { x: adx, z: adz };
}

function updateEnemyDetour(enemy, target, obstacles, movedDistSq, chaseRange, dt) {
    enemy.avoidCheckTmr = (enemy.avoidCheckTmr || 0) - dt;
    enemy.avoidTmr = Math.max(0, (enemy.avoidTmr || 0) - dt);

    if (enemy.avoidCheckTmr > 0) return;
    enemy.avoidCheckTmr = 2.0;
    if (dist2(enemy.x, enemy.z, target.x, target.z) <= chaseRange * chaseRange) {
        enemy.avoidTmr = 0;
        return;
    }

    const movedEnough = movedDistSq > 0.09;
    const canSeeTarget = hasLineOfSight(enemy.x, enemy.z, target.x, target.z, obstacles);
    if (movedEnough || canSeeTarget) {
        enemy.avoidTmr = 0;
        return;
    }

    const detour = getDetourDirection(enemy, target, obstacles);
    if (detour) {
        enemy.avoidDirX = detour.x;
        enemy.avoidDirZ = detour.z;
        enemy.avoidTmr = 2.0;
    }
}

// ── Player registry ───────────────────────────────────────────────────────────

let players = {};
let currentMode = 'COOP';
let selectedMap = 'arena';
let ffaTimerInterval = null;
let ffaTimeLeft = 0;
let roomPassword = null; // null = open room, string = locked room

// Temporarily stores state for players who disconnected mid-game so they can
// rejoin and pick up where they left off (cleared after 60 s).
// Keyed by the client's session token (UUID stored in localStorage), not by name.
const recentlyDisconnected = {};

function getAlivePlayers() {
    return Object.values(players).filter(p => p.isAlive && !p.isDowned && !p.isSpectating);
}

function isGamePausedForAlivePlayers() {
    const alivePlayers = getAlivePlayers();
    if (alivePlayers.length === 0) return false;
    if (alivePlayers.length === 1) return !!alivePlayers[0].isPaused;
    return alivePlayers.every(p => p.isPaused);
}

function broadcastPauseState() {
    io.emit('pauseState', { paused: isGamePausedForAlivePlayers() });
}

// ── Server-side game state ────────────────────────────────────────────────────

const CAMPAIGN_MAP_ORDER = ['arena', 'desert', 'city', 'blacksite'];
const CAMPAIGN_MAX_WAVE = 7;

// Weapon that drops after the last enemy of each campaign wave (waves 1-7)
const CAMPAIGN_WAVE_WEAPON_DROP = {
    1: 'assault', 2: 'shotgun', 3: 'sniper', 4: 'sword',
    5: 'grapple', 6: 'bazooka', 7: 'pistol',
};

const gameState = {
    mode: null,
    gameMode: 'endless',  // 'campaign' | 'endless'
    campaignMapIndex: 0,
    // Players (by socket.id) who have clicked DEPLOY in the current campaign
    // cutscene. Reset on every cutscene start; when its size matches the
    // connected-player count, the server broadcasts campaignAllReady.
    campaignReady: new Set(),
    invincibility: false,
    wave: 0,
    waveState: 'WAIT',
    waveTmr: 3,
    enemiesToSpawn: 0,
    skeletonGroupsToSpawn: 0,
    spawnTmr: 0,
    enemies: [],
    healthPacks: [],
    nextEnemyId: 1,
    nextPackId: 1,
    nextDropId: 1,
    weaponDrops: [],
    tickInterval: null,
    // Monotonic counter bumped each time a match starts. Used by the rejoin
    // handler to reject stale tokens from a previous match.
    matchEpoch: 0,
    // Map currently being played — needed by the rejoin handler so the
    // returning client can rebuild the correct arena.
    map: 'arena',
};

// Wipe all saved player states tied to a finished match. Called when a
// match ends normally (COOP wipe, PvP winner, FFA timeout) or when the
// orphan-cleanup timer fires after a long-empty match.
function clearMatchState() {
    cancelOrphanMatchCleanup();
    for (const token of Object.keys(recentlyDisconnected)) delete recentlyDisconnected[token];
    gameState.mode = null;
}

function resetGameState(mode, startingWave, gameMode = 'endless', campaignMapIndex = 0) {
    stopGameLoop();
    // A fresh match — invalidate any saved tokens from a previous match,
    // cancel any pending orphan-cleanup timer, and clear leftover cutscene
    // ready state from a previous campaign run.
    cancelOrphanMatchCleanup();
    gameState.campaignReady.clear();
    for (const token of Object.keys(recentlyDisconnected)) delete recentlyDisconnected[token];
    gameState.matchEpoch += 1;
    gameState.mode = mode;
    gameState.gameMode = gameMode;
    gameState.campaignMapIndex = campaignMapIndex;
    gameState.map = selectedMap;
    gameState.wave = startingWave > 1 ? startingWave - 1 : 0;
    gameState.waveState = 'WAIT';
    gameState.waveTmr = startingWave > 1 ? 0.1 : 3;
    gameState.enemiesToSpawn = 0;
    gameState.skeletonGroupsToSpawn = 0;
    gameState.spawnTmr = 0;
    gameState.enemies = [];
    gameState.healthPacks = [];
    gameState.weaponDrops = [];
    gameState.nextEnemyId = 1;
    gameState.nextPackId = 1;
    gameState.nextDropId = 1;
    // Reset every player's collected-weapons list so a previous match's
    // loadout doesn't leak into the new match.
    Object.values(players).forEach((p) => { p.collectedWeapons = ['pistol']; });
}

// ── Enemy factories ───────────────────────────────────────────────────────────

// Returns the socket ID of the alive player closest to (x, z).
function getClosestPlayerId(x, z) {
    const alive = getAlivePlayers();
    if (alive.length === 0) return null;
    let best = null, bestDist = Infinity;
    for (const p of alive) {
        const dx = p.x - x, dz = p.z - z;
        const d = dx * dx + dz * dz;
        if (d < bestDist) { bestDist = d; best = p.playerId; }
    }
    return best;
}

// Re-assign every enemy to the closest alive player and broadcast changes.
function reassignEnemyOwnership() {
    const changes = [];
    for (const enemy of gameState.enemies) {
        const newOwner = getClosestPlayerId(enemy.x, enemy.z);
        if (newOwner && newOwner !== enemy.ownerId) {
            enemy.ownerId = newOwner;
            changes.push({ id: enemy.id, ownerId: newOwner });
        }
    }
    if (changes.length > 0) io.emit('enemyOwnership', changes);
}

function baseEnemy(type, x, z) {
    return {
        id: `e${gameState.nextEnemyId++}`,
        type, x, y: 0, z,
        rot: 0, walkT: 0,
        atkDmg: 0, atkTmr: 0,
        fireInt: 0, fireTmr: 0,
        windupTmr: 0, swingTmr: 0,
        velY: 0, escaping: false,
        escapeFwdX: 0, escapeFwdZ: 0,
        lastEscapeTime: 0,
        stuckTmr: 0, lastTrackX: x, lastTrackZ: z,
        avoidCheckTmr: 2.0, avoidTmr: 0, avoidDirX: 0, avoidDirZ: 0,
        ownerId: null,
    };
}

function makeSoldier(x, z) {
    const hp = Math.round((58 + gameState.wave * 12) * Math.pow(1.1, gameState.wave));
    const spd = 3.5 + Math.random() * 1.5 + gameState.wave * 0.2;
    const fireInt = Math.max(0.8, 2.2 - gameState.wave * 0.1) + Math.random() * 0.4;
    return Object.assign(baseEnemy('soldier', x, z), {
        hp, maxHp: hp, spd,
        fireInt, fireTmr: fireInt * 0.5 + Math.random() * fireInt * 0.5,
    });
}

function makeDog(x, z) {
    const hp = Math.round((46 + gameState.wave * 10) * Math.pow(1.1, gameState.wave));
    return Object.assign(baseEnemy('dog', x, z), {
        hp, maxHp: hp,
        spd: 8 + Math.random() * 2 + gameState.wave * 0.3,
        atkDmg: 12 + gameState.wave * 2,
        atkTmr: Math.random() * 0.5,
    });
}

function makeSkeleton(x, z) {
    return Object.assign(baseEnemy('skeleton', x, z), {
        hp: 1, maxHp: 1,
        spd: (9 + Math.random() * 2.5) * 0.7, // 30% slower than original
        atkDmg: 8 + gameState.wave,
        atkTmr: Math.random() * 0.4,
    });
}

function makeBoss(x, z, hpMult) {
    const hp = Math.round(3600 * Math.pow(1.1, gameState.wave) * hpMult);
    return Object.assign(baseEnemy('boss', x, z), {
        hp, maxHp: hp, spd: 12,
        atkDmg: 100 + gameState.wave * 10,
        hpMult,
    });
}

// ── Spawn helpers ─────────────────────────────────────────────────────────────

// Returns false if the spawn position lands inside a known solid/blocked area
// for the current map. Prevents enemies from spawning trapped in geometry.
function isOpenSpawnPos(sx, sz) {
    // Check JSON-derived spawn zones first (blocked areas from box objects near edges)
    const def = _mapJsonCache.get(selectedMap);
    if (def) {
        // Blacksite geometry creates solid corner masses — derive from JSON if possible,
        // otherwise keep the hard-coded guard for backward compatibility.
        if (selectedMap === 'blacksite') {
            if (Math.abs(sx) > 50 && Math.abs(sz) > 37) return false;
            if (Math.abs(sz) > 50 && Math.abs(sx) > 37) return false;
        }
        return true;
    }
    // Fallback when JSON not loaded
    if (selectedMap === 'blacksite') {
        if (Math.abs(sx) > 50 && Math.abs(sz) > 37) return false;
        if (Math.abs(sz) > 50 && Math.abs(sx) > 37) return false;
    }
    return true;
}

function pickSpawnPos(minDistFromPlayer, extraCheck) {
    const alive = getAlivePlayers();
    for (let attempt = 0; attempt < 40; attempt++) {
        const side = Math.floor(Math.random() * 4);
        const offset = (Math.random() - 0.5) * (ARENA_SIZE - 6);
        let sx, sz;
        if (side === 0)      { sx = -(HALF - 1); sz = offset; }
        else if (side === 1) { sx =   HALF - 1;  sz = offset; }
        else if (side === 2) { sx = offset; sz = -(HALF - 1); }
        else                 { sx = offset; sz =   HALF - 1;  }

        const tooCloseToPlayer = alive.some(p => dist2(sx, sz, p.x, p.z) < minDistFromPlayer);
        // Also keep a minimum gap from existing enemies so skeleton groups don't stack.
        const tooCloseToEnemy = gameState.enemies.some(e => dist2(sx, sz, e.x, e.z) < 6);
        if (!tooCloseToPlayer && !tooCloseToEnemy && isOpenSpawnPos(sx, sz) && (!extraCheck || extraCheck(sx, sz))) {
            return [sx, sz];
        }
    }
    // Fallback: safe edge position (always valid: centre of an edge)
    const fallbackOffset = (Math.random() - 0.5) * 60; // stay within ±30 to avoid corners
    return [HALF - 1, fallbackOffset];
}

function emitEnemySpawned(e) {
    io.emit('enemySpawned', {
        id: e.id, type: e.type, x: e.x, z: e.z,
        hp: e.hp, maxHp: e.maxHp,
        spd: e.spd, fireInt: e.fireInt, fireTmr: e.fireTmr,
        atkDmg: e.atkDmg, atkTmr: e.atkTmr,
        ownerId: e.ownerId,
    });
}

function spawnSkeletonPair(cx, cz) {
    for (let i = 0; i < 2; i++) {
        const angle = (i / 2) * Math.PI * 2;
        const ex = Math.max(-(HALF - 2), Math.min(HALF - 2, cx + Math.cos(angle) * 2.0));
        const ez = Math.max(-(HALF - 2), Math.min(HALF - 2, cz + Math.sin(angle) * 2.0));
        const e = makeSkeleton(ex, ez);
        e.ownerId = getClosestPlayerId(ex, ez) || Object.keys(players)[0] || null;
        gameState.enemies.push(e);
        emitEnemySpawned(e);
    }
}

function spawnEnemy() {
    if (gameState.enemies.length >= MAX_LIVE_ENEMIES) return;
    const [cx, cz] = pickSpawnPos(15);
    const w = gameState.wave;

    if (w <= 6) {
        // Rounds 1-6: unified progression in both campaign and endless
        // 1-2 skeletons only; 3-4 add soldiers; 5-6 add dogs
        const dogChance    = w >= 5 ? 0.35 : 0;
        const soldierChance = w >= 3 ? 0.30 : 0;
        const roll = Math.random();
        if (roll < dogChance) {
            const dog = makeDog(cx, cz);
            dog.ownerId = getClosestPlayerId(cx, cz) || Object.keys(players)[0] || null;
            gameState.enemies.push(dog);
            emitEnemySpawned(dog);
        } else if (roll < dogChance + soldierChance) {
            const e = makeSoldier(cx, cz);
            e.ownerId = getClosestPlayerId(cx, cz) || Object.keys(players)[0] || null;
            gameState.enemies.push(e);
            emitEnemySpawned(e);
        } else {
            spawnSkeletonPair(cx, cz);
        }
    } else {
        // Endless wave 8+: all types, increasing dog chance
        const dogChance = Math.min(0.55, 0.12 + (w - 3) * 0.12);
        if (Math.random() < dogChance) {
            const dog = makeDog(cx, cz);
            dog.ownerId = getClosestPlayerId(cx, cz) || Object.keys(players)[0] || null;
            gameState.enemies.push(dog);
            emitEnemySpawned(dog);
        } else {
            spawnSkeletonPair(cx, cz);
        }
    }
}

function spawnSkeletonGroup() {
    // Extra soldier spawn used in endless rounds 8+ only
    if (gameState.enemies.length >= MAX_LIVE_ENEMIES) return;
    const [sx, sz] = pickSpawnPos(15);
    const e = makeSoldier(sx, sz);
    e.ownerId = getClosestPlayerId(sx, sz) || Object.keys(players)[0] || null;
    gameState.enemies.push(e);
    emitEnemySpawned(e);
}

function spawnBoss() {
    const bossWaveNum = Math.floor(gameState.wave / 5);
    const bossCount = bossWaveNum <= 1 ? 1 : Math.floor((bossWaveNum + 2) / 2);
    const hpMult = bossWaveNum <= 1 ? 1 : Math.pow(2, Math.floor((bossWaveNum - 1) / 2));
    const placed = [];
    for (let i = 0; i < bossCount; i++) {
        const [sx, sz] = pickSpawnPos(22, (x, z) => placed.every(([bx, bz]) => dist2(x, z, bx, bz) > 12));
        placed.push([sx, sz]);
        const e = makeBoss(sx, sz, hpMult);
        e.ownerId = getClosestPlayerId(sx, sz) || Object.keys(players)[0] || null;
        gameState.enemies.push(e);
        emitEnemySpawned(e);
    }
}

// ── Wave state machine ────────────────────────────────────────────────────────

function reviveAllPlayers() {
    Object.values(players).forEach(p => {
        if (!p.isAlive || p.isDowned || p.isSpectating) {
            p.isAlive = true;
            p.isDowned = false;
            p.isSpectating = false;
            io.emit('playerRespawned', { playerId: p.playerId, wave: gameState.wave });
        }
    });
}

function finishWave() {
    if (gameState.gameMode === 'campaign' && gameState.wave >= CAMPAIGN_MAX_WAVE) {
        // Campaign complete — transition to next map after a short delay
        gameState.waveState = 'WAIT';
        gameState.waveTmr = 99999; // hold until transition fires
        io.emit('syncWave', { wave: gameState.wave, state: 'WAIT', tmr: 4, gameMode: 'campaign' });
        setTimeout(() => handleCampaignWaveComplete(), 3500);
        return;
    }
    gameState.waveState = 'WAIT';
    gameState.waveTmr = 2.5;
    io.emit('syncWave', { wave: gameState.wave, state: 'WAIT', tmr: 2.5, gameMode: gameState.gameMode });
}

function isBossWave() {
    if (gameState.gameMode === 'campaign') return gameState.wave === CAMPAIGN_MAX_WAVE;
    // Endless: first boss at wave 7, then every 5 waves (7, 12, 17, 22...)
    return gameState.wave >= 7 && (gameState.wave - 7) % 5 === 0;
}

function tickWave(dt) {
    if (gameState.mode !== 'COOP') return;

    if (gameState.waveState === 'WAIT') {
        gameState.waveTmr -= dt;
        if (gameState.waveTmr > 0) return;

        gameState.wave += 1;
        reviveAllPlayers();

        if (isBossWave()) {
            spawnBoss();
            gameState.waveState = 'ACTIVE';
        } else {
            gameState.enemiesToSpawn = Math.min(1 + gameState.wave, 12);
            // Extra soldier spawns only in endless after round 7 (rounds 1-6 mix soldiers via spawnEnemy)
            gameState.skeletonGroupsToSpawn = (gameState.gameMode === 'endless' && gameState.wave > 7) ? 2 : 0;
            gameState.spawnTmr = 0;
            gameState.waveState = 'SPAWNING';
        }
        io.emit('syncWave', { wave: gameState.wave, state: gameState.waveState, tmr: gameState.waveTmr, gameMode: gameState.gameMode });

    } else if (gameState.waveState === 'SPAWNING') {
        gameState.spawnTmr -= dt;
        if (gameState.spawnTmr <= 0 && (gameState.enemiesToSpawn > 0 || gameState.skeletonGroupsToSpawn > 0)) {
            const preferSkeleton = gameState.skeletonGroupsToSpawn > 0
                && (gameState.enemiesToSpawn === 0 || Math.random() < 0.35);
            if (preferSkeleton) {
                spawnSkeletonGroup();
                gameState.skeletonGroupsToSpawn -= 1;
                gameState.spawnTmr = 1.2;
            } else {
                spawnEnemy();
                gameState.enemiesToSpawn -= 1;
                gameState.spawnTmr = 0.5;
            }
        }
        if (gameState.enemiesToSpawn <= 0 && gameState.skeletonGroupsToSpawn <= 0) {
            gameState.waveState = 'ACTIVE';
            io.emit('syncWave', { wave: gameState.wave, state: 'ACTIVE', tmr: 0, gameMode: gameState.gameMode });
        }

    } else if (gameState.waveState === 'ACTIVE') {
        if (gameState.enemies.length === 0) finishWave();
    }
}

// Resets the cutscene-ready set and tells everyone the cutscene/lobby is
// fresh (0/N players ready). Called at every cutscene boundary.
function resetCampaignReady() {
    gameState.campaignReady.clear();
    io.emit('campaignReadyUpdate', { ready: 0, total: Object.keys(players).length });
}

// Notify clients of progress and fire campaignAllReady once everyone is in.
// Also handles the case where everyone is already ready and a disconnect
// reduces the required count.
function checkCampaignAllReady() {
    const total = Object.keys(players).length;
    if (total === 0) return; // wait for someone to be here
    // Drop any ready entries for players that have left
    for (const id of [...gameState.campaignReady]) {
        if (!players[id]) gameState.campaignReady.delete(id);
    }
    const ready = gameState.campaignReady.size;
    io.emit('campaignReadyUpdate', { ready, total });
    if (ready >= total) {
        gameState.campaignReady.clear();
        io.emit('campaignAllReady');
    }
}

function handleCampaignWaveComplete() {
    // Advance to next map after wave 7 in campaign mode
    gameState.campaignMapIndex = (gameState.campaignMapIndex + 1) % CAMPAIGN_MAP_ORDER.length;
    const nextMap = CAMPAIGN_MAP_ORDER[gameState.campaignMapIndex];
    selectedMap = nextMap;
    gameState.map = nextMap;
    resetCampaignReady();
    // Reset waves back to 0 so the next map starts at wave 1
    gameState.wave = 0;
    gameState.waveState = 'WAIT';
    gameState.waveTmr = 4;
    gameState.enemies = [];
    gameState.weaponDrops = [];
    gameState.healthPacks = [];
    reviveAllPlayers();
    loadMapJson(nextMap).catch(() => {});
    io.emit('campaignNextMap', { map: nextMap, campaignMapIndex: gameState.campaignMapIndex });
    io.emit('syncWave', { wave: 0, state: 'WAIT', tmr: 4, gameMode: 'campaign' });
}

// ── Enemy damage + kill ───────────────────────────────────────────────────────

function applyEnemyDamage(targetId, damage, enemyId, knockbackX = 0, knockbackZ = 0) {
    if (gameState.mode === 'COOP' && gameState.invincibility) return;
    const player = players[targetId];
    if (!player || !player.isAlive || player.isDowned) return;
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
        targetSocket.emit('playerDamaged', { targetId, damage, shooterId: enemyId, knockbackX, knockbackZ });
    }
}

function canEnemyMeleeTarget(enemy, target, ex, ey, ez) {
    const reach = enemy.type === 'boss' ? BOSS_ATTACK_REACH : enemy.type === 'dog' ? 2.5 : 2.0;
    const dx = ex - target.x;
    const dz = ez - target.z;
    if (dx * dx + dz * dz > reach * reach) return false;

    const enemyY = typeof ey === 'number' ? ey : enemy.y;
    const targetY = typeof target.y === 'number' ? target.y : 0;
    const maxVerticalDelta = enemy.type === 'boss' ? 4.8 : 1.35;
    return Math.abs(enemyY - targetY) <= maxVerticalDelta;
}

function spawnWeaponDrop(x, z, weaponId) {
    const id = `drop${gameState.nextDropId++}`;
    gameState.weaponDrops.push({ id, weaponId, x, z });
    io.emit('weaponDropSpawned', { id, weaponId, x, z });
}

function killEnemy(enemy, killerId) {
    const idx = gameState.enemies.indexOf(enemy);
    if (idx === -1) return;
    gameState.enemies.splice(idx, 1);

    // Award kill credit to the shooter
    if (killerId) {
        let score = 100, type = 'soldier';
        if (enemy.type === 'boss')     { score = 2500; type = 'boss'; }
        else if (enemy.type === 'dog') { score = 150;  type = 'dog'; }
        else if (enemy.type === 'skeleton') { score = 25; type = 'skeleton'; }
        const s = io.sockets.sockets.get(killerId);
        if (s) s.emit('killCredit', { type, score, enemyId: enemy.id });
        // Persistent career XP — survives match end & server restart.
        const killerName = players[killerId]?.playerName?.trim();
        if (killerName) {
            awardKillXp(killerName, type);
            emitCareerToSocket(killerId, killerName);
        }
    }

    // 10% health pack drop
    if (Math.random() < 0.1) spawnHealthPack(enemy.x, enemy.z);

    // Tell all clients the enemy is gone (visual death)
    io.emit('enemyKilled', { id: enemy.id, type: enemy.type, x: enemy.x, z: enemy.z });

    // Weapon drop: last enemy of waves 1-7 drops the wave weapon (both modes)
    const w = gameState.wave;
    if (gameState.mode === 'COOP' && w >= 1 && w <= 7
        && gameState.enemies.length === 0
        && (gameState.waveState === 'ACTIVE' || (gameState.enemiesToSpawn <= 0 && gameState.skeletonGroupsToSpawn <= 0))
        && CAMPAIGN_WAVE_WEAPON_DROP[w]) {
        spawnWeaponDrop(enemy.x, enemy.z, CAMPAIGN_WAVE_WEAPON_DROP[w]);
    }
}

// ── Health packs ──────────────────────────────────────────────────────────────

function spawnHealthPack(x, z) {
    const id = `pack${gameState.nextPackId++}`;
    gameState.healthPacks.push({ id, x, z });
    io.emit('healthPackSpawned', { id, x, y: 0.3, z });
}

// ── Enemy AI tick ─────────────────────────────────────────────────────────────

function tickEnemies(dt) {
    const alive = getAlivePlayers();
    const obstacles = getMapObstacles(selectedMap);

    for (const enemy of gameState.enemies) {
        // Boss escape arc (parabolic jump)
        if (enemy.escaping) {
            enemy.velY -= BOSS_ESCAPE_GRAV * dt;
            enemy.y = Math.max(0, enemy.y + enemy.velY * dt);
            enemy.x = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.x + enemy.escapeFwdX * BOSS_ESCAPE_FWD_SPD * dt));
            enemy.z = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.z + enemy.escapeFwdZ * BOSS_ESCAPE_FWD_SPD * dt));
            if (enemy.y <= 0) { enemy.y = 0; enemy.velY = 0; enemy.escaping = false; }
            continue;
        }

        if (alive.length === 0) continue;

        // Pick nearest target
        let target = null, targetDist = Infinity;
        for (const p of alive) {
            const d = dist2(enemy.x, enemy.z, p.x, p.z);
            if (d < targetDist) { targetDist = d; target = p; }
        }
        if (!target) continue;

        const dx = target.x - enemy.x;
        const dz = target.z - enemy.z;
        const [ndx, ndz] = norm2(dx, dz);
        enemy.rot = Math.atan2(ndx, ndz) + Math.PI;

        if (enemy.type === 'soldier') {
            const prevX = enemy.x;
            const prevZ = enemy.z;
            // Kite: advance if > 14, retreat if < 7
            const moveSpd = targetDist > 14 ? enemy.spd : targetDist < 7 ? -enemy.spd * 0.4 : 0;
            const dirX = enemy.avoidTmr > 0 ? enemy.avoidDirX : ndx;
            const dirZ = enemy.avoidTmr > 0 ? enemy.avoidDirZ : ndz;
            enemy.x = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.x + dirX * moveSpd * dt));
            enemy.z = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.z + dirZ * moveSpd * dt));
            resolveEnemyObstacles(enemy, obstacles);
            updateEnemyDetour(enemy, target, obstacles, dist2(prevX, prevZ, enemy.x, enemy.z), 7, dt);
            enemy.walkT += dt * 8;

            if (targetDist < 50) {
                enemy.fireTmr -= dt;
                if (enemy.fireTmr <= 0) {
                    // Only fire if there is clear line of sight to the target
                    const canSee = hasLineOfSight(enemy.x, enemy.z, target.x, target.z, obstacles);
                    if (canSee) {
                        enemy.fireTmr = enemy.fireInt;
                        const spreadH = (Math.random() - 0.5) * 0.24;
                        const horizontalX = ndx + spreadH;
                        const horizontalZ = ndz + spreadH;
                        const [bnx, bnz] = norm2(horizontalX, horizontalZ);
                        const verticalDir = targetDist > 0 ? ((target.y + 1.2) - (enemy.y + 1.2)) / targetDist : 0;
                        const bulletLen = Math.sqrt(bnx * bnx + bnz * bnz + verticalDir * verticalDir) || 1;
                        const bulletDx = bnx / bulletLen;
                        const bulletDy = verticalDir / bulletLen;
                        const bulletDz = bnz / bulletLen;
                        io.emit('enemyBulletFired', {
                            enemyId: enemy.id,
                            x: enemy.x + bulletDx * 0.6, y: enemy.y + 1.2, z: enemy.z + bulletDz * 0.6,
                            dx: bulletDx, dy: bulletDy, dz: bulletDz,
                            damage: 25, spd: B_SPD_E, life: 4,
                        });
                        // Schedule damage after approximate travel time.
                        // Capture positions NOW — loop variables will have moved by the time the
                        // timeout fires (classic closure-over-loop bug).
                        const travelMs = Math.max(50, Math.round((targetDist / B_SPD_E) * 1000));
                        const tid = target.playerId;
                        const eid = enemy.id;
                        const shotOriginX = enemy.x;
                        const shotOriginZ = enemy.z;
                        setTimeout(() => {
                            const p = players[tid];
                            if (!p || !p.isAlive || p.isDowned) return;
                            // Abort if player moved behind cover since the shot was fired
                            if (!hasLineOfSight(shotOriginX, shotOriginZ, p.x, p.z, obstacles)) return;
                            if (dist2(shotOriginX, shotOriginZ, p.x, p.z) > 65) return;
                            applyEnemyDamage(tid, 25, eid);
                        }, travelMs);
                    } else {
                        // Blocked — retry sooner
                        enemy.fireTmr = enemy.fireInt * 0.4;
                    }
                }
            }

        } else if (enemy.type === 'dog') {
            const prevX = enemy.x;
            const prevZ = enemy.z;
            const dirX = enemy.avoidTmr > 0 ? enemy.avoidDirX : ndx;
            const dirZ = enemy.avoidTmr > 0 ? enemy.avoidDirZ : ndz;
            enemy.x = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.x + dirX * enemy.spd * dt));
            enemy.z = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.z + dirZ * enemy.spd * dt));
            resolveEnemyObstacles(enemy, obstacles);
            updateEnemyDetour(enemy, target, obstacles, dist2(prevX, prevZ, enemy.x, enemy.z), 2.5, dt);
            enemy.walkT += dt * 12;
            enemy.atkTmr -= dt;
            if (targetDist < 2.5 && enemy.atkTmr <= 0 && canEnemyMeleeTarget(enemy, target, enemy.x, enemy.y, enemy.z)) {
                enemy.atkTmr = 1.0;
                applyEnemyDamage(target.playerId, enemy.atkDmg, enemy.id);
            }
            if (targetDist >= 2.5) enemy.atkTmr = Math.min(enemy.atkTmr, 0.3);

        } else if (enemy.type === 'skeleton') {
            const prevX = enemy.x;
            const prevZ = enemy.z;
            const dirX = enemy.avoidTmr > 0 ? enemy.avoidDirX : ndx;
            const dirZ = enemy.avoidTmr > 0 ? enemy.avoidDirZ : ndz;
            enemy.x = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.x + dirX * enemy.spd * dt));
            enemy.z = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.z + dirZ * enemy.spd * dt));
            resolveEnemyObstacles(enemy, obstacles);
            updateEnemyDetour(enemy, target, obstacles, dist2(prevX, prevZ, enemy.x, enemy.z), 2.0, dt);
            enemy.walkT += dt * 12;
            enemy.atkTmr -= dt;
            if (targetDist < 2.0 && enemy.atkTmr <= 0 && canEnemyMeleeTarget(enemy, target, enemy.x, enemy.y, enemy.z)) {
                enemy.atkTmr = 0.8;
                applyEnemyDamage(target.playerId, enemy.atkDmg, enemy.id);
            }
            if (targetDist >= 2.0) enemy.atkTmr = Math.min(enemy.atkTmr, 0.3);

        } else if (enemy.type === 'boss') {
            const prevX = enemy.x;
            const prevZ = enemy.z;
            const inAttackRange = targetDist < BOSS_ATTACK_REACH;
            if (!inAttackRange) {
                enemy.x = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.x + ndx * enemy.spd * dt));
                enemy.z = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.z + ndz * enemy.spd * dt));
            }
            resolveEnemyObstacles(enemy, obstacles);
            const movedDistSq = dist2(prevX, prevZ, enemy.x, enemy.z);
            enemy.walkT += dt * 6;

            // Windup → swing attack sequence
            if (enemy.windupTmr > 0) {
                enemy.windupTmr -= dt;
                if (enemy.windupTmr <= 0) enemy.swingTmr = BOSS_SWING;
            } else if (enemy.swingTmr > 0) {
                const prevSwing = enemy.swingTmr;
                enemy.swingTmr -= dt;
                // Damage fires when swing timer crosses the 0.09 threshold
                if (prevSwing > 0.09 && enemy.swingTmr <= 0.09
                    && targetDist < BOSS_ATTACK_REACH
                    && canEnemyMeleeTarget(enemy, target, enemy.x, enemy.y, enemy.z)) {
                    applyEnemyDamage(target.playerId, enemy.atkDmg, enemy.id);
                }
                if (enemy.swingTmr <= 0) enemy.swingTmr = 0;
            } else {
                // Ready: check attack cooldown
                enemy.atkTmr -= dt;
                if (enemy.atkTmr <= 0 && inAttackRange) {
                    enemy.atkTmr = BOSS_ATTACK_FREQ;
                    enemy.windupTmr = BOSS_WINDUP;
                }
            }

            // Escape jump only when genuinely stuck and outside melee range.
            const now = Date.now();
            if (!inAttackRange && movedDistSq < 0.04) enemy.stuckTmr += dt;
            else enemy.stuckTmr = 0;
            if (!enemy.escaping && enemy.y === 0
                && !inAttackRange
                && enemy.stuckTmr >= 0.9
                && now - enemy.lastEscapeTime > 8000) {
                const [efx, efz] = norm2(ndx, ndz);
                enemy.escapeFwdX = efx;
                enemy.escapeFwdZ = efz;
                enemy.velY = BOSS_ESCAPE_JUMP_VEL;
                enemy.escaping = true;
                enemy.stuckTmr = 0;
                enemy.lastEscapeTime = now;
            }
        }
    }
}

// ── Game loop ─────────────────────────────────────────────────────────────────

function startGameLoop() {
    stopGameLoop();
    let lastTick = Date.now();
    let ownerReassignTmr = 5;
    gameState.tickInterval = setInterval(() => {
        const now = Date.now();
        const dt = Math.min(0.1, (now - lastTick) / 1000);
        lastTick = now;

        // Wave management stays server-side; AI is now client-side (owned enemies).
        const isPaused = isGamePausedForAlivePlayers();
        if (!isPaused) {
            tickWave(dt);
        }

        // Periodically reassign enemy ownership to the closest alive player.
        ownerReassignTmr -= dt;
        if (ownerReassignTmr <= 0) {
            ownerReassignTmr = 5;
            reassignEnemyOwnership();
        }

        // Broadcast authoritative enemy state (positions come from owning clients).
        io.emit('enemiesSynced', gameState.enemies.map(e => ({
            id: e.id, type: e.type,
            x: e.x, y: e.y, z: e.z,
            hp: e.hp, maxHp: e.maxHp,
            rot: e.rot, walkT: e.walkT,
            ownerId: e.ownerId,
        })));
    }, 50); // 20 Hz
}

function stopGameLoop() {
    if (gameState.tickInterval) {
        clearInterval(gameState.tickInterval);
        gameState.tickInterval = null;
    }
}

// ── FFA helpers ────────────────────────────────────────────────────────────────

function stopFFATimer() {
    if (ffaTimerInterval) {
        clearInterval(ffaTimerInterval);
        ffaTimerInterval = null;
    }
    ffaTimeLeft = 0;
}

// Like stopFFATimer but preserves ffaTimeLeft so the countdown can resume
// when a player rejoins after the world was frozen.
function pauseFFATimer() {
    if (ffaTimerInterval) {
        clearInterval(ffaTimerInterval);
        ffaTimerInterval = null;
    }
}

function resumeFFATimerIfNeeded() {
    if (gameState.mode !== 'FFA' || ffaTimerInterval || ffaTimeLeft <= 0) return;
    ffaTimerInterval = setInterval(() => {
        ffaTimeLeft -= 1;
        io.emit('ffaTimeUpdate', { timeLeft: ffaTimeLeft });
        if (ffaTimeLeft <= 0) endFFAMatch();
    }, 1000);
}

// If the match sits empty for too long, give up and wipe the saved state.
// Cleared as soon as anyone reconnects or starts a new match.
let _orphanCleanupTimer = null;
const ORPHAN_MATCH_TTL_MS = 30 * 60 * 1000; // 30 minutes
function scheduleOrphanMatchCleanup() {
    cancelOrphanMatchCleanup();
    _orphanCleanupTimer = setTimeout(() => {
        _orphanCleanupTimer = null;
        if (Object.keys(players).length === 0) {
            stopGameLoop();
            stopFFATimer();
            clearMatchState();
        }
    }, ORPHAN_MATCH_TTL_MS);
}
function cancelOrphanMatchCleanup() {
    if (_orphanCleanupTimer) {
        clearTimeout(_orphanCleanupTimer);
        _orphanCleanupTimer = null;
    }
}

function buildFFARankings() {
    return Object.values(players)
        .sort((a, b) => (b.ffaKills || 0) - (a.ffaKills || 0))
        .map((p, idx) => ({
            rank: idx + 1,
            playerId: p.playerId,
            playerName: p.playerName || `Player ${p.playerId.slice(0, 6)}`,
            character: p.character || null,
            kills: p.ffaKills || 0,
        }));
}

function endFFAMatch() {
    stopFFATimer();
    currentMode = 'COOP';
    const rankings = buildFFARankings();
    recordPvpGame(rankings);
    const winnerId = rankings[0]?.playerId || null;
    io.emit('ffaMatchOver', { winnerId, rankings });
    // Career stats for FFA
    for (const [id, p] of Object.entries(players)) {
        const name = p?.playerName?.trim();
        if (!name) continue;
        recordCareerMatch(name, {
            mode: 'FFA',
            won: id === winnerId,
            score: p.ffaKills || 0,
        });
        emitCareerToSocket(id, name);
    }
    clearMatchState();
}

// ── PvP helpers ───────────────────────────────────────────────────────────────

function computeWeaponForKills(kills) {
    const idx = Math.min(Math.floor(kills / PVP_KILLS_PER_WEAPON), WEAPON_ORDER.length - 1);
    return { idx, weapon: WEAPON_ORDER[idx] };
}

function buildPvPRankings() {
    return Object.values(players)
        .sort((a, b) => (b.pvpKills || 0) - (a.pvpKills || 0))
        .map((p, idx) => ({
            rank: idx + 1,
            playerId: p.playerId,
            playerName: p.playerName || `Player ${p.playerId.slice(0, 6)}`,
            character: p.character || null,
            kills: p.pvpKills || 0,
            swordKills: p.pvpSwordKills || 0,
            weaponsUnlocked: Math.min((p.pvpWeaponIdx || 0) + 1, WEAPON_ORDER.length),
            status: p.isAlive ? 'ALIVE' : 'DEAD',
        }));
}

// ── Room password helpers ─────────────────────────────────────────────────────

function broadcastRoomInfo() {
    io.emit('roomInfo', { locked: roomPassword !== null });
}

// Guarantee exactly one player has isHost=true. Called after any structural change.
function ensureHost() {
    const all = Object.values(players);
    if (all.length === 0) return;
    const hasHost = all.some(p => p.isHost);
    if (!hasHost) {
        all[0].isHost = true;
        io.emit('newHost', all[0].playerId);
    }
}

// ── Socket connections ────────────────────────────────────────────────────────

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    const isFirst = Object.keys(players).length === 0;
    const connectionInfo = createConnectionInfo(socket.handshake.address);

    // Send room lock status immediately so the client can show a password prompt.
    socket.emit('roomInfo', { locked: roomPassword !== null });

    players[socket.id] = {
        rotation: 0, x: 0, y: 0, z: 0,
        playerId: socket.id,
        weapon: 'assault',
        isReady: false, isHost: isFirst,
        isAlive: false, isDowned: false, isSpectating: false,
        playerName: '', character: null,
        mode: 'COOP',
        pvpKills: 0, pvpSwordKills: 0, pvpWeaponIdx: 0,
        score: 0, kills: 0, dogKills: 0, bossKills: 0, totalKills: 0,
        wave: 0, stats: {}, hp: P_MAX_HP, isPaused: false,
    };

    socket.emit('serverInfo', connectionInfo);
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);
    io.emit('updateLobby', players);
    // Send the new socket the current levels of everyone already in the lobby
    // so their nameplates can include "[Lv N]" immediately.
    broadcastPlayerLevels();

    socket.on('disconnect', () => {
        _socketRateLimits.delete(socket.id);
        console.log('User disconnected:', socket.id);
        // Preserve state for the entire remaining match duration so the player
        // can refresh / reconnect at any point without losing progress.
        const leaving = players[socket.id];
        const token = leaving?.sessionToken;
        if (token && gameState.mode) {
            recentlyDisconnected[token] = {
                ...leaving,
                savedAt: Date.now(),
                matchEpoch: gameState.matchEpoch,
                mapAtDisconnect: gameState.map,
            };
        }
        const wasHost = players[socket.id]?.isHost ?? false;
        delete players[socket.id];
        if (Object.keys(players).length === 0) {
            // No one left in the match — freeze the world so a refreshing
            // solo player can drop back into it. Game state is preserved;
            // an orphan-cleanup timer below wipes it if no one returns.
            stopGameLoop();
            pauseFFATimer();
            scheduleOrphanMatchCleanup();
        } else {
            // If the leaver was host (or no one else is host), promote the first remaining player.
            const hasHost = Object.values(players).some(p => p.isHost);
            if (wasHost || !hasHost) {
                const newHostId = Object.keys(players)[0];
                Object.values(players).forEach(p => { p.isHost = false; });
                players[newHostId].isHost = true;
                io.emit('newHost', newHostId);
            }
            reassignEnemyOwnership();
        }
        ensureHost();
        io.emit('updateLobby', players);
        io.emit('playerDisconnected', socket.id);
        broadcastPauseState();
        // If we were waiting on this player for a cutscene deploy, recheck
        // so the remaining players aren't blocked forever.
        if (gameState.campaignReady.size > 0) checkCampaignAllReady();
    });

    socket.on('playerMovement', (movementData) => {
        if (!players[socket.id]) return;
        const p = players[socket.id];
        p.x = movementData.x;
        p.y = movementData.y;
        p.z = movementData.z;
        p.rotation = movementData.rotation;
        if (typeof movementData.score === 'number')       p.score = movementData.score;
        if (typeof movementData.kills === 'number')       p.kills = movementData.kills;
        if (typeof movementData.dogKills === 'number')    p.dogKills = movementData.dogKills;
        if (typeof movementData.bossKills === 'number')   p.bossKills = movementData.bossKills;
        if (typeof movementData.totalKills === 'number')  p.totalKills = movementData.totalKills;
        if (typeof movementData.hp === 'number')          p.hp = movementData.hp;
        if (typeof movementData.wave === 'number')        p.wave = movementData.wave;
        if (typeof movementData.isAlive === 'boolean')    p.isAlive = movementData.isAlive;
        if (typeof movementData.isDowned === 'boolean')   p.isDowned = movementData.isDowned;
        if (typeof movementData.isSpectating === 'boolean') p.isSpectating = movementData.isSpectating;
        if (typeof movementData.isCrouching === 'boolean')  p.isCrouching = movementData.isCrouching;
        if (typeof movementData.isSprinting === 'boolean')  p.isSprinting = movementData.isSprinting;
        if (typeof movementData.currentWeapon === 'string') p.currentWeapon = movementData.currentWeapon;
        if (typeof movementData.swordSwing === 'number')    p.swordSwing = movementData.swordSwing;
        if (typeof movementData.pvpDying === 'boolean')     p.pvpDying = movementData.pvpDying;
        if (movementData.stats) p.stats = movementData.stats;
        socket.broadcast.emit('playerMoved', p);
    });

    socket.on('fireBullet', (bulletData) => {
        socket.broadcast.emit('bulletFired', { ...bulletData, playerId: socket.id });
    });

    socket.on('playerReady', () => {
        if (!players[socket.id]) return;
        if (!players[socket.id].playerName?.trim()) return;
        players[socket.id].isReady = true;
        io.emit('updateLobby', players);
        // Check if all connected players with names are ready
        const allPlayers = Object.values(players);
        const namedPlayers = allPlayers.filter(p => p.playerName?.trim());
        if (namedPlayers.length > 0 && namedPlayers.every(p => p.isReady)) {
            io.emit('allPlayersReady');
        }
    });

    socket.on('hostSelectMode', (data) => {
        if (!players[socket.id]?.isHost) return;
        const mode = data?.gameMode; // 'campaign' | 'endless'
        if (mode === 'campaign' || mode === 'endless') {
            io.emit('gameModeSelected', { gameMode: mode });
        }
    });

    socket.on('playerNameUpdate', (data) => {
        if (!players[socket.id]) return;
        const newName = (data.playerName || '').trim();
        players[socket.id].playerName = newName;
        io.emit('updateLobby', players);
        // Push the named player their career stats so the client can show
        // their level/XP and unlock the career modal data.
        if (newName) {
            emitCareerToSocket(socket.id, newName);
            broadcastPlayerLevels();
        }
    });

    socket.on('playerCharacterUpdate', (data) => {
        if (players[socket.id] && data && typeof data.character === 'string') {
            players[socket.id].character = data.character;
            io.emit('updateLobby', players);
        }
    });

    // A player clicked DEPLOY in the campaign cutscene char-select. They wait
    // here until every connected player has also clicked DEPLOY.
    socket.on('campaignReady', (data) => {
        if (!players[socket.id]) return;
        if (data && typeof data.character === 'string') {
            players[socket.id].character = data.character;
        }
        gameState.campaignReady.add(socket.id);
        checkCampaignAllReady();
    });

    socket.on('hostSelectMap', (data) => {
        if (!players[socket.id]?.isHost) return;
        if (typeof data.map === 'string') {
            selectedMap = data.map;
            io.emit('mapSelected', { map: selectedMap, hostId: socket.id });
        }
    });

    socket.on('hostSetInvincibility', (data) => {
        if (!players[socket.id]?.isHost) return;
        gameState.invincibility = !!data?.enabled;
        io.emit('invincibilityChanged', { enabled: gameState.invincibility });
    });

    socket.on('startMatch', (data) => {
        if (!players[socket.id]?.isHost) return;
        const startingWave = (typeof data?.startingWave === 'number' && data.startingWave > 1)
            ? Math.min(data.startingWave, CAMPAIGN_MAX_WAVE)
            : 1;
        const gameMode = (data?.gameMode === 'campaign') ? 'campaign' : 'endless';
        gameState.invincibility = !!data?.invincibility;
        currentMode = 'COOP';
        // Campaign: the host can pick any map+wave combo. Clamp the map index
        // into the valid range, then pin selectedMap to it.
        if (gameMode === 'campaign') {
            const rawIdx = Number(data?.startingMapIndex);
            const mapIdx = Number.isInteger(rawIdx) && rawIdx >= 0 && rawIdx < CAMPAIGN_MAP_ORDER.length
                ? rawIdx
                : 0;
            gameState.campaignMapIndex = mapIdx;
            selectedMap = CAMPAIGN_MAP_ORDER[mapIdx];
        }
        const playerCount = Object.keys(players).length;
        const effectiveMaxHP = Math.max(1, Math.round(P_MAX_HP / playerCount));
        Object.values(players).forEach(p => {
            p.isAlive = true;
            p.isDowned = false;
            p.isSpectating = false;
            p.isPaused = false;
            p.mode = 'COOP';
            p.pvpKills = 0;
            p.pvpSwordKills = 0;
            p.pvpWeaponIdx = 0;
            p.hp = effectiveMaxHP;
        });
        resetGameState('COOP', startingWave, gameMode, gameState.campaignMapIndex);
        // Pre-load map JSON so obstacle lookups during tickEnemies are synchronous.
        loadMapJson(selectedMap).catch(() => {});
        startGameLoop();
        // If this is a campaign match, the clients will show a cutscene before
        // deploying — start the ready count fresh.
        if (gameMode === 'campaign') resetCampaignReady();
        io.emit('matchStarted', {
            mode: 'COOP',
            map: selectedMap,
            gameMode,
            startingWave,
            campaignMapIndex: gameState.campaignMapIndex,
        });
        io.emit('invincibilityChanged', { enabled: gameState.invincibility });
        // Send initial wave state immediately so clients don't show "Wave 0".
        io.emit('syncWave', { wave: gameState.wave, state: gameState.waveState, tmr: gameState.waveTmr, gameMode });
        broadcastPauseState();
    });

    socket.on('startPvPMatch', () => {
        if (!players[socket.id]?.isHost) {
            socket.emit('matchStartError', { reason: 'Only the host can start the match.' });
            return;
        }
        const eligible = Object.values(players).filter(p => p.playerName && p.character);
        if (eligible.length < 2) {
            socket.emit('matchStartError', { reason: `Need at least 2 players with name and character selected (${eligible.length}/2 ready).` });
            return;
        }

        currentMode = 'PVP';
        const sortedIds = Object.keys(players).sort();
        const spawnAssignments = {};
        sortedIds.forEach((id, idx) => { spawnAssignments[id] = idx % PVP_CORNERS.length; });

        Object.values(players).forEach(p => {
            p.isAlive = true;
            p.isDowned = false;
            p.isSpectating = false;
            p.isPaused = false;
            p.mode = 'PVP';
            p.pvpKills = 0;
            p.pvpSwordKills = 0;
            p.pvpWeaponIdx = 0;
            p.weapon = 'pistol';
            p.hp = P_MAX_HP;
        });
        gameState.invincibility = false;
        resetGameState('PVP', 1);
        loadMapJson(selectedMap).catch(() => {});
        io.emit('matchStarted', { mode: 'PVP', map: selectedMap, spawnAssignments });
        io.emit('invincibilityChanged', { enabled: false });
        broadcastPauseState();
    });

    socket.on('startFFAMatch', (data) => {
        if (!players[socket.id]?.isHost) {
            socket.emit('matchStartError', { reason: 'Only the host can start the match.' });
            return;
        }
        if (Object.keys(players).length < 2) {
            socket.emit('matchStartError', { reason: 'Need at least 2 players to start Free For All.' });
            return;
        }

        const duration = (typeof data?.duration === 'number' && data.duration > 0) ? Math.min(data.duration, 1800) : 300;

        stopFFATimer();
        currentMode = 'FFA';
        const sortedIds = Object.keys(players).sort();
        const spawnAssignments = {};
        sortedIds.forEach((id, idx) => { spawnAssignments[id] = idx % PVP_CORNERS.length; });

        Object.values(players).forEach(p => {
            p.isAlive = true;
            p.isDowned = false;
            p.isSpectating = false;
            p.isPaused = false;
            p.mode = 'FFA';
            p.pvpKills = 0;
            p.pvpSwordKills = 0;
            p.pvpWeaponIdx = 0;
            p.ffaKills = 0;
            p.weapon = 'pistol';
            p.hp = P_MAX_HP;
        });
        gameState.invincibility = false;
        resetGameState('FFA', 1);
        loadMapJson(selectedMap).catch(() => {});
        io.emit('matchStarted', { mode: 'FFA', map: selectedMap, spawnAssignments, ffaDuration: duration });
        io.emit('invincibilityChanged', { enabled: false });
        broadcastPauseState();

        ffaTimeLeft = duration;
        ffaTimerInterval = setInterval(() => {
            ffaTimeLeft -= 1;
            io.emit('ffaTimeUpdate', { timeLeft: ffaTimeLeft });
            if (ffaTimeLeft <= 0) endFFAMatch();
        }, 1000);
    });

    // ── Ping / chat ───────────────────────────────────────────────────────────
    socket.on('clientPing', (sentAt) => {
        socket.emit('serverPong', sentAt);
    });

    socket.on('chatMessage', (data) => {
        if (!checkRateLimit(socket.id, 'chatMessage', 500)) return; // max 2 msgs/s
        const text = String(data?.text ?? '').slice(0, 120).trim();
        if (!text) return;
        const playerName = players[socket.id]?.playerName || 'Anonymous';
        // Send to everyone EXCEPT the sender — the sender already displays an
        // optimistic local echo, so server-broadcasting back would duplicate it.
        socket.broadcast.emit('chatMessage', { playerName, text });
    });

    // Client reports their bullet hit an enemy — server is now authoritative
    socket.on('bulletHit', (data) => {
        if (!checkRateLimit(socket.id, 'bulletHit', 40)) return; // max ~25/s
        if (gameState.mode !== 'COOP') return;
        const { enemyId, weapon } = data;
        let { damage } = data;
        if (!enemyId || typeof damage !== 'number' || damage <= 0) return;
        if (!WEAPON_ORDER.includes(weapon)) return; // reject unknown/forged weapon strings
        damage = Math.min(damage, 10000);           // clamp runaway values
        const enemy = gameState.enemies.find(e => e.id === enemyId);
        if (!enemy || enemy.hp <= 0) return;
        if (enemy.type === 'boss' && weapon !== 'sword' && weapon !== 'pistol' && weapon !== 'grapple' && weapon !== 'bazooka') return;
        if (enemy.type === 'boss' && weapon === 'sword') damage = Math.round(damage * 1.5);
        enemy.hp = Math.max(0, enemy.hp - damage);
        io.emit('enemyDamaged', { id: enemyId, damage });
        if (enemy.hp <= 0) killEnemy(enemy, socket.id);
    });

    socket.on('grappleEnemy', (data) => {
        if (gameState.mode !== 'COOP') return;
        const { enemyId, x, y, z, weapon } = data || {};
        if (!enemyId || typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return;
        if (!WEAPON_ORDER.includes(weapon)) return;
        const enemy = gameState.enemies.find((e) => e.id === enemyId);
        if (!enemy || enemy.hp <= 0) return;
        if (enemy.type === 'boss' && weapon !== 'sword' && weapon !== 'pistol' && weapon !== 'grapple' && weapon !== 'bazooka') return;
        enemy.x = Math.max(-HALF + 1, Math.min(HALF - 1, x));
        enemy.y = Math.max(0, y);
        enemy.z = Math.max(-HALF + 1, Math.min(HALF - 1, z));
        io.emit('enemyPulled', { id: enemyId, x: enemy.x, y: enemy.y, z: enemy.z });
    });

    // Weapon drop pickup
    socket.on('pickupWeaponDrop', (data) => {
        const idx = gameState.weaponDrops.findIndex(d => d.id === data.dropId);
        if (idx === -1) return;
        const drop = gameState.weaponDrops[idx];
        gameState.weaponDrops.splice(idx, 1);
        // Record the pickup against the player so a mid-match rejoin can
        // restore their full weapon loadout.
        const player = players[socket.id];
        if (player) {
            if (!Array.isArray(player.collectedWeapons)) player.collectedWeapons = ['pistol'];
            if (!player.collectedWeapons.includes(drop.weaponId)) player.collectedWeapons.push(drop.weaponId);
        }
        io.emit('weaponDropRemoved', { dropId: drop.id, playerId: socket.id, weaponId: drop.weaponId });
    });

    // Health pack pickup — server validates directly (no host relay)
    socket.on('pickupHealthPack', (data) => {
        const packIdx = gameState.healthPacks.findIndex(p => p.id === data.packId);
        if (packIdx === -1) return;
        const player = players[socket.id];
        if (!player || !player.isAlive || player.isDowned) return;
        gameState.healthPacks.splice(packIdx, 1);
        io.emit('healthPackRemoved', { packId: data.packId, playerId: socket.id });
    });

    // PvP grapple pull: shooter hooked a player — deal damage and pull them toward shooter
    socket.on('pvpGrapplePull', (data) => {
        if (currentMode !== 'PVP' && currentMode !== 'FFA') return;
        if (!data?.targetId) return;
        const target = players[data.targetId];
        if (!target || !target.isAlive || target.isDowned) return;
        const targetSocket = io.sockets.sockets.get(data.targetId);
        if (!targetSocket) return;
        const damage = Math.min(typeof data.damage === 'number' ? data.damage : 80, 500);
        targetSocket.emit('playerDamaged', {
            targetId: data.targetId,
            damage,
            shooterId: socket.id,
            weapon: 'grapple',
        });
        targetSocket.emit('pvpGrapplePull', {
            shooterX: typeof data.shooterX === 'number' ? data.shooterX : 0,
            shooterY: typeof data.shooterY === 'number' ? data.shooterY : 0,
            shooterZ: typeof data.shooterZ === 'number' ? data.shooterZ : 0,
        });
    });

    // PvP: shooter reports a hit; server validates and forwards damage + resolves kills
    socket.on('pvpDamage', (data) => {
        if (currentMode !== 'PVP' && currentMode !== 'FFA') return;
        if (!data?.targetId) return;
        const targetSocket = io.sockets.sockets.get(data.targetId);
        if (targetSocket) {
            targetSocket.emit('playerDamaged', {
                targetId: data.targetId,
                damage: data.damage,
                shooterId: socket.id,
                weapon: data.weapon || null,
            });
        }
    });

    function resolvePvPKill(shooterId, victimId, weaponUsed) {
        const shooter = players[shooterId];
        if (!shooter) return;

        // FFA: just track kills, no weapon progression
        if (currentMode === 'FFA') {
            shooter.ffaKills = (shooter.ffaKills || 0) + 1;
            io.emit('ffaKill', {
                shooterId, victimId, weapon: weaponUsed,
                standings: Object.fromEntries(Object.values(players).map(p => [p.playerId, {
                    ffaKills: p.ffaKills || 0,
                    playerName: p.playerName,
                    character: p.character,
                }])),
            });
            return;
        }

        shooter.pvpKills = (shooter.pvpKills || 0) + 1;
        if (weaponUsed === 'sword') shooter.pvpSwordKills = (shooter.pvpSwordKills || 0) + 1;
        const progression = computeWeaponForKills(shooter.pvpKills);
        shooter.pvpWeaponIdx = progression.idx;
        shooter.weapon = progression.weapon;

        io.emit('pvpKill', {
            shooterId, victimId, weapon: weaponUsed,
            standings: Object.fromEntries(Object.values(players).map(p => [p.playerId, {
                pvpKills: p.pvpKills || 0,
                pvpSwordKills: p.pvpSwordKills || 0,
                pvpWeaponIdx: p.pvpWeaponIdx || 0,
                playerName: p.playerName,
                character: p.character,
            }])),
        });

        const onGrapple = WEAPON_ORDER[shooter.pvpWeaponIdx] === 'grapple';
        if (onGrapple && weaponUsed === 'grapple') {
            currentMode = 'COOP';
            stopGameLoop();
            const pvpRankings = buildPvPRankings();
            recordPvpGame(pvpRankings);
            io.emit('pvpMatchOver', { winnerId: shooterId, rankings: pvpRankings });
            // Career stats: winner gets a win + bonus XP, everyone else just
            // logs the match.
            for (const [id, p] of Object.entries(players)) {
                const name = p?.playerName?.trim();
                if (!name) continue;
                recordCareerMatch(name, {
                    mode: 'PVP',
                    won: id === shooterId,
                    score: p.pvpKills || 0,
                });
                emitCareerToSocket(id, name);
            }
            clearMatchState();
        }
    }

    socket.on('reviveProgress', (data) => {
        const targetSocket = io.sockets.sockets.get(data.targetId);
        if (targetSocket) targetSocket.emit('reviveProgress', data);
    });

    socket.on('revivePlayer', (data) => {
        const targetSocket = io.sockets.sockets.get(data.targetId);
        if (!targetSocket || !players[data.targetId]) return;
        players[data.targetId].isAlive = true;
        players[data.targetId].isDowned = false;
        players[data.targetId].isSpectating = false;
        io.emit('playerRevived', { playerId: data.targetId });
        broadcastPauseState();
    });

    socket.on('playerDied', (data) => {
        const isPvP = (data?.mode === 'PVP') || currentMode === 'PVP';
        const isFFA = (data?.mode === 'FFA') || currentMode === 'FFA';
        const isCompetitive = isPvP || isFFA;
        if (players[socket.id]) {
            players[socket.id].isAlive = false;
            players[socket.id].isDowned = !isCompetitive;
            players[socket.id].isSpectating = false;
            players[socket.id].stats = data.stats || {};
            players[socket.id].score = data.stats?.score || 0;
            players[socket.id].kills = data.stats?.kills || 0;
            players[socket.id].dogKills = data.stats?.dogKills || 0;
            players[socket.id].bossKills = data.stats?.bossKills || 0;
            players[socket.id].totalKills = data.stats?.totalKills || data.stats?.kills || 0;
            players[socket.id].wave = data.stats?.wave || 0;
        }
        io.emit('playerDied', {
            playerId: socket.id,
            stats: data.stats,
            mode: isFFA ? 'FFA' : isPvP ? 'PVP' : 'COOP',
            killerId: data?.killerId || null,
        });
        broadcastPauseState();

        // Transfer this player's owned enemies to the next closest player.
        reassignEnemyOwnership();

        if (isCompetitive) {
            if (data?.killerId && players[data.killerId] && data.killerId !== socket.id) {
                const weaponUsed = data.killerWeapon || (isFFA ? 'pistol' : WEAPON_ORDER[players[data.killerId].pvpWeaponIdx || 0]);
                resolvePvPKill(data.killerId, socket.id, weaponUsed);
            }
            return;
        }

        // COOP game-over check
        const allDead = Object.values(players).every(p => !p.isAlive || p.isDowned);
        if (allDead && Object.keys(players).length > 0) {
            stopGameLoop();
            const rankings = Object.values(players)
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map((p, idx) => ({
                    rank: idx + 1,
                    playerId: p.playerId,
                    playerName: p.playerName || `Player ${p.playerId.slice(0, 6)}`,
                    score: p.score || 0,
                    kills: p.totalKills || p.kills || 0,
                    wave: p.wave || 0,
                    status: p.isSpectating ? 'SPECTATING' : p.isDowned ? 'DOWNED' : 'DEAD',
                }));
            recordCoopGame(rankings, gameState.wave);
            io.emit('globalGameOver', rankings);
            // Career stats: every connected player who was in the match
            // counts the match. Survivors get a "win"; everyone else loses.
            for (const [id, p] of Object.entries(players)) {
                const name = p?.playerName?.trim();
                if (!name) continue;
                const won = !!p.isAlive && !p.isDowned;
                recordCareerMatch(name, {
                    mode: 'COOP',
                    won,
                    wave: gameState.wave,
                    score: p.score || 0,
                    died: !won,
                });
                emitCareerToSocket(id, name);
            }
            clearMatchState();
        }
    });

    socket.on('playerSpectating', (data) => {
        if (!players[socket.id]) return;
        const p = players[socket.id];
        p.isAlive = false;
        p.isDowned = false;
        p.isSpectating = true;
        p.stats = data?.stats || p.stats;
        p.score = data?.stats?.score || p.score;
        p.kills = data?.stats?.kills || p.kills;
        p.dogKills = data?.stats?.dogKills || p.dogKills;
        p.bossKills = data?.stats?.bossKills || p.bossKills;
        p.totalKills = data?.stats?.totalKills || p.totalKills;
        p.wave = data?.stats?.wave || p.wave;
        io.emit('playerSpectating', { playerId: socket.id, stats: p.stats });
        broadcastPauseState();
    });

    socket.on('playerRevived', (data) => {
        if (players[socket.id]) {
            players[socket.id].isAlive = true;
            players[socket.id].isDowned = false;
            players[socket.id].isSpectating = false;
        }
        io.emit('playerRevived', { playerId: socket.id });
        broadcastPauseState();
    });

    // Reconnection: client sends a session token (UUID from localStorage).
    // This replaces the old name-based lookup and is unique per browser session.
    socket.on('rejoin', (data) => {
        const token = (data?.token || '').trim();
        if (!token) { socket.emit('rejoinFailed', { reason: 'no-token' }); return; }
        const saved = recentlyDisconnected[token];
        // Reject if no save exists, the match has ended, or the save belongs
        // to a previous match (matchEpoch mismatch).
        if (!saved || !gameState.mode || saved.matchEpoch !== gameState.matchEpoch) {
            socket.emit('rejoinFailed', { reason: 'expired' });
            return;
        }
        // Someone's coming back — cancel the orphan-cleanup timer and resume
        // the game/FFA loops if the world was frozen.
        cancelOrphanMatchCleanup();
        if (!gameState.tickInterval) startGameLoop();
        resumeFFATimerIfNeeded();
        delete recentlyDisconnected[token];
        // If the campaign advanced to a new map while this player was
        // disconnected, their saved (x,y,z) is invalid for the current map.
        // Snap to the origin so they don't spawn inside a wall.
        if (saved.mapAtDisconnect && saved.mapAtDisconnect !== gameState.map) {
            saved.x = 0; saved.y = 0; saved.z = 0; saved.rotation = 0;
        }
        // Preserve the isHost flag that the connection handler may have already
        // assigned (connection fires before rejoin, so if this socket was made
        // host it stays host).
        const alreadyHost = players[socket.id]?.isHost ?? false;
        players[socket.id] = {
            ...saved,
            playerId: socket.id,
            isHost: alreadyHost,
            isReady: false,
            sessionToken: token,
        };
        ensureHost();

        const restored = players[socket.id];
        socket.emit('stateRestored', {
            // Match context — needed to reconstruct the correct scene
            mode: gameState.mode,
            gameMode: gameState.gameMode,
            map: gameState.map,
            wave: gameState.wave || 0,
            ffaTimeLeft: ffaTimeLeft || 0,
            // Player state
            hp: restored.hp || P_MAX_HP,
            isAlive: restored.isAlive ?? true,
            isDowned: restored.isDowned ?? false,
            isSpectating: restored.isSpectating ?? false,
            isHost: restored.isHost ?? false,
            currentWeapon: restored.currentWeapon || saved.weapon || 'pistol',
            character: restored.character || null,
            playerName: restored.playerName || '',
            collectedWeapons: Array.isArray(restored.collectedWeapons) ? restored.collectedWeapons : ['pistol'],
            // Scores & kill counters
            score: restored.score || 0,
            kills: restored.kills || 0,
            dogKills: restored.dogKills || 0,
            bossKills: restored.bossKills || 0,
            totalKills: restored.totalKills || 0,
            pvpKills: restored.pvpKills || 0,
            pvpSwordKills: restored.pvpSwordKills || 0,
            pvpWeaponIdx: restored.pvpWeaponIdx || 0,
            ffaKills: restored.ffaKills || 0,
            // Position & facing
            x: restored.x || 0,
            y: restored.y || 0,
            z: restored.z || 0,
            rotation: restored.rotation || 0,
        });

        // Let other players see the rejoiner as a normal newPlayer so their
        // remote avatar reappears in the world.
        socket.broadcast.emit('newPlayer', restored);
        io.emit('updateLobby', players);

        // If teammates are blocked on a campaign cutscene deploy and this
        // player has already past it (they're rejoining straight into the
        // map), count them as ready so the others aren't stuck waiting.
        if (gameState.gameMode === 'campaign' && gameState.campaignReady.size > 0) {
            gameState.campaignReady.add(socket.id);
            checkCampaignAllReady();
        }
    });

    // Client registers their session token immediately after connecting.
    socket.on('registerToken', (data) => {
        if (players[socket.id] && data?.token) {
            players[socket.id].sessionToken = data.token;
        }
    });

    // Client submits room password (non-host must do this before being allowed in lobby).
    socket.on('submitPassword', (data) => {
        if (!roomPassword) { socket.emit('passwordResult', { ok: true }); return; }
        const ok = (data?.password || '').trim() === roomPassword;
        socket.emit('passwordResult', { ok });
        if (!ok) {
            socket.emit('serverMessage', { text: 'Wrong room password. Disconnecting.', level: 'error' });
            setTimeout(() => socket.disconnect(true), 1500);
        }
    });

    // Host can set or clear the room password.
    socket.on('hostSetPassword', (data) => {
        if (!players[socket.id]?.isHost) return;
        const pw = (data?.password || '').trim();
        roomPassword = pw.length > 0 ? pw : null;
        broadcastRoomInfo();
    });

    // Host relays prop destruction to all other clients.
    socket.on('propDestroyed', (data) => {
        if (!players[socket.id]?.isHost || !data?.propId) return;
        socket.broadcast.emit('propDestroyed', data);
    });

    // Client notifies server when the local player pauses or resumes.
    socket.on('playerPaused', (data) => {
        if (players[socket.id]) players[socket.id].isPaused = !!data.paused;
        broadcastPauseState();
    });

    // ── Distributed enemy ownership ──────────────────────────────────────────
    // The owning client runs Three.js AI for its assigned enemies and sends
    // position/rotation updates here. Server updates its state so ownership
    // reassignment has accurate positions.
    socket.on('ownedEnemiesSync', (updates) => {
        if (!players[socket.id]?.isHost) return;
        if (!Array.isArray(updates)) return;
        for (const u of updates) {
            const enemy = gameState.enemies.find(e => e.id === u.id);
            if (!enemy) continue;
            if (typeof u.x === 'number') enemy.x = u.x;
            if (typeof u.y === 'number') enemy.y = u.y;
            if (typeof u.z === 'number') enemy.z = u.z;
            if (typeof u.rot === 'number') enemy.rot = u.rot;
            if (typeof u.walkT === 'number') enemy.walkT = u.walkT;
        }
    });

    // Owner client reports a melee attempt; target client validates and applies it locally.
    socket.on('enemyMeleeAttempt', (data) => {
        if (!checkRateLimit(socket.id, 'enemyMelee', 120)) return; // max ~8/s
        if (!data || !data.enemyId || !data.targetId) return;
        const enemy = gameState.enemies.find(e => e.id === data.enemyId);
        if (!enemy) return;
        const target = players[data.targetId];
        if (!target || !target.isAlive || target.isDowned) return;
        const targetSocket = io.sockets.sockets.get(data.targetId);
        if (!targetSocket) return;
        targetSocket.emit('enemyMeleeAttempt', {
            enemyId: data.enemyId,
            enemyType: enemy.type,
            targetId: data.targetId,
            damage: data.damage,
            ex: typeof data.ex === 'number' ? data.ex : enemy.x,
            ey: typeof data.ey === 'number' ? data.ey : enemy.y,
            ez: typeof data.ez === 'number' ? data.ez : enemy.z,
            knockbackX: data.knockbackX || 0,
            knockbackZ: data.knockbackZ || 0,
        });
    });

    // Owner client reports that an enemy bullet hit a remote player.
    socket.on('enemyHitRemotePlayer', (data) => {
        if (!data || !data.targetId) return;
        const target = players[data.targetId];
        if (!target || !target.isAlive || target.isDowned) return;
        applyEnemyDamage(data.targetId, data.damage || 25, null);
    });

    // Owner client fires an enemy bullet — relay visually to all other clients.
    socket.on('ownerEnemyFired', (data) => {
        if (!data || !data.enemyId) return;
        const enemy = gameState.enemies.find(e => e.id === data.enemyId);
        if (!players[socket.id]?.isHost) return;
        socket.broadcast.emit('enemyBulletFired', data);
    });
});

http.listen(PORT, () => { console.log(`Server running on http://localhost:${PORT}`); });
