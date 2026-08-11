/**
 * Background music, synthesised like everything else — the pack ships
 * no audio, so the score is a WebAudio chiptune sequencer with two
 * hand-written themes: a gentle field loop and a driving boss loop.
 *
 * Notes are scheduled with the standard look-ahead pattern (a coarse
 * JS timer books events a beat ahead on the audio clock), so timing
 * stays sample-accurate even when the tab hiccups. Rides the
 * SoundManager's AudioContext, which exists after the first user
 * gesture; volume is a separate gain with its own mute flag.
 */

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

/**
 * Track format: arrays of [step, midiNote, lengthInSteps] per voice
 * (16 steps per bar), drums as [step, kind]. Patterns loop at `length`.
 */
const THEMES = {
  /** D minor, easy-going — Dm | Dm | Bb | Bb | F | F | C | C */
  field: {
    bpm: 100,
    length: 128,
    leadType: 'square',
    leadGain: 0.045,
    bassType: 'triangle',
    bassGain: 0.075,
    arpType: 'triangle',
    arpGain: 0.028,
    bass: (() => {
      const roots = [38, 38, 34, 34, 41, 41, 36, 36]; // D2 D2 Bb1 Bb1 F2 F2 C2 C2
      const out = [];
      roots.forEach((root, bar) => {
        const b = bar * 16;
        out.push([b, root, 6], [b + 6, root, 2], [b + 8, root + 7, 4], [b + 12, root, 4]);
      });
      return out;
    })(),
    lead: [
      // bars 1-2 (Dm)
      [0, 74, 4], [4, 77, 2], [6, 76, 2], [8, 74, 4], [12, 69, 4],
      [16, 77, 4], [20, 76, 2], [22, 74, 2], [24, 76, 8],
      // bars 3-4 (Bb)
      [32, 74, 4], [36, 77, 4], [40, 77, 4], [44, 79, 4],
      [48, 81, 6], [54, 79, 2], [56, 77, 4], [60, 74, 4],
      // bars 5-6 (F)
      [64, 72, 4], [68, 77, 4], [72, 81, 6], [78, 79, 2],
      [80, 77, 4], [84, 76, 2], [86, 77, 2], [88, 79, 8],
      // bars 7-8 (C)
      [96, 76, 4], [100, 79, 4], [104, 81, 4], [108, 79, 2], [110, 76, 2],
      [112, 74, 12],
    ],
    arp: (() => {
      // chord tones an octave under the lead, soft eighth notes
      const chords = [
        [62, 65, 69], [62, 65, 69], // Dm
        [58, 62, 65], [58, 62, 65], // Bb
        [53, 57, 60], [53, 57, 60], // F
        [60, 64, 67], [60, 64, 67], // C
      ];
      const out = [];
      chords.forEach((chord, bar) => {
        const b = bar * 16;
        [0, 2, 4, 6, 8, 10, 12, 14].forEach((step, i) => {
          out.push([b + step, chord[[0, 1, 2, 1][i % 4]], 2]);
        });
      });
      return out;
    })(),
    drums: (() => {
      const out = [];
      for (let bar = 0; bar < 8; bar++) {
        const b = bar * 16;
        out.push([b, 'kick'], [b + 8, 'snare']);
        [2, 6, 10, 14].forEach((s) => out.push([b + s, 'hat']));
      }
      return out;
    })(),
  },

  /** D minor, urgent — Dm | Dm | Gm | A */
  boss: {
    bpm: 124,
    length: 64,
    leadType: 'square',
    leadGain: 0.05,
    bassType: 'square',
    bassGain: 0.06,
    arpType: 'triangle',
    arpGain: 0.026,
    bass: (() => {
      const roots = [38, 38, 43, 45]; // D2 D2 G2 A2
      const out = [];
      roots.forEach((root, bar) => {
        const b = bar * 16;
        // driving eighths with an octave kick on the back half
        [0, 2, 4, 6, 8, 10, 12].forEach((s) => out.push([b + s, root, 2]));
        out.push([b + 14, root + 12, 2]);
      });
      return out;
    })(),
    lead: [
      [0, 69, 3], [4, 74, 3], [8, 77, 3], [12, 76, 2], [14, 74, 2],
      [16, 69, 3], [20, 74, 3], [24, 76, 6], [30, 74, 2],
      [32, 67, 3], [36, 70, 3], [40, 74, 6], [46, 72, 2],
      [48, 69, 3], [52, 73, 3], [56, 76, 4], [60, 73, 4],
    ],
    arp: (() => {
      const chords = [
        [62, 65, 69], [62, 65, 69], // Dm
        [55, 58, 62], // Gm
        [57, 61, 64], // A
      ];
      const out = [];
      chords.forEach((chord, bar) => {
        const b = bar * 16;
        [1, 3, 5, 7, 9, 11, 13, 15].forEach((step, i) => {
          out.push([b + step, chord[[2, 1, 0, 1][i % 4]] + 12, 1]);
        });
      });
      return out;
    })(),
    drums: (() => {
      const out = [];
      for (let bar = 0; bar < 4; bar++) {
        const b = bar * 16;
        [0, 4, 8, 12].forEach((s) => out.push([b + s, 'kick']));
        out.push([b + 8, 'snare']);
        [2, 6, 10, 14].forEach((s) => out.push([b + s, 'hat']));
      }
      return out;
    })(),
  },
};

export class Music {
  /** @param {import('./SoundManager.js').SoundManager} sound */
  constructor(sound, { muted = false } = {}) {
    this.sound = sound;
    this.muted = muted;
    this.gain = null;
    this.themeName = null;
    this.timer = 0;
    this.pos = 0;
    this.nextNoteTime = 0;
    /** Notes booked since start — handy for tests. */
    this.scheduled = 0;
  }

  /** Lazily builds the output chain once the shared context exists. */
  ensureGraph() {
    const ctx = this.sound.ctx;
    if (!ctx) return false;
    if (!this.gain) {
      this.gain = ctx.createGain();
      this.gain.gain.value = this.muted ? 0 : 1;
      this.gain.connect(ctx.destination);
    }
    return true;
  }

  /** @param {'field'|'boss'} name */
  start(name) {
    if (!THEMES[name] || !this.ensureGraph()) return;
    if (this.themeName === name && this.timer) return;
    this.stop();
    this.themeName = name;
    this.pos = 0;
    this.nextNoteTime = this.sound.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.tick(), 90);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    this.themeName = null;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.gain) {
      this.gain.gain.setTargetAtTime(muted ? 0 : 1, this.sound.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  get playing() {
    return Boolean(this.timer);
  }

  tick() {
    const ctx = this.sound.ctx;
    const theme = THEMES[this.themeName];
    if (!ctx || !theme) return;
    const stepDur = 60 / theme.bpm / 4;
    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      this.scheduleStep(theme, this.pos, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.pos = (this.pos + 1) % theme.length;
    }
  }

  scheduleStep(theme, step, time, stepDur) {
    for (const [s, note, len] of theme.bass) {
      if (s === step) this.note(midi(note), time, len * stepDur, theme.bassType, theme.bassGain);
    }
    for (const [s, note, len] of theme.lead) {
      if (s === step) this.note(midi(note), time, len * stepDur, theme.leadType, theme.leadGain);
    }
    for (const [s, note, len] of theme.arp) {
      if (s === step) this.note(midi(note), time, len * stepDur, theme.arpType, theme.arpGain);
    }
    for (const [s, kind] of theme.drums) {
      if (s === step) this.drum(kind, time);
    }
  }

  note(freq, time, duration, type, gain) {
    const ctx = this.sound.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(gain, time + 0.015);
    // hold most of the note, release into the tail
    env.gain.setValueAtTime(gain, time + Math.max(0.02, duration * 0.7));
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(env);
    env.connect(this.gain);
    osc.start(time);
    osc.stop(time + duration + 0.05);
    this.scheduled++;
  }

  drum(kind, time) {
    const ctx = this.sound.ctx;
    if (kind === 'kick') {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.1);
      env.gain.setValueAtTime(0.11, time);
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
      osc.connect(env);
      env.connect(this.gain);
      osc.start(time);
      osc.stop(time + 0.15);
    } else {
      // hat / snare: filtered noise from the SoundManager's buffer
      if (!this.sound.noiseBuffer) return;
      const src = ctx.createBufferSource();
      src.buffer = this.sound.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = kind === 'hat' ? 'highpass' : 'bandpass';
      filter.frequency.value = kind === 'hat' ? 7000 : 1800;
      const env = ctx.createGain();
      const gain = kind === 'hat' ? 0.02 : 0.045;
      const dur = kind === 'hat' ? 0.03 : 0.09;
      env.gain.setValueAtTime(gain, time);
      env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      src.connect(filter);
      filter.connect(env);
      env.connect(this.gain);
      src.start(time);
      src.stop(time + dur + 0.02);
    }
    this.scheduled++;
  }
}
