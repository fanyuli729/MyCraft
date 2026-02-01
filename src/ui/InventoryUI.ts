import { INVENTORY_SIZE, HOTBAR_SIZE } from '@/utils/Constants';
import { ItemStack } from '@/items/ItemStack';
import { itemRegistry } from '@/items/ItemRegistry';
import type { Inventory } from '@/player/Inventory';
import type { UIScreen } from '@/ui/UIManager';
import { recipeRegistry } from '@/crafting/RecipeRegistry';
import { generateItemIcon, ITEM_COLORS, DEFAULT_ITEM_COLOR } from '@/ui/ItemIconGenerator';

/**
 * Full inventory screen.
 *
 * Layout (top -> bottom):
 *  - 2x2 crafting grid  + arrow + output slot  (top-right area)
 *  - 3 rows of 9 columns (main inventory, slots 9-35)
 *  - 1 row of 9 columns  (hotbar, slots 0-8)
 *
 * Interaction:
 *  - Left-click a slot to pick up / swap the cursor item.
 *  - Right-click a non-empty cursor to place a single item.
 *  - Shift-click to quick-transfer between hotbar <-> main inventory.
 */
export class InventoryUI implements UIScreen {
  element: HTMLElement;

  /** The stack currently held on the cursor (floating with mouse). */
  private cursorStack: ItemStack = ItemStack.EMPTY;
  private cursorElement!: HTMLElement;

  /** References to the 36 inventory slot DOM elements. */
  private slotElements: HTMLElement[] = [];

  /** 2x2 crafting grid slot elements (indices 0-3 left-to-right, top-to-bottom). */
  private craftSlotElements: HTMLElement[] = [];
  private craftGrid: (ItemStack | null)[] = [null, null, null, null];
  private outputSlotElement!: HTMLElement;
  private outputStack: ItemStack = ItemStack.EMPTY;

  private tooltipElement!: HTMLElement;

  private inventory!: Inventory;

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'xc-inv-overlay';
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
    // Drop cursor item back into first available slot.
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

  /** Assign the live inventory reference so we can read / write slots. */
  setInventory(inv: Inventory): void {
    this.inventory = inv;
  }

  /**
   * Handle a click on an inventory slot (called internally by event handler).
   * `button` 0 = left, 2 = right.
   */
  handleClick(slotIndex: number, button: number, shiftKey: boolean): void {
    if (!this.inventory) return;

    const slotStack = this.inventory.getSlot(slotIndex);

    // ----- Shift-click: quick-transfer -----
    if (shiftKey && button === 0) {
      if (slotStack && !slotStack.isEmpty()) {
        if (slotIndex < HOTBAR_SIZE) {
          // Move from hotbar to main inventory (9-35).
          this.quickTransfer(slotIndex, HOTBAR_SIZE, INVENTORY_SIZE);
        } else {
          // Move from main to hotbar (0-8).
          this.quickTransfer(slotIndex, 0, HOTBAR_SIZE);
        }
      }
      this.refreshSlots();
      return;
    }

    // ----- Left-click: pick up / place / swap -----
    if (button === 0) {
      if (this.cursorStack.isEmpty()) {
        // Pick up from slot.
        if (slotStack && !slotStack.isEmpty()) {
          this.cursorStack = slotStack.clone();
          this.inventory.setSlot(slotIndex, ItemStack.EMPTY);
        }
      } else {
        if (!slotStack || slotStack.isEmpty()) {
          // Place cursor into empty slot.
          this.inventory.setSlot(slotIndex, this.cursorStack.clone());
          this.cursorStack = ItemStack.EMPTY;
        } else if (this.cursorStack.canStackWith(slotStack)) {
          // Merge cursor into slot.
          const leftover = slotStack.merge(this.cursorStack);
          this.inventory.setSlot(slotIndex, slotStack);
          if (leftover <= 0) {
            this.cursorStack = ItemStack.EMPTY;
          } else {
            this.cursorStack.count = leftover;
          }
        } else {
          // Swap cursor and slot.
          const temp = slotStack.clone();
          this.inventory.setSlot(slotIndex, this.cursorStack.clone());
          this.cursorStack = temp;
        }
      }
    }

    // ----- Right-click: place single item -----
    if (button === 2) {
      if (!this.cursorStack.isEmpty()) {
        if (!slotStack || slotStack.isEmpty()) {
          const single = this.cursorStack.split(1);
          this.inventory.setSlot(slotIndex, single);
        } else if (this.cursorStack.canStackWith(slotStack)) {
          const item = itemRegistry.getItem(slotStack.itemId);
          const max = item ? item.stackSize : 64;
          if (slotStack.count < max) {
            slotStack.count += 1;
            this.cursorStack.count -= 1;
            this.inventory.setSlot(slotIndex, slotStack);
            if (this.cursorStack.count <= 0) {
              this.cursorStack = ItemStack.EMPTY;
            }
          }
        }
      } else {
        // Right-click with empty cursor: pick up half.
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
  // DOM construction
  // ---------------------------------------------------------------------------

  private buildDOM(): void {
    // Panel wrapper (centered card)
    const panel = document.createElement('div');
    panel.className = 'xc-inv-panel';

    // -- Title --
    const title = document.createElement('div');
    title.className = 'xc-inv-title';
    title.textContent = 'Crafting';
    panel.appendChild(title);

    // -- Crafting area --
    const craftArea = document.createElement('div');
    craftArea.className = 'xc-inv-craft-area';

    const craftGridEl = document.createElement('div');
    craftGridEl.className = 'xc-inv-craft-grid xc-inv-craft-2x2';
    for (let i = 0; i < 4; i++) {
      const slot = this.createSlotElement();
      slot.dataset.craftIndex = String(i);
      this.craftSlotElements.push(slot);
      craftGridEl.appendChild(slot);
    }
    craftArea.appendChild(craftGridEl);

    // Arrow
    const arrow = document.createElement('div');
    arrow.className = 'xc-inv-arrow';
    arrow.textContent = '\u2192'; // right arrow
    craftArea.appendChild(arrow);

    // Output slot
    this.outputSlotElement = this.createSlotElement();
    this.outputSlotElement.classList.add('xc-inv-output-slot');
    craftArea.appendChild(this.outputSlotElement);

    panel.appendChild(craftArea);

    // -- Separator --
    const sep1 = document.createElement('div');
    sep1.className = 'xc-inv-separator';
    panel.appendChild(sep1);

    // -- Main inventory grid (slots 9-35 = 3 rows of 9) --
    const mainLabel = document.createElement('div');
    mainLabel.className = 'xc-inv-section-label';
    mainLabel.textContent = 'Inventory';
    panel.appendChild(mainLabel);

    const mainGrid = document.createElement('div');
    mainGrid.className = 'xc-inv-grid';
    for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) {
      const slot = this.createSlotElement();
      slot.dataset.slotIndex = String(i);
      this.slotElements[i] = slot;
      mainGrid.appendChild(slot);
    }
    panel.appendChild(mainGrid);

    // -- Separator between main inventory and hotbar --
    const sep2 = document.createElement('div');
    sep2.className = 'xc-inv-separator';
    panel.appendChild(sep2);

    // -- Hotbar row (slots 0-8) --
    const hotbarLabel = document.createElement('div');
    hotbarLabel.className = 'xc-inv-section-label';
    hotbarLabel.textContent = 'Hotbar';
    panel.appendChild(hotbarLabel);

    const hotbarGrid = document.createElement('div');
    hotbarGrid.className = 'xc-inv-grid';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = this.createSlotElement();
      slot.dataset.slotIndex = String(i);
      this.slotElements[i] = slot;
      hotbarGrid.appendChild(slot);
    }
    panel.appendChild(hotbarGrid);

    // -- Tooltip --
    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'xc-inv-tooltip';
    this.tooltipElement.style.display = 'none';
    this.element.appendChild(this.tooltipElement);

    // -- Cursor floating item --
    this.cursorElement = document.createElement('div');
    this.cursorElement.className = 'xc-inv-cursor';
    this.cursorElement.style.display = 'none';
    this.element.appendChild(this.cursorElement);

    this.element.appendChild(panel);
  }

  /** Create a generic slot div with beveled border, icon, durability bar & count children. */
  private createSlotElement(): HTMLElement {
    const slot = document.createElement('div');
    slot.className = 'xc-inv-slot';

    const icon = document.createElement('div');
    icon.className = 'xc-inv-slot-icon';
    slot.appendChild(icon);

    const durBar = document.createElement('div');
    durBar.className = 'xc-inv-slot-durability';
    durBar.style.display = 'none';
    slot.appendChild(durBar);

    const count = document.createElement('span');
    count.className = 'xc-inv-slot-count';
    slot.appendChild(count);

    return slot;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  private bindEvents(): void {
    // Track mouse for cursor element
    this.element.addEventListener('mousemove', (e) => {
      this.cursorElement.style.left = `${e.clientX + 8}px`;
      this.cursorElement.style.top = `${e.clientY + 8}px`;

      // Tooltip
      const target = (e.target as HTMLElement).closest<HTMLElement>('.xc-inv-slot');
      if (target) {
        this.showTooltip(target, e.clientX, e.clientY);
      } else {
        this.tooltipElement.style.display = 'none';
      }
    });

    // Prevent context menu
    this.element.addEventListener('contextmenu', (e) => e.preventDefault());

    // Click on inventory slot
    this.element.addEventListener('mousedown', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.xc-inv-slot');
      if (!target) return;

      // Check if it's a crafting slot
      if (target.dataset.craftIndex !== undefined) {
        this.handleCraftSlotClick(parseInt(target.dataset.craftIndex, 10), e.button, e.shiftKey);
        return;
      }

      // Check if it's the output slot
      if (target.classList.contains('xc-inv-output-slot')) {
        this.handleOutputClick();
        return;
      }

      // Regular inventory slot
      if (target.dataset.slotIndex !== undefined) {
        this.handleClick(parseInt(target.dataset.slotIndex, 10), e.button, e.shiftKey);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Crafting interaction
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
          if (leftover <= 0) {
            this.cursorStack = ItemStack.EMPTY;
          } else {
            this.cursorStack.count = leftover;
          }
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
          } else {
            this.craftGrid[index] = current;
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
        return; // Cannot fit
      }
    } else {
      return; // Different items
    }

    // Consume one of each ingredient in the crafting grid
    for (let i = 0; i < 4; i++) {
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

  private refreshCraftOutput(): void {
    // Build a grid representation for the recipe registry.
    // For 2x2 we pass a 2x2 array of itemIds.
    const gridIds: number[][] = [
      [this.getGridItemId(0), this.getGridItemId(1)],
      [this.getGridItemId(2), this.getGridItemId(3)],
    ];

    const result = recipeRegistry.findMatch(gridIds);
    if (result) {
      this.outputStack = new ItemStack(result.itemId, result.count);
    } else {
      this.outputStack = ItemStack.EMPTY;
    }

    this.renderSlotContent(this.outputSlotElement, this.outputStack);
  }

  private getGridItemId(index: number): number {
    const s = this.craftGrid[index];
    return s && !s.isEmpty() ? s.itemId : 0;
  }

  private clearCraftingGrid(): void {
    // Return crafting grid items to inventory.
    for (let i = 0; i < 4; i++) {
      const stack = this.craftGrid[i];
      if (stack && !stack.isEmpty() && this.inventory) {
        this.addToInventory(stack);
      }
      this.craftGrid[i] = null;
    }
    this.refreshCraftSlots();
  }

  private refreshCraftSlots(): void {
    for (let i = 0; i < 4; i++) {
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
    const icon = slotEl.querySelector<HTMLElement>('.xc-inv-slot-icon')!;
    const countEl = slotEl.querySelector<HTMLElement>('.xc-inv-slot-count')!;
    const durBar = slotEl.querySelector<HTMLElement>('.xc-inv-slot-durability')!;

    if (!stack || stack.isEmpty()) {
      icon.style.display = 'none';
      icon.style.backgroundImage = '';
      icon.textContent = '';
      countEl.textContent = '';
      if (durBar) durBar.style.display = 'none';
    } else {
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
        // Green -> yellow -> red
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
    }
  }

  private updateCursorDisplay(): void {
    if (this.cursorStack.isEmpty()) {
      this.cursorElement.style.display = 'none';
      return;
    }
    this.cursorElement.style.display = 'block';

    // Base colour as fallback; pixel art texture on top
    const baseColor = ITEM_COLORS[this.cursorStack.itemId] ?? DEFAULT_ITEM_COLOR;
    this.cursorElement.style.backgroundColor = baseColor;

    try {
      const dataUri = generateItemIcon(this.cursorStack.itemId);
      this.cursorElement.style.backgroundImage = `url("${dataUri}")`;
      this.cursorElement.style.backgroundSize = '100% 100%';
    } catch {
      this.cursorElement.style.backgroundImage = '';
    }

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
    } else if (slotEl.classList.contains('xc-inv-output-slot')) {
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

    // First try to merge into an existing matching stack.
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

    // Then try to place into an empty slot.
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

    // Try merging first.
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const target = this.inventory.getSlot(i);
      if (target && !target.isEmpty() && target.canStackWith(stack)) {
        const leftover = target.merge(stack);
        this.inventory.setSlot(i, target);
        if (leftover <= 0) return;
        stack.count = leftover;
      }
    }

    // Then empty slots.
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const target = this.inventory.getSlot(i);
      if (!target || target.isEmpty()) {
        this.inventory.setSlot(i, stack.clone());
        return;
      }
    }
    // If no room, item is lost (edge case).
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = /* css */ `
      .xc-inv-overlay {
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

      .xc-inv-panel {
        background: #C6C6C6;
        border-top: 3px solid #FFFFFF;
        border-left: 3px solid #FFFFFF;
        border-right: 3px solid #555555;
        border-bottom: 3px solid #555555;
        padding: 14px;
        min-width: 390px;
        box-shadow: 2px 2px 0 rgba(0,0,0,0.3);
      }

      .xc-inv-title {
        color: #404040;
        font-size: 14px;
        margin-bottom: 8px;
        text-align: left;
        padding-left: 2px;
      }

      /* ---- Crafting area ---- */
      .xc-inv-craft-area {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-bottom: 10px;
        padding: 8px;
        background: #C6C6C6;
      }

      .xc-inv-craft-2x2 {
        display: grid;
        grid-template-columns: repeat(2, 40px);
        grid-template-rows: repeat(2, 40px);
        gap: 2px;
      }

      .xc-inv-arrow {
        font-size: 28px;
        color: #404040;
        padding: 0 6px;
        user-select: none;
      }

      .xc-inv-output-slot {
        border-top-color: #555555 !important;
        border-left-color: #555555 !important;
        border-right-color: #FFFFFF !important;
        border-bottom-color: #FFFFFF !important;
      }

      /* ---- Separator ---- */
      .xc-inv-separator {
        height: 1px;
        background: #999;
        margin: 8px 0;
        border-top: 1px solid #FFFFFF;
      }

      /* ---- Inventory grid ---- */
      .xc-inv-grid {
        display: grid;
        grid-template-columns: repeat(9, 40px);
        gap: 2px;
        margin-bottom: 4px;
        justify-content: center;
      }

      .xc-inv-section-label {
        color: #404040;
        font-size: 10px;
        margin-bottom: 3px;
        text-align: left;
        padding-left: 4px;
      }

      /* ---- Slot (Minecraft beveled 3D look) ---- */
      .xc-inv-slot {
        position: relative;
        width: 40px;
        height: 40px;
        background: #8B8B8B;
        border-top: 2px solid #373737;
        border-left: 2px solid #373737;
        border-right: 2px solid #FFFFFF;
        border-bottom: 2px solid #FFFFFF;
        box-sizing: border-box;
        cursor: pointer;
      }
      .xc-inv-slot:hover {
        background: #A0A0A0;
      }

      .xc-inv-slot-icon {
        position: absolute;
        top: 4px; left: 4px;
        width: 28px; height: 28px;
        image-rendering: pixelated;
        background-size: 100% 100%;
        pointer-events: none;
      }

      .xc-inv-slot-durability {
        position: absolute;
        bottom: 3px; left: 4px;
        height: 2px;
        max-width: 28px;
        pointer-events: none;
      }

      .xc-inv-slot-count {
        position: absolute;
        bottom: 1px; right: 2px;
        color: #fff;
        font-size: 11px;
        font-weight: bold;
        text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
        pointer-events: none;
        line-height: 1;
      }

      /* ---- Tooltip ---- */
      .xc-inv-tooltip {
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

      /* ---- Cursor item ---- */
      .xc-inv-cursor {
        position: fixed;
        width: 28px; height: 28px;
        pointer-events: none;
        z-index: 1300;
        image-rendering: pixelated;
        background-size: 100% 100%;
        color: #fff;
        font-size: 11px;
        font-weight: bold;
        text-align: right;
        line-height: 28px;
        text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
        font-family: 'Courier New', Courier, monospace;
      }
    `;
    document.head.appendChild(style);
  }
}
