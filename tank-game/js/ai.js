// 人机对战 AI 引擎
// 难度: easy(新手) / medium(普通) / hard(困难) / nightmare(噩梦)
// 通过模拟玩家2的按键来控制坦克

const AI_DIFFICULTY = {
  easy:      { name: '新手',  decisionInterval: 28, fireChance: 0.35, leadFactor: 0.0, dodgeChance: 0.10, skillChance: 0.15, wanderChance: 0.35, aimTolerance: 3 },
  medium:    { name: '普通',  decisionInterval: 16, fireChance: 0.60, leadFactor: 0.4, dodgeChance: 0.35, skillChance: 0.35, wanderChance: 0.18, aimTolerance: 2 },
  hard:      { name: '困难',  decisionInterval: 9,  fireChance: 0.82, leadFactor: 0.7, dodgeChance: 0.60, skillChance: 0.55, wanderChance: 0.08, aimTolerance: 1 },
  nightmare: { name: '噩梦',  decisionInterval: 5,  fireChance: 0.95, leadFactor: 0.9, dodgeChance: 0.82, skillChance: 0.75, wanderChance: 0.03, aimTolerance: 1 },
};

class TankAI {
  constructor(difficulty, game) {
    this.difficulty = difficulty || 'medium';
    this.meta = AI_DIFFICULTY[this.difficulty] || AI_DIFFICULTY.medium;
    this.game = game;
    this.tank = game.tanks[1];  // 玩家2
    this.target = null;        // 目标坦克(玩家1)
    this.tick = 0;
    this.lastDecision = -999;
    this.currentDir = null;    // 当前移动方向代码: 'up','down','left','right',null
    this.dirHoldTime = 0;      // 当前方向持续帧数
    this.stuckTimer = 0;       // 卡住计时
    this.lastX = 0;
    this.lastY = 0;
    this.skillPressed = false;
    this.firePressed = false;
  }

  // 每帧调用
  update() {
    this.tick++;
    // 更新目标
    this.target = this.game.tanks.find(t => t.player !== this.tank.player && t.alive);
    if (!this.target || !this.tank.alive) {
      this.releaseAllKeys();
      return;
    }

    // 按决策间隔更新方向决策
    if (this.tick - this.lastDecision >= this.meta.decisionInterval) {
      this.lastDecision = this.tick;
      this.makeDecision();
    }

    // 实时射击和技能判断(更频繁)
    this.handleFire();
    this.handleSkill();

    // 卡住检测
    this.checkStuck();
  }

  makeDecision() {
    const action = this.chooseAction();
    this.applyMovement(action);
  }

  // 选择最佳移动方向
  chooseAction() {
    const opts = [];
    const me = this.tank;
    const tgt = this.target;

    // 1. 紧急躲避:如果有子弹飞向自己
    const dodgeDir = this.checkIncomingBullets();
    if (dodgeDir && Math.random() < this.meta.dodgeChance) {
      return dodgeDir;
    }

    // 2. 道具拾取:如果附近有道具且不难度低时概率前往
    const puDir = this.findNearestPowerUp();
    if (puDir && (me.hp < me.maxHp * 0.5 || Math.random() < 0.3)) {
      opts.push({ dir: puDir, weight: 3 });
    }

    // 3. 战术移动:根据与目标的关系选择
    const dx = tgt.x - me.x;
    const dy = tgt.y - me.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    // 如果在同一行/列且视线清晰 -> 停下瞄准射击
    if (this.hasLineOfSight(me, tgt)) {
      // 已对准则停下
      if (adx < CELL * 0.6 && this.isAimingAt(me, tgt, DIR.LEFT, DIR.RIGHT)) {
        return null; // 停下射击
      }
      if (ady < CELL * 0.6 && this.isAimingAt(me, tgt, DIR.UP, DIR.DOWN)) {
        return null;
      }
    }

    // 4. 向目标靠近:优先选择能接近目标且不被阻挡的方向
    const dist = Math.sqrt(dx * dx + dy * dy);
    const idealDist = this.difficulty === 'easy' ? 8 * CELL : this.difficulty === 'medium' ? 6 * CELL : 4 * CELL;

    // 尝试朝目标方向移动
    if (adx > ady) {
      // 水平接近
      if (dx > 0) opts.push({ dir: 'right', weight: 5 });
      else opts.push({ dir: 'left', weight: 5 });
      // 同时也需要垂直对齐
      if (dy > 0) opts.push({ dir: 'down', weight: 3 });
      else opts.push({ dir: 'up', weight: 3 });
    } else {
      if (dy > 0) opts.push({ dir: 'down', weight: 5 });
      else opts.push({ dir: 'up', weight: 5 });
      if (dx > 0) opts.push({ dir: 'right', weight: 3 });
      else opts.push({ dir: 'left', weight: 3 });
    }

    // 5. 保持距离:如果太近则后退
    if (dist < idealDist * 0.5) {
      if (adx > ady) {
        if (dx > 0) opts.push({ dir: 'left', weight: 4 });
        else opts.push({ dir: 'right', weight: 4 });
      } else {
        if (dy > 0) opts.push({ dir: 'up', weight: 4 });
        else opts.push({ dir: 'down', weight: 4 });
      }
    }

    // 6. 随机游走(低难度更频繁)
    if (Math.random() < this.meta.wanderChance) {
      const dirs = ['up', 'down', 'left', 'right'];
      opts.push({ dir: dirs[Math.floor(Math.random() * 4)], weight: 2 });
    }

    // 筛选可行方向(不撞墙)
    const valid = opts.filter(o => this.canMove(o.dir));
    if (valid.length === 0) {
      // 全不行,尝试任何方向
      const all = [{ dir: 'up' }, { dir: 'down' }, { dir: 'left' }, { dir: 'right' }].filter(o => this.canMove(o.dir));
      if (all.length > 0) return all[0].dir;
      return null;
    }

    // 加权随机
    const totalW = valid.reduce((s, o) => s + o.weight, 0);
    let r = Math.random() * totalW;
    for (const o of valid) {
      r -= o.weight;
      if (r <= 0) return o.dir;
    }
    return valid[0].dir;
  }

  // 检测来袭子弹,返回躲避方向
  checkIncomingBullets() {
    const me = this.tank;
    for (const b of this.game.bullets) {
      if (b.dead || b.owner === me.player) continue;
      const dx = b.x - me.x;
      const dy = b.y - me.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > CELL * 4) continue;

      const bv = DIR_VEC[b.dir];
      // 子弹朝向自己?
      const towardMe = (bv.x * (me.x - b.x) + bv.y * (me.y - b.y)) > 0;
      if (!towardMe) continue;

      // 是否在同一线上(水平或垂直)
      if (bv.x !== 0) {
        // 水平子弹,垂直距离近
        if (Math.abs(dy) < me.half + 4) {
          // 向上或下躲
          return Math.random() < 0.5 ? 'up' : 'down';
        }
      } else {
        if (Math.abs(dx) < me.half + 4) {
          return Math.random() < 0.5 ? 'left' : 'right';
        }
      }
    }
    return null;
  }

  // 寻找最近道具方向
  findNearestPowerUp() {
    const me = this.tank;
    let best = null;
    let bestDist = CELL * 6;
    for (const pu of this.game.powerups) {
      if (pu.dead) continue;
      const d = Math.abs(pu.x - me.x) + Math.abs(pu.y - me.y);
      if (d < bestDist) {
        bestDist = d;
        best = pu;
      }
    }
    if (!best) return null;
    const dx = best.x - me.x;
    const dy = best.y - me.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left';
    }
    return dy > 0 ? 'down' : 'up';
  }

  // 判断从 me 是否能直线看到 tgt(无砖墙/钢板阻挡)
  hasLineOfSight(a, b) {
    const x0 = Math.floor(a.x / CELL);
    const y0 = Math.floor(a.y / CELL);
    const x1 = Math.floor(b.x / CELL);
    const y1 = Math.floor(b.y / CELL);
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    if (dx !== 0 && dy !== 0) return false; // 不在同一直线

    let cx = x0, cy = y0;
    while (cx !== x1 || cy !== y1) {
      if (dx !== 0) cx += dx;
      if (dy !== 0) cy += dy;
      if (cx === x1 && cy === y1) break;
      if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return false;
      const v = this.game.grid[cy][cx];
      if (v !== 0) return false;
    }
    return true;
  }

  // 判断坦克是否朝向目标(dirs 为可能的朝向)
  isAimingAt(me, tgt, ...dirs) {
    return dirs.includes(me.dir) && this.hasLineOfSight(me, tgt);
  }

  // 是否能向某方向移动(简单判断:前方一格非阻挡)
  canMove(dirStr) {
    const me = this.tank;
    const v = this.dirStrToVec(dirStr);
    const nx = me.x + v.x * (me.effSpeed() + 2);
    const ny = me.y + v.y * (me.effSpeed() + 2);
    return !me.collidesAt(nx, ny, this.game);
  }

  dirStrToVec(s) {
    if (s === 'up') return DIR_VEC[DIR.UP];
    if (s === 'down') return DIR_VEC[DIR.DOWN];
    if (s === 'left') return DIR_VEC[DIR.LEFT];
    return DIR_VEC[DIR.RIGHT];
  }

  dirStrToCode(s) {
    if (s === 'up') return DIR.UP;
    if (s === 'down') return DIR.DOWN;
    if (s === 'left') return DIR.LEFT;
    return DIR.RIGHT;
  }

  // 应用移动:设置按键
  applyMovement(dirStr) {
    const k = this.game.keys;
    const c = this.tank.controls;
    // 先释放所有
    k[c.up] = false; k[c.down] = false; k[c.left] = false; k[c.right] = false;

    if (dirStr === null) return;

    // 如果方向变了,重置持续计时
    if (dirStr !== this.currentDir) {
      this.currentDir = dirStr;
      this.dirHoldTime = 0;
    } else {
      this.dirHoldTime++;
    }

    if (dirStr === 'up') k[c.up] = true;
    else if (dirStr === 'down') k[c.down] = true;
    else if (dirStr === 'left') k[c.left] = true;
    else if (dirStr === 'right') k[c.right] = true;
  }

  // 射击判断
  handleFire() {
    const me = this.tank;
    const tgt = this.target;
    const k = this.game.keys;
    const c = this.tank.controls;

    // 有视线且大致对准
    let shouldFire = false;

    if (this.hasLineOfSight(me, tgt)) {
      const dx = tgt.x - me.x;
      const dy = tgt.y - me.y;
      const tol = this.meta.aimTolerance * CELL * 0.3;

      // 判断朝向是否对准
      if ((me.dir === DIR.LEFT || me.dir === DIR.RIGHT) && Math.abs(dy) < tol) shouldFire = true;
      if ((me.dir === DIR.UP || me.dir === DIR.DOWN) && Math.abs(dx) < tol) shouldFire = true;

      // 预判:高难度会转向目标方向再开火
      if (!shouldFire && this.meta.leadFactor > 0) {
        if (Math.abs(dy) < tol) {
          // 需要转水平
          if (dx > 0) { k[c.right] = true; k[c.left] = false; }
          if (dx < 0) { k[c.left] = true; k[c.right] = false; }
          // 短暂转向后开火
          shouldFire = Math.random() < this.meta.fireChance;
        } else if (Math.abs(dx) < tol) {
          if (dy > 0) { k[c.down] = true; k[c.up] = false; }
          if (dy < 0) { k[c.up] = true; k[c.down] = false; }
          shouldFire = Math.random() < this.meta.fireChance;
        }
      }
    }

    // 概率射击(低难度会失误)
    if (shouldFire && Math.random() > this.meta.fireChance) shouldFire = false;

    k[c.fire] = shouldFire;
  }

  // 技能判断
  handleSkill() {
    const me = this.tank;
    const k = this.game.keys;
    const c = this.tank.controls;

    if (me.skillCd > 0) {
      k[c.skill] = false;
      this.skillPressed = false;
      return;
    }

    let useSkill = false;
    const hpRatio = me.hp / me.maxHp;

    // 根据皮肤决定技能使用策略
    if (me.skin === 'shield' && hpRatio < 0.5) {
      // 守卫:血量低时修复
      useSkill = true;
    } else if (me.skin === 'heavy') {
      // 重型:被射击或近距离时开护盾
      if (this.isUnderFire() || this.targetDist() < CELL * 3) useSkill = true;
    } else if (me.skin === 'scout') {
      // 突击:近距离或需要逃跑时冲刺
      if (this.targetDist() < CELL * 2.5 || hpRatio < 0.3) useSkill = true;
    } else if (me.skin === 'classic') {
      // 经典:有视线时三连射击
      if (this.hasLineOfSight(me, this.target) && this.targetDist() < CELL * 10) useSkill = true;
    }

    if (useSkill && Math.random() < this.meta.skillChance) {
      if (!this.skillPressed) {
        k[c.skill] = true;
        this.skillPressed = true;
      }
    } else {
      k[c.skill] = false;
      this.skillPressed = false;
    }
  }

  isUnderFire() {
    const me = this.tank;
    for (const b of this.game.bullets) {
      if (b.dead || b.owner === me.player) continue;
      const d = Math.sqrt((b.x - me.x) ** 2 + (b.y - me.y) ** 2);
      if (d < CELL * 4) {
        const bv = DIR_VEC[b.dir];
        if (bv.x * (me.x - b.x) + bv.y * (me.y - b.y) > 0) return true;
      }
    }
    return false;
  }

  targetDist() {
    if (!this.target) return 9999;
    return Math.sqrt((this.target.x - this.tank.x) ** 2 + (this.target.y - this.tank.y) ** 2);
  }

  // 卡住检测:如果位置几乎没变且有移动输入,尝试换方向
  checkStuck() {
    const moved = Math.abs(this.tank.x - this.lastX) + Math.abs(this.tank.y - this.lastY);
    this.lastX = this.tank.x;
    this.lastY = this.tank.y;

    if (this.currentDir !== null && moved < 0.5) {
      this.stuckTimer++;
      if (this.stuckTimer > 15) {
        // 强制换方向
        const dirs = ['up', 'down', 'left', 'right'].filter(d => d !== this.currentDir && this.canMove(d));
        if (dirs.length > 0) {
          this.applyMovement(dirs[Math.floor(Math.random() * dirs.length)]);
        }
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }
  }

  releaseAllKeys() {
    const k = this.game.keys;
    const c = this.tank.controls;
    k[c.up] = false; k[c.down] = false; k[c.left] = false; k[c.right] = false;
    k[c.fire] = false; k[c.skill] = false;
  }
}
