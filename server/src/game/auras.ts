/**
 * Эффекты на герое для рамки в HUD: бафы (щиты, лечение со временем, ускорение, окна умений) и дебафы (контроль, замедление, яд...).
 * Сервер собирает их одним списком — auraList; клиент получает его отдельным сообщением "auras" (World.flush шлёт по подписи,
 * только когда изменился набор или сроки). Подписи, значки и вид (баф/дебаф) — data/auras.json (shared/auras.ts).
 *
 * Откуда берутся эффекты:
 *  - поля героя (FIELDS): срок «...Until» на часах World.time, величина (процент, остаток щита) и стаки — соседние поля;
 *  - состояние классов, спрятанное в модулях (WeakMap): модуль сам объявляет свои эффекты через registerAuraHook;
 *    метки на герое-цели (охотник, шок, знак смерти, проклятие рока) лежат в состоянии наложившего, а у цели — обратная ссылка
 *    (WeakMap цель → наложивший): хук цели читает срок и величину у наложившего, поэтому метка и значок никогда не расходятся;
 *  - еда — из сохранения героя (save.food, срок в реальном времени Date.now()).
 * Щит-поглотитель: поле shieldAmt/shieldUntil (один «котёл» на героя), значок `shield` с остатком; пробит раньше срока — World.hitEx обнуляет
 * его и шлёт buff с ms 0 (effects.endShield), остаток для рамок цели и группы — Unit.shield. Подробный разбор по умениям — tools/out/auras-audit.md.
 * Служебные сроки (castUntil, gcdUntil, waitUntil, petCdUntil, frozenUntil арены, reviveUntil...) — не эффекты и здесь не перечислены.
 * Тот же список (плюс зоны умений и эффекты мобов) виден на юните всем игрокам комнаты: набор ключей обозначений кладёт в Unit.fx auraFx.ts (задача 129);
 * поле уходит вместе с x, y и hp (фильтра по расстоянию в проекте нет), но только при смене набора, а рисует его клиент лишь для юнитов в кадре.
 * Эффекты выбранной цели (плашка цели, как в WoW): тот же auraPack на цели (герой, моб, босс) с «наблюдателем» — эффекты, наложенные им,
 * помечены m: 1 (источник — noteAuraSource из effects.ts и периодических эффектов, поле «...By» реестра, by в хуках меток).
 * Список уходит только выбравшему (сообщение "tauras", targetAuras из World.flush), при смене цели и при смене подписи — как "auras" героя.
 */
import { FOOD } from "../../../shared/food";
import { auraCompare, foodAuraKey } from "../../../shared/auras";
import type { Aura, TargetAurasMsg } from "../../../shared/protocol";

/** Описание эффекта-поля героя. Всё, кроме k и срока, необязательно. */
interface FieldAura {
  /** Ключ в data/auras.json. */
  k: string;
  /** Поле срока (World.time, мс). Для флага без срока — поле-признак (true). */
  until: string;
  /** Флаг без срока (бессрочный эффект, пока признак истинен). */
  flag?: boolean;
  /** Поле величины: процент или остаток щита. */
  v?: string;
  /** Показывать, только когда величина > 0 (щит с остатком 0 уже не щит). */
  need?: boolean;
  /** Поле стаков. */
  n?: string;
  /** Поле «кто наложил»: эффект идёт, пока этот герой жив (узы и лечение со временем прекращаются со смертью лекаря). */
  by?: string;
}

/** Кто накладывал эффект k на цель и до какого срока (World.time): для пометки «мой» в плашке цели. Питомец — от имени хозяина. */
const sources = new WeakMap<object, Map<string, Map<object, number>>>();
const ownerOf = (by: object): object => ((by as { owner?: object }).owner ?? by);
/** Запомнить источник эффекта k на цели a до until (World.time). Вызывают общие наложения (effects.ts) и периодические эффекты. */
export function noteAuraSource(a: object, k: string, by: object | null | undefined, until: number) {
  if (!by || !(until > 0)) return;
  let m = sources.get(a);
  if (!m) sources.set(a, (m = new Map()));
  let s = m.get(k);
  if (!s) m.set(k, (s = new Map()));
  const o = ownerOf(by);
  s.set(o, Math.max(s.get(o) ?? 0, until));
}
/** Наложен ли эффект k на a наблюдателем (его срок ещё идёт); по дороге — уборка истёкших источников. */
function noted(a: object, k: string, viewer: object, now: number): boolean {
  const s = sources.get(a)?.get(k);
  if (!s) return false;
  for (const [by, until] of s) if (until <= now) s.delete(by);
  return (s.get(viewer) ?? 0) > now;
}

/** Реестр: поле → эффект. Вид (баф/дебаф) и порядок значков — в data/auras.json. */
export const AURA_FIELDS: readonly FieldAura[] = [
  // контроль и дебафы
  { k: "stun", until: "stunUntil" },
  { k: "root", until: "rootUntil" },
  { k: "slow", until: "slowUntil", v: "slowPct" },
  { k: "weak", until: "weakUntil", v: "weakPct" },
  { k: "bleed", until: "bleedUntil", n: "bleedStacks" },
  { k: "poison", until: "poisonUntil" },
  { k: "venom", until: "venomUntil", n: "venomStacks" },
  { k: "burn", until: "burnUntil" },
  { k: "curse", until: "curseUntil" },
  { k: "outlaw", until: "outlawUntil" },
  { k: "intruder", until: "intruder", flag: true },
  // щиты, лечение со временем, усиления
  { k: "shield", until: "shieldUntil", v: "shieldAmt", need: true },
  { k: "block", until: "blockUntil", v: "blockPct" },
  { k: "bone", until: "boneUntil", v: "boneChill" },
  { k: "laststand", until: "lastStandUntil", v: "lastStandPct" },
  { k: "renew", until: "renewUntil", v: "renewAmt", by: "renewBy" },
  { k: "bond", until: "bondUntil", v: "bondShare", by: "bondBy" },
  { k: "frenzy", until: "frenzyUntil", v: "frenzyLeech" },
  { k: "haste", until: "hasteUntil", v: "hastePct" },
  { k: "warcry", until: "warcryUntil", v: "warcryDmg" },
  { k: "stealth", until: "stealthUntil" },
  { k: "critnext", until: "critNextUntil" },
];

/** Один найденный эффект: ms — сколько осталось (0 — бессрочный), abs — устойчивая метка срока для подписи (не зависит от бега времени). */
interface Found { k: string; ms: number; abs: number; n: number; v: number; m: boolean }

/** Объявить эффект из состояния класса: ключ, срок на часах World.time (Infinity — бессрочный), стаки n и величина v. Срок в прошлом — эффекта нет. */
export type AuraEmit = (k: string, until: number, o?: { n?: number; v?: number; by?: object }) => void;
type AuraHook = (a: object, now: number, aura: AuraEmit) => void;
const hooks: AuraHook[] = [];

/** Модуль класса объявляет эффекты, которые хранит у себя (WeakMap): вызывается раз на герое за такт, только пока герой жив. */
export function registerAuraHook(h: AuraHook) {
  hooks.push(h);
}

const num = (a: object, f: string): number => {
  const x = (a as Record<string, unknown>)[f];
  return typeof x === "number" && !Number.isNaN(x) ? x : 0;
};

/** Список эффектов героя (или цели) и подпись списка; wall — реальное время (Date.now()) для еды.
 *  viewer — для плашки цели: эффекты, наложенные им, получают m: 1 (у списка героя для себя viewer не передаётся). */
export function auraPack(a: object, now: number, wall = Date.now(), viewer?: object): { list: Aura[]; sig: string } {
  const found = new Map<string, Found>();
  const add = (k: string, clock: number, until: number, n = 0, v = 0, by?: unknown) => {
    if (!(until > clock)) return;
    const inf = !Number.isFinite(until);
    const m = !!viewer && ((!!by && ownerOf(by as object) === viewer) || noted(a, k, viewer, now));
    const f: Found = { k, ms: inf ? 0 : Math.max(1, Math.round(until - clock)), abs: inf ? 0 : until, n: n > 0 ? Math.round(n) : 0, v: v > 0 ? Math.round(v) : 0, m };
    const cur = found.get(k);
    // один ключ из двух источников: остаётся тот, что дольше (бессрочный — всегда); «мой» — если мой хоть один из них
    if (!cur || (cur.abs !== 0 && (f.abs === 0 || f.abs > cur.abs))) { if (cur?.m) f.m = true; found.set(k, f); } else if (m) cur.m = true;
  };
  const actor = a as Record<string, unknown>;
  if (actor.dead !== true) {
    for (const d of AURA_FIELDS) {
      if (d.flag) {
        if (actor[d.until] === true) add(d.k, now, Infinity);
        continue;
      }
      if (d.by) {
        const by = actor[d.by] as { dead?: boolean } | null | undefined;
        if (!by || by.dead) continue;
      }
      const v = d.v ? num(a, d.v) : 0;
      if (d.need && !(v >= 1)) continue;
      add(d.k, now, num(a, d.until), d.n ? num(a, d.n) : 0, v, d.by ? actor[d.by] : undefined);
    }
    const emit: AuraEmit = (k, until, o) => add(k, now, until, o?.n, o?.v, o?.by);
    for (const h of hooks) h(a, now, emit);
  }
  // еда: из сохранения героя, срок в реальном времени
  const food = (actor.save as { food?: { id: string; until: number } | null } | undefined)?.food;
  if (food && FOOD[food.id]) add(foodAuraKey(food.id), wall, food.until);

  const rows = [...found.values()].sort((x, y) => auraCompare(x.k, y.k));
  const list: Aura[] = rows.map((r) => {
    const o: Aura = { k: r.k, ms: r.ms };
    if (r.n) o.n = r.n;
    if (r.v) o.v = r.v;
    if (r.m) o.m = 1;
    return o;
  });
  return { list, sig: rows.map((r) => `${r.k}:${Math.round(r.abs)}:${r.n}:${r.v}${r.m ? ":m" : ""}`).join("|") };
}

/** Подпись последнего списка эффектов цели, отправленного игроку ("tauras"); нет записи — ничего не слали (цели не было). */
const targetSig = new WeakMap<object, string>();
/**
 * Эффекты выбранной цели для плашки цели (World.flush, только этому игроку): сообщение { id, list } — если сменилась цель или подпись списка, иначе null.
 * target — живой юнит цели или undefined (цели нет, умерла, ушла, скрылась): тогда один раз уходит { id: null, list: [] }.
 */
export function targetAuras(p: object, target: { id: string } | undefined, now: number, wall = Date.now()): TargetAurasMsg | null {
  const pack = target ? auraPack(target, now, wall, p) : null;
  const sig = target ? `${target.id}#${pack!.sig}` : "";
  const prev = targetSig.get(p);
  if (prev === sig || (prev === undefined && !target)) return null;
  targetSig.set(p, sig);
  return { id: target ? target.id : null, list: pack ? pack.list : [] };
}
/** Забыть, что слали игроку (переподключение): следующий такт пришлёт список цели заново. */
export function resetTargetAuras(p: object) {
  targetSig.delete(p);
}

/** Эффекты героя (или заглушки актёра в тесте): бафы, затем дебафы. */
export function auraList(a: object, now: number, wall = Date.now()): Aura[] {
  return auraPack(a, now, wall).list;
}
