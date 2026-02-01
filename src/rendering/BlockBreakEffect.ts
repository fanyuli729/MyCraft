import * as THREE from 'three';
import { BlockType } from '@/types/BlockType';
import { BlockRegistry } from '@/world/BlockRegistry';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Number of particles pre-allocated in the object pool. */
const POOL_SIZE = 100;

/** Side length of each particle cube. */
const PARTICLE_SIZE = 0.1;

/** Minimum / maximum number of particles spawned per block break. */
const MIN_PARTICLES = 8;
const MAX_PARTICLES = 12;

/** Gravity applied to particles (blocks / s^2, downward). */
const PARTICLE_GRAVITY = -15;

/** Particle lifetime bounds in seconds. */
const MIN_LIFETIME = 0.5;
const MAX_LIFETIME = 1.0;

/** Maximum initial outward speed. */
const OUTWARD_SPEED = 3;

/** Initial upward speed range. */
const UP_SPEED_MIN = 1;
const UP_SPEED_MAX = 4;

// ---------------------------------------------------------------------------
// Particle
// ---------------------------------------------------------------------------

/** Internal state for a single break particle. */
interface Particle {
  /** Whether this pool entry is currently in use. */
  active: boolean;
  /** World-space position. */
  position: THREE.Vector3;
  /** Velocity in blocks / second. */
  velocity: THREE.Vector3;
  /** Remaining lifetime in seconds. */
  life: number;
  /** Total lifetime, used for opacity fade. */
  maxLife: number;
  /** The Three.js mesh (shared geometry, unique material clone). */
  mesh: THREE.Mesh;
}

// ---------------------------------------------------------------------------
// Shared geometry
// ---------------------------------------------------------------------------

const sharedGeometry = new THREE.BoxGeometry(PARTICLE_SIZE, PARTICLE_SIZE, PARTICLE_SIZE);

// ---------------------------------------------------------------------------
// Rough colour mapping per block type
// ---------------------------------------------------------------------------

/** Return a representative colour for the given block type. */
function getBlockColor(blockType: BlockType): THREE.Color {
  switch (blockType) {
    case BlockType.GRASS:
      return new THREE.Color(0x5b8c32);
    case BlockType.DIRT:
      return new THREE.Color(0x7b5b3a);
    case BlockType.STONE:
    case BlockType.COBBLESTONE:
      return new THREE.Color(0x7f7f7f);
    case BlockType.SAND:
    case BlockType.SAND_STONE:
      return new THREE.Color(0xdbc67b);
    case BlockType.WOOD_OAK:
    case BlockType.WOOD_BIRCH:
    case BlockType.WOOD_SPRUCE:
      return new THREE.Color(0x6b4f2e);
    case BlockType.LEAVES_OAK:
    case BlockType.LEAVES_BIRCH:
    case BlockType.LEAVES_SPRUCE:
      return new THREE.Color(0x2e7d32);
    case BlockType.COAL_ORE:
      return new THREE.Color(0x2c2c2c);
    case BlockType.IRON_ORE:
      return new THREE.Color(0xb0896e);
    case BlockType.GOLD_ORE:
      return new THREE.Color(0xe6c84d);
    case BlockType.DIAMOND_ORE:
      return new THREE.Color(0x5ce6d6);
    case BlockType.GRAVEL:
      return new THREE.Color(0x6b6b6b);
    case BlockType.SNOW:
      return new THREE.Color(0xf0f0f0);
    case BlockType.ICE:
      return new THREE.Color(0xa0d8ef);
    case BlockType.PLANKS_OAK:
      return new THREE.Color(0xb8945f);
    case BlockType.GLASS:
      return new THREE.Color(0xd4ecf7);
    default:
      return new THREE.Color(0x888888);
  }
}

// ---------------------------------------------------------------------------
// BlockBreakEffect
// ---------------------------------------------------------------------------

/**
 * Manages a pool of small cube particles that are spawned when a block is
 * broken. Particles fly outward, arc under gravity, fade out, and are then
 * recycled back into the pool.
 */
export class BlockBreakEffect {
  private pool: Particle[] = [];
  private scene: THREE.Scene | null = null;

  constructor() {
    // Pre-allocate the particle pool.
    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(sharedGeometry, material);
      mesh.visible = false;

      this.pool.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        mesh,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Spawn 8-12 break particles at the centre of the given block position.
   *
   * @param scene     The Three.js scene to add particle meshes to.
   * @param blockX    World X of the broken block.
   * @param blockY    World Y of the broken block.
   * @param blockZ    World Z of the broken block.
   * @param blockType The type of block that was broken (for colour).
   */
  spawnBreakParticles(
    scene: THREE.Scene,
    blockX: number,
    blockY: number,
    blockZ: number,
    blockType: BlockType,
  ): void {
    this.scene = scene;

    const count = MIN_PARTICLES + Math.floor(Math.random() * (MAX_PARTICLES - MIN_PARTICLES + 1));
    const color = getBlockColor(blockType);
    const centre = new THREE.Vector3(blockX + 0.5, blockY + 0.5, blockZ + 0.5);

    for (let i = 0; i < count; i++) {
      const particle = this.acquire();
      if (!particle) break; // Pool exhausted

      // Position: near the centre of the broken block, with slight jitter.
      particle.position.set(
        centre.x + (Math.random() - 0.5) * 0.4,
        centre.y + (Math.random() - 0.5) * 0.4,
        centre.z + (Math.random() - 0.5) * 0.4,
      );

      // Velocity: random outward + upward
      const angle = Math.random() * Math.PI * 2;
      const outSpeed = Math.random() * OUTWARD_SPEED;
      particle.velocity.set(
        Math.cos(angle) * outSpeed,
        UP_SPEED_MIN + Math.random() * (UP_SPEED_MAX - UP_SPEED_MIN),
        Math.sin(angle) * outSpeed,
      );

      // Lifetime
      particle.life = MIN_LIFETIME + Math.random() * (MAX_LIFETIME - MIN_LIFETIME);
      particle.maxLife = particle.life;

      // Material colour
      const material = particle.mesh.material as THREE.MeshBasicMaterial;
      material.color.copy(color);
      material.opacity = 1;

      // Sync mesh
      particle.mesh.position.copy(particle.position);
      particle.mesh.visible = true;

      if (!particle.mesh.parent) {
        scene.add(particle.mesh);
      }
    }
  }

  /**
   * Advance all active particles by `dt` seconds.
   * Handles gravity, fading, and recycling expired particles.
   */
  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;

      // Apply gravity
      p.velocity.y += PARTICLE_GRAVITY * dt;

      // Integrate position
      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z += p.velocity.z * dt;

      // Decrease life
      p.life -= dt;

      // Fade opacity
      const opacity = Math.max(p.life / p.maxLife, 0);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;

      // Sync mesh position
      p.mesh.position.copy(p.position);

      // Recycle dead particles
      if (p.life <= 0) {
        this.release(p);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Pool management
  // -----------------------------------------------------------------------

  /** Acquire an inactive particle from the pool. */
  private acquire(): Particle | null {
    for (const p of this.pool) {
      if (!p.active) {
        p.active = true;
        return p;
      }
    }
    return null;
  }

  /** Release a particle back into the pool. */
  private release(particle: Particle): void {
    particle.active = false;
    particle.mesh.visible = false;
  }
}
