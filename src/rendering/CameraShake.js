import { SHAKE } from '../core/config.js';

/**
 * Decaying positional camera shake. Several hits in a row stack up to a
 * capped intensity rather than restarting, so a chain of merges builds.
 *
 * Magnitudes come from SHAKE in core/config.js — including a global
 * `scale` that can turn shake down or off.
 */
export class CameraShake {
  /** @param {import('three').Camera} camera */
  constructor(camera) {
    this.camera = camera;
    this.baseX = camera.position.x;
    this.baseY = camera.position.y;
    this.intensity = 0;
    this.decay = 6;
    this.phase = Math.random() * 100;
  }

  /**
   * @param {number} amount displacement in design units, before SHAKE.scale
   * @param {number} [decay] higher decays faster
   */
  add(amount, decay = 6) {
    const scaled = amount * SHAKE.scale;
    if (scaled <= 0) return;
    this.intensity = Math.min(SHAKE.max * SHAKE.scale, this.intensity + scaled);
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
    // Frame-rate independent decay, plus a small linear term so it
    // actually reaches zero instead of trailing off forever.
    this.intensity = Math.max(0, i * Math.exp(-this.decay * dt) - 0.5 * dt);
  }

  reset() {
    this.intensity = 0;
    this.camera.position.x = this.baseX;
    this.camera.position.y = this.baseY;
  }
}
