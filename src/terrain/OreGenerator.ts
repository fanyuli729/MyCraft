import { CHUNK_SIZE } from '@/utils/Constants';
import { BlockType } from '@/types/BlockType';
import type { Chunk } from '@/world/Chunk';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Ore definition
// ---------------------------------------------------------------------------

interface OreConfig {
  /** The block type to place (e.g. BlockType.COAL_ORE). */
  block: BlockType;
  /** Minimum y level (inclusive). */
  minY: number;
  /** Maximum y level (inclusive). */
  maxY: number;
  /** Minimum number of blocks per vein. */
  veinSizeMin: number;
  /** Maximum number of blocks per vein. */
  veinSizeMax: number;
  /** Average number of vein spawn attempts per chunk. */
  attemptsPerChunk: number;
}

const ORE_CONFIGS: OreConfig[] = [
  {
    block: BlockType.COAL_ORE,
    minY: 5,
    maxY: 128,
    veinSizeMin: 8,
    veinSizeMax: 12,
    attemptsPerChunk: 20,
  },
  {
    block: BlockType.IRON_ORE,
    minY: 5,
    maxY: 64,
    veinSizeMin: 4,
    veinSizeMax: 8,
    attemptsPerChunk: 16,
  },
  {
    block: BlockType.GOLD_ORE,
    minY: 5,
    maxY: 32,
    veinSizeMin: 4,
    veinSizeMax: 6,
    attemptsPerChunk: 4,
  },
  {
    block: BlockType.DIAMOND_ORE,
    minY: 5,
    maxY: 16,
    veinSizeMin: 2,
    veinSizeMax: 4,
    attemptsPerChunk: 2,
  },
];

// ---------------------------------------------------------------------------
// OreGenerator
// ---------------------------------------------------------------------------

/**
 * Scatters ore veins throughout a chunk using a seeded random walk.  Each ore
 * type has its own height band, vein size range, and spawn frequency.
 *
 * Ore blocks only replace STONE so that caves, bedrock, and surface blocks
 * are preserved.
 */
export class OreGenerator {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Populate `chunk` with ore veins.
   *
   * @param chunk  The chunk to modify in-place.
   * @param worldX World-space X of the chunk origin (`chunk.cx * CHUNK_SIZE`).
   * @param worldZ World-space Z of the chunk origin (`chunk.cz * CHUNK_SIZE`).
   */
  generate(chunk: Chunk, worldX: number, worldZ: number): void {
    // Derive a per-chunk PRNG from the world seed + chunk coordinates.
    const chunkSeed = this.hashChunkSeed(worldX, worldZ);
    const rng = mulberry32(chunkSeed);

    for (const ore of ORE_CONFIGS) {
      for (let attempt = 0; attempt < ore.attemptsPerChunk; attempt++) {
        const startX = Math.floor(rng() * CHUNK_SIZE);
        const startZ = Math.floor(rng() * CHUNK_SIZE);
        const startY =
          ore.minY + Math.floor(rng() * (ore.maxY - ore.minY + 1));

        const veinSize =
          ore.veinSizeMin +
          Math.floor(rng() * (ore.veinSizeMax - ore.veinSizeMin + 1));

        this.placeVein(chunk, rng, ore.block, startX, startY, startZ, veinSize);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Place a single ore vein using a random walk starting at (sx, sy, sz).
   * Only replaces STONE blocks; silently skips positions that are outside
   * chunk bounds or contain a different block type.
   */
  private placeVein(
    chunk: Chunk,
    rng: () => number,
    block: BlockType,
    sx: number,
    sy: number,
    sz: number,
    size: number,
  ): void {
    let x = sx;
    let y = sy;
    let z = sz;

    for (let i = 0; i < size; i++) {
      // Clamp to chunk bounds
      if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y >= 1 && y < 256) {
        if (chunk.getBlock(x, y, z) === BlockType.STONE) {
          chunk.setBlock(x, y, z, block);
        }
      }

      // Random walk: pick a random axis-aligned direction
      const dir = Math.floor(rng() * 6);
      switch (dir) {
        case 0: x += 1; break;
        case 1: x -= 1; break;
        case 2: y += 1; break;
        case 3: y -= 1; break;
        case 4: z += 1; break;
        case 5: z -= 1; break;
      }
    }
  }

  /**
   * Deterministic hash combining the world seed with chunk coordinates so
   * that every chunk gets its own reproducible RNG stream.
   */
  private hashChunkSeed(worldX: number, worldZ: number): number {
    let h = this.seed;
    h = (h ^ (worldX * 374761393)) | 0;
    h = (h ^ (worldZ * 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
    return h;
  }
}
