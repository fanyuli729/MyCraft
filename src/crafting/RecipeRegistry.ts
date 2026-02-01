import { BlockType } from '@/types/BlockType';
import { Recipe } from '@/crafting/Recipe';
import { CraftingGrid } from '@/crafting/CraftingGrid';
import { ItemStack } from '@/items/ItemStack';

// ---------------------------------------------------------------------------
// Item ID aliases for readability
// ---------------------------------------------------------------------------
const PLANKS = BlockType.PLANKS_OAK;        // 19
const COBBLE = BlockType.COBBLESTONE;        // 18
const WOOD   = BlockType.WOOD_OAK;           // 6
const SAND   = BlockType.SAND;               // 4
const GLASS  = BlockType.GLASS;              // 22
const STICK  = 200;
const COAL   = 201;
const IRON   = 202;
const GOLD   = 203;
const DIAMOND = 204;

// Tool item IDs
const WOODEN_PICKAXE  = 101;
const WOODEN_AXE      = 102;
const WOODEN_SHOVEL   = 103;
const WOODEN_SWORD    = 104;
const STONE_PICKAXE   = 105;
const STONE_AXE       = 106;
const STONE_SHOVEL    = 107;
const STONE_SWORD     = 108;
const IRON_PICKAXE    = 109;
const IRON_AXE        = 110;
const IRON_SHOVEL     = 111;
const IRON_SWORD      = 112;
const GOLD_PICKAXE    = 113;
const GOLD_AXE        = 114;
const GOLD_SHOVEL     = 115;
const GOLD_SWORD      = 116;
const DIAMOND_PICKAXE = 117;
const DIAMOND_AXE     = 118;
const DIAMOND_SHOVEL  = 119;
const DIAMOND_SWORD   = 120;

// ---------------------------------------------------------------------------
// Helper to build a Recipe from a compact notation
// ---------------------------------------------------------------------------
function recipe(
  pattern: (number | null)[][],
  resultId: number,
  resultCount: number,
): Recipe {
  const height = pattern.length;
  const width = Math.max(...pattern.map((r) => r.length));

  // Pad rows to uniform width.
  const normalised = pattern.map((row) => {
    const padded = [...row];
    while (padded.length < width) padded.push(null);
    return padded;
  });

  return {
    width,
    height,
    pattern: normalised,
    result: { itemId: resultId, count: resultCount },
  };
}

// ---------------------------------------------------------------------------
// Tool recipe patterns (parameterised by material ID)
// ---------------------------------------------------------------------------
function pickaxeRecipe(mat: number, resultId: number): Recipe {
  return recipe(
    [
      [mat, mat, mat],
      [null, STICK, null],
      [null, STICK, null],
    ],
    resultId,
    1,
  );
}

function axeRecipe(mat: number, resultId: number): Recipe {
  return recipe(
    [
      [mat, mat],
      [mat, STICK],
      [null, STICK],
    ],
    resultId,
    1,
  );
}

function shovelRecipe(mat: number, resultId: number): Recipe {
  return recipe(
    [
      [mat],
      [STICK],
      [STICK],
    ],
    resultId,
    1,
  );
}

function swordRecipe(mat: number, resultId: number): Recipe {
  return recipe(
    [
      [mat],
      [mat],
      [STICK],
    ],
    resultId,
    1,
  );
}

// ===========================================================================
// RecipeRegistry
// ===========================================================================

class RecipeRegistry {
  private recipes: Recipe[] = [];

  /** Add a recipe. */
  register(r: Recipe): void {
    this.recipes.push(r);
  }

  /**
   * Search for a recipe that matches the contents of the given crafting grid.
   *
   * @returns The result (item ID + count) if found, or null.
   */
  findMatch(grid: CraftingGrid | number[][]): { itemId: number; count: number } | null {
    if (grid instanceof CraftingGrid) {
      return grid.getResult(this.recipes);
    }
    // Accept a raw 2D array of item IDs (0 or absent = empty).
    const size = grid.length;
    const cg = new CraftingGrid(size);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
        const id = grid[r][c];
        if (id && id !== 0) {
          cg.setSlot(r, c, new ItemStack(id, 1));
        }
      }
    }
    return cg.getResult(this.recipes);
  }

  /** Expose the internal list for direct grid checks if needed. */
  getAll(): readonly Recipe[] {
    return this.recipes;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
export const recipeRegistry = new RecipeRegistry();

// ===========================================================================
// Register all recipes
// ===========================================================================

// --- Basic materials ---

// 1 oak wood -> 4 oak planks
recipeRegistry.register(recipe(
  [[WOOD]],
  PLANKS,
  4,
));

// 2 planks (vertical) -> 4 sticks
recipeRegistry.register(recipe(
  [
    [PLANKS],
    [PLANKS],
  ],
  STICK,
  4,
));

// --- Wooden tools ---
recipeRegistry.register(pickaxeRecipe(PLANKS, WOODEN_PICKAXE));
recipeRegistry.register(axeRecipe(PLANKS, WOODEN_AXE));
recipeRegistry.register(shovelRecipe(PLANKS, WOODEN_SHOVEL));
recipeRegistry.register(swordRecipe(PLANKS, WOODEN_SWORD));

// --- Stone tools ---
recipeRegistry.register(pickaxeRecipe(COBBLE, STONE_PICKAXE));
recipeRegistry.register(axeRecipe(COBBLE, STONE_AXE));
recipeRegistry.register(shovelRecipe(COBBLE, STONE_SHOVEL));
recipeRegistry.register(swordRecipe(COBBLE, STONE_SWORD));

// --- Iron tools ---
recipeRegistry.register(pickaxeRecipe(IRON, IRON_PICKAXE));
recipeRegistry.register(axeRecipe(IRON, IRON_AXE));
recipeRegistry.register(shovelRecipe(IRON, IRON_SHOVEL));
recipeRegistry.register(swordRecipe(IRON, IRON_SWORD));

// --- Gold tools ---
recipeRegistry.register(pickaxeRecipe(GOLD, GOLD_PICKAXE));
recipeRegistry.register(axeRecipe(GOLD, GOLD_AXE));
recipeRegistry.register(shovelRecipe(GOLD, GOLD_SHOVEL));
recipeRegistry.register(swordRecipe(GOLD, GOLD_SWORD));

// --- Diamond tools ---
recipeRegistry.register(pickaxeRecipe(DIAMOND, DIAMOND_PICKAXE));
recipeRegistry.register(axeRecipe(DIAMOND, DIAMOND_AXE));
recipeRegistry.register(shovelRecipe(DIAMOND, DIAMOND_SHOVEL));
recipeRegistry.register(swordRecipe(DIAMOND, DIAMOND_SWORD));

// --- Utility blocks ---

// 4 planks in 2x2 -> crafting table
recipeRegistry.register(recipe(
  [
    [PLANKS, PLANKS],
    [PLANKS, PLANKS],
  ],
  BlockType.CRAFTING_TABLE,
  1,
));

// 8 cobblestone ring -> furnace
recipeRegistry.register(recipe(
  [
    [COBBLE, COBBLE, COBBLE],
    [COBBLE, null, COBBLE],
    [COBBLE, COBBLE, COBBLE],
  ],
  BlockType.FURNACE,
  1,
));

// --- Misc items ---

// 1 coal + 1 stick (vertical) -> 4 torches
recipeRegistry.register(recipe(
  [
    [COAL],
    [STICK],
  ],
  BlockType.TORCH,
  4,
));

// 3 coal (wheat placeholder) in a row -> bread
recipeRegistry.register(recipe(
  [[COAL, COAL, COAL]],
  205, // Bread
  1,
));

// 6 glass in 2 rows -> 16 glass (glass panes placeholder)
recipeRegistry.register(recipe(
  [
    [GLASS, GLASS, GLASS],
    [GLASS, GLASS, GLASS],
  ],
  GLASS,
  16,
));

// 4 sand in 2x2 -> sandstone
recipeRegistry.register(recipe(
  [
    [SAND, SAND],
    [SAND, SAND],
  ],
  BlockType.SAND_STONE,
  1,
));
