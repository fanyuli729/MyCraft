import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';

// ---------------------------------------------------------------------------
// Biome enum
// ---------------------------------------------------------------------------

export enum Biome {
  PLAINS,
  FOREST,
  DESERT,
  TAIGA,
  MOUNTAINS,
  OCEAN,
  BEACH,
  TUNDRA,
}

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
// BiomeMap
// ---------------------------------------------------------------------------

/**
 * Uses two independent 2D simplex-noise fields (temperature & moisture) to
 * classify every (worldX, worldZ) position into a biome via a simplified
 * Whittaker diagram.
 */
export class BiomeMap {
  private temperatureNoise: NoiseFunction2D;
  private moistureNoise: NoiseFunction2D;

  /** Scale factor applied to world coords before sampling noise. */
  private static readonly TEMPERATURE_SCALE = 0.0008;
  private static readonly MOISTURE_SCALE = 0.0006;

  constructor(seed: number) {
    // Derive two distinct RNG streams so the two noise fields are uncorrelated.
    const rngTemp = mulberry32(seed);
    const rngMoist = mulberry32(seed + 31337);

    this.temperatureNoise = createNoise2D(rngTemp);
    this.moistureNoise = createNoise2D(rngMoist);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Temperature value in [0, 1] for the given world position.
   * 0 = coldest, 1 = hottest.
   */
  getTemperature(worldX: number, worldZ: number): number {
    const raw = this.temperatureNoise(
      worldX * BiomeMap.TEMPERATURE_SCALE,
      worldZ * BiomeMap.TEMPERATURE_SCALE,
    );
    // Map from [-1, 1] to [0, 1]
    return (raw + 1) * 0.5;
  }

  /**
   * Moisture value in [0, 1] for the given world position.
   * 0 = driest, 1 = wettest.
   */
  getMoisture(worldX: number, worldZ: number): number {
    const raw = this.moistureNoise(
      worldX * BiomeMap.MOISTURE_SCALE,
      worldZ * BiomeMap.MOISTURE_SCALE,
    );
    return (raw + 1) * 0.5;
  }

  /**
   * Determine the biome at a given world position using a Whittaker-style
   * diagram that maps (temperature, moisture) to a biome.
   *
   * Temperature axis (0 = cold, 1 = hot):
   *   [0.00 - 0.20] Cold
   *   [0.20 - 0.45] Cool
   *   [0.45 - 0.70] Warm
   *   [0.70 - 1.00] Hot
   *
   * Moisture axis (0 = dry, 1 = wet):
   *   [0.00 - 0.25] Arid
   *   [0.25 - 0.50] Dry
   *   [0.50 - 0.75] Moist
   *   [0.75 - 1.00] Wet
   */
  getBiome(worldX: number, worldZ: number): Biome {
    const temp = this.getTemperature(worldX, worldZ);
    const moist = this.getMoisture(worldX, worldZ);

    // ------- Very wet => ocean or beach ---------
    if (moist > 0.78) {
      if (moist > 0.85) {
        return Biome.OCEAN;
      }
      return Biome.BEACH;
    }

    // ------- Cold band --------
    if (temp < 0.2) {
      return Biome.TUNDRA;
    }

    // ------- Cool band --------
    if (temp < 0.45) {
      if (moist > 0.5) {
        return Biome.TAIGA;
      }
      return Biome.TUNDRA;
    }

    // ------- Warm band --------
    if (temp < 0.7) {
      if (moist > 0.55) {
        return Biome.FOREST;
      }
      if (moist > 0.3) {
        return Biome.PLAINS;
      }
      return Biome.PLAINS;
    }

    // ------- Hot band --------
    if (moist > 0.55) {
      return Biome.FOREST;
    }
    if (moist > 0.35) {
      return Biome.PLAINS;
    }
    return Biome.DESERT;
  }

  // -----------------------------------------------------------------------
  // Mountains override – called by the terrain generator.  A separate
  // continent-scale noise decides whether an area is mountainous regardless
  // of temperature / moisture.
  // -----------------------------------------------------------------------

  /**
   * Helper: returns true when the given position should be classified as
   * MOUNTAINS.  The terrain generator will call this *after* the base biome
   * lookup so that mountains can override any biome except OCEAN / BEACH.
   *
   * (The mountain noise is kept separate so the Whittaker diagram stays
   *  clean.)
   */
  // Mountains are handled externally by TerrainGenerator via its own noise.
}
