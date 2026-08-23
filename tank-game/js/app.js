// 主应用:界面切换、地图选择、坦克自定义、游戏生命周期
const App = {
  game: null,
  editor: null,
  selectedMap: null,
  testFromEditor: false,
  // 多坦克队伍配置(每方最多 20 辆)
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

  // ===== 布阵系统 =====
  deployment: null,          // 布阵数据 null 或 {1:{...}, 2:{...}}
  deployTeam: 1,             // 当前编辑哪一方 1 或 2
  selectedDeployUnit: null,  // 当前选中要放置的单位类型: 'tank' 索引或 'mortar'/'italianGun'/'mine'
  selectedDeployTankIdx: -1, // 选中的坦克索引
  deployMapData: null,       // 当前布阵使用的地图数据
  deployGrid: null,          // 解析后的 grid
  deployGridW: 0,
  deployGridH: 0,
  deployCell: 30,
  deployCtx: null,
  // 武器最大数量
  MAX_MORTARS: 5,
  MAX_ITALIAN_GUNS: 3,
  MAX_MINES: 15,

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
    this.initDeploymentButtons();
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
      const mw = m.width || GRID_W;
      const mh = m.height || GRID_H;
      canvas.width = mw;
      canvas.height = mh;
      canvas.style.width = '100%';
      canvas.style.aspectRatio = mw + ' / ' + mh;
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
    const parsed = parseMap(mapData);
    const w = parsed.grid[0].length;
    const h = parsed.grid.length;
    ctx.fillStyle = '#1a1d2e';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
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
    setTimeout(() => this.fitCanvas(), 100);
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
      const mw = m.width || GRID_W;
      const mh = m.height || GRID_H;
      canvas.width = mw;
      canvas.height = mh;
      canvas.style.width = '100%';
      canvas.style.aspectRatio = mw + ' / ' + mh;
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
    setTimeout(() => this.fitCanvas(), 100);
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
        if (cur < 20) {
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
          this.togglePause();
        }
      }
    });

    // ===== 画布缩放与平移 =====
    this.canvasZoom = 1;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.scrollStartX = 0;
    this.scrollStartY = 0;

    const canvas = document.getElementById('game-canvas');
    const viewport = document.getElementById('canvas-viewport');
    const zoomLabel = document.getElementById('zoom-level');
    const zoomSlider = document.getElementById('zoom-slider');

    this.applyZoom = function() {
      const w = canvas.width * this.canvasZoom;
      const h = canvas.height * this.canvasZoom;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      zoomLabel.textContent = Math.round(this.canvasZoom * 100) + '%';
      if (zoomSlider) zoomSlider.value = Math.round(this.canvasZoom * 100);
    };

    this.setZoom = function(z) {
      this.canvasZoom = Math.max(0.3, Math.min(3, z));
      this.applyZoom();
    };

    this.fitCanvas = function() {
      const vp = viewport.getBoundingClientRect();
      const cw = canvas.width;
      const ch = canvas.height;
      if (cw === 0 || ch === 0) return;
      const scaleX = (vp.width - 20) / cw;
      const scaleY = (vp.height - 20) / ch;
      this.canvasZoom = Math.min(scaleX, scaleY, 1.5);
      this.applyZoom();
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    };

    this.panBy = function(dx, dy) {
      viewport.scrollLeft += dx;
      viewport.scrollTop += dy;
    };

    // 缩放按钮
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      this.setZoom(this.canvasZoom * 1.2);
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      this.setZoom(this.canvasZoom / 1.2);
    });
    document.getElementById('btn-zoom-reset').addEventListener('click', () => {
      this.canvasZoom = 1;
      this.applyZoom();
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    });
    document.getElementById('btn-zoom-fit').addEventListener('click', () => {
      this.fitCanvas();
    });

    // 缩放滑块
    if (zoomSlider) {
      zoomSlider.addEventListener('input', () => {
        this.canvasZoom = parseInt(zoomSlider.value) / 100;
        this.applyZoom();
      });
    }

    // 平移按钮
    const PAN_STEP = 80;
    document.getElementById('btn-pan-left').addEventListener('click', () => this.panBy(-PAN_STEP, 0));
    document.getElementById('btn-pan-right').addEventListener('click', () => this.panBy(PAN_STEP, 0));
    document.getElementById('btn-pan-up').addEventListener('click', () => this.panBy(0, -PAN_STEP));
    document.getElementById('btn-pan-down').addEventListener('click', () => this.panBy(0, PAN_STEP));

    // 拖拽平移(用原生 scrollLeft/scrollTop)
    viewport.addEventListener('mousedown', (e) => {
      if (e.target !== canvas && e.target !== viewport) return;
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.scrollStartX = viewport.scrollLeft;
      this.scrollStartY = viewport.scrollTop;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      viewport.scrollLeft = this.scrollStartX - (e.clientX - this.dragStartX);
      viewport.scrollTop = this.scrollStartY - (e.clientY - this.dragStartY);
    });
    window.addEventListener('mouseup', () => { this.isDragging = false; });

    // 滚轮缩放(以鼠标位置为中心)
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const oldZoom = this.canvasZoom;
      const newZoom = Math.max(0.3, Math.min(3, oldZoom * delta));
      if (newZoom === oldZoom) return;
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left + viewport.scrollLeft;
      const mouseY = e.clientY - rect.top + viewport.scrollTop;
      const ratio = newZoom / oldZoom;
      this.canvasZoom = newZoom;
      this.applyZoom();
      viewport.scrollLeft = mouseX * ratio - (e.clientX - rect.left);
      viewport.scrollTop = mouseY * ratio - (e.clientY - rect.top);
    }, { passive: false });
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

  // ===== 排兵布阵系统 =====

  // 初始化布阵界面(从自定义页或人机配置页进入)
  enterDeployment(fromAI) {
    const mapData = fromAI ? this.aiSelectedMap : this.selectedMap;
    if (!mapData) return;

    this.deployMapData = mapData;
    const parsed = parseMap(mapData);
    this.deployGrid = parsed.grid;
    this.deployGridW = parsed.width;
    this.deployGridH = parsed.height;
    this.deployCell = parsed.cellSize;

    // 初始化布阵数据(空)
    this.deployment = {
      1: { tanks: [], mortars: [], italianGuns: [], mines: [] },
      2: { tanks: [], mortars: [], italianGuns: [], mines: [] }
    };
    this.deployTeam = 1;
    this.selectedDeployUnit = null;
    this.selectedDeployTankIdx = -1;

    // 设置画布尺寸
    const canvas = document.getElementById('deploy-canvas');
    canvas.width = parsed.width * parsed.cellSize;
    canvas.height = parsed.height * parsed.cellSize;
    const mapWrap = canvas.parentElement;
    mapWrap.classList.toggle('big-map', !!parsed.bigBattlefield);

    this.deployCtx = canvas.getContext('2d');

    // 绑定画布事件(首次进入时绑定)
    if (!canvas.dataset.bound) {
      canvas.dataset.bound = '1';
      canvas.addEventListener('click', (e) => this.onDeployCanvasClick(e));
      canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.onDeployCanvasRightClick(e);
      });
    }

    // AI 模式: 禁用蓝方编辑标签,自动生成敌方布阵
    const tab2 = document.getElementById('deploy-tab-2');
    if (fromAI) {
      tab2.disabled = true;
      tab2.textContent = '蓝方(AI自动布阵)';
      this.generateAIDeployment();
    } else {
      tab2.disabled = false;
      tab2.textContent = '蓝方布阵';
    }

    // 双人模式:若玩家数为1,蓝方也由AI布阵
    if (!fromAI && this.playerCount === 1) {
      tab2.disabled = true;
      tab2.textContent = '蓝方(AI自动布阵)';
      this.generateAIDeploymentForTeam(2);
    }

    this.renderDeployUnitPanel();
    this.renderDeploymentMap();
    this.updateDeployTabs();
    this.go('screen-deployment');
  },

  // 为 AI 方生成随机布阵
  generateAIDeployment() {
    this.generateAIDeploymentForTeam(2);
  },

  generateAIDeploymentForTeam(team) {
    const dep = this.deployment[team];
    const gridW = this.deployGridW;
    const gridH = this.deployGridH;
    const isLeft = team === 1;
    const xStart = isLeft ? 1 : Math.floor(gridW / 2);
    const xEnd = isLeft ? Math.floor(gridW / 2) - 1 : gridW - 2;
    const dir = isLeft ? DIR.RIGHT : DIR.LEFT;

    // 收集己方区域内的空格子
    const emptyCells = [];
    for (let y = 1; y < gridH - 1; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        if (this.deployGrid[y][x] === 0) {
          emptyCells.push({ x, y });
        }
      }
    }

    // 随机打乱
    for (let i = emptyCells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [emptyCells[i], emptyCells[j]] = [emptyCells[j], emptyCells[i]];
    }

    // 放置坦克
    const teamList = team === 1 ? this.team1 : this.team2;
    const tankCount = teamList.length;
    dep.tanks = [];
    for (let i = 0; i < tankCount && emptyCells.length > 0; i++) {
      const cell = emptyCells.shift();
      dep.tanks.push({ index: i, gx: cell.x, gy: cell.y });
    }

    // 随机放置一些迫击炮(2-4门)
    const mortarCount = Math.min(this.MAX_MORTARS, 2 + Math.floor(Math.random() * 3));
    dep.mortars = [];
    for (let i = 0; i < mortarCount && emptyCells.length > 0; i++) {
      const cell = emptyCells.shift();
      dep.mortars.push({ gx: cell.x, gy: cell.y, dir: dir });
    }

    // 随机放置一些意大利炮(1-2门)
    const gunCount = Math.min(this.MAX_ITALIAN_GUNS, 1 + Math.floor(Math.random() * 2));
    dep.italianGuns = [];
    for (let i = 0; i < gunCount && emptyCells.length > 0; i++) {
      const cell = emptyCells.shift();
      dep.italianGuns.push({ gx: cell.x, gy: cell.y, dir: dir });
    }

    // 随机放置一些地雷(5-10颗)
    const mineCount = Math.min(this.MAX_MINES, 5 + Math.floor(Math.random() * 6));
    dep.mines = [];
    for (let i = 0; i < mineCount && emptyCells.length > 0; i++) {
      const cell = emptyCells.shift();
      dep.mines.push({ gx: cell.x, gy: cell.y });
    }
  },

  // 渲染布阵地图
  renderDeploymentMap() {
    const ctx = this.deployCtx;
    if (!ctx) return;
    const w = this.deployGridW;
    const h = this.deployGridH;
    const cell = this.deployCell;

    // 背景
    drawBackground(ctx, w, h, cell);

    // 方块
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = this.deployGrid[y][x];
        if (v !== 0) drawBlock(ctx, x, y, v, cell);
      }
    }

    // 高亮己方部署区域
    const team = this.deployTeam;
    const midX = Math.floor(w / 2);
    ctx.save();
    ctx.globalAlpha = 0.15;
    if (team === 1) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(0, 0, midX * cell, h * cell);
    } else {
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(midX * cell, 0, w * cell - midX * cell, h * cell);
    }
    ctx.restore();

    // 中线分隔
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(midX * cell, 0);
    ctx.lineTo(midX * cell, h * cell);
    ctx.stroke();
    ctx.restore();

    // 绘制已放置的单位(双方都画,但己方更明显)
    this.drawDeployedUnits(ctx, 1, team === 1);
    this.drawDeployedUnits(ctx, 2, team === 2);

    // 绘制选中坦克的悬浮预览(在鼠标位置,暂不实现悬浮,用点击放置)
  },

  // 绘制某方已部署单位
  drawDeployedUnits(ctx, team, isActive) {
    const dep = this.deployment[team];
    const cell = this.deployCell;
    const color = team === 1 ? '#ef4444' : '#3b82f6';

    // 地雷(先画,在最底层)
    if (dep.mines) {
      for (const m of dep.mines) {
        const cx = m.gx * cell + cell / 2;
        const cy = m.gy * cell + cell / 2;
        ctx.save();
        ctx.globalAlpha = isActive ? 0.8 : 0.4;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(4, cell * 0.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 1;
        ctx.stroke();
        // 中心高光
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = isActive ? 0.5 : 0.25;
        ctx.beginPath();
        ctx.arc(cx - 1, cy - 1, Math.max(2, cell * 0.08), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 迫击炮
    if (dep.mortars) {
      for (const m of dep.mortars) {
        const cx = m.gx * cell + cell / 2;
        const cy = m.gy * cell + cell / 2;
        const r = Math.max(8, cell * 0.35);
        ctx.save();
        ctx.globalAlpha = isActive ? 1 : 0.5;
        ctx.translate(cx, cy);
        // 底座
        const baseColor = team === 1 ? '#991b1b' : '#1e3a8a';
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // 炮管(朝敌方方向)
        ctx.save();
        const angle = (m.dir === DIR.RIGHT ? 0 : m.dir === DIR.DOWN ? Math.PI / 2 : m.dir === DIR.LEFT ? Math.PI : -Math.PI / 2);
        ctx.rotate(angle);
        ctx.fillStyle = '#374151';
        ctx.fillRect(0, -Math.max(2, cell * 0.08), Math.max(12, cell * 0.5), Math.max(4, cell * 0.15));
        ctx.strokeStyle = '#1f2937';
        ctx.strokeRect(0, -Math.max(2, cell * 0.08), Math.max(12, cell * 0.5), Math.max(4, cell * 0.15));
        ctx.restore();
        ctx.restore();
      }
    }

    // 意大利炮
    if (dep.italianGuns) {
      for (const g of dep.italianGuns) {
        const cx = g.gx * cell + cell / 2;
        const cy = g.gy * cell + cell / 2;
        const r = Math.max(10, cell * 0.42);
        ctx.save();
        ctx.globalAlpha = isActive ? 1 : 0.5;
        ctx.translate(cx, cy);
        // 底座
        ctx.fillStyle = '#4b5563';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 2;
        ctx.stroke();
        // 装甲条纹
        const ownerColor = team === 1 ? '#991b1b' : '#1e3a8a';
        ctx.fillStyle = ownerColor;
        ctx.globalAlpha = isActive ? 0.5 : 0.25;
        ctx.beginPath();
        ctx.arc(0, 0, r - 3, -Math.PI * 0.75, -Math.PI * 0.25);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = isActive ? 1 : 0.5;
        // 炮管
        ctx.save();
        ctx.rotate(g.dir * Math.PI / 2);
        ctx.fillStyle = '#374151';
        ctx.fillRect(0, -Math.max(3, cell * 0.1), Math.max(18, cell * 0.7), Math.max(6, cell * 0.22));
        ctx.strokeStyle = '#1f2937';
        ctx.strokeRect(0, -Math.max(3, cell * 0.1), Math.max(18, cell * 0.7), Math.max(6, cell * 0.22));
        // 炮口
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(Math.max(16, cell * 0.62), -Math.max(4, cell * 0.13), Math.max(4, cell * 0.15), Math.max(8, cell * 0.3));
        ctx.restore();
        ctx.restore();
      }
    }

    // 坦克
    if (dep.tanks) {
      const teamList = team === 1 ? this.team1 : this.team2;
      for (const t of dep.tanks) {
        const cfg = teamList[t.index];
        if (!cfg) continue;
        const cx = t.gx * cell + cell / 2;
        const cy = t.gy * cell + cell / 2;
        ctx.save();
        ctx.globalAlpha = isActive ? 1 : 0.5;
        ctx.translate(cx, cy);
        const scale = cell / 30 * 0.9;
        ctx.scale(scale, scale);
        // 坦克朝向: 红方朝右,蓝方朝左
        const dir = team === 1 ? DIR.RIGHT : DIR.LEFT;
        ctx.rotate(dir * Math.PI / 2);
        drawTankBody(ctx, cfg.skin, cfg.color, team, false, t.index);
        ctx.restore();
      }
    }
  },

  // 渲染左侧单位面板
  renderDeployUnitPanel() {
    const team = this.deployTeam;
    const dep = this.deployment[team];
    const teamList = team === 1 ? this.team1 : this.team2;
    const isEditable = this.isTeamDeployEditable(team);

    // 坦克列表
    const tankList = document.getElementById('deploy-tank-list');
    const tankCount = document.getElementById('deploy-tank-count');
    tankList.innerHTML = '';
    const placedTankCount = dep.tanks.length;
    tankCount.textContent = `${placedTankCount}/${teamList.length}`;

    teamList.forEach((cfg, idx) => {
      const placed = dep.tanks.some(t => t.index === idx);
      const item = document.createElement('div');
      item.className = 'unit-tank-item' + (this.selectedDeployUnit === 'tank' && this.selectedDeployTankIdx === idx ? ' selected' : '') + (placed ? ' placed' : '');
      const skinName = (TANK_SKINS.find(s => s.id === cfg.skin) || {}).name || cfg.skin;
      const role = cfg.isHuman ? `玩家${team}` : `AI #${idx + 1}`;
      item.innerHTML = `
        <div class="tank-icon"><canvas width="32" height="32"></canvas></div>
        <div class="tank-meta">
          <div class="tank-name">${skinName}</div>
          <div class="tank-status">${role}${placed ? ' · 已放置' : ''}</div>
        </div>
      `;
      const canvas = item.querySelector('canvas');
      const cctx = canvas.getContext('2d');
      cctx.translate(16, 16);
      cctx.scale(1.2, 1.2);
      const dir = team === 1 ? DIR.RIGHT : DIR.LEFT;
      cctx.rotate(dir * Math.PI / 2);
      drawTankBody(cctx, cfg.skin, cfg.color, team, false, idx);

      if (isEditable) {
        item.addEventListener('click', () => {
          if (placed) {
            // 已放置:点击则选中并高亮地图上的位置(此处简化为取消选中)
            // 实际可通过右键在地图上移除
            return;
          }
          this.selectedDeployUnit = 'tank';
          this.selectedDeployTankIdx = idx;
          this.renderDeployUnitPanel();
        });
      }
      tankList.appendChild(item);
    });

    // 武器剩余数量
    document.getElementById('mortar-remain').textContent = `${this.MAX_MORTARS - dep.mortars.length}/${this.MAX_MORTARS}`;
    document.getElementById('italianGun-remain').textContent = `${this.MAX_ITALIAN_GUNS - dep.italianGuns.length}/${this.MAX_ITALIAN_GUNS}`;
    document.getElementById('mine-remain').textContent = `${this.MAX_MINES - dep.mines.length}/${this.MAX_MINES}`;

    // 武器按钮选中状态
    document.querySelectorAll('.unit-weapon-btn').forEach(btn => {
      const unit = btn.dataset.unit;
      btn.classList.toggle('selected', this.selectedDeployUnit === unit);
      btn.disabled = !isEditable;
    });

    // 提示文字
    const warnEl = document.getElementById('deploy-hint-warn');
    if (!isEditable) {
      warnEl.textContent = '此阵营由AI布阵,不可编辑';
    } else if (!this.selectedDeployUnit) {
      warnEl.textContent = '请先选择要放置的单位';
    } else {
      warnEl.textContent = '';
    }
  },

  // 判断某方是否可编辑
  isTeamDeployEditable(team) {
    // AI模式:只有玩家方(红方1)可编辑
    if (this.aiMode) return team === 1;
    // 单人模式:只有玩家1方可编辑
    if (this.playerCount === 1) return team === 1;
    // 双人模式:双方都可编辑
    return true;
  },

  // 画布点击:放置单位
  onDeployCanvasClick(e) {
    if (!this.isTeamDeployEditable(this.deployTeam)) return;
    if (!this.selectedDeployUnit) return;

    const canvas = document.getElementById('deploy-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const gx = Math.floor(px / this.deployCell);
    const gy = Math.floor(py / this.deployCell);

    if (gx < 0 || gx >= this.deployGridW || gy < 0 || gy >= this.deployGridH) return;

    // 检查是否在己方区域
    if (!this.isInDeployZone(gx, gy, this.deployTeam)) {
      this.showDeployHint('只能在己方区域放置单位!');
      return;
    }

    // 检查是否是空格子(非砖墙钢板)
    if (this.deployGrid[gy][gx] !== 0) {
      this.showDeployHint('不能放置在墙壁上!');
      return;
    }

    // 检查该格子是否已有单位
    if (this.isCellOccupied(gx, gy, this.deployTeam)) {
      // 如果有单位,则移除它(再次点击移除)
      this.removeUnitAt(gx, gy, this.deployTeam);
      this.renderDeploymentMap();
      this.renderDeployUnitPanel();
      return;
    }

    this.placeDeployUnit(gx, gy);
  },

  // 右键点击:移除单位
  onDeployCanvasRightClick(e) {
    if (!this.isTeamDeployEditable(this.deployTeam)) return;

    const canvas = document.getElementById('deploy-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const gx = Math.floor(px / this.deployCell);
    const gy = Math.floor(py / this.deployCell);

    if (gx < 0 || gx >= this.deployGridW || gy < 0 || gy >= this.deployGridH) return;

    if (this.isCellOccupied(gx, gy, this.deployTeam)) {
      this.removeUnitAt(gx, gy, this.deployTeam);
      this.renderDeploymentMap();
      this.renderDeployUnitPanel();
    }
  },

  // 判断格子是否在己方部署区域
  isInDeployZone(gx, gy, team) {
    const midX = Math.floor(this.deployGridW / 2);
    if (team === 1) return gx < midX;
    return gx >= midX;
  },

  // 判断格子是否被己方单位占据
  isCellOccupied(gx, gy, team) {
    const dep = this.deployment[team];
    if (dep.tanks.some(t => t.gx === gx && t.gy === gy)) return true;
    if (dep.mortars.some(m => m.gx === gx && m.gy === gy)) return true;
    if (dep.italianGuns.some(g => g.gx === gx && g.gy === gy)) return true;
    if (dep.mines.some(m => m.gx === gx && m.gy === gy)) return true;
    return false;
  },

  // 放置单位
  placeDeployUnit(gx, gy) {
    const team = this.deployTeam;
    const dep = this.deployment[team];
    const dir = team === 1 ? DIR.RIGHT : DIR.LEFT;

    if (this.selectedDeployUnit === 'tank') {
      const idx = this.selectedDeployTankIdx;
      if (idx < 0) return;
      // 检查该坦克是否已放置
      if (dep.tanks.some(t => t.index === idx)) {
        this.showDeployHint('该坦克已放置,右键可移除');
        return;
      }
      dep.tanks.push({ index: idx, gx, gy });
      // 自动选中下一辆未放置的坦克
      const teamList = team === 1 ? this.team1 : this.team2;
      let nextIdx = -1;
      for (let i = 0; i < teamList.length; i++) {
        if (!dep.tanks.some(t => t.index === i)) { nextIdx = i; break; }
      }
      if (nextIdx >= 0) {
        this.selectedDeployTankIdx = nextIdx;
      } else {
        this.selectedDeployUnit = null;
        this.selectedDeployTankIdx = -1;
      }
    } else if (this.selectedDeployUnit === 'mortar') {
      if (dep.mortars.length >= this.MAX_MORTARS) {
        this.showDeployHint('迫击炮已达上限!');
        return;
      }
      dep.mortars.push({ gx, gy, dir });
    } else if (this.selectedDeployUnit === 'italianGun') {
      if (dep.italianGuns.length >= this.MAX_ITALIAN_GUNS) {
        this.showDeployHint('意大利炮已达上限!');
        return;
      }
      dep.italianGuns.push({ gx, gy, dir });
    } else if (this.selectedDeployUnit === 'mine') {
      if (dep.mines.length >= this.MAX_MINES) {
        this.showDeployHint('地雷已达上限!');
        return;
      }
      dep.mines.push({ gx, gy });
    }

    this.renderDeploymentMap();
    this.renderDeployUnitPanel();
  },

  // 移除某格的己方单位
  removeUnitAt(gx, gy, team) {
    const dep = this.deployment[team];
    // 先查坦克
    const tankIdx = dep.tanks.findIndex(t => t.gx === gx && t.gy === gy);
    if (tankIdx >= 0) {
      dep.tanks.splice(tankIdx, 1);
      return;
    }
    // 迫击炮
    const mIdx = dep.mortars.findIndex(m => m.gx === gx && m.gy === gy);
    if (mIdx >= 0) { dep.mortars.splice(mIdx, 1); return; }
    // 意大利炮
    const gIdx = dep.italianGuns.findIndex(g => g.gx === gx && g.gy === gy);
    if (gIdx >= 0) { dep.italianGuns.splice(gIdx, 1); return; }
    // 地雷
    const mineIdx = dep.mines.findIndex(m => m.gx === gx && m.gy === gy);
    if (mineIdx >= 0) { dep.mines.splice(mineIdx, 1); return; }
  },

  // 显示提示
  showDeployHint(msg) {
    const warnEl = document.getElementById('deploy-hint-warn');
    if (warnEl) {
      warnEl.textContent = msg;
      clearTimeout(this._deployHintTimer);
      this._deployHintTimer = setTimeout(() => {
        if (warnEl.textContent === msg) warnEl.textContent = '';
      }, 2000);
    }
  },

  // 切换编辑阵营
  switchDeployTeam(team) {
    if (!this.isTeamDeployEditable(team)) return;
    this.deployTeam = team;
    this.selectedDeployUnit = null;
    this.selectedDeployTankIdx = -1;
    this.updateDeployTabs();
    this.renderDeployUnitPanel();
    this.renderDeploymentMap();
  },

  updateDeployTabs() {
    document.querySelectorAll('.deploy-tab').forEach(tab => {
      const team = parseInt(tab.dataset.team);
      tab.classList.toggle('active', team === this.deployTeam);
    });
  },

  // 重置布阵
  resetDeployment() {
    if (!confirm('确定要重置所有布阵吗?')) return;
    this.deployment = {
      1: { tanks: [], mortars: [], italianGuns: [], mines: [] },
      2: { tanks: [], mortars: [], italianGuns: [], mines: [] }
    };
    // AI模式或单人模式:重新生成敌方布阵
    if (this.aiMode || this.playerCount === 1) {
      this.generateAIDeploymentForTeam(2);
    }
    this.selectedDeployUnit = null;
    this.selectedDeployTankIdx = -1;
    this.renderDeployUnitPanel();
    this.renderDeploymentMap();
  },

  // 验证布阵
  validateDeployment() {
    // 检查双方坦克是否全部放置
    const team1Placed = this.deployment[1].tanks.length;
    const team2Placed = this.deployment[2].tanks.length;
    const team1Total = this.team1.length;
    const team2Total = this.team2.length;

    if (team1Placed < team1Total) {
      alert(`红方还有 ${team1Total - team1Placed} 辆坦克未放置!`);
      return false;
    }
    if (team2Placed < team2Total) {
      alert(`蓝方还有 ${team2Total - team2Placed} 辆坦克未放置!`);
      return false;
    }
    return true;
  },

  // 确认开战(使用布阵)
  confirmDeploymentAndStart() {
    if (!this.validateDeployment()) return;
    this.startGameWithDeployment(this.deployment);
  },

  // 跳过布阵(不使用防御武器,使用默认出生点)
  skipDeployment() {
    this.deployment = null;
    if (this.aiMode) {
      this.startAIGame();
    } else {
      this.startGame();
    }
  },

  // 使用布阵数据开始游戏
  startGameWithDeployment(deployment) {
    const isAI = this.aiMode;
    const mapData = isAI ? this.aiSelectedMap : this.selectedMap;
    if (!mapData) return;

    this.go('screen-game');
    document.getElementById('game-overlay').classList.add('hidden');
    document.getElementById('pause-overlay').classList.add('hidden');
    document.getElementById('game-map-name').textContent = mapData.name;

    // 重建 HUD
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
    this.game.loadMap(mapData);

    const bounceId = isAI ? 'ai-opt-bounce' : 'opt-bounce';
    const powerupsId = isAI ? 'ai-opt-powerups' : 'opt-powerups';
    const bounce = document.getElementById(bounceId).checked;
    const powerups = document.getElementById(powerupsId).checked;

    const opts = { bounce, powerups };
    if (isAI) opts.aiDifficulty = this.aiDifficulty;

    // 设置坦克(带自定义位置)
    this.game.setupTanks({ 1: this.team1, 2: this.team2 }, opts, deployment);

    // 设置防御武器
    if (deployment) {
      const allMortars = [];
      const allGuns = [];
      const allMines = [];
      [1, 2].forEach(team => {
        const dep = deployment[team];
        if (dep.mortars) {
          for (const m of dep.mortars) {
            allMortars.push({ gx: m.gx, gy: m.gy, dir: m.dir, owner: team });
          }
        }
        if (dep.italianGuns) {
          for (const g of dep.italianGuns) {
            allGuns.push({ gx: g.gx, gy: g.gy, dir: g.dir, owner: team });
          }
        }
        if (dep.mines) {
          for (const m of dep.mines) {
            allMines.push({ gx: m.gx, gy: m.gy, owner: team });
          }
        }
      });
      this.game.setupDeployables({
        mortars: allMortars,
        italianGuns: allGuns,
        mines: allMines,
      });
    }

    this.game.stop();
    this.game.start();
    setTimeout(() => this.fitCanvas(), 100);
  },

  // 初始化布阵按钮和事件
  initDeploymentButtons() {
    // 自定义页"排兵布阵"按钮
    const btnDeploy = document.getElementById('btn-deploy-game');
    if (btnDeploy) {
      btnDeploy.addEventListener('click', () => {
        this.aiMode = false;
        this.enterDeployment(false);
      });
    }

    // 人机配置页"排兵布阵"按钮
    const btnAIDeploy = document.getElementById('btn-ai-deploy-game');
    if (btnAIDeploy) {
      btnAIDeploy.addEventListener('click', () => {
        this.aiMode = true;
        this.enterDeployment(true);
      });
    }

    // 阵营切换标签
    document.querySelectorAll('.deploy-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const team = parseInt(tab.dataset.team);
        this.switchDeployTeam(team);
      });
    });

    // 武器按钮
    document.querySelectorAll('.unit-weapon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const unit = btn.dataset.unit;
        if (this.selectedDeployUnit === unit) {
          this.selectedDeployUnit = null;
        } else {
          this.selectedDeployUnit = unit;
          this.selectedDeployTankIdx = -1;
        }
        this.renderDeployUnitPanel();
      });
    });

    // 返回按钮
    document.getElementById('btn-deploy-back').addEventListener('click', () => {
      if (this.aiMode) {
        this.go('screen-ai-config');
      } else {
        this.go('screen-customize');
      }
    });

    // 重置按钮
    document.getElementById('btn-deploy-reset').addEventListener('click', () => {
      this.resetDeployment();
    });

    // 跳过布阵按钮
    document.getElementById('btn-deploy-skip').addEventListener('click', () => {
      this.skipDeployment();
    });

    // 确认开战按钮
    document.getElementById('btn-deploy-confirm').addEventListener('click', () => {
      this.confirmDeploymentAndStart();
    });
  },

  // 编辑器
  initEditor() {
    const canvas = document.getElementById('editor-canvas');
    this.editor = new MapEditor(canvas);
    this.editorLoadedMapId = null;

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
      if (confirm('清空当前地图?')) {
        this.editor.clearAll();
        this.editorLoadedMapId = null;
        document.getElementById('editor-name').value = '';
        this.refreshEditorMapSelect();
      }
    });

    // 地图加载
    this.refreshEditorMapSelect();
    document.getElementById('btn-editor-load').addEventListener('click', () => {
      const select = document.getElementById('editor-map-select');
      const mapId = select.value;
      if (!mapId) return;
      const allMaps = getAllMaps();
      const mapData = allMaps.find(m => m.id === mapId);
      if (!mapData) return;
      this.editor.loadFromMap(mapData);
      document.getElementById('editor-name').value = mapData.name;
      this.editorLoadedMapId = mapData.custom ? mapData.id : null;
      // 只对自制地图显示删除按钮
      document.getElementById('btn-editor-delete').style.display = mapData.custom ? '' : 'none';
    });

    // 删除自制地图
    document.getElementById('btn-editor-delete').addEventListener('click', () => {
      if (!this.editorLoadedMapId) return;
      if (confirm('删除这张自制地图?')) {
        deleteCustomMap(this.editorLoadedMapId);
        this.editorLoadedMapId = null;
        this.editor.clearAll();
        document.getElementById('editor-name').value = '';
        document.getElementById('btn-editor-delete').style.display = 'none';
        this.refreshEditorMapSelect();
      }
    });

    // 保存:弹出密码验证
    document.getElementById('btn-editor-save').addEventListener('click', () => {
      this.showSaveModal();
    });
    document.getElementById('save-pwd-cancel').addEventListener('click', () => {
      this.hideSaveModal();
    });
    document.getElementById('save-pwd-confirm').addEventListener('click', () => {
      this.trySaveMap();
    });
    document.getElementById('save-pwd-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.trySaveMap();
    });

    document.getElementById('btn-editor-test').addEventListener('click', () => {
      const map = this.editor.exportMap('编辑器测试');
      this.selectedMap = map;
      this.testFromEditor = true;
      this.startGame();
    });
  },

  refreshEditorMapSelect() {
    const select = document.getElementById('editor-map-select');
    if (!select) return;
    const maps = getAllMaps();
    select.innerHTML = '<option value="">-- 选择地图 --</option>' +
      maps.map(m => `<option value="${m.id}">${m.name}${m.custom ? ' (自制)' : ''}</option>`).join('');
  },

  showSaveModal() {
    document.getElementById('save-pwd-modal').style.display = '';
    document.getElementById('save-pwd-input').value = '';
    document.getElementById('save-pwd-msg').textContent = '';
    setTimeout(() => document.getElementById('save-pwd-input').focus(), 50);
  },

  hideSaveModal() {
    document.getElementById('save-pwd-modal').style.display = 'none';
  },

  trySaveMap() {
    const pwd = document.getElementById('save-pwd-input').value.trim();
    const msgEl = document.getElementById('save-pwd-msg');
    if (!pwd) { msgEl.textContent = '请输入'; return; }
    if (pwd !== '1122') {
      msgEl.textContent = '验证失败';
      document.getElementById('save-pwd-input').value = '';
      return;
    }
    const nameInput = document.getElementById('editor-name');
    const name = nameInput.value.trim() || '我的地图';
    const map = this.editor.exportMap(name);
    // 如果是已加载的自制地图,覆盖更新;否则新增
    if (this.editorLoadedMapId) {
      const existing = loadCustomMaps().find(m => m.id === this.editorLoadedMapId);
      if (existing) {
        Object.assign(existing, { name, rows: map.rows, tag: '自制' });
        saveCustomMaps(loadCustomMaps());
      } else {
        addCustomMap(map);
      }
    } else {
      addCustomMap(map);
    }
    this.hideSaveModal();
    nameInput.value = '';
    this.editorLoadedMapId = null;
    document.getElementById('btn-editor-delete').style.display = 'none';
    this.refreshEditorMapSelect();
    alert('地图已保存!');
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
