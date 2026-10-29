/**
 * Лужи: во время дождя на земле постепенно проступают тёмные полупрозрачные пятна с бликом неба (нарастают ~30 с), после дождя сохнут ~90 с.
 * Места — детерминированная сетка (хэш клетки + тип поверхности): чаще на дорогах, площадях и в грязи, на траве редко, на песке, снегу, воде и в зданиях нет.
 * Дёшево: пул из 70 спрайтов одной текстуры, пересчёт видимых клеток раз в 250 мс, у каждой лужи свой порог появления (проступают не разом).
 */
import Phaser from "phaser";
import { CELL_BLOCK, CELL_WALL, T, type WorldMap } from "../../../shared/map";

const CELL = 80;
/** Шанс лужи в клетке по поверхности. */
const CHANCE: Partial<Record<T, number>> = { [T.Cobble]: 0.55, [T.CobbleSol]: 0.55, [T.CobbleUmb]: 0.55, [T.CobbleEmber]: 0.55, [T.Dirt]: 0.5, [T.Worn]: 0.3, [T.Bog]: 0.25, [T.Grass]: 0.1, [T.Forest]: 0.07, [T.Floor]: 0.15 };
const POOL = 70;
const hash = (a: number, b: number, s = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

interface Site { x: number; y: number; th: number; size: number; flip: boolean }

export class Puddles {
  private pool: Phaser.GameObjects.Image[] = [];
  private sites: Site[] = [];
  private cellKey = "";
  private lastBuild = 0;
  /** Мокрость земли 0..1. */
  wet = 0;

  constructor(private scene: Phaser.Scene, private map: WorldMap) {
    if (!scene.textures.exists("fx_puddle")) {
      const t = scene.textures.createCanvas("fx_puddle", 32, 16)!, g = t.getContext();
      g.fillStyle = "rgba(34,48,78,0.72)";
      for (const [cx, cy, rx, ry] of [[16, 8, 14, 6], [10, 9, 9, 6], [22, 7, 9, 5]] as const) { g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = "rgba(150,176,214,0.65)"; g.fillRect(6, 5, 12, 2); g.fillRect(9, 4, 8, 1); g.fillRect(19, 9, 5, 1);
      g.fillStyle = "rgba(225,236,252,0.85)"; g.fillRect(11, 4, 4, 1); g.fillRect(8, 5, 2, 1);
      t.refresh();
    }
    for (let i = 0; i < POOL; i++) this.pool.push(scene.add.image(0, 0, "fx_puddle").setDepth(-300).setVisible(false));
  }

  private surface(x: number, y: number): number {
    const m = this.map, tx = Math.floor(x / 32), ty = Math.floor(y / 32);
    if (tx < 1 || ty < 1 || tx >= m.w - 1 || ty >= m.h - 1) return -1;
    if (m.cell[ty * m.w + tx] & (CELL_BLOCK | CELL_WALL)) return -1;
    return m.vtx[ty * (m.w + 1) + tx];
  }

  /** rain 0..1 — сила дождя сейчас; indoor — в зале лужи не рисуем. Возвращает случайную видимую лужу для кругов или null. */
  update(dt: number, rain: number, indoor: boolean, view: Phaser.Geom.Rectangle, now: number): { x: number; y: number } | null {
    this.wet = Math.max(0, Math.min(1, this.wet + (rain > 0.15 ? rain * dt / 30 : -dt / 90)));
    if (this.wet <= 0.01 || indoor) { if (this.sites.length) { this.sites = []; for (const p of this.pool) p.setVisible(false); } this.cellKey = ""; return null; }
    const cx0 = Math.floor(view.x / CELL) - 1, cy0 = Math.floor(view.y / CELL) - 1, cx1 = Math.floor(view.right / CELL) + 1, cy1 = Math.floor(view.bottom / CELL) + 1;
    const key = `${cx0},${cy0},${cx1},${cy1}`;
    if (key !== this.cellKey || now - this.lastBuild > 5000) {
      this.cellKey = key; this.lastBuild = now; this.sites = [];
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const x = (cx + 0.15 + hash(cx, cy, 1) * 0.7) * CELL, y = (cy + 0.15 + hash(cx, cy, 2) * 0.7) * CELL;
        const sf = this.surface(x, y);
        if (sf < 0) continue;
        const ch = CHANCE[sf as T];
        if (!ch || hash(cx, cy, 3) > ch) continue;
        this.sites.push({ x, y, th: hash(cx, cy, 4) * 0.7, size: 1.2 + hash(cx, cy, 5) * 1.3, flip: hash(cx, cy, 6) > 0.5 });
        if (this.sites.length >= POOL) break;
      }
    }
    let ripple: { x: number; y: number } | null = null;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i], s = this.sites[i];
      if (!s) { if (p.visible) p.setVisible(false); continue; }
      const a = Math.max(0, Math.min(1, (this.wet - s.th) / 0.25));
      if (a <= 0.01) { if (p.visible) p.setVisible(false); continue; }
      p.setVisible(true).setPosition(s.x, s.y).setDepth(s.y - 40).setScale(s.size * (0.45 + 0.55 * a) * (s.flip ? -1 : 1), s.size * (0.45 + 0.55 * a)).setAlpha(a);
      if (!ripple && rain > 0.15 && a > 0.6 && Math.random() < 0.06) ripple = { x: s.x + (Math.random() - 0.5) * 16 * s.size, y: s.y + (Math.random() - 0.5) * 5 * s.size };
    }
    return ripple;
  }
}
