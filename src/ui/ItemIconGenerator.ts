import { itemRegistry } from '@/items/ItemRegistry';

/**
 * Shared item colour map used by both InventoryUI and HotbarUI.
 * Keys are item IDs; values are CSS hex colours.
 */
export const ITEM_COLORS: Record<number, string> = {
  // BlockType enum values
  1:  '#808080',   // STONE
  2:  '#8B6914',   // DIRT
  3:  '#5b8731',   // GRASS
  4:  '#e2cc7f',   // SAND
  5:  '#3355dd',   // WATER
  6:  '#6b4c2a',   // WOOD_OAK
  7:  '#2e6b1a',   // LEAVES_OAK
  8:  '#d4c9a3',   // WOOD_BIRCH
  9:  '#3a7a26',   // LEAVES_BIRCH
  10: '#4a3520',   // WOOD_SPRUCE
  11: '#1a4a2a',   // LEAVES_SPRUCE
  12: '#333333',   // COAL_ORE
  13: '#b08050',   // IRON_ORE
  14: '#f0d060',   // GOLD_ORE
  15: '#40e0e0',   // DIAMOND_ORE
  16: '#444444',   // BEDROCK
  17: '#888080',   // GRAVEL
  18: '#707070',   // COBBLESTONE
  19: '#b09060',   // PLANKS_OAK
  20: '#7a5c34',   // CRAFTING_TABLE
  21: '#606060',   // FURNACE
  22: '#c8e8f8',   // GLASS
  23: '#ffc800',   // TORCH
  24: '#3a8a2a',   // TALL_GRASS
  25: '#ff3030',   // FLOWER_RED
  26: '#fff030',   // FLOWER_YELLOW
  27: '#2a7a2a',   // CACTUS
  28: '#f0f0f0',   // SNOW
  29: '#a0d0f0',   // ICE
  30: '#d4c490',   // SAND_STONE
  // Misc items
  200: '#8B6914',  // STICK
  201: '#1a1a1a',  // COAL
  202: '#d0d0d0',  // IRON_INGOT
  203: '#f0d060',  // GOLD_INGOT
  204: '#40e0e0',  // DIAMOND
  205: '#c8a050',  // BREAD
  206: '#ff3030',  // APPLE
  207: '#aa3030',  // RAW_BEEF
  208: '#cc6655',  // RAW_PORKCHOP
  209: '#ffcc99',  // RAW_CHICKEN
  210: '#6b4c2a',  // ROTTEN_FLESH
  211: '#e8e8d0',  // BONE
  212: '#cc5533',  // COOKED_BEEF
  213: '#dd8855',  // COOKED_PORKCHOP
  214: '#ffdd88',  // COOKED_CHICKEN
};

export const DEFAULT_ITEM_COLOR = '#8844aa';

// ---------------------------------------------------------------------------
// Icon cache -- generated once per item ID.
// ---------------------------------------------------------------------------

const iconCache: Map<number, string> = new Map();

/**
 * Parse a CSS hex colour string (#RGB or #RRGGBB) into [r,g,b] 0-255.
 */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Simple seeded pseudo-random number generator (mulberry32).
 * Returns a function that produces values in [0, 1).
 */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Tool silhouette pixel maps (16x16 bitmasks -- 1 = filled pixel)
// ---------------------------------------------------------------------------

const TOOL_SHAPES: Record<string, number[]> = {
  pickaxe: [
    0b0000011111100000,
    0b0000011111100000,
    0b0000000001100000,
    0b0000000011000000,
    0b0000000110000000,
    0b0000001100000000,
    0b0000011000000000,
    0b0000110000000000,
    0b0001100000000000,
    0b0011000000000000,
    0b0110000000000000,
    0b1100000000000000,
    0b1000000000000000,
    0b0000000000000000,
    0b0000000000000000,
    0b0000000000000000,
  ],
  axe: [
    0b0000001111000000,
    0b0000011111100000,
    0b0000011111100000,
    0b0000001111100000,
    0b0000000011000000,
    0b0000000110000000,
    0b0000001100000000,
    0b0000011000000000,
    0b0000110000000000,
    0b0001100000000000,
    0b0011000000000000,
    0b0110000000000000,
    0b1100000000000000,
    0b1000000000000000,
    0b0000000000000000,
    0b0000000000000000,
  ],
  shovel: [
    0b0000001100000000,
    0b0000011110000000,
    0b0000011110000000,
    0b0000011110000000,
    0b0000001100000000,
    0b0000001100000000,
    0b0000001100000000,
    0b0000001100000000,
    0b0000001100000000,
    0b0000001100000000,
    0b0000001100000000,
    0b0000001100000000,
    0b0000001100000000,
    0b0000001100000000,
    0b0000000000000000,
    0b0000000000000000,
  ],
  sword: [
    0b0000000000000110,
    0b0000000000001110,
    0b0000000000011100,
    0b0000000000111000,
    0b0000000001110000,
    0b0000000011100000,
    0b0000000111000000,
    0b0000001110000000,
    0b0000011100000000,
    0b0000111000000000,
    0b0001010000000000,
    0b0010100000000000,
    0b0001000000000000,
    0b0010000000000000,
    0b0000000000000000,
    0b0000000000000000,
  ],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a 16x16 pixel art icon for the given item ID and return
 * it as a data: URI string suitable for use as a CSS background-image.
 *
 * Results are cached so each icon is only drawn once.
 */
export function generateItemIcon(itemId: number): string {
  const cached = iconCache.get(itemId);
  if (cached) return cached;

  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Fallback: return a 1x1 transparent PNG data URI
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }

  const item = itemRegistry.getItem(itemId);
  const baseColor = ITEM_COLORS[itemId] ?? DEFAULT_ITEM_COLOR;
  const [br, bg, bb] = hexToRgb(baseColor);

  if (item && item.toolType && item.toolType !== 'none') {
    // ---- Tool icon ----
    drawToolIcon(ctx, size, item.toolType, br, bg, bb);
  } else if (item && item.isBlock) {
    // ---- Block face icon ----
    drawBlockIcon(ctx, size, itemId, br, bg, bb);
  } else {
    // ---- Misc item icon (centered rounded square) ----
    drawMiscIcon(ctx, size, itemId, br, bg, bb);
  }

  const dataUri = canvas.toDataURL();
  iconCache.set(itemId, dataUri);
  return dataUri;
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function drawBlockIcon(
  ctx: CanvasRenderingContext2D,
  size: number,
  itemId: number,
  br: number,
  bg: number,
  bb: number,
): void {
  const rng = seededRandom(itemId * 7919);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Pixel noise: vary brightness by +/- 20
      const noise = Math.floor(rng() * 40) - 20;
      const r = Math.max(0, Math.min(255, br + noise));
      const g = Math.max(0, Math.min(255, bg + noise));
      const b = Math.max(0, Math.min(255, bb + noise));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Subtle border highlight (top/left lighter, bottom/right darker)
  ctx.fillStyle = `rgba(255,255,255,0.25)`;
  ctx.fillRect(0, 0, size, 1); // top edge
  ctx.fillRect(0, 0, 1, size); // left edge
  ctx.fillStyle = `rgba(0,0,0,0.3)`;
  ctx.fillRect(0, size - 1, size, 1); // bottom edge
  ctx.fillRect(size - 1, 0, 1, size); // right edge
}

function drawToolIcon(
  ctx: CanvasRenderingContext2D,
  size: number,
  toolType: string,
  br: number,
  bg: number,
  bb: number,
): void {
  const shape = TOOL_SHAPES[toolType];
  if (!shape) {
    // Fallback: just fill a square
    drawMiscIcon(ctx, size, 0, br, bg, bb);
    return;
  }

  // Handle colour
  const handleR = Math.max(0, Math.min(255, Math.floor(br * 0.6)));
  const handleG = Math.max(0, Math.min(255, Math.floor(bg * 0.6)));
  const handleB = Math.max(0, Math.min(255, Math.floor(bb * 0.6)));

  for (let y = 0; y < size; y++) {
    const row = shape[y] ?? 0;
    for (let x = 0; x < size; x++) {
      const bit = (row >> (15 - x)) & 1;
      if (bit) {
        // Top portion is the head colour, bottom is handle
        if (y < 6) {
          ctx.fillStyle = `rgb(${br},${bg},${bb})`;
        } else {
          ctx.fillStyle = `rgb(${handleR},${handleG},${handleB})`;
        }
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

function drawMiscIcon(
  ctx: CanvasRenderingContext2D,
  size: number,
  itemId: number,
  br: number,
  bg: number,
  bb: number,
): void {
  const rng = seededRandom((itemId + 1) * 5381);
  const inset = 3;
  const inner = size - inset * 2;

  for (let y = inset; y < inset + inner; y++) {
    for (let x = inset; x < inset + inner; x++) {
      const noise = Math.floor(rng() * 30) - 15;
      const r = Math.max(0, Math.min(255, br + noise));
      const g = Math.max(0, Math.min(255, bg + noise));
      const b = Math.max(0, Math.min(255, bb + noise));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Border highlight
  ctx.fillStyle = `rgba(255,255,255,0.3)`;
  ctx.fillRect(inset, inset, inner, 1);
  ctx.fillRect(inset, inset, 1, inner);
  ctx.fillStyle = `rgba(0,0,0,0.3)`;
  ctx.fillRect(inset, inset + inner - 1, inner, 1);
  ctx.fillRect(inset + inner - 1, inset, 1, inner);
}
