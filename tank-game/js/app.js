// 主应用:界面切换、地图选择、坦克自定义、游戏生命周期
const App = {
  game: null,
  editor: null,
  selectedMap: null,
  p1Config: { skin: 'classic', color: '#ef4444', talents: { defense: 0, speed: 0, attack: 0 } },
  p2Config: { skin: 'classic', color: '#3b82f6', talents: { defense: 0, speed: 0, attack: 0 } },
  testFromEditor: false,
  // 人机对战配置
  aiMode: false,
  aiDifficulty: 'medium',
  aiConfig: { skin: 'heavy', color: '#8b5cf6', talents: { defense: 2, speed: 1, attack: 2 } },
  aiP1Config: { skin: 'classic', color: '#ef4444', talents: { defense: 0, speed: 0, attack: 0 } },
  aiSelectedMap: null,

  init() {
    this.bindNavigation();
    this.renderMapList();
    this.renderCustomize();
    this.initGameKeys();
    this.initEditor();
    this.initGameLifecycle();
    this.initAIBattle();
    // 音效系统:首次点击任意按钮时初始化
    document.body.addEventListener('click', () => SFX.init(), { once: true });
    document.body.addEventListener('keydown', () => SFX.init(), { once: true });
  },

  // 通用界面跳转
  bindNavigation() {
    document.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.goto;
        this.go(target);
      });
    });
  },

  go(screenId) {
    // 退出游戏时停止
    if (screenId !== 'screen-game' && this.game) {
      this.game.stop();
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  },

  // 地图列表
  renderMapList() {
    const list = document.getElementById('map-list');
    list.innerHTML = '';
    const maps = getAllMaps();
    maps.forEach((m) => {
      const card = document.createElement('div');
      card.className = 'map-card';
      card.dataset.id = m.id;
      const canvas = document.createElement('canvas');
      canvas.width = GRID_W;
      canvas.height = GRID_H;
      canvas.style.width = '100%';
      card.appendChild(canvas);
      const name = document.createElement('div');
      name.className = 'map-name';
      name.textContent = m.name;
      card.appendChild(name);
      const tag = document.createElement('div');
      tag.className = 'map-tag';
      tag.textContent = m.custom ? '自制 · 再次点击删除' : m.tag || '内置';
      card.appendChild(tag);
      list.appendChild(card);

      // 渲染缩略图
      this.renderThumbnail(canvas, m);

      card.addEventListener('click', () => {
        // 自制地图:再次点击删除
        if (m.custom && this.selectedMap && this.selectedMap.id === m.id) {
          if (confirm(`删除地图「${m.name}」?`)) {
            deleteCustomMap(m.id);
            this.selectedMap = null;
            document.getElementById('btn-to-customize').disabled = true;
            this.renderMapList();
            return;
          }
        }
        this.selectMap(m.id);
      });
    });
  },

  selectMap(id) {
    const maps = getAllMaps();
    const m = maps.find(x => x.id === id);
    if (!m) return;
    this.selectedMap = m;
    document.querySelectorAll('.map-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.id === id);
    });
    document.getElementById('btn-to-customize').disabled = false;
  },

  renderThumbnail(canvas, mapData) {
    const ctx = canvas.getContext('2d');
    const parsed = parseMap(mapData.rows);
    ctx.fillStyle = '#1a1d2e';
    ctx.fillRect(0, 0, GRID_W, GRID_H);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const v = parsed.grid[y][x];
        if (v === 1) ctx.fillStyle = '#d97706';
        else if (v === 2) ctx.fillStyle = '#6b7280';
        else continue;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // 出生点
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(parsed.spawn1.x, parsed.spawn1.y, 1, 1);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(parsed.spawn2.x, parsed.spawn2.y, 1, 1);
  },

  // 坦克自定义
  renderCustomize() {
    ['1', '2'].forEach(pNum => {
      const skinRow = document.getElementById('skin-row-' + pNum);
      const colorRow = document.getElementById('color-row-' + pNum);
      const talentBox = document.getElementById('talent-box-' + pNum);
      const skillInfo = document.getElementById('skill-info-' + pNum);
      const preview = document.querySelector(`.player-config[data-player="${pNum}"] .tank-preview`);
      const cfg = pNum === '1' ? this.p1Config : this.p2Config;

      skinRow.innerHTML = '';
      TANK_SKINS.forEach(skin => {
        const b = document.createElement('button');
        b.className = 'skin-btn' + (cfg.skin === skin.id ? ' selected' : '');
        b.textContent = skin.name;
        b.addEventListener('click', () => {
          cfg.skin = skin.id;
          this.renderCustomize();
        });
        skinRow.appendChild(b);
      });

      colorRow.innerHTML = '';
      TANK_COLORS.forEach(col => {
        const b = document.createElement('button');
        b.className = 'color-btn' + (cfg.color === col.value ? ' selected' : '');
        b.style.background = col.value;
        b.title = col.name;
        b.addEventListener('click', () => {
          cfg.color = col.value;
          this.renderCustomize();
        });
        colorRow.appendChild(b);
      });

      this.renderTalents(talentBox, cfg);
      this.renderSkillInfo(skillInfo, cfg.skin, pNum);
      this.drawTankPreview(preview, cfg.skin, cfg.color, parseInt(pNum));
    });
  },

  // 天赋分配 UI
  renderTalents(box, cfg) {
    const t = cfg.talents;
    const used = t.defense + t.speed + t.attack;
    const remain = TALENT_POINTS - used;
    box.innerHTML = '';
    const points = document.createElement('div');
    points.className = 'talent-points';
    points.textContent = `天赋点:剩余 ${remain} / ${TALENT_POINTS}`;
    box.appendChild(points);
    Object.keys(TALENT_META).forEach(key => {
      const meta = TALENT_META[key];
      const row = document.createElement('div');
      row.className = 'talent-row';
      const left = document.createElement('div');
      left.innerHTML = `<span class="t-name">${meta.name}</span> <span class="t-per">${meta.per}</span>`;
      row.appendChild(left);
      const ctrl = document.createElement('div');
      ctrl.className = 't-ctrl';
      const minus = document.createElement('button');
      minus.textContent = '−';
      minus.disabled = t[key] <= 0;
      minus.addEventListener('click', () => { if (t[key] > 0) { t[key]--; this.renderTalents(box, cfg); } });
      const val = document.createElement('span');
      val.className = 't-val';
      val.textContent = t[key];
      const plus = document.createElement('button');
      plus.textContent = '+';
      plus.disabled = remain <= 0;
      plus.addEventListener('click', () => { if (remain > 0) { t[key]++; this.renderTalents(box, cfg); } });
      ctrl.appendChild(minus);
      ctrl.appendChild(val);
      ctrl.appendChild(plus);
      row.appendChild(ctrl);
      box.appendChild(row);
    });
  },

  // 技能说明(自定义页)
  renderSkillInfo(el, skinId, pNum) {
    const sk = SKILL_DEF[skinId];
    const key = pNum === '1' ? 'B' : 'L';
    el.innerHTML = `<span class="si-title">技能 · ${sk.name}</span> <span style="color:var(--primary);font-weight:700">[${key}]</span><span class="si-desc">${sk.desc} · 冷却 ${sk.cd}s</span>`;
  },

  drawTankPreview(canvas, skin, color, player) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(2.6, 2.6);
    // 旋转到右朝向更直观(默认朝上)
    drawTankBody(ctx, skin, color, player, false);
    ctx.restore();
  },

  // 开始游戏
  startGame() {
    if (!this.selectedMap) return;
    this.go('screen-game');
    document.getElementById('game-overlay').classList.add('hidden');
    document.getElementById('game-map-name').textContent = this.selectedMap.name;
    document.getElementById('hp-label-p2').textContent = '玩家 2';
    this.aiMode = false;

    const canvas = document.getElementById('game-canvas');
    if (!this.game) {
      this.game = new Game(canvas);
      this.game.onGameOver = (winner) => this.showGameOver(winner);
      this.game.onHpChange = (hpList) => this.updateHpHud(hpList);
      this.game.onState = (stateList) => this.updateStateHud(stateList);
    } else {
      this.game.canvas = canvas;
      this.game.ctx = canvas.getContext('2d');
    }
    this.game.loadMap(this.selectedMap);
    const bounce = document.getElementById('opt-bounce').checked;
    const powerups = document.getElementById('opt-powerups').checked;
    this.game.setupTanks(this.p1Config, this.p2Config, { bounce, powerups });
    this.game.stop();
    this.game.start();
  },

  // ====== 人机对战 ======
  initAIBattle() {
    // 人机地图列表
    this.renderAIMapList();

    // 地图选择 -> 配置
    document.getElementById('btn-ai-to-config').addEventListener('click', () => {
      if (this.aiSelectedMap) {
        this.aiMode = true;
        this.renderAIConfig();
        this.go('screen-ai-config');
      }
    });

    // 难度按钮
    const diffRow = document.getElementById('ai-difficulty-row');
    diffRow.innerHTML = '';
    Object.keys(AI_DIFFICULTY).forEach(key => {
      const b = document.createElement('button');
      b.className = 'diff-btn' + (this.aiDifficulty === key ? ' selected' : '');
      b.textContent = AI_DIFFICULTY[key].name;
      b.dataset.diff = key;
      b.addEventListener('click', () => {
        this.aiDifficulty = key;
        diffRow.querySelectorAll('.diff-btn').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
      });
      diffRow.appendChild(b);
    });

    // 开战
    document.getElementById('btn-start-ai-game').addEventListener('click', () => {
      this.startAIGame();
    });
  },

  renderAIMapList() {
    const list = document.getElementById('ai-map-list');
    list.innerHTML = '';
    const maps = getAllMaps();
    maps.forEach((m) => {
      const card = document.createElement('div');
      card.className = 'map-card';
      card.dataset.id = m.id;
      const canvas = document.createElement('canvas');
      canvas.width = GRID_W;
      canvas.height = GRID_H;
      canvas.style.width = '100%';
      card.appendChild(canvas);
      const name = document.createElement('div');
      name.className = 'map-name';
      name.textContent = m.name;
      card.appendChild(name);
      const tag = document.createElement('div');
      tag.className = 'map-tag';
      tag.textContent = m.custom ? '自制 · 再次点击删除' : m.tag || '内置';
      card.appendChild(tag);
      list.appendChild(card);
      this.renderThumbnail(canvas, m);
      card.addEventListener('click', () => {
        if (m.custom && this.aiSelectedMap && this.aiSelectedMap.id === m.id) {
          if (confirm(`删除地图「${m.name}」?`)) {
            deleteCustomMap(m.id);
            this.aiSelectedMap = null;
            document.getElementById('btn-ai-to-config').disabled = true;
            this.renderAIMapList();
            return;
          }
        }
        this.selectAIMap(m.id);
      });
    });
  },

  selectAIMap(id) {
    const maps = getAllMaps();
    const m = maps.find(x => x.id === id);
    if (!m) return;
    this.aiSelectedMap = m;
    document.querySelectorAll('#ai-map-list .map-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.id === id);
    });
    document.getElementById('btn-ai-to-config').disabled = false;
  },

  // 渲染人机配置界面(玩家1 + 人机)
  renderAIConfig() {
    // 玩家1
    this.renderAISide('1', this.aiP1Config);
    // 人机
    this.renderAISide('2', this.aiConfig);
  },

  renderAISide(pNum, cfg) {
    const skinRow = document.getElementById('ai-skin-row-' + pNum);
    const colorRow = document.getElementById('ai-color-row-' + pNum);
    const talentBox = document.getElementById('ai-talent-box-' + pNum);
    const skillInfo = document.getElementById('ai-skill-info-' + pNum);
    const preview = document.querySelector(`#screen-ai-config .player-config[data-player="${pNum}"] .tank-preview`);

    skinRow.innerHTML = '';
    TANK_SKINS.forEach(skin => {
      const b = document.createElement('button');
      b.className = 'skin-btn' + (cfg.skin === skin.id ? ' selected' : '');
      b.textContent = skin.name;
      b.addEventListener('click', () => {
        cfg.skin = skin.id;
        this.renderAISide(pNum, cfg);
      });
      skinRow.appendChild(b);
    });

    colorRow.innerHTML = '';
    TANK_COLORS.forEach(col => {
      const b = document.createElement('button');
      b.className = 'color-btn' + (cfg.color === col.value ? ' selected' : '');
      b.style.background = col.value;
      b.title = col.name;
      b.addEventListener('click', () => {
        cfg.color = col.value;
        this.renderAISide(pNum, cfg);
      });
      colorRow.appendChild(b);
    });

    this.renderTalents(talentBox, cfg);
    this.renderAISkillInfo(skillInfo, cfg.skin, pNum);
    this.drawTankPreview(preview, cfg.skin, cfg.color, parseInt(pNum));
  },

  renderAISkillInfo(el, skinId, pNum) {
    const sk = SKILL_DEF[skinId];
    const label = pNum === '1' ? '<b>B</b>' : 'AI';
    el.innerHTML = `<span class="si-title">技能 · ${sk.name}</span> <span style="color:var(--primary);font-weight:700">[${label}]</span><span class="si-desc">${sk.desc} · 冷却 ${sk.cd}s</span>`;
  },

  startAIGame() {
    if (!this.aiSelectedMap) return;
    this.go('screen-game');
    document.getElementById('game-overlay').classList.add('hidden');
    document.getElementById('game-map-name').textContent = this.aiSelectedMap.name;
    document.getElementById('hp-label-p2').textContent = '人机 · ' + AI_DIFFICULTY[this.aiDifficulty].name;
    this.aiMode = true;

    const canvas = document.getElementById('game-canvas');
    if (!this.game) {
      this.game = new Game(canvas);
      this.game.onGameOver = (winner) => this.showGameOver(winner);
      this.game.onHpChange = (hpList) => this.updateHpHud(hpList);
      this.game.onState = (stateList) => this.updateStateHud(stateList);
    } else {
      this.game.canvas = canvas;
      this.game.ctx = canvas.getContext('2d');
    }
    this.game.loadMap(this.aiSelectedMap);
    const bounce = document.getElementById('ai-opt-bounce').checked;
    const powerups = document.getElementById('ai-opt-powerups').checked;
    this.game.setupTanks(this.aiP1Config, this.aiConfig, { bounce, powerups, ai: true, aiDifficulty: this.aiDifficulty });
    this.game.stop();
    this.game.start();
  },

  updateHpHud(hpList) {
    hpList.forEach(h => {
      const el = document.getElementById('hp-p' + h.player);
      el.innerHTML = '';
      const max = h.maxHp || 7;
      for (let i = 0; i < max; i++) {
        const heart = document.createElement('span');
        heart.className = 'heart' + (i >= h.hp ? ' lost' : '');
        el.appendChild(heart);
      }
    });
  },

  // 技能 HUD + buff + 武器
  updateStateHud(stateList) {
    stateList.forEach(s => {
      const hud = document.getElementById('skill-hud-' + s.player);
      const buffRow = document.getElementById('buff-row-' + s.player);
      const key = s.player === 1 ? 'B' : 'L';
      const ready = s.skillReady;
      hud.classList.toggle('ready', ready);
      const cdText = ready ? '就绪' : `${s.skillCd}s`;
      const pct = ready ? 100 : Math.max(0, 100 - (s.skillCd / (SKILL_DEF[this.skinIdOf(s.player)] ? SKILL_DEF[this.skinIdOf(s.player)].cd : 16)) * 100);
      const grenadeKey = s.player === 1 ? 'G' : ',';
      const missileKey = s.player === 1 ? 'H' : '.';
      hud.innerHTML =
        `<span class="sk-key">${key}</span>` +
        `<span class="sk-name">${s.skillName}</span>` +
        `<span class="sk-cd">${cdText}</span>` +
        `<span class="sk-bar"><i style="width:${pct}%"></i></span>`;
      // buffs + 武器
      buffRow.innerHTML = '';
      const buffMeta = {
        rapid: ['连发', '#f59e0b'],
        power: ['2x攻', '#ef4444'],
        speed: ['加速', '#06b6d4'],
        shield: ['护盾', '#a855f7'],
        dash: ['冲刺', '#fbbf24'],
      };
      Object.keys(buffMeta).forEach(k => {
        const v = s.buffs[k];
        if (v > 0) {
          const chip = document.createElement('span');
          chip.className = 'buff-chip';
          chip.innerHTML = `<span class="dot" style="background:${buffMeta[k][1]}"></span>${buffMeta[k][0]} ${v}s`;
          buffRow.appendChild(chip);
        }
      });
      // 武器显示
      const gChip = document.createElement('span');
      gChip.className = 'buff-chip weapon-chip';
      gChip.innerHTML = `<span class="dot" style="background:#f97316"></span>${grenadeKey} 手榴弹 x${s.grenades}`;
      buffRow.appendChild(gChip);
      const mChip = document.createElement('span');
      mChip.className = 'buff-chip weapon-chip';
      mChip.innerHTML = `<span class="dot" style="background:#ef4444"></span>${missileKey} 导弹 x${s.missiles}`;
      buffRow.appendChild(mChip);
    });
  },

  skinIdOf(player) {
    if (this.aiMode) {
      return player === 1 ? this.aiP1Config.skin : this.aiConfig.skin;
    }
    return player === 1 ? this.p1Config.skin : this.p2Config.skin;
  },

  showGameOver(winner) {
    const overlay = document.getElementById('game-overlay');
    const title = document.getElementById('overlay-title');
    const text = document.getElementById('overlay-text');
    if (winner) {
      if (this.aiMode && winner.player === 2) {
        title.textContent = '人机获胜!';
        title.style.color = '#8b5cf6';
        text.textContent = `难度: ${AI_DIFFICULTY[this.aiDifficulty].name} · 剩余生命: ${winner.hp} / ${winner.maxHp}`;
      } else if (this.aiMode && winner.player === 1) {
        title.textContent = '你赢了人机!';
        title.style.color = '#ef4444';
        text.textContent = `击败了 ${AI_DIFFICULTY[this.aiDifficulty].name} 难度 · 剩余生命: ${winner.hp} / ${winner.maxHp}`;
      } else {
        title.textContent = `玩家 ${winner.player} 获胜!`;
        title.style.color = winner.player === 1 ? '#ef4444' : '#3b82f6';
        text.textContent = `剩余生命: ${winner.hp} / ${winner.maxHp}`;
      }
    } else {
      title.textContent = '平局!';
      title.style.color = '#6366f1';
      text.textContent = '两辆坦克同归于尽';
    }
    overlay.classList.remove('hidden');
  },

  // 键盘事件(全局,但只在游戏中处理移动键)
  initGameKeys() {
    // 玩家2的所有按键在人机模式下交给AI控制
    const gameCodes = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Comma', 'Period'];
    const aiControlledCodes = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'KeyL', 'Comma', 'Period'];
    const isInput = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    window.addEventListener('keydown', (e) => {
      if (this.game && this.game.running && !isInput(e.target)) {
        if (this.aiMode && aiControlledCodes.includes(e.code)) return;
        if (gameCodes.includes(e.code) || e.code === 'KeyG' || e.code === 'KeyH' || e.code === 'KeyB') e.preventDefault();
        this.game.setKey(e.code, true);
      }
    });
    window.addEventListener('keyup', (e) => {
      if (this.game && this.game.running) {
        if (this.aiMode && aiControlledCodes.includes(e.code)) return;
        this.game.setKey(e.code, false);
      }
    });
  },

  initGameLifecycle() {
    document.getElementById('btn-to-customize').addEventListener('click', () => {
      if (this.selectedMap) this.go('screen-customize');
    });
    document.getElementById('btn-start-game').addEventListener('click', () => {
      this.testFromEditor = false;
      this.startGame();
    });
    document.getElementById('btn-rematch').addEventListener('click', () => {
      if (this.aiMode) this.startAIGame();
      else this.startGame();
    });
    document.getElementById('btn-back-menu').addEventListener('click', () => {
      if (this.game) this.game.stop();
      this.go('screen-menu');
    });
    document.getElementById('btn-quit-game').addEventListener('click', () => {
      if (this.game) this.game.stop();
      if (this.testFromEditor) {
        this.testFromEditor = false;
        this.go('screen-editor');
      } else if (this.aiMode) {
        this.go('screen-ai-battle');
      } else {
        this.go('screen-mapselect');
      }
    });
  },

  // 编辑器
  initEditor() {
    const canvas = document.getElementById('editor-canvas');
    this.editor = new MapEditor(canvas);

    // 工具切换
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.editor.setTool(btn.dataset.tool);
      });
    });

    document.getElementById('btn-editor-clear').addEventListener('click', () => {
      if (confirm('清空当前地图?')) this.editor.clearAll();
    });
    document.getElementById('btn-editor-save').addEventListener('click', () => {
      const nameInput = document.getElementById('editor-name');
      const name = nameInput.value.trim() || '我的地图';
      const map = this.editor.exportMap(name);
      addCustomMap(map);
      nameInput.value = '';
      alert('地图已保存!可在"开始对战"中选择。');
    });
    document.getElementById('btn-editor-test').addEventListener('click', () => {
      const map = this.editor.exportMap('编辑器测试');
      this.selectedMap = map;
      this.testFromEditor = true;
      this.startGame();
    });
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
