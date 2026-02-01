import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE } from '@/utils/Constants';
import { chunkKey } from '@/utils/CoordUtils';
import { BlockType } from '@/types/BlockType';
import { BlockRegistry } from '@/world/BlockRegistry';
import { Chunk } from '@/world/Chunk';
import { WorkerPool } from '@/world/WorkerPool';
import { BlockInfo } from '@/world/ChunkMesher';
import { SceneManager } from '@/rendering/SceneManager';
import { createChunkMaterial, createTransparentChunkMaterial } from '@/rendering/ChunkMaterial';
import { createAtlasTexture, getTextureIndex } from '@/rendering/TextureAtlas';

// ---------------------------------------------------------------------------
// Transferable mesh data (mirrors ChunkMeshWorker output)
// ---------------------------------------------------------------------------

interface TransferableMeshData {
  positions: ArrayBuffer;
  normals: ArrayBuffer;
  uvs: ArrayBuffer;
  aos: ArrayBuffer;
  indices: ArrayBuffer;
  vertexCount: number;
  indexCount: number;
}

// ---------------------------------------------------------------------------
// ChunkManager
// ---------------------------------------------------------------------------

/**
 * Manages loading, meshing, and unloading chunks around the player.
 *
 * Responsibilities:
 *   - Track which chunks are loaded in memory (Map<string, Chunk>)
 *   - Each frame, determine which chunks need to be generated or removed
 *   - Queue dirty / new chunks for meshing via the worker pool
 *   - Create Three.js meshes from the returned geometry and add to the scene
 *   - Dispose meshes when chunks are unloaded
 */
export class ChunkManager {
  /** All currently loaded chunks, keyed by "cx,cz". */
  private chunks: Map<string, Chunk> = new Map();

  /** Set of chunk keys currently queued for meshing (to avoid duplicates). */
  private meshingInProgress: Set<string> = new Set();

  /** Worker pool for off-thread meshing. */
  private workerPool: WorkerPool;

  /** Scene manager for adding / removing meshes. */
  private sceneManager: SceneManager;

  /** Pre-computed block info array that is sent to workers. */
  private blockInfo: BlockInfo[];

  /** Shared materials. */
  private opaqueMaterial: THREE.ShaderMaterial;
  private transparentMaterial: THREE.ShaderMaterial;

  /** Atlas texture (kept so we can dispose later). */
  private atlasTexture: THREE.Texture;

  /** Callback to generate terrain for a new chunk (injected by World). */
  private generateChunk: ((chunk: Chunk) => void) | null = null;

  /** Maximum chunks to generate (terrain) per frame. */
  private readonly maxGeneratePerFrame = 3;

  /** Maximum mesh tasks to queue per frame. */
  private readonly maxMeshQueuePerFrame = 4;

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;

    // Build atlas and materials
    this.atlasTexture = createAtlasTexture();
    this.opaqueMaterial = createChunkMaterial(this.atlasTexture);
    this.transparentMaterial = createTransparentChunkMaterial(this.atlasTexture);

    // Build the block info array for workers
    this.blockInfo = this.buildBlockInfo();

    // Create the worker pool using Vite's worker import pattern
    this.workerPool = new WorkerPool(
      () => new Worker(
        new URL('./ChunkMeshWorker.ts', import.meta.url),
        { type: 'module' },
      ),
    );
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Set the terrain generation callback. Called by World during setup.
   */
  setGenerator(gen: (chunk: Chunk) => void): void {
    this.generateChunk = gen;
  }

  /**
   * Get a loaded chunk by its chunk coordinates. Returns undefined if not loaded.
   */
  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  /**
   * Iterate all loaded chunks (for serialisation, etc.).
   */
  getLoadedChunks(): IterableIterator<Chunk> {
    return this.chunks.values();
  }

  /**
   * Get a block from world coordinates across all loaded chunks.
   * Returns AIR if the chunk is not loaded or coordinates are out of range.
   */
  getBlock(wx: number, wy: number, wz: number): BlockType {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return BlockType.AIR;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.getBlock(lx, wy, lz);
  }

  /**
   * Set a block at world coordinates. Marks the containing chunk (and
   * potentially neighbouring chunks) as dirty.
   */
  setBlock(wx: number, wy: number, wz: number, type: BlockType): void {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.setBlock(lx, wy, lz, type);

    // Mark neighbouring chunks dirty if the block is on a boundary
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
  }

  /**
   * Generate a batch of chunks around the given world position during
   * initialisation. This is a synchronous operation that immediately
   * generates terrain for all chunks within render distance and queues
   * them for meshing.
   *
   * @param playerX  World X position of the player.
   * @param playerZ  World Z position of the player.
   * @param onProgress  Optional callback that receives a 0-1 progress value.
   */
  async generateInitialChunks(
    playerX: number,
    playerZ: number,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const rd = RENDER_DISTANCE;

    // Count total chunks to generate for progress reporting.
    const totalChunks = (rd * 2 + 1) * (rd * 2 + 1);
    let generated = 0;

    for (let dx = -rd; dx <= rd; dx++) {
      for (let dz = -rd; dz <= rd; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = chunkKey(cx, cz);

        if (!this.chunks.has(key)) {
          const chunk = new Chunk(cx, cz);
          if (this.generateChunk) {
            this.generateChunk(chunk);
          }
          this.chunks.set(key, chunk);
        }

        generated++;
        if (onProgress) {
          onProgress(generated / totalChunks);
        }
      }
    }

    // Queue all chunks for meshing.
    this.queueDirtyChunks(pcx, pcz, rd);
  }

  /**
   * Per-frame update. Call with the player's current world X and Z position.
   *
   * Steps:
   * 1. Generate new chunks within render distance.
   * 2. Queue dirty chunks for meshing.
   * 3. Unload chunks far from the player.
   */
  update(playerX: number, playerZ: number): void {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const rd = RENDER_DISTANCE;

    // 1. Generate new chunks
    this.generateNearbyChunks(pcx, pcz, rd);

    // 2. Queue dirty chunks for meshing (closest first)
    this.queueDirtyChunks(pcx, pcz, rd);

    // 3. Unload distant chunks
    this.unloadDistantChunks(pcx, pcz, rd + 2);
  }

  /**
   * Access the opaque material (for FogManager registration, etc.).
   */
  getOpaqueMaterial(): THREE.ShaderMaterial {
    return this.opaqueMaterial;
  }

  /**
   * Access the transparent material.
   */
  getTransparentMaterial(): THREE.ShaderMaterial {
    return this.transparentMaterial;
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.workerPool.dispose();
    this.sceneManager.dispose();
    this.opaqueMaterial.dispose();
    this.transparentMaterial.dispose();
    this.atlasTexture.dispose();
    this.chunks.clear();
    this.meshingInProgress.clear();
  }

  // -----------------------------------------------------------------------
  // Private -- chunk generation
  // -----------------------------------------------------------------------

  private generateNearbyChunks(pcx: number, pcz: number, rd: number): void {
    let generated = 0;

    // Spiral outward from the player for prioritised loading
    for (let ring = 0; ring <= rd && generated < this.maxGeneratePerFrame; ring++) {
      for (let dx = -ring; dx <= ring && generated < this.maxGeneratePerFrame; dx++) {
        for (let dz = -ring; dz <= ring && generated < this.maxGeneratePerFrame; dz++) {
          // Only process the outer edge of this ring
          if (Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;

          const cx = pcx + dx;
          const cz = pcz + dz;
          const key = chunkKey(cx, cz);

          if (!this.chunks.has(key)) {
            const chunk = new Chunk(cx, cz);
            if (this.generateChunk) {
              this.generateChunk(chunk);
            }
            this.chunks.set(key, chunk);
            generated++;
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private -- mesh queueing
  // -----------------------------------------------------------------------

  private queueDirtyChunks(pcx: number, pcz: number, rd: number): void {
    // Collect dirty chunks with their distance
    const dirtyList: { key: string; chunk: Chunk; dist: number }[] = [];

    for (const [key, chunk] of this.chunks) {
      if (!chunk.dirty) continue;
      if (this.meshingInProgress.has(key)) continue;

      const dx = chunk.cx - pcx;
      const dz = chunk.cz - pcz;
      const dist = dx * dx + dz * dz;

      if (dist <= (rd + 1) * (rd + 1)) {
        dirtyList.push({ key, chunk, dist });
      }
    }

    // Sort by distance (closest first)
    dirtyList.sort((a, b) => a.dist - b.dist);

    // Queue up to the per-frame limit
    const toQueue = Math.min(dirtyList.length, this.maxMeshQueuePerFrame);
    for (let i = 0; i < toQueue; i++) {
      const { key, chunk } = dirtyList[i];
      this.queueChunkMesh(key, chunk);
    }
  }

  private queueChunkMesh(key: string, chunk: Chunk): void {
    this.meshingInProgress.add(key);
    chunk.dirty = false;

    // Gather neighbour block data
    const neighborKeys: [number, number][] = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
    ];
    const neighbors: { [k: string]: ArrayBuffer | null } = {};
    for (const [dx, dz] of neighborKeys) {
      const nk = chunkKey(chunk.cx + dx, chunk.cz + dz);
      const nc = this.chunks.get(nk);
      // Copy the buffer so the main thread retains its copy
      neighbors[`${dx},${dz}`] = nc ? (nc.data.buffer as ArrayBuffer).slice(0) : null;
    }

    // Copy own blocks
    const blocksCopy = (chunk.data.buffer as ArrayBuffer).slice(0);

    const message = {
      type: 'mesh',
      chunkX: chunk.cx,
      chunkZ: chunk.cz,
      blocks: blocksCopy,
      neighbors,
      blockInfo: this.blockInfo,
    };

    // Transfer the copied buffers
    const transferList: Transferable[] = [blocksCopy];
    for (const buf of Object.values(neighbors)) {
      if (buf) transferList.push(buf);
    }

    this.workerPool
      .queueTask(message, transferList)
      .then((result: unknown) => {
        const res = result as {
          type: string;
          chunkX: number;
          chunkZ: number;
          opaque: TransferableMeshData;
          transparent: TransferableMeshData;
        };
        this.onMeshResult(res);
      })
      .catch((err) => {
        console.error('Chunk mesh worker error:', err);
      })
      .finally(() => {
        this.meshingInProgress.delete(key);
      });
  }

  // -----------------------------------------------------------------------
  // Private -- mesh result handling
  // -----------------------------------------------------------------------

  private onMeshResult(result: {
    chunkX: number;
    chunkZ: number;
    opaque: TransferableMeshData;
    transparent: TransferableMeshData;
  }): void {
    const key = chunkKey(result.chunkX, result.chunkZ);

    // If the chunk was unloaded while meshing, ignore the result
    if (!this.chunks.has(key)) return;

    const opaqueMesh = this.buildMesh(result.opaque, this.opaqueMaterial);
    const transparentMesh = this.buildMesh(result.transparent, this.transparentMaterial);

    this.sceneManager.addChunkMesh(key, opaqueMesh, transparentMesh);
  }

  private buildMesh(
    data: TransferableMeshData,
    material: THREE.ShaderMaterial,
  ): THREE.Mesh | null {
    if (data.vertexCount === 0 || data.indexCount === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.positions), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normals), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uvs), 2));
    geometry.setAttribute('ao', new THREE.BufferAttribute(new Float32Array(data.aos), 1));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(data.indices), 1));

    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = true;
    return mesh;
  }

  // -----------------------------------------------------------------------
  // Private -- chunk unloading
  // -----------------------------------------------------------------------

  private unloadDistantChunks(pcx: number, pcz: number, maxDist: number): void {
    const toRemove: string[] = [];
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - pcx;
      const dz = chunk.cz - pcz;
      if (dx * dx + dz * dz > maxDist * maxDist) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      this.chunks.delete(key);
      this.sceneManager.removeChunkMesh(key);
      this.meshingInProgress.delete(key);
    }
  }

  // -----------------------------------------------------------------------
  // Private -- helpers
  // -----------------------------------------------------------------------

  private markDirty(cx: number, cz: number): void {
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (chunk) chunk.dirty = true;
  }

  /**
   * Build a simplified BlockInfo[] from the BlockRegistry for worker use.
   */
  private buildBlockInfo(): BlockInfo[] {
    const info: BlockInfo[] = [];
    for (let id = 0; id < BlockType.COUNT; id++) {
      if (!BlockRegistry.has(id as BlockType)) {
        info.push({
          id,
          transparent: true,
          solid: false,
          faceTextures: { top: 0, bottom: 0, side: 0 },
        });
        continue;
      }
      const block = BlockRegistry.get(id as BlockType);
      const faces = block.textureFaces;
      const topTex = faces.all ?? faces.top ?? faces.side ?? 'missing';
      const bottomTex = faces.all ?? faces.bottom ?? faces.side ?? 'missing';
      const sideTex = faces.all ?? faces.side ?? 'missing';

      info.push({
        id,
        transparent: block.transparent,
        solid: block.solid,
        faceTextures: {
          top: getTextureIndex(topTex),
          bottom: getTextureIndex(bottomTex),
          side: getTextureIndex(sideTex),
        },
      });
    }
    return info;
  }
}
