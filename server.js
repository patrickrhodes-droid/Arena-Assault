const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const publicDir = path.join(__dirname, 'public');

app.use(express.static(publicDir));

app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/arenatest.html', (req, res) => {
    res.redirect('/');
});

let players = {};
let currentWave = 0;

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    const isFirst = Object.keys(players).length === 0;

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
        score: 0,
        kills: 0,
        dogKills: 0,
        bossKills: 0,
        totalKills: 0,
        wave: 0,
        stats: {}
    };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);
    io.emit('updateLobby', players);

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        if (Object.keys(players).length > 0) {
            const newHostId = Object.keys(players)[0];
            players[newHostId].isHost = true;
            io.emit('newHost', newHostId);
        }
        io.emit('updateLobby', players);
        io.emit('playerDisconnected', socket.id);
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
        if (typeof movementData.wave === 'number') players[socket.id].wave = movementData.wave;
        if (typeof movementData.isAlive === 'boolean') players[socket.id].isAlive = movementData.isAlive;
        if (typeof movementData.isDowned === 'boolean') players[socket.id].isDowned = movementData.isDowned;
        if (typeof movementData.isSpectating === 'boolean') players[socket.id].isSpectating = movementData.isSpectating;
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

    socket.on('startMatch', () => {
        if (players[socket.id] && players[socket.id].isHost) {
            currentWave = 0;
            Object.values(players).forEach(p => {
                p.isAlive = true;
                p.isDowned = false;
                p.isSpectating = false;
            });
            io.emit('matchStarted');
        }
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
        if (players[socket.id]) {
            players[socket.id].isAlive = false;
            players[socket.id].isDowned = true;
            players[socket.id].isSpectating = false;
            players[socket.id].stats = data.stats || {};
            players[socket.id].score = data.stats?.score || 0;
            players[socket.id].kills = data.stats?.kills || 0;
            players[socket.id].dogKills = data.stats?.dogKills || 0;
            players[socket.id].bossKills = data.stats?.bossKills || 0;
            players[socket.id].totalKills = data.stats?.totalKills || data.stats?.kills || 0;
            players[socket.id].wave = data.stats?.wave || 0;
        }
        io.emit('playerDied', { playerId: socket.id, stats: data.stats });

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

http.listen(3000, () => { console.log('Server running on http://localhost:3000'); });
