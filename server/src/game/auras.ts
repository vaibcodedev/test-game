/**
 * Эффекты на герое для рамки в HUD: бафы (щиты, лечение со временем, ускорение, окна умений) и дебафы (контроль, замедление, яд...).
 * Сервер собирает их одним списком — auraList; клиент получает его отдельным сообщением "auras" (World.flush шлёт по подписи,
 * только когда изменился набор или сроки). Подписи, значки и вид (баф/дебаф) — data/auras.json (shared/auras.ts).
 *
 * Откуда берутся эффекты:
 *  - поля героя (FIELDS): срок «...Until» на часах World.time, величина (процент, остаток щита) и стаки — соседние поля;
 *  - состояние классов, спрятанное в модулях (WeakMap): модуль сам объявляет свои эффекты через registerAuraHook;
 *  - еда — из сохранения героя (save.food, срок в реальном времени Date.now()).
 * Служебные сроки (castUntil, gcdUntil, waitUntil, petCdUntil, frozenUntil арены, reviveUntil...) — не эффекты и здесь не перечислены.
 */
import { FOOD } from "../../../shared/food";
import { auraCompare, foodAuraKey } from "../../../shared/auras";
import type { Aura } from "../../../shared/protocol";

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
  { k: "laststand", until: "lastStandUntil" },
  { k: "renew", until: "renewUntil", v: "renewAmt", by: "renewBy" },
  { k: "bond", until: "bondUntil", v: "bondShare", by: "bondBy" },
  { k: "frenzy", until: "frenzyUntil", v: "frenzyLeech" },
  { k: "haste", until: "hasteUntil", v: "hastePct" },
  { k: "warcry", until: "warcryUntil", v: "warcryDmg" },
  { k: "stealth", until: "stealthUntil" },
  { k: "critnext", until: "critNextUntil" },
];

/** Один найденный эффект: ms — сколько осталось (0 — бессрочный), abs — устойчивая метка срока для подписи (не зависит от бега времени). */
interface Found { k: string; ms: number; abs: number; n: number; v: number }

/** Объявить эффект из состояния класса: ключ, срок на часах World.time (Infinity — бессрочный), стаки n и величина v. Срок в прошлом — эффекта нет. */
export type AuraEmit = (k: string, until: number, o?: { n?: number; v?: number }) => void;
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

/** Список эффектов героя и подпись списка; wall — реальное время (Date.now()) для еды. */
export function auraPack(a: object, now: number, wall = Date.now()): { list: Aura[]; sig: string } {
  const found = new Map<string, Found>();
  const add = (k: string, clock: number, until: number, n = 0, v = 0) => {
    if (!(until > clock)) return;
    const inf = !Number.isFinite(until);
    const f: Found = { k, ms: inf ? 0 : Math.max(1, Math.round(until - clock)), abs: inf ? 0 : until, n: n > 0 ? Math.round(n) : 0, v: v > 0 ? Math.round(v) : 0 };
    const cur = found.get(k);
    // один ключ из двух источников: остаётся тот, что дольше (бессрочный — всегда)
    if (!cur || (cur.abs !== 0 && (f.abs === 0 || f.abs > cur.abs))) found.set(k, f);
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
      add(d.k, now, num(a, d.until), d.n ? num(a, d.n) : 0, v);
    }
    const emit: AuraEmit = (k, until, o) => add(k, now, until, o?.n, o?.v);
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
    return o;
  });
  return { list, sig: rows.map((r) => `${r.k}:${Math.round(r.abs)}:${r.n}:${r.v}`).join("|") };
}

/** Эффекты героя (или заглушки актёра в тесте): бафы, затем дебафы. */
export function auraList(a: object, now: number, wall = Date.now()): Aura[] {
  return auraPack(a, now, wall).list;
}
