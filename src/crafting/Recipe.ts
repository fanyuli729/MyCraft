/**
 * A shaped crafting recipe.
 *
 * The `pattern` is a 2D grid (`height` rows x `width` columns).
 * Each cell contains an item ID that must be present in the corresponding
 * crafting grid position, or `null` for an empty cell.
 *
 * When checking a crafting grid against the recipe, the grid pattern is
 * first normalised (leading/trailing empty rows and columns removed)
 * before comparison.
 */
export interface Recipe {
  /** Number of columns in the pattern. */
  width: number;

  /** Number of rows in the pattern. */
  height: number;

  /**
   * 2D grid indexed as pattern[row][col].
   * A value of `null` means "this cell must be empty".
   */
  pattern: (number | null)[][];

  /** The item produced and how many are created per craft. */
  result: {
    itemId: number;
    count: number;
  };
}
