export class Clock {
  private lastTime = 0;
  private _delta = 0;
  private _elapsed = 0;
  private _fps = 0;
  private frameCount = 0;
  private fpsTimer = 0;

  get delta(): number {
    return this._delta;
  }

  get elapsed(): number {
    return this._elapsed;
  }

  get fps(): number {
    return this._fps;
  }

  start(): void {
    this.lastTime = performance.now() / 1000;
  }

  tick(): void {
    const now = performance.now() / 1000;
    this._delta = Math.min(now - this.lastTime, 0.1); // Cap at 100ms
    this.lastTime = now;
    this._elapsed += this._delta;

    this.frameCount++;
    this.fpsTimer += this._delta;
    if (this.fpsTimer >= 1) {
      this._fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer -= 1;
    }
  }
}
