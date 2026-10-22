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
import { afx } from "./auraFx";

/** Плавность листа (tools/gen/vfx.ts): fadeIn/fadeOut — мс появления и выхода (альфа и масштаб от scaleIn до 1, ease-out); loop — кадры, которые
 *  повторяются, пока эффект держится; кадры после loop[1] — финал (закрытие портала, таяние круга); hold — удержание, мс, если длительность не задана;
 *  tail — у разового эффекта: последние tail мс он растворяется (ease-in), чтобы не обрываться на последнем кадре. */
export interface Ease { drop?: number; dust?: string; alpha?: number; fadeIn?: number; fadeOut?: number; scaleIn?: number; loop?: [number, number]; hold?: number; tail?: number }
/** Орбита ауры (рунный клинок, tools/gen/vfx-gen2.ts): лист — сами предметы (кадры 0..n-1), ореолы (n..2n-1, add) и блики (2n..3n-1);
 *  позиции считаются каждый кадр. Пиксели мира: полуоси rx/ry, oy — центр от ног спрайта; мс: период оборота, покачивания, мерцания, блика;
 *  glow — альфа ореола (мин, макс), back — яркость самой дальней точки орбиты. */
export interface Orbit { n: number; rx: number; ry: number; oy: number; period: number; bob: number; bobPeriod: number; glow: [number, number]; glowPeriod: number; back: number; twinkle: number }
/** scale — масштаб спрайта: 0.5 — арт двойной плотности (пиксель листа = пиксель холста при зуме 2), 1/3 — тройной (при зуме 3). */
export interface VfxEntry { frameW: number; frameH: number; frames: number; fps: number; anchor: [number, number]; blend: "normal" | "add"; r?: 1; ease?: Ease; scale?: number; orbit?: Orbit }
type Slot = "cast" | "proj" | "hit" | "aura";
const TABLE = skillFx as Record<string, Partial<Record<Slot, string>>>;
const key = (id: string) => `vfx_${id}`;

/** Лист и целый масштаб для арта нескольких плотностей (d — пикселей листа на пиксель мира) при зуме камеры z: пиксель листа — k пикселей
 *  холста (ровные пиксели), размер в мире ближе всего к задуманному (d·k = z — точно: зум 2 и 4 — двойной лист, 3 и 6 — тройной);
 *  при равной ошибке — не крупнее, затем лист плотнее. */
export function pickDensity(z: number, sheets: { id: string; d: number }[]): { id: string; k: number } {
  let best = { id: sheets[0].id, k: 1 }, be = Infinity;
  for (const s of sheets) for (let k = 1; k <= Math.max(1, Math.ceil(z)); k++) {
    const r = (s.d * k) / z, e = Math.abs(r - 1) + (r > 1 ? 1e-3 : 0) - s.d * 1e-6;
    if (e < be) { be = e; best = { id: s.id, k }; }
  }
  return best;
}

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

/** Плоские эффекты на земле (кольца, круги, лужи, нижние слои ударов <id>-ground): рисуются под героями. */
const FLAT = /^(ring-|summon-circle|blood-pool|nova-|holy-nova|shackle|fog-|puff-|smoke-puff|banner-ring|quake-)|-ground$/;
const MAX_ACTIVE = 160;
const FRONT = 0.5; // слой на теле — чуть выше спрайта героя при сортировке по y

/** Конец эффекта с длительностью (Vfx.after): cancel — снять, не вызывая; extend — перенести конец на ms от сейчас
 *  (перекаст щита, рун, знамени продлевает цикл, а не перезапускает его); false — конец уже наступил или снят. */
export interface Deadline { cancel(): void; extend(ms: number): boolean }
/** Конец пришёл позже срока больше чем на столько мс (вкладка была скрыта, кадров не было) — эффект давно истёк: снимать сразу, без растворения. */
export const LATE_MS = 250;

/** Цикл на ключ (looping): stop(late) — снять; late — на сколько мс конец опоздал (больше LATE_MS — без растворения). */
interface Running { spr: Phaser.GameObjects.Sprite; stop: (late?: number) => void }

export class Vfx {
  private free = new Map<string, Phaser.GameObjects.Sprite[]>();
  private active = 0;
  private looping = new Map<string, Running[]>();
  /** Спрайты, привязанные к юниту (ставит сам UnitView после интерполяции и округления, в том же кадре, что и герой). */
  private bound = new Map<Phaser.GameObjects.Sprite, UnitView>();
  /** Когда последний раз прилетал снаряд умения (чтобы взрыв aoe не дублировал попадание снаряда). */
  private projSeen = new Map<string, number>();
  /** Когда умение (умение|кастер) сыграло или сыграет своё попадание: снаряд — в момент прилёта, круг и цепь — сразу.
   *  Бафф или дебафф того же умения рядом по времени (провокация от «Молота правосудия», оглушение от «Удара щитом»)
   *  попадание второй раз не играет — иначе одна анимация удара шла дважды. */
  private hitAt = new Map<string, number>();
  private markHit(f: Fx, at = this.scene.time.now) { if (f.s) this.hitAt.set(`${f.s}|${f.c ?? ""}`, at); }
  private hitRecent(f: Fx) { return !!f.s && Math.abs(this.scene.time.now - (this.hitAt.get(`${f.s}|${f.c ?? ""}`) ?? -1e9)) < 900; }
  /** Когда умение (умение|кастер) последний раз играло cast: отложенные fx того же умения (w.later) приходят отдельным пакетом. */
  private castAt = new Map<string, number>();
  private catalog: Record<string, VfxEntry>;

  /** Часы концов эффектов — настоящее время, не часы сцены: пока вкладка скрыта, Phaser не даёт кадров, а после возврата (TimeStep.resume →
   *  resetDelta) часы сцены, delayedCall и твины идут с места остановки — знамя и щит досиживали остаток уже после возврата; при потере фокуса
   *  smoothDelta ещё и режет шаг до кадра. Тест с ручным временем подменяет now на свои часы. */
  readonly clock = { now: () => performance.now() };
  private deadlines = new Set<{ at: number; fn: (late: number) => void }>();
  /** Истёкшие концы: каждый кадр после update сцены и сразу при возврате во вкладку (Core.Events.RESUME) — до первого кадра. */
  private tickDeadlines = () => {
    if (!this.deadlines.size) return;
    const now = this.clock.now();
    for (const d of [...this.deadlines]) if (d.at <= now && this.deadlines.delete(d)) d.fn(now - d.at);
  };

  constructor(readonly scene: Phaser.Scene, readonly unit: (id: string) => UnitView | undefined) {
    this.catalog = (scene.cache.json.get("vfxm") as Record<string, VfxEntry> | undefined) ?? {};
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.tickDeadlines);
    scene.game.events.on(Phaser.Core.Events.RESUME, this.tickDeadlines);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.tickDeadlines);
      scene.game.events.off(Phaser.Core.Events.RESUME, this.tickDeadlines);
      this.deadlines.clear();
    });
  }

  /** Конец эффекта через ms мс настоящего времени: fn(late) — в первом кадре после срока, после скрытой вкладки — сразу при возврате;
   *  late — опоздание, мс (больше LATE_MS — снимать без растворения). Для всех концов длиннее ~300 мс вместо scene.time.delayedCall. */
  after(ms: number, fn: (late: number) => void): Deadline {
    const d = { at: this.clock.now() + ms, fn };
    this.deadlines.add(d);
    return {
      cancel: () => { this.deadlines.delete(d); },
      extend: (ms2: number) => { if (!this.deadlines.has(d)) return false; d.at = this.clock.now() + ms2; return true; },
    };
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
    spr.setActive(true).setVisible(true).setOrigin(e.anchor[0], e.anchor[1]).setRotation(0).setFlipX(false).setAlpha(1).setScale(e.scale ?? 1).clearTint();
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
  private bind(spr: Phaser.GameObjects.Sprite, id: string, u: UnitView, dz?: number) {
    this.unbind(spr);
    this.bound.set(spr, u);
    u.attach(spr, this.ground(id) ? 0 : -(u.frame > 32 ? 30 : 14), dz ?? (FLAT.test(id) ? null : this.ground(id) ? 0.1 : FRONT), !this.ground(id));
  }
  private unbind(spr: Phaser.GameObjects.Sprite) {
    const u = this.bound.get(spr);
    if (u) { u.detach(spr); this.bound.delete(spr); }
  }
  /** Появление: прозрачность 0→1 и масштаб scaleIn→1 за fadeIn мс, ease-out (кадр после твина — ровно масштаб листа, его ставит take). */
  private fadeIn(spr: Phaser.GameObjects.Sprite, e: Ease | undefined) {
    const a = e?.alpha ?? 1, s = spr.scaleX;
    if (!e?.fadeIn) { spr.setAlpha(a); return; }
    spr.setAlpha(0).setScale(s * (e.scaleIn ?? 1));
    this.scene.tweens.add({ targets: spr, alpha: a, scale: s, duration: e.fadeIn, ease: "Cubic.easeOut" });
  }
  /** Выход: прозрачность 1→0 (и масштаб обратно к scaleIn) за fadeOut мс, затем спрайт возвращается в пул. */
  private fadeOut(id: string, spr: Phaser.GameObjects.Sprite, e: Ease | undefined, then?: () => void) {
    const d = e?.fadeOut ?? 0;
    const done = () => { this.release(id, spr); then?.(); };
    if (!d) { done(); return; }
    this.scene.tweens.killTweensOf(spr);
    const s = this.catalog[id]?.scale ?? 1;
    this.scene.tweens.add({ targets: spr, alpha: 0, scale: s * (e?.scaleIn ? 0.5 + e.scaleIn / 2 : 1), duration: d, ease: "Cubic.easeIn", onComplete: done });
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
    // tail: последние мс разового эффекта — растворение к последнему кадру, без обрыва (твин с задержкой снимет release, если спрайт уйдёт раньше)
    const tail = e.ease?.tail;
    if (tail) this.scene.tweens.add({ targets: spr, alpha: 0, delay: Math.max(0, (e.frames * 1000) / e.fps - tail), duration: tail, ease: "Quad.easeIn" });
    spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { this.release(id, spr); o.onDone?.(); });
    spr.play(key(id));
    // нижний слой удара (лист <id>-ground: печать и волна по земле) — под юнитами, в той же точке и в такт верхнему
    if (this.has(`${id}-ground`)) this.play(`${id}-ground`, x, y, { flip: o.flip });
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
    this.after(Math.max(ms, 200), (late) => {
      if (!spr.active) return;
      spr.removeAllListeners();
      if (late > LATE_MS) { this.release(id, spr); return; }
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
  /** Циклы, начатые бафами одного вида на юните (`${вид}|${юнит}` → ключи циклов): снять по виду можно, не зная умения-источника. */
  private byKind = new Map<string, Set<string>>();
  private remember(kind: string, k: string) { let s = this.byKind.get(kind); if (!s) this.byKind.set(kind, (s = new Set())); s.add(k); }
  private forget(kind: string, k: string) { const s = this.byKind.get(kind); if (s) { s.delete(k); if (!s.size) this.byKind.delete(kind); } }
  /** buff с ms <= 0 (щит пробит, вихрь прерван, эффект снят): убрать циклы-ауры. С меткой умения и живым циклом этого умения на юните — только его
   *  (вид `enrage` делят несколько умений); иначе — все циклы этого вида на юните (пробитый щит приходит без метки умения-источника). true — что-то снято. */
  endBuff(f: Extract<Fx, { t: "buff" }>): boolean {
    const exact = f.s ? `${f.s}|${f.id}` : "";
    if (exact && this.looping.has(exact)) { this.stopKey(exact); return true; }
    const kind = `${f.k}|${f.id}`, keys = this.byKind.get(kind);
    if (!keys) return false;
    let any = false;
    for (const k of [...keys]) if (this.looping.has(k)) { this.stopKey(k); any = true; }
    this.byKind.delete(kind);
    return any;
  }
  /** Цикл на юните: плавно появляется, идёт за ним ms миллисекунд и плавно гаснет (ms <= 0 — снять сейчас). Один на ключ. kind — вид бафа (для endBuff). */
  followUnit(k: string, id: string, unitId: string, ms: number, kind?: string) {
    this.stopKey(k);
    if (ms <= 0 || !this.has(id)) return;
    const u0 = this.unit(unitId);
    if (!u0 || u0.dead) return;
    if (this.catalog[id].orbit) { this.orbit(k, id, unitId, ms, kind); return; }
    const spr = this.take(id);
    if (!spr) return;
    const e = this.catalog[id];
    spr.setPosition(Math.round(u0.x), Math.round(u0.y)).setDepth(this.depthOf(id, Math.round(u0.y)));
    this.bind(spr, id, u0);
    this.fadeIn(spr, e.ease);
    spr.play({ key: key(id) + (e.ease?.loop ? ":l" : ""), repeat: -1 });
    // задний слой ауры (лист <id>-back, например орбита рун): под героем, та же орбита и кадры
    const backId = `${id}-back`, back = this.has(backId) ? this.take(backId) : undefined;
    if (back) {
      back.setPosition(Math.round(u0.x), Math.round(u0.y)).setDepth(this.depthOf(backId, Math.round(u0.y)));
      this.bind(back, backId, u0, -0.5);
      this.fadeIn(back, this.catalog[backId].ease);
      back.play({ key: key(backId), repeat: -1 });
    }
    // юнит ушёл из видимости или умер — снимаем (позицию ставит UnitView, здесь только проверка живости)
    const watch = this.scene.time.addEvent({ delay: 200, loop: true, callback: () => { const q = this.unit(unitId); if (!q || q.dead) stop(); } });
    const end = this.after(ms, (late) => stop(late));
    let done = false;
    const stop = (late = 0) => {
      if (done) return;
      done = true; watch.remove(); end.cancel();
      // истёк, пока вкладка была скрыта, — без растворения
      const ez = late > LATE_MS ? undefined : e.ease;
      this.fadeOut(id, spr, ez);
      if (back) this.fadeOut(`${id}-back`, back, late > LATE_MS ? undefined : this.catalog[`${id}-back`].ease);
      const l = this.looping.get(k); if (l) { const i = l.findIndex((r) => r.spr === spr); if (i >= 0) l.splice(i, 1); if (!l.length) this.looping.delete(k); }
      if (kind) this.forget(kind, k);
    };
    this.looping.set(k, [{ spr, stop }]);
    if (kind) this.remember(kind, k);
  }
  /** Орбита (рунный клинок): n предметов кружат вокруг пояса юнита. Позиции считаются каждый кадр после UnitView.update (событие postupdate):
   *  угол = время × скорость, эллипс rx×ry, покачивание по синусу у каждой руны своё; руна спереди (sin > 0) над героем, сзади — под ним,
   *  слой меняется у краёв орбиты, яркость плавно падает к дальней точке. Координаты — до пикселя холста (1/zoom пикселя мира); лист и масштаб —
   *  pickDensity: пиксель листа — целое число пикселей холста, руна 7×8 пикселей мира (зум 2 и 4 — лист двойной плотности, 3 и 6 — тройной <id>-x3).
   *  Вход и выход: альфа, масштаб и радиус за fadeIn/fadeOut мс (ease-out и ease-in), руны выходят из тела и уходят в него. */
  private orbit(k: string, id: string, unitId: string, ms: number, kind?: string) {
    const e = this.catalog[id], o = e.orbit!;
    // листы одного рисунка разной плотности (основной и <id>-x3): выбор по зуму камеры, смена зума колесом — смена листа на лету
    const sheets = [id, `${id}-x3`].filter((s) => this.has(s)).map((s) => ({ id: s, d: Math.round(1 / (this.catalog[s].scale ?? 1)) }));
    let cur = id, curZ = -1, pick = { id, k: 1 };
    const runes: { body: Phaser.GameObjects.Sprite; halo?: Phaser.GameObjects.Sprite; glint?: Phaser.GameObjects.Sprite }[] = [];
    for (let i = 0; i < o.n; i++) {
      const body = this.take(id);
      if (!body) break;
      body.setFrame(i);
      const halo = this.take(id)?.setFrame(o.n + i).setBlendMode(Phaser.BlendModes.ADD);
      const glint = this.take(id)?.setFrame(2 * o.n + i);
      runes.push({ body, halo, glint });
    }
    if (!runes.length) return;
    const fadeIn = e.ease?.fadeIn ?? 350, fadeOut = e.ease?.fadeOut ?? 350, s0 = e.ease?.scaleIn ?? 0.6;
    const t0 = this.scene.time.now, a0 = Math.random() * Math.PI * 2;
    let outAt = -1, visOut = 1, vis = 0, cx = 0, cy = 0, dy0 = 0, gone = false;
    const step = () => {
      if (gone) return;                                         // снят в этом же кадре (конец из tickDeadlines раньше шага)
      const now = this.scene.time.now, u = this.unit(unitId);
      if (outAt < 0 && (!u || u.dead)) stop();
      if (outAt >= 0) {
        const q = Math.min(1, (now - outAt) / fadeOut);
        if (q >= 1) { finish(); return; }
        vis = visOut * (1 - q * q * q);                       // ease-in
      } else vis = 1 - (1 - Math.min(1, (now - t0) / fadeIn)) ** 3;   // ease-out
      if (u && !u.dead) { cx = u.sprite.x; cy = u.sprite.y + (o.oy * u.frame) / 32; dy0 = u.y; }
      const z = this.scene.cameras.main.zoom || 1, px = (v: number) => Math.round(v * z) / z;
      if (z !== curZ) { curZ = z; pick = pickDensity(z, sheets); }
      if (pick.id !== cur) {
        // тот же кадр в другом листе: позиции считаются в пикселях мира, размер в мире тот же — переключение без рывка
        cur = pick.id;
        runes.forEach((r, i) => { r.body.setTexture(key(cur), i); r.halo?.setTexture(key(cur), o.n + i); r.glint?.setTexture(key(cur), 2 * o.n + i); });
      }
      const sc = (pick.k / z) * (s0 + (1 - s0) * vis), R = 0.5 + 0.5 * vis;
      runes.forEach((r, i) => {
        const a = a0 + ((now - t0) / o.period) * Math.PI * 2 + (i * Math.PI * 2) / runes.length, sn = Math.sin(a);
        const bob = Math.sin((now / o.bobPeriod) * Math.PI * 2 + i * 2.3) * o.bob;
        // глубина: спереди — над доспехом (GearLayers.front +0.5) и передом маунта (+0.4), сзади — под плащом (-0.1) и задом маунта (-0.5)
        const x = px(cx + Math.cos(a) * o.rx * R), y = px(cy + sn * o.ry * R + bob), d = dy0 + (sn >= 0 ? 0.6 : -0.6);
        const f = 1 - ((1 - o.back) * (1 - sn)) / 2, c = (v: number) => Math.round(Math.min(1, v) * 255);
        r.body.setPosition(x, y).setScale(sc).setDepth(d).setAlpha(vis).setTint((c(f * 0.92) << 16) | (c(f * 0.97) << 8) | c(f));
        const g = o.glow[0] + (o.glow[1] - o.glow[0]) * (0.5 + 0.5 * Math.sin((now / o.glowPeriod) * Math.PI * 2 + i * 1.7));
        r.halo?.setPosition(x, y).setScale(sc).setDepth(d + 0.01).setAlpha(vis * g * (0.45 + (0.55 * (sn + 1)) / 2));
        const tw = Math.max(0, Math.sin((now / o.twinkle) * Math.PI * 2 + i * 2.6)) ** 12;
        r.glint?.setPosition(x, y).setScale(sc).setDepth(d + 0.02).setAlpha(vis * tw * Math.max(0, sn * 0.6 + 0.4));
      });
    };
    const off = () => this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, step);
    const end = this.after(ms, (late) => stop(late));
    const stop = (late = 0) => {
      if (outAt >= 0) return;
      outAt = this.scene.time.now; visOut = vis; end.cancel();
      const l = this.looping.get(k); if (l) { const j = l.findIndex((q) => q.spr === runes[0].body); if (j >= 0) l.splice(j, 1); if (!l.length) this.looping.delete(k); }
      if (kind) this.forget(kind, k);
      if (late > LATE_MS) finish();                             // истёк, пока вкладка была скрыта, — без растворения
    };
    const finish = () => {
      if (gone) return;
      gone = true;
      off();
      this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, off);
      // в пул спрайты уходят с основным листом (пул общий по id)
      for (const r of runes) for (const s of [r.body, r.halo, r.glint]) if (s) { if (cur !== id) s.setTexture(key(id), 0); this.release(id, s); }
    };
    this.scene.events.on(Phaser.Scenes.Events.POST_UPDATE, step);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    step();
    this.looping.set(k, [{ spr: runes[0].body, stop }]);
    if (kind) this.remember(kind, k);
  }
  /** Цикл в круге на земле: стоящий предмет (знамя) — один спрайт в центре; облака и лужи — несколько спрайтов, разложенных по кругу радиуса умения
   *  (золотой угол; круг, а не эллипс — сервер мерит Math.hypot, задача 133), не перекрывающих героев сплошной стеной: полупрозрачные, под юнитами,
   *  с лёгким покачиванием. Входят и гаснут плавно. */
  zone(k: string, id: string, x: number, y: number, r: number, ms: number) {
    this.stopKey(k);
    if (ms <= 0 || !this.has(id)) return;
    const e = this.catalog[id];
    const single = (e.anchor[1] >= 0.85 && !FLAT.test(id)) || r < e.frameW * 0.6;
    const n = single ? 1 : Math.min(11, Math.max(4, Math.round((r * r) / (e.frameW * e.frameW * 0.8))));
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) { const ang = i * 2.39996, d = single ? 0 : Math.sqrt((i + 0.5) / n) * r * 0.85; pts.push([Math.cos(ang) * d, Math.sin(ang) * d]); }
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
        list.push({ spr: ring, stop: (late = 0) => { if (rd) return; rd = true; this.fadeOut(ringId, ring, late > LATE_MS ? undefined : this.catalog[ringId].ease); } });
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
      const stop = (late = 0) => { if (done) return; done = true; this.fadeOut(id, spr, late > LATE_MS ? undefined : e.ease); };
      list.push({ spr, stop });
    }
    const end = this.after(ms, (late) => { for (const r2 of list) r2.stop(late); if (this.looping.get(k) === list) this.looping.delete(k); });
    list.push({ spr: list[0]?.spr as Phaser.GameObjects.Sprite, stop: () => end.cancel() });
    this.looping.set(k, list);
  }

  // ---------- снаряд и цепь ----------
  /** Снаряд-цикл летит из (sx, sy) в (tx, ty) за ms; поворот по направлению. onArrive — попадание. */
  projectile(id: string, sx: number, sy: number, tx: number, ty: number, ms: number, onArrive: () => void) {
    const spr = this.take(id);
    if (!spr) { onArrive(); return; }
    // позиция — до пикселя холста (1/zoom пикселя мира): при зуме 3 шаг в целый пиксель мира — это рывки по 3 пикселя экрана
    const z = this.scene.cameras.main.zoom || 1, px = (v: number) => Math.round(v * z) / z;
    spr.setPosition(px(sx), px(sy)).setDepth(DEPTH.top - 40).setRotation(Math.atan2(ty - sy, tx - sx));
    this.fadeIn(spr, this.catalog[id].ease);
    spr.play({ key: key(id), repeat: -1 });
    this.scene.tweens.add({ targets: spr, x: tx, y: ty, duration: Math.max(60, ms), ease: "Linear", onUpdate: () => spr.setPosition(px(spr.x), px(spr.y)), onComplete: () => { this.release(id, spr); onArrive(); } });
  }
  /** Бесшовная цепь между двумя точками (лист 24×12: тянется вдоль линии), держится ms. */
  line(id: string, x0: number, y0: number, x1: number, y1: number, ms: number) {
    if (!this.has(id)) return;
    const e = this.catalog[id], len = Math.max(8, Math.round(Math.hypot(x1 - x0, y1 - y0)));
    const ts = this.scene.add.tileSprite(Math.round(x0), Math.round(y0), len, e.frameH, key(id), 0).setOrigin(0, 0.5).setRotation(Math.atan2(y1 - y0, x1 - x0)).setDepth(DEPTH.top - 38);
    let fr = 0;
    const tick = this.scene.time.addEvent({ delay: 1000 / e.fps, loop: true, callback: () => { fr = (fr + 1) % e.frames; ts.setFrame(fr); } });
    this.after(ms, (late) => {
      tick.remove();
      if (late > LATE_MS) ts.destroy();
      else this.scene.tweens.add({ targets: ts, alpha: 0, duration: 160, onComplete: () => ts.destroy() });
    });
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
      // отложенные fx того же каста (удар после полёта, повтор урона) — без второго cast
      const now = this.scene.time.now;
      if (now - (this.castAt.get(k) ?? -1e9) < 900) continue;
      this.castAt.set(k, now);
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
    if (hit) this.markHit(f, this.scene.time.now + f.ms);
    this.projectile(id, sx, sy, tx, ty, f.ms, () => { if (hit) this.atBody(hit, tx, ty); arrive(); });
    return true;
  }
  /** Попадание обычного снаряда: hit умения вместо искр (true — искры не нужны). */
  projHit(f: Extract<Fx, { t: "proj" }>, tx: number, ty: number): boolean {
    const hit = this.slot(f, "hit");
    if (!hit) return false;
    this.markHit(f);
    this.atBody(hit, tx, ty);
    return true;
  }
  /** Круг/взрыв: hit в точке; пока летит снаряд этого умения, hit играет сам снаряд. */
  aoe(f: Extract<Fx, { t: "aoe" }>): boolean {
    const hit = this.slot(f, "hit");
    if (!hit || (f.s && this.scene.time.now - (this.projSeen.get(f.s) ?? -1e9) < 1500)) return !!hit;
    this.markHit(f);
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
    if (f.ms <= 0) return this.endBuff(f);
    const aura = this.slot(f, "aura"), hit = this.slot(f, "hit");
    // постоянную картинку многих бафов теперь рисует обозначение на юните по Unit.fx (game/auraFx.ts): цикл aura из таблицы, старые пузыри
    // и круги под ногами для них не нужны (вспышка hit остаётся)
    const own = afx.covers(f.k);
    if (!aura && !hit) return own;
    if (aura && !afx.replaces(aura)) this.followUnit(`${f.s}|${f.id}`, aura, f.id, Math.min(f.ms, 30000), `${f.k}|${f.id}`);
    if (hit && f.ms > 0 && !this.hitRecent(f)) this.atUnit(hit, u);
    return !!aura || own;
  }
  /** Цепь: hit на каждом звене кроме первого; proj-цепь — спрайтовая линия по звеньям. true — старая линия не нужна. */
  chain(f: Extract<Fx, { t: "chain" }>): boolean {
    const hit = this.slot(f, "hit"), pid = this.slot(f, "proj");
    if (hit) this.markHit(f);
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
