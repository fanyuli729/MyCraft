import { HOTBAR_SIZE } from '@/utils/Constants';
import { itemRegistry } from '@/items/ItemRegistry';
import { generateItemIcon, ITEM_COLORS, DEFAULT_ITEM_COLOR } from '@/ui/ItemIconGenerator';
import type { Inventory } from '@/player/Inventory';

/**
 * 9-slot hotbar displayed at the bottom-center of the screen.
 *
 * Each slot is a 48x48px box.  The currently selected slot has a bright
 * highlight border.  Item icons are shown as pixel-art textures generated
 * via Canvas2D, and stack counts > 1 are rendered in the bottom-right corner.
 */
export class HotbarUI {
  private container!: HTMLElement;
  private slots: HTMLElement[] = [];

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Create all DOM nodes and append to the given root element. */
  init(root: HTMLElement): void {
    this.injectStyles();

    this.container = document.createElement('div');
    this.container.className = 'xc-hotbar';

    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'xc-hotbar-slot';

      // Item icon placeholder
      const icon = document.createElement('div');
      icon.className = 'xc-hotbar-icon';
      slot.appendChild(icon);

      // Durability bar
      const durBar = document.createElement('div');
      durBar.className = 'xc-hotbar-durability';
      durBar.style.display = 'none';
      slot.appendChild(durBar);

      // Stack count label
      const count = document.createElement('span');
      count.className = 'xc-hotbar-count';
      slot.appendChild(count);

      this.container.appendChild(slot);
      this.slots.push(slot);
    }

    root.appendChild(this.container);
  }

  /**
   * Refresh the hotbar to match the current inventory contents and
   * selected slot index.
   */
  update(inventory: Inventory, selectedSlot: number): void {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = this.slots[i];
      if (!slot) continue;

      const stack = inventory.getSlot(i);
      const icon = slot.querySelector<HTMLElement>('.xc-hotbar-icon')!;
      const countEl = slot.querySelector<HTMLElement>('.xc-hotbar-count')!;
      const durBar = slot.querySelector<HTMLElement>('.xc-hotbar-durability')!;

      // Selection highlight
      if (i === selectedSlot) {
        slot.classList.add('xc-hotbar-selected');
      } else {
        slot.classList.remove('xc-hotbar-selected');
      }

      if (stack && !stack.isEmpty()) {
        icon.style.display = 'block';
        icon.textContent = '';

        // Base colour as fallback; pixel art texture on top via backgroundImage
        const baseColor = ITEM_COLORS[stack.itemId] ?? DEFAULT_ITEM_COLOR;
        icon.style.backgroundColor = baseColor;

        try {
          const dataUri = generateItemIcon(stack.itemId);
          icon.style.backgroundImage = `url("${dataUri}")`;
          icon.style.backgroundSize = '100% 100%';
        } catch {
          icon.style.backgroundImage = '';
        }

        countEl.textContent = stack.count > 1 ? String(stack.count) : '';

        // Durability bar for tools
        const item = itemRegistry.getItem(stack.itemId);
        if (durBar && item && item.durability !== undefined && stack.durability !== undefined) {
          const maxDur = item.durability;
          const curDur = stack.durability;
          const ratio = curDur / maxDur;
          durBar.style.display = 'block';
          durBar.style.width = `${Math.round(ratio * 100)}%`;
          if (ratio > 0.5) {
            const g = Math.round(255 * (ratio - 0.5) * 2);
            durBar.style.backgroundColor = `rgb(${255 - g}, 255, 0)`;
          } else {
            const r = Math.round(255 * ratio * 2);
            durBar.style.backgroundColor = `rgb(255, ${r}, 0)`;
          }
        } else if (durBar) {
          durBar.style.display = 'none';
        }
      } else {
        icon.style.display = 'none';
        icon.style.backgroundImage = '';
        icon.textContent = '';
        countEl.textContent = '';
        if (durBar) durBar.style.display = 'none';
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  /** Inject a <style> element with hotbar CSS. */
  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = /* css */ `
      .xc-hotbar {
        position: absolute;
        bottom: 4px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 2px;
        padding: 2px;
        background: rgba(0, 0, 0, 0.55);
        border: 2px solid #222;
        pointer-events: none;
        image-rendering: pixelated;
      }

      .xc-hotbar-slot {
        position: relative;
        width: 48px;
        height: 48px;
        background: #8B8B8B;
        border-top: 2px solid #373737;
        border-left: 2px solid #373737;
        border-right: 2px solid #FFFFFF;
        border-bottom: 2px solid #FFFFFF;
        box-sizing: border-box;
      }

      .xc-hotbar-slot.xc-hotbar-selected {
        border-top-color: #FFFFFF;
        border-left-color: #FFFFFF;
        border-right-color: #555555;
        border-bottom-color: #555555;
        box-shadow: 0 0 0 1px #fff inset;
      }

      .xc-hotbar-icon {
        position: absolute;
        top: 6px;
        left: 6px;
        width: 32px;
        height: 32px;
        image-rendering: pixelated;
        background-size: 100% 100%;
      }

      .xc-hotbar-durability {
        position: absolute;
        bottom: 4px; left: 6px;
        height: 2px;
        max-width: 32px;
        pointer-events: none;
      }

      .xc-hotbar-count {
        position: absolute;
        bottom: 1px;
        right: 3px;
        color: #ffffff;
        font-size: 12px;
        font-family: 'Courier New', Courier, monospace;
        font-weight: bold;
        text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
        pointer-events: none;
        line-height: 1;
      }
    `;
    document.head.appendChild(style);
  }
}
