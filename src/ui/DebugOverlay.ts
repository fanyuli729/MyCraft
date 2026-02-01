import { CHUNK_SIZE } from '@/utils/Constants';
import type { Player } from '@/player/Player';
import type { Clock } from '@/engine/Clock';
import type { BiomeMap } from '@/terrain/BiomeMap';
import { Biome } from '@/terrain/BiomeMap';

/**
 * Extended Performance interface that includes the non-standard `memory`
 * property available in Chromium-based browsers.
 */
interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

/**
 * F3-style debug overlay that displays technical information in the
 * top-left corner of the screen.
 *
 * Toggled on / off with the F3 key.
 */
export class DebugOverlay {
  visible = false;

  private container!: HTMLElement;
  private lines!: HTMLElement;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Create DOM elements and append to the given root. */
  init(root: HTMLElement): void {
    this.injectStyles();

    this.container = document.createElement('div');
    this.container.className = 'xc-debug';
    this.container.style.display = 'none';

    this.lines = document.createElement('div');
    this.container.appendChild(this.lines);

    root.appendChild(this.container);
  }

  /** Toggle visibility. */
  toggle(): void {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? 'block' : 'none';
  }

  /**
   * Refresh the debug text. Call once per frame.
   *
   * @param player  The player instance (position, grounded state, etc.).
   * @param clock   Engine clock (FPS, elapsed time).
   * @param biomeMap Optional biome map used to look up the current biome.
   */
  update(player: Player, clock: Clock, biomeMap?: BiomeMap): void {
    if (!this.visible) return;

    const pos = player.position;
    const cx = Math.floor(pos.x / CHUNK_SIZE);
    const cz = Math.floor(pos.z / CHUNK_SIZE);

    // Direction from yaw / pitch (assume player exposes these).
    const yaw = player.yaw as number | undefined;
    const pitch = player.pitch as number | undefined;

    // Biome name
    let biomeName = '---';
    if (biomeMap) {
      const biomeId = biomeMap.getBiome(Math.floor(pos.x), Math.floor(pos.z));
      biomeName = Biome[biomeId] ?? String(biomeId);
    }

    // Memory (Chrome only)
    const perf = performance as PerformanceWithMemory;
    let memoryLine = '';
    if (perf.memory) {
      const usedMB = (perf.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
      const totalMB = (perf.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1);
      memoryLine = `Mem: ${usedMB} / ${totalMB} MB`;
    }

    const entries: string[] = [
      `FPS: ${clock.fps}`,
      `XYZ: ${pos.x.toFixed(1)} / ${pos.y.toFixed(1)} / ${pos.z.toFixed(1)}`,
      `Chunk: ${cx}, ${cz}`,
    ];

    if (yaw !== undefined && pitch !== undefined) {
      entries.push(
        `Facing: yaw ${(yaw * (180 / Math.PI)).toFixed(1)}  pitch ${(pitch * (180 / Math.PI)).toFixed(1)}`,
      );
    }

    entries.push(`Biome: ${biomeName}`);
    entries.push(`Grounded: ${player.grounded}`);

    if (memoryLine) {
      entries.push(memoryLine);
    }

    entries.push(`Time: ${clock.elapsed.toFixed(1)}s`);

    this.lines.innerHTML = entries
      .map((line) => `<div class="xc-debug-line">${this.escapeHtml(line)}</div>`)
      .join('');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = /* css */ `
      .xc-debug {
        position: absolute;
        top: 4px;
        left: 4px;
        background: rgba(0, 0, 0, 0.55);
        padding: 6px 10px;
        pointer-events: none;
        z-index: 1050;
        font-family: 'Courier New', Courier, monospace;
        min-width: 200px;
      }

      .xc-debug-line {
        color: #e0e0e0;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre;
        text-shadow: 1px 1px 0 #000;
      }
    `;
    document.head.appendChild(style);
  }
}
