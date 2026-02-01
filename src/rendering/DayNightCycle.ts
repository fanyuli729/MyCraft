import * as THREE from 'three';
import {
  DAY_LENGTH,
  DAWN_START,
  DAWN_END,
  DUSK_START,
  DUSK_END,
} from '@/utils/Constants';
import { clamp, lerp, smoothstep } from '@/utils/MathUtils';

// ---------------------------------------------------------------------------
// Colour constants
// ---------------------------------------------------------------------------

const COLOR_NIGHT = new THREE.Color(0x0a0a2e);
const COLOR_DAWN = new THREE.Color(0xff7733);
const COLOR_DAY = new THREE.Color(0x87ceeb);

const SUN_COLOR_NOON = new THREE.Color(0xffffff);
const SUN_COLOR_HORIZON = new THREE.Color(0xff8833);

/**
 * Tracks the in-game time of day and provides derived lighting values
 * used by the sky renderer and chunk materials.
 *
 * Time is represented as a normalised 0-1 value:
 *   0.00 = midnight
 *   0.25 = dawn
 *   0.50 = noon
 *   0.75 = dusk
 *
 * The cycle advances based on real elapsed seconds, completing a full
 * rotation every {@link DAY_LENGTH} seconds (default 20 minutes).
 */
export class DayNightCycle {
  /** Current time of day in [0, 1). */
  private time = 0.35; // start in the morning

  // Pre-allocated colours returned by getters (avoids allocation per frame).
  private readonly _skyColor = new THREE.Color();
  private readonly _sunColor = new THREE.Color();
  private readonly _fogColor = new THREE.Color();

  // -----------------------------------------------------------------------
  // Core update
  // -----------------------------------------------------------------------

  /**
   * Advance the clock by `dt` seconds.
   */
  update(dt: number): void {
    this.time = (this.time + dt / DAY_LENGTH) % 1;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /** Return the current time of day as a 0-1 value. */
  getTimeOfDay(): number {
    return this.time;
  }

  /**
   * Return the angle of the sun in radians.
   * 0 = directly overhead (noon), increases toward the horizon.
   * The sun completes a full circle over the course of a day.
   */
  getSunAngle(): number {
    // Map time so that 0.5 (noon) -> 0 (overhead) and 0/1 (midnight) -> PI.
    return (this.time - 0.5) * Math.PI * 2;
  }

  /**
   * Return a 0-1 sunlight intensity value.
   * High during the day, low at night, with smooth transitions at
   * dawn and dusk.
   */
  getSunlightIntensity(): number {
    const t = this.time;

    // Night (before dawn or after dusk)
    if (t < DAWN_START || t > DUSK_END) {
      return 0.08;
    }

    // Dawn ramp-up
    if (t < DAWN_END) {
      const factor = (t - DAWN_START) / (DAWN_END - DAWN_START);
      return lerp(0.08, 1.0, smoothstep(factor));
    }

    // Dusk ramp-down
    if (t > DUSK_START) {
      const factor = (t - DUSK_START) / (DUSK_END - DUSK_START);
      return lerp(1.0, 0.08, smoothstep(factor));
    }

    // Full daylight
    return 1.0;
  }

  /**
   * Return the current sky colour.
   *
   * Night  -> dark blue  (#0a0a2e)
   * Dawn   -> orange     (#ff7733) blended toward day colour
   * Day    -> sky blue   (#87ceeb)
   * Dusk   -> orange     (#ff7733) blended toward night colour
   */
  getSkyColor(): THREE.Color {
    const t = this.time;
    const out = this._skyColor;

    if (t < DAWN_START || t > DUSK_END) {
      // Night
      out.copy(COLOR_NIGHT);
    } else if (t < DAWN_END) {
      // Dawn transition: night -> orange -> day
      const f = smoothstep((t - DAWN_START) / (DAWN_END - DAWN_START));
      if (f < 0.5) {
        // night -> orange (first half)
        const sub = smoothstep(f * 2);
        out.copy(COLOR_NIGHT).lerp(COLOR_DAWN, sub);
      } else {
        // orange -> day (second half)
        const sub = smoothstep((f - 0.5) * 2);
        out.copy(COLOR_DAWN).lerp(COLOR_DAY, sub);
      }
    } else if (t > DUSK_START) {
      // Dusk transition: day -> orange -> night
      const f = smoothstep((t - DUSK_START) / (DUSK_END - DUSK_START));
      if (f < 0.5) {
        const sub = smoothstep(f * 2);
        out.copy(COLOR_DAY).lerp(COLOR_DAWN, sub);
      } else {
        const sub = smoothstep((f - 0.5) * 2);
        out.copy(COLOR_DAWN).lerp(COLOR_NIGHT, sub);
      }
    } else {
      // Full day
      out.copy(COLOR_DAY);
    }

    return out;
  }

  /**
   * Return the sun disc colour.
   * White at noon, orange near the horizon (dawn/dusk).
   */
  getSunColor(): THREE.Color {
    const t = this.time;
    const out = this._sunColor;

    // How far the sun is from noon (0.5). 0 = noon, 0.5 = midnight.
    const distFromNoon = Math.abs(t - 0.5);
    // Normalise so that 0 = noon, 1 = fully at horizon
    const horizonFactor = clamp(distFromNoon / 0.3, 0, 1);
    out.copy(SUN_COLOR_NOON).lerp(SUN_COLOR_HORIZON, smoothstep(horizonFactor));

    return out;
  }

  /**
   * Return true if it is currently night time.
   * Night is defined as before dawn start or after dusk end.
   */
  isNight(): boolean {
    return this.time < DAWN_START || this.time > DUSK_END;
  }

  /**
   * Return the fog colour.
   * Matches the sky colour but shifted slightly toward gray so that distant
   * terrain blends smoothly into the horizon.
   */
  getFogColor(): THREE.Color {
    const sky = this.getSkyColor();
    const grayShift = 0.12;
    this._fogColor.set(
      lerp(sky.r, 0.5, grayShift),
      lerp(sky.g, 0.5, grayShift),
      lerp(sky.b, 0.5, grayShift),
    );
    return this._fogColor;
  }
}
