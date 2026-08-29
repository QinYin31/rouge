// ===== 🖥️ UI agent 名下:程序化音效 + BGM(WebAudio 合成,零音频文件) =====
// play(name): shoot hit hurt pickup coin levelup chest boss death victory click no dash evolve synergy
const AC = window.AudioContext || window.webkitAudioContext;

// 同名音效最小触发间隔(ms):防机关枪式叠音,也合并 main 与 screens 的重复 click
// synergy ≥500ms:蒸汽爆发/感电联动可能同帧批量触发,由节流表兜底合并
const GAPS = {
  shoot: 45, hit: 40, pickup: 60, coin: 80, click: 120, hurt: 90,
  no: 150, levelup: 250, chest: 200, boss: 400, death: 600, victory: 600,
  dash: 90, evolve: 500, synergy: 500,
};

// BGM:Am - C - F - G 八步循环(低音 + 琶音),0.21 秒/步
const M_STEP = 0.21;
const M_BASS = [110, 0, 131, 0, 87, 0, 98, 0];      // A2 C3 F2 G2(0=休止)
const M_ARP  = [440, 659, 392, 659, 440, 698, 392, 587]; // 各和弦琶音

// 各音效定义(在 SFX 上下文里调用)
const DEFS = {
  shoot()   { this._tone({ type: 'square', f0: 820, f1: 240, dur: 0.08, gain: 0.2 }); },
  hit()     { this._noise({ dur: 0.06, gain: 0.5, f: 1700, q: 0.8 }); },
  hurt()    { this._tone({ type: 'square', f0: 150, f1: 65, dur: 0.22, gain: 0.55 });
              this._noise({ dur: 0.12, gain: 0.25, f: 320, type: 'lowpass' }); },
  pickup()  { this._tone({ type: 'sine', f0: 660, dur: 0.06, gain: 0.28 });
              this._tone({ type: 'sine', f0: 990, dur: 0.09, gain: 0.28, when: 0.055 }); },
  coin()    { this._tone({ type: 'triangle', f0: 1318, dur: 0.06, gain: 0.35 });
              this._tone({ type: 'triangle', f0: 1760, dur: 0.12, gain: 0.35, when: 0.055 }); },
  levelup() { [523, 659, 784].forEach((f, i) => this._tone({ type: 'triangle', f0: f, dur: 0.13, gain: 0.32, when: i * 0.085 })); },
  chest()   { this._tone({ type: 'triangle', f0: 260, f1: 900, dur: 0.28, gain: 0.3 });
              this._tone({ type: 'sine', f0: 1320, dur: 0.14, gain: 0.25, when: 0.26 }); },
  boss()    { this._tone({ type: 'sawtooth', f0: 60, f1: 36, dur: 0.7, gain: 0.65 });
              this._noise({ dur: 0.55, gain: 0.4, f: 160, type: 'lowpass' }); },
  death()   { this._tone({ type: 'sawtooth', f0: 320, f1: 50, dur: 0.65, gain: 0.5 }); },
  victory() { [523, 659, 784, 1046].forEach((f, i) => this._tone({ type: 'triangle', f0: f, dur: 0.2, gain: 0.34, when: i * 0.11 }));
              this._tone({ type: 'sine', f0: 2093, dur: 0.35, gain: 0.18, when: 0.46 }); },
  click()   { this._tone({ type: 'square', f0: 1900, f1: 1400, dur: 0.035, gain: 0.16 }); },
  no()      { this._tone({ type: 'square', f0: 120, f1: 82, dur: 0.16, gain: 0.45 }); },
  dash()    { this._noise({ dur: 0.15, gain: 0.5, f: 420, f1: 3600, q: 0.7, type: 'highpass', atk: 0.04 }); },
  evolve()  { // 上行五声琶音 + 双八度泛音 + 低音铺底,总时长约 0.6s,比 levelup 隆重
    [523, 659, 784, 1046, 1318].forEach((f, i) => {
      this._tone({ type: 'triangle', f0: f, dur: 0.18, gain: 0.3, when: i * 0.1 });
      this._tone({ type: 'sine', f0: f * 2, dur: 0.14, gain: 0.11, when: i * 0.1 + 0.02 }); // 泛音层
    });
    this._tone({ type: 'sine', f0: 262, dur: 0.5, gain: 0.16 });             // 低音铺底
    this._tone({ type: 'sine', f0: 2637, dur: 0.3, gain: 0.1, when: 0.44 }); // 高光收尾
  },
  synergy() { // 方波下滑 + 噪声「滋爆」:蒸汽爆发/感电联动
    this._tone({ type: 'square', f0: 840, f1: 170, dur: 0.12, gain: 0.24 });
    this._tone({ type: 'square', f0: 1260, f1: 260, dur: 0.12, gain: 0.15, when: 0.01 });
    this._noise({ dur: 0.12, gain: 0.28, f: 2600, q: 0.8 });
  },
};

export const SFX = {
  ctx: null, master: null, sfxBus: null, musicBus: null, noiseBuf: null,
  sfxOn: true, musicOn: false,
  _last: {}, _timer: null, _step: 0, _nextT: 0,

  init() {
    if (!AC || this.ctx) return;
    try { this.ctx = new AC(); } catch { this.ctx = null; return; }
    const c = this.ctx;
    // 主音量节点:总输出限制在 0.2 以下防爆音
    this.master = c.createGain(); this.master.gain.value = 0.2; this.master.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 1; this.sfxBus.connect(this.master);
    // BGM 独立总线:0.25 × 主音量 0.2 ≈ 有效音量 0.05,非常轻
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.25; this.musicBus.connect(this.master);
    // 复用白噪声 buffer(0.5s)
    const len = Math.max(1, (c.sampleRate * 0.5) | 0);
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    // 移动端自动播放策略:任意交互恢复上下文
    window.addEventListener('pointerdown', () => this._resume());
    window.addEventListener('touchend', () => this._resume());
    window.addEventListener('keydown', () => this._resume());
  },

  _resume() {
    if (!this.ctx || this.ctx.state !== 'suspended') return;
    const p = this.ctx.resume();
    if (p && p.catch) p.catch(() => {});
  },

  setSfx(b) { this.sfxOn = !!b; },

  setMusic(b) {
    this.musicOn = !!b;
    if (!this.ctx) return;
    const g = this.musicBus.gain, t = this.ctx.currentTime;
    if (this.musicOn) {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.25, t + 0.15);
      if (!this._timer) {
        this._step = 0;
        this._nextT = t + 0.08;
        this._timer = setInterval(() => this._schedule(), 110);
      }
    } else {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.0001, t + 0.1); // 80ms 内干净收尾
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }
  },

  play(name) {
    if (!this.ctx || !this.sfxOn) return;
    if (this.ctx.state === 'suspended') this._resume();
    const gap = GAPS[name] || 0;
    if (gap) {
      const now = performance.now();
      if (now - (this._last[name] !== undefined ? this._last[name] : -1e9) < gap) return;
      this._last[name] = now;
    }
    const d = DEFS[name];
    if (d) d.call(this);
  },

  // 振荡器 + 增益包络(指数衰减)
  _tone({ type = 'square', f0 = 440, f1 = 0, dur = 0.1, gain = 0.3, when = 0, dest = null }) {
    const c = this.ctx;
    const t0 = c.currentTime + Math.max(0, when);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(Math.max(0.0001, gain), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.03);
  },

  // 白噪声 + 滤波(打击感);f1=扫频终点,atk=起音过渡时长(whoosh 类用),均可选
  _noise({ dur = 0.08, gain = 0.3, f = 1200, f1 = 0, q = 1, type = 'bandpass', atk = 0, when = 0, dest = null }) {
    const c = this.ctx;
    if (!this.noiseBuf) return;
    const t0 = c.currentTime + Math.max(0, when);
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const flt = c.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(Math.max(1, f), t0);
    if (f1 && f1 !== f) flt.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = c.createGain();
    if (atk > 0) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    } else {
      g.gain.setValueAtTime(Math.max(0.0001, gain), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    }
    src.connect(flt); flt.connect(g); g.connect(dest || this.sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.03);
  },

  // BGM lookahead 调度器:提前排 1.1s,后台 interval 被节流也不断拍
  _schedule() {
    const c = this.ctx;
    if (!c || !this.musicOn) return;
    if (this._nextT < c.currentTime - 0.05) this._nextT = c.currentTime + 0.05; // 长时间挂起后重同步
    while (this._nextT < c.currentTime + 1.1) {
      const i = this._step % 8;
      const when = Math.max(0, this._nextT - c.currentTime);
      const bass = M_BASS[i];
      if (bass) this._tone({ type: 'square', f0: bass, dur: 0.2, gain: 0.5, when, dest: this.musicBus });
      this._tone({ type: 'triangle', f0: M_ARP[i], dur: 0.16, gain: 0.55, when, dest: this.musicBus });
      this._step++;
      this._nextT += M_STEP;
    }
  },
};
