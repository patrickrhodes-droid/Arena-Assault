const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const os = require('os');

const PORT = 3001;

const publicDir = path.join(__dirname, 'public');

function normalizeIpAddress(address) {
    if (!address) {
        return '';
    }

    if (address.startsWith('::ffff:')) {
        return address.slice(7);
    }

    if (address === '::1') {
        return '127.0.0.1';
    }

    return address;
}

function getServerIpv4Addresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    Object.values(interfaces).forEach((entries) => {
        (entries || []).forEach((entry) => {
            const family = typeof entry.family === 'string' ? entry.family : String(entry.family);
            if (family !== 'IPv4' || entry.internal) {
                return;
            }
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

    return {
        clientIp: normalizedAddress,
        isServerPc,
        joinLink: `http://${preferredHost}:${PORT}`,
        serverIps,
    };
}

app.use(express.static(publicDir));

app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/arenatest.html', (req, res) => {
    res.redirect('/');
});

let players = {};
let currentWave = 0;
let currentMode = 'COOP';
let selectedMap = 'arena';

const { PVP_WIN_KILLS, PVP_KILLS_PER_WEAPON, PVP_SWORD_KILLS_TO_WIN, WEAPON_ORDER, PVP_CORNERS } = require('./public/shared-constants.json');

// Temporarily disconnected players (keyed by playerName) — expires after 30 s.
const disconnectedPlayers = {};

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

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    const isFirst = Object.keys(players).length === 0;
    const connectionInfo = createConnectionInfo(socket.handshake.address);

    players[socket.id] = {
        rotation: 0,
        x: 0, y: 0, z: 0,
        playerId: socket.id,
        weapon: 'assault',
        isReady: false,
        isHost: isFirst,
        isAlive: false,
        isDowned: false,
        isSpectating: false,
        playerName: '',   // Empty until player types a name
        character: null,
        mode: 'COOP',
        pvpKills: 0,
        pvpSwordKills: 0,
        pvpWeaponIdx: 0,
        score: 0,
        kills: 0,
        dogKills: 0,
        bossKills: 0,
        totalKills: 0,
        wave: 0,
        stats: {}
    };

    socket.emit('serverInfo', connectionInfo);
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);
    io.emit('updateLobby', players);

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const player = players[socket.id];
        if (player && player.playerName && (currentMode === 'COOP' || currentMode === 'PVP')) {
            // Cache state so the player can rejoin without losing progress.
            const name = player.playerName;
            if (disconnectedPlayers[name]) clearTimeout(disconnectedPlayers[name].timer);
            disconnectedPlayers[name] = {
                state: { ...player },
                timer: setTimeout(() => { delete disconnectedPlayers[name]; }, 30000),
            };
        }
        delete players[socket.id];
        if (Object.keys(players).length > 0) {
            const newHostId = Object.keys(players)[0];
            players[newHostId].isHost = true;
            io.emit('newHost', newHostId);
        }
        io.emit('updateLobby', players);
        io.emit('playerDisconnected', socket.id);
    });

    socket.on('requestRejoin', (data) => {
        const name = (data?.playerName || '').trim();
        const entry = name && disconnectedPlayers[name];
        if (!entry) {
            socket.emit('rejoinResult', { success: false });
            return;
        }
        clearTimeout(entry.timer);
        delete disconnectedPlayers[name];

        // Merge saved state into the new socket's player, preserving new host assignment.
        if (players[socket.id]) {
            const currentIsHost = players[socket.id].isHost;
            Object.assign(players[socket.id], entry.state, {
                playerId: socket.id,
                isHost: currentIsHost || entry.state.isHost,
            });
        }
        socket.emit('rejoinResult', { success: true, state: players[socket.id], mode: currentMode, wave: currentWave });
        io.emit('updateLobby', players);
        console.log(`Player "${name}" rejoined as ${socket.id}`);
    });

    socket.on('playerMovement', (movementData) => {
        if (!players[socket.id]) return;
        players[socket.id].x = movementData.x;
        players[socket.id].y = movementData.y;
        players[socket.id].z = movementData.z;
        players[socket.id].rotation = movementData.rotation;
        if (typeof movementData.score === 'number') players[socket.id].score = movementData.score;
        if (typeof movementData.kills === 'number') players[socket.id].kills = movementData.kills;
        if (typeof movementData.dogKills === 'number') players[socket.id].dogKills = movementData.dogKills;
        if (typeof movementData.bossKills === 'number') players[socket.id].bossKills = movementData.bossKills;
        if (typeof movementData.totalKills === 'number') players[socket.id].totalKills = movementData.totalKills;
        if (typeof movementData.hp === 'number') players[socket.id].hp = movementData.hp;
        if (typeof movementData.wave === 'number') players[socket.id].wave = movementData.wave;
        if (typeof movementData.isAlive === 'boolean') players[socket.id].isAlive = movementData.isAlive;
        if (typeof movementData.isDowned === 'boolean') players[socket.id].isDowned = movementData.isDowned;
        if (typeof movementData.isSpectating === 'boolean') players[socket.id].isSpectating = movementData.isSpectating;
        if (typeof movementData.isCrouching === 'boolean') players[socket.id].isCrouching = movementData.isCrouching;
        if (typeof movementData.isSprinting === 'boolean') players[socket.id].isSprinting = movementData.isSprinting;
        if (typeof movementData.currentWeapon === 'string') players[socket.id].currentWeapon = movementData.currentWeapon;
        if (typeof movementData.swordSwing === 'number') players[socket.id].swordSwing = movementData.swordSwing;
        if (typeof movementData.pvpDying === 'boolean') players[socket.id].pvpDying = movementData.pvpDying;
        if (movementData.stats) players[socket.id].stats = movementData.stats;
        socket.broadcast.emit('playerMoved', players[socket.id]);
    });

    socket.on('fireBullet', (bulletData) => {
        socket.broadcast.emit('bulletFired', { ...bulletData, playerId: socket.id });
    });

    socket.on('playerReady', () => {
        if (players[socket.id]) {
            // Only allow ready if player has entered a name
            if (!players[socket.id].playerName || !players[socket.id].playerName.trim()) return;
            players[socket.id].isReady = true;
            io.emit('updateLobby', players);
        }
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
        if (!players[socket.id] || !players[socket.id].isHost) return;
        if (typeof data.map === 'string') {
            selectedMap = data.map;
            io.emit('mapSelected', { map: selectedMap, hostId: socket.id });
        }
    });

    socket.on('startMatch', () => {
        if (players[socket.id] && players[socket.id].isHost) {
            currentWave = 0;
            currentMode = 'COOP';
            Object.values(players).forEach(p => {
                p.isAlive = true;
                p.isDowned = false;
                p.isSpectating = false;
                p.mode = 'COOP';
                p.pvpKills = 0;
                p.pvpSwordKills = 0;
                p.pvpWeaponIdx = 0;
            });
            io.emit('matchStarted', { mode: 'COOP', map: selectedMap });
        }
    });

    socket.on('startPvPMatch', () => {
        if (!players[socket.id] || !players[socket.id].isHost) return;

        const eligible = Object.values(players).filter(p => p.playerName && p.character);
        if (eligible.length < 2) return;

        currentMode = 'PVP';
        currentWave = 0;

        // Deterministic spawn assignment: sort by playerId and map to corners.
        const sortedIds = Object.keys(players).sort();
        const spawnAssignments = {};
        sortedIds.forEach((id, idx) => {
            spawnAssignments[id] = idx % PVP_CORNERS.length;
        });

        Object.values(players).forEach(p => {
            p.isAlive = true;
            p.isDowned = false;
            p.isSpectating = false;
            p.mode = 'PVP';
            p.pvpKills = 0;
            p.pvpSwordKills = 0;
            p.pvpWeaponIdx = 0;
            p.weapon = 'pistol';
        });

        io.emit('matchStarted', { mode: 'PVP', map: selectedMap, spawnAssignments });
    });

    // Enemy sync (host -> clients)
    socket.on('syncEnemies', (enemyData) => {
        socket.broadcast.emit('enemiesSynced', enemyData);
    });

    // Enemy hit (any client -> server -> host processes)
    socket.on('enemyHit', (data) => {
        io.emit('enemyDamaged', data);
    });

    // Wave state (host -> clients)
    socket.on('waveUpdate', (data) => {
        if (typeof data.wave === 'number' && data.wave > currentWave) {
            currentWave = data.wave;
            Object.values(players).forEach((player) => {
                if (!player.isAlive) {
                    player.isAlive = true;
                    player.isDowned = false;
                    player.isSpectating = false;
                    io.emit('playerRespawned', { playerId: player.playerId, wave: currentWave });
                }
            });
        }
        socket.broadcast.emit('syncWave', data);
    });

    socket.on('enemyBulletFired', (data) => {
        socket.broadcast.emit('enemyBulletFired', data);
    });

    // Host tells a specific client they took damage
    socket.on('damagePlayer', (data) => {
        // Find the target player's socket and send directly to them
        const targetSocket = io.sockets.sockets.get(data.targetId);
        if (targetSocket) {
            targetSocket.emit('playerDamaged', { targetId: data.targetId, damage: data.damage });
        }
    });

    // PvP: shooter tells server they hit a target. Server forwards damage + shooterId.
    socket.on('pvpDamage', (data) => {
        if (currentMode !== 'PVP' || !data || !data.targetId) return;
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
        if (weaponUsed === 'sword') {
            shooter.pvpSwordKills = (shooter.pvpSwordKills || 0) + 1;
        }
        const progression = computeWeaponForKills(shooter.pvpKills);
        shooter.pvpWeaponIdx = progression.idx;
        shooter.weapon = progression.weapon;

        io.emit('pvpKill', {
            shooterId,
            victimId,
            weapon: weaponUsed,
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
            io.emit('pvpMatchOver', {
                winnerId: shooterId,
                rankings: buildPvPRankings(),
            });
        }
    }

    // Revive progress (host -> downed player)
    socket.on('reviveProgress', (data) => {
        const targetSocket = io.sockets.sockets.get(data.targetId);
        if (targetSocket) {
            targetSocket.emit('reviveProgress', data);
        }
    });

    // A teammate finished the revive hold; server validates by relaying the revive.
    socket.on('revivePlayer', (data) => {
        const targetSocket = io.sockets.sockets.get(data.targetId);
        if (!targetSocket || !players[data.targetId]) return;
        players[data.targetId].isAlive = true;
        players[data.targetId].isDowned = false;
        players[data.targetId].isSpectating = false;
        io.emit('playerRevived', { playerId: data.targetId });
    });

    // Health pack spawned (host -> all clients)
    socket.on('healthPackSpawned', (data) => {
        socket.broadcast.emit('healthPackSpawned', data);
    });

    // Health pack picked up by a client — host validates and broadcasts removal
    socket.on('pickupHealthPack', (data) => {
        // Relay to host to validate
        const hostId = Object.keys(players).find(id => players[id].isHost);
        if (hostId) {
            const hostSocket = io.sockets.sockets.get(hostId);
            if (hostSocket) hostSocket.emit('clientPickupHealthPack', { ...data, playerId: socket.id });
        }
    });

    // Host confirms pickup and tells everyone
    socket.on('healthPackPickedUp', (data) => {
        if (!players[socket.id] || !players[socket.id].isHost) return;
        io.emit('healthPackRemoved', data);
    });

    // Player death
    socket.on('playerDied', (data) => {
        const isPvP = (data && data.mode === 'PVP') || currentMode === 'PVP';
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
        io.emit('playerDied', { playerId: socket.id, stats: data.stats, mode: isPvP ? 'PVP' : 'COOP', killerId: data?.killerId || null });

        if (isPvP) {
            if (data?.killerId && players[data.killerId] && data.killerId !== socket.id) {
                const weaponUsed = data.killerWeapon || WEAPON_ORDER[players[data.killerId].pvpWeaponIdx || 0];
                resolvePvPKill(data.killerId, socket.id, weaponUsed);
            }
            return; // PvP: no global game-over on death; match ends only via win threshold.
        }

        // Check if all players are dead/downed
        const allDead = Object.values(players).every(p => !p.isAlive || p.isDowned);
        if (allDead && Object.keys(players).length > 0) {
            const rankings = Object.values(players)
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map((p, idx) => ({
                    rank: idx + 1,
                    playerId: p.playerId,
                    playerName: p.playerName || `Player ${p.playerId.slice(0, 6)}`,
                    score: p.score || 0,
                    kills: p.totalKills || p.kills || 0,
                    wave: p.wave || 0,
                    status: p.isSpectating ? 'SPECTATING' : p.isDowned ? 'DOWNED' : 'DEAD'
                }));
            io.emit('globalGameOver', rankings);
        }
    });

    socket.on('playerSpectating', (data) => {
        if (!players[socket.id]) return;
        players[socket.id].isAlive = false;
        players[socket.id].isDowned = false;
        players[socket.id].isSpectating = true;
        players[socket.id].stats = data?.stats || players[socket.id].stats;
        players[socket.id].score = data?.stats?.score || players[socket.id].score;
        players[socket.id].kills = data?.stats?.kills || players[socket.id].kills;
        players[socket.id].dogKills = data?.stats?.dogKills || players[socket.id].dogKills;
        players[socket.id].bossKills = data?.stats?.bossKills || players[socket.id].bossKills;
        players[socket.id].totalKills = data?.stats?.totalKills || players[socket.id].totalKills;
        players[socket.id].wave = data?.stats?.wave || players[socket.id].wave;
        io.emit('playerSpectating', { playerId: socket.id, stats: players[socket.id].stats });
    });

    // Player revived
    socket.on('playerRevived', (data) => {
        if (players[socket.id]) {
            players[socket.id].isAlive = true;
            players[socket.id].isDowned = false;
            players[socket.id].isSpectating = false;
        }
        io.emit('playerRevived', { playerId: socket.id });
    });
});

http.listen(PORT, () => { console.log(`Server running on http://localhost:${PORT}`); });
