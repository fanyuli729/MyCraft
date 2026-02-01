import { BlockType } from '@/types/BlockType';
import { ItemStack } from '@/items/ItemStack';
import { itemRegistry } from '@/items/ItemRegistry';
import { Inventory } from '@/player/Inventory';

/**
 * Higher-level operations that coordinate between the Inventory and the
 * game world (block breaking / placing, drag-and-drop slot manipulation, etc.).
 */
export class InventoryManager {
  // ---------------------------------------------------------------------------
  // Block interactions
  // ---------------------------------------------------------------------------

  /**
   * Called when the player breaks a block.
   * Adds the corresponding block item to the inventory.
   *
   * Some blocks drop a different item than themselves:
   *   - Stone drops Cobblestone
   *   - Grass drops Dirt
   *   - Ores may drop their raw resource (coal, diamond) -- simplified here
   *     to drop themselves for now.
   */
  handleBlockBreak(inventory: Inventory, blockType: BlockType): void {
    // Determine what item the block drops.
    let dropId: number = blockType;

    switch (blockType) {
      case BlockType.STONE:
        dropId = BlockType.COBBLESTONE;
        break;
      case BlockType.GRASS:
        dropId = BlockType.DIRT;
        break;
      case BlockType.COAL_ORE:
        dropId = 201; // Coal misc item
        break;
      case BlockType.DIAMOND_ORE:
        dropId = 204; // Diamond misc item
        break;
      // Everything else drops itself.
    }

    inventory.addItem(dropId, 1);
  }

  /**
   * Called when the player attempts to place a block from the given hotbar slot.
   *
   * @returns The BlockType to place and whether the operation succeeded.
   */
  handleBlockPlace(
    inventory: Inventory,
    selectedSlot: number,
  ): { blockType: BlockType; success: boolean } {
    const stack = inventory.getSelectedItem(selectedSlot);

    if (!stack || stack.isEmpty()) {
      return { blockType: BlockType.AIR, success: false };
    }

    const item = itemRegistry.getItem(stack.itemId);
    if (!item || !item.isBlock || item.blockType === undefined) {
      return { blockType: BlockType.AIR, success: false };
    }

    // Consume one item from the stack.
    stack.count -= 1;
    if (stack.isEmpty()) {
      inventory.setSlot(selectedSlot, null);
    }

    return { blockType: item.blockType, success: true };
  }

  // ---------------------------------------------------------------------------
  // Slot manipulation
  // ---------------------------------------------------------------------------

  /** Swap the contents of two inventory slots. */
  swapSlots(inventory: Inventory, from: number, to: number): void {
    const a = inventory.getSlot(from);
    const b = inventory.getSlot(to);
    inventory.setSlot(from, b);
    inventory.setSlot(to, a);
  }

  /**
   * Split the stack at `slotIndex` in half.
   * The first half stays in the slot; the second half is returned.
   *
   * @returns The split-off stack, or null if the slot was empty.
   */
  splitStack(inventory: Inventory, slotIndex: number): ItemStack | null {
    const stack = inventory.getSlot(slotIndex);
    if (!stack || stack.isEmpty()) return null;

    const halfAmount = Math.ceil(stack.count / 2);
    const split = stack.split(halfAmount);

    if (stack.isEmpty()) {
      inventory.setSlot(slotIndex, null);
    }

    return split;
  }

  /**
   * Move items from one slot to another.
   *
   * If the destination slot holds a compatible stack the items are merged.
   * If the destination is empty the entire source stack is moved.
   * If the destination holds a different item the two stacks are swapped.
   */
  transferToSlot(inventory: Inventory, fromSlot: number, toSlot: number): void {
    const src = inventory.getSlot(fromSlot);
    if (!src || src.isEmpty()) return;

    const dst = inventory.getSlot(toSlot);

    if (!dst) {
      // Destination is empty -- move entire stack.
      inventory.setSlot(toSlot, src);
      inventory.setSlot(fromSlot, null);
      return;
    }

    if (src.canStackWith(dst)) {
      // Merge as much as possible.
      const leftover = dst.merge(src);
      src.count = leftover;
      if (src.isEmpty()) {
        inventory.setSlot(fromSlot, null);
      }
    } else {
      // Different items -- swap.
      this.swapSlots(inventory, fromSlot, toSlot);
    }
  }
}
