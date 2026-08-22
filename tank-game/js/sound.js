// Web Audio API 音效系统(纯合成,无外部文件)
const SFX = {
  ctx: null,
  enabled: true,
  master: null,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.enabled = false;
    }
  },

  // 通用:播放一个振荡器音
  tone(freq, dur, type, vol, freqEnd) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur);
  },

  // 噪声爆破
  noise(dur, vol, filterFreq) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const bufSize = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filterFreq || 2000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t);
  },

  // 各事件音效
  play(name) {
    if (!this.enabled) return;
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    // 浏览器策略:首次用户交互后恢复
    if (this.ctx.state === 'suspended') this.ctx.resume();

    switch (name) {
      case 'shoot':    this.tone(220, 0.06, 'square', 0.12, 80); break;
      case 'mg':       this.tone(180, 0.03, 'sawtooth', 0.08, 60); break;  // 机关枪
      case 'hit':      this.noise(0.12, 0.25, 1500); this.tone(150, 0.08, 'sawtooth', 0.15, 40); break;
      case 'brick':    this.noise(0.15, 0.2, 800); break;
      case 'spark':    this.tone(800, 0.04, 'sine', 0.1, 1200); break;
      case 'bounce':   this.tone(600, 0.05, 'sine', 0.1, 900); break;
      case 'skill':    this.tone(400, 0.15, 'sine', 0.15, 1000); break;
      case 'powerup':  this.tone(523, 0.08, 'sine', 0.15); setTimeout(() => this.tone(784, 0.1, 'sine', 0.15), 80); break;
      case 'grenade':  this.tone(120, 0.08, 'square', 0.15, 60); break;
      case 'explode':  this.noise(0.3, 0.3, 600); this.tone(80, 0.25, 'sawtooth', 0.2, 20); break;
      case 'missile':  this.tone(200, 0.3, 'sawtooth', 0.12, 600); break;
      case 'missile_hit': this.noise(0.35, 0.3, 500); this.tone(60, 0.3, 'sawtooth', 0.25, 15); break;
      case 'win':      this.tone(523, 0.1, 'sine', 0.2); setTimeout(() => this.tone(659, 0.1, 'sine', 0.2), 100); setTimeout(() => this.tone(784, 0.2, 'sine', 0.2), 200); break;
      case 'lose':     this.tone(400, 0.15, 'sawtooth', 0.2, 200); setTimeout(() => this.tone(200, 0.3, 'sawtooth', 0.2, 80), 150); break;
      case 'select':   this.tone(660, 0.04, 'sine', 0.1, 880); break;
    }
  },
};
