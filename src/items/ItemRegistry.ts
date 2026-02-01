import { BlockType } from '@/types/BlockType';
import { Item, ToolType, ToolTier, TOOL_DURABILITY } from '@/items/Item';

/**
 * Central registry that maps numeric item IDs to their Item definitions.
 *
 * ID ranges:
 *   1 --  30 : Block items  (matches BlockType enum values)
 * 101 -- 120 : Tool items
 * 200+       : Miscellaneous items
 */
class ItemRegistry {
  private items: Map<number, Item> = new Map();
  private nameIndex: Map<string, Item> = new Map();

  /** Register a single item definition. */
  register(item: Item): void {
    this.items.set(item.id, item);
    this.nameIndex.set(item.name.toLowerCase(), item);
  }

  /** Retrieve an item by its numeric ID. */
  getItem(id: number): Item | undefined {
    return this.items.get(id);
  }

  /** Retrieve an item by its human-readable name (case-insensitive). */
  getItemByName(name: string): Item | undefined {
    return this.nameIndex.get(name.toLowerCase());
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------
export const itemRegistry = new ItemRegistry();

// ---------------------------------------------------------------------------
// Helper to register a block item whose ID mirrors a BlockType value.
// ---------------------------------------------------------------------------
function registerBlock(blockType: BlockType, name: string, stackSize = 64): void {
  itemRegistry.register({
    id: blockType,
    name,
    stackSize,
    isBlock: true,
    blockType,
  });
}

// ---------------------------------------------------------------------------
// Helper to register a tool item.
// ---------------------------------------------------------------------------
function registerTool(
  id: number,
  name: string,
  toolType: ToolType,
  toolTier: ToolTier,
): void {
  itemRegistry.register({
    id,
    name,
    stackSize: 1,
    isBlock: false,
    toolType,
    toolTier,
    durability: TOOL_DURABILITY[toolTier],
  });
}

// ---------------------------------------------------------------------------
// Helper to register a generic (misc) item.
// ---------------------------------------------------------------------------
function registerMisc(id: number, name: string, stackSize = 64): void {
  itemRegistry.register({
    id,
    name,
    stackSize,
    isBlock: false,
  });
}

// ===========================================================================
// Block Items  (IDs 1 -- 30, matching BlockType enum)
// ===========================================================================
registerBlock(BlockType.STONE, 'Stone');
registerBlock(BlockType.DIRT, 'Dirt');
registerBlock(BlockType.GRASS, 'Grass Block');
registerBlock(BlockType.SAND, 'Sand');
registerBlock(BlockType.WATER, 'Water');
registerBlock(BlockType.WOOD_OAK, 'Oak Wood');
registerBlock(BlockType.LEAVES_OAK, 'Oak Leaves');
registerBlock(BlockType.WOOD_BIRCH, 'Birch Wood');
registerBlock(BlockType.LEAVES_BIRCH, 'Birch Leaves');
registerBlock(BlockType.WOOD_SPRUCE, 'Spruce Wood');
registerBlock(BlockType.LEAVES_SPRUCE, 'Spruce Leaves');
registerBlock(BlockType.COAL_ORE, 'Coal Ore');
registerBlock(BlockType.IRON_ORE, 'Iron Ore');
registerBlock(BlockType.GOLD_ORE, 'Gold Ore');
registerBlock(BlockType.DIAMOND_ORE, 'Diamond Ore');
registerBlock(BlockType.BEDROCK, 'Bedrock');
registerBlock(BlockType.GRAVEL, 'Gravel');
registerBlock(BlockType.COBBLESTONE, 'Cobblestone');
registerBlock(BlockType.PLANKS_OAK, 'Oak Planks');
registerBlock(BlockType.CRAFTING_TABLE, 'Crafting Table');
registerBlock(BlockType.FURNACE, 'Furnace');
registerBlock(BlockType.GLASS, 'Glass');
registerBlock(BlockType.TORCH, 'Torch');
registerBlock(BlockType.TALL_GRASS, 'Tall Grass');
registerBlock(BlockType.FLOWER_RED, 'Red Flower');
registerBlock(BlockType.FLOWER_YELLOW, 'Yellow Flower');
registerBlock(BlockType.CACTUS, 'Cactus');
registerBlock(BlockType.SNOW, 'Snow');
registerBlock(BlockType.ICE, 'Ice');
registerBlock(BlockType.SAND_STONE, 'Sandstone');

// ===========================================================================
// Tool Items  (IDs 101 -- 120)
// ===========================================================================

// --- Wooden tools (101 -- 104) ---
registerTool(101, 'Wooden Pickaxe', ToolType.PICKAXE, ToolTier.WOOD);
registerTool(102, 'Wooden Axe', ToolType.AXE, ToolTier.WOOD);
registerTool(103, 'Wooden Shovel', ToolType.SHOVEL, ToolTier.WOOD);
registerTool(104, 'Wooden Sword', ToolType.SWORD, ToolTier.WOOD);

// --- Stone tools (105 -- 108) ---
registerTool(105, 'Stone Pickaxe', ToolType.PICKAXE, ToolTier.STONE);
registerTool(106, 'Stone Axe', ToolType.AXE, ToolTier.STONE);
registerTool(107, 'Stone Shovel', ToolType.SHOVEL, ToolTier.STONE);
registerTool(108, 'Stone Sword', ToolType.SWORD, ToolTier.STONE);

// --- Iron tools (109 -- 112) ---
registerTool(109, 'Iron Pickaxe', ToolType.PICKAXE, ToolTier.IRON);
registerTool(110, 'Iron Axe', ToolType.AXE, ToolTier.IRON);
registerTool(111, 'Iron Shovel', ToolType.SHOVEL, ToolTier.IRON);
registerTool(112, 'Iron Sword', ToolType.SWORD, ToolTier.IRON);

// --- Gold tools (113 -- 116) ---
registerTool(113, 'Gold Pickaxe', ToolType.PICKAXE, ToolTier.GOLD);
registerTool(114, 'Gold Axe', ToolType.AXE, ToolTier.GOLD);
registerTool(115, 'Gold Shovel', ToolType.SHOVEL, ToolTier.GOLD);
registerTool(116, 'Gold Sword', ToolType.SWORD, ToolTier.GOLD);

// --- Diamond tools (117 -- 120) ---
registerTool(117, 'Diamond Pickaxe', ToolType.PICKAXE, ToolTier.DIAMOND);
registerTool(118, 'Diamond Axe', ToolType.AXE, ToolTier.DIAMOND);
registerTool(119, 'Diamond Shovel', ToolType.SHOVEL, ToolTier.DIAMOND);
registerTool(120, 'Diamond Sword', ToolType.SWORD, ToolTier.DIAMOND);

// ===========================================================================
// Miscellaneous Items  (IDs 200+)
// ===========================================================================
registerMisc(200, 'Stick');
registerMisc(201, 'Coal');
registerMisc(202, 'Iron Ingot');
registerMisc(203, 'Gold Ingot');
registerMisc(204, 'Diamond');
registerMisc(205, 'Bread');
registerMisc(206, 'Apple');
registerMisc(207, 'Raw Beef');
registerMisc(208, 'Raw Porkchop');
registerMisc(209, 'Raw Chicken');
registerMisc(210, 'Rotten Flesh');
registerMisc(211, 'Bone');
registerMisc(212, 'Cooked Beef');
registerMisc(213, 'Cooked Porkchop');
registerMisc(214, 'Cooked Chicken');
