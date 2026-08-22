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
    this.ai = null;              // 人机 AI 实例
    this.aiEnabled = false;      // 是否人机模式
  }

  loadMap(mapData) {
    const parsed = parseMap(mapData.rows);
    this.grid = parsed.grid;
    this.spawn1 = parsed.spawn1;
    this.spawn2 = parsed.spawn2;
    this.mapName = mapData.name || '未命名地图';
  }

  setupTanks(p1Config, p2Config, opts) {
    opts = opts || {};
    this.bounce = !!opts.bounce;
    this.powerupsEnabled = opts.powerups !== false;
    this.aiEnabled = !!opts.ai;
    const t1 = new Tank(1, this.spawn1.x, this.spawn1.y, p1Config.color, p1Config.skin, {
      up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', fire: 'Space', skill: 'KeyB',
      grenade: 'KeyG', missile: 'KeyH'
    }, p1Config.talents);
    const t2 = new Tank(2, this.spawn2.x, this.spawn2.y, p2Config.color, p2Config.skin, {
      up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: 'Enter', skill: 'KeyL',
      grenade: 'Comma', missile: 'Period'
    }, p2Config.talents);
    t1.dir = DIR.RIGHT;
    t2.dir = DIR.LEFT;
    this.tanks = [t1, t2];
    this.bullets = [];
    this.particles = [];
    this.powerups = [];
    this.grenades = [];
    this.missiles = [];
    this.winner = null;
    this.frame = 0;
    this.powerupTimer = 60 * 6;

    // 初始化 AI
    if (this.aiEnabled && opts.aiDifficulty) {
      this.ai = new TankAI(opts.aiDifficulty, this);
    } else {
      this.ai = null;
    }

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
    this.frame++;
    // AI 先于坦克更新(设置按键)
    if (this.ai) this.ai.update();
    for (const t of this.tanks) t.update(this.keys, this);
    for (const b of this.bullets) b.update(this);
    this.bullets = this.bullets.filter(b => !b.dead);
    for (const g of this.grenades) g.update(this);
    this.grenades = this.grenades.filter(g => !g.dead);
    for (const m of this.missiles) m.update(this);
    this.missiles = this.missiles.filter(m => !m.dead);
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

    // 胜负判定
    if (!this.winner) {
      const alive = this.tanks.filter(t => t.alive);
      if (alive.length <= 1) {
        this.winner = alive.length === 1 ? alive[0] : null;
        const w = this.winner;
        if (w) SFX.play(w.player === 1 ? 'win' : 'lose');
        setTimeout(() => {
          if (!this.running || this.winner !== w) return;
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
  }

  notifyHp() {
    if (this.onHpChange) {
      this.onHpChange(this.tanks.map(t => ({ player: t.player, hp: t.hp, maxHp: t.maxHp, alive: t.alive })));
    }
  }

  notifyState() {
    if (!this.onState) return;
    this.onState(this.tanks.map(t => ({
      player: t.player,
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
      },
    })));
  }

  setKey(code, down) {
    this.keys[code] = down;
  }
}
