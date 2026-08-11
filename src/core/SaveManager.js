const KEY = 'merge-knights.save.v1';

const DEFAULTS = {
  bestScore: 0,
  highestFloor: 0,
  highestUnit: 0,
  mostBosses: 0,
  mostEnemies: 0,
  muted: false,
  musicMuted: false,
};

/**
 * Persists records to localStorage. Every read is defensive: a private
 * browsing context or corrupted entry must not break the game.
 */
export class SaveManager {
  constructor() {
    this.data = { ...DEFAULTS };
    this.available = true;
    this.load();
  }

  load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const key of Object.keys(DEFAULTS)) {
            const value = parsed[key];
            if (typeof value === typeof DEFAULTS[key]) this.data[key] = value;
          }
        }
      }
    } catch (err) {
      this.available = false;
      console.warn('[SaveManager] localStorage unavailable, records will not persist.', err);
    }
  }

  save() {
    if (!this.available) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (err) {
      this.available = false;
      console.warn('[SaveManager] could not write records.', err);
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  /**
   * Merge an end-of-run summary into the stored records.
   * @returns {{newRecord: boolean, previousBest: number}}
   */
  submitRun({ score, floor, highestUnit, bosses, enemies }) {
    const previousBest = this.data.bestScore;
    const newRecord = score > previousBest;
    this.data.bestScore = Math.max(previousBest, score);
    this.data.highestFloor = Math.max(this.data.highestFloor, floor);
    this.data.highestUnit = Math.max(this.data.highestUnit, highestUnit);
    this.data.mostBosses = Math.max(this.data.mostBosses, bosses);
    this.data.mostEnemies = Math.max(this.data.mostEnemies, enemies);
    this.save();
    return { newRecord, previousBest };
  }
}
