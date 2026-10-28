/**
 * Флаги, знамёна и цепи на ветру через Phaser Rope (эффект 7). Полотнище — полоса из N вершин, у древка неподвижная, к краю волна растёт;
 * общий ветер из config.wind (один на все полотнища: порыв качает всё сразу). Тень складки — через цвета вершин (впадина темнее, гребень светлее).
 * Цепь — вертикальная полоса: звенья качаются маятником с запаздыванием к низу.
 * Сейчас в игре знамёна/штандарты — готовые листы кадров (vfx_std-*), Rope нигде не используется; этот модуль — замена или дополнение.
 */
import Phaser from "phaser";
import { wind } from "./config";

export interface ClothOpts { w: number; h: number; col: string; col2: string; emblem?: string; seg?: number }

/** Текстура полотнища: полотно с каймой, зубцами внизу (ласточкин хвост) и знаком. */
export function clothTexture(scene: Phaser.Scene, key: string, o: ClothOpts) {
  if (scene.textures.exists(key)) return;
  const c = document.createElement("canvas"); c.width = o.w; c.height = o.h;
  const g = c.getContext("2d")!;
  g.fillStyle = o.col; g.fillRect(0, 0, o.w, o.h);
  g.fillStyle = o.col2; g.fillRect(0, 0, o.w, 2); g.fillRect(0, o.h - 2, o.w, 2);
  g.fillStyle = "rgba(0,0,0,0.18)"; for (let y = 3; y < o.h - 3; y += 3) g.fillRect(0, y, o.w, 1); // нити
  // знак: ромб в центре
  const cx = Math.round(o.w * 0.5), cy = Math.round(o.h * 0.5);
  g.fillStyle = o.col2; for (let i = 0; i < 5; i++) g.fillRect(cx - i, cy - 4 + i, 1 + i * 2, 1), g.fillRect(cx - i, cy + 4 - i, 1 + i * 2, 1);
  g.fillStyle = "#fff2c0"; g.fillRect(cx, cy - 1, 1, 3);
  // вырез ласточкиным хвостом справа
  for (let i = 0; i < 6; i++) g.clearRect(o.w - 1 - i, Math.floor(o.h / 2) - Math.floor((6 - i) * 0.8), 1, Math.ceil((6 - i) * 1.6));
  scene.textures.addCanvas(key, c);
}
export function chainTexture(scene: Phaser.Scene, key: string, links: number, thorns = false) {
  if (scene.textures.exists(key)) return;
  const c = document.createElement("canvas"); c.width = 5; c.height = links * 4;
  const g = c.getContext("2d")!;
  for (let y = 0; y < links * 4; y += 4) { // звено: овал 3x4, чередуется поворот
    const wide = (y / 4) % 2 === 0;
    g.fillStyle = "#6b6f78"; g.fillRect(wide ? 1 : 2, y, wide ? 3 : 1, 4); g.fillRect(wide ? 1 : 1, y + 1, wide ? 3 : 3, 2);
    g.fillStyle = "#2a2c33"; g.fillRect(wide ? 2 : 2, y + 1, 1, 2);
    g.fillStyle = "#a0a5b0"; g.fillRect(wide ? 1 : 1, y + 1, 1, 1);
    if (thorns && !wide) { g.fillStyle = "#3a5a2a"; g.fillRect(0, y + 1, 1, 1); g.fillRect(4, y + 2, 1, 1); }
  }
  scene.textures.addCanvas(key, c);
}

interface Item { spr?: Phaser.GameObjects.Sprite; key?: string; shape?: "pennant" | "drape"; rope: Phaser.GameObjects.Rope; n: number; kind: "flag" | "chain"; phase: number; amp: number; len: number; lean: number }

export class RopeCloth {
  private items: Item[] = [];
  private t = 0;
  constructor(private scene: Phaser.Scene) {}

  /** Флаг у древка: x,y — точка крепления (левый край, середина). dir 1 — по ветру вправо. */
  flag(x: number, y: number, key: string, o: { dir?: number; seg?: number; amp?: number; depth?: number } = {}) {
    const fr = this.scene.textures.get(key).getSourceImage() as HTMLCanvasElement, n = o.seg ?? 10;
    const rope = this.scene.add.rope(x + fr.width / 2, y, key, undefined, n as never, true).setDepth(o.depth ?? 100);
    if ((o.dir ?? 1) < 0) rope.setScale(-1, 1);
    const colors = new Array(n * 2).fill(0xffffff); rope.setColors(colors);
    this.items.push({ rope, n, kind: "flag", phase: Math.random() * 6, amp: o.amp ?? fr.height * 0.28, len: fr.width, lean: 0 });
    return rope;
  }
  /** Цепь, подвешенная сверху: x,y — верхняя точка. */
  chain(x: number, y: number, key: string, links: number, /* текстура chainTexture(key, links) */ o: { depth?: number; amp?: number } = {}) {
    const len = links * 4, rope = this.scene.add.rope(x, y + len / 2, key, undefined, Math.max(4, links) as never, false).setDepth(o.depth ?? 100);
    this.items.push({ rope, n: Math.max(4, links), kind: "chain", phase: Math.random() * 6, amp: o.amp ?? 3, len, lean: 0 });
    return rope;
  }

  private mirrored = new Map<Phaser.GameObjects.Sprite, Item>();
  /** Rope поверх готового штандарта: кадр 0 его листа vfx_std-*, привязка и глубина как у спрайта. Сам спрайт гасится альфой (видимость решает его владелец). */
  mirror(sp: Phaser.GameObjects.Sprite) {
    const key = sp.texture.key, shape = key.includes("pennant") ? "pennant" : "drape", fw = sp.width, fh = sp.height;
    const n = shape === "pennant" ? 10 : 14;
    const rope = this.scene.add.rope(sp.x, sp.y, key, 0, n as never, shape === "drape").setDepth(sp.depth);
    rope.setColors(new Array(n * 2).fill(0xffffff));
    const it: Item = { rope, n, kind: "flag", phase: Math.random() * 6, amp: 1, len: shape === "pennant" ? fh : fw, lean: 0, spr: sp, key, shape };
    this.items.push(it); this.mirrored.set(sp, it);
  }
  private syncMirror(it: Item) {
    const sp = it.spr!, r = it.rope;
    const fw = sp.width, fh = sp.height;
    r.setPosition(sp.x + (0.5 - sp.originX) * fw * sp.scaleX, sp.y + (0.5 - sp.originY) * fh * sp.scaleY).setScale(sp.scaleX, sp.scaleY).setDepth(sp.depth).setVisible(sp.visible && sp.active).setFlipX(sp.flipX);
    sp.setAlpha(0);
  }
  has(sp: Phaser.GameObjects.Sprite) { return this.mirrored.has(sp); }
  dropMirror(sp: Phaser.GameObjects.Sprite) { const it = this.mirrored.get(sp); if (!it) return; it.rope.destroy(); this.items = this.items.filter((i) => i !== it); this.mirrored.delete(sp); }
  /** Снять все зеркала и вернуть спрайтам видимость. */
  dropAllMirrors() { for (const [sp] of this.mirrored) { if (sp.active) sp.setAlpha(1); this.dropMirror(sp); } }
  update(dt: number) {
    this.t += Math.min(dt, 100);
    const w = wind(this.t), tt = this.t / 1000;
    for (const it of this.items) {
      const pts = it.rope.points;
      if (it.spr) {
        if (!it.spr.active || it.spr.texture.key !== it.key) { const sp = it.spr; this.dropMirror(sp); if (sp.active && /vfx_std-(pennant|drape)/.test(sp.texture.key)) this.mirror(sp); else if (sp.active) sp.setAlpha(1); continue; }
        this.syncMirror(it);
        const colors: number[] = [], th = this.t / 1000, fw = it.rope.frame.width, fh = it.rope.frame.height;
        for (let i = 0; i < pts.length; i++) {
          const k = i / (pts.length - 1);
          if (it.shape === "pennant") { // вымпел: подвешен за верх, низ качается по ветру и чуть закручивается
            const sw = Math.sin(th * (2.2 + 1.6 * w.s) - k * 2.4 + it.phase);
            pts[i].x = sw * (1 + 3.2 * w.s) * k * k * 1.1 + w.gust * 1.3 * k * k; pts[i].y = -fh / 2 + k * fh * (1 - 0.03 * w.s * Math.abs(sw) * k);
            const sh = 0.86 + 0.14 * Math.cos(th * (2.2 + 1.6 * w.s) - k * 2.4 + it.phase + 0.8), c = Math.round(255 * Math.min(1, sh + 0.06)); colors.push((c << 16) | (c << 8) | c, (c << 16) | (c << 8) | c);
          } else { // драпировка над воротами: прут неподвижен, полотно мягко дышит волной вдоль
            const wv = Math.sin(th * (1.8 + 1.4 * w.s) + k * 7 + it.phase);
            pts[i].x = -fw / 2 + k * fw; pts[i].y = wv * (0.5 + 1.2 * w.s);
            const sh = 0.88 + 0.12 * Math.cos(th * (1.8 + 1.4 * w.s) + k * 7 + it.phase + 0.7), c = Math.round(255 * Math.min(1, sh + 0.05)); colors.push((c << 16) | (c << 8) | c, (c << 16) | (c << 8) | c);
          }
        }
        it.rope.setColors(colors); it.rope.setDirty();
        continue;
      }
      if (it.kind === "flag") {
        const colors: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const k = i / (pts.length - 1), wave = Math.sin(tt * (3.2 + 2 * w.s) - k * 5.5 + it.phase);
          // у древка (k=0) неподвижно; к краю — волна, слабая обвиснутость вниз в штиль
          pts[i].y = wave * it.amp * w.s * k * k * 1.4 + (1 - w.s) * k * k * 3;
          pts[i].x = -it.len / 2 + (i / (pts.length - 1)) * it.len * (1 - 0.07 * w.s * k * Math.abs(wave));
          const shade = 0.78 + 0.22 * Math.cos(tt * (3.2 + 2 * w.s) - k * 5.5 + it.phase + 0.9);
          const c = Math.round(255 * Math.min(1, shade + 0.08)) ;
          const col = (c << 16) | (c << 8) | c;
          colors.push(col, col);
        }
        it.rope.setColors(colors);
      } else {
        for (let i = 0; i < pts.length; i++) {
          const k = i / (pts.length - 1);
          // маятник: низ запаздывает по фазе и качается сильнее
          pts[i].x = Math.sin(tt * 1.7 + it.phase - k * 1.3) * it.amp * (0.4 + w.s) * k * k + w.gust * 1.5 * k;
          pts[i].y = -it.len / 2 + k * it.len;
        }
      }
      it.rope.setDirty();
    }
  }
  destroy() { this.dropAllMirrors(); this.items.forEach((i) => i.rope.destroy()); this.items = []; }
}
