/**
 * Листы слоёв снаряжения на основе «Б»: npx tsx tools/gen/gear147/sheets.ts [set=chaos-knight] [look 0..3]
 * → tools/out/gear147/sheets/<set>/<slot>@<корзина>.png + layers.json (z каждого листа по кадрам).
 * Лист: строки — (анимация × вид вниз/вверх/вбок; влево — зеркало «вбок»), столбцы — кадры, кадр 48×48, ступни (24, 45).
 * В игре: листы основы и надетых вещей рисуются по возрастанию z кадра. Герб (crest) — два варианта листа (sol/umb), подменяется.
 * Проверка: сведение всех листов по z сравнивается с цельным кадром (расхождение пишется в layers.json).
 */
import fs from "node:fs";
import path from "node:path";
import { PC } from "../canvas";
import { ANIMS, FR, NF, flipCv, renderLayers, type AnimId, type Look, type Part } from "../hero147/base_b";
import { GD, SLOTS, baseView, dress, renderView, setOf, viewLook, type CrestId, type View4 } from "./gear";

const setId = process.argv[2] ?? "chaos-knight", set = setOf(setId);
const looks: Look[] = [{ fac: "sol", sex: "m", hair: "tousled" }, { fac: "sol", sex: "f", hair: "braid" }, { fac: "umb", sex: "m", hair: "mane" }, { fac: "umb", sex: "f", hair: "loose" }];
const base = looks[+(process.argv[3] ?? 0)];
const OUT = path.resolve("tools/out/gear147/sheets", setId);
fs.mkdirSync(OUT, { recursive: true });
const BINS: number[] = GD.layers.bins;
const binOf = (L: number) => { for (let k = 0; k + 1 < BINS.length; k++) if (L < BINS[k + 1]) return k; return BINS.length - 2; };
const two = set.items.weapon?.kind === "great";
const anims: AnimId[] = ANIMS.filter((a) => !two || !["atk1h", "block", "bow", "cast"].includes(a));
const views: View4[] = ["down", "up", "side", "left"];
const layerSlots = ["body", "hair", ...SLOTS, "crest"];
const keys: string[] = []; for (const s of layerSlots) for (let b = 0; b + 1 < BINS.length; b++) keys.push(`${s}@${b}`);

const rows: [AnimId, View4][] = []; for (const a of anims) for (const v of views) rows.push([a, v]);
const sheets = new Map<string, PC>(), zs = new Map<string, (number | null)[][]>();
let diff = 0, tot = 0, holes = 0;
const cmp = new PC(FR * 2 * 6, FR * 3); let cmpN = 0;
rows.forEach(([a, v], r) => {
  for (let i = 0; i < NF(a); i++) {
    for (const crest of ["sol", "umb"] as CrestId[]) {
      const look = dress(base, set, crest);
      const minL = new Map<string, number>();
      const filt = keys.map((k) => (p: Part) => { const key = `${p.slot}@${binOf(p.layer)}`; if (key !== k) return false; minL.set(k, Math.min(minL.get(k) ?? 99, p.layer)); return true; });
      const frames0 = renderLayers(viewLook(look, v), baseView(v), a, i, filt), frames = v === "left" ? frames0.map((f) => ({ ...f, img: flipCv(f.img) })) : frames0;
      const comp = new PC(FR, FR), order: { k: string; z: number }[] = [];
      keys.forEach((k, j) => {
        if (!minL.has(k)) return;
        const f = frames[j].img, slot = k.split("@")[0];
        if (slot === "crest" && crest === "umb") { const kk = k + "#umb"; let s = sheets.get(kk); if (!s) { s = new PC(12 * FR, rows.length * FR); sheets.set(kk, s); } blitCv(s, f, i * FR, r * FR); }
        else if (crest === "sol") {
          let s = sheets.get(k); if (!s) { s = new PC(12 * FR, rows.length * FR); sheets.set(k, s); zs.set(k, rows.map(([aa]) => Array(NF(aa)).fill(null))); }
          blitCv(s, f, i * FR, r * FR); zs.get(k)![r][i] = Math.round(minL.get(k)! * 1e4) / 1e4;
        }
        order.push({ k, z: minL.get(k)! });
      });
      if (crest !== "sol") continue;
      order.sort((x, y) => x.z - y.z);
      for (const o of order) blitCv(comp, frames[keys.indexOf(o.k)].img, 0, 0);
      const full = renderView(look, v, a, i).img;
      for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
        const h = full.has(x, y), c = comp.get(x, y); if (!h && !(c && c[3])) continue;
        tot++; const q = full.get(x, y); if (h && (!c || !c[3])) holes++; if (!h || !c || !c[3] || Math.abs(q[0] - c[0]) + Math.abs(q[1] - c[1]) + Math.abs(q[2] - c[2]) > 24) diff++;
      }
      if ((a === "idle" || a === "atk2h" || a === "walk") && i === (a === "atk2h" ? 8 : 0) && cmpN < 18) { const cx = (cmpN % 6) * FR * 2, cy = Math.floor(cmpN / 6) * FR; blitCv(cmp, full, cx, cy); blitCv(cmp, { w: FR, h: FR, has: (x, y) => comp.alpha(x, y) > 0, get: (x, y) => comp.get(x, y)! as unknown as number[] }, cx + FR, cy); cmpN++; }
    }
  }
  process.stdout.write(".");
});
function blitCv(d: PC, s: { w: number; h: number; has: (x: number, y: number) => boolean; get: (x: number, y: number) => number[] }, ox: number, oy: number) {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.has(x, y)) { const q = s.get(x, y); d.set(ox + x, oy + y, [q[0], q[1], q[2], 255]); }
}
const meta: any = {
  _doc: "Листы слоёв сета на основе «Б». Кадр 48×48, ступни (24,45). Строки rows — [анимация, вид]: down, up, side (лицом вправо: правая рука ближняя, меч перед телом), left (лицом влево: правая рука дальняя, меч за телом) — «влево» не зеркало: порядок слоёв и свет (сверху-слева) свои; герой-правша. Каждый лист — (слот @ корзина слоя из data/gear147.json → layers.bins). z[строка][кадр] — слой листа в кадре (null — пусто); рисовать по возрастанию z. crest — подменяемый герб (crest-sol / crest-umb, z как у crest@*). body — основа в позе этого оружия.",
  set: setId, frame: FR, origin: [24, 45], rows, sheets: {} as Record<string, any>,
  check: { pixels: tot, mismatch: diff, holes, pct: +((100 * diff) / Math.max(1, tot)).toFixed(2) },
};
for (const [k, s] of sheets) {
  const f = k.replace("#umb", "-umb") + (k.startsWith("crest") && !k.endsWith("#umb") ? "-sol" : "") + ".png";
  s.save(path.join(OUT, f));
  if (k.endsWith("#umb")) meta.sheets[k.replace("#umb", "")].variants = { sol: meta.sheets[k.replace("#umb", "")].file, umb: f };
  else meta.sheets[k] = { file: f, z: zs.get(k) };
}
fs.writeFileSync(path.join(OUT, "layers.json"), JSON.stringify(meta));
cmp.save(path.resolve("tools/out/gear147/sheets-check.png"));
console.log(`\n→ ${OUT}: ${sheets.size} листов (герб — 2 варианта); сведение по z vs цельный кадр: ${meta.check.pct}% пикселей расходятся`);
