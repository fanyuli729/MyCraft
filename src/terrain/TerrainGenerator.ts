import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL } from '@/utils/Constants';
import { BlockType } from '@/types/BlockType';
import type { Chunk } from '@/world/Chunk';

import { BiomeMap, Biome } from '@/terrain/BiomeMap';
import { CaveGenerator } from '@/terrain/CaveGenerator';
import { OreGenerator } from '@/terrain/OreGenerator';
import { TreeGenerator, TreeType } from '@/terrain/TreeGenerator';
import { StructureGenerator } from '@/terrain/StructureGenerator';

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
// Per-biome height configuration
// ---------------------------------------------------------------------------

interface BiomeHeightConfig {
  /** Minimum surface height for this biome. */
  minHeight: number;
  /** Maximum surface height for this biome. */
  maxHeight: number;
  /** Amplitude multiplier applied to the noise value. */
  amplitude: number;
}

const BIOME_HEIGHT: Record<Biome, BiomeHeightConfig> = {
  [Biome.PLAINS]:    { minHeight: 60,  maxHeight: 72,  amplitude: 0.5  },
  [Biome.FOREST]:    { minHeight: 62,  maxHeight: 76,  amplitude: 0.55 },
  [Biome.DESERT]:    { minHeight: 62,  maxHeight: 68,  amplitude: 0.25 },
  [Biome.TAIGA]:     { minHeight: 62,  maxHeight: 76,  amplitude: 0.55 },
  [Biome.MOUNTAINS]: { minHeight: 70,  maxHeight: 130, amplitude: 1.0  },
  [Biome.OCEAN]:     { minHeight: 30,  maxHeight: 58,  amplitude: 0.6  },
  [Biome.BEACH]:     { minHeight: 60,  maxHeight: 64,  amplitude: 0.15 },
  [Biome.TUNDRA]:    { minHeight: 62,  maxHeight: 70,  amplitude: 0.35 },
};

// ---------------------------------------------------------------------------
// TerrainGenerator
// ---------------------------------------------------------------------------

/**
 * Main terrain-generation pipeline.  Given an empty `Chunk` it will:
 *
 * 1. Build a heightmap using multi-octave 2D simplex noise shaped by biome.
 * 2. Fill the column (bedrock, stone, biome-specific surface layers, water).
 * 3. Carve caves.
 * 4. Scatter ore veins.
 * 5. Place trees.
 * 6. Place small surface structures (flowers, tall grass, cacti).
 */
export class TerrainGenerator {
  private seed: number;

  // Sub-generators
  private biomeMap: BiomeMap;
  private caveGenerator: CaveGenerator;
  private oreGenerator: OreGenerator;
  private treeGenerator: TreeGenerator;
  private structureGenerator: StructureGenerator;

  // Multi-octave noise layers for the base heightmap
  private noiseOctaves: NoiseFunction2D[];
  private static readonly OCTAVE_COUNT = 6;

  // Additional noise for mountains (continent-scale)
  private mountainNoise: NoiseFunction2D;
  private static readonly MOUNTAIN_SCALE = 0.001;
  private static readonly MOUNTAIN_THRESHOLD = 0.45;

  constructor(seed: number) {
    this.seed = seed;

    // --- Sub-generators ----
    this.biomeMap = new BiomeMap(seed);
    this.caveGenerator = new CaveGenerator(seed);
    this.oreGenerator = new OreGenerator(seed);
    this.treeGenerator = new TreeGenerator();
    this.structureGenerator = new StructureGenerator(seed);

    // --- Heightmap noise octaves ---
    this.noiseOctaves = [];
    for (let i = 0; i < TerrainGenerator.OCTAVE_COUNT; i++) {
      this.noiseOctaves.push(createNoise2D(mulberry32(seed + 1000 + i * 7)));
    }

    // --- Mountain continent noise ---
    this.mountainNoise = createNoise2D(mulberry32(seed + 5000));
  }

  // -----------------------------------------------------------------------
  // Public accessors
  // -----------------------------------------------------------------------

  getBiomeMap(): BiomeMap {
    return this.biomeMap;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Fully generate the contents of `chunk`.
   */
  generateChunk(chunk: Chunk): void {
    const worldX = chunk.cx * CHUNK_SIZE;
    const worldZ = chunk.cz * CHUNK_SIZE;

    // 1. Build heightmap + fill solid blocks
    const heightmap = this.buildTerrain(chunk, worldX, worldZ);

    // 2. Carve caves
    this.caveGenerator.carve(chunk, worldX, worldZ);

    // 3. Scatter ores
    this.oreGenerator.generate(chunk, worldX, worldZ);

    // 4. Place trees
    this.placeTrees(chunk, heightmap, worldX, worldZ);

    // 5. Surface decorations (flowers, grass, cacti)
    this.structureGenerator.generate(chunk, heightmap, this.biomeMap, worldX, worldZ);
  }

  // -----------------------------------------------------------------------
  // Heightmap + column fill
  // -----------------------------------------------------------------------

  /**
   * Computes the heightmap and fills every column of the chunk with the
   * appropriate blocks.  Returns the heightmap so subsequent passes can
   * use it.
   */
  private buildTerrain(
    chunk: Chunk,
    worldX: number,
    worldZ: number,
  ): number[][] {
    const heightmap: number[][] = [];

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      heightmap[lx] = [];
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = worldX + lx;
        const wz = worldZ + lz;

        // Determine effective biome (apply mountain override)
        let biome = this.biomeMap.getBiome(wx, wz);
        if (
          biome !== Biome.OCEAN &&
          biome !== Biome.BEACH &&
          this.isMountainRegion(wx, wz)
        ) {
          biome = Biome.MOUNTAINS;
        }

        // Sample multi-octave noise in [0, 1]
        const noiseVal = this.sampleHeightNoise(wx, wz);

        // Map noise to biome-specific height range
        const cfg = BIOME_HEIGHT[biome];
        const range = cfg.maxHeight - cfg.minHeight;
        const surfaceHeight = Math.floor(
          cfg.minHeight + noiseVal * range * cfg.amplitude +
          (1 - cfg.amplitude) * range * 0.5,
        );

        // Clamp
        const clampedHeight = Math.max(1, Math.min(surfaceHeight, CHUNK_HEIGHT - 1));
        heightmap[lx][lz] = clampedHeight;

        // Fill the column
        this.fillColumn(chunk, lx, lz, clampedHeight, biome);
      }
    }

    return heightmap;
  }

  /**
   * Multi-octave 2D simplex noise.  Returns a value in roughly [0, 1].
   */
  private sampleHeightNoise(wx: number, wz: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 0.005; // base frequency
    let maxAmplitude = 0;

    for (let i = 0; i < TerrainGenerator.OCTAVE_COUNT; i++) {
      value += this.noiseOctaves[i](wx * frequency, wz * frequency) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= 0.5;   // persistence
      frequency *= 2.0;   // lacunarity
    }

    // Normalize to [0, 1]
    return (value / maxAmplitude + 1) * 0.5;
  }

  /**
   * Returns true when the given world position should be classified as
   * MOUNTAINS, based on a separate continent-scale noise layer.
   */
  private isMountainRegion(wx: number, wz: number): boolean {
    const n = this.mountainNoise(
      wx * TerrainGenerator.MOUNTAIN_SCALE,
      wz * TerrainGenerator.MOUNTAIN_SCALE,
    );
    return (n + 1) * 0.5 > TerrainGenerator.MOUNTAIN_THRESHOLD;
  }

  // -----------------------------------------------------------------------
  // Column fill
  // -----------------------------------------------------------------------

  /**
   * Fill a single column from bedrock to sky based on the computed surface
   * height and the biome.
   */
  private fillColumn(
    chunk: Chunk,
    lx: number,
    lz: number,
    surfaceHeight: number,
    biome: Biome,
  ): void {
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      if (y === 0) {
        // Bedrock floor
        chunk.setBlock(lx, y, lz, BlockType.BEDROCK);
      } else if (y < surfaceHeight - 4) {
        // Deep stone layer
        chunk.setBlock(lx, y, lz, BlockType.STONE);
      } else if (y < surfaceHeight) {
        // Sub-surface fill (biome dependent)
        chunk.setBlock(lx, y, lz, this.getSubSurfaceBlock(biome));
      } else if (y === surfaceHeight) {
        // Surface block
        chunk.setBlock(lx, y, lz, this.getSurfaceBlock(biome));
      } else if (y <= SEA_LEVEL && biome === Biome.OCEAN) {
        // Water above ocean floor up to sea level
        chunk.setBlock(lx, y, lz, BlockType.WATER);
      } else if (y <= SEA_LEVEL && surfaceHeight < SEA_LEVEL) {
        // Water for any column that dips below sea level (rivers, lakes)
        chunk.setBlock(lx, y, lz, BlockType.WATER);
      } else {
        // Air
        chunk.setBlock(lx, y, lz, BlockType.AIR);
      }
    }
  }

  /**
   * Returns the topmost surface block for a biome.
   */
  private getSurfaceBlock(biome: Biome): BlockType {
    switch (biome) {
      case Biome.PLAINS:
      case Biome.FOREST:
        return BlockType.GRASS;
      case Biome.DESERT:
        return BlockType.SAND;
      case Biome.TAIGA:
        return BlockType.GRASS;
      case Biome.MOUNTAINS:
        return BlockType.STONE;
      case Biome.OCEAN:
        return BlockType.SAND;
      case Biome.BEACH:
        return BlockType.SAND;
      case Biome.TUNDRA:
        return BlockType.SNOW;
      default:
        return BlockType.GRASS;
    }
  }

  /**
   * Returns the block used for the 4 layers just below the surface.
   */
  private getSubSurfaceBlock(biome: Biome): BlockType {
    switch (biome) {
      case Biome.DESERT:
      case Biome.BEACH:
        return BlockType.SAND;
      case Biome.OCEAN:
        return BlockType.SAND;
      case Biome.MOUNTAINS:
        return BlockType.STONE;
      case Biome.TUNDRA:
        return BlockType.DIRT;
      default:
        return BlockType.DIRT;
    }
  }

  // -----------------------------------------------------------------------
  // Tree placement
  // -----------------------------------------------------------------------

  /**
   * Iterates over every column of the chunk, decides whether a tree should
   * be placed there, and if so picks the appropriate species for the biome.
   */
  private placeTrees(
    chunk: Chunk,
    heightmap: number[][],
    worldX: number,
    worldZ: number,
  ): void {
    const rng = this.chunkRng(worldX, worldZ);

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = worldX + lx;
        const wz = worldZ + lz;

        let biome = this.biomeMap.getBiome(wx, wz);
        if (
          biome !== Biome.OCEAN &&
          biome !== Biome.BEACH &&
          this.isMountainRegion(wx, wz)
        ) {
          biome = Biome.MOUNTAINS;
        }

        const surfaceY = heightmap[lx][lz];

        // Skip columns that are under water
        if (surfaceY < SEA_LEVEL && biome === Biome.OCEAN) continue;

        // Skip edge columns to avoid trunk overflow issues (leaves are OK)
        if (lx < 2 || lx > CHUNK_SIZE - 3 || lz < 2 || lz > CHUNK_SIZE - 3) {
          // Trees at the very edge would have their trunk in-bounds but most
          // leaves outside; still allow them – TreeGenerator clips to bounds.
        }

        const treeInfo = this.shouldPlaceTree(biome, rng);
        if (treeInfo === null) continue;

        // Ensure the surface block is appropriate (not water, not sand, etc.)
        const surfaceBlock = chunk.getBlock(lx, surfaceY, lz);
        if (
          surfaceBlock !== BlockType.GRASS &&
          surfaceBlock !== BlockType.DIRT &&
          surfaceBlock !== BlockType.SNOW
        ) {
          continue;
        }

        this.treeGenerator.generateTree(
          chunk,
          lx,
          surfaceY + 1,
          lz,
          treeInfo,
          rng,
        );
      }
    }
  }

  /**
   * Determines whether a tree should be placed at the current column and, if
   * so, which type.  Returns `null` when no tree should be placed.
   */
  private shouldPlaceTree(biome: Biome, rng: () => number): TreeType | null {
    const roll = rng();

    switch (biome) {
      case Biome.FOREST:
        // Dense forest: ~8 % chance
        if (roll < 0.08) return rng() < 0.7 ? TreeType.OAK : TreeType.BIRCH;
        return null;

      case Biome.PLAINS:
        // Sparse trees: ~1 %
        if (roll < 0.01) return TreeType.OAK;
        return null;

      case Biome.TAIGA:
        // Coniferous forest: ~6 %
        if (roll < 0.06) return TreeType.SPRUCE;
        return null;

      case Biome.MOUNTAINS:
        // Occasional spruce at lower altitudes
        if (roll < 0.02) return TreeType.SPRUCE;
        return null;

      case Biome.TUNDRA:
        // Very rare spruce
        if (roll < 0.005) return TreeType.SPRUCE;
        return null;

      default:
        return null;
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Per-chunk deterministic PRNG.
   */
  private chunkRng(worldX: number, worldZ: number): () => number {
    let h = this.seed;
    h = (h ^ (worldX * 374761393)) | 0;
    h = (h ^ (worldZ * 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
    return mulberry32(h);
  }
}
