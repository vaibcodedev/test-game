/**
 * Реплики над головой — одна система для всех (игровые юниты и NPC, случайные встречи, сценки Эмберхолла и фортов).
 * Тёмная полупрозрачная плашка в цветах дизайн-системы (P.*), тонкая рамка, хвостик к говорящему, шрифт как у подписей (Rubik 600, 8 px).
 * Длинная фраза переносится по ширине, плавно появляется и тает; пузыри не налезают друг на друга (сдвиг вбок, потом вверх), хвостик остаётся у говорящего.
 * Текст пересоздаётся при смене фразы (worldText фиксирует высоту по первой записи).
 */
import Phaser from "phaser";
import { P } from "../../../shared/palette";
import { DEPTH } from "./terrain";
import { worldText } from "./worldText";

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
/** Оформление (выбор пользователя 2026-10-27, вариант B): карточка P.card, золотая рамка P.gold, текст тёплый светлый. */
const LOOK = { fill: hex(P.card), fa: 0.92, line: hex(P.gold), la: 0.95, text: "#f6e8c4", top: undefined as number | undefined };
type Look = typeof LOOK;
const WRAP = 108, PADX = 5, PADY = 3, TAIL = 4, FADE_IN = 160, FADE_OUT = 260;

/** Рамка чужой подписи (ник, имя NPC с ролью и значком): пузырь её не закрывает. id — владелец (его собственную подпись пузырь не учитывает). */
export interface LabelRect { x0: number; y0: number; x1: number; y1: number; id?: string }
let obstacles: () => LabelRect[] = () => [];
/** Источник рамок подписей (ставит GameScene). */
export function setBubbleObstacles(fn: () => LabelRect[]) { obstacles = fn; }

const all = new Set<Bubble>();
const hooked = new WeakSet<Phaser.Scene>();

export class Bubble {
  readonly box: Phaser.GameObjects.Container;
  private gfx: Phaser.GameObjects.Graphics;
  private txt: Phaser.GameObjects.Text | null = null;
  private text = "";
  private alpha = 0;
  private want = 0;
  private w = 0;
  private h = 0;
  private dx = 0;
  private drawnKey = "";
  private tx = 0;
  private ty = 0;
  private dy = 0;
  private dying = false;
  /** Юнит-говорящий: его собственная подпись для разводки не препятствие. */
  owner = "";
  private look: Look = LOOK;

  constructor(readonly scene: Phaser.Scene) {
    this.gfx = scene.add.graphics();
    this.box = scene.add.container(0, 0, [this.gfx]).setDepth(DEPTH.top - 3).setVisible(false).setName("bubble");
    all.add(this);
    if (!hooked.has(scene)) {
      hooked.add(scene);
      const tick = (_t: number, dt: number) => tickBubbles(dt);
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, tick);
      // сцена перезапускается тем же объектом: объекты реплик гибнут вместе с ней, слушатель снимаем
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
        hooked.delete(scene);
        for (const b of [...all]) if (b.scene === scene) all.delete(b);
      });
    }
  }

  /** Фраза; "" — плавно убрать. Та же фраза — ничего не меняет (кроме отмены ухода). */
  set(text: string) {
    if (text === this.text) { if (text) this.want = 1; return; }
    this.text = text;
    if (!text) { this.want = 0; return; }
    this.txt?.destroy();
    this.txt = worldText(this.scene, 0, 0, text, "plain", { fontSize: "8px", fontStyle: "600", color: this.look.text, align: "center", wordWrap: { width: WRAP } });
    this.box.add(this.txt);
    this.w = Math.ceil(this.txt.width) + 2 * PADX;
    this.h = Math.ceil(this.txt.height) + 2 * PADY;
    this.drawnKey = "";
    this.want = 1;
  }

  /** Точка под хвостиком (ноги/верх подписи говорящего), целые пиксели мира. */
  at(x: number, y: number) { this.tx = Math.round(x); this.ty = Math.round(y); }

  /** Сказать фразу и уйти через ms (после затухания объект удаляется сам). */
  say(text: string, ms: number) { this.set(text); this.scene.time.delayedCall(ms, () => this.close()); }
  close() { this.set(""); this.dying = true; }

  destroy() { all.delete(this); this.box.destroy(); }

  private draw() {
    const key = `${this.dx},${this.dy}`;
    if (this.drawnKey === key) return;
    this.drawnKey = key;
    const { w, h, look: L } = this, g = this.gfx.clear();
    const x0 = -Math.round(w / 2) + this.dx, y1 = -TAIL, y0 = y1 - h + 1, x1 = x0 + w - 1;
    // тело: прямоугольник без угловых пикселей — «скруглённый» пиксельный контур
    g.fillStyle(L.fill, L.fa).fillRect(x0, y0, w, h).fillStyle(L.fill, 1);
    g.fillStyle(L.line, L.la);
    g.fillRect(x0 + 1, y0, w - 2, 1).fillRect(x0, y0 + 1, 1, h - 2).fillRect(x1, y0 + 1, 1, h - 2);
    const tcx = Math.max(x0 + 5, Math.min(x1 - 5, 0)); // хвостик под говорящим (x = 0), но не за краем плашки
    // нижняя кромка с разрывом под хвостом
    g.fillRect(x0 + 1, y1, Math.max(0, tcx - 3 - (x0 + 1)), 1).fillRect(tcx + 4, y1, Math.max(0, x1 - 1 - (tcx + 4) + 1), 1);
    if (L.top !== undefined) g.fillStyle(L.top, 0.9).fillRect(x0 + 2, y0, w - 4, 1);
    // хвост: ряды 7, 5, 3, 1 px, края — линия рамки, середина — заливка
    for (let j = 0; j < 3; j++) {
      const half = 3 - j, yy = y1 + j;
      g.fillStyle(L.fill, 1).fillRect(tcx - half + 1, yy, 2 * half - 1, 1);
      g.fillStyle(L.line, L.la).fillRect(tcx - half, yy, 1, 1).fillRect(tcx + half, yy, 1, 1);
    }
    // сдвинут вверх разводкой: тонкая линия-«нитка» от хвостика вниз до говорящего
    g.fillStyle(L.line, L.la).fillRect(tcx, y1 + 3, 1, 1 + Math.max(0, -this.dy));
    this.txt?.setPosition(x0 + PADX, y0 + PADY);
  }

  /** Прямоугольник на экране мира (для разводки). */
  rect() { return { x0: this.tx - Math.round(this.w / 2), x1: this.tx - Math.round(this.w / 2) + this.w, y0: this.ty + this.dy - this.h - TAIL, y1: this.ty + this.dy }; }
  get live() { return this.alpha > 0.02 && !!this.txt; }
  get half() { return this.w / 2; }
  setShift(dx: number, dy: number) { this.dx = dx; this.dy = dy; }
  get size() { return this.w; }

  tick(dtMs: number) {
    const step = dtMs / (this.want > this.alpha ? FADE_IN : FADE_OUT);
    this.alpha = this.want > this.alpha ? Math.min(1, this.alpha + step) : Math.max(0, this.alpha - step);
    if (this.dying && this.alpha <= 0) { this.destroy(); return; }
    const on = this.live;
    this.box.setVisible(on);
    if (!on) return;
    this.draw();
    const e = this.alpha * this.alpha * (3 - 2 * this.alpha); // smoothstep
    this.box.setAlpha(e).setPosition(this.tx, Math.round(this.ty + this.dy + (1 - e) * 4));
  }
}

/** Разводка: пузыри от нижних к верхним; перекрытие снимается сдвигом плашки вбок (хвост остаётся у говорящего), затем вверх. */
function layout() {
  for (const b of all) b.setShift(0, 0);
  const list = [...all].filter((b) => b.live).sort((a, b) => b.rect().y1 - a.rect().y1);
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const labels = obstacles();
  for (const b of list) {
    let dx = 0, dy = 0;
    const mine = labels.filter((l) => !b.owner || l.id !== b.owner);
    for (let it = 0; it < 8; it++) {
      b.setShift(dx, dy);
      const r = b.rect(), rr = { x0: r.x0 + dx, x1: r.x1 + dx, y0: r.y0, y1: r.y1 };
      const hit = [...mine, ...placed].find((p) => rr.x0 < p.x1 + 2 && rr.x1 > p.x0 - 2 && rr.y0 < p.y1 + 2 && rr.y1 > p.y0 - 2);
      if (!hit) break;
      const lim = Math.max(0, Math.round(b.half) - 8);
      const right = hit.x1 + 2 - rr.x0, left = hit.x0 - 2 - rr.x1;
      const pick = Math.abs(right) < Math.abs(left) ? right : left;
      if (Math.abs(dx + pick) <= lim) dx += pick; else dy -= rr.y1 - hit.y0 + 2;
    }
    // плашка не выходит за видимую область камеры; хвостик остаётся над говорящим (сдвиг не больше половины плашки без 8 px)
    const v = b.scene.cameras.main.worldView, lim = Math.max(0, Math.round(b.half) - 8), r0 = b.rect();
    const over = Math.max(0, v.x + 2 - (r0.x0 + dx)) - Math.max(0, r0.x1 + dx - (v.right - 2));
    dx = Math.max(-lim, Math.min(lim, dx + over));
    b.setShift(dx, dy);
    const r = b.rect();
    placed.push({ x0: r.x0 + dx, x1: r.x1 + dx, y0: r.y0, y1: r.y1 });
  }
}

export function tickBubbles(dtMs: number) {
  layout();
  for (const b of [...all]) b.tick(dtMs);
}
