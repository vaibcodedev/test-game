/**
 * Боссы кольца (задача 139) — арт в игру, только свои файлы: лист и эффекты из tools/out/bosses139/ (собирают генераторы
 * tools/gen/bosses139/<id>.ts) → client/public/assets/units/<id>.png и client/public/assets/zone-bosses/<id>-<эффект>.png,
 * запись босса в client/public/assets/zone-bosses/manifest.json (остальные записи не трогаются — общий сборщик
 * tools/gen/zone-bosses-to-game.ts не запускается). Связки умений и эффекты — из реестров генераторов.
 * Широкий лист (больше 8192 px — предел текстуры WebGL) переносится по строкам: wrap столбцов в строке, вид — ceil(cols / wrap) строк.
 * Запуск: npx tsx tools/gen/bosses139/to-game.ts [umb_crown_lich|umb_ash_executioner]   (без аргумента — все)
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import * as lich from "./umb_crown_lich";
import * as exec from "./umb_ash_executioner";

const ROOT = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
const SRC = path.join(ROOT, "tools", "out", "bosses139");
const UNITS = path.join(ROOT, "client", "public", "assets", "units");
const OUT = path.join(ROOT, "client", "public", "assets", "zone-bosses");
const MAN = path.join(OUT, "manifest.json");
const UMAN = path.join(ROOT, "client", "public", "assets", "manifest.json");

type A = { col: number; n: number; fps: number; loop: boolean; hit?: number };
const anims = (src: Record<string, A & Record<string, unknown>>): Record<string, A> =>
  Object.fromEntries(Object.entries(src).map(([k, a]) => [k, { col: a.col, n: a.n, fps: a.fps, loop: a.loop, ...(a.hit !== undefined ? { hit: a.hit } : {}) }]));
type FxIn = { w: number; h: number; ax: number; ay: number; n: number; fps: number; hit: number; anims?: Record<string, { col: number; n: number; loop: boolean; hit?: number; fps?: number }> };
const fxDef = (id: string, k: string, F: FxIn) => ({
  file: `${id}-${k}.png`, fw: F.w, fh: F.h, ax: F.ax, ay: F.ay, rows: 2,
  anims: F.anims ? Object.fromEntries(Object.entries(F.anims).map(([a, q]) => [a, { col: q.col, n: q.n, fps: q.fps ?? F.fps, loop: q.loop, ...(q.hit !== undefined ? { hit: q.hit } : {}) }])) : { [k]: { col: 0, n: F.n, fps: F.fps, loop: false, hit: F.hit } },
});
interface Boss { id: string; sheet: string; frame: number; cols: number; wrap?: number; anims: Record<string, A>; fx: Record<string, { src: string; def: ReturnType<typeof fxDef> }>; skills: Record<string, unknown>; units?: { src: string; id: string; frame: number }[] }

const BOSSES: Boss[] = [
  {
    id: lich.ID, sheet: "lich-sheet.png", frame: lich.FRAME, cols: lich.LICH_COLS, wrap: 64, anims: anims(lich.LICH_ANIMS),
    fx: Object.fromEntries((["seal", "wisp", "pillar"] as const).map((k) => [k, { src: `lich-fx-${k}.png`, def: fxDef(lich.ID, k, lich.FX[k]) }])),
    skills: {
      crypt_seal: { waves: [{ pre: ["sealWind", "sealHold"], strike: "seal" }], fx: [{ fx: "seal", waves: [0], seq: ["seal"], pin: 0, timing: "strike", place: "marks" }] },
      wandering_fires: {
        waves: [{ pre: ["wispWind", "wispHold"], strike: "wispCast" }, { pre: ["wispHold"], strike: "wispCast" }],
        fx: [{ fx: "wisp", waves: [0, 1], seq: ["wisp"], pin: 0, timing: "strike", place: "marks" }],
      },
      dead_crown_call: { waves: [{ pre: ["callWind", "callHold"], strike: "call" }], fx: [{ fx: "pillar", waves: [0], seq: ["pillar"], pin: 0, timing: "strike", place: "marks" }] },
    },
  },
  {
    id: exec.ID, sheet: "exec-sheet.png", frame: exec.FRAME, cols: exec.EXEC_COLS, anims: anims(exec.EXEC_ANIMS),
    fx: Object.fromEntries((["hook", "cage"] as const).map((k) => [k, { src: `exec-fx-${k}.png`, def: fxDef(exec.ID, k, exec.FX[k] as FxIn) }])),
    skills: {
      execution: { waves: [{ pre: ["execWind", "execHold"], strike: "execute" }], fx: [] },
      chain_hook: { waves: [{ pre: ["chainWind", "chainHold"], strike: "chainThrow" }], fx: [{ fx: "hook", waves: [0], seq: ["hook"], pin: 0, timing: "strike", place: "marks" }] },
      // клетка: подъём (кадр hit — конец замаха), удержание по кругу до удара внутрь (6 с), разлом; сломанный кол — разлом сразу (cage_break)
      chain_cages: { waves: [{ pre: ["cageWind", "cageHold"], strike: "cageSlam" }], fx: [{ fx: "cage", waves: [0], seq: ["cageIn", "cageHold", "cageOut"], pin: 0, timing: "strike", place: "marks", holds: { cageHold: 5900 } }] },
    },
    units: [{ src: "exec-cage-unit.png", id: `${exec.ID}_cage`, frame: exec.CAGE_UNIT.frame }],
  },
];

const only = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const man = JSON.parse(fs.readFileSync(MAN, "utf8")) as { bosses: Record<string, unknown> };
/** Запись юнита в общий каталог — правкой текста (формат файла чужой: не переписываем его целиком). */
let utext = fs.readFileSync(UMAN, "utf8");
const setUnit = (id: string, frame: number) => {
  const re = new RegExp(`("${id}": \\{\\s*"frame": )\\d+`);
  const nl = utext.includes("\r\n") ? "\r\n" : "\n";
  if (re.test(utext)) utext = utext.replace(re, `$1${frame}`);
  else utext = utext.replace(/"units": \{\r?\n/, (m) => `${m}  "${id}": {${nl}   "frame": ${frame}${nl}  },${nl}`);
};
let unitsTouched = false;
for (const b of BOSSES) {
  if (only && b.id !== only) continue;
  const src = PNG.sync.read(fs.readFileSync(path.join(SRC, b.sheet)));
  const N = b.frame, w = b.wrap && b.cols * N > 8192 ? b.wrap : b.cols, per = Math.ceil(b.cols / w);
  const out = new PNG({ width: w * N, height: 3 * per * N });
  for (let row = 0; row < 3; row++) for (let c = 0; c < b.cols; c++) PNG.bitblt(src, out, c * N, row * N, N, N, (c % w) * N, (row * per + Math.floor(c / w)) * N);
  fs.writeFileSync(path.join(UNITS, `${b.id}.png`), PNG.sync.write(out));
  for (const f of Object.values(b.fx)) fs.copyFileSync(path.join(SRC, f.src), path.join(OUT, f.def.file));
  man.bosses[b.id] = { file: `${b.id}.png`, fw: N, cols: b.cols, ...(w !== b.cols ? { wrap: w } : {}), anims: b.anims, fx: Object.fromEntries(Object.entries(b.fx).map(([k, f]) => [k, f.def])), skills: b.skills };
  // лист босса в общем каталоге юнитов — с его кадром (иначе сборщик ассетов возьмёт высоту / 3)
  setUnit(b.id, N);
  for (const u of b.units ?? []) {
    fs.copyFileSync(path.join(SRC, u.src), path.join(UNITS, `${u.id}.png`));
    setUnit(u.id, u.frame);
  }
  unitsTouched = true;
  console.log(`  ${b.id}: лист ${N}×${N} (${b.cols} столбцов${w !== b.cols ? `, перенос по ${w}` : ""}), эффекты ${Object.keys(b.fx).join(", ")}`);
}
fs.writeFileSync(MAN, JSON.stringify(man, null, 1) + "\n");
if (unitsTouched) { JSON.parse(utext); fs.writeFileSync(UMAN, utext); }
