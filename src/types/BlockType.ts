/**
 * Enum of all block types in the game.
 * AIR (0) is always the empty/absent block.
 * Values are used as byte-sized IDs stored in chunk data.
 */
export enum BlockType {
  AIR = 0,
  STONE,
  DIRT,
  GRASS,
  SAND,
  WATER,
  WOOD_OAK,
  LEAVES_OAK,
  WOOD_BIRCH,
  LEAVES_BIRCH,
  WOOD_SPRUCE,
  LEAVES_SPRUCE,
  COAL_ORE,
  IRON_ORE,
  GOLD_ORE,
  DIAMOND_ORE,
  BEDROCK,
  GRAVEL,
  COBBLESTONE,
  PLANKS_OAK,
  CRAFTING_TABLE,
  FURNACE,
  GLASS,
  TORCH,
  TALL_GRASS,
  FLOWER_RED,
  FLOWER_YELLOW,
  CACTUS,
  SNOW,
  ICE,
  SAND_STONE,

  /** Convenience sentinel -- total number of block types. */
  COUNT,
}
