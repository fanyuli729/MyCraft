import * as THREE from 'three';
import { defineQuery, IWorld } from 'bitecs';
import {
  Transform,
  MeshRef,
  DamageFlash,
} from '@/entities/ECSWorld';
import { clamp } from '@/utils/MathUtils';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const renderQuery = defineQuery([Transform, MeshRef]);
const flashQuery = defineQuery([DamageFlash, MeshRef]);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Duration in seconds for the red damage flash. */
const FLASH_DURATION = 0.25;

/** The red tint applied during a damage flash. */
const FLASH_COLOR = new THREE.Color(0xff3333);
const WHITE = new THREE.Color(0xffffff);

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

/**
 * Synchronises Three.js mesh transforms with the ECS Transform component
 * and applies a red damage flash effect when DamageFlash.timer > 0.
 *
 * @param world     bitecs world
 * @param dt        frame delta in seconds
 * @param meshPool  mapping from meshIndex to Three.js Group
 */
export function renderSyncSystem(
  world: IWorld,
  dt: number,
  meshPool: Map<number, THREE.Group>,
): void {
  // ---- Position / rotation sync ----
  const entities = renderQuery(world);

  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i];
    const meshIdx = MeshRef.meshIndex[eid];
    const mesh = meshPool.get(meshIdx);
    if (!mesh) continue;

    mesh.position.set(
      Transform.x[eid],
      Transform.y[eid],
      Transform.z[eid],
    );
    mesh.rotation.y = Transform.rotY[eid];
  }

  // ---- Damage flash ----
  const flashEntities = flashQuery(world);

  for (let i = 0; i < flashEntities.length; i++) {
    const eid = flashEntities[i];
    const meshIdx = MeshRef.meshIndex[eid];
    const mesh = meshPool.get(meshIdx);
    if (!mesh) continue;

    if (DamageFlash.timer[eid] > 0) {
      DamageFlash.timer[eid] -= dt;
      const t = clamp(DamageFlash.timer[eid] / FLASH_DURATION, 0, 1);

      // Tint all child meshes red
      mesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material;
          if (mat && 'color' in mat) {
            const meshMat = mat as THREE.MeshLambertMaterial;
            // Store original colour on first flash frame via userData
            if (!child.userData._origColor) {
              child.userData._origColor = meshMat.color.clone();
            }
            meshMat.color.copy(child.userData._origColor as THREE.Color).lerp(FLASH_COLOR, t);
          }
        }
      });
    } else {
      // Restore original colours
      mesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && child.userData._origColor) {
          const mat = (child as THREE.Mesh).material as THREE.MeshLambertMaterial;
          if (mat && 'color' in mat) {
            mat.color.copy(child.userData._origColor as THREE.Color);
          }
          delete child.userData._origColor;
        }
      });
    }
  }
}
