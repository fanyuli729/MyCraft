import * as THREE from 'three';
import { defineQuery, removeEntity, IWorld } from 'bitecs';
import {
  Transform,
  MobType,
  MeshRef,
} from '@/entities/ECSWorld';
import { MOB_DESPAWN_DISTANCE } from '@/utils/Constants';

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

const despawnQuery = defineQuery([Transform, MobType]);

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

/**
 * Removes entities that have moved beyond {@link MOB_DESPAWN_DISTANCE}
 * from the player.  Also cleans up the corresponding Three.js mesh via
 * the provided callback.
 *
 * @param world      bitecs world
 * @param playerPos  current player position
 * @param onDespawn  callback invoked with (eid, meshIndex) before removal
 *                   so the caller can dispose the Three.js mesh
 */
export function despawnSystem(
  world: IWorld,
  playerPos: THREE.Vector3,
  onDespawn?: (eid: number, meshIndex: number) => void,
): void {
  const entities = despawnQuery(world);
  const distSq = MOB_DESPAWN_DISTANCE * MOB_DESPAWN_DISTANCE;

  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i];

    const dx = Transform.x[eid] - playerPos.x;
    const dy = Transform.y[eid] - playerPos.y;
    const dz = Transform.z[eid] - playerPos.z;
    const d2 = dx * dx + dy * dy + dz * dz;

    if (d2 > distSq) {
      const meshIdx = MeshRef.meshIndex[eid];

      if (onDespawn) {
        onDespawn(eid, meshIdx);
      }

      removeEntity(world, eid);
    }
  }
}
