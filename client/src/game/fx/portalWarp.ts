/**
 * Переход экрана через портал (эффект 4): камеру стягивает линзой (postFX Barrel), она рассыпается пикселями (Pixelate),
 * поверх — вихрь искр цвета камня телепорта, затягивающийся к центру, и вспышка; на выходе всё разворачивается обратно.
 * warpOut(scene, atClosed, opts) — при телепорте / входе в подземелье (atClosed — в точке «экран закрыт»); warpIn(scene) — на новом месте.
 * opts.sound — вызывается один раз при старте (в игре — sfx). Эффекты снимаются с камеры по окончании, чужие postFX не трогаем.
 */
import Phaser from "phaser";
import { clamp01, easeInOut, easeOut, wowCfg } from "./config";

export interface WarpOpts { color?: number; color2?: number; sound?: () => void; ms?: number }
const N = 64;
interface St { barrel?: Phaser.FX.Barrel; pix?: Phaser.FX.Pixelate; flash?: Phaser.GameObjects.Rectangle; sparks: Phaser.GameObjects.Image[]; ph: number[]; k: number; col: number; col2: number }
const states = new WeakMap<Phaser.Scene, St>();

function sparkTex(scene: Phaser.Scene) {
  if (scene.textures.exists("wow_warp_spark")) return;
  const c = document.createElement("canvas"); c.width = 9; c.height = 9;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(4.5, 4.5, 0, 4.5, 4.5, 4.5); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 9, 9); g.fillStyle = "#fff"; g.fillRect(4, 4, 1, 1);
  scene.textures.addCanvas("wow_warp_spark", c);
}
function ensure(scene: Phaser.Scene, o: WarpOpts = {}): St {
  let st = states.get(scene);
  if (!st) { st = { sparks: [], ph: [], k: 0, col: o.color ?? 0x8fd0ff, col2: o.color2 ?? 0xc4a4ff }; states.set(scene, st); }
  if (o.color !== undefined) { st.col = o.color; st.col2 = o.color2 ?? st.col2; }
  const cam = scene.cameras.main;
  st.barrel ??= cam.postFX.addBarrel(1);
  st.pix ??= cam.postFX.addPixelate(-1);
  st.flash ??= scene.add.rectangle(cam.width / 2, cam.height / 2, cam.width / cam.zoom + 4, cam.height / cam.zoom + 4, 0xffffff).setScrollFactor(0).setDepth(30000).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
  if (!st.sparks.length) {
    sparkTex(scene);
    for (let i = 0; i < N; i++) { st.sparks.push(scene.add.image(cam.width / 2, cam.height / 2, "wow_warp_spark").setScrollFactor(0).setDepth(30001).setBlendMode(Phaser.BlendModes.ADD).setVisible(false)); st.ph.push(Math.random()); }
  }
  return st;
}
function apply(scene: Phaser.Scene, st: St, k: number) {
  // k 0..1: 0 — обычный экран, 1 — «точка»: линза 1 → 0,25 и пиксели 0 → 28
  st.k = k;
  const cam = scene.cameras.main, cx = cam.width / 2, cy = cam.height / 2, R = Math.min(cam.width, cam.height) / cam.zoom * 0.5;
  if (st.barrel) st.barrel.amount = 1 - 0.75 * easeInOut(k);
  if (st.pix) st.pix.amount = k < 0.05 ? -1 : 1 + 27 * k * k;
  if (st.flash) { st.flash.setFillStyle(st.col2, 1).setAlpha(Math.max(0, (k - 0.78) / 0.22) * 0.8); }
  // вихрь: спираль, радиус сжимается к центру, угол растёт; искры сначала растут, у самого центра гаснут
  const t = performance.now() / 1000;
  st.sparks.forEach((sp, i) => {
    const ph = st.ph[i], arm = (i % 3) / 3, rr = (1 - easeOut(clamp01(k * 1.05))) * R * (0.35 + 0.65 * ph) + 3;
    const ang = arm * Math.PI * 2 + k * 9 + ph * 6.28 + t * 1.5;
    const vis = k > 0.03;
    sp.setVisible(vis).setPosition(cx + Math.cos(ang) * rr * 1.1, cy + Math.sin(ang) * rr * 0.8)
      .setTint(i % 2 ? st.col : st.col2).setRotation(ang + Math.PI / 2 + 0.4).setScale((0.5 + 0.7 * (1 - ph)) * (0.8 + 0.5 * Math.sin(t * 8 + i)) * 2.4, (0.5 + 0.7 * (1 - ph)) * (i % 3 === 0 ? 7 : 2.6)).setAlpha(Math.min(1, k * 3) * (1 - clamp01((k - 0.85) / 0.15)));
  });
}
function clear(scene: Phaser.Scene) {
  const st = states.get(scene); if (!st) return;
  const cam = scene.cameras.main;
  if (st.barrel) cam.postFX.remove(st.barrel);
  if (st.pix) cam.postFX.remove(st.pix);
  st.flash?.destroy(); st.sparks.forEach((s) => s.destroy());
  states.delete(scene);
}
function run(scene: Phaser.Scene, from: number, to: number, ms: number, ease: (t: number) => number, o: WarpOpts, done?: () => void) {
  const st = ensure(scene, o), v = { t: 0 };
  apply(scene, st, from);
  scene.tweens.add({ targets: v, t: 1, duration: ms, ease: "Linear", onUpdate: () => apply(scene, st, from + (to - from) * ease(clamp01(v.t))), onComplete: () => { apply(scene, st, to); done?.(); } });
}
export function warpOut(scene: Phaser.Scene, atClosed?: () => void, o: WarpOpts = {}) {
  o.sound?.();
  run(scene, 0, 1, o.ms ?? wowCfg("portalWarp").outMs, (t) => t * t, o, atClosed);
}
export function warpIn(scene: Phaser.Scene, o: WarpOpts = {}) {
  run(scene, 1, 0, o.ms ?? wowCfg("portalWarp").inMs, easeOut, o, () => clear(scene));
}
/** Для превью: выставить кадр k вручную. */
export function warpFrame(scene: Phaser.Scene, k: number) { apply(scene, ensure(scene), k); }
export function warpClear(scene: Phaser.Scene) { clear(scene); }
