/**
 * Монтаж «было | стало» анимации основы «Б» v2: npx tsx tools/gen/hero147/anim_v2_montage.ts [snap]
 *   snap — запомнить нынешние кадры (tools/out/gear147/anim-b-v2-before.json); без аргумента — монтаж → tools/out/gear147/anim-b-v2.png.
 * Ряды: удар двуручным (Рыцарь Хаоса, 4 вида), покой → переступ (idle2), боевая стойка (stance). Кадр контакта (hit из data/hero-base-b.json) — рамкой.
 * Подписи — шрифт text() из tools/gen/mobs/lib.ts: в нём только кириллица, цифры и знаки (латиница не печатается — поэтому всё по-русски).
 */
import fs from "node:fs";
import path from "node:path";
import { PC } from "../canvas";
import { text } from "../mobs/lib";
import { DATA, NF, frameOf, type AnimId, type Look } from "./base_b";
import { dress, renderView, setOf, type View4 } from "../gear147/gear";

const SET = "chaos-knight", base: Look = { fac: "sol", sex: "m", hair: "tousled" };
const VIEWS: View4[] = ["down", "side", "up", "left"];
const VN: Record<View4, string> = { down: "ВНИЗ", side: "ВПРАВО", up: "ВВЕРХ", left: "ВЛЕВО" };
const BEFORE = path.resolve("tools/out/gear147/anim-b-v2-before.json");
const has = (a: string) => !!DATA.anims[a];
type Shot = { w: number; px: string };
const shoot = (a: AnimId, v: View4): Shot[] => {
  const l = dress(base, setOf(SET));
  return Array.from({ length: NF(a) }, (_, i) => { const f = renderView(l, v, a, i).img; return { w: f.w, px: Buffer.from(f.d).toString("base64") }; });
};
const ROWS: { a: string; was: string; title: string }[] = [
  { a: "atk2h", was: "atk2h", title: "УДАР ДВУРУЧНЫМ: ЗАМАХ 5 КАДРОВ → УДАР 2 СО СМАЗОМ → КОНТАКТ И ФИКСАЦИЯ → ВОЗВРАТ В СТОЙКУ" },
  { a: "idle2", was: "idle", title: "ПОКОЙ → РЕДКИЙ ПЕРЕСТУП: ПЕРЕНОС ВЕСА, ШАГ ПРАВОЙ И ОБРАТНО" },
  { a: "stance", was: "idle", title: "БОЕВАЯ СТОЙКА МЕЖДУ УДАРАМИ (БЫЛО — ПОКОЙ)" },
];
if (process.argv[2] === "snap") {
  const o: Record<string, Shot[]> = {};
  for (const r of ROWS) for (const v of VIEWS) if (has(r.was)) o[`${r.was}/${v}`] = shoot(r.was as AnimId, v);
  fs.writeFileSync(BEFORE, JSON.stringify(o)); console.log("было → " + BEFORE); process.exit(0);
}
const before: Record<string, Shot[]> = JSON.parse(fs.readFileSync(BEFORE, "utf8"));
const K = 2, FRm = frameOf(dress(base, setOf(SET))).FRx, cw = FRm * K, lw = 110, gap = 40;
const cols = Math.max(...ROWS.map((r) => Math.max(NF(r.a as AnimId), before[`${r.was}/down`]?.length ?? 0)));
const W = lw + 2 * cols * cw + gap + 20, H = 70 + ROWS.length * (40 + VIEWS.length * (cw + 6));
const out = new PC(W, H);
const fill = (x: number, y: number, w: number, h: number, c: [number, number, number, number]) => { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) out.set(x + xx, y + yy, c); };
fill(0, 0, W, H, [22, 19, 25, 255]);
text(out, "БЫЛО", lw + 4, 10, 3, [220, 150, 140, 255]);
text(out, "СТАЛО", lw + cols * cw + gap + 4, 10, 3, [160, 230, 150, 255]);
text(out, "РАМКА — КАДР КОНТАКТА = МОМЕНТ УРОНА", lw + 160, 16, 2, [255, 216, 100, 255]);
let y = 50;
const draw = (s: Shot, x0: number, yy: number, mark: boolean, dark: boolean) => {
  fill(x0, yy, cw - 2, cw - 2, dark ? [38, 46, 52, 255] : [42, 52, 38, 255]);
  const off = (FRm - s.w) / 2, d = Buffer.from(s.px, "base64");
  for (let sy = 0; sy < s.w; sy++) for (let sx = 0; sx < s.w; sx++) {
    const q = (sy * s.w + sx) * 4; if (!d[q + 3]) continue;
    for (let p = 0; p < K; p++) for (let b = 0; b < K; b++) out.set(x0 + (sx + off) * K + p, yy + (sy + off * 1.5) * K + b, [d[q], d[q + 1], d[q + 2], 255]);
  }
  if (mark) { const c: [number, number, number, number] = [255, 216, 100, 255]; fill(x0, yy, cw - 2, 2, c); fill(x0, yy + cw - 4, cw - 2, 2, c); fill(x0, yy, 2, cw - 2, c); fill(x0 + cw - 4, yy, 2, cw - 2, c); }
};
for (const r of ROWS) {
  text(out, r.title, 6, y, 2, [255, 216, 100, 255]); y += 30;
  const hit = DATA.anims[r.a]?.hit ?? -1;
  for (const v of VIEWS) {
    text(out, VN[v], 6, y + cw / 2 - 6, 2);
    (before[`${r.was}/${v}`] ?? []).forEach((s, i) => draw(s, lw + i * cw, y, false, v === "up" || v === "left"));
    if (has(r.a)) shoot(r.a as AnimId, v).forEach((s, i) => draw(s, lw + cols * cw + gap + i * cw, y, i === hit, v === "up" || v === "left"));
    y += cw + 6;
  }
  y += 10;
}
out.save(path.resolve("tools/out/gear147/anim-b-v2.png"));
console.log("монтаж → tools/out/gear147/anim-b-v2.png");
