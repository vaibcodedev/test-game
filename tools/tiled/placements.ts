/**
 * NPC, патрули и камни телепорта — для слоёв Tiled. Сейчас они живут в коде и data (shared/town.ts, shared/cities.ts,
 * shared/settlements.ts, data/townfolk.json, data/patrols.json, data/world.json → roads); здесь только собираются в один список (пиксели мира).
 * В игру из Tiled пока не возвращаются (docs/systems/world.md: «что пока не применяется»).
 */
import world from "../../data/world.json";
import PATROLS_DATA from "../../data/patrols.json";
import townfolk from "../../data/townfolk.json";
import { CITIES, layoutOf } from "../../shared/cities";
import { MARKET_MERCHANT } from "../../shared/map";
import { SETTLEMENTS } from "../../shared/settlements";
import { CITIZEN_SPOTS, GATE_GUARDS, PATROLS, TOWN } from "../../shared/town";
import { MAP_W } from "../../shared/constants";
import { TS } from "./common";

export interface Npc { id: string; role: string; name: string; sprite: string; place: string; x: number; y: number }
export interface Patrol { id: string; kind: string; place: string; points: { x: number; y: number }[] }
export interface Teleport { id: string; name: string; x: number; y: number; arriveX: number; arriveY: number }
export interface Placements { npcs: Npc[]; patrols: Patrol[]; teleports: Teleport[] }

const cellC = (cx: number, cy: number, d: readonly number[]) => ({ x: (cx + d[0] + 0.5) * TS, y: (cy + d[1] + 0.5) * TS });

export function gatherPlacements(): Placements {
  const npcs: Npc[] = [], patrols: Patrol[] = [], teleports: Teleport[] = [];
  const npc = (place: string, role: string, name: string, sprite: string, p: { x: number; y: number }) =>
    npcs.push({ id: `${place}.${role}.${npcs.filter((n) => n.place === place && n.role === role).length}`, role, name, sprite, place, x: p.x, y: p.y });

  // Эмберхолл: Марфа, стражи у ворот и на постах, места горожан, патрули
  const tf = townfolk as { merchant: { name: string; sprite: string }; guard: { name: string; sprite: string; posts?: number[][]; patrols?: number[][][] } };
  npc("ember", "merchant", tf.merchant.name, tf.merchant.sprite, MARKET_MERCHANT);
  for (const g of [...GATE_GUARDS, ...(tf.guard.posts ?? [])]) npc("ember", "guard", tf.guard.name, tf.guard.sprite, cellC(TOWN.x, TOWN.y, g));
  for (const s of CITIZEN_SPOTS) npc("ember", "citizen_spot", "Место горожан", "", cellC(TOWN.x, TOWN.y, s));
  [...PATROLS, ...(tf.guard.patrols ?? [])].forEach((r, i) =>
    patrols.push({ id: `ember.${i}`, kind: "town", place: "ember", points: r.map(([x, y]) => ({ x: (TOWN.x + x) * TS, y: (TOWN.y + y) * TS })) }));

  // Столицы и форты: торговцы и мастера, места горожан, посты стражи, камни телепорта
  const cityCfg = PATROLS_DATA.cities as Record<string, { posts?: (number | string)[][] }>;
  for (const c of CITIES) {
    teleports.push({ id: c.id, name: c.name, x: c.stone.x, y: c.stone.y, arriveX: c.arrive.x, arriveY: c.arrive.y });
    for (const role of ["merchant", "cook", "quest", "banker", "smith", "bagman"] as const) {
      const n = c[role];
      if (n) npc(c.id, role, n.name, n.sprite, n);
    }
    if (!c.style) continue;
    for (const s of layoutOf(c).spots) npc(c.id, "citizen_spot", "Место горожан", "", cellC(c.x, c.y, s));
    const posts = (c.fort ? cityCfg.fort : cityCfg.capital)?.posts ?? [];
    for (const p of posts) npc(c.id, p[2] === "r" ? "guard_ranged" : "guard", c.guard?.name ?? "Страж", c.guard?.sprite ?? "guard", cellC(c.x, c.y, [Number(p[0]), Number(p[1])]));
  }
  // Поселения
  for (const s of SETTLEMENTS) {
    teleports.push({ id: s.id, name: s.name, x: s.stone.x, y: s.stone.y, arriveX: s.arrive.x, arriveY: s.arrive.y });
    for (const role of ["merchant", "cook", "quest"] as const) { const n = s[role]; if (n) npc(s.id, role, n.name, n.sprite, n); }
    for (const p of s.posts) npc(s.id, "guard", s.guard.name, s.guard.sprite, cellC(s.x, s.y, p));
    for (const p of s.spots) npc(s.id, "citizen_spot", "Место горожан", "", cellC(s.x, s.y, p));
    if (s.patrol.length) patrols.push({ id: `${s.id}.0`, kind: "settlement", place: s.id, points: s.patrol.map(([x, y]) => ({ x: (s.x + x) * TS, y: (s.y + y) * TS })) });
  }
  // Патрули на дорогах земель (data/patrols.json → roads): отрезок ломаной дороги и его зеркало
  const roads = world.roads as unknown as Record<string, number[][]>;
  PATROLS_DATA.roads.forEach((r, i) => {
    for (const name of [r.road, r.mirror]) {
      const line = roads[name] ?? (name === r.mirror ? roads[r.road]?.map(([x, y]) => [MAP_W - x, y]) : undefined);
      if (!line) continue;
      patrols.push({ id: `road.${i}.${name}`, kind: "road", place: name, points: line.slice(r.from, r.to + 1).map(([x, y]) => ({ x: x * TS, y: y * TS })) });
    }
  });
  return { npcs, patrols, teleports };
}
