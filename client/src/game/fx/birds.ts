/**
 * Птицы над городами (эффект 1). Стайка 3–7 птиц пролетает днём, на земле — тень; иногда стайка садится на крышу
 * и взлетает, если подойти ближе 44 px. Вороны и чайки, 8 кадров взмаха, 12 к/с.
 * Подключение: new Birds(scene, opts) и birds.update(dtMs) в кадре. Сама ничего не создаёт, пока не вызван spawn или не пришёл день (auto).
 */
import Phaser from "phaser";
import { clamp01, easeInOut, easeOut, wowCfg } from "./config";

export interface Roof { x: number; y: number }
export interface BirdsOpts {
  roofs: () => Roof[];
  isDay: () => boolean;
  /** точка, чьё приближение спугивает сидящих (герой) */
  scare: () => { x: number; y: number } | null;
  /** видимое окно мира для автозапуска и удаления */
  view: () => { x: number; y: number; w: number; h: number };
  depth?: number;
  auto?: boolean;
  /** вид по месту: вороны у пустошей, чайки у воды */
  species?: () => Species;
  shadowDepth?: number;
}
interface Bird { sp: Species; img: Phaser.GameObjects.Image; sh: Phaser.GameObjects.Image; ox: number; oy: number; ph: number; hOff: number }
interface Flock {
  birds: Bird[]; x: number; y: number; vx: number; vy: number; h: number; state: "fly" | "land" | "sit" | "leave";
  roof?: Roof; t0: number; fromX: number; fromY: number; fromH: number; life: number;
}

export type Species = "raven" | "gull";
const PAL: Record<Species, { body: string; wing: string; tip: string; hi: string; beak: string; sh: number }> = {
  raven: { body: "#1b1a24", wing: "#2a2836", tip: "#14131b", hi: "#5a5470", beak: "#9a8a6a", sh: 0.26 },
  gull: { body: "#eceff2", wing: "#d3d8df", tip: "#3b3f4a", hi: "#ffffff", beak: "#e0a430", sh: 0.2 },
};
// 6 кадров взмаха 11x9: угол крыла от высоко вверх до вниз (по кругу туда-обратно), плюс кадр «сидит» (индекс 6)
const ANG = [-70, -42, -12, 22, 48, 20, -14, -44];
function makeTex(scene: Phaser.Scene, sp: Species) {
  const key = "wow_bird_" + sp;
  if (scene.textures.exists(key)) return;
  const P = PAL[sp], FW = 11, FH = 9, N = ANG.length + 1;
  const c = document.createElement("canvas"); c.width = FW * N; c.height = FH;
  const g = c.getContext("2d")!;
  const px = (f: number, x: number, y: number, col: string) => { if (x >= 0 && y >= 0 && x < FW && y < FH) { g.fillStyle = col; g.fillRect(f * FW + x, y, 1, 1); } };
  ANG.forEach((deg, f) => {
    const cx = 5, cy = 4, rad = deg * Math.PI / 180;
    for (let side = -1; side <= 1; side += 2) for (let i = 1; i <= 5; i++) { // крыло: от плеча наружу, вверх/вниз по углу
      const x = Math.round(cx + side * i * Math.cos(rad)), y = Math.round(cy + i * Math.sin(rad) * 0.9);
      px(f, x, y, i > 3 ? P.tip : i === 1 ? P.hi : P.wing);
      if (i < 5) px(f, x, y + (deg < 0 ? 1 : -1) * (i < 4 ? 1 : 0), P.wing);
    }
    for (let dx = -1; dx <= 1; dx++) px(f, cx + dx, cy, P.body); px(f, cx, cy + 1, P.body); px(f, cx, cy + 2, P.tip); px(f, cx, cy - 1, P.hi);
    px(f, cx + 2, cy - 1, P.body); px(f, cx + 3, cy - 1, P.beak); px(f, cx + 2, cy - 2, P.hi); px(f, cx - 1, cy + 3, P.tip); px(f, cx, cy + 3, P.wing); px(f, cx + 1, cy + 3, P.tip); // голова справа (флип зеркалит), хвост веером
  });
  const f = ANG.length; // сидит: компактное тело, сложенные крылья, хвост
  for (let dx = -2; dx <= 2; dx++) { px(f, 5 + dx, 5, P.wing); px(f, 5 + dx, 6, P.body); }
  px(f, 4, 4, P.body); px(f, 5, 4, P.body); px(f, 6, 4, P.body); px(f, 7, 3, P.body); px(f, 8, 3, P.beak); px(f, 7, 4, P.hi); px(f, 2, 7, P.tip); px(f, 3, 7, P.tip); px(f, 5, 7, P.tip);
  const tex = scene.textures.addCanvas(key, c)!;
  for (let i = 0; i < N; i++) tex.add(i, 0, i * FW, 0, FW, FH);
}
function makeShadow(scene: Phaser.Scene) {
  if (scene.textures.exists("wow_bird_sh")) return;
  const s = document.createElement("canvas"); s.width = 11; s.height = 5;
  const sg = s.getContext("2d")!; sg.fillStyle = "#000"; sg.fillRect(2, 2, 7, 1); sg.fillRect(4, 1, 3, 3); sg.fillRect(0, 2, 2, 1); sg.fillRect(9, 2, 2, 1);
  scene.textures.addCanvas("wow_bird_sh", s);
}
const SIT = ANG.length;

export class Birds {
  private flocks: Flock[] = [];
  private t = 0;
  private nextAt = 3000;
  constructor(private scene: Phaser.Scene, private o: BirdsOpts) { makeTex(scene, "raven"); makeTex(scene, "gull"); makeShadow(scene); }

  spawn(x: number, y: number, dirX: number, n?: number, roof?: Roof, sp: Species = this.o.species?.() ?? "raven"): Flock {
    const cfg = wowCfg("birds");
    const count = n ?? cfg.minFlock + Math.floor(Math.random() * (cfg.maxFlock - cfg.minFlock + 1));
    const spd = 34 + Math.random() * 14, ang = (Math.random() - 0.5) * 0.3;
    const f: Flock = { birds: [], x, y, vx: Math.cos(ang) * spd * dirX, vy: Math.sin(ang) * spd, h: 26 + Math.random() * 10, state: "fly", t0: this.t, fromX: x, fromY: y, fromH: 30, life: 0, roof };
    const d = this.o.depth ?? 9000;
    for (let i = 0; i < count; i++) {
      const img = this.scene.add.image(x, y, "wow_bird_" + sp, 0).setDepth(d + 1);
      const sh = this.scene.add.image(x, y, "wow_bird_sh").setDepth(this.o.shadowDepth ?? 1).setAlpha(PAL[sp].sh);
      f.birds.push({ sp, img, sh, ox: -i * (5 + Math.random() * 3) * dirX + (Math.random() - 0.5) * 4, oy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (4 + Math.random() * 3), ph: Math.floor(Math.random() * 8), hOff: Math.random() * 3 });
    }
    this.flocks.push(f);
    return f;
  }
  private beginLand(f: Flock) { f.state = "land"; f.t0 = this.t; f.fromX = f.x; f.fromY = f.y; f.fromH = f.h; }

  update(dt: number) {
    dt = Math.min(dt, 100); this.t += dt;
    const scare = this.o.scare(), v = this.o.view();
    if (this.o.auto && this.t > this.nextAt && this.o.isDay() && this.flocks.length < 2) {
      const dir = Math.random() < 0.5 ? 1 : -1, [a, b] = wowCfg("birds").everyMs, roofs = this.o.roofs();
      this.nextAt = this.t + a + Math.random() * (b - a);
      const land = roofs.length && Math.random() < 0.35 ? roofs[Math.floor(Math.random() * roofs.length)] : undefined;
      this.spawn(dir > 0 ? v.x - 20 : v.x + v.w + 20, v.y + 30 + Math.random() * (v.h - 60), dir, undefined, land);
    }
    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const f = this.flocks[i], el = this.t - f.t0;
      f.life += dt;
      if (f.state === "fly" || f.state === "leave") {
        f.x += f.vx * dt / 1000; f.y += f.vy * dt / 1000;
        if (f.state === "leave") f.h = Math.min(32, f.fromH + easeOut(clamp01(el / 1200)) * 30);
        if (f.roof && f.state === "fly" && Math.abs(f.x - f.roof.x) < 90) this.beginLand(f);
      } else if (f.state === "land" && f.roof) {
        const k = clamp01(el / 2400), e = easeInOut(k);
        f.x = f.fromX + (f.roof.x - f.fromX) * e; f.y = f.fromY + (f.roof.y - f.fromY) * e;
        f.h = f.fromH * (1 - easeOut(k));
        if (k >= 1) { f.state = "sit"; f.t0 = this.t; }
      } else if (f.state === "sit") {
        if ((scare && Math.hypot(scare.x - f.x, scare.y - f.y) < 44) || el > 14000) {
          f.state = "leave"; f.t0 = this.t; f.fromH = 2;
          const d = scare ? Math.sign(f.x - scare.x) || 1 : 1; f.vx = 46 * d; f.vy = -6;
        }
      }
      const sitting = f.state === "sit";
      f.birds.forEach((b, j) => {
        const bx = sitting ? f.x + (j - f.birds.length / 2) * 6 : f.x + b.ox, by = sitting ? f.y : f.y + b.oy;
        const h = sitting ? 0 : f.h + b.hOff + Math.sin((this.t + j * 200) / 600) * 1.2;
        const glide = !sitting && ((this.t / 3500 + b.ph * 0.31) % 1) < 0.2; // изредка парят с раскрытыми крыльями
        const fr = sitting ? SIT : glide ? 2 : (Math.floor(this.t / 1000 * 12) + b.ph) % ANG.length;
        const flip = (sitting ? (j % 2 ? -1 : 1) : Math.sign(f.vx || 1)) < 0;
        b.img.setFrame(fr).setPosition(Math.round(bx), Math.round(by - h)).setFlipX(flip);
        b.sh.setPosition(Math.round(bx + h * 0.15), Math.round(by + 2)).setScale(fr === SIT ? 0.6 : 1 - Math.min(0.3, h / 100)).setAlpha(sitting ? 0.12 : PAL[b.sp].sh);
      });
      if (f.state !== "sit" && f.state !== "land" && f.life > 2000 && (f.x < v.x - 60 || f.x > v.x + v.w + 60 || f.y < v.y - 80 || f.y > v.y + v.h + 80)) {
        f.birds.forEach((b) => { b.img.destroy(); b.sh.destroy(); });
        this.flocks.splice(i, 1);
      }
    }
  }
  destroy() { this.flocks.forEach((f) => f.birds.forEach((b) => { b.img.destroy(); b.sh.destroy(); })); this.flocks = []; }
}
