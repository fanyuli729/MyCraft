import { BlockType } from '@/types/BlockType';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '@/utils/Constants';
import { worldToChunk, worldToLocal, chunkKey } from '@/utils/CoordUtils';
import { Chunk } from '@/world/Chunk';
import { ChunkManager } from '@/world/ChunkManager';

/**
 * High-level facade for reading and writing blocks in the voxel world.
 *
 * Translates world-space coordinates into chunk-local operations and
 * delegates to ChunkManager for chunk lifecycle management.
 */
export class World {
  private chunkManager: ChunkManager;

  constructor(chunkManager: ChunkManager) {
    this.chunkManager = chunkManager;
  }

  // -----------------------------------------------------------------------
  // Block access
  // -----------------------------------------------------------------------

  /**
   * Return the BlockType at the given world coordinates.
   *
   * Returns `BlockType.AIR` if:
   *   - the chunk containing these coordinates is not loaded, or
   *   - `y` is out of bounds [0, CHUNK_HEIGHT).
   */
  getBlock(worldX: number, worldY: number, worldZ: number): BlockType {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) return BlockType.AIR;
    return this.chunkManager.getBlock(
      Math.floor(worldX),
      Math.floor(worldY),
      Math.floor(worldZ),
    );
  }

  /**
   * Set the BlockType at the given world coordinates.
   *
   * If the target chunk is not loaded the write is silently ignored.
   * The containing chunk (and potentially its edge-adjacent neighbours)
   * will be marked dirty so their meshes are rebuilt.
   */
  setBlock(worldX: number, worldY: number, worldZ: number, blockType: BlockType): void {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) return;
    this.chunkManager.setBlock(
      Math.floor(worldX),
      Math.floor(worldY),
      Math.floor(worldZ),
      blockType,
    );
  }

  // -----------------------------------------------------------------------
  // Chunk access
  // -----------------------------------------------------------------------

  /**
   * Return the Chunk at the given chunk coordinates, or undefined if it
   * is not currently loaded.
   */
  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunkManager.getChunk(cx, cz);
  }

  /**
   * Return the Chunk that contains the given world X, Z coordinate,
   * or undefined if not loaded.
   */
  getChunkAtWorld(worldX: number, worldZ: number): Chunk | undefined {
    return this.chunkManager.getChunk(
      worldToChunk(Math.floor(worldX)),
      worldToChunk(Math.floor(worldZ)),
    );
  }

  // -----------------------------------------------------------------------
  // Convenience helpers
  // -----------------------------------------------------------------------

  /**
   * Return true if the block at the given world coordinates is solid
   * (has a collision box).
   */
  isSolid(worldX: number, worldY: number, worldZ: number): boolean {
    const type = this.getBlock(worldX, worldY, worldZ);
    if (type === BlockType.AIR) return false;
    // Delegate to ChunkManager's block info -- but as a simple fallback
    // we check against known non-solid types.
    return type !== BlockType.WATER &&
           type !== BlockType.TORCH &&
           type !== BlockType.TALL_GRASS &&
           type !== BlockType.FLOWER_RED &&
           type !== BlockType.FLOWER_YELLOW;
  }

  /**
   * Return the highest non-AIR block Y at the given world X, Z.
   * Scans downward from CHUNK_HEIGHT - 1.  Returns -1 if the column is
   * entirely air (chunk not loaded or empty).
   */
  getHeightAt(worldX: number, worldZ: number): number {
    const cx = worldToChunk(Math.floor(worldX));
    const cz = worldToChunk(Math.floor(worldZ));
    const chunk = this.chunkManager.getChunk(cx, cz);
    if (!chunk) return -1;
    const lx = worldToLocal(Math.floor(worldX));
    const lz = worldToLocal(Math.floor(worldZ));
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (chunk.getBlock(lx, y, lz) !== BlockType.AIR) {
        return y;
      }
    }
    return -1;
  }

  // -----------------------------------------------------------------------
  // Lifecycle delegation
  // -----------------------------------------------------------------------

  /**
   * Per-frame update. Delegates to ChunkManager.
   */
  update(playerX: number, playerZ: number): void {
    this.chunkManager.update(playerX, playerZ);
  }

  /**
   * Access the underlying ChunkManager (for material / fog registration, etc.).
   */
  getChunkManager(): ChunkManager {
    return this.chunkManager;
  }
}
