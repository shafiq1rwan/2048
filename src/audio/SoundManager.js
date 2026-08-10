/**
 * Sound hooks, synthesised with WebAudio.
 *
 * The Tiny Swords pack ships no audio, so rather than leave silent stubs
 * every hook plays a short procedural blip. `play(name)` is the only
 * entry point the game uses, so swapping in real samples later means
 * changing this file alone.
 */
export class SoundManager {
  constructor({ muted = false } = {}) {
    this.muted = muted;
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.failed = false;
  }

  /** Must be called from a user gesture or the context stays suspended. */
  unlock() {
    if (this.ctx || this.failed) {
      this.ctx?.resume?.();
      return;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) throw new Error('WebAudio unavailable');
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise();
      this.ctx.resume?.();
    } catch (err) {
      this.failed = true;
      console.warn('[SoundManager] audio disabled:', err);
    }
  }

  makeNoise() {
    const length = Math.floor(this.ctx.sampleRate * 0.5);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  get ready() {
    return Boolean(this.ctx && this.master && !this.muted);
  }

  // ---------------------------------------------------------------- //
  // primitives
  // ---------------------------------------------------------------- //

  /** One enveloped oscillator note. */
  tone({ freq, type = 'square', duration = 0.12, gain = 0.14, slideTo = null, delay = 0, attack = 0.005 }) {
    if (!this.ready) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);

    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(gain, now + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(env);
    env.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** Filtered noise burst — whooshes, impacts, explosions. */
  noise({ duration = 0.18, gain = 0.16, filterFreq = 1200, sweepTo = null, type = 'lowpass', delay = 0 }) {
    if (!this.ready) return;
    const now = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(filterFreq, now);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), now + duration);
    filter.Q.value = 1.1;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  // ---------------------------------------------------------------- //
  // game hooks
  // ---------------------------------------------------------------- //

  /**
   * @param {'merge'|'slide'|'spawn'|'invalid'|'attack'|'enemyHit'|'crit'
   *        |'enemyDeath'|'bossSpawn'|'playerHit'|'block'|'levelUp'
   *        |'gold'|'buy'|'deny'|'victory'|'gameOver'|'start'} name
   * @param {{level?: number}} [opts]
   */
  play(name, opts = {}) {
    if (!this.ready) return;
    const level = opts.level ?? 1;

    switch (name) {
      case 'slide':
        this.noise({ duration: 0.07, gain: 0.05, filterFreq: 2400, sweepTo: 700 });
        break;

      case 'spawn':
        this.tone({ freq: 660, type: 'triangle', duration: 0.07, gain: 0.06 });
        break;

      case 'merge': {
        // rising pitch with merge level so bigger merges sound bigger
        const base = 300 * Math.pow(1.14, Math.min(level, 12));
        this.tone({ freq: base, type: 'square', duration: 0.09, gain: 0.11 });
        this.tone({ freq: base * 1.5, type: 'triangle', duration: 0.14, gain: 0.1, delay: 0.045 });
        break;
      }

      case 'invalid':
        this.tone({ freq: 150, type: 'sawtooth', duration: 0.09, gain: 0.07, slideTo: 100 });
        break;

      case 'attack':
        this.noise({ duration: 0.14, gain: 0.12, filterFreq: 3200, sweepTo: 500, type: 'bandpass' });
        break;

      case 'enemyHit':
        this.noise({ duration: 0.13, gain: 0.17, filterFreq: 900, sweepTo: 160 });
        this.tone({ freq: 190, type: 'square', duration: 0.09, gain: 0.1, slideTo: 90 });
        break;

      case 'crit':
        this.noise({ duration: 0.2, gain: 0.2, filterFreq: 1600, sweepTo: 180 });
        this.tone({ freq: 880, type: 'square', duration: 0.09, gain: 0.11 });
        this.tone({ freq: 1320, type: 'square', duration: 0.13, gain: 0.09, delay: 0.06 });
        break;

      case 'enemyDeath':
        this.noise({ duration: 0.4, gain: 0.19, filterFreq: 1400, sweepTo: 90 });
        this.tone({ freq: 420, type: 'triangle', duration: 0.32, gain: 0.1, slideTo: 110 });
        break;

      case 'bossSpawn':
        this.tone({ freq: 90, type: 'sawtooth', duration: 0.7, gain: 0.15, slideTo: 55 });
        this.noise({ duration: 0.55, gain: 0.16, filterFreq: 500, sweepTo: 70 });
        break;

      case 'playerHit':
        this.noise({ duration: 0.24, gain: 0.2, filterFreq: 700, sweepTo: 110 });
        this.tone({ freq: 130, type: 'sawtooth', duration: 0.2, gain: 0.11, slideTo: 70 });
        break;

      case 'block':
        this.tone({ freq: 1180, type: 'square', duration: 0.07, gain: 0.1 });
        this.tone({ freq: 1560, type: 'triangle', duration: 0.11, gain: 0.08, delay: 0.03 });
        this.noise({ duration: 0.1, gain: 0.08, filterFreq: 4200, type: 'highpass' });
        break;

      case 'levelUp':
        [523, 659, 784, 1047].forEach((freq, i) => {
          this.tone({ freq, type: 'triangle', duration: 0.2, gain: 0.11, delay: i * 0.075 });
        });
        break;

      case 'gold':
        this.tone({ freq: 1046, type: 'triangle', duration: 0.08, gain: 0.1 });
        this.tone({ freq: 1568, type: 'triangle', duration: 0.12, gain: 0.08, delay: 0.055 });
        break;

      case 'coin': {
        // One quiet tick per coin landing, climbing in pitch so a stream
        // of them reads as a run rather than a smear.
        const step = Math.min(opts.index ?? 0, 11);
        this.tone({
          freq: 1150 + step * 65,
          type: 'triangle',
          duration: 0.05,
          gain: 0.045,
        });
        break;
      }

      case 'combo': {
        // quick rising two-note sting, higher for deeper chains
        const base = 620 + (opts.step ?? 3) * 60;
        this.tone({ freq: base, type: 'square', duration: 0.06, gain: 0.09 });
        this.tone({ freq: base * 1.34, type: 'square', duration: 0.09, gain: 0.09, delay: 0.05 });
        break;
      }

      case 'bomb':
        // fuse whistle down into a thump
        this.tone({ freq: 1400, type: 'triangle', duration: 0.4, gain: 0.06, slideTo: 500 });
        this.noise({ duration: 0.3, gain: 0.18, filterFreq: 480, sweepTo: 70, delay: 0.42 });
        this.tone({ freq: 95, type: 'sawtooth', duration: 0.22, gain: 0.12, slideTo: 55, delay: 0.42 });
        break;

      case 'freeze':
        // glassy descending shimmer
        [1760, 1320, 990].forEach((freq, i) => {
          this.tone({ freq, type: 'triangle', duration: 0.16, gain: 0.07, delay: i * 0.07 });
        });
        this.noise({ duration: 0.24, gain: 0.05, filterFreq: 5200, type: 'highpass', delay: 0.05 });
        break;

      case 'buy':
        this.tone({ freq: 784, type: 'square', duration: 0.08, gain: 0.1 });
        this.tone({ freq: 1175, type: 'square', duration: 0.12, gain: 0.08, delay: 0.06 });
        break;

      case 'deny':
        this.tone({ freq: 220, type: 'square', duration: 0.1, gain: 0.09, slideTo: 160 });
        break;

      case 'victory':
        [659, 784, 988].forEach((freq, i) => {
          this.tone({ freq, type: 'triangle', duration: 0.18, gain: 0.1, delay: i * 0.06 });
        });
        break;

      case 'start':
        [392, 523, 659, 784].forEach((freq, i) => {
          this.tone({ freq, type: 'square', duration: 0.14, gain: 0.09, delay: i * 0.06 });
        });
        break;

      case 'gameOver':
        [523, 440, 349, 262].forEach((freq, i) => {
          this.tone({ freq, type: 'triangle', duration: 0.4, gain: 0.11, delay: i * 0.17 });
        });
        this.noise({ duration: 0.9, gain: 0.07, filterFreq: 600, sweepTo: 80, delay: 0.1 });
        break;

      default:
        break;
    }
  }
}
