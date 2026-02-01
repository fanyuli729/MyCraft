import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** UV scroll speed in texture units per second. */
const FLOW_SPEED = 0.04;

/** Water surface height within a block (slightly below full height). */
export const WATER_SURFACE_HEIGHT = 0.875;

/** Tint colour applied in the fragment shader. */
const WATER_TINT = new THREE.Color(0x3366aa);

// ---------------------------------------------------------------------------
// Shader source
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2      uUvOffset;
  uniform vec3      uTint;
  uniform float     uOpacity;

  varying vec2 vUv;

  void main() {
    vec2 scrolledUv = vUv + uUvOffset;
    vec4 texColor = texture2D(uTexture, scrolledUv);

    // Multiply with water tint colour
    texColor.rgb *= uTint;
    texColor.a   *= uOpacity;

    gl_FragColor = texColor;
  }
`;

// ---------------------------------------------------------------------------
// WaterRenderer
// ---------------------------------------------------------------------------

/**
 * Creates and manages a custom shader material for water blocks.
 *
 * Features:
 *   - Animated UV offset to simulate flowing water.
 *   - Blue-ish colour tint mixed into the fragment shader.
 *   - Alpha transparency (the material must be rendered with
 *     `transparent: true` and proper depth sorting).
 *   - Water surface sits at {@link WATER_SURFACE_HEIGHT} instead of 1.0
 *     to create the characteristic "slightly recessed" look.
 */
export class WaterRenderer {
  /** Accumulated time used to drive the UV animation. */
  private time = 0;

  /**
   * Create the ShaderMaterial used for water block faces.
   *
   * @param texture Base water texture (tiled). If null, a 1x1 white pixel
   *                texture is used so the tint colour alone determines
   *                the appearance.
   */
  createMaterial(texture: THREE.Texture | null = null): THREE.ShaderMaterial {
    const tex =
      texture ??
      (() => {
        const data = new Uint8Array([255, 255, 255, 255]);
        const t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
        t.needsUpdate = true;
        return t;
      })();

    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;

    return new THREE.ShaderMaterial({
      uniforms: {
        uTexture:  { value: tex },
        uUvOffset: { value: new THREE.Vector2(0, 0) },
        uTint:     { value: new THREE.Vector3(WATER_TINT.r, WATER_TINT.g, WATER_TINT.b) },
        uOpacity:  { value: 0.7 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Animate the UV offset each frame to simulate water flow.
   *
   * @param dt       Frame delta time in seconds.
   * @param material The ShaderMaterial created by {@link createMaterial}.
   */
  update(dt: number, material: THREE.ShaderMaterial): void {
    this.time += dt;

    const offset = material.uniforms['uUvOffset'].value as THREE.Vector2;
    offset.x = (this.time * FLOW_SPEED) % 1.0;
    offset.y = (this.time * FLOW_SPEED * 0.5) % 1.0;
  }
}
