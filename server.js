const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// 游戏参数
const WORLD_SIZE = 1000;
const MAX_ALGAE = 150;
const players = {};
const algaes = [];

// 初始化藻类
for (let i = 0; i < MAX_ALGAE; i++) {
    algaes.push({ id: i, x: (Math.random() - 0.5) * WORLD_SIZE, y: (Math.random() - 0.5) * WORLD_SIZE });
}

io.on('connection', (socket) => {
    // 创建玩家
    players[socket.id] = {
        id: socket.id,
        x: (Math.random() - 0.5) * 200,
        y: (Math.random() - 0.5) * 200,
        size: 2,
        color: Math.random() * 0xffffff,
        input: { x: 0, y: 0 }
    };

    socket.on('input', (data) => {
        if (players[socket.id]) players[socket.id].input = data;
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

// 游戏循环
setInterval(() => {
    // 移动与边界
    for (let id in players) {
        let p = players[id];
        let speed = 2 * (3 / (p.size + 1));
        p.x += p.input.x * speed;
        p.y += p.input.y * speed;
        p.x = Math.max(Math.min(p.x, WORLD_SIZE/2), -WORLD_SIZE/2);
        p.y = Math.max(Math.min(p.y, WORLD_SIZE/2), -WORLD_SIZE/2);

        // 吃藻类
        for (let i = algaes.length - 1; i >= 0; i--) {
            let a = algaes[i];
            if (Math.hypot(p.x - a.x, p.y - a.y) < p.size + 0.5) {
                p.size += 0.2;
                algaes[i].x = (Math.random() - 0.5) * WORLD_SIZE;
                algaes[i].y = (Math.random() - 0.5) * WORLD_SIZE;
            }
        }
    }
    
    // 玩家互吃
    let playerIds = Object.keys(players);
    for (let i = 0; i < playerIds.length; i++) {
        for (let j = 0; j < playerIds.length; j++) {
            if (i === j) continue;
            let p1 = players[playerIds[i]];
            let p2 = players[playerIds[j]];
            if (!p1 || !p2) continue;
            if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < p1.size && p1.size > p2.size * 1.2) {
                p1.size += p2.size * 0.5;
                p2.size = 2; 
                p2.x = (Math.random() - 0.5) * 400; 
                p2.y = (Math.random() - 0.5) * 400;
                io.to(p2.id).emit('dead');
            }
        }
    }
    io.emit('state', { players, algaes });
}, 1000 / 60);

// 核心修改：适配云平台端口
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Listening on ${PORT}`); });
