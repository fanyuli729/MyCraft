import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Vertex Shader
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
  attribute float ao;
  attribute float light;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vAo;
  varying float vLight;

  void main() {
    vUv = uv;
    vNormal = normalMatrix * normal;
    vAo = ao;
    vLight = light;

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
  varying float vLight;

  void main() {
    vec4 texColor = texture2D(atlasTexture, vUv);

    // Discard fully-transparent fragments
    if (texColor.a < 0.5) {
      discard;
    }

    // Decode per-vertex light (packed byte: high nibble = sun, low = block)
    float sunLevel = floor(vLight / 16.0);
    float blockLevel = vLight - sunLevel * 16.0;
    sunLevel /= 15.0;   // normalise to 0..1
    blockLevel /= 15.0;

    // Effective light = max of (sunlight * time-of-day, block light)
    float effectiveLight = max(sunLevel * sunlightIntensity, blockLevel);

    // Minecraft-style face-direction brightness multiplier
    vec3 n = normalize(vNormal);
    float faceBrightness;
    if (abs(n.y) > 0.5) {
      faceBrightness = n.y > 0.0 ? 1.0 : 0.5;  // top / bottom
    } else if (abs(n.x) > abs(n.z)) {
      faceBrightness = 0.6;  // east / west
    } else {
      faceBrightness = 0.8;  // north / south
    }

    // Ambient occlusion
    float aoFactor = mix(0.5, 1.0, vAo);

    // Final brightness: per-block light * face shading * AO, with min ambient
    float brightness = max(effectiveLight, 0.05) * faceBrightness * aoFactor;

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
  varying float vLight;

  void main() {
    vec4 texColor = texture2D(atlasTexture, vUv);

    if (texColor.a < 0.01) {
      discard;
    }

    // Decode per-vertex light
    float sunLevel = floor(vLight / 16.0);
    float blockLevel = vLight - sunLevel * 16.0;
    sunLevel /= 15.0;
    blockLevel /= 15.0;

    float effectiveLight = max(sunLevel * sunlightIntensity, blockLevel);

    // Face-direction brightness
    vec3 n = normalize(vNormal);
    float faceBrightness;
    if (abs(n.y) > 0.5) {
      faceBrightness = n.y > 0.0 ? 1.0 : 0.5;
    } else if (abs(n.x) > abs(n.z)) {
      faceBrightness = 0.6;
    } else {
      faceBrightness = 0.8;
    }

    float aoFactor = mix(0.5, 1.0, vAo);
    float brightness = max(effectiveLight, 0.05) * faceBrightness * aoFactor;

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
