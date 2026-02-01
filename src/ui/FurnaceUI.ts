import { INVENTORY_SIZE, HOTBAR_SIZE } from '@/utils/Constants';
import { ItemStack } from '@/items/ItemStack';
import { itemRegistry } from '@/items/ItemRegistry';
import { generateItemIcon } from '@/ui/ItemIconGenerator';
import type { Inventory } from '@/player/Inventory';
import type { UIScreen } from '@/ui/UIManager';

// ---------------------------------------------------------------------------
// Smelting recipes: input item ID  -->  output item ID
// ---------------------------------------------------------------------------

const SMELTING_RECIPES: ReadonlyMap<number, number> = new Map([
  [13, 202],   // Iron Ore   --> Iron Ingot
  [14, 203],   // Gold Ore   --> Gold Ingot
  [4, 22],     // Sand       --> Glass
  [18, 1],     // Cobblestone --> Stone
  [207, 212],  // Raw Beef     --> Cooked Beef
  [208, 213],  // Raw Porkchop --> Cooked Porkchop
  [209, 214],  // Raw Chicken  --> Cooked Chicken
]);

// ---------------------------------------------------------------------------
// Fuel burn durations (seconds).  SMELT_DURATION = 3s per item.
// ---------------------------------------------------------------------------

const FUEL_BURN_TIME: ReadonlyMap<number, number> = new Map([
  [201, 24],   // Coal         -- 8 smelts
  [6,   4.5],  // Oak Wood     -- 1.5 smelts
  [8,   4.5],  // Birch Wood
  [10,  4.5],  // Spruce Wood
  [19,  4.5],  // Oak Planks
  [200, 1.5],  // Stick        -- 0.5 smelts
]);

/** Seconds required to complete one smelting operation. */
const SMELT_DURATION = 3;

// ---------------------------------------------------------------------------
// FurnaceUI
// ---------------------------------------------------------------------------

/**
 * Furnace screen -- opened by right-clicking a furnace block.
 *
 * Contains one input slot, one fuel slot, and one output slot.
 * While the screen is open, smelting progresses in real time.
 * Items remain in the furnace slots between opens.
 */
export class FurnaceUI implements UIScreen {
  element: HTMLElement;

  // -- Furnace slot state (persists while the game is running) --
  private inputSlot: ItemStack | null = null;
  private fuelSlot: ItemStack | null = null;
  private outputSlot: ItemStack | null = null;

  // -- Smelting progress --
  private smeltProgress = 0;
  private fuelBurnTotal = 0;
  private fuelRemaining = 0;
  private lastTime = 0;

  // -- Cursor (drag-and-drop) --
  private cursorStack: ItemStack = ItemStack.EMPTY;
  private cursorElement!: HTMLElement;

  // -- DOM references --
  private inputSlotEl!: HTMLElement;
  private fuelSlotEl!: HTMLElement;
  private outputSlotEl!: HTMLElement;
  private fireEl!: HTMLElement;
  private arrowEl!: HTMLElement;
  private invSlotElements: HTMLElement[] = [];
  private tooltipElement!: HTMLElement;

  private inventory!: Inventory;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'xc-furnace-overlay';
    this.buildDOM();
    this.injectStyles();
    this.bindEvents();
  }

  // -----------------------------------------------------------------------
  // UIScreen interface
  // -----------------------------------------------------------------------

  show(): void {
    this.element.style.display = 'flex';
    this.cursorStack = ItemStack.EMPTY;
    this.updateCursorDisplay();
    this.lastTime = performance.now();
  }

  hide(): void {
    this.element.style.display = 'none';
    if (!this.cursorStack.isEmpty() && this.inventory) {
      this.returnCursorToInventory();
    }
    this.cursorStack = ItemStack.EMPTY;
    this.updateCursorDisplay();
  }

  update(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.5);
    this.lastTime = now;

    this.tickSmelting(dt);
    this.refreshAllSlots();
    this.updateIndicators();
  }

  // -----------------------------------------------------------------------
  // Public helpers
  // -----------------------------------------------------------------------

  setInventory(inv: Inventory): void {
    this.inventory = inv;
  }

  // -----------------------------------------------------------------------
  // Smelting logic
  // -----------------------------------------------------------------------

  private tickSmelting(dt: number): void {
    const canSmelt = this.canSmelt();

    // Tick fuel down.
    if (this.fuelRemaining > 0) {
      this.fuelRemaining -= dt;
    }

    if (canSmelt) {
      // Need fuel to keep smelting.
      if (this.fuelRemaining <= 0) {
        if (!this.tryConsumeFuel()) {
          // No fuel -- slowly reset progress.
          this.smeltProgress = Math.max(0, this.smeltProgress - dt * 2);
          return;
        }
      }

      this.smeltProgress += dt;

      if (this.smeltProgress >= SMELT_DURATION) {
        this.completeSmelt();
        this.smeltProgress = 0;
      }
    } else {
      // Nothing to smelt -- slowly reset progress bar.
      this.smeltProgress = Math.max(0, this.smeltProgress - dt * 2);
    }
  }

  /** Can we smelt the current input item into the output slot? */
  private canSmelt(): boolean {
    if (!this.inputSlot || this.inputSlot.isEmpty()) return false;

    const resultId = SMELTING_RECIPES.get(this.inputSlot.itemId);
    if (resultId === undefined) return false;

    if (this.outputSlot && !this.outputSlot.isEmpty()) {
      if (this.outputSlot.itemId !== resultId) return false;
      const item = itemRegistry.getItem(resultId);
      const max = item ? item.stackSize : 64;
      if (this.outputSlot.count >= max) return false;
    }

    return true;
  }

  /** Consume one unit of fuel from the fuel slot. */
  private tryConsumeFuel(): boolean {
    if (!this.fuelSlot || this.fuelSlot.isEmpty()) return false;

    const burnTime = FUEL_BURN_TIME.get(this.fuelSlot.itemId);
    if (burnTime === undefined) return false;

    this.fuelSlot.count -= 1;
    if (this.fuelSlot.count <= 0) {
      this.fuelSlot = null;
    }

    this.fuelBurnTotal = burnTime;
    this.fuelRemaining = burnTime;
    return true;
  }

  /** Move one smelted item from input to output. */
  private completeSmelt(): void {
    if (!this.inputSlot || this.inputSlot.isEmpty()) return;

    const resultId = SMELTING_RECIPES.get(this.inputSlot.itemId);
    if (resultId === undefined) return;

    if (!this.outputSlot || this.outputSlot.isEmpty()) {
      this.outputSlot = new ItemStack(resultId, 1);
    } else if (this.outputSlot.itemId === resultId) {
      this.outputSlot.count += 1;
    }

    this.inputSlot.count -= 1;
    if (this.inputSlot.count <= 0) {
      this.inputSlot = null;
    }
  }

  // -----------------------------------------------------------------------
  // DOM construction
  // -----------------------------------------------------------------------

  private buildDOM(): void {
    const panel = document.createElement('div');
    panel.className = 'xc-furnace-panel';

    // Title
    const title = document.createElement('div');
    title.className = 'xc-furnace-title';
    title.textContent = 'Furnace';
    panel.appendChild(title);

    // Furnace area
    const area = document.createElement('div');
    area.className = 'xc-furnace-area';

    // Left column: input, fire indicator, fuel
    const leftCol = document.createElement('div');
    leftCol.className = 'xc-furnace-left';

    this.inputSlotEl = this.createSlotElement();
    this.inputSlotEl.dataset.furnaceSlot = 'input';
    leftCol.appendChild(this.inputSlotEl);

    this.fireEl = document.createElement('div');
    this.fireEl.className = 'xc-furnace-fire';
    this.fireEl.innerHTML = '<div class="xc-furnace-fire-fill"></div>';
    leftCol.appendChild(this.fireEl);

    this.fuelSlotEl = this.createSlotElement();
    this.fuelSlotEl.dataset.furnaceSlot = 'fuel';
    leftCol.appendChild(this.fuelSlotEl);

    area.appendChild(leftCol);

    // Arrow indicator
    this.arrowEl = document.createElement('div');
    this.arrowEl.className = 'xc-furnace-arrow';
    this.arrowEl.innerHTML = '<div class="xc-furnace-arrow-fill"></div>';
    area.appendChild(this.arrowEl);

    // Output slot
    this.outputSlotEl = this.createSlotElement();
    this.outputSlotEl.dataset.furnaceSlot = 'output';
    this.outputSlotEl.classList.add('xc-furnace-output-slot');
    area.appendChild(this.outputSlotEl);

    panel.appendChild(area);

    // Separator
    const sep = document.createElement('div');
    sep.className = 'xc-furnace-separator';
    panel.appendChild(sep);

    // Main inventory (slots 9-35)
    const mainLabel = document.createElement('div');
    mainLabel.className = 'xc-furnace-section-label';
    mainLabel.textContent = 'Inventory';
    panel.appendChild(mainLabel);

    const mainGrid = document.createElement('div');
    mainGrid.className = 'xc-furnace-inv-grid';
    for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) {
      const slot = this.createSlotElement();
      slot.dataset.slotIndex = String(i);
      this.invSlotElements[i] = slot;
      mainGrid.appendChild(slot);
    }
    panel.appendChild(mainGrid);

    // Hotbar (slots 0-8)
    const hotbarLabel = document.createElement('div');
    hotbarLabel.className = 'xc-furnace-section-label';
    hotbarLabel.textContent = 'Hotbar';
    panel.appendChild(hotbarLabel);

    const hotbarGrid = document.createElement('div');
    hotbarGrid.className = 'xc-furnace-inv-grid';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = this.createSlotElement();
      slot.dataset.slotIndex = String(i);
      this.invSlotElements[i] = slot;
      hotbarGrid.appendChild(slot);
    }
    panel.appendChild(hotbarGrid);

    // Tooltip
    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'xc-furnace-tooltip';
    this.tooltipElement.style.display = 'none';
    this.element.appendChild(this.tooltipElement);

    // Cursor
    this.cursorElement = document.createElement('div');
    this.cursorElement.className = 'xc-furnace-cursor';
    this.cursorElement.style.display = 'none';
    this.element.appendChild(this.cursorElement);

    this.element.appendChild(panel);
  }

  private createSlotElement(): HTMLElement {
    const slot = document.createElement('div');
    slot.className = 'xc-furnace-slot';

    const icon = document.createElement('div');
    icon.className = 'xc-furnace-slot-icon';
    slot.appendChild(icon);

    const count = document.createElement('span');
    count.className = 'xc-furnace-slot-count';
    slot.appendChild(count);

    return slot;
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  private bindEvents(): void {
    this.element.addEventListener('mousemove', (e) => {
      this.cursorElement.style.left = `${e.clientX + 8}px`;
      this.cursorElement.style.top = `${e.clientY + 8}px`;

      const target = (e.target as HTMLElement).closest<HTMLElement>('.xc-furnace-slot');
      if (target) {
        this.showTooltip(target, e.clientX, e.clientY);
      } else {
        this.tooltipElement.style.display = 'none';
      }
    });

    this.element.addEventListener('contextmenu', (e) => e.preventDefault());

    this.element.addEventListener('mousedown', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.xc-furnace-slot');
      if (!target) return;

      if (target.dataset.furnaceSlot !== undefined) {
        this.handleFurnaceSlotClick(target.dataset.furnaceSlot, e.button);
        return;
      }

      if (target.dataset.slotIndex !== undefined) {
        this.handleInvClick(parseInt(target.dataset.slotIndex, 10), e.button, e.shiftKey);
      }
    });
  }

  // -----------------------------------------------------------------------
  // Furnace slot interaction
  // -----------------------------------------------------------------------

  private handleFurnaceSlotClick(slotName: string, button: number): void {
    if (slotName === 'output') {
      this.handleOutputClick();
      return;
    }

    const current = slotName === 'input' ? this.inputSlot : this.fuelSlot;

    if (button === 0) {
      if (this.cursorStack.isEmpty()) {
        if (current && !current.isEmpty()) {
          this.cursorStack = current.clone();
          this.setFurnaceSlot(slotName, null);
        }
      } else {
        if (!current || current.isEmpty()) {
          this.setFurnaceSlot(slotName, this.cursorStack.clone());
          this.cursorStack = ItemStack.EMPTY;
        } else if (this.cursorStack.canStackWith(current)) {
          const leftover = current.merge(this.cursorStack);
          this.setFurnaceSlot(slotName, current);
          this.cursorStack.count = leftover;
          if (leftover <= 0) this.cursorStack = ItemStack.EMPTY;
        } else {
          const temp = current.clone();
          this.setFurnaceSlot(slotName, this.cursorStack.clone());
          this.cursorStack = temp;
        }
      }
    }

    if (button === 2) {
      if (!this.cursorStack.isEmpty()) {
        if (!current || current.isEmpty()) {
          const single = this.cursorStack.split(1);
          this.setFurnaceSlot(slotName, single);
          if (this.cursorStack.count <= 0) this.cursorStack = ItemStack.EMPTY;
        } else if (this.cursorStack.canStackWith(current)) {
          const item = itemRegistry.getItem(current.itemId);
          const max = item ? item.stackSize : 64;
          if (current.count < max) {
            current.count += 1;
            this.cursorStack.count -= 1;
            this.setFurnaceSlot(slotName, current);
            if (this.cursorStack.count <= 0) this.cursorStack = ItemStack.EMPTY;
          }
        }
      } else {
        if (current && !current.isEmpty()) {
          const half = Math.ceil(current.count / 2);
          this.cursorStack = current.split(half);
          if (current.count <= 0) {
            this.setFurnaceSlot(slotName, null);
          } else {
            this.setFurnaceSlot(slotName, current);
          }
        }
      }
    }

    this.refreshAllSlots();
    this.updateCursorDisplay();
  }

  private handleOutputClick(): void {
    if (!this.outputSlot || this.outputSlot.isEmpty()) return;

    if (this.cursorStack.isEmpty()) {
      this.cursorStack = this.outputSlot.clone();
      this.outputSlot = null;
    } else if (this.cursorStack.canStackWith(this.outputSlot)) {
      const item = itemRegistry.getItem(this.cursorStack.itemId);
      const max = item ? item.stackSize : 64;
      if (this.cursorStack.count + this.outputSlot.count <= max) {
        this.cursorStack.count += this.outputSlot.count;
        this.outputSlot = null;
      }
    }

    this.refreshAllSlots();
    this.updateCursorDisplay();
  }

  private setFurnaceSlot(slotName: string, stack: ItemStack | null): void {
    if (slotName === 'input') {
      this.inputSlot = stack;
    } else if (slotName === 'fuel') {
      this.fuelSlot = stack;
    } else if (slotName === 'output') {
      this.outputSlot = stack;
    }
  }

  // -----------------------------------------------------------------------
  // Inventory slot interaction
  // -----------------------------------------------------------------------

  private handleInvClick(slotIndex: number, button: number, shiftKey: boolean): void {
    if (!this.inventory) return;

    const slotStack = this.inventory.getSlot(slotIndex);

    if (shiftKey && button === 0) {
      if (slotStack && !slotStack.isEmpty()) {
        this.tryQuickTransferToFurnace(slotIndex);
      }
      this.refreshAllSlots();
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

    this.refreshAllSlots();
    this.updateCursorDisplay();
  }

  /**
   * Shift-click from inventory: try to place the item into the
   * appropriate furnace slot (input for smeltable, fuel for burnable).
   */
  private tryQuickTransferToFurnace(slotIndex: number): void {
    const stack = this.inventory.getSlot(slotIndex);
    if (!stack || stack.isEmpty()) return;

    // If the item is smeltable, try the input slot first.
    if (SMELTING_RECIPES.has(stack.itemId)) {
      if (!this.inputSlot || this.inputSlot.isEmpty()) {
        this.inputSlot = stack.clone();
        this.inventory.setSlot(slotIndex, ItemStack.EMPTY);
        return;
      } else if (this.inputSlot.canStackWith(stack)) {
        const leftover = this.inputSlot.merge(stack);
        if (leftover <= 0) {
          this.inventory.setSlot(slotIndex, ItemStack.EMPTY);
        } else {
          stack.count = leftover;
          this.inventory.setSlot(slotIndex, stack);
        }
        return;
      }
    }

    // If the item is fuel, try the fuel slot.
    if (FUEL_BURN_TIME.has(stack.itemId)) {
      if (!this.fuelSlot || this.fuelSlot.isEmpty()) {
        this.fuelSlot = stack.clone();
        this.inventory.setSlot(slotIndex, ItemStack.EMPTY);
        return;
      } else if (this.fuelSlot.canStackWith(stack)) {
        const leftover = this.fuelSlot.merge(stack);
        if (leftover <= 0) {
          this.inventory.setSlot(slotIndex, ItemStack.EMPTY);
        } else {
          stack.count = leftover;
          this.inventory.setSlot(slotIndex, stack);
        }
        return;
      }
    }

    // Fallback: quick transfer between inventory sections.
    if (slotIndex < HOTBAR_SIZE) {
      this.quickTransfer(slotIndex, HOTBAR_SIZE, INVENTORY_SIZE);
    } else {
      this.quickTransfer(slotIndex, 0, HOTBAR_SIZE);
    }
  }

  // -----------------------------------------------------------------------
  // Rendering helpers
  // -----------------------------------------------------------------------

  private refreshAllSlots(): void {
    this.renderSlotContent(this.inputSlotEl, this.inputSlot);
    this.renderSlotContent(this.fuelSlotEl, this.fuelSlot);
    this.renderSlotContent(this.outputSlotEl, this.outputSlot);

    if (this.inventory) {
      for (let i = 0; i < INVENTORY_SIZE; i++) {
        const el = this.invSlotElements[i];
        if (!el) continue;
        const stack = this.inventory.getSlot(i);
        this.renderSlotContent(el, stack);
      }
    }
  }

  private renderSlotContent(slotEl: HTMLElement, stack: ItemStack | null): void {
    const icon = slotEl.querySelector<HTMLElement>('.xc-furnace-slot-icon')!;
    const countEl = slotEl.querySelector<HTMLElement>('.xc-furnace-slot-count')!;

    if (!stack || stack.isEmpty()) {
      icon.style.display = 'none';
      icon.style.backgroundImage = '';
      countEl.textContent = '';
    } else {
      icon.style.display = 'block';
      icon.style.backgroundImage = `url(${generateItemIcon(stack.itemId)})`;
      icon.style.backgroundColor = 'transparent';
      icon.style.backgroundSize = '100% 100%';
      countEl.textContent = stack.count > 1 ? String(stack.count) : '';
    }
  }

  private updateIndicators(): void {
    // Fire fill (bottom to top -- represents remaining fuel).
    const fireFill = this.fireEl.querySelector<HTMLElement>('.xc-furnace-fire-fill')!;
    if (this.fuelBurnTotal > 0 && this.fuelRemaining > 0) {
      const pct = (this.fuelRemaining / this.fuelBurnTotal) * 100;
      fireFill.style.height = `${pct}%`;
    } else {
      fireFill.style.height = '0%';
    }

    // Arrow fill (left to right -- represents smelting progress).
    const arrowFill = this.arrowEl.querySelector<HTMLElement>('.xc-furnace-arrow-fill')!;
    const pct = (this.smeltProgress / SMELT_DURATION) * 100;
    arrowFill.style.width = `${pct}%`;
  }

  private updateCursorDisplay(): void {
    if (this.cursorStack.isEmpty()) {
      this.cursorElement.style.display = 'none';
      return;
    }
    this.cursorElement.style.display = 'block';
    this.cursorElement.style.backgroundImage = `url(${generateItemIcon(this.cursorStack.itemId)})`;
    this.cursorElement.style.backgroundSize = '100% 100%';
    this.cursorElement.style.backgroundColor = 'transparent';
    this.cursorElement.textContent = this.cursorStack.count > 1
      ? String(this.cursorStack.count) : '';
  }

  private showTooltip(slotEl: HTMLElement, mx: number, my: number): void {
    let stack: ItemStack | null = null;

    if (slotEl.dataset.furnaceSlot !== undefined) {
      const name = slotEl.dataset.furnaceSlot;
      if (name === 'input') stack = this.inputSlot;
      else if (name === 'fuel') stack = this.fuelSlot;
      else if (name === 'output') stack = this.outputSlot;
    } else if (slotEl.dataset.slotIndex !== undefined) {
      stack = this.inventory?.getSlot(parseInt(slotEl.dataset.slotIndex, 10)) ?? null;
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

  // -----------------------------------------------------------------------
  // Inventory helpers
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Styles
  // -----------------------------------------------------------------------

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = /* css */ `
      .xc-furnace-overlay {
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

      .xc-furnace-panel {
        background: #C6C6C6;
        border: 3px solid #555;
        border-top-color: #fff;
        border-left-color: #fff;
        padding: 12px;
        min-width: 400px;
        box-shadow: 4px 4px 0 rgba(0,0,0,0.4);
      }

      .xc-furnace-title {
        color: #404040;
        font-size: 14px;
        margin-bottom: 10px;
        text-align: center;
      }

      .xc-furnace-area {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
        margin-bottom: 14px;
        padding: 14px;
        background: #8B8B8B;
        border: 2px solid #555;
        border-top-color: #373737;
        border-left-color: #373737;
        border-bottom-color: #FFF;
        border-right-color: #FFF;
      }

      .xc-furnace-left {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }

      .xc-furnace-fire {
        width: 14px;
        height: 14px;
        background: #4a4a4a;
        position: relative;
        overflow: hidden;
        border: 1px solid #333;
      }

      .xc-furnace-fire-fill {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 0%;
        background: #ff6600;
      }

      .xc-furnace-arrow {
        width: 24px;
        height: 17px;
        background: #6B6B6B;
        position: relative;
        overflow: hidden;
        clip-path: polygon(0 20%, 65% 20%, 65% 0%, 100% 50%, 65% 100%, 65% 80%, 0 80%);
      }

      .xc-furnace-arrow-fill {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 0%;
        background: #4CAF50;
      }

      .xc-furnace-output-slot {
        border-color: #aa8833 !important;
      }

      .xc-furnace-separator {
        height: 1px;
        background: #999;
        margin: 8px 0;
      }

      .xc-furnace-inv-grid {
        display: grid;
        grid-template-columns: repeat(9, 40px);
        gap: 2px;
        margin-bottom: 6px;
        justify-content: center;
      }

      .xc-furnace-section-label {
        color: #404040;
        font-size: 10px;
        margin-bottom: 3px;
        text-align: left;
        padding-left: 4px;
      }

      .xc-furnace-slot {
        position: relative;
        width: 40px;
        height: 40px;
        background: #8B8B8B;
        border: 2px solid;
        border-top-color: #373737;
        border-left-color: #373737;
        border-bottom-color: #FFF;
        border-right-color: #FFF;
        box-sizing: border-box;
        cursor: pointer;
      }
      .xc-furnace-slot:hover {
        border-color: #FFD700;
      }

      .xc-furnace-slot-icon {
        position: absolute;
        top: 4px; left: 4px;
        width: 28px; height: 28px;
        image-rendering: pixelated;
        pointer-events: none;
      }

      .xc-furnace-slot-count {
        position: absolute;
        bottom: 1px; right: 2px;
        color: #fff;
        font-size: 11px;
        font-weight: bold;
        text-shadow: 1px 1px 0 #000;
        pointer-events: none;
        line-height: 1;
      }

      .xc-furnace-tooltip {
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

      .xc-furnace-cursor {
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
