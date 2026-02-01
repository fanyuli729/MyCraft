import { AUTO_SAVE_INTERVAL } from '@/utils/Constants';
import { Chunk } from '@/world/Chunk';
import { Player } from '@/player/Player';
import { Inventory } from '@/player/Inventory';
import { WorldStorage } from '@/save/WorldStorage';
import { ChunkSerializer } from '@/save/ChunkSerializer';
import { PlayerStorage, PlayerSaveData } from '@/save/PlayerStorage';

// ---------------------------------------------------------------------------
// Keys used in the "meta" object store
// ---------------------------------------------------------------------------

const META_SEED = 'seed';
const META_PLAYER = 'player';
const META_CHUNK_KEYS = 'chunkKeys';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Shape returned by {@link SaveManager.loadWorld}. */
export interface WorldSaveData {
  seed: number;
  playerData: PlayerSaveData | null;
  chunkKeys: string[];
}

// ---------------------------------------------------------------------------
// SaveManager
// ---------------------------------------------------------------------------

/**
 * Orchestrates saving and loading of the entire world state, including
 * chunk block data, player state, and world metadata.
 *
 * Provides an auto-save timer that fires every {@link AUTO_SAVE_INTERVAL} ms.
 */
export class SaveManager {
  private storage: WorldStorage | null = null;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initialise the manager with an already-opened {@link WorldStorage}.
   */
  async init(worldStorage: WorldStorage): Promise<void> {
    this.storage = worldStorage;
  }

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------

  /**
   * Persist the entire world to IndexedDB.
   *
   * Only chunks marked as dirty are written (and their dirty flag is cleared
   * afterwards). The player state and world seed are always saved.
   *
   * Accepts either a `Map<string, Chunk>` or an `IterableIterator<Chunk>`.
   * When receiving an iterator, chunk keys are derived from each chunk's
   * coordinates via `${chunk.cx},${chunk.cz}`.
   *
   * @param chunks   Live chunks -- either a Map or an iterable of Chunk objects.
   * @param player   The player instance to snapshot.
   * @param inventory The player's inventory to snapshot.
   * @param seed     World generation seed.
   */
  async saveWorld(
    chunks: Map<string, Chunk> | Iterable<Chunk>,
    player: Player,
    inventory: Inventory,
    seed: number,
  ): Promise<void> {
    const storage = this.requireStorage();

    // ----- Save dirty chunks -----------------------------------------------
    const savedKeys: string[] = [];
    const chunkPromises: Promise<void>[] = [];

    // Normalise input: convert Iterable<Chunk> to [key, chunk] pairs.
    const entries: Iterable<[string, Chunk]> =
      chunks instanceof Map
        ? chunks
        : (function* (iterable: Iterable<Chunk>) {
            for (const chunk of iterable) {
              yield [`${chunk.cx},${chunk.cz}`, chunk] as [string, Chunk];
            }
          })(chunks);

    for (const [key, chunk] of entries) {
      savedKeys.push(key);

      if (chunk.dirty) {
        const compressed = ChunkSerializer.compress(chunk.data);
        chunkPromises.push(storage.saveChunk(key, compressed));
        chunk.dirty = false;
      }
    }

    await Promise.all(chunkPromises);

    // ----- Save player -----------------------------------------------------
    const playerJson = PlayerStorage.serialize(player, inventory);
    await storage.saveMeta(META_PLAYER, playerJson);

    // ----- Save world seed -------------------------------------------------
    await storage.saveMeta(META_SEED, seed);

    // ----- Save chunk key index --------------------------------------------
    await storage.saveMeta(META_CHUNK_KEYS, savedKeys);
  }

  // -----------------------------------------------------------------------
  // Load
  // -----------------------------------------------------------------------

  /**
   * Load world metadata from storage.
   *
   * This does NOT load every chunk eagerly -- only the seed, player data,
   * and the list of saved chunk keys are returned. Individual chunks should
   * be loaded on demand via {@link loadChunk}.
   *
   * @returns The saved data, or null if no save exists.
   */
  async loadWorld(): Promise<WorldSaveData | null> {
    const storage = this.requireStorage();

    const seed = await storage.loadMeta(META_SEED);
    if (seed === null || seed === undefined) return null;

    const playerJson = await storage.loadMeta(META_PLAYER);
    let playerData: PlayerSaveData | null = null;
    if (typeof playerJson === 'string') {
      playerData = PlayerStorage.deserialize(playerJson);
    }

    const chunkKeys: string[] = (await storage.loadMeta(META_CHUNK_KEYS)) ?? [];

    return { seed, playerData, chunkKeys };
  }

  /**
   * Load and decompress a single chunk's block data.
   *
   * @param key Chunk coordinate key (e.g. "3,-2").
   * @returns The decompressed block Uint8Array, or null if not found.
   */
  async loadChunk(key: string): Promise<Uint8Array | null> {
    const storage = this.requireStorage();
    const compressed = await storage.loadChunk(key);
    if (!compressed) return null;
    return ChunkSerializer.decompress(compressed);
  }

  /**
   * Quick check for whether any save data exists.
   */
  async hasSaveData(): Promise<boolean> {
    const storage = this.requireStorage();
    const seed = await storage.loadMeta(META_SEED);
    return seed !== null && seed !== undefined;
  }

  /**
   * Wipe all saved data (chunks, player, seed, etc.).
   */
  async deleteSave(): Promise<void> {
    const storage = this.requireStorage();
    await storage.deleteWorld();
  }

  // -----------------------------------------------------------------------
  // Auto-save
  // -----------------------------------------------------------------------

  /**
   * Start a repeating auto-save timer.
   *
   * @param callback Invoked every {@link AUTO_SAVE_INTERVAL} ms. The callback
   *   should call {@link saveWorld} with the current game state.
   */
  startAutoSave(callback: () => Promise<void>): void {
    this.stopAutoSave();
    this.autoSaveTimer = setInterval(async () => {
      try {
        await callback();
      } catch (err) {
        console.error('SaveManager: auto-save failed', err);
      }
    }, AUTO_SAVE_INTERVAL);
  }

  /**
   * Stop the auto-save timer, if running.
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private requireStorage(): WorldStorage {
    if (!this.storage) {
      throw new Error('SaveManager: not initialised. Call init() first.');
    }
    return this.storage;
  }
}
