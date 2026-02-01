import type { UIScreen } from '@/ui/UIManager';
import { EventBus } from '@/utils/EventBus';

/**
 * Event map for pause-menu events that other systems can subscribe to.
 */
export interface PauseMenuEvents {
  saveWorld: undefined;
}

/** Shared event bus for pause-menu actions. */
export const pauseMenuBus = new EventBus<PauseMenuEvents>();

/**
 * Pause menu screen displayed when the player presses Escape.
 *
 * Buttons:
 *  - Resume   -- closes the menu (pops screen)
 *  - Save World -- emits a `saveWorld` event on the pause-menu bus
 *  - Options  -- placeholder, does nothing yet
 *  - Quit     -- reloads the page
 */
export class PauseMenu implements UIScreen {
  element: HTMLElement;

  /** Callback invoked when "Resume" is pressed so the owner can pop us. */
  private onResume: (() => void) | null = null;

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'xc-pause-overlay';
    this.buildDOM();
    this.injectStyles();
  }

  // ---------------------------------------------------------------------------
  // UIScreen interface
  // ---------------------------------------------------------------------------

  show(): void {
    this.element.style.display = 'flex';
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  update(): void {
    // No per-frame logic needed.
  }

  // ---------------------------------------------------------------------------
  // Public helpers
  // ---------------------------------------------------------------------------

  /** Register a callback that is fired when the player clicks "Resume". */
  setResumeCallback(cb: () => void): void {
    this.onResume = cb;
  }

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  private buildDOM(): void {
    // Stop all clicks on the overlay from propagating to the canvas
    // underneath, which would otherwise trigger pointer lock requests.
    this.element.addEventListener('mousedown', (e) => e.stopPropagation());
    this.element.addEventListener('mouseup', (e) => e.stopPropagation());
    this.element.addEventListener('click', (e) => e.stopPropagation());

    const panel = document.createElement('div');
    panel.className = 'xc-pause-panel';

    // Title
    const title = document.createElement('div');
    title.className = 'xc-pause-title';
    title.textContent = 'Game Paused';
    panel.appendChild(title);

    // Buttons
    const buttons: { label: string; action: () => void }[] = [
      {
        label: 'Resume',
        action: () => {
          if (this.onResume) this.onResume();
        },
      },
      {
        label: 'Save World',
        action: () => {
          pauseMenuBus.emit('saveWorld', undefined as never);
        },
      },
      {
        label: 'Options',
        action: () => {
          // Placeholder -- not yet implemented.
        },
      },
      {
        label: 'Quit',
        action: () => {
          window.location.reload();
        },
      },
    ];

    for (const btn of buttons) {
      const el = document.createElement('button');
      el.className = 'xc-pause-btn';
      el.textContent = btn.label;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.action();
      });
      panel.appendChild(el);
    }

    this.element.appendChild(panel);
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = /* css */ `
      .xc-pause-overlay {
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.82);
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        z-index: 1100;
        font-family: 'Courier New', Courier, monospace;
      }

      .xc-pause-panel {
        background: #3a3a3a;
        border: 3px solid #222;
        padding: 24px 40px;
        min-width: 260px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        box-shadow: 4px 4px 0 rgba(0,0,0,0.5);
      }

      .xc-pause-title {
        color: #e0e0e0;
        font-size: 20px;
        font-weight: bold;
        margin-bottom: 10px;
        text-shadow: 2px 2px 0 #000;
      }

      .xc-pause-btn {
        display: block;
        width: 220px;
        padding: 8px 0;
        font-family: 'Courier New', Courier, monospace;
        font-size: 14px;
        color: #e0e0e0;
        text-align: center;
        cursor: pointer;
        border: 2px solid #555;

        /* Minecraft-style gradient */
        background: linear-gradient(to bottom, #7a7a7a 0%, #5a5a5a 40%, #4a4a4a 60%, #3a3a3a 100%);
        text-shadow: 1px 1px 0 #000;
      }

      .xc-pause-btn:hover {
        background: linear-gradient(to bottom, #8a8aaa 0%, #6a6a8a 40%, #5a5a7a 60%, #4a4a6a 100%);
        border-color: #888;
      }

      .xc-pause-btn:active {
        background: linear-gradient(to bottom, #3a3a3a 0%, #4a4a4a 40%, #5a5a5a 60%, #6a6a6a 100%);
      }
    `;
    document.head.appendChild(style);
  }
}
