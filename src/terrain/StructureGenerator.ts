import { CHUNK_SIZE } from '@/utils/Constants';
import { BlockType } from '@/types/BlockType';
import { Biome, BiomeMap } from '@/terrain/BiomeMap';
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
// StructureGenerator
// ---------------------------------------------------------------------------

/**
 * Places small biome-appropriate decorations on the surface of an already-
 * generated chunk: tall grass, flowers, and cacti.
 *
 * This is intentionally run *after* trees so that flowers are not placed
 * underneath canopies (where a trunk block was set).
 */
export class StructureGenerator {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Scatter surface decorations across the chunk.
   *
   * @param chunk     The chunk to modify in-place.
   * @param heightmap 2-D array [x][z] of surface heights (the y of the top
   *                  solid block).  Dimensions: CHUNK_SIZE x CHUNK_SIZE.
   * @param biomeMap  The world BiomeMap for biome lookups.
   * @param worldX    World-space X of the chunk origin.
   * @param worldZ    World-space Z of the chunk origin.
   */
  generate(
    chunk: Chunk,
    heightmap: number[][],
    biomeMap: BiomeMap,
    worldX: number,
    worldZ: number,
  ): void {
    const rng = this.chunkRng(worldX, worldZ);

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = worldX + lx;
        const wz = worldZ + lz;
        const surfaceY = heightmap[lx][lz];
        const biome = biomeMap.getBiome(wx, wz);

        // The block above the surface must be AIR for us to place anything.
        const placeY = surfaceY + 1;
        if (placeY >= 256) continue;
        if (chunk.getBlock(lx, placeY, lz) !== BlockType.AIR) continue;

        switch (biome) {
          case Biome.PLAINS:
            this.decoratePlains(chunk, lx, placeY, lz, rng);
            break;
          case Biome.FOREST:
            this.decorateForest(chunk, lx, placeY, lz, rng);
            break;
          case Biome.DESERT:
            this.decorateDesert(chunk, lx, placeY, lz, surfaceY, rng);
            break;
          case Biome.TAIGA:
            this.decorateTaiga(chunk, lx, placeY, lz, rng);
            break;
          case Biome.TUNDRA:
            this.decorateTundra(chunk, lx, placeY, lz, rng);
            break;
          // MOUNTAINS, OCEAN, BEACH get no small decorations by default.
          default:
            break;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Per-biome decoration logic
  // -----------------------------------------------------------------------

  /** Plains: tall grass (30 %) and occasional flowers (5 %). */
  private decoratePlains(
    chunk: Chunk,
    lx: number,
    y: number,
    lz: number,
    rng: () => number,
  ): void {
    const roll = rng();
    if (roll < 0.30) {
      chunk.setBlock(lx, y, lz, BlockType.TALL_GRASS);
    } else if (roll < 0.33) {
      chunk.setBlock(lx, y, lz, rng() < 0.5 ? BlockType.FLOWER_RED : BlockType.FLOWER_YELLOW);
    }
  }

  /** Forest: taller grass density (35 %) and more flowers (8 %). */
  private decorateForest(
    chunk: Chunk,
    lx: number,
    y: number,
    lz: number,
    rng: () => number,
  ): void {
    const roll = rng();
    if (roll < 0.35) {
      chunk.setBlock(lx, y, lz, BlockType.TALL_GRASS);
    } else if (roll < 0.43) {
      chunk.setBlock(lx, y, lz, rng() < 0.5 ? BlockType.FLOWER_RED : BlockType.FLOWER_YELLOW);
    }
  }

  /** Desert: cacti (2 %) that grow 2-3 blocks tall. */
  private decorateDesert(
    chunk: Chunk,
    lx: number,
    y: number,
    lz: number,
    surfaceY: number,
    rng: () => number,
  ): void {
    if (rng() >= 0.02) return;

    // Ensure there is no adjacent cactus (cacti require space on all 4 sides)
    if (!this.hasClearNeighbours(chunk, lx, y, lz)) return;

    const height = 2 + Math.floor(rng() * 2); // 2-3
    for (let dy = 0; dy < height; dy++) {
      if (y + dy >= 256) break;
      chunk.setBlock(lx, y + dy, lz, BlockType.CACTUS);
    }
  }

  /** Taiga: sparse tall grass (15 %). */
  private decorateTaiga(
    chunk: Chunk,
    lx: number,
    y: number,
    lz: number,
    rng: () => number,
  ): void {
    if (rng() < 0.15) {
      chunk.setBlock(lx, y, lz, BlockType.TALL_GRASS);
    }
  }

  /** Tundra: very sparse flowers (2 %). */
  private decorateTundra(
    chunk: Chunk,
    lx: number,
    y: number,
    lz: number,
    rng: () => number,
  ): void {
    if (rng() < 0.02) {
      chunk.setBlock(lx, y, lz, BlockType.FLOWER_YELLOW);
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Checks that the four horizontal neighbours of (lx, y, lz) are AIR so
   * that a cactus can be placed there.
   */
  private hasClearNeighbours(
    chunk: Chunk,
    lx: number,
    y: number,
    lz: number,
  ): boolean {
    const neighbours: [number, number][] = [
      [lx - 1, lz],
      [lx + 1, lz],
      [lx, lz - 1],
      [lx, lz + 1],
    ];
    for (const [nx, nz] of neighbours) {
      if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) {
        // Chunk border – allow placement (we can't check the neighbour chunk).
        continue;
      }
      if (chunk.getBlock(nx, y, nz) !== BlockType.AIR) {
        return false;
      }
    }
    return true;
  }

  /**
   * Per-chunk deterministic seed derived from world seed + chunk coords.
   */
  private chunkRng(worldX: number, worldZ: number): () => number {
    let h = this.seed;
    h = (h ^ (worldX * 374761393)) | 0;
    h = (h ^ (worldZ * 668265263)) | 0;
    h = (Math.imul(h ^ (h >>> 13), 1274126177) + 0xa5b3c2d1) | 0;
    return mulberry32(h);
  }
}
