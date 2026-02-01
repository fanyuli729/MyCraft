import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '@/utils/Constants';
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
// CaveGenerator – cheese / spaghetti hybrid approach
// ---------------------------------------------------------------------------

/**
 * Carves caves into an already-filled chunk by sampling two 3D simplex-noise
 * fields ("cheese" and "spaghetti") and removing blocks where the combined
 * value exceeds a threshold.
 *
 * - **Cheese caves** produce large open caverns (low-frequency noise).
 * - **Spaghetti caves** produce winding tunnel networks (higher-frequency
 *   noise whose absolute value is thresholded to create thin tubes).
 *
 * Caves are only carved between y = 5 and y = 128 (inclusive).  Bedrock
 * and the deepest layers are left intact to prevent falling into the void.
 */
export class CaveGenerator {
  private cheeseNoise: NoiseFunction3D;
  private spaghettiNoise1: NoiseFunction3D;
  private spaghettiNoise2: NoiseFunction3D;

  // Noise sampling scales
  private static readonly CHEESE_SCALE = 0.012;
  private static readonly SPAGHETTI_SCALE = 0.035;

  // Thresholds
  private static readonly CHEESE_THRESHOLD = 0.65;
  private static readonly SPAGHETTI_THRESHOLD = 0.06;

  // Vertical bounds for cave carving
  private static readonly MIN_Y = 5;
  private static readonly MAX_Y = 128;

  constructor(seed: number) {
    this.cheeseNoise = createNoise3D(mulberry32(seed + 100));
    this.spaghettiNoise1 = createNoise3D(mulberry32(seed + 200));
    this.spaghettiNoise2 = createNoise3D(mulberry32(seed + 300));
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Carve caves into `chunk`.
   *
   * @param chunk  The chunk whose blocks will be modified in-place.
   * @param worldX The world-space X coordinate of the chunk origin
   *               (i.e. `chunk.cx * CHUNK_SIZE`).
   * @param worldZ The world-space Z coordinate of the chunk origin
   *               (i.e. `chunk.cz * CHUNK_SIZE`).
   */
  carve(chunk: Chunk, worldX: number, worldZ: number): void {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = worldX + lx;
        const wz = worldZ + lz;

        for (let y = CaveGenerator.MIN_Y; y <= CaveGenerator.MAX_Y; y++) {
          if (this.shouldCarve(wx, y, wz)) {
            const existing = chunk.getBlock(lx, y, lz);

            // Never carve water or bedrock
            if (existing === BlockType.WATER || existing === BlockType.BEDROCK) {
              continue;
            }

            chunk.setBlock(lx, y, lz, BlockType.AIR);
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Returns `true` when the block at (wx, y, wz) should be carved away.
   *
   * Two independent tests – one for cheese caverns and one for spaghetti
   * tunnels.  A block is carved if *either* test passes.
   */
  private shouldCarve(wx: number, y: number, wz: number): boolean {
    // --- Cheese cavern test ---
    const cheese = this.cheeseNoise(
      wx * CaveGenerator.CHEESE_SCALE,
      y * CaveGenerator.CHEESE_SCALE,
      wz * CaveGenerator.CHEESE_SCALE,
    );

    if (cheese > CaveGenerator.CHEESE_THRESHOLD) {
      return true;
    }

    // --- Spaghetti tunnel test ---
    // Two perpendicular noise fields – a block is carved only when *both*
    // absolute values are below the spaghetti threshold, which produces
    // thin, winding tunnels at the intersection of two iso-surfaces.
    const sp1 = this.spaghettiNoise1(
      wx * CaveGenerator.SPAGHETTI_SCALE,
      y * CaveGenerator.SPAGHETTI_SCALE,
      wz * CaveGenerator.SPAGHETTI_SCALE,
    );
    const sp2 = this.spaghettiNoise2(
      wx * CaveGenerator.SPAGHETTI_SCALE,
      y * CaveGenerator.SPAGHETTI_SCALE,
      wz * CaveGenerator.SPAGHETTI_SCALE,
    );

    if (
      Math.abs(sp1) < CaveGenerator.SPAGHETTI_THRESHOLD &&
      Math.abs(sp2) < CaveGenerator.SPAGHETTI_THRESHOLD
    ) {
      return true;
    }

    return false;
  }
}
