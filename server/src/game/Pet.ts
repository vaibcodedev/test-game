/** Питомцы: серверные союзники игрока (следуют, бьют цель хозяина, умения, опыт, призыв). */
import { armorReduction } from "../../../shared/formulas";
import { lineClear } from "../../../shared/map";
import { Nav } from "../../../shared/path";
import { MOVE_MUL } from "../../../shared/constants";
import {
  PETS, PET_CAST_MS, PET_DROP_CHANCE, PET_FOLLOW_DIST, PET_IDS, PET_RESUMMON_MS, PET_TELEPORT_DIST,
  petStats, petUnitId, petXpToNext, sumUnitId, type PetDef,
} from "../../../shared/pets";
import { Anim, UnitKind } from "../../../shared/protocol";
import { Unit } from "../rooms/schema";
import type { Mob } from "./Mob";
import type { Actor } from "./World";
import type { Player } from "./Player";
import { World } from "./World";
import { GP } from "../../../shared/gameplay";
import { T } from "../../../shared/texts";
import { givePetSeal } from "./menagerie";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const PET_MOVE_R = GP.misc.petMoveRadius;

export class Pet {
  readonly unit = new Unit();
  readonly id: string;
  nav = new Nav();
  stats: ReturnType<typeof petStats>;
  attackAt = 0;
  shellUntil = 0;
  shellPct = 0;
  dead = false;
  cds = new Map<string, number>();

  constructor(readonly def: PetDef, readonly owner: Player, public level: number) {
    this.id = def.temp ? sumUnitId(owner.id, def.id) : petUnitId(owner.id);
    this.stats = petStats(def, level);
    const u = this.unit;
    u.kind = UnitKind.Pet;
    u.name = def.name;
    u.sprite = def.sprite;
    u.ownerId = owner.id;
    u.level = level;
    u.maxHp = this.stats.maxHp;
    u.hp = u.maxHp;
    u.x = owner.x + 20;
    u.y = owner.y + 8;
  }
  get x() { return this.unit.x; }
  get y() { return this.unit.y; }
  refresh() {
    this.stats = petStats(this.def, this.level);
    this.unit.maxHp = this.stats.maxHp;
    this.unit.level = this.level;
  }
}

// ---------- владение ----------
/** Выдаёт бесплатных питомцев по уровню (Волчонок — с 5-го). */
export function grantPets(w: World, p: Player) {
  const own = (p.save.pets ??= {});
  for (const d of Object.values(PETS)) {
    if (own[d.id] || d.price > 0 || p.level < d.level) continue;
    own[d.id] = { level: 1, xp: 0 };
    p.send("toast", { text: T("srv.Pet.119", { name: d.name }), kind: "level" });
  }
  if (!p.save.pet || !own[p.save.pet]) p.save.pet = Object.keys(own)[0] ?? "";
  p.selfDirty = true;
}

/** Редкая находка из добычи (задача 150): «Печать питомца» ещё не полученного питомца без особых условий (её можно изучить, продать или передать). */
export function rollPetDrop(w: World, p: Player, mult: number) {
  if (Math.random() >= PET_DROP_CHANCE * mult) return;
  const own = p.save.pets ?? {};
  const left = PET_IDS.filter((id) => PETS[id].price > 0 && !PETS[id].need && !PETS[id].faction && !own[id] && PETS[id].level <= p.level);
  if (!left.length) return;
  givePetSeal(p, left[Math.floor(Math.random() * left.length)]);
}

export function selectPet(w: World, p: Player, id: string) {
  if (!p.save.pets?.[id] || p.save.pet === id) return;
  dismissPet(w, p);
  p.save.pet = id;
  p.selfDirty = true;
}

// ---------- призыв ----------
export function cancelPetCast(p: Player) {
  if (!p.petCast) return;
  p.petCast = null;
  p.send("mountcast", { ms: 0 });
}

/** G: призвать (2 с на месте) или отпустить. */
export function togglePet(w: World, p: Player) {
  const err = (text: string) => p.send("toast", { text, kind: "error" });
  if (p.dead) return;
  if (w.pets.has(petUnitId(p.id))) return dismissPet(w, p);
  if (p.petCast) return cancelPetCast(p);
  if (w.opts.mobs === false || p.team !== 0) return err(T("srv.Pet.124"));
  const d = PETS[p.save.pet ?? ""];
  if (!d || !p.save.pets?.[d.id]) return err(T("srv.Pet.125"));
  if (w.time < p.petCdUntil) return err(T("srv.Pet.126", { ceil: Math.ceil((p.petCdUntil - w.time) / 1000) }));
  if (p.stunUntil > w.time || p.frozenUntil > w.time) return;
  p.input = { mx: 0, my: 0 };
  p.moveTo = null;
  p.petCast = { until: w.time + PET_CAST_MS, x: p.x, y: p.y };
  p.send("mountcast", { ms: PET_CAST_MS, name: d.name });
}

/** Вызывается каждый тик игрока: завершение или отмена призыва. */
export function tickPetCast(w: World, p: Player) {
  const c = p.petCast;
  if (!c) return;
  if (Math.hypot(p.x - c.x, p.y - c.y) > 0.5 || p.input.mx || p.input.my || p.moveTo || p.stunUntil > w.time) return cancelPetCast(p);
  if (w.time < c.until) return;
  p.petCast = null;
  p.send("mountcast", { ms: 0 });
  const d = PETS[p.save.pet ?? ""];
  const rec = p.save.pets?.[d?.id];
  if (!d || !rec) return;
  const pet = new Pet(d, p, rec.level);
  w.pets.set(pet.id, pet);
  w.state.mobs.set(pet.id, pet.unit);
  w.emit({ t: "spawn", id: pet.id, k: "smoke" });
}

/** Отпускает питомца героя: без id — постоянного, с id — указанного призыва (повторный призыв заменяет только свой вид). */
export function dismissPet(w: World, p: Player, id?: string) {
  if (!id) cancelPetCast(p);
  const pet = w.pets.get(id ?? petUnitId(p.id));
  if (pet) removePet(w, pet);
}

/** Все питомцы героя разом (выход из мира). */
export function dismissAllPets(w: World, p: Player) {
  cancelPetCast(p);
  for (const pet of [...w.pets.values()]) if (pet.owner === p) removePet(w, pet);
}

/** Любой питомец героя: постоянный, иначе первый призыв. */
export function anyPetOf(w: World, p: Player): Pet | undefined {
  const main = w.pets.get(petUnitId(p.id));
  if (main) return main;
  for (const pet of w.pets.values()) if (pet.owner === p) return pet;
  return undefined;
}

function removePet(w: World, pet: Pet) {
  w.pets.delete(pet.id);
  w.state.mobs.delete(pet.id);
  for (const m of w.mobs.values()) {
    m.threat.delete(pet.id);
    if (m.targetId === pet.id) m.targetId = null;
  }
}

function killPet(w: World, pet: Pet) {
  pet.dead = true;
  if (!pet.def.temp) {
    pet.owner.petCdUntil = w.time + PET_RESUMMON_MS;
    pet.owner.send("toast", { text: T("srv.Pet.127", { name: pet.def.name, pet_resummon_ms: PET_RESUMMON_MS / 1000 }), kind: "error" });
  }
  removePet(w, pet);
}

// ---------- опыт ----------
export function petXp(w: World, p: Player, xp: number) {
  const pet = w.pets.get(petUnitId(p.id));
  const rec = p.save.pets?.[pet?.def.id ?? ""];
  if (!pet || !rec || pet.dead || rec.level >= p.level) return;
  rec.xp += xp;
  let up = false;
  while (rec.level < p.level && rec.xp >= petXpToNext(rec.level)) {
    rec.xp -= petXpToNext(rec.level);
    rec.level++;
    up = true;
  }
  if (rec.level >= p.level) rec.xp = Math.min(rec.xp, petXpToNext(rec.level) - 1);
  if (up) {
    pet.level = rec.level;
    pet.refresh();
    pet.unit.hp = pet.unit.maxHp;
    w.emit({ t: "lvl", id: pet.id, level: rec.level });
    p.send("toast", { text: T("srv.Pet.128", { name: pet.def.name, level: rec.level }), kind: "level" });
  }
  p.selfDirty = true;
}

// ---------- бой ----------
/** Урон питомцу (от моба); панцирь снижает его. */
export function damagePet(w: World, pet: Pet, v: number) {
  if (pet.dead) return;
  if (pet.shellUntil > w.time) v *= 1 - pet.shellPct / 100;
  v = Math.max(1, Math.round(v));
  pet.unit.hp = Math.max(0, pet.unit.hp - v);
  w.emit({ t: "dmg", id: pet.id, v });
  pet.owner.combatAt = w.time;
  if (pet.unit.hp <= 0) killPet(w, pet);
}

export function mobAttackPet(w: World, m: Mob, pet: Pet) {
  const u = m.unit;
  m.attackAt = w.time + m.def.attackCd * 1000 * (u.buffs & 0x20 ? 0.7 : 1);
  u.dir = World.dirTo(pet.x - u.x, pet.y - u.y);
  u.aseq = (u.aseq + 1) % 65535;
  const dmg = () => m.stats.dmg * rnd(0.85, 1.15) * (u.buffs & 0x20 ? 1.3 : 1) * (1 - armorReduction(pet.stats.armor, m.level));
  if (m.def.projectile) {
    const ms = (w.dist(u, pet) / 300) * 1000;
    w.emit({ t: "proj", k: m.def.projectile, from: m.id, to: pet.id, tx: pet.x, ty: pet.y, ms });
    w.later(ms, () => { if (!m.dead && !pet.dead) damagePet(w, pet, dmg()); });
  } else {
    w.later(220, () => { if (!m.dead && !pet.dead && w.dist(m, pet) <= m.def.range + pet.def.radius + 24) damagePet(w, pet, dmg()); });
  }
}

/** Удар питомца: броня моба, кража угрозы, награды идут хозяину. */
function strike(w: World, pet: Pet, mob: Actor, mult: number, kind: "phys" | "fire" | "poison" = "phys", flat = false): number {
  if (pet.dead || w.isDead(mob)) return 0;
  let a = pet.stats.dmg * (flat ? 1 : rnd(0.85, 1.15)) * mult;
  // арена: цель — герой соперника; удар идёт от хозяина обычным путём (броня, щиты, статистика боя)
  if (w.isPlayer(mob)) return w.hostile(pet.owner, mob) ? w.hit(pet.owner, mob, { flat: Math.max(1, Math.round(a)), canCrit: false, kind, noProc: true, noBreak: true }) : 0;
  // неуязвимость и множитель получаемого урона — как в World.hitEx (босс рейда до пробуждения и в паузе фазы ×0.1, слабости моба)
  if (w.isImmune(mob)) return 0;
  a *= 1 - armorReduction(kind === "phys" ? mob.stats.armor : mob.stats.armor * 0.5, pet.level);
  a *= (mob.ai.weak?.dmg?.[kind] ?? 1) * mob.dmgTakenMul;
  const v = Math.max(1, Math.round(a));
  mob.addThreat(pet.id, v);
  w.emit({ t: "dmg", id: mob.id, v, k: kind });
  w.applyDamage(mob, v, pet.owner);
  return v;
}

export function petStep(w: World, pet: Pet, gx: number, gy: number, dt: number, speed: number, stopAt: number): boolean {
  const u = pet.unit;
  if (Math.hypot(gx - u.x, gy - u.y) <= stopAt + 0.5) return false;
  // ворота городов — по фракции хозяина (World.move / gateBlk): питомец не проходит сквозь закрытые для хозяина ворота
  const fac = pet.owner.faction;
  const wp = pet.nav.next(w.map, u.x, u.y, gx, gy, PET_MOVE_R, w.time, w.gateBlk(fac));
  if (!wp) return false;
  const final = wp.x === gx && wp.y === gy;
  const dx = wp.x - u.x, dy = wp.y - u.y, d = Math.hypot(dx, dy) || 1;
  const sp = Math.min(speed * dt, final ? d - stopAt : d);
  const n = w.move(u.x, u.y, (dx / d) * sp, (dy / d) * sp, PET_MOVE_R, fac);
  const moved = Math.abs(n.x - u.x) + Math.abs(n.y - u.y) > 0.01;
  const q = w.place(u.x, u.y, n, PET_MOVE_R, fac); // не Math.round: мог поставить на кромку стены — застревал
  u.x = q.x;
  u.y = q.y;
  u.dir = World.dirTo(dx, dy);
  return moved;
}

function pickTarget(w: World, pet: Pet): Actor | null {
  const o = pet.owner;
  if (w.opts.mobs === false) {
    // арена: питомец бьёт цель хозяина или ближайшего героя соперника (враги — по hostile, т. е. по команде)
    const ot = w.players.get(o.targetId ?? "");
    if (ot && !ot.dead && w.hostile(o, ot) && w.dist(ot, o) < 420) return ot;
    let pb: Actor | null = null, pd = 320;
    for (const e of w.players.values()) {
      if (e.dead || !w.hostile(o, e)) continue;
      const d = w.dist(e, o);
      if (d < pd) { pd = d; pb = e; }
    }
    if (pb) return pb;
    // рейд тоже без обычных мобов (mobs: false), но босс — моб: дальше выбор как в мире, иначе призывы стоят без дела
  }
  const t = w.mobs.get(o.targetId ?? "");
  if (t && !t.dead && w.dist(t, o) < 420) return t;
  let best: Mob | null = null, bd = 320;
  for (const m of w.mobs.values()) {
    if (m.dead || (m.targetId !== o.id && m.targetId !== pet.id)) continue;
    const d = w.dist(m, o);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

/** Пробует применить умение; true — применено (питомец занят на мгновение). */
function useSkill(w: World, pet: Pet, target: Actor | null, d: number): boolean {
  const t = w.time, o = pet.owner;
  for (const s of pet.def.skills) {
    if (t < (pet.cds.get(s.id) ?? 0)) continue;
    let ok = false;
    switch (s.type) {
      case "bleed":
        if (target && d <= pet.def.range + w.radiusOf(target) + 4) {
          ok = true;
          strike(w, pet, target, s.mult ?? 1);
          const ticks = Math.round((s.ms ?? 5000) / 1000);
          for (let i = 1; i <= ticks; i++) w.later(i * 1000, () => strike(w, pet, target, 0.25, "phys", true));
        }
        break;
      case "dot":
        if (target && d <= Math.max(pet.def.range, 60) + w.radiusOf(target) + 4) {
          ok = true;
          const kind = s.kind === "fire" ? "fire" : "poison";
          strike(w, pet, target, s.mult ?? 1, kind);
          const ticks = Math.round((s.ms ?? 5000) / 1000);
          for (let i = 1; i <= ticks; i++) w.later(i * 1000, () => strike(w, pet, target, 0.3, kind, true));
        }
        break;
      case "strike":
        if (target && d <= pet.def.range + w.radiusOf(target) + 24) {
          ok = true;
          strike(w, pet, target, s.mult ?? 1.5);
        }
        break;
      case "guard":
        if (target && !o.dead && o.warcryUntil <= t) {
          ok = true;
          o.warcryUntil = t + (s.ms ?? 10000);
          o.warcryDmg = 0;
          o.warcryArmor = Math.round(o.derived.armor * (s.pct ?? 20) / 100);
        }
        break;
      case "renew":
        if (!o.dead && o.unit.hp < o.unit.maxHp * 0.9 && w.dist(pet, o) < 300) {
          ok = true;
          const ticks = Math.round((s.ms ?? 6000) / 1000);
          for (let i = 1; i <= ticks; i++) w.later(i * 1000, () => { if (!o.dead && !pet.dead) w.heal(o, Math.round(o.unit.maxHp * (s.pct ?? 3) / 100)); });
        }
        break;
      case "bolt":
        if (target && d <= pet.def.range && lineClear(w.map, pet.x, pet.y, target.x, target.y)) {
          ok = true;
          const ms = (d / 420) * 1000;
          w.emit({ t: "proj", k: "fire", from: pet.id, to: target.id, tx: target.x, ty: target.y, ms });
          w.later(ms, () => strike(w, pet, target, s.mult ?? 1, "fire"));
        }
        break;
      case "howl":
        if (target && !o.dead && o.warcryUntil <= t) {
          ok = true;
          o.warcryUntil = t + (s.ms ?? 10000);
          o.warcryDmg = s.pct ?? 10;
          o.warcryArmor = 0;
        }
        break;
      case "heal":
        if (!o.dead && o.unit.hp < o.unit.maxHp * 0.7 && w.dist(pet, o) < 300) {
          ok = true;
          w.heal(o, Math.round(o.unit.maxHp * (s.pct ?? 10) / 100));
        }
        break;
      case "taunt":
        if (target) {
          const near = w.mobsInCircle(pet.x, pet.y, s.range ?? 160);
          if (near.length) {
            ok = true;
            for (const m of near) {
              let top = 0;
              for (const v of m.threat.values()) top = Math.max(top, v);
              m.threat.set(pet.id, top * 1.5 + 100);
            }
          }
        }
        break;
      case "shell":
        if (target && pet.unit.hp < pet.unit.maxHp * 0.8 && pet.shellUntil <= t) {
          ok = true;
          pet.shellUntil = t + (s.ms ?? 6000);
          pet.shellPct = s.pct ?? 50;
        }
        break;
    }
    if (!ok) continue;
    pet.cds.set(s.id, t + s.cd * 1000);
    pet.attackAt = Math.max(pet.attackAt, t + 450);
    pet.unit.aseq = (pet.unit.aseq + 1) % 65535;
    return true;
  }
  return false;
}

export function updatePet(w: World, pet: Pet, dt: number) {
  const o = pet.owner, u = pet.unit, t = w.time;
  if (pet.dead) return;
  // временный призыв (скелет, демон, зверь) исчезает со смертью хозяина
  if (pet.def.temp && o.dead) return removePet(w, pet);
  const od = w.dist(u, o);
  if (od > PET_TELEPORT_DIST) {
    u.x = o.x + (Math.random() - 0.5) * 40;
    u.y = o.y + 16;
    pet.nav = new Nav();
    w.emit({ t: "spawn", id: pet.id, k: "smoke" });
    return;
  }
  // лёгкая регенерация вне боя
  if (!o.inCombat(t) && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + Math.ceil(u.maxHp * 0.02 * dt * 5));
  u.buffs = pet.shellUntil > t ? 4 : 0;
  const target = o.dead ? null : pickTarget(w, pet);
  let moving = false;
  const follow = Math.max(pet.def.speed * MOVE_MUL, w.playerSpeed(o) * 1.1) * (od > 200 ? 1.5 : 1);
  if (target && od < 520) {
    const d = w.dist(u, target);
    u.target = target.id;
    const reach = pet.def.range + w.radiusOf(target);
    const clear = lineClear(w.map, u.x, u.y, target.x, target.y);
    if (t >= pet.attackAt && useSkill(w, pet, target, d)) {
      u.dir = World.dirTo(target.x - u.x, target.y - u.y);
    } else if (d > reach || !clear) moving = petStep(w, pet, target.x, target.y, dt, pet.def.speed * MOVE_MUL * 1.1, pet.def.projectile ? reach * 0.7 : reach - 6);
    else if (t >= pet.attackAt) {
      u.dir = World.dirTo(target.x - u.x, target.y - u.y);
      u.aseq = (u.aseq + 1) % 65535;
      pet.attackAt = t + pet.def.attackCd * 1000;
      if (pet.def.projectile) {
        const ms = (d / 420) * 1000;
        w.emit({ t: "proj", k: pet.def.projectile, from: pet.id, to: target.id, tx: target.x, ty: target.y, ms });
        w.later(ms, () => strike(w, pet, target, 1, "fire"));
      } else w.later(180, () => { if (!w.isDead(target) && w.dist(pet, target) <= reach + 24) strike(w, pet, target, 1); });
    }
  } else {
    u.target = "";
    // не толпимся: свободно держимся в ~2 тайлах от хозяина
    if (od > PET_FOLLOW_DIST) moving = petStep(w, pet, o.x, o.y, dt, follow, PET_FOLLOW_DIST * 0.6);
    useSkill(w, pet, null, od);
  }
  if (moving) u.anim = Anim.Walk;
  else if (u.anim === Anim.Walk) u.anim = Anim.Idle;
}
