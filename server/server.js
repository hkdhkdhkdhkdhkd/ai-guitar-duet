// 坦克对战 2D · 联机服务器
// 职责：静态文件托管 + WebSocket 房间管理 + 大厅/分队/锁步同步
// 运行：cd server && npm install && node server.js  (默认端口 8080)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || '8081', 10);
const ROOT = path.resolve(__dirname, '..');
const CREATE_CODE = '1122';      // 创建房间固定密码
const TICK_MS = 1000 / 60;       // 服务端同步频率：60Hz（与游戏帧率一致）
const INPUT_BUFFER = 5;          // 输入提前量（tick），约 83ms，用于抵消网络延迟
const MAX_MEMBERS = 8;
const MAX_AI_PER_TEAM = 19;

const rooms = new Map();
let clientSeq = 0;
let roomSeq = 0;

// ---------- 工具 ----------
function sanitizeNick(s) {
  return String(s || '').replace(/[<>]/g, '').trim().slice(0, 12) || '玩家';
}
function sanitizeText(s, max) {
  return String(s || '').replace(/[<>]/g, '').trim().slice(0, max || 20);
}
function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

// ---------- HTTP 静态托管 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip',
  '.md': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/tank-game/index.html';
  else if (urlPath.endsWith('/')) urlPath += 'index.html';
  // 只暴露项目根目录内的文件
  const full = path.join(ROOT, urlPath);
  if (!full.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Content-Length': st.size,
    });
    fs.createReadStream(full).pipe(res);
  });
});

const wss = new WebSocketServer({ server, perMessageDeflate: false });

// ---------- 房间与客户端 ----------
const clients = new Map();   // id -> client

function send(client, msg) {
  if (!client || client.ws.readyState !== 1) return;
  try { client.ws.send(JSON.stringify(msg)); } catch (e) { /* 忽略发送失败 */ }
}
function sendError(client, msg) { send(client, { t: 'error', msg }); }

function roomPublicList() {
  const list = [];
  for (const room of rooms.values()) {
    if (room.phase !== 'lobby') continue;
    list.push({
      id: room.id,
      name: room.name,
      hostName: room.members[0] ? room.members[0].nick : '?',
      players: room.members.length,
      max: MAX_MEMBERS,
      hasPassword: !!room.password,
    });
  }
  return list;
}
function broadcastRooms() {
  const list = roomPublicList();
  for (const c of clients.values()) {
    if (!c.roomId) send(c, { t: 'rooms', rooms: list });
  }
}

function roomState(room) {
  return {
    id: room.id,
    name: room.name,
    password: room.password,
    hostId: room.hostId,
    phase: room.phase,
    members: room.members.map(m => ({
      id: m.id, nick: m.nick, skin: m.skin, talents: m.talents,
      ready: m.ready, team: m.team, connected: true,
    })),
    mapId: room.mapId,
    mapName: room.mapName,
    mapData: room.mapData,          // 仅自制地图需要下发
    options: room.options,
    aiCount: room.aiCount,
    difficulty: room.difficulty,
    lastWinner: room.lastWinner,
  };
}
function broadcastRoom(room) {
  const state = roomState(room);
  for (const m of room.members) {
    const c = clients.get(m.id);
    if (c) send(c, { t: 'room', room: state });
  }
}
function broadcastRoomEvent(room, msg, exceptId) {
  for (const m of room.members) {
    if (m.id === exceptId) continue;
    const c = clients.get(m.id);
    if (c) send(c, msg);
  }
}

function findRoom(id) { return rooms.get(id); }
function getRoomByClient(client) { return client && client.roomId ? rooms.get(client.roomId) : null; }
function getMember(room, id) { return room.members.find(m => m.id === id); }
function isHost(room, id) { return room.hostId === id; }

function makeRoomId() {
  roomSeq++;
  return 'room_' + roomSeq;
}

function joinRoom(client, room) {
  client.roomId = room.id;
  room.members.push({
    id: client.id,
    nick: client.nick,
    skin: 'classic',
    talents: { defense: 1, speed: 2, attack: 2 },
    ready: false,
    team: 0,          // 0 = 未分队/观战
  });
  broadcastRoom(room);
  broadcastRooms();
}

function leaveRoom(client) {
  const room = getRoomByClient(client);
  const wasPlaying = room && room.phase === 'playing' && room.participants.has(client.id);
  client.roomId = null;
  if (!room) return;
  room.members = room.members.filter(m => m.id !== client.id);
  room.participants.delete(client.id);
  room.latestInput.delete(client.id);
  if (room.members.length === 0) {
    stopTicking(room);
    rooms.delete(room.id);
    broadcastRooms();
    return;
  }
  if (room.hostId === client.id) {
    room.hostId = room.members[0].id;
  }
  if (wasPlaying) {
    // 有参战玩家掉线：本局中止，回到大厅
    room.phase = 'lobby';
    room.participants = new Set();
    stopTicking(room);
  }
  room.members.forEach(m => { m.ready = false; });
  if (room.phase === 'playing') {
    for (const m of room.members) {
      const c = clients.get(m.id);
      if (c) send(c, { t: 'room', room: roomState(room) });
    }
  } else {
    broadcastRoom(room);
  }
  broadcastRooms();
}

// ---------- 同步循环 ----------
function startTicking(room) {
  stopTicking(room);
  room.serverTick = 0;
  room.desyncWarned = false;
  room.hashByTick = new Map();
  room.tickTimer = setInterval(() => tickRoom(room), TICK_MS);
}
function stopTicking(room) {
  if (room.tickTimer) clearInterval(room.tickTimer);
  room.tickTimer = null;
  room.hashByTick = null;
}

function tickRoom(room) {
  if (room.phase !== 'playing') return;
  const tick = room.serverTick;
  const inputs = {};
  const events = [];
  for (const pid of room.participants.keys()) {
    const a = room.latestInput.get(pid);
    inputs[pid] = a || {
      up: false, down: false, left: false, right: false,
      fire: false, skill: false, grenade: false, missile: false,
    };
  }
  // 边沿事件（技能/手榴弹/导弹）按预定 tick 投递，避免快速点击被采样漏掉
  const pending = room.eventQueue || [];
  const remain = [];
  for (const ev of pending) {
    if (ev.tick === tick) events.push({ pid: ev.pid, action: ev.action });
    else remain.push(ev);
  }
  room.eventQueue = remain;
  broadcastRoomEvent(room, { t: 'tick', tick, inputs, events: events.length ? events : undefined });
  room.serverTick++;
}

function buildStartConfig(room) {
  const teams = { 1: [], 2: [] };
  const players = [];
  const humanMembers = room.members.filter(m => m.team === 1 || m.team === 2);
  for (const team of [1, 2]) {
    const list = humanMembers
      .filter(m => m.team === team)
      .sort((a, b) => room.members.indexOf(a) - room.members.indexOf(b));
    for (const m of list) {
      teams[team].push({
        ownerId: m.id, skin: m.skin, talents: m.talents, isHuman: true,
        nick: m.nick,
        slot: teams[team].length,
      });
      players.push({ id: m.id, team, slot: teams[team].length - 1 });
    }
  }
  // AI 补位
  const skins = ['classic', 'heavy', 'scout', 'shield', 'gunner', 'flamethrower',
    'tiger', 't34', 'sherman', 'churchill', 'panther', 'f16', 'su27', 'a10', 'b52', 'apache'];
  for (const team of [1, 2]) {
    const n = Math.max(0, Math.min(MAX_AI_PER_TEAM, room.aiCount[team] || 0));
    const base = teams[team].length;
    for (let i = 0; i < n; i++) {
      teams[team].push({
        ownerId: null,
        skin: skins[(base + i) % skins.length],
        talents: { defense: 1, speed: 2, attack: 2 },
        isHuman: false,
        slot: base + i,
      });
    }
  }
  if (teams[1].length === 0 || teams[2].length === 0) return null;
  return {
    seed: room.seed,
    mapId: room.mapId,
    mapName: room.mapName,
    mapData: room.mapData,
    options: { bounce: !!room.options.bounce, powerups: room.options.powerups !== false },
    difficulty: room.difficulty,
    teams,
    players,
  };
}

// ---------- 消息处理 ----------
function handleMessage(client, msg) {
  switch (msg.t) {
    case 'hello': {
      client.nick = sanitizeNick(msg.nick);
      send(client, { t: 'welcome', id: client.id, rooms: roomPublicList(), serverTickMs: TICK_MS });
      broadcastRooms();
      break;
    }
    case 'listRooms': {
      send(client, { t: 'rooms', rooms: roomPublicList() });
      break;
    }
    case 'createRoom': {
      if (client.roomId) return sendError(client, '你已在房间中');
      if (String(msg.code || '').trim() !== CREATE_CODE) return sendError(client, '创建密码错误');
      const name = sanitizeText(msg.name, 16) || '未命名房间';
      const password = sanitizeText(msg.password, 12);
      if (!password) return sendError(client, '请设置房间密码');
      const room = {
        id: makeRoomId(),
        name,
        password,
        hostId: client.id,
        members: [],
        phase: 'lobby',
        mapId: 'builtin_0',
        mapName: '默认地图',
        mapData: null,
        options: { bounce: false, powerups: true },
        aiCount: { 1: 0, 2: 0 },
        difficulty: 'normal',
        participants: new Map(),
        latestInput: new Map(),
        eventQueue: [],
        serverTick: 0,
        seed: 0,
        lastWinner: null,
      };
      rooms.set(room.id, room);
      client.nick = sanitizeNick(msg.nick || client.nick);
      joinRoom(client, room);
      break;
    }
    case 'joinRoom': {
      if (client.roomId) return sendError(client, '你已在房间中');
      const room = findRoom(msg.roomId);
      if (!room) return sendError(client, '房间不存在');
      if (room.phase !== 'lobby') return sendError(client, '该房间正在游戏中');
      if (room.members.length >= MAX_MEMBERS) return sendError(client, '房间已满');
      if (String(msg.password || '') !== room.password) return sendError(client, '房间密码错误');
      client.nick = sanitizeNick(msg.nick || client.nick);
      joinRoom(client, room);
      break;
    }
    case 'leaveRoom': {
      leaveRoom(client);
      break;
    }
    case 'setProfile': {
      const room = getRoomByClient(client);
      const me = room && getMember(room, client.id);
      if (!room || !me || room.phase !== 'lobby') return;
      if (msg.skin) me.skin = sanitizeText(msg.skin, 16);
      if (msg.talents) {
        const t = msg.talents;
        const def = Math.max(0, Math.min(5, parseInt(t.defense, 10) || 0));
        let spd = Math.max(0, Math.min(5, parseInt(t.speed, 10) || 0));
        let atk = Math.max(0, Math.min(5, parseInt(t.attack, 10) || 0));
        // 天赋总点数上限 5
        while (def + spd + atk > 5) { if (spd > 0) spd--; else if (atk > 0) atk--; else break; }
        me.talents = { defense: def, speed: spd, attack: atk };
      }
      broadcastRoom(room);
      break;
    }
    case 'setReady': {
      const room = getRoomByClient(client);
      const me = room && getMember(room, client.id);
      if (!room || !me || room.phase !== 'lobby') return;
      me.ready = !!msg.ready;
      broadcastRoom(room);
      break;
    }
    case 'setTeam': {
      const room = getRoomByClient(client);
      if (!room || !isHost(room, client.id) || room.phase !== 'lobby') return;
      const target = getMember(room, msg.targetId);
      if (!target) return;
      const team = parseInt(msg.team, 10);
      target.team = (team === 1 || team === 2) ? team : 0;
      target.ready = false;
      broadcastRoom(room);
      break;
    }
    case 'setAICount': {
      const room = getRoomByClient(client);
      if (!room || !isHost(room, client.id) || room.phase !== 'lobby') return;
      const team = parseInt(msg.team, 10);
      if (team !== 1 && team !== 2) return;
      room.aiCount[team] = Math.max(0, Math.min(MAX_AI_PER_TEAM, parseInt(msg.count, 10) || 0));
      broadcastRoom(room);
      break;
    }
    case 'setOptions': {
      const room = getRoomByClient(client);
      if (!room || !isHost(room, client.id) || room.phase !== 'lobby') return;
      if (typeof msg.bounce === 'boolean') room.options.bounce = msg.bounce;
      if (typeof msg.powerups === 'boolean') room.options.powerups = msg.powerups;
      if (msg.difficulty) room.difficulty = sanitizeText(msg.difficulty, 12);
      broadcastRoom(room);
      break;
    }
    case 'selectMap': {
      const room = getRoomByClient(client);
      if (!room || !isHost(room, client.id) || room.phase !== 'lobby') return;
      room.mapId = sanitizeText(msg.mapId, 24);
      room.mapName = sanitizeText(msg.mapName, 20);
      // 自制地图由房主客户端提供地图数据
      room.mapData = msg.mapData ? msg.mapData : null;
      broadcastRoom(room);
      break;
    }
    case 'startGame': {
      const room = getRoomByClient(client);
      if (!room || !isHost(room, client.id) || room.phase !== 'lobby') return;
      if (!room.members.every(m => m.ready || m.id === room.hostId)) {
        return sendError(client, '还有队员未准备');
      }
      const config = buildStartConfig(room);
      if (!config) return sendError(client, '双方都需要至少 1 辆坦克');
      if (!config.mapData && config.mapId.startsWith('custom_')) {
        return sendError(client, '自制地图数据缺失，请房主重新选择地图');
      }
      room.phase = 'playing';
      room.seed = crypto.randomInt(1, 2147483646);
      room.participants = new Set(config.players.map(p => p.id));
      room.latestInput = new Map();
      room.eventQueue = [];
      room.lastWinner = null;
      for (const pid of room.participants) {
        room.latestInput.set(pid, null);
      }
      config.seed = room.seed;
      config.startTick = 0;
      startTicking(room);
      broadcastRoomEvent(room, { t: 'start', config });
      broadcastRoom(room);
      break;
    }
    case 'input': {
      const room = getRoomByClient(client);
      if (!room || room.phase !== 'playing') return;
      if (!room.participants.has(client.id)) return;
      const a = msg.a || {};
      room.latestInput.set(client.id, {
        up: !!a.up, down: !!a.down, left: !!a.left, right: !!a.right,
        fire: !!a.fire, skill: !!a.skill, grenade: !!a.grenade, missile: !!a.missile,
      });
      // 边沿事件：排进未来 tick
      if (Array.isArray(msg.e)) {
        for (const action of msg.e) {
          if (!['skill', 'grenade', 'missile'].includes(action)) continue;
          room.eventQueue.push({ pid: client.id, action, tick: room.serverTick + INPUT_BUFFER });
        }
      }
      break;
    }
    case 'sync': {
      const room = getRoomByClient(client);
      if (!room || room.phase !== 'playing' || !room.hashByTick) return;
      const tick = parseInt(msg.tick, 10);
      if (!Number.isFinite(tick)) return;
      if (!room.hashByTick.has(tick)) room.hashByTick.set(tick, new Map());
      room.hashByTick.get(tick).set(client.id, msg.hash);
      const hashes = room.hashByTick.get(tick);
      if (hashes.size >= 2) {
        const vals = [...hashes.values()];
        if (vals.every(v => v === vals[0]) === false && !room.desyncWarned) {
          room.desyncWarned = true;
          broadcastRoomEvent(room, { t: 'desync', tick });
          console.warn(`[room ${room.id}] 同步校验不一致 @tick ${tick}`, vals);
        }
      }
      // 清理旧记录
      for (const t of room.hashByTick.keys()) {
        if (tick - t > 300) room.hashByTick.delete(t);
      }
      break;
    }
    case 'roundEnd': {
      const room = getRoomByClient(client);
      if (!room || room.phase !== 'playing' || !isHost(room, client.id)) return;
      room.phase = 'result';
      room.lastWinner = parseInt(msg.winnerTeam, 10) || 0;
      stopTicking(room);
      broadcastRoom(room);
      break;
    }
    case 'backToLobby': {
      const room = getRoomByClient(client);
      if (!room || !isHost(room, client.id)) return;
      room.phase = 'lobby';
      room.members.forEach(m => { m.ready = false; });
      stopTicking(room);
      broadcastRoom(room);
      broadcastRooms();
      break;
    }
    case 'ping': {
      send(client, { t: 'pong', t0: msg.t0 });
      break;
    }
    default:
      break;
  }
}

wss.on('connection', (ws, req) => {
  const client = { id: 'c' + (++clientSeq), ws, nick: '玩家', roomId: null };
  console.log(`[连接] ${client.id} from ${req.socket.remoteAddress}`);
  clients.set(client.id, client);
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { handleMessage(client, msg); } catch (e) { console.error('消息处理异常', e); }
  });
  ws.on('close', (code, reason) => {
    console.log(`[断开] ${client.id} code=${code} reason=${reason}`);
    leaveRoom(client);
    clients.delete(client.id);
  });
  ws.on('error', (e) => { console.log(`[ws错误] ${client.id} ${e && e.message}`); });
  send(client, { t: 'hello', id: client.id });
});

server.listen(PORT, () => {
  console.log(`坦克对战联机服务器已启动: http://localhost:${PORT}/tank-game/`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
});
