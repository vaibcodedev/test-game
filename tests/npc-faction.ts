/** NPC чужой фракции не служат (решение пользователя): торговец, банкир, кузнец, сумочник, повар, задания, камень телепорта. Эмберхолл и бродячий торговец — всем. Офлайн. */
import { assert, check, passedCount } from "./harness";
import { cityById, homeCity } from "../shared/cities";
import { TILE } from "../shared/constants";
import { npcFaction, npcRefusal, serviceRefusal, WORLD_NPCS, type WorldNpcKind } from "../shared/npcs";
import { SETTLEMENTS } from "../shared/settlements";
import { walkable } from "../shared/map";
import { MATERIALS } from "../shared/upgrade";
import { FOOD_IDS } from "../shared/food";
import { World } from "../server/src/game/World";
import { Player, newSave } from "../server/src/game/Player";
import { WorldState } from "../server/src/rooms/schema";
import { buy, buyFood } from "../server/src/game/inventory";
import { buyMaterial } from "../server/src/game/smith";
import { expandBag } from "../server/src/game/bags";
import { BankService } from "../server/src/game/bank";
import { startTeleport } from "../server/src/game/cities";
import { registerEncounters, startEncounter } from "../server/src/game/encounters";

const w = new World(new WorldState(), () => {});
for (const m of [...w.mobs.values()]) w.removeMob(m);
const fakeDb = { raw: { exec() {} }, save() {} } as any;
const bank = new BankService(() => w, () => fakeDb, () => ({ x: 0, y: 0 }), () => false, () => false);
let seq = 0;
function hero(cls: "warrior" | "deathknight", at: { x: number; y: number }) {
  const save = newSave(cls, at);
  save.level = 30;
  save.gold = 100000;
  const toasts: string[] = [];
  const msgs: [string, any][] = [];
  const p = new Player("nf_" + ++seq, "Тест" + seq, save, (t, m: any) => { msgs.push([t, m]); if (t === "toast") toasts.push(m.text); });
  w.addPlayer(p);
  return { p, toasts, msgs, done: () => w.removePlayer(p.id) };
}
const npcs = (place: string, kind: WorldNpcKind) => {
  const c = cityById(place);
  return WORLD_NPCS.filter((n) => n.kind === kind && (c ? Math.abs(n.x / TILE - c.x) <= c.half.x && Math.abs(n.y / TILE - c.y) <= c.half.y : false));
};
/** Сделать одно действие у NPC и вернуть тосты. */
function act(kind: WorldNpcKind, n: { x: number; y: number }, cls: "warrior" | "deathknight") {
  const h = hero(cls, { x: n.x, y: n.y + 20 });
  const gold0 = h.p.save.gold, inv0 = h.p.save.inventory.length;
  if (kind === "shop") buy(w, h.p, "hp_potion", 1);
  else if (kind === "cook") buyFood(w, h.p, FOOD_IDS[0], 1);
  else if (kind === "smith") buyMaterial(w, h.p, Object.keys(MATERIALS)[0], 1);
  else if (kind === "bags") expandBag(w, fakeDb, { x: 0, y: 0 }, h.p, false);
  else if (kind === "bank") { const e = (bank as any).why(h.p); if (e) h.toasts.push(e); }
  const changed = h.p.save.gold !== gold0 || h.p.save.inventory.length !== inv0;
  h.done();
  return { toasts: h.toasts, changed };
}

(async () => {
  const KINDS: WorldNpcKind[] = ["shop", "cook", "smith", "bank", "bags"];
  await check("фракция NPC по месту: Аурелион — Сольгард, Мортхейм — Умбрат, Эмберхолл — никто", () => {
    for (const k of KINDS) {
      const a = npcs("aurelion", k), m = npcs("morthaim", k), e = npcs("ember", k);
      assert(a.length && m.length && e.length, `${k}: нет NPC (аурелион ${a.length}, мортхейм ${m.length}, эмбер ${e.length})`);
      for (const n of a) assert(npcFaction(n.x, n.y) === "solgard", `${n.name}: ${npcFaction(n.x, n.y)}`);
      for (const n of m) assert(npcFaction(n.x, n.y) === "umbrath", `${n.name}: ${npcFaction(n.x, n.y)}`);
      for (const n of e) assert(npcFaction(n.x, n.y) === null, `${n.name}: ${npcFaction(n.x, n.y)}`);
    }
    for (const s of SETTLEMENTS) assert(npcFaction(s.merchant.x, s.merchant.y) === s.faction, `${s.name}: торговец не своей фракции`);
  });
  await check("Умбрат у торговца, повара, кузнеца, банкира, сумочника Аурелиона — отказ с понятным текстом; Сольгард — работает", () => {
    for (const k of KINDS) for (const n of npcs("aurelion", k)) {
      const foe = act(k, n, "deathknight");
      assert(!foe.changed, `${n.name}: враг получил услугу`);
      assert(foe.toasts.some((t) => t.startsWith(n.name) && t.endsWith("врагами Сольгарда") || t === `${n.name} не работает на врагов Сольгарда`), `${n.name}: ${foe.toasts.join(" | ")}`);
      const own = act(k, n, "warrior");
      assert(own.changed || (k === "bank" && own.toasts.length === 0), `${n.name}: свой не обслужен: ${own.toasts.join(" | ")}`);
    }
    const lukian = WORLD_NPCS.find((n) => n.kind === "bank" && npcFaction(n.x, n.y) === "solgard")!;
    assert(npcRefusal(lukian, "umbrath") === `${lukian.name} не торгует с врагами Сольгарда`, npcRefusal(lukian, "umbrath") ?? "null");
  });
  await check("зеркально: Сольгард у NPC Мортхейма — отказ, Умбрат — работает", () => {
    for (const k of KINDS) for (const n of npcs("morthaim", k)) {
      assert(!act(k, n, "warrior").changed, `${n.name}: враг получил услугу`);
      const own = act(k, n, "deathknight");
      assert(own.changed || (k === "bank" && own.toasts.length === 0), `${n.name}: ${own.toasts.join(" | ")}`);
    }
  });
  await check("Эмберхолл: обе фракции обслуживаются", () => {
    for (const k of KINDS) for (const n of npcs("ember", k)) for (const cls of ["warrior", "deathknight"] as const) {
      const r = act(k, n, cls);
      assert(r.changed || (k === "bank" && r.toasts.length === 0), `${n.name} (${cls}): ${r.toasts.join(" | ")}`);
    }
  });
  await check("задания и поселения: чужой заказчик и торговец поселения отказывают", () => {
    for (const n of WORLD_NPCS.filter((x) => x.kind === "quest")) {
      const f = npcFaction(n.x, n.y);
      if (!f) continue;
      assert(npcRefusal(n, f) === null, `${n.name}: своим отказ`);
      assert(npcRefusal(n, f === "solgard" ? "umbrath" : "solgard")?.includes("не даёт заданий врагам"), `${n.name}: чужим без отказа`);
    }
    const s = SETTLEMENTS[0];
    assert(serviceRefusal("shop", s.merchant.x, s.merchant.y, s.faction === "solgard" ? "umbrath" : "solgard", 100), `${s.name}: чужому торгует`);
    assert(serviceRefusal("shop", s.merchant.x, s.merchant.y, s.faction, 100) === null, `${s.name}: своему не торгует`);
  });
  await check("камень телепорта Аурелиона: Умбрату отказ с текстом", () => {
    const a = homeCity("solgard");
    const h = hero("deathknight", { x: a.stone.x, y: a.stone.y + 10 });
    h.p.save.cities = ["morthaim"];
    startTeleport(w, h.p, "morthaim");
    h.done();
    assert(!h.p.tele && h.toasts.some((t) => t.includes("не служит врагам Сольгарда")), h.toasts.join(" | "));
  });
  await check("бродячий торговец торгует с обеими фракциями", () => {
    const handlers: Record<string, (p: Player, m: any) => void> = {};
    registerEncounters(((t: string, fn: any) => { handlers[t] = fn; }) as any, () => w);
    const a = homeCity("solgard");
    for (const cls of ["warrior", "deathknight"] as const) {
      let ok = false;
      for (let i = 0; i < 400 && !ok; i++) {
        const at = { x: (a.x + 40 + (i % 20) * 3) * TILE, y: (a.y - 30 + Math.floor(i / 20) * 3) * TILE };
        if (!walkable(w.map, at.x, at.y, 14)) continue;
        const h = hero(cls, at);
        if (startEncounter(w, h.p, "merchant")) {
          const npc = h.msgs.find(([t]) => t === "enc:npc")![1];
          h.p.unit.x = npc.x; h.p.unit.y = npc.y + 20;
          const gold0 = h.p.save.gold;
          handlers["enc:buy"](h.p, { id: npc.id, idx: 0 });
          assert(h.p.save.gold < gold0, `${cls}: не купил: ${h.toasts.join(" | ")}`);
          ok = true;
        }
        h.done();
      }
      assert(ok, `${cls}: встреча не началась`);
    }
  });
  console.log(`\n${passedCount()} ok`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
