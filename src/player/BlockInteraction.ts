import * as THREE from 'three';
import { inputManager } from '@/engine/InputManager';
import { Player } from '@/player/Player';
import { raycast, RaycastHit } from '@/physics/Raycast';
import { BlockType } from '@/types/BlockType';
import { BlockRegistry } from '@/world/BlockRegistry';
import { AABB } from '@/physics/AABB';
import { REACH_DISTANCE, PLAYER_WIDTH, PLAYER_HEIGHT } from '@/utils/Constants';
import { EventBus } from '@/utils/EventBus';
import { itemRegistry } from '@/items/ItemRegistry';
import { ToolDurability } from '@/items/ToolDurability';
import type { Inventory } from '@/player/Inventory';
import type { World } from '@/world/World';

// -------------------------------------------------------------------------
// Event types
// -------------------------------------------------------------------------

export interface BlockInteractionEvents {
  blockBroken: { x: number; y: number; z: number; type: BlockType };
  blockPlaced: { x: number; y: number; z: number; type: BlockType };
}

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

/** Line colour for the targeted-block wireframe highlight. */
const HIGHLIGHT_COLOR = 0x000000;

/** Slightly larger than 1 so the wireframe renders outside the block face. */
const HIGHLIGHT_SCALE = 1.005;

/** Number of crack overlay stages (0–9). */
const MINING_STAGES = 10;

/** Scale for the crack overlay box (slightly larger than the block). */
const CRACK_SCALE = 1.003;

// -------------------------------------------------------------------------
// BlockInteraction
// -------------------------------------------------------------------------

/**
 * Handles block breaking (left-click hold) and block placement (right-click).
 *
 * Each frame the player's look direction is raycast into the world.
 * If a solid block is within reach, a wireframe highlight is shown.
 * Holding left-click progressively mines the targeted block, with speed
 * determined by block hardness and the player's held tool.
 */
export class BlockInteraction {
  readonly events = new EventBus<BlockInteractionEvents>();

  /** The wireframe mesh added to the scene (reused every frame). */
  private highlight: THREE.LineSegments | null = null;

  /** The last raycast hit (null when looking at nothing). */
  private currentHit: RaycastHit | null = null;

  /** Reference to the player inventory for reading hotbar items. */
  private inventory: Inventory | null = null;

  /** Callback invoked when the player right-clicks while holding food. */
  private onEatFood: ((itemId: number) => boolean) | null = null;

  /** Callback invoked when right-clicking a functional block (furnace, etc.).
   *  Returns true if the callback handled the click (opens UI). */
  private onRightClickBlock: ((blockType: BlockType) => boolean) | null = null;

  // -- Mining progress state --

  /** Block coordinates currently being mined (null if not mining). */
  private miningTarget: { x: number; y: number; z: number } | null = null;

  /** Progress from 0 to 1.  Reaches 1 when the block breaks. */
  private miningProgress = 0;

  /** Last rendered crack stage (0–9), used to avoid redundant texture swaps. */
  private lastMiningStage = -1;

  /** Crack overlay mesh shown on the block being mined. */
  private crackOverlay: THREE.Mesh | null = null;

  /** Pre-generated crack textures for each mining stage. */
  private crackTextures: THREE.CanvasTexture[] = [];

  /** When true, left-click mining is suppressed (e.g. during attack cooldown). */
  suppressMining = false;

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Wire in the player inventory so placed blocks come from real slots. */
  setInventory(inv: Inventory): void {
    this.inventory = inv;
  }

  /** Set a callback for food consumption on right-click. */
  setEatCallback(cb: (itemId: number) => boolean): void {
    this.onEatFood = cb;
  }

  /** Set a callback for right-clicking functional blocks (furnace, crafting table). */
  setRightClickBlockCallback(cb: (blockType: BlockType) => boolean): void {
    this.onRightClickBlock = cb;
  }

  /**
   * Call once per frame.
   *
   * @param dt      Delta time in seconds since the last frame.
   * @param player  The player state (position, look direction, slot).
   * @param world   The voxel world for raycasting and block modification.
   * @param camera  The Three.js camera (used for ray direction).
   * @param scene   The Three.js scene (used for the highlight mesh).
   */
  update(
    dt: number,
    player: Player,
    world: World,
    camera: THREE.PerspectiveCamera,
    scene: THREE.Scene,
  ): void {
    // ----- Raycast -----
    const origin = player.getEyePosition();
    const direction = player.getLookDirection();
    this.currentHit = raycast(world, origin, direction, REACH_DISTANCE);

    // ----- Update highlight -----
    this.updateHighlight(scene);

    // ----- Handle input (only while pointer is locked) -----
    if (!inputManager.pointerLocked) {
      this.resetMining();
      return;
    }

    // Left-click held: progressive mining (suppressed during attack cooldown)
    if (inputManager.isMouseDown(0) && this.currentHit && !this.suppressMining) {
      this.updateMining(dt, player, world, scene);
    } else {
      this.resetMining();
    }

    // Right-click: place block (single press only)
    if (inputManager.isMousePressed(2)) {
      this.placeBlock(player, world);
    }
  }

  /**
   * Remove the highlight and crack overlay meshes from the scene and
   * release their geometry / materials.
   */
  dispose(scene: THREE.Scene): void {
    if (this.highlight) {
      scene.remove(this.highlight);
      this.highlight.geometry.dispose();
      (this.highlight.material as THREE.Material).dispose();
      this.highlight = null;
    }
    if (this.crackOverlay) {
      scene.remove(this.crackOverlay);
      this.crackOverlay.geometry.dispose();
      (this.crackOverlay.material as THREE.Material).dispose();
      this.crackOverlay = null;
    }
    for (const t of this.crackTextures) {
      t.dispose();
    }
    this.crackTextures = [];
  }

  // -----------------------------------------------------------------------
  // Mining
  // -----------------------------------------------------------------------

  /**
   * Advance mining progress for the currently targeted block.
   * Called each frame while left-click is held and a block is targeted.
   */
  private updateMining(
    dt: number,
    player: Player,
    world: World,
    scene: THREE.Scene,
  ): void {
    const hit = this.currentHit!;
    const blockType = world.getBlock(hit.blockX, hit.blockY, hit.blockZ);

    // Can't mine air or bedrock.
    if (blockType === BlockType.AIR || blockType === BlockType.BEDROCK) {
      this.resetMining();
      return;
    }

    // If the target block changed, restart mining.
    if (
      !this.miningTarget ||
      this.miningTarget.x !== hit.blockX ||
      this.miningTarget.y !== hit.blockY ||
      this.miningTarget.z !== hit.blockZ
    ) {
      this.miningTarget = { x: hit.blockX, y: hit.blockY, z: hit.blockZ };
      this.miningProgress = 0;
      this.lastMiningStage = -1;
    }

    // Get block hardness.
    let hardness = 0;
    if (BlockRegistry.has(blockType)) {
      hardness = BlockRegistry.get(blockType).hardness;
    }

    // Instant break for zero-hardness blocks (torches, flowers, tall grass).
    if (hardness <= 0) {
      this.finishBreaking(player, world, scene);
      return;
    }

    // Tool speed multiplier from held item.
    const stack = this.inventory
      ? this.inventory.getSlot(player.selectedSlot)
      : null;
    const speedMultiplier = ToolDurability.getMiningSpeedMultiplier(
      stack,
      blockType,
    );

    // Accumulate progress.  breakTime = hardness / speedMultiplier.
    const breakTime = hardness / speedMultiplier;
    this.miningProgress += dt / breakTime;

    // Update crack overlay visual.
    const stage = Math.min(
      Math.floor(this.miningProgress * MINING_STAGES),
      MINING_STAGES - 1,
    );
    if (stage !== this.lastMiningStage) {
      this.lastMiningStage = stage;
      this.updateCrackOverlay(scene, hit.blockX, hit.blockY, hit.blockZ, stage);
    }

    // Block breaks when progress reaches 1.0.
    if (this.miningProgress >= 1.0) {
      this.finishBreaking(player, world, scene);
    }
  }

  /** Break the target block, consume tool durability, emit event, and reset. */
  private finishBreaking(player: Player, world: World, scene: THREE.Scene): void {
    // Resolve which block to break -- use miningTarget if we have one,
    // otherwise fall back to currentHit (for instant-break blocks).
    const bx = this.miningTarget?.x ?? this.currentHit?.blockX;
    const by = this.miningTarget?.y ?? this.currentHit?.blockY;
    const bz = this.miningTarget?.z ?? this.currentHit?.blockZ;
    if (bx == null || by == null || bz == null) {
      this.resetMining();
      return;
    }

    const prevType = world.getBlock(bx, by, bz);
    if (prevType === BlockType.BEDROCK) {
      this.resetMining();
      return;
    }

    world.setBlock(bx, by, bz, BlockType.AIR);
    this.events.emit('blockBroken', { x: bx, y: by, z: bz, type: prevType });

    // Consume tool durability if the player is holding a tool.
    if (this.inventory) {
      const stack = this.inventory.getSlot(player.selectedSlot);
      if (stack && stack.durability !== undefined) {
        const broke = ToolDurability.useTool(stack);
        if (broke) {
          this.inventory.setSlot(player.selectedSlot, null);
        }
      }
    }

    this.resetMining();
  }

  /** Reset all mining progress and hide the crack overlay. */
  private resetMining(): void {
    this.miningTarget = null;
    this.miningProgress = 0;
    this.lastMiningStage = -1;
    if (this.crackOverlay) {
      this.crackOverlay.visible = false;
    }
  }

  // -----------------------------------------------------------------------
  // Crack overlay
  // -----------------------------------------------------------------------

  /** Ensure crack textures are generated, then show / update the overlay. */
  private updateCrackOverlay(
    scene: THREE.Scene,
    x: number,
    y: number,
    z: number,
    stage: number,
  ): void {
    // Lazy-init textures.
    if (this.crackTextures.length === 0) {
      this.crackTextures = this.generateCrackTextures();
    }

    // Lazy-init mesh.
    if (!this.crackOverlay) {
      const geometry = new THREE.BoxGeometry(CRACK_SCALE, CRACK_SCALE, CRACK_SCALE);
      const material = new THREE.MeshBasicMaterial({
        map: this.crackTextures[stage],
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      this.crackOverlay = new THREE.Mesh(geometry, material);
      this.crackOverlay.renderOrder = 998;
      scene.add(this.crackOverlay);
    } else {
      const mat = this.crackOverlay.material as THREE.MeshBasicMaterial;
      mat.map = this.crackTextures[stage];
      mat.needsUpdate = true;
    }

    this.crackOverlay.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.crackOverlay.visible = true;
  }

  /**
   * Generate 10 crack-stage textures via Canvas2D.
   * Stage 0 is barely cracked; stage 9 is heavily fragmented.
   */
  private generateCrackTextures(): THREE.CanvasTexture[] {
    const textures: THREE.CanvasTexture[] = [];
    const size = 16;

    for (let stage = 0; stage < MINING_STAGES; stage++) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, size, size);

      const intensity = (stage + 1) / MINING_STAGES;

      // Simple seeded PRNG so crack patterns are deterministic per stage.
      let seed = stage * 12345 + 67890;
      const rng = (): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };

      // Draw crack lines with increasing density.
      const numCracks = 1 + Math.floor(intensity * 6);
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.4 + intensity * 0.5})`;
      ctx.lineWidth = 1;

      for (let i = 0; i < numCracks; i++) {
        let cx = Math.floor(rng() * size);
        let cy = Math.floor(rng() * size);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const segments = 2 + Math.floor(rng() * 4);
        for (let j = 0; j < segments; j++) {
          cx += Math.floor((rng() - 0.5) * 8);
          cy += Math.floor((rng() - 0.5) * 8);
          cx = Math.max(0, Math.min(size, cx));
          cy = Math.max(0, Math.min(size, cy));
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }

      // Darken the face slightly as mining progresses.
      ctx.fillStyle = `rgba(0, 0, 0, ${intensity * 0.15})`;
      ctx.fillRect(0, 0, size, size);

      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      textures.push(texture);
    }

    return textures;
  }

  // -----------------------------------------------------------------------
  // Block placement
  // -----------------------------------------------------------------------

  private placeBlock(player: Player, world: World): void {
    // --- Functional block interaction (furnace, crafting table) ---
    if (this.currentHit && this.onRightClickBlock) {
      const targetType = world.getBlock(
        this.currentHit.blockX,
        this.currentHit.blockY,
        this.currentHit.blockZ,
      );
      if (this.onRightClickBlock(targetType)) {
        return;
      }
    }

    if (!this.inventory) return;
    const stack = this.inventory.getSlot(player.selectedSlot);
    if (!stack || stack.isEmpty()) return;

    const itemDef = itemRegistry.getItem(stack.itemId);
    if (!itemDef) return;

    // --- Food consumption (doesn't require targeting a block) ---
    if (!itemDef.isBlock && this.onEatFood) {
      if (this.onEatFood(stack.itemId)) {
        stack.count -= 1;
        if (stack.count <= 0) {
          this.inventory.setSlot(player.selectedSlot, null);
        }
      }
      return;
    }

    // --- Block placement (requires targeting a block) ---
    if (!itemDef.isBlock || itemDef.blockType == null) return;

    const hit = this.currentHit;
    if (!hit) return;

    // Determine placement position from the hit face normal.
    const px = hit.blockX + hit.faceNormal.x;
    const py = hit.blockY + hit.faceNormal.y;
    const pz = hit.blockZ + hit.faceNormal.z;

    // Prevent placing a block inside the player.
    const playerAABB = AABB.fromPositionSize(
      player.position.x,
      player.position.y,
      player.position.z,
      PLAYER_WIDTH,
      PLAYER_HEIGHT,
    );
    const blockAABB = AABB.fromBlock(px, py, pz);
    if (playerAABB.intersects(blockAABB)) return;

    // Don't overwrite an existing solid block.
    const existing = world.getBlock(px, py, pz);
    if (existing !== BlockType.AIR && existing !== BlockType.WATER) return;

    const blockType = itemDef.blockType;
    world.setBlock(px, py, pz, blockType);

    // Consume one item from the slot.
    stack.count -= 1;
    if (stack.count <= 0) {
      this.inventory.setSlot(player.selectedSlot, null);
    }

    this.events.emit('blockPlaced', {
      x: px,
      y: py,
      z: pz,
      type: blockType,
    });
  }

  // -----------------------------------------------------------------------
  // Highlight
  // -----------------------------------------------------------------------

  private updateHighlight(scene: THREE.Scene): void {
    if (!this.currentHit) {
      if (this.highlight) {
        this.highlight.visible = false;
      }
      return;
    }

    if (!this.highlight) {
      this.highlight = this.createHighlightMesh();
      scene.add(this.highlight);
    }

    const { blockX, blockY, blockZ } = this.currentHit;
    this.highlight.position.set(blockX + 0.5, blockY + 0.5, blockZ + 0.5);
    this.highlight.visible = true;
  }

  private createHighlightMesh(): THREE.LineSegments {
    const geometry = new THREE.BoxGeometry(
      HIGHLIGHT_SCALE,
      HIGHLIGHT_SCALE,
      HIGHLIGHT_SCALE,
    );
    const edges = new THREE.EdgesGeometry(geometry);
    geometry.dispose();

    const material = new THREE.LineBasicMaterial({
      color: HIGHLIGHT_COLOR,
      linewidth: 2,
      depthTest: true,
      transparent: true,
      opacity: 0.4,
    });

    const mesh = new THREE.LineSegments(edges, material);
    mesh.renderOrder = 999;
    return mesh;
  }
}
