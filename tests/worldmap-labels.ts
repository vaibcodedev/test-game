/** Подписи карты мира (без браузера). Запуск: npx tsx tests/worldmap-labels.ts
 *  Каждая используемая зона (кроме городов и unused) подписана; части зон сторон — зеркальными парами; подписи в пределах карты; «Земли …» зеркальны. */
import { MAP_SEED } from "../shared/constants";
import { ZONES, ZONE_COUNT, generateMap, isTownZone } from "../shared/map";
import { buildZoneLabels } from "../client/src/ui/worldmap-labels";

const m = generateMap(MAP_SEED);
const { zoneLabels, landLabels } = buildZoneLabels(m);
let bad = 0;
const fail = (s: string) => { bad++; console.log("FAIL", s); };
const axis = m.w / 2;
for (let z = 0; z < ZONE_COUNT; z++) {
  const zi = ZONES[z];
  if (!zi || zi.unused || isTownZone(z)) continue;
  const n = zoneLabels.filter((l) => l.zone === z).length;
  const area = m.zone.reduce((a, v) => a + (v === z ? 1 : 0), 0);
  if (area > 4000 && n === 0) fail(`зона «${zi.name}» без подписи`);
  if (n > 1 && !zoneLabels.filter((l) => l.zone === z).some((l) => l.x < axis) !== !zoneLabels.filter((l) => l.zone === z).some((l) => l.x > axis)) fail(`зона «${zi.name}» подписана ${n} раз на одной стороне`);
}
for (const l of zoneLabels) if (l.x < 0 || l.x > m.w || l.y < 0 || l.y > m.h) fail(`«${l.text}» вне карты`);
const pairs = zoneLabels.filter((l) => l.pair !== undefined);
if (pairs.length === 0) fail("нет парных подписей");
for (const l of pairs) {
  const q = zoneLabels[l.pair!];
  if (!q || q.pair !== zoneLabels.indexOf(l)) { fail(`пара «${l.text}» не взаимна`); continue; }
  if ((l.x < axis) === (q.x < axis)) fail(`пара «${l.text}» / «${q.text}» на одной стороне`);
  if (Math.abs(l.x + q.x - (m.w - 1)) > 24 || Math.abs(l.y - q.y) > 24) fail(`пара «${l.text}» (${l.x},${l.y}) / «${q.text}» (${q.x},${q.y}) не зеркальна`);
  if (l.danger !== q.danger || !!l.land !== !!q.land || (l.land && l.land === q.land)) fail(`пара «${l.text}» / «${q.text}»: разные опасность или земли`);
}
const n = (f: string) => zoneLabels.filter((z) => z.land === f).length;
if (n("solgard") !== 4 || n("umbrath") !== 4) fail(`зон земель: Сольгард ${n("solgard")}, Умбрат ${n("umbrath")}`);
const ls = landLabels.find((l) => l.land === "solgard"), lu = landLabels.find((l) => l.land === "umbrath");
if (!ls || !lu) fail("нет подписи «Земли …» у одной из сторон");
else if (Math.abs(ls.x + lu.x - (m.w - 1)) > 24 || ls.y !== lu.y) fail(`подписи «Земли …» не зеркальны: ${ls.x},${ls.y} и ${lu.x},${lu.y}`);
console.log(bad ? `FAILED ${bad}` : `OK worldmap-labels: ${zoneLabels.length} подписей, ${pairs.length / 2} пар`);
process.exit(bad ? 1 : 0);
