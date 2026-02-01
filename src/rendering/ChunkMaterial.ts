import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Vertex Shader
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
  attribute float ao;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vAo;

  void main() {
    vUv = uv;
    vNormal = normalMatrix * normal;
    vAo = ao;

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// ---------------------------------------------------------------------------
// Fragment Shader
// ---------------------------------------------------------------------------

const fragmentShader = /* glsl */ `
  uniform sampler2D atlasTexture;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  uniform float sunlightIntensity;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vAo;

  void main() {
    // Sample atlas -- the UV is already set to the correct sub-region by the mesher.
    // Use fract() on the fractional part to allow tiling within the tile region
    // (not needed for greedy mesh since UVs are pre-computed, but kept for safety).
    vec4 texColor = texture2D(atlasTexture, vUv);

    // Discard fully-transparent fragments
    if (texColor.a < 0.5) {
      discard;
    }

    // Simple directional lighting (sun coming from above at slight angle)
    vec3 sunDir = normalize(vec3(0.3, 1.0, 0.2));
    float nDotL = max(dot(normalize(vNormal), sunDir), 0.0);
    float lighting = 0.4 + 0.6 * nDotL;

    // Apply ambient occlusion
    float aoFactor = mix(0.5, 1.0, vAo);

    // Apply sunlight intensity (day/night cycle)
    float brightness = lighting * aoFactor * sunlightIntensity;

    vec3 color = texColor.rgb * brightness;

    // Linear fog
    float dist = length(vWorldPosition - cameraPosition);
    float fogFactor = clamp((fogFar - dist) / (fogFar - fogNear), 0.0, 1.0);
    color = mix(fogColor, color, fogFactor);

    gl_FragColor = vec4(color, texColor.a);
  }
`;

// ---------------------------------------------------------------------------
// Transparent fragment shader (same but no discard, uses alpha blending)
// ---------------------------------------------------------------------------

const transparentFragmentShader = /* glsl */ `
  uniform sampler2D atlasTexture;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  uniform float sunlightIntensity;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vAo;

  void main() {
    vec4 texColor = texture2D(atlasTexture, vUv);

    if (texColor.a < 0.01) {
      discard;
    }

    // Simple directional lighting
    vec3 sunDir = normalize(vec3(0.3, 1.0, 0.2));
    float nDotL = max(dot(normalize(vNormal), sunDir), 0.0);
    float lighting = 0.4 + 0.6 * nDotL;

    float aoFactor = mix(0.5, 1.0, vAo);
    float brightness = lighting * aoFactor * sunlightIntensity;

    vec3 color = texColor.rgb * brightness;

    // Linear fog
    float dist = length(vWorldPosition - cameraPosition);
    float fogFactor = clamp((fogFar - dist) / (fogFar - fogNear), 0.0, 1.0);
    color = mix(fogColor, color, fogFactor);

    gl_FragColor = vec4(color, texColor.a);
  }
`;

// ---------------------------------------------------------------------------
// Material factories
// ---------------------------------------------------------------------------

/**
 * Create the opaque chunk material.
 * Fragments with alpha < 0.5 are discarded to handle cutout transparency
 * (leaves, flowers, etc.).
 */
export function createChunkMaterial(atlasTexture: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      atlasTexture: { value: atlasTexture },
      fogColor: { value: new THREE.Color(0x87ceeb) },
      fogNear: { value: 100.0 },
      fogFar: { value: 200.0 },
      sunlightIntensity: { value: 1.0 },
    },
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });
}

/**
 * Create the transparent chunk material.
 * Used for blocks like water, ice, and glass that require alpha blending.
 */
export function createTransparentChunkMaterial(atlasTexture: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      atlasTexture: { value: atlasTexture },
      fogColor: { value: new THREE.Color(0x87ceeb) },
      fogNear: { value: 100.0 },
      fogFar: { value: 200.0 },
      sunlightIntensity: { value: 1.0 },
    },
    vertexShader,
    fragmentShader: transparentFragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });
}
