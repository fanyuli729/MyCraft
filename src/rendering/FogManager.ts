import * as THREE from 'three';
import {
  CHUNK_SIZE,
  RENDER_DISTANCE,
  FOG_NEAR_FACTOR,
  FOG_FAR_FACTOR,
} from '@/utils/Constants';
import { lerp, clamp } from '@/utils/MathUtils';

/**
 * Manages distance-based linear fog that blends the far edge of the
 * visible world into the sky colour.
 *
 * The fog distances are derived from the render distance and are updated
 * every frame so the day/night cycle can shift the fog colour smoothly.
 */

// ---------------------------------------------------------------------------
// Sky colour palette (day / night / dawn-dusk)
// ---------------------------------------------------------------------------

const SKY_DAY = new THREE.Color(0x87ceeb);
const SKY_NIGHT = new THREE.Color(0x0a0a2a);
const SKY_DAWN = new THREE.Color(0xffaa55);

// ---------------------------------------------------------------------------
// FogManager
// ---------------------------------------------------------------------------

export class FogManager {
  private fogNear: number;
  private fogFar: number;
  private fogColor: THREE.Color;

  /** Reference to the opaque and transparent chunk materials (their uniforms). */
  private materials: THREE.ShaderMaterial[] = [];

  /** Reference to the renderer so we can update the clear colour. */
  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;

    const maxDist = RENDER_DISTANCE * CHUNK_SIZE;
    this.fogNear = maxDist * FOG_NEAR_FACTOR;
    this.fogFar = maxDist * FOG_FAR_FACTOR;
    this.fogColor = SKY_DAY.clone();
  }

  /**
   * Register a ShaderMaterial whose `fogColor`, `fogNear`, `fogFar`, and
   * `sunlightIntensity` uniforms should be kept in sync.
   */
  registerMaterial(material: THREE.ShaderMaterial): void {
    this.materials.push(material);
    // Initialise uniforms
    material.uniforms.fogNear.value = this.fogNear;
    material.uniforms.fogFar.value = this.fogFar;
    material.uniforms.fogColor.value.copy(this.fogColor);
  }

  /**
   * Called once per frame.
   *
   * @param _camera      The active camera (unused for now, reserved for
   *                     altitude-dependent fog in the future).
   * @param dayProgress  A normalised value in [0, 1] representing the time of day.
   *                     0.0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk.
   */
  update(_camera: THREE.Camera, dayProgress: number): void {
    // Compute sky colour for the current time of day
    const skyColor = this.computeSkyColor(dayProgress);
    this.fogColor.copy(skyColor);

    // Compute sunlight intensity
    const sunlight = this.computeSunlight(dayProgress);

    // Update material uniforms
    for (const mat of this.materials) {
      mat.uniforms.fogColor.value.copy(this.fogColor);
      mat.uniforms.fogNear.value = this.fogNear;
      mat.uniforms.fogFar.value = this.fogFar;
      mat.uniforms.sunlightIntensity.value = sunlight;
    }

    // Update renderer clear colour to match fog
    this.renderer.setClearColor(skyColor);
  }

  /** Current fog colour (read-only copy). */
  getFogColor(): THREE.Color {
    return this.fogColor.clone();
  }

  /** Current near fog distance. */
  getFogNear(): number {
    return this.fogNear;
  }

  /** Current far fog distance. */
  getFogFar(): number {
    return this.fogFar;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Compute the sky colour for a given time of day.
   *
   * Timeline (dayProgress 0..1):
   *   0.0  - 0.20 : night
   *   0.20 - 0.30 : dawn transition
   *   0.30 - 0.70 : day
   *   0.70 - 0.80 : dusk transition
   *   0.80 - 1.00 : night
   */
  private computeSkyColor(dayProgress: number): THREE.Color {
    const t = dayProgress;
    const color = new THREE.Color();

    if (t < 0.20 || t >= 0.80) {
      // Night
      color.copy(SKY_NIGHT);
    } else if (t < 0.25) {
      // Early dawn: night -> dawn colour
      const f = (t - 0.20) / 0.05;
      color.copy(SKY_NIGHT).lerp(SKY_DAWN, f);
    } else if (t < 0.30) {
      // Late dawn: dawn colour -> day
      const f = (t - 0.25) / 0.05;
      color.copy(SKY_DAWN).lerp(SKY_DAY, f);
    } else if (t < 0.70) {
      // Day
      color.copy(SKY_DAY);
    } else if (t < 0.75) {
      // Early dusk: day -> dusk colour
      const f = (t - 0.70) / 0.05;
      color.copy(SKY_DAY).lerp(SKY_DAWN, f);
    } else {
      // Late dusk: dusk colour -> night
      const f = (t - 0.75) / 0.05;
      color.copy(SKY_DAWN).lerp(SKY_NIGHT, f);
    }

    return color;
  }

  /**
   * Compute the sunlight intensity [0..1] for the current time of day.
   * 1.0 at noon, dims towards night.
   */
  private computeSunlight(dayProgress: number): number {
    const t = dayProgress;
    if (t < 0.20 || t >= 0.80) {
      return 0.15; // night -- dim ambient
    } else if (t < 0.30) {
      // dawn
      const f = (t - 0.20) / 0.10;
      return lerp(0.15, 1.0, clamp(f, 0, 1));
    } else if (t < 0.70) {
      return 1.0; // full day
    } else {
      // dusk
      const f = (t - 0.70) / 0.10;
      return lerp(1.0, 0.15, clamp(f, 0, 1));
    }
  }
}
