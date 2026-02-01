/**
 * The six cardinal face directions of a voxel cube.
 */
export enum Direction {
  UP    = 0,
  DOWN  = 1,
  NORTH = 2, // -Z
  SOUTH = 3, // +Z
  EAST  = 4, // +X
  WEST  = 5, // -X
}

/** Integer normal vector [dx, dy, dz] for a direction. */
export type DirectionVector = readonly [number, number, number];

/**
 * Look-up table from Direction to its unit-length normal vector.
 * Index with `DIRECTION_NORMALS[Direction.UP]`.
 */
export const DIRECTION_NORMALS: readonly DirectionVector[] = [
  [ 0,  1,  0], // UP
  [ 0, -1,  0], // DOWN
  [ 0,  0, -1], // NORTH  (-Z)
  [ 0,  0,  1], // SOUTH  (+Z)
  [ 1,  0,  0], // EAST   (+X)
  [-1,  0,  0], // WEST   (-X)
];

/**
 * All six directions as an array, handy for iteration.
 */
export const ALL_DIRECTIONS: readonly Direction[] = [
  Direction.UP,
  Direction.DOWN,
  Direction.NORTH,
  Direction.SOUTH,
  Direction.EAST,
  Direction.WEST,
];

/**
 * Map each direction to its opposite.
 */
export const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  [Direction.UP]:    Direction.DOWN,
  [Direction.DOWN]:  Direction.UP,
  [Direction.NORTH]: Direction.SOUTH,
  [Direction.SOUTH]: Direction.NORTH,
  [Direction.EAST]:  Direction.WEST,
  [Direction.WEST]:  Direction.EAST,
};

/**
 * Map each direction to the texture face key used for UV lookup.
 * UP -> 'top', DOWN -> 'bottom', all laterals -> 'side'.
 */
export function directionToFaceKey(dir: Direction): 'top' | 'bottom' | 'side' {
  switch (dir) {
    case Direction.UP:   return 'top';
    case Direction.DOWN: return 'bottom';
    default:             return 'side';
  }
}
