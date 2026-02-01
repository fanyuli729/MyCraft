import { BlockType } from '@/types/BlockType';

/**
 * Tool categories that determine mining effectiveness.
 */
export enum ToolType {
  NONE = 'none',
  PICKAXE = 'pickaxe',
  AXE = 'axe',
  SHOVEL = 'shovel',
  SWORD = 'sword',
}

/**
 * Tool material tiers. Each tier provides a speed multiplier and
 * a maximum durability for tools crafted from that material.
 */
export enum ToolTier {
  WOOD = 'wood',
  STONE = 'stone',
  IRON = 'iron',
  GOLD = 'gold',
  DIAMOND = 'diamond',
}

/** Speed multiplier for each tool tier when mining the correct block type. */
export const TOOL_SPEED: Record<ToolTier, number> = {
  [ToolTier.WOOD]: 2,
  [ToolTier.STONE]: 4,
  [ToolTier.IRON]: 6,
  [ToolTier.GOLD]: 12,
  [ToolTier.DIAMOND]: 8,
};

/** Maximum durability for each tool tier. */
export const TOOL_DURABILITY: Record<ToolTier, number> = {
  [ToolTier.WOOD]: 59,
  [ToolTier.STONE]: 131,
  [ToolTier.IRON]: 250,
  [ToolTier.GOLD]: 32,
  [ToolTier.DIAMOND]: 1561,
};

/**
 * Static definition of an item type.
 * One instance per unique item ID is stored in the ItemRegistry.
 */
export interface Item {
  /** Unique numeric identifier for the item. */
  id: number;

  /** Human-readable name (e.g. "Oak Planks", "Wooden Pickaxe"). */
  name: string;

  /** Maximum number of this item that can occupy a single inventory slot. */
  stackSize: number;

  /** If true this item can be placed as a block in the world. */
  isBlock: boolean;

  /** The BlockType this item places. Only relevant when `isBlock` is true. */
  blockType?: BlockType;

  /** Tool category. Only relevant for tool items. */
  toolType?: ToolType;

  /** Material tier. Only relevant for tool items. */
  toolTier?: ToolTier;

  /** Maximum durability. Only relevant for items that can break with use. */
  durability?: number;
}
