/**
 * UIScreen interface -- every UI screen (inventory, crafting, pause, etc.)
 * implements this contract so the UIManager can manage a uniform stack.
 */
export interface UIScreen {
  /** The root DOM element for this screen. */
  element: HTMLElement;

  /** Called when the screen is pushed onto the stack and should become visible. */
  show(): void;

  /** Called when the screen is removed from the stack. */
  hide(): void;

  /** Called every frame while the screen is the topmost (focused) screen. */
  update(): void;
}

/**
 * Manages a stack of UI screens rendered into the `#ui-root` overlay div.
 *
 * - When a screen is pushed, pointer lock is released so the player can
 *   interact with the UI via the mouse cursor.
 * - When all screens are popped, pointer lock is re-requested so normal
 *   first-person controls resume.
 */
export class UIManager {
  /** Stack of active screens. The last element is the topmost / focused screen. */
  screenStack: UIScreen[] = [];

  private root: HTMLElement;

  constructor() {
    const el = document.getElementById('ui-root');
    if (!el) {
      // Create the root if it does not exist yet.
      const created = document.createElement('div');
      created.id = 'ui-root';
      Object.assign(created.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '1000',
        fontFamily: "'Courier New', Courier, monospace",
      } as CSSStyleDeclaration);
      document.body.appendChild(created);
      this.root = created;
    } else {
      this.root = el;
      // Ensure baseline styles are applied.
      Object.assign(this.root.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '1000',
        fontFamily: "'Courier New', Courier, monospace",
      } as CSSStyleDeclaration);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Returns the `#ui-root` DOM element. */
  getRoot(): HTMLElement {
    return this.root;
  }

  /**
   * Push a screen onto the stack. The screen's element is appended to
   * `#ui-root`, its {@link UIScreen.show} method is called, and the
   * pointer lock is exited so the cursor becomes available.
   */
  pushScreen(screen: UIScreen): void {
    this.screenStack.push(screen);
    this.root.appendChild(screen.element);
    screen.show();

    // Release pointer lock so the player can interact with the UI.
    document.exitPointerLock();
  }

  /**
   * Pop the topmost screen off the stack. Its {@link UIScreen.hide} method
   * is called and its element is removed from the DOM.
   *
   * When the stack becomes empty, pointer lock is re-requested on the game
   * canvas so first-person controls resume.
   */
  popScreen(): void {
    const screen = this.screenStack.pop();
    if (screen) {
      screen.hide();
      if (screen.element.parentNode) {
        screen.element.parentNode.removeChild(screen.element);
      }
    }
    // Pointer lock is NOT re-requested here.  The player must click the
    // canvas to resume gameplay.  This prevents an ESC toggle-loop where
    // the browser's "exit pointer lock" and the game's "open pause menu"
    // events fight each other.
  }

  /** Returns `true` when at least one screen is open. */
  isScreenOpen(): boolean {
    return this.screenStack.length > 0;
  }

  /**
   * Per-frame update. Delegates to the topmost screen's `update()`.
   */
  update(): void {
    if (this.screenStack.length > 0) {
      this.screenStack[this.screenStack.length - 1].update();
    }
  }
}

/** Singleton instance used throughout the application. */
export const uiManager = new UIManager();
