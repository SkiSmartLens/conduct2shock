// Every sound in the game is synthesized here with the Web Audio API,
// so there are no audio files to load.

type Wave = OscillatorType;

export class GameAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private musicTimer: number | null = null;
  private nextBeat = 0;
  private beat = 0;
  private tense = false;
  muted = false;
  sfxEnabled = true;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.16;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private get ok() {
    return !!this.ctx && this.sfxEnabled && !this.muted;
  }

  private now() {
    return this.ctx!.currentTime;
  }

  // ---------- primitives ----------

  private tone(
    type: Wave,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    delay = 0,
    opts: { attack?: number; vibrato?: number; vibDepth?: number; out?: AudioNode } = {},
  ) {
    const ctx = this.ctx!;
    const t = this.now() + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (opts.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = opts.vibrato;
      const lg = ctx.createGain();
      lg.gain.value = opts.vibDepth ?? 20;
      lfo.connect(lg);
      lg.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    o.connect(g);
    g.connect(opts.out ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(
    dur: number,
    vol: number,
    filter: BiquadFilterType,
    f0: number,
    f1: number,
    delay = 0,
    q = 1,
    attack = 0.005,
    out?: AudioNode,
  ) {
    const ctx = this.ctx!;
    const t = this.now() + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out ?? this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // ---------- game sounds ----------

  whoosh(pitch = 1) {
    if (!this.ok) return;
    this.noise(0.22, 0.25, "bandpass", 500 * pitch, 2200 * pitch, 0, 2, 0.04);
  }

  splash() {
    if (!this.ok) return;
    this.noise(0.5, 0.55, "lowpass", 4000, 250, 0, 0.8);
    this.noise(0.12, 0.35, "highpass", 2500, 1200, 0, 0.7);
    for (let i = 0; i < 5; i++) {
      const f = 500 + Math.random() * 700;
      this.tone("sine", f, f * 0.4, 0.09, 0.18, 0.04 + i * 0.05 + Math.random() * 0.03);
    }
  }

  drip() {
    if (!this.ok) return;
    const f = 900 + Math.random() * 600;
    this.tone("sine", f, f * 1.8, 0.07, 0.08);
  }

  clank() {
    if (!this.ok) return;
    const base = 900 + Math.random() * 200;
    for (const [m, v] of [
      [1, 0.25],
      [1.52, 0.16],
      [2.76, 0.1],
      [3.9, 0.06],
    ] as const) {
      this.tone("sine", base * m, base * m * 0.98, 0.5, v);
    }
    this.noise(0.05, 0.3, "highpass", 3000, 2000);
    // comic "boing" tail
    this.tone("triangle", 180, 420, 0.25, 0.12, 0.03, { vibrato: 18, vibDepth: 60 });
  }

  zap(dur = 0.45, strength = 1) {
    if (!this.ok) return;
    const ctx = this.ctx!;
    const t = this.now();
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(70 + Math.random() * 30, t);
    const o2 = ctx.createOscillator();
    o2.type = "square";
    o2.frequency.setValueAtTime(142, t);
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 28 + Math.random() * 20;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.5;
    const amp = ctx.createGain();
    amp.gain.value = 0.5;
    lfo.connect(lfoG);
    lfoG.connect(amp.gain);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 6);
    }
    shaper.curve = curve;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    const vol = 0.22 * strength;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(amp);
    o2.connect(amp);
    amp.connect(shaper);
    shaper.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    for (const n of [o, o2, lfo]) {
      n.start(t);
      n.stop(t + dur + 0.05);
    }
    // crackles
    const n = Math.floor(6 + dur * 20);
    for (let i = 0; i < n; i++) {
      this.noise(0.03, 0.25 * strength, "highpass", 3500, 2500, Math.random() * dur, 0.5, 0.002);
    }
  }

  fizzle() {
    if (!this.ok) return;
    this.noise(0.25, 0.15, "highpass", 4000, 6000, 0, 0.5);
    this.tone("square", 300, 90, 0.2, 0.06);
  }

  eelSlap() {
    if (!this.ok) return;
    this.noise(0.08, 0.6, "bandpass", 1300, 700, 0, 1.2, 0.002);
    this.tone("sine", 320, 110, 0.25, 0.25, 0.02, { vibrato: 25, vibDepth: 40 });
  }

  eelFlop() {
    if (!this.ok) return;
    this.noise(0.05, 0.18, "bandpass", 900, 500, 0, 1.5, 0.002);
  }

  thunder(dist = 0) {
    if (!this.ok) return;
    const near = 1 - Math.min(1, dist / 40);
    this.noise(0.18, 0.9 * near + 0.2, "highpass", 1200, 400, 0, 0.6, 0.002);
    this.noise(0.4, 0.8, "lowpass", 2000, 300, 0.02, 0.7, 0.005);
    this.noise(3.5, 0.9, "lowpass", 300, 50, 0.08, 0.8, 0.05);
    this.noise(2.5, 0.5, "lowpass", 180, 40, 0.5, 1.5, 0.3);
  }

  rumble() {
    if (!this.ok) return;
    this.noise(2.2, 0.25, "lowpass", 160, 50, 0, 1, 0.6);
  }

  siren() {
    if (!this.ok) return;
    this.tone("square", 520, 520, 0.12, 0.08, 0);
    this.tone("square", 520, 520, 0.12, 0.08, 0.18);
    this.tone("square", 880, 880, 0.22, 0.1, 0.36);
  }

  tick(hi = false) {
    if (!this.ok) return;
    this.tone("square", hi ? 1320 : 880, hi ? 1320 : 880, 0.06, 0.07);
  }

  hurt(voice = 1) {
    if (!this.ok) return;
    const ctx = this.ctx!;
    const t = this.now();
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const f0 = 230 * voice * (0.9 + Math.random() * 0.2);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.22);
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 650 * voice;
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.frequency.value = 1100 * voice;
    f2.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(f1);
    o.connect(f2);
    f1.connect(g);
    f2.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  ko() {
    if (!this.ok) return;
    // slide whistle down
    this.tone("sine", 1500, 220, 0.9, 0.2, 0, { vibrato: 7, vibDepth: 30, attack: 0.03 });
    this.tone("triangle", 120, 60, 0.3, 0.3, 0.9);
  }

  plop() {
    if (!this.ok) return;
    this.tone("sine", 600, 110, 0.18, 0.3);
    this.noise(0.08, 0.2, "lowpass", 800, 200, 0.02);
  }

  boing() {
    if (!this.ok) return;
    this.tone("triangle", 110, 520, 0.35, 0.22, 0, { vibrato: 16, vibDepth: 70 });
  }

  pop() {
    if (!this.ok) return;
    this.tone("sine", 700, 1700, 0.07, 0.18);
  }

  dash() {
    if (!this.ok) return;
    this.noise(0.18, 0.2, "bandpass", 2400, 600, 0, 1.5, 0.01);
  }

  rattle() {
    if (!this.ok) return;
    for (let i = 0; i < 7; i++) {
      this.noise(0.04, 0.2, "bandpass", 2500 + Math.random() * 1500, 2000, i * 0.09, 3, 0.002);
      this.tone("sine", 1800 + Math.random() * 900, 1500, 0.08, 0.05, i * 0.09);
    }
  }

  select() {
    if (!this.ok) return;
    this.tone("square", 660, 990, 0.06, 0.05);
  }

  fanfare(win: boolean) {
    if (!this.ctx || this.muted) return;
    const notes = win ? [523, 659, 784, 1047, 784, 1047] : [392, 370, 349, 262];
    const step = win ? 0.13 : 0.28;
    notes.forEach((f, i) => {
      this.tone("square", f, f, step * (i === notes.length - 1 ? 3 : 1.1), 0.09, i * step);
      this.tone("triangle", f / 2, f / 2, step * 1.1, 0.12, i * step);
    });
  }

  /** Short hiss of the super soaker. */
  spray() {
    if (!this.ok) return;
    this.noise(0.12, 0.12, "bandpass", 3000 + Math.random() * 1500, 1800, 0, 1.2, 0.01);
  }

  /** A whole bucket of water. */
  bigSplash() {
    if (!this.ok) return;
    this.noise(0.9, 0.7, "lowpass", 3500, 200, 0, 0.8, 0.02);
    this.noise(0.25, 0.5, "highpass", 1800, 900, 0, 0.7);
    for (let i = 0; i < 9; i++) {
      const f = 350 + Math.random() * 800;
      this.tone("sine", f, f * 0.35, 0.12, 0.2, 0.05 + i * 0.06 + Math.random() * 0.04);
    }
    this.tone("triangle", 90, 40, 0.5, 0.3, 0.02);
  }

  /** Rubber duck. */
  quack() {
    if (!this.ok) return;
    const ctx = this.ctx!;
    const t = this.now();
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      const f0 = 420 + Math.random() * 60;
      o.frequency.setValueAtTime(f0, t + i * 0.16);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + i * 0.16 + 0.14);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1500;
      f.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.35, t + i * 0.16 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.15);
      o.connect(f);
      f.connect(g);
      g.connect(this.sfxBus);
      o.start(t + i * 0.16);
      o.stop(t + i * 0.16 + 0.2);
    }
  }

  /** Teeth chattering: brrr. */
  chatter() {
    if (!this.ok) return;
    for (let i = 0; i < 9; i++) {
      this.tone("square", 2400 + Math.random() * 400, 2200, 0.025, 0.05, i * 0.045);
      this.noise(0.015, 0.08, "highpass", 5000, 4000, i * 0.045, 1, 0.002);
    }
  }

  /** Something bounced off the metal umbrella. */
  ping() {
    if (!this.ok) return;
    const f = 1900 + Math.random() * 300;
    this.tone("sine", f, f * 0.995, 0.5, 0.25);
    this.tone("sine", f * 2.7, f * 2.69, 0.25, 0.1);
    this.noise(0.03, 0.2, "highpass", 4000, 3000);
  }

  /** Umbrella whipping open. */
  umbrella() {
    if (!this.ok) return;
    this.noise(0.14, 0.3, "bandpass", 600, 2600, 0, 1.5, 0.02);
    this.tone("square", 180, 160, 0.04, 0.12, 0.13);
  }

  /** Xylophone bones: the skeleton rattling around. */
  boneRattle() {
    if (!this.ok) return;
    const notes = [1046, 880, 1175, 784, 1318, 698, 1046];
    notes.forEach((f, i) => {
      this.tone("sine", f, f, 0.09, 0.14, i * 0.055);
      this.tone("sine", f * 3, f * 3, 0.03, 0.05, i * 0.055);
      this.noise(0.02, 0.15, "bandpass", 3000, 2500, i * 0.055, 2, 0.002);
    });
  }

  // ---------- music ----------

  startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextBeat = this.now() + 0.1;
    this.beat = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  setTense(t: boolean) {
    this.tense = t;
  }

  private scheduleMusic() {
    if (!this.ctx) return;
    const spb = 60 / 132 / 2; // eighth notes at 132 bpm
    // bouncy I - vi - IV - V in C, lowered a bit when the storm is close
    const prog = [
      [130.8, 164.8, 196.0],
      [110.0, 130.8, 164.8],
      [87.3, 110.0, 130.8],
      [98.0, 123.5, 146.8],
    ];
    while (this.nextBeat < this.now() + 0.2) {
      const t = this.nextBeat - this.now();
      const bar = Math.floor(this.beat / 8) % 4;
      const step = this.beat % 8;
      const chord = prog[this.tense ? (bar % 2) * 3 : bar]!;
      const root = chord[0]!;
      const o = this.musicBus;
      // bass: oom-pah
      if (step % 2 === 0) {
        const f = step % 4 === 0 ? root / 2 : chord[2]! / 2;
        this.tone("triangle", f, f * 0.98, spb * 1.6, 0.5, t, { out: o });
      }
      // plucky arpeggio
      if (step !== 3 && step !== 7) {
        const f = chord[(step * 2 + bar) % 3]! * (step > 4 ? 4 : 2);
        this.tone(this.tense ? "sawtooth" : "square", f, f, spb * 0.8, 0.12, t, { out: o });
      }
      // hats & snare
      this.noise(0.03, step % 2 ? 0.08 : 0.14, "highpass", 7000, 6000, t, 1, 0.002, o);
      if (step === 2 || step === 6) this.noise(0.12, 0.3, "bandpass", 1800, 900, t, 0.8, 0.002, o);
      if (this.tense && step === 0) this.tone("sawtooth", 55, 52, spb * 8, 0.25, t, { out: o });
      this.beat++;
      this.nextBeat += spb;
    }
  }

  dispose() {
    this.stopMusic();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }
}
