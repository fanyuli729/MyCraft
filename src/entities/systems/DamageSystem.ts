import { defineQuery, removeEntity, IWorld } from 'bitecs';
import {
  Health,
  DamageFlash,
  MobType,
  MeshRef,
  Passive,
  MobTypeId,
  Transform,
} from '@/entities/ECSWorld';
import { triggerFlee } from '@/entities/systems/AISystem';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Duration of the red damage flash effect in seconds. */
const FLASH_DURATION = 0.25;

// ---------------------------------------------------------------------------
// Death queue
// ---------------------------------------------------------------------------

/**
 * Entity IDs that should be removed this frame (health <= 0).
 * Processed at the end of the system tick to avoid mutating the query
 * while iterating.
 */
const deathQueue: number[] = [];

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

const healthQuery = defineQuery([Health, MeshRef, MobType]);

// ---------------------------------------------------------------------------
// Drop table
// ---------------------------------------------------------------------------

/** Item name dropped on death for each passive mob type. */
const DROP_TABLE: Record<number, string> = {
  [MobTypeId.COW]: 'raw_beef',
  [MobTypeId.PIG]: 'raw_porkchop',
  [MobTypeId.CHICKEN]: 'raw_chicken',
  [MobTypeId.ZOMBIE]: 'rotten_flesh',
  [MobTypeId.SKELETON]: 'bone',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply `amount` hit-points of damage to entity `eid`.
 *
 * - Reduces Health.current
 * - Starts the red DamageFlash timer
 * - If the mob is passive, triggers the FLEE AI state
 * - If health drops to zero the entity is queued for removal
 *
 * @returns true if the entity died from this damage
 */
export function damageEntity(world: IWorld, eid: number, amount: number): boolean {
  Health.current[eid] -= amount;
  DamageFlash.timer[eid] = FLASH_DURATION;

  // Passive mobs flee when hit
  const mobType = MobType.type[eid];
  if (
    mobType === MobTypeId.COW ||
    mobType === MobTypeId.PIG ||
    mobType === MobTypeId.CHICKEN
  ) {
    triggerFlee(eid);
  }

  if (Health.current[eid] <= 0) {
    Health.current[eid] = 0;
    return true;
  }
  return false;
}

/**
 * Processes the damage system for the current frame:
 * - Scans for entities with health <= 0 and queues removal
 * - Invokes `onDeath` callback for each dead entity so the manager can
 *   clean up meshes, spawn drops, etc.
 *
 * @param world    bitecs world
 * @param dt       frame delta (unused currently, reserved for DoT effects)
 * @param onDeath  callback: (eid, mobType, meshIndex, x, y, z, dropItem) => void
 */
export function damageSystem(
  world: IWorld,
  dt: number,
  onDeath?: (
    eid: number,
    mobType: number,
    meshIndex: number,
    x: number,
    y: number,
    z: number,
    dropItem: string | undefined,
  ) => void,
): void {
  const entities = healthQuery(world);

  // Gather dead entities
  deathQueue.length = 0;

  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i];

    if (Health.current[eid] <= 0) {
      deathQueue.push(eid);
    }
  }

  // Process deaths
  for (let i = 0; i < deathQueue.length; i++) {
    const eid = deathQueue[i];
    const mobType = MobType.type[eid];
    const meshIdx = MeshRef.meshIndex[eid];
    const drop = DROP_TABLE[mobType];

    if (onDeath) {
      onDeath(
        eid,
        mobType,
        meshIdx,
        Transform.x[eid],
        Transform.y[eid],
        Transform.z[eid],
        drop,
      );
    }

    removeEntity(world, eid);
  }
}
