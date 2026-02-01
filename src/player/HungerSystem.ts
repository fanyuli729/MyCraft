import { MAX_HEALTH, MAX_HUNGER } from '@/utils/Constants';
import { Player } from '@/player/Player';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Hunger depletion rate while walking (units / second). */
const BASE_DEPLETION = 0.1;

/** Hunger depletion rate while sprinting (units / second). */
const SPRINT_DEPLETION = 0.3;

/**
 * Hunger threshold at or above which the player regenerates health.
 * At 18 out of 20, passive healing kicks in.
 */
const REGEN_HUNGER_THRESHOLD = 18;

/** Health regeneration rate when hunger is above threshold (hp / second). */
const HEALTH_REGEN_RATE = 0.5;

/** Damage rate when hunger reaches zero (hp / second). */
const STARVATION_DAMAGE_RATE = 0.5;

// ---------------------------------------------------------------------------
// Food item data
// ---------------------------------------------------------------------------

/** Map of item IDs to the hunger points they restore. */
const FOOD_VALUES: ReadonlyMap<number, number> = new Map([
  [205, 5], // Bread
  [206, 4], // Apple
  [207, 3], // Raw Beef
  [208, 3], // Raw Porkchop
  [209, 2], // Raw Chicken
  [210, 4], // Rotten Flesh
  [212, 8], // Cooked Beef
  [213, 8], // Cooked Porkchop
  [214, 6], // Cooked Chicken
]);

// ---------------------------------------------------------------------------
// HungerSystem
// ---------------------------------------------------------------------------

/**
 * Manages the player's hunger meter, including passive depletion,
 * starvation damage, food consumption, and health regeneration.
 *
 * Usage:
 *   const hunger = new HungerSystem();
 *   // Every frame:
 *   hunger.update(dt, player, isMoving, isSprinting);
 */
export class HungerSystem {
  /**
   * Internal hunger accumulator. The player's integer hunger value
   * is decremented each time this reaches a full unit.
   */
  private depletionAccumulator = 0;

  /** Accumulator for health regeneration ticks. */
  private regenAccumulator = 0;

  /** Accumulator for starvation damage ticks. */
  private starvationAccumulator = 0;

  /**
   * Advance the hunger system by `dt` seconds.
   *
   * @param dt         Frame delta time in seconds.
   * @param player     The live player instance (health and hunger are mutated).
   * @param isMoving   True if the player moved this frame (walking / strafing).
   * @param isSprinting True if the player is currently sprinting.
   */
  update(dt: number, player: Player, isMoving: boolean, isSprinting: boolean): void {
    // ----- Deplete hunger while moving -----------------------------------
    if (isMoving) {
      const rate = isSprinting ? SPRINT_DEPLETION : BASE_DEPLETION;
      this.depletionAccumulator += rate * dt;

      while (this.depletionAccumulator >= 1) {
        this.depletionAccumulator -= 1;
        player.hunger = Math.max(player.hunger - 1, 0);
      }
    }

    // ----- Regenerate health when well-fed --------------------------------
    if (player.hunger >= REGEN_HUNGER_THRESHOLD && player.health < MAX_HEALTH) {
      this.regenAccumulator += HEALTH_REGEN_RATE * dt;

      while (this.regenAccumulator >= 1) {
        this.regenAccumulator -= 1;
        player.health = Math.min(player.health + 1, MAX_HEALTH);
      }
    } else {
      this.regenAccumulator = 0;
    }

    // ----- Starvation damage when hunger is empty -------------------------
    if (player.hunger <= 0) {
      this.starvationAccumulator += STARVATION_DAMAGE_RATE * dt;

      while (this.starvationAccumulator >= 1) {
        this.starvationAccumulator -= 1;
        player.health = Math.max(player.health - 1, 0);
      }
    } else {
      this.starvationAccumulator = 0;
    }
  }

  /**
   * Attempt to consume a food item and restore hunger.
   *
   * @param itemId The item ID to look up in the food table.
   * @returns The amount of hunger restored, or 0 if the item is not food
   *          or the player is already at full hunger.
   */
  eat(itemId: number, player: Player): number {
    if (player.hunger >= MAX_HUNGER) return 0;

    const value = FOOD_VALUES.get(itemId);
    if (value === undefined) return 0;

    const restored = Math.min(value, MAX_HUNGER - player.hunger);
    player.hunger += restored;
    return restored;
  }

  /**
   * Query whether a given item ID is recognised as food.
   */
  isFood(itemId: number): boolean {
    return FOOD_VALUES.has(itemId);
  }
}
