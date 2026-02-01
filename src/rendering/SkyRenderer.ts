import * as THREE from 'three';
import { DayNightCycle } from '@/rendering/DayNightCycle';
import { lerp, smoothstep } from '@/utils/MathUtils';
import { DAWN_START, DUSK_END } from '@/utils/Constants';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKY_DOME_RADIUS = 500;
const SUN_DISTANCE = 400;
const SUN_SIZE = 20;
const MOON_SIZE = 14;
const STAR_COUNT = 200;
const STAR_SPHERE_RADIUS = 450;

// ---------------------------------------------------------------------------
// Shaders for the sky dome gradient
// ---------------------------------------------------------------------------

const skyVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const skyFragmentShader = /* glsl */ `
  uniform vec3 uTopColor;
  uniform vec3 uMiddleColor;
  uniform vec3 uBottomColor;
  uniform float uExponent;

  varying vec3 vWorldPosition;

  void main() {
    // Normalise the vertical component to [0, 1]
    float height = normalize(vWorldPosition).y;

    // Upper hemisphere: middle -> top
    if (height >= 0.0) {
      float t = pow(height, uExponent);
      vec3 color = mix(uMiddleColor, uTopColor, t);
      gl_FragColor = vec4(color, 1.0);
    } else {
      // Lower hemisphere: middle -> bottom (horizon glow / ground)
      float t = pow(-height, uExponent);
      vec3 color = mix(uMiddleColor, uBottomColor, t);
      gl_FragColor = vec4(color, 1.0);
    }
  }
`;

// ---------------------------------------------------------------------------
// Helper: create a procedural radial gradient texture on a canvas
// ---------------------------------------------------------------------------

function createRadialGradientTexture(
  size: number,
  innerColor: string,
  outerColor: string,
  glowFalloff: number = 0.45,
): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(glowFalloff, innerColor);
  gradient.addColorStop(0.7, outerColor);
  gradient.addColorStop(1.0, 'rgba(0,0,0,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Renders the sky dome, sun, moon and stars.
 *
 * The sky dome is a large inverted sphere with a shader-based vertical
 * gradient driven by the {@link DayNightCycle}.  Sun and moon are small
 * billboard sprites that orbit the scene.  Stars are rendered as a
 * Points geometry that fades in at night.
 */
export class SkyRenderer {
  // --- Sky dome ---
  private skyMesh!: THREE.Mesh;
  private skyMaterial!: THREE.ShaderMaterial;

  // --- Sun / Moon ---
  private sunMesh!: THREE.Mesh;
  private moonMesh!: THREE.Mesh;
  private sunTexture!: THREE.Texture;
  private moonTexture!: THREE.Texture;

  // --- Stars ---
  private starPoints!: THREE.Points;
  private starMaterial!: THREE.PointsMaterial;

  // --- Pivot group (moves with camera) ---
  private pivot = new THREE.Group();

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Build all sky meshes and add them to the scene.
   */
  init(scene: THREE.Scene): void {
    this.createSkyDome();
    this.createSun();
    this.createMoon();
    this.createStars();

    this.pivot.add(this.skyMesh, this.sunMesh, this.moonMesh, this.starPoints);

    // Render the sky before everything else; disable depth write so that
    // world geometry always draws on top.
    this.pivot.renderOrder = -1;

    scene.add(this.pivot);
  }

  /**
   * Update all sky elements for the current frame.
   */
  update(dayNightCycle: DayNightCycle, camera: THREE.Camera): void {
    // Keep pivot centered on the camera so the sky never clips.
    this.pivot.position.copy(camera.position);

    this.updateSkyUniforms(dayNightCycle);
    this.updateSunMoon(dayNightCycle);
    this.updateStars(dayNightCycle);
  }

  // -----------------------------------------------------------------------
  // Sky dome
  // -----------------------------------------------------------------------

  private createSkyDome(): void {
    const geo = new THREE.SphereGeometry(SKY_DOME_RADIUS, 32, 24);

    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x87ceeb) },
        uMiddleColor: { value: new THREE.Color(0xb0d8f0) },
        uBottomColor: { value: new THREE.Color(0x87ceeb) },
        uExponent: { value: 0.8 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.skyMesh = new THREE.Mesh(geo, this.skyMaterial);
  }

  private updateSkyUniforms(cycle: DayNightCycle): void {
    const sky = cycle.getSkyColor();
    const intensity = cycle.getSunlightIntensity();

    // Top colour is the sky colour pushed slightly darker / more saturated.
    const top = (this.skyMaterial.uniforms.uTopColor.value as THREE.Color);
    top.copy(sky).multiplyScalar(0.85 + 0.15 * intensity);

    // Middle / horizon colour is the sky colour itself.
    (this.skyMaterial.uniforms.uMiddleColor.value as THREE.Color).copy(sky);

    // Bottom colour is the fog colour (slightly grayed sky).
    (this.skyMaterial.uniforms.uBottomColor.value as THREE.Color).copy(
      cycle.getFogColor(),
    );
  }

  // -----------------------------------------------------------------------
  // Sun
  // -----------------------------------------------------------------------

  private createSun(): void {
    this.sunTexture = createRadialGradientTexture(
      128,
      'rgba(255,255,220,1.0)',
      'rgba(255,200,80,0.0)',
      0.3,
    );

    const geo = new THREE.PlaneGeometry(SUN_SIZE, SUN_SIZE);
    const mat = new THREE.MeshBasicMaterial({
      map: this.sunTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    this.sunMesh = new THREE.Mesh(geo, mat);
  }

  // -----------------------------------------------------------------------
  // Moon
  // -----------------------------------------------------------------------

  private createMoon(): void {
    this.moonTexture = createRadialGradientTexture(
      128,
      'rgba(220,220,240,1.0)',
      'rgba(180,180,200,0.0)',
      0.35,
    );

    const geo = new THREE.PlaneGeometry(MOON_SIZE, MOON_SIZE);
    const mat = new THREE.MeshBasicMaterial({
      map: this.moonTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    this.moonMesh = new THREE.Mesh(geo, mat);
  }

  // -----------------------------------------------------------------------
  // Sun + Moon orbit update
  // -----------------------------------------------------------------------

  private updateSunMoon(cycle: DayNightCycle): void {
    const angle = cycle.getSunAngle();

    // Sun position: orbits in the XY plane (east-west).
    this.sunMesh.position.set(
      Math.sin(angle) * SUN_DISTANCE,
      Math.cos(angle) * SUN_DISTANCE,
      0,
    );

    // Moon is on the opposite side.
    this.moonMesh.position.set(
      Math.sin(angle + Math.PI) * SUN_DISTANCE,
      Math.cos(angle + Math.PI) * SUN_DISTANCE,
      0,
    );

    // Billboard: always face origin (where the camera is, since pivot is
    // centered on the camera).
    this.sunMesh.lookAt(0, 0, 0);
    this.moonMesh.lookAt(0, 0, 0);

    // Update sun material colour / opacity.
    const sunColor = cycle.getSunColor();
    const sunMat = this.sunMesh.material as THREE.MeshBasicMaterial;
    sunMat.color.copy(sunColor);

    // Hide sun when well below horizon and moon when above.
    this.sunMesh.visible = this.sunMesh.position.y > -SUN_DISTANCE * 0.3;
    this.moonMesh.visible = this.moonMesh.position.y > -SUN_DISTANCE * 0.3;
  }

  // -----------------------------------------------------------------------
  // Stars
  // -----------------------------------------------------------------------

  private createStars(): void {
    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);

    for (let i = 0; i < STAR_COUNT; i++) {
      // Random point on a sphere using spherical coordinates.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = STAR_SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = STAR_SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = STAR_SPHERE_RADIUS * Math.cos(phi);

      sizes[i] = 1.0 + Math.random() * 2.0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.0,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.starPoints = new THREE.Points(geo, this.starMaterial);
  }

  private updateStars(cycle: DayNightCycle): void {
    const t = cycle.getTimeOfDay();

    // Stars are fully visible during deep night, fade out during dawn,
    // invisible during day, fade in during dusk.
    let alpha = 0;

    if (t < DAWN_START || t > DUSK_END) {
      // Full night
      alpha = 1.0;
    } else if (t < DAWN_START + 0.05) {
      // Fade out during early dawn
      alpha = 1.0 - smoothstep((t - DAWN_START) / 0.05);
    } else if (t > DUSK_END - 0.05) {
      // Fade in during late dusk
      alpha = smoothstep((t - (DUSK_END - 0.05)) / 0.05);
    }

    this.starMaterial.opacity = alpha;
    this.starPoints.visible = alpha > 0.001;
  }
}
