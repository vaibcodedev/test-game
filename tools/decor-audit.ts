/**
 * Аудит декора по всей карте (правила data/decor-rules.json): нарушения → tools/out/decor-audit/.
 * TAG=before — до правок: hits-before.json, места spots.json, монтаж 16 худших мест worst.png (метки — пурпурные точки у нарушителей)
 * и снимки 6 мест shots/before/*.png. TAG=after — после правок: снимки shots/after/*.png, склейка «было | стало» before-after.png
 * и отчёт report.md. Рендер — tools/preview-region.ts (без сервера и браузера). Запуск под замком tools/out/scenario.lock снаружи.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PNG } from "pngjs";
import { MAP_SEED } from "../shared/constants";
import { generateMap } from "../shared/map";
import { AUDIT_TEXT, auditDecor, type Hit } from "./decor-audit-lib";

const OUT = path.resolve("tools/out/decor-audit");
const TAG = process.env.TAG ?? "before";
const WW = 16, WH = 12;
fs.mkdirSync(OUT, { recursive: true });
type Spot = { x: number; y: number; n: number; what: string; marks: string };

const render = (s: Spot, file: string, marks: boolean) => {
  execFileSync(process.execPath, ["--import", "tsx", "tools/preview-region.ts", String(s.x), String(s.y), String(WW), String(WH), "--out", file], { env: { ...process.env, MARKS: marks ? s.marks : "" }, stdio: "ignore" });
};
const read = (f: string) => PNG.sync.read(fs.readFileSync(f));
function montage(files: string[][], out: string) {
  const imgs = files.map((row) => row.map(read));
  const cw = imgs[0][0].width, ch = imgs[0][0].height, G = 4;
  const cols = Math.max(...imgs.map((r) => r.length));
  const png = new PNG({ width: cols * (cw + G) - G, height: imgs.length * (ch + G) - G });
  png.data.fill(30);
  imgs.forEach((row, j) => row.forEach((im, i) => PNG.bitblt(im, png, 0, 0, cw, ch, i * (cw + G), j * (ch + G))));
  fs.writeFileSync(out, PNG.sync.write(png));
}

const m = generateMap(MAP_SEED);
const hits = auditDecor(m);
console.log(TAG, "нарушений:", hits.length);
const describe = (hs: Hit[]) => {
  const c = new Map<string, number>();
  for (const h of hs) c.set(`${h.kind} — ${AUDIT_TEXT[h.code]}`, (c.get(`${h.kind} — ${AUDIT_TEXT[h.code]}`) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ×${n}`).join("; ");
};

if (TAG === "before") {
  fs.writeFileSync(path.join(OUT, "hits-before.json"), JSON.stringify(hits));
  // худшие окна 16×12: вес — нарушения (огонь, кости в городе и кусты на льду — тяжелее), не пересекаются, разнообразие по виду нарушения
  const weight = (h: Hit) => (h.code === "fire" || h.code === "safe" ? 4 : h.group === "snowPlant" ? 3 : h.code === "water" ? 2 : 1);
  const cand: { x: number; y: number; score: number; key: string; hs: Hit[] }[] = [];
  for (let y = 0; y < m.h - WH; y += 4) for (let x = 0; x < m.w - WW; x += 4) {
    const hs = hits.filter((h) => h.tx >= x && h.tx < x + WW && h.ty >= y && h.ty < y + WH);
    if (!hs.length) continue;
    const main = [...hs].sort((a, b) => weight(b) - weight(a))[0];
    cand.push({ x, y, score: hs.reduce((s, h) => s + weight(h), 0), key: `${main.group}:${main.code}`, hs });
  }
  cand.sort((a, b) => b.score - a.score);
  const picked: typeof cand = [], perKey = new Map<string, number>();
  for (const c of cand) {
    if (picked.length >= 16) break;
    if ((perKey.get(c.key) ?? 0) >= 2) continue;
    if (picked.some((p) => Math.abs(p.x - c.x) < WW * 2 && Math.abs(p.y - c.y) < WH * 2)) continue;
    // восток — зеркало запада: не берём зеркальную копию уже взятого места
    if (picked.some((p) => Math.abs(m.w - WW - p.x - c.x) < WW && Math.abs(p.y - c.y) < WH)) continue;
    picked.push(c);
    perKey.set(c.key, (perKey.get(c.key) ?? 0) + 1);
  }
  const spots: Spot[] = picked.map((c) => ({ x: c.x, y: c.y, n: c.hs.length, what: describe(c.hs), marks: c.hs.map((h) => `${h.x},${h.y - 4}`).join(";") }));
  fs.writeFileSync(path.join(OUT, "spots.json"), JSON.stringify(spots, null, 1));
  fs.mkdirSync(path.join(OUT, "worst"), { recursive: true });
  const files = spots.map((s, i) => { const f = path.join(OUT, "worst", `${String(i + 1).padStart(2, "0")}.png`); render(s, f, true); return f; });
  montage([0, 1, 2, 3].map((r) => files.slice(r * 4, r * 4 + 4)).filter((r) => r.length), path.join(OUT, "worst.png"));
}

// «было | стало»: 6 мест из худших — разные виды нарушений
const spots = JSON.parse(fs.readFileSync(path.join(OUT, "spots.json"), "utf8")) as Spot[];
const six = [0, 1, 2, 4, 7, 8].map((i) => spots[i]).filter(Boolean);
fs.mkdirSync(path.join(OUT, "shots", TAG), { recursive: true });
six.forEach((s, i) => render(s, path.join(OUT, "shots", TAG, `${i + 1}.png`), false));

if (TAG === "after") {
  montage(six.map((_, i) => ["before", "after"].map((t) => path.join(OUT, "shots", t, `${i + 1}.png`))), path.join(OUT, "before-after.png"));
  const before = JSON.parse(fs.readFileSync(path.join(OUT, "hits-before.json"), "utf8")) as Hit[];
  const by = (hs: Hit[], key: (h: Hit) => string) => { const c = new Map<string, number>(); for (const h of hs) c.set(key(h), (c.get(key(h)) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1]); };
  const lines: string[] = [];
  lines.push("# Аудит декора: соответствие поверхности, биому и смыслу места", "");
  lines.push(`Карта MAP_SEED, правила — data/decor-rules.json (shared/decorRules.ts), проверка — tools/decor-audit-lib.ts, тест — tests/decor-rules.ts.`, "");
  lines.push(`**Было нарушений: ${before.length}. Стало: ${hits.length}.**`, "");
  lines.push("## По видам нарушения", "", "| Нарушение | Было | Стало |", "|---|---:|---:|");
  for (const [k, n] of by(before, (h) => h.code)) lines.push(`| ${AUDIT_TEXT[k as Hit["code"]]} | ${n} | ${hits.filter((h) => h.code === k).length} |`);
  lines.push("", "## Вид декора × нарушение × зона (было)", "", "| Кол-во | Вид | Группа | Нарушение | Зона | Примеры (тайлы x,y) |", "|---:|---|---|---|---|---|");
  const groups = new Map<string, Hit[]>();
  for (const h of before) { const k = `${h.kind}|${h.group}|${h.code}|${h.zone}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(h); }
  for (const [k, hs] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const [kind, group, code, zone] = k.split("|");
    lines.push(`| ${hs.length} | ${kind} | ${group} | ${AUDIT_TEXT[code as Hit["code"]]} | ${zone} | ${hs.slice(0, 4).map((h) => `${h.tx},${h.ty}`).join("; ")} |`);
  }
  lines.push("", "## Худшие места (worst.png, слева направо, сверху вниз; окно 16×12 тайлов, пурпурные точки — нарушители)", "", "| № | Окно (x,y тайлы) | Нарушений | Что |", "|---:|---|---:|---|");
  spots.forEach((s, i) => lines.push(`| ${i + 1} | ${s.x},${s.y} | ${s.n} | ${s.what} |`));
  lines.push("", "«Было | стало» на местах 1, 2, 3, 5, 8, 9 — before-after.png (слева было, справа стало).", "");
  fs.writeFileSync(path.join(OUT, "report.md"), lines.join("\n"));
}
console.log("готово", OUT);
