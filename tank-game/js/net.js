// 联机网络模块:房间/大厅 + 锁步同步客户端
// 依赖: rng.js(随机数种子一致性), game.js(Game.stepMP)
const MP = {
  ws: null,
  id: null,
  nick: '玩家',
  url: '',
  room: null,
  connected: false,
  inMatch: false,
  game: null,
  myTick: 0,
  queue: [],
  cfg: null,

  // 当前按键动作状态
  actions: {
    up: false, down: false, left: false, right: false,
    fire: false, skill: false, grenade: false, missile: false,
  },
  pressed: {},        // action -> Set(物理按键)
  events: [],         // 待发送的边沿事件
  inputTimer: null,
  listenersBound: false,

  // 回调(由 App 注册)
  cb: {},

  // ---------- 连接 ----------
  defaultUrl() {
    if (location.protocol === 'https:') return 'wss://' + location.host;
    if (location.protocol === 'http:' && location.host) return 'ws://' + location.host;
    return 'ws://localhost:8081';
  },

  connect(url, nick) {
    this.disconnect(true);
    this.nick = (nick || '玩家').slice(0, 12);
    this.url = url || this.defaultUrl();
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) {
      this.emit('status', '地址无效: ' + this.url);
      return;
    }
    this.ws = ws;
    this.emit('status', '连接中… ' + this.url);

    ws.onopen = () => {
      this.connected = true;
      this.send({ t: 'hello', nick: this.nick });
      this.emit('status', '已连接 ' + this.url);
      this.startHeartbeat();
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      this.handle(msg);
    };
    ws.onerror = () => {
      if (this.ws !== ws) return;
      this.emit('status', '连接失败,请确认服务器已启动');
    };
    ws.onclose = (ev) => {
      // 旧连接(如重复点击连接时被主动关闭)的事件不应影响当前连接
      if (this.ws !== ws) return;
      const wasMatch = this.inMatch;
      this.connected = false;
      this.ws = null;
      this.stopHeartbeat();
      this.emit('status', '已断开连接');
      this.room = null;
      if (wasMatch) this.stopMatch();
      this.emit('closed', wasMatch);
    };
  },

  disconnect(silent) {
    this.stopMatch();
    const old = this.ws;
    this.ws = null;
    if (old) {
      try { old.close(); } catch (e) { /* ignore */ }
    }
    this.connected = false;
    this.room = null;
    if (!silent) this.emit('status', '已断开连接');
  },

  send(msg) {
    if (!this.ws || this.ws.readyState !== 1) return;
    try { this.ws.send(JSON.stringify(msg)); } catch (e) { /* ignore */ }
  },

  emit(name, payload) {
    const fn = this.cb[name];
    if (typeof fn === 'function') fn(payload);
  },

  startHeartbeat() {
    this.stopHeartbeat();
    // 定时 ping + 输入心跳
    this.hbTimer = setInterval(() => {
      if (!this.connected) return;
      this.send({ t: 'ping', t0: Date.now() });
      if (this.inMatch) this.sendInput();
    }, 1000);
  },
  stopHeartbeat() {
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = null;
  },

  // ---------- 消息分发 ----------
  handle(msg) {
    switch (msg.t) {
      case 'hello':
        break;
      case 'welcome':
        this.id = msg.id;
        this.emit('welcome', msg);
        if (msg.rooms) this.emit('rooms', msg.rooms);
        break;
      case 'rooms':
        this.emit('rooms', msg.rooms);
        break;
      case 'room':
        this.room = msg.room;
        this.emit('room', msg.room);
        break;
      case 'start':
        this.emit('start', msg.config);
        break;
      case 'tick':
        if (this.inMatch) { this.queue.push(msg); this.drain(); }
        break;
      case 'error':
        this.emit('error', msg.msg);
        break;
      case 'desync':
        this.emit('desync', msg.tick);
        break;
      case 'pong':
        break;
      default:
        break;
    }
  },

  // ---------- 房间操作 ----------
  createRoom(code, name, password) {
    this.send({ t: 'createRoom', code, name, password, nick: this.nick });
  },
  joinRoom(roomId, password) {
    this.send({ t: 'joinRoom', roomId, password, nick: this.nick });
  },
  leaveRoom() { this.send({ t: 'leaveRoom' }); this.room = null; },
  setProfile(skin, talents) { this.send({ t: 'setProfile', skin, talents }); },
  setReady(ready) { this.send({ t: 'setReady', ready }); },
  setTeam(targetId, team) { this.send({ t: 'setTeam', targetId, team }); },
  setAICount(team, count) { this.send({ t: 'setAICount', team, count }); },
  setOptions(opts) { this.send({ t: 'setOptions', ...opts }); },
  selectMap(mapId, mapName, mapData) { this.send({ t: 'selectMap', mapId, mapName, mapData }); },
  requestStart() { this.send({ t: 'startGame' }); },
  roundEnd(winnerTeam) { this.send({ t: 'roundEnd', winnerTeam }); },
  backToLobby() { this.send({ t: 'backToLobby' }); },

  // ---------- 对局同步 ----------
  mpKeyMap(pid) {
    const base = 'mp:' + pid + ':';
    return {
      up: base + 'up', down: base + 'down', left: base + 'left', right: base + 'right',
      fire: base + 'fire', skill: base + 'skill', grenade: base + 'grenade', missile: base + 'missile',
    };
  },

  startMatch(cfg, game) {
    this.cfg = cfg;
    this.game = game;
    this.myTick = 0;
    this.queue = [];
    this.inMatch = true;
    this.bindKeys();
    this.sendInput();
  },

  stopMatch() {
    this.inMatch = false;
    this.queue = [];
    this.game = null;
    this.unbindKeys();
    if (this.inputTimer) clearInterval(this.inputTimer);
    this.inputTimer = null;
  },

  drain() {
    while (this.queue.length) {
      const m = this.queue[0];
      if (!this.game) { this.queue.length = 0; return; }
      if (m.tick < this.myTick) { this.queue.shift(); continue; }
      if (m.tick > this.myTick) this.myTick = m.tick;  // 少量丢包:快进对齐
      this.queue.shift();
      this.game.stepMP(m.inputs, m.events);
      this.myTick++;
      if (this.myTick % 60 === 0) {
        this.send({ t: 'sync', tick: this.myTick, hash: this.game.mpHash() });
      }
    }
  },

  // ---------- 按键 ----------
  keyActionMap: {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    Space: 'fire', Enter: 'fire',
    KeyB: 'skill', KeyL: 'skill',
    KeyG: 'grenade', Comma: 'grenade',
    KeyH: 'missile', Period: 'missile',
  },
  edgeActions: ['skill', 'grenade', 'missile'],

  bindKeys() {
    if (this.listenersBound) return;
    this.listenersBound = true;
    this._onKeyDown = (e) => {
      if (!this.inMatch) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const action = this.keyActionMap[e.code];
      if (!action) return;
      e.preventDefault();
      if (!this.pressed[action]) this.pressed[action] = new Set();
      const wasActive = this.pressed[action].size > 0;
      this.pressed[action].add(e.code);
      this.actions[action] = true;
      if (!wasActive && this.edgeActions.includes(action)) {
        this.events.push(action);
        this.sendInput();     // 边沿事件立即发送,降低延迟
      } else {
        this.sendInput();
      }
    };
    this._onKeyUp = (e) => {
      if (!this.inMatch) return;
      const action = this.keyActionMap[e.code];
      if (!action) return;
      if (this.pressed[action]) this.pressed[action].delete(e.code);
      this.actions[action] = this.pressed[action] && this.pressed[action].size > 0;
      this.sendInput();
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  },

  unbindKeys() {
    if (!this.listenersBound) return;
    this.listenersBound = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  },

  sendInput() {
    if (!this.inMatch) return;
    const msg = { t: 'input', a: this.actions };
    if (this.events.length) {
      msg.e = this.events.slice();
      this.events = [];
    }
    this.send(msg);
  },
};
