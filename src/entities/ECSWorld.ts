import {
  createWorld,
  defineComponent,
  Types,
  IWorld,
} from 'bitecs';

// ---------------------------------------------------------------------------
// AI state enum
// ---------------------------------------------------------------------------

export const AIState = {
  IDLE: 0,
  WANDER: 1,
  CHASE: 2,
  ATTACK: 3,
  FLEE: 4,
} as const;

// ---------------------------------------------------------------------------
// Mob type enum
// ---------------------------------------------------------------------------

export const MobTypeId = {
  COW: 0,
  PIG: 1,
  CHICKEN: 2,
  ZOMBIE: 3,
  SKELETON: 4,
} as const;

// ---------------------------------------------------------------------------
// Component definitions (struct-of-arrays)
// ---------------------------------------------------------------------------

/** World-space position and Y-axis rotation. */
export const Transform = defineComponent({
  x: Types.f32,
  y: Types.f32,
  z: Types.f32,
  rotY: Types.f32,
});

/** Per-axis velocity in m/s. */
export const Velocity = defineComponent({
  x: Types.f32,
  y: Types.f32,
  z: Types.f32,
});

/** Health pool. */
export const Health = defineComponent({
  current: Types.f32,
  max: Types.f32,
});

/** AI state-machine data. */
export const MobAI = defineComponent({
  /** Current AI state (see {@link AIState}). */
  state: Types.ui8,
  /** Target position the mob is moving toward. */
  targetX: Types.f32,
  targetY: Types.f32,
  targetZ: Types.f32,
  /** Countdown timer for current state. */
  stateTimer: Types.f32,
  /** Distance at which this mob detects the player. */
  aggroRange: Types.f32,
});

/** Identifies the visual mob species. */
export const MobType = defineComponent({
  /** Mob species (see {@link MobTypeId}). */
  type: Types.ui8,
});

/** Links an entity to its Three.js mesh via a pool index. */
export const MeshRef = defineComponent({
  meshIndex: Types.i32,
});

/** Gravity / grounded flag. */
export const Gravity = defineComponent({
  /** 1 if resting on solid ground, 0 otherwise. */
  grounded: Types.ui8,
});

/** Red tint flash when taking damage. */
export const DamageFlash = defineComponent({
  timer: Types.f32,
});

/** Tag: entity is hostile and will attack the player. */
export const Hostile = defineComponent({});

/** Tag: entity is passive. */
export const Passive = defineComponent({});

// ---------------------------------------------------------------------------
// ECS world singleton
// ---------------------------------------------------------------------------

/**
 * The bitecs world instance used by all mob/entity systems.
 *
 * This is a plain object that bitecs uses internally to track entity
 * allocations and component storage.  Every system function receives this
 * world as its first argument.
 */
export const ecsWorld: IWorld = createWorld();
