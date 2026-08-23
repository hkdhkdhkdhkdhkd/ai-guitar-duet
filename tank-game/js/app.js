// 主应用:界面切换、地图选择、坦克自定义、游戏生命周期
const App = {
  game: null,
  editor: null,
  selectedMap: null,
  testFromEditor: false,
  // 多坦克队伍配置(每方最多 5 辆)
  // team1: 玩家1方(全红),team2: 玩家2方(全蓝)
  // 每项: { skin, color, talents, isHuman }
  aiMode: false,
  aiDifficulty: 'medium',
  aiSelectedMap: null,
  teamSize1: 1,
  teamSize2: 1,
  team1: [],
  team2: [],
  // 玩家人数: 1 = 只有玩家1;2 = 玩家1+玩家2(双人模式)
  playerCount: 2,

  // 阵营颜色(同方统一)
  teamColor(player) { return player === 1 ? '#ef4444' : '#3b82f6'; },

  // 默认天赋
  defaultTalents() { return { defense: 0, speed: 0, attack: 0 }; },
  // 默认配置生成
  defaultCfg(player, idx, isHuman) {
    const skins = ['classic', 'heavy', 'scout', 'shield', 'gunner', 'flamethrower', 'tiger', 't34', 'sherman', 'churchill', 'panther', 'f16', 'su27', 'a10', 'b52', 'apache'];
    return {
      skin: skins[idx % skins.length],
      color: this.teamColor(player),
      talents: this.defaultTalents(),
      isHuman: !!isHuman
    };
  },
  // 同步 team 列表到指定长度
  resizeTeam(player, n) {
    const list = player === 1 ? this.team1 : this.team2;
    while (list.length < n) {
      const idx = list.length;
      const isHuman = this.isSlotHuman(player, idx);
      list.push(this.defaultCfg(player, idx, isHuman));
    }
    while (list.length > n) list.pop();
    // 校正人控标记和颜色(同方统一颜色)
    list.forEach((cfg, i) => {
      cfg.isHuman = this.isSlotHuman(player, i);
      cfg.color = this.teamColor(player);
    });
  },
  // 判断某方某槽位是否由玩家控制
  // 玩家1: 0 号槽 = 玩家1(双人/单人模式都成立)
  // 玩家2: 0 号槽 = 玩家2(仅双人模式);人机模式或单人模式 = AI
  isSlotHuman(player, idx) {
    if (idx !== 0) return false;          // 只有 0 号槽可能人控
    if (player === 1) return true;        // 玩家1 始终人控
    // player === 2
    if (this.aiMode) return false;        // 人机模式: 敌方全 AI
    return this.playerCount === 2;        // 双人模式 + 非人机: 玩家2 人控
  },

  init() {
    // 初始化队伍(各 1 个坦克)
    this.resizeTeam(1, 1);
    this.resizeTeam(2, 1);
    this.bindNavigation();
    this.renderMapList();
    this.renderCustomize();
    this.bindTeamSizeControls();
    this.bindPlayerCountControls();
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
    // 进入地图选择界面时刷新列表(确保新建地图可见)
    if (screenId === 'screen-mapselect') this.renderMapList();
    if (screenId === 'screen-ai-battle') this.renderAIMapList();
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
        else if (v >= 3 && v <= 6) ctx.fillStyle = '#14b8a6';
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

  // 坦克自定义(多坦克)
  // isAI=true 时渲染人机配置页的容器(ai-team-config-*)
  renderCustomize(isAI) {
    const prefix = isAI ? 'ai-team-config-' : 'team-config-';
    ['1', '2'].forEach(pNum => {
      const player = parseInt(pNum);
      const list = player === 1 ? this.team1 : this.team2;
      const container = document.getElementById(prefix + pNum);
      if (!container) return;
      container.innerHTML = '';
      list.forEach((cfg, idx) => {
        const card = document.createElement('div');
        card.className = 'team-tank-card';
        const isPlayerControlled = cfg.isHuman;
        const role = isPlayerControlled
          ? `<span class="role-tag role-human">玩家 ${player}</span>`
          : `<span class="role-tag role-ai">AI #${idx + 1}</span>`;
        const colorName = player === 1 ? '红方' : '蓝方';
        card.innerHTML = `
          <div class="ttk-head">
            <canvas class="tank-preview"></canvas>
            <div class="ttk-meta">
              <div class="ttk-role">${role} <span class="color-badge" style="background:${cfg.color}"></span><span class="color-tag-text">${colorName}</span></div>
              <div class="ttk-skill-info"></div>
            </div>
          </div>
          <div class="ttk-skin-row"></div>
          <div class="ttk-talent-box"></div>
        `;
        container.appendChild(card);
        const skinRow = card.querySelector('.ttk-skin-row');
        const talentBox = card.querySelector('.ttk-talent-box');
        const skillInfo = card.querySelector('.ttk-skill-info');
        const preview = card.querySelector('.tank-preview');

        skinRow.innerHTML = '';
        TANK_SKINS.forEach(skin => {
          const b = document.createElement('button');
          b.className = 'skin-btn' + (cfg.skin === skin.id ? ' selected' : '');
          b.textContent = skin.name;
          b.addEventListener('click', () => {
            cfg.skin = skin.id;
            this.renderTankCard(player, idx, isAI);
          });
          skinRow.appendChild(b);
        });

        this.renderTalents(talentBox, cfg);
        this.renderSkillInfo(skillInfo, cfg.skin, pNum, isPlayerControlled);
        this.drawTankPreview(preview, cfg.skin, cfg.color, player, idx);
      });
    });
  },

  // 重绘单个坦克卡片(用于切换皮肤时局部刷新)
  renderTankCard(player, idx, isAI) {
    const list = player === 1 ? this.team1 : this.team2;
    const cfg = list[idx];
    const prefix = isAI ? 'ai-team-config-' : 'team-config-';
    const container = document.getElementById(prefix + player);
    if (!container) return;
    const card = container.children[idx];
    if (!card) return;
    const skinRow = card.querySelector('.ttk-skin-row');
    const preview = card.querySelector('.tank-preview');
    skinRow.innerHTML = '';
    TANK_SKINS.forEach(skin => {
      const b = document.createElement('button');
      b.className = 'skin-btn' + (cfg.skin === skin.id ? ' selected' : '');
      b.textContent = skin.name;
      b.addEventListener('click', () => {
        cfg.skin = skin.id;
        this.renderTankCard(player, idx, isAI);
      });
      skinRow.appendChild(b);
    });
    this.drawTankPreview(preview, cfg.skin, cfg.color, player, idx);
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
  renderSkillInfo(el, skinId, pNum, isHuman) {
    const sk = SKILL_DEF[skinId];
    const key = pNum === '1' ? 'B' : 'L';
    const tag = isHuman ? `<span style="color:var(--primary);font-weight:700">[${key}]</span>` : '<span style="color:var(--accent);font-weight:700">[AI]</span>';
    el.innerHTML = `<span class="si-title">技能 · ${sk.name}</span> ${tag}<span class="si-desc">${sk.desc} · 冷却 ${sk.cd}s</span>`;
  },

  drawTankPreview(canvas, skin, color, player, idx) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(2.6, 2.6);
    // 旋转到右朝向更直观(默认朝上)
    drawTankBody(ctx, skin, color, player, false, idx || 0);
    ctx.restore();
  },

  // 开始游戏
  startGame() {
    if (!this.selectedMap) return;
    this.go('screen-game');
    document.getElementById('game-overlay').classList.add('hidden');
    document.getElementById('pause-overlay').classList.add('hidden');
    document.getElementById('game-map-name').textContent = this.selectedMap.name;
    this.aiMode = false;
    // 重建 HUD(多坦克)
    this.buildGameHud();

    const canvas = document.getElementById('game-canvas');
    if (!this.game) {
      this.game = new Game(canvas);
      this.game.onGameOver = (winner) => this.showGameOver(winner);
      this.game.onHpChange = (hpList) => this.updateHpHud(hpList);
      this.game.onState = (stateList) => this.updateStateHud(stateList);
      this.game.onPlayerDied = (tank) => this.showTakeoverPrompt(tank);
    } else {
      this.game.canvas = canvas;
      this.game.ctx = canvas.getContext('2d');
    }
    this.game.loadMap(this.selectedMap);
    const bounce = document.getElementById('opt-bounce').checked;
    const powerups = document.getElementById('opt-powerups').checked;
    this.game.setupTanks({ 1: this.team1, 2: this.team2 }, { bounce, powerups });
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
        // 进入人机模式:team1[0]=玩家1人控,其余 AI;team2 全部 AI
        this.resizeTeam(1, this.teamSize1);
        this.resizeTeam(2, this.teamSize2);
        this.renderAIBattleConfig();
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

    // 人机页:人数选择
    this.bindTeamSizeControls(true);

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

  // 渲染人机配置(复用 renderCustomize,但容器 ID 在人机页面)
  renderAIBattleConfig() {
    // 渲染到人机配置页的容器(ai-team-config-*)
    this.renderCustomize(true);
  },

  startAIGame() {
    if (!this.aiSelectedMap) return;
    this.go('screen-game');
    document.getElementById('game-overlay').classList.add('hidden');
    document.getElementById('pause-overlay').classList.add('hidden');
    document.getElementById('game-map-name').textContent = this.aiSelectedMap.name;
    this.aiMode = true;
    // 重建 HUD(多坦克)
    this.buildGameHud();

    const canvas = document.getElementById('game-canvas');
    if (!this.game) {
      this.game = new Game(canvas);
      this.game.onGameOver = (winner) => this.showGameOver(winner);
      this.game.onHpChange = (hpList) => this.updateHpHud(hpList);
      this.game.onState = (stateList) => this.updateStateHud(stateList);
      this.game.onPlayerDied = (tank) => this.showTakeoverPrompt(tank);
    } else {
      this.game.canvas = canvas;
      this.game.ctx = canvas.getContext('2d');
    }
    this.game.loadMap(this.aiSelectedMap);
    const bounce = document.getElementById('ai-opt-bounce').checked;
    const powerups = document.getElementById('ai-opt-powerups').checked;
    this.game.setupTanks({ 1: this.team1, 2: this.team2 }, { bounce, powerups, aiDifficulty: this.aiDifficulty });
    this.game.stop();
    this.game.start();
  },

  // 队伍人数增减按钮绑定
  // isAIPage=true 表示当前绑定的是人机页的按钮
  bindTeamSizeControls(isAIPage) {
    const prefix = isAIPage ? 'ai-' : '';
    ['1', '2'].forEach(pNum => {
      const decBtn = document.getElementById(`${prefix}team-dec-${pNum}`);
      const incBtn = document.getElementById(`${prefix}team-inc-${pNum}`);
      const sizeEl = document.getElementById(`${prefix}team-size-${pNum}`);
      if (!decBtn || !incBtn || !sizeEl) return;
      // 已绑定过则跳过(用 dataset 标记)
      if (decBtn.dataset.bound) return;
      decBtn.dataset.bound = '1';
      incBtn.dataset.bound = '1';
      const apply = () => {
        sizeEl.textContent = (pNum === '1' ? this.teamSize1 : this.teamSize2);
        this.resizeTeam(parseInt(pNum), pNum === '1' ? this.teamSize1 : this.teamSize2);
        this.renderCustomize(isAIPage);
      };
      decBtn.addEventListener('click', () => {
        const cur = pNum === '1' ? this.teamSize1 : this.teamSize2;
        if (cur > 1) {
          if (pNum === '1') this.teamSize1 = cur - 1;
          else this.teamSize2 = cur - 1;
          apply();
        }
      });
      incBtn.addEventListener('click', () => {
        const cur = pNum === '1' ? this.teamSize1 : this.teamSize2;
        if (cur < 5) {
          if (pNum === '1') this.teamSize1 = cur + 1;
          else this.teamSize2 = cur + 1;
          apply();
        }
      });
    });
  },

  // 玩家人数切换(1人/2人)
  bindPlayerCountControls() {
    const row = document.getElementById('player-count-row');
    if (!row || row.dataset.bound) return;
    row.dataset.bound = '1';
    row.querySelectorAll('.pc-btn').forEach(b => {
      b.addEventListener('click', () => {
        this.playerCount = parseInt(b.dataset.pc);
        row.querySelectorAll('.pc-btn').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        // 重新分配角色:team2[0] 的 isHuman 会根据 playerCount 变化
        this.resizeTeam(1, this.teamSize1);
        this.resizeTeam(2, this.teamSize2);
        // 更新 team2 提示文字
        const hint = document.getElementById('team2-hint');
        if (hint) hint.textContent = this.playerCount === 1
          ? '第 1 辆由 AI 接管(单人模式)'
          : '第 1 辆由玩家2控制,其余由 AI 协助';
        this.renderCustomize();
      });
    });
  },

  // 游戏中 HUD:为每个坦克生成血条+技能槽
  buildGameHud() {
    const side1 = document.getElementById('hud-side-1');
    const side2 = document.getElementById('hud-side-2');
    if (!side1 || !side2) return;
    side1.innerHTML = '';
    side2.innerHTML = '';
    const build = (container, list, player) => {
      list.forEach((cfg, idx) => {
        const isHuman = cfg.isHuman;
        const wrap = document.createElement('div');
        wrap.className = 'hud-tank';
        wrap.dataset.player = player;
        wrap.dataset.idx = idx;
        const role = isHuman
          ? `玩家 ${player}`
          : `AI #${idx + 1}`;
        wrap.innerHTML = `
          <div class="hud-tank-head">
            <span class="hud-role" style="color:${cfg.color}">${role}</span>
          </div>
          <div class="hud-hp" id="hp-p${player}-${idx}"></div>
          <div class="hud-skill ${isHuman ? '' : 'is-ai'}" id="skill-hud-p${player}-${idx}"></div>
          <div class="hud-buff" id="buff-row-p${player}-${idx}"></div>
        `;
        container.appendChild(wrap);
      });
    };
    build(side1, this.team1, 1);
    build(side2, this.team2, 2);
  },

  updateHpHud(hpList) {
    hpList.forEach(h => {
      const el = document.getElementById(`hp-p${h.player}-${h.indexInTeam}`);
      if (!el) return;
      el.innerHTML = '';
      const max = h.maxHp || 7;
      for (let i = 0; i < max; i++) {
        const heart = document.createElement('span');
        heart.className = 'heart' + (i >= h.hp ? ' lost' : '');
        el.appendChild(heart);
      }
    });
  },

  // 技能 HUD + buff + 武器 (按坦克索引)
  updateStateHud(stateList) {
    stateList.forEach(s => {
      const hud = document.getElementById(`skill-hud-p${s.player}-${s.indexInTeam}`);
      const buffRow = document.getElementById(`buff-row-p${s.player}-${s.indexInTeam}`);
      if (!hud || !buffRow) return;
      const isHuman = s.isHuman;
      const key = s.player === 1 ? 'B' : 'L';
      const ready = s.skillReady;
      hud.classList.toggle('ready', ready);
      const cdText = ready ? '就绪' : `${s.skillCd}s`;
      const sk = SKILL_DEF[s.skin] || SKILL_DEF.classic;
      const pct = ready ? 100 : Math.max(0, 100 - (s.skillCd / (sk.cd || 16)) * 100);
      const grenadeKey = s.player === 1 ? 'G' : ',';
      const missileKey = s.player === 1 ? 'H' : '.';
      const keyTag = isHuman
        ? `<span class="sk-key">${key}</span>`
        : `<span class="sk-key sk-ai">AI</span>`;
      hud.innerHTML =
        keyTag +
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
        flameBoost: ['烈焰', '#f97316'],
        damageReduction: ['减伤', '#fbbf24'],
        reflect: ['反弹', '#06b6d4'],
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
      gChip.innerHTML = `<span class="dot" style="background:#f97316"></span>${isHuman ? grenadeKey : 'AI'} 手榴弹 x${s.grenades}`;
      buffRow.appendChild(gChip);
      const mChip = document.createElement('span');
      mChip.className = 'buff-chip weapon-chip';
      mChip.innerHTML = `<span class="dot" style="background:#ef4444"></span>${isHuman ? missileKey : 'AI'} 导弹 x${s.missiles}`;
      buffRow.appendChild(mChip);
    });
  },

  // 玩家坦克死亡:弹出接管选择
  showTakeoverPrompt(deadTank) {
    const overlay = document.getElementById('takeover-overlay');
    const list = document.getElementById('takeover-list');
    const title = document.getElementById('takeover-title');
    if (!overlay || !list) return;
    // 找同方存活的 AI 坦克
    const candidates = this.game.tanks.filter(t =>
      t.player === deadTank.player && t.alive && !t.isHuman
    );
    const sideName = deadTank.player === 1 ? '红方' : '蓝方';
    title.textContent = `你的 ${sideName}坦克被击毁!`;
    list.innerHTML = '';
    if (candidates.length === 0) {
      // 没有可接管的坦克,直接判败(让游戏自然进入胜负判定)
      this.game.pendingTakeover = null;
      // 让 update 继续运行,触发胜负判定
      return;
    }
    candidates.forEach((t, i) => {
      const card = document.createElement('button');
      card.className = 'takeover-card';
      const skinName = (TANK_SKINS.find(s => s.id === t.skin) || {}).name || t.skin;
      card.innerHTML = `
        <div class="tc-row">
          <span class="tc-color" style="background:${t.color}"></span>
          <span class="tc-skin">${skinName}</span>
          <span class="tc-hp">${Math.ceil(t.hp)}/${t.maxHp}</span>
        </div>
        <div class="tc-talents">
          防${t.talents.defense} · 速${t.talents.speed} · 攻${t.talents.attack}
        </div>
      `;
      card.addEventListener('click', () => {
        this.game.takeover(t);
        overlay.classList.add('hidden');
      });
      list.appendChild(card);
    });
    overlay.classList.remove('hidden');
  },

  showGameOver(winner) {
    const overlay = document.getElementById('game-overlay');
    const title = document.getElementById('overlay-title');
    const text = document.getElementById('overlay-text');
    // 仅人机模式或单人模式: 玩家1方获胜=你赢
    const player1IsHumanSolo = this.aiMode || this.playerCount === 1;
    if (winner) {
      if (player1IsHumanSolo) {
        if (winner.player === 1) {
          title.textContent = this.aiMode ? '你赢了人机!' : '玩家1获胜!';
          title.style.color = '#ef4444';
          const survivors = this.game.tanks.filter(t => t.player === 1 && t.alive).length;
          const diffTxt = this.aiMode ? `${AI_DIFFICULTY[this.aiDifficulty].name} 难度 · ` : '';
          text.textContent = `${diffTxt}红方存活 ${survivors} 辆 · 剩余生命: ${winner.hp}/${winner.maxHp}`;
        } else {
          title.textContent = this.aiMode ? '人机获胜!' : '蓝方获胜!';
          title.style.color = '#3b82f6';
          const survivors = this.game.tanks.filter(t => t.player === 2 && t.alive).length;
          const diffTxt = this.aiMode ? `${AI_DIFFICULTY[this.aiDifficulty].name} 难度 · ` : '';
          text.textContent = `${diffTxt}蓝方存活 ${survivors} 辆 · 剩余生命: ${winner.hp}/${winner.maxHp}`;
        }
      } else {
        title.textContent = winner.player === 1 ? '红方获胜!' : '蓝方获胜!';
        title.style.color = winner.player === 1 ? '#ef4444' : '#3b82f6';
        const survivors = this.game.tanks.filter(t => t.player === winner.player && t.alive).length;
        text.textContent = `${winner.player === 1 ? '红' : '蓝'}方存活 ${survivors} 辆 · 剩余生命: ${winner.hp}/${winner.maxHp}`;
      }
    } else {
      title.textContent = '平局!';
      title.style.color = '#6366f1';
      text.textContent = '双方同归于尽';
    }
    overlay.classList.remove('hidden');
  },

  // 键盘事件(全局,但只在游戏中处理移动键)
  initGameKeys() {
    // P2 按键在 P2 由 AI 控制时需要拦截(人机模式 或 单人模式)
    const p2Codes = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'KeyL', 'Comma', 'Period'];
    const p1Codes = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'KeyB', 'KeyG', 'KeyH'];
    const isInput = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    // P2 是否由 AI 控制(此时拦截 P2 按键)
    const p2IsAI = () => this.aiMode || this.playerCount === 1;
    window.addEventListener('keydown', (e) => {
      if (this.game && this.game.running && !isInput(e.target)) {
        if (p2IsAI() && p2Codes.includes(e.code)) return;
        if (p1Codes.includes(e.code) || p2Codes.includes(e.code)) e.preventDefault();
        this.game.setKey(e.code, true);
      }
    });
    window.addEventListener('keyup', (e) => {
      if (this.game && this.game.running) {
        if (p2IsAI() && p2Codes.includes(e.code)) return;
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
    // 暂停按钮
    document.getElementById('btn-pause').addEventListener('click', () => this.togglePause(true));
    document.getElementById('btn-resume').addEventListener('click', () => this.togglePause(false));
    document.getElementById('btn-pause-menu').addEventListener('click', () => {
      if (this.game) this.game.stop();
      this.togglePause(false);
      this.go('screen-menu');
    });
    // ESC 全局暂停(仅游戏中)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const cur = document.getElementById('screen-game');
        if (cur && !cur.classList.contains('hidden')) {
          // 游戏界面按 ESC 切换暂停
          this.togglePause();
        }
      }
    });
  },

  // 暂停切换(isPaused 可选:不传=切换)
  togglePause(isPaused) {
    const overlay = document.getElementById('pause-overlay');
    if (!overlay || !this.game) return;
    if (isPaused === undefined) isPaused = overlay.classList.contains('hidden');
    if (isPaused) {
      this.game.stop();
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
      // 恢复前重置 lastTime 避免 delta 跳变
      this.game.lastTime = performance.now();
      this.game.start();
    }
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
        const tool = btn.dataset.tool;
        this.editor.setTool(tool);
        // 单向方块:显示方向选择器
        const dirGroup = document.getElementById('oneway-dir-group');
        dirGroup.style.display = tool === 'oneway' ? '' : 'none';
      });
    });

    // 单向方块方向选择
    document.querySelectorAll('.dir-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.editor.setOneWayDir(parseInt(btn.dataset.dir));
      });
    });
    // 默认选中"右"方向
    document.querySelector('.dir-btn[data-dir="1"]').classList.add('active');

    document.getElementById('btn-editor-clear').addEventListener('click', () => {
      if (confirm('清空当前地图?')) this.editor.clearAll();
    });
    document.getElementById('btn-editor-save').addEventListener('click', () => {
      const nameInput = document.getElementById('editor-name');
      const name = nameInput.value.trim() || '我的地图';
      const map = this.editor.exportMap(name);
      addCustomMap(map);
      nameInput.value = '';
      alert('地图已保存!可在"开始对战"或"人机对战"中选择。');
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
