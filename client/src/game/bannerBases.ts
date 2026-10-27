/**
 * Основания «Знамён Предела» в мире (задача 132, шаг 14): тумба и мачта (листы war-plinth, war-mast из tools/gen/war-bases.ts), королевское
 * знамя Сольгарда или Умбрата едет по мачте на высоту h, сорванное лежит у основания (std-fallen-*), круг захвата на земле в цвете владельца,
 * кольцо прогресса подъёма вокруг основания (вывешивание — тонкое внутреннее), спор — оранжевым миганием, печать — пульсом.
 * Состояние — warView (client/src/ui/bannerWar.ts). Вдали от камеры объекты скрыты.
 */
import Phaser from "phaser";
import { factionColor } from "../../../shared/factions";
import { P } from "../../../shared/palette";
import { WAR_BASES, WAR_RADIUS, type WarBaseDef } from "../../../shared/bannerWar";
import { warView } from "../ui/bannerWar";
import { DEPTH } from "./terrain";

const num = (c: string) => parseInt(c.replace("#", ""), 16);
/** Подножие основания ниже центра круга (px): круг вокруг тумбы, герой у ворота внутри круга. */
const FOOT = 18;
const RING_R = 46;
const ROYAL = { solgard: "war-royal-sol", umbrath: "war-royal-umb" } as const;
const FALLEN = { solgard: "std-fallen-sol", umbrath: "std-fallen-umb" } as const;

interface View {
  d: WarBaseDef;
  mast: Phaser.GameObjects.Image | null;
  plinth: Phaser.GameObjects.Image | null;
  flag: Phaser.GameObjects.Sprite | null;
  flagF: string;
  fallen: Phaser.GameObjects.Sprite | null;
  fallenF: string;
  ground: Phaser.GameObjects.Graphics;
  ring: Phaser.GameObjects.Graphics;
  /** Плавная высота знамени (сервер шлёт раз в 0,5 с). */
  h: number;
  key: string;
}

export class BannerBases {
  private views: View[] = [];
  private mastSpan: [number, number, number] = [36, 30, 78];
  private mastH = 176;
  private gy = 0.9773;

  constructor(private sc: Phaser.Scene) {
    const cat = (sc.cache.json.get("vfxm") ?? {}) as Record<string, { anchor: [number, number]; frameH: number; mast?: [number, number, number] }>;
    const m = cat["war-mast"];
    if (m) { this.mastSpan = m.mast ?? this.mastSpan; this.mastH = m.frameH; this.gy = m.anchor[1]; }
    const tex = (id: string) => sc.textures.exists(`vfx_${id}`);
    for (const d of WAR_BASES) {
      const fx = d.x, fy = d.y + FOOT;
      const ground = sc.add.graphics().setDepth(DEPTH.ground + 1);
      const ring = sc.add.graphics().setDepth(DEPTH.ground + 2);
      const mast = tex("war-mast") ? sc.add.image(fx, fy, "vfx_war-mast").setOrigin(0.5, this.gy).setDepth(fy - 0.3) : null;
      const plinth = tex("war-plinth") ? sc.add.image(fx, fy, "vfx_war-plinth").setOrigin(0.5, this.gy).setDepth(fy) : null;
      this.views.push({ d, mast, plinth, flag: null, flagF: "", fallen: null, fallenF: "", ground, ring, h: -1, key: "" });
    }
  }

  update(dt: number, camX: number, camY: number) {
    const now = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    for (const v of this.views) {
      const near = Math.abs(v.d.x - camX) < 1400 && Math.abs(v.d.y - camY) < 1000;
      for (const o of [v.mast, v.plinth, v.flag, v.fallen, v.ground, v.ring]) o?.setVisible(near);
      if (!near) continue;
      const b = warView.byId.get(v.d.id);
      const fx = v.d.x, fy = v.d.y + FOOT;
      // знамя на мачте
      const bf = b?.b ?? "";
      if (bf !== v.flagF) {
        v.flag?.destroy();
        v.flag = null;
        v.flagF = bf;
        const id = bf ? ROYAL[bf] : "";
        if (id && this.sc.textures.exists(`vfx_${id}`)) {
          const e = (this.sc.cache.json.get("vfxm") ?? {})[id] as { anchor: [number, number] } | undefined;
          v.flag = this.sc.add.sprite(fx, fy, `vfx_${id}`).setOrigin(e?.anchor[0] ?? 0.5, e?.anchor[1] ?? 0.2).setDepth(fy - 0.2);
          if (this.sc.anims.exists(`vfx_${id}`)) v.flag.play({ key: `vfx_${id}`, repeat: -1, startFrame: Math.floor(Math.random() * 12) });
          v.h = b?.h ?? 0;
        }
      }
      if (v.flag && b) {
        const target = b.h;
        v.h = v.h < 0 ? target : v.h + (target - v.h) * Math.min(1, dt * 4);
        const [, top, low] = this.mastSpan;
        const yAt = low + (top - low) * Math.max(0, Math.min(1, v.h));
        v.flag.setPosition(fx, fy - this.mastH * this.gy + yAt);
      }
      // сорванное знамя в грязи у основания
      const fl = b?.fl ?? "";
      if (fl !== v.fallenF) {
        v.fallen?.destroy();
        v.fallen = null;
        v.fallenF = fl;
        const id = fl ? FALLEN[fl] : "";
        if (id && this.sc.textures.exists(`vfx_${id}`)) {
          const e = (this.sc.cache.json.get("vfxm") ?? {})[id] as { anchor: [number, number] } | undefined;
          v.fallen = this.sc.add.sprite(fx + 30, fy + 10, `vfx_${id}`).setOrigin(e?.anchor[0] ?? 0.5, e?.anchor[1] ?? 1).setDepth(fy + 10);
          if (this.sc.anims.exists(`vfx_${id}`)) v.fallen.play({ key: `vfx_${id}`, repeat: -1 });
        }
      }
      // круг захвата и кольцо прогресса — перерисовка только при смене вида
      const contest = !!b?.c, seal = (b?.s ?? 0) > 0;
      const key = `${b?.o}|${b?.b}|${Math.round(v.h * 100)}|${contest ? Math.round(pulse * 6) : 0}|${seal ? Math.round(pulse * 6) : 0}|${b?.hf}|${Math.round((b?.hp ?? 0) * 20)}|${b?.lock}`;
      if (key === v.key) continue;
      v.key = key;
      const own = b?.o ? num(factionColor(b.o)) : num(P.dim);
      const g = v.ground;
      g.clear();
      g.fillStyle(own, b?.o ? 0.12 : 0.06).fillCircle(v.d.x, v.d.y, WAR_RADIUS);
      g.lineStyle(2, contest ? num(P.warn) : own, contest ? 0.45 + 0.45 * pulse : b?.o ? 0.7 : 0.4).strokeCircle(v.d.x, v.d.y, WAR_RADIUS);
      const r = v.ring;
      r.clear();
      if (b?.lock) continue;
      const cx = fx, cy = fy - 6, start = -Math.PI / 2;
      r.lineStyle(7, 0x000000, 0.55).strokeCircle(cx, cy, RING_R);
      if (b?.b) {
        const col = num(factionColor(b.b));
        r.lineStyle(5, seal ? num(P.numGold) : col, seal ? 0.55 + 0.45 * pulse : 1);
        r.beginPath(); r.arc(cx, cy, RING_R, start, start + Math.PI * 2 * Math.max(0.001, Math.min(1, v.h)), false); r.strokePath();
      }
      if (b?.hf) {
        r.lineStyle(3, num(factionColor(b.hf)), 0.95);
        r.beginPath(); r.arc(cx, cy, RING_R - 7, start, start + Math.PI * 2 * Math.max(0.001, b.hp), false); r.strokePath();
      }
      if (contest) r.lineStyle(2, num(P.warn), 0.5 + 0.5 * pulse).strokeCircle(cx, cy, RING_R + 5);
    }
  }

  destroy() {
    for (const v of this.views) for (const o of [v.mast, v.plinth, v.flag, v.fallen, v.ground, v.ring]) o?.destroy();
    this.views = [];
  }
}
