/**
 * Web Worker that receives chunk block data and returns meshed geometry.
 *
 * Message protocol
 * ----------------
 * Incoming (main -> worker):
 * {
 *   type: 'mesh',
 *   chunkX: number,
 *   chunkZ: number,
 *   blocks: ArrayBuffer,
 *   neighbors: { [key: string]: ArrayBuffer | null },
 *   blockInfo: BlockInfo[]
 * }
 *
 * Outgoing (worker -> main):
 * {
 *   type: 'meshResult',
 *   chunkX: number,
 *   chunkZ: number,
 *   opaque: TransferableMeshData,
 *   transparent: TransferableMeshData
 * }
 *
 * TransferableMeshData mirrors MeshData but with plain ArrayBuffers
 * so they can be transferred zero-copy.
 */

import { meshChunk, BlockInfo, MeshData } from './ChunkMesher';

// ---------------------------------------------------------------------------
// Transferable wrapper
// ---------------------------------------------------------------------------

interface TransferableMeshData {
  positions: ArrayBuffer;
  normals: ArrayBuffer;
  uvs: ArrayBuffer;
  aos: ArrayBuffer;
  lights: ArrayBuffer;
  indices: ArrayBuffer;
  vertexCount: number;
  indexCount: number;
}

function toTransferable(md: MeshData): TransferableMeshData {
  return {
    positions: md.positions.buffer as ArrayBuffer,
    normals: md.normals.buffer as ArrayBuffer,
    uvs: md.uvs.buffer as ArrayBuffer,
    aos: md.aos.buffer as ArrayBuffer,
    lights: md.lights.buffer as ArrayBuffer,
    indices: md.indices.buffer as ArrayBuffer,
    vertexCount: md.positions.length / 3,
    indexCount: md.indices.length,
  };
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = (evt: MessageEvent) => {
  const data = evt.data;

  if (data.type === 'mesh') {
    const blocks = new Uint8Array(data.blocks);

    // Rebuild neighbour Uint8Arrays from transferred ArrayBuffers
    const neighbors: { [key: string]: Uint8Array | null } = {};
    if (data.neighbors) {
      for (const key of Object.keys(data.neighbors)) {
        const buf = data.neighbors[key];
        neighbors[key] = buf ? new Uint8Array(buf) : null;
      }
    }

    const blockInfo: BlockInfo[] = data.blockInfo;

    // Reconstruct light data
    const light = data.light ? new Uint8Array(data.light) : new Uint8Array(blocks.length);
    const neighborLights: { [key: string]: Uint8Array | null } = {};
    if (data.neighborLights) {
      for (const key of Object.keys(data.neighborLights)) {
        const buf = data.neighborLights[key];
        neighborLights[key] = buf ? new Uint8Array(buf) : null;
      }
    }

    const result = meshChunk(blocks, data.chunkX, data.chunkZ, neighbors, blockInfo, light, neighborLights);

    const opaqueT = toTransferable(result.opaque);
    const transparentT = toTransferable(result.transparent);

    // Collect buffers to transfer (zero-copy)
    const transferList: ArrayBuffer[] = [
      opaqueT.positions,
      opaqueT.normals,
      opaqueT.uvs,
      opaqueT.aos,
      opaqueT.lights,
      opaqueT.indices,
      transparentT.positions,
      transparentT.normals,
      transparentT.uvs,
      transparentT.aos,
      transparentT.lights,
      transparentT.indices,
    ];

    (self as unknown as Worker).postMessage(
      {
        type: 'meshResult',
        chunkX: data.chunkX,
        chunkZ: data.chunkZ,
        opaque: opaqueT,
        transparent: transparentT,
      },
      transferList,
    );
  }
};
