/**
 * Greedy meshing module for voxel chunks.
 *
 * Implements the Mikola Lysenko / 0fps algorithm:
 *   For each of 6 face directions, iterate through slices perpendicular to
 *   the face axis. Build a 2D mask of visible faces in each slice. Then
 *   greedily merge adjacent faces that share the same texture into the
 *   largest possible rectangles, emitting one quad per rectangle.
 *
 * This module is a pure-function library that does NOT import singletons
 * like BlockRegistry, so it can run inside a Web Worker.  Block metadata is
 * passed in via the `blockInfo` parameter.
 */

// ---------------------------------------------------------------------------
// Constants (duplicated from Constants.ts so the module is self-contained
// in worker context -- values MUST stay in sync)
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 256;
const ATLAS_SIZE = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Simplified block descriptor that can be serialised to a worker. */
export interface BlockInfo {
  id: number;
  transparent: boolean;
  solid: boolean;
  lightEmission: number;
  /** Texture atlas flat index for each face. */
  faceTextures: {
    top: number;
    bottom: number;
    side: number;
  };
}

/** Output geometry for one draw-call (opaque OR transparent). */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  aos: Float32Array;
  lights: Float32Array;
  indices: Uint32Array;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** XZY indexing consistent with Chunk.getIndex. */
function blockIndex(x: number, y: number, z: number): number {
  return (x * CHUNK_SIZE + z) * CHUNK_HEIGHT + y;
}

/** Read block id from a flat Uint8Array, returning 0 (AIR) for out-of-bounds. */
function getBlock(
  blocks: Uint8Array,
  x: number,
  y: number,
  z: number,
): number {
  if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
    return 0;
  }
  return blocks[blockIndex(x, y, z)];
}

/**
 * Sample a block that might be in a neighbouring chunk.
 * `lx`, `ly`, `lz` are local coordinates that may be outside [0..CHUNK_SIZE).
 * If the neighbour data is null the block is treated as AIR.
 */
function getBlockOrNeighbor(
  blocks: Uint8Array,
  lx: number,
  ly: number,
  lz: number,
  neighbors: { [key: string]: Uint8Array | null },
): number {
  if (ly < 0 || ly >= CHUNK_HEIGHT) return 0; // above/below world

  let nx = 0;
  let nz = 0;
  let sx = lx;
  let sz = lz;

  if (lx < 0) { nx = -1; sx = lx + CHUNK_SIZE; }
  else if (lx >= CHUNK_SIZE) { nx = 1; sx = lx - CHUNK_SIZE; }
  if (lz < 0) { nz = -1; sz = lz + CHUNK_SIZE; }
  else if (lz >= CHUNK_SIZE) { nz = 1; sz = lz - CHUNK_SIZE; }

  if (nx === 0 && nz === 0) {
    return blocks[blockIndex(sx, ly, sz)];
  }

  const key = `${nx},${nz}`;
  const nb = neighbors[key];
  if (!nb) return 0;
  return nb[blockIndex(sx, ly, sz)];
}

/**
 * Sample a light byte that might be in a neighbouring chunk.
 * Returns the packed light byte (high nibble = sun, low = block).
 * Defaults to full sunlight (0xF0) for out-of-bounds / missing neighbours.
 */
function getLightOrNeighbor(
  light: Uint8Array,
  lx: number,
  ly: number,
  lz: number,
  neighborLights: { [key: string]: Uint8Array | null },
): number {
  if (ly >= CHUNK_HEIGHT) return 0xF0; // above world = full sunlight
  if (ly < 0) return 0x00; // below world = dark

  let nx = 0;
  let nz = 0;
  let sx = lx;
  let sz = lz;

  if (lx < 0) { nx = -1; sx = lx + CHUNK_SIZE; }
  else if (lx >= CHUNK_SIZE) { nx = 1; sx = lx - CHUNK_SIZE; }
  if (lz < 0) { nz = -1; sz = lz + CHUNK_SIZE; }
  else if (lz >= CHUNK_SIZE) { nz = 1; sz = lz - CHUNK_SIZE; }

  if (nx === 0 && nz === 0) {
    return light[blockIndex(sx, ly, sz)];
  }

  const key = `${nx},${nz}`;
  const nb = neighborLights[key];
  if (!nb) return 0xF0; // full sunlight for unloaded neighbours
  return nb[blockIndex(sx, ly, sz)];
}

// ---------------------------------------------------------------------------
// Direction definitions (inline to avoid import in worker)
// ---------------------------------------------------------------------------

// Direction enum values
const DIR_UP = 0;
const DIR_DOWN = 1;
const DIR_NORTH = 2; // -Z
const DIR_SOUTH = 3; // +Z
const DIR_EAST = 4;  // +X
const DIR_WEST = 5;  // -X

const DIRECTION_NORMALS: number[][] = [
  [0, 1, 0],   // UP
  [0, -1, 0],  // DOWN
  [0, 0, -1],  // NORTH
  [0, 0, 1],   // SOUTH
  [1, 0, 0],   // EAST
  [-1, 0, 0],  // WEST
];

/**
 * Map direction to the texture face key index.
 * 0 = top, 1 = bottom, 2 = side
 */
function dirToFace(dir: number): 'top' | 'bottom' | 'side' {
  if (dir === DIR_UP) return 'top';
  if (dir === DIR_DOWN) return 'bottom';
  return 'side';
}

// ---------------------------------------------------------------------------
// Ambient Occlusion
// ---------------------------------------------------------------------------

/**
 * Compute vertex AO for a single corner.
 * `side1`, `side2` are the two edge neighbours, `corner` is the diagonal.
 * All are 1 if solid/occluding, 0 otherwise.
 * Returns a value in [0.25, 1.0] -- lower = darker.
 */
function vertexAO(side1: number, side2: number, corner: number): number {
  const count = side1 + side2 + corner;
  // 0 neighbours = fully lit, 3 = heavily occluded
  if (side1 === 1 && side2 === 1) {
    return 0.25; // fully occluded corner
  }
  switch (count) {
    case 0: return 1.0;
    case 1: return 0.75;
    case 2: return 0.5;
    default: return 0.25;
  }
}

function isOccluder(blockId: number, blockInfo: BlockInfo[]): number {
  if (blockId === 0) return 0;
  const info = blockInfo[blockId];
  return (info && info.solid && !info.transparent) ? 1 : 0;
}

/**
 * Compute AO values for the four corners of a face.
 * Returns [ao00, ao10, ao11, ao01] where indices follow the quad winding.
 */
function computeFaceAO(
  x: number, y: number, z: number,
  dir: number,
  blocks: Uint8Array,
  neighbors: { [key: string]: Uint8Array | null },
  blockInfo: BlockInfo[],
): [number, number, number, number] {
  const g = (dx: number, dy: number, dz: number) =>
    isOccluder(getBlockOrNeighbor(blocks, x + dx, y + dy, z + dz, neighbors), blockInfo);

  // For each direction we need the 8 neighbours in the plane of the face.
  // We label them by their offset relative to the block in the tangent plane.
  switch (dir) {
    case DIR_UP: { // face normal +Y, plane is XZ at y+1
      const s0 = g(-1, 1, 0); const s1 = g(1, 1, 0);
      const s2 = g(0, 1, -1); const s3 = g(0, 1, 1);
      const c0 = g(-1, 1, -1); const c1 = g(1, 1, -1);
      const c2 = g(1, 1, 1); const c3 = g(-1, 1, 1);
      return [
        vertexAO(s0, s2, c0), // (-x, -z)
        vertexAO(s1, s2, c1), // (+x, -z)
        vertexAO(s1, s3, c2), // (+x, +z)
        vertexAO(s0, s3, c3), // (-x, +z)
      ];
    }
    case DIR_DOWN: {
      const s0 = g(-1, -1, 0); const s1 = g(1, -1, 0);
      const s2 = g(0, -1, -1); const s3 = g(0, -1, 1);
      const c0 = g(-1, -1, -1); const c1 = g(1, -1, -1);
      const c2 = g(1, -1, 1); const c3 = g(-1, -1, 1);
      return [
        vertexAO(s0, s3, c3),
        vertexAO(s1, s3, c2),
        vertexAO(s1, s2, c1),
        vertexAO(s0, s2, c0),
      ];
    }
    case DIR_NORTH: { // -Z
      const s0 = g(-1, 0, -1); const s1 = g(1, 0, -1);
      const s2 = g(0, -1, -1); const s3 = g(0, 1, -1);
      const c0 = g(-1, -1, -1); const c1 = g(1, -1, -1);
      const c2 = g(1, 1, -1); const c3 = g(-1, 1, -1);
      return [
        vertexAO(s1, s2, c1),
        vertexAO(s0, s2, c0),
        vertexAO(s0, s3, c3),
        vertexAO(s1, s3, c2),
      ];
    }
    case DIR_SOUTH: { // +Z
      const s0 = g(-1, 0, 1); const s1 = g(1, 0, 1);
      const s2 = g(0, -1, 1); const s3 = g(0, 1, 1);
      const c0 = g(-1, -1, 1); const c1 = g(1, -1, 1);
      const c2 = g(1, 1, 1); const c3 = g(-1, 1, 1);
      return [
        vertexAO(s0, s2, c0),
        vertexAO(s1, s2, c1),
        vertexAO(s1, s3, c2),
        vertexAO(s0, s3, c3),
      ];
    }
    case DIR_EAST: { // +X
      const s0 = g(1, 0, -1); const s1 = g(1, 0, 1);
      const s2 = g(1, -1, 0); const s3 = g(1, 1, 0);
      const c0 = g(1, -1, -1); const c1 = g(1, -1, 1);
      const c2 = g(1, 1, 1); const c3 = g(1, 1, -1);
      return [
        vertexAO(s1, s2, c1),
        vertexAO(s0, s2, c0),
        vertexAO(s0, s3, c3),
        vertexAO(s1, s3, c2),
      ];
    }
    case DIR_WEST: { // -X
      const s0 = g(-1, 0, -1); const s1 = g(-1, 0, 1);
      const s2 = g(-1, -1, 0); const s3 = g(-1, 1, 0);
      const c0 = g(-1, -1, -1); const c1 = g(-1, -1, 1);
      const c2 = g(-1, 1, 1); const c3 = g(-1, 1, -1);
      return [
        vertexAO(s0, s2, c0),
        vertexAO(s1, s2, c1),
        vertexAO(s1, s3, c2),
        vertexAO(s0, s3, c3),
      ];
    }
    default:
      return [1, 1, 1, 1];
  }
}

// ---------------------------------------------------------------------------
// UV helpers
// ---------------------------------------------------------------------------

function atlasUV(texIndex: number, u0: number, v0: number, u1: number, v1: number): number[] {
  const col = texIndex % ATLAS_SIZE;
  const row = Math.floor(texIndex / ATLAS_SIZE);
  const tileU = 1 / ATLAS_SIZE;
  const tileV = 1 / ATLAS_SIZE;
  // Small inset to prevent bleeding
  const eps = 0.001;
  const baseU = col * tileU + eps;
  const baseV = row * tileV + eps;
  const maxU = (col + 1) * tileU - eps;
  const maxV = (row + 1) * tileV - eps;

  // Map [u0..u1] and [v0..v1] (which may be > 1 for greedy-merged quads)
  // Since we cannot tile within a single atlas cell using fract() easily,
  // for greedy-meshed quads we simply stretch the texture.  For 1x1 quads
  // this gives the correct mapping.
  return [
    baseU + (maxU - baseU) * Math.min(u0, 1),
    baseV + (maxV - baseV) * Math.min(v0, 1),
    baseU + (maxU - baseU) * Math.min(u1, 1),
    baseV + (maxV - baseV) * Math.min(v1, 1),
  ];
}

// ---------------------------------------------------------------------------
// Greedy meshing
// ---------------------------------------------------------------------------

interface TempArrays {
  positions: number[];
  normals: number[];
  uvs: number[];
  aos: number[];
  lights: number[];
  indices: number[];
  vertexCount: number;
}

function createTemp(): TempArrays {
  return {
    positions: [],
    normals: [],
    uvs: [],
    aos: [],
    lights: [],
    indices: [],
    vertexCount: 0,
  };
}

function pushQuad(
  tmp: TempArrays,
  v0: number[], v1: number[], v2: number[], v3: number[],
  normal: number[],
  uv: number[], // [u0, v0, u1, v1]
  ao: [number, number, number, number],
  faceLight: number,
): void {
  const i = tmp.vertexCount;

  // Positions -- 4 vertices
  tmp.positions.push(
    v0[0], v0[1], v0[2],
    v1[0], v1[1], v1[2],
    v2[0], v2[1], v2[2],
    v3[0], v3[1], v3[2],
  );

  // Normals
  for (let n = 0; n < 4; n++) {
    tmp.normals.push(normal[0], normal[1], normal[2]);
  }

  // UVs
  tmp.uvs.push(
    uv[0], uv[3],  // v0 -> bottom-left
    uv[2], uv[3],  // v1 -> bottom-right
    uv[2], uv[1],  // v2 -> top-right
    uv[0], uv[1],  // v3 -> top-left
  );

  // AO
  tmp.aos.push(ao[0], ao[1], ao[2], ao[3]);

  // Per-vertex light (packed byte: high nibble sun, low nibble block)
  tmp.lights.push(faceLight, faceLight, faceLight, faceLight);

  // Indices -- two triangles per quad.
  // Flip the diagonal when AO requires it to avoid visible seam artifacts.
  if (ao[0] + ao[2] > ao[1] + ao[3]) {
    tmp.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  } else {
    tmp.indices.push(i + 1, i + 2, i + 3, i, i + 1, i + 3);
  }

  tmp.vertexCount += 4;
}

function toMeshData(tmp: TempArrays): MeshData {
  return {
    positions: new Float32Array(tmp.positions),
    normals: new Float32Array(tmp.normals),
    uvs: new Float32Array(tmp.uvs),
    aos: new Float32Array(tmp.aos),
    lights: new Float32Array(tmp.lights),
    indices: new Uint32Array(tmp.indices),
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Build the chunk mesh using greedy meshing.
 *
 * @param blocks       The chunk's flat Uint8Array (CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT).
 * @param cx           Chunk X coordinate (used only for world-space vertex positions).
 * @param cz           Chunk Z coordinate.
 * @param neighborBlocks  Map from "dx,dz" (e.g. "1,0", "-1,0", "0,1", "0,-1") to the
 *                        neighbour chunk's Uint8Array, or null if not loaded.
 * @param blockInfo    Array indexed by block-type id containing block metadata.
 */
export function meshChunk(
  blocks: Uint8Array,
  cx: number,
  cz: number,
  neighborBlocks: { [key: string]: Uint8Array | null },
  blockInfo: BlockInfo[],
  light: Uint8Array,
  neighborLights: { [key: string]: Uint8Array | null },
): { opaque: MeshData; transparent: MeshData } {
  const opaque = createTemp();
  const transparent = createTemp();

  const worldOffsetX = cx * CHUNK_SIZE;
  const worldOffsetZ = cz * CHUNK_SIZE;

  // For each of the 6 directions, sweep slices through the chunk.
  for (let dir = 0; dir < 6; dir++) {
    const norm = DIRECTION_NORMALS[dir];
    const faceKey = dirToFace(dir);

    // Determine the sweep axis (d) and the two tangent axes (u, v).
    // d is the axis we iterate slices along.
    // u and v span the plane of the face.
    let dAxis: number; // 0=X, 1=Y, 2=Z
    let uAxis: number;
    let vAxis: number;
    let dSize: number;
    let uSize: number;
    let vSize: number;

    if (dir === DIR_UP || dir === DIR_DOWN) {
      dAxis = 1; uAxis = 0; vAxis = 2; // sweep Y, plane is XZ
      dSize = CHUNK_HEIGHT; uSize = CHUNK_SIZE; vSize = CHUNK_SIZE;
    } else if (dir === DIR_NORTH || dir === DIR_SOUTH) {
      dAxis = 2; uAxis = 0; vAxis = 1; // sweep Z, plane is XY
      dSize = CHUNK_SIZE; uSize = CHUNK_SIZE; vSize = CHUNK_HEIGHT;
    } else {
      dAxis = 0; uAxis = 2; vAxis = 1; // sweep X, plane is ZY
      dSize = CHUNK_SIZE; uSize = CHUNK_SIZE; vSize = CHUNK_HEIGHT;
    }

    // Mask: stores the block id for each cell in the slice where a face is visible.
    // 0 means no face. We use the block id to group by texture during greedy merge.
    const mask = new Int32Array(uSize * vSize);

    for (let d = 0; d < dSize; d++) {
      // Build mask
      mask.fill(0);

      for (let v = 0; v < vSize; v++) {
        for (let u = 0; u < uSize; u++) {
          // Compute the local block coordinates from (d, u, v)
          const pos = [0, 0, 0];
          pos[dAxis] = d;
          pos[uAxis] = u;
          pos[vAxis] = v;
          const lx = pos[0];
          const ly = pos[1];
          const lz = pos[2];

          const blockId = getBlock(blocks, lx, ly, lz);
          if (blockId === 0) continue; // AIR -- no faces

          const info = blockInfo[blockId];
          if (!info) continue;

          // Check the neighbour in the face direction
          const nlx = lx + norm[0];
          const nly = ly + norm[1];
          const nlz = lz + norm[2];
          const neighborId = getBlockOrNeighbor(blocks, nlx, nly, nlz, neighborBlocks);
          const neighborInfo = neighborId > 0 ? blockInfo[neighborId] : null;

          // A face is visible when:
          //   - neighbour is AIR, or
          //   - neighbour is transparent AND (current block is opaque, or they are different types)
          let visible = false;
          if (neighborId === 0) {
            visible = true;
          } else if (neighborInfo && neighborInfo.transparent) {
            if (!info.transparent || blockId !== neighborId) {
              visible = true;
            }
          }

          if (visible) {
            const faceLight = getLightOrNeighbor(light, nlx, nly, nlz, neighborLights);
            mask[v * uSize + u] = blockId | (faceLight << 8);
          }
        }
      }

      // Greedy merge the mask
      for (let v = 0; v < vSize; v++) {
        for (let u = 0; u < uSize; ) {
          const maskVal = mask[v * uSize + u];
          if (maskVal === 0) {
            u++;
            continue;
          }

          // Determine width (along u)
          let w = 1;
          while (u + w < uSize && mask[v * uSize + u + w] === maskVal) {
            w++;
          }

          // Determine height (along v)
          let h = 1;
          let canExtend = true;
          while (v + h < vSize && canExtend) {
            for (let wu = 0; wu < w; wu++) {
              if (mask[(v + h) * uSize + u + wu] !== maskVal) {
                canExtend = false;
                break;
              }
            }
            if (canExtend) h++;
          }

          // Clear the mask region
          for (let hh = 0; hh < h; hh++) {
            for (let ww = 0; ww < w; ww++) {
              mask[(v + hh) * uSize + u + ww] = 0;
            }
          }

          // Emit the quad -- extract block id and face light from mask
          const blockId = maskVal & 0xFF;
          const faceLight = (maskVal >> 8) & 0xFF;
          const info = blockInfo[blockId];
          const texIndex = info.faceTextures[faceKey];

          // Compute the 4 world-space corners.
          // The quad lies on the face of the block in the direction `dir`.
          // We need to figure out the base corner and the two edge vectors.
          const base = [0, 0, 0];
          base[dAxis] = d;
          base[uAxis] = u;
          base[vAxis] = v;

          // Offset the face by 1 in the normal direction for positive-facing sides.
          if (dir === DIR_UP || dir === DIR_SOUTH || dir === DIR_EAST) {
            base[dAxis] += 1;
          }

          const du = [0, 0, 0];
          du[uAxis] = w;
          const dv = [0, 0, 0];
          dv[vAxis] = h;

          // World-space vertices
          const wx = worldOffsetX;
          const wz = worldOffsetZ;

          // We need the winding to be counter-clockwise when viewed from outside.
          // Depending on the direction, we may need to swap du and dv.
          let v0: number[], v1: number[], v2: number[], v3: number[];

          const b = [base[0] + wx, base[1], base[2] + wz];
          const bdu = [b[0] + du[0], b[1] + du[1], b[2] + du[2]];
          const bdv = [b[0] + dv[0], b[1] + dv[1], b[2] + dv[2]];
          const bduv = [b[0] + du[0] + dv[0], b[1] + du[1] + dv[1], b[2] + du[2] + dv[2]];

          // Winding order depends on direction so faces point outward
          switch (dir) {
            case DIR_UP:
              v0 = b; v1 = bdu; v2 = bduv; v3 = bdv;
              break;
            case DIR_DOWN:
              v0 = bdv; v1 = bduv; v2 = bdu; v3 = b;
              break;
            case DIR_NORTH:
              v0 = bdu; v1 = b; v2 = bdv; v3 = bduv;
              break;
            case DIR_SOUTH:
              v0 = b; v1 = bdu; v2 = bduv; v3 = bdv;
              break;
            case DIR_EAST:
              v0 = b; v1 = bdv; v2 = bduv; v3 = bdu;
              break;
            case DIR_WEST:
              v0 = bdu; v1 = bduv; v2 = bdv; v3 = b;
              break;
            default:
              v0 = b; v1 = bdu; v2 = bduv; v3 = bdv;
          }

          // UV for the quad  -- for greedy-merged quads we stretch over the full tile.
          const uv = atlasUV(texIndex, 0, 0, 1, 1);

          // AO -- use the block in the bottom-left corner of the merged region
          // For simplicity we compute AO at the original block position (first block in merge).
          const aoPos = [0, 0, 0];
          aoPos[dAxis] = d;
          aoPos[uAxis] = u;
          aoPos[vAxis] = v;
          const ao = computeFaceAO(
            aoPos[0], aoPos[1], aoPos[2],
            dir, blocks, neighborBlocks, blockInfo,
          );

          const target = info.transparent ? transparent : opaque;
          pushQuad(target, v0, v1, v2, v3, norm, uv, ao, faceLight);

          u += w;
        }
      }
    }
  }

  return {
    opaque: toMeshData(opaque),
    transparent: toMeshData(transparent),
  };
}
