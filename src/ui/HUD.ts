import { MAX_HEALTH, MAX_HUNGER, MAX_ARMOR, MAX_AIR } from '@/utils/Constants';
import type { Player } from '@/player/Player';

// ---------------------------------------------------------------------------
// Pixel-art icon patterns (9x9 grids)
// 0 = transparent, 1 = outline, 2 = fill, 3 = highlight
// ---------------------------------------------------------------------------

const HEART: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 2, 2, 0, 1, 2, 2, 0],
  [1, 2, 3, 2, 1, 2, 3, 2, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 1],
  [0, 1, 2, 2, 2, 2, 2, 1, 0],
  [0, 0, 1, 2, 2, 2, 1, 0, 0],
  [0, 0, 0, 1, 2, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 0, 0, 0],
];

const DRUMSTICK: number[][] = [
  [0, 0, 0, 0, 0, 0, 1, 1, 0],
  [0, 0, 0, 0, 0, 1, 2, 2, 1],
  [0, 0, 0, 0, 1, 2, 3, 2, 1],
  [0, 0, 0, 1, 2, 2, 2, 1, 0],
  [0, 0, 1, 2, 2, 2, 1, 0, 0],
  [0, 1, 1, 2, 2, 1, 0, 0, 0],
  [1, 2, 1, 1, 1, 0, 0, 0, 0],
  [1, 2, 1, 0, 0, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 0, 0],
];

const SHIELD: number[][] = [
  [0, 1, 1, 1, 1, 1, 1, 1, 0],
  [1, 2, 3, 2, 1, 2, 3, 2, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 1],
  [0, 1, 2, 2, 2, 2, 2, 1, 0],
  [0, 0, 1, 2, 2, 2, 1, 0, 0],
  [0, 0, 0, 1, 2, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
];

// ---------------------------------------------------------------------------
// Colour palettes  { paletteIndex → CSS colour }
// ---------------------------------------------------------------------------

type Palette = Record<number, string>;

const HEART_FULL: Palette  = { 1: '#440000', 2: '#BE0000', 3: '#FF3333' };
const HEART_EMPTY: Palette = { 1: '#440000', 2: '#3B0000', 3: '#550000' };

const HUNGER_FULL: Palette  = { 1: '#3E2400', 2: '#C89030', 3: '#F0D060' };
const HUNGER_EMPTY: Palette = { 1: '#3E2400', 2: '#553818', 3: '#7A6840' };

const ARMOR_FULL: Palette  = { 1: '#2A2A2A', 2: '#A0A0A0', 3: '#D0D0D0' };
const ARMOR_EMPTY: Palette = { 1: '#2A2A2A', 2: '#444444', 3: '#555555' };

const BUBBLE_FULL: Palette  = { 1: '#1a3a6a', 2: '#3399ee', 3: '#88ccff' };
const BUBBLE_EMPTY: Palette = { 1: '#1a3a6a', 2: '#1a3a6a', 3: '#2a4a7a' };

const BUBBLE: number[][] = [
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
  [0, 0, 1, 2, 2, 2, 1, 0, 0],
  [0, 1, 2, 3, 3, 2, 2, 1, 0],
  [1, 2, 3, 3, 2, 2, 2, 2, 1],
  [1, 2, 3, 2, 2, 2, 2, 2, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 1],
  [0, 1, 2, 2, 2, 2, 2, 1, 0],
  [0, 0, 1, 2, 2, 2, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
];

// ---------------------------------------------------------------------------
// HUD class
// ---------------------------------------------------------------------------

/**
 * Always-visible HUD overlay:
 *  - Crosshair at screen centre
 *  - Health bar (pixel-art hearts) — bottom-left above hotbar
 *  - Armor bar (shields) — above health (hidden when 0)
 *  - Hunger bar (drumsticks) — bottom-right above hotbar
 *  - Experience bar — green bar just above hotbar
 *  - Experience level — centred number on XP bar
 *
 * All elements are appended directly to the ui-root (position: absolute)
 * to avoid stacking-context issues from nested fixed positioning.
 */
export class HUD {
  private healthIcons: HTMLElement[] = [];
  private hungerIcons: HTMLElement[] = [];
  private armorIcons: HTMLElement[] = [];
  private airIcons: HTMLElement[] = [];
  private armorRow!: HTMLElement;
  private airRow!: HTMLElement;
  private xpFill!: HTMLElement;
  private xpLevel!: HTMLElement;

  private static readonly COUNT = 10;
  private static readonly SPLIT_COL = 4;

  private sprites!: Record<string, string>;

  init(root: HTMLElement): void {
    this.sprites = this.generateAllSprites();
    this.injectStyles();
    this.buildDOM(root);
  }

  update(player: Player): void {
    this.setBar(this.healthIcons, player.health, MAX_HEALTH, 'heart');
    this.setBar(this.hungerIcons, player.hunger, MAX_HUNGER, 'hunger');
    this.setBar(this.armorIcons, player.armor, MAX_ARMOR, 'armor');
    this.armorRow.style.display = player.armor > 0 ? 'flex' : 'none';

    // Air bubbles -- visible only when head is submerged
    if (player.headSubmerged) {
      this.airRow.style.display = 'flex';
      // Map air (0..300) to icon scale (0..20) for the standard setBar
      const airScaled = Math.ceil((player.air / MAX_AIR) * 20);
      this.setBar(this.airIcons, airScaled, 20, 'air');
    } else {
      this.airRow.style.display = 'none';
    }

    const pct = Math.max(0, Math.min(1, player.experienceProgress)) * 100;
    this.xpFill.style.width = `${pct}%`;
    if (player.experienceLevel > 0) {
      this.xpLevel.textContent = String(player.experienceLevel);
      this.xpLevel.style.display = '';
    } else {
      this.xpLevel.style.display = 'none';
    }
  }

  // -----------------------------------------------------------------------
  // Sprite generation
  // -----------------------------------------------------------------------

  private generateAllSprites(): Record<string, string> {
    return {
      heart_full:   this.renderIcon(HEART, HEART_FULL),
      heart_half:   this.renderIcon(HEART, HEART_FULL, HEART_EMPTY, HUD.SPLIT_COL),
      heart_empty:  this.renderIcon(HEART, HEART_EMPTY),
      hunger_full:  this.renderIcon(DRUMSTICK, HUNGER_FULL),
      hunger_half:  this.renderIcon(DRUMSTICK, HUNGER_FULL, HUNGER_EMPTY, HUD.SPLIT_COL),
      hunger_empty: this.renderIcon(DRUMSTICK, HUNGER_EMPTY),
      armor_full:   this.renderIcon(SHIELD, ARMOR_FULL),
      armor_half:   this.renderIcon(SHIELD, ARMOR_FULL, ARMOR_EMPTY, HUD.SPLIT_COL),
      armor_empty:  this.renderIcon(SHIELD, ARMOR_EMPTY),
      air_full:     this.renderIcon(BUBBLE, BUBBLE_FULL),
      air_half:     this.renderIcon(BUBBLE, BUBBLE_FULL, BUBBLE_EMPTY, HUD.SPLIT_COL),
      air_empty:    this.renderIcon(BUBBLE, BUBBLE_EMPTY),
    };
  }

  private renderIcon(
    pattern: number[][],
    leftPalette: Palette,
    rightPalette?: Palette,
    splitCol?: number,
  ): string {
    const h = pattern.length;
    const w = pattern[0].length;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = pattern[y][x];
        if (v === 0) continue;
        const pal =
          rightPalette && splitCol !== undefined && x > splitCol
            ? rightPalette
            : leftPalette;
        const colour = pal[v];
        if (colour) {
          ctx.fillStyle = colour;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    return canvas.toDataURL();
  }

  // -----------------------------------------------------------------------
  // DOM — everything appended directly to root (no wrapper div)
  // -----------------------------------------------------------------------

  private buildDOM(root: HTMLElement): void {
    // Crosshair
    const ch = document.createElement('div');
    ch.className = 'xc-ch';
    root.appendChild(ch);

    // Bottom HUD area — sits just above the hotbar
    const area = document.createElement('div');
    area.className = 'xc-hud-bot';

    // Armor row
    this.armorRow = document.createElement('div');
    this.armorRow.className = 'xc-icon-row';
    this.armorIcons = this.makeIconRow(this.armorRow, 'armor');
    area.appendChild(this.armorRow);

    // Air bubbles row (right-aligned, above hunger -- hidden when not submerged)
    const airSplit = document.createElement('div');
    airSplit.className = 'xc-bar-split';
    const airSpacer = document.createElement('div');
    airSplit.appendChild(airSpacer);
    this.airRow = document.createElement('div');
    this.airRow.className = 'xc-icon-row xc-icon-rtl';
    this.airRow.style.display = 'none';
    this.airIcons = this.makeIconRow(this.airRow, 'air');
    airSplit.appendChild(this.airRow);
    area.appendChild(airSplit);

    // Health + Hunger split row
    const split = document.createElement('div');
    split.className = 'xc-bar-split';

    const hpRow = document.createElement('div');
    hpRow.className = 'xc-icon-row';
    this.healthIcons = this.makeIconRow(hpRow, 'heart');
    split.appendChild(hpRow);

    const hunRow = document.createElement('div');
    hunRow.className = 'xc-icon-row xc-icon-rtl';
    this.hungerIcons = this.makeIconRow(hunRow, 'hunger');
    split.appendChild(hunRow);

    area.appendChild(split);

    // XP bar
    const xpOuter = document.createElement('div');
    xpOuter.className = 'xc-xp';
    this.xpFill = document.createElement('div');
    this.xpFill.className = 'xc-xp-fill';
    xpOuter.appendChild(this.xpFill);
    this.xpLevel = document.createElement('div');
    this.xpLevel.className = 'xc-xp-lvl';
    xpOuter.appendChild(this.xpLevel);
    area.appendChild(xpOuter);

    root.appendChild(area);
  }

  /** Create 10 icon elements, setting their initial sprite immediately. */
  private makeIconRow(parent: HTMLElement, type: string): HTMLElement[] {
    const icons: HTMLElement[] = [];
    for (let i = 0; i < HUD.COUNT; i++) {
      const el = document.createElement('div');
      el.className = 'xc-icon';
      // Set initial "full" sprite so icons are visible from the first frame.
      el.style.backgroundImage = `url(${this.sprites[`${type}_full`]})`;
      parent.appendChild(el);
      icons.push(el);
    }
    return icons;
  }

  // -----------------------------------------------------------------------
  // Per-frame bar update
  // -----------------------------------------------------------------------

  private setBar(
    icons: HTMLElement[],
    value: number,
    max: number,
    type: string,
  ): void {
    const v = Math.max(0, Math.min(value, max));
    const full = Math.floor(v / 2);
    const half = v % 2 === 1;
    for (let i = 0; i < icons.length; i++) {
      let state: string;
      if (i < full) state = 'full';
      else if (i === full && half) state = 'half';
      else state = 'empty';
      const key = `${type}_${state}`;
      icons[i].style.backgroundImage = `url(${this.sprites[key]})`;
    }
  }

  // -----------------------------------------------------------------------
  // Styles
  // -----------------------------------------------------------------------

  private injectStyles(): void {
    const s = document.createElement('style');
    s.textContent = `
/* Crosshair — centred on screen */
.xc-ch {
  position: absolute;
  top: 50%; left: 50%;
  width: 22px; height: 22px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 50;
}
.xc-ch::before, .xc-ch::after {
  content: ''; position: absolute; background: rgba(255,255,255,0.85);
}
.xc-ch::before { top: 0; left: 50%; width: 2px; height: 100%; transform: translateX(-50%); }
.xc-ch::after  { top: 50%; left: 0; width: 100%; height: 2px; transform: translateY(-50%); }

/* Bottom HUD area — positioned just above the hotbar */
.xc-hud-bot {
  position: absolute;
  bottom: 58px;
  left: 50%;
  transform: translateX(-50%);
  width: 364px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  pointer-events: none;
  z-index: 50;
}

/* Split row for health (left) + hunger (right) */
.xc-bar-split { display: flex; justify-content: space-between; }

/* Icon rows */
.xc-icon-row { display: flex; gap: 0px; }
.xc-icon-rtl { direction: rtl; }

/* Individual pixel-art icon */
.xc-icon {
  width: 18px;
  height: 18px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
}

/* XP bar */
.xc-xp {
  width: 100%; height: 5px;
  background: #222; border: 1px solid #0a0a0a;
  position: relative; margin-top: 1px;
  border-radius: 1px;
}
.xc-xp-fill {
  height: 100%; background: #80e820; width: 0%;
  border-radius: 1px;
}
.xc-xp-lvl {
  position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
  color: #80ff20; font-size: 11px; font-weight: bold;
  text-shadow: 0 1px 2px #000, 0 0 4px #000;
  font-family: monospace;
}
`;
    document.head.appendChild(s);
  }
}
