import { CHUNK_SIZE, CHUNK_HEIGHT } from '@/utils/Constants';
import { BlockType } from '@/types/BlockType';
import type { Chunk } from '@/world/Chunk';

// ---------------------------------------------------------------------------
// Tree types (matches biome expectations)
// ---------------------------------------------------------------------------

export enum TreeType {
  OAK,
  BIRCH,
  SPRUCE,
}

// ---------------------------------------------------------------------------
// TreeGenerator
// ---------------------------------------------------------------------------

/**
 * Places individual trees of various types into a chunk.  All coordinates
 * passed to `generateTree` are **local** to the chunk (0..CHUNK_SIZE-1 for
 * x/z, 0..CHUNK_HEIGHT-1 for y).
 *
 * Blocks that would fall outside the chunk boundaries are silently skipped so
 * that trees near a chunk border do not cause out-of-bounds writes.  Adjacent
 * chunks will independently attempt to place their own trees, producing the
 * occasional "cut" trunk at a border.  This is an acceptable trade-off for a
 * per-chunk generation pipeline.
 */
export class TreeGenerator {
  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Place a tree rooted at `(localX, y, localZ)` inside `chunk`.
   *
   * @param chunk    The target chunk.
   * @param localX   Local x coordinate of the trunk base (0..15).
   * @param y        Y coordinate of the trunk base (the block *above* ground).
   * @param localZ   Local z coordinate of the trunk base (0..15).
   * @param treeType Which tree species to place.
   * @param rng      Seeded random function returning [0, 1).
   */
  generateTree(
    chunk: Chunk,
    localX: number,
    y: number,
    localZ: number,
    treeType: TreeType,
    rng: () => number,
  ): void {
    switch (treeType) {
      case TreeType.OAK:
        this.placeOakTree(chunk, localX, y, localZ, rng);
        break;
      case TreeType.BIRCH:
        this.placeBirchTree(chunk, localX, y, localZ, rng);
        break;
      case TreeType.SPRUCE:
        this.placeSpruceTree(chunk, localX, y, localZ, rng);
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Oak tree – 4-6 block trunk, spherical leaf canopy
  // -----------------------------------------------------------------------

  private placeOakTree(
    chunk: Chunk,
    lx: number,
    y: number,
    lz: number,
    rng: () => number,
  ): void {
    const trunkHeight = 4 + Math.floor(rng() * 3); // 4-6
    const leafRadius = 2;

    // Trunk
    for (let dy = 0; dy < trunkHeight; dy++) {
      this.setIfInBounds(chunk, lx, y + dy, lz, BlockType.WOOD_OAK);
    }

    // Leaf sphere centred at the top of the trunk
    const leafCenterY = y + trunkHeight - 1;
    this.placeLeafSphere(chunk, lx, leafCenterY, lz, leafRadius, BlockType.LEAVES_OAK);
  }

  // -----------------------------------------------------------------------
  // Birch tree – 5-7 block trunk, spherical leaf canopy
  // -----------------------------------------------------------------------

  private placeBirchTree(
    chunk: Chunk,
    lx: number,
    y: number,
    lz: number,
    rng: () => number,
  ): void {
    const trunkHeight = 5 + Math.floor(rng() * 3); // 5-7
    const leafRadius = 2;

    // Trunk
    for (let dy = 0; dy < trunkHeight; dy++) {
      this.setIfInBounds(chunk, lx, y + dy, lz, BlockType.WOOD_BIRCH);
    }

    // Leaf sphere
    const leafCenterY = y + trunkHeight - 1;
    this.placeLeafSphere(chunk, lx, leafCenterY, lz, leafRadius, BlockType.LEAVES_BIRCH);
  }

  // -----------------------------------------------------------------------
  // Spruce tree – 6-9 block trunk, conical leaves
  // -----------------------------------------------------------------------

  private placeSpruceTree(
    chunk: Chunk,
    lx: number,
    y: number,
    lz: number,
    rng: () => number,
  ): void {
    const trunkHeight = 6 + Math.floor(rng() * 4); // 6-9
    const leafStartOffset = 2; // Leaves begin 2 blocks above the base

    // Trunk
    for (let dy = 0; dy < trunkHeight; dy++) {
      this.setIfInBounds(chunk, lx, y + dy, lz, BlockType.WOOD_SPRUCE);
    }

    // Conical leaves (widest at the bottom, tapering to the top)
    const leafBottomY = y + leafStartOffset;
    const leafTopY = y + trunkHeight; // One block above the trunk top
    const totalLeafLayers = leafTopY - leafBottomY + 1;

    for (let ly = leafBottomY; ly <= leafTopY; ly++) {
      // Radius shrinks linearly from bottom to top
      const layerIndex = ly - leafBottomY; // 0 at bottom
      const fraction = layerIndex / Math.max(totalLeafLayers - 1, 1);
      const radius = Math.max(Math.round((1 - fraction) * 3), 0);

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // Skip corners for a more rounded cone shape
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && radius > 1) {
            continue;
          }
          // Don't overwrite the trunk block
          if (dx === 0 && dz === 0 && ly < y + trunkHeight) {
            continue;
          }
          this.setIfInBounds(chunk, lx + dx, ly, lz + dz, BlockType.LEAVES_SPRUCE);
        }
      }
    }

    // Top cap: single leaf block above the topmost trunk block
    this.setIfInBounds(chunk, lx, leafTopY + 1, lz, BlockType.LEAVES_SPRUCE);
  }

  // -----------------------------------------------------------------------
  // Shared helpers
  // -----------------------------------------------------------------------

  /**
   * Place a rough sphere of leaf blocks centred on (cx, cy, cz).
   * Leaves never overwrite solid trunk blocks.
   */
  private placeLeafSphere(
    chunk: Chunk,
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    leafBlock: BlockType,
  ): void {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius + 1; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq > (radius + 0.5) * (radius + 0.5)) {
            continue;
          }

          const bx = cx + dx;
          const by = cy + dy;
          const bz = cz + dz;

          // Only place leaf if the target is currently AIR
          if (this.isInBounds(bx, by, bz)) {
            const existing = chunk.getBlock(bx, by, bz);
            if (existing === BlockType.AIR) {
              chunk.setBlock(bx, by, bz, leafBlock);
            }
          }
        }
      }
    }
  }

  /**
   * Set a block only if the coordinates fall within the chunk.
   */
  private setIfInBounds(
    chunk: Chunk,
    lx: number,
    y: number,
    lz: number,
    block: BlockType,
  ): void {
    if (this.isInBounds(lx, y, lz)) {
      chunk.setBlock(lx, y, lz, block);
    }
  }

  /**
   * Returns true when (lx, y, lz) is inside valid chunk dimensions.
   */
  private isInBounds(lx: number, y: number, lz: number): boolean {
    return (
      lx >= 0 &&
      lx < CHUNK_SIZE &&
      lz >= 0 &&
      lz < CHUNK_SIZE &&
      y >= 0 &&
      y < CHUNK_HEIGHT
    );
  }
}
