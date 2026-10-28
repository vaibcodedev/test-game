/**
 * Тёплый свет вместо плоских ореолов: все ореолы-картинки glow() (terrain.ts) регистрируются здесь и в режиме «Эффекты: Полные»
 * получают силу по времени суток (днём почти нет, ночью полная), усиление и мягкое мерцание с фазой на огонь. Один атлас кисти fx_glow + ADD,
 * то есть идут одним батчем; PointLight не нужен. Ореол живёт и исчезает вместе с куском карты, невидимые за экраном пропускаются.
 * В «Простых» ничего не трогаем: работает прежний ореол и его твин. Параметры — data/lighting.json.
 *
 * NightMask — тёмная маска мира (RenderTexture): заливка тёмно-фиолетово-коричневым и вырезанные мягкими кистями тёплые круги вокруг ореолов и героя.
 * Полуразмер, перерисовка только при движении камеры/героя или заметном изменении огней, не чаще 20 раз в секунду. Глубина ниже подписей и цифр.
 */
import Phaser from "phaser";
import cfg from "../../../data/lighting.json";
import { nightMaskOn, vfxFull } from "./postfx";

const C = cfg.lights;
interface L { img: Phaser.GameObjects.Image; base: number; s0: number; phase: number; flick: boolean }
const all = new Set<L>();
let wasFull = true;

/** Ореол из glow(): учитываем в свете и в маске; удаляется вместе с картинкой. */
export function trackLight(img: Phaser.GameObjects.Image, scale: number, alpha: number, flick: boolean) {
  const r: L = { img, base: alpha, s0: scale, phase: Math.random() * 6.28, flick };
  all.add(r);
  img.once("destroy", () => all.delete(r));
}

/** k — доля ночи 0..1 (в подземельях и залах 1). Раз в кадр. */
export function updateLights(timeMs: number, k: number, view: Phaser.Geom.Rectangle) {
  const full = vfxFull();
  if (!full) {
    if (wasFull) for (const r of all) if (!r.flick) r.img.setAlpha(r.base).setScale(r.s0); // твин мерцающих вернёт своё сам
    wasFull = false;
    return;
  }
  wasFull = true;
  const day = C.dayMin + (1 - C.dayMin) * k, t = timeMs / 1000 * C.flickerHz;
  for (const r of all) {
    const i = r.img;
    if (!i.active || i.x < view.x - 200 || i.x > view.right + 200 || i.y < view.y - 200 || i.y > view.bottom + 200) continue;
    const f = r.flick ? 1 + C.flickerAmp * (Math.sin(t + r.phase) * 0.6 + Math.sin(t * 2.3 + r.phase * 1.7) * 0.4) : 1;
    i.setAlpha(Math.min(0.95, r.base * C.alphaBoost) * day * f).setScale(r.s0 * C.scaleBoost * (r.flick ? 0.97 + 0.06 * f : 1));
  }
}

export class NightMask {
  private rt?: Phaser.GameObjects.RenderTexture;
  private brush?: Phaser.GameObjects.Image;
  private sig = "";
  private last = 0;
  constructor(private scene: Phaser.Scene) {}
  get active() { return !!this.rt?.visible; }

  update(alpha: number, hero: { x: number; y: number }, heroR: number, heroK: number) {
    const s = this.scene, cam = s.cameras.main;
    // днём (затемнение слабое) — обычный прямоугольник; кисти проявляются плавно по мере наступления ночи
    const ramp = Math.max(0, Math.min(1, (alpha - 0.15) / 0.2));
    const on = nightMaskOn() && vfxFull() && s.sys.game.renderer.type === Phaser.WEBGL && ramp > 0;
    if (!on) { this.rt?.setVisible(false); return; }
    const w = Math.ceil(cam.width / 2), h = Math.ceil(cam.height / 2);
    if (!this.rt) {
      this.rt = s.add.renderTexture(0, 0, w, h).setOrigin(0, 0).setScrollFactor(0).setDepth(1e6 - 45); // ниже подписей, полосок, цифр, пузырей и боевых эффектов
      this.rt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR); // половинное разрешение: без «квадратиков»
      this.brush = s.make.image({ key: "fx_glow", add: false });
    } else if (this.rt.width !== w || this.rt.height !== h) { this.rt.resize(w, h); this.sig = ""; }
    const rt = this.rt, br = this.brush!, z = cam.zoom, v = cam.worldView;
    rt.setVisible(true).setScale(2 / z).setPosition((cam.width - cam.width / z) / 2, (cam.height - cam.height / z) / 2);
    const now = s.time.now;
    if (now - this.last < 50) return;
    const list: number[] = [hero.x, hero.y - 12, heroR, heroK];
    for (const r of all) {
      const i = r.img;
      if (!i.active || !i.visible || i.alpha < 0.03) continue;
      const rad = i.scale * 32 * C.cutScale;
      if (i.x < v.x - rad || i.x > v.right + rad || i.y < v.y - rad || i.y > v.bottom + rad) continue;
      list.push(i.x, i.y, rad, i.alpha * C.cutAlpha);
    }
    // перерисовка, только если сдвинулась камера, герой или огни заметно изменились (подпись — квантованные значения)
    let sg = `${alpha.toFixed(2)}|${Math.round(v.x)},${Math.round(v.y)},${z}`;
    for (let n = 0; n < list.length; n += 4) sg += `|${Math.round(list[n])},${Math.round(list[n + 1])},${Math.round(list[n + 2] / 4)},${Math.round(list[n + 3] * 12)}`;
    if (sg === this.sig) return;
    this.sig = sg; this.last = now;
    rt.fill(PALETTE_NIGHT, Math.min(0.38, alpha * 0.8)); // ночь светлее (просьба пользователя 2026-10-28): мир читается и вне света
    const bw = br.width || 64;
    for (let n = 0; n < list.length; n += 4) {
      const sr = list[n + 2] * z / 2;
      br.setScale((sr * 2) / bw).setAlpha(Math.min(1, list[n + 3] * ramp));
      rt.erase(br, (list[n] - v.x) * z / 2, (list[n + 1] - v.y) * z / 2);
    }
  }
}
/** Тон ночи: тёмно-фиолетово-коричневый из палитры (#140d16), а не синий. */
const PALETTE_NIGHT = 0x140d16;
