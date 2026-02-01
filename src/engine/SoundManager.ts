/**
 * Procedural audio engine using the Web Audio API.
 *
 * All sounds are generated at runtime from oscillators and noise buffers --
 * zero external audio files required.  An AudioContext is created lazily on
 * the first user interaction (required by browser autoplay policies).
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  /** Overall volume (0 – 1). */
  private _volume = 0.5;

  // -- Footstep tracking --
  private stepAccumulator = 0;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Lazily create the AudioContext (must be called after a user gesture). */
  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._volume;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    } catch {
      return null;
    }
    return this.ctx;
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.value = this._volume;
    }
  }

  get volume(): number {
    return this._volume;
  }

  // -----------------------------------------------------------------------
  // Public sound API
  // -----------------------------------------------------------------------

  /** Short crunchy noise burst when a block finishes breaking. */
  playBlockBreak(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 1.0;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
    source.stop(now + 0.08);
  }

  /** Soft thud when a block is placed. */
  playBlockPlace(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.06);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /**
   * Call each frame while the player is moving on the ground.
   * Internally accumulates distance and plays a footstep at regular intervals.
   *
   * @param dt        Frame delta in seconds.
   * @param speed     Current movement speed in blocks/s.
   * @param sprinting Whether the player is sprinting.
   */
  updateFootsteps(dt: number, speed: number, sprinting: boolean): void {
    if (speed < 0.5) {
      this.stepAccumulator = 0;
      return;
    }

    const interval = sprinting ? 0.35 : 0.5;
    this.stepAccumulator += dt;
    if (this.stepAccumulator >= interval) {
      this.stepAccumulator -= interval;
      this.playFootstep();
    }
  }

  /** Reset the step timer (e.g. when the player leaves the ground). */
  resetFootsteps(): void {
    this.stepAccumulator = 0;
  }

  /** Quick downward sweep when the player takes damage. */
  playHurt(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** Quick ascending pop when the player picks up an item. */
  playPickup(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Short crunchy eating sound (3 rapid noise bursts). */
  playEat(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.07;
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 2.0;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.15, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start(t);
      source.stop(t + 0.04);
    }
  }

  /** Low thud when landing on the ground. Louder for harder landings. */
  playLand(intensity: number = 0.5): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;

    const vol = Math.min(0.3, intensity * 0.15);
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
    source.stop(now + 0.1);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Single soft footstep: short low-frequency noise click. */
  private playFootstep(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
    source.stop(now + 0.04);
  }

  /** Create a 1-second buffer of white noise. */
  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

/** Singleton sound manager. */
export const soundManager = new SoundManager();
