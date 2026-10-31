/**
 * Заточка героя Б — вариант D «тлеющий клинок» (docs/art/gear.md §5, data/gear-fx.json → enchantB). Только оружие и щит: контур видимого оружия
 * по кадрам листа (heroB.ts enchantTex: слои weapon@ любой вещи gear147 — без ручной работы на предмет), 1–2 px снаружи силуэта, без заливки.
 * 1 «Тление» (+5) — дыхание альфы; 2 «Угли» (+8) — золотой контур, бегущий блик (полоса копии контура), шлейф удара; 3 «Пламя Предела» (+11) — перелив
 * алого и золота, 2–3 уголька, ночью мягкий ореол (второе кольцо, не закрывает героя). Всё плавно: easing, кадры анимации героя (12–16 к/с).
 */
import Phaser from "phaser";
import { ENCHANT_B, enchantTierB } from "../../../shared/gearFx";
import type { HbSheet } from "./heroB";

type Tier = { color?: string; color2?: string; core?: string; alpha?: number; alphaMin?: number; alphaMax?: number; periodMs?: number; shineMs?: number; cycleMs?: number; embers?: number; emberMs?: number; haloNight?: number; trail?: { frames: number; alpha: number } };
const TIERS = ENCHANT_B.tiers as Tier[];
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
const mix = (a: number, b: number, t: number) => {
  const A = Phaser.Display.Color.IntegerToColor(a), B = Phaser.Display.Color.IntegerToColor(b);
  return Phaser.Display.Color.GetColor(Math.round(A.red + (B.red - A.red) * t), Math.round(A.green + (B.green - A.green) * t), Math.round(A.blue + (B.blue - A.blue) * t));
};
const ease = (t: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * t);

/** Плюс заточки оружия из строки u.weapon («база:редкость:плюс:…», shared/transmog.ts gearStrings). */
export const weaponPlus = (weapon: string) => Number((weapon || "").split(":")[2]) || 0;

export class HeroEnchant {
  private s1?: Phaser.GameObjects.Sprite;
  private s2?: Phaser.GameObjects.Sprite;
  /** бегущий блик: копия контура цветом core, видна полоса 4 px (setCrop), проходит по кадру сверху вниз раз в shineMs */
  private s3?: Phaser.GameObjects.Sprite;
  private lastFr = -1;
  private emberAt = 0;
  private embers = 0;
  tier = 0;
  constructor(private scene: Phaser.Scene) {}

  /** Каждый кадр после спрайта героя: show — по настройке «Свечение заточки», night 0..1, attack — идёт анимация удара. */
  update(sp: Phaser.GameObjects.Sprite, sh: HbSheet | null, plus: number, show: boolean, night: number, attack: boolean) {
    const e = sh?.ench, tier = e && show && sp.visible ? enchantTierB(plus) : 0;
    if (!e || !tier) { this.hide(); return; }
    const d = TIERS[tier], now = this.scene.time.now, fr = Number(sp.frame.name) || 0;
    const place = (s: Phaser.GameObjects.Sprite, key: string, dz: number) => {
      if (s.texture.key !== key) s.setTexture(key, fr);
      return s.setFrame(fr).setPosition(sp.x, sp.y).setOrigin(sp.originX, sp.originY).setFlipX(sp.flipX).setDepth(sp.depth + dz).setVisible(true);
    };
    const s1 = place(this.s1 ??= this.scene.add.sprite(sp.x, sp.y, e.k1, fr), e.k1, 0.02);
    this.tier = tier;
    // бегущий блик «Углей» и «Пламени»: полоса по контуру сверху вниз за 450 мс (easing), раз в shineMs
    const ph = (now % (d.shineMs ?? 2500)) / 450;
    if (tier >= 2 && ph < 1) {
      const F = sp.frame.height, y = Math.round(-4 + (F * 0.75 + 4) * (ph * ph * (3 - 2 * ph)));
      place(this.s3 ??= this.scene.add.sprite(sp.x, sp.y, e.k1, fr), e.k1, 0.025).setTint(hex(d.core ?? "#ffffff")).setAlpha(0.9).setBlendMode(Phaser.BlendModes.ADD).setCrop(0, y, sp.frame.width, 4);
    } else this.s3?.setVisible(false);
    if (tier === 1) s1.setTint(hex(d.color!)).setAlpha(d.alphaMin! + (d.alphaMax! - d.alphaMin!) * ease(now / d.periodMs!)).setBlendMode(Phaser.BlendModes.NORMAL);
    else if (tier === 2) s1.setTint(hex(d.color!)).setAlpha(d.alpha! * (0.85 + 0.15 * ease(now / 2400))).setBlendMode(Phaser.BlendModes.NORMAL);
    else s1.setTint(mix(hex(d.color!), hex(d.color2!), ease(now / d.cycleMs!))).setAlpha(d.alpha!).setBlendMode(Phaser.BlendModes.NORMAL);
    // ореол «Пламени» ночью: второе кольцо, мягко (ADD), не заливает героя
    if (tier === 3 && night > 0.05) place(this.s2 ??= this.scene.add.sprite(sp.x, sp.y, e.k2, fr), e.k2, 0.01).setTint(hex(d.color2!)).setAlpha((d.haloNight ?? 0.3) * night * (0.8 + 0.2 * ease(now / d.cycleMs!))).setBlendMode(Phaser.BlendModes.ADD);
    else this.s2?.setVisible(false);
    // шлейф удара: контур прошлых кадров удара гаснет за trail.frames кадров (easing)
    if (d.trail && attack && fr !== this.lastFr && this.lastFr >= 0) {
      const g = this.scene.add.image(sp.x, sp.y, e.k1, this.lastFr).setOrigin(sp.originX, sp.originY).setFlipX(sp.flipX).setDepth(sp.depth + 0.015)
        .setTint(hex(d.core ?? d.color!)).setAlpha(d.trail.alpha).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({ targets: g, alpha: 0, duration: (d.trail.frames * 1000) / 16, ease: "Quad.easeOut", onComplete: () => g.destroy() });
    }
    this.lastFr = fr;
    // угольки «Пламени»: 2–3 точки по 1 px с контура клинка, поднимаются и гаснут
    if (tier === 3 && d.embers && this.embers < d.embers && now >= this.emberAt) {
      const p = e.pts.get(fr);
      if (p && p.length >= 2) {
        const k = 2 * Math.floor(Math.random() * (p.length / 2)), F = sp.frame.width, lx = sp.flipX ? F - 1 - p[k] : p[k];
        const x = sp.x - sp.originX * F + lx + 0.5, y = sp.y - sp.originY * F + p[k + 1] + 0.5;
        const r = this.scene.add.rectangle(x, y, 1, 1, mix(hex(d.color!), hex(d.color2!), Math.random())).setDepth(sp.depth + 0.03).setBlendMode(Phaser.BlendModes.ADD);
        this.embers++;
        this.scene.tweens.add({ targets: r, y: y - 5 - Math.random() * 3, x: x + (Math.random() - 0.5) * 3, alpha: { from: 1, to: 0 }, duration: d.emberMs ?? 900, ease: "Sine.easeOut", onComplete: () => { r.destroy(); this.embers--; } });
      }
      this.emberAt = now + (d.emberMs ?? 900) / d.embers;
    }
  }
  hide() { this.s1?.setVisible(false); this.s2?.setVisible(false); this.s3?.setVisible(false); this.lastFr = -1; }
  destroy() { this.s1?.destroy(); this.s2?.destroy(); this.s3?.destroy(); this.s1 = this.s2 = this.s3 = undefined; }
}
