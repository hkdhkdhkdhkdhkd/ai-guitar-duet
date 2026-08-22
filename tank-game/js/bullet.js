// 炮弹:移动、碰撞、砖墙摧毁、钢板反弹、伤害
class Bullet {
  constructor(x, y, dir, owner, color, damage, bounces) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.owner = owner;       // 1 或 2
    this.color = color;
    this.damage = damage || 1;
    this.bounces = bounces || 0;   // 剩余反弹次数(仅钢板计数)
    this.speed = 5.2;
    this.radius = 3.5;
    this.dead = false;
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
    if (nx < 0 || ny < 0 || nx > GRID_W * CELL || ny > GRID_H * CELL) {
      this.dead = true;
      game.spawnExplosion(this.x, this.y, 'small');
      return;
    }

    const cellX = Math.floor(nx / CELL);
    const cellY = Math.floor(ny / CELL);
    if (cellX >= 0 && cellX < GRID_W && cellY >= 0 && cellY < GRID_H) {
      const v2 = game.grid[cellY][cellX];
      if (v2 === 1) {
        // 砖墙:摧毁,炮弹消失(不反弹)
        game.grid[cellY][cellX] = 0;
        game.spawnExplosion(cellX * CELL + CELL / 2, cellY * CELL + CELL / 2, 'brick');
        SFX.play('brick');
        this.dead = true;
        return;
      } else if (v2 === 2) {
        // 钢板:反弹(仅钢板计数)
        if (this.bounces > 0) {
          this.bounces--;
          this.dir = (this.dir + 2) % 4;   // 反向
          game.spawnExplosion(this.x, this.y, 'spark');
          SFX.play('bounce');
          // 不前进,留在外侧,下一帧反向运动
          return;
        } else {
          this.dead = true;
          game.spawnExplosion(nx, ny, 'spark');
          SFX.play('spark');
          return;
        }
      }
    }

    this.x = nx;
    this.y = ny;

    // 与坦克碰撞
    for (const t of game.tanks) {
      if (!t.alive) continue;
      if (t.player === this.owner) continue;
      const dx = this.x - t.x;
      const dy = this.y - t.y;
      if (Math.abs(dx) < t.half && Math.abs(dy) < t.half) {
        const before = t.hp;
        if (t.hit(this.damage)) {
          game.spawnExplosion(this.x, this.y, 'hit');
          SFX.play('hit');
          game.onTankHit(t, before, this.damage);
        }
        this.dead = true;
        return;
      }
    }

    // 炮弹对撞
    for (const b of game.bullets) {
      if (b === this || b.dead) continue;
      if (b.owner !== this.owner) {
        const dx = this.x - b.x, dy = this.y - b.y;
        if (dx * dx + dy * dy < 16) {
          this.dead = true; b.dead = true;
          game.spawnExplosion(this.x, this.y, 'spark');
          SFX.play('spark');
          return;
        }
      }
    }
  }

  draw(ctx) {
    if (this.dead) return;
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      const a = (i + 1) / this.trail.length;
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.radius * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.beginPath();
    ctx.arc(this.x - 1, this.y - 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
    // 反弹次数指示
    if (this.bounces > 0) {
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
