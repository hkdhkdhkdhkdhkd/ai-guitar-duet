// 方块绘制、爆炸粒子、地图技能道具
// grid 值: 0空 1砖 2钢

function drawBlock(ctx, x, y, type) {
  const px = x * CELL, py = y * CELL;
  if (type === 1) drawBrick(ctx, px, py);
  else if (type === 2) drawSteel(ctx, px, py);
}

// 砖墙: 整洁的正方形(无碎纹)
function drawBrick(ctx, px, py) {
  // 底色
  ctx.fillStyle = '#b45309';
  ctx.fillRect(px, py, CELL, CELL);
  // 主体方块
  ctx.fillStyle = '#ea944c';
  ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
  // 高光(左上)
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.fillRect(px + 2, py + 2, CELL - 4, 3);
  ctx.fillRect(px + 2, py + 2, 3, CELL - 4);
  // 阴影(右下)
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.fillRect(px + 2, py + CELL - 5, CELL - 4, 3);
  ctx.fillRect(px + CELL - 5, py + 2, 3, CELL - 4);
  // 中心十字纹(简练)
  ctx.strokeStyle = 'rgba(120,53,15,.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + 2, py + CELL / 2);
  ctx.lineTo(px + CELL - 2, py + CELL / 2);
  ctx.moveTo(px + CELL / 2, py + 2);
  ctx.lineTo(px + CELL / 2, py + CELL - 2);
  ctx.stroke();
  // 外描边
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
}

function drawSteel(ctx, px, py) {
  const grd = ctx.createLinearGradient(px, py, px + CELL, py + CELL);
  grd.addColorStop(0, '#9ca3af');
  grd.addColorStop(0.5, '#6b7280');
  grd.addColorStop(1, '#4b5563');
  ctx.fillStyle = grd;
  ctx.fillRect(px, py, CELL, CELL);
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(px + 2, py + 2, CELL - 4, 4);
  ctx.fillStyle = '#374151';
  const r = 2;
  ctx.beginPath();
  ctx.arc(px + 5, py + 5, r, 0, Math.PI * 2);
  ctx.arc(px + CELL - 5, py + 5, r, 0, Math.PI * 2);
  ctx.arc(px + 5, py + CELL - 5, r, 0, Math.PI * 2);
  ctx.arc(px + CELL - 5, py + CELL - 5, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
}

function drawBackground(ctx) {
  ctx.fillStyle = '#1a1d2e';
  ctx.fillRect(0, 0, GRID_W * CELL, GRID_H * CELL);
  ctx.strokeStyle = 'rgba(255,255,255,.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= GRID_W; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, GRID_H * CELL);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID_H; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(GRID_W * CELL, y * CELL);
    ctx.stroke();
  }
}

// 爆炸粒子
class Particle {
  constructor(x, y, kind) {
    this.x = x; this.y = y;
    this.kind = kind;
    this.life = kind === 'brick' ? 22 : 16;
    this.maxLife = this.life;
    this.pieces = [];
    const count = kind === 'hit' ? 14 : kind === 'brick' ? 10 : 6;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * (kind === 'hit' ? 4 : 3);
      this.pieces.push({
        x: 0, y: 0,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: 1.5 + Math.random() * 2.5,
        color: this.pickColor(),
      });
    }
    this.dead = false;
  }

  pickColor() {
    if (this.kind === 'brick') {
      const arr = ['#ea944c', '#b45309', '#fbbf24', '#78350f'];
      return arr[Math.floor(Math.random() * arr.length)];
    } else if (this.kind === 'spark') {
      const arr = ['#fbbf24', '#fde68a', '#fff'];
      return arr[Math.floor(Math.random() * arr.length)];
    } else if (this.kind === 'small') {
      return '#9ca3af';
    } else {
      const arr = ['#ef4444', '#f97316', '#fbbf24', '#fff'];
      return arr[Math.floor(Math.random() * arr.length)];
    }
  }

  update() {
    this.life--;
    if (this.life <= 0) { this.dead = true; return; }
    for (const p of this.pieces) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.96;
    }
  }

  draw(ctx) {
    const t = this.life / this.maxLife;
    for (const p of this.pieces) {
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(this.x + p.x, this.y + p.y, Math.max(0.5, p.size * t), 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.kind === 'hit' && this.life > this.maxLife - 6) {
      ctx.globalAlpha = (this.life - (this.maxLife - 6)) / 6;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, (this.maxLife - this.life) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// 地图技能道具
// kind: 'heal' 'rapid' 'power' 'speed' 'shield'
const POWERUP_META = {
  heal:   { label: '血+', color: '#22c55e', desc: '恢复 2 点血量' },
  rapid:  { label: '连发', color: '#f59e0b', desc: '5 秒快速连射' },
  power:  { label: '2x攻', color: '#ef4444', desc: '5 秒炮弹伤害 x2' },
  speed:  { label: '加速', color: '#06b6d4', desc: '5 秒移速 x1.6' },
  shield: { label: '护盾', color: '#a855f7', desc: '5 秒无敌' },
};
const POWERUP_KINDS = Object.keys(POWERUP_META);

class PowerUp {
  constructor(gridX, gridY, kind) {
    this.gx = gridX; this.gy = gridY;
    this.x = gridX * CELL + CELL / 2;
    this.y = gridY * CELL + CELL / 2;
    this.kind = kind;
    this.dead = false;
    this.t = 0;          // 动画相位
    this.life = 60 * 15; // 15 秒后消失
  }

  update(game) {
    this.t += 0.08;
    this.life--;
    if (this.life <= 0) { this.dead = true; return; }
    // 拾取检测
    for (const tk of game.tanks) {
      if (!tk.alive) continue;
      if (Math.abs(tk.x - this.x) < tk.half + 8 && Math.abs(tk.y - this.y) < tk.half + 8) {
        tk.applyPowerUp(this.kind);
        this.dead = true;
        game.spawnExplosion(this.x, this.y, 'spark');
        if (game.onLog) game.onLog(`玩家${tk.player} 拾取 ${POWERUP_META[this.kind].label}`);
        return;
      }
    }
  }

  draw(ctx) {
    const meta = POWERUP_META[this.kind];
    const pulse = 1 + Math.sin(this.t) * 0.08;
    // 即将消失闪烁
    if (this.life < 60 * 3 && Math.floor(this.life / 6) % 2 === 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    // 外光圈
    ctx.globalAlpha = 0.35 + Math.sin(this.t) * 0.1;
    ctx.fillStyle = meta.color;
    ctx.beginPath();
    ctx.arc(0, 0, 13 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 方块底
    ctx.fillStyle = meta.color;
    roundRectPower(ctx, -9, -9, 18, 18, 4);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 文字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.label, 0, 0.5);
    ctx.restore();
  }
}

function roundRectPower(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
