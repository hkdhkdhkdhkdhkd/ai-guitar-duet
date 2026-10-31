// 确定性随机数(联机锁步同步用)
// 所有客户端用同一 seed,保证 AI、道具刷新等随机行为完全一致
const RNG = {
  _s: 0x9e3779b9,
  seed(n) {
    const v = (n >>> 0) || 0x9e3779b9;
    this._s = v;
    return v;
  },
  random() {
    // mulberry32
    let t = (this._s = (this._s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
};

// 视觉随机数(粒子/闪烁等纯表现,不影响同步)
const VRNG = {
  _s: 0x12345678,
  seed(n) { this._s = (n >>> 0) || 0x12345678; },
  random() {
    let t = (this._s = (this._s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
};
