import * as THREE from 'three';
import { Clock } from './Clock';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly clock: Clock;
  private animationId = 0;
  private updateCallbacks: ((dt: number) => void)[] = [];

  /** When true, the Three.js renderer skips drawing. The last frame stays on screen. */
  skipRender = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x87ceeb);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 80, 0);

    this.clock = new Clock();

    window.addEventListener('resize', this.onResize.bind(this));
  }

  onUpdate(callback: (dt: number) => void): void {
    this.updateCallbacks.push(callback);
  }

  start(): void {
    this.clock.start();
    this.loop();
  }

  stop(): void {
    cancelAnimationFrame(this.animationId);
  }

  private loop = (): void => {
    this.animationId = requestAnimationFrame(this.loop);
    this.clock.tick();
    const dt = this.clock.delta;

    for (const cb of this.updateCallbacks) {
      cb(dt);
    }

    if (!this.skipRender) {
      this.renderer.render(this.scene, this.camera);
    }
  };

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose(): void {
    this.stop();
    this.renderer.dispose();
    window.removeEventListener('resize', this.onResize.bind(this));
  }
}
