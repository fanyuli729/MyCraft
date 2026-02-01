import * as THREE from 'three';
import { defineQuery, IWorld } from 'bitecs';
import {
  Transform,
  Velocity,
  MobAI,
  MobType,
  Hostile,
  Passive,
  AIState,
  MobTypeId,
} from '@/entities/ECSWorld';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const aiQuery = defineQuery([MobAI, Transform, Velocity, MobType]);
const hostileQuery = defineQuery([Hostile, MobAI, Transform]);
const passiveQuery = defineQuery([Passive, MobAI, Transform]);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WANDER_SPEED = 1.5;
const CHASE_SPEED = 3.0;
const FLEE_SPEED = 3.5;

/** How close the mob must get to its wander target before going idle. */
const WANDER_ARRIVE_DIST = 1.5;

/** Attack range in blocks. */
const ATTACK_RANGE = 2.0;

/** Attack cooldown in seconds. */
const ATTACK_COOLDOWN = 1.0;

/** How far a wander target can be from the mob's current position. */
const WANDER_RADIUS = 8;

/** Duration of the flee behaviour in seconds. */
const FLEE_DURATION = 3.0;

// ---------------------------------------------------------------------------
// Per-mob-type stats
// ---------------------------------------------------------------------------

interface MobStats {
  aggroRange: number;
  damage: number;
}

const MOB_STATS: Record<number, MobStats> = {
  [MobTypeId.ZOMBIE]: { aggroRange: 16, damage: 3 },
  [MobTypeId.SKELETON]: { aggroRange: 16, damage: 2 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function distXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function moveToward(
  eid: number,
  tx: number,
  tz: number,
  speed: number,
): void {
  const dx = tx - Transform.x[eid];
  const dz = tz - Transform.z[eid];
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return;

  Velocity.x[eid] = (dx / len) * speed;
  Velocity.z[eid] = (dz / len) * speed;

  // Face direction of travel
  Transform.rotY[eid] = Math.atan2(dx, dz);
}

function pickWanderTarget(eid: number): void {
  const angle = Math.random() * Math.PI * 2;
  const dist = 3 + Math.random() * WANDER_RADIUS;
  MobAI.targetX[eid] = Transform.x[eid] + Math.cos(angle) * dist;
  MobAI.targetZ[eid] = Transform.z[eid] + Math.sin(angle) * dist;
  MobAI.targetY[eid] = Transform.y[eid]; // keep same Y (physics handles gravity)
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

/**
 * Runs the AI state machine for every entity with MobAI + Transform +
 * Velocity + MobType.
 *
 * @param world     bitecs world
 * @param dt        frame delta in seconds
 * @param playerPos player world position
 * @param isNight   whether the world is currently in night phase
 * @param damagePlayerFn callback invoked when a hostile attacks the player (amount)
 */
export function aiSystem(
  world: IWorld,
  dt: number,
  playerPos: THREE.Vector3,
  isNight: boolean,
  damagePlayerFn?: (amount: number) => void,
): void {
  const entities = aiQuery(world);

  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i];
    const state = MobAI.state[eid] as number;
    const mobType = MobType.type[eid] as number;
    const isHostile = mobType === MobTypeId.ZOMBIE || mobType === MobTypeId.SKELETON;
    const isPassive = !isHostile;

    // Decrement state timer
    MobAI.stateTimer[eid] -= dt;

    const distToPlayer = distXZ(
      Transform.x[eid],
      Transform.z[eid],
      playerPos.x,
      playerPos.z,
    );

    // ---- Hostile night-time aggro check (can override idle/wander) ----
    if (isHostile && isNight && state !== AIState.CHASE && state !== AIState.ATTACK) {
      const stats = MOB_STATS[mobType];
      if (stats && distToPlayer < stats.aggroRange) {
        MobAI.state[eid] = AIState.CHASE;
        MobAI.stateTimer[eid] = 0;
        continue; // start chasing on next tick
      }
    }

    // ---- State machine ----
    switch (state) {
      // ---------------------------------------------------------------
      // IDLE
      // ---------------------------------------------------------------
      case AIState.IDLE: {
        Velocity.x[eid] = 0;
        Velocity.z[eid] = 0;

        if (MobAI.stateTimer[eid] <= 0) {
          // Transition to wander
          MobAI.state[eid] = AIState.WANDER;
          pickWanderTarget(eid);
          MobAI.stateTimer[eid] = 5 + Math.random() * 5; // max wander time
        }
        break;
      }

      // ---------------------------------------------------------------
      // WANDER
      // ---------------------------------------------------------------
      case AIState.WANDER: {
        moveToward(
          eid,
          MobAI.targetX[eid],
          MobAI.targetZ[eid],
          WANDER_SPEED,
        );

        const distToTarget = distXZ(
          Transform.x[eid],
          Transform.z[eid],
          MobAI.targetX[eid],
          MobAI.targetZ[eid],
        );

        if (distToTarget < WANDER_ARRIVE_DIST || MobAI.stateTimer[eid] <= 0) {
          // Arrived or timed out, go idle
          MobAI.state[eid] = AIState.IDLE;
          MobAI.stateTimer[eid] = 2 + Math.random() * 3; // idle 2-5 s
          Velocity.x[eid] = 0;
          Velocity.z[eid] = 0;
        }
        break;
      }

      // ---------------------------------------------------------------
      // CHASE (hostile only)
      // ---------------------------------------------------------------
      case AIState.CHASE: {
        if (!isHostile) {
          MobAI.state[eid] = AIState.IDLE;
          MobAI.stateTimer[eid] = 2;
          break;
        }

        // If day time, stop chasing
        if (!isNight) {
          MobAI.state[eid] = AIState.IDLE;
          MobAI.stateTimer[eid] = 2 + Math.random() * 3;
          Velocity.x[eid] = 0;
          Velocity.z[eid] = 0;
          break;
        }

        moveToward(eid, playerPos.x, playerPos.z, CHASE_SPEED);

        if (distToPlayer < ATTACK_RANGE) {
          MobAI.state[eid] = AIState.ATTACK;
          MobAI.stateTimer[eid] = ATTACK_COOLDOWN;
        }

        // If player moved far away, lose aggro
        const stats = MOB_STATS[mobType];
        if (stats && distToPlayer > stats.aggroRange * 1.5) {
          MobAI.state[eid] = AIState.IDLE;
          MobAI.stateTimer[eid] = 2;
          Velocity.x[eid] = 0;
          Velocity.z[eid] = 0;
        }
        break;
      }

      // ---------------------------------------------------------------
      // ATTACK (hostile only)
      // ---------------------------------------------------------------
      case AIState.ATTACK: {
        Velocity.x[eid] = 0;
        Velocity.z[eid] = 0;

        // Face player
        const dx = playerPos.x - Transform.x[eid];
        const dz = playerPos.z - Transform.z[eid];
        Transform.rotY[eid] = Math.atan2(dx, dz);

        if (MobAI.stateTimer[eid] <= 0) {
          // Deal damage
          if (distToPlayer < ATTACK_RANGE && damagePlayerFn) {
            const stats = MOB_STATS[mobType];
            damagePlayerFn(stats ? stats.damage : 1);
          }
          MobAI.stateTimer[eid] = ATTACK_COOLDOWN;

          // If player has moved away, go back to chasing
          if (distToPlayer >= ATTACK_RANGE) {
            MobAI.state[eid] = AIState.CHASE;
          }
        }

        // If day, stop
        if (!isNight) {
          MobAI.state[eid] = AIState.IDLE;
          MobAI.stateTimer[eid] = 2;
        }
        break;
      }

      // ---------------------------------------------------------------
      // FLEE (passive only)
      // ---------------------------------------------------------------
      case AIState.FLEE: {
        // Run away from player
        const fx = Transform.x[eid] - playerPos.x;
        const fz = Transform.z[eid] - playerPos.z;
        const fLen = Math.sqrt(fx * fx + fz * fz);
        if (fLen > 0.01) {
          Velocity.x[eid] = (fx / fLen) * FLEE_SPEED;
          Velocity.z[eid] = (fz / fLen) * FLEE_SPEED;
          Transform.rotY[eid] = Math.atan2(fx, fz);
        }

        if (MobAI.stateTimer[eid] <= 0) {
          MobAI.state[eid] = AIState.IDLE;
          MobAI.stateTimer[eid] = 2 + Math.random() * 3;
          Velocity.x[eid] = 0;
          Velocity.z[eid] = 0;
        }
        break;
      }

      default:
        MobAI.state[eid] = AIState.IDLE;
        MobAI.stateTimer[eid] = 2;
        break;
    }
  }
}

/**
 * Force a passive mob into the FLEE state.
 * Called by the damage system when a passive mob takes a hit.
 */
export function triggerFlee(eid: number): void {
  MobAI.state[eid] = AIState.FLEE;
  MobAI.stateTimer[eid] = FLEE_DURATION;
}
