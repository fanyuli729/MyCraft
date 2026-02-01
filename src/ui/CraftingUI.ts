import { INVENTORY_SIZE, HOTBAR_SIZE } from '@/utils/Constants';
import { ItemStack } from '@/items/ItemStack';
import { itemRegistry } from '@/items/ItemRegistry';
import type { Inventory } from '@/player/Inventory';
import type { UIScreen } from '@/ui/UIManager';
import { recipeRegistry } from '@/crafting/RecipeRegistry';

// ---------------------------------------------------------------------------
// Item colour map
// ---------------------------------------------------------------------------

const ITEM_COLORS: Record<number, string> = {
  1:  '#808080', 2:  '#8B6914', 3:  '#5b8731', 4:  '#e2cc7f',
  5:  '#3355dd', 6:  '#6b4c2a', 7:  '#2e6b1a', 8:  '#d4c9a3',
  9:  '#3a7a26', 10: '#4a3520', 11: '#1a4a2a', 12: '#333333',
  13: '#b08050', 14: '#f0d060', 15: '#40e0e0', 16: '#444444',
  17: '#888080', 18: '#707070', 19: '#b09060', 20: '#7a5c34',
  21: '#606060', 22: '#c8e8f8', 23: '#ffc800', 24: '#3a8a2a',
  25: '#ff3030', 26: '#fff030', 27: '#2a7a2a', 28: '#f0f0f0',
  29: '#a0d0f0', 30: '#d4c490',
};
const DEFAULT_ITEM_COLOR = '#8844aa';

/**
 * Crafting table screen -- opened by right-clicking a crafting table block.
 *
 * Identical to the InventoryUI except the crafting grid is **3x3** instead
 * of 2x2, which enables all crafting recipes.
 */
export class CraftingUI implements UIScreen {
  element: HTMLElement;

  private cursorStack: ItemStack = ItemStack.EMPTY;
  private cursorElement!: HTMLElement;

  private slotElements: HTMLElement[] = [];

  /** 3x3 crafting grid slot elements (0-8, left->right, top->bottom). */
  private craftSlotElements: HTMLElement[] = [];
  private craftGrid: (ItemStack | null)[] = new Array(9).fill(null);
  private outputSlotElement!: HTMLElement;
  private outputStack: ItemStack = ItemStack.EMPTY;

  private tooltipElement!: HTMLElement;
  private inventory!: Inventory;

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'xc-craft-overlay';
    this.buildDOM();
    this.injectStyles();
    this.bindEvents();
  }

  // ---------------------------------------------------------------------------
  // UIScreen interface
  // ---------------------------------------------------------------------------

  show(): void {
    this.element.style.display = 'flex';
    this.cursorStack = ItemStack.EMPTY;
    this.updateCursorDisplay();
  }

  hide(): void {
    this.element.style.display = 'none';
    if (!this.cursorStack.isEmpty() && this.inventory) {
      this.returnCursorToInventory();
    }
    this.clearCraftingGrid();
    this.cursorStack = ItemStack.EMPTY;
    this.updateCursorDisplay();
  }

  update(): void {
    this.refreshSlots();
    this.refreshCraftOutput();
  }

  // ---------------------------------------------------------------------------
  // Public helpers
  // ---------------------------------------------------------------------------

  setInventory(inv: Inventory): void {
    this.inventory = inv;
  }

  // ---------------------------------------------------------------------------
  // DOM construction
  // ---------------------------------------------------------------------------

  private buildDOM(): void {
    const panel = document.createElement('div');
    panel.className = 'xc-craft-panel';

    // Title
    const title = document.createElement('div');
    title.className = 'xc-craft-title';
    title.textContent = 'Crafting';
    panel.appendChild(title);

    // -- Crafting area (3x3 + arrow + output) --
    const craftArea = document.createElement('div');
    craftArea.className = 'xc-craft-area';

    const craftGridEl = document.createElement('div');
    craftGridEl.className = 'xc-craft-grid-3x3';
    for (let i = 0; i < 9; i++) {
      const slot = this.createSlotElement();
      slot.dataset.craftIndex = String(i);
      this.craftSlotElements.push(slot);
      craftGridEl.appendChild(slot);
    }
    craftArea.appendChild(craftGridEl);

    // Arrow
    const arrow = document.createElement('div');
    arrow.className = 'xc-craft-arrow';
    arrow.textContent = '\u21D2'; // big right arrow
    craftArea.appendChild(arrow);

    // Output slot
    this.outputSlotElement = this.createSlotElement();
    this.outputSlotElement.classList.add('xc-craft-output-slot');
    craftArea.appendChild(this.outputSlotElement);

    panel.appendChild(craftArea);

    // -- Main inventory grid (slots 9-35) --
    const mainLabel = document.createElement('div');
    mainLabel.className = 'xc-craft-section-label';
    mainLabel.textContent = 'Inventory';
    panel.appendChild(mainLabel);

    const mainGrid = document.createElement('div');
    mainGrid.className = 'xc-craft-inv-grid';
    for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) {
      const slot = this.createSlotElement();
      slot.dataset.slotIndex = String(i);
      this.slotElements[i] = slot;
      mainGrid.appendChild(slot);
    }
    panel.appendChild(mainGrid);

    // -- Hotbar row (slots 0-8) --
    const hotbarLabel = document.createElement('div');
    hotbarLabel.className = 'xc-craft-section-label';
    hotbarLabel.textContent = 'Hotbar';
    panel.appendChild(hotbarLabel);

    const hotbarGrid = document.createElement('div');
    hotbarGrid.className = 'xc-craft-inv-grid';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = this.createSlotElement();
      slot.dataset.slotIndex = String(i);
      this.slotElements[i] = slot;
      hotbarGrid.appendChild(slot);
    }
    panel.appendChild(hotbarGrid);

    // Tooltip
    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'xc-craft-tooltip';
    this.tooltipElement.style.display = 'none';
    this.element.appendChild(this.tooltipElement);

    // Cursor
    this.cursorElement = document.createElement('div');
    this.cursorElement.className = 'xc-craft-cursor';
    this.cursorElement.style.display = 'none';
    this.element.appendChild(this.cursorElement);

    this.element.appendChild(panel);
  }

  private createSlotElement(): HTMLElement {
    const slot = document.createElement('div');
    slot.className = 'xc-craft-slot';

    const icon = document.createElement('div');
    icon.className = 'xc-craft-slot-icon';
    slot.appendChild(icon);

    const count = document.createElement('span');
    count.className = 'xc-craft-slot-count';
    slot.appendChild(count);

    return slot;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  private bindEvents(): void {
    this.element.addEventListener('mousemove', (e) => {
      this.cursorElement.style.left = `${e.clientX + 8}px`;
      this.cursorElement.style.top = `${e.clientY + 8}px`;

      const target = (e.target as HTMLElement).closest<HTMLElement>('.xc-craft-slot');
      if (target) {
        this.showTooltip(target, e.clientX, e.clientY);
      } else {
        this.tooltipElement.style.display = 'none';
      }
    });

    this.element.addEventListener('contextmenu', (e) => e.preventDefault());

    this.element.addEventListener('mousedown', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.xc-craft-slot');
      if (!target) return;

      if (target.dataset.craftIndex !== undefined) {
        this.handleCraftSlotClick(parseInt(target.dataset.craftIndex, 10), e.button, e.shiftKey);
        return;
      }

      if (target.classList.contains('xc-craft-output-slot')) {
        this.handleOutputClick();
        return;
      }

      if (target.dataset.slotIndex !== undefined) {
        this.handleInvClick(parseInt(target.dataset.slotIndex, 10), e.button, e.shiftKey);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Inventory slot interaction (mirrors InventoryUI logic)
  // ---------------------------------------------------------------------------

  private handleInvClick(slotIndex: number, button: number, shiftKey: boolean): void {
    if (!this.inventory) return;

    const slotStack = this.inventory.getSlot(slotIndex);

    if (shiftKey && button === 0) {
      if (slotStack && !slotStack.isEmpty()) {
        if (slotIndex < HOTBAR_SIZE) {
          this.quickTransfer(slotIndex, HOTBAR_SIZE, INVENTORY_SIZE);
        } else {
          this.quickTransfer(slotIndex, 0, HOTBAR_SIZE);
        }
      }
      this.refreshSlots();
      return;
    }

    if (button === 0) {
      if (this.cursorStack.isEmpty()) {
        if (slotStack && !slotStack.isEmpty()) {
          this.cursorStack = slotStack.clone();
          this.inventory.setSlot(slotIndex, ItemStack.EMPTY);
        }
      } else {
        if (!slotStack || slotStack.isEmpty()) {
          this.inventory.setSlot(slotIndex, this.cursorStack.clone());
          this.cursorStack = ItemStack.EMPTY;
        } else if (this.cursorStack.canStackWith(slotStack)) {
          const leftover = slotStack.merge(this.cursorStack);
          this.inventory.setSlot(slotIndex, slotStack);
          this.cursorStack.count = leftover;
          if (leftover <= 0) this.cursorStack = ItemStack.EMPTY;
        } else {
          const temp = slotStack.clone();
          this.inventory.setSlot(slotIndex, this.cursorStack.clone());
          this.cursorStack = temp;
        }
      }
    }

    if (button === 2) {
      if (!this.cursorStack.isEmpty()) {
        if (!slotStack || slotStack.isEmpty()) {
          const single = this.cursorStack.split(1);
          this.inventory.setSlot(slotIndex, single);
          if (this.cursorStack.count <= 0) this.cursorStack = ItemStack.EMPTY;
        } else if (this.cursorStack.canStackWith(slotStack)) {
          const item = itemRegistry.getItem(slotStack.itemId);
          const max = item ? item.stackSize : 64;
          if (slotStack.count < max) {
            slotStack.count += 1;
            this.cursorStack.count -= 1;
            this.inventory.setSlot(slotIndex, slotStack);
            if (this.cursorStack.count <= 0) this.cursorStack = ItemStack.EMPTY;
          }
        }
      } else {
        if (slotStack && !slotStack.isEmpty()) {
          const half = Math.ceil(slotStack.count / 2);
          this.cursorStack = slotStack.split(half);
          if (slotStack.count <= 0) {
            this.inventory.setSlot(slotIndex, ItemStack.EMPTY);
          } else {
            this.inventory.setSlot(slotIndex, slotStack);
          }
        }
      }
    }

    this.refreshSlots();
    this.updateCursorDisplay();
  }

  // ---------------------------------------------------------------------------
  // Crafting slot interaction
  // ---------------------------------------------------------------------------

  private handleCraftSlotClick(index: number, button: number, _shiftKey: boolean): void {
    const current = this.craftGrid[index];

    if (button === 0) {
      if (this.cursorStack.isEmpty()) {
        if (current && !current.isEmpty()) {
          this.cursorStack = current.clone();
          this.craftGrid[index] = null;
        }
      } else {
        if (!current || current.isEmpty()) {
          this.craftGrid[index] = this.cursorStack.clone();
          this.cursorStack = ItemStack.EMPTY;
        } else if (this.cursorStack.canStackWith(current)) {
          const leftover = current.merge(this.cursorStack);
          this.craftGrid[index] = current;
          this.cursorStack.count = leftover;
          if (leftover <= 0) this.cursorStack = ItemStack.EMPTY;
        } else {
          const temp = current.clone();
          this.craftGrid[index] = this.cursorStack.clone();
          this.cursorStack = temp;
        }
      }
    }

    if (button === 2) {
      if (!this.cursorStack.isEmpty()) {
        if (!current || current.isEmpty()) {
          const single = this.cursorStack.split(1);
          this.craftGrid[index] = single;
          if (this.cursorStack.count <= 0) this.cursorStack = ItemStack.EMPTY;
        } else if (this.cursorStack.canStackWith(current)) {
          const item = itemRegistry.getItem(current.itemId);
          const max = item ? item.stackSize : 64;
          if (current.count < max) {
            current.count += 1;
            this.cursorStack.count -= 1;
            this.craftGrid[index] = current;
            if (this.cursorStack.count <= 0) this.cursorStack = ItemStack.EMPTY;
          }
        }
      } else {
        if (current && !current.isEmpty()) {
          const half = Math.ceil(current.count / 2);
          this.cursorStack = current.split(half);
          if (current.count <= 0) {
            this.craftGrid[index] = null;
          }
        }
      }
    }

    this.refreshCraftSlots();
    this.refreshCraftOutput();
    this.updateCursorDisplay();
  }

  private handleOutputClick(): void {
    if (this.outputStack.isEmpty()) return;

    if (this.cursorStack.isEmpty()) {
      this.cursorStack = this.outputStack.clone();
    } else if (this.cursorStack.canStackWith(this.outputStack)) {
      const item = itemRegistry.getItem(this.cursorStack.itemId);
      const max = item ? item.stackSize : 64;
      if (this.cursorStack.count + this.outputStack.count <= max) {
        this.cursorStack.count += this.outputStack.count;
      } else {
        return;
      }
    } else {
      return;
    }

    // Consume one of each ingredient.
    for (let i = 0; i < 9; i++) {
      const stack = this.craftGrid[i];
      if (stack && !stack.isEmpty()) {
        stack.count -= 1;
        if (stack.count <= 0) {
          this.craftGrid[i] = null;
        }
      }
    }

    this.outputStack = ItemStack.EMPTY;
    this.refreshCraftSlots();
    this.refreshCraftOutput();
    this.updateCursorDisplay();
  }

  // ---------------------------------------------------------------------------
  // Crafting output resolution
  // ---------------------------------------------------------------------------

  private refreshCraftOutput(): void {
    const gridIds: number[][] = [
      [this.gid(0), this.gid(1), this.gid(2)],
      [this.gid(3), this.gid(4), this.gid(5)],
      [this.gid(6), this.gid(7), this.gid(8)],
    ];

    const result = recipeRegistry.findMatch(gridIds);
    if (result) {
      this.outputStack = new ItemStack(result.itemId, result.count);
    } else {
      this.outputStack = ItemStack.EMPTY;
    }

    this.renderSlotContent(this.outputSlotElement, this.outputStack);
  }

  private gid(index: number): number {
    const s = this.craftGrid[index];
    return s && !s.isEmpty() ? s.itemId : 0;
  }

  private clearCraftingGrid(): void {
    for (let i = 0; i < 9; i++) {
      const stack = this.craftGrid[i];
      if (stack && !stack.isEmpty() && this.inventory) {
        this.addToInventory(stack);
      }
      this.craftGrid[i] = null;
    }
    this.refreshCraftSlots();
  }

  private refreshCraftSlots(): void {
    for (let i = 0; i < 9; i++) {
      const stack = this.craftGrid[i];
      this.renderSlotContent(this.craftSlotElements[i], stack ?? ItemStack.EMPTY);
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------------

  private refreshSlots(): void {
    if (!this.inventory) return;
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const el = this.slotElements[i];
      if (!el) continue;
      const stack = this.inventory.getSlot(i);
      this.renderSlotContent(el, stack ?? ItemStack.EMPTY);
    }
    this.refreshCraftSlots();
    this.refreshCraftOutput();
  }

  private renderSlotContent(slotEl: HTMLElement, stack: ItemStack): void {
    const icon = slotEl.querySelector<HTMLElement>('.xc-craft-slot-icon')!;
    const countEl = slotEl.querySelector<HTMLElement>('.xc-craft-slot-count')!;

    if (!stack || stack.isEmpty()) {
      icon.style.display = 'none';
      icon.textContent = '';
      countEl.textContent = '';
    } else {
      icon.style.display = 'block';
      icon.style.backgroundColor = ITEM_COLORS[stack.itemId] ?? DEFAULT_ITEM_COLOR;
      countEl.textContent = stack.count > 1 ? String(stack.count) : '';

      const item = itemRegistry.getItem(stack.itemId);
      if (item && item.toolType && item.toolType !== 'none') {
        icon.textContent = this.toolSymbol(item.toolType);
      } else {
        icon.textContent = '';
      }
    }
  }

  private updateCursorDisplay(): void {
    if (this.cursorStack.isEmpty()) {
      this.cursorElement.style.display = 'none';
      return;
    }
    this.cursorElement.style.display = 'block';
    const color = ITEM_COLORS[this.cursorStack.itemId] ?? DEFAULT_ITEM_COLOR;
    this.cursorElement.style.backgroundColor = color;
    this.cursorElement.textContent = this.cursorStack.count > 1
      ? String(this.cursorStack.count)
      : '';
  }

  private showTooltip(slotEl: HTMLElement, mx: number, my: number): void {
    let stack: ItemStack | null = null;

    if (slotEl.dataset.slotIndex !== undefined) {
      stack = this.inventory?.getSlot(parseInt(slotEl.dataset.slotIndex, 10)) ?? null;
    } else if (slotEl.dataset.craftIndex !== undefined) {
      stack = this.craftGrid[parseInt(slotEl.dataset.craftIndex, 10)] ?? null;
    } else if (slotEl.classList.contains('xc-craft-output-slot')) {
      stack = this.outputStack;
    }

    if (!stack || stack.isEmpty()) {
      this.tooltipElement.style.display = 'none';
      return;
    }

    const item = itemRegistry.getItem(stack.itemId);
    this.tooltipElement.textContent = item ? item.name : `Item #${stack.itemId}`;
    this.tooltipElement.style.display = 'block';
    this.tooltipElement.style.left = `${mx + 14}px`;
    this.tooltipElement.style.top = `${my - 28}px`;
  }

  // ---------------------------------------------------------------------------
  // Inventory helpers
  // ---------------------------------------------------------------------------

  private quickTransfer(fromSlot: number, rangeStart: number, rangeEnd: number): void {
    const stack = this.inventory.getSlot(fromSlot);
    if (!stack || stack.isEmpty()) return;

    for (let i = rangeStart; i < rangeEnd; i++) {
      const target = this.inventory.getSlot(i);
      if (target && !target.isEmpty() && target.canStackWith(stack)) {
        const leftover = target.merge(stack);
        this.inventory.setSlot(i, target);
        if (leftover <= 0) {
          this.inventory.setSlot(fromSlot, ItemStack.EMPTY);
          return;
        }
        stack.count = leftover;
      }
    }

    for (let i = rangeStart; i < rangeEnd; i++) {
      const target = this.inventory.getSlot(i);
      if (!target || target.isEmpty()) {
        this.inventory.setSlot(i, stack.clone());
        this.inventory.setSlot(fromSlot, ItemStack.EMPTY);
        return;
      }
    }
  }

  private returnCursorToInventory(): void {
    if (!this.inventory || this.cursorStack.isEmpty()) return;
    this.addToInventory(this.cursorStack);
    this.cursorStack = ItemStack.EMPTY;
  }

  private addToInventory(stack: ItemStack): void {
    if (!this.inventory) return;

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const target = this.inventory.getSlot(i);
      if (target && !target.isEmpty() && target.canStackWith(stack)) {
        const leftover = target.merge(stack);
        this.inventory.setSlot(i, target);
        if (leftover <= 0) return;
        stack.count = leftover;
      }
    }

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const target = this.inventory.getSlot(i);
      if (!target || target.isEmpty()) {
        this.inventory.setSlot(i, stack.clone());
        return;
      }
    }
  }

  private toolSymbol(toolType: string): string {
    switch (toolType) {
      case 'pickaxe': return '\u26CF';
      case 'axe':     return '\u2692';
      case 'shovel':  return '\u2692';
      case 'sword':   return '\u2694';
      default:        return '';
    }
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = /* css */ `
      .xc-craft-overlay {
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.65);
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        z-index: 1100;
        font-family: 'Courier New', Courier, monospace;
      }

      .xc-craft-panel {
        background: #555;
        border: 3px solid #222;
        padding: 12px;
        min-width: 400px;
        box-shadow: 4px 4px 0 rgba(0,0,0,0.4);
      }

      .xc-craft-title {
        color: #e0e0e0;
        font-size: 14px;
        margin-bottom: 10px;
        text-align: center;
      }

      .xc-craft-area {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-bottom: 14px;
        padding: 10px;
        background: #4a4a4a;
        border: 1px solid #333;
      }

      .xc-craft-grid-3x3 {
        display: grid;
        grid-template-columns: repeat(3, 40px);
        grid-template-rows: repeat(3, 40px);
        gap: 2px;
      }

      .xc-craft-arrow {
        font-size: 32px;
        color: #aaa;
        padding: 0 8px;
        user-select: none;
      }

      .xc-craft-output-slot {
        border-color: #aa8833 !important;
      }

      .xc-craft-inv-grid {
        display: grid;
        grid-template-columns: repeat(9, 40px);
        gap: 2px;
        margin-bottom: 6px;
        justify-content: center;
      }

      .xc-craft-section-label {
        color: #999;
        font-size: 10px;
        margin-bottom: 3px;
        text-align: left;
        padding-left: 4px;
      }

      .xc-craft-slot {
        position: relative;
        width: 40px;
        height: 40px;
        background: #C6C6C6;
        border: 2px solid #8B8B8B;
        box-sizing: border-box;
        cursor: pointer;
      }
      .xc-craft-slot:hover {
        border-color: #fff;
      }

      .xc-craft-slot-icon {
        position: absolute;
        top: 4px; left: 4px;
        width: 28px; height: 28px;
        image-rendering: pixelated;
        font-size: 14px;
        line-height: 28px;
        text-align: center;
        color: #fff;
        pointer-events: none;
      }

      .xc-craft-slot-count {
        position: absolute;
        bottom: 1px; right: 2px;
        color: #fff;
        font-size: 11px;
        font-weight: bold;
        text-shadow: 1px 1px 0 #000;
        pointer-events: none;
        line-height: 1;
      }

      .xc-craft-tooltip {
        position: fixed;
        background: #1a0a30;
        color: #e0e0e0;
        border: 1px solid #6020a0;
        padding: 3px 8px;
        font-size: 12px;
        font-family: 'Courier New', Courier, monospace;
        pointer-events: none;
        white-space: nowrap;
        z-index: 1200;
      }

      .xc-craft-cursor {
        position: fixed;
        width: 28px; height: 28px;
        pointer-events: none;
        z-index: 1300;
        image-rendering: pixelated;
        color: #fff;
        font-size: 11px;
        font-weight: bold;
        text-align: right;
        line-height: 28px;
        text-shadow: 1px 1px 0 #000;
        font-family: 'Courier New', Courier, monospace;
      }
    `;
    document.head.appendChild(style);
  }
}
