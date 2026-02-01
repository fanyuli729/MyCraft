import { ItemStack } from '@/items/ItemStack';
import { Recipe } from '@/crafting/Recipe';

/**
 * A crafting grid of configurable size (2x2 for player inventory,
 * 3x3 for the Crafting Table).
 */
export class CraftingGrid {
  /** 2D array indexed as grid[row][col]. */
  readonly grid: (ItemStack | null)[][];

  /** Number of rows and columns. */
  readonly size: number;

  constructor(size: number) {
    this.size = size;
    this.grid = [];
    for (let r = 0; r < size; r++) {
      this.grid.push(new Array<ItemStack | null>(size).fill(null));
    }
  }

  // ---------------------------------------------------------------------------
  // Slot access
  // ---------------------------------------------------------------------------

  setSlot(row: number, col: number, stack: ItemStack | null): void {
    if (row < 0 || row >= this.size || col < 0 || col >= this.size) return;
    if (stack && stack.isEmpty()) {
      this.grid[row][col] = null;
    } else {
      this.grid[row][col] = stack;
    }
  }

  getSlot(row: number, col: number): ItemStack | null {
    if (row < 0 || row >= this.size || col < 0 || col >= this.size) return null;
    return this.grid[row][col];
  }

  /** Remove all items from the grid. */
  clear(): void {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        this.grid[r][c] = null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Recipe matching
  // ---------------------------------------------------------------------------

  /**
   * Check the current grid contents against the provided list of recipes.
   *
   * @returns The crafting result if a recipe matches, or null.
   */
  getResult(recipes: Recipe[]): { itemId: number; count: number } | null {
    const normalised = this.normalise();
    if (!normalised) return null;

    const { pattern, width, height } = normalised;

    for (const recipe of recipes) {
      if (recipe.width !== width || recipe.height !== height) continue;

      let match = true;
      for (let r = 0; r < height && match; r++) {
        for (let c = 0; c < width && match; c++) {
          const expected = recipe.pattern[r][c];
          const actual = pattern[r][c];

          if (expected === null && actual === null) continue;
          if (expected !== null && actual !== null && expected === actual) continue;
          match = false;
        }
      }

      if (match) {
        return { itemId: recipe.result.itemId, count: recipe.result.count };
      }
    }

    return null;
  }

  /**
   * Consume one item from every occupied grid slot.
   * Call this after a successful craft to deduct ingredients.
   */
  consumeIngredients(): void {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const stack = this.grid[r][c];
        if (stack && !stack.isEmpty()) {
          stack.count -= 1;
          if (stack.isEmpty()) {
            this.grid[r][c] = null;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Produce a trimmed representation of the grid by removing empty
   * rows and columns from all four edges.
   *
   * Returns null if the grid is entirely empty.
   */
  private normalise(): {
    pattern: (number | null)[][];
    width: number;
    height: number;
  } | null {
    // Determine bounding box of non-empty cells.
    let minRow = this.size;
    let maxRow = -1;
    let minCol = this.size;
    let maxCol = -1;

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const stack = this.grid[r][c];
        if (stack && !stack.isEmpty()) {
          if (r < minRow) minRow = r;
          if (r > maxRow) maxRow = r;
          if (c < minCol) minCol = c;
          if (c > maxCol) maxCol = c;
        }
      }
    }

    if (maxRow === -1) return null; // grid is empty

    const height = maxRow - minRow + 1;
    const width = maxCol - minCol + 1;
    const pattern: (number | null)[][] = [];

    for (let r = minRow; r <= maxRow; r++) {
      const row: (number | null)[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const stack = this.grid[r][c];
        row.push(stack && !stack.isEmpty() ? stack.itemId : null);
      }
      pattern.push(row);
    }

    return { pattern, width, height };
  }
}
