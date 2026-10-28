/**
 * Вступление босса как в кино (эффект 3), на Phaser.Time.Timeline: камера плавно едет к боссу, на нём вспыхивает кольцо света и поднимаются искры цвета босса,
 * босс делает жест, камера возвращается. Полосы, плашка с именем и титулом, вспышка и затемнение краёв — DOM по дизайн-системе (fx/bossBanner.ts,
 * styles/boss-intro.css). ~2,9 с, пропуск кликом или клавишей. onLock(true/false) — запретить/вернуть управление героем.
 */
import Phaser from "phaser";
import { wowCfg } from "./config";
import { BossBanner } from "./bossBanner";

export interface BossIntroOpts {
  boss: { x: number; y: number };
  name: string;
  title: string;
  kicker?: string;
  sub?: string;
  crest?: "sol" | "umb" | "none";
  /** цвет босса */
  color?: number;
  onGesture?: () => void;
  onLock?: (locked: boolean) => void;
  onDone?: () => void;
  /** кого камера снова ведёт после вступления */
  followTarget?: Phaser.GameObjects.GameObject;
  followOffY?: number;
  skippable?: boolean;
}

export class BossIntro {
  private tl?: Phaser.Time.Timeline;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private cam: Phaser.Cameras.Scene2D.Camera;
  private done = false;
  private home = { x: 0, y: 0 };
  private offs: Array<() => void> = [];
  private dom?: BossBanner;
  private em: { img: Phaser.GameObjects.Image; vx: number; vy: number; age: number; life: number }[] = [];
  private col = 0xffffff;

  constructor(private scene: Phaser.Scene, private o: BossIntroOpts) { this.cam = scene.cameras.main; }

  play() {
    const s = this.scene, cam = this.cam, total = wowCfg("bossIntro").totalMs, col = this.col = this.o.color ?? 0xd6a84b;
    this.home = { x: cam.midPoint.x, y: cam.midPoint.y };
    this.o.onLock?.(true);
    this.dom = new BossBanner({ name: this.o.name, title: this.o.title, kicker: this.o.kicker ?? "Босс", sub: this.o.sub, color: col, crest: this.o.crest ?? "none", durMs: total });
    if (!s.textures.exists("wow_bi_spark")) { const c = document.createElement("canvas"); c.width = 7; c.height = 7; const g = c.getContext("2d")!; const gr = g.createRadialGradient(3.5, 3.5, 0, 3.5, 3.5, 3.5); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.5, "rgba(255,255,255,0.5)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 7, 7); s.textures.addCanvas("wow_bi_spark", c); }
    // пульс света за боссом: кольцо с мягким ADD
    const burst = s.add.circle(this.o.boss.x, this.o.boss.y - 10, 8, col, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(19990);
    this.objs.push(burst);
    cam.stopFollow();
    const sc = (ms: number) => ms * total / 2900;
    this.tl = s.add.timeline([
      { at: sc(120), run: () => cam.pan(this.o.boss.x, this.o.boss.y - 8, sc(900), "Sine.easeInOut") },
      { at: sc(1000), run: () => { burst.setAlpha(0.5).setRadius(8); this.embers(this.o.boss.x, this.o.boss.y); this.track(burst, { radius: 80, alpha: 0 }, sc(800), "Cubic.easeOut"); } },
      { at: sc(1250), run: () => { this.o.onGesture?.(); cam.shake(160, 0.004); } },
      { at: sc(2150), run: () => cam.pan(this.home.x, this.home.y, sc(650), "Sine.easeInOut") },
      { at: total, run: () => this.finish(false) },
    ]);
    this.tl.play();
    const onUpd = (_t: number, dt: number) => this.tick(dt);
    s.events.on("update", onUpd); this.offs.push(() => s.events.off("update", onUpd));
    if (this.o.skippable !== false) {
      const k = () => this.finish(true);
      s.input.keyboard?.once("keydown", k); s.input.once("pointerdown", k);
      window.addEventListener("pointerdown", k, { once: true });
      this.offs.push(() => { s.input.keyboard?.off("keydown", k); s.input.off("pointerdown", k); window.removeEventListener("pointerdown", k); });
    }
    return this;
  }

  /** Искры цвета босса поднимаются от него вверх и гаснут. */
  private embers(x: number, y: number) {
    for (let i = 0; i < 26; i++) {
      const img = this.scene.add.image(x + (Math.random() - 0.5) * 36, y + 4 - Math.random() * 10, "wow_bi_spark").setBlendMode(Phaser.BlendModes.ADD).setTint(i % 3 ? this.col : 0xffffff).setDepth(19990).setScale(0.8 + Math.random() * 0.9);
      this.em.push({ img, vx: (Math.random() - 0.5) * 26, vy: -30 - Math.random() * 55, age: 0, life: 900 + Math.random() * 700 });
      this.objs.push(img);
    }
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
    this.em = this.em.filter((e) => { e.age += Math.min(dt, 100); const k = e.age / e.life; if (k >= 1) { e.img.destroy(); return false; } e.img.setPosition(Math.round(e.img.x + e.vx * dt / 1000), Math.round(e.img.y + e.vy * dt / 1000)).setAlpha(1 - k * k); e.vx += Math.sin(e.age / 160 + e.life) * 0.4; return true; });
    this.anims = this.anims.filter((a) => {
      const k = Math.min(1, (this.clock - a.t0) / a.dur), e = a.ease(k);
      for (const [o, key, from, to] of a.items) { if ((o as unknown as { active?: boolean }).active === false) continue; o[key] = from + (to - from) * e; }
      return k < 1;
    });
  }
  /** Конец или пропуск: камера возвращается, DOM гаснет. */
  private finish(skipped: boolean) {
    if (this.done) return;
    this.done = true;
    this.offs.forEach((f) => f()); this.offs = [];
    this.tl?.destroy();
    if (skipped) { this.cam.pan(this.home.x, this.home.y, 220, "Sine.easeOut"); this.dom?.skip(); } else this.dom?.destroy();
    this.objs.forEach((g) => g.destroy()); this.objs = []; this.em = [];
    if (this.o.followTarget) this.cam.startFollow(this.o.followTarget, true, 0.15, 0.15, 0, this.o.followOffY ?? 0);
    this.o.onLock?.(false);
    this.o.onDone?.();
  }
  get active() { return !this.done; }
}
