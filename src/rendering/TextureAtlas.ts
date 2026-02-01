import * as THREE from 'three';
import { TEXTURE_SIZE, ATLAS_SIZE } from '@/utils/Constants';

// ---------------------------------------------------------------------------
// Seeded PRNG (Mulberry32) -- deterministic noise for consistent textures
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Texture name -> atlas position mapping
// ---------------------------------------------------------------------------

const TEXTURE_MAP: Map<string, number> = new Map();
let nextIndex = 0;

function registerTexture(name: string): number {
  const idx = nextIndex++;
  TEXTURE_MAP.set(name, idx);
  return idx;
}

// Register every texture name used by BlockRegistry.
// Order determines atlas position (left-to-right, top-to-bottom).
registerTexture('dirt');            // 0
registerTexture('grass_top');       // 1
registerTexture('grass_side');      // 2
registerTexture('stone');           // 3
registerTexture('sand');            // 4
registerTexture('water');           // 5
registerTexture('oak_log_side');    // 6
registerTexture('oak_log_top');     // 7
registerTexture('oak_leaves');      // 8
registerTexture('birch_log_side');  // 9
registerTexture('birch_log_top');   // 10
registerTexture('birch_leaves');    // 11
registerTexture('spruce_log_side'); // 12
registerTexture('spruce_log_top');  // 13
registerTexture('spruce_leaves');   // 14
registerTexture('coal_ore');        // 15
registerTexture('iron_ore');        // 16
registerTexture('gold_ore');        // 17
registerTexture('diamond_ore');     // 18
registerTexture('bedrock');         // 19
registerTexture('gravel');          // 20
registerTexture('cobblestone');     // 21
registerTexture('oak_planks');      // 22
registerTexture('crafting_table_top');  // 23
registerTexture('crafting_table_side'); // 24
registerTexture('furnace_front');   // 25
registerTexture('furnace_side');    // 26
registerTexture('furnace_top');     // 27
registerTexture('glass');           // 28
registerTexture('torch');           // 29
registerTexture('snow');            // 30
registerTexture('ice');             // 31
registerTexture('sandstone_side');  // 32
registerTexture('sandstone_top');   // 33
registerTexture('sandstone_bottom'); // 34
registerTexture('cactus_side');     // 35
registerTexture('cactus_top');      // 36
registerTexture('cactus_bottom');   // 37
registerTexture('flower_red');      // 38
registerTexture('flower_yellow');   // 39
registerTexture('tall_grass');      // 40
registerTexture('air');             // 41
registerTexture('missing');         // 42

/**
 * Return the flat index of a named texture inside the atlas.
 * The index can be decomposed into row = floor(idx / ATLAS_SIZE), col = idx % ATLAS_SIZE.
 */
export function getTextureIndex(name: string): number {
  const idx = TEXTURE_MAP.get(name);
  if (idx === undefined) {
    // Fall back to the 'missing' texture so we get a visible purple/black
    return TEXTURE_MAP.get('missing')!;
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Pixel-art drawing helpers
// ---------------------------------------------------------------------------

type RGBA = [number, number, number, number];

function hexToRGBA(hex: string, alpha = 1): RGBA {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, alpha];
}

function varyColor(base: RGBA, rand: () => number, amount: number): RGBA {
  return [
    Math.max(0, Math.min(255, base[0] + Math.floor((rand() - 0.5) * 2 * amount))),
    Math.max(0, Math.min(255, base[1] + Math.floor((rand() - 0.5) * 2 * amount))),
    Math.max(0, Math.min(255, base[2] + Math.floor((rand() - 0.5) * 2 * amount))),
    base[3],
  ];
}

function setPixel(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  px: number, py: number,
  color: RGBA,
): void {
  ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${color[3]})`;
  ctx.fillRect(ox + px, oy + py, 1, 1);
}

function fillTile(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  color: RGBA,
): void {
  ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${color[3]})`;
  ctx.fillRect(ox, oy, TEXTURE_SIZE, TEXTURE_SIZE);
}

function noiseFill(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  base: RGBA,
  rand: () => number,
  amount: number,
): void {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      setPixel(ctx, ox, oy, px, py, varyColor(base, rand, amount));
    }
  }
}

// ---------------------------------------------------------------------------
// Individual texture painters
// ---------------------------------------------------------------------------

type Painter = (ctx: CanvasRenderingContext2D, ox: number, oy: number, rand: () => number) => void;

const painters: Map<string, Painter> = new Map();

// Dirt -- brown noise
painters.set('dirt', (ctx, ox, oy, rand) => {
  noiseFill(ctx, ox, oy, hexToRGBA('#8B6914'), rand, 20);
});

// Grass top -- green noise
painters.set('grass_top', (ctx, ox, oy, rand) => {
  noiseFill(ctx, ox, oy, hexToRGBA('#5b8731'), rand, 18);
});

// Grass side -- top 4 rows green, bottom 12 rows dirt-like
painters.set('grass_side', (ctx, ox, oy, rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      if (py < 4) {
        setPixel(ctx, ox, oy, px, py, varyColor(hexToRGBA('#5b8731'), rand, 18));
      } else {
        setPixel(ctx, ox, oy, px, py, varyColor(hexToRGBA('#8B6914'), rand, 20));
      }
    }
  }
});

// Stone -- gray noise
painters.set('stone', (ctx, ox, oy, rand) => {
  noiseFill(ctx, ox, oy, hexToRGBA('#808080'), rand, 25);
});

// Sand -- yellow-tan
painters.set('sand', (ctx, ox, oy, rand) => {
  noiseFill(ctx, ox, oy, hexToRGBA('#e8d5a3'), rand, 12);
});

// Water -- blue semi-transparent
painters.set('water', (ctx, ox, oy, rand) => {
  noiseFill(ctx, ox, oy, [0x33, 0x55, 0xff, 0.6], rand, 15);
});

// Oak log side -- brown bark with vertical lines
painters.set('oak_log_side', (ctx, ox, oy, rand) => {
  const base = hexToRGBA('#6b4423');
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const isLine = px % 4 === 0 || px % 4 === 1;
      const c: RGBA = isLine
        ? varyColor([base[0] - 20, base[1] - 15, base[2] - 10, 1], rand, 8)
        : varyColor(base, rand, 12);
      setPixel(ctx, ox, oy, px, py, c);
    }
  }
});

// Oak log top -- concentric rings
painters.set('oak_log_top', (ctx, ox, oy, rand) => {
  const center = TEXTURE_SIZE / 2;
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const dist = Math.sqrt((px - center) ** 2 + (py - center) ** 2);
      const ring = Math.floor(dist) % 3;
      const base: RGBA = ring === 0
        ? [0x8b, 0x6e, 0x4e, 1]
        : ring === 1
          ? [0x6b, 0x4e, 0x2e, 1]
          : [0x7b, 0x5e, 0x3e, 1];
      setPixel(ctx, ox, oy, px, py, varyColor(base, rand, 8));
    }
  }
});

// Oak leaves -- green with transparency holes
painters.set('oak_leaves', (ctx, ox, oy, rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      if (rand() < 0.15) {
        // transparent hole
        setPixel(ctx, ox, oy, px, py, [0, 0, 0, 0]);
      } else {
        setPixel(ctx, ox, oy, px, py, varyColor(hexToRGBA('#3a7d23'), rand, 22));
      }
    }
  }
});

// Birch log side -- white/light with black spots
painters.set('birch_log_side', (ctx, ox, oy, rand) => {
  const base = hexToRGBA('#d4c9a8');
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      if (rand() < 0.08) {
        setPixel(ctx, ox, oy, px, py, varyColor([0x30, 0x2e, 0x2a, 1], rand, 10));
      } else {
        setPixel(ctx, ox, oy, px, py, varyColor(base, rand, 10));
      }
    }
  }
});

// Birch log top -- similar to oak top but lighter
painters.set('birch_log_top', (ctx, ox, oy, rand) => {
  const center = TEXTURE_SIZE / 2;
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const dist = Math.sqrt((px - center) ** 2 + (py - center) ** 2);
      const ring = Math.floor(dist) % 3;
      const base: RGBA = ring === 0
        ? [0xc8, 0xbc, 0x9c, 1]
        : ring === 1
          ? [0xb0, 0xa4, 0x84, 1]
          : [0xbc, 0xb0, 0x90, 1];
      setPixel(ctx, ox, oy, px, py, varyColor(base, rand, 8));
    }
  }
});

// Birch leaves -- lighter green
painters.set('birch_leaves', (ctx, ox, oy, rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      if (rand() < 0.12) {
        setPixel(ctx, ox, oy, px, py, [0, 0, 0, 0]);
      } else {
        setPixel(ctx, ox, oy, px, py, varyColor(hexToRGBA('#5a9d33'), rand, 20));
      }
    }
  }
});

// Spruce log side -- dark brown
painters.set('spruce_log_side', (ctx, ox, oy, rand) => {
  const base = hexToRGBA('#3d2810');
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const isLine = px % 4 === 0;
      const c: RGBA = isLine
        ? varyColor([base[0] - 10, base[1] - 8, base[2] - 5, 1], rand, 6)
        : varyColor(base, rand, 10);
      setPixel(ctx, ox, oy, px, py, c);
    }
  }
});

// Spruce log top
painters.set('spruce_log_top', (ctx, ox, oy, rand) => {
  const center = TEXTURE_SIZE / 2;
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const dist = Math.sqrt((px - center) ** 2 + (py - center) ** 2);
      const ring = Math.floor(dist) % 3;
      const base: RGBA = ring === 0
        ? [0x5a, 0x3e, 0x20, 1]
        : ring === 1
          ? [0x3d, 0x28, 0x10, 1]
          : [0x4d, 0x33, 0x18, 1];
      setPixel(ctx, ox, oy, px, py, varyColor(base, rand, 6));
    }
  }
});

// Spruce leaves -- dark green
painters.set('spruce_leaves', (ctx, ox, oy, rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      if (rand() < 0.1) {
        setPixel(ctx, ox, oy, px, py, [0, 0, 0, 0]);
      } else {
        setPixel(ctx, ox, oy, px, py, varyColor(hexToRGBA('#1a5c1a'), rand, 18));
      }
    }
  }
});

// Ore helper -- stone base with colored spots
function oreTexture(spotColor: RGBA, spotChance: number): Painter {
  return (ctx, ox, oy, rand) => {
    const stoneBase = hexToRGBA('#808080');
    for (let py = 0; py < TEXTURE_SIZE; py++) {
      for (let px = 0; px < TEXTURE_SIZE; px++) {
        if (rand() < spotChance) {
          setPixel(ctx, ox, oy, px, py, varyColor(spotColor, rand, 12));
        } else {
          setPixel(ctx, ox, oy, px, py, varyColor(stoneBase, rand, 22));
        }
      }
    }
  };
}

painters.set('coal_ore', oreTexture([0x20, 0x20, 0x20, 1], 0.12));
painters.set('iron_ore', oreTexture([0xc8, 0xb0, 0x8a, 1], 0.10));
painters.set('gold_ore', oreTexture([0xe8, 0xd0, 0x30, 1], 0.09));
painters.set('diamond_ore', oreTexture([0x40, 0xe0, 0xe0, 1], 0.08));

// Bedrock -- very dark noise
painters.set('bedrock', (ctx, ox, oy, rand) => {
  noiseFill(ctx, ox, oy, hexToRGBA('#1a1a1a'), rand, 18);
});

// Gravel -- mixed gray/brown
painters.set('gravel', (ctx, ox, oy, rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const r = rand();
      const base: RGBA = r < 0.33
        ? [0x70, 0x70, 0x70, 1]
        : r < 0.66
          ? [0x8a, 0x7e, 0x6e, 1]
          : [0x60, 0x60, 0x60, 1];
      setPixel(ctx, ox, oy, px, py, varyColor(base, rand, 15));
    }
  }
});

// Cobblestone -- gray with darker grid lines
painters.set('cobblestone', (ctx, ox, oy, rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const isGrid = (px + py) % 4 === 0;
      const base: RGBA = isGrid
        ? [0x50, 0x50, 0x50, 1]
        : [0x78, 0x78, 0x78, 1];
      setPixel(ctx, ox, oy, px, py, varyColor(base, rand, 18));
    }
  }
});

// Oak planks -- light brown with horizontal lines
painters.set('oak_planks', (ctx, ox, oy, rand) => {
  const base = hexToRGBA('#b09050');
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const isLine = py % 4 === 0;
      const c: RGBA = isLine
        ? varyColor([base[0] - 25, base[1] - 20, base[2] - 15, 1], rand, 8)
        : varyColor(base, rand, 10);
      setPixel(ctx, ox, oy, px, py, c);
    }
  }
});

// Crafting table top -- grid pattern brown
painters.set('crafting_table_top', (ctx, ox, oy, rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const isGrid = px === 0 || px === 8 || py === 0 || py === 8;
      const base: RGBA = isGrid
        ? [0x60, 0x40, 0x20, 1]
        : varyColor([0xa0, 0x80, 0x50, 1], rand, 10);
      setPixel(ctx, ox, oy, px, py, base);
    }
  }
});

// Crafting table side -- brown with tool pattern hint
painters.set('crafting_table_side', (ctx, ox, oy, rand) => {
  const base = hexToRGBA('#8a6a3a');
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      // Simple tool silhouette: a vertical line (saw) and horizontal line (hammer)
      const isTool = (px === 4 && py >= 3 && py <= 12) || (py === 7 && px >= 2 && px <= 6);
      const c: RGBA = isTool
        ? [0x40, 0x40, 0x40, 1]
        : varyColor(base, rand, 12);
      setPixel(ctx, ox, oy, px, py, c);
    }
  }
});

// Furnace front -- gray with dark center opening
painters.set('furnace_front', (ctx, ox, oy, rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const inOpening = px >= 4 && px <= 11 && py >= 5 && py <= 12;
      if (inOpening) {
        setPixel(ctx, ox, oy, px, py, varyColor([0x20, 0x18, 0x10, 1], rand, 8));
      } else {
        setPixel(ctx, ox, oy, px, py, varyColor([0x80, 0x80, 0x80, 1], rand, 20));
      }
    }
  }
});

// Furnace side -- gray stone-like
painters.set('furnace_side', (ctx, ox, oy, rand) => {
  noiseFill(ctx, ox, oy, [0x80, 0x80, 0x80, 1], rand, 20);
});

// Furnace top
painters.set('furnace_top', (ctx, ox, oy, rand) => {
  noiseFill(ctx, ox, oy, [0x78, 0x78, 0x78, 1], rand, 18);
});

// Glass -- mostly transparent with white edge highlights
painters.set('glass', (ctx, ox, oy, rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const isEdge = px === 0 || px === TEXTURE_SIZE - 1 || py === 0 || py === TEXTURE_SIZE - 1;
      const isHighlight = (px === 1 && py <= 3) || (py === 1 && px <= 3);
      if (isEdge) {
        setPixel(ctx, ox, oy, px, py, [0xcc, 0xcc, 0xcc, 0.7]);
      } else if (isHighlight) {
        setPixel(ctx, ox, oy, px, py, [0xff, 0xff, 0xff, 0.5]);
      } else {
        setPixel(ctx, ox, oy, px, py, [0xdd, 0xee, 0xff, 0.18]);
      }
    }
  }
});

// Torch -- small tan center with yellow flame top on transparent background
painters.set('torch', (ctx, ox, oy, rand) => {
  // Clear to transparent
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      setPixel(ctx, ox, oy, px, py, [0, 0, 0, 0]);
    }
  }
  // Stick (center 2 pixels, rows 5-14)
  for (let py = 5; py <= 14; py++) {
    setPixel(ctx, ox, oy, 7, py, [0xa0, 0x80, 0x40, 1]);
    setPixel(ctx, ox, oy, 8, py, [0xa0, 0x80, 0x40, 1]);
  }
  // Flame (rows 2-5)
  for (let py = 2; py <= 5; py++) {
    setPixel(ctx, ox, oy, 7, py, [0xff, 0xdd, 0x00, 1]);
    setPixel(ctx, ox, oy, 8, py, [0xff, 0xdd, 0x00, 1]);
  }
  setPixel(ctx, ox, oy, 7, 3, [0xff, 0xff, 0x60, 1]);
  setPixel(ctx, ox, oy, 8, 3, [0xff, 0xff, 0x60, 1]);
});

// Snow -- white with slight blue tinge
painters.set('snow', (ctx, ox, oy, rand) => {
  noiseFill(ctx, ox, oy, [0xf0, 0xf5, 0xff, 1], rand, 8);
});

// Ice -- light blue semi-transparent
painters.set('ice', (ctx, ox, oy, rand) => {
  noiseFill(ctx, ox, oy, [0x90, 0xc0, 0xf0, 0.8], rand, 12);
});

// Sandstone side -- tan with lighter horizontal band
painters.set('sandstone_side', (ctx, ox, oy, rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const isBand = py >= 4 && py <= 6;
      const base: RGBA = isBand
        ? [0xf0, 0xe0, 0xc0, 1]
        : [0xd8, 0xc8, 0x98, 1];
      setPixel(ctx, ox, oy, px, py, varyColor(base, rand, 10));
    }
  }
});

// Sandstone top -- tan
painters.set('sandstone_top', (ctx, ox, oy, rand) => {
  noiseFill(ctx, ox, oy, [0xd8, 0xc8, 0x98, 1], rand, 10);
});

// Sandstone bottom
painters.set('sandstone_bottom', (ctx, ox, oy, rand) => {
  noiseFill(ctx, ox, oy, [0xd0, 0xc0, 0x90, 1], rand, 10);
});

// Cactus side -- dark green with lighter spots
painters.set('cactus_side', (ctx, ox, oy, rand) => {
  const base = hexToRGBA('#1a6b1a');
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      if (rand() < 0.08) {
        setPixel(ctx, ox, oy, px, py, varyColor([0x50, 0xa0, 0x30, 1], rand, 10));
      } else {
        setPixel(ctx, ox, oy, px, py, varyColor(base, rand, 12));
      }
    }
  }
});

// Cactus top -- green with center pattern
painters.set('cactus_top', (ctx, ox, oy, rand) => {
  const center = TEXTURE_SIZE / 2;
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const dist = Math.abs(px - center) + Math.abs(py - center);
      const base: RGBA = dist < 3
        ? [0x30, 0x80, 0x20, 1]
        : [0x1a, 0x6b, 0x1a, 1];
      setPixel(ctx, ox, oy, px, py, varyColor(base, rand, 10));
    }
  }
});

// Cactus bottom
painters.set('cactus_bottom', (ctx, ox, oy, rand) => {
  noiseFill(ctx, ox, oy, [0x1a, 0x5a, 0x1a, 1], rand, 10);
});

// Flower red -- transparent with red petals and green stem
painters.set('flower_red', (ctx, ox, oy, rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      setPixel(ctx, ox, oy, px, py, [0, 0, 0, 0]);
    }
  }
  // Stem
  for (let py = 8; py <= 14; py++) {
    setPixel(ctx, ox, oy, 7, py, [0x30, 0x80, 0x20, 1]);
    setPixel(ctx, ox, oy, 8, py, [0x30, 0x80, 0x20, 1]);
  }
  // Petals (cross pattern)
  const petalColor: RGBA = [0xdd, 0x20, 0x20, 1];
  const centerX = 7, centerY = 6;
  setPixel(ctx, ox, oy, centerX, centerY, [0xff, 0xff, 0x30, 1]); // center
  setPixel(ctx, ox, oy, centerX + 1, centerY, [0xff, 0xff, 0x30, 1]);
  setPixel(ctx, ox, oy, centerX - 1, centerY, petalColor);
  setPixel(ctx, ox, oy, centerX + 2, centerY, petalColor);
  setPixel(ctx, ox, oy, centerX, centerY - 1, petalColor);
  setPixel(ctx, ox, oy, centerX + 1, centerY - 1, petalColor);
  setPixel(ctx, ox, oy, centerX, centerY + 1, petalColor);
  setPixel(ctx, ox, oy, centerX + 1, centerY + 1, petalColor);
  setPixel(ctx, ox, oy, centerX - 1, centerY - 1, petalColor);
  setPixel(ctx, ox, oy, centerX + 2, centerY + 1, petalColor);
});

// Flower yellow
painters.set('flower_yellow', (ctx, ox, oy, rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      setPixel(ctx, ox, oy, px, py, [0, 0, 0, 0]);
    }
  }
  // Stem
  for (let py = 8; py <= 14; py++) {
    setPixel(ctx, ox, oy, 7, py, [0x30, 0x80, 0x20, 1]);
    setPixel(ctx, ox, oy, 8, py, [0x30, 0x80, 0x20, 1]);
  }
  // Petals
  const petalColor: RGBA = [0xf0, 0xe0, 0x20, 1];
  const centerX = 7, centerY = 6;
  setPixel(ctx, ox, oy, centerX, centerY, [0xe0, 0xa0, 0x00, 1]);
  setPixel(ctx, ox, oy, centerX + 1, centerY, [0xe0, 0xa0, 0x00, 1]);
  setPixel(ctx, ox, oy, centerX - 1, centerY, petalColor);
  setPixel(ctx, ox, oy, centerX + 2, centerY, petalColor);
  setPixel(ctx, ox, oy, centerX, centerY - 1, petalColor);
  setPixel(ctx, ox, oy, centerX + 1, centerY - 1, petalColor);
  setPixel(ctx, ox, oy, centerX, centerY + 1, petalColor);
  setPixel(ctx, ox, oy, centerX + 1, centerY + 1, petalColor);
  setPixel(ctx, ox, oy, centerX - 1, centerY - 1, petalColor);
  setPixel(ctx, ox, oy, centerX + 2, centerY + 1, petalColor);
});

// Tall grass -- transparent with green blades
painters.set('tall_grass', (ctx, ox, oy, rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      setPixel(ctx, ox, oy, px, py, [0, 0, 0, 0]);
    }
  }
  // Draw several grass blades at random x positions
  const bladeXs = [2, 5, 7, 9, 12, 14];
  for (const bx of bladeXs) {
    const height = 6 + Math.floor(rand() * 8);
    const startY = TEXTURE_SIZE - 1;
    for (let dy = 0; dy < height; dy++) {
      const py = startY - dy;
      if (py < 0) break;
      const sway = dy > 4 ? (rand() < 0.5 ? -1 : 1) : 0;
      const px = Math.max(0, Math.min(TEXTURE_SIZE - 1, bx + sway));
      setPixel(ctx, ox, oy, px, py, varyColor([0x50, 0x90, 0x30, 1], rand, 15));
    }
  }
});

// Air -- fully transparent (never rendered, but registered)
painters.set('air', (ctx, ox, oy, _rand) => {
  fillTile(ctx, ox, oy, [0, 0, 0, 0]);
});

// Missing -- magenta/black checkerboard
painters.set('missing', (ctx, ox, oy, _rand) => {
  for (let py = 0; py < TEXTURE_SIZE; py++) {
    for (let px = 0; px < TEXTURE_SIZE; px++) {
      const check = (Math.floor(px / 4) + Math.floor(py / 4)) % 2 === 0;
      setPixel(ctx, ox, oy, px, py, check ? [0xff, 0x00, 0xff, 1] : [0x00, 0x00, 0x00, 1]);
    }
  }
});

// ---------------------------------------------------------------------------
// Atlas generation
// ---------------------------------------------------------------------------

/**
 * Build the full texture atlas canvas, painting every registered texture.
 */
function buildAtlasCanvas(): HTMLCanvasElement {
  const size = ATLAS_SIZE * TEXTURE_SIZE; // 16 * 16 = 256
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Start with fully transparent background
  ctx.clearRect(0, 0, size, size);

  const rand = mulberry32(42); // deterministic seed

  for (const [name, idx] of TEXTURE_MAP.entries()) {
    const col = idx % ATLAS_SIZE;
    const row = Math.floor(idx / ATLAS_SIZE);
    const ox = col * TEXTURE_SIZE;
    const oy = row * TEXTURE_SIZE;
    const painter = painters.get(name);
    if (painter) {
      painter(ctx, ox, oy, rand);
    }
  }

  return canvas;
}

/**
 * Create a Three.js texture from the procedural atlas canvas.
 * The texture uses nearest-neighbour filtering for the pixel-art look.
 */
export function createAtlasTexture(): THREE.Texture {
  const canvas = buildAtlasCanvas();
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
