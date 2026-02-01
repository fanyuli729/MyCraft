import * as THREE from 'three';
import { MobTypeId } from '@/entities/ECSWorld';

// ---------------------------------------------------------------------------
// Shared materials (re-used across all mobs of the same type)
// ---------------------------------------------------------------------------

function mat(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

// Pre-create palette materials so we don't allocate new ones per mob.
const MAT_BROWN = mat(0x6b4226);
const MAT_DARK_BROWN = mat(0x3e2415);
const MAT_WHITE_PATCH = mat(0xf0f0f0);
const MAT_PINK = mat(0xf0a0a0);
const MAT_PINK_DARK = mat(0xd08080);
const MAT_WHITE = mat(0xf5f5f5);
const MAT_YELLOW = mat(0xe8c840);
const MAT_ORANGE = mat(0xe07020);
const MAT_RED_COMB = mat(0xcc2020);
const MAT_GREEN_BODY = mat(0x4a7a34);
const MAT_GREEN_HEAD = mat(0x5a8a44);
const MAT_GREEN_DARK = mat(0x2a5a1a);
const MAT_BONE = mat(0xe0dcd0);
const MAT_BONE_DARK = mat(0xc0bab0);
const MAT_BLACK = mat(0x111111);

// ---------------------------------------------------------------------------
// Helper: shorthand box
// ---------------------------------------------------------------------------

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.MeshLambertMaterial,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Cow
// ---------------------------------------------------------------------------

function createCow(): THREE.Group {
  const group = new THREE.Group();

  // Body
  group.add(box(1.2, 1.0, 0.8, MAT_BROWN, 0, 1.0, 0));

  // White patches on body (thin box overlaid)
  group.add(box(0.5, 0.4, 0.81, MAT_WHITE_PATCH, 0.2, 1.1, 0));
  group.add(box(0.3, 0.3, 0.81, MAT_WHITE_PATCH, -0.3, 0.8, 0));

  // Head
  group.add(box(0.5, 0.5, 0.6, MAT_DARK_BROWN, 0, 1.3, -0.65));

  // Eyes
  group.add(box(0.1, 0.08, 0.05, MAT_WHITE, 0.15, 1.4, -0.96));
  group.add(box(0.1, 0.08, 0.05, MAT_WHITE, -0.15, 1.4, -0.96));

  // Legs (4)
  const legY = 0.3;
  group.add(box(0.25, 0.6, 0.25, MAT_DARK_BROWN, 0.35, legY, 0.2));
  group.add(box(0.25, 0.6, 0.25, MAT_DARK_BROWN, -0.35, legY, 0.2));
  group.add(box(0.25, 0.6, 0.25, MAT_DARK_BROWN, 0.35, legY, -0.2));
  group.add(box(0.25, 0.6, 0.25, MAT_DARK_BROWN, -0.35, legY, -0.2));

  return group;
}

// ---------------------------------------------------------------------------
// Pig
// ---------------------------------------------------------------------------

function createPig(): THREE.Group {
  const group = new THREE.Group();

  // Body
  group.add(box(1.0, 0.8, 0.7, MAT_PINK, 0, 0.7, 0));

  // Head
  group.add(box(0.5, 0.5, 0.5, MAT_PINK, 0, 0.9, -0.55));

  // Snout
  group.add(box(0.25, 0.2, 0.15, MAT_PINK_DARK, 0, 0.8, -0.85));

  // Eyes
  group.add(box(0.08, 0.08, 0.05, MAT_BLACK, 0.13, 1.0, -0.81));
  group.add(box(0.08, 0.08, 0.05, MAT_BLACK, -0.13, 1.0, -0.81));

  // Legs (4 short)
  const legY = 0.15;
  group.add(box(0.2, 0.3, 0.2, MAT_PINK_DARK, 0.3, legY, 0.18));
  group.add(box(0.2, 0.3, 0.2, MAT_PINK_DARK, -0.3, legY, 0.18));
  group.add(box(0.2, 0.3, 0.2, MAT_PINK_DARK, 0.3, legY, -0.18));
  group.add(box(0.2, 0.3, 0.2, MAT_PINK_DARK, -0.3, legY, -0.18));

  return group;
}

// ---------------------------------------------------------------------------
// Chicken
// ---------------------------------------------------------------------------

function createChicken(): THREE.Group {
  const group = new THREE.Group();

  // Body
  group.add(box(0.5, 0.5, 0.4, MAT_WHITE, 0, 0.5, 0));

  // Head
  group.add(box(0.3, 0.3, 0.3, MAT_YELLOW, 0, 0.85, -0.3));

  // Beak
  group.add(box(0.1, 0.06, 0.12, MAT_ORANGE, 0, 0.8, -0.5));

  // Comb (red, on top of head)
  group.add(box(0.06, 0.12, 0.15, MAT_RED_COMB, 0, 1.05, -0.3));

  // Eyes
  group.add(box(0.06, 0.06, 0.04, MAT_BLACK, 0.1, 0.9, -0.46));
  group.add(box(0.06, 0.06, 0.04, MAT_BLACK, -0.1, 0.9, -0.46));

  // Legs (2 thin)
  group.add(box(0.06, 0.25, 0.06, MAT_YELLOW, 0.12, 0.125, 0));
  group.add(box(0.06, 0.25, 0.06, MAT_YELLOW, -0.12, 0.125, 0));

  // Feet
  group.add(box(0.1, 0.04, 0.14, MAT_ORANGE, 0.12, 0.02, -0.02));
  group.add(box(0.1, 0.04, 0.14, MAT_ORANGE, -0.12, 0.02, -0.02));

  // Tail feathers
  group.add(box(0.12, 0.25, 0.1, MAT_WHITE, 0, 0.7, 0.25));

  return group;
}

// ---------------------------------------------------------------------------
// Zombie
// ---------------------------------------------------------------------------

function createZombie(): THREE.Group {
  const group = new THREE.Group();

  // Body (green-tinted humanoid)
  group.add(box(0.5, 0.75, 0.3, MAT_GREEN_BODY, 0, 1.25, 0));

  // Head
  group.add(box(0.5, 0.5, 0.5, MAT_GREEN_HEAD, 0, 1.87, 0));

  // Eyes (dark)
  group.add(box(0.12, 0.08, 0.05, MAT_GREEN_DARK, 0.12, 1.92, -0.26));
  group.add(box(0.12, 0.08, 0.05, MAT_GREEN_DARK, -0.12, 1.92, -0.26));

  // Arms extended forward
  group.add(box(0.25, 0.2, 0.7, MAT_GREEN_BODY, 0.38, 1.45, -0.35));
  group.add(box(0.25, 0.2, 0.7, MAT_GREEN_BODY, -0.38, 1.45, -0.35));

  // Legs
  group.add(box(0.25, 0.75, 0.25, MAT_GREEN_DARK, 0.13, 0.375, 0));
  group.add(box(0.25, 0.75, 0.25, MAT_GREEN_DARK, -0.13, 0.375, 0));

  return group;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function createSkeleton(): THREE.Group {
  const group = new THREE.Group();

  // Body (thinner, bone coloured)
  group.add(box(0.4, 0.7, 0.2, MAT_BONE, 0, 1.25, 0));

  // Ribcage lines (decorative thin boxes)
  group.add(box(0.38, 0.04, 0.22, MAT_BONE_DARK, 0, 1.45, 0));
  group.add(box(0.38, 0.04, 0.22, MAT_BONE_DARK, 0, 1.3, 0));
  group.add(box(0.38, 0.04, 0.22, MAT_BONE_DARK, 0, 1.15, 0));

  // Skull-like head (slightly larger, boxy)
  group.add(box(0.45, 0.45, 0.45, MAT_BONE, 0, 1.85, 0));

  // Eye sockets (dark recesses)
  group.add(box(0.1, 0.1, 0.08, MAT_BLACK, 0.1, 1.9, -0.22));
  group.add(box(0.1, 0.1, 0.08, MAT_BLACK, -0.1, 1.9, -0.22));

  // Nose hole
  group.add(box(0.06, 0.08, 0.06, MAT_BLACK, 0, 1.82, -0.22));

  // Arms (thin, slightly forward)
  group.add(box(0.15, 0.15, 0.6, MAT_BONE, 0.3, 1.4, -0.2));
  group.add(box(0.15, 0.15, 0.6, MAT_BONE, -0.3, 1.4, -0.2));

  // Legs (thin)
  group.add(box(0.15, 0.75, 0.15, MAT_BONE, 0.1, 0.375, 0));
  group.add(box(0.15, 0.75, 0.15, MAT_BONE, -0.1, 0.375, 0));

  return group;
}

// ---------------------------------------------------------------------------
// Public factory API
// ---------------------------------------------------------------------------

/**
 * Create a box-based Minecraft-style mob mesh for the given mob type.
 *
 * All meshes use {@link THREE.MeshLambertMaterial} with flat colours --
 * no external textures or models required.
 *
 * @param mobType numeric mob type from {@link MobTypeId}
 * @returns a THREE.Group ready to be added to the scene
 */
export function createMobMesh(mobType: number): THREE.Group {
  switch (mobType) {
    case MobTypeId.COW:
      return createCow();
    case MobTypeId.PIG:
      return createPig();
    case MobTypeId.CHICKEN:
      return createChicken();
    case MobTypeId.ZOMBIE:
      return createZombie();
    case MobTypeId.SKELETON:
      return createSkeleton();
    default:
      // Fallback: simple pink cube
      const g = new THREE.Group();
      g.add(box(0.5, 0.5, 0.5, MAT_PINK, 0, 0.25, 0));
      return g;
  }
}

/**
 * Dispose all geometries and remove children from a mob mesh group.
 * Materials are shared singletons and are *not* disposed here.
 */
export function disposeMobMesh(mesh: THREE.Group): void {
  mesh.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      (child as THREE.Mesh).geometry.dispose();
    }
  });

  // Remove from parent scene if still attached
  if (mesh.parent) {
    mesh.parent.remove(mesh);
  }
}
