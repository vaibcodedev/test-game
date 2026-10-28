/**
 * Дождь и гроза. Расписание — shared/weather.ts (функция от часов, одинакова у всех игроков и на сервере).
 * Капли идут под углом, на земле брызги, на воде круги; в грозу вспышка камеры и через 0,4–1,5 с гром (sfx «thunder»).
 * Дождь только под открытым небом в зонах из data/lighting.json; плавно проявляется и стихает. В «Простых» режимах капель вдвое меньше и нет брызг.
 */
import Phaser from "phaser";
import cfg from "../../../data/lighting.json";
import { T, Zone, type WorldMap } from "../../../shared/map";
import { TILE } from "../../../shared/constants";
import { thunderBetween, weatherAt } from "../../../shared/weather";
import * as sfx from "./sfx";
import { debugFx, vfxFull } from "./postfx";

const W = cfg.weather;

function makeTex(scene: Phaser.Scene) {
  const mk = (key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, w, h)!;
    draw(t.getContext()); t.refresh();
  };
  mk("fx_raindrop", 2, 22, (g) => { const gr = g.createLinearGradient(0, 0, 0, 22); gr.addColorStop(0, "rgba(220,235,255,0)"); gr.addColorStop(0.5, "rgba(225,238,255,0.7)"); gr.addColorStop(1, "rgba(245,250,255,1)"); g.fillStyle = gr; g.fillRect(0, 0, 2, 22); });
  mk("fx_splash", 14, 7, (g) => { g.strokeStyle = "rgba(240,248,255,1)"; g.lineWidth = 1.5; g.beginPath(); g.ellipse(7, 4.5, 5, 2, 0, Math.PI, Math.PI * 2); g.stroke(); g.fillStyle = "#fff"; g.fillRect(6, 1, 2, 2); });
  mk("fx_ripple", 16, 8, (g) => { g.strokeStyle = "rgba(230,240,255,0.9)"; g.lineWidth = 1; g.beginPath(); g.ellipse(8, 4, 6.5, 2.8, 0, 0, Math.PI * 2); g.stroke(); });
}

export class Weather {
  private drops: Phaser.GameObjects.Particles.ParticleEmitter;
  private splash: Phaser.GameObjects.Particles.ParticleEmitter;
  private ripple: Phaser.GameObjects.Particles.ParticleEmitter;
  private cur = 0;
  private lastMs = Date.now();
  private acc = 0;
  /** Тёмная пелена для GameScene: добавляется к затемнению мира. */
  dim = 0;
  /** Сейчас идёт дождь заметной силы (для реплик NPC). */
  onRainStart?: () => void;

  constructor(private scene: Phaser.Scene, private map: WorldMap) {
    makeTex(scene);
    const depth = 1e6 - 14;
    this.drops = scene.add.particles(0, 0, "fx_raindrop", { emitting: false, emitZone: { type: "random", source: new Phaser.Geom.Rectangle(0, 0, 900, 400) } as any, lifespan: 480, speedX: { min: -95, max: -75 }, speedY: { min: 680, max: 780 }, rotate: 7, alpha: { start: 1, end: 0.7 } }).setDepth(depth).setAlpha(0);
    this.splash = scene.add.particles(0, 0, "fx_splash", { emitting: false, lifespan: 320, scale: { start: 0.6, end: 1.5 }, alpha: { start: 1, end: 0 } }).setDepth(depth);
    this.ripple = scene.add.particles(0, 0, "fx_ripple", { emitting: false, lifespan: 800, scale: { start: 0.2, end: 1.3 }, alpha: { start: 0.7, end: 0 } }).setDepth(depth);
  }

  /** Молния: ломаная от верха кадра вниз, белая жила и голубое свечение, гаснет за 0,35 с. */
  private bolt(v: Phaser.Geom.Rectangle) {
    const g = this.scene.add.graphics().setDepth(1e6 - 40).setBlendMode(Phaser.BlendModes.ADD);
    let x = v.x + v.width * (0.2 + Math.random() * 0.6), y = v.y;
    const pts = [{ x, y }], end = v.y + v.height * (0.45 + Math.random() * 0.25);
    while (y < end) { y += 18 + Math.random() * 26; x += (Math.random() - 0.5) * 46; pts.push({ x, y }); }
    for (const [w, a, c] of [[9, 0.3, 0x8ab4ff], [4, 0.6, 0xc8dcff], [2, 1, 0xffffff]] as const) { g.lineStyle(w, c, a); g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (const p of pts) g.lineTo(p.x, p.y); g.strokePath(); }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 350, delay: 60, onComplete: () => g.destroy() });
  }

  update(dt: number, zone: Zone, indoor: boolean) {
    const now = Date.now(), cam = this.scene.cameras.main, v = cam.worldView;
    const ws = debugFx.rain >= 0 ? { rain: debugFx.rain, storm: debugFx.storm } : weatherAt(now);
    const wantZone = !indoor && (W.zones as string[]).includes(Zone[zone]);
    const target = wantZone ? ws.rain : 0;
    const prev = this.cur;
    this.cur += (target - this.cur) * Math.min(1, dt * 0.8);
    if (prev < 0.15 && this.cur >= 0.15) this.onRainStart?.();
    this.dim = this.cur * W.dim;
    if (wantZone && ws.storm) {
      const t = debugFx.thunder ? now : thunderBetween(this.lastMs, now);
      debugFx.thunder = false;
      if (t !== null) {
        cam.flash(W.flashMs, 205, 220, 255, true);
        this.bolt(v);
        const [a, b] = W.thunderDelayMs;
        this.scene.time.delayedCall(a + Math.random() * (b - a), () => sfx.play("thunder", 0.9));
      }
    }
    this.lastMs = now;
    if (this.cur < 0.02) { this.drops.setAlpha(0); this.drops.stop(); return; }
    const k = this.cur * (vfxFull() ? 1 : 0.5);
    this.drops.setPosition(v.x - 120, v.y - 80).setAlpha(Math.min(1, this.cur * 1.5));
    (this.drops.emitZones[0] as any)?.source?.setSize?.(v.width + 240, v.height * 0.5);
    this.drops.frequency = 1000 / (W.maxDrops * k * 6);
    if (!this.drops.emitting) this.drops.start();
    // брызги и круги на земле: случайные точки в кадре, число в секунду пропорционально силе дождя
    if (!vfxFull()) return;
    this.acc += dt * k * 160;
    for (; this.acc >= 1; this.acc -= 1) {
      const x = v.x + Math.random() * v.width, y = v.y + Math.random() * v.height;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) continue;
      if (this.map.vtx[ty * (this.map.w + 1) + tx] === T.Water) this.ripple.emitParticleAt(x, y);
      else this.splash.emitParticleAt(x, y);
    }
  }
}
