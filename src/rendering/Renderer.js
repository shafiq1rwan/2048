import * as THREE from 'three';
import { DESIGN } from '../core/config.js';
import { CameraShake } from './CameraShake.js';

/**
 * Three.js plumbing: an orthographic camera measured in design units.
 *
 * The camera is always scaled so a DESIGN.width x DESIGN.height box fits
 * and is centred; a wider or taller viewport simply reveals more
 * scenery. `stageRect` reports where that box landed in CSS pixels so
 * the DOM HUD can line up with the rendered board exactly.
 */
export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x4a7fb5, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Pixel art: no tone mapping, no colour grading, no smoothing.
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.camera.position.set(0, 0, 100);
    this.camera.lookAt(0, 0, 0);

    this.shake = new CameraShake(this.camera);

    /** @type {{x:number,y:number,width:number,height:number,scale:number}} */
    this.stageRect = { x: 0, y: 0, width: DESIGN.width, height: DESIGN.height, scale: 1 };
    /** @type {Array<(rect: typeof this.stageRect)=>void>} */
    this.resizeHandlers = [];

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    this.resize();
  }

  onResize(handler) {
    this.resizeHandlers.push(handler);
    handler(this.stageRect);
  }

  resize() {
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    const scale = Math.min(vw / DESIGN.width, vh / DESIGN.height);

    // Half-extents in world units that exactly cover the viewport.
    const halfW = vw / (2 * scale);
    const halfH = vh / (2 * scale);
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(vw, vh, false);

    const width = DESIGN.width * scale;
    const height = DESIGN.height * scale;
    this.stageRect = {
      x: (vw - width) / 2,
      y: (vh - height) / 2,
      width,
      height,
      scale,
    };
    this.viewport = { halfW, halfH };

    for (const handler of this.resizeHandlers) handler(this.stageRect);
  }

  /** World-space extents currently visible, for sizing backdrops. */
  get visible() {
    return {
      halfW: this.viewport?.halfW ?? DESIGN.width / 2,
      halfH: this.viewport?.halfH ?? DESIGN.height / 2,
    };
  }

  add(object) {
    this.scene.add(object);
    return object;
  }

  update(dt) {
    this.shake.update(dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.renderer.dispose();
  }
}
