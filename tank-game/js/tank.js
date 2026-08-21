// 坦克:皮肤、颜色、天赋、技能、buff、碰撞
const TANK_SKINS = [
  { id: 'classic', name: '经典' },
  { id: 'heavy',   name: '重型' },
  { id: 'scout',   name: '突击' },
  { id: 'shield',  name: '守卫' },
];

const TANK_COLORS = [
  { name: '红', value: '#ef4444' },
  { name: '蓝', value: '#3b82f6' },
  { name: '绿', value: '#22c55e' },
  { name: '黄', value: '#eab308' },
  { name: '紫', value: '#a855f7' },
  { name: '橙', value: '#f97316' },
  { name: '青', value: '#06b6d4' },
  { name: '粉', value: '#ec4899' },
];

const DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };
const DIR_VEC = [
  { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
];

// 天赋:每点效果
//   防御 +1 最大HP; 速度 +0.3 移速; 攻击 +1 炮弹伤害
const TALENT_POINTS = 5;
const TALENT_META = {
  defense: { name: '防御', per: '+1 最大生命' },
  speed:   { name: '速度', per: '+0.3 移速' },
  attack:  { name: '攻击', per: '+1 炮弹伤害' },
};

// 各皮肤独特技能
const SKILL_DEF = {
  classic: { name: '三连射击', desc: '扇形发射 3 发炮弹', cd: 16 },
  heavy:   { name: '钢铁护盾', desc: '5 秒无敌', cd: 18 },
  scout:   { name: '极速冲刺', desc: '2.5 秒移速 x2.2', cd: 15 },
  shield:  { name: '紧急修复', desc: '恢复 3 点血量', cd: 18 },
};

class Tank {
  constructor(player, gridX, gridY, color, skin, controls, talents) {
    this.player = player;
    this.size = 24;
    this.color = color;
    this.skin = skin;
    this.controls = controls;      // {up,down,left,right,fire,skill}
    this.talents = talents || { defense: 0, speed: 0, attack: 0 };

    this.x = gridX * CELL + CELL / 2;
    this.y = gridY * CELL + CELL / 2;
    this.dir = player === 1 ? DIR.RIGHT : DIR.LEFT;
    this.moving = false;

    // 天赋衍生属性
    this.baseSpeed = 2.0 + this.talents.speed * 0.3;
    this.maxHp = 7 + this.talents.defense;
    this.attack = 1 + this.talents.attack;

    this.hp = this.maxHp;
    this.alive = true;
    this.cooldownMax = 22;
    this.fireCooldown = 0;
    this.invuln = 60;          // 出生短暂无敌

    // 技能
    this.skillCd = 0;
    this.skillCdMax = SKILL_DEF[skin].cd * 60;
    this.prevSkill = false;

    // buff 计时(帧)
    this.rapidTimer = 0;
    this.powerTimer = 0;
    this.speedTimer = 0;
    this.shieldTimer = 0;
    this.dashTimer = 0;       // 突击技能冲刺

    this.flashTimer = 0;
  }

  get half() { return this.size / 2; }

  effSpeed() {
    let s = this.baseSpeed;
    if (this.speedTimer > 0) s *= 1.6;
    if (this.dashTimer > 0) s *= 2.2;
    return s;
  }

  update(keys, game) {
    if (!this.alive) return;
    if (this.invuln > 0) this.invuln--;
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.flashTimer > 0) this.flashTimer--;
    if (this.skillCd > 0) this.skillCd--;
    if (this.rapidTimer > 0) this.rapidTimer--;
    if (this.powerTimer > 0) this.powerTimer--;
    if (this.speedTimer > 0) this.speedTimer--;
    if (this.shieldTimer > 0) this.shieldTimer--;
    if (this.dashTimer > 0) this.dashTimer--;

    // 输入: 单方向(上>下>左>右)
    let nx = 0, ny = 0, newDir = null;
    const c = this.controls;
    if (keys[c.up])         { ny = -1; newDir = DIR.UP; }
    else if (keys[c.down])  { ny = 1;  newDir = DIR.DOWN; }
    else if (keys[c.left])  { nx = -1; newDir = DIR.LEFT; }
    else if (keys[c.right]) { nx = 1;  newDir = DIR.RIGHT; }

    this.moving = (nx !== 0 || ny !== 0);
    if (this.moving) {
      this.dir = newDir;
      const sp = this.effSpeed();
      // 先吸附垂直轴到中线(便于转弯),带碰撞检测
      this.snapToTrackSafe(nx, ny, game, sp);
      this.tryMove(nx * sp, ny * sp, game);
    }

    // 射击
    if (keys[c.fire] && this.fireCooldown <= 0) {
      this.fire(game);
    }

    // 技能(按下边沿触发)
    const sk = !!keys[c.skill];
    if (sk && !this.prevSkill && this.skillCd <= 0) {
      this.useSkill(game);
    }
    this.prevSkill = sk;
  }

  // 吸附到轨道中线,但每步都做碰撞检测,绝不穿墙
  snapToTrackSafe(nx, ny, game, sp) {
    if (nx !== 0) {
      const target = Math.round((this.y - CELL / 2) / CELL) * CELL + CELL / 2;
      if (this.y !== target) {
        const step = Math.sign(target - this.y) * Math.min(sp, Math.abs(target - this.y));
        if (!this.collidesAt(this.x, this.y + step, game)) this.y += step;
      }
    } else if (ny !== 0) {
      const target = Math.round((this.x - CELL / 2) / CELL) * CELL + CELL / 2;
      if (this.x !== target) {
        const step = Math.sign(target - this.x) * Math.min(sp, Math.abs(target - this.x));
        if (!this.collidesAt(this.x + step, this.y, game)) this.x += step;
      }
    }
  }

  tryMove(dx, dy, game) {
    const half = this.half;
    if (dx !== 0) {
      const nx = this.x + dx;
      if (!this.collidesAt(nx, this.y, game)) {
        this.x = nx;
      } else if (dx > 0) {
        const col = Math.floor((nx + half) / CELL);
        this.x = col * CELL - half - 0.1;
      } else {
        const col = Math.floor((nx - half) / CELL);
        this.x = (col + 1) * CELL + half + 0.1;
      }
    }
    if (dy !== 0) {
      const ny = this.y + dy;
      if (!this.collidesAt(this.x, ny, game)) {
        this.y = ny;
      } else if (dy > 0) {
        const row = Math.floor((ny + half) / CELL);
        this.y = row * CELL - half - 0.1;
      } else {
        const row = Math.floor((ny - half) / CELL);
        this.y = (row + 1) * CELL + half + 0.1;
      }
    }
    this.x = Math.max(half, Math.min(GRID_W * CELL - half, this.x));
    this.y = Math.max(half, Math.min(GRID_H * CELL - half, this.y));
  }

  collidesAt(x, y, game) {
    const half = this.half;
    const left = x - half, right = x + half;
    const top = y - half, bottom = y + half;
    if (left < 0 || top < 0 || right > GRID_W * CELL || bottom > GRID_H * CELL) return true;
    const x0 = Math.floor(left / CELL), x1 = Math.floor((right - 0.01) / CELL);
    const y0 = Math.floor(top / CELL), y1 = Math.floor((bottom - 0.01) / CELL);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const v = game.grid[cy][cx];
        if (v !== 0) return true;
      }
    }
    const other = game.tanks.find(t => t !== this && t.alive);
    if (other) {
      if (Math.abs(x - other.x) < half + other.half && Math.abs(y - other.y) < half + other.half) return true;
    }
    return false;
  }

  fire(game) {
    const rate = this.rapidTimer > 0 ? 7 : this.cooldownMax;
    this.fireCooldown = rate;
    const v = DIR_VEC[this.dir];
    const bx = this.x + v.x * (this.half + 4);
    const by = this.y + v.y * (this.half + 4);
    const dmg = this.attack * (this.powerTimer > 0 ? 2 : 1);
    const bounces = game.bounce ? 2 : 0;
    game.bullets.push(new Bullet(bx, by, this.dir, this.player, this.color, dmg, bounces));
  }

  useSkill(game) {
    this.skillCd = this.skillCdMax;
    const skin = this.skin;
    if (skin === 'classic') {
      // 三连扇形:中心 + 两侧平行偏移
      const v = DIR_VEC[this.dir];
      const perp = { x: -v.y, y: v.x };
      const dmg = this.attack * (this.powerTimer > 0 ? 2 : 1);
      const bounces = game.bounce ? 2 : 0;
      for (const off of [-8, 0, 8]) {
        const bx = this.x + v.x * (this.half + 4) + perp.x * off;
        const by = this.y + v.y * (this.half + 4) + perp.y * off;
        game.bullets.push(new Bullet(bx, by, this.dir, this.player, this.color, dmg, bounces));
      }
      game.spawnExplosion(this.x + v.x * (this.half + 6), this.y + v.y * (this.half + 6), 'spark');
    } else if (skin === 'heavy') {
      this.shieldTimer = 5 * 60;
      this.invuln = Math.max(this.invuln, 5 * 60);
      game.spawnExplosion(this.x, this.y, 'spark');
    } else if (skin === 'scout') {
      this.dashTimer = 2.5 * 60;
      this.speedTimer = Math.max(this.speedTimer, 2.5 * 60);
      game.spawnExplosion(this.x, this.y, 'spark');
    } else if (skin === 'shield') {
      this.hp = Math.min(this.maxHp, this.hp + 3);
      game.spawnExplosion(this.x, this.y, 'spark');
      game.notifyHp();
    }
    if (game.onLog) game.onLog(`玩家${this.player} 释放技能: ${SKILL_DEF[skin].name}`);
  }

  applyPowerUp(kind) {
    if (kind === 'heal')   { this.hp = Math.min(this.maxHp, this.hp + 2); }
    if (kind === 'rapid')  { this.rapidTimer = 5 * 60; }
    if (kind === 'power')  { this.powerTimer = 5 * 60; }
    if (kind === 'speed')  { this.speedTimer = 5 * 60; }
    if (kind === 'shield') { this.shieldTimer = 5 * 60; this.invuln = Math.max(this.invuln, 5 * 60); }
  }

  hit(damage) {
    damage = damage || 1;
    if (this.invuln > 0 || this.shieldTimer > 0) return false;
    this.hp -= damage;
    this.flashTimer = 12;
    this.invuln = 30;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  }

  draw(ctx) {
    if (!this.alive) return;
    if (this.flashTimer > 0 && Math.floor(this.flashTimer / 3) % 2 === 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.dir * Math.PI / 2);
    drawTankBody(ctx, this.skin, this.color, this.player, (this.invuln > 0 || this.shieldTimer > 0));
    ctx.restore();

    // 护盾环
    if (this.shieldTimer > 0) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const a = 0.4 + Math.sin(performance.now() / 120) * 0.2;
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, this.half + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(0, 0, this.half + 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 冲刺尾迹
    if (this.dashTimer > 0 && this.moving) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = this.color;
      const v = DIR_VEC[this.dir];
      ctx.beginPath();
      ctx.arc(this.x - v.x * 8, this.y - v.y * 8, this.half * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawTankBody(ctx, skin, color, player, invuln) {
  const half = 12;
  const dark = shadeColor(color, -35);
  const tread = '#2b2f3a';
  if (invuln) ctx.globalAlpha = 0.65;

  if (skin === 'classic') {
    ctx.fillStyle = tread;
    ctx.fillRect(-half, -half, 5, half * 2);
    ctx.fillRect(half - 5, -half, 5, half * 2);
    ctx.fillStyle = '#4b5563';
    for (let i = -half + 2; i < half - 2; i += 4) {
      ctx.fillRect(-half + 0.5, i, 4, 2);
      ctx.fillRect(half - 4.5, i, 4, 2);
    }
    roundRect(ctx, -half + 5, -half + 2, half * 2 - 10, half * 2 - 4, 3);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-2, -half - 4, 4, 10);
  } else if (skin === 'heavy') {
    ctx.fillStyle = tread;
    ctx.fillRect(-half, -half, 6, half * 2);
    ctx.fillRect(half - 6, -half, 6, half * 2);
    ctx.fillStyle = '#4b5563';
    for (let i = -half + 2; i < half - 2; i += 5) {
      ctx.fillRect(-half + 0.5, i, 5, 2.5);
      ctx.fillRect(half - 5.5, i, 5, 2.5);
    }
    roundRect(ctx, -half + 6, -half + 1, half * 2 - 12, half * 2 - 2, 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = dark;
    ctx.fillRect(-half + 8, -half + 4, half * 2 - 16, 2);
    ctx.fillRect(-half + 8, half - 6, half * 2 - 16, 2);
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-3, -half - 5, 6, 11);
  } else if (skin === 'scout') {
    const h2 = 10;
    ctx.fillStyle = tread;
    ctx.fillRect(-h2, -h2, 3.5, h2 * 2);
    ctx.fillRect(h2 - 3.5, -h2, 3.5, h2 * 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -h2 - 2);
    ctx.lineTo(-h2 + 4, h2);
    ctx.lineTo(h2 - 4, h2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(0, 2, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-1.5, -h2 - 6, 3, 8);
  } else if (skin === 'shield') {
    ctx.fillStyle = shadeColor(color, -45);
    ctx.fillRect(-half - 2, -half + 2, 4, half * 2 - 4);
    ctx.fillRect(half - 2, -half + 2, 4, half * 2 - 4);
    ctx.fillStyle = tread;
    ctx.fillRect(-half + 3, -half, 3, half * 2);
    ctx.fillRect(half - 6, -half, 3, half * 2);
    roundRect(ctx, -half + 7, -half + 2, half * 2 - 14, half * 2 - 4, 3);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-2.5, -half - 4, 5, 10);
    ctx.fillStyle = shadeColor(color, 30);
    ctx.beginPath(); ctx.arc(0, 1, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = player === 1 ? '#fff' : '#fde68a';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('P' + player, 0, half - 1);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shadeColor(hex, percent) {
  const c = hex.replace('#', '');
  let r = parseInt(c.substring(0, 2), 16);
  let g = parseInt(c.substring(2, 4), 16);
  let b = parseInt(c.substring(4, 6), 16);
  r = Math.max(0, Math.min(255, r + percent));
  g = Math.max(0, Math.min(255, g + percent));
  b = Math.max(0, Math.min(255, b + percent));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
