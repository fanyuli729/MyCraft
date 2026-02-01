import * as THREE from 'three';
import {
  addEntity,
  addComponent,
  IWorld,
} from 'bitecs';
import {
  Transform,
  Velocity,
  Health,
  MobAI,
  MobType,
  MeshRef,
  Gravity,
  DamageFlash,
  Hostile,
  Passive,
  AIState,
  MobTypeId,
} from '@/entities/ECSWorld';
import {
  MAX_MOBS,
  MOB_SPAWN_DISTANCE_MIN,
  MOB_SPAWN_DISTANCE_MAX,
  CHUNK_HEIGHT,
} from '@/utils/Constants';
import { BlockType } from '@/types/BlockType';
import { BlockRegistry } from '@/world/BlockRegistry';
import type { BlockGetter } from '@/entities/systems/PhysicsSystem';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Seconds between spawn attempts. */
const SPAWN_INTERVAL = 5;

/** Passive mob types that can be spawned during the day. */
const PASSIVE_TYPES = [MobTypeId.COW, MobTypeId.PIG, MobTypeId.CHICKEN] as const;

/** Hostile mob types that spawn at night. */
const HOSTILE_TYPES = [MobTypeId.ZOMBIE, MobTypeId.SKELETON] as const;

// ---------------------------------------------------------------------------
// Per-mob-type base stats
// ---------------------------------------------------------------------------

interface MobBaseStats {
  health: number;
  aggroRange: number;
}

const BASE_STATS: Record<number, MobBaseStats> = {
  [MobTypeId.COW]: { health: 10, aggroRange: 0 },
  [MobTypeId.PIG]: { health: 10, aggroRange: 0 },
  [MobTypeId.CHICKEN]: { health: 4, aggroRange: 0 },
  [MobTypeId.ZOMBIE]: { health: 20, aggroRange: 16 },
  [MobTypeId.SKELETON]: { health: 20, aggroRange: 16 },
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let spawnTimer = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a valid spawn position: random point on the XZ ring around the
 * player, with solid ground and two air blocks above.
 * Returns null if no valid spot is found after a few attempts.
 */
function findSpawnPosition(
  playerPos: THREE.Vector3,
  getBlock: BlockGetter,
): THREE.Vector3 | null {
  const MAX_ATTEMPTS = 10;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist =
      MOB_SPAWN_DISTANCE_MIN +
      Math.random() * (MOB_SPAWN_DISTANCE_MAX - MOB_SPAWN_DISTANCE_MIN);

    const x = Math.floor(playerPos.x + Math.cos(angle) * dist);
    const z = Math.floor(playerPos.z + Math.sin(angle) * dist);

    // Scan downward from a reasonable height to find the surface.
    const startY = Math.min(
      Math.floor(playerPos.y) + 20,
      CHUNK_HEIGHT - 3,
    );

    for (let y = startY; y > 1; y--) {
      const below = getBlock(x, y - 1, z);
      const atFeet = getBlock(x, y, z);
      const atHead = getBlock(x, y + 1, z);

      if (
        BlockRegistry.isSolid(below) &&
        atFeet === BlockType.AIR &&
        atHead === BlockType.AIR
      ) {
        return new THREE.Vector3(x + 0.5, y, z + 0.5);
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

/**
 * Periodically attempts to spawn new mobs within the valid distance ring
 * around the player.
 *
 * @param world       bitecs world
 * @param dt          frame delta in seconds
 * @param playerPos   player position
 * @param isNight     whether the world is night
 * @param currentMobCount current total number of mobs (to check cap)
 * @param getBlock    world block accessor
 * @param onSpawn     callback invoked when an entity is spawned (eid, mobType)
 * @returns           the entity ID of the newly spawned mob, or -1 if none
 */
export function spawnSystem(
  world: IWorld,
  dt: number,
  playerPos: THREE.Vector3,
  isNight: boolean,
  currentMobCount: number,
  getBlock: BlockGetter,
  onSpawn?: (eid: number, mobType: number) => void,
): number {
  spawnTimer += dt;

  if (spawnTimer < SPAWN_INTERVAL) return -1;
  spawnTimer -= SPAWN_INTERVAL;

  // Respect mob cap
  if (currentMobCount >= MAX_MOBS) return -1;

  // Choose mob type to spawn
  let mobTypeId: number;

  if (isNight) {
    // At night, 60 % hostile, 40 % passive
    if (Math.random() < 0.6) {
      mobTypeId = HOSTILE_TYPES[Math.floor(Math.random() * HOSTILE_TYPES.length)];
    } else {
      mobTypeId = PASSIVE_TYPES[Math.floor(Math.random() * PASSIVE_TYPES.length)];
    }
  } else {
    // During the day only passive mobs
    mobTypeId = PASSIVE_TYPES[Math.floor(Math.random() * PASSIVE_TYPES.length)];
  }

  // Find a valid position
  const pos = findSpawnPosition(playerPos, getBlock);
  if (!pos) return -1;

  // Create entity and attach all required components
  const eid = addEntity(world);
  const stats = BASE_STATS[mobTypeId] ?? { health: 10, aggroRange: 0 };

  addComponent(world, Transform, eid);
  Transform.x[eid] = pos.x;
  Transform.y[eid] = pos.y;
  Transform.z[eid] = pos.z;
  Transform.rotY[eid] = Math.random() * Math.PI * 2;

  addComponent(world, Velocity, eid);
  Velocity.x[eid] = 0;
  Velocity.y[eid] = 0;
  Velocity.z[eid] = 0;

  addComponent(world, Health, eid);
  Health.current[eid] = stats.health;
  Health.max[eid] = stats.health;

  addComponent(world, MobAI, eid);
  MobAI.state[eid] = AIState.IDLE;
  MobAI.stateTimer[eid] = 2 + Math.random() * 3;
  MobAI.targetX[eid] = pos.x;
  MobAI.targetY[eid] = pos.y;
  MobAI.targetZ[eid] = pos.z;
  MobAI.aggroRange[eid] = stats.aggroRange;

  addComponent(world, MobType, eid);
  MobType.type[eid] = mobTypeId;

  addComponent(world, MeshRef, eid);
  MeshRef.meshIndex[eid] = -1; // assigned by MobManager after mesh creation

  addComponent(world, Gravity, eid);
  Gravity.grounded[eid] = 0;

  addComponent(world, DamageFlash, eid);
  DamageFlash.timer[eid] = 0;

  // Tag component
  if (
    mobTypeId === MobTypeId.ZOMBIE ||
    mobTypeId === MobTypeId.SKELETON
  ) {
    addComponent(world, Hostile, eid);
  } else {
    addComponent(world, Passive, eid);
  }

  if (onSpawn) {
    onSpawn(eid, mobTypeId);
  }

  return eid;
}

/**
 * Reset the internal spawn timer (useful when re-initialising).
 */
export function resetSpawnTimer(): void {
  spawnTimer = 0;
}
