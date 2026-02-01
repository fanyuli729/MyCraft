// World
export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 256;
export const SEA_LEVEL = 62;
export const RENDER_DISTANCE = 8;

// Physics
export const GRAVITY = -24;
export const JUMP_VELOCITY = 8.5;
export const PLAYER_SPEED = 4.317;
export const SPRINT_MULTIPLIER = 1.3;
export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;
export const TERMINAL_VELOCITY = -78.4;

// Player
export const MAX_HEALTH = 20;
export const MAX_HUNGER = 20;
export const MAX_ARMOR = 20;
export const MAX_EXPERIENCE_LEVEL = 100;
export const REACH_DISTANCE = 5;
export const INVENTORY_SIZE = 36;
export const HOTBAR_SIZE = 9;

// Rendering
export const TEXTURE_SIZE = 16;
export const ATLAS_SIZE = 16; // 16x16 grid of textures
export const FOG_NEAR_FACTOR = 0.6;
export const FOG_FAR_FACTOR = 0.9;

// Day/Night
export const DAY_LENGTH = 20 * 60; // 20 minutes in seconds
export const DAWN_START = 0.2;
export const DAWN_END = 0.3;
export const DUSK_START = 0.7;
export const DUSK_END = 0.8;

// Mobs
export const MOB_DESPAWN_DISTANCE = 128;
export const MOB_SPAWN_DISTANCE_MIN = 24;
export const MOB_SPAWN_DISTANCE_MAX = 64;
export const MAX_MOBS = 30;

// Save
export const AUTO_SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes in ms
