/**
 * IndexedDB wrapper for persisting chunk data and world metadata.
 *
 * Database layout:
 *   - Object store "chunks": keyed by chunk coordinate string ("cx,cz"),
 *     stores RLE-compressed Uint8Array block data.
 *   - Object store "meta": keyed by arbitrary string keys,
 *     stores serialised JSON values (seed, player state, etc.).
 */

const DB_NAME = 'neocraft-world';
const DB_VERSION = 1;
const STORE_CHUNKS = 'chunks';
const STORE_META = 'meta';

export class WorldStorage {
  private db: IDBDatabase | null = null;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Open (or create) the IndexedDB database.
   * Must be called before any read / write operations.
   */
  open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
          db.createObjectStore(STORE_CHUNKS);
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`WorldStorage: failed to open database – ${request.error?.message}`));
      };
    });
  }

  /**
   * Close the database connection. Safe to call even if never opened.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // -------------------------------------------------------------------------
  // Chunk operations
  // -------------------------------------------------------------------------

  /**
   * Persist a compressed chunk to the "chunks" store.
   *
   * @param key  Chunk coordinate string produced by {@link CoordUtils.chunkKey}.
   * @param data RLE-compressed block data from {@link ChunkSerializer.compress}.
   */
  saveChunk(key: string, data: Uint8Array): Promise<void> {
    return this.put(STORE_CHUNKS, key, data);
  }

  /**
   * Load a compressed chunk from the "chunks" store.
   *
   * @returns The stored Uint8Array, or null if no data exists for the key.
   */
  loadChunk(key: string): Promise<Uint8Array | null> {
    return this.get<Uint8Array>(STORE_CHUNKS, key);
  }

  /**
   * Remove a single chunk entry from the store.
   */
  deleteChunk(key: string): Promise<void> {
    return this.del(STORE_CHUNKS, key);
  }

  // -------------------------------------------------------------------------
  // Meta operations
  // -------------------------------------------------------------------------

  /**
   * Store an arbitrary metadata value (will be structured-cloned by IDB).
   */
  saveMeta(key: string, value: any): Promise<void> {
    return this.put(STORE_META, key, value);
  }

  /**
   * Retrieve a previously stored metadata value.
   *
   * @returns The stored value, or null if no entry exists.
   */
  loadMeta(key: string): Promise<any> {
    return this.get(STORE_META, key);
  }

  // -------------------------------------------------------------------------
  // Destructive operations
  // -------------------------------------------------------------------------

  /**
   * Delete the entire world save by clearing both object stores.
   */
  deleteWorld(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const db = this.requireDb();
      const tx = db.transaction([STORE_CHUNKS, STORE_META], 'readwrite');

      tx.objectStore(STORE_CHUNKS).clear();
      tx.objectStore(STORE_META).clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error(`WorldStorage: deleteWorld failed – ${tx.error?.message}`));
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private requireDb(): IDBDatabase {
    if (!this.db) {
      throw new Error('WorldStorage: database is not open. Call open() first.');
    }
    return this.db;
  }

  private put(storeName: string, key: string, value: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const db = this.requireDb();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () =>
        reject(new Error(`WorldStorage: put(${storeName}, ${key}) failed – ${req.error?.message}`));
    });
  }

  private get<T>(storeName: string, key: string): Promise<T | null> {
    return new Promise<T | null>((resolve, reject) => {
      const db = this.requireDb();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? (req.result as T) : null);
      req.onerror = () =>
        reject(new Error(`WorldStorage: get(${storeName}, ${key}) failed – ${req.error?.message}`));
    });
  }

  private del(storeName: string, key: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const db = this.requireDb();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () =>
        reject(new Error(`WorldStorage: delete(${storeName}, ${key}) failed – ${req.error?.message}`));
    });
  }
}
