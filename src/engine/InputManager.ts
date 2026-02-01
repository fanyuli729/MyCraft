/**
 * Singleton input manager that tracks keyboard state, mouse movement,
 * mouse buttons, scroll wheel, and pointer lock.
 *
 * Call {@link init} once with the game canvas, then call {@link update}
 * at the end of every frame to reset per-frame deltas.
 */
export class InputManager {
  // -----------------------------------------------------------------------
  // Keyboard state
  // -----------------------------------------------------------------------

  /** Keys currently held down. */
  private keysDown: Map<string, boolean> = new Map();

  /** Keys that transitioned to "down" this frame. */
  private keysPressed: Map<string, boolean> = new Map();

  /** Keys that transitioned to "up" this frame. */
  private keysReleased: Map<string, boolean> = new Map();

  // -----------------------------------------------------------------------
  // Mouse state
  // -----------------------------------------------------------------------

  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private mouseButtons: Map<number, boolean> = new Map();
  private mouseButtonsPressed: Map<number, boolean> = new Map();
  private mouseButtonsReleased: Map<number, boolean> = new Map();

  /** Accumulated scroll delta since last frame (positive = scroll up). */
  private _scrollDelta = 0;

  /** Whether the pointer is currently locked. */
  private _pointerLocked = false;

  private canvas: HTMLCanvasElement | null = null;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initialise the input manager and bind all event listeners to the
   * provided canvas and its owning document.
   */
  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;

    // -- Keyboard --
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);

    // -- Mouse --
    document.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);

    // -- Scroll --
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    // -- Prevent default context menu so right-click always works --
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // -- Pointer lock --
    canvas.addEventListener('click', this.requestPointerLock);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  /**
   * Must be called at the **end** of every frame to clear per-frame
   * deltas and pressed/released maps.
   */
  update(): void {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.mouseButtonsPressed.clear();
    this.mouseButtonsReleased.clear();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this._scrollDelta = 0;
  }

  /**
   * Remove all event listeners. Call when the game is disposed.
   */
  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);

    if (this.canvas) {
      this.canvas.removeEventListener('wheel', this.onWheel);
      this.canvas.removeEventListener('click', this.requestPointerLock);
    }
  }

  // -----------------------------------------------------------------------
  // Public query methods
  // -----------------------------------------------------------------------

  /** True while the key is held down. */
  isKeyDown(key: string): boolean {
    return this.keysDown.get(key.toLowerCase()) === true;
  }

  /** True only on the frame the key was first pressed. */
  isKeyPressed(key: string): boolean {
    return this.keysPressed.get(key.toLowerCase()) === true;
  }

  /** True only on the frame the key was released. */
  isKeyReleased(key: string): boolean {
    return this.keysReleased.get(key.toLowerCase()) === true;
  }

  /** Return the accumulated mouse movement since last frame. */
  getMouseDelta(): { x: number; y: number } {
    return { x: this.mouseDeltaX, y: this.mouseDeltaY };
  }

  /** True while the given mouse button is held. 0 = left, 1 = middle, 2 = right. */
  isMouseDown(button: number): boolean {
    return this.mouseButtons.get(button) === true;
  }

  /** True only on the frame the mouse button was first pressed. */
  isMousePressed(button: number): boolean {
    return this.mouseButtonsPressed.get(button) === true;
  }

  /** True only on the frame the mouse button was released. */
  isMouseReleased(button: number): boolean {
    return this.mouseButtonsReleased.get(button) === true;
  }

  /** Scroll delta accumulated this frame. Positive = scroll up. */
  get scrollDelta(): number {
    return this._scrollDelta;
  }

  /** Whether the pointer is currently locked to the canvas. */
  get pointerLocked(): boolean {
    return this._pointerLocked;
  }

  // -----------------------------------------------------------------------
  // Event handlers (arrow functions to preserve `this`)
  // -----------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    if (!this.keysDown.get(key)) {
      this.keysPressed.set(key, true);
    }
    this.keysDown.set(key, true);

    // Prevent default browser actions for game keys while pointer is locked.
    if (this._pointerLocked) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    this.keysDown.set(key, false);
    this.keysReleased.set(key, true);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this._pointerLocked) return;
    this.mouseDeltaX += e.movementX;
    this.mouseDeltaY += e.movementY;
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this._pointerLocked) return;
    this.mouseButtons.set(e.button, true);
    this.mouseButtonsPressed.set(e.button, true);
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.mouseButtons.set(e.button, false);
    this.mouseButtonsReleased.set(e.button, true);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // Normalise so that a "click" of a normal mouse wheel is roughly +-1.
    this._scrollDelta += -Math.sign(e.deltaY);
  };

  private requestPointerLock = (): void => {
    // Don't request pointer lock if a UI screen is open (checked via a
    // DOM heuristic: #ui-root has children beyond the always-present HUD/hotbar
    // elements). The UIManager will re-request lock when all screens close.
    if (this._suppressPointerLock) return;
    this.canvas?.requestPointerLock();
  };

  /**
   * When true, canvas clicks will not request pointer lock.
   * Set this from the game loop when UI screens are open.
   */
  private _suppressPointerLock = false;

  set suppressPointerLock(value: boolean) {
    this._suppressPointerLock = value;
  }

  private onPointerLockChange = (): void => {
    this._pointerLocked = document.pointerLockElement === this.canvas;
  };
}

/** Singleton instance used throughout the application. */
export const inputManager = new InputManager();
