import { CHUNK_SIZE, CHUNK_HEIGHT } from '@/utils/Constants';

/**
 * Convert a world X or Z coordinate to the chunk coordinate that contains it.
 *
 * Uses `Math.floor` so negative coordinates work correctly:
 *   worldToChunk(-1)  => -1   (not 0)
 *   worldToChunk(0)   =>  0
 *   worldToChunk(15)  =>  0
 *   worldToChunk(16)  =>  1
 */
export function worldToChunk(v: number): number {
  return Math.floor(v / CHUNK_SIZE);
}

/**
 * Convert a world X or Z coordinate to the chunk-local [0, CHUNK_SIZE) range.
 *
 * Uses a true modulo so negative world coordinates map correctly:
 *   worldToLocal(-1) => 15
 *   worldToLocal(0)  =>  0
 *   worldToLocal(16) =>  0
 */
export function worldToLocal(v: number): number {
  return ((v % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
}

/**
 * Produce a deterministic string key for a chunk coordinate pair.
 * Used as a Map / object key for chunk storage.
 *
 *   chunkKey(3, -2) => "3,-2"
 */
export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/**
 * Convert chunk-local coordinates to a flat array index.
 *
 * Layout matches Chunk.getIndex:
 *   index = (x * CHUNK_SIZE + z) * CHUNK_HEIGHT + y
 *
 * @param x Local X in [0, CHUNK_SIZE)
 * @param y World Y in [0, CHUNK_HEIGHT)
 * @param z Local Z in [0, CHUNK_SIZE)
 */
export function localToIndex(x: number, y: number, z: number): number {
  return (x * CHUNK_SIZE + z) * CHUNK_HEIGHT + y;
}
