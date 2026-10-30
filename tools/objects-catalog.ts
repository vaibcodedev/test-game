/**
 * Каталог всех объектов мира (docs/art/objects.md, data/objects-catalog.json).
 * Запуск: npx tsx tools/objects-catalog.ts  (источники правды: манифест, генерация карт, данные, генераторы tools/gen).
 * buildCatalog() использует tests/unit/objects-catalog.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MAP_SEED } from "../shared/constants";
import { OBJECT_FOOTPRINT, ZONES, generateMap, zoneAtPx } from "../shared/map";
import { generateDungeonMap } from "../shared/dungeon";
import { generateRaidMap } from "../shared/raid";
import { INTERIORS } from "../shared/interiors";
import { CATEGORIES, natureSub, objCategory, objName } from "./objects-names";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const MANIFEST = JSON.parse(rd("client/public/assets/manifest.json")) as { objects: Record<string, { w: number; h: number }> };
const baseOf = (k: string) => k.split("__")[0];

function walk(dir: string, ok: (f: string) => boolean, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (!["node_modules", "out", "dist", "release", "vendor", "refs"].includes(e.name)) walk(rel, ok, out); }
    else if (ok(rel)) out.push(rel);
  }
  return out;
}
const isText = (f: string) => /\.(ts|tsx|json|js|html|tmj|tsj)$/.test(f);

/** Токены файла: слова [A-Za-z0-9_-]; «префиксы» (оканчиваются на _ или - либо перед шаблоном) и «суффиксы» (начинаются с _ или -). */
function tokens(text: string) {
  const exact = new Set<string>(), prefixes = new Set<string>(), suffixes = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z0-9_-]+(\$\{)?/g)) {
    let t = m[0];
    const tpl = !!m[1];
    if (tpl) t = t.slice(0, -2);
    exact.add(t);
    if ((tpl || /[_-]$/.test(t)) && t.length >= 3) prefixes.add(t);
    if (/^[_-]/.test(t) && t.length >= 4) suffixes.add(t);
  }
  return { exact, prefixes, suffixes };
}
interface Refs { exact: Map<string, string[]>; prefix: [string, string][]; suffix: [string, string][] }
function refsOf(files: string[]): Refs {
  const exact = new Map<string, string[]>(), prefix: [string, string][] = [], suffix: [string, string][] = [];
  for (const f of files) {
    const t = tokens(rd(f));
    for (const e of t.exact) { const a = exact.get(e); if (a) { if (!a.includes(f)) a.push(f); } else exact.set(e, [f]); }
    for (const p of t.prefixes) prefix.push([p, f]);
    for (const s of t.suffixes) suffix.push([s, f]);
  }
  return { exact, prefix, suffix };
}
const refHits = (r: Refs, id: string) => {
  const ex = r.exact.get(id) ?? [];
  const dyn = r.prefix.filter(([p]) => id.startsWith(p) && p.length < id.length).concat(r.suffix.filter(([s]) => id.endsWith(s) && s.length < id.length));
  return { ex, dyn, any: ex.length > 0 || dyn.length > 0, files: [...new Set([...ex, ...dyn.map(([, f]) => f)])] };
};

const GEN_RULES: [RegExp, string][] = [
  [/^v_/, "tools/gen/vendor-lib.ts (кадры паков vendor/, pack-pipeline)"],
  [/^bf_|^bf-/, "tools/gen/bf-props.ts"],
  [/^dg_/, "tools/gen/dungeon-objects.ts"],
  [/^pal_|^bf_wall/, "tools/gen/goblin-palisade.ts"],
  [/^cit_/, "tools/gen/citadel.ts"],
  [/^std-|^ember-std/, "tools/gen/standards.ts"],
  [/^ward-/, "tools/gen/wards.ts"],
  [/^arena_/, "tools/gen/arena-gates.ts"],
  [/^loot_/, "tools/gen/loot.ts"],
  [/^teleport/, "tools/gen/teleport-v2.ts"],
];
const QUEUE = /^(pal_|bridge_|umb_house$|umb_crypt$|umb_ziggurat$|v_bridges_|v_fortkit_(stairs|gate_arch|tower_block)$|v_basic_stairs$)/;
const GLOW = /brazier|torch|lamp|lantern|candle|campfire|fire|ember|lava|crystal|obsidian|vent|portal|teleport|glow|forge|cauldron|candelabra|window/;
const ANIM = /fire|smoke|flame|portal|teleport|brazier|campfire|ember_vent|door_w|^dg_port|torch|banner|^std-|^bf-|^ward|lilypad/;

export interface Entry {
  id: string; name: string; category: string; sub?: string;
  where: { zones: Record<string, number>; worldTotal: number; dungeon: number; raid: number; citadel: number; interiors: Record<string, number>; code: string[] };
  variants: string[]; generator: string[]; collision: { w: number; h: number } | null; animated: boolean; glow: boolean;
  quality: string; inManifest: boolean; size: { w: number; h: number } | null;
}
export type Flagged = Entry & { reason: string };
/** Удалено владельцем 2026-10-30: кадры паков, которых нет ни на одной карте и ни в коде (PNG, manifest, vendor.ts, атлас). */
export const REMOVED = { date: "2026-10-30", ids: ["v_basic_sign_arrow", "v_deco_gallows", "v_deco_pillory", "v_fortkit_ladder", "v_fortkit_wall_low_b", "v_smith_bench", "v_smith_coal_pile", "v_smith_forge_small", "v_undead_ruin_arch", "v_undead_ruin_b", "v_volcano_sign_a", "v_volcano_sign_b"] };
export interface Catalog { generated: string; removed: typeof REMOVED; counts: Record<string, number>; objects: Entry[]; unused: Entry[]; soon: Flagged[]; questionable: Flagged[] }

const git = (...a: string[]) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }); } catch { return ""; } };

/** «Нужно скоро»: флаги и системы, планы, свежая работа, наборы. Возвращает карты причин по ссылающимся файлам. */
function soonSources() {
  const flagFiles = ["data/scale147.json", "data/hero-b.json", "data/hero-b-live.json", "data/hero-base-b.json", "data/hero-skeleton-b.json", "data/citadel.json", "client/src/game/citadelV2.ts", "client/src/game/scale147.ts", "client/src/game/heroB.ts"].filter((f) => fs.existsSync(path.join(ROOT, f)));
  const planFiles = ["docs/plan/plan.md", "docs/plan/next.md", "docs/plan/backlog.md"].filter((f) => fs.existsSync(path.join(ROOT, f)));
  const flags = refsOf(flagFiles), plans = refsOf(planFiles);
  const recentPng = new Set<string>();
  const names = (git("log", "--since=7 days ago", "--name-only", "--pretty=format:", "--", "client/public/assets/objects") + "\n" + git("status", "--porcelain", "--", "client/public/assets/objects"))
    .split("\n").map((s) => s.trim()).filter(Boolean);
  for (const n of names) { const m = n.match(/assets\/objects\/([^/]+)\.png/); if (m) recentPng.add(baseOf(m[1])); }
  const genChanged = [...new Set((git("log", "--since=7 days ago", "--name-only", "--pretty=format:", "--", "tools/gen") + "\n" + git("status", "--porcelain", "--", "tools/gen")).split("\n").map((s) => s.trim().replace(/^[A-Z?]+\s+/, "")).filter((s) => s.startsWith("tools/gen/") && s.endsWith(".ts") && fs.existsSync(path.join(ROOT, s))))];
  const recentGen = refsOf(genChanged);
  return { flags, plans, recentPng, recentGen };
}

export function buildCatalog(): Catalog {
  const wm = generateMap(MAP_SEED);
  const dm = generateDungeonMap(), rm = generateRaidMap();
  const cit = JSON.parse(rd("data/citadel.json")) as { tex: string[]; objects: { kind: string }[] };

  interface P { zones: Record<string, number>; dungeon: number; raid: number; interior: number; citadel: number }
  const places = new Map<string, P>();
  const pl = (b: string) => { let p = places.get(b); if (!p) places.set(b, p = { zones: {}, dungeon: 0, raid: 0, interior: 0, citadel: 0 }); return p; };
  const interiorsOf = new Map<string, Record<string, number>>();
  for (const o of wm.objects) { const p = pl(o.kind), z = ZONES[zoneAtPx(wm, o.x, o.y - 1)]?.name ?? "?"; p.zones[z] = (p.zones[z] ?? 0) + 1; }
  for (const o of dm.objects) pl(o.kind).dungeon++;
  for (const o of rm.objects) pl(o.kind).raid++;
  for (const o of cit.objects) pl(o.kind).citadel++;
  for (const t of cit.tex) pl(t);
  for (const r of INTERIORS) for (const pr of r.props) { const m = interiorsOf.get(pr.kind) ?? {}; m[r.name] = (m[r.name] ?? 0) + 1; interiorsOf.set(pr.kind, m); pl(pr.kind).interior++; }

  const codeFiles = [...walk("client/src", isText), ...walk("server/src", isText), ...walk("shared", isText), ...walk("data", isText), ...walk("editor", isText), ...walk("tests", isText)].filter((f) => !/objects-catalog/.test(f));
  const code = refsOf(codeFiles);
  const genFiles = [...walk("tools/gen", (f) => f.endsWith(".ts")), "tools/gen-assets.ts"].filter((f) => !/preview|montage|shots|mock/.test(f));
  const gens = refsOf(genFiles);
  const soon = soonSources();
  const previewFiles = [...walk("tools/gen", (f) => /preview|montage|shots|mock/.test(f) && f.endsWith(".ts")), ...walk("tools", (f) => /^tools\/[^/]+\.ts$/.test(f) && !/objects-/.test(f))];
  const previews = refsOf(previewFiles);

  const mBases = new Map<string, string[]>();
  for (const k of Object.keys(MANIFEST.objects)) { const b = baseOf(k); if (!mBases.has(b)) mBases.set(b, []); mBases.get(b)!.push(k); }
  const setBases = new Set([...mBases].filter(([, ks]) => ks.some((k) => /__set-/.test(k))).map(([b]) => b));
  const ids = new Set<string>([...mBases.keys(), ...places.keys()]);

  const objects: Entry[] = [], unused: Entry[] = [], soonL: Flagged[] = [], quest: Flagged[] = [];
  for (const id of [...ids].sort()) {
    const p = places.get(id);
    const worldTotal = p ? Object.values(p.zones).reduce((a, b) => a + b, 0) : 0;
    const placed = !!p && worldTotal + p.dungeon + p.raid + p.interior + p.citadel > 0;
    const cr = refHits(code, id);
    const gl = refHits(gens, id);
    const gen = gl.ex.length ? gl.ex : gl.dyn.length ? [...new Set(gl.dyn.map(([, f]) => f))] : [];
    const rule = GEN_RULES.find(([re]) => re.test(id));
    const generator = gl.ex.length ? [...new Set(gl.ex)].slice(0, 4) : rule ? [rule[1]] : gen.slice(0, 3);
    const vs = (mBases.get(id) ?? []).filter((k) => k !== id).map((k) => k.slice(id.length + 2)).sort();
    const e: Entry = {
      id, name: objName(id), category: objCategory(id), ...(objCategory(id) === "природа" ? { sub: natureSub(id) } : {}),
      where: { zones: p?.zones ?? {}, worldTotal, dungeon: p?.dungeon ?? 0, raid: p?.raid ?? 0, citadel: p?.citadel ?? 0, interiors: interiorsOf.get(id) ?? {}, code: placed ? [] : cr.files.slice(0, 4) },
      variants: vs, generator, collision: OBJECT_FOOTPRINT[id] ?? null, animated: ANIM.test(id), glow: GLOW.test(id),
      quality: QUEUE.test(id) ? "в очереди на доработку объёма (perspective.md, «Не сделано»)" : "аудита нет (проверка по quality-bar.md при правке)",
      inManifest: mBases.has(id), size: MANIFEST.objects[id] ?? null,
    };
    if (placed || !e.inManifest) { objects.push(e); continue; }
    // в манифесте, на картах не стоит
    if (cr.ex.length) { objects.push(e); continue; }
    if (QUEUE.test(id)) { soonL.push({ ...e, reason: "очередь доработки объёма (docs/art/perspective.md, «Не сделано»)" }); continue; } // ставится кодом (добыча, осада, арена и т. д.)
    const reasons: string[] = [];
    const fl = refHits(soon.flags, id), pn = refHits(soon.plans, id), rg = refHits(soon.recentGen, id);
    if (fl.any) reasons.push(`флаг или система (${fl.files.slice(0, 2).join(", ")})`);
    if (pn.any) reasons.push(`упомянут в планах (${pn.files.join(", ")})`);
    if (soon.recentPng.has(id)) reasons.push("PNG менялся за 7 дней");
    if (rg.ex.length) reasons.push(`генератор менялся за 7 дней (${rg.ex.slice(0, 2).join(", ")})`);
    if (setBases.has(id)) reasons.push("есть варианты набора __set-*");
    if (reasons.length) { soonL.push({ ...e, reason: reasons.join("; ") }); continue; }
    const pv = refHits(previews, id);
    if (pv.ex.length) { quest.push({ ...e, reason: `используется в инструментах показа/эталонов: ${pv.ex.slice(0, 2).join(", ")}` }); continue; }
    if (cr.dyn.length) { quest.push({ ...e, reason: `совпадает с шаблоном: ${cr.dyn.slice(0, 2).map(([pr, f]) => `${pr} в ${f}`).join(", ")}` }); continue; }
    if (!generator.length) { quest.push({ ...e, reason: "генератор не найден (кадр лежит в репозитории готовым)" }); continue; }
    unused.push(e);
  }
  const counts: Record<string, number> = {};
  for (const c of CATEGORIES) counts[c] = objects.filter((x) => x.category === c).length;
  return { generated: "npx tsx tools/objects-catalog.ts", removed: REMOVED, counts, objects, unused, soon: soonL, questionable: quest };
}

import { writeDocs } from "./objects-doc";
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cat = buildCatalog();
  fs.writeFileSync(path.join(ROOT, "data/objects-catalog.json"), JSON.stringify(cat, null, 1) + "\n");
  writeDocs(cat, ROOT);
  console.log("объектов", cat.objects.length, "| не используется", cat.unused.length, "| нужно скоро", cat.soon.length, "| под вопросом", cat.questionable.length);
  console.log(JSON.stringify(cat.counts));
}
