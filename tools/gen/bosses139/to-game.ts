/**
 * Боссы кольца (задача 139) — арт в игру, только свои файлы: лист и эффекты из tools/out/bosses139/ (собирают генераторы
 * tools/gen/bosses139/<id>.ts) → client/public/assets/units/<id>.png и client/public/assets/zone-bosses/<id>-<эффект>.png,
 * запись босса в client/public/assets/zone-bosses/manifest.json (остальные записи не трогаются — общий сборщик
 * tools/gen/zone-bosses-to-game.ts не запускается). Связки умений и эффекты — из реестров генераторов.
 * Широкий лист (больше 8192 px — предел текстуры WebGL) переносится по строкам: wrap столбцов в строке, вид — ceil(cols / wrap) строк.
 * Запуск: npx tsx tools/gen/bosses139/to-game.ts [umb_crown_lich|umb_ash_executioner|sol_mirage_sorcerer|umb_crimson_vampire|sol_goblin_warlord|umb_plague_priestess|sol_plague_raven|sol_fallen_chaplain|plg_drowned_bellringer]   (без аргумента — все)
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import * as lich from "./umb_crown_lich";
import * as exec from "./umb_ash_executioner";
import * as mir from "./sol_mirage_sorcerer";
import * as vam from "./umb_crimson_vampire";
import * as gob from "./sol_goblin_warlord";
import * as plg from "./umb_plague_priestess";
import * as rav from "./sol_plague_raven";
import * as chp from "./sol_fallen_chaplain";
import * as bel from "./plg_drowned_bellringer";

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
interface Boss { id: string; sheet: string; frame: number; frameH?: number; cols: number; wrap?: number; anims: Record<string, A>; fx: Record<string, { src: string; def: ReturnType<typeof fxDef> }>; skills: Record<string, unknown>; units?: { src: string; id: string; frame: number; frameH?: number }[] }

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

BOSSES.push({
  id: mir.ID, sheet: "mir-sheet.png", frame: mir.FRAME, frameH: mir.FRAME_H, cols: mir.MIR_COLS, wrap: 64, anims: anims(mir.MIR_ANIMS),
  fx: Object.fromEntries((["vortex", "mirage", "twister"] as const).map((k) => [k, { src: `mir-fx-${k}.png`, def: fxDef(mir.ID, k, mir.FX[k] as FxIn) }])),
  skills: {
    flame_blade: { waves: [{ pre: ["bladeWind", "bladeHold"], strike: "bladeStrike" }], fx: [] },
    quicksand_vortex: { waves: [{ pre: ["vortexWind", "vortexHold"], strike: "vortexCast" }], fx: [{ fx: "vortex", waves: [0], seq: ["vortexIn", "vortexHold", "vortexOut"], pin: 0, timing: "strike", place: "marks", holds: { vortexHold: 2400 } }] },
    false_doubles: { waves: [{ pre: ["mirageWind", "mirageHold"], strike: "mirageCast" }], fx: [{ fx: "mirage", waves: [0], seq: ["mirage"], pin: 0, timing: "strike", place: "marks" }] },
    sand_twister: { waves: [{ pre: ["twisterWind", "twisterHold"], strike: "twisterCast" }], fx: [{ fx: "twister", waves: [0], seq: ["twister"], pin: 0, timing: "strike", place: "ring", radius: "mid", spacing: 52 }] },
    // кольцо мираж-двойника: тот же вихрь на его месте, без замаха босса
    sand_twister_mirage: { waves: [], fx: [{ fx: "twister", waves: [0], seq: ["twister"], pin: 0, timing: "strike", place: "ring", radius: "mid", spacing: 52 }] },
  },
  units: [{ src: "mir-unit-mirage.png", id: `${mir.ID}_mirage`, frame: mir.FRAME, frameH: mir.FRAME_H }],
});

BOSSES.push({
  id: vam.ID, sheet: "vam-sheet.png", frame: vam.FRAME, frameH: vam.FRAME_H, cols: vam.MIR_COLS, wrap: 64, anims: anims(vam.MIR_ANIMS),
  fx: Object.fromEntries((["vortex", "mirage", "twister"] as const).map((k) => [k, { src: `vam-fx-${k}.png`, def: fxDef(vam.ID, k, vam.FX[k] as FxIn) }])),
  skills: {
    blood_slash: { waves: [{ pre: ["bladeWind", "bladeHold"], strike: "bladeStrike" }], fx: [] },
    bat_whirl: { waves: [{ pre: ["vortexWind", "vortexHold"], strike: "vortexCast" }], fx: [{ fx: "vortex", waves: [0], seq: ["vortexIn", "vortexHold", "vortexOut"], pin: 0, timing: "strike", place: "marks", holds: { vortexHold: 2400 } }] },
    bat_split: { waves: [{ pre: ["mirageWind", "mirageHold"], strike: "mirageCast" }], fx: [{ fx: "mirage", waves: [0], seq: ["mirage"], pin: 0, timing: "strike", place: "marks" }] },
    wing_storm: { waves: [{ pre: ["twisterWind", "twisterHold"], strike: "twisterCast" }], fx: [{ fx: "twister", waves: [0], seq: ["twister"], pin: 0, timing: "strike", place: "ring", radius: "mid", spacing: 52 }] },
    // кольцо стаи: тот же вихрь на её месте, без замаха босса
    wing_storm_mirage: { waves: [], fx: [{ fx: "twister", waves: [0], seq: ["twister"], pin: 0, timing: "strike", place: "ring", radius: "mid", spacing: 52 }] },
  },
  units: [{ src: "vam-unit-mirage.png", id: `${vam.ID}_mirage`, frame: vam.FRAME, frameH: vam.FRAME_H }],
});

BOSSES.push({
  id: gob.ID, sheet: "gob-sheet.png", frame: gob.FRAME, frameH: gob.FRAME_H, cols: gob.MIR_COLS, wrap: 64, anims: anims(gob.MIR_ANIMS),
  fx: Object.fromEntries((["vortex", "mirage", "twister"] as const).map((k) => [k, { src: `gob-fx-${k}.png`, def: fxDef(gob.ID, k, gob.FX[k] as FxIn) }])),
  skills: {
    // подкоп: песчаная воронка на метке с начала замаха (след), удар — когда босс выныривает (анимация «в песок и обратно»)
    burrow: { waves: [{ pre: ["mirageWind", "mirageHold"], strike: "mirageCast" }], fx: [{ fx: "vortex", waves: [0], seq: ["vortexIn", "vortexHold", "vortexOut"], pin: 0, timing: "wind", place: "marks", holds: { vortexHold: 1200 } }] },
    chitin_wall: { waves: [{ pre: ["bladeWind", "bladeHold"], strike: "bladeStrike" }], fx: [] },
    scorpion_swarm: { waves: [{ pre: ["twisterWind", "twisterHold"], strike: "twisterCast" }], fx: [] },
    // укрытия: на метках встают песчаные столбы
    sand_storm: { waves: [{ pre: ["vortexWind", "vortexHold"], strike: "vortexCast" }], fx: [{ fx: "mirage", waves: [0], seq: ["mirage"], pin: 0, timing: "wind", place: "marks" }] },
  },
});

BOSSES.push({
  id: plg.ID, sheet: "plg-sheet.png", frame: plg.FRAME, frameH: plg.FRAME_H, cols: plg.MIR_COLS, wrap: 64,
  // удар и переход фазы — броски склянки и мутагена (кадры листа общие), оглушение и гибель — свои
  anims: {
    // phase стоит раньше mutagenCast: тест кадра по столбцу берёт первое совпадение; vialThrow в связках обрезан до 6 кадров (хвост возврата в покой не тянет цепочку)
    ...anims({ idle: plg.MIR_ANIMS.idle, walk: plg.MIR_ANIMS.walk }),
    phase: { col: plg.MIR_ANIMS.mutagenCast.col, n: 8, fps: 12, loop: false, hit: 4 },
    ...anims(Object.fromEntries(Object.entries(plg.MIR_ANIMS).filter(([k]) => k !== "idle" && k !== "walk"))),
    vialThrow: { col: plg.MIR_ANIMS.vialThrow.col, n: 6, fps: 12, loop: false, hit: 1 },
    attack: { col: plg.MIR_ANIMS.vialThrow.col, n: 6, fps: 12, loop: false, hit: 1 },
    // выдержка последнего кадра замаха (по кругу), пока длится предупреждение
    vialHold: { col: plg.MIR_ANIMS.vialWind.col + 3, n: 1, fps: 12, loop: true },
    mutagenHold: { col: plg.MIR_ANIMS.mutagenWind.col + 3, n: 1, fps: 12, loop: true },
  },
  fx: { cauldron: { src: "plg-fx-cauldron.png", def: fxDef(plg.ID, "cauldron", plg.FX.cauldron as FxIn) } },
  skills: {
    vials: { waves: [{ pre: ["vialWind", "vialHold"], strike: "vialThrow" }, { pre: ["vialWind", "vialHold"], strike: "vialThrow" }], fx: [] },
    miasma: { waves: [{ pre: ["cauldronWind", "cauldronHold"], strike: "cauldronCast" }], fx: [] },
    // котёл: каст 4 с — объект-котёл всплывает рядом с жрицей, кипит и уходит в землю (метка — единственная точка pts)
    cauldron: { waves: [{ pre: ["cauldronWind", "cauldronHold"], strike: "cauldronCast" }], fx: [{ fx: "cauldron", waves: [0], seq: ["cauldronIn", "cauldronBoil", "cauldronOut"], pin: 0, timing: "wind", place: "marks", holds: { cauldronBoil: 3200 } }] },
    mutagen: { waves: [{ pre: ["mutagenWind", "mutagenHold"], strike: "mutagenCast" }], fx: [] },
    vials_fast: { waves: [{ pre: ["vialWind", "vialHold"], strike: "vialThrow" }], fx: [] },
  },
});

const ravFx = Object.fromEntries((["wing", "dive", "land"] as const).map((k) => [k, { src: `rav-fx-${k}.png`, def: fxDef(rav.ID, k, rav.FX[k] as FxIn) }]));
// тень «Взлёта» держится по кругу (holds), пока стая в воздухе
ravFx.dive.def.anims.dive.loop = true;
BOSSES.push({
  id: rav.ID, sheet: "rav-sheet.png", frame: rav.FRAME, frameH: rav.FRAME_H, cols: rav.MIR_COLS, wrap: 64,
  // phase (переход фазы) — приземление стаи: кадры листа общие с «Взлётом»; стоит раньше leapLand: тест кадра по столбцу берёт первое совпадение
  anims: { ...anims({ idle: rav.MIR_ANIMS.idle, walk: rav.MIR_ANIMS.walk }), phase: { col: rav.MIR_ANIMS.leapLand.col, n: 8, fps: 12, loop: false, hit: 3 }, ...anims(Object.fromEntries(Object.entries(rav.MIR_ANIMS).filter(([k]) => k !== "idle" && k !== "walk"))) },
  fx: ravFx,
  skills: {
    // удар крыла: веер перьев на метке в миг удара
    wing_beat: { waves: [{ pre: ["wingWind", "wingHold"], strike: "wingStrike" }], fx: [{ fx: "wing", waves: [0], seq: ["wing"], pin: 0, timing: "strike", place: "marks" }] },
    // пикирование: три метки по очереди — тень птицы на каждой
    dive: { waves: [{ pre: ["diveWind", "diveHold"], strike: "diveCast" }, { pre: ["diveHold"], strike: "diveCast" }, { pre: ["diveHold"], strike: "diveCast" }], fx: [{ fx: "dive", waves: [0, 1, 2], seq: ["dive"], pin: 0, timing: "wind", place: "marks" }] },
    // взлёт: стая кружит, тени лежат под героями (удар 1 в конце 3 с), приземление кольцом — удар 2
    carrion_flight: { waves: [{ pre: ["leapWind", "leapHold"], strike: "leapHold" }, { pre: ["leapHold"], strike: "leapLand" }], fx: [{ fx: "dive", waves: [0], seq: ["dive"], pin: 0, timing: "wind", place: "marks", holds: { dive: 2800 } }, { fx: "land", waves: [1], seq: ["land"], pin: 0, timing: "strike", place: "marks" }] },
  },
});

BOSSES.push({
  id: chp.ID, sheet: "chap-sheet.png", frame: chp.FRAME, frameH: chp.FRAME_H, cols: chp.CHAP_COLS, wrap: 64,
  // phase (переход фазы 65 % и 30 %) — вбивание знамени: кадры листа общие; стоит раньше plantStrike: тест кадра по столбцу берёт первое совпадение
  anims: { ...anims({ idle: chp.CHAP_ANIMS.idle, walk: chp.CHAP_ANIMS.walk }), phase: { col: chp.CHAP_ANIMS.plantStrike.col, n: 8, fps: 12, loop: false, hit: 2 }, ...anims(Object.fromEntries(Object.entries(chp.CHAP_ANIMS).filter(([k]) => k !== "idle" && k !== "walk"))) },
  fx: {},
  skills: {
    // удар мечом: замах из-за спины, рубящий удар (кадр 3 — конец предупреждения)
    sword_cleave: { waves: [{ pre: ["slashWind", "slashHold"], strike: "slashStrike" }], fx: [] },
    // залп теней: две волны — метки и взрыв шире на тех же местах
    shadow_volley: { waves: [{ pre: ["volleyWind", "volleyHold"], strike: "volleyCast" }, { pre: ["volleyHold"], strike: "volleyCast" }], fx: [] },
    // знамя: достаёт из-за спины и вбивает; дальше знамя — моб-объект `<босс>_banner`
    plant_banner: { waves: [{ pre: ["plantWind", "plantHold"], strike: "plantStrike" }], fx: [] },
    // последний натиск: присел, меч наискось; таран — к концу пути, толчок вторым кругом
    last_charge: { waves: [{ pre: ["rushWind", "rushHold"], strike: "rushDash" }, { pre: ["rushHold"], strike: "rushStrike" }], fx: [] },
  },
  units: [{ src: "chap-unit-banner.png", id: `${chp.ID}_banner`, frame: chp.BANNER_UNIT.frame, frameH: chp.BANNER_UNIT.frameH }],
});

const belFx = Object.fromEntries((["wave", "roots", "tide", "mound"] as const).map((k) => [k, { src: `bel-fx-${k}.png`, def: fxDef(bel.ID, k, bel.FX[k] as FxIn) }]));
// вода и кочки «Прилива» держатся по кругу, пока идёт замах
belFx.tide.def.anims.tide.loop = true;
belFx.mound.def.anims.mound.loop = true;
BOSSES.push({
  id: bel.ID, sheet: "bel-sheet.png", frame: bel.FRAME, frameH: bel.FRAME_H, cols: bel.BEL_COLS, wrap: 64,
  // phase (переход фазы 50 %) — зов прилива: кадры листа общие; стоит раньше tideCast: тест кадра по столбцу берёт первое совпадение
  anims: { ...anims({ idle: bel.BEL_ANIMS.idle, walk: bel.BEL_ANIMS.walk }), phase: { col: bel.BEL_ANIMS.tideCast.col, n: 8, fps: 12, loop: false, hit: 2 }, ...anims(Object.fromEntries(Object.entries(bel.BEL_ANIMS).filter(([k]) => k !== "idle" && k !== "walk"))) },
  fx: belFx,
  skills: {
    // волна: кистень бьёт в колокол, звуковой конус с отбрасыванием
    bell_wave: { waves: [{ pre: ["waveWind", "waveHold"], strike: "waveCast" }], fx: [{ fx: "wave", waves: [0], seq: ["wave"], pin: 0, timing: "strike", place: "marks" }] },
    // объятие трясины: три метки по очереди, на каждой корни (метка — держится — рывок корней)
    swamp_embrace: { waves: [{ pre: ["embraceWind", "embraceHold"], strike: "embraceCast" }, { pre: ["embraceHold"], strike: "embraceCast" }, { pre: ["embraceHold"], strike: "embraceCast" }], fx: [{ fx: "roots", waves: [0, 1, 2], seq: ["markIn", "markHold", "rootsOut"], pin: 0, timing: "strike", place: "marks", holds: { markHold: 700 } }] },
    // прилив: вода под боссом и три сухие кочки (метки safe) держатся весь замах (2,8 с)
    high_tide: { waves: [{ pre: ["tideWind", "tideHold"], strike: "tideCast" }], fx: [{ fx: "tide", waves: [0], seq: ["tide"], pin: 0, timing: "wind", place: "self", holds: { tide: 2800 } }, { fx: "mound", waves: [0], seq: ["mound"], pin: 0, timing: "wind", place: "marks", holds: { mound: 2800 } }] },
    // утопленники: зов — тот же замах, что у трясины; сами утопленники — мобы зоны
    drowned_call: { waves: [{ pre: ["embraceWind", "embraceHold"], strike: "embraceCast" }], fx: [] },
  },
});

const only = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const man = JSON.parse(fs.readFileSync(MAN, "utf8")) as { bosses: Record<string, unknown>; units?: Record<string, { frame: number; frameH?: number }> };
/** Кадры листов юнитов боссов (сами боссы и их мобы-спутники): общий сборщик tools/gen-assets.ts берёт их отсюда и не теряет записи каталога units. */
man.units ??= {};
const unitFrame = (id: string, frame: number, frameH?: number) => { man.units![id] = { frame, ...(frameH && frameH !== frame ? { frameH } : {}) }; };
/** Запись юнита в общий каталог — правкой текста (формат файла чужой: не переписываем его целиком). */
let utext = fs.readFileSync(UMAN, "utf8");
const setUnit = (id: string, frame: number, frameH?: number) => {
  const nl = utext.includes("\r\n") ? "\r\n" : "\n";
  const hPart = frameH && frameH !== frame ? `,${nl}   "frameH": ${frameH}` : "";
  const re = new RegExp(`("${id}": \\{\\s*"frame": )\\d+(,\\s*"frameH": \\d+)?`);
  if (re.test(utext)) utext = utext.replace(re, `$1${frame}${hPart}`);
  else utext = utext.replace(/"units": \{\r?\n/, (m) => `${m}  "${id}": {${nl}   "frame": ${frame}${hPart}${nl}  },${nl}`);
};
let unitsTouched = false;
for (const b of BOSSES) {
  if (only && b.id !== only) continue;
  const src = PNG.sync.read(fs.readFileSync(path.join(SRC, b.sheet)));
  const N = b.frame, NH = b.frameH ?? b.frame, w = b.wrap && b.cols * N > 8192 ? b.wrap : b.cols, per = Math.ceil(b.cols / w);
  const out = new PNG({ width: w * N, height: 3 * per * NH });
  for (let row = 0; row < 3; row++) for (let c = 0; c < b.cols; c++) PNG.bitblt(src, out, c * N, row * NH, N, NH, (c % w) * N, (row * per + Math.floor(c / w)) * NH);
  fs.writeFileSync(path.join(UNITS, `${b.id}.png`), PNG.sync.write(out));
  for (const f of Object.values(b.fx)) fs.copyFileSync(path.join(SRC, f.src), path.join(OUT, f.def.file));
  man.bosses[b.id] = { file: `${b.id}.png`, fw: N, ...(NH !== N ? { fh: NH } : {}), cols: b.cols, ...(w !== b.cols ? { wrap: w } : {}), anims: b.anims, fx: Object.fromEntries(Object.entries(b.fx).map(([k, f]) => [k, f.def])), skills: b.skills };
  // лист босса в общем каталоге юнитов — с его кадром (иначе сборщик ассетов возьмёт высоту / 3)
  setUnit(b.id, N, NH);
  unitFrame(b.id, N, NH);
  for (const u of b.units ?? []) {
    fs.copyFileSync(path.join(SRC, u.src), path.join(UNITS, `${u.id}.png`));
    setUnit(u.id, u.frame, u.frameH);
    unitFrame(u.id, u.frame, u.frameH);
  }
  unitsTouched = true;
  console.log(`  ${b.id}: лист ${N}×${N} (${b.cols} столбцов${w !== b.cols ? `, перенос по ${w}` : ""}), эффекты ${Object.keys(b.fx).join(", ")}`);
}
fs.writeFileSync(MAN, JSON.stringify(man, null, 1) + "\n");
if (unitsTouched) { JSON.parse(utext); fs.writeFileSync(UMAN, utext); }
