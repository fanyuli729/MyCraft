import { ItemStack } from '@/items/ItemStack';
import { itemRegistry } from '@/items/ItemRegistry';
import { ToolType, ToolTier, TOOL_SPEED } from '@/items/Item';
import { BlockType } from '@/types/BlockType';

// ---------------------------------------------------------------------------
// Block category sets (mirrors ToolItem.ts for self-contained look-ups)
// ---------------------------------------------------------------------------

/** Blocks that strictly require a pickaxe to harvest. */
const PICKAXE_REQUIRED: ReadonlySet<BlockType> = new Set([
  BlockType.STONE,
  BlockType.COBBLESTONE,
  BlockType.SAND_STONE,
  BlockType.COAL_ORE,
  BlockType.IRON_ORE,
  BlockType.GOLD_ORE,
  BlockType.DIAMOND_ORE,
  BlockType.FURNACE,
  BlockType.ICE,
]);

/** Blocks where an axe provides a speed bonus but is not required. */
const AXE_EFFECTIVE: ReadonlySet<BlockType> = new Set([
  BlockType.WOOD_OAK,
  BlockType.WOOD_BIRCH,
  BlockType.WOOD_SPRUCE,
  BlockType.PLANKS_OAK,
  BlockType.CRAFTING_TABLE,
]);

/** Blocks where a shovel provides a speed bonus. */
const SHOVEL_EFFECTIVE: ReadonlySet<BlockType> = new Set([
  BlockType.DIRT,
  BlockType.GRASS,
  BlockType.SAND,
  BlockType.GRAVEL,
  BlockType.SNOW,
]);

// ---------------------------------------------------------------------------
// ToolDurability
// ---------------------------------------------------------------------------

/**
 * Static utility methods for tool durability tracking, mining speed
 * calculation, and harvest eligibility checks.
 */
export class ToolDurability {
  /**
   * Reduce the durability of a tool by one use.
   *
   * @param stack The ItemStack representing the tool.
   * @returns True if the tool broke (durability reached zero).
   */
  static useTool(stack: ItemStack): boolean {
    if (stack.durability === undefined) return false;

    stack.durability -= 1;

    if (stack.durability <= 0) {
      // Mark the stack as empty so the inventory can remove it.
      stack.count = 0;
      return true;
    }

    return false;
  }

  /**
   * Return the mining speed multiplier for the given item when used
   * against the given block type.
   *
   * The base multiplier (bare hand / wrong tool) is 1.0.
   * Matching tool + tier multipliers: Wood 2.0, Stone 4.0, Iron 6.0,
   * Gold 12.0, Diamond 8.0.
   *
   * @param stack     The tool ItemStack (may be null for bare hand).
   * @param blockType The block being mined.
   * @returns Mining speed multiplier (>= 1.0).
   */
  static getMiningSpeedMultiplier(stack: ItemStack | null, blockType: BlockType): number {
    if (!stack) return 1.0;

    const item = itemRegistry.getItem(stack.itemId);
    if (!item || !item.toolType || !item.toolTier) return 1.0;
    if (item.toolType === ToolType.NONE) return 1.0;

    let effective = false;

    switch (item.toolType) {
      case ToolType.PICKAXE:
        effective = PICKAXE_REQUIRED.has(blockType);
        break;
      case ToolType.AXE:
        effective = AXE_EFFECTIVE.has(blockType);
        break;
      case ToolType.SHOVEL:
        effective = SHOVEL_EFFECTIVE.has(blockType);
        break;
      default:
        effective = false;
    }

    return effective ? TOOL_SPEED[item.toolTier] : 1.0;
  }

  /**
   * Determine whether the given tool (or bare hand) is sufficient to
   * harvest the given block type and cause it to drop items.
   *
   * - Stone and ore blocks require a pickaxe.
   * - Wood blocks can be broken by hand (just slower), but an axe speeds
   *   them up.
   * - Bedrock is never harvestable.
   *
   * @param stack     The tool ItemStack, or null for bare hand.
   * @param blockType The block type to check.
   * @returns True if the block can be harvested with this tool.
   */
  static canHarvestBlock(stack: ItemStack | null, blockType: BlockType): boolean {
    // Bedrock is never harvestable.
    if (blockType === BlockType.BEDROCK) return false;

    // Pickaxe-required blocks need at least some pickaxe.
    if (PICKAXE_REQUIRED.has(blockType)) {
      if (!stack) return false;

      const item = itemRegistry.getItem(stack.itemId);
      if (!item || item.toolType !== ToolType.PICKAXE) return false;

      // Tier requirements for specific ores.
      if (blockType === BlockType.DIAMOND_ORE || blockType === BlockType.GOLD_ORE) {
        return item.toolTier === ToolTier.IRON || item.toolTier === ToolTier.DIAMOND;
      }
      if (blockType === BlockType.IRON_ORE) {
        return (
          item.toolTier === ToolTier.STONE ||
          item.toolTier === ToolTier.IRON ||
          item.toolTier === ToolTier.DIAMOND
        );
      }

      return true;
    }

    // All other blocks (including wood) can be harvested by hand.
    return true;
  }
}
