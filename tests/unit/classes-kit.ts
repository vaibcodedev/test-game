/**
 * Общие заготовки тестов механик классов (tests/unit/classes-*.ts): арена без сети, герой со всеми умениями нужного ранга,
 * мишень-моб, учёт урона и лечения, прогон времени, типовые проверки умения (откат, мана, повтор, дальность, линия, рост с рангом).
 * Сам файл тестов не содержит (в tests/run-unit.ts не входит).
 */
import { World, type Actor } from "../../server/src/game/World";
import { Player, newSave } from "../../server/src/game/Player";
import { Mob } from "../../server/src/game/Mob";
import { castSkill } from "../../server/src/game/skills";
import { WorldState } from "../../server/src/rooms/schema";
import { generateArenaMap } from "../../shared/arena";
import { lineClear } from "../../shared/map";
import { aimSpec } from "../../shared/skillShape";
import { TILE, MAX_LEVEL } from "../../shared/constants";
import { MOBS, MOB_AI } from "../../shared/mobs";
import { SKILLS, skillMana, type SkillDef } from "../../shared/skills";
import { CLASSES, type ClassId } from "../../shared/classes";
import { makeItem, Rarity } from "../../shared/items";
import { assert, knownFail, test, withRandom } from "./lib";

export { castSkill, SKILLS, skillMana, withRandom };
export type { SkillDef, Actor };

/** Арена (круглая, стены по краю, 4 колонны: тайлы 19/26 × 15/20). Центр свободен: x 11…34, y 16…19. */
export const mkWorld = () => new World(new WorldState(), () => {}, { map: generateArenaMap(), mobs: false, quiet: true } as never);
/** Точка героя по умолчанию (тайл 14 × 18). */
export const HOME = { x: 14 * TILE, y: 18 * TILE };
/** Две точки по разные стороны колонны (19, 15): линии видимости между ними нет, расстояние 160 px. */
export const PILLAR = { a: { x: 16.5 * TILE, y: 15.5 * TILE }, b: { x: 21.5 * TILE, y: 15.5 * TILE } };

let uid = 0;
/** Герой класса cls уровня level (по умолчанию максимум — открыты все умения) с эпическим оружием своего уровня, полные здоровье и мана, вне боя. */
export function mkHero(w: World, cls: ClassId, at: { x: number; y: number } = HOME, level = MAX_LEVEL): Player {
  const save = newSave(cls, at);
  save.level = level;
  // оружие уровня героя (без случайности): урон и лечение крупные — ранги различимы без ошибки округления
  save.equip.weapon = makeItem(CLASSES[cls].startWeapon, level, Rarity.Epic, () => 0.5);
  const p = new Player(`k${++uid}`, `Класс${uid}`, save, () => {});
  w.addPlayer(p);
  p.unit.x = at.x;
  p.unit.y = at.y;
  p.unit.hp = p.unit.maxHp;
  p.unit.mp = p.unit.maxMp;
  p.combatAt = -1e12;
  return p;
}
/** Выучить умение на ранге rank (и пересчитать характеристики). */
export function learn(p: Player, id: string, rank = 1) {
  p.save.skills[id] = rank;
  p.recalc();
  p.unit.mp = p.unit.maxMp;
}
/** Сбросить откаты и GCD (между кастами одного теста). */
export function ready(p: Player) {
  p.cds.clear();
  p.gcdUntil = 0;
}

export const plainDef = Object.values(MOBS).find((d) => !d.boss && !MOB_AI[d.id]?.weak && !MOB_AI[d.id]?.kite && !MOB_AI[d.id]?.heal)!;
export const bossDef = Object.values(MOBS).find((d) => d.boss && !MOB_AI[d.id]?.weak) ?? Object.values(MOBS).find((d) => d.boss)!;

/**
 * Мишень-моб в точке (dx, dy) от героя: без брони, безобидный (урон 0), с огромным здоровьем — чтобы считать урон умения.
 * hp — своё здоровье (для казни, смерти цели).
 */
export function dummy(w: World, p: { x: number; y: number }, dx = 40, dy = 0, o: { def?: typeof plainDef; hp?: number; level?: number } = {}): Mob {
  const m = new Mob(w.uid("m"), o.def ?? plainDef, o.level ?? 60, { x: p.x + dx, y: p.y + dy });
  w.addMob(m);
  m.unit.x = p.x + dx;
  m.unit.y = p.y + dy;
  m.stats = { ...m.stats, armor: 0, dmg: 0 };
  m.baseStats = { ...m.baseStats, armor: 0, dmg: 0 };
  m.unit.hp = m.unit.maxHp = o.hp ?? 1e9;
  return m;
}

/** Учёт урона и лечения в мире: dealt — урон от героя (и его питомцев) по всем, taken — урон по герою, healed — лечение. */
export function meter(w: World) {
  const dealt = new Map<string, number>(), taken = new Map<string, number>(), healed = new Map<string, number>();
  const ad = w.applyDamage.bind(w);
  w.applyDamage = (dst, v, src) => {
    if (src) dealt.set(src.id, (dealt.get(src.id) ?? 0) + v);
    taken.set(dst.id, (taken.get(dst.id) ?? 0) + v);
    ad(dst, v, src);
  };
  const he = w.heal.bind(w);
  w.heal = (p, v, show, by) => {
    const got = he(p, v, show, by);
    healed.set(p.id, (healed.get(p.id) ?? 0) + got);
    return got;
  };
  return {
    dealt: (a: { id: string }) => dealt.get(a.id) ?? 0,
    taken: (a: { id: string }) => taken.get(a.id) ?? 0,
    healed: (a: { id: string }) => healed.get(a.id) ?? 0,
    reset: () => { dealt.clear(); taken.clear(); healed.clear(); },
  };
}

/** Броски — середина: урон детерминирован, без крита и уклонения. */
export const MID = [0.5];

/** Прогнать мир на ms миллисекунд шагами по 50 мс (броски — середина: урон детерминирован). */
export function run(w: World, ms: number) {
  withRandom(MID, () => { for (let t = 0; t < ms; t += 50) w.update(50); });
}


/** Куда целиться умением def с героя p в цель m (или по умолчанию — в точку перед героем). */
export function aimAt(def: SkillDef, p: Player, m?: Actor): { ax: number; ay: number; tid: string | null } {
  const aim = def.aim ?? (def.target === "self" ? "self" : def.target === "enemy" ? "unit" : "ground");
  if (aim === "self") return { ax: p.x, ay: p.y, tid: m?.id ?? null };
  if (aim === "dash") return { ax: p.x + 120, ay: p.y, tid: null };
  if (def.target === "ally") return { ax: p.x, ay: p.y, tid: null }; // на себя
  if (m) return { ax: m.x, ay: m.y, tid: m.id };
  return { ax: p.x + 60, ay: p.y, tid: null };
}

/** Каст умения id на ранге rank по мишени m: возвращает ответ сервера. */
export function cast(w: World, p: Player, id: string, m?: Actor, extra?: { ax?: number; ay?: number; tid?: string | null }) {
  const a = { ...aimAt(SKILLS[id], p, m), ...extra };
  if (m && SKILLS[id].target === "enemy") p.targetId = m.id;
  return withRandom(MID, () => castSkill(w, p, id, a.ax, a.ay, a.tid));
}

const DMG_KEYS = ["dmg", "tick", "hit", "burst", "mult"];
const HEAL_KEYS = ["heal", "absorb", "regen"];
/** Числовой параметр умения, который растёт с рангом (урон, лечение, поглощение и т. п.). */
export function growing(def: SkillDef): string[] {
  const a = def.v(1), b = def.v(def.maxRank);
  return Object.keys(a).filter((k) => b[k] > a[k]);
}
export const isDamage = (def: SkillDef) => growing(def).some((k) => DMG_KEYS.includes(k));
export const isHeal = (def: SkillDef) => growing(def).some((k) => HEAL_KEYS.includes(k));

/** Нужна ли умению подготовка (особые условия): pre(w, p, m) вызывается перед кастом. */
export type Prep = (w: World, p: Player, m: Mob) => void;

/**
 * Урон по мишени за окно ms после каста умения на ранге rank (новый мир на каждый замер: без чужих откатов и таймеров).
 * Автоатака героя отключена, броски — середина. Считается весь урон героя и его призывов.
 */
export function damageAt(cls: ClassId, id: string, rank: number, spec: SkillSpec = {}): number {
  const w = mkWorld(), p = mkHero(w, cls);
  learn(p, id, rank);
  const m = dummy(w, p);
  spec.prep?.(w, p, m);
  const mt = meter(w);
  p.attackAt = 1e15;
  const r = cast(w, p, id, m, spec.aim?.(w, p, m));
  assert.equal(r, null, `${id} r${rank}: каст отклонён: ${r}`);
  withRandom(MID, () => { for (let t = 0; t < (spec.ms ?? 12000); t += 50) { p.attackAt = 1e15; w.update(50); } });
  return mt.dealt(p);
}
/**
 * Лечение и щит цели за окно ms после каста на ранге rank: цель — герой из spec.aim (союзник) или сам кастер;
 * цель ранена до 1 HP при огромном запасе здоровья. Щит берётся сразу после каста (к концу окна он истекает).
 */
export function healAt(cls: ClassId, id: string, rank: number, spec: SkillSpec = {}): number {
  const w = mkWorld(), p = mkHero(w, cls);
  learn(p, id, rank);
  const m = dummy(w, p);
  spec.prep?.(w, p, m);
  const a = spec.aim?.(w, p, m);
  const t = (a?.tid && w.players.get(a.tid)) || p;
  t.unit.maxHp = 1e7;
  t.unit.hp = 1;
  if (t !== p) { p.unit.maxHp = 1e7; p.unit.hp = 5e6; } // кастер платит здоровьем (жертва, переливание) — с запасом
  const mt = meter(w);
  const shield0 = t.shieldAmt;
  p.attackAt = 1e15;
  const r = cast(w, p, id, m, a);
  assert.equal(r, null, `${id} r${rank}: каст отклонён: ${r}`);
  const shield = Math.max(0, t.shieldAmt - shield0);
  withRandom(MID, () => { for (let k = 0; k < (spec.ms ?? 12000); k += 50) { p.attackAt = 1e15; w.update(50); } });
  return mt.healed(t) + shield;
}

/** Особая цель каста (союзник и т. п.): вернуть точку и id. */
export type Aim = (w: World, p: Player, m: Mob) => { ax: number; ay: number; tid: string | null };

export interface SkillSpec {
  /** Цель каста вместо типовой (союзник для умений «на союзника, не на себя»). */
  aim?: Aim;
  /** Подготовка перед кастом (DoT на цели, яды, питомец и т. п.). */
  prep?: Prep;
  /** Не проверять точное списание маны (умение само меняет ману: высасывание, жертва). */
  manaFree?: boolean;
  /** Чем измерять рост с рангом: урон, лечение или не мерить (контроль, рывок, бафф без чисел в мире). */
  grow?: "dmg" | "heal" | "none";
  /** Окно замера, мс. */
  ms?: number;
}

/**
 * Типовой набор проверок активного умения (один test на пункт):
 * 1) каст проходит: мана −skillMana, откат = cd ранга, GCD (кроме offGcd); то же на максимальном ранге;
 * 2) повтор до отката — отказ без списания и без продления отката; после отката — снова можно;
 * 3) нулевая мана — отказ без отката (если умение стоит маны);
 * 4) умение на врага: цель дальше дальности — отказ без списаний; дальнобойное (≥ 200) — без линии видимости отказ;
 * 5) урон или лечение на максимальном ранге больше, чем на первом (замер в мире).
 */
export async function skillBasics(cls: ClassId, id: string, spec: SkillSpec = {}) {
  const def = SKILLS[id];
  const name = `${id} (${def.name})`;
  const go = (w: World, p: Player, m: Mob) => cast(w, p, id, m, spec.aim?.(w, p, m));
  await test(`${name}: каст проходит, мана −${def.mana ? "цена" : "0"}, откат по рангу${def.offGcd ? ", вне GCD" : ", GCD"}`, () => {
    const w = mkWorld(), p = mkHero(w, cls);
    learn(p, id, 1);
    const m = dummy(w, p);
    spec.prep?.(w, p, m);
    const mp = p.unit.mp;
    const r = go(w, p, m);
    assert.equal(r, null, `отказ: ${r}`);
    if (!spec.manaFree) assert.equal(mp - p.unit.mp, skillMana(def, 1, p.level), "списано маны");
    assert.equal(p.cds.get(id), w.time + def.cd!(1) * 1000, "откат");
    if (def.offGcd) assert.ok(p.gcdUntil <= w.time, "вне GCD, а GCD поставлен");
    else assert.ok(p.gcdUntil > w.time, "GCD не поставлен");
  });
  await test(`${name}: максимальный ранг ${def.maxRank} — каст проходит, мана и откат по этому рангу`, () => {
    const w = mkWorld(), p = mkHero(w, cls);
    learn(p, id, def.maxRank);
    const m = dummy(w, p);
    spec.prep?.(w, p, m);
    const mp = p.unit.mp;
    assert.equal(go(w, p, m), null);
    if (!spec.manaFree) assert.equal(mp - p.unit.mp, skillMana(def, def.maxRank, p.level), "списано маны");
    assert.equal(p.cds.get(id), w.time + def.cd!(def.maxRank) * 1000, "откат");
  });
  await test(`${name}: повтор до отката — отказ без списания; после отката — снова`, () => {
    const w = mkWorld(), p = mkHero(w, cls);
    learn(p, id, 1);
    const m = dummy(w, p);
    spec.prep?.(w, p, m);
    assert.equal(go(w, p, m), null);
    const cd = p.cds.get(id)!;
    p.gcdUntil = 0;
    p.unit.mp = p.unit.maxMp;
    const mp = p.unit.mp;
    go(w, p, m);
    assert.equal(p.unit.mp, mp, "мана списана на откате");
    assert.equal(p.cds.get(id), cd, "откат продлён");
    w.time = cd + 1;
    p.gcdUntil = 0;
    spec.prep?.(w, p, m);
    p.unit.mp = p.unit.maxMp;
    if (w.isDead(m)) return;
    assert.equal(go(w, p, m), null, "после отката не кастуется");
  });
  if (skillMana(def, 1, MAX_LEVEL) > 0)
    await test(`${name}: без маны — отказ, отката нет`, () => {
      const w = mkWorld(), p = mkHero(w, cls);
      learn(p, id, 1);
      const m = dummy(w, p);
      spec.prep?.(w, p, m);
      p.unit.mp = skillMana(def, 1, p.level) - 1;
      assert.ok(go(w, p, m), "прошло без маны");
      assert.ok(!p.cds.get(id), "откат поставлен");
    });
  if (def.target === "enemy") {
    await test(`${name}: цель дальше дальности (${def.range}) — отказ без списаний`, () => {
      const w = mkWorld(), p = mkHero(w, cls, { x: 11.5 * TILE, y: 18 * TILE });
      learn(p, id, 1);
      const m = dummy(w, p, (def.range ?? 0) + 180);
      spec.prep?.(w, p, m);
      m.unit.x = p.x + (def.range ?? 0) + 180; // prep мог подвинуть
      const mp = p.unit.mp;
      assert.ok(go(w, p, m), "каст прошёл");
      assert.equal(p.unit.mp, mp, "мана списана");
      assert.ok(!p.cds.get(id), "откат поставлен");
    });
    if ((def.range ?? 0) >= 200 && aimSpec(def).los)
      await test(`${name}: цель за колонной (нет линии видимости) — отказ без списаний`, () => {
        const w = mkWorld(), p = mkHero(w, cls, PILLAR.a);
        assert.ok(!lineClear(w.map, PILLAR.a.x, PILLAR.a.y, PILLAR.b.x, PILLAR.b.y), "колонна не закрывает линию");
        learn(p, id, 1);
        const m = dummy(w, p, PILLAR.b.x - PILLAR.a.x, 0);
        spec.prep?.(w, p, m);
        m.unit.x = PILLAR.b.x; m.unit.y = PILLAR.b.y;
        const mp = p.unit.mp;
        assert.ok(go(w, p, m), "каст прошёл сквозь колонну");
        assert.equal(p.unit.mp, mp, "мана списана");
        assert.ok(!p.cds.get(id), "откат поставлен");
      });
  }
  if (def.target === "point" && aimSpec(def).aim === "ground" && aimSpec(def).los)
    await test(`${name}: точка за колонной — отказ «нет видимости» без списаний`, () => {
      const w = mkWorld(), p = mkHero(w, cls, PILLAR.a);
      learn(p, id, 1);
      const m = dummy(w, p, PILLAR.b.x - PILLAR.a.x, 0);
      spec.prep?.(w, p, m);
      const mp = p.unit.mp;
      assert.ok(cast(w, p, id, undefined, { ax: PILLAR.b.x, ay: PILLAR.b.y, tid: null }), "каст прошёл сквозь колонну");
      assert.equal(p.unit.mp, mp, "мана списана");
      assert.ok(!p.cds.get(id), "откат поставлен");
    });
  const grow = spec.grow ?? (isDamage(def) ? "dmg" : isHeal(def) ? "heal" : "none");
  if (grow !== "none")
    await test(`${name}: ${grow === "dmg" ? "урон" : "лечение"} на ранге ${def.maxRank} больше, чем на 1-м`, () => {
      const f = grow === "dmg" ? damageAt : healAt;
      const a = f(cls, id, 1, spec), b = f(cls, id, def.maxRank, spec);
      assert.ok(a > 0, `на 1-м ранге ${grow === "dmg" ? "урона" : "лечения"} нет`);
      assert.ok(b > a, `ранг ${def.maxRank}: ${b} ≤ ранг 1: ${a}`);
    });
}

/** Все активные умения класса. */
export const activeOf = (cls: ClassId) => Object.values(SKILLS).filter((s) => s.cls === cls && s.kind === "active");

/** Типовые проверки для всех активных умений класса; specs — особые условия по id. */
export async function allBasics(cls: ClassId, specs: Record<string, SkillSpec> = {}) {
  for (const s of activeOf(cls)) await skillBasics(cls, s.id, specs[s.id]);
}

export { knownFail };
