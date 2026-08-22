// 人机对战 AI 引擎
// 难度: noob(菜鸟) / easy(新手) / medium(普通) / hard(困难) / nightmare(噩梦) / hell(地狱)
// 通过模拟玩家2的按键来控制坦克

const AI_DIFFICULTY = {
  noob:      { name: '菜鸟',  decisionInterval: 40, fireChance: 0.18, leadFactor: 0.0, dodgeChance: 0.03, skillChance: 0.05, wanderChance: 0.55, aimTolerance: 4, grenadeChance: 0.05, missileChance: 0.0,  retreatHp: 0.15 },
  easy:      { name: '新手',  decisionInterval: 28, fireChance: 0.35, leadFactor: 0.0, dodgeChance: 0.10, skillChance: 0.15, wanderChance: 0.35, aimTolerance: 3, grenadeChance: 0.15, missileChance: 0.05, retreatHp: 0.20 },
  medium:    { name: '普通',  decisionInterval: 16, fireChance: 0.60, leadFactor: 0.4, dodgeChance: 0.35, skillChance: 0.35, wanderChance: 0.18, aimTolerance: 2, grenadeChance: 0.35, missileChance: 0.20, retreatHp: 0.30 },
  hard:      { name: '困难',  decisionInterval: 9,  fireChance: 0.82, leadFactor: 0.7, dodgeChance: 0.60, skillChance: 0.55, wanderChance: 0.08, aimTolerance: 1, grenadeChance: 0.55, missileChance: 0.40, retreatHp: 0.35 },
  nightmare: { name: '噩梦',  decisionInterval: 5,  fireChance: 0.95, leadFactor: 0.9, dodgeChance: 0.82, skillChance: 0.75, wanderChance: 0.03, aimTolerance: 1, grenadeChance: 0.75, missileChance: 0.65, retreatHp: 0.40 },
  hell:      { name: '地狱',  decisionInterval: 3,  fireChance: 0.99, leadFactor: 1.0, dodgeChance: 0.95, skillChance: 0.90, wanderChance: 0.01, aimTolerance: 0, grenadeChance: 0.90, missileChance: 0.85, retreatHp: 0.45 },
};

class TankAI {
  constructor(difficulty, game) {
    this.difficulty = difficulty || 'medium';
    this.meta = AI_DIFFICULTY[this.difficulty] || AI_DIFFICULTY.medium;
    this.game = game;
    this.tank = game.tanks[1];  // 玩家2
    this.target = null;
    this.tick = 0;
    this.lastDecision = -999;
    this.currentDir = null;
    this.dirHoldTime = 0;
    this.stuckTimer = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.skillPressed = false;
    this.grenadePressed = false;
    this.missilePressed = false;
    this.lastGrenadeAttempt = -999;
    this.lastMissileAttempt = -999;
    // 高难度: 预测目标移动方向
    this.targetLastX = 0;
    this.targetLastY = 0;
    this.targetVelX = 0;
    this.targetVelY = 0;
  }

  update() {
    this.tick++;
    this.target = this.game.tanks.find(t => t.player !== this.tank.player && t.alive);
    if (!this.target || !this.tank.alive) {
      this.releaseAllKeys();
      return;
    }

    // 追踪目标速度(用于预判射击)
    this.trackTargetVelocity();

    // 按决策间隔更新方向决策
    if (this.tick - this.lastDecision >= this.meta.decisionInterval) {
      this.lastDecision = this.tick;
      this.makeDecision();
    }

    // 实时射击和技能/武器判断
    this.handleFire();
    this.handleSkill();
    this.handleGrenade();
    this.handleMissile();

    // 卡住检测
    this.checkStuck();
  }

  // 追踪目标速度
  trackTargetVelocity() {
    const t = this.target;
    this.targetVelX = t.x - this.targetLastX;
    this.targetVelY = t.y - this.targetLastY;
    this.targetLastX = t.x;
    this.targetLastY = t.y;
  }

  makeDecision() {
    const action = this.chooseAction();
    this.applyMovement(action);
  }

  chooseAction() {
    const opts = [];
    const me = this.tank;
    const tgt = this.target;

    // 1. 紧急躲避:如果有子弹/导弹飞向自己
    const dodgeDir = this.checkIncomingThreats();
    if (dodgeDir && Math.random() < this.meta.dodgeChance) {
      return dodgeDir;
    }

    // 2. 低血量撤退(高难度更积极)
    const hpRatio = me.hp / me.maxHp;
    if (hpRatio < this.meta.retreatHp) {
      const retDir = this.retreatDirection(tgt);
      if (retDir && this.canMove(retDir)) return retDir;
    }

    // 3. 道具拾取
    const puDir = this.findNearestPowerUp();
    if (puDir && (hpRatio < 0.5 || Math.random() < 0.3)) {
      opts.push({ dir: puDir, weight: 4 });
    }

    // 4. 战术移动
    const dx = tgt.x - me.x;
    const dy = tgt.y - me.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    // 如果在同一行/列且视线清晰 -> 停下瞄准射击
    if (this.hasLineOfSight(me, tgt)) {
      if (adx < CELL * 0.6 && (me.dir === DIR.LEFT || me.dir === DIR.RIGHT)) {
        return null;
      }
      if (ady < CELL * 0.6 && (me.dir === DIR.UP || me.dir === DIR.DOWN)) {
        return null;
      }
    }

    // 5. 向目标靠近
    const dist = Math.sqrt(dx * dx + dy * dy);
    const idealDist = this.idealDistance();

    if (adx > ady) {
      if (dx > 0) opts.push({ dir: 'right', weight: 5 });
      else opts.push({ dir: 'left', weight: 5 });
      if (dy > 0) opts.push({ dir: 'down', weight: 3 });
      else opts.push({ dir: 'up', weight: 3 });
    } else {
      if (dy > 0) opts.push({ dir: 'down', weight: 5 });
      else opts.push({ dir: 'up', weight: 5 });
      if (dx > 0) opts.push({ dir: 'right', weight: 3 });
      else opts.push({ dir: 'left', weight: 3 });
    }

    // 6. 保持距离:如果太近则后退
    if (dist < idealDist * 0.5) {
      if (adx > ady) {
        if (dx > 0) opts.push({ dir: 'left', weight: 5 });
        else opts.push({ dir: 'right', weight: 5 });
      } else {
        if (dy > 0) opts.push({ dir: 'up', weight: 5 });
        else opts.push({ dir: 'down', weight: 5 });
      }
    }

    // 7. 高难度: 尝试绕侧(如果视线被挡)
    if (this.meta.leadFactor >= 0.7 && !this.hasLineOfSight(me, tgt)) {
      const flankDir = this.findFlankDirection(tgt);
      if (flankDir) opts.push({ dir: flankDir, weight: 6 });
    }

    // 8. 随机游走
    if (Math.random() < this.meta.wanderChance) {
      const dirs = ['up', 'down', 'left', 'right'];
      opts.push({ dir: dirs[Math.floor(Math.random() * 4)], weight: 2 });
    }

    // 筛选可行方向
    const valid = opts.filter(o => this.canMove(o.dir));
    if (valid.length === 0) {
      const all = ['up', 'down', 'left', 'right'].filter(d => this.canMove(d));
      if (all.length > 0) return all[Math.floor(Math.random() * all.length)];
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

  idealDistance() {
    switch (this.difficulty) {
      case 'noob': return 10 * CELL;
      case 'easy': return 8 * CELL;
      case 'medium': return 6 * CELL;
      case 'hard': return 5 * CELL;
      case 'nightmare': return 4 * CELL;
      case 'hell': return 3.5 * CELL;
      default: return 6 * CELL;
    }
  }

  // 检测来袭子弹和导弹,返回躲避方向
  checkIncomingThreats() {
    const me = this.tank;
    // 检查子弹
    for (const b of this.game.bullets) {
      if (b.dead || b.owner === me.player) continue;
      const dodgeDir = this.checkThreat(b.x, b.y, DIR_VEC[b.dir], me);
      if (dodgeDir) return dodgeDir;
    }
    // 检查导弹(高难度才会关注导弹)
    if (this.meta.dodgeChance > 0.3) {
      for (const m of this.game.missiles) {
        if (m.dead || m.owner === me.player) continue;
        const mvx = Math.cos(m.angle);
        const mvy = Math.sin(m.angle);
        const dodgeDir = this.checkThreat(m.x, m.y, { x: mvx, y: mvy }, me);
        if (dodgeDir) return dodgeDir;
      }
    }
    return null;
  }

  checkThreat(bx, by, bv, me) {
    const dx = bx - me.x;
    const dy = by - me.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > CELL * 5) return null;
    // 威胁朝向自己?
    const towardMe = (bv.x * (me.x - bx) + bv.y * (me.y - by)) > 0;
    if (!towardMe) return null;
    if (bv.x !== 0) {
      if (Math.abs(dy) < me.half + 6) {
        // 水平威胁,垂直躲避(选更安全的一侧)
        return this.saferVerticalDir(me);
      }
    } else if (bv.y !== 0) {
      if (Math.abs(dx) < me.half + 6) {
        return this.saferHorizontalDir(me);
      }
    } else {
      // 导弹有任意角度,选垂直于来袭方向的躲避
      const perpX = -bv.y, perpY = bv.x;
      if (Math.abs(perpX) > Math.abs(perpY)) {
        return perpX > 0 ? 'right' : 'left';
      } else {
        return perpY > 0 ? 'down' : 'up';
      }
    }
    return null;
  }

  // 选择更安全的垂直方向(远离墙壁)
  saferVerticalDir(me) {
    const upOk = me.y > CELL * 2 && this.canMove('up');
    const downOk = me.y < (GRID_H - 2) * CELL && this.canMove('down');
    if (upOk && downOk) return Math.random() < 0.5 ? 'up' : 'down';
    if (upOk) return 'up';
    if (downOk) return 'down';
    return Math.random() < 0.5 ? 'up' : 'down';
  }

  saferHorizontalDir(me) {
    const leftOk = me.x > CELL * 2 && this.canMove('left');
    const rightOk = me.x < (GRID_W - 2) * CELL && this.canMove('right');
    if (leftOk && rightOk) return Math.random() < 0.5 ? 'left' : 'right';
    if (leftOk) return 'left';
    if (rightOk) return 'right';
    return Math.random() < 0.5 ? 'left' : 'right';
  }

  // 撤退方向:远离目标
  retreatDirection(tgt) {
    const dx = tgt.x - this.tank.x;
    const dy = tgt.y - this.tank.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'left' : 'right';
    }
    return dy > 0 ? 'up' : 'down';
  }

  // 寻找绕侧方向(高难度,当视线被阻挡时)
  findFlankDirection(tgt) {
    const me = this.tank;
    const dx = tgt.x - me.x;
    const dy = tgt.y - me.y;
    // 尝试垂直于目标方向移动
    if (Math.abs(dx) > Math.abs(dy)) {
      // 水平距离远,尝试垂直绕侧
      return Math.random() < 0.5 ? 'up' : 'down';
    } else {
      return Math.random() < 0.5 ? 'left' : 'right';
    }
  }

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

  hasLineOfSight(a, b) {
    const x0 = Math.floor(a.x / CELL);
    const y0 = Math.floor(a.y / CELL);
    const x1 = Math.floor(b.x / CELL);
    const y1 = Math.floor(b.y / CELL);
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    if (dx !== 0 && dy !== 0) return false;

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

  applyMovement(dirStr) {
    const k = this.game.keys;
    const c = this.tank.controls;
    k[c.up] = false; k[c.down] = false; k[c.left] = false; k[c.right] = false;
    if (dirStr === null) return;
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

  // 射击判断(含预判)
  handleFire() {
    const me = this.tank;
    const tgt = this.target;
    const k = this.game.keys;
    const c = this.tank.controls;

    let shouldFire = false;

    if (this.hasLineOfSight(me, tgt)) {
      // 预判目标位置(高难度会提前瞄准)
      let aimX = tgt.x, aimY = tgt.y;
      if (this.meta.leadFactor > 0) {
        // 预测目标在子弹飞行时间后的位置
        const dist = Math.sqrt((tgt.x - me.x) ** 2 + (tgt.y - me.y) ** 2);
        const bulletTime = dist / 5.2; // 子弹速度 5.2
        aimX = tgt.x + this.targetVelX * bulletTime * this.meta.leadFactor;
        aimY = tgt.y + this.targetVelY * bulletTime * this.meta.leadFactor;
      }
      const dx = aimX - me.x;
      const dy = aimY - me.y;
      const tol = Math.max(0.5, this.meta.aimTolerance) * CELL * 0.3;

      if ((me.dir === DIR.LEFT || me.dir === DIR.RIGHT) && Math.abs(dy) < tol) shouldFire = true;
      if ((me.dir === DIR.UP || me.dir === DIR.DOWN) && Math.abs(dx) < tol) shouldFire = true;

      // 预判:高难度会转向目标方向再开火
      if (!shouldFire && this.meta.leadFactor > 0) {
        if (Math.abs(dy) < tol) {
          if (dx > 0) { k[c.right] = true; k[c.left] = false; }
          if (dx < 0) { k[c.left] = true; k[c.right] = false; }
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

    if (me.skin === 'shield' && hpRatio < 0.5) {
      useSkill = true;
    } else if (me.skin === 'heavy') {
      if (this.isUnderFire() || this.targetDist() < CELL * 3) useSkill = true;
    } else if (me.skin === 'scout') {
      if (this.targetDist() < CELL * 2.5 || hpRatio < 0.3) useSkill = true;
    } else if (me.skin === 'classic') {
      if (this.hasLineOfSight(me, this.target) && this.targetDist() < CELL * 10) useSkill = true;
    } else if (me.skin === 'gunner') {
      // 机枪:有视线时弹幕扫射
      if (this.hasLineOfSight(me, this.target) && this.targetDist() < CELL * 8) useSkill = true;
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

  // 手榴弹判断
  handleGrenade() {
    const me = this.tank;
    const k = this.game.keys;
    const c = this.tank.controls;

    if (me.grenades <= 0) {
      k[c.grenade] = false;
      this.grenadePressed = false;
      return;
    }

    // 冷却避免连续投掷
    if (this.tick - this.lastGrenadeAttempt < 60) {
      k[c.grenade] = false;
      this.grenadePressed = false;
      return;
    }

    let throwGrenade = false;

    // 如果目标在同一行/列且距离适中 -> 投掷手榴弹破坏掩体或直接伤害
    const tgt = this.target;
    const dx = Math.abs(tgt.x - me.x);
    const dy = Math.abs(tgt.y - me.y);
    const dist = this.targetDist();

    // 目标在砖墙后面:投掷手榴弹破坏掩体
    if (!this.hasLineOfSight(me, tgt) && dist < CELL * 6) {
      throwGrenade = true;
    }
    // 近距离投掷
    if (dist < CELL * 3 && Math.random() < 0.3) {
      throwGrenade = true;
    }

    if (throwGrenade && Math.random() < this.meta.grenadeChance) {
      this.lastGrenadeAttempt = this.tick;
      if (!this.grenadePressed) {
        k[c.grenade] = true;
        this.grenadePressed = true;
      }
    } else {
      k[c.grenade] = false;
      this.grenadePressed = false;
    }
  }

  // 追踪导弹判断
  handleMissile() {
    const me = this.tank;
    const k = this.game.keys;
    const c = this.tank.controls;

    if (me.missiles <= 0) {
      k[c.missile] = false;
      this.missilePressed = false;
      return;
    }

    if (this.tick - this.lastMissileAttempt < 90) {
      k[c.missile] = false;
      this.missilePressed = false;
      return;
    }

    let launchMissile = false;
    const dist = this.targetDist();

    // 目标在远处或被掩体遮挡时发射导弹(导弹能追踪)
    if (dist > CELL * 4 && dist < CELL * 15) {
      launchMissile = true;
    }
    // 视线被挡时用导弹绕过掩体
    if (!this.hasLineOfSight(me, this.target) && dist < CELL * 12) {
      launchMissile = true;
    }

    if (launchMissile && Math.random() < this.meta.missileChance) {
      this.lastMissileAttempt = this.tick;
      if (!this.missilePressed) {
        k[c.missile] = true;
        this.missilePressed = true;
      }
    } else {
      k[c.missile] = false;
      this.missilePressed = false;
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

  checkStuck() {
    const moved = Math.abs(this.tank.x - this.lastX) + Math.abs(this.tank.y - this.lastY);
    this.lastX = this.tank.x;
    this.lastY = this.tank.y;

    if (this.currentDir !== null && moved < 0.5) {
      this.stuckTimer++;
      if (this.stuckTimer > 15) {
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
    k[c.grenade] = false; k[c.missile] = false;
  }
}
