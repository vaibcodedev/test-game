/**
 * Боссы стартовых земель (задача 136, шаг 4) и кольца (задача 139: data/ring-bosses.json, места layout.ringBosses, добыча
 * data/ring-boss-loot.json): server/src/game/zoneBosses.ts, карточки data/zone-bosses.json, места layout.zoneBosses,
 * добыча data/zone-boss-loot.json. Без сервера: мир в памяти, такт 50 мс. Проверяет:
 *  1. каждый из 8 боссов стоит на своём месте — в зоне своей карточки, на своей стороне, пары зеркальны (x → 1099 − x по клеткам),
 *     арена проходима и не задевает дороги, поселения, места и города;
 *  2. каждое умение: предупреждение на земле (tele) раньше удара не меньше чем на windupMs карточки, стоящего в форме бьёт,
 *     уклонившийся (вышел из всех форм и пятен до удара) получает 0;
 *  3. возрождение — ровно через 30 мин, на своём месте, с полным здоровьем;
 *  4. добыча — по таблице: особая вещь не чаще шанса, не больше одной, только по классу, уровни вещей из таблицы, золото ×mult.
 */
import cards from "../data/zone-bosses.json";
import ringCards from "../data/ring-bosses.json";
import world from "../data/world.json";
import { TILE, MAP_W } from "../shared/constants";
import { CITIES } from "../shared/cities";
import { BOSS_SPAWNS, CELL_BLOCK, PLACES, ZONES, roadDist, zoneAtPx } from "../shared/map";
import { SETTLEMENTS } from "../shared/settlements";
import { BASE_ITEMS, Rarity, UNIQUES } from "../shared/items";
import { MOBS } from "../shared/mobs";
import { BAL } from "../shared/balance";
import { ZB_LOOT, type ZbCard } from "../shared/zoneBosses";
import type { Fx } from "../shared/protocol";
import { World } from "../server/src/game/World";
import type { Mob } from "../server/src/game/Mob";
import { Player, newSave } from "../server/src/game/Player";
import { bossLootDenied, zoneBossItems } from "../server/src/game/rewards";
import { WorldState } from "../server/src/rooms/schema";
import type { ClassId } from "../shared/classes";

let bad = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`); };
const CARDS = [...(cards.bosses as unknown as ZbCard[]), ...(ringCards.bosses as unknown as ZbCard[])];

const w = new World(new WorldState(), () => {});
const log: { t: number; f: Fx }[] = [];
const emit0 = w.emit.bind(w);
w.emit = (f: Fx, tag?: boolean) => { log.push({ t: w.time, f }); emit0(f, tag); };
let hits: { src: unknown; dst: unknown; v: number; t: number }[] = [];
w.onDamage = (src, dst, v) => hits.push({ src, dst, v, t: w.time });
let uid = 0;
function hero(cls: ClassId, x: number, y: number, level: number): Player {
  const save = newSave(cls, { x, y });
  save.level = level;
  const p = new Player(`h${++uid}`, `Герой${uid}`, save, () => {});
  w.addPlayer(p);
  p.recalc();
  p.unit.hp = p.unit.maxHp;
  p.unit.x = x;
  p.unit.y = y;
  return p;
}
const mobOf = (id: string) => [...w.mobs.values()].find((m) => m.def.id === id)!;
type Shape = { shape: string; x: number; y: number; r: number; r2?: number; a?: number; w?: number; until: number };
const inside = (s: Shape, x: number, y: number, pad: number) => {
  const d = Math.hypot(x - s.x, y - s.y);
  if (s.shape === "circle") return d <= s.r + pad;
  if (s.shape === "ring") return d >= s.r - pad && d <= (s.r2 ?? s.r * 2) + pad;
  let da = Math.atan2(y - s.y, x - s.x) - (s.a ?? 0);
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  return d <= s.r + pad && Math.abs(da) <= (s.w ?? 1) / 2 + 0.25;
};
/** Точка внутри формы (для героя, который не уклоняется). */
const into = (s: Shape): [number, number] => {
  if (s.shape === "circle") return [s.x + 2, s.y];
  if (s.shape === "ring") { const r = (s.r + (s.r2 ?? s.r * 2)) / 2; return [s.x + r, s.y]; }
  return [s.x + Math.cos(s.a ?? 0) * s.r * 0.5, s.y + Math.sin(s.a ?? 0) * s.r * 0.5];
};

// ---------- 1. места ----------
console.log("1. места");
{
  const layout = world.layout as unknown as { zoneBosses: { west: string; east: string; x: number; y: number; arena: number }[] };
  check("8 боссов в layout.zoneBosses (4 пары)", layout.zoneBosses.length === 4 && new Set(layout.zoneBosses.flatMap((z) => [z.west, z.east])).size === 8);
  const m = w.map;
  for (const c of CARDS) {
    const sp = BOSS_SPAWNS.find((b) => b.id === c.id);
    const mob = mobOf(c.id);
    if (!sp || !mob) { check(`${c.id}: стоит на карте`, false); continue; }
    const zone = ZONES[zoneAtPx(m, sp.x, sp.y)].name;
    const west = sp.x < (MAP_W * TILE) / 2;
    const cx = sp.x / TILE, cy = sp.y / TILE, ar = sp.arena / TILE;
    let cells = 0, free = 0, foreign = 0;
    for (let j = -ar; j <= ar; j++) for (let i = -ar; i <= ar; i++) {
      if (i * i + j * j > ar * ar) continue;
      const x = Math.floor(cx + i), y = Math.floor(cy + j);
      cells++;
      if (!(m.cell[y * m.w + x] & CELL_BLOCK)) free++;
      if (ZONES[m.zone[y * m.w + x]].name !== c.location) foreign++;
    }
    const placeD = Math.min(...PLACES.map((p) => Math.hypot(p.x + 0.5 - cx, p.y + 0.5 - cy)));
    const settleD = Math.min(...SETTLEMENTS.map((s) => Math.hypot(s.x + 0.5 - cx, s.y + 0.5 - cy)));
    const cityD = Math.min(...CITIES.map((q) => Math.hypot(q.x + 0.5 - cx, q.y + 0.5 - cy)));
    const ok = zone === c.location && west === (c.faction === "solgard") && mob.home.x === sp.x && mob.home.y === sp.y && mob.level === c.levels.boss && sp.arena === 320;
    check(`${c.id}: «${c.location}», ${west ? "запад" : "восток"}, ур. ${mob.level}`, ok, `зона на карте «${zone}», (${cx.toFixed(1)}, ${cy.toFixed(1)})`);
    check(`${c.id}: арена в своей зоне и проходима`, foreign === 0 && free >= cells * 0.85, `свободно ${free}/${cells}, чужих клеток ${foreign}`);
    check(`${c.id}: арена не задевает дорог, поселений, мест и городов`, roadDist(cx, cy) > ar + 3 && placeD > ar + 12 && settleD > ar + 12 && cityD > ar + 20, `дорога ${roadDist(cx, cy).toFixed(1)}, место ${placeD.toFixed(1)}, поселение ${settleD.toFixed(1)}, город ${cityD.toFixed(1)} тайлов`);
  }
  for (const z of layout.zoneBosses) {
    const a = BOSS_SPAWNS.find((b) => b.id === z.west)!, b = BOSS_SPAWNS.find((q) => q.id === z.east)!;
    check(`пара ${z.west} | ${z.east} зеркальна`, a && b && Math.floor(a.x / TILE) === MAP_W - 1 - Math.floor(b.x / TILE) && a.y === b.y && a.x + b.x === MAP_W * TILE);
  }
}

// ---------- 2. умения: предупреждение раньше удара, уклонившийся цел ----------
console.log("2. умения");
for (const c of CARDS) {
  const mob = mobOf(c.id);
  const boss = mob.boss as unknown as { abilities: { at: number }[]; run: (ab: unknown) => void; casting: boolean };
  for (const ab of c.abilities) {
    if (ab.cage) {
      // клетки: кол не сломан — через holdMs удар внутрь; сломан — урона нет; пока кол стоит, босс получает урон ×shield
      for (const mode of ["stand", "break"] as const) {
        mob.reset();
        for (const a of boss.abilities) a.at = 1e9;
        const p = hero("warrior", mob.x + 150, mob.y + 30, c.levels.boss);
        mob.state = "chase";
        mob.targetId = p.id;
        mob.addThreat(p.id, 100);
        log.length = 0;
        hits = [];
        boss.run(ab);
        const t0 = w.time;
        let shieldSeen = 1, after = 1;
        for (let t = 0; t < ab.windupMs + ab.cage.holdMs + 800; t += 50) {
          p.unit.hp = p.unit.maxHp;
          mob.attackAt = w.time + 1e9;
          w.update(50);
          const stake = [...w.mobs.values()].find((m) => m.def.id === `${c.id}_cage` && !m.dead);
          if (stake) shieldSeen = Math.min(shieldSeen, mob.dmgTakenMul);
          if (mode === "break" && stake && t >= ab.windupMs + 1000) { w.killMob(stake, p); }
          if (mode === "break" && t === ab.windupMs + 1500) after = mob.dmgTakenMul;
        }
        const mine = hits.filter((h) => h.dst === p && h.src === mob);
        if (mode === "stand") check(`${c.id}.${ab.id}: кол цел — клетка бьёт внутрь через ${ab.cage.holdMs} мс, босс под щитом ×${ab.cage.shield}`, mine.length > 0 && mine[0].t - t0 >= ab.windupMs + ab.cage.holdMs - 60 && shieldSeen === ab.cage.shield, `удар через ${mine[0] ? mine[0].t - t0 : -1} мс, щит ${shieldSeen}`);
        else check(`${c.id}.${ab.id}: кол сломан — урона нет, щит снят`, mine.length === 0 && after === 1 && log.some((e) => e.f.t === "zb" && (e.f as { ab: string }).ab === "cage_break"), `урон ${mine.reduce((s, h) => s + h.v, 0)}, щит после ${after}`);
        w.removePlayer(p.id);
      }
      continue;
    }
    if (ab.break) {
      // прерываемый каст: не сорвали — бьёт всех на арене; сорвали (сняли pct здоровья) — урона нет, босс оглушён
      for (const mode of ["stand", "break"] as const) {
        mob.reset();
        for (const a of boss.abilities) a.at = 1e9;
        const p = hero("warrior", mob.x + 150, mob.y + 30, c.levels.boss);
        mob.state = "chase";
        mob.targetId = p.id;
        mob.addThreat(p.id, 100);
        log.length = 0;
        hits = [];
        if (mode === "stand" && ab.break.heal) mob.unit.hp = Math.floor(mob.unit.maxHp * 0.8);
        const hp0 = mob.unit.hp;
        boss.run(ab);
        const t0 = w.time;
        for (let t = 0; t < ab.windupMs + 1200; t += 50) {
          if (mode === "break" && t === 1000) mob.unit.hp -= Math.ceil(ab.break.pct * mob.unit.maxHp) + 1;
          p.unit.hp = p.unit.maxHp;
          mob.attackAt = w.time + 1e9;
          w.update(50);
        }
        const mine = hits.filter((h) => h.dst === p && h.src === mob);
        const zb = log.find((e) => e.f.t === "zb" && (e.f as { ab: string }).ab === ab.id);
        const broke = log.some((e) => e.f.t === "zb" && (e.f as { ab: string }).ab === "break");
        if (mode === "stand" && ab.break.heal) check(`${c.id}.${ab.id}: не сорван — котёл лечит босса на ${ab.break.heal * 100} %, героев не бьёт`, !!zb && mine.length === 0 && Math.abs(mob.unit.hp - hp0 - ab.break.heal * mob.unit.maxHp) <= 2, `было ${hp0}, стало ${mob.unit.hp}, ударов ${mine.length} в ${mine.slice(0, 4).map((h) => Math.round(h.t - t0)).join(",")}, zb ${!!zb}`);
        else if (mode === "stand") check(`${c.id}.${ab.id}: не сорван — удар по всей арене в конце каста`, !!zb && mine.length > 0 && mine[0].t - t0 >= ab.windupMs - 60 && !broke, `удар через ${mine[0] ? mine[0].t - t0 : -1} мс (каст ${ab.windupMs})`);
        else check(`${c.id}.${ab.id}: сорван — урона нет, босс оглушён`, broke && mine.length === 0 && mob.stunUntil > t0 + 1000, `урон ${mine.reduce((s, h) => s + h.v, 0)}`);
        w.removePlayer(p.id);
      }
      continue;
    }
    if (ab.swarm) {
      // рой: после замаха у босса count приспешников без добычи, здоровье — доля скорпиона; гибнут вместе с боссом
      mob.reset();
      for (const a of boss.abilities) a.at = 1e9;
      const p = hero("warrior", mob.x + 150, mob.y + 30, c.levels.boss);
      mob.state = "chase";
      mob.targetId = p.id;
      mob.addThreat(p.id, 100);
      mob.attackAt = w.time + 1e9;
      boss.run(ab);
      for (let t = 0; t < ab.windupMs + 600; t += 50) { p.unit.hp = p.unit.maxHp; mob.attackAt = w.time + 1e9; w.update(50); }
      const sw = [...w.mobs.values()].filter((m) => m.def.id === `${c.id}_swarm` && !m.dead);
      check(`${c.id}.${ab.id}: ${ab.swarm.count} приспешников вылезли после замаха`, sw.length === ab.swarm.count, `приспешников ${sw.length}`);
      check(`${c.id}.${ab.id}: приспешник — без добычи (опыт 0, золото 0), слабее босса`, sw.every((d) => d.def.xp === 0 && d.def.gold === 0 && d.unit.maxHp < mob.unit.maxHp * 0.2), `${sw[0]?.unit.maxHp} из ${mob.unit.maxHp}`);
      mob.reset();
      w.update(100);
      check(`${c.id}.${ab.id}: при сбросе боя приспешники убраны`, ![...w.mobs.values()].some((m) => m.def.id === `${c.id}_swarm` && !m.dead));
      w.removePlayer(p.id);
      continue;
    }
    if (ab.safe) {
      // укрытия: в миг удара урон получает только тот, кто вне всех столбов
      for (const mode of ["open", "cover"] as const) {
        mob.reset();
        for (const a of boss.abilities) a.at = 1e9;
        const p = hero("warrior", mob.x + 150, mob.y + 30, c.levels.boss);
        mob.state = "chase";
        mob.targetId = p.id;
        mob.addThreat(p.id, 100);
        log.length = 0;
        hits = [];
        boss.run(ab);
        const zb = log.find((e) => e.f.t === "zb" && (e.f as { ab: string }).ab === ab.id)?.f as { pts: number[]; r: number } | undefined;
        check(`${c.id}.${ab.id}: ${ab.safe.count} укрытий помечены событием`, !!zb && zb.pts.length === ab.safe.count * 2 && zb.r === ab.safe.r, `точек ${zb?.pts.length}`);
        if (mode === "cover" && zb) { p.unit.x = zb.pts[0]; p.unit.y = zb.pts[1]; }
        for (let t = 0; t < ab.windupMs + 500; t += 50) { mob.attackAt = w.time + 1e9; w.update(50); }
        const mine = hits.filter((h) => h.dst === p && h.src === mob);
        check(`${c.id}.${ab.id}: ${mode === "cover" ? "в укрытии урона нет" : "вне укрытий — удар"}`, mode === "cover" ? mine.length === 0 : mine.length > 0, `ударов ${mine.length}`);
        w.removePlayer(p.id);
      }
      continue;
    }
    if (ab.burrow) {
      // подкоп: от начала замаха и до выхода босс неуязвим (урон ×0), потом снова бьётся
      mob.reset();
      for (const a of boss.abilities) a.at = 1e9;
      const p = hero("warrior", mob.x + 150, mob.y + 30, c.levels.boss);
      mob.state = "chase";
      mob.targetId = p.id;
      mob.addThreat(p.id, 100);
      boss.run(ab);
      w.update(100);
      const under = mob.dmgTakenMul;
      for (let t = 0; t < ab.burrow.invulnMs + 400; t += 50) { p.unit.hp = p.unit.maxHp; mob.attackAt = w.time + 1e9; w.update(50); }
      check(`${c.id}.${ab.id}: под песком неуязвим (×${under}), после выхода — снова ×${mob.dmgTakenMul}`, under === 0 && mob.dmgTakenMul === 1, `${under} → ${mob.dmgTakenMul}`);
      mob.reset();
      check(`${c.id}.${ab.id}: сброс боя снимает неуязвимость`, mob.dmgTakenMul === 1);
      w.removePlayer(p.id);
    }
    if (ab.doubles) {
      // мираж-двойники: после замаха стоят по краю арены, гибнут от одного удара; кольцо повторяют только живые
      mob.reset();
      (w as unknown as { hazards: unknown[] }).hazards = [];
      for (const a of boss.abilities) a.at = 1e9;
      const p = hero("warrior", mob.x + 150, mob.y + 30, c.levels.boss);
      mob.state = "chase";
      mob.targetId = p.id;
      mob.addThreat(p.id, 100);
      mob.attackAt = w.time + 1e9;
      log.length = 0;
      boss.run(ab);
      for (let t = 0; t < ab.windupMs + 600; t += 50) { p.unit.hp = p.unit.maxHp; w.update(50); }
      const ds = [...w.mobs.values()].filter((m) => m.def.id === `${c.id}_mirage` && !m.dead);
      const edge = ds.every((d) => Math.hypot(d.x - mob.home.x, d.y - mob.home.y) > 150 && Math.hypot(d.x - mob.home.x, d.y - mob.home.y) < 330);
      check(`${c.id}.${ab.id}: ${ab.doubles.count} двойников встали по краю арены`, ds.length === ab.doubles.count && edge, `двойников ${ds.length}`);
      check(`${c.id}.${ab.id}: двойник — от одного удара (здоровье < 1 % босса), без добычи`, ds.every((d) => d.unit.maxHp < mob.unit.maxHp * 0.01 && d.def.xp === 0 && d.def.gold === 0), `${ds[0]?.unit.maxHp} из ${mob.unit.maxHp}`);
      const tw = c.abilities.find((x) => x.id === ab.doubles!.mirror)!;
      const zbs = (id: string) => log.filter((e) => e.f.t === "zb" && (e.f as { ab: string }).ab === id).length;
      log.length = 0;
      boss.run(tw);
      w.update(100);
      const all = zbs(`${tw.id}_mirage`);
      for (let t = 0; t < tw.windupMs + 400; t += 50) { p.unit.hp = p.unit.maxHp; w.update(50); }
      if (ds[0]) w.killMob(ds[0]);
      mob.reset();
      check(`${c.id}.${tw.id}: кольцо повторяет каждый живой двойник (${all} из ${ds.length})`, all === ds.length);
      for (const a of boss.abilities) a.at = 1e9;
      mob.state = "chase";
      mob.targetId = p.id;
      mob.addThreat(p.id, 100);
      w.removePlayer(p.id);
      continue;
    }
    for (const mode of ["stand", "dodge"] as const) {
      // чистый бой: босс дома, полон, умения сами не идут, пятна прошлых прогонов убраны
      mob.reset();
      (w as unknown as { hazards: unknown[] }).hazards = [];
      for (const a of boss.abilities) a.at = 1e9;
      const p = hero("warrior", mob.x + 150, mob.y + 30, c.levels.boss);
      mob.state = "chase";
      mob.targetId = p.id;
      mob.addThreat(p.id, 100);
      log.length = 0;
      hits = [];
      boss.run(ab);
      const total = [ab, ...(ab.then ?? [])].reduce((s, wv) => s + wv.windupMs + ((wv.at === "path" || wv.at === "hunt") && wv.count ? (wv.count - 1) * (wv.stepMs ?? 0) : 0), 0);
      const shapes: Shape[] = [];
      let seen = 0;
      for (let t = 0; t < total + 1200; t += 50) {
        // новые формы на земле: предупреждения и пятна
        for (; seen < log.length; seen++) {
          const f = log[seen].f;
          if (f.t === "tele") shapes.push({ shape: f.shape, x: f.x, y: f.y, r: f.r, r2: f.r2, a: f.a, w: f.w, until: log[seen].t + f.ms });
          if (f.t === "hazard") shapes.push({ shape: "circle", x: f.x, y: f.y, r: f.r, until: log[seen].t + f.ms });
          if (f.t !== "tele" && f.t !== "hazard") continue;
          const live = shapes.filter((s) => s.until > w.time);
          if (mode === "stand") {
            // стоит в первой форме волны (не уклоняется)
            if (f.t === "tele" && !live.slice(0, -1).some((s) => inside(s, p.x, p.y, 0))) { const [x, y] = into(live[live.length - 1]); p.unit.x = x; p.unit.y = y; }
          } else if (live.some((s) => inside(s, p.x, p.y, 24))) {
            // уклоняется: ближайшая точка вне всех форм и пятен, не вплотную к боссу и в пределах арены
            let best: [number, number] | null = null, bd = 1e9;
            for (let r = 130; r <= 460; r += 15) for (let k = 0; k < 48; k++) {
              const a = (k / 48) * Math.PI * 2, x = mob.x + Math.cos(a) * r, y = mob.y + Math.sin(a) * r;
              if (live.some((s) => inside(s, x, y, 24))) continue;
              const d = Math.hypot(x - p.x, y - p.y);
              if (d < bd) { bd = d; best = [x, y]; }
            }
            if (best) { p.unit.x = best[0]; p.unit.y = best[1]; }
          }
        }
        p.unit.hp = p.unit.maxHp;
        mob.attackAt = w.time + 1e9; // без обычных ударов: меряем только умение
        w.update(50);
      }
      const mine = hits.filter((h) => h.dst === p && h.src === mob);
      const tele = log.find((e) => e.f.t === "tele");
      const zb = log.find((e) => e.f.t === "zb");
      if (mode === "stand") {
        const first = mine[0];
        const lead = first && tele ? first.t - tele.t : -1;
        check(`${c.id}.${ab.id}: предупреждение до удара и событие вида`, !!tele && !!zb && !!first && lead >= ab.windupMs - 60, `предупреждение за ${lead} мс (карточка ${ab.windupMs}), урон ${mine.reduce((s, h) => s + h.v, 0)}`);
      } else {
        const dmg = mine.reduce((s, h) => s + h.v, 0);
        check(`${c.id}.${ab.id}: уклонившийся цел`, !!tele && dmg === 0, `урон ${dmg}`);
      }
      w.removePlayer(p.id);
    }
  }
  mob.reset();
}

// ---------- 2в. кольцо: общая метка делится, фаза включает новые умения ----------
console.log("2в. кольцо: share и фазы");
for (const c of CARDS.filter((q) => q.phases?.length || q.abilities.some((a) => a.share))) {
  const mob = mobOf(c.id);
  const boss = mob.boss as unknown as { abilities: { at: number; every: number }[]; run: (ab: unknown) => void };
  for (const ab of c.abilities.filter((a) => a.share)) {
    const dmgOf = (n: number) => {
      mob.reset();
      for (const a of boss.abilities) a.at = 1e9;
      const ps = Array.from({ length: n }, (_, i) => hero("warrior", mob.x + 150 + i * 4, mob.y + 30, c.levels.boss));
      mob.state = "chase";
      mob.targetId = ps[0].id;
      mob.addThreat(ps[0].id, 100);
      log.length = 0;
      hits = [];
      boss.run(ab);
      for (let t = 0; t < ab.windupMs + 600; t += 50) {
        for (const q of ps) { q.unit.hp = q.unit.maxHp; q.unit.x = ps[0].x + (q === ps[0] ? 0 : 4); q.unit.y = ps[0].y; }
        mob.attackAt = w.time + 1e9;
        w.update(50);
      }
      const v = hits.filter((h) => h.dst === ps[0] && h.src === mob).reduce((s, h) => s + h.v, 0);
      for (const q of ps) w.removePlayer(q.id);
      return v;
    };
    const one = dmgOf(1), four = dmgOf(4);
    check(`${c.id}.${ab.id}: урон делится на всех в круге`, one > 0 && four > 0 && four < one * 0.4, `один ${one}, вчетвером каждому ${four}`);
  }
  for (const ph of c.phases ?? []) {
    mob.reset();
    const p = hero("warrior", mob.x + 60, mob.y, c.levels.boss);
    mob.state = "chase";
    mob.targetId = p.id;
    mob.addThreat(p.id, 100);
    log.length = 0;
    mob.unit.hp = Math.floor(mob.unit.maxHp * ph.at) - 1;
    const idx = c.abilities.map((a, i) => (ph.abilities.includes(a.id) ? i : -1)).filter((i) => i >= 0);
    let used = false;
    for (let t = 0; t < (ph.pauseMs ?? 0) + 12000; t += 50) {
      p.unit.hp = p.unit.maxHp;
      mob.attackAt = w.time + 1e9;
      w.update(50);
      if (log.some((e) => e.f.t === "zb" && idx.some((i) => (e.f as { ab: string }).ab === c.abilities[i].id))) used = true;
    }
    const paused = log.some((e) => e.f.t === "zb" && (e.f as { ab: string }).ab === "phase");
    check(`${c.id}: фаза < ${ph.at * 100}% — пауза перехода и ${ph.abilities.join(", ")} вскоре после неё`, paused && used, `пауза ${paused}, умение ${used}`);
    w.removePlayer(p.id);
    mob.reset();
  }
}

// ---------- 2г. кольцо: цепь подтягивает к боссу ----------
for (const c of CARDS) for (const ab of c.abilities.filter((a) => a.after?.pull)) {
  const mob = mobOf(c.id);
  const boss = mob.boss as unknown as { abilities: { at: number }[]; run: (ab: unknown) => void };
  mob.reset();
  for (const a of boss.abilities) a.at = 1e9;
  const tank = hero("warrior", mob.x + 40, mob.y, c.levels.boss), p = hero("ranger", mob.x + 200, mob.y + 40, c.levels.boss);
  mob.state = "chase";
  mob.targetId = tank.id;
  mob.addThreat(tank.id, 100);
  const d0 = Math.hypot(p.x - mob.x, p.y - mob.y);
  boss.run(ab);
  for (let t = 0; t < ab.windupMs + 300; t += 50) { p.unit.hp = p.unit.maxHp; tank.unit.hp = tank.unit.maxHp; mob.attackAt = w.time + 1e9; w.update(50); }
  const d1 = Math.hypot(p.x - mob.x, p.y - mob.y);
  check(`${c.id}.${ab.id}: дальнего подтянуло к боссу`, d1 < d0 - ab.after!.pull! * 0.6, `было ${d0.toFixed(0)}, стало ${d1.toFixed(0)} px`);
  w.removePlayer(p.id);
  w.removePlayer(tank.id);
  mob.reset();
}

// ---------- 2б. уровень строго по полосе зоны: без подстройки под героя ----------
console.log("2б. уровень");
for (const c of CARDS) {
  const mob = mobOf(c.id);
  mob.reset();
  const p = hero("warrior", mob.x + 60, mob.y, 100);
  mob.state = "chase";
  mob.targetId = p.id;
  mob.addThreat(p.id, 100);
  mob.damageBy.set(p.id, 1);
  for (let t = 0; t < 1000; t += 50) { p.unit.hp = p.unit.maxHp; w.update(50); }
  check(`${c.id}: при герое 100 ур. уровень ${c.levels.boss}`, mob.level === c.levels.boss && mob.unit.level === c.levels.boss, `уровень ${mob.level}`);
  w.removePlayer(p.id);
  mob.reset();
}

// ---------- 3. возрождение ----------
console.log("3. возрождение");
for (const c of CARDS) {
  const mob = mobOf(c.id) as Mob;
  mob.reset();
  w.killMob(mob);
  const at = w.time;
  const gap = mob.respawnAt - at, want = c.respawnMs;
  w.time = at + want - 1000;
  w.update(50);
  const still = mob.dead;
  w.time = at + want;
  w.update(50);
  check(`${c.id}: возрождение через ${want / 60000} мин на своём месте`, gap === want && still && !mob.dead && mob.unit.hp === mob.unit.maxHp && mob.x === mob.home.x && mob.y === mob.home.y, `через ${gap / 60000} мин`);
}

// ---------- 4. добыча ----------
console.log("4. добыча");
{
  // mulberry32: ровный ряд без корреляции соседних чисел
  let seed = 12345;
  const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (const c of CARDS) {
    const t = ZB_LOOT[c.id];
    const N = 4000;
    const got: Record<string, number> = {};
    let twice = 0, wrongLvl = 0, potions = 0, legend = 0, foreign = 0, common = 0, noRare = 0, epics = 0;
    const cls: ClassId = "warrior";
    for (let i = 0; i < N; i++) {
      const { items, legend: lg } = zoneBossItems(t, cls, rand);
      const sp = items.filter((it) => it.unique && t.special.some((s) => s.item === it.unique));
      if (sp.length > 1) twice++;
      for (const it of sp) {
        got[it.unique!] = (got[it.unique!] ?? 0) + 1;
        if (it.ilvl !== UNIQUES[it.unique!].ilvl) wrongLvl++;
        const b = BASE_ITEMS[it.base];
        if (b.classes && !b.classes.includes(cls)) foreign++;
      }
      for (const it of items) if (!it.unique && !it.legendary && BASE_ITEMS[it.base]?.slot !== "consumable" && it.ilvl !== t.level) wrongLvl++;
      for (const it of items) if (BASE_ITEMS[it.base]?.slot !== "consumable" && it.rarity < Rarity.Rare) common++;
      if (items.some((it) => it.base === t.potion.id)) potions++;
      if (lg) legend++;
      const gear = items.filter((it) => BASE_ITEMS[it.base]?.slot !== "consumable" && !it.unique && !it.legendary);
      if (!items.some((it) => BASE_ITEMS[it.base]?.slot !== "consumable" && it.rarity >= Rarity.Rare)) noRare++;
      epics += gear.filter((it) => it.rarity === Rarity.Epic).length / Math.max(1, gear.length);
    }
    // шанс i-й вещи — chance при условии, что прошлые не выпали (одна попытка по порядку)
    let left = 1, okChance = true;
    const rows: string[] = [];
    for (const s of t.special) {
      const b = BASE_ITEMS[UNIQUES[s.item].base];
      if (b.classes && !b.classes.includes(cls)) { rows.push(`${s.item} —`); continue; }
      const want = left * s.chance, have = (got[s.item] ?? 0) / N;
      if (Math.abs(have - want) > 0.02 + want * 0.35) okChance = false;
      rows.push(`${s.item} ${(have * 100).toFixed(1)}%/${(want * 100).toFixed(1)}%`);
      left *= 1 - s.chance;
    }
    check(`${c.id}: особая вещь по таблице`, okChance && !twice && !wrongLvl && !foreign, rows.join(", "));
    check(`${c.id}: обычных (белых) вещей нет`, common === 0, `обычных ${common}`);
    check(`${c.id}: за каждое убийство — хотя бы одна редкая, эпическая по таблице`, noRare === 0 && Math.abs(epics / N - t.loot.epic) < 0.03, `без редкой ${noRare}, эпическая ${(epics / N * 100).toFixed(1)}% (таблица ${t.loot.epic * 100}%)`);
    check(`${c.id}: зелье и легендарка по таблице`, Math.abs(potions / N - t.potion.chance) < 0.04 && (t.legendary === 0 ? legend === 0 : Math.abs(legend / N - t.legendary) < 0.01), `зелье ${(potions / N * 100).toFixed(0)}%, легендарка ${(legend / N * 100).toFixed(2)}%`);
  }
  // убийство: мешок у участника, золото ×mult к золоту моба уровня босса
  const c = CARDS[0], mob = mobOf(c.id);
  mob.reset();
  const p = hero("warrior", mob.x + 60, mob.y, c.levels.boss);
  const g0 = p.save.gold, b0 = p.bags.size;
  mob.damageBy.set(p.id, 1);
  w.killMob(mob, p);
  const [lo, hi] = mob.stats.gold, mult = ZB_LOOT[c.id].gold.mult, dg = p.save.gold - g0;
  check("убийство: мешок с добычей и золото ×10", p.bags.size === b0 + 1 && dg >= Math.round(lo * mult) - 1 && dg <= Math.round(hi * mult) + 1, `золото +${dg} (моб ${lo}–${hi} × ${mult})`);
  check("убийство: в бестиарии и счёте боссов", (p.save.bossKills[c.id] ?? 0) === 1);
  w.removePlayer(p.id);

  // защита фарма: старше босса больше чем на loot.bossLevelGap — ничего; младший в той же группе — как обычно
  const gap = BAL.loot.bossLevelGap;
  // правило: добыча есть, если герой старше босса не больше чем на gap или босс не ниже bossLevelFree (80)
  const deny = (hero: number, lv: number) => bossLootDenied({ level: lv, def: { ...MOBS[c.id], level: lv } }, { level: hero });
  for (const [h, b, want] of [[100, 80, true], [100, 79, false], [60, 50, true], [61, 50, false], [100, 95, true]] as const)
    check(`отсечка: герой ${h}, босс ${b} — ${want ? "добыча есть" : "пусто"}`, deny(h, b) === !want);
  const kill = (id: string, levels: number[]) => {
    const mb = mobOf(id);
    mb.reset();
    const ps = levels.map((lv) => hero("warrior", mb.x + 60, mb.y, lv));
    const before = ps.map((q) => ({ g: q.save.gold, b: q.bags.size }));
    for (const q of ps) mb.damageBy.set(q.id, 1);
    w.killMob(mb, ps[0]);
    const res = ps.map((q, i) => ({ gold: q.save.gold - before[i].g, bags: q.bags.size - before[i].b, items: [...q.bags.values()].flatMap((bg) => bg.items) }));
    for (const q of ps) w.removePlayer(q.id);
    return res;
  };
  for (const id of [c.id]) {
    const lv = MOBS[id].level!;
    const [over] = kill(id, [lv + gap + 1]);
    const [edge] = kill(id, [lv + gap]);
    const [old, young] = kill(id, [lv + gap + 1, lv]);
    check(`${id} (${lv} ур.): герою на ${gap + 1} ур. старше — ни золота, ни вещей`, over.gold === 0 && over.bags === 0, `золото ${over.gold}, мешков ${over.bags}`);
    check(`${id}: герою на ${gap} ур. старше — добыча есть`, edge.gold > 0 && edge.bags === 1, `золото ${edge.gold}, мешков ${edge.bags}`);
    check(`${id}: младший в группе со старшим получает, старший — нет`, young.gold > 0 && young.bags === 1 && old.gold === 0 && old.bags === 0);
    const commons = [edge, young].flatMap((r) => r.items).filter((it) => BASE_ITEMS[it.base]?.slot !== "consumable" && it.rarity < Rarity.Rare);
    check(`${id}: обычных вещей в добыче нет`, commons.length === 0, commons.map((it) => it.name).join(", "));
  }
}

console.log(bad ? `\nПРОВАЛ: ${bad}` : "\nбоссы стартовых земель: ок");
process.exit(bad ? 1 : 0);
