/**
 * Per-block lighting engine.
 *
 * Calculates both sunlight (propagated from the sky downward) and block light
 * (emitted by torches and other light sources). The result is stored in a flat
 * Uint8Array where each byte packs two nibbles:
 *
 *   high nibble (bits 4-7) = sunlight level  0-15
 *   low  nibble (bits 0-3) = block light level 0-15
 *
 * Algorithm:
 *   1. Column scan  – For each (x,z) column, propagate sunlight=15 downward
 *      through transparent blocks. Stop when an opaque block is hit.
 *   2. BFS sunlight – Flood-fill sunlight from lit blocks into shaded areas.
 *      Light attenuates by 1 per step, except straight-down propagation at
 *      level 15 which stays at 15 (allows sunlight through tall air columns
 *      without loss).
 *   3. BFS block light – Seed emissive blocks and flood-fill with per-step
 *      attenuation of 1.
 *
 * This module is self-contained (no singleton imports) so it can be used on
 * both the main thread and inside a Web Worker if needed.
 */

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 256;

/** XZY indexing consistent with Chunk.getIndex. */
function idx(x: number, y: number, z: number): number {
  return (x * CHUNK_SIZE + z) * CHUNK_HEIGHT + y;
}

// 6-connected neighbour offsets
const DX = [1, -1, 0, 0, 0, 0];
const DY = [0, 0, 1, -1, 0, 0];
const DZ = [0, 0, 0, 0, 1, -1];

/**
 * Calculate sunlight and block light for a single chunk.
 *
 * @param blocks        Flat block-type array (CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE).
 * @param light         Output light array (same size). Cleared and filled by this function.
 * @param isTransparent Boolean array indexed by block-type id.
 * @param emissions     Light emission array indexed by block-type id (0-15).
 */
export function calculateLight(
  blocks: Uint8Array,
  light: Uint8Array,
  isTransparent: boolean[],
  emissions: number[],
): void {
  light.fill(0);

  // === Phase 1: Column sunlight ===
  // Scan each column top-to-bottom; set sunlight=15 while transparent.
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        const i = idx(x, y, z);
        if (isTransparent[blocks[i]]) {
          light[i] = 0xF0; // sunlight = 15 in high nibble
        } else {
          break; // opaque block stops sunlight
        }
      }
    }
  }

  // === Phase 2: BFS sunlight spread ===
  // Seed with blocks at the boundary of sunlit / non-sunlit regions.
  const sunQ: number[] = [];

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      let foundDark = false;
      for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        const i = idx(x, y, z);
        const sun = light[i] >> 4;
        if (sun === 15 && !foundDark) {
          // Check if any horizontal/below neighbour is darker -> this is a frontier block
          let isFrontier = false;
          for (let d = 0; d < 6; d++) {
            const nx = x + DX[d];
            const ny = y + DY[d];
            const nz = z + DZ[d];
            if (nx < 0 || nx >= CHUNK_SIZE || ny < 0 || ny >= CHUNK_HEIGHT || nz < 0 || nz >= CHUNK_SIZE) continue;
            const ni = idx(nx, ny, nz);
            if (isTransparent[blocks[ni]] && (light[ni] >> 4) < 15) {
              isFrontier = true;
              break;
            }
          }
          if (isFrontier) {
            sunQ.push(x, y, z);
          }
        } else if (sun < 15) {
          foundDark = true;
        }
      }
    }
  }

  let qi = 0;
  while (qi < sunQ.length) {
    const sx = sunQ[qi++];
    const sy = sunQ[qi++];
    const sz = sunQ[qi++];
    const level = light[idx(sx, sy, sz)] >> 4;

    for (let d = 0; d < 6; d++) {
      const nx = sx + DX[d];
      const ny = sy + DY[d];
      const nz = sz + DZ[d];

      if (nx < 0 || nx >= CHUNK_SIZE || ny < 0 || ny >= CHUNK_HEIGHT || nz < 0 || nz >= CHUNK_SIZE) continue;

      const ni = idx(nx, ny, nz);
      if (!isTransparent[blocks[ni]]) continue;

      // Sunlight propagating straight down at level 15 doesn't attenuate
      const newLevel = (DY[d] === -1 && level === 15) ? 15 : level - 1;
      if (newLevel <= 0) continue;

      if (newLevel > (light[ni] >> 4)) {
        light[ni] = (newLevel << 4) | (light[ni] & 0x0F);
        sunQ.push(nx, ny, nz);
      }
    }
  }

  // === Phase 3: BFS block light ===
  const blkQ: number[] = [];

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const i = idx(x, y, z);
        const em = emissions[blocks[i]] || 0;
        if (em > 0) {
          light[i] = (light[i] & 0xF0) | em;
          blkQ.push(x, y, z);
        }
      }
    }
  }

  qi = 0;
  while (qi < blkQ.length) {
    const bx = blkQ[qi++];
    const by = blkQ[qi++];
    const bz = blkQ[qi++];
    const level = light[idx(bx, by, bz)] & 0x0F;

    for (let d = 0; d < 6; d++) {
      const nx = bx + DX[d];
      const ny = by + DY[d];
      const nz = bz + DZ[d];

      if (nx < 0 || nx >= CHUNK_SIZE || ny < 0 || ny >= CHUNK_HEIGHT || nz < 0 || nz >= CHUNK_SIZE) continue;

      const ni = idx(nx, ny, nz);
      if (!isTransparent[blocks[ni]]) continue;

      const newLevel = level - 1;
      if (newLevel <= 0) continue;

      if (newLevel > (light[ni] & 0x0F)) {
        light[ni] = (light[ni] & 0xF0) | newLevel;
        blkQ.push(nx, ny, nz);
      }
    }
  }
}
