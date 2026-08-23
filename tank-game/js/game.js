// 游戏引擎
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.grid = null;
    this.tanks = [];
    this.bullets = [];
    this.particles = [];
    this.powerups = [];
    this.grenades = [];
    this.missiles = [];
    this.flames = [];
    this.keys = {};
    this.running = false;
    this.lastTime = 0;
    this.rafId = null;
    this.mapName = '';
    this.onGameOver = null;
    this.onHpChange = null;
    this.onState = null;     // 每帧状态(血量/技能/buff)
    this.onLog = null;
    this.winner = null;
    this.bounce = false;
    this.powerupsEnabled = true;
    this.frame = 0;
    this.powerupTimer = 60 * 6;   // 首次刷新
    this.ai = null;              // 兼容旧字段
    this.aiEnabled = false;      // 兼容旧字段
    this.ais = [];               // 多 AI 实例
    this.aiDifficulty = 'normal';
    this.winningTeam = null;
  }

  loadMap(mapData) {
    const parsed = parseMap(mapData.rows);
    this.grid = parsed.grid;
    this.spawn1 = parsed.spawn1;
    this.spawn2 = parsed.spawn2;
    this.mapName = mapData.name || '未命名地图';
  }

  // 多坦克配置入口
  // teamConfigs: { 1: [cfg, cfg, ...], 2: [cfg, cfg, ...] } 每队最多 5 个
  // cfg: { color, skin, talents, isHuman }
  // opts: { bounce, powerups, aiDifficulty(用于 AI 坦克的难度) }
  setupTanks(teamConfigs, opts) {
    opts = opts || {};
    this.bounce = !!opts.bounce;
    this.powerupsEnabled = opts.powerups !== false;
    this.aiDifficulty = opts.aiDifficulty || 'normal';

    // 生成两方出生点列表(BFS)
    const n1 = (teamConfigs[1] || []).length || 1;
    const n2 = (teamConfigs[2] || []).length || 1;
    const spawns1 = expandSpawns(this.grid, this.spawn1, n1, []);
    const spawns2 = expandSpawns(this.grid, this.spawn2, n2, spawns1);

    const P1_KEYS = {
      up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', fire: 'Space', skill: 'KeyB',
      grenade: 'KeyG', missile: 'KeyH'
    };
    const P2_KEYS = {
      up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: 'Enter', skill: 'KeyL',
      grenade: 'Comma', missile: 'Period'
    };

    this.tanks = [];
    this.ais = [];

    const build = (player, list, spawns, keys) => {
      for (let i = 0; i < list.length; i++) {
        const cfg = list[i];
        const sp = spawns[i] || spawns[spawns.length - 1];
        const t = new Tank(player, sp.x, sp.y, cfg.color, cfg.skin,
          player === 1 ? P1_KEYS : P2_KEYS,
          cfg.talents, !!cfg.isHuman);
        t.indexInTeam = i;
        t.dir = player === 1 ? DIR.RIGHT : DIR.LEFT;
        this.tanks.push(t);
        // 非人类坦克 = AI
        if (!cfg.isHuman) {
          this.ais.push(new TankAI(this.aiDifficulty, this, t));
        }
      }
    };

    build(1, teamConfigs[1] || [], spawns1, P1_KEYS);
    build(2, teamConfigs[2] || [], spawns2, P2_KEYS);

    this.bullets = [];
    this.particles = [];
    this.powerups = [];
    this.grenades = [];
    this.missiles = [];
    this.flames = [];
    this.winner = null;
    this.winningTeam = null;
    this.frame = 0;
    this.powerupTimer = 60 * 6;

    // 兼容旧字段
    this.ai = null;
    this.aiEnabled = false;

    this.notifyHp();
    this.notifyState();
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  loop = (time) => {
    if (!this.running) return;
    this.update();
    this.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  update() {
    // 玩家死亡接管期间暂停模拟(等待 UI 选择)
    if (this.pendingTakeover) return;
    this.frame++;
    // 所有 AI 先于坦克更新(设置按键)
    for (const ai of this.ais) ai.update();
    for (const t of this.tanks) t.update(this.keys, this);
    for (const b of this.bullets) b.update(this);
    this.bullets = this.bullets.filter(b => !b.dead);
    for (const g of this.grenades) g.update(this);
    this.grenades = this.grenades.filter(g => !g.dead);
    for (const m of this.missiles) m.update(this);
    this.missiles = this.missiles.filter(m => !m.dead);
    for (const f of this.flames) f.update(this);
    this.flames = this.flames.filter(f => !f.dead);
    for (const p of this.particles) p.update();
    this.particles = this.particles.filter(p => !p.dead);
    for (const pu of this.powerups) pu.update(this);
    this.powerups = this.powerups.filter(pu => !pu.dead);

    // 道具刷新
    if (this.powerupsEnabled) {
      this.powerupTimer--;
      if (this.powerupTimer <= 0 && this.powerups.length < 3) {
        this.spawnPowerUp();
        this.powerupTimer = 60 * 8;   // 8 秒
      }
    }

    // 状态回调(每 3 帧)
    if (this.frame % 3 === 0) this.notifyState();

    // 胜负判定:按队伍判定(一方全灭则另一方胜)
    if (!this.winningTeam) {
      const t1Alive = this.tanks.some(t => t.player === 1 && t.alive);
      const t2Alive = this.tanks.some(t => t.player === 2 && t.alive);
      if (!t1Alive || !t2Alive) {
        this.winningTeam = !t1Alive && !t2Alive ? 0 : (!t1Alive ? 2 : 1);
        const win = this.winningTeam;
        const w = win === 0 ? null : this.tanks.find(t => t.player === win && t.alive);
        this.winner = w;
        if (win !== 0) SFX.play(win === 1 ? 'win' : 'lose');
        setTimeout(() => {
          if (!this.running || this.winningTeam !== win) return;
          this.onGameOver && this.onGameOver(w);
        }, 600);
      }
    }
  }

  spawnPowerUp() {
    // 随机选一个空格子(非出生点、非坦克、非已有道具)
    const occupied = new Set();
    for (const pu of this.powerups) occupied.add(pu.gx + ',' + pu.gy);
    for (const t of this.tanks) {
      if (t.alive) occupied.add(Math.floor(t.x / CELL) + ',' + Math.floor(t.y / CELL));
    }
    const candidates = [];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (this.grid[y][x] !== 0) continue;
        if ((this.spawn1.x === x && this.spawn1.y === y) || (this.spawn2.x === x && this.spawn2.y === y)) continue;
        if (occupied.has(x + ',' + y)) continue;
        candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const kind = POWERUP_KINDS[Math.floor(Math.random() * POWERUP_KINDS.length)];
    this.powerups.push(new PowerUp(pick.x, pick.y, kind));
  }

  render() {
    const ctx = this.ctx;
    drawBackground(ctx);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (this.grid[y][x] !== 0) drawBlock(ctx, x, y, this.grid[y][x]);
      }
    }
    this.drawSpawn(ctx, this.spawn1, 'rgba(239,68,68,.08)');
    this.drawSpawn(ctx, this.spawn2, 'rgba(59,130,246,.08)');
    for (const pu of this.powerups) pu.draw(ctx);
    for (const t of this.tanks) t.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    for (const g of this.grenades) g.draw(ctx);
    for (const m of this.missiles) m.draw(ctx);
    for (const f of this.flames) f.draw(ctx);
    for (const p of this.particles) p.draw(ctx);
  }

  drawSpawn(ctx, sp, color) {
    ctx.fillStyle = color;
    ctx.fillRect(sp.x * CELL + 2, sp.y * CELL + 2, CELL - 4, CELL - 4);
  }

  spawnExplosion(x, y, kind) {
    this.particles.push(new Particle(x, y, kind));
  }

  onTankHit(tank, before, damage) {
    this.notifyHp();
    // 检测玩家坦克死亡:之前还活着,现在 hp<=0
    if (tank.isHuman && before > 0 && tank.hp <= 0) {
      // 等待玩家选择接管,暂停游戏
      this.pendingTakeover = tank;
      if (this.onPlayerDied) this.onPlayerDied(tank);
    }
  }

  // 玩家接管某辆同方存活坦克
  takeover(targetTank) {
    if (!targetTank || !targetTank.alive) return;
    const oldHuman = this.pendingTakeover;
    if (oldHuman) oldHuman.isHuman = false;
    targetTank.isHuman = true;
    // 清除目标坦克上的 AI 实例,避免重复控制
    this.ais = this.ais.filter(ai => ai.tank !== targetTank);
    this.pendingTakeover = null;
    this.notifyHp();
    this.notifyState();
  }

  notifyHp() {
    if (this.onHpChange) {
      this.onHpChange(this.tanks.map(t => ({
        player: t.player,
        indexInTeam: t.indexInTeam,
        isHuman: t.isHuman,
        hp: t.hp, maxHp: t.maxHp, alive: t.alive,
        skin: t.skin, color: t.color
      })));
    }
  }

  notifyState() {
    if (!this.onState) return;
    this.onState(this.tanks.map(t => ({
      player: t.player,
      indexInTeam: t.indexInTeam,
      isHuman: t.isHuman,
      skin: t.skin,
      color: t.color,
      hp: Math.max(0, Math.ceil(t.hp)),
      maxHp: t.maxHp,
      alive: t.alive,
      skillName: SKILL_DEF[t.skin].name,
      skillDesc: SKILL_DEF[t.skin].desc,
      skillCd: Math.ceil(t.skillCd / 60),
      skillReady: t.skillCd <= 0,
      grenades: t.grenades,
      missiles: t.missiles,
      buffs: {
        rapid: t.rapidTimer > 0 ? Math.ceil(t.rapidTimer / 60) : 0,
        power: t.powerTimer > 0 ? Math.ceil(t.powerTimer / 60) : 0,
        speed: t.speedTimer > 0 ? Math.ceil(t.speedTimer / 60) : 0,
        shield: t.shieldTimer > 0 ? Math.ceil(t.shieldTimer / 60) : 0,
        dash: t.dashTimer > 0 ? Math.ceil(t.dashTimer / 60) : 0,
        flameBoost: t.flameBoostTimer > 0 ? Math.ceil(t.flameBoostTimer / 60) : 0,
        damageReduction: t.damageReductionTimer > 0 ? Math.ceil(t.damageReductionTimer / 60) : 0,
        reflect: t.reflectTimer > 0 ? Math.ceil(t.reflectTimer / 60) : 0,
      },
    })));
  }

  setKey(code, down) {
    this.keys[code] = down;
  }
}
