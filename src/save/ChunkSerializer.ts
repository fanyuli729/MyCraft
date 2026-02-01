import { CHUNK_SIZE, CHUNK_HEIGHT } from '@/utils/Constants';

/**
 * RLE (Run-Length Encoding) serialiser for chunk block data.
 *
 * Format: a flat sequence of (blockType, countHi, countLo) triples.
 * The 16-bit big-endian count allows runs of up to 65 535 identical blocks,
 * which is more than enough for a single chunk (16 * 256 * 16 = 65 536 blocks).
 *
 * Typical compression ratio is roughly 4:1 because terrain chunks contain
 * large contiguous runs of AIR, STONE, and DIRT.
 */

/** Number of blocks in one chunk (16 * 256 * 16 = 65 536). */
const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

/** Maximum run length that fits in a uint16. */
const MAX_RUN = 0xFFFF; // 65 535

export class ChunkSerializer {
  /**
   * Compress a full-size block array into an RLE-encoded Uint8Array.
   *
   * @param blocks Raw chunk data (length must equal CHUNK_VOLUME).
   * @returns Compressed byte buffer.
   */
  static compress(blocks: Uint8Array): Uint8Array {
    if (blocks.length !== CHUNK_VOLUME) {
      throw new Error(
        `ChunkSerializer.compress: expected ${CHUNK_VOLUME} bytes, got ${blocks.length}`,
      );
    }

    // Worst case: every block differs from the next -> 3 bytes per block.
    // In practice, the output is far smaller.
    const temp = new Uint8Array(CHUNK_VOLUME * 3);
    let writePos = 0;
    let readPos = 0;

    while (readPos < CHUNK_VOLUME) {
      const blockType = blocks[readPos];
      let runLength = 1;

      while (
        readPos + runLength < CHUNK_VOLUME &&
        blocks[readPos + runLength] === blockType &&
        runLength < MAX_RUN
      ) {
        runLength++;
      }

      // Write triple: [blockType, countHi, countLo]
      temp[writePos] = blockType;
      temp[writePos + 1] = (runLength >> 8) & 0xFF; // high byte
      temp[writePos + 2] = runLength & 0xFF;         // low byte
      writePos += 3;
      readPos += runLength;
    }

    // Return a trimmed copy
    return temp.slice(0, writePos);
  }

  /**
   * Decompress an RLE-encoded byte buffer back into a full-size block array.
   *
   * @param data Compressed data produced by {@link compress}.
   * @returns Uint8Array of length CHUNK_VOLUME.
   */
  static decompress(data: Uint8Array): Uint8Array {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    let readPos = 0;
    let writePos = 0;

    while (readPos < data.length) {
      const blockType = data[readPos];
      const runLength = (data[readPos + 1] << 8) | data[readPos + 2];
      readPos += 3;

      const end = writePos + runLength;
      if (end > CHUNK_VOLUME) {
        throw new Error(
          `ChunkSerializer.decompress: decompressed size exceeds ${CHUNK_VOLUME}`,
        );
      }

      blocks.fill(blockType, writePos, end);
      writePos = end;
    }

    if (writePos !== CHUNK_VOLUME) {
      throw new Error(
        `ChunkSerializer.decompress: expected ${CHUNK_VOLUME} blocks, got ${writePos}`,
      );
    }

    return blocks;
  }
}
