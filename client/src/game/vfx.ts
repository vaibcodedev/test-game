/** Анимации умений из листов (задача 127): data/skill-fx.json → спрайты поверх частиц.
 *  Листы собирает tools/gen/vfx.ts в assets/vfx/ (manifest.json: размер кадра, fps, якорь, смешивание). 1 пиксель листа = 1 пиксель мира.
 *  Слоты умения: cast — на кастере (у умений «в точку» — в точке), proj — летящий снаряд, hit — у цели, aura — цикл на время эффекта.
 *  Если листа нет (пак не скачан, файл не загрузился), has() возвращает false и effects.ts рисует прежние частицы. */
import Phaser from "phaser";
import type { Fx } from "../../../shared/protocol";
import { SKILLS } from "../../../shared/skills";
import skillFx from "../../../data/skill-fx.json";
import type { UnitView } from "./UnitView";
import { DEPTH } from "./terrain";

/** Плавность листа (tools/gen/vfx.ts): fadeIn/fadeOut — мс появления и выхода (альфа и масштаб от scaleIn до 1, ease-out); loop — кадры, которые
 *  повторяются, пока эффект держится; кадры после loop[1] — финал (закрытие портала, таяние круга); hold — удержание, мс, если длительность не задана. */
export interface Ease { drop?: number; dust?: string; alpha?: number; fadeIn?: number; fadeOut?: number; scaleIn?: number; loop?: [number, number]; hold?: number }
export interface VfxEntry { frameW: number; frameH: number; frames: number; fps: number; anchor: [number, number]; blend: "normal" | "add"; r?: 1; ease?: Ease }
type Slot = "cast" | "proj" | "hit" | "aura";
const TABLE = skillFx as Record<string, Partial<Record<Slot, string>>>;
const key = (id: string) => `vfx_${id}`;

/** Загрузка листов (BootScene.preload): свободные лежат в vfx/, листы закрытых паков — в vfx/r/ (нет файла — нет эффекта). */
export function loadVfx(scene: Phaser.Scene, m: Record<string, VfxEntry>) {
  for (const [id, e] of Object.entries(m)) scene.load.spritesheet(key(id), `/assets/vfx/${e.r ? "r/" : ""}${id}.png`, { frameWidth: e.frameW, frameHeight: e.frameH });
}
/** Анимации по каталогу (BootScene.create): целиком (один проход) и, если есть loop, части — вход `:i`, цикл `:l`, выход `:o`. */
export function makeVfxAnims(scene: Phaser.Scene, m: Record<string, VfxEntry>) {
  for (const [id, e] of Object.entries(m)) {
    if (!scene.textures.exists(key(id))) continue;
    const part = (suffix: string, start: number, end: number, repeat: number) =>
      scene.anims.create({ key: key(id) + suffix, frames: scene.anims.generateFrameNumbers(key(id), { start, end }), frameRate: e.fps, repeat });
    part("", 0, e.frames - 1, 0);
    const lp = e.ease?.loop;
    if (lp) {
      if (lp[0] > 0) part(":i", 0, lp[0] - 1, 0);
      part(":l", lp[0], lp[1], -1);
      if (lp[1] < e.frames - 1) part(":o", lp[1] + 1, e.frames - 1, 0);
    }
  }
}

/** Плоские эффекты на земле (кольца, круги, лужи): рисуются под героями. */
const FLAT = /^(ring-|summon-circle|blood-pool|nova-|holy-nova|shackle|fog-|puff-|smoke-puff|banner-ring)/;
const MAX_ACTIVE = 160;
const FRONT = 0.5; // слой на теле — чуть выше спрайта героя при сортировке по y

interface Running { spr: Phaser.GameObjects.Sprite; stop: () => void }

export class Vfx {
  private free = new Map<string, Phaser.GameObjects.Sprite[]>();
  private active = 0;
  private looping = new Map<string, Running[]>();
  /** Спрайты, привязанные к юниту (ставит сам UnitView после интерполяции и округления, в том же кадре, что и герой). */
  private bound = new Map<Phaser.GameObjects.Sprite, UnitView>();
  /** Когда последний раз прилетал снаряд умения (чтобы взрыв aoe не дублировал попадание снаряда). */
  private projSeen = new Map<string, number>();
  private catalog: Record<string, VfxEntry>;

  constructor(readonly scene: Phaser.Scene, readonly unit: (id: string) => UnitView | undefined) {
    this.catalog = (scene.cache.json.get("vfxm") as Record<string, VfxEntry> | undefined) ?? {};
  }

  has(id: string | undefined): id is string {
    return !!id && !!this.catalog[id] && this.scene.textures.exists(key(id));
  }
  slot(f: Fx, slot: Slot): string | undefined {
    const id = f.s ? TABLE[f.s]?.[slot] : undefined;
    return this.has(id) ? id : undefined;
  }

  // ---------- спрайты ----------
  private ground(id: string) { return FLAT.test(id) || this.catalog[id].anchor[1] >= 0.85; }
  private depthOf(id: string, y: number): number {
    if (FLAT.test(id)) return DEPTH.ground + (/^(fog-|puff-|smoke-puff|blood-pool)/.test(id) ? 9 : 8);
    if (this.catalog[id].anchor[1] >= 0.85) return y;          // стоит на земле (шипы, торнадо, знамя): сортировка по y вместе с героями
    return DEPTH.top - 36;                                      // вспышки и ауры на теле: поверх героя
  }
  private take(id: string): Phaser.GameObjects.Sprite | undefined {
    if (this.active >= MAX_ACTIVE) return undefined;
    const e = this.catalog[id];
    let spr = this.free.get(id)?.pop();
    if (!spr) spr = this.scene.add.sprite(0, 0, key(id));
    this.scene.tweens.killTweensOf(spr);
    spr.setActive(true).setVisible(true).setOrigin(e.anchor[0], e.anchor[1]).setRotation(0).setFlipX(false).setAlpha(1).setScale(1);
    spr.setBlendMode(e.blend === "add" ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    this.active++;
    return spr;
  }
  private release(id: string, spr: Phaser.GameObjects.Sprite) {
    this.scene.tweens.killTweensOf(spr);
    spr.removeAllListeners();
    this.unbind(spr);
    spr.stop();
    spr.setVisible(false).setActive(false);
    this.active = Math.max(0, this.active - 1);
    const list = this.free.get(id) ?? [];
    if (list.length < 12) { list.push(spr); this.free.set(id, list); } else spr.destroy();
  }
  /** Привязка к юниту: позицию ставит UnitView.update (после интерполяции, то же округление, что у спрайта героя), своих твинов позиции нет. */
  private bind(spr: Phaser.GameObjects.Sprite, id: string, u: UnitView) {
    this.unbind(spr);
    this.bound.set(spr, u);
    u.attach(spr, this.ground(id) ? 0 : -(u.frame > 32 ? 30 : 14), FLAT.test(id) ? null : this.ground(id) ? 0.1 : FRONT);
  }
  private unbind(spr: Phaser.GameObjects.Sprite) {
    const u = this.bound.get(spr);
    if (u) { u.detach(spr); this.bound.delete(spr); }
  }
  /** Появление: прозрачность 0→1 и масштаб scaleIn→1 за fadeIn мс, ease-out (кадр после твина — ровно масштаб 1). */
  private fadeIn(spr: Phaser.GameObjects.Sprite, e: Ease | undefined) {
    const a = e?.alpha ?? 1;
    if (!e?.fadeIn) { spr.setAlpha(a); return; }
    spr.setAlpha(0).setScale(e.scaleIn ?? 1);
    this.scene.tweens.add({ targets: spr, alpha: a, scale: 1, duration: e.fadeIn, ease: "Cubic.easeOut" });
  }
  /** Выход: прозрачность 1→0 (и масштаб обратно к scaleIn) за fadeOut мс, затем спрайт возвращается в пул. */
  private fadeOut(id: string, spr: Phaser.GameObjects.Sprite, e: Ease | undefined, then?: () => void) {
    const d = e?.fadeOut ?? 0;
    const done = () => { this.release(id, spr); then?.(); };
    if (!d) { done(); return; }
    this.scene.tweens.killTweensOf(spr);
    this.scene.tweens.add({ targets: spr, alpha: 0, scale: e?.scaleIn ? 0.5 + e.scaleIn / 2 : 1, duration: d, ease: "Cubic.easeIn", onComplete: done });
  }

  /** Один проход анимации в точке (x, y — куда встанет якорь листа). rot — поворот, flip — зеркало по x, unit — привязать к юниту. */
  play(id: string, x: number, y: number, o: { rot?: number; flip?: boolean; onDone?: () => void; unit?: UnitView } = {}): Phaser.GameObjects.Sprite | undefined {
    if (!this.has(id)) return undefined;
    const e = this.catalog[id];
    if (e.ease?.loop) return this.held(id, x, y, e.ease.hold ?? 1000, o);
    const spr = this.take(id);
    if (!spr) return undefined;
    spr.setPosition(Math.round(x), Math.round(y)).setDepth(this.depthOf(id, Math.round(y)));
    if (o.unit) this.bind(spr, id, o.unit);
    if (o.rot) spr.setRotation(o.rot);
    if (o.flip) spr.setFlipX(true);
    this.fadeIn(spr, e.ease);
    spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { this.release(id, spr); o.onDone?.(); });
    spr.play(key(id));
    return spr;
  }
  /** Эффект с удержанием (портал, круг призыва): вход (кадры до loop), цикл на ms миллисекунд, выход (кадры после loop) вместе с растворением. */
  held(id: string, x: number, y: number, ms: number, o: { flip?: boolean; unit?: UnitView } = {}): Phaser.GameObjects.Sprite | undefined {
    const e = this.catalog[id], ez = e.ease!, lp = ez.loop!;
    const spr = this.take(id);
    if (!spr) return undefined;
    spr.setPosition(Math.round(x), Math.round(y)).setDepth(this.depthOf(id, Math.round(y)));
    if (o.unit) this.bind(spr, id, o.unit);
    if (o.flip) spr.setFlipX(true);
    this.fadeIn(spr, ez);
    const loop = () => spr.play(key(id) + ":l");
    if (lp[0] > 0) { spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, loop); spr.play(key(id) + ":i"); } else loop();
    this.scene.time.delayedCall(Math.max(ms, 200), () => {
      if (!spr.active) return;
      spr.removeAllListeners();
      if (lp[1] < e.frames - 1) spr.play(key(id) + ":o");
      this.fadeOut(id, spr, { ...ez, fadeOut: Math.max(ez.fadeOut ?? 0, lp[1] < e.frames - 1 ? (e.frames - 1 - lp[1]) * (1000 / e.fps) : 0) });
    });
    return spr;
  }

  /** Точка «по телу» (body — y на уровне груди) → место якоря: стоящие на земле и плоские эффекты опускаем к ногам. */
  private bodyY(id: string, y: number) { return this.ground(id) ? y + 12 : y; }
  /** Точка на земле → место якоря: эффекты на теле поднимаем к груди. */
  private groundY(id: string, y: number) { return this.ground(id) ? y : y - 10; }
  atBody(id: string, x: number, y: number, flip = false) { return this.play(id, x, this.bodyY(id, y), { flip }); }
  atGround(id: string, x: number, y: number, flip = false) { return this.play(id, x, this.groundY(id, y), { flip }); }
  /** На юните (cast на кастере, hit на цели, метки): идёт за ним, пока играет. */
  atUnit(id: string, u: UnitView, flip = false) {
    if (!this.has(id)) return undefined;
    const lift = u.frame > 32 ? 30 : 14;
    return this.play(id, u.x, this.ground(id) ? u.y : u.y - lift, { flip, unit: u });
  }

  // ---------- циклы ----------
  private stopKey(k: string) { for (const r of this.looping.get(k) ?? []) r.stop(); this.looping.delete(k); }
  /** Цикл на юните: плавно появляется, идёт за ним ms миллисекунд и плавно гаснет (ms <= 0 — снять сейчас). Один на ключ. */
  followUnit(k: string, id: string, unitId: string, ms: number) {
    this.stopKey(k);
    if (ms <= 0 || !this.has(id)) return;
    const u0 = this.unit(unitId);
    if (!u0 || u0.dead) return;
    const spr = this.take(id);
    if (!spr) return;
    const e = this.catalog[id];
    spr.setPosition(Math.round(u0.x), Math.round(u0.y)).setDepth(this.depthOf(id, Math.round(u0.y)));
    this.bind(spr, id, u0);
    this.fadeIn(spr, e.ease);
    spr.play({ key: key(id) + (e.ease?.loop ? ":l" : ""), repeat: -1 });
    // юнит ушёл из видимости или умер — снимаем (позицию ставит UnitView, здесь только проверка живости)
    const watch = this.scene.time.addEvent({ delay: 200, loop: true, callback: () => { const q = this.unit(unitId); if (!q || q.dead) stop(); } });
    const end = this.scene.time.delayedCall(ms, () => stop());
    let done = false;
    const stop = () => {
      if (done) return;
      done = true; watch.remove(); end.remove(false);
      this.fadeOut(id, spr, e.ease);
      const l = this.looping.get(k); if (l) { const i = l.findIndex((r) => r.spr === spr); if (i >= 0) l.splice(i, 1); if (!l.length) this.looping.delete(k); }
    };
    this.looping.set(k, [{ spr, stop }]);
  }
  /** Цикл в круге на земле: стоящий предмет (знамя) — один спрайт в центре; облака и лужи — несколько спрайтов, разложенных по кругу радиуса умения
   *  (золотой угол, эллипс 0.7), не перекрывающих героев сплошной стеной: полупрозрачные, под юнитами, с лёгким покачиванием. Входят и гаснут плавно. */
  zone(k: string, id: string, x: number, y: number, r: number, ms: number) {
    this.stopKey(k);
    if (ms <= 0 || !this.has(id)) return;
    const e = this.catalog[id];
    const single = (e.anchor[1] >= 0.85 && !FLAT.test(id)) || r < e.frameW * 0.6;
    const n = single ? 1 : Math.min(11, Math.max(4, Math.round((r * r) / (e.frameW * e.frameW * 0.8))));
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) { const ang = i * 2.39996, d = single ? 0 : Math.sqrt((i + 0.5) / n) * r * 0.85; pts.push([Math.cos(ang) * d, Math.sin(ang) * d * 0.7]); }
    const list: Running[] = [];
    // кольцо ауры радиуса под штандартом: лист banner-ring-<фракция> того же имени
    const ringId = id.replace(/^banner-/, "banner-ring-");
    if (e.ease?.drop && this.has(ringId)) {
      const ring = this.take(ringId);
      if (ring) {
        ring.setPosition(Math.round(x), Math.round(y)).setDepth(this.depthOf(ringId, Math.round(y)));
        this.fadeIn(ring, this.catalog[ringId].ease);
        ring.play({ key: key(ringId), repeat: -1 });
        let rd = false;
        list.push({ spr: ring, stop: () => { if (rd) return; rd = true; this.fadeOut(ringId, ring, this.catalog[ringId].ease); } });
      }
    }
    for (const [dx, dy] of pts) {
      const spr = this.take(id);
      if (!spr) break;
      const px = Math.round(x + dx), py = Math.round(this.groundY(id, y + dy));
      spr.setPosition(px, py).setDepth(this.depthOf(id, Math.round(y + dy)));
      this.fadeIn(spr, e.ease);
      if (e.ease?.drop) {
        // установка: штандарт падает сверху и пружинит (Bounce), у основания вздымается пыль
        spr.setY(py - e.ease.drop);
        this.scene.tweens.add({ targets: spr, y: py, duration: 380, ease: "Bounce.easeOut" });
        if (e.ease.dust) this.scene.time.delayedCall(170, () => this.play(e.ease!.dust!, px, py));
      }
      spr.play({ key: key(id) + (e.ease?.loop ? ":l" : ""), repeat: -1, startFrame: Math.floor(Math.random() * (e.ease?.loop ? 1 : e.frames)) });
      // лёгкое покачивание облаков (кроме знамени и колец): на 1–2 пикселя по y, позиция каждый кадр целая
      if (!single && !/^ring-|^summon/.test(id)) this.scene.tweens.add({ targets: spr, y: py - 2, duration: 1300 + Math.random() * 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut", onUpdate: () => spr.setY(Math.round(spr.y)) });
      let done = false;
      const stop = () => { if (done) return; done = true; this.fadeOut(id, spr, e.ease); };
      list.push({ spr, stop });
    }
    const end = this.scene.time.delayedCall(ms, () => { for (const r2 of list) r2.stop(); if (this.looping.get(k) === list) this.looping.delete(k); });
    list.push({ spr: list[0]?.spr as Phaser.GameObjects.Sprite, stop: () => end.remove(false) });
    this.looping.set(k, list);
  }

  // ---------- снаряд и цепь ----------
  /** Снаряд-цикл летит из (sx, sy) в (tx, ty) за ms; поворот по направлению. onArrive — попадание. */
  projectile(id: string, sx: number, sy: number, tx: number, ty: number, ms: number, onArrive: () => void) {
    const spr = this.take(id);
    if (!spr) { onArrive(); return; }
    spr.setPosition(Math.round(sx), Math.round(sy)).setDepth(DEPTH.top - 40).setRotation(Math.atan2(ty - sy, tx - sx));
    spr.play({ key: key(id), repeat: -1 });
    this.scene.tweens.add({ targets: spr, x: tx, y: ty, duration: Math.max(60, ms), ease: "Linear", onUpdate: () => spr.setPosition(Math.round(spr.x), Math.round(spr.y)), onComplete: () => { this.release(id, spr); onArrive(); } });
  }
  /** Бесшовная цепь между двумя точками (лист 24×12: тянется вдоль линии), держится ms. */
  line(id: string, x0: number, y0: number, x1: number, y1: number, ms: number) {
    if (!this.has(id)) return;
    const e = this.catalog[id], len = Math.max(8, Math.round(Math.hypot(x1 - x0, y1 - y0)));
    const ts = this.scene.add.tileSprite(Math.round(x0), Math.round(y0), len, e.frameH, key(id), 0).setOrigin(0, 0.5).setRotation(Math.atan2(y1 - y0, x1 - x0)).setDepth(DEPTH.top - 38);
    let fr = 0;
    const tick = this.scene.time.addEvent({ delay: 1000 / e.fps, loop: true, callback: () => { fr = (fr + 1) % e.frames; ts.setFrame(fr); } });
    this.scene.time.delayedCall(ms, () => { tick.remove(); this.scene.tweens.add({ targets: ts, alpha: 0, duration: 160, onComplete: () => ts.destroy() }); });
  }

  // ---------- по сообщениям fx (вызывает Effects) ----------
  /** Пакет fx: «cast» умения — один раз на (умение, кастер). Блинк играет cast/hit сам (начало и конец рывка). */
  batch(list: Fx[]) {
    const seen = new Set<string>();
    for (const f of list) {
      if (!f.s || !f.c) continue;
      const k = `${f.s}|${f.c}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const id = TABLE[f.s]?.cast;
      if (!this.has(id) || list.some((g) => g.t === "blink" && g.s === f.s && g.c === f.c)) continue;
      const caster = this.unit(f.c);
      if (!caster || caster.dead) continue;
      // точка прицела умения: из его же fx (круг, снаряд, рывок)
      let ax: number | undefined, ay: number | undefined;
      for (const g of list) {
        if (g.s !== f.s || g.c !== f.c) continue;
        if (g.t === "aoe" || g.t === "hazard" || g.t === "tele" || g.t === "cone") { ax = g.x; ay = g.y; break; }
        if (g.t === "proj") { ax = g.tx; ay = g.ty; break; }
      }
      const flip = ax !== undefined && ax < caster.x;
      if (SKILLS[f.s]?.target === "point" && ax !== undefined && ay !== undefined) this.atGround(id, ax, ay, flip);
      else this.atUnit(id, caster, flip);
    }
  }

  /** Снаряд умения: свой спрайт вместо частиц (true — Effects рисовать его не нужно). onArrive — попадание. */
  proj(f: Extract<Fx, { t: "proj" }>, sx: number, sy: number, tx: number, ty: number, arrive: () => void): boolean {
    const hit = this.slot(f, "hit");
    if (f.s) this.projSeen.set(f.s, this.scene.time.now);
    const id = this.slot(f, "proj");
    if (!id) return false;
    this.projectile(id, sx, sy, tx, ty, f.ms, () => { if (hit) this.atBody(hit, tx, ty); arrive(); });
    return true;
  }
  /** Попадание обычного снаряда: hit умения вместо искр (true — искры не нужны). */
  projHit(f: Extract<Fx, { t: "proj" }>, tx: number, ty: number): boolean {
    const hit = this.slot(f, "hit");
    if (!hit) return false;
    this.atBody(hit, tx, ty);
    return true;
  }
  /** Круг/взрыв: hit в точке; пока летит снаряд этого умения, hit играет сам снаряд. */
  aoe(f: Extract<Fx, { t: "aoe" }>): boolean {
    const hit = this.slot(f, "hit");
    if (!hit || (f.s && this.scene.time.now - (this.projSeen.get(f.s) ?? -1e9) < 1500)) return !!hit;
    this.atGround(hit, f.x, f.y);
    return true;
  }
  /** Зона на земле (hazard — лужа, огонь, туман; tele — круг): aura умения циклом на ms. true — старый рисунок не нужен. */
  zoneFx(f: Extract<Fx, { t: "hazard" | "tele" }>, id: string): boolean {
    let aura = this.slot(f, "aura");
    if (!aura || (f.t === "tele" && f.shape !== "circle")) return false;
    // штандарт: полотнище по фракции кастера (Сольгард или Умбрат)
    if (/^banner-(solgard|umbrath)$/.test(aura)) {
      const fac = this.unit(f.c ?? "")?.u.faction === "umbrath" ? "umbrath" : "solgard";
      if (this.has(`banner-${fac}`)) aura = `banner-${fac}`;
    }
    this.zone(`${f.s}|${id}`, aura, f.x, f.y, f.r, Math.min(f.ms, 30000));
    return true;
  }
  /** Бафф: aura идёт за юнитом пока висит (ms <= 0 — снять); hit — один раз на юните. true — старые круги и пузыри не нужны. */
  buff(f: Extract<Fx, { t: "buff" }>, u: UnitView): boolean {
    const aura = this.slot(f, "aura"), hit = this.slot(f, "hit");
    if (!aura && !hit) return false;
    if (aura) this.followUnit(`${f.s}|${f.id}`, aura, f.id, f.ms <= 0 ? 0 : Math.min(f.ms, 30000));
    if (hit && f.ms > 0) this.atUnit(hit, u);
    return !!aura;
  }
  /** Цепь: hit на каждом звене кроме первого; proj-цепь — спрайтовая линия по звеньям. true — старая линия не нужна. */
  chain(f: Extract<Fx, { t: "chain" }>): boolean {
    const hit = this.slot(f, "hit"), pid = this.slot(f, "proj");
    for (let i = 2; hit && i < f.pts.length; i += 2) this.atBody(hit, f.pts[i], f.pts[i + 1]);
    if (!pid) return false;
    for (let i = 0; i + 3 < f.pts.length; i += 2) this.line(pid, f.pts[i], f.pts[i + 1], f.pts[i + 2], f.pts[i + 3], 600);
    return true;
  }
  /** Рывок/мерцание: cast в начале, hit в конце. true — вспышки частицами не нужны. */
  blink(f: Extract<Fx, { t: "blink" }>): boolean {
    const cast = this.slot(f, "cast"), hit = this.slot(f, "hit");
    if (!cast && !hit) return false;
    if (cast) this.atGround(cast, f.x0, f.y0);
    if (hit) this.atGround(hit, f.x1, f.y1);
    return true;
  }
}
