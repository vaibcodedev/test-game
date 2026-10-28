/**
 * Души и золото летят к герою (эффект 8). От убитого моба: золото — монетки дугой (подброс, падают, затем быстро к герою с ускорением),
 * души — светящиеся искры со следом, плавно разгоняются к герою по кривой. Цель — живая позиция героя (идёт, пока летит),
 * так что при беге ничего не мажет. Считается руками в update (Phaser-эмиттер moveTo берёт точку один раз при выпуске и героя на ходу теряет).
 * На подлёте — короткая вспышка на герое.
 */
import Phaser from "phaser";
import { clamp01, easeOut } from "./config";

interface P { gl?: Phaser.GameObjects.Image; img: Phaser.GameObjects.Image; trail: Phaser.GameObjects.Image[]; kind: "coin" | "soul"; x0: number; y0: number; cx: number; cy: number; t0: number; delay: number; ms: number; hist: { x: number; y: number }[]; sx: number; sy: number; phase: number; done: boolean }

function makeTex(scene: Phaser.Scene) {
  if (scene.textures.exists("wow_coin")) return;
  const c = document.createElement("canvas"); c.width = 4 * 5; c.height = 5;
  const g = c.getContext("2d")!;
  // 4 кадра вращения монетки 5x5: ребро – анфас – ребро – анфас с бликом
  const fr = [[[2, 0, 1, 5]], [[1, 0, 3, 5]], [[0, 0, 5, 5]], [[1, 0, 3, 5]]];
  fr.forEach((rs, f) => {
    rs.forEach(([x, y, w, h]) => { g.fillStyle = "#e0a820"; g.fillRect(f * 5 + x, y, w, h); });
    g.fillStyle = "#fff0a0"; g.fillRect(f * 5 + (f === 2 ? 1 : 2), 1, 1, 1);
    g.fillStyle = "#a06a10"; g.fillRect(f * 5 + (f === 2 ? 3 : 2), 3, 1, 1);
  });
  const tx = scene.textures.addCanvas("wow_coin", c)!;
  for (let f = 0; f < 4; f++) tx.add(f, 0, f * 5, 0, 5, 5);
  const s = document.createElement("canvas"); s.width = 7; s.height = 7;
  const sg = s.getContext("2d")!;
  const gr = sg.createRadialGradient(3.5, 3.5, 0, 3.5, 3.5, 3.5); gr.addColorStop(0, "rgba(255,236,190,1)"); gr.addColorStop(0.35, "rgba(255,168,70,0.9)"); gr.addColorStop(1, "rgba(190,70,20,0)");
  sg.fillStyle = gr; sg.fillRect(0, 0, 7, 7); sg.fillStyle = "#fff0c8"; sg.fillRect(3, 3, 1, 1);
  scene.textures.addCanvas("wow_soul", s);
  const gl = document.createElement("canvas"); gl.width = 7; gl.height = 7; const gg = gl.getContext("2d")!; gg.fillStyle = "#fff6c0"; gg.fillRect(3, 0, 1, 7); gg.fillRect(0, 3, 7, 1); gg.fillStyle = "#fff"; gg.fillRect(3, 3, 1, 1);
  scene.textures.addCanvas("wow_glint", gl);
}

export class PickupFly {
  private ps: P[] = [];
  private t = 0;
  private flashes: { img: Phaser.GameObjects.Image; age: number }[] = [];
  constructor(private scene: Phaser.Scene, private hero: () => { x: number; y: number }, private depth = 9400) { makeTex(scene); }

  gold(x: number, y: number, n = 6) {
    for (let i = 0; i < n; i++) this.add("coin", x, y, i * 55, 520 + Math.random() * 160, i);
  }
  souls(x: number, y: number, n = 5) {
    for (let i = 0; i < n; i++) this.add("soul", x, y, 120 + i * 70, 760 + Math.random() * 240, i);
  }
  private add(kind: "coin" | "soul", x: number, y: number, delay: number, ms: number, i: number) {
    const icon = kind === "coin" && this.scene.textures.exists("coin_icon"); // настоящая иконка золота игры
    const img = this.scene.add.image(x, y, kind === "coin" ? (icon ? "coin_icon" : "wow_coin") : "wow_soul", kind === "coin" && !icon ? 0 : undefined).setDepth(this.depth).setVisible(false);
    if (icon) img.setDisplaySize(8, 8);
    const gl = kind === "coin" ? this.scene.add.image(x, y, "wow_glint").setDepth(this.depth + 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setAlpha(0) : undefined;
    if (kind === "soul") img.setBlendMode(Phaser.BlendModes.ADD);
    const trail: Phaser.GameObjects.Image[] = [];
    if (kind === "soul") for (let k = 0; k < 5; k++) trail.push(this.scene.add.image(x, y, "wow_soul").setDepth(this.depth - 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    this.ps.push({ gl, img, trail, kind, x0: x, y0: y, cx: 0, cy: 0, t0: this.t, delay, ms, hist: [], sx: Math.cos(a) * (kind === "coin" ? 26 + Math.random() * 20 : 14), sy: Math.sin(a) * (kind === "coin" ? 40 + Math.random() * 18 : 18), phase: i, done: false });
  }
  update(dt: number) {
    dt = Math.min(dt, 100); this.t += dt;
    const h = this.hero();
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i], el = this.t - p.t0 - p.delay;
      if (el < 0) continue;
      p.img.setVisible(true);
      const burst = p.kind === "coin" ? 260 : 180;
      let x: number, y: number;
      if (el < burst) { // подброс по параболе (монета падает с гравитацией, душа всплывает)
        const s = el / 1000, g = p.kind === "coin" ? 260 : 0;
        x = p.x0 + p.sx * s; y = p.y0 + p.sy * s + 0.5 * g * s * s; p.cx = x; p.cy = y;
      } else { // полёт к герою: ускорение (ease-in) + боковая дуга, цель — живая
        const k = clamp01((el - burst) / p.ms), e = k * k * (p.kind === "coin" ? 1 : (3 - 2 * k));
        const tx = h.x, ty = h.y - 10;
        const bend = Math.sin(e * Math.PI) * (p.kind === "coin" ? 10 : 16) * (p.phase % 2 ? 1 : -1);
        const dx = tx - p.cx, dy = ty - p.cy, len = Math.hypot(dx, dy) || 1;
        x = p.cx + dx * e + (-dy / len) * bend; y = p.cy + dy * e + (dx / len) * bend;
        if (k >= 1) { this.pulse(h.x, h.y - 10, p.kind); p.img.destroy(); p.gl?.destroy(); p.trail.forEach((t) => t.destroy()); this.ps.splice(i, 1); continue; }
      }
      p.img.setPosition(Math.round(x), Math.round(y));
      if (p.kind === "coin") {
        if (p.img.texture.key === "wow_coin") p.img.setFrame(Math.floor(this.t / 1000 * 12 + p.phase) % 4);
        else p.img.setScale(Math.abs(Math.cos(this.t / 120 + p.phase)) * 0.5 + 0.5, 1).setDisplaySize(8 * (Math.abs(Math.cos(this.t / 120 + p.phase)) * 0.6 + 0.4), 8); // вращение вокруг вертикали
        const gk = (this.t / 260 + p.phase * 0.37) % 1; // блеск раз в ~0,26 с у части монет
        p.gl?.setVisible(true).setPosition(Math.round(x) + 1, Math.round(y) - 1).setAlpha(gk < 0.18 ? 1 - gk / 0.18 : 0).setScale(0.7);
      }
      else {
        p.img.setScale(1 + 0.25 * Math.sin(this.t / 70 + p.phase));
        p.hist.unshift({ x, y }); if (p.hist.length > 12) p.hist.pop();
        p.trail.forEach((tr, k) => { const hp = p.hist[(k + 1) * 2] ?? p.hist[p.hist.length - 1]; tr.setVisible(true).setPosition(Math.round(hp.x), Math.round(hp.y)).setAlpha(0.5 - k * 0.09).setTint(k < 2 ? 0xffa850 : 0xa06a40).setScale(0.9 - k * 0.14); });
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]; f.age += dt; const k = f.age / 220;
      f.img.setAlpha(0.8 * (1 - k)).setScale(0.8 + 1.4 * easeOut(clamp01(k)));
      if (k >= 1) { f.img.destroy(); this.flashes.splice(i, 1); }
    }
  }
  private pulse(x: number, y: number, kind: "coin" | "soul") {
    if (this.flashes.length > 12) return;
    const img = this.scene.add.image(Math.round(x), Math.round(y), "wow_soul").setDepth(this.depth + 1).setBlendMode(Phaser.BlendModes.ADD).setTint(kind === "coin" ? 0xffd860 : 0xff9a40);
    this.flashes.push({ img, age: 0 });
  }
  get count() { return this.ps.length; }
  destroy() { this.ps.forEach((p) => { p.img.destroy(); p.gl?.destroy(); p.gl?.destroy(); p.trail.forEach((t) => t.destroy()); }); this.flashes.forEach((f) => f.img.destroy()); this.ps = []; this.flashes = []; }
}
