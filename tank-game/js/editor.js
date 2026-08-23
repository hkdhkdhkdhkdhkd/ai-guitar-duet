// 地图编辑器
class MapEditor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tool = 'brick';
    this.oneWayDir = 1; // 单向方块默认方向: DIR.RIGHT(→)
    this.painting = false;
    this.eraseMode = false;
    this.gridW = GRID_W;
    this.gridH = GRID_H;
    this.cell = CELL;
    this.grid = this.emptyGrid();
    this.spawn1 = { x: 1, y: 10 };
    this.spawn2 = { x: this.gridW - 2, y: 10 };
    this.bindEvents();
    this.render();
  }

  emptyGrid() {
    const g = [];
    for (let y = 0; y < this.gridH; y++) {
      g.push(new Array(this.gridW).fill(0));
    }
    return g;
  }

  resizeCanvas() {
    this.canvas.width = this.gridW * this.cell;
    this.canvas.height = this.gridH * this.cell;
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
    const x = Math.floor(((e.clientX - rect.left) * scaleX) / this.cell);
    const y = Math.floor(((e.clientY - rect.top) * scaleY) / this.cell);
    return { x: Math.max(0, Math.min(this.gridW - 1, x)), y: Math.max(0, Math.min(this.gridH - 1, y)) };
  }

  paintAt(e) {
    const { x, y } = this.cellFromEvent(e);
    const tool = this.eraseMode ? 'empty' : this.tool;
    if (tool === 'spawn1') {
      this.grid[y][x] = 0;
      this.spawn1 = { x, y };
      if (this.spawn2.x === x && this.spawn2.y === y) this.spawn2 = { x: this.gridW - 2, y: 10 };
    } else if (tool === 'spawn2') {
      this.grid[y][x] = 0;
      this.spawn2 = { x, y };
      if (this.spawn1.x === x && this.spawn1.y === y) this.spawn1 = { x: 1, y: 10 };
    } else {
      const isSpawn = (this.spawn1.x === x && this.spawn1.y === y) || (this.spawn2.x === x && this.spawn2.y === y);
      if (isSpawn && tool !== 'empty') return;
      let val;
      if (tool === 'brick') val = 1;
      else if (tool === 'steel') val = 2;
      else if (tool === 'oneway') val = 3 + this.oneWayDir;
      else val = 0;
      this.grid[y][x] = val;
    }
    this.render();
  }

  clearAll() {
    this.gridW = GRID_W;
    this.gridH = GRID_H;
    this.cell = CELL;
    this.resizeCanvas();
    this.grid = this.emptyGrid();
    this.spawn1 = { x: 1, y: 10 };
    this.spawn2 = { x: this.gridW - 2, y: 10 };
    this.render();
  }

  setTool(tool) {
    this.tool = tool;
  }

  setOneWayDir(dir) {
    this.oneWayDir = dir;
    this.render();
  }

  loadFromMap(mapData) {
    const w = mapData.width || GRID_W;
    const h = mapData.height || GRID_H;
    const cs = mapData.cellSize || CELL;
    this.gridW = w;
    this.gridH = h;
    this.cell = cs;
    this.resizeCanvas();
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
      width: this.gridW,
      height: this.gridH,
      cellSize: this.cell,
      custom: true
    };
  }

  render() {
    const ctx = this.ctx;
    drawBackground(ctx, this.cell);
    // 网格线
    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.gridW; x++) {
      ctx.beginPath();
      ctx.moveTo(x * this.cell, 0);
      ctx.lineTo(x * this.cell, this.gridH * this.cell);
      ctx.stroke();
    }
    for (let y = 0; y <= this.gridH; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * this.cell);
      ctx.lineTo(this.gridW * this.cell, y * this.cell);
      ctx.stroke();
    }
    // 方块
    for (let y = 0; y < this.gridH; y++) {
      for (let x = 0; x < this.gridW; x++) {
        if (this.grid[y][x] !== 0) drawBlock(ctx, x, y, this.grid[y][x], this.cell);
      }
    }
    // 出生点
    this.drawSpawn(ctx, this.spawn1, '#ef4444', '1');
    this.drawSpawn(ctx, this.spawn2, '#3b82f6', '2');
  }

  drawSpawn(ctx, sp, color, label) {
    const px = sp.x * this.cell, py = sp.y * this.cell;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(px + 2, py + 2, this.cell - 4, this.cell - 4);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1.5, py + 1.5, this.cell - 3, this.cell - 3);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.floor(this.cell * 0.5) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, sp.x * this.cell + this.cell / 2, sp.y * this.cell + this.cell / 2);
  }
}
