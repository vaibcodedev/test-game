/**
 * Задача 147: ткань «Спины» героя Б (плащ Рыцаря Хаоса, шарф разбойника) — Phaser Rope, вершины считает Verlet-цепь.
 * Текстура — спокойный кадр на вид (экспорт gear147 → assets/hero147/cloth, manifest.cloth), верх пришпилен к точкам крепления скелета
 * (pinFrom: ключ скелета + смещение) по текущему кадру тела; к низу свобода растёт. Силы: тяжесть, инерция (герой бежит — ткань отстаёт,
 * встал — догоняет с затуханием), общий ветер config.wind (покой — мягкое волнение, порыв качает всех), толчок при ударе.
 * Ограничения: длина звеньев, не сквозь тело (сбоку ткань остаётся за спиной), не выше крепления, не за рамку кадра.
 * Шаг фиксированный 60 Гц. Тень складки — цвет вершин по изгибу. Чужие вдали от камеры и слабый ПК — статичная ткань без расчёта.
 */
import Phaser from "phaser";
import { wind } from "./fx/config";
import { heroBPins, heroBPinKeys, type ClothDef, type HbSheet } from "./heroB";

const STEP = 1 / 60, N = 10, ITER = 5;
const GRAV = 120, SPRING = 260, DAMP = 0.965, WIND = 90, PUSH = 55;
/** Слабый ПК: localStorage heroB:cloth = "static" — ткань без расчёта у всех. */
const LOW = (() => { try { return localStorage.getItem("heroB:cloth") === "static"; } catch { return false; } })();

interface Tex { key: string; ax: number; ay: number; hw: number; h: number; ok: boolean; /** форма покоя: сдвиг середины полосы от крепления по точкам цепи */ rest: number[] }
const texs = new Map<string, Tex>();
const loading = new Set<string>();
/** Текстура вида: кадр «c» — полоса, симметричная вокруг точки крепления (Rope кладёт полосу по центру цепи). */
function texOf(scene: Phaser.Scene, def: ClothDef, view: string): Tex | null {
  const v = def.views[view]; if (!v) return null;
  const key = `hbc_${v.file}`;
  const t = texs.get(key); if (t) return t.ok ? t : null;
  if (loading.has(key)) return null;
  loading.add(key);
  const im = new Image();
  im.onload = () => {
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
    const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    // Полоса может идти наискось (вид сбоку — край плаща): строки сдвигаются так, чтобы середина каждой легла на ось крепления
    // («распрямлённая» текстура для Rope), а прежняя середина строки — форма покоя цепи (rest): в покое Rope рисует ткань ровно как генератор.
    const ax = v.pins.reduce((s, p) => s + p[0], 0) / v.pins.length, ay = Math.max(0, Math.floor(Math.min(...v.pins.map((p) => p[1])) - 1));
    const cx: number[] = [], half: number[] = [];
    let y1 = -1;
    for (let y = ay; y < c.height; y++) {
      let lo = -1, hi = -1; for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 10) { if (lo < 0) lo = x; hi = x; }
      if (lo >= 0) { cx.push((lo + hi + 1) / 2); half.push((hi + 1 - lo) / 2); y1 = y; } else { cx.push(NaN); half.push(0); }
    }
    for (let k = 0; k < cx.length; k++) if (Number.isNaN(cx[k])) cx[k] = k > 0 && !Number.isNaN(cx[k - 1]) ? cx[k - 1] : ax;
    const h = Math.max(4, y1 + 2 - ay), hw = Math.ceil(Math.max(2, ...half)) + 1;
    const sc = document.createElement("canvas"); sc.width = hw * 2; sc.height = h;
    const sg = sc.getContext("2d")!;
    for (let y = 0; y < h; y++) sg.drawImage(c, 0, ay + y, c.width, 1, Math.round(hw - (cx[Math.min(y, cx.length - 1)] ?? ax)), y, c.width, 1);
    const sk = key + "|s";
    if (!scene.textures.exists(sk)) scene.textures.addCanvas(sk, sc);
    scene.textures.get(sk).add("c", 0, 0, 0, hw * 2, h);
    const rest = Array.from({ length: N }, (_, k) => (cx[Math.min(cx.length - 1, Math.round((k / (N - 1)) * (h - 1)))] ?? ax) - ax);
    texs.set(key, { key: sk, ax, ay, hw, h, ok: y1 >= 0, rest });
  };
  im.onerror = () => texs.set(key, { key, ax: 0, ay: 0, hw: 0, h: 0, ok: false, rest: [] });
  im.src = `/assets/hero147/${v.file}`;
  return null;
}

export class HeroCloth {
  private rope?: Phaser.GameObjects.Rope;
  private texKey = "";
  private px = new Float32Array(N); private py = new Float32Array(N);
  private ox = new Float32Array(N); private oy = new Float32Array(N);
  private acc = 0;
  private seg = 1;
  private fresh = true;
  private colors = new Array<number>(N * 2).fill(0xffffff);
  constructor(private scene: Phaser.Scene) {}

  /** Каждый кадр UnitView: sp — спрайт героя Б, sh — его лист; push — начат удар (толчок); near — рядом с камерой (иначе статично). */
  update(sp: Phaser.GameObjects.Sprite, sh: HbSheet | null, dt: number, push: boolean, near: boolean) {
    const c = sh?.cloth;
    if (!sh || !c || !sp.visible || sp.alpha < 0.05) { this.rope?.setVisible(false); return; }
    const COLS = 14, fn = Number(sp.frame.name) || 0, rowName = sh.rows[Math.floor(fn / COLS)] ?? "idle:down", fi = fn % COLS;
    const view = rowName.split(":")[1], v = c.def.views[view];
    const t = v ? texOf(this.scene, c.def, view) : null;
    if (!t || !v) { this.rope?.setVisible(false); return; }
    // крепление: точки скелета текущего кадра (кадр 48, ступни 24,45) + смещение → координаты кадра ткани → мир (ступни героя — sp.x, sp.y)
    const P = heroBPins(sh, rowName, fi), keys = heroBPinKeys(), O = c.def.origin;
    let axT = t.ax, ayT = t.ay;
    if (P) {
      let sx = 0, sy = 0;
      for (const pf of v.pinFrom) { const k = keys.indexOf(pf.key); const off = view === "left" ? -pf.offset[0] : pf.offset[0]; sx += P[k * 2] + off + O[0] - 24; sy += P[k * 2 + 1] + pf.offset[1] + O[1] - 45; }
      axT = sx / v.pinFrom.length; ayT = sy / v.pinFrom.length - 1;
    }
    const AX = sp.x + axT - O[0], AY = sp.y + ayT - O[1];
    if (this.texKey !== t.key || !this.rope) {
      this.rope?.destroy();
      this.texKey = t.key;
      this.rope = this.scene.add.rope(0, 0, t.key, "c", N as never, false);
      this.seg = t.h / (N - 1);
      this.fresh = true;
    }
    const r = this.rope;
    // форма покоя (rest) — как ткань нарисована в генераторе; цепь тянется к ней пружиной, сильнее у крепления, мягче к низу
    const RX = t.rest, SEG = (k: number) => Math.hypot(RX[k] - RX[k - 1], this.seg);
    const restAt = (k: number) => { this.px[k] = this.ox[k] = AX + RX[k]; this.py[k] = this.oy[k] = AY + k * this.seg; };
    if (this.fresh) { for (let k = 0; k < N; k++) restAt(k); this.fresh = false; }
    const side = view === "side" ? 1 : view === "left" ? -1 : 0; // куда смотрит герой сбоку: ткань за спиной, не сквозь тело
    if (LOW || !near) {
      for (let k = 0; k < N; k++) restAt(k);
    } else {
      // толчок удара — назад от взгляда (сбоку) или в сторону (вниз, вверх), растёт к низу
      if (push) for (let k = 1; k < N; k++) { const f = k / (N - 1); this.ox[k] += (side ? side : 1) * PUSH * f * STEP; this.oy[k] += PUSH * 0.3 * f * STEP; }
      this.acc = Math.min(this.acc + dt, STEP * 5);
      const now = this.scene.time.now;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        const w = wind(now), wx = WIND * w.s, flutter = Math.sin(now / 260) * 0.35 + Math.sin(now / 97) * 0.15;
        this.px[0] = this.ox[0] = AX + RX[0]; this.py[0] = this.oy[0] = AY;
        for (let k = 1; k < N; k++) {
          const f = k / (N - 1), K = SPRING * (1 - 0.75 * f);
          const ax = wx * (0.4 + 0.6 * f) * (1 + flutter * f) - (side ? side * wx * 0.3 : 0) + K * (AX + RX[k] - this.px[k]);
          const ay = GRAV + K * (AY + k * this.seg - this.py[k]);
          const vx = (this.px[k] - this.ox[k]) * DAMP, vy = (this.py[k] - this.oy[k]) * DAMP;
          this.ox[k] = this.px[k]; this.oy[k] = this.py[k];
          this.px[k] += vx + ax * STEP * STEP; this.py[k] += vy + ay * STEP * STEP;
        }
        for (let it = 0; it < ITER; it++) {
          for (let k = 1; k < N; k++) {
            const dx = this.px[k] - this.px[k - 1], dy = this.py[k] - this.py[k - 1], d = Math.hypot(dx, dy) || 1e-4, e = (d - SEG(k)) / d;
            if (k === 1) { this.px[k] -= dx * e; this.py[k] -= dy * e; }
            else { this.px[k] -= dx * e * 0.5; this.py[k] -= dy * e * 0.5; this.px[k - 1] += dx * e * 0.5; this.py[k - 1] += dy * e * 0.5; }
          }
          const fx0 = sp.x - sp.displayOriginX, fy1 = sp.y - sp.displayOriginY + sp.frame.height;
          for (let k = 1; k < N; k++) {
            const f = k / (N - 1), c0 = AX + RX[k], maxX = 1.5 + f * t.hw * 0.9;
            // не выше крепления, к низу свобода растёт, сбоку — не вперёд формы покоя (не сквозь тело), в рамке кадра героя
            if (this.py[k] < AY + k * this.seg * 0.45) this.py[k] = AY + k * this.seg * 0.45;
            if (side > 0 && this.px[k] > c0 + 0.5) this.px[k] = c0 + 0.5;
            if (side < 0 && this.px[k] < c0 - 0.5) this.px[k] = c0 - 0.5;
            this.px[k] = Math.max(c0 - maxX, Math.min(c0 + maxX, this.px[k]));
            this.px[k] = Math.max(fx0 + 1, Math.min(fx0 + sp.frame.width - 1, this.px[k]));
            this.py[k] = Math.min(fy1 - 1, this.py[k]);
          }
        }
      }
    }
    // вершины Rope — от первой точки; цвет — тень складки по изгибу звена
    const pts = r.points as { x: number; y: number }[];
    for (let k = 0; k < N; k++) { pts[k].x = Math.round((this.px[k] - AX - RX[0]) * 2) / 2; pts[k].y = this.py[k] - AY; }
    for (let k = 0; k < N; k++) {
      const a = k > 0 && k < N - 1 ? Math.abs(Math.atan2(this.px[k + 1] - this.px[k], this.py[k + 1] - this.py[k]) - Math.atan2(this.px[k] - this.px[k - 1], this.py[k] - this.py[k - 1])) : 0;
      const g = Math.round(255 * (1 - Math.min(0.32, a * 0.9)));
      this.colors[k * 2] = this.colors[k * 2 + 1] = (g << 16) | (g << 8) | g;
    }
    r.setColors(this.colors);
    r.setDirty();
    r.setPosition(Math.round(AX + RX[0]), Math.round(AY)).setVisible(true).setAlpha(sp.alpha)
      .setDepth(sp.depth + (v.layer === "front" ? 0.02 : -0.02));
  }
  destroy() { this.rope?.destroy(); }
}
