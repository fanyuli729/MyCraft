import * as THREE from 'three';
import { AABB } from '@/physics/AABB';
import { BlockRegistry } from '@/world/BlockRegistry';
import { CHUNK_HEIGHT } from '@/utils/Constants';
import type { World } from '@/world/World';

/**
 * Result of a collision resolution pass.
 */
export interface CollisionResult {
  /** Updated world-space position (centre X/Z, bottom Y). */
  position: THREE.Vector3;
  /** Updated velocity (zeroed on axes where a collision occurred). */
  velocity: THREE.Vector3;
  /** True when the entity was resting on a surface below it. */
  grounded: boolean;
}

/**
 * Swept AABB collision resolver against the voxel world.
 *
 * The algorithm resolves each axis independently in Y, X, Z order.
 * For every axis the AABB is expanded in the movement direction,
 * all potentially intersecting solid blocks are gathered, and the
 * movement is clipped to the nearest collision surface.
 */
export class CollisionResolver {
  /**
   * Resolve movement of an entity AABB through the world.
   *
   * @param world    The voxel world to test against.
   * @param aabb     The entity's current AABB (not mutated).
   * @param velocity Desired movement this frame (not mutated).
   * @returns        The resolved position, velocity, and grounded flag.
   */
  resolve(world: World, aabb: AABB, velocity: THREE.Vector3): CollisionResult {
    let dx = velocity.x;
    let dy = velocity.y;
    let dz = velocity.z;

    // Collect all solid block AABBs that the entity could potentially
    // collide with during this movement step.
    const blockAABBs = this.gatherBlockAABBs(world, aabb, dx, dy, dz);

    // --- Resolve Y axis first (gravity is the most important) ---
    const origDy = dy;
    for (const block of blockAABBs) {
      dy = block.clipYCollide(aabb, dy);
    }
    const resolvedAABB = aabb.offset(0, dy, 0);

    // --- Resolve X axis ---
    for (const block of blockAABBs) {
      dx = block.clipXCollide(resolvedAABB, dx);
    }
    const resolvedAABB2 = resolvedAABB.offset(dx, 0, 0);

    // --- Resolve Z axis ---
    for (const block of blockAABBs) {
      dz = block.clipZCollide(resolvedAABB2, dz);
    }

    // Determine grounded: Y was moving downward and got clipped to 0.
    const grounded = origDy < 0 && dy !== origDy;

    // Build output velocity -- zero the component on any axis that collided.
    const outVelocity = new THREE.Vector3(
      dx !== velocity.x ? 0 : velocity.x,
      dy !== origDy ? 0 : velocity.y,
      dz !== velocity.z ? 0 : velocity.z,
    );

    // Compute new position from the AABB centre/bottom.
    const halfW = (aabb.maxX - aabb.minX) / 2;
    const newPos = new THREE.Vector3(
      aabb.minX + halfW + dx,
      aabb.minY + dy,
      aabb.minZ + halfW + dz,
    );

    return { position: newPos, velocity: outVelocity, grounded };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Gather AABBs for every solid block that the entity could potentially
   * reach during the given movement step.
   */
  private gatherBlockAABBs(
    world: World,
    aabb: AABB,
    dx: number,
    dy: number,
    dz: number,
  ): AABB[] {
    const expanded = aabb.expand(dx, dy, dz);

    // Integer block coordinate ranges (inclusive).
    const minBX = Math.floor(expanded.minX);
    const maxBX = Math.floor(expanded.maxX);
    const minBY = Math.max(0, Math.floor(expanded.minY));
    const maxBY = Math.min(CHUNK_HEIGHT - 1, Math.floor(expanded.maxY));
    const minBZ = Math.floor(expanded.minZ);
    const maxBZ = Math.floor(expanded.maxZ);

    const results: AABB[] = [];

    for (let bx = minBX; bx <= maxBX; bx++) {
      for (let by = minBY; by <= maxBY; by++) {
        for (let bz = minBZ; bz <= maxBZ; bz++) {
          const blockType = world.getBlock(bx, by, bz);
          if (BlockRegistry.isSolid(blockType)) {
            results.push(AABB.fromBlock(bx, by, bz));
          }
        }
      }
    }

    return results;
  }
}
