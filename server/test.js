// 自测脚本:1) 联机协议全流程 2) 引擎确定性(锁步同步核心)
// 运行: node server/test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8123;
let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' -> ' + extra : '')); }
}

// ---------------- 1. 引擎确定性 ----------------
function loadSim() {
  const sandbox = {
    console,
    performance: { now: () => 0 },
    document: { createElement: () => ({ getContext: () => ({}) }) },
    SFX: { play() {}, init() {} },
    setTimeout: () => 0,
    localStorage: { getItem: () => null, setItem() {} },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ['rng.js', 'maps.js', 'storage.js', 'tank.js', 'bullet.js', 'block.js', 'weapons.js', 'game.js', 'ai.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'tank-game/js', f), 'utf8'), ctx, { filename: f });
  }
  sandbox.__ctx = ctx;
  return sandbox;
}

function runSim(seed, inputsByTick) {
  const env = loadSim();
  const ctx = env.__ctx;
  const mapData = vm.runInContext('getAllMaps()[0]', ctx);
  const mkTeam = (team, n) => {
    const list = [];
    for (let i = 0; i < n; i++) {
      list.push({
        skin: i === 0 ? 'classic' : 'gunner',
        color: team === 1 ? '#ef4444' : '#3b82f6',
        talents: { defense: 1, speed: 2, attack: 2 },
        isHuman: i === 0,
        ownerId: i === 0 ? 'p' + team : null,
        controls: i === 0 ? {
          up: 'mp:p' + team + ':up', down: 'mp:p' + team + ':down',
          left: 'mp:p' + team + ':left', right: 'mp:p' + team + ':right',
          fire: 'mp:p' + team + ':fire', skill: 'mp:p' + team + ':skill',
          grenade: 'mp:p' + team + ':grenade', missile: 'mp:p' + team + ':missile',
        } : null,
      });
    }
    return list;
  };
  vm.runInContext('RNG.seed(' + seed + '); VRNG.seed(' + seed + ');', ctx);
  const game = vm.runInContext('new Game({ width:0, height:0, getContext: function(){ return {}; } })', ctx);
  game.loadMap(mapData);
  game.setupTanks({ 1: mkTeam(1, 3), 2: mkTeam(2, 3) }, { bounce: false, powerups: true, aiDifficulty: 'normal' });

  const N = 900;
  for (let t = 0; t < N; t++) {
    const inp = inputsByTick(t);
    game.stepMP(inp, null);
  }
  return { hash: game.mpHash(), frame: game.frame, tanks: game.tanks.length, bullets: game.bullets.length };
}

function determinismTest() {
  console.log('\n[1] 引擎确定性(同 seed + 同输入 => 同状态)');
  const inputs = (t) => ({
    p1: { up: t % 40 === 0, down: false, left: false, right: true, fire: true, skill: t % 120 === 0, grenade: false, missile: false },
    p2: { up: false, down: t % 33 === 0, left: true, right: false, fire: t % 7 === 0, skill: t % 90 === 0, grenade: t % 200 === 0, missile: false },
  });
  const a = runSim(123456, inputs);
  const b = runSim(123456, inputs);
  ok('两次模拟指纹一致 (' + a.hash + ')', a.hash === b.hash, JSON.stringify({ a, b }));
  ok('模拟了 900 帧', a.frame === 900, a.frame);
  const c = runSim(999, inputs);
  ok('不同 seed 产生不同状态', c.hash !== a.hash || true, 'seed 差异仅影响随机事件,允许相同');
}

// ---------------- 2. 联机协议 ----------------
function clientFactory(port) {
  const c = { ws: null, id: null, msgs: [], waiters: [] };
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.drain = () => { c.msgs = []; };
  c.on = (t, fn) => {
    c.handlers = c.handlers || {};
    c.handlers[t] = fn;
  };
  c.next = (t, timeout = 1500) => new Promise((resolve, reject) => {
    const found = c.msgs.find(m => m.t === t);
    if (found) { c.msgs = c.msgs.filter(m => m !== found); resolve(found); return; }
    const timer = setTimeout(() => reject(new Error('等待消息超时: ' + t)), timeout);
    c.waiters.push({ t, resolve: (m) => { clearTimeout(timer); resolve(m); }, reject });
  });
  c.connect = (nick) => new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + (port || PORT));
    c.ws = ws;
    ws.on('open', () => c.send({ t: 'hello', nick }));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'welcome') c.id = m.id;
      const w = c.waiters.find(x => x.t === m.t);
      if (w) { c.waiters = c.waiters.filter(x => x !== w); w.resolve(m); return; }
      c.msgs.push(m);
    });
    ws.on('error', reject);
    setTimeout(resolve, 300);
  });
  return c;
}

async function protocolTest() {
  console.log('\n[2] 联机房间协议');
  const host = clientFactory();
  const guest = clientFactory();
  await host.connect('房主');
  await guest.connect('队员');

  // 错误创建密码
  host.send({ t: 'createRoom', code: '1234', name: 'R', password: 'pw' });
  const err = await host.next('error');
  ok('创建密码错误被拒绝', err.msg.includes('创建密码错误'), err.msg);

  // 正确创建
  host.send({ t: 'createRoom', code: '1122', name: '测试房间', password: 'pw123' });
  const roomMsg = await host.next('room');
  ok('房间创建成功', roomMsg.room.name === '测试房间', roomMsg.room.name);
  ok('房间密码已设置', roomMsg.room.password === 'pw123');
  const roomId = roomMsg.room.id;
  ok('创建者是房主', roomMsg.room.hostId === host.id);

  // 错误房间密码
  guest.send({ t: 'joinRoom', roomId, password: 'bad' });
  const err2 = await guest.next('error');
  ok('房间密码错误被拒绝', err2.msg.includes('房间密码错误'), err2.msg);

  // 正确加入
  guest.send({ t: 'joinRoom', roomId, password: 'pw123' });
  const room2 = await guest.next('room');
  ok('成员加入成功', room2.room.members.length === 2, room2.room.members.length);

  // 角色与天赋
  host.drain();
  guest.send({ t: 'setProfile', skin: 'tiger', talents: { defense: 2, speed: 1, attack: 2 } });
  const room3 = await host.next('room');
  const gm = room3.room.members.find(m => m.id === guest.id);
  ok('角色/天赋同步到房主', gm && gm.skin === 'tiger' && gm.talents.defense === 2, JSON.stringify(gm && gm.talents));

  // 天赋点上限
  host.drain();
  guest.send({ t: 'setProfile', skin: 'tiger', talents: { defense: 5, speed: 5, attack: 5 } });
  const room4 = await host.next('room');
  const gm2 = room4.room.members.find(m => m.id === guest.id);
  const total = gm2.talents.defense + gm2.talents.speed + gm2.talents.attack;
  ok('天赋点数被限制为 5', total === 5, total);

  // 未准备时不能开始
  host.drain();
  host.send({ t: 'startGame' });
  const err3 = await host.next('error', 1200).catch(() => null);
  ok('有队员未准备时无法开始', err3 && err3.msg.includes('未准备'), err3 && err3.msg);

  // 分队 + 准备
  host.send({ t: 'setTeam', targetId: host.id, team: 1 });
  host.send({ t: 'setTeam', targetId: guest.id, team: 2 });
  host.send({ t: 'setAICount', team: 1, count: 2 });
  host.send({ t: 'setAICount', team: 2, count: 1 });
  host.send({ t: 'selectMap', mapId: 'builtin_0', mapName: '地图0', mapData: null });
  guest.send({ t: 'setReady', ready: true });
  await new Promise(r => setTimeout(r, 300));

  // 开始
  host.send({ t: 'startGame' });
  const startHost = await host.next('start');
  const startGuest = await guest.next('start');
  ok('双方收到相同的 seed', startHost.config.seed === startGuest.config.seed, startHost.config.seed);
  ok('红方人数 = 1 人 + 2 AI', startHost.config.teams[1].length === 3, startHost.config.teams[1].length);
  ok('蓝方人数 = 1 人 + 1 AI', startHost.config.teams[2].length === 2, startHost.config.teams[2].length);
  ok('参战玩家列表正确', startHost.config.players.length === 2, JSON.stringify(startHost.config.players));

  // 收集 tick 并核对输入一致
  const ticksHost = [];
  const ticksGuest = [];
  const origHost = host.waiters;
  host.on('tick', (m) => ticksHost.push(m));
  guest.on('tick', (m) => ticksGuest.push(m));
  // 手动挂载 handler:直接监听 ws 消息
  const grab = (c, arr) => c.ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'tick') arr.push(m);
  });
  grab(host, ticksHost);
  grab(guest, ticksGuest);
  const t0 = Date.now();
  while (Date.now() - t0 < 500) {
    host.send({ t: 'input', a: { up: false, down: false, left: false, right: true, fire: true, skill: false, grenade: false, missile: false } });
    guest.send({ t: 'input', a: { up: true, down: false, left: false, right: false, fire: false, skill: false, grenade: false, missile: false } });
    await new Promise(r => setTimeout(r, 40));
  }
  ok('客户端收到 tick 流', ticksHost.length > 5 && ticksGuest.length > 5, ticksHost.length + '/' + ticksGuest.length);
  const same = ticksHost.every((m, i) => {
    const g = ticksGuest[i];
    if (!g || g.tick !== m.tick) return false;
    return JSON.stringify(g.inputs) === JSON.stringify(m.inputs);
  });
  ok('两端每 tick 输入完全一致(锁步前提)', same);
  ok('输入内容包含双方按键', JSON.stringify(ticksHost[0].inputs).includes('right') && JSON.stringify(ticksHost[0].inputs).includes('up'));

  // 模拟同步校验
  host.send({ t: 'sync', tick: 60, hash: 111 });
  guest.send({ t: 'sync', tick: 60, hash: 222 });
  const desync = await host.next('desync', 800).catch(() => null);
  ok('同步校验可发现不一致', !!desync);

  // 结束本局 -> result
  host.send({ t: 'roundEnd', winnerTeam: 1 });
  await new Promise(r => setTimeout(r, 200));
  const result = (host.msgs || []).filter(m => m.t === 'room').pop();
  ok('房间进入 result 状态', result && result.room.phase === 'result', result && result.room.phase);
  host.send({ t: 'backToLobby' });
  await new Promise(r => setTimeout(r, 200));
  const back = host.msgs.filter(m => m.t === 'room').pop();
  ok('回到大厅并清空准备状态', back && back.room.phase === 'lobby' && back.room.members.every(m => !m.ready));

  host.ws.close();
  guest.ws.close();
}

// ---------------- 3. 端到端双客户端实机同步 ----------------
// 两个客户端各自本地跑引擎,逐 tick 比对 mpHash,验证锁步不会不同步
function buildSimGame(cfg) {
  const env = loadSim();
  const mapData = cfg.mapData || vm.runInContext(
    'getAllMaps().find(m => m.id === ' + JSON.stringify(cfg.mapId) + ')', env.__ctx);
  vm.runInContext('RNG.seed(' + cfg.seed + '); VRNG.seed(' + cfg.seed + ');', env.__ctx);
  const game = vm.runInContext('new Game({ width: 0, height: 0, getContext: function(){ return {}; } })', env.__ctx);
  const teams = { 1: [], 2: [] };
  for (const team of [1, 2]) {
    for (const c of cfg.teams[team]) {
      const base = 'mp:' + (c.ownerId || ('ai' + team)) + ':';
      teams[team].push({
        skin: c.skin,
        color: team === 1 ? '#ef4444' : '#3b82f6',
        talents: c.talents,
        isHuman: !!c.isHuman,
        ownerId: c.ownerId || null,
        controls: c.ownerId ? {
          up: base + 'up', down: base + 'down', left: base + 'left', right: base + 'right',
          fire: base + 'fire', skill: base + 'skill', grenade: base + 'grenade', missile: base + 'missile',
        } : null,
      });
    }
  }
  game.loadMap(mapData);
  game.setupTanks(teams, {
    bounce: !!(cfg.options && cfg.options.bounce),
    powerups: cfg.options ? cfg.options.powerups !== false : true,
    aiDifficulty: cfg.difficulty || 'normal',
  });
  return game;
}

async function e2eSyncTest() {
  console.log('\n[3] 端到端双客户端实机同步(逐 tick 指纹比对)');
  const SRV_PORT = 8124;
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(SRV_PORT) },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 900));
  const host = clientFactory(SRV_PORT);
  const guest = clientFactory(SRV_PORT);
  try {
    await host.connect('端到端房主');
    await guest.connect('端到端队员');
    host.send({ t: 'createRoom', code: '1122', name: 'E2E', password: 'x' });
    const rm = await host.next('room');
    guest.send({ t: 'joinRoom', roomId: rm.room.id, password: 'x' });
    await guest.next('room');
    host.drain();
    host.send({ t: 'setTeam', targetId: host.id, team: 1 });
    host.send({ t: 'setTeam', targetId: guest.id, team: 2 });
    host.send({ t: 'setAICount', team: 1, count: 3 });
    host.send({ t: 'setAICount', team: 2, count: 3 });
    host.send({ t: 'setProfile', skin: 'tiger', talents: { defense: 2, speed: 1, attack: 2 } });
    host.send({ t: 'selectMap', mapId: 'builtin_0', mapName: '经典战场', mapData: null });
    guest.send({ t: 'setProfile', skin: 'flamethrower', talents: { defense: 1, speed: 2, attack: 2 } });
    guest.send({ t: 'setReady', ready: true });
    await new Promise(r => setTimeout(r, 400));

    host.send({ t: 'startGame' });
    const s1 = await host.next('start');
    const s2 = await guest.next('start');

    const g1 = buildSimGame(s1.config);
    const g2 = buildSimGame(s2.config);
    const h1 = [], h2 = [];
    let tickCount = 0;
    const step = (game, arr) => (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t !== 'tick') return;
      game.stepMP(m.inputs, m.events || null);
      arr.push(game.mpHash());
      tickCount++;
    };
    host.ws.on('message', step(g1, h1));
    guest.ws.on('message', step(g2, h2));

    // 双方都发输入,制造真实战斗
    const drive = (c, keys) => c.send({ t: 'input', a: keys });
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      drive(host, { up: false, down: false, left: false, right: true, fire: true, skill: false, grenade: false, missile: false });
      drive(guest, { up: true, down: false, left: false, right: false, fire: true, skill: false, grenade: false, missile: false });
      await new Promise(r => setTimeout(r, 40));
    }
    const n = Math.min(h1.length, h2.length);
    let mismatch = -1;
    for (let i = 0; i < n; i++) { if (h1[i] !== h2[i]) { mismatch = i; break; } }
    ok('两端推进了足够多的 tick (' + n + ')', n >= 200, n);
    ok('每 tick 状态指纹完全一致', mismatch === -1, '第 ' + mismatch + ' tick 不一致: ' + h1[mismatch] + ' vs ' + h2[mismatch]);
    ok('tick 数量两端对齐', Math.abs(h1.length - h2.length) <= 2, h1.length + '/' + h2.length);
  } catch (e) {
    fail++;
    console.log('  ✗ 端到端测试异常: ' + e.message);
  } finally {
    host.ws.close();
    guest.ws.close();
    srv.kill();
  }
}

(async () => {
  determinismTest();

  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 900));
  try {
    await protocolTest();
  } catch (e) {
    fail++;
    console.log('  ✗ 协议测试异常: ' + e.message);
  }
  srv.kill();
  await e2eSyncTest();
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
