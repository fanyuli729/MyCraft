/**
 * Tool categories used when determining mining speed.
 */
export type ToolType = 'none' | 'pickaxe' | 'axe' | 'shovel' | 'shears' | 'sword';

/**
 * Per-face texture mapping.
 * If `all` is provided it is used for every face.
 * Otherwise `top`, `bottom`, and `side` are used
 * (`side` applies to all four lateral faces).
 */
export interface BlockTextureFaces {
  all?: string;
  top?: string;
  bottom?: string;
  side?: string;
}

/**
 * Static, immutable definition of a single block type.
 * One instance per BlockType value is stored in the BlockRegistry.
 */
export interface Block {
  /** Numeric identifier matching the BlockType enum value. */
  id: number;

  /** Human-readable name (e.g. "Oak Wood"). */
  name: string;

  /** If true the block does not fully occlude adjacent faces (glass, water, leaves, etc.). */
  transparent: boolean;

  /**
   * If true the block has a collision box.
   * Non-solid blocks (air, water, flowers, torch, tall grass) can be walked through.
   */
  solid: boolean;

  /**
   * Time in seconds to break the block with a bare hand.
   * -1 means unbreakable (bedrock).
   *  0 means instant break (flowers, torch, tall grass).
   */
  hardness: number;

  /** The preferred tool type that speeds up mining. */
  toolType: ToolType;

  /** Texture name(s) used to look up UV coordinates in the texture atlas. */
  textureFaces: BlockTextureFaces;
}
