import * as THREE from 'three';

/**
 * Manages Three.js scene objects for chunk meshes.
 *
 * Provides a clean API for adding, removing, and updating chunk meshes
 * without the rest of the codebase needing to interact with the
 * THREE.Scene directly.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChunkMeshEntry {
  opaque: THREE.Mesh | null;
  transparent: THREE.Mesh | null;
}

// ---------------------------------------------------------------------------
// SceneManager
// ---------------------------------------------------------------------------

export class SceneManager {
  private scene: THREE.Scene;
  private chunkMeshes: Map<string, ChunkMeshEntry> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Return the underlying Three.js scene. */
  getScene(): THREE.Scene {
    return this.scene;
  }

  // -----------------------------------------------------------------------
  // Chunk mesh management
  // -----------------------------------------------------------------------

  /**
   * Add (or replace) the chunk meshes for a given chunk key.
   *
   * If meshes already exist for this key they are disposed and removed first.
   *
   * @param key               A unique string key for the chunk (e.g. "3,-2").
   * @param opaqueMesh        The opaque geometry mesh, or null.
   * @param transparentMesh   The transparent geometry mesh, or null.
   */
  addChunkMesh(
    key: string,
    opaqueMesh: THREE.Mesh | null,
    transparentMesh: THREE.Mesh | null,
  ): void {
    // Remove existing entry
    this.removeChunkMesh(key);

    const entry: ChunkMeshEntry = {
      opaque: opaqueMesh,
      transparent: transparentMesh,
    };

    if (opaqueMesh) {
      this.scene.add(opaqueMesh);
    }
    if (transparentMesh) {
      transparentMesh.renderOrder = 1; // render after opaque
      this.scene.add(transparentMesh);
    }

    this.chunkMeshes.set(key, entry);
  }

  /**
   * Remove and dispose the meshes for a given chunk key.
   * Safe to call even if no mesh is stored for the key.
   */
  removeChunkMesh(key: string): void {
    const entry = this.chunkMeshes.get(key);
    if (!entry) return;

    if (entry.opaque) {
      this.scene.remove(entry.opaque);
      entry.opaque.geometry.dispose();
    }
    if (entry.transparent) {
      this.scene.remove(entry.transparent);
      entry.transparent.geometry.dispose();
    }

    this.chunkMeshes.delete(key);
  }

  /**
   * Check whether a mesh entry exists for the given chunk key.
   */
  hasChunkMesh(key: string): boolean {
    return this.chunkMeshes.has(key);
  }

  // -----------------------------------------------------------------------
  // Per-frame update
  // -----------------------------------------------------------------------

  /**
   * Called once per frame for any per-frame scene maintenance.
   * Currently a no-op; reserved for future animated textures, water
   * animation, etc.
   */
  update(): void {
    // Reserved for per-frame scene updates (animated water UVs, etc.)
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /**
   * Remove and dispose ALL chunk meshes from the scene.
   */
  dispose(): void {
    for (const key of this.chunkMeshes.keys()) {
      this.removeChunkMesh(key);
    }
    this.chunkMeshes.clear();
  }
}
