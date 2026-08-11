/**
 * Sound hooks, synthesised with WebAudio.
 *
 * The Tiny Swords pack ships no audio, so rather than leave silent stubs
 * every hook plays a short procedural blip. `play(name)` is the only
 * entry point the game uses, so swapping in real samples later means
 * changing this file alone.
 */

/**
 * Per-character timbres. Each enemy family carries a `voice` key in
 * data/enemies.js; its entrance, pain, attack and death all speak in
 * this timbre so a sheep never sounds like a knight. Bosses play the
 * same voice pitched down.
 *
 *   base      fundamental pitch (Hz)
 *   type      oscillator waveform
 *   step      interval of the entrance call's second note
 *   noiseFreq colour of the accompanying noise burst
 *   clang     metallic ring (knights)
 *   pluck     short snappy envelope (archers)
 *   shimmer   airy highpass sparkle (mystics)
 */
export const VOICES = {
  beast: { base: 520, type: 'triangle', step: 1.19, noiseFreq: 700 },
  goblin: { base: 320, type: 'sawtooth', step: 1.33, noiseFreq: 1700 },
  knight: { base: 200, type: 'square', step: 0.75, noiseFreq: 3400, clang: true },
  archer: { base: 470, type: 'triangle', step: 1.5, noiseFreq: 2500, pluck: true },
  mystic: { base: 660, type: 'sine', step: 1.25, noiseFreq: 5200, shimmer: true },
};

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
   *        |'enemySpawn'|'enemyAttack'|'enemyDeath'|'bossSpawn'
   *        |'playerHit'|'block'|'levelUp'|'combo'|'bomb'|'freeze'
   *        |'gold'|'coin'|'buy'|'deny'|'victory'|'gameOver'|'start'} name
   * @param {{level?: number, voice?: string, boss?: boolean,
   *          index?: number, step?: number}} [opts]
   */
  play(name, opts = {}) {
    if (!this.ready) return;
    const level = opts.level ?? 1;
    // Which character family is speaking, pitched down for bosses.
    const voice = VOICES[opts.voice] ?? VOICES.goblin;
    const pitch = opts.boss ? 0.62 : 1;

    switch (name) {
      case 'slide':
        this.noise({ duration: 0.07, gain: 0.05, filterFreq: 2400, sweepTo: 700 });
        break;

      case 'spawn':
        this.tone({ freq: 660, type: 'triangle', duration: 0.07, gain: 0.06 });
        break;

      case 'merge': {
        // rising pitch with merge level so bigger merges sound bigger,
        // and a timbre that follows the unit ladder: soft footmen,
        // plucked archer, metallic lancers
        const base = 300 * Math.pow(1.14, Math.min(level, 12));
        if (level <= 2) {
          this.tone({ freq: base, type: 'triangle', duration: 0.09, gain: 0.11 });
          this.tone({ freq: base * 1.5, type: 'triangle', duration: 0.14, gain: 0.1, delay: 0.045 });
        } else if (level === 3) {
          // bow twang
          this.tone({ freq: base * 1.7, type: 'triangle', duration: 0.05, gain: 0.12, slideTo: base * 1.15 });
          this.tone({ freq: base, type: 'square', duration: 0.1, gain: 0.08, delay: 0.03 });
        } else {
          // armoured clang
          this.tone({ freq: base, type: 'square', duration: 0.09, gain: 0.11 });
          this.tone({ freq: base * 1.5, type: 'triangle', duration: 0.14, gain: 0.1, delay: 0.045 });
          this.noise({ duration: 0.08, gain: 0.06, filterFreq: 3600, type: 'bandpass', delay: 0.02 });
        }
        break;
      }

      case 'invalid':
        this.tone({ freq: 150, type: 'sawtooth', duration: 0.09, gain: 0.07, slideTo: 100 });
        break;

      case 'attack':
        this.noise({ duration: 0.14, gain: 0.12, filterFreq: 3200, sweepTo: 500, type: 'bandpass' });
        break;

      case 'enemyHit': {
        // pain blip in the character's own timbre over the thud
        const f = voice.base * pitch;
        this.noise({ duration: 0.13, gain: 0.16, filterFreq: voice.noiseFreq, sweepTo: 160 });
        this.tone({
          freq: f * 1.35,
          type: voice.type,
          duration: voice.pluck ? 0.06 : 0.1,
          gain: 0.11,
          slideTo: f * 0.75,
        });
        if (voice.clang) {
          this.noise({ duration: 0.09, gain: 0.07, filterFreq: 3800, type: 'bandpass' });
        }
        if (voice.shimmer) {
          this.noise({ duration: 0.14, gain: 0.05, filterFreq: 5200, type: 'highpass' });
        }
        break;
      }

      case 'enemySpawn': {
        // a two-note entrance call so each family announces itself
        const f = voice.base * pitch;
        this.tone({ freq: f, type: voice.type, duration: 0.11, gain: 0.09 });
        this.tone({
          freq: f * voice.step,
          type: voice.type,
          duration: voice.pluck ? 0.08 : 0.16,
          gain: 0.08,
          delay: 0.09,
        });
        if (voice.clang) {
          this.noise({ duration: 0.12, gain: 0.05, filterFreq: 3400, type: 'bandpass', delay: 0.04 });
        }
        if (voice.shimmer) {
          this.noise({ duration: 0.22, gain: 0.04, filterFreq: 6000, type: 'highpass' });
        }
        break;
      }

      case 'enemyAttack': {
        // battle grunt on the wind-up, before the impact lands
        const f = voice.base * pitch;
        this.tone({ freq: f * 0.8, type: voice.type, duration: 0.12, gain: 0.09, slideTo: f * 1.1 });
        this.noise({ duration: 0.12, gain: 0.06, filterFreq: voice.noiseFreq, sweepTo: 500, type: 'bandpass' });
        break;
      }

      case 'crit': {
        this.noise({ duration: 0.2, gain: 0.2, filterFreq: 1600, sweepTo: 180 });
        this.tone({ freq: 880, type: 'square', duration: 0.09, gain: 0.11 });
        this.tone({ freq: 1320, type: 'square', duration: 0.13, gain: 0.09, delay: 0.06 });
        // the victim's own yelp under the fanfare
        const f = voice.base * pitch;
        this.tone({ freq: f * 1.6, type: voice.type, duration: 0.12, gain: 0.09, slideTo: f * 0.6, delay: 0.05 });
        break;
      }

      case 'enemyDeath': {
        // falling death cry in the character's timbre over the rumble
        const f = voice.base * pitch;
        this.noise({ duration: 0.4, gain: 0.19, filterFreq: 1400, sweepTo: 90 });
        this.tone({ freq: f * 1.1, type: voice.type, duration: 0.3, gain: 0.1, slideTo: f * 0.35 });
        this.tone({
          freq: f * 0.7,
          type: voice.type,
          duration: 0.22,
          gain: 0.07,
          slideTo: f * 0.28,
          delay: 0.1,
        });
        if (voice.shimmer) {
          this.noise({ duration: 0.35, gain: 0.05, filterFreq: 5600, type: 'highpass', delay: 0.05 });
        }
        break;
      }

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

      case 'volley':
        // a flight of arrows whistling down, one after another
        [0, 0.06, 0.13, 0.19, 0.26].forEach((delay) => {
          this.tone({
            freq: 1900 - delay * 1400,
            type: 'triangle',
            duration: 0.18,
            gain: 0.045,
            slideTo: 700,
            delay,
          });
        });
        this.noise({ duration: 0.3, gain: 0.05, filterFreq: 5200, type: 'highpass' });
        break;

      case 'flames':
        // rolling fire: low whoosh with crackle on top
        this.noise({ duration: 0.55, gain: 0.16, filterFreq: 900, sweepTo: 260 });
        this.tone({ freq: 120, type: 'sawtooth', duration: 0.4, gain: 0.07, slideTo: 70 });
        [0.06, 0.16, 0.28, 0.4].forEach((delay) => {
          this.noise({ duration: 0.05, gain: 0.07, filterFreq: 2600, type: 'bandpass', delay });
        });
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
