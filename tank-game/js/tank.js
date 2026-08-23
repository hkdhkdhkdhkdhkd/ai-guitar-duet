// 坦克:皮肤、颜色、天赋、技能、buff、碰撞
const TANK_SKINS = [
  { id: 'classic', name: '经典' },
  { id: 'heavy',   name: '重型' },
  { id: 'scout',   name: '突击' },
  { id: 'shield',  name: '守卫' },
  { id: 'gunner',  name: '机枪' },
  { id: 'flamethrower', name: '喷火' },
  { id: 'tiger',     name: '虎式' },
  { id: 't34',       name: 'T-34' },
  { id: 'sherman',   name: '谢尔曼' },
  { id: 'churchill', name: '丘吉尔' },
  { id: 'panther',   name: '豹式' },
  // ===== 飞机(可飞越墙壁,自由移动) =====
  { id: 'f16',     name: 'F-16',   type: 'air' },
  { id: 'su27',    name: '苏-27',   type: 'air' },
  { id: 'a10',     name: 'A-10',   type: 'air' },
  { id: 'b52',     name: 'B-52',   type: 'air' },
  { id: 'apache',  name: '阿帕奇', type: 'air' },
];

// 判断皮肤是否为飞机
function isAirSkin(skin) {
  const s = TANK_SKINS.find(x => x.id === skin);
  return !!(s && s.type === 'air');
}

// 各皮肤基础属性(天赋在此之上叠加)
const SKIN_STATS = {
  classic:      { hp: 7,  speed: 2.0, cooldown: 22, attack: 1 },
  heavy:        { hp: 8,  speed: 1.6, cooldown: 26, attack: 1 },
  scout:        { hp: 6,  speed: 2.6, cooldown: 18, attack: 1 },
  shield:       { hp: 8,  speed: 1.8, cooldown: 24, attack: 1 },
  gunner:       { hp: 6,  speed: 2.0, cooldown: 10, attack: 1 },
  flamethrower: { hp: 7,  speed: 1.9, cooldown: 3,  attack: 1 },
  tiger:        { hp: 10, speed: 1.5, cooldown: 30, attack: 2 },
  t34:          { hp: 7,  speed: 2.5, cooldown: 18, attack: 1 },
  sherman:      { hp: 6,  speed: 2.2, cooldown: 14, attack: 1 },
  churchill:    { hp: 11, speed: 1.3, cooldown: 25, attack: 1 },
  panther:      { hp: 6,  speed: 2.8, cooldown: 20, attack: 2 },
  // 飞机:低血高机动,可飞越墙壁
  f16:          { hp: 4,  speed: 3.2, cooldown: 8,  attack: 1, isAir: true },
  su27:         { hp: 5,  speed: 3.0, cooldown: 10, attack: 1, isAir: true },
  a10:          { hp: 6,  speed: 2.5, cooldown: 12, attack: 2, isAir: true },
  b52:          { hp: 7,  speed: 2.0, cooldown: 25, attack: 3, isAir: true },
  apache:       { hp: 5,  speed: 2.8, cooldown: 15, attack: 1, isAir: true },
};

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
  gunner:  { name: '弹幕扫射', desc: '扇形发射 5 发高速弹', cd: 14 },
  flamethrower: { name: '烈焰风暴', desc: '6 秒射程翻倍 + 持续大火焰', cd: 16 },
  tiger:        { name: '重炮轰击', desc: '穿透砖墙的 2 倍伤害重型炮弹', cd: 20 },
  t34:          { name: '苏维埃冲锋', desc: '3 秒移速 x2.2 + 减伤 50%', cd: 16 },
  sherman:      { name: '火力压制', desc: '5 秒无冷却连发', cd: 18 },
  churchill:    { name: '装甲堡垒', desc: '6 秒无敌 + 反弹敌方炮弹', cd: 22 },
  panther:      { name: '穿甲狙击', desc: '发射穿透所有墙壁的高速穿甲弹', cd: 19 },
  // 飞机技能
  f16:          { name: '响尾蛇弹幕', desc: '扇形发射 3 发追踪弹', cd: 15 },
  su27:         { name: '眼镜蛇机动', desc: '2 秒无敌 + 移速 x2.2', cd: 16 },
  a10:          { name: '疣猪扫射', desc: '5 发穿甲弹扇形扫射', cd: 18 },
  b52:          { name: '地毯轰炸', desc: '投下 3 颗高伤大炸弹', cd: 20 },
  apache:       { name: '地狱火导弹', desc: '发射穿透墙壁的追踪导弹', cd: 17 },
};

class Tank {
  constructor(player, gridX, gridY, color, skin, controls, talents, isHuman) {
    this.player = player;          // 1 = 玩家1方, 2 = 玩家2方
    this.indexInTeam = 0;          // 己方编号(0..N-1),用于 HUD 显示
    this.isHuman = !!isHuman;      // 是否人类控制(true=P1/P2, false=AI)
    this.size = 24;
    this.color = color;
    this.skin = skin;
    this.controls = controls;      // {up,down,left,right,fire,skill,grenade,missile}
    this.talents = talents || { defense: 0, speed: 0, attack: 0 };

    this.x = gridX * CELL + CELL / 2;
    this.y = gridY * CELL + CELL / 2;
    this.dir = player === 1 ? DIR.RIGHT : DIR.LEFT;
    this.moving = false;

    // 天赋衍生属性(基于皮肤基础属性 + 天赋加成)
    const stats = SKIN_STATS[skin] || SKIN_STATS.classic;
    this.isAir = !!stats.isAir;     // 飞机:可飞越墙壁
    this.baseSpeed = stats.speed + this.talents.speed * 0.3;
    this.maxHp = stats.hp + this.talents.defense;
    this.attack = stats.attack + this.talents.attack;

    this.hp = this.maxHp;
    this.alive = true;
    this.cooldownMax = stats.cooldown;
    this.fireCooldown = 0;
    this.invuln = 60;          // 出生短暂无敌

    // 技能
    this.skillCd = 0;
    this.skillCdMax = SKILL_DEF[skin].cd * 60;
    this.prevSkill = false;

    // 武器:手榴弹4颗 + 追踪导弹1颗
    this.grenades = 4;
    this.missiles = 1;
    this.prevGrenade = false;
    this.prevMissile = false;

    // buff 计时(帧)
    this.rapidTimer = 0;
    this.powerTimer = 0;
    this.speedTimer = 0;
    this.shieldTimer = 0;
    this.dashTimer = 0;       // 突击技能冲刺
    this.flameBoostTimer = 0; // 喷火坦克:射程翻倍
    this.damageReductionTimer = 0; // T-34: 减伤50%
    this.reflectTimer = 0;    // 丘吉尔: 反弹炮弹

    this.flashTimer = 0;
    // AI 直接控制字段(避开共享 keys map 冲突,每坦克独立)
    // 索引按 key code 同 game.keys,这样 Tank.update 中 get(c.up) 等都可直接读取
    this.aiInput = {};
  }

  // AI 设置某键状态(写入自己的 aiInput)
  setAIKey(code, down) { this.aiInput[code] = down; }
  // AI 重置全部键
  resetAIKeys() {
    const c = this.controls;
    this.aiInput[c.up] = false;
    this.aiInput[c.down] = false;
    this.aiInput[c.left] = false;
    this.aiInput[c.right] = false;
    this.aiInput[c.fire] = false;
    this.aiInput[c.skill] = false;
    this.aiInput[c.grenade] = false;
    this.aiInput[c.missile] = false;
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
    // AI 坦克直接读 aiInput,人类坦克读 keys map
    const inp = this.isHuman ? null : this.aiInput;
    const get = (code) => inp ? inp[code] : !!keys[code];
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.flashTimer > 0) this.flashTimer--;
    if (this.skillCd > 0) this.skillCd--;
    if (this.rapidTimer > 0) this.rapidTimer--;
    if (this.powerTimer > 0) this.powerTimer--;
    if (this.speedTimer > 0) this.speedTimer--;
    if (this.shieldTimer > 0) this.shieldTimer--;
    if (this.dashTimer > 0) this.dashTimer--;
    if (this.flameBoostTimer > 0) this.flameBoostTimer--;
    if (this.damageReductionTimer > 0) this.damageReductionTimer--;
    if (this.reflectTimer > 0) this.reflectTimer--;

    // 输入: 单方向(上>下>左>右)
    let nx = 0, ny = 0, newDir = null;
    const c = this.controls;
    if (get(c.up))         { ny = -1; newDir = DIR.UP; }
    else if (get(c.down))  { ny = 1;  newDir = DIR.DOWN; }
    else if (get(c.left))  { nx = -1; newDir = DIR.LEFT; }
    else if (get(c.right)) { nx = 1;  newDir = DIR.RIGHT; }

    this.moving = (nx !== 0 || ny !== 0);
    if (this.moving) {
      this.dir = newDir;
      const sp = this.effSpeed();
      if (this.isAir) {
        // 飞机:自由飞行,不受墙壁阻挡,仅边界限制
        const half = this.half;
        this.x = Math.max(half, Math.min(GRID_W * CELL - half, this.x + nx * sp));
        this.y = Math.max(half, Math.min(GRID_H * CELL - half, this.y + ny * sp));
      } else {
        // 坦克:吸附轨道 + 碰撞检测
        this.snapToTrackSafe(nx, ny, game, sp);
        this.tryMove(nx * sp, ny * sp, game);
      }
    }

    // 射击
    if (get(c.fire) && this.fireCooldown <= 0) {
      this.fire(game);
    }

    // 技能(按下边沿触发)
    const sk = !!get(c.skill);
    if (sk && !this.prevSkill && this.skillCd <= 0) {
      this.useSkill(game);
    }
    this.prevSkill = sk;

    // 手榴弹(按下边沿触发)
    const gr = !!get(c.grenade);
    if (gr && !this.prevGrenade && this.grenades > 0) {
      this.throwGrenade(game);
    }
    this.prevGrenade = gr;

    // 追踪导弹(按下边沿触发)
    const ms = !!get(c.missile);
    if (ms && !this.prevMissile && this.missiles > 0) {
      this.launchMissile(game);
    }
    this.prevMissile = ms;
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
    // 飞机:飞越所有墙壁,仅检查边界(不与墙/方块碰撞)
    if (!this.isAir) {
      const x0 = Math.floor(left / CELL), x1 = Math.floor((right - 0.01) / CELL);
      const y0 = Math.floor(top / CELL), y1 = Math.floor((bottom - 0.01) / CELL);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const v = game.grid[cy][cx];
          if (v !== 0) return true;
        }
      }
    }
    // 与其他任何存活敌方坦克重叠则碰撞(同方坦克可互相穿过)
    for (const other of game.tanks) {
      if (other === this || !other.alive) continue;
      if (other.player === this.player) continue;  // 同方穿透
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
    // 喷火坦克:生成火焰流(射程3格,技能期间翻倍)
    if (this.skin === 'flamethrower') {
      const range = this.flameBoostTimer > 0 ? 6 : 3;
      game.flames.push(new Flame(bx, by, this.dir, this.player, this.color, dmg, range));
      SFX.play('flame');
      return;
    }
    const bounces = game.bounce ? 2 : 0;
    const b = new Bullet(bx, by, this.dir, this.player, this.color, dmg, bounces);
    // 飞机:炮弹可穿透砖墙(空对地扫射)
    if (this.isAir) b.penetrateBrick = true;
    game.bullets.push(b);
    SFX.play(this.skin === 'gunner' ? 'mg' : 'shoot');
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
    } else if (skin === 'gunner') {
      // 弹幕扫射: 5 发扇形高速弹
      const v = DIR_VEC[this.dir];
      const perp = { x: -v.y, y: v.x };
      const dmg = this.attack * (this.powerTimer > 0 ? 2 : 1);
      const bounces = game.bounce ? 2 : 0;
      for (const off of [-16, -8, 0, 8, 16]) {
        const bx = this.x + v.x * (this.half + 4) + perp.x * off;
        const by = this.y + v.y * (this.half + 4) + perp.y * off;
        const b = new Bullet(bx, by, this.dir, this.player, this.color, dmg, bounces);
        b.speed = 6.5;  // 高速弹
        game.bullets.push(b);
      }
      game.spawnExplosion(this.x + v.x * (this.half + 6), this.y + v.y * (this.half + 6), 'spark');
    } else if (skin === 'flamethrower') {
      // 烈焰风暴: 6 秒射程翻倍 + 持续大火焰
      this.flameBoostTimer = 6 * 60;
      game.spawnExplosion(this.x, this.y, 'spark');
    } else if (skin === 'tiger') {
      // 重炮轰击: 穿透砖墙的 2 倍伤害重型炮弹
      const v = DIR_VEC[this.dir];
      const bx = this.x + v.x * (this.half + 4);
      const by = this.y + v.y * (this.half + 4);
      const b = new Bullet(bx, by, this.dir, this.player, this.color, this.attack * 2, 0);
      b.speed = 4.5; b.radius = 5;
      b.penetrateBrick = true; // 穿透砖墙
      game.bullets.push(b);
      game.spawnExplosion(bx, by, 'spark');
    } else if (skin === 't34') {
      // 苏维埃冲锋: 3 秒移速 x2.2 + 减伤50%
      this.dashTimer = 3 * 60;
      this.speedTimer = Math.max(this.speedTimer, 3 * 60);
      this.damageReductionTimer = 3 * 60;
      game.spawnExplosion(this.x, this.y, 'spark');
    } else if (skin === 'sherman') {
      // 火力压制: 5 秒无冷却连发
      this.rapidTimer = 5 * 60;
      game.spawnExplosion(this.x, this.y, 'spark');
    } else if (skin === 'churchill') {
      // 装甲堡垒: 6 秒无敌 + 反弹炮弹
      this.reflectTimer = 6 * 60;
      this.invuln = Math.max(this.invuln, 6 * 60);
      game.spawnExplosion(this.x, this.y, 'spark');
    } else if (skin === 'panther') {
      // 穿甲狙击: 高速穿甲弹,穿透所有墙壁
      const v = DIR_VEC[this.dir];
      const bx = this.x + v.x * (this.half + 4);
      const by = this.y + v.y * (this.half + 4);
      const b = new Bullet(bx, by, this.dir, this.player, this.color, this.attack, 0);
      b.speed = 7; b.radius = 3;
      b.penetrateAll = true; // 穿透所有墙壁
      game.bullets.push(b);
      game.spawnExplosion(bx, by, 'spark');
    } else if (skin === 'f16') {
      // 响尾蛇弹幕: 3 发追踪弹
      const v = DIR_VEC[this.dir];
      const perp = { x: -v.y, y: v.x };
      for (const off of [-10, 0, 10]) {
        const bx = this.x + v.x * (this.half + 4) + perp.x * off;
        const by = this.y + v.y * (this.half + 4) + perp.y * off;
        const m = new Missile(bx, by, this.dir, this.player, this.color);
        m.speed = 3.5; m.damage = this.attack;
        game.missiles.push(m);
      }
      game.spawnExplosion(this.x, this.y, 'spark');
    } else if (skin === 'su27') {
      // 眼镜蛇机动: 2 秒无敌 + 移速 x2.2
      this.shieldTimer = 2 * 60;
      this.invuln = Math.max(this.invuln, 2 * 60);
      this.dashTimer = 2 * 60;
      this.speedTimer = Math.max(this.speedTimer, 2 * 60);
      game.spawnExplosion(this.x, this.y, 'spark');
    } else if (skin === 'a10') {
      // 疣猪扫射: 5 发穿甲弹扇形
      const v = DIR_VEC[this.dir];
      const perp = { x: -v.y, y: v.x };
      const dmg = this.attack * (this.powerTimer > 0 ? 2 : 1);
      for (const off of [-16, -8, 0, 8, 16]) {
        const bx = this.x + v.x * (this.half + 4) + perp.x * off;
        const by = this.y + v.y * (this.half + 4) + perp.y * off;
        const b = new Bullet(bx, by, this.dir, this.player, this.color, dmg, 0);
        b.speed = 6.5; b.penetrateBrick = true;
        game.bullets.push(b);
      }
      game.spawnExplosion(this.x + v.x * (this.half + 6), this.y + v.y * (this.half + 6), 'spark');
    } else if (skin === 'b52') {
      // 地毯轰炸: 投下 3 颗大炸弹
      for (let i = -1; i <= 1; i++) {
        const gx = this.x + i * 24;
        const gy = this.y + this.half + 6;
        const g = new Grenade(gx, gy, DIR.DOWN, this.player, this.color);
        g.damage = this.attack + 1; g.radius = 36;
        game.grenades.push(g);
      }
      game.spawnExplosion(this.x, this.y, 'spark');
    } else if (skin === 'apache') {
      // 地狱火导弹: 穿透墙壁的追踪导弹
      const v = DIR_VEC[this.dir];
      const mx = this.x + v.x * (this.half + 6);
      const my = this.y + v.y * (this.half + 6);
      const m = new Missile(mx, my, this.dir, this.player, this.color);
      m.speed = 4; m.damage = this.attack + 1; m.penetrateWall = true;
      game.missiles.push(m);
      game.spawnExplosion(mx, my, 'spark');
    }
    SFX.play('skill');
    if (game.onLog) game.onLog(`玩家${this.player} 释放技能: ${SKILL_DEF[skin].name}`);
  }

  // 投掷手榴弹
  throwGrenade(game) {
    this.grenades--;
    const v = DIR_VEC[this.dir];
    const gx = this.x + v.x * (this.half + 6);
    const gy = this.y + v.y * (this.half + 6);
    game.grenades.push(new Grenade(gx, gy, this.dir, this.player, this.color));
    SFX.play('grenade');
    if (game.onLog) game.onLog(`玩家${this.player} 投掷手榴弹 (剩余${this.grenades})`);
  }

  // 发射追踪导弹
  launchMissile(game) {
    this.missiles--;
    const v = DIR_VEC[this.dir];
    const mx = this.x + v.x * (this.half + 6);
    const my = this.y + v.y * (this.half + 6);
    game.missiles.push(new Missile(mx, my, this.dir, this.player, this.color));
    SFX.play('missile');
    if (game.onLog) game.onLog(`玩家${this.player} 发射追踪导弹 (剩余${this.missiles})`);
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
    if (this.invuln > 0 || this.shieldTimer > 0 || this.reflectTimer > 0) return false;
    // T-34 减伤50%
    if (this.damageReductionTimer > 0) damage = Math.max(1, Math.floor(damage / 2));
    this.hp -= damage;
    this.flashTimer = 12;
    this.invuln = 30;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  }

  draw(ctx) {
    if (!this.alive) return;
    if (this.flashTimer > 0 && Math.floor(this.flashTimer / 3) % 2 === 0) return;
    // 飞机:绘制地面阴影(偏移投影)表示在空中
    if (this.isAir) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(this.x + 4, this.y + 4, this.half, this.half * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.dir * Math.PI / 2);
    drawTankBody(ctx, this.skin, this.color, this.player, (this.invuln > 0 || this.shieldTimer > 0), this.indexInTeam || 0);
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
    // T-34 减伤光环(金色)
    if (this.damageReductionTimer > 0) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalAlpha = 0.3 + Math.sin(performance.now() / 150) * 0.15;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.half + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // 丘吉尔装甲堡垒反弹(钢蓝色)
    if (this.reflectTimer > 0) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const a = 0.35 + Math.sin(performance.now() / 100) * 0.2;
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, this.half + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.arc(0, 0, this.half + 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawTankBody(ctx, skin, color, player, invuln, playerNum) {
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
  } else if (skin === 'gunner') {
    // 机关枪坦克: 双管炮 + 弹药箱
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
    // 弹药箱(右侧)
    ctx.fillStyle = shadeColor(color, -25);
    ctx.fillRect(half - 8, -3, 4, 6);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(half - 8, -3, 4, 6);
    // 双管炮
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-2, -half - 6, 3, 10);
    ctx.fillRect(0, -half - 6, 3, 10);
    // 枪口
    ctx.fillStyle = '#374151';
    ctx.fillRect(-2, -half - 7, 3, 2);
    ctx.fillRect(0, -half - 7, 3, 2);
    // 中心圆
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shadeColor(color, 40);
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
  } else if (skin === 'flamethrower') {
    // 喷火坦克: 大型燃料罐 + 粗炮管 + 火焰口
    ctx.fillStyle = tread;
    ctx.fillRect(-half, -half, 5, half * 2);
    ctx.fillRect(half - 5, -half, 5, half * 2);
    ctx.fillStyle = '#4b5563';
    for (let i = -half + 2; i < half - 2; i += 5) {
      ctx.fillRect(-half + 0.5, i, 4, 2.5);
      ctx.fillRect(half - 5.5, i, 4, 2.5);
    }
    roundRect(ctx, -half + 5, -half + 2, half * 2 - 10, half * 2 - 4, 3);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.5; ctx.stroke();
    // 背部燃料罐(左侧)
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-half - 2, -5, 5, 10);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-half - 1, -4, 2, 2);
    ctx.fillRect(-half - 1, 0, 2, 2);
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-half - 2, -5, 5, 10);
    // 粗炮管
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-3, -half - 7, 6, 11);
    ctx.fillStyle = '#374151';
    ctx.fillRect(-3.5, -half - 9, 7, 3);
    // 火焰口(橙色高光)
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, -half - 7, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, -half - 7, 1.2, 0, Math.PI * 2);
    ctx.fill();
    // 中心圆
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
  } else if (skin === 'tiger') {
    // 虎式: 极厚重履带 + 方形炮塔 + 超粗炮管 + 迷彩条纹
    ctx.fillStyle = tread;
    ctx.fillRect(-half, -half, 7, half * 2);
    ctx.fillRect(half - 7, -half, 7, half * 2);
    ctx.fillStyle = '#3b4252';
    for (let i = -half + 2; i < half - 2; i += 5) {
      ctx.fillRect(-half + 0.5, i, 6, 2.5);
      ctx.fillRect(half - 6.5, i, 6, 2.5);
    }
    // 方形炮塔
    roundRect(ctx, -half + 7, -half + 1, half * 2 - 14, half * 2 - 2, 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 2.5; ctx.stroke();
    // 迷彩条纹
    ctx.fillStyle = shadeColor(color, -30);
    ctx.fillRect(-half + 8, -half + 3, half * 2 - 16, 2);
    ctx.fillRect(-half + 8, half - 5, half * 2 - 16, 2);
    // 超粗炮管
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-4, -half - 8, 8, 12);
    ctx.fillStyle = '#374151';
    ctx.fillRect(-4.5, -half - 10, 9, 3);
    // 炮口
    ctx.fillStyle = '#111827';
    ctx.fillRect(-3, -half - 10, 6, 2);
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shadeColor(color, -20);
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
  } else if (skin === 't34') {
    // T-34: 倾斜装甲(梯形) + 五角星 + 中型炮管
    ctx.fillStyle = tread;
    ctx.fillRect(-half, -half, 5, half * 2);
    ctx.fillRect(half - 5, -half, 5, half * 2);
    ctx.fillStyle = '#4b5563';
    for (let i = -half + 2; i < half - 2; i += 4) {
      ctx.fillRect(-half + 0.5, i, 4, 2);
      ctx.fillRect(half - 4.5, i, 4, 2);
    }
    // 倾斜装甲(梯形)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-half + 6, -half + 1);
    ctx.lineTo(half - 6, -half + 1);
    ctx.lineTo(half - 4, half - 1);
    ctx.lineTo(-half + 4, half - 1);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.5; ctx.stroke();
    // 五角星(苏联标识)
    ctx.fillStyle = '#fbbf24';
    drawStar(ctx, 0, 0, 3, 1.5, 5);
    // 中型炮管
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-2.5, -half - 6, 5, 10);
    ctx.fillStyle = '#374151';
    ctx.fillRect(-3, -half - 8, 6, 2.5);
  } else if (skin === 'sherman') {
    // 谢尔曼: 圆形炮塔 + 高炮管 + 弹药架(量产型标识)
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
    // 圆形炮塔
    ctx.fillStyle = shadeColor(color, -15);
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1; ctx.stroke();
    // 弹药架(右侧条纹)
    ctx.fillStyle = shadeColor(color, -25);
    ctx.fillRect(half - 7, -4, 3, 8);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(half - 6, -3, 1, 2);
    ctx.fillRect(half - 6, 1, 1, 2);
    // 高炮管
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-2, -half - 7, 4, 11);
    ctx.fillStyle = '#374151';
    ctx.fillRect(-2.5, -half - 9, 5, 2.5);
    ctx.fillStyle = shadeColor(color, 40);
    ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (skin === 'churchill') {
    // 丘吉尔: 超厚重装甲 + 履带全包 + 极短炮管
    ctx.fillStyle = tread;
    ctx.fillRect(-half - 1, -half, 8, half * 2);
    ctx.fillRect(half - 7, -half, 8, half * 2);
    ctx.fillStyle = '#3b4252';
    for (let i = -half + 2; i < half - 2; i += 6) {
      ctx.fillRect(-half - 0.5, i, 7, 3);
      ctx.fillRect(half - 6.5, i, 7, 3);
    }
    // 超厚车体
    roundRect(ctx, -half + 7, -half, half * 2 - 14, half * 2, 1);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.stroke();
    // 装甲铆钉(圆点)
    ctx.fillStyle = dark;
    for (let i = -half + 4; i < half - 2; i += 5) {
      ctx.beginPath(); ctx.arc(-half + 9, i, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(half - 9, i, 1, 0, Math.PI * 2); ctx.fill();
    }
    // 极短粗炮管
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-3.5, -half - 5, 7, 8);
    ctx.fillStyle = '#374151';
    ctx.fillRect(-4, -half - 7, 8, 2.5);
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shadeColor(color, -10);
    ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (skin === 'panther') {
    // 豹式: 流线型倾斜装甲 + 细长高速炮管 + 穿甲弹标识
    ctx.fillStyle = tread;
    ctx.fillRect(-half, -half, 4, half * 2);
    ctx.fillRect(half - 4, -half, 4, half * 2);
    ctx.fillStyle = '#3b4252';
    for (let i = -half + 2; i < half - 2; i += 4) {
      ctx.fillRect(-half + 0.5, i, 3.5, 2);
      ctx.fillRect(half - 3.5, i, 3.5, 2);
    }
    // 流线倾斜装甲
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-half + 4, -half + 2);
    ctx.lineTo(half - 4, -half + 2);
    ctx.lineTo(half - 2, half - 2);
    ctx.lineTo(-half + 2, half - 2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.5; ctx.stroke();
    // 细长高速炮管
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-1.5, -half - 10, 3, 14);
    ctx.fillStyle = '#374151';
    ctx.fillRect(-2, -half - 12, 4, 2.5);
    // 穿甲弹标识(黄色三角)
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(-2, 2);
    ctx.lineTo(2, 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(0, 3, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (skin === 'f16') {
    // F-16 战隼: 三角翼 + 尖锐机头
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -half - 3);          // 尖机头
    ctx.lineTo(-3, -half + 2);
    ctx.lineTo(-half, half - 2);        // 左翼尖
    ctx.lineTo(-half + 2, half);
    ctx.lineTo(-3, half - 4);
    ctx.lineTo(-2, half);
    ctx.lineTo(2, half);
    ctx.lineTo(3, half - 4);
    ctx.lineTo(half - 2, half);
    ctx.lineTo(half, half - 2);         // 右翼尖
    ctx.lineTo(3, -half + 2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.stroke();
    // 座舱罩
    ctx.fillStyle = '#1e3a5f';
    ctx.beginPath(); ctx.ellipse(0, -2, 2, 4, 0, 0, Math.PI * 2); ctx.fill();
    // 尾翼
    ctx.fillStyle = dark;
    ctx.fillRect(-1, half - 3, 2, 5);
  } else if (skin === 'su27') {
    // 苏-27 侧卫: 重型双发 + 后掠翼
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -half - 2);
    ctx.lineTo(-2, -half + 1);
    ctx.lineTo(-half + 1, half - 4);    // 翼根
    ctx.lineTo(-half - 1, half - 1);     // 翼尖
    ctx.lineTo(-2, half - 2);
    ctx.lineTo(-3, half + 2);
    ctx.lineTo(3, half + 2);
    ctx.lineTo(2, half - 2);
    ctx.lineTo(half + 1, half - 1);
    ctx.lineTo(half - 1, half - 4);
    ctx.lineTo(2, -half + 1);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.stroke();
    // 座舱罩
    ctx.fillStyle = '#1e3a5f';
    ctx.beginPath(); ctx.ellipse(0, -1, 2.5, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    // 双发尾喷
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(-3, half, 2, 3);
    ctx.fillRect(1, half, 2, 3);
  } else if (skin === 'a10') {
    // A-10 疣猪: 直翼 + 机头巨炮 + 双发
    ctx.fillStyle = color;
    ctx.fillRect(-2.5, -half - 2, 5, half * 2 + 2); // 机身
    // 直翼(贯穿)
    ctx.fillStyle = shadeColor(color, -20);
    ctx.fillRect(-half - 2, -2, half * 2 + 4, 5);
    ctx.strokeStyle = dark; ctx.lineWidth = 1;
    ctx.strokeRect(-half - 2, -2, half * 2 + 4, 5);
    // 机头巨炮(GAU-8)
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-1.5, -half - 8, 3, 8);
    ctx.fillStyle = '#374151';
    ctx.fillRect(-2, -half - 9, 4, 2);
    // 座舱
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(-2, -half + 2, 4, 5);
    // 双发尾吊
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(-half + 2, half - 2, 4, 5);
    ctx.fillRect(half - 6, half - 2, 4, 5);
    // 标识
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-1, 2, 2, 3);
  } else if (skin === 'b52') {
    // B-52 同温层堡垒: 细长机身 + 大后掠翼 + 8 发
    ctx.fillStyle = color;
    ctx.fillRect(-2, -half - 1, 4, half * 2 + 4);  // 细长机身
    // 大后掠翼
    ctx.fillStyle = shadeColor(color, -15);
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-half - 3, half);
    ctx.lineTo(-2, half);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(half + 3, half);
    ctx.lineTo(2, half);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1; ctx.strokeRect(-2, -half - 1, 4, half * 2 + 4);
    // 座舱
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(-2, -half, 4, 3);
    // 4组双发吊舱
    ctx.fillStyle = '#6b7280';
    for (let i = 0; i < 4; i++) {
      const px = -half + 1 + i * (half * 2 / 3);
      ctx.fillRect(px, half, 2, 4);
    }
    // 尾翼
    ctx.fillStyle = shadeColor(color, -25);
    ctx.fillRect(-3, half, 6, 4);
  } else if (skin === 'apache') {
    // 阿帕奇武装直升机: 旋翼 + 串列座舱 + 尾梁
    // 机身
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, half, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.stroke();
    // 串列座舱(前)
    ctx.fillStyle = '#1e3a5f';
    ctx.beginPath(); ctx.ellipse(0, -4, 3, 4, 0, 0, Math.PI * 2); ctx.fill();
    // 串列座舱(后)
    ctx.fillStyle = '#2563eb';
    ctx.beginPath(); ctx.ellipse(0, 3, 2.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    // 短翼(挂载点)
    ctx.fillStyle = shadeColor(color, -25);
    ctx.fillRect(-half - 1, -1, half * 2 + 2, 3);
    // 挂载导弹
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-half, 0, 2, 4);
    ctx.fillRect(half - 2, 0, 2, 4);
    // 尾梁
    ctx.fillStyle = shadeColor(color, -10);
    ctx.fillRect(-1.5, half - 2, 3, 8);
    // 尾桨(旋转效果)
    ctx.fillStyle = '#9ca3af';
    const spin = performance.now() / 30;
    ctx.save();
    ctx.translate(0, half + 6);
    ctx.rotate(spin);
    ctx.fillRect(-5, -0.5, 10, 1);
    ctx.restore();
    // 主旋翼(旋转模糊圈)
    ctx.strokeStyle = 'rgba(156,163,175,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -half - 4, half + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#374151';
    ctx.fillRect(-0.5, -half - 6, 1, 4);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = player === 1 ? '#fff' : '#fde68a';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((player === 1 ? 'P' : 'E') + (playerNum + 1), 0, half - 1);
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

// 绘制五角星(cx,cy=中心, outer=外半径, inner=内半径, points=点数)
function drawStar(ctx, cx, cy, outer, inner, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
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
