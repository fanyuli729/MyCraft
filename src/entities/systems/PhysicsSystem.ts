import { defineQuery, IWorld } from 'bitecs';
import {
  Transform,
  Velocity,
  Gravity,
} from '@/entities/ECSWorld';
import { GRAVITY } from '@/utils/Constants';
import { BlockType } from '@/types/BlockType';
import { BlockRegistry } from '@/world/BlockRegistry';

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

const physicsQuery = defineQuery([Transform, Velocity, Gravity]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Type for the world accessor function injected by MobManager so that
 * this module does not depend directly on the (potentially absent) World
 * class.
 */
export type BlockGetter = (x: number, y: number, z: number) => BlockType;

/**
 * Check whether a block at the given world coordinates is solid.
 */
function isSolid(getBlock: BlockGetter, x: number, y: number, z: number): boolean {
  const type = getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  return BlockRegistry.isSolid(type);
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

/**
 * Applies gravity, integrates velocity, and resolves simple voxel collisions
 * for every entity that has Transform + Velocity + Gravity.
 *
 * @param world    bitecs world
 * @param dt       frame delta time in seconds
 * @param getBlock world block accessor (injected to avoid circular deps)
 */
export function physicsSystem(
  world: IWorld,
  dt: number,
  getBlock: BlockGetter,
): void {
  const entities = physicsQuery(world);

  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i];

    // ----- Gravity -----
    Velocity.y[eid] += GRAVITY * dt;

    // Clamp terminal velocity
    if (Velocity.y[eid] < -78) {
      Velocity.y[eid] = -78;
    }

    // ----- Integrate Y -----
    const newY = Transform.y[eid] + Velocity.y[eid] * dt;

    // Ground collision: check block directly below feet
    const feetBlockY = Math.floor(newY);
    const blockBelow = isSolid(
      getBlock,
      Transform.x[eid],
      feetBlockY,
      Transform.z[eid],
    );

    if (blockBelow && Velocity.y[eid] <= 0) {
      // Snap to top of the solid block
      Transform.y[eid] = feetBlockY + 1;
      Velocity.y[eid] = 0;
      Gravity.grounded[eid] = 1;
    } else {
      Transform.y[eid] = newY;
      Gravity.grounded[eid] = 0;
    }

    // ----- Integrate X (with simple collision) -----
    const newX = Transform.x[eid] + Velocity.x[eid] * dt;
    const bodyY1 = Math.floor(Transform.y[eid]);
    const bodyY2 = Math.floor(Transform.y[eid] + 1); // mobs are ~2 blocks tall

    const solidAtNewX =
      isSolid(getBlock, newX, bodyY1, Transform.z[eid]) ||
      isSolid(getBlock, newX, bodyY2, Transform.z[eid]);

    if (solidAtNewX) {
      Velocity.x[eid] = 0;
    } else {
      Transform.x[eid] = newX;
    }

    // ----- Integrate Z (with simple collision) -----
    const newZ = Transform.z[eid] + Velocity.z[eid] * dt;

    const solidAtNewZ =
      isSolid(getBlock, Transform.x[eid], bodyY1, newZ) ||
      isSolid(getBlock, Transform.x[eid], bodyY2, newZ);

    if (solidAtNewZ) {
      Velocity.z[eid] = 0;
    } else {
      Transform.z[eid] = newZ;
    }

    // ----- Friction / drag on ground -----
    if (Gravity.grounded[eid]) {
      Velocity.x[eid] *= 0.8;
      Velocity.z[eid] *= 0.8;
    }
  }
}
