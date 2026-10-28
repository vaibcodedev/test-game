/**
 * Цифры урона на BitmapText (эффект 2): свой пиксельный шрифт 5x7 с обводкой, рисуется кодом при загрузке — без файлов.
 * Цвет — через tint (глифы белые, обводка тёмная). Всплытие: «поп» масштабом ступенями 2 → 1,5 → 1 (всегда целые полупиксели, без размытия)
 * и дуга в сторону с замедлением; всё считается в update(dt), без твинов и без перерисовки текстуры на каждую цифру (в Text она создаётся заново).
 */
import Phaser from "phaser";
import { clamp01, easeOut } from "./config";

const G: Record<string, string> = {
  "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110",
  "2": "01110 10001 00001 00110 01000 10000 11111", "3": "11110 00001 00001 01110 00001 00001 11110",
  "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
  "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000",
  "8": "01110 10001 10001 01110 10001 10001 01110", "9": "01110 10001 10001 01111 00001 00010 01100",
  "+": "00000 00100 00100 11111 00100 00100 00000", "-": "00000 00000 00000 11111 00000 00000 00000",
  "!": "00100 00100 00100 00100 00100 00000 00100", ".": "00000 00000 00000 00000 00000 01100 01100",
  ",": "00000 00000 00000 00000 01100 00100 01000", " ": "00000 00000 00000 00000 00000 00000 00000",
};
const CHARS = Object.keys(G).join("");
/** scale — 1 для обычных, 1.5 для критов (ближайший сосед при рисовании: пиксели неравные, как в старых играх). */
function build(scene: Phaser.Scene, key: string, scale: number, outline: string) {
  if (scene.cache.bitmapFont.exists(key)) return;
  const gw = Math.round(5 * scale), gh = Math.round(7 * scale), cw = gw + 4, ch = gh + 4;
  const per = CHARS.length, c = document.createElement("canvas"); c.width = cw * per; c.height = ch;
  const g = c.getContext("2d")!;
  const px = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  [...CHARS].forEach((chr, i) => {
    const rows = G[chr].split(" "), ox = i * cw + 1, on = (x: number, y: number) => x >= 0 && y >= 0 && x < gw && y < gh && rows[Math.min(6, Math.floor(y / scale))][Math.min(4, Math.floor(x / scale))] === "1";
    for (let y = 0; y <= gh + 1; y++) for (let x = 0; x <= gw + 1; x++) if (!on(x, y) && on(x - 1, y - 1)) px(ox + x, 1 + y, "rgba(0,0,0,0.55)"); // мягкая тень вниз-вправо
    for (let y = -1; y <= gh + 1; y++) for (let x = -1; x <= gw; x++) {
      if (on(x, y)) continue;
      // обводка вокруг + тень на 1 px вниз
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) || on(x - 1, y - 1) || on(x + 1, y - 1) || on(x - 1, y + 1) || on(x + 1, y + 1) || on(x, y - 1 + 0) || on(x, y - 1)) px(ox + x, 1 + y, outline);
    }
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (on(x, y)) px(ox + x, 1 + y, y >= gh - Math.ceil(scale) ? "#d8d8d8" : "#ffffff"); // нижний ряд чуть темнее — объём
  });
  scene.textures.addCanvas(key, c);
  const entry = Phaser.GameObjects.RetroFont.Parse(scene, { image: key, width: cw, height: ch, chars: CHARS, charsPerRow: per, "offset.x": 0, "offset.y": 0, "spacing.x": 0, "spacing.y": 0, lineSpacing: 0 } as never) as unknown as { data: { chars: Record<string, { xAdvance: number }> } };
  for (const k of Object.keys(entry.data.chars)) entry.data.chars[k].xAdvance = gw + 2;
  scene.cache.bitmapFont.add(key, entry as never);
}
export function makeDmgFonts(scene: Phaser.Scene) {
  build(scene, "wow_num", 1, "#14080c");
  build(scene, "wow_num_big", 1.5, "#2a1608");
}

export type DmgKind = "dmg" | "crit" | "heal" | "hero" | "gold";
const KIND_COL: Record<DmgKind, number> = { dmg: 0xffe060, crit: 0xffb030, heal: 0x7aff7a, hero: 0xff6a5a, gold: 0xffe070 };
const POP = [1.5, 1.25, 1];
const lerpC = (a: number, b: number, k: number) => ((Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k) << 16) | (Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k) << 8) | Math.round((a & 255) * (1 - k) + (b & 255) * k));
/** Градиент сверху вниз: светлее и темнее базового цвета. */
const topCol = (c: number) => lerpC(c, 0xffffff, 0.45), botCol = (c: number) => lerpC(c, 0x3a1608, 0.32);
export const DMG_TEXT_OK = /^[0-9+\-!., ]+$/;

interface Num { t: Phaser.GameObjects.BitmapText; sh?: Phaser.GameObjects.Image; x0: number; y0: number; dx: number; rise: number; age: number; life: number; big: boolean; a0: number; base: number }

export class DmgNumbers {
  private live: Num[] = [];
  private pool: Phaser.GameObjects.BitmapText[] = [];
  constructor(private scene: Phaser.Scene, private depth = 9500) { makeDmgFonts(scene); makeShine(scene); }
  get count() { return this.live.length; }

  show(x: number, y: number, text: string, kind: DmgKind = "dmg") { this.add(x, y, text, KIND_COL[kind], kind === "crit"); }
  /** Универсальный вход для игры: цвет, крупность, множитель размера, «мелкая» (тик) и прозрачность. */
  add(x: number, y: number, text: string, color: number, big: boolean, o: { mul?: number; small?: boolean; dim?: number; dx?: number; dy?: number; arc?: number } = {}) {
    const font = big ? "wow_num_big" : "wow_num";
    const t = (this.pool.pop() ?? this.scene.add.bitmapText(0, 0, font, text)).setFont(font).setText(text).setDepth(this.depth).setOrigin(0.5).setTint(topCol(color), topCol(color), botCol(color), botCol(color)).setVisible(true).setAlpha(1);
    const side = Math.random() < 0.5 ? -1 : 1;
    const mul = o.mul ?? 1, a0 = (o.small ? 0.65 : 1) * (o.dim ?? 1);
    const num: Num = { t, x0: x + (o.dx ?? 0), y0: y + (o.dy ?? 0), dx: o.arc ?? side * (10 + Math.random() * 10) * (big ? 1.3 : 1), rise: o.small ? 16 : big ? 30 : 22, age: 0, life: big ? 1000 : o.small ? 700 : 850, big, a0, base: Math.max(1, Math.round(mul * 2) / 2) };
    if (big) { num.sh = this.scene.add.image(x, y, "wow_shine").setDepth(this.depth - 1).setBlendMode(Phaser.BlendModes.ADD).setTint(color).setAlpha(0); }
    this.live.push(num);
  }
  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const n = this.live[i];
      n.age += dt;
      const k = clamp01(n.age / n.life);
      // поп: 3 ступени за 150 мс (крит — за 190), масштаб кратен 0,25 — пиксели не плывут
      const popMs = n.big ? 190 : 150, step = Math.min(2, Math.floor(n.age / (popMs / 3)));
      n.t.setScale(n.base * (n.big ? [1.5, 1.25, 1][step] : step === 0 ? 1.5 : 1));
      const e = easeOut(k);
      // крит: короткая тряска первые 220 мс
      const shake = n.big && n.age < 220 ? Math.round(Math.sin(n.age * 0.09) * 2 * (1 - n.age / 220)) : 0;
      const px = Math.round(n.x0 + n.dx * Math.sin(e * Math.PI * 0.5) * 0.9) + shake, py = Math.round(n.y0 - n.rise * e);
      n.t.setPosition(px, py);
      n.t.setAlpha((k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4) * n.a0);
      if (n.sh) { // блеск: вспышка за цифрой и вращающаяся звёздочка за первые 260 мс
        const s = clamp01(n.age / 260);
        n.sh.setPosition(px, py).setAlpha((1 - s) * 0.9).setScale(0.6 + 1.1 * easeOut(s)).setRotation(s * 1.2);
      }
      if (k >= 1) { n.t.setVisible(false); this.pool.push(n.t); n.sh?.destroy(); this.live.splice(i, 1); }
    }
  }
  destroy() { this.live.forEach((n) => { n.t.destroy(); n.sh?.destroy(); }); this.pool.forEach((t) => t.destroy()); this.live = []; this.pool = []; }
}
function makeShine(scene: Phaser.Scene) {
  if (scene.textures.exists("wow_shine")) return;
  const c = document.createElement("canvas"); c.width = 32; c.height = 32;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(0.3, "rgba(255,255,255,0.25)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  g.fillStyle = "#fff"; g.fillRect(15, 3, 2, 26); g.fillRect(3, 15, 26, 2); // лучи
  scene.textures.addCanvas("wow_shine", c);
}
