/**
 * Minimal, strongly-typed publish/subscribe event bus.
 *
 * Usage:
 *
 *   // 1. Define an event map
 *   interface GameEvents {
 *     blockPlaced: { x: number; y: number; z: number; type: number };
 *     chunkLoaded: { cx: number; cz: number };
 *     tick:        { dt: number };
 *   }
 *
 *   // 2. Create a bus
 *   const bus = new EventBus<GameEvents>();
 *
 *   // 3. Subscribe
 *   bus.on('blockPlaced', (e) => console.log(e.x, e.y, e.z));
 *
 *   // 4. Publish
 *   bus.emit('blockPlaced', { x: 10, y: 64, z: -3, type: 1 });
 *
 *   // 5. Unsubscribe
 *   bus.off('blockPlaced', handler);
 */

/** Signature for an event handler callback. */
export type EventHandler<T> = (data: T) => void;

export class EventBus<EventMap extends Record<string, any>> {
  private listeners: {
    [K in keyof EventMap]?: Set<EventHandler<EventMap[K]>>;
  } = {};

  /**
   * Register a handler for the given event.
   * The same handler reference will not be added twice.
   */
  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    let set = this.listeners[event];
    if (!set) {
      set = new Set();
      this.listeners[event] = set;
    }
    set.add(handler);
  }

  /**
   * Remove a previously registered handler.
   * Does nothing if the handler was not registered.
   */
  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    this.listeners[event]?.delete(handler);
  }

  /**
   * Emit an event, invoking all registered handlers synchronously in
   * registration order.
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const set = this.listeners[event];
    if (!set) return;
    for (const handler of set) {
      handler(data);
    }
  }

  /**
   * Register a handler that will be called at most once,
   * then automatically removed.
   */
  once<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    const wrapper: EventHandler<EventMap[K]> = (data) => {
      this.off(event, wrapper);
      handler(data);
    };
    this.on(event, wrapper);
  }

  /**
   * Remove all handlers for a specific event, or for all events if no
   * event name is provided.
   */
  clear<K extends keyof EventMap>(event?: K): void {
    if (event !== undefined) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
  }
}

// ---------------------------------------------------------------------------
// Global game event bus
// ---------------------------------------------------------------------------

/** Event map for top-level game events coordinated across systems. */
export interface GameEvents {
  blockBroken: { x: number; y: number; z: number; blockType: number };
  blockPlaced: { x: number; y: number; z: number; blockType: number };
  openCraftingTable: undefined;
  saveRequested: undefined;
}

/** Singleton event bus used for cross-system game events. */
export const eventBus = new EventBus<GameEvents>();
