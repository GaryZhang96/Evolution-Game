const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// --- 游戏平衡性数值 ---
const WORLD_SIZE = 2000; // 地图扩大
const MAX_ALGAE = 300;   // 藻类数量
const NPC_COUNT = 20;    // NPC 数量
const DASH_COST = 5;     // 冲刺消耗体重（防止无限跑）
const DASH_CD = 3000;    // 冲刺冷却 3秒

// --- 游戏状态 ---
const players = {};
const algaes = [];
const npcs = [];

// 初始化藻类
for (let i = 0; i < MAX_ALGAE; i++) {
    algaes.push({ id: i, x: (Math.random() - 0.5) * WORLD_SIZE, y: (Math.random() - 0.5) * WORLD_SIZE });
}

// 初始化 NPC
for (let i = 0; i < NPC_COUNT; i++) {
    npcs.push({
        id: `npc-${i}`,
        x: (Math.random() - 0.5) * WORLD_SIZE,
        y: (Math.random() - 0.5) * WORLD_SIZE,
        size: 3 + Math.random() * 5, // 随机大小
        color: Math.random() * 0xffffff,
        speed: 0,
        input: { x: Math.random()-0.5, y: Math.random()-0.5 }
    });
}

io.on('connection', (socket) => {
    // 玩家加入
    players[socket.id] = {
        id: socket.id,
        x: (Math.random() - 0.5) * 500,
        y: (Math.random() - 0.5) * 500,
        size: 3, // 初始体型
        color: 0x00ffff, // 玩家统一青色，方便区分
        input: { x: 0, y: 0 },
        dashUntil: 0, // 冲刺结束时间
        dashCD: 0     // 技能冷却时间戳
    };

    socket.on('input', (data) => {
        if (players[socket.id]) {
            players[socket.id].input = data.dir; // 移动方向
            
            // 冲刺逻辑
            if (data.dash && Date.now() > players[socket.id].dashCD && players[socket.id].size > 4) {
                players[socket.id].dashUntil = Date.now() + 500; // 冲刺持续 0.5秒
                players[socket.id].dashCD = Date.now() + DASH_CD;
                players[socket.id].size -= 1; // 消耗质量
            }
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

// 辅助：限制边界
function clamp(val) { return Math.max(Math.min(val, WORLD_SIZE/2), -WORLD_SIZE/2); }

// --- 主循环 (60 FPS) ---
setInterval(() => {
    const now = Date.now();

    // 1. 更新 NPC (简单的 AI)
    npcs.forEach(npc => {
        // NPC 简单漫游 + 偶尔改变方向
        if (Math.random() < 0.02) {
            npc.input = { x: Math.random() - 0.5, y: Math.random() - 0.5 };
        }
        // 移动
        let speed = 2 * (5 / (npc.size + 2)); 
        npc.x += npc.input.x * speed;
        npc.y += npc.input.y * speed;
        npc.x = clamp(npc.x); npc.y = clamp(npc.y);
    });

    // 2. 更新玩家
    for (let id in players) {
        let p = players[id];
        // 计算速度：基础速度 + 冲刺加成
        let baseSpeed = 2.5 * (5 / (p.size + 2));
        if (now < p.dashUntil) baseSpeed *= 3; // 冲刺时速度翻3倍

        p.x += p.input.x * baseSpeed;
        p.y += p.input.y * baseSpeed;
        p.x = clamp(p.x); p.y = clamp(p.y);
    }

    // 3. 统一处理所有实体（玩家+NPC）的碰撞
    const allEntities = [...Object.values(players), ...npcs];

    allEntities.forEach(e1 => {
        // 吃藻类
        for (let i = algaes.length - 1; i >= 0; i--) {
            let a = algaes[i];
            if (Math.hypot(e1.x - a.x, e1.y - a.y) < e1.size + 0.5) {
                e1.size += 0.1;
                a.x = (Math.random() - 0.5) * WORLD_SIZE; a.y = (Math.random() - 0.5) * WORLD_SIZE;
            }
        }

        // 互相吞噬 (e1 吃 e2)
        allEntities.forEach(e2 => {
            if (e1.id === e2.id) return;
            let dist = Math.hypot(e1.x - e2.x, e1.y - e2.y);
            if (dist < e1.size && e1.size > e2.size * 1.2) {
                // 吃到东西
                e1.size += e2.size * 0.4;
                
                // 被吃者重生
                e2.size = 3;
                e2.x = (Math.random() - 0.5) * WORLD_SIZE;
                e2.y = (Math.random() - 0.5) * WORLD_SIZE;
                
                // 如果是玩家被吃，通知前端
                if (players[e2.id]) io.to(e2.id).emit('dead');
            }
        });
    });

    // 发送状态 (包含 dashCD 方便前端做 UI)
    io.emit('state', { players, algaes, npcs });

}, 1000 / 60);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Listening on ${PORT}`); });
