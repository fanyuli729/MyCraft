/**
 * Axis-Aligned Bounding Box used for collision detection.
 *
 * The box is defined by its minimum and maximum extents on each axis.
 * Helper factories allow easy creation from player position (centred on
 * X/Z, bottom-aligned on Y) or from a full-block coordinate.
 */
export class AABB {
  constructor(
    public minX: number,
    public minY: number,
    public minZ: number,
    public maxX: number,
    public maxY: number,
    public maxZ: number,
  ) {}

  // -----------------------------------------------------------------------
  // Factories
  // -----------------------------------------------------------------------

  /**
   * Create an AABB centred on X/Z and bottom-aligned on Y, suitable for
   * entities such as the player.
   *
   * @param x   Centre X
   * @param y   Bottom Y
   * @param z   Centre Z
   * @param w   Full width  (extent on X and Z)
   * @param h   Full height (extent on Y)
   */
  static fromPositionSize(x: number, y: number, z: number, w: number, h: number): AABB {
    const hw = w / 2;
    return new AABB(
      x - hw, y, z - hw,
      x + hw, y + h, z + hw,
    );
  }

  /**
   * Create a unit-cube AABB occupying the full block at integer
   * coordinates (x, y, z) to (x+1, y+1, z+1).
   */
  static fromBlock(x: number, y: number, z: number): AABB {
    return new AABB(x, y, z, x + 1, y + 1, z + 1);
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /** Test whether this AABB overlaps with another (exclusive on edges). */
  intersects(other: AABB): boolean {
    return (
      this.minX < other.maxX && this.maxX > other.minX &&
      this.minY < other.maxY && this.maxY > other.minY &&
      this.minZ < other.maxZ && this.maxZ > other.minZ
    );
  }

  // -----------------------------------------------------------------------
  // Transformations (all return a new AABB -- the original is not mutated)
  // -----------------------------------------------------------------------

  /**
   * Return a new AABB expanded in the direction of movement so that the
   * resulting box covers the entire swept volume.
   *
   * Positive deltas expand the max edge; negative deltas expand the min edge.
   */
  expand(dx: number, dy: number, dz: number): AABB {
    let mnX = this.minX;
    let mnY = this.minY;
    let mnZ = this.minZ;
    let mxX = this.maxX;
    let mxY = this.maxY;
    let mxZ = this.maxZ;

    if (dx < 0) mnX += dx; else mxX += dx;
    if (dy < 0) mnY += dy; else mxY += dy;
    if (dz < 0) mnZ += dz; else mxZ += dz;

    return new AABB(mnX, mnY, mnZ, mxX, mxY, mxZ);
  }

  /** Return a new AABB shifted by the given offsets. */
  offset(dx: number, dy: number, dz: number): AABB {
    return new AABB(
      this.minX + dx, this.minY + dy, this.minZ + dz,
      this.maxX + dx, this.maxY + dy, this.maxZ + dz,
    );
  }

  /** Return an independent copy of this AABB. */
  clone(): AABB {
    return new AABB(this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ);
  }

  // -----------------------------------------------------------------------
  // Axis-specific clip helpers (used by the collision resolver)
  // -----------------------------------------------------------------------

  /**
   * Clip the Y component of a movement vector against this block AABB.
   *
   * If the entity AABB overlaps this box on X and Z, compute the maximum
   * allowed Y movement before intersection and return it (clamped).
   * Otherwise return the original dy unchanged.
   */
  clipYCollide(entity: AABB, dy: number): number {
    // No overlap on X or Z -> no collision possible
    if (entity.maxX <= this.minX || entity.minX >= this.maxX) return dy;
    if (entity.maxZ <= this.minZ || entity.minZ >= this.maxZ) return dy;

    if (dy > 0 && entity.maxY <= this.minY) {
      const clip = this.minY - entity.maxY;
      if (clip < dy) return clip;
    }
    if (dy < 0 && entity.minY >= this.maxY) {
      const clip = this.maxY - entity.minY;
      if (clip > dy) return clip;
    }
    return dy;
  }

  /**
   * Clip the X component of a movement vector against this block AABB.
   */
  clipXCollide(entity: AABB, dx: number): number {
    if (entity.maxY <= this.minY || entity.minY >= this.maxY) return dx;
    if (entity.maxZ <= this.minZ || entity.minZ >= this.maxZ) return dx;

    if (dx > 0 && entity.maxX <= this.minX) {
      const clip = this.minX - entity.maxX;
      if (clip < dx) return clip;
    }
    if (dx < 0 && entity.minX >= this.maxX) {
      const clip = this.maxX - entity.minX;
      if (clip > dx) return clip;
    }
    return dx;
  }

  /**
   * Clip the Z component of a movement vector against this block AABB.
   */
  clipZCollide(entity: AABB, dz: number): number {
    if (entity.maxX <= this.minX || entity.minX >= this.maxX) return dz;
    if (entity.maxY <= this.minY || entity.minY >= this.maxY) return dz;

    if (dz > 0 && entity.maxZ <= this.minZ) {
      const clip = this.minZ - entity.maxZ;
      if (clip < dz) return clip;
    }
    if (dz < 0 && entity.minZ >= this.maxZ) {
      const clip = this.maxZ - entity.minZ;
      if (clip > dz) return clip;
    }
    return dz;
  }
}
