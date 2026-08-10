const KEY_DIRS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

/** Minimum pointer travel (CSS px) before a drag counts as a swipe. */
const SWIPE_THRESHOLD = 26;
/** Longest a swipe may take to still register. */
const SWIPE_TIMEOUT = 900;

/**
 * Keyboard (WASD + arrows) and touch swipe input.
 *
 * Emits intent only — it never touches game state, and it can be locked
 * while an animation or modal is in progress.
 */
export class InputManager {
  /**
   * @param {{onMove:(dir:string)=>void, onConfirm?:()=>void,
   *          onFirstInteraction?:()=>void}} handlers
   */
  constructor(handlers) {
    this.handlers = handlers;
    this.locked = false;
    this.hadInteraction = false;

    this.pointer = null;

    this._onKeyDown = this.onKeyDown.bind(this);
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onContextMenu = (event) => event.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('pointerdown', this._onPointerDown, { passive: true });
    window.addEventListener('pointermove', this._onPointerMove, { passive: false });
    window.addEventListener('pointerup', this._onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this._onPointerUp, { passive: true });
    window.addEventListener('contextmenu', this._onContextMenu);
  }

  lock() {
    this.locked = true;
  }

  unlock() {
    this.locked = false;
  }

  noteInteraction() {
    if (this.hadInteraction) return;
    this.hadInteraction = true;
    this.handlers.onFirstInteraction?.();
  }

  onKeyDown(event) {
    this.noteInteraction();

    const dir = KEY_DIRS[event.code];
    if (dir) {
      event.preventDefault();
      if (!this.locked) this.handlers.onMove?.(dir);
      return;
    }

    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      this.handlers.onConfirm?.();
    }
  }

  onPointerDown(event) {
    this.noteInteraction();
    // Let the DOM UI (buttons) handle its own clicks.
    if (event.target instanceof Element && event.target.closest('button, a, .panel')) {
      this.pointer = null;
      return;
    }
    this.pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      resolved: false,
    };
  }

  onPointerMove(event) {
    const pointer = this.pointer;
    if (!pointer || event.pointerId !== pointer.id || pointer.resolved) return;

    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
    if (event.cancelable) event.preventDefault();

    pointer.resolved = true;
    if (performance.now() - pointer.time > SWIPE_TIMEOUT) return;

    const dir =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (!this.locked) this.handlers.onMove?.(dir);
  }

  onPointerUp(event) {
    if (this.pointer && event.pointerId === this.pointer.id) this.pointer = null;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    window.removeEventListener('contextmenu', this._onContextMenu);
  }
}
