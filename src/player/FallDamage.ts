import { Player } from '@/player/Player';
import { BlockType } from '@/types/BlockType';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Blocks of free-fall before damage begins. */
const SAFE_FALL_DISTANCE = 3;

/** Maximum damage that can be dealt by a single fall. */
const MAX_FALL_DAMAGE = 20;

// ---------------------------------------------------------------------------
// FallDamage
// ---------------------------------------------------------------------------

/**
 * Tracks the player's accumulated fall distance and deals damage when the
 * player becomes grounded after falling more than {@link SAFE_FALL_DISTANCE}
 * blocks.
 *
 * Water negates all fall damage and resets the tracker.
 *
 * Usage:
 *   const fallDamage = new FallDamage();
 *   // Each physics tick:
 *   const dmg = fallDamage.update(player, wasGroundedLastFrame);
 *   if (dmg > 0) player.health -= dmg;
 */
export class FallDamage {
  /** Height at which the current fall began (world Y). */
  private fallStartY = 0;

  /** Whether the player was airborne during the previous frame. */
  private wasFalling = false;

  /**
   * Update fall tracking and return the damage to apply this frame.
   *
   * @param player        The live player instance.
   * @param wasGrounded   Whether the player was grounded during the previous
   *                      physics step (before the current one resolved).
   * @returns Damage in half-hearts (0 if no landing this frame).
   */
  update(player: Player, wasGrounded: boolean): number {
    const isGrounded = player.grounded;
    const isInWater = false; // Placeholder -- water detection depends on world query

    // ----- Water resets fall tracking --------------------------------------
    if (isInWater) {
      this.wasFalling = false;
      this.fallStartY = player.position.y;
      return 0;
    }

    // ----- Transition: grounded -> airborne --------------------------------
    if (wasGrounded && !isGrounded) {
      this.fallStartY = player.position.y;
      this.wasFalling = true;
      return 0;
    }

    // ----- While airborne: track highest point (jump arcs) -----------------
    if (!isGrounded) {
      if (player.position.y > this.fallStartY) {
        // Still ascending -- update origin so only the downward portion counts.
        this.fallStartY = player.position.y;
      }
      this.wasFalling = true;
      return 0;
    }

    // ----- Transition: airborne -> grounded (landing) ----------------------
    if (this.wasFalling && isGrounded) {
      const fallDistance = this.fallStartY - player.position.y;
      this.wasFalling = false;
      this.fallStartY = player.position.y;

      if (fallDistance > SAFE_FALL_DISTANCE) {
        const rawDamage = Math.floor(fallDistance - SAFE_FALL_DISTANCE);
        return Math.min(rawDamage, MAX_FALL_DAMAGE);
      }
    }

    return 0;
  }

  /**
   * Reset all tracking state. Call this when teleporting the player or
   * entering creative mode.
   */
  reset(player: Player): void {
    this.wasFalling = false;
    this.fallStartY = player.position.y;
  }
}
