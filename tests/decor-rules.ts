/**
 * Декор по правилам (data/decor-rules.json, shared/decorRules.ts) на всей карте: 0 нарушений.
 * Поверхность и биом (кусты не на льду, снегу, песке и брусчатке; пальмы не на пепле; снежное — только в снегах), основание не в воде и лаве,
 * кости не в городах и дворах поселений, след непроходимого не висит над водой и не на дороге и площадке входа (двери, лестницы, ворота), огонь только у сгоревшего или на пепле, стоячий декор не заслоняет двери, ворота, NPC и дороги.
 * Запуск: npx tsx tests/decor-rules.ts
 */
import { MAP_SEED } from "../shared/constants";
import { checkDecor, decorGroup, footAnchor, footChecker } from "../shared/decorRules";
import { OBJECT_FOOTPRINT, decorCtxOf, generateMap, roadDist } from "../shared/map";
import { AUDIT_TEXT, auditDecor } from "../tools/decor-audit-lib";

const m = generateMap(MAP_SEED);
let bad = 0;
const fail = (s: string) => { bad++; console.log("FAIL", s); };

const hits = auditDecor(m);
for (const h of hits.slice(0, 30)) fail(`${h.kind} (${h.group}) в ${h.tx},${h.ty} [${h.zone}]: ${AUDIT_TEXT[h.code]}`);
if (hits.length > 30) fail(`…и ещё ${hits.length - 30}`);

// правила работают: на заведомо плохих местах проверка срабатывает
const ctx = decorCtxOf(m);
const find = (pred: (s: string | null) => boolean) => {
  for (let y = 2; y < m.h - 2; y++) for (let x = 2; x < m.w - 2; x++) if (pred(ctx.surf(x, y)) && pred(ctx.surf(x + 1, y))) return { x: x * 32 + 16, y: y * 32 - 2 };
  return null;
};
const ice = find((s) => s === "ice"), grass = find((s) => s === "grass");
if (!ice || checkDecor(ctx, "snow_bush", ice.x, ice.y) !== "surface") fail("куст на льду не ловится");
if (!grass || checkDecor(ctx, "bf-fire-m", grass.x, grass.y, () => false) !== "fire") fail("огонь на траве без сгоревшего не ловится");
if (grass && checkDecor(ctx, "bf-fire-m", grass.x, grass.y, () => true) !== null) fail("огонь у сгоревшего снят зря");
// след непроходимого: бочка перед дверью дома ловится как «площадка входа»
const fc = footChecker(m.objects, (k) => OBJECT_FOOTPRINT[k], ctx.surf, roadDist);
const house = m.objects.find((o) => o.kind === "tavern");
if (!house) fail("нет таверны для проверки площадки входа");
else { const [x0, y0] = footAnchor(house, OBJECT_FOOTPRINT.tavern!); if (fc.at("barrel", x0 + 3, y0 + 1) !== "pad") fail("бочка перед дверью таверны не ловится"); }
if (!decorGroup("v_basic_bush") || decorGroup("sol_wall_v")) fail("группы декора: кусты — декор, стены — нет");

console.log(bad ? `decor-rules: ${bad} ошибок` : `decor-rules: OK (${m.objects.length} объектов, 0 нарушений)`);
process.exit(bad ? 1 : 0);
