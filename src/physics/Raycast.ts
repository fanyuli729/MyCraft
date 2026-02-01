import * as THREE from 'three';
import { BlockRegistry } from '@/world/BlockRegistry';
import type { World } from '@/world/World';

/**
 * Information about a ray-block intersection.
 */
export interface RaycastHit {
  /** Integer block coordinates of the block that was hit. */
  blockX: number;
  blockY: number;
  blockZ: number;

  /**
   * Unit normal of the face of the block that was hit.
   * Used to determine the adjacent block for placement.
   */
  faceNormal: THREE.Vector3;

  /** Distance from the ray origin to the hit point. */
  distance: number;
}

/**
 * DDA (Amanatides & Woo) voxel traversal raycast.
 *
 * Steps through voxels along a ray and returns the first solid block
 * that is hit, along with the face normal for block placement.
 *
 * @param world       The voxel world to test against.
 * @param origin      Ray origin in world space.
 * @param direction   Ray direction (does not need to be normalised).
 * @param maxDistance  Maximum distance to traverse.
 * @returns           A {@link RaycastHit} or null if nothing was hit.
 */
export function raycast(
  world: World,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
): RaycastHit | null {
  // Normalise direction
  const dir = direction.clone().normalize();

  // Current voxel (integer coords)
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  // Step direction per axis (+1 or -1)
  const stepX = dir.x >= 0 ? 1 : -1;
  const stepY = dir.y >= 0 ? 1 : -1;
  const stepZ = dir.z >= 0 ? 1 : -1;

  // Distance along the ray to cross one full voxel on each axis.
  // Use a large sentinel when a component is zero (ray is parallel to that axis).
  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : 1e30;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : 1e30;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : 1e30;

  // Distance to the *next* voxel boundary on each axis.
  const tMaxX = dir.x !== 0
    ? ((stepX > 0 ? (x + 1 - origin.x) : (origin.x - x)) * tDeltaX)
    : 1e30;
  const tMaxY = dir.y !== 0
    ? ((stepY > 0 ? (y + 1 - origin.y) : (origin.y - y)) * tDeltaY)
    : 1e30;
  const tMaxZ = dir.z !== 0
    ? ((stepZ > 0 ? (z + 1 - origin.z) : (origin.z - z)) * tDeltaZ)
    : 1e30;

  let tmx = tMaxX;
  let tmy = tMaxY;
  let tmz = tMaxZ;

  // Track which axis was last stepped (for face normal).
  // -1 = none yet, 0 = X, 1 = Y, 2 = Z
  let steppedAxis = -1;

  // Distance traversed so far.
  let t = 0;

  // Maximum number of steps to prevent infinite loops.
  const maxSteps = Math.ceil(maxDistance * 3) + 1;

  for (let i = 0; i < maxSteps; i++) {
    // Check current voxel (skip the origin voxel check only on the very
    // first iteration if we want to allow standing inside a block, but
    // for a standard raycast we check every voxel including the start).
    const blockType = world.getBlock(x, y, z);
    if (BlockRegistry.isSolid(blockType)) {
      const faceNormal = new THREE.Vector3(0, 0, 0);
      if (steppedAxis === 0) faceNormal.x = -stepX;
      else if (steppedAxis === 1) faceNormal.y = -stepY;
      else if (steppedAxis === 2) faceNormal.z = -stepZ;

      return { blockX: x, blockY: y, blockZ: z, faceNormal, distance: t };
    }

    // Advance to the next voxel boundary on the closest axis.
    if (tmx < tmy) {
      if (tmx < tmz) {
        t = tmx;
        if (t > maxDistance) return null;
        x += stepX;
        tmx += tDeltaX;
        steppedAxis = 0;
      } else {
        t = tmz;
        if (t > maxDistance) return null;
        z += stepZ;
        tmz += tDeltaZ;
        steppedAxis = 2;
      }
    } else {
      if (tmy < tmz) {
        t = tmy;
        if (t > maxDistance) return null;
        y += stepY;
        tmy += tDeltaY;
        steppedAxis = 1;
      } else {
        t = tmz;
        if (t > maxDistance) return null;
        z += stepZ;
        tmz += tDeltaZ;
        steppedAxis = 2;
      }
    }
  }

  return null;
}
