/** Серверная логика умений. Все проверки (ранг, мана, перезарядка, дальность, стены) — здесь. */
import { PLAYER_RADIUS } from "../../../shared/constants";
import { lineClear } from "../../../shared/map";
import { Anim } from "../../../shared/protocol";
import { SKILLS, skillMana } from "../../../shared/skills";
import { behindSpot, GROUND_TOL, placeSkill, reachable as reachOn } from "../../../shared/skillShape";
import { BAL, healPowerMult } from "../../../shared/balance";
import { CLASSES } from "../../../shared/classes";
import { castUmbrath } from "./umbrath";
import { castTank, onCast } from "./tanks";
import { castMage, onCast as mageCast } from "./mages";
import { castHealer, powerMult, pvpHealScale } from "./healers";
import { castArcher, onCast as onCastArcher } from "./archers";
import type { Pet } from "./Pet";
import { applyPoison, castRogue, facing, isBehind, onCast as onRogueCast } from "./rogue";
import { applyHaste, applyRoot, applySlow, applyStun, applyWeaken } from "./effects";
import type { Player } from "./Player";
import { World, type Actor } from "./World";

const angDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
};

/** Дальше всего достижимая точка по прямой (вода, деревья и стены останавливают) — общая с превью: shared/skillShape.ts. */
export function reachable(w: World, x0: number, y0: number, x1: number, y1: number, maxDist: number) {
  return reachOn(w.map, x0, y0, x1, y1, maxDist);
}

/** Угол прицела и вектор рывка с клиента (сообщение «skill», очередь): сервер применяет их от своей позиции героя. */
export interface AimExtra { a?: number; dx?: number; dy?: number }

/** Применение умения; все fx внутри (и в отложенных вызовах) помечаются id умения и кастера. */
export function castSkill(w: World, p: Player, id: string, ax: number, ay: number, targetId: string | null, extra?: AimExtra): string | null {
  const ps = w.fxSkill, pc = w.fxCaster;
  w.fxSkill = id; w.fxCaster = p.id;
  try { return castSkillInner(w, p, id, ax, ay, targetId, extra); } finally { w.fxSkill = ps; w.fxCaster = pc; }
}

function castSkillInner(w: World, p: Player, id: string, ax: number, ay: number, targetId: string | null, extra?: AimExtra): string | null {
  const def = SKILLS[id];
  if (!def || def.kind !== "active" || def.cls !== p.cls) return "Неизвестное умение";
  const rank = p.save.skills[id] || 0;
  if (!rank) return "Умение не изучено";
  if (p.dead) return "Вы мертвы";
  if (p.stunUntil > w.time) return "Вы оглушены";
  if (p.frozenUntil > w.time) return "Бой ещё не начался";
  const ready = p.cds.get(id) || 0;
  if (w.time < ready) return null; // молча: кнопку уже показывают на перезарядке
  if (!def.offGcd && w.time < p.gcdUntil) return null; // общий откат (data/balance.json gcd): молча, как перезарядка
  const mana = skillMana(def, rank, p.level);
  if (p.unit.mp < mana) return "Недостаточно маны";
  const u = p.unit;
  // точка прицела по умолчанию — перед героем
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) { ax = u.x; ay = u.y + 1; }
  const target = targetId ? w.actor(targetId) : undefined;
  const liveTarget = target && !w.isDead(target) && w.hostile(p, target) && !w.stealthed(target) ? target : undefined;
  // куда ляжет (shared/skillShape.ts, те же функции, что у превью): точка ground с допуском, угол и вектор с клиента от своей позиции,
  // видимость (los), луч до стены, рывок до препятствия по рангу; снаряд с самонаведением (home) — по живой цели в дальности + радиус.
  // Отказ — до модулей классов: они берут готовую точку ax, ay и угол aim и не пересчитывают их
  const unit = liveTarget ? { x: liveTarget.x, y: liveTarget.y, r: w.radiusOf(liveTarget) } : undefined;
  const g = placeSkill(w.map, def, rank, p.save.skills, u, { x: ax, y: ay, a: extra?.a, dx: extra?.dx, dy: extra?.dy, unit }, GROUND_TOL);
  if (g.err) return g.err;
  const shaped = g.shape === "circle" || g.shape === "line" || g.shape === "dash";
  if (shaped) { ax = g.x; ay = g.y; }
  const aim = shaped ? g.a : Math.atan2(ay - u.y, ax - u.x);
  const v = def.v(rank);
  const wasStealthed = p.stealthUntil > w.time;
  const isBoss = (a: Actor) => !w.isPlayer(a) && !!a.def.boss;
  const threat = (a: Actor, v: number) => { if (!w.isPlayer(a)) a.addThreat(p.id, v); };
  const range = def.range ?? 0;
  /** Контроль и дебаффы героя — общие помощники effects.ts: нейтральный город, «Несгибаемый», слияние с живым эффектом. */
  const stun = (a: Actor, ms: number) => applyStun(w, p, a, ms);
  const slow = (a: Actor, pct: number, ms: number) => applySlow(w, p, a, pct, ms);
  const root = (a: Actor, ms: number) => applyRoot(w, p, a, ms);
  const weaken = (a: Actor, pct: number, ms: number) => applyWeaken(w, p, a, pct, ms);

  const ok = () => {
    w.breakMount(p);
    if (id !== "stealth" && id !== "dr_shadowmeld") p.stealthUntil = 0;
    u.mp -= mana;
    if (liveTarget && def.target === "enemy" && p.targetId === liveTarget.id) p.engaged = p.approach = true;
    onCast(w, p, id, liveTarget);
    mageCast(w, p, id, liveTarget);
    onCastArcher(w, p, id, liveTarget);
    onRogueCast(w, p, id, wasStealthed);
    const cd = def.cd!(rank) * 1000;
    p.cds.set(id, w.time + cd);
    if (!def.offGcd) { p.gcdUntil = w.time + BAL.gcd * 1000; p.send("cd", { id: "gcd", ms: BAL.gcd * 1000 }); }
    p.send("cd", { id, ms: cd });
    u.aseq = (u.aseq + 1) % 65535;
    u.dir = World.dirTo(ax - u.x, ay - u.y);
    // автоатака не сразу после умения
    p.attackAt = Math.max(p.attackAt, w.time + 250);
    return null;
  };

  // танки: новые умения (server/src/game/tanks.ts); классы Умбрата: своя механика (server/src/game/umbrath.ts)
  const ctx = { w, p, id, def, rank, v, liveTarget, targetId, ax, ay, aim, ok, stun, slow, root, weaken, threat, isBoss };
  if (def.cls === "warrior" || def.cls === "deathknight") {
    const r = castTank(ctx);
    if (r !== undefined) return r;
  }
  // лекари: новые умения Клирика и Кровотворца (server/src/game/healers.ts)
  if (def.cls === "healer" || def.cls === "bloodweaver") {
    const r = castHealer(ctx);
    if (r !== undefined) return r;
  }
  // разбойники: новые умения Ассасина (rogue.ts) и Потрошителя (reaver.ts)
  if (def.cls === "rogue" || def.cls === "reaver") {
    const r = castRogue(ctx);
    if (r !== undefined) return r;
  }
  // лучники: новые умения Егеря и Тёмного следопыта (server/src/game/archers.ts)
  if (def.cls === "ranger" || def.cls === "darkranger") {
    const r = castArcher(ctx);
    if (r !== undefined) return r;
  }
  // маги: новые умения Боевого мага и Чернокнижника (server/src/game/mages.ts)
  if (def.cls === "mage" || def.cls === "warlock") {
    const r = castMage(ctx);
    if (r !== undefined) return r;
  }
  if (CLASSES[def.cls].faction === "umbrath") return castUmbrath(ctx);

  switch (id) {
    // ---------- воин ----------
    case "taunt": {
      if (!liveTarget) return "Нужна цель";
      if (w.dist(u, liveTarget) > range + w.radiusOf(liveTarget)) return "Цель слишком далеко";
      ok();
      w.emit({ t: "aoe", k: "taunt", x: u.x, y: u.y, r: v.radius || 70 });
      const hitTargets = new Set<Actor>([liveTarget]);
      if (v.radius > 0) for (const m of w.enemiesInCircle(p, liveTarget.x, liveTarget.y, v.radius)) hitTargets.add(m);
      for (const t of hitTargets) {
        if (w.isPlayer(t)) {
          weaken(t, 20, v.weakDur * 1000); // −20% урона (прежнее значение героя по умолчанию)
          continue;
        }
        let top = 0;
        for (const th of t.threat.values()) top = Math.max(top, th);
        t.threat.set(p.id, Math.max(t.threat.get(p.id) || 0, top) + v.extra);
        if (!isBoss(t)) { t.tauntUntil = w.time + v.dur * 1000; t.tauntBy = p.id; t.targetId = p.id; if (t.state === "idle") t.state = "chase"; }
        w.emit({ t: "buff", id: t.id, k: "taunted", ms: v.dur * 1000 });
      }
      return null;
    }
    case "shieldblock": {
      ok();
      p.blockUntil = w.time + v.dur * 1000;
      p.blockPct = v.block;
      p.blockReflect = v.reflect;
      w.emit({ t: "buff", id: p.id, k: "block", ms: v.dur * 1000 });
      return null;
    }
    case "charge": {
      if (!liveTarget) return "Нужна цель";
      const d = w.dist(u, liveTarget);
      if (d > range + w.radiusOf(liveTarget)) return "Цель слишком далеко";
      if (!lineClear(w.map, u.x, u.y, liveTarget.x, liveTarget.y)) return "Путь прегражден";
      const stop = w.radiusOf(liveTarget) + PLAYER_RADIUS + 4;
      const dest = reachable(w, u.x, u.y, liveTarget.x, liveTarget.y, Math.max(0, d - stop));
      ok();
      w.emit({ t: "blink", id: p.id, x0: u.x, y0: u.y, x1: dest.x, y1: dest.y, k: "charge" });
      u.x = dest.x;
      u.y = dest.y;
      p.moveTo = null;
      p.targetId = liveTarget.id;
      p.engaged = p.approach = true;
      u.dir = World.dirTo(liveTarget.x - u.x, liveTarget.y - u.y);
      w.hit(p, liveTarget, { mult: v.dmg / 100, skill: true, threat: 1 });
      threat(liveTarget, v.threat);
      if (!isBoss(liveTarget)) stun(liveTarget, v.stun * 1000);
      else slow(liveTarget, 40, v.stun * 1000);
      return null;
    }
    case "quake": {
      ok();
      u.aseq = (u.aseq + 1) % 65535;
      w.emit({ t: "aoe", k: "quake", x: u.x, y: u.y, r: v.radius });
      for (const m of w.enemiesInCircle(p, u.x, u.y, v.radius)) {
        w.hit(p, m, { mult: v.dmg / 100, skill: true, threat: 1 });
        threat(m, v.threat);
        slow(m, v.slow, v.dur * 1000);
      }
      return null;
    }

    // ---------- маг ----------
    case "fireball": {
      let tx: number, ty: number, aimTarget: Actor | undefined;
      if (liveTarget && w.dist(u, liveTarget) <= range + w.radiusOf(liveTarget)) { aimTarget = liveTarget; tx = liveTarget.x; ty = liveTarget.y; }
      else { tx = ax; ty = ay; } // по углу прицела на длину вектора с клиента, не дальше дальности (placeSkill, форма line)
      // прямую видимость до цели (самонаведение, home) или до точки уже проверил placeSkill — та же точка
      ok();
      const ms = (Math.hypot(tx - u.x, ty - u.y) / 420) * 1000;
      w.emit({ t: "proj", k: "fireball", from: p.id, to: aimTarget?.id, tx, ty, ms });
      w.later(ms, () => {
        const alive = aimTarget && !w.isDead(aimTarget);
        const ix = alive ? aimTarget!.x : tx, iy = alive ? aimTarget!.y : ty;
        w.emit({ t: "aoe", k: "fire", x: ix, y: iy, r: v.splash });
        const main = alive ? aimTarget : w.enemiesInCircle(p, ix, iy, 20)[0];
        if (main) w.hit(p, main, { mult: v.dmg / 100, skill: true, kind: "fire" });
        for (const m of w.enemiesInCircle(p, ix, iy, v.splash)) if (m !== main) w.hit(p, m, { mult: v.dmg / 200, skill: true, kind: "fire" });
      }, p);
      return null;
    }
    case "frostnova": {
      ok();
      w.emit({ t: "aoe", k: "frost", x: u.x, y: u.y, r: v.radius });
      for (const m of w.enemiesInCircle(p, u.x, u.y, v.radius)) {
        w.hit(p, m, { mult: v.dmg / 100, skill: true, kind: "frost" });
        slow(m, v.slow, v.dur * 1000);
      }
      return null;
    }
    case "blink": {
      // конец — reachable на длину по рангу (placeSkill, форма dash); сдвиг меньше DASH_MIN — отказ «Туда не переместиться» там же
      const dest = { x: ax, y: ay };
      ok();
      w.emit({ t: "blink", id: p.id, x0: u.x, y0: u.y, x1: dest.x, y1: dest.y });
      u.x = dest.x;
      u.y = dest.y;
      p.moveTo = null;
      p.rootUntil = 0;
      p.slowUntil = 0;
      return null;
    }
    case "meteor": {
      // точка с допуском и прямой видимостью (решение пользователя 3) — placeSkill
      const tx = ax, ty = ay;
      ok();
      u.anim = Anim.Cast;
      w.emit({ t: "tele", shape: "circle", k: "frost", x: tx, y: ty, r: v.radius, ms: v.delay * 1000 });
      w.later(v.delay * 1000, () => {
        w.emit({ t: "aoe", k: "fire", x: tx, y: ty, r: v.radius });
        for (const m of w.enemiesInCircle(p, tx, ty, v.radius)) w.hit(p, m, { mult: v.dmg / 100, skill: true, kind: "fire" });
      }, p);
      return null;
    }

    // ---------- лучник ----------
    case "aimed": {
      if (!liveTarget) return "Нужна цель";
      if (w.dist(u, liveTarget) > range + w.radiusOf(liveTarget)) return "Цель слишком далеко";
      if (!lineClear(w.map, u.x, u.y, liveTarget.x, liveTarget.y)) return "Нет прямой видимости";
      ok();
      const ms = (w.dist(u, liveTarget) / 900) * 1000;
      w.emit({ t: "proj", k: "arrow", from: p.id, to: liveTarget.id, tx: liveTarget.x, ty: liveTarget.y, ms });
      w.later(ms, () => { if (!w.isDead(liveTarget) && w.hostile(p, liveTarget)) w.hit(p, liveTarget, { mult: v.dmg / 100, skill: true }); }, p);
      return null;
    }
    case "volley": {
      ok();
      const n = v.arrows, spread = (v.arc * Math.PI) / 180;
      const used = new Set<Actor>();
      for (let i = 0; i < n; i++) {
        const a = aim - spread / 2 + (spread * i) / (n - 1);
        // первая цель вблизи луча
        let best: Actor | undefined, bd = range;
        for (const m of w.enemiesInCircle(p, u.x, u.y, range)) {
          const d = w.dist(u, m);
          const off = Math.abs(Math.sin(Math.atan2(m.y - u.y, m.x - u.x) - a)) * d;
          const ahead = Math.cos(Math.atan2(m.y - u.y, m.x - u.x) - a) > 0;
          if (ahead && off < w.radiusOf(m) + 10 && d < bd && lineClear(w.map, u.x, u.y, m.x, m.y)) { bd = d; best = m; }
        }
        const tx = best ? best.x : u.x + Math.cos(a) * range, ty = best ? best.y : u.y + Math.sin(a) * range;
        const ms = (Math.hypot(tx - u.x, ty - u.y) / 750) * 1000;
        w.emit({ t: "proj", k: "arrow", from: p.id, to: best?.id, tx, ty, ms });
        if (best) {
          const m = best;
          const repeat = used.has(m);
          used.add(m);
          w.later(ms, () => { if (!w.isDead(m) && w.hostile(p, m)) w.hit(p, m, { mult: (v.dmg / 100) * (repeat ? 0.6 : 1), skill: true }); }, p);
        }
      }
      return null;
    }
    case "roll": {
      // конец — reachable на длину рывка (placeSkill, форма dash); сдвиг меньше DASH_MIN — отказ «Некуда отскочить» там же
      const dest = { x: ax, y: ay };
      ok();
      w.emit({ t: "blink", id: p.id, x0: u.x, y0: u.y, x1: dest.x, y1: dest.y });
      u.x = dest.x;
      u.y = dest.y;
      p.moveTo = null;
      p.rootUntil = 0;
      applyHaste(w, p, v.haste, v.dur * 1000);
      w.emit({ t: "buff", id: p.id, k: "haste", ms: v.dur * 1000 });
      return null;
    }
    case "rain": {
      // точка с допуском и прямой видимостью (решение пользователя 3) — placeSkill
      const tx = ax, ty = ay;
      ok();
      for (let i = 0; i < v.ticks; i++)
        w.later(250 + i * 500, () => {
          w.emit({ t: "aoe", k: "phys", x: tx, y: ty, r: v.radius });
          for (let k = 0; k < 4; k++) {
            const rx = tx + (Math.random() - 0.5) * v.radius * 1.4, ry = ty + (Math.random() - 0.5) * v.radius;
            w.emit({ t: "proj", k: "arrow", from: p.id, tx: rx, ty: ry, ms: 250 });
          }
          for (const m of w.enemiesInCircle(p, tx, ty, v.radius)) {
            w.hit(p, m, { mult: v.dmg / 100, skill: true });
            slow(m, v.slow, 800);
          }
        }, p);
      return null;
    }

    // ---------- разбойник ----------
    case "backstab": {
      if (!liveTarget) return "Нужна цель";
      if (w.dist(u, liveTarget) > range + w.radiusOf(liveTarget)) return "Цель слишком далеко";
      if (!lineClear(w.map, u.x, u.y, liveTarget.x, liveTarget.y)) return "Нет прямой видимости";
      const crit2 = wasStealthed || isBehind(p, liveTarget);
      ok();
      u.dir = World.dirTo(liveTarget.x - u.x, liveTarget.y - u.y);
      w.emit({ t: "aoe", k: "slash", x: liveTarget.x, y: liveTarget.y, r: crit2 ? 44 : 30 });
      w.hit(p, liveTarget, { mult: (v.dmg / 100) * (crit2 ? v.behind : 1), skill: true, threat: 1 });
      return null;
    }
    case "venom": {
      if (!liveTarget) return "Нужна цель";
      if (w.dist(u, liveTarget) > range + w.radiusOf(liveTarget)) return "Цель слишком далеко";
      if (!lineClear(w.map, u.x, u.y, liveTarget.x, liveTarget.y)) return "Нет прямой видимости";
      ok();
      u.dir = World.dirTo(liveTarget.x - u.x, liveTarget.y - u.y);
      applyPoison(w, p, liveTarget, rank);
      threat(liveTarget, 40);
      return null;
    }
    case "shadowstep": {
      if (!liveTarget) return "Нужна цель";
      if (w.dist(u, liveTarget) > range + w.radiusOf(liveTarget)) return "Цель слишком далеко";
      if (!lineClear(w.map, u.x, u.y, liveTarget.x, liveTarget.y)) return "Нет прямой видимости";
      const [fx, fy] = facing(liveTarget);
      // место за спиной — общая функция с превью (shared/skillShape.ts)
      const dest = behindSpot(w.map, liveTarget.x, liveTarget.y, fx, fy, w.radiusOf(liveTarget));
      if (!dest) return "Нет места за спиной цели";
      ok();
      w.emit({ t: "blink", id: p.id, x0: u.x, y0: u.y, x1: dest.x, y1: dest.y, k: "shadow" });
      u.x = dest.x;
      u.y = dest.y;
      p.moveTo = null;
      p.targetId = liveTarget.id;
      p.engaged = p.approach = true;
      u.target = liveTarget.id;
      u.dir = World.dirTo(liveTarget.x - u.x, liveTarget.y - u.y);
      p.critNextUntil = w.time + 8000;
      p.attackAt = Math.min(p.attackAt, w.time + 250);
      return null;
    }
    case "stealth": {
      if (w.inTown(u.x, u.y)) return "В городе скрытность недоступна";
      ok();
      p.stealthUntil = w.time + v.dur * 1000;
      p.targetId = null;
      u.target = "";
      p.moveTo = null;
      w.emit({ t: "aoe", k: "shadow", x: u.x, y: u.y, r: 46 });
      return null;
    }

    // ---------- лекарь ----------
    case "heal": {
      const a = resolveAlly(w, p, targetId);
      if (a.player?.dead) {
        const rr = p.save.skills.resurrect || 0;
        if (!rr) return "Цель мертва (нужен талант «Воскрешение»)";
        if (p.team !== 0 || w.pvpActive) return "На арене воскрешение недоступно";
        if (w.dist(u, a) > range + PLAYER_RADIUS) return "Цель слишком далеко";
        const why = w.reviveCheck?.(p, a.player); // рейд: заряды воскрешения
        if (why) return why;
        const tp = a.player, rv = SKILLS.resurrect.v(rr);
        ok();
        p.castUntil = w.time + rv.cast * 1000;
        w.castBar(p, rv.cast * 1000, "Воскрешение");
        p.moveTo = null;
        u.anim = Anim.Cast;
        w.emit({ t: "buff", id: p.id, k: "heal", ms: rv.cast * 1000 });
        w.later(rv.cast * 1000, () => {
          w.castBar(p, 0);
          if (u.anim === Anim.Cast && !p.dead) u.anim = Anim.Idle;
          if (!tp.dead || w.players.get(tp.id) !== tp) return;
          if (p.dead || p.stunUntil > w.time || w.dist(u, tp) > range + PLAYER_RADIUS + 40 || w.reviveCheck?.(p, tp)) return void p.send("toast", { text: "Воскрешение прервано", kind: "error" });
          w.onRevived?.(p, tp);
          tp.dead = false;
          tp.unit.hp = Math.max(1, Math.round(tp.unit.maxHp * rv.hp / 100));
          tp.unit.anim = Anim.Idle;
          tp.stunUntil = tp.rootUntil = tp.slowUntil = 0;
          tp.selfDirty = true;
          tp.send("toast", { text: `${p.name} воскрешает вас`, kind: "info" });
          w.emit({ t: "buff", id: tp.id, k: "heal", ms: 900 });
          w.emit({ t: "aoe", k: "heal", x: tp.x, y: tp.y, r: 60 });
        });
        return null;
      }
      if (a.id !== p.id && w.dist(u, a) > range + PLAYER_RADIUS) return "Цель слишком далеко";
      ok();
      w.emit({ t: "buff", id: a.id, k: "heal", ms: 700 });
      smite(w, p, applyHeal(w, p, a, healPower(p) * v.heal / 100));
      return null;
    }
    case "circle": {
      // точка с допуском и прямой видимостью (решение пользователя 3) — placeSkill
      const cx = ax, cy = ay;
      ok();
      w.emit({ t: "aoe", k: "heal", x: cx, y: cy, r: v.radius });
      const amt = healPower(p) * v.heal / 100;
      let got = 0;
      for (const q of w.playersInCircle(cx, cy, v.radius)) if (q === p || !w.hostile(p, q)) got += w.heal(q, amt, true, p);
      for (const pet of w.pets.values()) {
        if (pet.dead || w.dist(pet.unit, { x: cx, y: cy }) > v.radius + 12 || w.hostile(p, pet.owner)) continue;
        got += applyHeal(w, p, { id: pet.id, x: pet.unit.x, y: pet.unit.y, pet }, amt);
      }
      smite(w, p, got);
      return null;
    }
    case "renew": {
      const a = resolveAlly(w, p, targetId);
      if (a.player?.dead) return "Цель мертва";
      if (a.id !== p.id && w.dist(u, a) > range + PLAYER_RADIUS) return "Цель слишком далеко";
      ok();
      const token = (hotToken.get(a.id) || 0) + 1;
      hotToken.set(a.id, token);
      const amt = healPower(p) * v.tick / 100;
      // значок эффекта в рамке героя (auras.ts): сами тики ниже; новое «Обновление» заменяет прежнее (token)
      if (a.player) { a.player.renewUntil = w.time + v.dur * 1000; a.player.renewAmt = Math.round(amt); a.player.renewBy = p; }
      w.emit({ t: "buff", id: a.id, k: "renew", ms: v.dur * 1000 });
      for (let i = 1; i <= v.ticks; i++)
        w.later(i * 1000, () => {
          if (hotToken.get(a.id) !== token || p.dead) return;
          const pl = w.players.get(a.id), pet = w.pets.get(a.id);
          if (pl && !pl.dead) applyHeal(w, p, { id: pl.id, x: pl.x, y: pl.y, player: pl }, amt);
          else if (pet && !pet.dead) applyHeal(w, p, { id: pet.id, x: pet.unit.x, y: pet.unit.y, pet }, amt);
        }, p);
      return null;
    }
    case "holyshield": {
      const a = resolveAlly(w, p, targetId);
      if (!a.player) return "Щит можно наложить только на героя";
      if (a.player.dead) return "Цель мертва";
      if (a.id !== p.id && w.dist(u, a) > range + PLAYER_RADIUS) return "Цель слишком далеко";
      ok();
      const tp = a.player;
      tp.shieldAmt = healPower(p) * v.absorb / 100 * pvpHealScale(w, tp); // в PvP — как лечение (раньше «Святой щит» шёл мимо)
      tp.shieldUntil = w.time + v.dur * 1000;
      tp.shieldBy = p;
      w.emit({ t: "buff", id: tp.id, k: "shield", ms: v.dur * 1000 });
      return null;
    }
  }
  return "Умение недоступно";
}

// ---------- помощники лекаря ----------
export interface Ally { id: string; x: number; y: number; player?: Player; pet?: Pet }
const hotToken = new Map<string, number>();

/** Союзная цель по id (игрок или питомец, не враг); иначе сам лекарь. */
export function resolveAlly(w: World, p: Player, targetId: string | null): Ally {
  const self: Ally = { id: p.id, x: p.x, y: p.y, player: p };
  if (!targetId) return self;
  const tp = w.players.get(targetId);
  if (tp) return tp === p || !w.hostile(p, tp) ? { id: tp.id, x: tp.x, y: tp.y, player: tp } : self;
  const pet = w.pets.get(targetId);
  if (pet && !pet.dead && !w.hostile(p, pet.owner)) return { id: pet.id, x: pet.unit.x, y: pet.unit.y, pet };
  return self;
}

/** Сила лечения: средний урон оружия × сила умений × «Благодать» × кривая по уровню (data/balance.json heal.power). */
export function healPower(p: Player): number {
  const d = p.derived;
  return ((d.dmgMin + d.dmgMax) / 2) * d.skillMult * (1 + 0.06 * (p.save.skills.grace || 0)) * powerMult(p) * healPowerMult(p.level);
}

export function applyHeal(w: World, p: Player, a: Ally, amount: number): number {
  if (a.player) return w.heal(a.player, Math.round(amount), true, p);
  if (a.pet && !a.pet.dead) {
    const u = a.pet.unit, before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + Math.round(amount));
    if (u.hp > before) w.emit({ t: "dmg", id: a.pet.id, v: u.hp - before, heal: true });
    return u.hp - before;
  }
  return 0;
}

/** «Кара»: часть вылеченного обрушивается святым светом на ближайшего врага. */
function smite(w: World, p: Player, healed: number) {
  const r = p.save.skills.smite || 0;
  if (!r || healed <= 0) return;
  let best: Actor | undefined, bd = 260;
  for (const m of w.enemiesInCircle(p, p.x, p.y, 260)) {
    const d = w.dist(p, m);
    if (d < bd && lineClear(w.map, p.x, p.y, m.x, m.y)) { bd = d; best = m; }
  }
  if (!best) return;
  const m = best, dmg = Math.max(1, Math.round((healed * SKILLS.smite.v(r).pct) / 100));
  const ms = (bd / 450) * 1000;
  w.emit({ t: "proj", k: "holy", from: p.id, to: m.id, tx: m.x, ty: m.y, ms });
  w.later(ms, () => { if (!w.isDead(m) && w.hostile(p, m)) w.hit(p, m, { flat: dmg, canCrit: false, kind: "holy", skill: true }); }, p);
}
