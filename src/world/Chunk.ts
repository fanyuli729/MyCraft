import { CHUNK_SIZE, CHUNK_HEIGHT } from '@/utils/Constants';
import { BlockType } from '@/types/BlockType';

/** Total number of blocks stored in one chunk. */
const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

/**
 * A 16 x 256 x 16 chunk of voxel data backed by a flat Uint8Array.
 *
 * Block data is indexed in XZY order (Y changes fastest, then Z, then X)
 * which gives good cache locality for vertical column operations such as
 * terrain generation and lighting propagation.
 *
 * Usage:
 *   const chunk = new Chunk(0, 0);
 *   chunk.setBlock(4, 64, 7, BlockType.STONE);
 *   const type = chunk.getBlock(4, 64, 7); // BlockType.STONE
 */
export class Chunk {
  /** Chunk coordinate on the X axis (world X = cx * CHUNK_SIZE). */
  readonly cx: number;

  /** Chunk coordinate on the Z axis (world Z = cz * CHUNK_SIZE). */
  readonly cz: number;

  /** Flat array holding one byte per block (block type ID). */
  readonly data: Uint8Array;

  /**
   * When true the chunk's mesh is out of date and needs to be rebuilt.
   * Set automatically by {@link setBlock}; cleared by the mesher.
   */
  dirty: boolean;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK_VOLUME);
    this.dirty = true;
  }

  // -----------------------------------------------------------------------
  // Indexing
  // -----------------------------------------------------------------------

  /**
   * Convert chunk-local coordinates to a flat array index.
   *
   * Layout: index = x * (CHUNK_SIZE * CHUNK_HEIGHT) + z * CHUNK_HEIGHT + y
   *
   * @param x Local X in [0, CHUNK_SIZE)
   * @param y World Y in [0, CHUNK_HEIGHT)
   * @param z Local Z in [0, CHUNK_SIZE)
   */
  static getIndex(x: number, y: number, z: number): number {
    return (x * CHUNK_SIZE + z) * CHUNK_HEIGHT + y;
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /**
   * Return the BlockType at a chunk-local position.
   * Returns AIR for out-of-bounds coordinates.
   */
  getBlock(x: number, y: number, z: number): BlockType {
    if (!Chunk.inBounds(x, y, z)) return BlockType.AIR;
    return this.data[Chunk.getIndex(x, y, z)] as BlockType;
  }

  /**
   * Set the BlockType at a chunk-local position.
   * Silently ignores out-of-bounds writes.
   * Marks the chunk as dirty so its mesh will be rebuilt.
   */
  setBlock(x: number, y: number, z: number, type: BlockType): void {
    if (!Chunk.inBounds(x, y, z)) return;
    const idx = Chunk.getIndex(x, y, z);
    if (this.data[idx] !== type) {
      this.data[idx] = type;
      this.dirty = true;
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /** Check whether local coordinates are within the chunk boundaries. */
  static inBounds(x: number, y: number, z: number): boolean {
    return (
      x >= 0 && x < CHUNK_SIZE &&
      y >= 0 && y < CHUNK_HEIGHT &&
      z >= 0 && z < CHUNK_SIZE
    );
  }

  /** Fill the entire chunk with a single block type (useful for tests). */
  fill(type: BlockType): void {
    this.data.fill(type);
    this.dirty = true;
  }
}
