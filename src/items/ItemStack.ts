import { itemRegistry } from '@/items/ItemRegistry';

/**
 * Represents a stack of identical items occupying a single inventory slot.
 *
 * An ItemStack holds an item ID, a count, and an optional durability value
 * (for tools or other damageable items).
 */
export class ItemStack {
  /** Sentinel empty stack. Never mutate -- always create a new stack instead. */
  static readonly EMPTY = new ItemStack(0, 0);

  constructor(
    public itemId: number,
    public count: number,
    public durability?: number,
  ) {}

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** An empty stack has count <= 0 or item ID 0 (air). */
  isEmpty(): boolean {
    return this.count <= 0 || this.itemId === 0;
  }

  /**
   * Returns true when `other` represents the same item and neither stack
   * carries unique durability state that would prevent stacking.
   */
  canStackWith(other: ItemStack): boolean {
    if (this.itemId !== other.itemId) return false;
    // Tools (items with durability) cannot stack.
    if (this.durability !== undefined || other.durability !== undefined) return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Mutations (return new stacks / leftover counts)
  // ---------------------------------------------------------------------------

  /** Create an independent copy. */
  clone(): ItemStack {
    return new ItemStack(this.itemId, this.count, this.durability);
  }

  /**
   * Attempt to merge `other` into this stack.
   * Returns the number of items from `other` that could **not** fit.
   */
  merge(other: ItemStack): number {
    if (!this.canStackWith(other)) return other.count;

    const item = itemRegistry.getItem(this.itemId);
    const max = item ? item.stackSize : 64;
    const space = max - this.count;
    const transfer = Math.min(space, other.count);

    this.count += transfer;
    return other.count - transfer;
  }

  /**
   * Split off `amount` items from this stack and return them as a new stack.
   * If `amount` >= this.count the entire stack is consumed and the returned
   * stack contains everything.
   */
  split(amount: number): ItemStack {
    const taken = Math.min(amount, this.count);
    this.count -= taken;
    return new ItemStack(this.itemId, taken, this.durability);
  }
}
