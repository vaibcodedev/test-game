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

/** Плавность листа (tools/gen/vfx.ts): fadeIn/fadeOut — мс появления и выхода (только альфа: масштаб пиксель-арта не твинится — пиксели «ползут»);
 *  без них — умолчания по роли (DEF); loop — кадры, которые повторяются, пока эффект держится; кадры после loop[1] — финал (закрытие портала,
 *  таяние круга); hold — удержание, мс, если длительность не задана; tail — у разового эффекта: последние tail мс он растворяется, чтобы не
 *  обрываться на последнем кадре (без tail — fadeOut или кадр, не больше 100 мс). aura — цикл ауры отдельно от удара: loop — кадры цикла,
 *  yoyo — туда и обратно, every — без цикла: разовая анимация на юните каждые every мс. scaleIn в данных остался, код его не читает. */
export interface Ease { drop?: number; dust?: string; alpha?: number; fadeIn?: number; fadeOut?: number; scaleIn?: number; loop?: [number, number]; hold?: number; tail?: number; aura?: { loop?: [number, number]; yoyo?: boolean; every?: number } }
/** Роль спрайта — умолчания появления и выхода, мс: вспышка удара — сразу (рисунок сам входит), каст — чуть мягче, снаряд проявляется и гаснет,
 *  ауры и цепи входят и растворяются. */
type Role = "hit" | "cast" | "proj" | "aura" | "line";
const DEF: Record<Role, readonly [number, number]> = { hit: [0, 0], cast: [50, 0], proj: [60, 100], aura: [180, 220], line: [80, 200] };
/** Снять без растворения (конец пришёл после скрытой вкладки). */
const NOW: Ease = { fadeOut: 0 };
type P = { x: number; y: number };
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
    // цикл ауры (ease.aura): свои кадры цикла и/или туда-обратно, отдельно от разового прохода
    const au = e.ease?.aura;
    if (au?.loop || au?.yoyo) scene.anims.create({ key: key(id) + ":a", frames: scene.anims.generateFrameNumbers(key(id), { start: au.loop?.[0] ?? 0, end: au.loop?.[1] ?? e.frames - 1 }), frameRate: e.fps, repeat: -1, yoyo: !!au.yoyo });
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

/** Цикл на ключ (looping): stop(late) — снять; late — на сколько мс конец опоздал (больше LATE_MS — без растворения);
 *  id — лист цикла, extend(ms) — продлить тот же цикл (перекаст), false — цикл уже гаснет или его вид сменился. */
interface Running { spr?: Phaser.GameObjects.Sprite; stop: (late?: number) => void; id?: string; extend?: (ms: number) => boolean }
/** Анимация цикла ауры: ease.aura (свой цикл), иначе loop листа, иначе весь лист. */
const auraKey = (id: string, e: VfxEntry) => key(id) + (e.ease?.aura?.loop || e.ease?.aura?.yoyo ? ":a" : e.ease?.loop ? ":l" : "");

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
    spr.setActive(true).setVisible(true).setOrigin(e.anchor[0], e.anchor[1]).setRotation(0).setFlipX(false).setFlipY(false).setAlpha(1).setScale(e.scale ?? 1).clearTint();
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
  /** Движущийся спрайт (снаряд, руна) — шагом в пиксель холста (1/zoom пикселя мира): при roundPixels Phaser отбрасывает дробь позиции спрайта
   *  (MultiPipeline: floor x, y), поэтому дробь до пикселя холста уходит в displayOrigin с учётом поворота. Звать после setRotation/setScale. */
  private place(spr: Phaser.GameObjects.Sprite, id: string, x: number, y: number) {
    const e = this.catalog[id], z = this.scene.cameras.main.zoom || 1, nx = Math.round(x * z), ny = Math.round(y * z);
    const ix = Math.floor(nx / z), iy = Math.floor(ny / z), fx = (nx - ix * z) / z, fy = (ny - iy * z) / z, c = Math.cos(spr.rotation), s = Math.sin(spr.rotation);
    spr.setPosition(ix, iy).setDisplayOrigin(e.anchor[0] * e.frameW - (fx * c + fy * s) / spr.scaleX, e.anchor[1] * e.frameH - (fy * c - fx * s) / spr.scaleY);
  }
  /** Появление: только прозрачность 0→alpha за fadeIn мс (без него — умолчание роли), Sine.easeOut; 0 — сразу. */
  private fadeIn(spr: Phaser.GameObjects.Sprite, e: Ease | undefined, role: Role) {
    const a = e?.alpha ?? 1, d = e?.fadeIn ?? DEF[role][0];
    if (!d) { spr.setAlpha(a); return; }
    spr.setAlpha(0);
    this.scene.tweens.add({ targets: spr, alpha: a, duration: d, ease: "Sine.easeOut" });
  }
  /** Выход: прозрачность → 0 за fadeOut мс (без него — умолчание роли; NOW — сразу), затем спрайт возвращается в пул. */
  private fadeOut(id: string, spr: Phaser.GameObjects.Sprite, e: Ease | undefined, role: Role, then?: () => void, ease = "Quad.easeOut") {
    const d = e?.fadeOut ?? DEF[role][1];
    const done = () => { this.release(id, spr); then?.(); };
    if (!d) { done(); return; }
    this.scene.tweens.killTweensOf(spr);
    this.scene.tweens.add({ targets: spr, alpha: 0, duration: d, ease, onComplete: done });
  }
  /** Зеркало по x: якорь отражается вместе с рисунком (точка удара на краю кадра остаётся в точке). */
  private mirror(spr: Phaser.GameObjects.Sprite, id: string) { const a = this.catalog[id].anchor; spr.setOrigin(1 - a[0], a[1]).setFlipX(true); }

  /** Один проход анимации в точке (x, y — куда встанет якорь листа). rot — поворот, flip — зеркало по x, unit — привязать к юниту,
   *  role — умолчания появления (DEF). Конец — хвост: последние tail мс прозрачность уходит в 0, эффект не обрывается на последнем кадре. */
  play(id: string, x: number, y: number, o: { rot?: number; flip?: boolean; onDone?: () => void; unit?: UnitView; role?: Role } = {}): Phaser.GameObjects.Sprite | undefined {
    if (!this.has(id)) return undefined;
    const e = this.catalog[id], role = o.role ?? "hit";
    if (e.ease?.loop) return this.held(id, x, y, e.ease.hold ?? 1000, o);
    const spr = this.take(id);
    if (!spr) return undefined;
    spr.setPosition(Math.round(x), Math.round(y)).setDepth(this.depthOf(id, Math.round(y)));
    if (o.unit) this.bind(spr, id, o.unit);
    if (o.rot) spr.setRotation(o.rot);
    if (o.flip) this.mirror(spr, id);
    this.fadeIn(spr, e.ease, role);
    // хвост: tail (или fadeOut, или кадр, не больше 100 мс) — после появления, к концу последнего кадра (твин снимет release, если спрайт уйдёт раньше)
    const total = (e.frames * 1000) / e.fps, tail = e.ease?.tail ?? e.ease?.fadeOut ?? Math.min(100, 1000 / e.fps);
    const at = Math.max(e.ease?.fadeIn ?? DEF[role][0], total - tail);
    this.scene.tweens.add({ targets: spr, alpha: 0, delay: at, duration: Math.max(1, total - at), ease: "Quad.easeOut" });
    spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { this.release(id, spr); o.onDone?.(); });
    spr.play(key(id));
    // нижний слой удара (лист <id>-ground: печать и волна по земле) — под юнитами, в той же точке и в такт верхнему
    if (this.has(`${id}-ground`)) this.play(`${id}-ground`, x, y, { flip: o.flip, role });
    return spr;
  }
  /** Эффект с удержанием (портал, круг призыва): вход (кадры до loop), цикл на ms миллисекунд, выход (кадры после loop) вместе с растворением. */
  held(id: string, x: number, y: number, ms: number, o: { flip?: boolean; unit?: UnitView; role?: Role } = {}): Phaser.GameObjects.Sprite | undefined {
    const e = this.catalog[id], ez = e.ease!, lp = ez.loop!, role = o.role ?? "cast";
    const spr = this.take(id);
    if (!spr) return undefined;
    spr.setPosition(Math.round(x), Math.round(y)).setDepth(this.depthOf(id, Math.round(y)));
    if (o.unit) this.bind(spr, id, o.unit);
    if (o.flip) this.mirror(spr, id);
    this.fadeIn(spr, ez, role);
    const loop = () => spr.play(key(id) + ":l");
    if (lp[0] > 0) { spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, loop); spr.play(key(id) + ":i"); } else loop();
    this.after(Math.max(ms, 200), (late) => {
      if (!spr.active) return;
      spr.removeAllListeners();
      if (late > LATE_MS) { this.release(id, spr); return; }
      const outFrames = lp[1] < e.frames - 1;
      if (outFrames) spr.play(key(id) + ":o");
      // выход несут кадры (закрытие портала) — прозрачность держится и уходит к концу; без них — растворение сразу
      this.fadeOut(id, spr, { ...ez, fadeOut: Math.max(ez.fadeOut ?? DEF[role][1], outFrames ? (e.frames - 1 - lp[1]) * (1000 / e.fps) : 0) }, role, undefined, outFrames ? "Sine.easeIn" : "Quad.easeOut");
    });
    return spr;
  }

  /** Точка «по телу» (body — y на уровне груди) → место якоря: стоящие на земле и плоские эффекты опускаем к ногам. */
  private bodyY(id: string, y: number) { return this.ground(id) ? y + 12 : y; }
  /** Точка на земле → место якоря: эффекты на теле поднимаем к груди. */
  private groundY(id: string, y: number) { return this.ground(id) ? y : y - 10; }
  atBody(id: string, x: number, y: number, flip = false, role: Role = "hit") { return this.play(id, x, this.bodyY(id, y), { flip, role }); }
  atGround(id: string, x: number, y: number, flip = false, role: Role = "hit") { return this.play(id, x, this.groundY(id, y), { flip, role }); }
  /** На юните (cast на кастере, hit на цели, метки): идёт за ним, пока играет. */
  atUnit(id: string, u: UnitView, flip = false, role: Role = "hit") {
    if (!this.has(id)) return undefined;
    const lift = u.frame > 32 ? 30 : 14;
    return this.play(id, u.x, this.ground(id) ? u.y : u.y - lift, { flip, unit: u, role });
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
  /** Убрать запись цикла из looping (по спрайту-метке или по самой записи) и из реестра видов. */
  private unloop(k: string, mark: Phaser.GameObjects.Sprite | undefined, kind?: string, run?: Running) {
    const l = this.looping.get(k);
    if (l) { const i = l.findIndex((r) => (run ? r === run : r.spr === mark)); if (i >= 0) l.splice(i, 1); if (!l.length) this.looping.delete(k); }
    if (kind) this.forget(kind, k);
  }
  /** Цикл на юните: плавно появляется, идёт за ним ms миллисекунд и плавно гаснет (ms <= 0 — снять сейчас). Один на ключ. kind — вид бафа (для endBuff).
   *  Тот же лист на том же ключе (перекаст, продление щита, рун, «Обновления») продлевает идущий цикл, а не перезапускает его. */
  followUnit(k: string, id: string, unitId: string, ms: number, kind?: string) {
    const cur = this.looping.get(k)?.[0];
    if (ms > 0 && cur?.id === id && cur.extend?.(ms)) return;
    this.stopKey(k);
    if (ms <= 0 || !this.has(id)) return;
    const first = this.unit(unitId);
    if (!first || first.dead) return;
    const e = this.catalog[id];
    if (e.orbit) { this.orbit(k, id, unitId, ms, kind); return; }
    if (e.ease?.aura?.every) { this.pulse(k, id, unitId, ms, e.ease.aura.every, kind); return; }
    const spr = this.take(id);
    if (!spr) return;
    let u0: UnitView = first;
    spr.setPosition(Math.round(u0.x), Math.round(u0.y)).setDepth(this.depthOf(id, Math.round(u0.y)));
    this.bind(spr, id, u0);
    this.fadeIn(spr, e.ease, "aura");
    spr.play({ key: auraKey(id, e), repeat: -1 });
    // задний слой ауры (лист <id>-back): под героем, те же кадры
    const backId = `${id}-back`, back = this.has(backId) ? this.take(backId) : undefined;
    if (back) {
      back.setPosition(Math.round(u0.x), Math.round(u0.y)).setDepth(this.depthOf(backId, Math.round(u0.y)));
      this.bind(back, backId, u0, -0.5);
      this.fadeIn(back, this.catalog[backId].ease, "aura");
      back.play({ key: auraKey(backId, this.catalog[backId]), repeat: -1 });
    }
    // юнит ушёл из видимости или умер — снимаем; вид юнита пересоздан — переносим привязку на новый (аура не висит в воздухе)
    const watch = this.scene.time.addEvent({ delay: 200, loop: true, callback: () => {
      const q = this.unit(unitId);
      if (!q || q.dead) { stop(); return; }
      if (q !== u0) { u0 = q; this.bind(spr, id, q); if (back) this.bind(back, backId, q, -0.5); }
    } });
    let end = this.after(ms, (late) => stop(late));
    let done = false;
    const stop = (late = 0) => {
      if (done) return;
      done = true; watch.remove(); end.cancel();
      // истёк, пока вкладка была скрыта, — без растворения
      this.fadeOut(id, spr, late > LATE_MS ? NOW : e.ease, "aura");
      if (back) this.fadeOut(backId, back, late > LATE_MS ? NOW : this.catalog[backId].ease, "aura");
      this.unloop(k, spr, kind);
    };
    const extend = (ms2: number) => {
      if (done || this.unit(unitId) !== u0) return false;
      if (!end.extend(ms2)) end = this.after(ms2, (late) => stop(late));
      return true;
    };
    this.looping.set(k, [{ spr, stop, id, extend }]);
    if (kind) this.remember(kind, k);
  }
  /** Аура без цикла (ease.aura.every): разовая анимация на юните сразу и затем каждые every мс на текущем виде юнита — без строба
   *  повторяющегося цикла с тёмной паузой. */
  private pulse(k: string, id: string, unitId: string, ms: number, every: number, kind?: string) {
    let done = false;
    const fire = () => { const q = this.unit(unitId); if (!q || q.dead) { stop(); return; } this.atUnit(id, q); };
    const timer = this.scene.time.addEvent({ delay: every, loop: true, callback: () => fire() });
    let end = this.after(ms, () => stop());
    const run: Running = { stop: () => stop(), id, extend: (ms2) => { if (done) return false; if (!end.extend(ms2)) end = this.after(ms2, () => stop()); return true; } };
    const stop = () => { if (done) return; done = true; timer.remove(); end.cancel(); this.unloop(k, undefined, kind, run); };
    this.looping.set(k, [run]);
    if (kind) this.remember(kind, k);
    fire();
  }
  /** Орбита (рунный клинок): n предметов кружат вокруг пояса юнита. Позиции считаются каждый кадр после UnitView.update (событие postupdate):
   *  угол = время × скорость, эллипс rx×ry, покачивание по синусу у каждой руны своё; руна спереди (sin > 0) над героем, сзади — под ним;
   *  у краёв орбиты (|sin| < 0.25) руна плавно переходит со слоя на слой: копия на заднем слое и перекрёстная прозрачность. Яркость плавно падает
   *  к дальней точке. Координаты — до пикселя холста (place); лист и масштаб — pickDensity: пиксель листа — целое число пикселей холста, руна 7×8
   *  пикселей мира (зум 2 и 4 — лист двойной плотности, 3 и 6 — тройной <id>-x3). Вход и выход: альфа и радиус за fadeIn/fadeOut мс (ease-out,
   *  выход — (1 − q)²), масштаб не меняется; руны выходят из тела и уходят в него. Невидимый юнит (unseen) орбиту не выдаёт. */
  private orbit(k: string, id: string, unitId: string, ms: number, kind?: string) {
    const e = this.catalog[id], o = e.orbit!;
    // листы одного рисунка разной плотности (основной и <id>-x3): выбор по зуму камеры, смена зума колесом — смена листа на лету
    const sheets = [id, `${id}-x3`].filter((s) => this.has(s)).map((s) => ({ id: s, d: Math.round(1 / (this.catalog[s].scale ?? 1)) }));
    let cur = id, curZ = -1, pick = { id, k: 1 };
    const runes: { body: Phaser.GameObjects.Sprite; halo?: Phaser.GameObjects.Sprite; glint?: Phaser.GameObjects.Sprite; back?: Phaser.GameObjects.Sprite }[] = [];
    for (let i = 0; i < o.n; i++) {
      const body = this.take(id);
      if (!body) break;
      body.setFrame(i);
      const halo = this.take(id)?.setFrame(o.n + i).setBlendMode(Phaser.BlendModes.ADD);
      const glint = this.take(id)?.setFrame(2 * o.n + i);
      runes.push({ body, halo, glint });
    }
    if (!runes.length) return;
    const fadeIn = e.ease?.fadeIn ?? 350, fadeOut = e.ease?.fadeOut ?? 350;
    const t0 = this.scene.time.now, a0 = Math.random() * Math.PI * 2;
    let outAt = -1, visOut = 1, vis = 0, cx = 0, cy = 0, dy0 = 0, gone = false;
    const free = (s: Phaser.GameObjects.Sprite) => { if (cur !== id) s.setTexture(key(id), 0); this.release(id, s); };
    const step = () => {
      if (gone) return;                                         // снят в этом же кадре (конец из tickDeadlines раньше шага)
      const now = this.scene.time.now, u = this.unit(unitId);
      if (outAt < 0 && (!u || u.dead)) stop();
      if (outAt >= 0) {
        const q = Math.min(1, (now - outAt) / fadeOut);
        if (q >= 1) { finish(); return; }
        vis = visOut * (1 - q) * (1 - q);
      } else vis = 1 - (1 - Math.min(1, (now - t0) / fadeIn)) ** 3;   // ease-out
      if (u && !u.dead) { cx = u.sprite.x; cy = u.sprite.y + (o.oy * u.frame) / 32; dy0 = u.y; }
      const z = this.scene.cameras.main.zoom || 1;
      if (z !== curZ) { curZ = z; pick = pickDensity(z, sheets); }
      if (pick.id !== cur) {
        // тот же кадр в другом листе: позиции считаются в пикселях мира, размер в мире тот же — переключение без рывка
        cur = pick.id;
        runes.forEach((r, i) => { r.body.setTexture(key(cur), i); r.back?.setTexture(key(cur), i); r.halo?.setTexture(key(cur), o.n + i); r.glint?.setTexture(key(cur), 2 * o.n + i); });
      }
      const sc = pick.k / z, R = 0.5 + 0.5 * vis, v = vis * (u?.unseen ? 0 : 1);
      runes.forEach((r, i) => {
        const a = a0 + ((now - t0) / o.period) * Math.PI * 2 + (i * Math.PI * 2) / runes.length, sn = Math.sin(a);
        const bob = Math.sin((now / o.bobPeriod) * Math.PI * 2 + i * 2.3) * o.bob;
        // глубина: спереди — над доспехом (GearLayers.front +0.5) и передом маунта (+0.4), сзади — под плащом (-0.1) и задом маунта (-0.5)
        const x = cx + Math.cos(a) * o.rx * R, y = cy + sn * o.ry * R + bob;
        const f = 1 - ((1 - o.back) * (1 - sn)) / 2, c = (q: number) => Math.round(Math.min(1, q) * 255), tint = (c(f * 0.92) << 16) | (c(f * 0.97) << 8) | c(f);
        // смена слоя у краёв орбиты: в полосе |sin| < 0.25 спереди — сама руна с прозрачностью w, сзади — её копия
        const band = Math.abs(sn) < 0.25, w = Phaser.Math.Clamp(0.5 + sn / 0.5, 0, 1);
        if (band && !r.back) { r.back = this.take(id); if (r.back) { if (cur !== id) r.back.setTexture(key(cur), i); else r.back.setFrame(i); } }
        else if (!band && r.back) { free(r.back); r.back = undefined; }
        const d = band ? dy0 + 0.6 : dy0 + (sn >= 0 ? 0.6 : -0.6);
        r.body.setScale(sc).setTint(tint); this.place(r.body, cur, x, y); r.body.setDepth(d).setAlpha(band && r.back ? v * w : v);
        if (r.back) { r.back.setScale(sc).setTint(tint); this.place(r.back, cur, x, y); r.back.setDepth(dy0 - 0.6).setAlpha(v); }
        // ореол и блик: слой по знаку sin, у краёв орбиты гаснут (не перескакивают со слоя на слой)
        const hd = dy0 + (sn >= 0 ? 0.6 : -0.6), edge = Math.min(1, Math.abs(sn) / 0.25);
        const g = o.glow[0] + (o.glow[1] - o.glow[0]) * (0.5 + 0.5 * Math.sin((now / o.glowPeriod) * Math.PI * 2 + i * 1.7));
        if (r.halo) { r.halo.setScale(sc); this.place(r.halo, cur, x, y); r.halo.setDepth(hd + 0.01).setAlpha(v * edge * g * (0.45 + (0.55 * (sn + 1)) / 2)); }
        const tw = Math.max(0, Math.sin((now / o.twinkle) * Math.PI * 2 + i * 2.6)) ** 12;
        if (r.glint) { r.glint.setScale(sc); this.place(r.glint, cur, x, y); r.glint.setDepth(hd + 0.02).setAlpha(v * edge * tw * Math.max(0, sn * 0.6 + 0.4)); }
      });
    };
    const off = () => this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, step);
    let end = this.after(ms, (late) => stop(late));
    const stop = (late = 0) => {
      if (outAt >= 0) return;
      outAt = this.scene.time.now; visOut = vis; end.cancel();
      this.unloop(k, runes[0].body, kind);
      if (late > LATE_MS) finish();                             // истёк, пока вкладка была скрыта, — без растворения
    };
    const finish = () => {
      if (gone) return;
      gone = true;
      off();
      this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, off);
      // в пул спрайты уходят с основным листом (пул общий по id)
      for (const r of runes) for (const s of [r.body, r.halo, r.glint, r.back]) if (s) free(s);
    };
    const extend = (ms2: number) => {
      if (outAt >= 0 || gone) return false;
      if (!end.extend(ms2)) end = this.after(ms2, (late) => stop(late));
      return true;
    };
    this.scene.events.on(Phaser.Scenes.Events.POST_UPDATE, step);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    step();
    this.looping.set(k, [{ spr: runes[0].body, stop, id, extend }]);
    if (kind) this.remember(kind, k);
  }
  /** Цикл в круге на земле: стоящий предмет (знамя) — один спрайт в центре; облака и лужи — несколько спрайтов, разложенных по кругу радиуса умения
   *  (золотой угол; круг, а не эллипс — сервер мерит Math.hypot, задача 133), не перекрывающих героев сплошной стеной: полупрозрачные, под юнитами.
   *  Позиция не качается (сдвиг на пиксель мира — рывок в 2–3 пикселя экрана): облака «дышат» прозрачностью. Входят и гаснут плавно. */
  zone(k: string, id: string, x: number, y: number, r: number, ms: number) {
    this.stopKey(k);
    if (ms <= 0 || !this.has(id)) return;
    const e = this.catalog[id], ez = e.ease;
    const single = (e.anchor[1] >= 0.85 && !FLAT.test(id)) || r < e.frameW * 0.6;
    const n = single ? 1 : Math.min(11, Math.max(4, Math.round((r * r) / (e.frameW * e.frameW * 0.8))));
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) { const ang = i * 2.39996, d = single ? 0 : Math.sqrt((i + 0.5) / n) * r * 0.85; pts.push([Math.cos(ang) * d, Math.sin(ang) * d]); }
    const list: Running[] = [];
    // кольцо ауры радиуса под штандартом: лист banner-ring-<фракция> того же имени
    const ringId = id.replace(/^banner-/, "banner-ring-");
    if (ez?.drop && this.has(ringId)) {
      const ring = this.take(ringId);
      if (ring) {
        ring.setPosition(Math.round(x), Math.round(y)).setDepth(this.depthOf(ringId, Math.round(y)));
        this.fadeIn(ring, this.catalog[ringId].ease, "aura");
        ring.play({ key: auraKey(ringId, this.catalog[ringId]), repeat: -1 });
        let rd = false;
        list.push({ spr: ring, stop: (late = 0) => { if (rd) return; rd = true; this.fadeOut(ringId, ring, late > LATE_MS ? NOW : this.catalog[ringId].ease, "aura"); } });
      }
    }
    const ak = auraKey(id, e), anim = this.scene.anims.get(ak), nf = anim ? anim.frames.length : e.frames;
    for (const [dx, dy] of pts) {
      const spr = this.take(id);
      if (!spr) break;
      const px = Math.round(x + dx), py = Math.round(this.groundY(id, y + dy));
      spr.setPosition(px, py).setDepth(this.depthOf(id, Math.round(y + dy)));
      if (ez?.drop) {
        // установка: штандарт проявляется, падает сверху с разгоном и один раз отскакивает на 3 px; пыль у основания — ровно в момент удара
        this.fadeIn(spr, { ...ez, fadeIn: ez.fadeIn ?? 100 }, "aura");
        spr.setY(py - ez.drop);
        const dust = ez.dust;
        this.scene.tweens.chain({ targets: spr, tweens: [
          { y: py, duration: 240, ease: "Quad.easeIn", onComplete: () => { if (dust) this.play(dust, px, py); } },
          { y: py - 3, duration: 80, ease: "Sine.easeOut", yoyo: true },
        ] });
      } else this.fadeIn(spr, ez, "aura");
      spr.play({ key: ak, repeat: -1, startFrame: Math.floor(Math.random() * (ak.endsWith(":l") ? 1 : nf)) });
      // облака дышат прозрачностью (не позицией), каждое в своём темпе
      if (/^fog-/.test(id)) {
        const a = ez?.alpha ?? 1;
        this.scene.tweens.add({ targets: spr, alpha: { from: a, to: a * 0.8 }, delay: (ez?.fadeIn ?? DEF.aura[0]) + Math.random() * 600, duration: 1600 + Math.random() * 800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
      let done = false;
      const stop = (late = 0) => { if (done) return; done = true; this.fadeOut(id, spr, late > LATE_MS ? NOW : ez, "aura"); };
      list.push({ spr, stop });
    }
    const end = this.after(ms, (late) => { for (const r2 of list) r2.stop(late); if (this.looping.get(k) === list) this.looping.delete(k); });
    list.push({ spr: list[0]?.spr, stop: () => end.cancel() });
    this.looping.set(k, list);
  }

  // ---------- снаряд и цепь ----------
  /** Снаряд-цикл из (sx, sy) в (tx, ty) за ms (неподвижная цель). onArrive — попадание. */
  projectile(id: string, sx: number, sy: number, tx: number, ty: number, ms: number, onArrive: () => void) {
    this.fly(id, sx, sy, () => ({ x: tx, y: ty }), ms, () => onArrive());
  }
  /** Снаряд-цикл летит из (sx, sy) к точке end() (живая цель — каждый кадр) за ms. Проявляется (fadeIn ≤ 40 % полёта), кадр цикла — случайный
   *  (несколько ножей не мигают в такт), шаг — в пиксель холста (place), поворот — по направлению, перенаводится только на заметный угол.
   *  onArrive(x, y, flip) — в точке прилёта; затем снаряд гаснет, чуть продвигаясь по курсу. noHit — у снаряда нет вспышки: гаснет к концу пути. */
  fly(id: string, sx: number, sy: number, end: () => P, ms: number, onArrive: (x: number, y: number, flip: boolean) => void, noHit = false) {
    const flipOf = (p: P) => Math.abs(p.x - sx) > 0.5 * Math.abs(p.y - sy) && p.x < sx;
    const spr = this.take(id);
    if (!spr) { const p = end(); onArrive(p.x, p.y, flipOf(p)); return; }
    const e = this.catalog[id], dur = Math.max(60, ms), raven = id === "raven-fly";
    let p = end(), rot = 0;
    const turn = (r: number) => { rot = r; spr.setRotation(r); if (raven) spr.setFlipY(Math.cos(r) < 0); };
    turn(Math.atan2(p.y - sy, p.x - sx));
    spr.setDepth(DEPTH.top - 40);
    this.place(spr, id, sx, sy);
    spr.setAlpha(0);
    this.scene.tweens.add({ targets: spr, alpha: e.ease?.alpha ?? 1, duration: Math.min(e.ease?.fadeIn ?? DEF.proj[0], 0.4 * dur), ease: "Sine.easeOut" });
    spr.play({ key: key(id), repeat: -1, startFrame: Math.floor(Math.random() * e.frames) });
    if (noHit) { const f = Math.min(160, 0.25 * dur); this.scene.tweens.add({ targets: spr, alpha: 0, delay: dur - f, duration: f, ease: "Quad.easeOut" }); }
    const k = { k: 0 };
    let x = sx, y = sy, alive = true;
    this.scene.tweens.add({
      targets: k, k: 1, duration: dur, ease: "Linear",
      onUpdate: () => {
        if (!alive || !spr.active) return;
        p = end(); x = sx + (p.x - sx) * k.k; y = sy + (p.y - sy) * k.k;
        const aim = Math.atan2(p.y - y, p.x - x);
        if (Math.hypot(p.x - x, p.y - y) > 6 && Math.abs(Phaser.Math.Angle.Wrap(aim - rot)) > 0.14) turn(aim);
        this.place(spr, id, x, y);
      },
      onComplete: () => {
        if (!alive) return;
        alive = false;
        p = end();
        const flip = flipOf(p);
        if (!spr.active) { onArrive(p.x, p.y, flip); return; }
        if (noHit) { this.release(id, spr); onArrive(p.x, p.y, flip); return; }
        onArrive(p.x, p.y, flip);
        // гаснет за fadeOut, продвигаясь по курсу на 5 px с замедлением
        this.scene.tweens.killTweensOf(spr);
        const c = Math.cos(rot), s = Math.sin(rot), px0 = p.x, py0 = p.y, q = { q: 0 };
        this.scene.tweens.add({ targets: spr, alpha: 0, duration: e.ease?.fadeOut ?? DEF.proj[1], ease: "Quad.easeOut", onComplete: () => this.release(id, spr) });
        this.scene.tweens.add({ targets: q, q: 1, duration: e.ease?.fadeOut ?? DEF.proj[1], onUpdate: () => { if (!spr.active) return; const d = 5 * (1 - (1 - q.q) ** 2); this.place(spr, id, px0 + c * d, py0 + s * d); } });
      },
    });
  }
  /** Бесшовная цепь между двумя точками (лист: тянется вдоль линии), держится ms. Концы — функции: цепь идёт за кастером и притянутым
   *  (позиция и длина каждый кадр после update). Вылетает: длина 0→1 за 130 мс и проявление за 80; в конце растворяется за 200 мс. */
  line(id: string, from: () => P, to: () => P, ms: number) {
    if (!this.has(id)) return;
    const e = this.catalog[id];
    const ts = this.scene.add.tileSprite(0, 0, 1, e.frameH, key(id), 0).setOrigin(0, 0.5).setDepth(DEPTH.top - 38).setAlpha(0);
    const g = { grow: 0 };
    let len = 1, dead = false;
    const upd = () => {
      if (dead) return;
      const a = from(), b = to(), full = Math.max(8, Math.round(Math.hypot(b.x - a.x, b.y - a.y))), l = Math.max(1, Math.round(full * g.grow));
      ts.setPosition(Math.round(a.x), Math.round(a.y)).setRotation(Math.atan2(b.y - a.y, b.x - a.x));
      if (l !== len) { len = l; ts.setSize(l, e.frameH); }
    };
    let fr = 0;
    const tick = this.scene.time.addEvent({ delay: 1000 / e.fps, loop: true, callback: () => { fr = (fr + 1) % e.frames; ts.setFrame(fr); } });
    const kill = () => {
      if (dead) return;
      dead = true; tick.remove();
      this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, upd);
      this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, kill);
      this.scene.tweens.killTweensOf([ts, g]);
      ts.destroy();
    };
    upd();
    this.scene.events.on(Phaser.Scenes.Events.POST_UPDATE, upd);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, kill);
    this.scene.tweens.add({ targets: g, grow: 1, duration: 130, ease: "Cubic.easeOut" });
    this.scene.tweens.add({ targets: ts, alpha: 1, duration: DEF.line[0], ease: "Sine.easeOut" });
    this.after(ms, (late) => {
      if (dead) return;
      if (late > LATE_MS) kill();
      else { this.scene.tweens.killTweensOf(ts); this.scene.tweens.add({ targets: ts, alpha: 0, duration: DEF.line[1], ease: "Quad.easeOut", onComplete: kill }); }
    });
  }

  // ---------- по сообщениям fx (вызывает Effects) ----------
  /** Притягивания последнего пакета (рывок с id ≠ кастера: «Хватка смерти»): умение|кастер → кого и откуда тянут. */
  private pulls = new Map<string, { id: string; x0: number; y0: number }[]>();
  /** Пакет fx: «cast» умения — один раз на (умение, кастер). Свой рывок играет cast/hit сам (начало и конец рывка). */
  batch(list: Fx[]) {
    this.pulls.clear();
    for (const g of list) if (g.t === "blink" && g.s && g.c && g.id !== g.c) {
      const k = `${g.s}|${g.c}`, l = this.pulls.get(k) ?? [];
      l.push({ id: g.id, x0: g.x0, y0: g.y0 }); this.pulls.set(k, l);
    }
    const seen = new Set<string>();
    for (const f of list) {
      if (!f.s || !f.c) continue;
      const k = `${f.s}|${f.c}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const id = TABLE[f.s]?.cast;
      if (!this.has(id) || list.some((g) => g.t === "blink" && g.s === f.s && g.c === f.c && g.id === g.c)) continue;
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
      if (SKILLS[f.s]?.target === "point" && ax !== undefined && ay !== undefined) this.atGround(id, ax, ay, flip, "cast");
      else this.atUnit(id, caster, flip, "cast");
    }
  }

  /** Точка груди юнита (куда летят снаряды и цепи). */
  private chest(u: UnitView): P { return { x: u.x, y: u.y - (u.frame > 32 ? 26 : 12) }; }
  /** Снаряд умения: свой спрайт вместо частиц (true — Effects рисовать его не нужно). Летит за живой целью (вид юнита ищется каждый кадр — мог
   *  пересоздаться); вспышка — на цели (идёт с ней), у взрыва огненного шара и без цели — в точке прилёта. arrive(x, y) — точка прилёта. */
  proj(f: Extract<Fx, { t: "proj" }>, sx: number, sy: number, tx: number, ty: number, arrive: (x: number, y: number) => void): boolean {
    const hit = this.slot(f, "hit");
    if (f.s) this.projSeen.set(f.s, this.scene.time.now);
    const id = this.slot(f, "proj");
    if (!id) return false;
    if (hit) this.markHit(f, this.scene.time.now + f.ms);
    let last: P = { x: tx, y: ty };
    const end = () => { const u = f.to ? this.unit(f.to) : undefined; if (u && !u.dead) last = this.chest(u); return last; };
    this.fly(id, sx, sy, end, f.ms, (x, y, flip) => {
      if (hit) {
        const u = f.to ? this.unit(f.to) : undefined;
        if (u && !u.dead && f.k !== "fireball") this.atUnit(hit, u, flip); else this.atBody(hit, x, y, flip);
      }
      arrive(x, y);
    }, !hit);
    return true;
  }
  /** Попадание обычного снаряда: hit умения вместо искр (true — искры не нужны). flip — снаряд летел влево (брызги по ходу). */
  projHit(f: Extract<Fx, { t: "proj" }>, tx: number, ty: number, flip = false): boolean {
    const hit = this.slot(f, "hit");
    if (!hit) return false;
    this.markHit(f);
    this.atBody(hit, tx, ty, flip);
    return true;
  }
  /** Круг/взрыв: hit в точке; пока летит снаряд этого умения, hit играет сам снаряд. */
  aoe(f: Extract<Fx, { t: "aoe" }>): boolean {
    // оберег раскрыл невидимку (server/src/game/wards.ts): своя вспышка у подножия оберега
    const ward = f.k === "ward_sol" ? "ward-reveal-sol" : f.k === "ward_umb" ? "ward-reveal-umb" : undefined;
    if (ward) { if (!this.has(ward)) return false; this.atGround(ward, f.x, f.y); return true; }
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
  /** Цепь: hit на каждом звене кроме первого; proj-цепь — спрайтовая линия по звеньям. Звено к притянутому («Хватка смерти»: рывок цели к кастеру
   *  в том же пакете) идёт за обоими: вылетает из кастера и тянется за целью, кандалы едут с целью. true — старая линия не нужна. */
  chain(f: Extract<Fx, { t: "chain" }>): boolean {
    const hit = this.slot(f, "hit"), pid = this.slot(f, "proj");
    // кандалы на притянутом уже сыграл рывок этого пакета (blink раньше цепи) — второй раз не играть
    const recent = this.hitRecent(f);
    if (hit) this.markHit(f);
    const pulls = f.s && f.c ? this.pulls.get(`${f.s}|${f.c}`) ?? [] : [];
    const pulledAt = (x: number, y: number) => pulls.find((q) => Math.abs(q.x0 - x) + Math.abs(q.y0 - (y + 12)) < 3);
    const live = (uid: string, p0: P) => { let last = p0; return () => { const u = this.unit(uid); if (u && !u.dead) last = this.chest(u); return last; }; };
    for (let i = 2; hit && i < f.pts.length; i += 2) {
      const q = pulledAt(f.pts[i], f.pts[i + 1]), u = q && this.unit(q.id);
      if (u && !u.dead) { if (!recent) this.atUnit(hit, u); } else this.atBody(hit, f.pts[i], f.pts[i + 1]);
    }
    if (!pid) return false;
    for (let i = 0; i + 3 < f.pts.length; i += 2) {
      const a: P = { x: f.pts[i], y: f.pts[i + 1] }, b: P = { x: f.pts[i + 2], y: f.pts[i + 3] }, q = pulledAt(b.x, b.y);
      if (q && f.c) this.line(pid, i === 0 ? live(f.c, a) : () => a, live(q.id, b), 600);
      else this.line(pid, () => a, () => b, 600);
    }
    return true;
  }
  /** Рывок/мерцание: cast в начале, hit в конце. Притягивание (рывок цели к кастеру, id ≠ кастера): cast не играет (нова кастера — только
   *  у своего рывка), hit — на притянутом и едет с ним, если цепь уже не сыграла его. true — вспышки частицами не нужны. */
  blink(f: Extract<Fx, { t: "blink" }>): boolean {
    const cast = this.slot(f, "cast"), hit = this.slot(f, "hit");
    if (!cast && !hit) return false;
    const pull = !!f.c && f.id !== f.c;
    if (cast && !pull) this.atGround(cast, f.x0, f.y0, false, "cast");
    if (hit && !this.hitRecent(f)) {
      const u = pull ? this.unit(f.id) : undefined;
      if (u && !u.dead) this.atUnit(hit, u); else this.atGround(hit, f.x1, f.y1);
      if (pull) this.markHit(f);
    }
    return true;
  }
}
