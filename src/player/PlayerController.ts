import * as THREE from 'three';
import { inputManager } from '@/engine/InputManager';
import { Player } from '@/player/Player';
import {
  PLAYER_SPEED,
  SPRINT_MULTIPLIER,
  JUMP_VELOCITY,
  SWIM_SPEED,
  SWIM_UP_VELOCITY,
} from '@/utils/Constants';

/** Mouse sensitivity (radians per pixel of mouse movement). */
const MOUSE_SENSITIVITY = 0.002;

/** Maximum pitch angle in radians (~89 degrees). */
const MAX_PITCH = (89 * Math.PI) / 180;

/** Sneak speed multiplier (30 % of normal). */
const SNEAK_MULTIPLIER = 0.3;

/** Time window in milliseconds for detecting double-tap W to sprint. */
const DOUBLE_TAP_WINDOW = 300;

/**
 * First-person player controller.
 *
 * Reads input from {@link inputManager}, updates the player's rotation,
 * desired velocity, and synchronises the Three.js camera every frame.
 */
export class PlayerController {
  /** Timestamp of the last W-key press (for double-tap sprint). */
  private lastWPress = 0;

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Should be called once per frame from the main game loop.
   *
   * @param _dt     Frame delta time in seconds (unused currently but
   *                kept for consistency and future smoothing).
   * @param player  The player state to mutate.
   * @param camera  The Three.js camera to synchronise.
   */
  update(_dt: number, player: Player, camera: THREE.PerspectiveCamera): void {
    // Always sync camera to player position so the view isn't stuck at
    // the default engine camera origin when pointer lock hasn't been
    // obtained yet.
    this.syncCamera(player, camera);

    // ----- Hotbar selection (always works, even without pointer lock) -----
    this.handleHotbar(player);

    if (!inputManager.pointerLocked) return;

    // ----- Mouse look -----
    this.handleMouseLook(player);

    // ----- Movement -----
    this.handleMovement(player);

    // ----- Jump -----
    this.handleJump(player);

    // ----- Sprint / Sneak -----
    this.handleSprintSneak(player);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private handleMouseLook(player: Player): void {
    const delta = inputManager.getMouseDelta();
    player.yaw -= delta.x * MOUSE_SENSITIVITY;
    player.pitch -= delta.y * MOUSE_SENSITIVITY;

    // Clamp pitch
    player.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, player.pitch));
  }

  private handleMovement(player: Player): void {
    // Build a movement vector relative to the camera facing.
    let forward = 0;
    let strafe = 0;

    if (inputManager.isKeyDown('w') || inputManager.isKeyDown('arrowup')) forward += 1;
    if (inputManager.isKeyDown('s') || inputManager.isKeyDown('arrowdown')) forward -= 1;
    if (inputManager.isKeyDown('a') || inputManager.isKeyDown('arrowleft')) strafe -= 1;
    if (inputManager.isKeyDown('d') || inputManager.isKeyDown('arrowright')) strafe += 1;

    // Speed modifiers -- swimming uses a slower base speed
    let speed = player.inWater ? SWIM_SPEED : PLAYER_SPEED;
    if (!player.inWater && player.sprinting) speed *= SPRINT_MULTIPLIER;
    if (player.sneaking && !player.inWater) speed *= SNEAK_MULTIPLIER;

    // Compute world-space direction from yaw only (horizontal movement).
    const sinYaw = Math.sin(player.yaw);
    const cosYaw = Math.cos(player.yaw);

    // Forward direction: (-sinYaw, 0, -cosYaw)
    // Right direction:   (-cosYaw, 0,  sinYaw)
    let moveX = (-sinYaw * forward) + (-cosYaw * strafe);
    let moveZ = (-cosYaw * forward) + (sinYaw * strafe);

    // Normalise so diagonal movement isn't faster.
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX = (moveX / len) * speed;
      moveZ = (moveZ / len) * speed;
    }

    player.velocity.x = moveX;
    player.velocity.z = moveZ;
  }

  private handleJump(player: Player): void {
    if (player.inWater) {
      // Swimming: space = swim upward, shift = sink
      if (inputManager.isKeyDown(' ')) {
        player.velocity.y = SWIM_UP_VELOCITY;
      } else if (inputManager.isKeyDown('shift')) {
        player.velocity.y = -SWIM_UP_VELOCITY;
      }
      return;
    }

    if (player.grounded && inputManager.isKeyDown(' ')) {
      player.velocity.y = JUMP_VELOCITY;
      player.grounded = false;
    }
  }

  private handleSprintSneak(player: Player): void {
    // Sneaking
    player.sneaking = inputManager.isKeyDown('shift');

    // Sprint via Control key
    if (inputManager.isKeyDown('control')) {
      player.sprinting = true;
    }

    // Sprint via double-tap W
    if (inputManager.isKeyPressed('w')) {
      const now = performance.now();
      if (now - this.lastWPress < DOUBLE_TAP_WINDOW) {
        player.sprinting = true;
      }
      this.lastWPress = now;
    }

    // Stop sprinting when W is released, sneaking, or in water.
    if (
      !inputManager.isKeyDown('w') ||
      player.sneaking ||
      player.inWater
    ) {
      player.sprinting = false;
    }
  }

  private handleHotbar(player: Player): void {
    // Number keys 1-9
    for (let i = 1; i <= 9; i++) {
      if (inputManager.isKeyPressed(String(i))) {
        player.selectedSlot = i - 1;
        break;
      }
    }

    // Scroll wheel
    const scroll = inputManager.scrollDelta;
    if (scroll !== 0) {
      player.selectedSlot = ((player.selectedSlot - scroll) % 9 + 9) % 9;
    }
  }

  private syncCamera(player: Player, camera: THREE.PerspectiveCamera): void {
    const eye = player.getEyePosition();
    camera.position.set(eye.x, eye.y, eye.z);

    // Build a quaternion from yaw and pitch.
    const euler = new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
  }
}
