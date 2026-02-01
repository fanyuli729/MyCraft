import { BlockType } from '@/types/BlockType';
import { Block, BlockTextureFaces, ToolType } from '@/world/Block';

/**
 * Central, read-only registry that maps every BlockType to its Block definition.
 *
 * Usage:
 *   const block = BlockRegistry.get(BlockType.STONE);
 *   console.log(block.name); // "Stone"
 */
class BlockRegistryImpl {
  private blocks: Map<BlockType, Block> = new Map();

  /** Register a new block definition. Called only during initialisation below. */
  register(
    id: BlockType,
    name: string,
    transparent: boolean,
    solid: boolean,
    hardness: number,
    toolType: ToolType,
    textureFaces: BlockTextureFaces,
    lightEmission = 0,
  ): void {
    this.blocks.set(id, {
      id,
      name,
      transparent,
      solid,
      hardness,
      toolType,
      textureFaces,
      lightEmission,
    });
  }

  /** Retrieve the Block definition for a given BlockType. */
  get(type: BlockType): Block {
    const block = this.blocks.get(type);
    if (!block) {
      throw new Error(`BlockRegistry: unknown block type ${type}`);
    }
    return block;
  }

  /** Check whether a type has been registered. */
  has(type: BlockType): boolean {
    return this.blocks.has(type);
  }

  /** Return the texture string for a specific face of a block. */
  getTexture(type: BlockType, face: 'top' | 'bottom' | 'side'): string {
    const block = this.get(type);
    const faces = block.textureFaces;
    if (faces.all) return faces.all;
    return (faces as Record<string, string | undefined>)[face] ?? faces.side ?? 'missing';
  }

  /** Check whether a block type is transparent (for face culling). */
  isTransparent(type: BlockType): boolean {
    if (type === BlockType.AIR) return true;
    return this.has(type) ? this.get(type).transparent : false;
  }

  /** Check whether a block type is solid (for collision). */
  isSolid(type: BlockType): boolean {
    if (type === BlockType.AIR) return false;
    return this.has(type) ? this.get(type).solid : true;
  }
}

export const BlockRegistry = new BlockRegistryImpl();

// ---------------------------------------------------------------------------
// Register all blocks
// ---------------------------------------------------------------------------
// Params: id, name, transparent, solid, hardness, toolType, textureFaces

// --- Air (empty) ---
BlockRegistry.register(
  BlockType.AIR, 'Air', true, false, 0, 'none',
  { all: 'air' },
);

// --- Natural stone ---
BlockRegistry.register(
  BlockType.STONE, 'Stone', false, true, 1.5, 'pickaxe',
  { all: 'stone' },
);

BlockRegistry.register(
  BlockType.COBBLESTONE, 'Cobblestone', false, true, 2.0, 'pickaxe',
  { all: 'cobblestone' },
);

BlockRegistry.register(
  BlockType.BEDROCK, 'Bedrock', false, true, -1, 'none',
  { all: 'bedrock' },
);

// --- Terrain ---
BlockRegistry.register(
  BlockType.DIRT, 'Dirt', false, true, 0.5, 'shovel',
  { all: 'dirt' },
);

BlockRegistry.register(
  BlockType.GRASS, 'Grass Block', false, true, 0.6, 'shovel',
  { top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
);

BlockRegistry.register(
  BlockType.SAND, 'Sand', false, true, 0.5, 'shovel',
  { all: 'sand' },
);

BlockRegistry.register(
  BlockType.SAND_STONE, 'Sandstone', false, true, 0.8, 'pickaxe',
  { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone_side' },
);

BlockRegistry.register(
  BlockType.GRAVEL, 'Gravel', false, true, 0.6, 'shovel',
  { all: 'gravel' },
);

BlockRegistry.register(
  BlockType.SNOW, 'Snow', false, true, 0.2, 'shovel',
  { all: 'snow' },
);

// --- Water / Ice ---
BlockRegistry.register(
  BlockType.WATER, 'Water', true, false, 0, 'none',
  { all: 'water' },
);

BlockRegistry.register(
  BlockType.ICE, 'Ice', true, true, 0.5, 'pickaxe',
  { all: 'ice' },
);

// --- Wood (Oak) ---
BlockRegistry.register(
  BlockType.WOOD_OAK, 'Oak Wood', false, true, 2.0, 'axe',
  { top: 'oak_log_top', bottom: 'oak_log_top', side: 'oak_log_side' },
);

BlockRegistry.register(
  BlockType.LEAVES_OAK, 'Oak Leaves', true, true, 0.2, 'shears',
  { all: 'oak_leaves' },
);

BlockRegistry.register(
  BlockType.PLANKS_OAK, 'Oak Planks', false, true, 2.0, 'axe',
  { all: 'oak_planks' },
);

// --- Wood (Birch) ---
BlockRegistry.register(
  BlockType.WOOD_BIRCH, 'Birch Wood', false, true, 2.0, 'axe',
  { top: 'birch_log_top', bottom: 'birch_log_top', side: 'birch_log_side' },
);

BlockRegistry.register(
  BlockType.LEAVES_BIRCH, 'Birch Leaves', true, true, 0.2, 'shears',
  { all: 'birch_leaves' },
);

// --- Wood (Spruce) ---
BlockRegistry.register(
  BlockType.WOOD_SPRUCE, 'Spruce Wood', false, true, 2.0, 'axe',
  { top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log_side' },
);

BlockRegistry.register(
  BlockType.LEAVES_SPRUCE, 'Spruce Leaves', true, true, 0.2, 'shears',
  { all: 'spruce_leaves' },
);

// --- Ores ---
BlockRegistry.register(
  BlockType.COAL_ORE, 'Coal Ore', false, true, 3.0, 'pickaxe',
  { all: 'coal_ore' },
);

BlockRegistry.register(
  BlockType.IRON_ORE, 'Iron Ore', false, true, 3.0, 'pickaxe',
  { all: 'iron_ore' },
);

BlockRegistry.register(
  BlockType.GOLD_ORE, 'Gold Ore', false, true, 3.0, 'pickaxe',
  { all: 'gold_ore' },
);

BlockRegistry.register(
  BlockType.DIAMOND_ORE, 'Diamond Ore', false, true, 3.0, 'pickaxe',
  { all: 'diamond_ore' },
);

// --- Crafted / Utility ---
BlockRegistry.register(
  BlockType.CRAFTING_TABLE, 'Crafting Table', false, true, 2.5, 'axe',
  { top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side' },
);

BlockRegistry.register(
  BlockType.FURNACE, 'Furnace', false, true, 3.5, 'pickaxe',
  { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side' },
);

BlockRegistry.register(
  BlockType.GLASS, 'Glass', true, true, 0.3, 'none',
  { all: 'glass' },
);

// --- Decorative / Non-solid ---
BlockRegistry.register(
  BlockType.TORCH, 'Torch', true, false, 0, 'none',
  { all: 'torch' },
  14,
);

BlockRegistry.register(
  BlockType.TALL_GRASS, 'Tall Grass', true, false, 0, 'shears',
  { all: 'tall_grass' },
);

BlockRegistry.register(
  BlockType.FLOWER_RED, 'Red Flower', true, false, 0, 'none',
  { all: 'flower_red' },
);

BlockRegistry.register(
  BlockType.FLOWER_YELLOW, 'Yellow Flower', true, false, 0, 'none',
  { all: 'flower_yellow' },
);

BlockRegistry.register(
  BlockType.CACTUS, 'Cactus', true, true, 0.4, 'none',
  { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' },
);
