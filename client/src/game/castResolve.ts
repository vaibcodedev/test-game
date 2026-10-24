/**
 * Выбор адресата каста (задача 115, шаг 6; docs/controls.md, раздел 6). Чистые функции, без Phaser и DOM.
 * Порядок для unit: юнит под курсором подходящего типа (цель не меняется) -> выбранная цель -> у курсора (подсвеченный магнитом, иначе ближайший в 80 px экрана) -> ally на себя (Alt — всегда) ->
 * enemy: ближайший враг в дальности при «Автоцели», иначе ошибка. Точка — курсор, зажатый дальностью. Направление — на курсор;
 * курсор над интерфейсом — на цель, иначе вперёд. Курсор на враге (каст по наведению) — точка и направление по его ногам (задача 133).
 * castAim — где ляжет умение и что слать серверу: общая геометрия shared/skillShape.ts от предсказанной позиции героя (превью = сервер), с правилами
 * модулей, которые зависят от мира (капканы, цели роя — ruleErr). «Далеко» у умений на цель — как у сервера: дальше дальности + радиус цели (unitRadius).
 * hitUnitsOf — кого превью меряет формой: враги и союзники по правилам сервера (питомцы — по хозяину), без скрытых и павших.
 * Внизу — выбор цели мышью (задача 134, шаг 1; разделы 4, 11, 12): допуск клика, магнит ЛКМ и один порядок (pickOrder) для клика, подсветки и курсора.
 */
import { PLAYER_RADIUS } from "../../../shared/constants";
import type { WorldMap } from "../../../shared/map";
import { MOBS } from "../../../shared/mobs";
import type { Fx } from "../../../shared/protocol";
import { aimExtras, facingOf, placeSkill, ruleErr, shapeHits, type AimUnit, type AimWorld, type HitUnit, type Placed } from "../../../shared/skillShape";
import { SKILLS, type SkillAim, type SkillDef, type SkillTarget } from "../../../shared/skills";

/** Юнит для выбора адресата: r — радиус, как у сервера (World.radiusOf: герой и питомец — PLAYER_RADIUS, моб — свой); dir — взгляд (за спину);
 *  boss — босс (его не притягивают). */
export interface CastUnit { id: string; x: number; y: number; enemy: boolean; friend: boolean; dead?: boolean; r?: number; dir?: number; boss?: boolean }

/** Радиус юнита, как World.radiusOf на сервере: моб и босс — радиус из MOBS (по спрайту и имени, у элиты имя с приставкой), остальные — PLAYER_RADIUS. */
export function unitRadius(u: { kind: number; sprite: string; name: string }): number {
  if (u.kind !== 1 && u.kind !== 2) return PLAYER_RADIUS;
  let byName = MOB_R.get(`${u.sprite}|${u.name}`);
  if (byName === undefined) {
    for (const m of Object.values(MOBS)) if (m.sprite === u.sprite && u.name.endsWith(" " + m.name)) { byName = m.radius; break; }
    if (byName === undefined) for (const m of Object.values(MOBS)) if (m.sprite === u.sprite) byName = Math.max(byName ?? 0, m.radius);
    byName ??= PLAYER_RADIUS;
    MOB_R.set(`${u.sprite}|${u.name}`, byName);
  }
  return byName;
}
const MOB_R = new Map<string, number>(Object.values(MOBS).map((m) => [`${m.sprite}|${m.name}`, m.radius]));

/** Выбранная цель для панели умений: hud.ts передаёт в hotbar.frame только её место — радиус и сторону сцена кладёт сюда каждый кадр (GameScene.update). */
export const selTarget: { r: number; friend: boolean; enemy: boolean } = { r: PLAYER_RADIUS, friend: false, enemy: false };

/** Запас к сроку лужи капкана: сервер повторяет её раз в 7,5 с сроком 8 с — запоздавший повтор не должен «гасить» живой капкан. */
export const TRAP_GRACE = 1500;
/**
 * Свои живые капканы для превью (правило модуля «Слишком близко к другому капкану»): клиент видит их по fx сервера — лужа hazard «holy» от капкана
 * (hr_trap или «Ловкий отскок» при перекате, roll) ставит его, удар aoe «phys» r 52 в его точке снимает; срок — v.dur капкана, сверх предела
 * (cap + «Ловец») уходят старые, как на сервере. Молча сервер гасит капканы, когда герой погиб или ушёл (archers.ts, w.gone): поэтому капкан жив,
 * пока сервер повторяет его лужу (раз в 7,5 с, срок лужи ms + TRAP_GRACE), а гибель своего героя очищает список (clear). Первым увиденный повтор
 * (после входа в сцену) не продлевает капкан дальше последней лужи больше чем на её срок.
 */
export class TrapWatch {
  list: { x: number; y: number; r: number; until: number; seen: number }[] = [];
  note(fx: readonly Fx[], me: string, now: number, ranks: Readonly<Record<string, number>> | undefined) {
    for (const f of fx) {
      if (f.c !== me || (f.s !== "hr_trap" && f.s !== "roll")) continue;
      if (f.t === "hazard" && f.k === "holy") {
        const seen = now + (f.ms || 8000) + TRAP_GRACE, old = this.list.find((t) => t.x === f.x && t.y === f.y);
        if (old) { old.seen = Math.max(old.seen, seen); continue; }
        const v = SKILLS.hr_trap.v(Math.max(1, ranks?.hr_trap ?? 1)), tr = ranks?.hr_trapper ?? 0;
        this.list.push({ x: f.x, y: f.y, r: f.r, until: now + v.dur * 1000, seen });
        const cap = v.cap + (tr > 0 ? SKILLS.hr_trapper.v(tr).cap : 0);
        while (this.list.length > cap) this.list.shift();
      } else if (f.t === "aoe" && f.k === "phys" && f.r === 52) this.list = this.list.filter((t) => t.x !== f.x || t.y !== f.y);
    }
  }
  live(now: number): readonly { x: number; y: number; r: number }[] {
    if (this.list.some((t) => t.until <= now || t.seen <= now)) this.list = this.list.filter((t) => t.until > now && t.seen > now);
    return this.list;
  }
  /** Свой герой погиб: сервер погасил все его капканы (без fx). */
  clear() { if (this.list.length) this.list = []; }
}

/**
 * Юнит сцены для «кого заденет» (GameScene.hitUnits): hero — герой, pet — питомец (owner — id хозяина); foe — его задевают площадные
 * (враг и не под запретом нейтрального города, World.canAffect); hostile — враждебен мне, как World.hostile (без скидки на скрытность, в отличие
 * от isEnemy); kin — герой моей фракции; unseen — скрыт от меня.
 */
export interface HitView { id: string; x: number; y: number; r: number; dead: boolean; unseen: boolean; hero: boolean; pet: boolean; boss: boolean; foe: boolean; hostile: boolean; kin: boolean; owner: string }
/**
 * Кого превью меряет формой — как сервер: враги — те, кого задевают площадные (мобы, враждебные герои вне нейтрального города); союзники —
 * не враждебные герои (kin — своей фракции, для alliesAround) и питомцы по хозяину (свой — союзник своей фракции; хозяина не видно — неизвестно,
 * не метим). Скрытые (unseen) и павшие не попадают никуда: метка выдала бы невидимку, а сервер скрытого врага не лечит.
 */
export function hitUnitsOf(list: readonly HitView[], me: string): HitUnit[] {
  const owners = new Map<string, HitView>();
  for (const v of list) if (v.hero) owners.set(v.id, v);
  const out: HitUnit[] = [];
  for (const v of list) {
    if (v.dead || v.unseen || v.id === me) continue;
    if (v.pet) {
      const o = v.owner === me ? null : owners.get(v.owner);
      if (v.owner !== me && (!o || o.hostile)) continue;
      out.push({ id: v.id, x: v.x, y: v.y, r: v.r, ally: true, kin: v.owner === me || !!o?.kin, pet: true });
    } else if (v.hero && !v.hostile) out.push({ id: v.id, x: v.x, y: v.y, r: v.r, ally: true, kin: v.kin });
    else if (v.foe) out.push({ id: v.id, x: v.x, y: v.y, r: v.r, boss: v.boss });
  }
  return out;
}
export interface CastSkill { aim: SkillAim; target?: SkillTarget; range?: number }
export interface CastIn {
  skill: CastSkill;
  self: { id: string; x: number; y: number };
  /** Курсор в мире (последнее положение над картой). */
  cursor: { x: number; y: number };
  overUi: boolean;
  /** Юнит под курсором (null над интерфейсом) и выбранная цель. */
  hover: CastUnit | null;
  selected: CastUnit | null;
  units: CastUnit[];
  /** Единичный вектор «вперёд». */
  facing: { x: number; y: number };
  alt: boolean;
  hoverCast: boolean;
  autoTarget: boolean;
  /** Враг у курсора без точного наведения (задача 134, шаг 3): тот, кого подсветка выбрала магнитом, — его берёт умение, если цели нет. */
  hoverNear?: CastUnit | null;
  /** Радиус «ближайший к курсору» в пикселях мира (PICK_NEAR / масштаб CSS); 0 или нет — правила нет. Только если цели нет. */
  nearReach?: number;
}
/** far — сервер откажет «Слишком далеко» (только умения на цель); точку ground и направление сервер прижимает к дальности сам — у них far нет. */
export type CastPlan =
  | { ok: true; x: number; y: number; target: string | null; far: boolean }
  | { ok: false; err: string };

/** Точка to, зажатая дальностью range от from (range <= 0 — без зажима). */
export function clampToRange(from: { x: number; y: number }, to: { x: number; y: number }, range: number): { x: number; y: number; far: boolean } {
  const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy);
  if (!(range > 0) || d <= range) return { x: to.x, y: to.y, far: false };
  return { x: from.x + (dx / d) * range, y: from.y + (dy / d) * range, far: true };
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Подходит ли юнит типу умения (enemy — враг, ally — союзник, в том числе павший для воскрешения). */
export function fitsTarget(u: CastUnit, t: SkillTarget | undefined): boolean {
  if (t === "enemy") return u.enemy && !u.dead;
  if (t === "ally") return u.friend;
  return false;
}

export function resolveCast(c: CastIn): CastPlan {
  const { skill: s, self } = c;
  const range = s.range ?? 0;
  const sel = c.selected;
  switch (s.aim) {
    case "self":
      return { ok: true, x: self.x, y: self.y, target: sel?.id ?? null, far: false };
    case "unit": {
      if (s.target === "ally" && c.alt) return { ok: true, x: self.x, y: self.y, target: self.id, far: false };
      let t: CastUnit | null = null;
      if (c.hoverCast && !c.overUi && c.hover && fitsTarget(c.hover, s.target)) t = c.hover;
      else if (sel && fitsTarget(sel, s.target)) t = sel;
      // решение пользователя: без точного наведения — выбранная цель; враг (союзник) у курсора — только если цели нет
      else t = nearCursor(c, s.target);
      if (t) { /* адресат найден */ }
      else if (s.target === "ally") t = { id: self.id, x: self.x, y: self.y, enemy: false, friend: true };
      else if (c.autoTarget) {
        // ближайший враг в дальности + его радиус (как сервер)
        let bd = Infinity;
        for (const u of c.units) { const d = dist(u, self); if (fitsTarget(u, "enemy") && d <= range + (u.r ?? PLAYER_RADIUS) && d < bd) { bd = d; t = u; } }
      }
      if (!t) return { ok: false, err: "Нет цели" };
      // «далеко» — как у сервера: дальше дальности + радиус цели (у боссов до 44); на себя — никогда
      return { ok: true, x: t.x, y: t.y, target: t.id, far: range > 0 && t.id !== self.id && dist(t, self) > range + (t.r ?? PLAYER_RADIUS) };
    }
    case "ground": {
      // курсор на враге — точка по его ногам (сервер мерит круги от ног); дальше дальности — прижать: сервер прижимает так же и кастует
      const at = hoverFoe(c) ?? c.cursor;
      const p = clampToRange(self, at, range);
      return { ok: true, x: p.x, y: p.y, target: null, far: false };
    }
    case "dash": {
      return { ok: true, x: c.cursor.x, y: c.cursor.y, target: null, far: false };
    }
    case "dir": {
      const len = range > 0 ? range : 300;
      if (c.overUi) {
        if (sel && !sel.dead) return { ok: true, x: sel.x, y: sel.y, target: sel.enemy ? sel.id : null, far: false };
        return { ok: true, x: self.x + c.facing.x * len, y: self.y + c.facing.y * len, target: null, far: false };
      }
      // курсор на враге — по его ногам (огненный шар наводится на него); дальше дальности снаряд летит до дальности — отказа нет
      const hv = hoverFoe(c);
      return { ok: true, x: hv ? hv.x : c.cursor.x, y: hv ? hv.y : c.cursor.y, target: hv?.id ?? null, far: false };
    }
  }
}

/** Без цели: юнит подходящего типа у курсора — подсвеченный магнитом (hoverNear), иначе ближайший к курсору в nearReach (+ радиус юнита). */
function nearCursor(c: CastIn, t: SkillTarget | undefined): CastUnit | null {
  if (!c.hoverCast || c.overUi) return null;
  if (c.hoverNear && fitsTarget(c.hoverNear, t)) return c.hoverNear;
  const reach = c.nearReach ?? 0;
  if (!(reach > 0)) return null;
  let best: CastUnit | null = null, bd = Infinity;
  for (const u of c.units) {
    if (u.id === c.self.id || !fitsTarget(u, t)) continue;
    const d = dist(u, c.cursor);
    if (d <= reach + (u.r ?? PLAYER_RADIUS) && d < bd) { bd = d; best = u; }
  }
  return best;
}

/** Живой враг под курсором при касте по наведению (курсор не над интерфейсом). */
function hoverFoe(c: CastIn): CastUnit | null {
  return c.hoverCast && !c.overUi && c.hover && c.hover.enemy && !c.hover.dead ? c.hover : null;
}

/** Сообщение «skill» кроме id, цели и опций: точка, угол (линии, стена огня) и вектор рывка (shared/skillShape.ts aimExtras). */
export interface AimMsg { x: number; y: number; a?: number; dx?: number; dy?: number }

/**
 * Где ляжет умение по плану (превью) и что слать серверу: placeSkill от предсказанной позиции героя from без допуска — та же функция,
 * которой сервер решает каст (с допуском GROUND_TOL от своей позиции). g.err — отказ сервера (видимость, луч, рывок, путь к цели), заранее;
 * с миром wd — и отказы модулей (капкан: город, вода, соседний капкан; рой без целей — ruleErr).
 * Точка ground — уже прижатая; у линий — угол и вектор до их точки, у рывка — вектор от героя (из очереди сервер применит их от своей позиции).
 * unit — цель плана (ноги, радиус, взгляд, босс): самонаведение огненного шара и умения на цель, как у сервера (у него — живая цель запроса).
 * hits — кого заденет из wd.units (shapeHits; один раз: и для отказа роя, и для меток превью); юнитов нет или отказ — пусто.
 */
export function castAim(map: WorldMap, def: SkillDef, rank: number, ranks: Readonly<Record<string, number>> | undefined, from: { x: number; y: number }, plan: { x: number; y: number },
  unit?: AimUnit, wd?: AimWorld): { g: Placed; msg: AimMsg; hits: string[] } {
  const g = placeSkill(map, def, rank, ranks, from, { x: plan.x, y: plan.y, unit });
  let hits = !g.err && wd?.units?.length ? shapeHits(map, g, wd.units) : [];
  if (!g.err && wd) g.err = ruleErr(map, def, g, wd, hits);
  if (g.err) hits = [];
  const ex = aimExtras(def, g, from);
  const pt = g.shape === "circle" || g.shape === "wall" || g.shape === "bolt" || g.shape === "band" || g.shape === "fan" || g.shape === "cone";
  const at = pt ? { x: g.x, y: g.y } : g.shape === "dash" ? { x: g.tx, y: g.ty } : { x: plan.x, y: plan.y };
  return { g, msg: { ...at, ...ex }, hits };
}

/** Цель запроса для castAim из юнита плана: ноги, радиус (unitRadius), взгляд и босс. */
export function aimUnit(u: CastUnit | null | undefined): AimUnit | undefined {
  if (!u) return undefined;
  const [fx, fy] = facingOf(u.dir ?? 0);
  return { id: u.id, x: u.x, y: u.y, r: u.r ?? PLAYER_RADIUS, fx, fy, boss: !!u.boss };
}

// ---------- Выбор цели мышью (задача 134, шаг 1; docs/controls.md, разделы 4, 11, 12) ----------

/** Допуск клика по существу и радиус магнита ЛКМ в «Экшене» — в пикселях экрана; «Крупные цели» удваивают оба. */
export const PICK_TOL = 12;
export const PICK_MAGNET = 40;
/** Умение на цель без цели и без точного наведения — ближайший к курсору в 80 px экрана (docs/controls.md, раздел 11). */
export const PICK_NEAR = 80;

/** Запас к зоне тела в пикселях мира: пиксели экрана / масштаб CSS (пикселей CSS на пиксель мира, 2–3). Допуск, а при magnet — радиус магнита. */
export function pickReach(css: number, magnet: boolean, bigTargets: boolean): number {
  return ((magnet ? PICK_MAGNET : PICK_TOL) * (bigTargets ? 2 : 1)) / (css > 0 ? css : 1);
}

/** Зона клика по юниту — круг по телу: радиус 14 (у крупного кадра, больше 32 px, — 30), центр на 12 px выше ног (у крупных и всадников — на 28).
 *  Возвращает расстояние от точки мира (wx, wy) до центра, если она ближе радиуса + reach, иначе Infinity. */
export function bodyDist(x: number, y: number, large: boolean, mounted: boolean, wx: number, wy: number, reach: number): number {
  const d = Math.hypot(wx - x, wy - (y - (large || mounted ? 28 : 12)));
  return d < (large ? 30 : 14) + reach ? d : Infinity;
}

/** magnet — промах ЛКМ в «Экшене» в радиусе магнита: клик только выбирает врага, а атакует лишь точное попадание (foe): в пачке магнит может взять не того. */
export type PickKind = "aim" | "foe" | "magnet" | "bag" | "node" | "npc" | "menu" | "friend" | "ground";
/** Результат pickOrder — что сделает клик. id — враг, союзник или мешок; ref — узел добычи или NPC (кладёт источник). Объект постоянный: наведение считается каждый кадр без аллокаций. */
export interface PickOut { kind: PickKind; id: string | null; ref: unknown }
export interface PickCtx {
  /** Идёт прицел умения: клик уйдёт ему. */
  aim: boolean;
  right: boolean;
  /** «Экшен»: у ЛКМ магнит, NPC — только ПКМ. «Классика»: магнита нет, NPC — обе кнопки. Мешки и узлы добычи в обоих — обе кнопки. */
  action: boolean;
  /** Открытый мир: ПКМ по игроку открывает меню обмена. */
  world: boolean;
  /** Пикселей CSS на пиксель мира и опция «Крупные цели». */
  css: number;
  bigTargets: boolean;
}
/** Что лежит под курсором; reach — запас к зоне тела в пикселях мира (pickReach). Зона и порядок при наложении — game/hit.ts (силуэт, плашка, след;
 *  точно → передний → текущая цель → ближе центр). */
export interface PickSource {
  /** Живой враг, которого здесь можно бить: мобы, боссы, герои в спорной зоне и на арене. */
  foe(reach: number): string | null;
  /** Герой чужой фракции в нейтральном городе: «враг», но бой там запрещён — удар клеймит нарушителем и зовёт стражу. */
  townFoe(reach: number): string | null;
  /** Мешок, узел добычи или NPC: при успехе кладёт в out kind (bag, node, npc), id или ref. */
  item(out: PickOut): boolean;
  /** Союзник-игрок, которому ПКМ откроет меню обмена (не я, не скрытый). */
  menu(reach: number): string | null;
  /** Союзник — игрок (в том числе я и павший) или питомец; мой герой и мои питомцы — с запасом own, остальные — с reach. */
  friend(reach: number, own: number): string | null;
}

/**
 * Один порядок для клика, подсветки (кого выберет ЛКМ) и курсора (кого атакует ПКМ): прицел → враг точно → мешок, узел (обе кнопки), NPC (в «Экшене» — только ПКМ) →
 * герой чужой фракции в нейтральном городе (только по телу) → меню союзника (ПКМ в мире) → союзник точно → враг магнитом (только ЛКМ в «Экшене») → земля.
 * «Точно» — зона тела с допуском 12 px экрана, магнит — 40 px (pickReach); прямое попадание по телу важнее чужого допуска, а допуск — магнита.
 * Без аллокаций: вызывается каждый кадр.
 */
export function pickOrder(c: PickCtx, s: PickSource, out: PickOut): PickOut {
  out.id = null;
  out.ref = null;
  if (c.aim) { out.kind = "aim"; return out; }
  const tol = pickReach(c.css, false, c.bigTargets);
  // сначала по самому телу, потом с допуском: допуск мелкого врага не отбирает клик у тела крупного (рейд-босс и приспешники)
  const foe = s.foe(0) ?? s.foe(tol);
  if (foe) { out.kind = "foe"; out.id = foe; return out; }
  // мешок и узел добычи берут обе кнопки; NPC в «Экшене» — только ПКМ (ЛКМ по нему — дальше по порядку)
  if (s.item(out)) {
    if (out.kind !== "npc" || c.right || !c.action) return out;
    out.id = null;
    out.ref = null;
  }
  // герой чужой фракции в нейтральном городе: удар по нему — нарушение, поэтому он после мешка, узла и NPC (торговка не уступает чужаку, стоящему на месте разговора) и без допуска
  const town = s.townFoe(0);
  if (town) { out.kind = "foe"; out.id = town; return out; }
  if (c.right && c.world) { const m = s.menu(tol); if (m) { out.kind = "menu"; out.id = m; return out; } }
  // свой герой и свои питомцы — только по телу: камера держит героя в центре экрана, и допуск сделал бы мёртвой зоной клик-шаг рядом с ним
  const friend = s.friend(tol, 0);
  if (friend) { out.kind = "friend"; out.id = friend; return out; }
  if (c.action && !c.right) { const m = s.foe(pickReach(c.css, true, c.bigTargets)); if (m) { out.kind = "magnet"; out.id = m; return out; } }
  out.kind = "ground";
  return out;
}

/** Кандидат для Tab: на экране ли (inView), видно ли от героя (los), бьёт ли меня (onMe). */
export interface TabUnit { id: string; x: number; y: number; dead: boolean; enemy: boolean; inView: boolean; los: boolean; onMe: boolean }
/** Порядок Tab (задача 134, шаг 3): только враги на экране (камера) с прямой видимостью; сначала те, кто бьёт меня, затем ближние к герою. */
export function tabOrder(list: readonly TabUnit[], self: { x: number; y: number }): string[] {
  const d = (u: TabUnit) => Math.hypot(u.x - self.x, u.y - self.y);
  return list.filter((u) => u.enemy && !u.dead && u.inView && u.los)
    .sort((a, b) => (a.onMe ? 0 : 1) - (b.onMe ? 0 : 1) || d(a) - d(b))
    .map((u) => u.id);
}
