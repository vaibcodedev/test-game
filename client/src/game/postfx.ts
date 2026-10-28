/**
 * Встроенные эффекты Phaser 3.90 (WebGL): Bloom (ночью), Displacement (марево над лавой), Glow (боссы), Shine (редкая добыча), hit-stop.
 * Режим «Эффекты» (Полные / Простые, localStorage «vfxMode»): в «Простых» нет Bloom, Displacement, Glow, Shine и PointLight (lights.ts).
 * Параметры — data/lighting.json. Камерные эффекты создаются по требованию и снимаются, когда растаяли: лишних полноэкранных проходов нет.
 */
import Phaser from "phaser";
import cfg from "../../../data/lighting.json";
import { Zone } from "../../../shared/map";

const P = cfg.postfx;
export type VfxMode = "full" | "simple";
let mode: VfxMode = (() => { try { return localStorage.getItem("vfxMode") === "simple" ? "simple" : "full"; } catch { return "full"; } })();
export const vfxMode = (): VfxMode => mode;
export const vfxFull = () => mode === "full";
export function setVfxMode(m: VfxMode) { mode = m; try { localStorage.setItem("vfxMode", m); } catch {} }

/** Ночная маска (lights.ts NightMask): по умолчанию выкл (data/lighting.json → nightMask), пока владелец не одобрил; localStorage «nightMask» = 1/0 переопределяет. */
let maskOn: boolean = (() => { try { const v = localStorage.getItem("nightMask"); if (v === "1" || v === "0") return v === "1"; } catch {} return cfg.nightMask; })();
export const nightMaskOn = () => maskOn;
export function setNightMask(b: boolean) { maskOn = b; try { localStorage.setItem("nightMask", b ? "1" : "0"); } catch {} }
/** Отладка/тесты: принудительные дождь (>=0), смерть и здоровье (>=0). */
export const debugFx = { rain: -1, storm: false, thunder: false, wet: -1, dead: false, hp: -1 };
(window as any).__fx = { debugFx, setNightMask, setVfxMode };

const isGL = (s: Phaser.Scene) => s.sys.game.renderer.type === Phaser.WEBGL;

/** Карта смещения для Displacement: мягкий шум, сгенерированный кодом. */
function ensureNoise(scene: Phaser.Scene): string {
  const key = "fx_disp_noise";
  if (scene.textures.exists(key)) return key;
  const S = 128, tex = scene.textures.createCanvas(key, S, S)!;
  const ctx = tex.getContext(), img = ctx.createImageData(S, S);
  const v = (x: number, y: number, p: number) => Math.sin((x / S) * Math.PI * 2 * p + Math.cos((y / S) * Math.PI * 2 * (p + 1))) * Math.cos((y / S) * Math.PI * 2 * p + 1.3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4, a = 128 + 127 * (v(x, y, 2) * 0.6 + v(x, y, 3) * 0.4), b = 128 + 127 * (v(y, x, 2) * 0.6 + v(y, x, 4) * 0.4);
    img.data[i] = a; img.data[i + 1] = b; img.data[i + 2] = 128; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}

export class PostFx {
  private bloom?: Phaser.FX.Bloom; private bloomK = 0;
  private disp?: Phaser.FX.Displacement; private dispK = 0;
  private t = 0;
  constructor(private scene: Phaser.Scene) {}

  /** Раз в кадр. hpK — доля здоровья героя 0..1, night — 0..1 (на поверхности), zone — стиль зоны. */
  private cm?: Phaser.FX.ColorMatrix; private grayK = 0;
  update(dt: number, hpK: number, night: number, zone: Zone, dead = false) {
    const s = this.scene, cam = s.cameras.main;
    if (!isGL(s)) return;
    this.t += dt;
    if (debugFx.hp >= 0) hpK = debugFx.hp;
    if (debugFx.dead) dead = true;
    const ease = (cur: number, to: number, rate: number) => cur + (to - cur) * Math.min(1, dt * rate);
    // смерть героя: мир сереет за 0,6 с, при воскрешении возвращается (ColorMatrix)
    this.grayK = Math.max(0, Math.min(1, this.grayK + (dead ? dt : -dt) / 0.6));
    if (this.grayK > 0.005) { this.cm ??= cam.postFX.addColorMatrix(); this.cm.reset(); this.cm.grayscale(0.85 * this.grayK, false); this.cm.brightness(1 - 0.18 * this.grayK, true); }
    else if (this.cm) { cam.postFX.remove(this.cm as any); this.cm = undefined; }
    // Bloom: ночью, только в полном режиме
    const wantB = vfxFull() && night > P.bloom.night ? 1 : 0;
    this.bloomK = ease(this.bloomK, wantB, P.bloom.fade);
    if (this.bloomK > 0.02) {
      this.bloom ??= cam.postFX.addBloom(0xffffff, 1, 1, P.bloom.blur, 0, P.bloom.steps);
      this.bloom.strength = P.bloom.strength * this.bloomK;
    } else if (this.bloom) { cam.postFX.remove(this.bloom); this.bloom = undefined; }
    // Displacement: марево в вулканических зонах, только в полном режиме
    const dz = P.displacement.zones.includes(Zone[zone]) ? 1 : 0;
    this.dispK = ease(this.dispK, vfxFull() ? dz : 0, P.displacement.fade);
    if (this.dispK > 0.02) {
      this.disp ??= cam.postFX.addDisplacement(ensureNoise(s), 0, 0);
      this.disp.x = Math.sin(this.t * 0.7) * P.displacement.size * this.dispK * 2 * (P.displacement.speed / 22);
      this.disp.y = Math.cos(this.t * 0.9 + 1) * P.displacement.size * this.dispK * 2 * (P.displacement.speed / 22) + this.t * 0.0;
    } else if (this.disp) { cam.postFX.remove(this.disp); this.disp = undefined; }
  }
}

/** Свечение вокруг босса / портала (preFX.Glow, мягкая пульсация). Только полный режим. */
export function glowOn(go: Phaser.GameObjects.GameObject, color: number = P.glow.boss) {
  const g = go as Phaser.GameObjects.Sprite;
  if (!vfxFull() || !g.preFX || !isGL(g.scene) || g.getData("fxGlow")) return;
  g.setData("fxGlow", true);
  const fx = g.preFX.addGlow(color, 0, 0, false, P.glow.quality, P.glow.distance);
  g.scene.tweens.add({ targets: fx, outerStrength: P.glow.outer, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
}

/** Блик на редкой добыче (preFX.Shine). */
export function shineOn(go: Phaser.GameObjects.GameObject, rarity: number) {
  const g = go as Phaser.GameObjects.Sprite;
  if (!vfxFull() || rarity < P.shine.minRarity || !g.preFX || !isGL(g.scene)) return;
  g.preFX.addShine(P.shine.speed, P.shine.lineWidth, P.shine.gradient);
}

let stopped = false;
/** Стоп-кадр: анимации и твины почти замирают на 50–70 мс реального времени. */
export function hitStop(scene: Phaser.Scene, ms: number = P.hitStopMs) {
  if (stopped) return;
  stopped = true;
  const set = (k: number) => { scene.tweens.timeScale = k; scene.anims.globalTimeScale = k; scene.time.timeScale = k; };
  set(0.04);
  window.setTimeout(() => { set(1); stopped = false; }, ms);
}
