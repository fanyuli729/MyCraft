import { INVENTORY_SIZE } from '@/utils/Constants';
import { Player } from '@/player/Player';
import { Inventory } from '@/player/Inventory';
import { ItemStack } from '@/items/ItemStack';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a single inventory slot when persisted. */
export interface SlotSaveData {
  itemId: number;
  count: number;
  durability?: number;
}

/** Complete snapshot of player state suitable for JSON serialisation. */
export interface PlayerSaveData {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  health: number;
  hunger: number;
  armor: number;
  experienceLevel: number;
  experienceProgress: number;
  selectedSlot: number;
  inventory: SlotSaveData[];
}

// ---------------------------------------------------------------------------
// Serialisation helpers
// ---------------------------------------------------------------------------

export class PlayerStorage {
  /**
   * Capture the current player and inventory state as a JSON string.
   */
  static serialize(player: Player, inventory: Inventory): string {
    const slots: SlotSaveData[] = [];

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const stack = inventory.getSlot(i);
      if (stack) {
        const entry: SlotSaveData = { itemId: stack.itemId, count: stack.count };
        if (stack.durability !== undefined) {
          entry.durability = stack.durability;
        }
        slots.push(entry);
      } else {
        // Preserve slot index alignment by writing an empty sentinel.
        slots.push({ itemId: 0, count: 0 });
      }
    }

    const data: PlayerSaveData = {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.yaw,
      pitch: player.pitch,
      health: player.health,
      hunger: player.hunger,
      armor: player.armor,
      experienceLevel: player.experienceLevel,
      experienceProgress: player.experienceProgress,
      selectedSlot: player.selectedSlot,
      inventory: slots,
    };

    return JSON.stringify(data);
  }

  /**
   * Parse a JSON string previously produced by {@link serialize}.
   */
  static deserialize(json: string): PlayerSaveData {
    return JSON.parse(json) as PlayerSaveData;
  }

  /**
   * Apply saved data back onto the live player and inventory objects.
   */
  static applyToPlayer(
    data: PlayerSaveData,
    player: Player,
    inventory: Inventory,
  ): void {
    // Spatial state
    player.position.set(data.x, data.y, data.z);
    player.yaw = data.yaw;
    player.pitch = data.pitch;

    // Gameplay state
    player.health = data.health;
    player.hunger = data.hunger;
    player.armor = data.armor ?? 0;
    player.experienceLevel = data.experienceLevel ?? 0;
    player.experienceProgress = data.experienceProgress ?? 0;
    player.selectedSlot = data.selectedSlot;

    // Inventory
    inventory.clear();
    const slotCount = Math.min(data.inventory.length, INVENTORY_SIZE);

    for (let i = 0; i < slotCount; i++) {
      const slot = data.inventory[i];
      if (slot.itemId === 0 || slot.count <= 0) {
        inventory.setSlot(i, null);
      } else {
        inventory.setSlot(
          i,
          new ItemStack(slot.itemId, slot.count, slot.durability),
        );
      }
    }
  }
}
