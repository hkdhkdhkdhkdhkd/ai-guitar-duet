// 方块绘制、爆炸粒子、地图技能道具
// grid 值: 0空 1砖 2钢 3单向↑ 4单向→ 5单向↓ 6单向←

function drawBlock(ctx, x, y, type, cell) {
  cell = cell || CELL;
  const px = x * cell, py = y * cell;
  if (type === 1) drawBrick(ctx, px, py, cell);
  else if (type === 2) drawSteel(ctx, px, py, cell);
  else if (type >= 3 && type <= 6) drawOneWay(ctx, px, py, type, cell);
}

// 砖墙: 整洁的正方形(无碎纹)
function drawBrick(ctx, px, py, cell) {
  cell = cell || CELL;
  // 底色
  ctx.fillStyle = '#b45309';
  ctx.fillRect(px, py, cell, cell);
  // 主体方块
  ctx.fillStyle = '#ea944c';
  ctx.fillRect(px + 2, py + 2, cell - 4, cell - 4);
  // 高光(左上)
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.fillRect(px + 2, py + 2, cell - 4, 3);
  ctx.fillRect(px + 2, py + 2, 3, cell - 4);
  // 阴影(右下)
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.fillRect(px + 2, py + cell - 5, cell - 4, 3);
  ctx.fillRect(px + cell - 5, py + 2, 3, cell - 4);
  // 中心十字纹(简练)
  ctx.strokeStyle = 'rgba(120,53,15,.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + 2, py + cell / 2);
  ctx.lineTo(px + cell - 2, py + cell / 2);
  ctx.moveTo(px + cell / 2, py + 2);
  ctx.lineTo(px + cell / 2, py + cell - 2);
  ctx.stroke();
  // 外描边
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
}

function drawSteel(ctx, px, py, cell) {
  cell = cell || CELL;
  const grd = ctx.createLinearGradient(px, py, px + cell, py + cell);
  grd.addColorStop(0, '#9ca3af');
  grd.addColorStop(0.5, '#6b7280');
  grd.addColorStop(1, '#4b5563');
  ctx.fillStyle = grd;
  ctx.fillRect(px, py, cell, cell);
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(px + 2, py + 2, cell - 4, 4);
  ctx.fillStyle = '#374151';
  const r = 2;
  ctx.beginPath();
  ctx.arc(px + 5, py + 5, r, 0, Math.PI * 2);
  ctx.arc(px + cell - 5, py + 5, r, 0, Math.PI * 2);
  ctx.arc(px + 5, py + cell - 5, r, 0, Math.PI * 2);
  ctx.arc(px + cell - 5, py + cell - 5, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
}

// 单向方块: 不可摧毁,坦克不可穿过,仅允许指定方向的子弹穿过
// type: 3=↑ 4=→ 5=↓ 6=← (对应 DIR 值 +3)
function drawOneWay(ctx, px, py, type, cell) {
  cell = cell || CELL;
  const dir = type - 3; // 0=up 1=right 2=down 3=left
  // 底色: 青绿渐变,区别于钢板
  const grd = ctx.createLinearGradient(px, py, px + cell, py + cell);
  grd.addColorStop(0, '#5eead4');
  grd.addColorStop(0.5, '#14b8a6');
  grd.addColorStop(1, '#0d9488');
  ctx.fillStyle = grd;
  ctx.fillRect(px, py, cell, cell);
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,.2)';
  ctx.fillRect(px + 2, py + 2, cell - 4, 4);
  // 描边
  ctx.strokeStyle = '#0f766e';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2);
  // 方向箭头: 指示子弹可穿过的方向
  ctx.save();
  ctx.translate(px + cell / 2, py + cell / 2);
  ctx.rotate(dir * Math.PI / 2);
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.strokeStyle = '#134e4a';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(-5, 2);
  ctx.lineTo(-2.5, 2);
  ctx.lineTo(-2.5, 7);
  ctx.lineTo(2.5, 7);
  ctx.lineTo(2.5, 2);
  ctx.lineTo(5, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBackground(ctx, gridW, gridH, cell) {
  gridW = gridW || GRID_W;
  gridH = gridH || GRID_H;
  cell = cell || CELL;
  ctx.fillStyle = '#1a1d2e';
  ctx.fillRect(0, 0, gridW * cell, gridH * cell);
  ctx.strokeStyle = 'rgba(255,255,255,.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= gridW; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cell, 0);
    ctx.lineTo(x * cell, gridH * cell);
    ctx.stroke();
  }
  for (let y = 0; y <= gridH; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cell);
    ctx.lineTo(gridW * cell, y * cell);
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
  constructor(gridX, gridY, kind, cell) {
    cell = cell || CELL;
    this.gx = gridX; this.gy = gridY;
    this.x = gridX * cell + cell / 2;
    this.y = gridY * cell + cell / 2;
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
        SFX.play('powerup');
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
