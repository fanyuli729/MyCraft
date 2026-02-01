import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '@/utils/Constants';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum number of new chunk meshes that may be uploaded per frame. */
const MAX_MESH_UPLOADS_PER_FRAME = 3;

// ---------------------------------------------------------------------------
// PerformanceManager
// ---------------------------------------------------------------------------

/**
 * Provides two complementary performance optimisations for the voxel renderer:
 *
 * 1. **Frustum culling** -- tests whether a chunk's bounding box intersects
 *    the camera frustum before deciding to render it.
 * 2. **Mesh upload throttling** -- limits the number of newly-generated chunk
 *    meshes that are added to the scene in a single frame, preventing large
 *    frame-time spikes when many chunks finish building simultaneously.
 *
 * Usage:
 *   const perf = new PerformanceManager();
 *
 *   // Once per frame, before iterating chunks:
 *   perf.update(camera);
 *
 *   // For each chunk that needs its mesh added:
 *   if (perf.shouldMeshChunk()) { scene.add(chunkMesh); }
 *
 *   // For each chunk mesh already in the scene:
 *   chunkMesh.visible = perf.isChunkVisible(camera, cx, cz);
 */
export class PerformanceManager {
  // ---- Frustum culling state ----
  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();

  // ---- Mesh upload throttling state ----
  private meshUploadsThisFrame = 0;

  // ---- Performance metrics ----

  /** Total chunks tested for visibility this frame. */
  chunksTested = 0;
  /** Chunks that passed the frustum test this frame. */
  chunksVisible = 0;
  /** Mesh uploads consumed this frame. */
  meshesUploaded = 0;

  // -----------------------------------------------------------------------
  // Per-frame update
  // -----------------------------------------------------------------------

  /**
   * Call at the start of each frame to refresh the frustum planes and
   * reset per-frame counters.
   *
   * @param camera The active perspective camera.
   */
  update(camera: THREE.Camera): void {
    // Rebuild the frustum from the camera's current projection * view matrix.
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    // Reset per-frame metrics.
    this.chunksTested = 0;
    this.chunksVisible = 0;
    this.meshesUploaded = 0;
    this.meshUploadsThisFrame = 0;
  }

  // -----------------------------------------------------------------------
  // Frustum culling
  // -----------------------------------------------------------------------

  /**
   * Test whether a chunk's axis-aligned bounding box intersects the camera
   * frustum.
   *
   * The bounding box spans:
   *   X: [chunkX * CHUNK_SIZE, chunkX * CHUNK_SIZE + CHUNK_SIZE]
   *   Y: [0, CHUNK_HEIGHT]
   *   Z: [chunkZ * CHUNK_SIZE, chunkZ * CHUNK_SIZE + CHUNK_SIZE]
   *
   * @param camera Unused when called after {@link update} (retained for
   *               a clearer public API).
   * @param chunkX Chunk coordinate on the X axis.
   * @param chunkZ Chunk coordinate on the Z axis.
   * @returns True if any part of the chunk is inside the view frustum.
   */
  isChunkVisible(camera: THREE.Camera, chunkX: number, chunkZ: number): boolean {
    this.chunksTested++;

    const minX = chunkX * CHUNK_SIZE;
    const minZ = chunkZ * CHUNK_SIZE;

    const box = new THREE.Box3(
      new THREE.Vector3(minX, 0, minZ),
      new THREE.Vector3(minX + CHUNK_SIZE, CHUNK_HEIGHT, minZ + CHUNK_SIZE),
    );

    const visible = this.frustum.intersectsBox(box);
    if (visible) {
      this.chunksVisible++;
    }

    return visible;
  }

  // -----------------------------------------------------------------------
  // Mesh upload throttling
  // -----------------------------------------------------------------------

  /**
   * Query whether another chunk mesh may be uploaded (added to the scene)
   * during the current frame.
   *
   * Call this before adding a newly built chunk mesh. If it returns false,
   * defer the upload to the next frame.
   *
   * @returns True if the per-frame upload budget has not been exhausted.
   */
  shouldMeshChunk(): boolean {
    if (this.meshUploadsThisFrame >= MAX_MESH_UPLOADS_PER_FRAME) {
      return false;
    }
    this.meshUploadsThisFrame++;
    this.meshesUploaded++;
    return true;
  }
}
