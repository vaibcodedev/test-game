/**
 * Заточка героя Б — вариант D «тлеющий клинок», рост внутри ступени — «середина» (утверждена владельцем 2026-10-31; docs/art/gear.md §5).
 * Только оружие и щит: кольца снаружи видимого силуэта оружия по кадрам листа (heroB.ts enchantTex: слои weapon@ / offhand@ любой вещи gear147).
 * Вид на уровне — shared/gearFx.ts enchantLookB (тот же источник чисел, что проба tools/gen/enchant-fx/steps.ts; data/gear-fx.json enchantB):
 * контур 1 px (тёмная прослойка 1 px — только на красном оружии), +5 «Тление» — дыхание альфы, +8 «Угли» — золото и бегущий блик, +11 «Пламя» — алый↔золото,
 * на +11…+15 снаружи мягкое полупрозрачное свечение 1–2 px, угольки и 1–3 искры; внутри ступени каждый +1 ярче, чаще блик, сильнее перелив.
 * Одинаково на любом оружии любой редкости — от оружия зависит только светлота цвета (контраст); без белого. Ночью то же (контур чуть ярче).
 */
import Phaser from "phaser";
import { enchantLookB } from "../../../shared/gearFx";
import type { HbSheet } from "./heroB";

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
const mix = (a: number, b: number, t: number) => {
  const A = Phaser.Display.Color.IntegerToColor(a), B = Phaser.Display.Color.IntegerToColor(b);
  return Phaser.Display.Color.GetColor(Math.round(A.red + (B.red - A.red) * t), Math.round(A.green + (B.green - A.green) * t), Math.round(A.blue + (B.blue - A.blue) * t));
};
const ease = (t: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * t);

/** Плюс заточки оружия из строки u.weapon («база:редкость:плюс:…», shared/transmog.ts gearStrings). */
export const weaponPlus = (weapon: string) => Number((weapon || "").split(":")[2]) || 0;

type Sp = Phaser.GameObjects.Sprite;
export class HeroEnchant {
  /** gap — тёмная прослойка, main — контур, g1/g2 — мягкое свечение снаружи, shine — бегущий блик */
  private sp: Partial<Record<"gap" | "main" | "g1" | "g2" | "shine", Sp>> = {};
  private lastFr = -1;
  /** текущий след удара (не больше одного: копии нескольких кадров складывались в «паутину») */
  private ghost?: Phaser.GameObjects.Image;
  private emberAt = 0;
  private sparkAt = 0;
  private live = 0;
  tier = 0;
  /** which — чей контур: ench — оружие, enchOff — щит (вторая рука, своя заточка) */
  constructor(private scene: Phaser.Scene, private which: "ench" | "enchOff" = "ench") {}

  /** Каждый кадр после спрайта героя: show — по настройке «Свечение заточки», night 0..1, attack — идёт анимация удара. */
  update(sp: Sp, sh: HbSheet | null, plus: number, show: boolean, night: number, attack: boolean) {
    const e = sh?.[this.which], L = e && show && sp.visible ? enchantLookB(plus, e.avg) : null;
    if (!e || !L) { this.hide(); return; }
    const now = this.scene.time.now, fr = Number(sp.frame.name) || 0, r0 = L.gapAlpha > 0 ? 1 : 0; // кольцо контура (0 — вплотную, 1 — через прослойку)
    this.tier = L.tier;
    const place = (name: keyof HeroEnchant["sp"], ring: number, dz: number) => {
      const key = e.rings[Math.min(ring, e.rings.length - 1)];
      const s = (this.sp[name] ??= this.scene.add.sprite(sp.x, sp.y, key, fr));
      if (s.texture.key !== key) s.setTexture(key, fr);
      return s.setFrame(fr).setPosition(sp.x, sp.y).setOrigin(sp.originX, sp.originY).setFlipX(sp.flipX).setDepth(sp.depth + dz).setVisible(true).setBlendMode(Phaser.BlendModes.NORMAL);
    };
    // цвет и альфа контура по ступени
    const c1 = hex(L.color), c2 = hex(L.color2 ?? L.color);
    let col = c1, al = L.alpha;
    if (L.tier === 1) al = (L.alphaMin ?? 0.3) + ((L.alphaMax ?? 0.6) - (L.alphaMin ?? 0.3)) * ease(now / (L.periodMs ?? 2400));
    if (L.tier === 2) al = L.alpha * (0.85 + 0.15 * ease(now / 2400));
    if (L.tier === 3) col = mix(c1, c2, Math.min(1, Math.max(0, 0.5 + L.flowBias + 0.5 * L.swing * Math.sin((2 * Math.PI * now) / L.cycleMs))));
    al = Math.min(1, al + 0.15 * night);
    if (r0) place("gap", 0, 0.018).setTint(hex(L.gap)).setAlpha(L.gapAlpha); else this.sp.gap?.setVisible(false);
    place("main", r0, 0.02).setTint(col).setAlpha(al);
    // мягкое свечение снаружи контура (+11…+15): полупрозрачное, внешний пиксель слабее — героя не закрывает
    const gk = 0.85 + 0.15 * ease(now / L.cycleMs);
    if (L.glowW >= 1) place("g1", r0 + 1, 0.019).setTint(col).setAlpha(L.glowA * gk); else this.sp.g1?.setVisible(false);
    if (L.glowW >= 2) place("g2", r0 + 2, 0.0185).setTint(col).setAlpha(L.glowA * 0.5 * gk); else this.sp.g2?.setVisible(false);
    // без свечения у «Пламени» — мягкий ночной ореол (кольцо снаружи, ADD)
    if (!L.glowW && L.tier === 3 && night > 0.05) place("g1", r0 + 1, 0.019).setTint(c2).setAlpha(L.haloNight * night).setBlendMode(Phaser.BlendModes.ADD);
    // бегущий блик по контуру сверху вниз за 450 мс раз в shineMs (цвет — золото ступени, без белого)
    const ph = L.shineMs > 0 ? (now % L.shineMs) / 450 : 1;
    if (ph < 1) {
      const F = sp.frame.height, y = Math.round(-4 + (F * 0.75 + 4) * (ph * ph * (3 - 2 * ph)));
      place("shine", r0, 0.025).setTint(hex(L.core ?? L.color)).setAlpha(0.9).setBlendMode(Phaser.BlendModes.ADD).setCrop(0, y, sp.frame.width, 4);
    } else this.sp.shine?.setVisible(false);
    // след удара: контур прошлого кадра удара гаснет за trail.frames кадров (один за раз)
    if (L.trail && attack && fr !== this.lastFr && this.lastFr >= 0) {
      this.ghost?.destroy();
      const g = (this.ghost = this.scene.add.image(sp.x, sp.y, e.rings[r0], this.lastFr).setOrigin(sp.originX, sp.originY).setFlipX(sp.flipX).setDepth(sp.depth + 0.015)
        .setTint(col).setAlpha(L.trail.alpha).setBlendMode(Phaser.BlendModes.ADD));
      this.scene.tweens.add({ targets: g, alpha: 0, duration: (L.trail.frames * 1000) / 16, ease: "Quad.easeOut", onComplete: () => { g.destroy(); if (this.ghost === g) this.ghost = undefined; } });
    }
    this.lastFr = fr;
    // угольки (поднимаются и гаснут) и искры (быстрее, выше, ярче) с контура кадра
    const emit = (life: number, rise: number, color: number) => {
      const p = e.pts.get(fr);
      if (!p || p.length < 2) return;
      const k = 2 * Math.floor(Math.random() * (p.length / 2)), F = sp.frame.width, lx = sp.flipX ? F - 1 - p[k] : p[k];
      const x = sp.x - sp.originX * F + lx + 0.5, y = sp.y - sp.originY * sp.frame.height + p[k + 1] + 0.5;
      const r = this.scene.add.rectangle(x, y, 1, 1, color).setDepth(sp.depth + 0.03).setBlendMode(Phaser.BlendModes.ADD);
      this.live++;
      this.scene.tweens.add({ targets: r, y: y - rise - Math.random() * 3, x: x + (Math.random() - 0.5) * 3, alpha: { from: 1, to: 0 }, duration: life, ease: "Sine.easeOut", onComplete: () => { r.destroy(); this.live--; } });
    };
    if (L.embers && this.live < L.embers + L.sparks && now >= this.emberAt) { emit(L.emberMs, 5, mix(c1, c2, Math.random())); this.emberAt = now + L.emberMs / L.embers; }
    if (L.sparks && now >= this.sparkAt) { emit(L.emberMs * 0.55, 9, c2); this.sparkAt = now + (L.emberMs * 0.55) / L.sparks; }
  }
  hide() { for (const s of Object.values(this.sp)) s?.setVisible(false); this.lastFr = -1; }
  destroy() { this.ghost?.destroy(); for (const s of Object.values(this.sp)) s?.destroy(); this.sp = {}; }
}
