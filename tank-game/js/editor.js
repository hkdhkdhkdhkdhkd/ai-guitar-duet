// 地图编辑器
class MapEditor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tool = 'brick';
    this.painting = false;
    this.eraseMode = false;
    this.grid = this.emptyGrid();
    this.spawn1 = { x: 1, y: 10 };
    this.spawn2 = { x: GRID_W - 2, y: 10 };
    this.nameInput = null;
    this.onSave = null;
    this.onTest = null;
    this.bindEvents();
    this.render();
  }

  emptyGrid() {
    const g = [];
    for (let y = 0; y < GRID_H; y++) {
      g.push(new Array(GRID_W).fill(0));
    }
    return g;
  }

  bindEvents() {
    const c = this.canvas;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      this.painting = true;
      this.eraseMode = (e.button === 2);
      this.paintAt(e);
    });
    c.addEventListener('mousemove', (e) => {
      if (this.painting) this.paintAt(e);
    });
    window.addEventListener('mouseup', () => { this.painting = false; });
    c.addEventListener('mouseleave', () => { this.painting = false; });
  }

  cellFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = Math.floor(((e.clientX - rect.left) * scaleX) / CELL);
    const y = Math.floor(((e.clientY - rect.top) * scaleY) / CELL);
    return { x: Math.max(0, Math.min(GRID_W - 1, x)), y: Math.max(0, Math.min(GRID_H - 1, y)) };
  }

  paintAt(e) {
    const { x, y } = this.cellFromEvent(e);
    const tool = this.eraseMode ? 'empty' : this.tool;
    if (tool === 'spawn1') {
      // 清掉原来的1位置上若为1标记(它存在grid?不,出生点单独存),把新位置清空
      this.grid[y][x] = 0;
      this.spawn1 = { x, y };
      // 若与2重叠,2移走
      if (this.spawn2.x === x && this.spawn2.y === y) this.spawn2 = { x: GRID_W - 2, y: 10 };
    } else if (tool === 'spawn2') {
      this.grid[y][x] = 0;
      this.spawn2 = { x, y };
      if (this.spawn1.x === x && this.spawn1.y === y) this.spawn1 = { x: 1, y: 10 };
    } else {
      // 出生点格子不被覆盖成方块
      const isSpawn = (this.spawn1.x === x && this.spawn1.y === y) || (this.spawn2.x === x && this.spawn2.y === y);
      if (isSpawn && tool !== 'empty') return;
      const val = tool === 'brick' ? 1 : tool === 'steel' ? 2 : 0;
      this.grid[y][x] = val;
    }
    this.render();
  }

  clearAll() {
    this.grid = this.emptyGrid();
    this.spawn1 = { x: 1, y: 10 };
    this.spawn2 = { x: GRID_W - 2, y: 10 };
    this.render();
  }

  setTool(tool) {
    this.tool = tool;
  }

  loadFromMap(mapData) {
    const parsed = parseMap(mapData.rows);
    this.grid = parsed.grid.map(r => r.slice());
    this.spawn1 = { ...parsed.spawn1 };
    this.spawn2 = { ...parsed.spawn2 };
    this.render();
  }

  exportMap(name) {
    const rows = serializeMap(this.grid, this.spawn1, this.spawn2);
    return {
      name: name || '我的地图',
      tag: '自制',
      rows,
      custom: true
    };
  }

  render() {
    const ctx = this.ctx;
    drawBackground(ctx);
    // 方块
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (this.grid[y][x] !== 0) drawBlock(ctx, x, y, this.grid[y][x]);
      }
    }
    // 出生点
    this.drawSpawn(ctx, this.spawn1, '#ef4444', '1');
    this.drawSpawn(ctx, this.spawn2, '#3b82f6', '2');
  }

  drawSpawn(ctx, sp, color, label) {
    const px = sp.x * CELL, py = sp.y * CELL;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, sp.x * CELL + CELL / 2, sp.y * CELL + CELL / 2);
  }
}
