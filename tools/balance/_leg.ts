import { LEGENDARIES, LEGEND_TIERS } from "../../shared/legendary";
import { BASE_ITEMS } from "../../shared/items";
const MAIN: Record<string, string> = { warrior: "str", deathknight: "str", reaver: "str", ranger: "agi", rogue: "agi", darkranger: "agi", mage: "int", healer: "int", warlock: "int", bloodweaver: "int" };
const points = (st: Record<string, number>) => Object.entries(st).reduce((a, [k, v]) => a + (k === "hp" ? v / 10 : k === "crit" ? v * 2 : v), 0);
let bad = 0, n = 0;
for (const l of Object.values(LEGENDARIES)) {
  if (l.id.startsWith("zz_")) continue;
  n++;
  const p = points(l.stats as Record<string, number>), want = LEGEND_TIERS.budget[l.ti] * (LEGEND_TIERS.slot[BASE_ITEMS[l.base].slot as string] ?? 1);
  const main = (l.stats as Record<string, number>)[MAIN[l.variant]] ?? 0;
  if (Math.abs(p - want) > want * 0.2 || main < p * 0.25 || (l.stats.crit ?? 0) > LEGEND_TIERS.critMax[l.ti]) { bad++; console.log("BAD", l.id, p, want, main); }
}
console.log("checked", n, "bad", bad);
