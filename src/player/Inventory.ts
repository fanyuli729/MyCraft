import { INVENTORY_SIZE, HOTBAR_SIZE } from '@/utils/Constants';
import { BlockType } from '@/types/BlockType';
import { ItemStack } from '@/items/ItemStack';
import { itemRegistry } from '@/items/ItemRegistry';

/**
 * Player inventory with 36 slots.
 *
 * Slot layout:
 *   0  --  8  : Hotbar  (always visible at bottom of HUD)
 *   9  -- 35  : Main inventory (opened with E / inventory key)
 */
export class Inventory {
  /** Fixed-length array of slots. A null entry means the slot is empty. */
  readonly slots: (ItemStack | null)[];

  constructor() {
    this.slots = new Array<ItemStack | null>(INVENTORY_SIZE).fill(null);
  }

  // ---------------------------------------------------------------------------
  // Single-slot access
  // ---------------------------------------------------------------------------

  /** Return the stack in the given slot, or null if empty. */
  getSlot(index: number): ItemStack | null {
    if (index < 0 || index >= INVENTORY_SIZE) return null;
    const stack = this.slots[index];
    if (stack && stack.isEmpty()) {
      this.slots[index] = null;
      return null;
    }
    return stack;
  }

  /** Overwrite a slot. Pass null to clear it. */
  setSlot(index: number, stack: ItemStack | null): void {
    if (index < 0 || index >= INVENTORY_SIZE) return;
    if (stack && stack.isEmpty()) {
      this.slots[index] = null;
    } else {
      this.slots[index] = stack;
    }
  }

  // ---------------------------------------------------------------------------
  // Bulk operations
  // ---------------------------------------------------------------------------

  /**
   * Add `count` items with the given `itemId` to the inventory.
   *
   * Strategy: first try to merge into existing stacks in the hotbar,
   * then existing stacks in main inventory, then empty hotbar slots,
   * then empty main slots.
   *
   * @returns The number of items that could NOT be added (leftover).
   */
  addItem(itemId: number, count: number): number {
    const item = itemRegistry.getItem(itemId);
    if (!item) return count;

    let remaining = count;

    // Phase 1 -- merge into existing compatible stacks (hotbar first).
    remaining = this.mergeIntoExisting(itemId, remaining, 0, HOTBAR_SIZE);
    if (remaining <= 0) return 0;
    remaining = this.mergeIntoExisting(itemId, remaining, HOTBAR_SIZE, INVENTORY_SIZE);
    if (remaining <= 0) return 0;

    // Phase 2 -- place into empty slots (hotbar first).
    remaining = this.placeIntoEmpty(itemId, remaining, item.stackSize, 0, HOTBAR_SIZE);
    if (remaining <= 0) return 0;
    remaining = this.placeIntoEmpty(itemId, remaining, item.stackSize, HOTBAR_SIZE, INVENTORY_SIZE);

    return Math.max(remaining, 0);
  }

  /**
   * Remove up to `count` items with the given `itemId` from the inventory.
   *
   * @returns The number of items actually removed.
   */
  removeItem(itemId: number, count: number): number {
    let toRemove = count;

    for (let i = 0; i < INVENTORY_SIZE && toRemove > 0; i++) {
      const stack = this.slots[i];
      if (!stack || stack.itemId !== itemId) continue;

      const take = Math.min(stack.count, toRemove);
      stack.count -= take;
      toRemove -= take;

      if (stack.isEmpty()) {
        this.slots[i] = null;
      }
    }

    return count - toRemove;
  }

  /**
   * Return the item stack in the currently selected hotbar slot.
   *
   * @param selectedSlot Hotbar index 0 -- 8.
   */
  getSelectedItem(selectedSlot: number): ItemStack | null {
    if (selectedSlot < 0 || selectedSlot >= HOTBAR_SIZE) return null;
    return this.getSlot(selectedSlot);
  }

  /** Check whether the inventory contains at least `count` of the given item. */
  hasItem(itemId: number, count: number): boolean {
    let total = 0;
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const stack = this.slots[i];
      if (stack && stack.itemId === itemId) {
        total += stack.count;
        if (total >= count) return true;
      }
    }
    return false;
  }

  /** Remove every item from every slot. */
  clear(): void {
    this.slots.fill(null);
  }

  // ---------------------------------------------------------------------------
  // Starter kit (called once after construction for testing)
  // ---------------------------------------------------------------------------

  /** Give the player some basic blocks to start with. */
  populateStarterKit(): void {
    this.addItem(BlockType.DIRT, 64);
    this.addItem(BlockType.STONE, 64);
    this.addItem(BlockType.WOOD_OAK, 64);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Try to merge `remaining` items into existing stacks within
   * [startSlot, endSlot).
   */
  private mergeIntoExisting(
    itemId: number,
    remaining: number,
    startSlot: number,
    endSlot: number,
  ): number {
    for (let i = startSlot; i < endSlot && remaining > 0; i++) {
      const stack = this.slots[i];
      if (!stack || stack.itemId !== itemId) continue;

      const tempOther = new ItemStack(itemId, remaining);
      remaining = stack.merge(tempOther);
    }
    return remaining;
  }

  /**
   * Try to place `remaining` items into empty slots within
   * [startSlot, endSlot).
   */
  private placeIntoEmpty(
    itemId: number,
    remaining: number,
    maxStack: number,
    startSlot: number,
    endSlot: number,
  ): number {
    for (let i = startSlot; i < endSlot && remaining > 0; i++) {
      if (this.slots[i] !== null) continue;

      const place = Math.min(remaining, maxStack);
      this.slots[i] = new ItemStack(itemId, place);
      remaining -= place;
    }
    return remaining;
  }
}
