import * as THREE from 'three';
import { ITEM_COLORS, DEFAULT_ITEM_COLOR } from '@/ui/ItemIconGenerator';
import { soundManager } from '@/engine/SoundManager';
import type { Inventory } from '@/player/Inventory';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum number of dropped items in the world at once. */
const POOL_SIZE = 64;

/** Seconds after spawning before the item can be picked up. */
const PICKUP_DELAY = 0.5;

/** Distance (blocks) at which the player picks up items. */
const PICKUP_RADIUS = 1.5;

/** Seconds until a dropped item despawns. */
const DESPAWN_TIME = 300;

/** Side length of the item cube mesh. */
const ITEM_SIZE = 0.25;

/** Bob animation speed (radians / second). */
const BOB_SPEED = 2;

/** Bob animation amplitude (blocks). */
const BOB_AMPLITUDE = 0.1;

/** Gravity applied to dropped items (blocks / s^2). */
const GRAVITY = -15;

/** Maximum horizontal throw speed. */
const THROW_SPEED = 3;

/** Initial upward throw speed. */
const THROW_UP_SPEED = 5;

/** Spin speed when grounded (radians / second). */
const SPIN_SPEED = 1.5;

// ---------------------------------------------------------------------------
// DroppedItem
// ---------------------------------------------------------------------------

interface DroppedItem {
  active: boolean;
  itemId: number;
  count: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  grounded: boolean;
  mesh: THREE.Mesh;
}

// ---------------------------------------------------------------------------
// Shared geometry
// ---------------------------------------------------------------------------

const sharedGeometry = new THREE.BoxGeometry(ITEM_SIZE, ITEM_SIZE, ITEM_SIZE);

// ---------------------------------------------------------------------------
// DroppedItemManager
// ---------------------------------------------------------------------------

/**
 * Manages a pool of small 3D cubes that represent items dropped in the world
 * (e.g. from broken blocks).  Items arc outward under gravity, land, bob and
 * spin, and are picked up when the player walks close enough.
 */
export class DroppedItemManager {
  private pool: DroppedItem[] = [];
  private scene: THREE.Scene | null = null;
  private getBlock!: (x: number, y: number, z: number) => number;

  constructor() {
    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(sharedGeometry, material);
      mesh.visible = false;

      this.pool.push({
        active: false,
        itemId: 0,
        count: 0,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 0,
        grounded: false,
        mesh,
      });
    }
  }

  /**
   * Initialise with a scene reference and a block-lookup callback.
   *
   * @param scene    The Three.js scene to add item meshes to.
   * @param getBlock Returns the BlockType at world coordinates (x, y, z).
   */
  init(
    scene: THREE.Scene,
    getBlock: (x: number, y: number, z: number) => number,
  ): void {
    this.scene = scene;
    this.getBlock = getBlock;
  }

  /**
   * Spawn a dropped item at the given world position.
   * The item flies outward with a random velocity before landing.
   */
  spawnItem(
    x: number,
    y: number,
    z: number,
    itemId: number,
    count: number,
  ): void {
    const item = this.acquire();
    if (!item) return;

    item.itemId = itemId;
    item.count = count;
    item.age = 0;
    item.grounded = false;

    // Start at the centre of the broken block.
    item.position.set(x + 0.5, y + 0.5, z + 0.5);

    // Random outward + upward throw.
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * THROW_SPEED;
    item.velocity.set(
      Math.cos(angle) * speed,
      THROW_UP_SPEED,
      Math.sin(angle) * speed,
    );

    // Colour from the shared item colour map.
    const hexColor = ITEM_COLORS[itemId] ?? DEFAULT_ITEM_COLOR;
    (item.mesh.material as THREE.MeshBasicMaterial).color.set(hexColor);

    item.mesh.position.copy(item.position);
    item.mesh.rotation.set(0, 0, 0);
    item.mesh.visible = true;

    if (this.scene && !item.mesh.parent) {
      this.scene.add(item.mesh);
    }
  }

  /**
   * Advance all active dropped items.
   * Handles gravity, ground collision, bob animation, and player pickup.
   */
  update(
    dt: number,
    playerPosition: THREE.Vector3,
    inventory: Inventory,
  ): void {
    for (const item of this.pool) {
      if (!item.active) continue;

      item.age += dt;

      // Despawn after timeout.
      if (item.age > DESPAWN_TIME) {
        this.release(item);
        continue;
      }

      // Despawn if fallen into the void.
      if (item.position.y < -10) {
        this.release(item);
        continue;
      }

      // ---- Physics ----
      if (!item.grounded) {
        item.velocity.y += GRAVITY * dt;
        item.position.x += item.velocity.x * dt;
        item.position.y += item.velocity.y * dt;
        item.position.z += item.velocity.z * dt;

        // Simple ground collision -- check the block below the item.
        const bx = Math.floor(item.position.x);
        const by = Math.floor(item.position.y - ITEM_SIZE / 2);
        const bz = Math.floor(item.position.z);
        const below = this.getBlock(bx, by, bz);

        if (below !== 0 /* AIR */ && below !== 5 /* WATER */) {
          // Land on top of the block.
          item.position.y = by + 1 + ITEM_SIZE / 2;
          item.velocity.set(0, 0, 0);
          item.grounded = true;
        }
      }

      // ---- Animation ----
      if (item.grounded) {
        const bob = Math.sin(item.age * BOB_SPEED) * BOB_AMPLITUDE;
        item.mesh.position.set(
          item.position.x,
          item.position.y + bob,
          item.position.z,
        );
        item.mesh.rotation.y += dt * SPIN_SPEED;
      } else {
        item.mesh.position.copy(item.position);
      }

      // ---- Pickup ----
      if (item.age > PICKUP_DELAY) {
        const dx = playerPosition.x - item.position.x;
        const dy = playerPosition.y + 0.9 - item.position.y; // Approximate player centre
        const dz = playerPosition.z - item.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < PICKUP_RADIUS * PICKUP_RADIUS) {
          inventory.addItem(item.itemId, item.count);
          soundManager.playPickup();
          this.release(item);
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Pool management
  // -----------------------------------------------------------------------

  private acquire(): DroppedItem | null {
    for (const item of this.pool) {
      if (!item.active) {
        item.active = true;
        return item;
      }
    }
    return null;
  }

  private release(item: DroppedItem): void {
    item.active = false;
    item.mesh.visible = false;
  }
}
