// 武器系统: 手榴弹 + 追踪导弹
// 手榴弹: 抛物线飞行,落地爆炸,范围伤害+毁砖,可被子弹击毁
// 追踪导弹: 追踪敌方坦克,可被子弹击毁

const DEFAULT_CELL = 30; // 默认格子大小(向后兼容)

// 手榴弹
class Grenade {
  constructor(x, y, dir, owner, color, cell) {
    cell = cell || DEFAULT_CELL;
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.owner = owner;
    this.color = color;
    this.speed = 3.5;
    this.radius = 4;
    this.dead = false;
    this.fuse = 90;          // 引信: 1.5 秒后自爆
    this.maxRange = 5 * cell; // 最大飞行距离
    this.traveled = 0;
    this.trail = [];
    this.exploded = false;
    this.damage = 2;        // 爆炸伤害
    this.blastRadius = cell * 1.5; // 爆炸半径
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
    const cell = game.cell;
    const cellX = Math.floor(nx / cell);
    const cellY = Math.floor(ny / cell);
    if (cellX >= 0 && cellX < game.gridW && cellY >= 0 && cellY < game.gridH) {
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
    const cell = game.cell;
    const r = this.blastRadius || cell * 1.5;
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
    const cx = Math.floor(this.x / cell);
    const cy = Math.floor(this.y / cell);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gy = cy + dy;
        if (gx < 0 || gx >= game.gridW || gy < 0 || gy >= game.gridH) continue;
        if (game.grid[gy][gx] === 1) {
          game.grid[gy][gx] = 0;
          game.spawnExplosion(gx * cell + cell / 2, gy * cell + cell / 2, 'brick');
        }
      }
    }
    // 伤害敌方防御武器
    for (const m of game.mortars || []) {
      if (m.dead || m.owner === this.owner) continue;
      const dx = m.x - this.x, dy = m.y - this.y;
      if (dx * dx + dy * dy < r * r) {
        m.takeDamage(dmg, game);
      }
    }
    for (const g of game.italianGuns || []) {
      if (g.dead || g.owner === this.owner) continue;
      const dx = g.x - this.x, dy = g.y - this.y;
      if (dx * dx + dy * dy < r * r) {
        g.takeDamage(dmg, game);
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
    const cw = game.gridW * game.cell;
    const ch = game.gridH * game.cell;
    if (nx < 0 || ny < 0 || nx > cw || ny > ch) {
      this.detonate(game);
      return;
    }

    // 碰墙:爆炸(穿透型导弹除外)
    const cell = game.cell;
    const cellX = Math.floor(nx / cell);
    const cellY = Math.floor(ny / cell);
    if (cellX >= 0 && cellX < game.gridW && cellY >= 0 && cellY < game.gridH) {
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
    const cell = game.cell;
    const r = cell * 2;
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
    const cx = Math.floor(this.x / cell);
    const cy = Math.floor(this.y / cell);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gy = cy + dy;
        if (gx < 0 || gx >= game.gridW || gy < 0 || gy >= game.gridH) continue;
        if (game.grid[gy][gx] === 1) {
          game.grid[gy][gx] = 0;
          game.spawnExplosion(gx * cell + cell / 2, gy * cell + cell / 2, 'brick');
        }
      }
    }
    // 伤害敌方防御武器
    for (const m of game.mortars || []) {
      if (m.dead || m.owner === this.owner) continue;
      const dx = m.x - this.x, dy = m.y - this.y;
      if (dx * dx + dy * dy < r * r) {
        m.takeDamage(dmg, game);
      }
    }
    for (const g of game.italianGuns || []) {
      if (g.dead || g.owner === this.owner) continue;
      const dx = g.x - this.x, dy = g.y - this.y;
      if (dx * dx + dy * dy < r * r) {
        g.takeDamage(dmg, game);
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

// ========== 防御武器:迫击炮 ==========

// 迫击炮弹:抛物线飞行,从天而降,不受墙壁阻挡
class MortarShell {
  constructor(startX, startY, targetX, targetY, owner, cell) {
    cell = cell || DEFAULT_CELL;
    this.startX = startX;
    this.startY = startY;
    this.targetX = targetX;
    this.targetY = targetY;
    this.x = startX;
    this.y = startY;
    this.owner = owner;
    this.flightTime = 90;    // 飞行 1.5 秒
    this.elapsed = 0;
    this.arcHeight = 120;    // 抛物线高度(像素)
    this.radius = 5;
    this.dead = false;
    this.damage = 3;
    this.blastRadius = cell * 2;
    this.trail = [];
  }

  update(game) {
    if (this.dead) return;
    this.elapsed++;
    const t = this.elapsed / this.flightTime;

    // 记录拖尾(上一帧位置)
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 8) this.trail.shift();

    // 水平方向:匀速
    const px = this.startX + (this.targetX - this.startX) * t;
    // 垂直方向:加上抛物线偏移(用 sin 模拟弧线)
    const py = this.startY + (this.targetY - this.startY) * t
             - this.arcHeight * Math.sin(Math.PI * t);

    this.x = px;
    this.y = py;

    // 到达目标
    if (this.elapsed >= this.flightTime) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.detonate(game);
    }
  }

  detonate(game) {
    if (this.dead) return;
    this.dead = true;
    // 范围伤害坦克
    for (const t of game.tanks) {
      if (!t.alive) continue;
      const dx = t.x - this.x, dy = t.y - this.y;
      if (dx * dx + dy * dy < this.blastRadius * this.blastRadius) {
        const before = t.hp;
        if (t.shieldTimer > 0) {
          t.shieldTimer = Math.max(0, t.shieldTimer - 60);
        } else if (t.hit(this.damage)) {
          game.onTankHit(t, before, this.damage);
        }
      }
    }
    // 摧毁砖墙(2 格范围)
    const cx = Math.floor(this.x / game.cell);
    const cy = Math.floor(this.y / game.cell);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 4) continue; // 圆形范围
        const gx = cx + dx, gy = cy + dy;
        if (gx < 0 || gx >= game.gridW || gy < 0 || gy >= game.gridH) continue;
        if (game.grid[gy][gx] === 1) {
          game.grid[gy][gx] = 0;
          game.spawnExplosion(gx * game.cell + game.cell / 2, gy * game.cell + game.cell / 2, 'brick');
        }
      }
    }
    // 伤害敌方迫击炮/意大利炮
    for (const m of game.mortars || []) {
      if (m.dead || m.owner === this.owner) continue;
      const dx = m.x - this.x, dy = m.y - this.y;
      if (dx * dx + dy * dy < this.blastRadius * this.blastRadius) {
        m.takeDamage(this.damage, game);
      }
    }
    for (const g of game.italianGuns || []) {
      if (g.dead || g.owner === this.owner) continue;
      const dx = g.x - this.x, dy = g.y - this.y;
      if (dx * dx + dy * dy < this.blastRadius * this.blastRadius) {
        g.takeDamage(this.damage, game);
      }
    }
    game.spawnExplosion(this.x, this.y, 'hit');
    game.spawnExplosion(this.x, this.y, 'brick');
    SFX.play('mortar_hit');
    game.notifyHp();
  }

  draw(ctx) {
    if (this.dead) return;
    // 拖尾
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      ctx.globalAlpha = (i + 1) / this.trail.length * 0.5;
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.radius * 0.6 * (i + 1) / this.trail.length, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 弹体
    ctx.fillStyle = '#374151';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 弹尖(朝运动方向)
    const t = this.elapsed / this.flightTime;
    const vx = this.targetX - this.startX;
    const vy = (this.targetY - this.startY) - this.arcHeight * Math.PI * Math.cos(Math.PI * t) / this.flightTime * this.flightTime;
    // 简化:尾焰效果
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(this.x, this.y + 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 迫击炮:固定防御武器,自动攻击射程内敌方坦克
class Mortar {
  constructor(gridX, gridY, dir, owner, cell) {
    cell = cell || DEFAULT_CELL;
    this.gx = gridX;
    this.gy = gridY;
    this.x = gridX * cell + cell / 2;
    this.y = gridY * cell + cell / 2;
    this.dir = dir;       // 朝向(一般朝敌方方向)
    this.owner = owner;   // 1 或 2
    this.hp = 5;
    this.maxHp = 5;
    this.dead = false;
    this.cooldown = 0;
    this.cooldownMax = 180;  // 3 秒冷却
    this.minRange = 10 * cell; // 最小射程 10 格
    this.maxRange = 15 * cell; // 最大射程 15 格
    this.radius = 12;      // 碰撞半径
    this.barrelAngle = 0;  // 炮管角度(用于瞄准)
    this.fireAnim = 0;     // 开火动画
  }

  update(game) {
    if (this.dead) return;
    if (this.cooldown > 0) this.cooldown--;
    if (this.fireAnim > 0) this.fireAnim--;

    // 寻找射程内最近的敌方坦克
    let target = null, bestDist = Infinity;
    for (const t of game.tanks) {
      if (!t.alive || t.player === this.owner) continue;
      const dx = t.x - this.x, dy = t.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= this.minRange && dist <= this.maxRange && dist < bestDist) {
        bestDist = dist;
        target = t;
      }
    }

    if (target) {
      // 炮管缓慢瞄准
      const targetAngle = Math.atan2(target.y - this.y, target.x - this.x);
      let diff = targetAngle - this.barrelAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.barrelAngle += diff * 0.05;

      // 冷却完毕,开火
      if (this.cooldown <= 0) {
        this.fire(game, target.x, target.y);
      }
    }

    // 被子弹击毁检测
    for (const b of game.bullets) {
      if (b.dead || b.owner === this.owner) continue;
      const dx = this.x - b.x, dy = this.y - b.y;
      if (dx * dx + dy * dy < (this.radius + b.radius) ** 2) {
        b.dead = true;
        this.takeDamage(1, game);
        return;
      }
    }
    // 被手榴弹/导弹爆炸伤害在各武器的 detonate 中处理
  }

  fire(game, targetX, targetY) {
    this.cooldown = this.cooldownMax;
    this.fireAnim = 10;
    const shell = new MortarShell(this.x, this.y - 10, targetX, targetY, this.owner);
    if (!game.mortarShells) game.mortarShells = [];
    game.mortarShells.push(shell);
    SFX.play('mortar_fire');
    game.spawnExplosion(this.x, this.y - 8, 'small');
  }

  takeDamage(dmg, game) {
    if (this.dead) return;
    this.hp -= dmg;
    game.spawnExplosion(this.x, this.y, 'spark');
    if (this.hp <= 0) {
      this.dead = true;
      game.spawnExplosion(this.x, this.y, 'hit');
      game.spawnExplosion(this.x, this.y, 'brick');
      SFX.play('explode');
    }
  }

  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x, this.y);

    // 底座(圆形装甲)
    const baseColor = this.owner === 1 ? '#991b1b' : '#1e3a8a';
    const baseLight = this.owner === 1 ? '#dc2626' : '#3b82f6';
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 底座高光
    ctx.fillStyle = baseLight;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(-3, -3, this.radius - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 旋转炮管
    ctx.save();
    ctx.rotate(this.barrelAngle);
    const recoil = this.fireAnim > 0 ? -this.fireAnim * 0.3 : 0;
    // 炮管底座
    ctx.fillStyle = '#4b5563';
    ctx.beginPath();
    ctx.arc(recoil, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 炮管
    ctx.fillStyle = '#374151';
    ctx.fillRect(recoil, -3, 16, 6);
    ctx.strokeStyle = '#1f2937';
    ctx.strokeRect(recoil, -3, 16, 6);
    // 炮口
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(recoil + 14, -4, 3, 8);
    ctx.restore();

    // 血条
    if (this.hp < this.maxHp) {
      const bw = 20, bh = 3;
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(-bw / 2, -this.radius - 8, bw, bh);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(-bw / 2, -this.radius - 8, bw * (this.hp / this.maxHp), bh);
    }

    ctx.restore();
  }
}

// ========== 防御武器:意大利炮 ==========

// 意大利炮炮弹:高速直射,可穿砖墙不可穿钢板
class CannonShell {
  constructor(x, y, dir, owner) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.owner = owner;
    this.speed = 8;       // 高速
    this.radius = 5;
    this.dead = false;
    this.damage = 4;
    this.trail = [];
  }

  update(game) {
    if (this.dead) return;
    const v = DIR_VEC[this.dir];
    const nx = this.x + v.x * this.speed;
    const ny = this.y + v.y * this.speed;

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();

    // 越界
    if (nx < 0 || ny < 0 || nx > game.gridW * game.cell || ny > game.gridH * game.cell) {
      this.dead = true;
      return;
    }

    // 碰墙:可穿砖墙,被钢板挡
    const cellX = Math.floor(nx / game.cell);
    const cellY = Math.floor(ny / game.cell);
    if (cellX >= 0 && cellX < game.gridW && cellY >= 0 && cellY < game.gridH) {
      const cv = game.grid[cellY][cellX];
      if (cv === 1) {
        // 砖墙:穿过并摧毁
        game.grid[cellY][cellX] = 0;
        game.spawnExplosion(cellX * game.cell + game.cell / 2, cellY * game.cell + game.cell / 2, 'brick');
      } else if (cv === 2) {
        // 钢板:挡住,爆炸
        this.detonate(game);
        return;
      } else if (cv >= 3 && cv <= 6) {
        // 单向方块:方向匹配则穿过,否则爆炸
        if (this.dir !== cv - 3) {
          this.detonate(game);
          return;
        }
      }
    }

    this.x = nx;
    this.y = ny;

    // 击中坦克
    for (const t of game.tanks) {
      if (!t.alive || t.player === this.owner) continue;
      const dx = this.x - t.x, dy = this.y - t.y;
      if (Math.abs(dx) < t.half + 2 && Math.abs(dy) < t.half + 2) {
        const before = t.hp;
        if (t.hit(this.damage)) {
          game.onTankHit(t, before, this.damage);
        }
        this.detonate(game);
        return;
      }
    }

    // 击中敌方迫击炮
    for (const m of game.mortars || []) {
      if (m.dead || m.owner === this.owner) continue;
      const dx = this.x - m.x, dy = this.y - m.y;
      if (dx * dx + dy * dy < (this.radius + m.radius) ** 2) {
        m.takeDamage(this.damage, game);
        this.dead = true;
        game.spawnExplosion(this.x, this.y, 'spark');
        return;
      }
    }
    // 击中敌方意大利炮
    for (const g of game.italianGuns || []) {
      if (g.dead || g.owner === this.owner) continue;
      const dx = this.x - g.x, dy = this.y - g.y;
      if (dx * dx + dy * dy < (this.radius + g.radius) ** 2) {
        g.takeDamage(this.damage, game);
        this.dead = true;
        game.spawnExplosion(this.x, this.y, 'spark');
        return;
      }
    }

    // 被敌方子弹抵消
    for (const b of game.bullets) {
      if (b.dead || b.owner === this.owner) continue;
      const dx = this.x - b.x, dy = this.y - b.y;
      if (dx * dx + dy * dy < (this.radius + b.radius) ** 2) {
        this.dead = true;
        b.dead = true;
        game.spawnExplosion(this.x, this.y, 'spark');
        return;
      }
    }
  }

  detonate(game) {
    if (this.dead) return;
    this.dead = true;
    game.spawnExplosion(this.x, this.y, 'hit');
    SFX.play('cannon_hit');
    game.notifyHp();
  }

  draw(ctx) {
    if (this.dead) return;
    // 拖尾
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      ctx.globalAlpha = (i + 1) / this.trail.length * 0.6;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.radius * 0.8 * (i + 1) / this.trail.length, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 弹体(拉长的椭球,沿运动方向)
    const v = DIR_VEC[this.dir];
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.atan2(v.y, v.x));
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius + 3, this.radius - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 弹头
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(this.radius + 1, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// 意大利炮:重型直射火炮
class ItalianGun {
  constructor(gridX, gridY, dir, owner, cell) {
    cell = cell || DEFAULT_CELL;
    this.gx = gridX;
    this.gy = gridY;
    this.x = gridX * cell + cell / 2;
    this.y = gridY * cell + cell / 2;
    this.dir = dir;       // 朝向
    this.owner = owner;
    this.hp = 8;
    this.maxHp = 8;
    this.dead = false;
    this.cooldown = 0;
    this.cooldownMax = 300;  // 5 秒冷却
    this.range = 12 * cell;  // 射程 12 格
    this.radius = 14;        // 碰撞半径
    this.fireAnim = 0;
  }

  update(game) {
    if (this.dead) return;
    if (this.cooldown > 0) this.cooldown--;
    if (this.fireAnim > 0) this.fireAnim--;

    // 检测正前方直线上是否有敌方坦克
    const v = DIR_VEC[this.dir];
    let target = null, bestDist = Infinity;
    for (const t of game.tanks) {
      if (!t.alive || t.player === this.owner) continue;
      const dx = t.x - this.x, dy = t.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > this.range) continue;
      // 判断是否在直线上(容差半格)
      if (this.dir === DIR.UP || this.dir === DIR.DOWN) {
        if (Math.abs(dx) < game.cell * 0.6 && dist < bestDist) {
          bestDist = dist;
          target = t;
        }
      } else {
        if (Math.abs(dy) < game.cell * 0.6 && dist < bestDist) {
          bestDist = dist;
          target = t;
        }
      }
    }

    if (target && this.cooldown <= 0) {
      // 检查直线上是否有钢板阻挡
      const blocked = this.isLineBlocked(game, target.x, target.y);
      if (!blocked) {
        this.fire(game);
      }
    }

    // 被子弹击毁检测
    for (const b of game.bullets) {
      if (b.dead || b.owner === this.owner) continue;
      const dx = this.x - b.x, dy = this.y - b.y;
      if (dx * dx + dy * dy < (this.radius + b.radius) ** 2) {
        b.dead = true;
        this.takeDamage(1, game);
        return;
      }
    }
  }

  isLineBlocked(game, tx, ty) {
    // 沿方向步进检查是否有钢板挡在目标前
    const v = DIR_VEC[this.dir];
    const dist = Math.abs(tx - this.x) + Math.abs(ty - this.y); // 曼哈顿距离(直线上近似)
    const steps = Math.ceil(dist / (game.cell / 2));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = this.x + (tx - this.x) * t;
      const py = this.y + (ty - this.y) * t;
      const cx = Math.floor(px / game.cell);
      const cy = Math.floor(py / game.cell);
      if (cx < 0 || cx >= game.gridW || cy < 0 || cy >= game.gridH) return true;
      if (game.grid[cy][cx] === 2) return true; // 钢板阻挡
    }
    return false;
  }

  fire(game) {
    this.cooldown = this.cooldownMax;
    this.fireAnim = 12;
    const v = DIR_VEC[this.dir];
    const sx = this.x + v.x * (this.radius + 2);
    const sy = this.y + v.y * (this.radius + 2);
    const shell = new CannonShell(sx, sy, this.dir, this.owner);
    if (!game.cannonShells) game.cannonShells = [];
    game.cannonShells.push(shell);
    SFX.play('cannon_fire');
    game.spawnExplosion(sx, sy, 'small');
  }

  takeDamage(dmg, game) {
    if (this.dead) return;
    this.hp -= dmg;
    game.spawnExplosion(this.x, this.y, 'spark');
    if (this.hp <= 0) {
      this.dead = true;
      game.spawnExplosion(this.x, this.y, 'hit');
      game.spawnExplosion(this.x, this.y, 'brick');
      SFX.play('explode');
    }
  }

  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x, this.y);

    const ownerColor = this.owner === 1 ? '#991b1b' : '#1e3a8a';
    const ownerLight = this.owner === 1 ? '#dc2626' : '#3b82f6';

    // 护盾装甲(大型底座)
    ctx.fillStyle = '#4b5563';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 装甲条纹
    ctx.fillStyle = ownerColor;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius - 3, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // 高光
    ctx.fillStyle = ownerLight;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(-4, -4, this.radius - 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 旋转炮管
    ctx.save();
    ctx.rotate(this.dir * Math.PI / 2);
    const recoil = this.fireAnim > 0 ? -this.fireAnim * 0.5 : 0;
    // 炮管底座(护盾)
    ctx.fillStyle = '#6b7280';
    ctx.beginPath();
    ctx.arc(recoil, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 大型炮管
    ctx.fillStyle = '#374151';
    ctx.fillRect(recoil, -4, 22, 8);
    ctx.strokeStyle = '#1f2937';
    ctx.strokeRect(recoil, -4, 22, 8);
    // 炮口加强
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(recoil + 19, -5, 4, 10);
    ctx.restore();

    // 血条
    if (this.hp < this.maxHp) {
      const bw = 24, bh = 3;
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(-bw / 2, -this.radius - 9, bw, bh);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(-bw / 2, -this.radius - 9, bw * (this.hp / this.maxHp), bh);
    }

    ctx.restore();
  }
}

// ========== 防御武器:地雷 ==========

// 地雷:敌方看不见,己方微弱闪烁,敌方坦克经过时触发爆炸
class Mine {
  constructor(gridX, gridY, owner, cell) {
    cell = cell || DEFAULT_CELL;
    this.gx = gridX;
    this.gy = gridY;
    this.x = gridX * cell + cell / 2;
    this.y = gridY * cell + cell / 2;
    this.owner = owner;
    this.dead = false;
    this.triggered = false;
    this.triggerTimer = 0;     // 触发后延时爆炸
    this.radius = 8;           // 触发半径
    this.damage = 4;
    this.blastRadius = cell * 2;
    this.t = Math.random() * Math.PI * 2;  // 闪烁动画相位
  }

  update(game) {
    if (this.dead) return;
    this.t += 0.1;

    // 已触发:倒计时爆炸
    if (this.triggered) {
      this.triggerTimer--;
      if (this.triggerTimer <= 0) {
        this.detonate(game);
      }
      return;
    }

    // 检测敌方坦克是否踩到
    for (const t of game.tanks) {
      if (!t.alive || t.player === this.owner) continue;
      const dx = t.x - this.x, dy = t.y - this.y;
      if (dx * dx + dy * dy < (this.radius + t.half) ** 2) {
        this.triggered = true;
        this.triggerTimer = 10;  // 0.16 秒后爆炸
        SFX.play('mine_trigger');
        return;
      }
    }
  }

  detonate(game) {
    if (this.dead) return;
    this.dead = true;
    // 范围伤害坦克
    for (const t of game.tanks) {
      if (!t.alive) continue;
      const dx = t.x - this.x, dy = t.y - this.y;
      if (dx * dx + dy * dy < this.blastRadius * this.blastRadius) {
        const before = t.hp;
        if (t.shieldTimer > 0) {
          t.shieldTimer = Math.max(0, t.shieldTimer - 60);
        } else if (t.hit(this.damage)) {
          game.onTankHit(t, before, this.damage);
        }
      }
    }
    // 摧毁砖墙(2 格范围)
    const cx = Math.floor(this.x / game.cell);
    const cy = Math.floor(this.y / game.cell);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 4) continue;
        const gx = cx + dx, gy = cy + dy;
        if (gx < 0 || gx >= game.gridW || gy < 0 || gy >= game.gridH) continue;
        if (game.grid[gy][gx] === 1) {
          game.grid[gy][gx] = 0;
          game.spawnExplosion(gx * game.cell + game.cell / 2, gy * game.cell + game.cell / 2, 'brick');
        }
      }
    }
    // 伤害敌方防御武器
    for (const m of game.mortars || []) {
      if (m.dead || m.owner === this.owner) continue;
      const dx = m.x - this.x, dy = m.y - this.y;
      if (dx * dx + dy * dy < this.blastRadius * this.blastRadius) {
        m.takeDamage(this.damage, game);
      }
    }
    for (const g of game.italianGuns || []) {
      if (g.dead || g.owner === this.owner) continue;
      const dx = g.x - this.x, dy = g.y - this.y;
      if (dx * dx + dy * dy < this.blastRadius * this.blastRadius) {
        g.takeDamage(this.damage, game);
      }
    }
    game.spawnExplosion(this.x, this.y, 'hit');
    game.spawnExplosion(this.x, this.y, 'brick');
    SFX.play('mine_explode');
    game.notifyHp();
  }

  draw(ctx) {
    if (this.dead) return;

    // 触发状态:快速闪烁
    if (this.triggered) {
      if (Math.floor(this.triggerTimer / 2) % 2 === 0) return;
      ctx.fillStyle = '#ef4444';
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    // 正常状态:己方可见微弱闪烁,敌方不可见
    // 注意:draw 时无法知道当前是哪一方视角,因此默认对己方显示
    // 实际对战中双方都能看到己方地雷,敌方不可见
    // 这里绘制为己方视角的微弱闪烁(布阵时可见)
    const pulse = 0.3 + Math.sin(this.t) * 0.15;
    ctx.globalAlpha = pulse;

    // 地雷主体(小圆点凸起)
    const ownerColor = this.owner === 1 ? '#ef4444' : '#3b82f6';
    ctx.fillStyle = ownerColor;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 中心高光
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = pulse * 0.6;
    ctx.beginPath();
    ctx.arc(this.x - 1, this.y - 1, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
  }
}

// 喷火坦克的火焰流
// 射程 N 格、持续飞行、碰方块即停(砖墙被烧毁)、对坦克持续伤害(每帧可触发,但 hit 后坦克 30 帧无敌)
class Flame {
  constructor(x, y, dir, owner, color, damage, rangeCells, cell) {
    cell = cell || DEFAULT_CELL;
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.owner = owner;
    this.color = color || '#f97316';
    this.damage = damage || 1;
    this.speed = 6;
    this.maxRange = (rangeCells || 3) * cell;
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

    const cell = game.cell;
    const cw = game.gridW * cell;
    const ch = game.gridH * cell;

    // 越界
    if (nx < 0 || ny < 0 || nx > cw || ny > ch) {
      this.dead = true; return;
    }
    // 射程
    if (this.traveled >= this.maxRange) { this.dead = true; return; }

    // 碰方块
    const cellX = Math.floor(nx / cell);
    const cellY = Math.floor(ny / cell);
    if (cellX >= 0 && cellX < game.gridW && cellY >= 0 && cellY < game.gridH) {
      const cv = game.grid[cellY][cellX];
      if (cv !== 0) {
        // 砖墙:被烧毁
        if (cv === 1) {
          game.grid[cellY][cellX] = 0;
          game.spawnExplosion(cellX * cell + cell / 2, cellY * cell + cell / 2, 'brick');
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
