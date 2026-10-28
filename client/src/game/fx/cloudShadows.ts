/**
 * Тени облаков (эффект 5): редкие очень мягкие тёмные пятна медленно плывут по земле. Только днём и на открытой местности
 * (isOpen), альфа каждого ≤ alphaMax (0,12 в json). Плотность: "sparse" — 1–2 пятна на экран, "denser" — 3–5; в дождь пятен больше и они темнее (в пределах альфы).
 * Пятно — один мягкий спрайт (текстура 64x40 рисуется кодом, масштабируется линейно), 1 draw call на пятно.
 */
import Phaser from "phaser";
import { clamp01, wind, wowCfg } from "./config";

export type CloudDensity = "sparse" | "denser";
interface Cloud { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; w: number; a: number; age: number; life: number }

function makeTex(scene: Phaser.Scene) {
  for (let v = 0; v < 3; v++) {
    const key = "wow_cloud" + v;
    if (scene.textures.exists(key)) continue;
    const W = 128, H = 80, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    // 4–6 пересекающихся радиальных пятен: неровный, но очень мягкий край
    let seed = 7 + v * 31; const r = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const n = 7 + v * 2;
    for (let i = 0; i < n; i++) {
      const x = W * (0.25 + 0.5 * r()), y = H * (0.3 + 0.4 * r()), rad = H * (0.32 + 0.22 * r());
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, "rgba(255,255,255,0.42)"); gr.addColorStop(0.35, "rgba(255,255,255,0.26)"); gr.addColorStop(0.7, "rgba(255,255,255,0.08)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    const t = scene.textures.addCanvas(key, c)!;
    t.setFilter(Phaser.Textures.FilterMode.LINEAR); // мягкое пятно: сглаживание здесь нужно, пикселей в нём нет
  }
}

export class CloudShadows {
  private clouds: Cloud[] = [];
  private t = 0;
  constructor(private scene: Phaser.Scene, private o: {
    view: () => { x: number; y: number; w: number; h: number };
    isDay: () => number;           // 0..1 — освещённость дня (ночью 0)
    isOpen: (x: number, y: number) => boolean;
    rain: () => number;            // 0..1
    density: () => CloudDensity;
    depth?: number;
  }) { makeTex(scene); }

  update(dt: number) {
    dt = Math.min(dt, 100); this.t += dt;
    const v = this.o.view(), day = this.o.isDay(), rain = this.o.rain();
    const cfg = wowCfg("cloudShadows"), amax = cfg.alphaMax;
    const per = this.o.density() === "sparse" ? 1.5 : 4;                 // пятен на экран
    const target = day > 0.3 ? Math.round(per * (1 + rain * 0.8)) : 0;
    const wnd = wind(this.t);
    if (this.clouds.length < target && Math.random() < dt / 700) this.spawn(v, rain, amax);
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.age += dt; c.x += c.vx * (0.7 + wnd.s * 0.6) * dt / 1000; c.y += c.vy * dt / 1000;
      const k = c.age / c.life, fade = Math.min(clamp01(k / 0.2), clamp01((1 - k) / 0.2));        // мягкое появление и исчезновение
      const open = this.o.isOpen(c.x, c.y) ? 1 : 0;                                              // над стенами и подземельем гаснет
      const cur = (c.img.alpha ?? 0), goal = c.a * fade * clamp01(day) * open;
      c.img.setAlpha(cur + (goal - cur) * Math.min(1, dt / 400));
      c.img.setPosition(Math.round(c.x), Math.round(c.y));
      if (k >= 1 || c.x > v.x + v.w + c.w || c.x < v.x - c.w * 2.5) { c.img.destroy(); this.clouds.splice(i, 1); }
    }
  }
  private spawn(v: { x: number; y: number; w: number; h: number }, rain: number, amax: number) {
    const w = 130 + Math.random() * 130, h = w * 0.6;
    const x = v.x - w * 0.6 + Math.random() * (v.w + w), y = v.y + Math.random() * v.h;
    const img = this.scene.add.image(x, y, "wow_cloud" + Math.floor(Math.random() * 3)).setTint(0x04060c).setAlpha(0).setDisplaySize(w, h).setDepth(this.o.depth ?? 5);
    this.clouds.push({ img, x, y, vx: 4 + Math.random() * 3, vy: 1.5 + Math.random() * 1.5, w, a: Math.min(amax, 0.06 + Math.random() * 0.03 + rain * 0.03), age: 0, life: 70000 + Math.random() * 40000 });
  }
  /** Для превью: сразу расставить n пятен по экрану. */
  fill(n: number, rain = 0) {
    const v = this.o.view();
    for (let i = 0; i < n; i++) { this.spawn(v, rain, wowCfg("cloudShadows").alphaMax); const c = this.clouds[this.clouds.length - 1]; c.x = v.x + (i + 0.5) * v.w / n + (Math.random() - 0.5) * 40; c.y = v.y + 20 + Math.random() * (v.h - 40); c.age = c.life * 0.4; c.img.setAlpha(c.a); }
  }
  get count() { return this.clouds.length; }
  destroy() { this.clouds.forEach((c) => c.img.destroy()); this.clouds = []; }
}
