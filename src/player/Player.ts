import * as THREE from 'three';
import { AABB } from '@/physics/AABB';
import {
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_EYE_HEIGHT,
  MAX_HEALTH,
  MAX_HUNGER,
  MAX_ARMOR,
} from '@/utils/Constants';

/**
 * Central player state object.
 *
 * Holds position, velocity, rotation, health / hunger, movement flags,
 * and the currently selected hotbar slot.  Higher-level systems
 * (controller, physics, interaction) read and write this state each frame.
 */
export class Player {
  // -----------------------------------------------------------------------
  // Spatial state
  // -----------------------------------------------------------------------

  /** World-space position (centre X/Z, feet Y). */
  readonly position: THREE.Vector3;

  /** Current velocity in m/s. */
  readonly velocity: THREE.Vector3;

  /** Horizontal rotation in radians (around world Y axis). */
  yaw = 0;

  /** Vertical rotation in radians (up/down look). */
  pitch = 0;

  // -----------------------------------------------------------------------
  // Gameplay state
  // -----------------------------------------------------------------------

  /** Current health (0 .. {@link MAX_HEALTH}). */
  health: number = MAX_HEALTH;

  /** Current hunger (0 .. {@link MAX_HUNGER}). */
  hunger: number = MAX_HUNGER;

  /** Current armor points (0 .. {@link MAX_ARMOR}). */
  armor: number = 0;

  /** Experience level (0+). */
  experienceLevel: number = 0;

  /** Experience progress toward next level (0.0 .. 1.0). */
  experienceProgress: number = 0;

  // -----------------------------------------------------------------------
  // Movement flags
  // -----------------------------------------------------------------------

  /** True when the player is resting on a solid surface below. */
  grounded = false;

  /** True while the player is sprinting. */
  sprinting = false;

  /** True while the player is sneaking (shift held). */
  sneaking = false;

  // -----------------------------------------------------------------------
  // Inventory
  // -----------------------------------------------------------------------

  /** Currently selected hotbar slot index (0 .. 8). */
  selectedSlot = 0;

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  constructor(x = 0, y = 80, z = 0) {
    this.position = new THREE.Vector3(x, y, z);
    this.velocity = new THREE.Vector3(0, 0, 0);
  }

  // -----------------------------------------------------------------------
  // Derived getters
  // -----------------------------------------------------------------------

  /**
   * Return the world-space position of the player's eyes (camera origin).
   */
  getEyePosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.position.x,
      this.position.y + PLAYER_EYE_HEIGHT,
      this.position.z,
    );
  }

  /**
   * Return the current AABB of the player, centred on X/Z and
   * bottom-aligned on Y.
   */
  getAABB(): AABB {
    return AABB.fromPositionSize(
      this.position.x,
      this.position.y,
      this.position.z,
      PLAYER_WIDTH,
      PLAYER_HEIGHT,
    );
  }

  /**
   * Return a unit vector in the direction the player is looking,
   * derived from the current yaw and pitch.
   */
  getLookDirection(): THREE.Vector3 {
    const cosPitch = Math.cos(this.pitch);
    return new THREE.Vector3(
      -Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cosPitch,
    ).normalize();
  }
}
