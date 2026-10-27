/**
 * Основания «Знамён Предела» в мире (задача 132, шаг 14). Вид — data/faction-war.json look, листы — tools/gen/war-bases.ts и war-rings.ts.
 * Круг захвата: рунный бордюр (war-ring), свечение рун и канавки в цвете владельца с медленным «дыханием» (war-ring-glow, ADD),
 * блик бежит по кругу (war-ring-sheen), внутри — едва заметная заливка, у кольца — искры (свой пул частиц, плавно: easing, каждый кадр).
 * Постамент: мачта сзади, королевское знамя едет по мачте на высоту h, постамент спереди, щиток с гербом владельца.
 * Прогресс: толстая дуга вокруг постамента с градиентом и светящейся головкой; спор — дуга мерцает двумя цветами, над постаментом мечи;
 * вывешивание — тонкая внутренняя дуга. Захват: луч по мачте, вспышка у навершия, волна по кругу и сноп искр; срыв — пыль.
 * Состояние — warView (client/src/ui/bannerWar.ts). Вдали от камеры объекты скрыты и не считаются.
 */
import Phaser from "phaser";
import { WAR, WAR_BASES, WAR_RADIUS, type WarBaseDef, type WarFaction } from "../../../shared/bannerWar";
import { baseState, inactivePlate, warActive, warHero, warHint, warView } from "../ui/bannerWar";
import { net } from "../net";
const NET_SELF_FACTION = () => net.self?.faction as WarFaction | undefined;
import { worldText } from "./worldText";
import { DEPTH } from "./terrain";

const L = WAR.look;
const num = (c: string) => parseInt(c.replace("#", ""), 16);
const COL = { solgard: num(L.color.solgard), umbrath: num(L.color.umbrath), neutral: num(L.color.neutral) };
const colOf = (f: string) => (f === "solgard" ? COL.solgard : f === "umbrath" ? COL.umbrath : COL.neutral);
/** Якорь постамента (центр следа на земле) ниже центра круга на look.plinthDrop: середина каменного тела — в центре кольца. */
const FOOT = L.plinthDrop;
const ROYAL = { solgard: "war-royal-sol", umbrath: "war-royal-umb" } as const;
const PLATE = { solgard: "war-plate-sol", umbrath: "war-plate-umb" } as const;
const FALLEN = { solgard: "std-fallen-sol", umbrath: "std-fallen-umb" } as const;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
const easeInOutSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const lerpCol = (a: number, b: number, t: number) => {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255, br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};

/**
 * Кольцо из одного большого листа, нарезанное на сектора через setCrop: рисуется только полоса кольца, а не весь квадрат 944×944
 * (заливка экрана дважды-трижды за кадр заметна на слабых видеокартах). Тон, прозрачность и видимость — на все сектора сразу.
 */
class Layer {
  readonly parts: Phaser.GameObjects.Image[] = [];
  constructor(sc: Phaser.Scene, key: string, x: number, y: number, depth: number, add: boolean, rIn: number, rOut: number, n = 16) {
    const src = sc.textures.get(key).getSourceImage() as { width: number; height: number };
    const c = src.width / 2;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const xs: number[] = [], ys: number[] = [];
      for (const r of [rIn, rOut]) for (let t = 0; t <= 8; t++) { const a = a0 + ((a1 - a0) * t) / 8; xs.push(c + Math.cos(a) * r); ys.push(c + Math.sin(a) * r); }
      const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 2), y0 = Math.max(0, Math.floor(Math.min(...ys)) - 2);
      const x1 = Math.min(src.width, Math.ceil(Math.max(...xs)) + 2), y1 = Math.min(src.height, Math.ceil(Math.max(...ys)) + 2);
      const im = sc.add.image(x, y, key).setCrop(x0, y0, x1 - x0, y1 - y0).setDepth(depth);
      if (add) im.setBlendMode(Phaser.BlendModes.ADD);
      this.parts.push(im);
    }
  }
  setVisible(v: boolean) { for (const p of this.parts) p.setVisible(v); return this; }
  setTint(c: number) { for (const p of this.parts) p.setTint(c); return this; }
  setAlpha(a: number) { for (const p of this.parts) p.setAlpha(a); return this; }
  destroy() { for (const p of this.parts) p.destroy(); }
}

interface Fx { o: Phaser.GameObjects.Image; t0: number; ms: number; step: (o: Phaser.GameObjects.Image, k: number) => void }
interface Spark { o: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; t0: number; life: number; s: number; a: number }
interface View {
  d: WarBaseDef;
  fill: Phaser.GameObjects.Graphics;
  ring: Layer | null;
  glow: Layer | null;
  sheen: Phaser.GameObjects.Image | null;
  arc: Phaser.GameObjects.Graphics;
  head: Phaser.GameObjects.Image | null;
  swords: Phaser.GameObjects.Image | null;
  mast: Phaser.GameObjects.Image | null;
  plinth: Phaser.GameObjects.Image | null;
  plate: Phaser.GameObjects.Image | null;
  plateF: string;
  flag: Phaser.GameObjects.Sprite | null;
  flagF: string;
  fallen: Phaser.GameObjects.Sprite | null;
  fallenF: string;
  h: number;
  owner: string | null;
  fillKey: string;
  emitAcc: number;
  phase: number;
  arcKey: string;
  label: Phaser.GameObjects.Text;
  /** Табличка на шапке постамента: [солнце] Сольгард · Умбрат [череп] — пока в круге кто-то есть; справа — причина остановки (мечи — спор, конь — верхом). */
  counter: Phaser.GameObjects.Container;
  cBg: Phaser.GameObjects.Graphics;
  cSol: Phaser.GameObjects.Text;
  cUmb: Phaser.GameObjects.Text;
  cWhy: Phaser.GameObjects.Image | null;
  cKey: string;
  labelKey: string;
}

export class BannerBases {
  private views: View[] = [];
  private fx: Fx[] = [];
  private sparks: Spark[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private mast: [number, number, number] = [56, 30, 110];
  private frame = { w: 112, h: 216, ax: 0.5, ay: 0.963 };
  private plateAt: [number, number] = [37, 154];
  private has: (id: string) => boolean;

  constructor(private sc: Phaser.Scene, private unitsOf: () => Iterable<{ x: number; topY: number; dead?: boolean; unseen?: boolean; blockW(): number; blockH(): number }> = () => []) {
    const cat = (sc.cache.json.get("vfxm") ?? {}) as Record<string, { anchor: [number, number]; frameW: number; frameH: number; mast?: [number, number, number]; plate?: [number, number] }>;
    const m = cat["war-mast"], p = cat["war-plinth"];
    if (m) { this.mast = m.mast ?? this.mast; this.frame = { w: m.frameW, h: m.frameH, ax: m.anchor[0], ay: m.anchor[1] }; }
    if (p?.plate) this.plateAt = p.plate;
    this.has = (id) => sc.textures.exists(`vfx_${id}`);
    const img = (id: string, x: number, y: number) => (this.has(id) ? sc.add.image(x, y, `vfx_${id}`) : null);
    WAR_BASES.forEach((d, i) => {
      const fx = d.x, fy = d.y + FOOT;
      const fill = sc.add.graphics().setDepth(DEPTH.ground + 1);
      const rIn = WAR_RADIUS - 40, rOut = WAR_RADIUS + 22;
      const ring = this.has("war-ring") ? new Layer(sc, "vfx_war-ring", d.x, d.y, DEPTH.ground + 2, false, rIn, rOut) : null;
      const glow = this.has("war-ring-glow") ? new Layer(sc, "vfx_war-ring-glow", d.x, d.y, DEPTH.ground + 3, true, rIn, rOut) : null;
      // блик — короткая дуга вверху листа: рисуется только её прямоугольник, вращается вокруг центра круга
      const sheen = img("war-ring-sheen", d.x, d.y)?.setDepth(DEPTH.ground + 3).setBlendMode(Phaser.BlendModes.ADD) ?? null;
      if (sheen) { const c = sheen.width / 2, hw = Math.ceil(WAR_RADIUS * Math.sin(0.4)) + 16; sheen.setCrop(c - hw, c - WAR_RADIUS - 16, hw * 2, Math.ceil(WAR_RADIUS * (1 - Math.cos(0.4))) + 34); }
      const arc = sc.add.graphics().setDepth(DEPTH.ground + 4);
      const head = img("war-dot", fx, fy)?.setDepth(DEPTH.ground + 5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false) ?? null;
      const swords = img("war-swords", fx, fy)?.setDepth(fy + 3).setVisible(false) ?? null;
      const mast = img("war-mast", fx, fy)?.setOrigin(this.frame.ax, this.frame.ay).setDepth(fy - 0.3) ?? null;
      const plinth = img("war-plinth", fx, fy)?.setOrigin(this.frame.ax, this.frame.ay).setDepth(fy) ?? null;
      const top = this.frameTop(fx, fy);
      // подпись под постаментом, за дугой прогресса
      void top;
      const label = worldText(sc, fx, d.y + L.arcR + L.arcW, "", "name", { align: "center" }).setOrigin(0.5, 0).setDepth(fy + 6);
      // табличка счёта на шапке постамента (стиль плашки имени: тёмная панель, золотая рамка 1 px), цифры — кеглем ника
      const cBg = sc.add.graphics();
      const num = (c: string) => worldText(sc, 0, 0, "0", "name", { color: c }).setOrigin(0.5, 0.5);
      const cSol = num(L.color.solgard), cUmb = num(L.color.umbrath);
      const parts: Phaser.GameObjects.GameObject[] = [cBg, cSol, cUmb];
      const eS = this.has("war-emb-sol") ? sc.add.image(-17, 0, "vfx_war-emb-sol") : null, eU = this.has("war-emb-umb") ? sc.add.image(17, 0, "vfx_war-emb-umb") : null;
      if (eS) parts.push(eS); if (eU) parts.push(eU);
      const cWhy = this.has("war-swords") ? sc.add.image(30, 0, "vfx_war-swords").setScale(0.5) : null;
      if (cWhy) parts.push(cWhy);
      cSol.setPosition(-7, 0); cUmb.setPosition(7, 0);
      const dot = worldText(sc, 0, 0, "·", "name", { color: "#bdb09c" }).setOrigin(0.5, 0.5);
      parts.push(dot);
      cBg.fillStyle(0x18131c, 0.92).fillRoundedRect(-24, -6, 48, 12, 2).lineStyle(1, 0xd6a84b, 0.9).strokeRoundedRect(-24, -6, 48, 12, 2);
      const counter = sc.add.container(fx, top.y + this.frame.h * this.frame.ay - 80, parts).setDepth(fy + 8).setVisible(false);
      this.views.push({ d, fill, ring, glow, sheen, arc, head, swords, mast, plinth, plate: null, plateF: "", flag: null, flagF: "", fallen: null, fallenF: "", h: -1, owner: null, fillKey: "", emitAcc: 0, phase: i * 0.37, arcKey: "", label, labelKey: "", counter, cBg, cSol, cUmb, cWhy, cKey: "" });
    });
    // стрелка у края экрана к знамени фронта битвы, когда оно за краем (подсказка «что делать сейчас»)
    this.arrow = sc.add.graphics().setScrollFactor(0).setDepth(DEPTH.top - 2).setVisible(false);
    this.arrowText = worldText(sc, 0, 0, "", "plain", { fontSize: "13px", fontStyle: "600", align: "center", strokeThickness: 3 }).setScrollFactor(0).setDepth(DEPTH.top - 2).setOrigin(0.5).setVisible(false);

  }

  /** Левый верх кадра постамента (px мира). */
  private frameTop(fx: number, fy: number) { return { x: fx - this.frame.w * this.frame.ax, y: fy - this.frame.h * this.frame.ay }; }

  private arrow!: Phaser.GameObjects.Graphics;
  private arrowText!: Phaser.GameObjects.Text;
  /** Стрелка у края экрана: к цели подсказки, если она вне вида камеры (в битве, не в круге). */
  private updateArrow(now: number) {
    const h = warHint(), cam = this.sc.cameras.main, t = h?.target;
    const show = !!t && !h!.inside && !cam.worldView.contains(t.x, t.y);
    this.arrow.setVisible(show); this.arrowText.setVisible(show);
    if (!show || !t) return;
    const W = cam.width, H = cam.height, cx = W / 2, cy = H / 2;
    const sx = (t.x - cam.worldView.x) * cam.zoom, sy = (t.y - cam.worldView.y) * cam.zoom, a = Math.atan2(sy - cy, sx - cx);
    const k = Math.min((W / 2 - 46) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - 70) / Math.abs(Math.sin(a) || 1e-6));
    const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k, pulse = 1 + 0.12 * Math.sin(now / 200);
    // объекты без прокрутки камера всё равно масштабирует вокруг центра: переводим экранные px в её систему
    const z = cam.zoom, ux = (x: number) => cx + (x - cx) / z, uy = (y: number) => cy + (y - cy) / z;
    const g = this.arrow.clear();
    g.setPosition(ux(ax), uy(ay)).setRotation(a).setScale(pulse / z);
    g.fillStyle(COL.solgard, 1).lineStyle(2, 0x000000, 1);
    g.beginPath(); g.moveTo(18, 0); g.lineTo(-10, -13); g.lineTo(-3, 0); g.lineTo(-10, 13); g.closePath(); g.fillPath(); g.strokePath();
    const d = Math.round(Math.hypot(t.x - warHero.x, t.y - warHero.y) / 32);
    this.arrowText.setText(`${t.name}\n${d} м`).setPosition(ux(ax - Math.cos(a) * 44), uy(ay - Math.sin(a) * 34)).setScale(1 / z).setColor(L.color.solgard);
  }

  update(dt: number, camX: number, camY: number) {
    const now = performance.now();
    this.updateArrow(now);
    for (const v of this.views) {
      const near = Math.abs(v.d.x - camX) < 1500 && Math.abs(v.d.y - camY) < 1100;
      for (const o of [v.fill, v.ring, v.glow, v.sheen, v.arc, v.mast, v.plinth, v.plate, v.flag, v.fallen, v.label]) o?.setVisible(near);
      if (!near) { v.head?.setVisible(false); v.swords?.setVisible(false); v.counter.setVisible(false); continue; }
      this.updateBase(v, dt, now);
    }
    this.updateFx(now);
    this.updateSparks(dt, now);
  }

  private updateBase(v: View, dt: number, now: number) {
    const b = warView.byId.get(v.d.id);
    const fx = v.d.x, fy = v.d.y + FOOT, top = this.frameTop(fx, fy);
    const owner = b?.o ?? "", col = colOf(owner);
    // захват и срыв: вспышка по смене владельца (не при первом состоянии)
    if (v.owner !== null && owner && owner !== v.owner) this.burst(v, owner as WarFaction, now);
    if (b?.fl && b.fl !== v.fallenF && v.owner !== null) this.dust(v, now);
    v.owner = owner;
    // заливка круга
    const fk = `${owner}`;
    if (fk !== v.fillKey) {
      v.fillKey = fk;
      v.fill.clear().fillStyle(col, owner ? L.fill : L.fill * 0.5).fillCircle(v.d.x, v.d.y, WAR_RADIUS - 8);
    }
    // дыхание свечения и блик
    const br = easeInOutSine(((now / L.breathMs + v.phase) % 1) < 0.5 ? ((now / L.breathMs + v.phase) % 1) * 2 : 2 - ((now / L.breathMs + v.phase) % 1) * 2);
    const contest = !!b?.c;
    // не воюющий фронт в битве: кольцо серое и тусклое, руны не горят, блика и искр нет
    const asleep = warView.state?.ph === "battle" && !warActive(v.d);
    v.ring?.setTint(asleep ? 0x8a8690 : 0xffffff).setAlpha(asleep ? 0.6 : 1);
    if (v.glow) v.glow.setTint(contest ? (Math.floor(now / 140) % 2 ? COL.solgard : COL.umbrath) : asleep ? COL.neutral : col).setAlpha(asleep ? 0.06 : owner ? 0.55 + 0.4 * br : 0.22 + 0.16 * br);
    if (v.sheen) v.sheen.setVisible(!asleep).setTint(col).setAlpha(owner ? 0.75 : 0.3).setRotation(((now / L.sheenMs + v.phase) % 1) * Math.PI * 2);
    // знамя на мачте
    const bf = b?.b ?? "";
    if (bf !== v.flagF) {
      v.flag?.destroy();
      v.flag = null;
      v.flagF = bf;
      const id = bf ? ROYAL[bf as WarFaction] : "";
      if (id && this.has(id)) {
        const e = (this.sc.cache.json.get("vfxm") ?? {})[id] as { anchor: [number, number] } | undefined;
        v.flag = this.sc.add.sprite(fx, fy, `vfx_${id}`).setOrigin(e?.anchor[0] ?? 0.5, e?.anchor[1] ?? 0.2).setDepth(fy - 0.2);
        if (this.sc.anims.exists(`vfx_${id}`)) v.flag.play({ key: `vfx_${id}`, repeat: -1, startFrame: Math.floor(Math.random() * 12) });
        v.h = b?.h ?? 0;
      }
    }
    if (v.flag && b) {
      v.h = v.h < 0 ? b.h : v.h + (b.h - v.h) * Math.min(1, dt * 4);
      const [mx, mTop, mLow] = this.mast;
      v.flag.setPosition(top.x + mx, top.y + mLow + (mTop - mLow) * Math.max(0, Math.min(1, v.h)));
    }
    // щиток с гербом владельца
    if (owner !== v.plateF) {
      v.plate?.destroy();
      v.plate = null;
      v.plateF = owner;
      const id = owner ? PLATE[owner as WarFaction] : "";
      if (id && this.has(id)) v.plate = this.sc.add.image(top.x + this.plateAt[0], top.y + this.plateAt[1], `vfx_${id}`).setOrigin(0, 0).setDepth(fy + 0.1);
    }
    // сорванное знамя в грязи
    const fl = b?.fl ?? "";
    if (fl !== v.fallenF) {
      v.fallen?.destroy();
      v.fallen = null;
      v.fallenF = fl;
      const id = fl ? FALLEN[fl as WarFaction] : "";
      if (id && this.has(id)) {
        const e = (this.sc.cache.json.get("vfxm") ?? {})[id] as { anchor: [number, number] } | undefined;
        v.fallen = this.sc.add.sprite(fx + 52, fy + 14, `vfx_${id}`).setOrigin(e?.anchor[0] ?? 0.5, e?.anchor[1] ?? 1).setDepth(fy + 14);
        if (this.sc.anims.exists(`vfx_${id}`)) v.fallen.play({ key: `vfx_${id}`, repeat: -1 });
      }
    }
    this.drawArc(v, b, fx, fy, now, br);
    // подпись под постаментом: имя основания и владелец или ход захвата (как на карте мира)
    // подпись основания уступает подписям юнитов (ник и титул героя важнее): сдвиг вниз на строку-две, иначе прячется
    {
      const lw = v.label.width, lh = v.label.height, y0 = v.d.y + L.arcR + L.arcW;
      const blocks = [...this.unitsOf()].filter((u) => !u.dead && !u.unseen && Math.abs(u.x - v.d.x) < 200 && Math.abs(u.topY - y0) < 120)
        .map((u) => ({ l: u.x - u.blockW() / 2, r: u.x + u.blockW() / 2, b: u.topY + 3, t: u.topY + 3 - u.blockH() }));
      let ok = false;
      for (const dy of [0, 10, 20, 30]) {
        const l = v.d.x - lw / 2, r = v.d.x + lw / 2, t = y0 + dy, bt = t + lh;
        if (!blocks.some((q) => l < q.r && r > q.l && t < q.b && bt > q.t)) { v.label.setY(y0 + dy); ok = true; break; }
      }
      v.label.setVisible(ok);
    }
    const st = baseState(v.d.id), plate = inactivePlate(v.d), lk = `${st.owner}|${st.state}|${plate}`;
    if (lk !== v.labelKey) {
      v.labelKey = lk;
      v.label.setText(`${v.d.name}\n${st.state || st.owner}${plate ? `\n${plate}` : ""}`).setColor(st.state ? "#ffb35a" : owner ? L.color[owner as WarFaction] : "#efe6d2");
    }
    // над постаментом: «свои : чужие» в круге фронта битвы; если герой в этом круге — ещё и что делать (та же строка, что в полосе)
    const me = NET_SELF_FACTION(), live = warActive(v.d) && b && b.n[0] + b.n[1] > 0;
    if (live && me) {
      const [ns, nu] = b!.n, heroIn = warHint()?.inside?.id === v.d.id;
      const why = b!.c && ns === nu ? "contest" : heroIn && warHero.mount ? "mount" : "";
      const ck = `${ns}:${nu}:${why}`;
      if (ck !== v.cKey) {
        v.cKey = ck;
        v.cSol.setText(String(ns)).setAlpha(ns >= nu ? 1 : 0.7);
        v.cUmb.setText(String(nu)).setAlpha(nu >= ns ? 1 : 0.7);
        if (v.cWhy) { v.cWhy.setVisible(!!why); if (why === "mount" && this.has("war-ico-mount")) v.cWhy.setTexture("vfx_war-ico-mount").setScale(1); else if (why === "contest") v.cWhy.setTexture("vfx_war-swords").setScale(0.5); }
      }
      v.counter.setVisible(true);
    } else v.counter.setVisible(false);
    void me;
    // искры у кольца: владелец — его цвет, ничья — редкая серая пыль, спор — оба цвета
    v.emitAcc += asleep ? 0 : dt * L.embersPerSec * (owner ? 1 : 0.45) * (contest ? 2 : 1);
    while (v.emitAcc >= 1) {
      v.emitAcc -= 1;
      const a = Math.random() * Math.PI * 2, r = WAR_RADIUS + (Math.random() - 0.5) * 18;
      const c = contest ? (Math.random() < 0.5 ? COL.solgard : COL.umbrath) : col;
      this.spark(v.d.x + Math.cos(a) * r, v.d.y + Math.sin(a) * r, (Math.random() - 0.5) * 10, -14 - Math.random() * 22, c, L.emberLifeMs[0] + Math.random() * (L.emberLifeMs[1] - L.emberLifeMs[0]), 0.1 + Math.random() * 0.08, owner ? 0.9 : 0.45, now);
    }
  }

  /** Дуга прогресса: дорожка, градиентная дуга по высоте знамени, светящаяся головка; спор — мерцание двумя цветами и мечи. */
  private drawArc(v: View, b: ReturnType<typeof warView.byId.get>, fx: number, fy: number, now: number, br: number) {
    const g = v.arc;
    // перерисовка дуги — только при смене вида (высота, мерцание спора, пульс печати, вывешивание): Graphics дорогие
    const flick0 = Math.floor(now / 110), hh = b?.b ? (v.h < 0 ? b.h : v.h) : 0;
    const key = !b || b.lock ? "x" : `${b.b}|${b.o}|${Math.round(hh * 400)}|${b.c ? flick0 : ""}|${b.s > 0 ? Math.round(br * 6) : ""}|${b.hf}|${Math.round(b.hp * 40)}|${Math.round(br * 4)}`;
    if (key === v.arcKey && !b?.c) return;
    v.arcKey = key;
    g.clear();
    v.head?.setVisible(false);
    v.swords?.setVisible(false);
    if (!b || b.lock) return;
    const cx = fx, cy = fy - FOOT, R = L.arcR, W = L.arcW, a0 = -Math.PI / 2;
    const contest = b.c, seal = b.s > 0;
    // дорожка и тонкий обод
    g.lineStyle(W + 6, 0x000000, 0.5).strokeCircle(cx, cy, R);
    g.lineStyle(1, colOf(b.o), 0.35 + 0.2 * br).strokeCircle(cx, cy, R + W / 2 + 3);
    const h = b.b ? Math.max(0, Math.min(1, v.h < 0 ? b.h : v.h)) : 0;
    if (b.b && h > 0.002) this.stroke(g, cx, cy, R, W, Math.PI * 2 * h, seal ? num("#ffd84a") : colOf(b.b), contest, now, seal ? 0.65 + 0.35 * br : 1, v.head, br);
    if (b.hf) this.stroke(g, cx, cy, R - W - 3, 5, Math.PI * 2 * Math.max(0.01, b.hp), colOf(b.hf), false, now, 1, b.b ? null : v.head, br);
    // причина остановки (мечи спора) — на табличке счёта на шапке постамента, отдельный крупный значок не нужен
  }

  /**
   * Дуга прогресса: мягкое свечение под ней, градиент от тёмного тона к цвету и к белому у конца, светлая кромка изнутри,
   * светящаяся головка на конце (head). Спор — сегменты мерцают двумя цветами.
   */
  private stroke(g: Phaser.GameObjects.Graphics, cx: number, cy: number, R: number, W: number, span: number, col: number, contest: boolean, now: number, alpha: number, head: Phaser.GameObjects.Image | null, br: number) {
    const a0 = -Math.PI / 2, N = Math.max(4, Math.round(40 * span / (Math.PI * 2))), flick = Math.floor(now / 110);
    g.lineStyle(W + 8, col, 0.16 * alpha); g.beginPath(); g.arc(cx, cy, R, a0, a0 + span, false); g.strokePath();
    for (let i = 0; i < N; i++) {
      const t = (i + 1) / N;
      let c = lerpCol(lerpCol(col, 0x000000, 0.5), col, Math.min(1, t * 1.6));
      if (t > 0.8) c = lerpCol(col, 0xffffff, (t - 0.8) * 2);
      if (contest) c = (i + flick) % 2 ? COL.solgard : COL.umbrath;
      g.lineStyle(W, c, alpha);
      g.beginPath(); g.arc(cx, cy, R, a0 + (span * i) / N, a0 + (span * (i + 1)) / N + 0.004, false); g.strokePath();
    }
    g.lineStyle(1, lerpCol(col, 0xffffff, 0.55), 0.8 * alpha); g.beginPath(); g.arc(cx, cy, R - W / 2 + 1, a0, a0 + span, false); g.strokePath();
    if (head) {
      const ae = a0 + span;
      head.setVisible(true).setPosition(cx + Math.cos(ae) * R, cy + Math.sin(ae) * R).setTint(contest ? (flick % 2 ? COL.solgard : COL.umbrath) : col).setScale(0.8 + 0.35 * br).setAlpha(0.95);
    }
  }

  // ---------- вспышки ----------
  private add(o: Phaser.GameObjects.Image, ms: number, now: number, step: Fx["step"]) { this.fx.push({ o, t0: now, ms, step }); step(o, 0); }
  private burst(v: View, f: WarFaction, now: number) {
    if (!this.has("war-dot")) return;
    const fx = v.d.x, fy = v.d.y + FOOT, top = this.frameTop(fx, fy), col = colOf(f);
    const mx = top.x + this.mast[0], mTop = top.y + this.mast[1];
    if (this.has("war-beam")) {
      const beam = this.sc.add.image(mx, fy - 60, "vfx_war-beam").setOrigin(0.5, 1).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(fy + 2);
      this.add(beam, L.burstMs, now, (o, k) => {
        const up = easeOutCubic(Math.min(1, k / 0.35)), fade = k < 0.35 ? 1 : 1 - easeOutQuad((k - 0.35) / 0.65);
        o.setScale(1.6 - 0.8 * k, up * 1.1).setAlpha(fade);
      });
    }
    const flash = this.sc.add.image(mx, mTop, "vfx_war-dot").setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(fy + 3);
    this.add(flash, L.burstMs * 0.7, now, (o, k) => { o.setScale(0.5 + 6 * easeOutCubic(k)).setAlpha(1 - easeOutQuad(k)); });
    const core = this.sc.add.image(mx, mTop, "vfx_war-dot").setBlendMode(Phaser.BlendModes.ADD).setDepth(fy + 3);
    this.add(core, L.burstMs * 0.45, now, (o, k) => { o.setScale(0.4 + 2.2 * easeOutCubic(k)).setAlpha(1 - k); });
    if (this.has("war-ring-glow")) {
      const wave = this.sc.add.image(v.d.x, v.d.y, "vfx_war-ring-glow").setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.ground + 4);
      this.add(wave, L.waveMs, now, (o, k) => { o.setScale(0.08 + 0.92 * easeOutCubic(k)).setAlpha(k < 0.15 ? k / 0.15 : 1 - easeOutQuad((k - 0.15) / 0.85)); });
    }
    for (let i = 0; i < 48; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, s = 60 + Math.random() * 120;
      this.spark(mx + (Math.random() - 0.5) * 20, fy - 70 - Math.random() * 60, Math.cos(a) * s, Math.sin(a) * s, i % 3 ? col : 0xffffff, 700 + Math.random() * 900, 0.12 + Math.random() * 0.12, 1, now, 90);
    }
  }
  private dust(v: View, now: number) {
    const fx = v.d.x, fy = v.d.y + FOOT;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 50;
      this.spark(fx + 50 + Math.cos(a) * 10, fy + 10, Math.cos(a) * s, Math.sin(a) * s * 0.5 - 10, 0x9a8a78, 600 + Math.random() * 600, 0.2 + Math.random() * 0.15, 0.6, now, 0, false);
    }
  }
  private updateFx(now: number) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i], k = (now - f.t0) / f.ms;
      if (k >= 1) { f.o.destroy(); this.fx.splice(i, 1); continue; }
      f.step(f.o, k);
    }
  }

  // ---------- частицы (свой пул: плавно каждый кадр) ----------
  private spark(x: number, y: number, vx: number, vy: number, col: number, life: number, s: number, a: number, now: number, grav = 0, add = true) {
    if (this.sparks.length >= L.maxParticles || !this.has("war-dot")) return;
    const o = this.pool.pop() ?? this.sc.add.image(0, 0, "vfx_war-dot");
    o.setVisible(true).setPosition(x, y).setTint(col).setScale(s).setAlpha(0).setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL).setDepth(y + 40);
    this.sparks.push({ o, x, y, vx, vy: vy, t0: now, life, s, a });
    void grav;
  }
  private updateSparks(dt: number, now: number) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i], k = (now - p.t0) / p.life;
      if (k >= 1) { p.o.setVisible(false); this.pool.push(p.o); this.sparks.splice(i, 1); continue; }
      p.vy *= 1 - Math.min(0.9, dt * 0.8);
      p.vx *= 1 - Math.min(0.9, dt * 1.2);
      p.x += p.vx * dt; p.y += p.vy * dt;
      const fade = k < 0.2 ? easeOutQuad(k / 0.2) : 1 - easeInOutSine((k - 0.2) / 0.8);
      p.o.setPosition(p.x, p.y).setAlpha(p.a * fade).setScale(p.s * (1 - 0.4 * k));
    }
  }

  destroy() {
    for (const v of this.views) for (const o of [v.fill, v.ring, v.glow, v.sheen, v.arc, v.head, v.swords, v.mast, v.plinth, v.plate, v.flag, v.fallen, v.label, v.counter]) o?.destroy();
    this.arrow?.destroy(); this.arrowText?.destroy();
    for (const f of this.fx) f.o.destroy();
    for (const p of this.sparks) p.o.destroy();
    for (const o of this.pool) o.destroy();
    this.views = []; this.fx = []; this.sparks = []; this.pool = [];
  }
}
