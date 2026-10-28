/**
 * Вступление босса как в кино (эффект 3), на Phaser.Time.Timeline: полосы с золотой гравировкой выезжают сверху и снизу, камера плавно едет к боссу,
 * имя (шрифт и цвета окон игры, палитра shared/palette) на тёмной подложке с золотой рамкой, всплеск цвета босса, жест, камера возвращается. ~2,9 с.
 * Пропуск: любая клавиша / клик → камера сразу возвращается. onLock(true/false) — запретить/вернуть управление героем.
 */
import Phaser from "phaser";
import { P } from "../../../../shared/palette";
import { wowCfg } from "./config";

export interface BossIntroOpts {
  boss: { x: number; y: number };
  name: string;
  title: string;
  /** цвет босса (всплеск и подчёркивание имени) */
  color?: number;
  onGesture?: () => void;
  onLock?: (locked: boolean) => void;
  onDone?: () => void;
  /** кого камера снова ведёт после вступления */
  followTarget?: Phaser.GameObjects.GameObject;
  followOffY?: number;
  skippable?: boolean;
  fontFamily?: string;
}
const hex = (s: string) => parseInt(s.slice(1), 16);
const GOLD = hex(P.gold), LINE_HI = hex(P.lineHi);

/** Полоса с гравировкой: тёмный фон, золотая кромка у края кадра, ряд ромбов и тонкая линия. flip — нижняя. */
function barTexture(scene: Phaser.Scene, key: string, w: number, h: number, flip: boolean) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b080d"; g.fillRect(0, 0, w, h);
  const edge = flip ? 0 : h - 1;
  g.fillStyle = P.gold; g.fillRect(0, edge, w, 1);
  g.fillStyle = "#7a5a2a"; g.fillRect(0, flip ? 1 : h - 2, w, 1);
  const mid = flip ? 4 : h - 5;
  g.fillStyle = P.lineHi; g.fillRect(0, mid, w, 1);
  for (let x = 6; x < w - 6; x += 24) { // ромбы по кромке
    g.fillStyle = P.gold; g.fillRect(x, mid - 1, 1, 3); g.fillRect(x - 1, mid, 3, 1);
    g.fillStyle = "#3a2a1a"; g.fillRect(x + 11, mid, 2, 1);
  }
  for (const cx of [14, w - 15]) { // уголки
    g.fillStyle = P.gold; g.fillRect(cx - 4, mid, 9, 1); g.fillRect(cx, mid - 4, 1, 9); g.fillStyle = "#0b080d"; g.fillRect(cx, mid, 1, 1);
  }
  scene.textures.addCanvas(key, c);
}

export class BossIntro {
  private tl?: Phaser.Time.Timeline;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private cam: Phaser.Cameras.Scene2D.Camera;
  private done = false;
  private home = { x: 0, y: 0 };
  private offs: Array<() => void> = [];

  constructor(private scene: Phaser.Scene, private o: BossIntroOpts) { this.cam = scene.cameras.main; }

  play() {
    const s = this.scene, cam = this.cam, z = cam.zoom, w = Math.round(cam.width / z), h = Math.round(cam.height / z), barH = Math.round(h * 0.13);
    const total = wowCfg("bossIntro").totalMs, col = this.o.color ?? GOLD, colS = "#" + col.toString(16).padStart(6, "0");
    this.home = { x: cam.midPoint.x, y: cam.midPoint.y };
    this.o.onLock?.(true);
    const D = 20000, ff = this.o.fontFamily ?? '"Rubik", "Trebuchet MS", sans-serif';
    // всё в координатах экрана: при масштабе камеры scrollFactor 0 считается от центра, поэтому ставим по центру и сдвигаем
    const cx = cam.width / 2, cy = cam.height / 2, L = cx - w / 2, T = cy - h / 2;
    const topKey = `wow_bar_t${w}x${barH}`, botKey = `wow_bar_b${w}x${barH}`;
    barTexture(s, topKey, w, barH, false); barTexture(s, botKey, w, barH, true);
    const top = s.add.image(L, T - barH, topKey).setOrigin(0).setScrollFactor(0).setDepth(D);
    const bot = s.add.image(L, T + h, botKey).setOrigin(0).setScrollFactor(0).setDepth(D);
    const fs = Math.max(12, Math.round(h * 0.075)), fs2 = Math.max(8, Math.round(h * 0.034));
    const baseY = T + h - barH - Math.round(h * 0.2);
    const name = s.add.text(cx, baseY, this.o.name.toUpperCase(), { fontFamily: ff, fontSize: fs + "px", color: P.fg, stroke: "#0e0b10", strokeThickness: Math.max(2, fs * 0.2), fontStyle: "bold" }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2).setAlpha(0).setResolution(2).setLetterSpacing(Math.max(1, fs * 0.12));
    const title = s.add.text(cx, baseY + fs * 0.9 + 3, this.o.title, { fontFamily: ff, fontSize: fs2 + "px", color: P.dim, stroke: "#0e0b10", strokeThickness: 2, fontStyle: "italic" }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D + 2).setAlpha(0).setResolution(2);
    // подложка в стиле окон: тёмная карточка, золотая рамка и подчёркивание цветом босса
    const pw = Math.max(name.width, title.width) + fs * 1.4, ph = fs * 0.9 + fs2 + fs * 0.9 + 8;
    const plate = s.add.graphics().setScrollFactor(0).setDepth(D + 1).setAlpha(0);
    plate.fillStyle(hex(P.well), 0.82).fillRect(cx - pw / 2, baseY - fs * 0.65, pw, ph);
    plate.lineStyle(1, GOLD, 1).strokeRect(Math.round(cx - pw / 2) + 0.5, Math.round(baseY - fs * 0.65) + 0.5, pw - 1, ph - 1);
    plate.lineStyle(1, LINE_HI, 0.8).strokeRect(Math.round(cx - pw / 2) + 3.5, Math.round(baseY - fs * 0.65) + 3.5, pw - 7, ph - 7);
    plate.fillStyle(col, 1).fillRect(cx - pw / 2 + 8, baseY - fs * 0.65 + ph - 4, pw - 16, 1);
    // всплеск цвета босса: кольцо света (ADD) на боссе и короткий цветной вираж экрана
    const burst = s.add.circle(this.o.boss.x, this.o.boss.y - 10, 8, col, 0.0).setBlendMode(Phaser.BlendModes.ADD).setDepth(D - 1);
    const tint = s.add.rectangle(L, T, w, h, col, 0).setOrigin(0).setScrollFactor(0).setDepth(D - 2).setBlendMode(Phaser.BlendModes.ADD);
    this.objs.push(top, bot, name, title, plate, burst, tint);
    cam.stopFollow();
    // анимации полос и текста считаем сами по кадрам сцены (стабильно при любом fps, не зависят от менеджера твинов); Timeline задаёт моменты
    const tw = (targets: object, props: Record<string, number>, duration: number, ease = "Sine.easeInOut") => () => this.track(targets, props, duration, ease);
    const sc = (ms: number) => ms * total / 2900;
    this.tl = s.add.timeline([
      { at: 0, run: tw(top, { y: T }, sc(380), "Cubic.easeOut") },
      { at: 0, run: tw(bot, { y: T + h - barH }, sc(380), "Cubic.easeOut") },
      { at: sc(120), run: () => cam.pan(this.o.boss.x, this.o.boss.y - 8, sc(820), "Sine.easeInOut") },
      { at: sc(950), run: tw([plate, name], { alpha: 1 }, sc(380), "Cubic.easeOut") },
      { at: sc(950), run: tw(name, { y: baseY - 3 }, sc(380), "Cubic.easeOut") },
      { at: sc(1100), run: tw(title, { alpha: 1 }, sc(380), "Sine.easeOut") },
      { at: sc(1200), run: () => { burst.setAlpha(0.55).setRadius(8); this.track(burst, { radius: 70, alpha: 0 }, sc(700), "Cubic.easeOut"); tint.setAlpha(0.22); this.track(tint, { alpha: 0 }, sc(500), "Sine.easeOut"); } },
      { at: sc(1250), run: () => { this.o.onGesture?.(); cam.shake(160, 0.004); } },
      { at: sc(2150), run: tw([name, title, plate], { alpha: 0 }, sc(300), "Sine.easeIn") },
      { at: sc(2150), run: () => cam.pan(this.home.x, this.home.y, sc(650), "Sine.easeInOut") },
      { at: sc(2500), run: tw(top, { y: T - barH }, sc(380), "Cubic.easeIn") },
      { at: sc(2500), run: tw(bot, { y: T + h }, sc(380), "Cubic.easeIn") },
      { at: total, run: () => this.finish(false) },
    ]);
    this.tl.play();
    const onUpd = (_t: number, dt: number) => this.tick(dt);
    s.events.on("update", onUpd); this.offs.push(() => s.events.off("update", onUpd));
    if (this.o.skippable !== false) {
      const k = () => this.finish(true);
      s.input.keyboard?.once("keydown", k); s.input.once("pointerdown", k);
      this.offs.push(() => { s.input.keyboard?.off("keydown", k); s.input.off("pointerdown", k); });
    }
    return this;
  }
  private clock = 0;
  private anims: { t0: number; dur: number; ease: (t: number) => number; items: [Record<string, number>, string, number, number][] }[] = [];
  private track(targets: object, props: Record<string, number>, dur: number, easeName: string) {
    const ease = Phaser.Tweens.Builders.GetEaseFunction(easeName) as (t: number) => number;
    const items: [Record<string, number>, string, number, number][] = [];
    for (const tg of (Array.isArray(targets) ? targets : [targets]) as Record<string, number>[]) for (const k of Object.keys(props)) items.push([tg, k, tg[k], props[k]]);
    this.anims.push({ t0: this.clock, dur, ease, items });
  }
  private tick(dt: number) {
    this.clock += Math.min(dt, 100);
    this.anims = this.anims.filter((a) => {
      const k = Math.min(1, (this.clock - a.t0) / a.dur), e = a.ease(k);
      for (const [o, key, from, to] of a.items) { if ((o as unknown as { active?: boolean }).active === false) continue; o[key] = from + (to - from) * e; }
      return k < 1;
    });
  }
  /** Пропуск: камера быстро возвращается, полосы и имя гаснут. */
  private finish(skipped: boolean) {
    if (this.done) return;
    this.done = true;
    this.offs.forEach((f) => f()); this.offs = [];
    this.tl?.destroy();
    const s = this.scene, cam = this.cam;
    if (skipped) {
      cam.pan(this.home.x, this.home.y, 220, "Sine.easeOut");
      this.cleanup();
    } else this.cleanup();
    this.o.onLock?.(false);
    this.o.onDone?.();
  }
  private cleanup() { this.objs.forEach((g) => g.destroy()); this.objs = []; if (this.o.followTarget) this.cam.startFollow(this.o.followTarget, true, 0.15, 0.15, 0, this.o.followOffY ?? 0); }
  get active() { return !this.done; }
}
