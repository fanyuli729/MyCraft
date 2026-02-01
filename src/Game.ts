import * as THREE from 'three';
import { Engine } from './engine/Engine';
import { inputManager } from './engine/InputManager';
import { World } from './world/World';
import { ChunkManager } from './world/ChunkManager';
import { TerrainGenerator } from './terrain/TerrainGenerator';
import { Player } from './player/Player';
import { PlayerController } from './player/PlayerController';
import { PlayerPhysics } from './player/PlayerPhysics';
import { BlockInteraction } from './player/BlockInteraction';
import { Inventory } from './player/Inventory';
import { InventoryManager } from './player/InventoryManager';
import { SceneManager } from './rendering/SceneManager';
import { FogManager } from './rendering/FogManager';
import { DayNightCycle } from './rendering/DayNightCycle';
import { SkyRenderer } from './rendering/SkyRenderer';
import { BlockBreakEffect } from './rendering/BlockBreakEffect';
import { WaterRenderer } from './rendering/WaterRenderer';
import { PerformanceManager } from './rendering/PerformanceManager';
import { UIManager } from './ui/UIManager';
import { HUD } from './ui/HUD';
import { HotbarUI } from './ui/HotbarUI';
import { InventoryUI } from './ui/InventoryUI';
import { CraftingUI } from './ui/CraftingUI';
import { FurnaceUI } from './ui/FurnaceUI';
import { PauseMenu, pauseMenuBus } from './ui/PauseMenu';
import { DebugOverlay } from './ui/DebugOverlay';
import { MobManager } from './entities/MobManager';
import { Transform, Velocity } from './entities/ECSWorld';
import { DroppedItemManager } from './entities/DroppedItemManager';
import { SaveManager } from './save/SaveManager';
import { WorldStorage } from './save/WorldStorage';
import { PlayerStorage } from './save/PlayerStorage';
import { FallDamage } from './player/FallDamage';
import { HungerSystem } from './player/HungerSystem';
import { BiomeMap } from './terrain/BiomeMap';
import { BlockType } from './types/BlockType';
import { ToolType, ToolTier } from './items/Item';
import { itemRegistry } from './items/ItemRegistry';
import { SEA_LEVEL, REACH_DISTANCE, MAX_AIR } from './utils/Constants';
import { eventBus } from './utils/EventBus';
import { soundManager } from './engine/SoundManager';

export class Game {
  private engine: Engine;
  private world!: World;
  private chunkManager!: ChunkManager;
  private terrainGenerator!: TerrainGenerator;
  private player!: Player;
  private playerController!: PlayerController;
  private playerPhysics!: PlayerPhysics;
  private blockInteraction!: BlockInteraction;
  private inventory!: Inventory;
  private inventoryManager!: InventoryManager;
  private sceneManager!: SceneManager;
  private fogManager!: FogManager;
  private dayNightCycle!: DayNightCycle;
  private skyRenderer!: SkyRenderer;
  private blockBreakEffect!: BlockBreakEffect;
  private waterRenderer!: WaterRenderer;
  private performanceManager!: PerformanceManager;
  private uiManager!: UIManager;
  private hud!: HUD;
  private hotbarUI!: HotbarUI;
  private inventoryUI!: InventoryUI;
  private craftingUI!: CraftingUI;
  private furnaceUI!: FurnaceUI;
  private pauseMenu!: PauseMenu;
  private debugOverlay!: DebugOverlay;
  private mobManager!: MobManager;
  private droppedItemManager!: DroppedItemManager;
  private saveManager!: SaveManager;
  private worldStorage!: WorldStorage;
  private fallDamage!: FallDamage;
  private hungerSystem!: HungerSystem;
  private biomeMap!: BiomeMap;
  private seed: number = 0;
  /** Cooldown timer (seconds) to prevent ESC from toggling multiple times. */
  private escCooldown = 0;
  /** Previous frame's grounded state, for landing detection. */
  private prevGrounded = false;
  /** Cooldown after attacking a mob (prevents mining + attack spam). */
  private attackCooldown = 0;
  /** Accumulator for air depletion ticks (1 air unit per 0.05s = 20/sec). */
  private airTickAccum = 0;
  /** Accumulator for drowning damage ticks (2 damage per second). */
  private drownDmgAccum = 0;
  /** Reusable Three.js raycaster for mob hit detection. */
  private readonly raycaster = new THREE.Raycaster();

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas);
  }

  async init(): Promise<void> {
    this.updateLoadingProgress('Initializing...', 5);

    // Check for existing save
    this.worldStorage = new WorldStorage();
    await this.worldStorage.open();
    this.saveManager = new SaveManager();
    await this.saveManager.init(this.worldStorage);

    const existingSave = await this.saveManager.hasSaveData();
    let playerSaveData = null;

    if (existingSave) {
      this.updateLoadingProgress('Loading saved world...', 10);
      const saveData = await this.saveManager.loadWorld();
      if (saveData) {
        this.seed = saveData.seed;
        playerSaveData = saveData.playerData;
      } else {
        this.seed = Math.floor(Math.random() * 2147483647);
      }
    } else {
      this.seed = Math.floor(Math.random() * 2147483647);
    }

    this.updateLoadingProgress('Generating textures...', 15);

    this.updateLoadingProgress('Setting up world...', 25);

    // Terrain & world
    // ChunkManager constructor takes only (sceneManager) -- it creates its
    // own atlas texture and materials internally.
    this.biomeMap = new BiomeMap(this.seed);
    this.terrainGenerator = new TerrainGenerator(this.seed);
    this.sceneManager = new SceneManager(this.engine.scene);
    this.chunkManager = new ChunkManager(this.sceneManager);

    // Wire the terrain generator into the chunk manager so newly created
    // chunks are populated automatically.
    this.chunkManager.setGenerator((chunk) => {
      this.terrainGenerator.generateChunk(chunk);
    });

    // World requires chunkManager in its constructor.
    this.world = new World(this.chunkManager);

    this.updateLoadingProgress('Setting up player...', 35);

    // Player
    this.player = new Player();
    this.inventory = new Inventory();
    this.inventoryManager = new InventoryManager();
    this.playerController = new PlayerController();
    this.playerPhysics = new PlayerPhysics();
    this.blockInteraction = new BlockInteraction();
    this.blockInteraction.setInventory(this.inventory);
    this.blockInteraction.setEatCallback((itemId) => {
      const restored = this.hungerSystem.eat(itemId, this.player);
      if (restored > 0) soundManager.playEat();
      return restored > 0;
    });
    this.blockInteraction.setRightClickBlockCallback((blockType) => {
      if (blockType === BlockType.FURNACE) {
        this.uiManager.pushScreen(this.furnaceUI);
        return true;
      }
      if (blockType === BlockType.CRAFTING_TABLE) {
        this.uiManager.pushScreen(this.craftingUI);
        return true;
      }
      return false;
    });
    this.fallDamage = new FallDamage();
    this.hungerSystem = new HungerSystem();

    // Apply saved player data or set defaults
    if (playerSaveData) {
      PlayerStorage.applyToPlayer(playerSaveData, this.player, this.inventory);
    }

    // Give starter items if inventory is completely empty (fresh start OR stale save)
    if (this.isInventoryEmpty()) {
      this.inventory.addItem(BlockType.DIRT, 64);
      this.inventory.addItem(BlockType.STONE, 64);
      this.inventory.addItem(BlockType.WOOD_OAK, 64);
      this.inventory.addItem(BlockType.COBBLESTONE, 64);
      this.inventory.addItem(BlockType.PLANKS_OAK, 64);
      this.inventory.addItem(BlockType.GLASS, 32);
      this.inventory.addItem(BlockType.TORCH, 32);
      this.inventory.addItem(BlockType.SAND, 32);
    }

    this.updateLoadingProgress('Generating terrain...', 45);

    // Input
    const canvas = this.engine.renderer.domElement;
    inputManager.init(canvas);

    // Generate initial chunks
    await this.chunkManager.generateInitialChunks(
      this.player.position.x,
      this.player.position.z,
      (progress) => {
        this.updateLoadingProgress(
          'Generating terrain...',
          45 + progress * 30
        );
      }
    );

    // Find spawn height if no save data
    if (!playerSaveData) {
      const spawnY = this.findSpawnHeight(0, 0);
      this.player.position.set(0, spawnY + 1, 0);
    }

    this.updateLoadingProgress('Setting up rendering...', 80);

    // Rendering
    // FogManager constructor takes (renderer: THREE.WebGLRenderer).
    this.fogManager = new FogManager(this.engine.renderer);
    this.dayNightCycle = new DayNightCycle();
    this.skyRenderer = new SkyRenderer();
    this.skyRenderer.init(this.engine.scene);
    this.blockBreakEffect = new BlockBreakEffect();
    this.waterRenderer = new WaterRenderer();
    this.performanceManager = new PerformanceManager();

    // Register chunk materials with the fog manager so it keeps their
    // uniforms synchronised.
    this.fogManager.registerMaterial(this.chunkManager.getOpaqueMaterial());
    this.fogManager.registerMaterial(this.chunkManager.getTransparentMaterial());

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.engine.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    this.engine.scene.add(directionalLight);

    this.updateLoadingProgress('Setting up UI...', 90);

    // UI
    // UIManager constructor takes no arguments -- it finds or creates
    // the #ui-root element itself.
    this.uiManager = new UIManager();
    const uiRoot = this.uiManager.getRoot();

    this.hud = new HUD();
    this.hud.init(uiRoot);
    this.hotbarUI = new HotbarUI();
    this.hotbarUI.init(uiRoot);
    this.debugOverlay = new DebugOverlay();
    this.debugOverlay.init(uiRoot);

    // InventoryUI and CraftingUI constructors take no arguments; inventory
    // is wired via setInventory().
    this.inventoryUI = new InventoryUI();
    this.inventoryUI.setInventory(this.inventory);
    this.craftingUI = new CraftingUI();
    this.craftingUI.setInventory(this.inventory);
    this.furnaceUI = new FurnaceUI();
    this.furnaceUI.setInventory(this.inventory);

    // PauseMenu constructor takes no arguments.
    this.pauseMenu = new PauseMenu();
    this.pauseMenu.setResumeCallback(() => {
      this.uiManager.popScreen();
    });

    // Mobs
    this.mobManager = new MobManager();
    this.mobManager.init(
      this.engine.scene,
      (x: number, y: number, z: number) => this.world.getBlock(x, y, z),
      // Mob attacks player
      (amount: number) => {
        this.player.health = Math.max(0, this.player.health - amount);
        soundManager.playHurt();
      },
      // Mob dies → spawn item drops
      (_eid, _mobType, _meshIndex, x, y, z, dropItem) => {
        const itemId = this.getMobDropItemId(dropItem);
        if (itemId > 0) {
          this.droppedItemManager.spawnItem(x, y, z, itemId, 1);
        }
      },
    );

    // Dropped items
    this.droppedItemManager = new DroppedItemManager();
    this.droppedItemManager.init(
      this.engine.scene,
      (x: number, y: number, z: number) => this.world.getBlock(x, y, z),
    );

    this.updateLoadingProgress('Setting up events...', 95);

    // Events
    this.setupEvents();

    // Auto-save
    this.saveManager.startAutoSave(async () => {
      await this.saveWorld();
    });

    this.updateLoadingProgress('Ready!', 100);

    // Hide loading screen after a brief delay
    setTimeout(() => {
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.style.display = 'none';
      }
    }, 300);
  }

  private setupEvents(): void {
    // Bridge BlockInteraction's own EventBus events into the global eventBus.
    this.blockInteraction.events.on('blockBroken', (data) => {
      eventBus.emit('blockBroken', {
        x: data.x,
        y: data.y,
        z: data.z,
        blockType: data.type,
      });
    });

    this.blockInteraction.events.on('blockPlaced', (data) => {
      eventBus.emit('blockPlaced', {
        x: data.x,
        y: data.y,
        z: data.z,
        blockType: data.type,
      });
      soundManager.playBlockPlace();
    });

    // Listen for global events
    eventBus.on('blockBroken', (data: { x: number; y: number; z: number; blockType: number }) => {
      this.blockBreakEffect.spawnBreakParticles(
        this.engine.scene,
        data.x,
        data.y,
        data.z,
        data.blockType as BlockType
      );

      // Spawn a 3D dropped item instead of adding directly to inventory.
      const dropId = this.getBlockDrop(data.blockType as BlockType);
      if (dropId > 0) {
        this.droppedItemManager.spawnItem(data.x, data.y, data.z, dropId, 1);
      }

      soundManager.playBlockBreak();
    });

    eventBus.on('openCraftingTable', () => {
      this.uiManager.pushScreen(this.craftingUI);
    });

    eventBus.on('saveRequested', async () => {
      await this.saveWorld();
    });

    // Bridge PauseMenu's own bus into our save logic.
    pauseMenuBus.on('saveWorld', () => {
      this.saveWorld();
    });
  }

  start(): void {
    this.engine.onUpdate((dt) => this.update(dt));
    this.engine.start();
  }

  private update(dt: number): void {
    // Handle UI toggling
    this.escCooldown = Math.max(0, this.escCooldown - dt);

    if (inputManager.isKeyPressed('e') && !this.uiManager.isScreenOpen()) {
      this.uiManager.pushScreen(this.inventoryUI);
    } else if (inputManager.isKeyPressed('escape') && this.escCooldown <= 0) {
      this.escCooldown = 0.25;
      if (this.uiManager.isScreenOpen()) {
        this.uiManager.popScreen();
      } else {
        this.uiManager.pushScreen(this.pauseMenu);
      }
    }
    if (inputManager.isKeyPressed('f3')) {
      this.debugOverlay.toggle();
    }

    const uiOpen = this.uiManager.isScreenOpen();

    // Suppress canvas pointer-lock requests while any UI screen is open,
    // otherwise clicking on UI buttons re-locks the pointer.
    inputManager.suppressPointerLock = uiOpen;

    // Tell the Engine to skip Three.js rendering while a UI overlay is open.
    // The last drawn frame stays on screen, preventing visual flickering
    // behind the semi-transparent pause overlay.
    this.engine.skipRender = uiOpen;

    if (!uiOpen) {
      // Player input & physics
      this.playerController.update(dt, this.player, this.engine.camera);
      this.playerPhysics.update(dt, this.player, this.world);

      // Fall damage & landing sounds (water cancels fall damage)
      const fallDmg = this.player.inWater
        ? (this.fallDamage.update(this.player, true), 0) // reset tracker, no damage
        : this.fallDamage.update(this.player, this.player.grounded);
      if (fallDmg > 0) {
        this.player.health = Math.max(0, this.player.health - fallDmg);
        soundManager.playHurt();
      }
      if (!this.prevGrounded && this.player.grounded) {
        soundManager.playLand(fallDmg > 0 ? 1.0 : 0.3);
      }
      this.prevGrounded = this.player.grounded;

      // Drowning -- deplete air when head is submerged, damage when out of air
      if (this.player.headSubmerged) {
        this.airTickAccum += dt;
        while (this.airTickAccum >= 0.05) {
          this.airTickAccum -= 0.05;
          if (this.player.air > 0) {
            this.player.air--;
          }
        }
        if (this.player.air <= 0) {
          this.drownDmgAccum += dt;
          while (this.drownDmgAccum >= 0.5) {
            this.drownDmgAccum -= 0.5;
            this.player.health = Math.max(0, this.player.health - 2);
            soundManager.playHurt();
          }
        }
      } else {
        // Replenish air quickly when head is above water
        this.airTickAccum = 0;
        this.drownDmgAccum = 0;
        if (this.player.air < MAX_AIR) {
          this.player.air = Math.min(MAX_AIR, this.player.air + Math.ceil(dt * 60));
        }
      }

      // Mob attack (left-click on mob)
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
      if (
        inputManager.pointerLocked &&
        inputManager.isMousePressed(0) &&
        this.attackCooldown <= 0
      ) {
        if (this.tryAttackMob()) {
          this.attackCooldown = 0.5;
        }
      }
      this.blockInteraction.suppressMining = this.attackCooldown > 0;

      // Block interaction
      this.blockInteraction.update(
        dt,
        this.player,
        this.world,
        this.engine.camera,
        this.engine.scene
      );

      // Hunger
      const isMoving = this.player.velocity.length() > 0.1;
      this.hungerSystem.update(dt, this.player, isMoving, this.player.sprinting);

      // Footstep sounds
      if (this.player.grounded && isMoving) {
        const hSpeed = Math.sqrt(
          this.player.velocity.x ** 2 + this.player.velocity.z ** 2,
        );
        soundManager.updateFootsteps(dt, hSpeed, this.player.sprinting);
      } else {
        soundManager.resetFootsteps();
      }

      // Day/night
      this.dayNightCycle.update(dt);
      this.skyRenderer.update(this.dayNightCycle, this.engine.camera);
      this.fogManager.update(this.engine.camera, this.dayNightCycle.getTimeOfDay());

      // Effects
      this.blockBreakEffect.update(dt);
      this.waterRenderer.update(dt, this.chunkManager.getTransparentMaterial());

      // Mobs
      this.mobManager.update(
        dt,
        this.player.position,
        this.dayNightCycle.isNight()
      );

      // Dropped items (physics, pickup)
      this.droppedItemManager.update(
        dt,
        this.player.position,
        this.inventory,
      );

      // Performance
      this.performanceManager.update(this.engine.camera);
    }

    // Chunk manager always runs so initial mesh loading completes
    // even if the user opens a menu early.
    this.chunkManager.update(this.player.position.x, this.player.position.z);

    // UI
    this.hud.update(this.player);
    this.hotbarUI.update(this.inventory, this.player.selectedSlot);
    this.debugOverlay.update(this.player, this.engine.clock, this.biomeMap);
    this.uiManager.update();

    // Input cleanup (must be last)
    inputManager.update();
  }

  /** Determine what item a block drops when broken. Returns 0 for no drop. */
  private getBlockDrop(blockType: BlockType): number {
    switch (blockType) {
      case BlockType.AIR:
      case BlockType.WATER:
      case BlockType.BEDROCK:
        return 0;
      case BlockType.STONE:
        return BlockType.COBBLESTONE;
      case BlockType.GRASS:
        return BlockType.DIRT;
      case BlockType.COAL_ORE:
        return 201; // Coal
      case BlockType.DIAMOND_ORE:
        return 204; // Diamond
      default:
        return blockType;
    }
  }

  /** Map DamageSystem drop string to an item ID. Returns 0 for unknown drops. */
  private getMobDropItemId(dropItem: string | undefined): number {
    switch (dropItem) {
      case 'raw_beef': return 207;
      case 'raw_porkchop': return 208;
      case 'raw_chicken': return 209;
      case 'rotten_flesh': return 210;
      case 'bone': return 211;
      default: return 0;
    }
  }

  /**
   * Raycast from the player's eye toward mobs.
   * If a mob is hit within reach, deal damage and apply knockback.
   * @returns true if a mob was attacked.
   */
  private tryAttackMob(): boolean {
    const origin = this.player.getEyePosition();
    const dir = this.player.getLookDirection();

    this.raycaster.set(origin, dir);
    this.raycaster.far = REACH_DISTANCE;

    const meshGroups = Array.from(this.mobManager.getMeshPool().values());
    if (meshGroups.length === 0) return false;

    const intersects = this.raycaster.intersectObjects(meshGroups, true);
    if (intersects.length === 0) return false;

    // Walk up the parent chain to find the mesh group in the pool.
    let hitGroup: THREE.Group | null = null;
    let obj: THREE.Object3D | null = intersects[0].object;
    const pool = this.mobManager.getMeshPool();
    while (obj) {
      if (obj instanceof THREE.Group && this.isInMeshPool(obj, pool)) {
        hitGroup = obj;
        break;
      }
      obj = obj.parent;
    }
    if (!hitGroup) return false;

    const eid = this.mobManager.findEntityByMesh(hitGroup);
    if (eid < 0) return false;

    // Determine attack damage from held item.
    const damage = this.getAttackDamage();
    this.mobManager.damageEntity(eid, damage);
    soundManager.playHurt();

    // Apply knockback: push mob away from player.
    const dx = Transform.x[eid] - this.player.position.x;
    const dz = Transform.z[eid] - this.player.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    const kb = 6;
    Velocity.x[eid] += (dx / dist) * kb;
    Velocity.y[eid] += 4;
    Velocity.z[eid] += (dz / dist) * kb;

    return true;
  }

  /** Check if a group is in the mob mesh pool. */
  private isInMeshPool(group: THREE.Group, pool: Map<number, THREE.Group>): boolean {
    for (const [, g] of pool) {
      if (g === group) return true;
    }
    return false;
  }

  /** Get melee attack damage based on the held item. */
  private getAttackDamage(): number {
    const stack = this.inventory.getSlot(this.player.selectedSlot);
    if (!stack || stack.isEmpty()) return 1; // Bare hand

    const item = itemRegistry.getItem(stack.itemId);
    if (!item || item.toolType !== ToolType.SWORD) return 1;

    switch (item.toolTier) {
      case ToolTier.WOOD: return 4;
      case ToolTier.STONE: return 5;
      case ToolTier.IRON: return 6;
      case ToolTier.GOLD: return 4;
      case ToolTier.DIAMOND: return 7;
      default: return 1;
    }
  }

  private findSpawnHeight(x: number, z: number): number {
    for (let y = 200; y > 0; y--) {
      const block = this.world.getBlock(x, y, z);
      if (block !== BlockType.AIR && block !== BlockType.WATER) {
        return y + 1;
      }
    }
    return SEA_LEVEL + 10;
  }

  private async saveWorld(): Promise<void> {
    await this.saveManager.saveWorld(
      this.chunkManager.getLoadedChunks(),
      this.player,
      this.inventory,
      this.seed
    );
  }

  /** Check if the entire inventory is empty (all 36 slots). */
  private isInventoryEmpty(): boolean {
    for (let i = 0; i < 36; i++) {
      const slot = this.inventory.getSlot(i);
      if (slot && !slot.isEmpty()) return false;
    }
    return true;
  }

  private updateLoadingProgress(text: string, percent: number): void {
    const loadingText = document.getElementById('loading-text');
    const loadingBar = document.getElementById('loading-bar');
    if (loadingText) loadingText.textContent = text;
    if (loadingBar) loadingBar.style.width = `${percent}%`;
  }
}
