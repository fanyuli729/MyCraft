import * as THREE from 'three';
import { defineQuery, IWorld } from 'bitecs';
import {
  ecsWorld,
  Transform,
  MobType,
  MeshRef,
} from '@/entities/ECSWorld';
import { spawnSystem, resetSpawnTimer } from '@/entities/systems/SpawnSystem';
import { aiSystem } from '@/entities/systems/AISystem';
import { physicsSystem, BlockGetter } from '@/entities/systems/PhysicsSystem';
import { damageSystem, damageEntity } from '@/entities/systems/DamageSystem';
import { despawnSystem } from '@/entities/systems/DespawnSystem';
import { renderSyncSystem } from '@/entities/systems/RenderSyncSystem';
import { createMobMesh, disposeMobMesh } from '@/entities/MobMeshFactory';

// ---------------------------------------------------------------------------
// Query (for counting)
// ---------------------------------------------------------------------------

const allMobsQuery = defineQuery([Transform, MobType]);

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

/**
 * High-level orchestrator for the ECS-based mob system.
 *
 * Holds references to the bitecs world, the Three.js scene, the game
 * World (for block queries), and a mesh pool that maps mesh indices to
 * Three.js Groups.
 *
 * Call {@link update} once per frame to run all systems in the correct
 * order.
 */
export class MobManager {
  // ---- Dependencies ----
  private readonly world: IWorld = ecsWorld;
  private scene!: THREE.Scene;
  private getBlock!: BlockGetter;

  // ---- Mesh pool ----
  /** meshIndex -> Three.js Group.  Keys are auto-incrementing integers. */
  private meshPool = new Map<number, THREE.Group>();
  private nextMeshIndex = 0;

  // ---- Callback for player damage ----
  private damagePlayerFn?: (amount: number) => void;

  // ---- Death callback (for item drops, particles, etc.) ----
  private onDeathFn?: (
    eid: number,
    mobType: number,
    meshIndex: number,
    x: number,
    y: number,
    z: number,
    dropItem: string | undefined,
  ) => void;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initialise the mob manager.
   *
   * @param scene   Three.js scene to add mob meshes to
   * @param getBlock  block accessor from the game World
   * @param damagePlayer  optional callback when a hostile attacks the player
   * @param onDeath       optional callback when a mob dies
   */
  init(
    scene: THREE.Scene,
    getBlock: BlockGetter,
    damagePlayer?: (amount: number) => void,
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
    this.scene = scene;
    this.getBlock = getBlock;
    this.damagePlayerFn = damagePlayer;
    this.onDeathFn = onDeath;
    resetSpawnTimer();
  }

  /**
   * Run all mob systems for a single frame.
   *
   * @param dt         delta time in seconds
   * @param playerPos  player world position
   * @param isNight    whether the world is in the night phase
   */
  update(dt: number, playerPos: THREE.Vector3, isNight: boolean): void {
    const mobCount = allMobsQuery(this.world).length;

    // 1. Spawn
    spawnSystem(
      this.world,
      dt,
      playerPos,
      isNight,
      mobCount,
      this.getBlock,
      this.handleSpawn,
    );

    // 2. AI
    aiSystem(this.world, dt, playerPos, isNight, this.damagePlayerFn);

    // 3. Physics
    physicsSystem(this.world, dt, this.getBlock);

    // 4. Damage (process deaths)
    damageSystem(this.world, dt, this.handleDeath);

    // 5. Despawn
    despawnSystem(this.world, playerPos, this.handleDespawn);

    // 6. Render sync (update mesh transforms + damage flash)
    renderSyncSystem(this.world, dt, this.meshPool);
  }

  /**
   * Deal damage to a specific entity.
   * @returns true if the entity died
   */
  damageEntity(eid: number, amount: number): boolean {
    return damageEntity(this.world, eid, amount);
  }

  /**
   * Return the bitecs world so other systems can query entities.
   */
  getECSWorld(): IWorld {
    return this.world;
  }

  /**
   * Return the mesh pool (useful for raycasting against mob meshes).
   */
  getMeshPool(): Map<number, THREE.Group> {
    return this.meshPool;
  }

  /**
   * Find the entity ID that owns a given Three.js mesh group.
   * Returns -1 if no match is found.
   */
  findEntityByMesh(meshGroup: THREE.Group): number {
    // Reverse lookup: find which meshIndex maps to this group
    let targetIndex = -1;
    for (const [idx, group] of this.meshPool) {
      if (group === meshGroup) {
        targetIndex = idx;
        break;
      }
    }
    if (targetIndex === -1) return -1;

    // Find entity with that MeshRef.meshIndex
    const entities = allMobsQuery(this.world);
    for (let i = 0; i < entities.length; i++) {
      if (MeshRef.meshIndex[entities[i]] === targetIndex) {
        return entities[i];
      }
    }
    return -1;
  }

  /**
   * Clean up all mobs and meshes.
   */
  dispose(): void {
    for (const [, mesh] of this.meshPool) {
      disposeMobMesh(mesh);
    }
    this.meshPool.clear();
    this.nextMeshIndex = 0;
  }

  // -----------------------------------------------------------------------
  // Internal callbacks (arrow functions to preserve `this`)
  // -----------------------------------------------------------------------

  /**
   * Called by SpawnSystem when a new entity is created.
   * Creates the Three.js mesh and assigns a MeshRef.
   */
  private handleSpawn = (eid: number, mobType: number): void => {
    const mesh = createMobMesh(mobType);
    const idx = this.nextMeshIndex++;
    this.meshPool.set(idx, mesh);
    MeshRef.meshIndex[eid] = idx;

    // Position mesh immediately
    mesh.position.set(
      Transform.x[eid],
      Transform.y[eid],
      Transform.z[eid],
    );
    mesh.rotation.y = Transform.rotY[eid];

    this.scene.add(mesh);
  };

  /**
   * Called by DamageSystem when a mob dies.
   * Cleans up the mesh and notifies external listeners.
   */
  private handleDeath = (
    eid: number,
    mobType: number,
    meshIndex: number,
    x: number,
    y: number,
    z: number,
    dropItem: string | undefined,
  ): void => {
    this.removeMesh(meshIndex);

    if (this.onDeathFn) {
      this.onDeathFn(eid, mobType, meshIndex, x, y, z, dropItem);
    }
  };

  /**
   * Called by DespawnSystem when a mob is too far from the player.
   */
  private handleDespawn = (_eid: number, meshIndex: number): void => {
    this.removeMesh(meshIndex);
  };

  /**
   * Remove a mesh from the scene and the pool.
   */
  private removeMesh(meshIndex: number): void {
    const mesh = this.meshPool.get(meshIndex);
    if (mesh) {
      disposeMobMesh(mesh);
      this.meshPool.delete(meshIndex);
    }
  }
}
