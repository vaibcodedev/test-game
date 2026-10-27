/**
 * Боссы кольца (задача 139) — арт в игру, только свои файлы: лист и эффекты из tools/out/bosses139/ (собирает
 * `npx tsx tools/gen/bosses139/umb_crown_lich.ts`) → client/public/assets/units/<id>.png и client/public/assets/zone-bosses/<id>-<эффект>.png,
 * запись босса в client/public/assets/zone-bosses/manifest.json (остальные записи не трогаются — общий сборщик
 * tools/gen/zone-bosses-to-game.ts не запускается). Связки умений — LICH_SKILLS, эффекты — FX генератора.
 * Запуск: npx tsx tools/gen/bosses139/to-game.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { FX, FRAME, ID, LICH_ANIMS, LICH_COLS } from "./umb_crown_lich";

const ROOT = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
const SRC = path.join(ROOT, "tools", "out", "bosses139");
const UNITS = path.join(ROOT, "client", "public", "assets", "units");
const OUT = path.join(ROOT, "client", "public", "assets", "zone-bosses");
const MAN = path.join(OUT, "manifest.json");

type A = { col: number; n: number; fps: number; loop: boolean; hit?: number };
const anims = (src: Record<string, A & Record<string, unknown>>): Record<string, A> =>
  Object.fromEntries(Object.entries(src).map(([k, a]) => [k, { col: a.col, n: a.n, fps: a.fps, loop: a.loop, ...(a.hit !== undefined ? { hit: a.hit } : {}) }]));
const fxDef = (k: keyof typeof FX) => {
  const F = FX[k];
  return { file: `${ID}-${k}.png`, fw: F.w, fh: F.h, ax: F.ax, ay: F.ay, rows: 2, anims: { [k]: { col: 0, n: F.n, fps: F.fps, loop: false, hit: F.hit } } };
};

/** Лист в игре — с переносом: WRAP столбцов в строке (ширина ≤ 8192 — предел текстуры WebGL), вид — ceil(cols / WRAP) строк подряд. */
const WRAP = 64;
const entry = {
  file: `${ID}.png`, fw: FRAME, cols: LICH_COLS, wrap: WRAP, anims: anims(LICH_ANIMS),
  fx: { seal: fxDef("seal"), wisp: fxDef("wisp"), pillar: fxDef("pillar") },
  skills: {
    crypt_seal: { waves: [{ pre: ["sealWind", "sealHold"], strike: "seal" }], fx: [{ fx: "seal", waves: [0], seq: ["seal"], pin: 0, timing: "strike", place: "marks" }] },
    wandering_fires: {
      waves: [{ pre: ["wispWind", "wispHold"], strike: "wispCast" }, { pre: ["wispHold"], strike: "wispCast" }],
      fx: [{ fx: "wisp", waves: [0, 1], seq: ["wisp"], pin: 0, timing: "strike", place: "marks" }],
    },
    dead_crown_call: { waves: [{ pre: ["callWind", "callHold"], strike: "call" }], fx: [{ fx: "pillar", waves: [0], seq: ["pillar"], pin: 0, timing: "strike", place: "marks" }] },
  },
};

fs.mkdirSync(OUT, { recursive: true });
{
  const src = PNG.sync.read(fs.readFileSync(path.join(SRC, "lich-sheet.png")));
  const per = Math.ceil(LICH_COLS / WRAP), N = FRAME;
  const out = new PNG({ width: WRAP * N, height: 3 * per * N });
  for (let row = 0; row < 3; row++) for (let c = 0; c < LICH_COLS; c++)
    PNG.bitblt(src, out, c * N, row * N, N, N, (c % WRAP) * N, (row * per + Math.floor(c / WRAP)) * N);
  fs.writeFileSync(path.join(UNITS, `${ID}.png`), PNG.sync.write(out));
}
for (const k of ["seal", "wisp", "pillar"]) fs.copyFileSync(path.join(SRC, `lich-fx-${k}.png`), path.join(OUT, `${ID}-${k}.png`));
const man = JSON.parse(fs.readFileSync(MAN, "utf8")) as { bosses: Record<string, unknown> };
man.bosses[ID] = entry;
fs.writeFileSync(MAN, JSON.stringify(man, null, 1) + "\n");
console.log(`  ${ID}: лист ${FRAME}×${FRAME} (${LICH_COLS} столбцов), 3 эффекта мира, запись в zone-bosses/manifest.json`);
