/**
 * Осада форта в мире (задача 132, шаг 15; shared/siege.ts, состояние — siegeView из ui/siege.ts).
 * Ворота городов (форты и столицы): кадр арки на карте (terrain.ts, o_<вид>__<ярус>-open) подменяется по состоянию — закрыто, открыто,
 * сломано; свои рядом (герой, стража, отряд фракции ворот) — створки распахиваются: поверх кадра «открыто» две створки из кадра «закрыто»
 * (вырезаны в коде по разнице кадров) сжимаются к петлям с плавным easing, отошли — закрываются. Пролом — кадр «сломано», пыль и щепа;
 * починка после осады — кадр «закрыто» проявляется поверх пролома с пылью и искрами.
 * В осаде: полоска здоровья над воротами, таран (лист assets/siege/ram.png, tools/gen/siege-engines.ts) и камнемёты (листы bf-catapult-*)
 * на месте юнитов-машин сервера (свои спрайты юнитов скрыты), удар тарана — тряска арки и пыль, камень летит дугой с тенью и бьёт в арку;
 * королевское знамя во дворе — мачта, постамент и знамя на высоте подъёма, круг и дуга прогресса. Неделю после осады — полотнище победителя
 * над воротами форта.
 */
import Phaser from "phaser";
import { WAR, type WarFaction } from "../../../shared/bannerWar";
import { TILE } from "../../../shared/constants";
import { GATES, GATE_BROKEN, SIEGE, siegeBannerAt, type GateDef, type SiegeFxMsg } from "../../../shared/siege";
import { net } from "../net";
import { siegeView, siegeNow } from "../ui/siege";
import { DEPTH } from "./terrain";
import type { UnitView } from "./UnitView";

const num = (c: string) => parseInt(c.replace("#", ""), 16);
const colOf = (f: string) => num(f === "solgard" ? WAR.look.color.solgard : f === "umbrath" ? WAR.look.color.umbrath : WAR.look.color.neutral);
const easeInOutSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
/** Проём арки в кадре ворот 96×146 (tools/gen/walls141-walls.ts gate): ось, полуширина, верх створок и низ. */
const ARCH = { cx: 48, aw: 30, top: 70, by: 146 };
const ROYAL = { solgard: "war-royal-sol", umbrath: "war-royal-umb" } as const;
const DRAPE = { solgard: "std-drape-sol", umbrath: "std-drape-umb" } as const;
const FOOT = 18;

interface GateVis {
  g: GateDef;
  img: Phaser.GameObjects.Image | null;
  prefix: string;
  k: number;
  leafL: Phaser.GameObjects.Image | null;
  leafR: Phaser.GameObjects.Image | null;
  drape: Phaser.GameObjects.Sprite | null;
  drapeF: string;
  repairT0: number;
  over: Phaser.GameObjects.Image | null;
  shakeT0: number;
}
interface Anim { t0: number; ms: number; step: (k: number) => void; end: () => void }

export class SiegeView {
  private gates: GateVis[] = GATES.map((g) => ({ g, img: null, prefix: "", k: 0, leafL: null, leafR: null, drape: null, drapeF: "", repairT0: 0, over: null, shakeT0: 0 }));
  private scanAt = 0;
  private hp: Phaser.GameObjects.Graphics;
  private engines = new Map<string, Phaser.GameObjects.Sprite>();
  private anims: Anim[] = [];
  private off: (() => void)[] = [];
  private ready = false;
  // королевское знамя двора
  private mast: Phaser.GameObjects.Image | null = null;
  private plinth: Phaser.GameObjects.Image | null = null;
  private flag: Phaser.GameObjects.Sprite | null = null;
  private flagF = "";
  private ring: Phaser.GameObjects.Graphics;
  private flagH = -1;
  private fort = "";

  constructor(private sc: Phaser.Scene, private units: () => Map<string, UnitView>) {
    this.hp = sc.add.graphics().setDepth(DEPTH.top - 8);
    this.ring = sc.add.graphics().setDepth(DEPTH.ground + 4);
    if (!sc.textures.exists("siege_ram")) {
      sc.load.spritesheet("siege_ram", "/assets/siege/ram.png", { frameWidth: 64, frameHeight: 72 });
      sc.load.image("siege_stone", "/assets/siege/stone.png");
      sc.load.once(Phaser.Loader.Events.COMPLETE, () => { this.ready = true; });
      sc.load.start();
    } else this.ready = true;
    this.off.push(net.on("siege:fx", (m) => this.fx(m)));
  }

  // ---------- кадры ворот ----------
  /** Картинка арки ворот на карте (её создаёт и убирает terrain.ts по кускам) — ищем по месту и виду кадра. */
  private findImages() {
    const list = this.sc.children.list;
    for (const v of this.gates) {
      if (v.img && v.img.scene && v.img.active) continue;
      v.img = null;
      for (const o of list) {
        if (o.type !== "Image") continue;
        const im = o as Phaser.GameObjects.Image;
        if (im.x !== v.g.x || im.y !== v.g.objY || !im.texture.key.startsWith("o_") || !im.texture.key.includes("_gate")) continue;
        const key = im.texture.key, i = key.lastIndexOf("-");
        v.img = im;
        v.prefix = i > 0 && key.includes("__") ? key.slice(0, i + 1) : "";
        break;
      }
      if (!v.drape || !v.drape.scene) {
        v.drape = null;
        for (const o of list) {
          const s = o as Phaser.GameObjects.Sprite;
          if (o.type === "Sprite" && s.x === v.g.x && Math.abs(s.y - v.g.objY) <= 2 && s.texture.key.startsWith("vfx_std-drape-")) { v.drape = s; v.drapeF = ""; break; }
        }
      }
    }
  }
  /** Створки: пиксели кадра «закрыто», которых нет в кадре «открыто», в пределах проёма — левая и правая половины (холст один раз на вид). */
  private leaves(prefix: string): [string, string] | null {
    const kl = `siege_leafL_${prefix}`, kr = `siege_leafR_${prefix}`, tx = this.sc.textures;
    if (tx.exists(kl)) return [kl, kr];
    if (!tx.exists(`${prefix}closed`) || !tx.exists(`${prefix}open`)) return null;
    const read = (k: string) => {
      const src = tx.get(k).getSourceImage() as HTMLImageElement;
      const cv = document.createElement("canvas");
      cv.width = src.width; cv.height = src.height;
      const g = cv.getContext("2d")!;
      g.drawImage(src, 0, 0);
      return g.getImageData(0, 0, cv.width, cv.height);
    };
    const a = read(`${prefix}closed`), b = read(`${prefix}open`);
    const W = ARCH.aw, H = ARCH.by - ARCH.top;
    for (const [key, x0] of [[kl, ARCH.cx - ARCH.aw], [kr, ARCH.cx]] as const) {
      const c = tx.createCanvas(key, W, H)!;
      const ctx = c.getContext(), out = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = ((ARCH.top + y) * a.width + x0 + x) * 4, o = (y * W + x) * 4;
        const diff = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) + Math.abs(a.data[i + 3] - b.data[i + 3]);
        if (diff < 6 || a.data[i + 3] < 8) continue;
        out.data[o] = a.data[i]; out.data[o + 1] = a.data[i + 1]; out.data[o + 2] = a.data[i + 2]; out.data[o + 3] = a.data[i + 3];
      }
      ctx.putImageData(out, 0, 0);
      c.refresh();
    }
    return [kl, kr];
  }

  /** Свои у ворот: живой юнит фракции ворот ближе openTiles (герои, стража, отряды; ворота и машины осады не в счёт). */
  private ownNear(g: GateDef, units: Map<string, UnitView>): boolean {
    const R = SIEGE.gates.openTiles * TILE;
    for (const v of units.values()) {
      if (v.dead || v.u.faction !== g.faction || v.u.sprite.startsWith("siege_")) continue;
      if (Math.abs(v.x - g.x) < R && Math.abs(v.y - g.y) < R) return true;
    }
    return false;
  }

  private updateGate(v: GateVis, dt: number, now: number, units: Map<string, UnitView>, camX: number, camY: number) {
    const im = v.img;
    if (!im || !im.scene || !v.prefix) { v.leafL?.setVisible(false); v.leafR?.setVisible(false); return; } // кусок карты выгружен

    const near = Math.abs(v.g.x - camX) < 1400 && Math.abs(v.g.y - camY) < 1000;
    const broken = GATE_BROKEN.has(v.g.id);
    const target = broken ? 0 : near && this.ownNear(v.g, units) ? 1 : 0;
    // ~0,55 с на полный ход створок
    v.k = target > v.k ? Math.min(1, v.k + dt / 0.55) : Math.max(0, v.k - dt / 0.7);
    const tex = (s: string) => (this.sc.textures.exists(`${v.prefix}${s}`) ? `${v.prefix}${s}` : im.texture.key);
    const want = broken ? tex("broken") : v.k > 0 ? tex("open") : tex("closed");
    if (im.texture.key !== want) im.setTexture(want);
    // тряска арки от удара
    const sk = (now - v.shakeT0) / 260;
    im.x = v.g.x + (sk >= 0 && sk < 1 ? Math.round(Math.sin(sk * 40) * 2 * (1 - sk)) : 0);
    // створки
    const show = !broken && v.k > 0.001;
    if (show) {
      const lv = this.leaves(v.prefix);
      if (lv) {
        const left = im.x - 48 + ARCH.cx - ARCH.aw, right = im.x - 48 + ARCH.cx + ARCH.aw, top = v.g.objY - 146 + ARCH.top;
        v.leafL ??= this.sc.add.image(0, 0, lv[0]).setOrigin(0, 0);
        v.leafR ??= this.sc.add.image(0, 0, lv[1]).setOrigin(1, 0);
        const e = easeInOutSine(v.k), sx = 1 - 0.86 * e, shade = Math.round(255 - 90 * e);
        const tint = (shade << 16) | (shade << 8) | shade;
        v.leafL.setVisible(v.k < 1).setPosition(left, top).setScale(sx, 1).setTint(tint).setDepth(im.depth + 0.01);
        v.leafR.setVisible(v.k < 1).setPosition(right, top).setScale(sx, 1).setTint(tint).setDepth(im.depth + 0.01);
      }
    } else { v.leafL?.setVisible(false); v.leafR?.setVisible(false); }
    // починка: кадр «закрыто» проявляется поверх пролома
    if (v.repairT0) {
      const k = (now - v.repairT0) / 1400;
      if (k >= 1) { v.over?.destroy(); v.over = null; v.repairT0 = 0; }
      else {
        if (!v.over) { im.setTexture(tex("broken")); v.over = this.sc.add.image(im.x, im.y, tex("closed")).setOrigin(0.5, 1).setDepth(im.depth + 0.02); }
        else im.setTexture(tex("broken"));
        v.over.setAlpha(easeOutCubic(k));
      }
    }
    // полотнище недели над воротами: знамя победителя осады
    const wk = siegeView.state?.week;
    const flagF = wk && wk.fort === v.g.city && siegeNow() < wk.until ? wk.flag : v.g.faction;
    if (v.drape && v.drape.scene && flagF !== v.drapeF) {
      v.drapeF = flagF;
      const id = DRAPE[flagF as WarFaction];
      if (this.sc.textures.exists(`vfx_${id}`)) { v.drape.setTexture(`vfx_${id}`); if (this.sc.anims.exists(`vfx_${id}`)) v.drape.play({ key: `vfx_${id}`, repeat: -1 }); }
    }
  }

  // ---------- кадр ----------
  update(dt: number, camX: number, camY: number) {
    const now = performance.now();
    if (now >= this.scanAt) { this.scanAt = now + 400; this.findImages(); }
    const units = this.units();
    for (const v of this.gates) this.updateGate(v, dt, now, units, camX, camY);
    this.updateEngines(units, now);
    this.updateBanner(dt, camX, camY);
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i], k = (now - a.t0) / a.ms;
      if (k >= 1) { a.end(); this.anims.splice(i, 1); } else a.step(Math.max(0, k));
    }
  }

  /** Юниты осады: свой спрайт юнита скрыт; машины — свои листы, полоска здоровья у машин и над воротами. */
  private updateEngines(units: Map<string, UnitView>, now: number) {
    const s = siegeView.state, live = new Set<string>();
    const g = this.hp;
    g.clear();
    for (const v of units.values()) {
      const sp = v.u.sprite;
      if (!sp.startsWith("siege_")) continue;
      v.sprite.setVisible(false); v.shadow.setVisible(false); v.label.setVisible(false); v.bar.setVisible(false); v.titleText.setVisible(false); v.frameGfx.setVisible(false);
      const frac = v.u.maxHp ? v.u.hp / v.u.maxHp : 1;
      if (sp === "siege_gate") {
        if (v.dead) continue;
        const gd = GATES.find((x) => Math.abs(x.x - v.u.x) < 4 && Math.abs(x.y - v.u.y) < 4);
        if (!gd) continue;
        this.bar(g, gd.x, gd.objY - 152, 84, frac, colOf(gd.faction), v.ring.visible);
        continue;
      }
      live.add(v.id);
      let spr = this.engines.get(v.id);
      if (!spr) {
        const ram = sp === "siege_ram";
        const gate = GATES.filter((x) => x.siege).sort((a, b) => Math.hypot(a.x - v.u.x, a.y - v.u.y) - Math.hypot(b.x - v.u.x, b.y - v.u.y))[0];
        const key = ram ? (this.ready ? "siege_ram" : "") : `vfx_bf-catapult-${gate && gate.y < v.u.y ? "n" : "s"}`;
        if (!key || !this.sc.textures.exists(key)) continue;
        spr = this.sc.add.sprite(v.x, v.y, key, ram ? (v.u.faction === "umbrath" ? 8 : 0) : 0).setOrigin(0.5, ram ? 68 / 72 : 0.92);
        spr.setData("ram", ram).setData("row", v.u.faction === "umbrath" ? 8 : 0).setData("px", v.x).setData("py", v.y).setData("movedAt", 0);
        this.engines.set(v.id, spr);
      }
      const ram = spr.getData("ram") as boolean, row = spr.getData("row") as number;
      spr.setPosition(Math.round(v.x), Math.round(v.y)).setDepth(v.y).setVisible(!v.dead).setAlpha(v.dead ? 0 : 1);
      if (ram) {
        const st = spr.getData("hit") as number | undefined, hk = st ? (now - st) / 600 : 1;
        if (hk < 1) spr.setFrame(row + 4 + Math.min(3, Math.floor(hk * 4)));
        else if (now - (spr.getData("movedAt") as number) < 300) spr.setFrame(row + Math.floor(now / 140) % 4);
        else spr.setFrame(row);
      }
      // ход тарана — по смене места (удары и выстрелы приходят в siege:fx)
      if (Math.hypot(v.x - (spr.getData("px") as number), v.y - (spr.getData("py") as number)) > 0.3) spr.setData("movedAt", now).setData("px", v.x).setData("py", v.y);
      if (!v.dead && s?.ph === "siege") this.bar(g, v.x, v.y - (ram ? 74 : 86), 44, frac, colOf(v.u.faction), v.ring.visible);
      // выбор и наведение — кольцо юнита остаётся видимым под машиной
      v.ring.setVisible(v.ring.visible && !v.dead);
    }
    for (const [id, spr] of this.engines) if (!live.has(id)) { this.puff(spr.x, spr.y, 3); spr.destroy(); this.engines.delete(id); }
  }
  private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, frac: number, col: number, sel: boolean) {
    const x0 = Math.round(x - w / 2), y0 = Math.round(y);
    g.fillStyle(0x000000, 0.75).fillRect(x0 - 1, y0 - 1, w + 2, 7);
    g.fillStyle(0x2a2030, 1).fillRect(x0, y0, w, 5);
    g.fillStyle(col, 1).fillRect(x0, y0, Math.round(w * Math.max(0, Math.min(1, frac))), 5);
    g.fillStyle(0xffffff, 0.25).fillRect(x0, y0, Math.round(w * frac), 1);
    if (sel) g.lineStyle(1, 0xff6a5a, 1).strokeRect(x0 - 2, y0 - 2, w + 4, 9);
  }

  // ---------- королевское знамя во дворе ----------
  private updateBanner(dt: number, camX: number, camY: number) {
    const s = siegeView.state, b = s?.banner;
    const on = !!s && !!b && (s.ph === "siege" || s.ph === "result");
    if (!on || !s || !b) {
      this.mast?.setVisible(false); this.plinth?.setVisible(false); this.flag?.setVisible(false); this.ring.clear();
      return;
    }
    const at = siegeBannerAt(s.fort), fx = at.x, fy = at.y + FOOT;
    const cat = (this.sc.cache.json.get("vfxm") ?? {}) as Record<string, { anchor: [number, number]; frameW: number; frameH: number; mast?: [number, number, number] }>;
    const m = cat["war-mast"], fr = { w: m?.frameW ?? 112, h: m?.frameH ?? 216, ax: m?.anchor[0] ?? 0.5, ay: m?.anchor[1] ?? 0.963 }, mastSpan = m?.mast ?? [56, 30, 110];
    if (this.fort !== s.fort) {
      this.fort = s.fort;
      this.mast?.destroy(); this.plinth?.destroy(); this.mast = this.plinth = null;
      if (this.sc.textures.exists("vfx_war-mast")) this.mast = this.sc.add.image(fx, fy, "vfx_war-mast").setOrigin(fr.ax, fr.ay).setDepth(fy - 0.3);
      if (this.sc.textures.exists("vfx_war-plinth")) this.plinth = this.sc.add.image(fx, fy, "vfx_war-plinth").setOrigin(fr.ax, fr.ay).setDepth(fy);
      this.flagF = "-";
    }
    const near = Math.abs(fx - camX) < 1500 && Math.abs(fy - camY) < 1100;
    this.mast?.setVisible(near); this.plinth?.setVisible(near);
    if (b.b !== this.flagF) {
      this.flag?.destroy(); this.flag = null; this.flagF = b.b;
      const id = b.b ? ROYAL[b.b as WarFaction] : "";
      if (id && this.sc.textures.exists(`vfx_${id}`)) {
        const e = cat[id];
        this.flag = this.sc.add.sprite(fx, fy, `vfx_${id}`).setOrigin(e?.anchor[0] ?? 0.5, e?.anchor[1] ?? 0.2).setDepth(fy - 0.2);
        if (this.sc.anims.exists(`vfx_${id}`)) this.flag.play({ key: `vfx_${id}`, repeat: -1 });
        this.flagH = b.h;
      }
    }
    const top = { x: fx - fr.w * fr.ax, y: fy - fr.h * fr.ay };
    if (this.flag) {
      this.flagH = this.flagH < 0 ? b.h : this.flagH + (b.h - this.flagH) * Math.min(1, dt * 4);
      this.flag.setVisible(near).setPosition(top.x + mastSpan[0], top.y + mastSpan[2] + (mastSpan[1] - mastSpan[2]) * Math.max(0, Math.min(1, this.flagH)));
    }
    // круг двора и дуга подъёма
    const g = this.ring, R = SIEGE.banner.radius * TILE, now = performance.now();
    g.clear();
    if (!near) return;
    const own = colOf(b.o), pulse = 0.5 + 0.5 * Math.sin(now / 300);
    g.fillStyle(own, 0.1).fillCircle(at.x, at.y, R);
    g.lineStyle(2, b.c ? (Math.floor(now / 140) % 2 ? colOf("solgard") : colOf("umbrath")) : own, b.lock ? 0.35 : 0.55 + 0.35 * pulse).strokeCircle(at.x, at.y, R);
    if (b.lock) return;
    const cx = fx, cy = fy - 8, r = WAR.look.arcR ?? 40, a0 = -Math.PI / 2;
    g.lineStyle(10, 0x000000, 0.5).strokeCircle(cx, cy, r);
    if (b.b && this.flagH > 0.002) { g.lineStyle(6, colOf(b.b), 1); g.beginPath(); g.arc(cx, cy, r, a0, a0 + Math.PI * 2 * Math.min(1, this.flagH), false); g.strokePath(); }
    if (b.hf) { g.lineStyle(3, colOf(b.hf), 0.95); g.beginPath(); g.arc(cx, cy, r - 8, a0, a0 + Math.PI * 2 * Math.max(0.01, b.hp), false); g.strokePath(); }
  }

  // ---------- эффекты ----------
  private add(ms: number, step: (k: number) => void, end: () => void) { this.anims.push({ t0: performance.now(), ms, step, end }); }
  private sheetFx(id: string, x: number, y: number, depth: number, scale = 1, tint?: number) {
    if (!this.sc.textures.exists(`vfx_${id}`)) return;
    const cat = (this.sc.cache.json.get("vfxm") ?? {}) as Record<string, { anchor: [number, number] }>;
    const s = this.sc.add.sprite(x, y, `vfx_${id}`).setOrigin(cat[id]?.anchor[0] ?? 0.5, cat[id]?.anchor[1] ?? 0.5).setDepth(depth).setScale(scale);
    if (tint !== undefined) s.setTint(tint);
    if (this.sc.anims.exists(`vfx_${id}`)) { s.play({ key: `vfx_${id}`, repeat: 0 }); s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy()); }
    else this.sc.time.delayedCall(500, () => s.destroy());
  }
  private puff(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) this.sheetFx("dust-puff", x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 8, y + 2, 0.9 + Math.random() * 0.5);
  }
  /** Щепа: мелкие обломки летят дугой и гаснут (плавно, каждый кадр). */
  private splinters(x: number, y: number, n: number, col: number) {
    for (let i = 0; i < n; i++) {
      const o = this.sc.add.rectangle(x, y, 2 + Math.round(Math.random() * 2), 1 + Math.round(Math.random()), col).setDepth(y + 3);
      const vx = (Math.random() - 0.5) * 140, vy = -60 - Math.random() * 90, rot = (Math.random() - 0.5) * 12, life = 500 + Math.random() * 400;
      this.add(life, (k) => { const t = (k * life) / 1000; o.setPosition(x + vx * t, y + vy * t + 260 * t * t).setRotation(rot * t).setAlpha(1 - easeInOutSine(k)); }, () => o.destroy());
    }
  }
  private gateVis(id: string) { return this.gates.find((v) => v.g.id === id); }

  private fx(m: SiegeFxMsg) {
    const now = performance.now();
    if (m.k === "ram" || m.k === "stone") {
      const e = this.engines.get(m.from);
      if (e?.getData("ram")) e.setData("hit", now);
      else if (e && this.sc.anims.exists(e.texture.key)) e.play({ key: e.texture.key, repeat: 0 });
    }
    if (m.k === "ram") {
      const v = this.gateVis(m.gate);
      if (v) v.shakeT0 = now;
      const y = m.y + (v?.g.side === "n" ? -2 : 2);
      this.puff(m.x, y, 3);
      this.splinters(m.x, y - 30, 10, 0x8a5a30);
      this.sheetFx("rocks-hit", m.x, y - 10, y + 4, 0.8);
      this.shake(m.x, m.y, 90, 0.002);
    } else if (m.k === "stone") {
      const key = this.sc.textures.exists("siege_stone") ? "siege_stone" : "";
      if (!key) return;
      const st = this.sc.add.image(m.x, m.y, key).setDepth(DEPTH.top - 20);
      const sh = this.sc.add.ellipse(m.x, m.y + 24, 12, 5, 0x000000, 0.35).setDepth(DEPTH.ground + 6);
      const d = Math.hypot(m.tx - m.x, m.ty - m.y), arc = Math.min(220, 60 + d * 0.45), gx0 = m.y + 24, gx1 = m.ty + 40;
      this.add(m.ms, (k) => {
        const x = m.x + (m.tx - m.x) * k, y = m.y + (m.ty - m.y) * k - arc * 4 * k * (1 - k);
        st.setPosition(x, y).setRotation(k * 9).setScale(1 + 0.35 * Math.sin(Math.PI * k));
        sh.setPosition(x, gx0 + (gx1 - gx0) * k).setScale(0.6 + 0.4 * k, 0.6 + 0.4 * k).setAlpha(0.15 + 0.25 * k);
      }, () => {
        st.destroy(); sh.destroy();
        const v = this.gateVis(m.gate);
        if (v) v.shakeT0 = performance.now();
        this.sheetFx("expl-dust", m.tx, m.ty, m.ty + 60, 1.4);
        this.sheetFx("rocks-hit", m.tx, m.ty + 10, m.ty + 61, 1);
        this.splinters(m.tx, m.ty, 8, 0x8a8490);
        this.shake(m.tx, m.ty, 120, 0.003);
      });
    } else if (m.k === "breach") {
      for (let i = 0; i < 4; i++) this.sheetFx("expl-dust", m.x + (i - 1.5) * 22, m.y - 30 - Math.random() * 30, m.y + 10, 1.6);
      this.puff(m.x, m.y, 6);
      this.splinters(m.x, m.y - 40, 28, 0x7a4e28);
      this.shake(m.x, m.y, 260, 0.006);
    } else if (m.k === "repair") {
      for (const id of m.gates) {
        const v = this.gateVis(id);
        if (!v) continue;
        v.repairT0 = now;
        this.puff(v.g.x, v.g.objY, 5);
        for (let i = 0; i < 4; i++) this.sc.time.delayedCall(200 + i * 260, () => this.splinters(v.g.x + (Math.random() - 0.5) * 50, v.g.objY - 40 - Math.random() * 40, 5, 0xffd890));
      }
    }
  }
  private shake(x: number, y: number, ms: number, k: number) {
    const cam = this.sc.cameras.main;
    if (Math.abs(cam.midPoint.x - x) < 500 && Math.abs(cam.midPoint.y - y) < 400) cam.shake(ms, k);
  }

  destroy() {
    for (const f of this.off) f();
    for (const a of this.anims) a.end();
    this.anims = [];
    for (const v of this.gates) { v.leafL?.destroy(); v.leafR?.destroy(); v.over?.destroy(); }
    for (const s of this.engines.values()) s.destroy();
    this.engines.clear();
    this.hp.destroy(); this.ring.destroy(); this.mast?.destroy(); this.plinth?.destroy(); this.flag?.destroy();
  }
}
