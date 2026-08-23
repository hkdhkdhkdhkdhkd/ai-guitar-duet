// 武器系统: 手榴弹 + 追踪导弹
// 手榴弹: 抛物线飞行,落地爆炸,范围伤害+毁砖,可被子弹击毁
// 追踪导弹: 追踪敌方坦克,可被子弹击毁

// 手榴弹
class Grenade {
  constructor(x, y, dir, owner, color) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.owner = owner;
    this.color = color;
    this.speed = 3.5;
    this.radius = 4;
    this.dead = false;
    this.fuse = 90;          // 引信: 1.5 秒后自爆
    this.maxRange = 5 * CELL; // 最大飞行距离
    this.traveled = 0;
    this.trail = [];
    this.exploded = false;
    this.damage = 2;        // 爆炸伤害
    this.blastRadius = CELL * 1.5; // 爆炸半径
  }

  update(game) {
    if (this.dead) return;
    const v = DIR_VEC[this.dir];
    const nx = this.x + v.x * this.speed;
    const ny = this.y + v.y * this.speed;

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 5) this.trail.shift();

    // 引信倒计时
    this.fuse--;
    if (this.fuse <= 0) {
      this.detonate(game);
      return;
    }

    // 距离限制
    this.traveled += this.speed;
    if (this.traveled >= this.maxRange) {
      this.detonate(game);
      return;
    }

    // 碰墙:提前爆炸
    const cellX = Math.floor(nx / CELL);
    const cellY = Math.floor(ny / CELL);
    if (cellX >= 0 && cellX < GRID_W && cellY >= 0 && cellY < GRID_H) {
      const cv = game.grid[cellY][cellX];
      if (cv !== 0) {
        this.detonate(game);
        return;
      }
    } else {
      this.detonate(game);
      return;
    }

    this.x = nx;
    this.y = ny;

    // 被子弹击毁
    for (const b of game.bullets) {
      if (b.dead) continue;
      const dx = this.x - b.x, dy = this.y - b.y;
      if (dx * dx + dy * dy < (this.radius + b.radius + 2) ** 2) {
        this.dead = true;
        game.spawnExplosion(this.x, this.y, 'spark');
        SFX.play('spark');
        return;
      }
    }
  }

  // 爆炸: 范围 1.5 格,伤害 2,毁砖
  detonate(game) {
    if (this.exploded) return;
    this.exploded = true;
    this.dead = true;
    const r = this.blastRadius || CELL * 1.5;
    const dmg = this.damage || 2;
    // 伤害坦克
    for (const t of game.tanks) {
      if (!t.alive) continue;
      const dx = t.x - this.x, dy = t.y - this.y;
      if (dx * dx + dy * dy < r * r) {
        const before = t.hp;
        if (t.shieldTimer > 0) {
          // 护盾格挡但仍消耗
          t.shieldTimer = Math.max(0, t.shieldTimer - 60);
        } else if (t.hit(dmg)) {
          game.onTankHit(t, before, dmg);
        }
      }
    }
    // 摧毁砖墙
    const cx = Math.floor(this.x / CELL);
    const cy = Math.floor(this.y / CELL);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gy = cy + dy;
        if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) continue;
        if (game.grid[gy][gx] === 1) {
          game.grid[gy][gx] = 0;
          game.spawnExplosion(gx * CELL + CELL / 2, gy * CELL + CELL / 2, 'brick');
        }
      }
    }
    // 爆炸特效
    game.spawnExplosion(this.x, this.y, 'hit');
    game.spawnExplosion(this.x, this.y, 'brick');
    SFX.play('explode');
    game.notifyHp();
  }

  draw(ctx) {
    if (this.dead) return;
    // 拖尾
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      ctx.globalAlpha = (i + 1) / this.trail.length * 0.4;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.radius * (i + 1) / this.trail.length, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 主体
    const blink = this.fuse < 30 && Math.floor(this.fuse / 4) % 2 === 0;
    ctx.fillStyle = blink ? '#ef4444' : '#374151';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.beginPath();
    ctx.arc(this.x - 1, this.y - 1, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 追踪导弹
class Missile {
  constructor(x, y, dir, owner, color) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.owner = owner;
    this.color = color;
    this.speed = 2.2;
    this.radius = 5;
    this.damage = 3;
    this.dead = false;
    this.fuse = 60 * 8;       // 8 秒后自毁
    this.turnRate = 0.08;     // 转向速率
    this.trail = [];
    this.angle = dir * Math.PI / 2;  // 当前角度(弧度)
    this.penetrateWall = false; // 阿帕奇地狱火:穿透墙壁
  }

  update(game) {
    if (this.dead) return;
    this.fuse--;
    if (this.fuse <= 0) {
      this.detonate(game);
      return;
    }

    // 追踪: 找最近的存活敌方坦克
    let target = null, bestDist = Infinity;
    for (const t of game.tanks) {
      if (t.player === this.owner || !t.alive) continue;
      const d = (t.x - this.x) ** 2 + (t.y - this.y) ** 2;
      if (d < bestDist) { bestDist = d; target = t; }
    }
    if (target) {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const targetAngle = Math.atan2(dy, dx);
      // 平滑转向
      let diff = targetAngle - this.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.angle += diff * this.turnRate;
    }

    const vx = Math.cos(this.angle) * this.speed;
    const vy = Math.sin(this.angle) * this.speed;
    const nx = this.x + vx;
    const ny = this.y + vy;

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 10) this.trail.shift();

    // 越界
    if (nx < 0 || ny < 0 || nx > GRID_W * CELL || ny > GRID_H * CELL) {
      this.detonate(game);
      return;
    }

    // 碰墙:爆炸(穿透型导弹除外)
    const cellX = Math.floor(nx / CELL);
    const cellY = Math.floor(ny / CELL);
    if (cellX >= 0 && cellX < GRID_W && cellY >= 0 && cellY < GRID_H) {
      const cv = game.grid[cellY][cellX];
      if (cv !== 0 && !this.penetrateWall) {
        this.detonate(game);
        return;
      }
    }

    this.x = nx;
    this.y = ny;

    // 击中坦克
    for (const t of game.tanks) {
      if (!t.alive || t.player === this.owner) continue;
      const dx = this.x - t.x, dy = this.y - t.y;
      if (Math.abs(dx) < t.half + 2 && Math.abs(dy) < t.half + 2) {
        this.detonate(game);
        return;
      }
    }

    // 被子弹击毁
    for (const b of game.bullets) {
      if (b.dead) continue;
      const dx = this.x - b.x, dy = this.y - b.y;
      if (dx * dx + dy * dy < (this.radius + b.radius + 2) ** 2) {
        this.detonate(game);
        return;
      }
    }
  }

  // 爆炸: 范围 2 格,伤害 3,毁砖
  detonate(game) {
    if (this.dead) return;
    this.dead = true;
    const r = CELL * 2;
    for (const t of game.tanks) {
      if (!t.alive) continue;
      const dx = t.x - this.x, dy = t.y - this.y;
      if (dx * dx + dy * dy < r * r) {
        const before = t.hp;
        const dmg = this.damage || 3;
        if (t.hit(dmg)) {
          game.onTankHit(t, before, dmg);
        }
      }
    }
    // 摧毁砖墙
    const cx = Math.floor(this.x / CELL);
    const cy = Math.floor(this.y / CELL);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gy = cy + dy;
        if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) continue;
        if (game.grid[gy][gx] === 1) {
          game.grid[gy][gx] = 0;
          game.spawnExplosion(gx * CELL + CELL / 2, gy * CELL + CELL / 2, 'brick');
        }
      }
    }
    game.spawnExplosion(this.x, this.y, 'hit');
    game.spawnExplosion(this.x, this.y, 'brick');
    SFX.play('missile_hit');
    game.notifyHp();
  }

  draw(ctx) {
    if (this.dead) return;
    // 火焰拖尾
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      const a = (i + 1) / this.trail.length;
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = i < this.trail.length / 2 ? '#ef4444' : '#fbbf24';
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.radius * a * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 导弹主体
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    // 弹体
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius + 2, this.radius - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 弹头
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(this.radius, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    // 尾翼火焰
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(-this.radius - 1, -2);
    ctx.lineTo(-this.radius - 5, 0);
    ctx.lineTo(-this.radius - 1, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// 喷火坦克的火焰流
// 射程 N 格、持续飞行、碰方块即停(砖墙被烧毁)、对坦克持续伤害(每帧可触发,但 hit 后坦克 30 帧无敌)
class Flame {
  constructor(x, y, dir, owner, color, damage, rangeCells) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.owner = owner;
    this.color = color || '#f97316';
    this.damage = damage || 1;
    this.speed = 6;
    this.maxRange = (rangeCells || 3) * CELL;
    this.traveled = 0;
    this.radius = 6;
    this.dead = false;
    this.life = 24;        // 火焰粒子存活帧(短,形成喷射流)
    this.t = Math.random() * Math.PI * 2;
  }

  update(game) {
    if (this.dead) return;
    this.t += 0.5;
    this.life--;
    if (this.life <= 0) { this.dead = true; return; }

    const v = DIR_VEC[this.dir];
    const step = this.speed;
    const nx = this.x + v.x * step;
    const ny = this.y + v.y * step;
    this.traveled += step;

    // 越界
    if (nx < 0 || ny < 0 || nx > GRID_W * CELL || ny > GRID_H * CELL) {
      this.dead = true; return;
    }
    // 射程
    if (this.traveled >= this.maxRange) { this.dead = true; return; }

    // 碰方块
    const cellX = Math.floor(nx / CELL);
    const cellY = Math.floor(ny / CELL);
    if (cellX >= 0 && cellX < GRID_W && cellY >= 0 && cellY < GRID_H) {
      const cv = game.grid[cellY][cellX];
      if (cv !== 0) {
        // 砖墙:被烧毁
        if (cv === 1) {
          game.grid[cellY][cellX] = 0;
          game.spawnExplosion(cellX * CELL + CELL / 2, cellY * CELL + CELL / 2, 'brick');
          SFX.play('brick');
        }
        // 单向方块: 方向匹配则穿过,否则被挡
        if (cv >= 3 && cv <= 6 && this.dir === cv - 3) {
          // 穿过
        } else {
          this.dead = true; return;
        }
      }
    }

    this.x = nx; this.y = ny;

    // 击中坦克(每帧检测,坦克 hit 后会获得 30 帧无敌避免一帧多次掉血)
    for (const t of game.tanks) {
      if (!t.alive || t.player === this.owner) continue;
      const dx = this.x - t.x, dy = this.y - t.y;
      if (Math.abs(dx) < t.half + this.radius && Math.abs(dy) < t.half + this.radius) {
        const before = t.hp;
        if (t.hit(this.damage)) {
          game.spawnExplosion(this.x, this.y, 'hit');
          SFX.play('hit');
          game.onTankHit(t, before, this.damage);
        }
        // 火焰不消失,继续向前喷射
      }
    }

    // 被敌方炮弹抵消(火与子弹对撞消失)
    for (const b of game.bullets) {
      if (b.dead || b.owner === this.owner) continue;
      const dx = this.x - b.x, dy = this.y - b.y;
      if (dx * dx + dy * dy < (this.radius + b.radius) ** 2) {
        this.dead = true;
        game.spawnExplosion(this.x, this.y, 'spark');
        return;
      }
    }
  }

  draw(ctx) {
    if (this.dead) return;
    const fade = Math.min(1, this.life / 24);
    const pulse = 1 + Math.sin(this.t) * 0.2;
    // 外焰(红)
    ctx.globalAlpha = 0.45 * fade;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 1.9 * pulse, 0, Math.PI * 2);
    ctx.fill();
    // 中焰(橙)
    ctx.globalAlpha = 0.7 * fade;
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 1.3 * pulse, 0, Math.PI * 2);
    ctx.fill();
    // 内焰(黄)
    ctx.globalAlpha = 0.9 * fade;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.8 * pulse, 0, Math.PI * 2);
    ctx.fill();
    // 高光核心(白)
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.35 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
