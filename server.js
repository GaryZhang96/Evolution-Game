const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" },
    pingInterval: 2000,
    pingTimeout: 5000
});

app.use(express.static('public'));

// --- 配置 ---
const WORLD_SIZE = 2000;
const MAX_ALGAE = 200;
const NPC_COUNT = 15;

// --- 状态 ---
const players = {};
const algaes = [];
const npcs = [];

// 初始化世界
for (let i = 0; i < MAX_ALGAE; i++) spawnAlgae(i);
for (let i = 0; i < NPC_COUNT; i++) spawnNPC(i);

function spawnAlgae(i) {
    algaes[i] = { id: i, x: (Math.random()-0.5)*WORLD_SIZE, y: (Math.random()-0.5)*WORLD_SIZE };
}

function spawnNPC(i) {
    npcs[i] = {
        id: `npc-${i}`,
        x: (Math.random()-0.5)*WORLD_SIZE, 
        y: (Math.random()-0.5)*WORLD_SIZE,
        size: 3 + Math.random() * 5,
        color: Math.random() * 0xffffff,
        vx: Math.random()-0.5, 
        vy: Math.random()-0.5
    };
}

// 辅助：限制边界
const clamp = (val) => Math.max(Math.min(val, WORLD_SIZE/2), -WORLD_SIZE/2);

io.on('connection', (socket) => {
    // 玩家入场
    players[socket.id] = {
        id: socket.id,
        x: (Math.random()-0.5)*500,
        y: (Math.random()-0.5)*500,
        size: 3,
        color: 0x00ffff,
        speed: 0 // 服务器端暂存速度
    };

    // 接收玩家位置更新 (信任客户端，解决延迟的核心)
    socket.on('updatePlayer', (data) => {
        if (players[socket.id]) {
            let p = players[socket.id];
            p.x = data.x;
            p.y = data.y;
            // 简单的防作弊检查可以加在这里
        }
    });
    
    // 吃东西请求
    socket.on('eat', (targetId) => {
        let p = players[socket.id];
        if(!p) return;

        // 1. 吃藻类 (targetId 是数字)
        if (typeof targetId === 'number') {
            let a = algaes[targetId];
            if (a && Math.hypot(p.x - a.x, p.y - a.y) < p.size + 20) { // 判定范围放宽
                p.size += 0.1;
                spawnAlgae(targetId); // 重生
                io.emit('algaeEaten', targetId, algaes[targetId]); // 广播变更
            }
        } 
        // 2. 吃 NPC/玩家 (targetId 是字符串)
        else {
            // 简化处理，暂时只处理吞噬体积判断，这里略去复杂PVP判定
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

// --- 低频心跳 (20Hz) ---
// 只负责同步 NPC 和广播世界状态，不再负责计算玩家移动
setInterval(() => {
    // NPC AI
    npcs.forEach(n => {
        if(Math.random()<0.05) { n.vx = Math.random()-0.5; n.vy = Math.random()-0.5; }
        let speed = 2 * (5/(n.size+2));
        n.x += n.vx * speed; n.y += n.vy * speed;
        n.x = clamp(n.x); n.y = clamp(n.y);
    });

    // 只需要广播必要信息 (位置压缩一下更好，但这里先保持简单)
    // 过滤掉不动的藻类，减少包体
    io.emit('state', { 
        players, 
        npcs 
        // 藻类不实时同步，依靠初始化和由于吃掉事件触发的单点更新
    });
}, 50); // 50ms = 20次/秒

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Listening on ${PORT}`); });
