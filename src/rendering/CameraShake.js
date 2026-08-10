/**
 * Decaying positional camera shake. Several hits in a row stack up to a
 * capped intensity rather than restarting, so a chain of merges builds.
 */
export class CameraShake {
  /** @param {import('three').Camera} camera */
  constructor(camera) {
    this.camera = camera;
    this.baseX = camera.position.x;
    this.baseY = camera.position.y;
    this.intensity = 0;
    this.decay = 6;
    this.max = 26;
    this.phase = Math.random() * 100;
  }

  /**
   * @param {number} amount world units of displacement
   * @param {number} [decay] higher decays faster
   */
  add(amount, decay = 6) {
    this.intensity = Math.min(this.max, this.intensity + amount);
    this.decay = decay;
  }

  update(dt) {
    if (this.intensity <= 0.01) {
      if (this.camera.position.x !== this.baseX || this.camera.position.y !== this.baseY) {
        this.camera.position.x = this.baseX;
        this.camera.position.y = this.baseY;
      }
      this.intensity = 0;
      return;
    }

    this.phase += dt * 42;
    const i = this.intensity;
    // Two out-of-phase sines read as a sharp rattle without random jitter.
    this.camera.position.x = this.baseX + Math.sin(this.phase * 1.7) * i;
    this.camera.position.y = this.baseY + Math.sin(this.phase * 2.3 + 1.1) * i * 0.75;
    this.intensity = Math.max(0, i - i * this.decay * dt - 0.4 * dt * 60 * dt);
  }

  reset() {
    this.intensity = 0;
    this.camera.position.x = this.baseX;
    this.camera.position.y = this.baseY;
  }
}
