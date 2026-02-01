import * as THREE from 'three';
import { Player } from '@/player/Player';
import { CollisionResolver } from '@/physics/CollisionResolver';
import { GRAVITY, TERMINAL_VELOCITY } from '@/utils/Constants';
import type { World } from '@/world/World';

/**
 * Applies gravity and voxel-world collision to the player each frame.
 *
 * Call {@link update} once per game tick after the player controller has
 * set the desired horizontal velocity.
 */
export class PlayerPhysics {
  private collisionResolver = new CollisionResolver();

  /**
   * Step the physics simulation for one frame.
   *
   * @param dt     Frame delta time in seconds.
   * @param player The player state to mutate.
   * @param world  The voxel world used for collision detection.
   */
  update(dt: number, player: Player, world: World): void {
    // Clamp dt to avoid physics explosions on frame spikes.
    const clampedDt = Math.min(dt, 0.05);

    // ----- Apply gravity -----
    player.velocity.y += GRAVITY * clampedDt;

    // Clamp to terminal velocity
    if (player.velocity.y < TERMINAL_VELOCITY) {
      player.velocity.y = TERMINAL_VELOCITY;
    }

    // ----- Scale velocity by dt to get per-frame displacement -----
    const displacement = new THREE.Vector3(
      player.velocity.x * clampedDt,
      player.velocity.y * clampedDt,
      player.velocity.z * clampedDt,
    );

    // ----- Resolve collisions -----
    const aabb = player.getAABB();
    const result = this.collisionResolver.resolve(world, aabb, displacement);

    // ----- Apply results -----
    player.position.copy(result.position);
    player.grounded = result.grounded;

    // Restore the un-scaled velocity (collision resolver zeroes collided axes).
    // For X/Z the controller sets these every frame, so only Y matters.
    if (result.velocity.y === 0) {
      player.velocity.y = 0;
    }
    // If the collision resolver zeroed X or Z (e.g. walking into a wall),
    // zero those components of the velocity too.
    if (result.velocity.x === 0) {
      player.velocity.x = 0;
    }
    if (result.velocity.z === 0) {
      player.velocity.z = 0;
    }
  }
}
