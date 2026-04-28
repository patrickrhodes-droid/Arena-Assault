const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const os = require('os');

const PORT = 3001;
const publicDir = path.join(__dirname, 'public');

// ── Network utilities ─────────────────────────────────────────────────────────

function normalizeIpAddress(address) {
    if (!address) return '';
    if (address.startsWith('::ffff:')) return address.slice(7);
    if (address === '::1') return '127.0.0.1';
    return address;
}

function getServerIpv4Addresses() {
    const interfaces = os.networkInterfaces();
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
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/arenatest.html', (req, res) => res.redirect('/'));

// ── PvP constants ─────────────────────────────────────────────────────────────

const PVP_WIN_KILLS = 13;
const PVP_KILLS_PER_WEAPON = 2;
const PVP_SWORD_KILLS_TO_WIN = 5;
const WEAPON_ORDER = ['pistol', 'assault', 'shotgun', 'sniper', 'sword'];
const PVP_CORNERS = [[-60, -60], [60, -60], [-60, 60], [60, 60]];

// ── Game simulation constants ─────────────────────────────────────────────────

const HALF = 72;
const ARENA_SIZE = 144;
const P_MAX_HP = 1000;
const B_SPD_E = 28;                                           // enemy bullet speed
const BOSS_ESCAPE_GRAV = 180;
const BOSS_ESCAPE_HEIGHT = 50 / 6;
const BOSS_ESCAPE_JUMP_VEL = Math.sqrt(2 * BOSS_ESCAPE_GRAV * BOSS_ESCAPE_HEIGHT); // ≈54.8
const BOSS_ESCAPE_FWD_SPD = 14;
const BOSS_ATTACK_REACH = 7.8;
const BOSS_ATTACK_FREQ = 1.1;
const BOSS_WINDUP = 0.2;
const BOSS_SWING = 0.22;
const MAX_LIVE_ENEMIES = 60;

// ── Per-map obstacle AABBs (used for enemy collision and LOS checks) ──────────
// Only solid, large structures are listed — small crates are omitted for perf.
// Format: { min: {x, z}, max: {x, z} }  (ground-plane only; y ignored server-side)

const MAP_OBSTACLES = {
    arena: [
        // North bunker
        { min:{x:-6.2,z:-54.5}, max:{x:-5.8,z:-45.5} },
        { min:{x: 5.8,z:-54.5}, max:{x: 6.2,z:-45.5} },
        { min:{x:-6.0,z:-54.2}, max:{x: 6.0,z:-53.8} },
        // South bunker
        { min:{x:-6.2,z: 45.5}, max:{x:-5.8,z: 54.5} },
        { min:{x: 5.8,z: 45.5}, max:{x: 6.2,z: 54.5} },
        { min:{x:-6.0,z: 53.8}, max:{x: 6.0,z: 54.2} },
        // East / West towers
        { min:{x: 47.75,z:-2.25}, max:{x: 52.25,z: 2.25} },
        { min:{x:-52.25,z:-2.25}, max:{x:-47.75,z: 2.25} },
        // Corner sniper perches
        { min:{x: 55.5,z:-60.5}, max:{x: 60.5,z:-55.5} },
        { min:{x:-60.5,z: 55.5}, max:{x:-55.5,z: 60.5} },
        { min:{x: 55.5,z: 55.5}, max:{x: 60.5,z: 60.5} },
        { min:{x:-60.5,z:-60.5}, max:{x:-55.5,z:-55.5} },
    ],
    dustbowl: [
        // Central archway pillars
        { min:{x:-7.25,z:-1.25}, max:{x:-4.75,z:1.25} },
        { min:{x: 4.75,z:-1.25}, max:{x: 7.25,z:1.25} },
        // North oasis compound walls
        { min:{x:-8.3,z:-52}, max:{x:-7.7,z:-40} },
        { min:{x: 7.7,z:-52}, max:{x: 8.3,z:-40} },
        { min:{x:-9.0,z:-52.3},max:{x: 9.0,z:-51.7} },
        // South oasis compound walls
        { min:{x:-8.3,z: 40}, max:{x:-7.7,z: 52} },
        { min:{x: 7.7,z: 40}, max:{x: 8.3,z: 52} },
        { min:{x:-9.0,z: 51.7},max:{x: 9.0,z: 52.3} },
        // Stone pillar clusters
        { min:{x:-39.5,z: 8.5}, max:{x:-36.5,z:11.5} },
        { min:{x:-43.0,z:13.0}, max:{x:-41.0,z:15.0} },
        { min:{x: 36.5,z:-11.5},max:{x: 39.5,z:-8.5} },
        { min:{x: 41.0,z:-15.0},max:{x: 43.0,z:-13.0} },
        { min:{x: 10.5,z: 36.5},max:{x: 13.5,z: 39.5} },
        { min:{x:-13.5,z:-39.5},max:{x:-10.5,z:-36.5} },
        // Stepped pyramid bases
        { min:{x: 46,z:-54}, max:{x:54,z:-46} },
        { min:{x:-54,z: 46}, max:{x:-46,z: 54} },
    ],
    downtown: [
        // Four large corner buildings
        { min:{x:-46,z:-46}, max:{x:-30,z:-30} },
        { min:{x: 30,z:-46}, max:{x: 46,z:-30} },
        { min:{x:-46,z: 30}, max:{x:-30,z: 46} },
        { min:{x: 30,z: 30}, max:{x: 46,z: 46} },
        // Central plaza
        { min:{x:-4,z:-4}, max:{x:4,z:4} },
        // Dumpsters
        { min:{x:-21,z:-10.25},max:{x:-19,z:-5.75} },
        { min:{x: 19,z:  5.75},max:{x: 21,z:10.25} },
        { min:{x:  5.25,z:-21},max:{x:10.75,z:-19} },
        { min:{x:-10.75,z: 19},max:{x:-5.25,z: 21} },
    ],
};

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

// ── Player registry ───────────────────────────────────────────────────────────

let players = {};
let currentMode = 'COOP';
let selectedMap = 'arena';

// Temporarily stores state for players who disconnected mid-game so they can
// rejoin and pick up where they left off (cleared after 30 s).
const recentlyDisconnected = {};

function getAlivePlayers() {
    return Object.values(players).filter(p => p.isAlive && !p.isDowned && !p.isSpectating);
}

// ── Server-side game state ────────────────────────────────────────────────────

const gameState = {
    mode: null,
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
    tickInterval: null,
};

function resetGameState(mode, startingWave) {
    stopGameLoop();
    gameState.mode = mode;
    gameState.wave = startingWave > 1 ? startingWave - 1 : 0;
    gameState.waveState = 'WAIT';
    gameState.waveTmr = startingWave > 1 ? 0.1 : 3;
    gameState.enemiesToSpawn = 0;
    gameState.skeletonGroupsToSpawn = 0;
    gameState.spawnTmr = 0;
    gameState.enemies = [];
    gameState.healthPacks = [];
    gameState.nextEnemyId = 1;
    gameState.nextPackId = 1;
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

function pickSpawnPos(minDistFromPlayer, extraCheck) {
    const alive = getAlivePlayers();
    for (let attempt = 0; attempt < 30; attempt++) {
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
        if (!tooCloseToPlayer && !tooCloseToEnemy && (!extraCheck || extraCheck(sx, sz))) return [sx, sz];
    }
    // Fallback: any edge position
    const offset = (Math.random() - 0.5) * (ARENA_SIZE - 6);
    return [HALF - 1, offset];
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

function spawnEnemy() {
    if (gameState.enemies.length >= MAX_LIVE_ENEMIES) return;
    const [cx, cz] = pickSpawnPos(15);
    const dogChance = gameState.wave >= 3 ? Math.min(0.55, 0.12 + (gameState.wave - 3) * 0.12) : 0;
    if (Math.random() < dogChance) {
        // Dogs spawn individually
        const dog = makeDog(cx, cz);
        dog.ownerId = getClosestPlayerId(cx, cz) || Object.keys(players)[0] || null;
        gameState.enemies.push(dog);
        emitEnemySpawned(dog);
    } else {
        // Skeletons spawn in groups of 2 or 3, clamped to arena bounds
        const count = 2;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const ex = Math.max(-(HALF - 2), Math.min(HALF - 2, cx + Math.cos(angle) * 2.0));
            const ez = Math.max(-(HALF - 2), Math.min(HALF - 2, cz + Math.sin(angle) * 2.0));
            const e = makeSkeleton(ex, ez);
            e.ownerId = getClosestPlayerId(ex, ez) || Object.keys(players)[0] || null;
            gameState.enemies.push(e);
            emitEnemySpawned(e);
        }
    }
}

function spawnSkeletonGroup() {
    // From wave 6+, spawns a single soldier individually.
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
    gameState.waveState = 'WAIT';
    gameState.waveTmr = 2.5;
    io.emit('syncWave', { wave: gameState.wave, state: 'WAIT', tmr: 2.5 });
}

function tickWave(dt) {
    if (gameState.mode !== 'COOP') return;

    if (gameState.waveState === 'WAIT') {
        gameState.waveTmr -= dt;
        if (gameState.waveTmr > 0) return;

        gameState.wave += 1;
        reviveAllPlayers();

        if (gameState.wave % 5 === 0) {
            spawnBoss();
            gameState.waveState = 'ACTIVE';
        } else {
            gameState.enemiesToSpawn = Math.min(1 + gameState.wave, 12);
            gameState.skeletonGroupsToSpawn = gameState.wave >= 6 ? 2 : 0;
            gameState.spawnTmr = 0;
            gameState.waveState = 'SPAWNING';
        }
        io.emit('syncWave', { wave: gameState.wave, state: gameState.waveState, tmr: gameState.waveTmr });

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
            io.emit('syncWave', { wave: gameState.wave, state: 'ACTIVE', tmr: 0 });
        }

    } else if (gameState.waveState === 'ACTIVE') {
        if (gameState.enemies.length === 0) finishWave();
    }
}

// ── Enemy damage + kill ───────────────────────────────────────────────────────

function applyEnemyDamage(targetId, damage, enemyId, knockbackX = 0, knockbackZ = 0) {
    const player = players[targetId];
    if (!player || !player.isAlive || player.isDowned) return;
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
        targetSocket.emit('playerDamaged', { targetId, damage, shooterId: enemyId, knockbackX, knockbackZ });
    }
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
    }

    // 10% health pack drop
    if (Math.random() < 0.1) spawnHealthPack(enemy.x, enemy.z);

    // Tell all clients the enemy is gone (visual death)
    io.emit('enemyKilled', { id: enemy.id, type: enemy.type, x: enemy.x, z: enemy.z });
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
    const obstacles = MAP_OBSTACLES[selectedMap] || [];

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
            // Kite: advance if > 14, retreat if < 7
            const moveSpd = targetDist > 14 ? enemy.spd : targetDist < 7 ? -enemy.spd * 0.4 : 0;
            enemy.x = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.x + ndx * moveSpd * dt));
            enemy.z = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.z + ndz * moveSpd * dt));
            resolveEnemyObstacles(enemy, obstacles);
            enemy.walkT += dt * 8;

            if (targetDist < 50) {
                enemy.fireTmr -= dt;
                if (enemy.fireTmr <= 0) {
                    // Only fire if there is clear line of sight to the target
                    const canSee = hasLineOfSight(enemy.x, enemy.z, target.x, target.z, obstacles);
                    if (canSee) {
                        enemy.fireTmr = enemy.fireInt;
                        const spreadH = (Math.random() - 0.5) * 0.24;
                        const [bnx, bnz] = norm2(ndx + spreadH, ndz + spreadH);
                        const verticalDir = targetDist > 0 ? ((target.y + 1.2) - (enemy.y + 1.2)) / targetDist : 0;
                        io.emit('enemyBulletFired', {
                            enemyId: enemy.id,
                            x: enemy.x + ndx * 0.6, y: enemy.y + 1.2, z: enemy.z + ndz * 0.6,
                            dx: bnx, dy: verticalDir, dz: bnz,
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
            enemy.x = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.x + ndx * enemy.spd * dt));
            enemy.z = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.z + ndz * enemy.spd * dt));
            resolveEnemyObstacles(enemy, obstacles);
            enemy.walkT += dt * 12;
            enemy.atkTmr -= dt;
            if (targetDist < 2.5 && enemy.atkTmr <= 0) {
                enemy.atkTmr = 1.0;
                applyEnemyDamage(target.playerId, enemy.atkDmg, enemy.id);
            }
            if (targetDist >= 2.5) enemy.atkTmr = Math.min(enemy.atkTmr, 0.3);

        } else if (enemy.type === 'skeleton') {
            enemy.x = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.x + ndx * enemy.spd * dt));
            enemy.z = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.z + ndz * enemy.spd * dt));
            resolveEnemyObstacles(enemy, obstacles);
            enemy.walkT += dt * 12;
            enemy.atkTmr -= dt;
            if (targetDist < 2.0 && enemy.atkTmr <= 0) {
                enemy.atkTmr = 0.8;
                applyEnemyDamage(target.playerId, enemy.atkDmg, enemy.id);
            }
            if (targetDist >= 2.0) enemy.atkTmr = Math.min(enemy.atkTmr, 0.3);

        } else if (enemy.type === 'boss') {
            enemy.x = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.x + ndx * enemy.spd * dt));
            enemy.z = Math.max(-(HALF - 1), Math.min(HALF - 1, enemy.z + ndz * enemy.spd * dt));
            resolveEnemyObstacles(enemy, obstacles);
            enemy.walkT += dt * 6;

            // Windup → swing attack sequence
            if (enemy.windupTmr > 0) {
                enemy.windupTmr -= dt;
                if (enemy.windupTmr <= 0) enemy.swingTmr = BOSS_SWING;
            } else if (enemy.swingTmr > 0) {
                const prevSwing = enemy.swingTmr;
                enemy.swingTmr -= dt;
                // Damage fires when swing timer crosses the 0.09 threshold
                if (prevSwing > 0.09 && enemy.swingTmr <= 0.09 && targetDist < BOSS_ATTACK_REACH) {
                    applyEnemyDamage(target.playerId, enemy.atkDmg, enemy.id);
                }
                if (enemy.swingTmr <= 0) enemy.swingTmr = 0;
            } else {
                // Ready: check attack cooldown
                enemy.atkTmr -= dt;
                if (enemy.atkTmr <= 0 && targetDist < BOSS_ATTACK_REACH) {
                    enemy.atkTmr = BOSS_ATTACK_FREQ;
                    enemy.windupTmr = BOSS_WINDUP;
                }
            }

            // Escape jump when cornered by 2+ players
            const now = Date.now();
            if (!enemy.escaping && enemy.y === 0
                && alive.filter(p => dist2(enemy.x, enemy.z, p.x, p.z) < 6).length >= 2
                && now - enemy.lastEscapeTime > 8000) {
                const [efx, efz] = norm2(-ndx, -ndz);
                enemy.escapeFwdX = efx;
                enemy.escapeFwdZ = efz;
                enemy.velY = BOSS_ESCAPE_JUMP_VEL;
                enemy.escaping = true;
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
        const alivePlayers = getAlivePlayers();
        const allPaused = alivePlayers.length > 0 && alivePlayers.every(p => p.isPaused);
        if (!allPaused) {
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

// ── Socket connections ────────────────────────────────────────────────────────

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    const isFirst = Object.keys(players).length === 0;
    const connectionInfo = createConnectionInfo(socket.handshake.address);

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

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Preserve state briefly so the player can rejoin mid-game.
        const leaving = players[socket.id];
        if (leaving?.playerName && gameState.mode) {
            recentlyDisconnected[leaving.playerName] = {
                ...leaving, savedAt: Date.now(),
            };
            setTimeout(() => { delete recentlyDisconnected[leaving.playerName]; }, 30000);
        }
        delete players[socket.id];
        if (Object.keys(players).length === 0) {
            stopGameLoop();
        } else {
            const newHostId = Object.keys(players)[0];
            players[newHostId].isHost = true;
            io.emit('newHost', newHostId);
            reassignEnemyOwnership(); // hand off any enemies owned by the leaver
        }
        io.emit('updateLobby', players);
        io.emit('playerDisconnected', socket.id);
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
    });

    socket.on('playerNameUpdate', (data) => {
        if (players[socket.id]) {
            players[socket.id].playerName = (data.playerName || '').trim();
            io.emit('updateLobby', players);
        }
    });

    socket.on('playerCharacterUpdate', (data) => {
        if (players[socket.id] && data && typeof data.character === 'string') {
            players[socket.id].character = data.character;
            io.emit('updateLobby', players);
        }
    });

    socket.on('hostSelectMap', (data) => {
        if (!players[socket.id]?.isHost) return;
        if (typeof data.map === 'string') {
            selectedMap = data.map;
            io.emit('mapSelected', { map: selectedMap, hostId: socket.id });
        }
    });

    socket.on('startMatch', (data) => {
        if (!players[socket.id]?.isHost) return;
        const startingWave = (typeof data?.startingWave === 'number' && data.startingWave > 1)
            ? data.startingWave : 1;
        currentMode = 'COOP';
        const playerCount = Object.keys(players).length;
        const effectiveMaxHP = Math.max(1, Math.round(P_MAX_HP / playerCount));
        Object.values(players).forEach(p => {
            p.isAlive = true;
            p.isDowned = false;
            p.isSpectating = false;
            p.mode = 'COOP';
            p.pvpKills = 0;
            p.pvpSwordKills = 0;
            p.pvpWeaponIdx = 0;
            p.hp = effectiveMaxHP;
        });
        resetGameState('COOP', startingWave);
        startGameLoop();
        io.emit('matchStarted', { mode: 'COOP', map: selectedMap });
        // Send initial wave state immediately so clients don't show "Wave 0".
        io.emit('syncWave', { wave: gameState.wave, state: gameState.waveState, tmr: gameState.waveTmr });
    });

    socket.on('startPvPMatch', () => {
        if (!players[socket.id]?.isHost) return;
        const eligible = Object.values(players).filter(p => p.playerName && p.character);
        if (eligible.length < 2) return;

        currentMode = 'PVP';
        const sortedIds = Object.keys(players).sort();
        const spawnAssignments = {};
        sortedIds.forEach((id, idx) => { spawnAssignments[id] = idx % PVP_CORNERS.length; });

        Object.values(players).forEach(p => {
            p.isAlive = true;
            p.isDowned = false;
            p.isSpectating = false;
            p.mode = 'PVP';
            p.pvpKills = 0;
            p.pvpSwordKills = 0;
            p.pvpWeaponIdx = 0;
            p.weapon = 'pistol';
            p.hp = P_MAX_HP;
        });
        resetGameState('PVP', 1); // clears any leftover COOP state
        io.emit('matchStarted', { mode: 'PVP', map: selectedMap, spawnAssignments });
    });

    // Client reports their bullet hit an enemy — server is now authoritative
    socket.on('bulletHit', (data) => {
        if (gameState.mode !== 'COOP') return;
        const { enemyId, weapon } = data;
        let { damage } = data;
        if (!enemyId || typeof damage !== 'number' || damage <= 0) return;
        if (!WEAPON_ORDER.includes(weapon)) return; // reject unknown/forged weapon strings
        damage = Math.min(damage, 10000);           // clamp runaway values
        const enemy = gameState.enemies.find(e => e.id === enemyId);
        if (!enemy || enemy.hp <= 0) return;
        if (enemy.type === 'boss' && weapon !== 'sword' && weapon !== 'pistol') return;
        enemy.hp = Math.max(0, enemy.hp - damage);
        io.emit('enemyDamaged', { id: enemyId, damage });
        if (enemy.hp <= 0) killEnemy(enemy, socket.id);
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

    // PvP: shooter reports a hit; server validates and forwards damage + resolves kills
    socket.on('pvpDamage', (data) => {
        if (currentMode !== 'PVP' || !data?.targetId) return;
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

        if (shooter.pvpKills >= PVP_WIN_KILLS && shooter.pvpSwordKills >= PVP_SWORD_KILLS_TO_WIN) {
            currentMode = 'COOP';
            stopGameLoop();
            io.emit('pvpMatchOver', { winnerId: shooterId, rankings: buildPvPRankings() });
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
    });

    socket.on('playerDied', (data) => {
        const isPvP = (data?.mode === 'PVP') || currentMode === 'PVP';
        if (players[socket.id]) {
            players[socket.id].isAlive = false;
            players[socket.id].isDowned = !isPvP;
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
            mode: isPvP ? 'PVP' : 'COOP',
            killerId: data?.killerId || null,
        });

        // Transfer this player's owned enemies to the next closest player.
        reassignEnemyOwnership();

        if (isPvP) {
            if (data?.killerId && players[data.killerId] && data.killerId !== socket.id) {
                const weaponUsed = data.killerWeapon || WEAPON_ORDER[players[data.killerId].pvpWeaponIdx || 0];
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
            io.emit('globalGameOver', rankings);
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
    });

    socket.on('playerRevived', (data) => {
        if (players[socket.id]) {
            players[socket.id].isAlive = true;
            players[socket.id].isDowned = false;
            players[socket.id].isSpectating = false;
        }
        io.emit('playerRevived', { playerId: socket.id });
    });

    // Reconnection: client sends their name so we can restore their mid-game state.
    socket.on('rejoin', (data) => {
        const name = (data?.playerName || '').trim();
        const saved = recentlyDisconnected[name];
        if (!saved || Date.now() - saved.savedAt > 30000) return;
        delete recentlyDisconnected[name];
        players[socket.id] = { ...saved, playerId: socket.id, isHost: false, isReady: false };
        socket.emit('stateRestored', {
            wave: saved.wave || 0,
            hp: saved.hp || P_MAX_HP,
            isAlive: saved.isAlive ?? true,
            isDowned: saved.isDowned ?? false,
            currentWeapon: saved.currentWeapon || 'pistol',
            character: saved.character || null,
        });
        io.emit('updateLobby', players);
    });

    // Client notifies server when the local player pauses or resumes.
    socket.on('playerPaused', (data) => {
        if (players[socket.id]) players[socket.id].isPaused = !!data.paused;
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

    // Owner client reports that one of its enemies hit a player in melee.
    socket.on('enemyMeleeHit', (data) => {
        if (!data || !data.enemyId || !data.targetId) return;
        const enemy = gameState.enemies.find(e => e.id === data.enemyId);
        if (!enemy) return;
        const target = players[data.targetId];
        if (!target || !target.isAlive || target.isDowned) return;
        // Sanity check: use the client-reported enemy position (ex/ez) rather than
        // the server's stored position, which may be up to 50 ms stale.
        const reach = enemy.type === 'boss' ? 12 : 6;
        const ex = typeof data.ex === 'number' ? data.ex : enemy.x;
        const ez = typeof data.ez === 'number' ? data.ez : enemy.z;
        const dx = ex - target.x, dz = ez - target.z;
        if (dx * dx + dz * dz > reach * reach) return;
        applyEnemyDamage(data.targetId, data.damage, data.enemyId, data.knockbackX || 0, data.knockbackZ || 0);
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
