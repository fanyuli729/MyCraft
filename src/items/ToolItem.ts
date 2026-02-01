import { BlockType } from '@/types/BlockType';
import { Item, ToolType, ToolTier, TOOL_SPEED, TOOL_DURABILITY } from '@/items/Item';

// ---------------------------------------------------------------------------
// Block categories used for harvest / speed checks
// ---------------------------------------------------------------------------

/** Blocks that require a pickaxe to harvest. */
const PICKAXE_BLOCKS: ReadonlySet<BlockType> = new Set([
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

/** Blocks that a pickaxe mines faster even though bare hand can break them. */
const PICKAXE_SPEEDUP: ReadonlySet<BlockType> = new Set([
  ...PICKAXE_BLOCKS,
]);

/** Blocks that an axe speeds up. */
const AXE_BLOCKS: ReadonlySet<BlockType> = new Set([
  BlockType.WOOD_OAK,
  BlockType.WOOD_BIRCH,
  BlockType.WOOD_SPRUCE,
  BlockType.PLANKS_OAK,
  BlockType.CRAFTING_TABLE,
]);

/** Blocks that a shovel speeds up. */
const SHOVEL_BLOCKS: ReadonlySet<BlockType> = new Set([
  BlockType.DIRT,
  BlockType.GRASS,
  BlockType.SAND,
  BlockType.GRAVEL,
  BlockType.SNOW,
]);

// ---------------------------------------------------------------------------
// Public helper functions
// ---------------------------------------------------------------------------

/**
 * Return the mining speed multiplier for the given tool when used against
 * the given block type.
 *
 * A multiplier of 1 means "bare hand speed".
 * Higher values mean the block breaks faster.
 */
export function getMiningSpeed(toolItem: Item | undefined, blockType: BlockType): number {
  if (!toolItem || !toolItem.toolType || !toolItem.toolTier) return 1;
  if (toolItem.toolType === ToolType.NONE) return 1;

  const tier = toolItem.toolTier;
  const type = toolItem.toolType;

  let effective = false;

  switch (type) {
    case ToolType.PICKAXE:
      effective = PICKAXE_SPEEDUP.has(blockType);
      break;
    case ToolType.AXE:
      effective = AXE_BLOCKS.has(blockType);
      break;
    case ToolType.SHOVEL:
      effective = SHOVEL_BLOCKS.has(blockType);
      break;
    case ToolType.SWORD:
      // Swords don't have a mining speed bonus on regular blocks.
      effective = false;
      break;
  }

  return effective ? TOOL_SPEED[tier] : 1;
}

/**
 * Return the maximum durability for a given tool tier.
 */
export function getToolDurability(tier: ToolTier): number {
  return TOOL_DURABILITY[tier];
}

/**
 * Determine whether the given tool (or bare hand) is sufficient to
 * harvest the given block type.
 *
 * Some blocks (e.g. stone, ores) require at least a pickaxe to drop items.
 * Without the correct tool, the block still breaks but yields nothing.
 */
export function canHarvest(toolItem: Item | undefined, blockType: BlockType): boolean {
  // Bedrock is never harvestable.
  if (blockType === BlockType.BEDROCK) return false;

  // Pickaxe-required blocks.
  if (PICKAXE_BLOCKS.has(blockType)) {
    if (!toolItem || toolItem.toolType !== ToolType.PICKAXE) return false;

    // Higher-tier ores require better pickaxes.
    if (blockType === BlockType.DIAMOND_ORE) {
      return toolItem.toolTier === ToolTier.IRON
        || toolItem.toolTier === ToolTier.DIAMOND;
    }
    if (blockType === BlockType.GOLD_ORE) {
      return toolItem.toolTier === ToolTier.IRON
        || toolItem.toolTier === ToolTier.DIAMOND;
    }
    if (blockType === BlockType.IRON_ORE) {
      return toolItem.toolTier === ToolTier.STONE
        || toolItem.toolTier === ToolTier.IRON
        || toolItem.toolTier === ToolTier.DIAMOND;
    }

    // Any pickaxe is sufficient for remaining pickaxe blocks.
    return true;
  }

  // All other blocks can be harvested by hand or any tool.
  return true;
}
