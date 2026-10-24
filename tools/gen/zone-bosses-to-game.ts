/**
 * Боссы стартовых земель (задача 136, шаг 4) — арт в игру. Берёт листы, собранные `npx tsx tools/gen/zone-bosses.ts art`
 * (tools/out/zone-bosses/), и кладёт в игровую папку:
 *   client/public/assets/units/<id>.png — лист босса (кадр 64×64, строки вниз, вверх, вбок; бестиарий берёт первый кадр);
 *   client/public/assets/zone-bosses/<id>-<эффект>.png — эффекты мира и частицы;
 *   client/public/assets/zone-bosses/manifest.json — каталог для клиента (client/src/game/zoneBoss.ts): анимации листа,
 *     связки умений по волнам (замах → удержание по кругу → удар, кадр hit — ровно в конце предупреждения), эффекты мира
 *     (кадры, точка привязки, слои под и над юнитами, где ставить — в метках, кольцом, лучом, факелом) и облёт частиц.
 * Связки и тайминги — из реестров генераторов (TREANT_SKILLS, RAIDER_SKILLS …), сроки удержаний (корни, огонь) — из карточек
 * data/zone-bosses.json. Запуск: npx tsx tools/gen/zone-bosses-to-game.ts (сначала art, если листы менялись).
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { ROOTFX_ANIMS, TREANT_ANIMS, TREANT_COLS, TREANT_MOTES, TREANT_SKILLS } from "./zone-bosses-art";
import { FIRE_ANIMS, FIRE_FX, RAIDER_ANIMS, RAIDER_COLS, RAIDER_SKILLS, ROAR_FX, TORCH_FX, torchRelease } from "./zone-bosses-art-sol_raider_chief";
import { HANDSFX, REAPER_ANIMS, REAPER_COLS, REAPER_SKILLS, STONEFX } from "./zone-bosses-art-umb_revenant_reaper";
import { FIST_FX, GOLEM_ANIMS, GOLEM_COLS, GOLEM_SKILLS, PULSE_FX, SLAB_FX } from "./zone-bosses-art-sol_rune_golem";
import { FOG_BEAMFX, FOG_MIASMAFX, FOG_SPOREFX, FOG_TREANT_ANIMS, FOG_TREANT_COLS, FOG_TREANT_FOG, FOG_TREANT_SKILLS } from "./zone-bosses-art-umb_fog_treant";
import { BEAST_ANIMS, BEAST_COLS, BEAST_SKILLS, CHAINFX, HUNTFX, LUNGEFX } from "./zone-bosses-art-sol_chained_beast";
import { ASHFX, BURNFX, MINO_ANIMS, MINO_COLS, MINO_SKILLS, RAMFX } from "./zone-bosses-art-umb_ash_minotaur";
import { ABOM_ANIMS, ABOM_COLS, ABOM_SKILLS, GASFX_ANIMS, MAWFX_ANIMS, MAWFX_FRAME } from "./zone-bosses-art-umb_marsh_abomination";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
const SRC = path.join(ROOT, "tools", "out", "zone-bosses");
const UNITS = path.join(ROOT, "client", "public", "assets", "units");
const OUT = path.join(ROOT, "client", "public", "assets", "zone-bosses");
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "zone-bosses.json"), "utf8")) as { bosses: { id: string; abilities: { id: string; after?: Record<string, number>; then?: { windupMs: number }[] }[] }[] };
const after = (boss: string, ab: string, k: string) => cards.bosses.find((b) => b.id === boss)?.abilities.find((a) => a.id === ab)?.after?.[k] ?? 0;
const thenMs = (boss: string, ab: string, i: number) => cards.bosses.find((b) => b.id === boss)?.abilities.find((a) => a.id === ab)?.then?.[i]?.windupMs ?? 1000;

/** Анимация листа: первый столбец, кадров, кадров/с, по кругу ли, кадр удара. */
type A = { col: number; n: number; fps: number; loop: boolean; hit?: number };
const anims = (src: Record<string, A & Record<string, unknown>>): Record<string, A> =>
  Object.fromEntries(Object.entries(src).map(([k, a]) => [k, { col: a.col, n: a.n, fps: a.fps, loop: a.loop, ...(a.hit !== undefined ? { hit: a.hit } : {}) }]));
/** Волна умения у босса: pre — замах и удержание (последнее по кругу — до начала удара), strike — удар (кадр hit — конец предупреждения), post — следом; hold — сколько держать strike по кругу; turn — разворот на 180°. */
type Wave = { pre?: string[]; strike?: string; post?: string[]; hold?: number; turn?: boolean };
/** Эффект мира в волне: seq — анимации листа эффекта, pin — какая из них бьёт в конце предупреждения (её кадр hit), holds — сколько держать петли (мс); timing wind — с начала волны, strike — к удару. */
type Use = { fx: string; waves: number[]; seq: string[]; pin: number; timing: "wind" | "strike"; place: "marks" | "self" | "ring" | "arcs" | "beam" | "torch" | "area"; holds?: Record<string, number>; radius?: "mid" | "r" | "r2" | "inner"; k?: number; spacing?: number; count?: number; flyMs?: number };
type Fx = { file: string; fw: number; fh: number; ax: number; ay: number; rows: number; anims: Record<string, A> };
type Boss = { cols: number; anims: Record<string, A>; skills: Record<string, { waves: Wave[]; fx: Use[] }>; fx: Record<string, Fx>; burn?: string; motes?: unknown; fog?: unknown; eye?: [number, number]; release?: Record<string, [number, number]> };
const wave = (s: { windup: [string, string]; strike: string }): Wave => ({ pre: [...s.windup], strike: s.strike });

const M: Record<string, Boss & { sheet: string }> = {};
const fx = (file: string, fw: number, fh: number, ax: number, ay: number, rows: number, a: Record<string, A & Record<string, unknown>>): Fx => ({ file, fw, fh, ax, ay, rows, anims: anims(a) });

// ---- Дубослав (древень пущи): корни-ловушки в метках, борозда по ряду, светлячки
{
  const id = "sol_forest_warden";
  M[id] = {
    sheet: "treant.png", cols: TREANT_COLS, anims: anims(TREANT_ANIMS),
    fx: { root: fx("treant-rootfx.png", 64, 64, 32, 44, 2, ROOTFX_ANIMS) },
    skills: {
      root_snare: { waves: [wave(TREANT_SKILLS.root_snare)], fx: [{ fx: "root", waves: [0], seq: ["snareIn", "snareHold", "snareOut"], pin: 0, timing: "strike", place: "marks", holds: { snareHold: after(id, "root_snare", "rootMs") } }] },
      root_furrow: { waves: [wave(TREANT_SKILLS.root_furrow)], fx: [{ fx: "root", waves: [0], seq: ["furrow"], pin: 0, timing: "strike", place: "marks" }] },
      branch_sweep: { waves: [wave(TREANT_SKILLS.branch_sweep)], fx: [] },
    },
    motes: { file: TREANT_MOTES.sprite, size: TREANT_MOTES.size, frames: TREANT_MOTES.frames, fps: TREANT_MOTES.fps, y: 0, orbits: TREANT_MOTES.orbits },
  };
}
// ---- Хрольф (вожак ватаг): факел летит в метку, стерня горит hazardMs, рык волной
{
  const id = "sol_raider_chief";
  M[id] = {
    sheet: `${id}-sheet.png`, cols: RAIDER_COLS, anims: anims(RAIDER_ANIMS),
    fx: {
      torch: fx(`${id}-torch.png`, TORCH_FX.size, TORCH_FX.size, TORCH_FX.size / 2, TORCH_FX.size / 2, 1, { spin: { col: 0, n: TORCH_FX.frames, fps: TORCH_FX.fps, loop: true } }),
      fire: fx(`${id}-fire.png`, FIRE_FX.size, FIRE_FX.size, FIRE_FX.cx, FIRE_FX.cy, 2, FIRE_ANIMS),
      roar: fx(`${id}-roar.png`, ROAR_FX.size, ROAR_FX.size, ROAR_FX.cx, ROAR_FX.cy, 1, { wave: { col: 0, n: ROAR_FX.frames, fps: ROAR_FX.fps, loop: false, hit: 0 } }),
    },
    skills: {
      axe_sweep: { waves: [wave(RAIDER_SKILLS.axe_sweep)], fx: [] },
      torch_throw: {
        waves: [wave(RAIDER_SKILLS.torch_throw)],
        fx: [
          { fx: "torch", waves: [0], seq: ["spin"], pin: 0, timing: "strike", place: "torch", flyMs: RAIDER_SKILLS.torch_throw.flyMs },
          { fx: "fire", waves: [0], seq: ["ignite", "burn", "out"], pin: 0, timing: "strike", place: "marks", holds: { burn: after(id, "torch_throw", "hazardMs") } },
        ],
      },
      war_roar: { waves: [wave(RAIDER_SKILLS.war_roar)], fx: [{ fx: "roar", waves: [0], seq: ["wave"], pin: 0, timing: "strike", place: "self" }] },
    },
    release: torchRelease(),
  };
}
// ---- Ардрик (ревенант): руки из курганов в метках крестом, надгробие на дальнем
{
  const id = "umb_revenant_reaper";
  M[id] = {
    sheet: `${id}-sheet.png`, cols: REAPER_COLS, anims: anims(REAPER_ANIMS),
    fx: {
      hands: fx(`${id}-handsfx.png`, 64, 64, 32, HANDSFX.ay, 2, { hands: { col: 0, n: HANDSFX.n, fps: HANDSFX.fps, loop: false, hit: HANDSFX.hit } }),
      stone: fx(`${id}-stonefx.png`, 64, 64, 32, STONEFX.ay, 2, { stone: { col: 0, n: STONEFX.n, fps: STONEFX.fps, loop: false, hit: STONEFX.hit } }),
    },
    skills: {
      scythe_arc: { waves: [wave(REAPER_SKILLS.scythe_arc)], fx: [] },
      grave_hands: { waves: [wave(REAPER_SKILLS.grave_hands)], fx: [{ fx: "hands", waves: [0], seq: ["hands"], pin: 0, timing: "strike", place: "marks" }] },
      gravestone: { waves: [wave(REAPER_SKILLS.gravestone)], fx: [{ fx: "stone", waves: [0], seq: ["stone"], pin: 0, timing: "strike", place: "marks" }] },
    },
  };
}
// ---- Рунолит (голем): кратер и брызги камня под танком, плиты кольцом и плита сверху, пульс рун по кольцу
{
  const id = "sol_rune_golem";
  M[id] = {
    sheet: `${id}-sheet.png`, cols: GOLEM_COLS, anims: anims(GOLEM_ANIMS),
    fx: {
      fist: fx(`${id}-fistfx.png`, 64, 64, 32, 46, 2, FIST_FX),
      slab: fx(`${id}-slabfx.png`, 64, 64, 32, 46, 2, SLAB_FX),
      pulse: fx(`${id}-pulsefx.png`, 64, 64, 32, 46, 2, PULSE_FX),
    },
    skills: {
      rune_fist: {
        waves: [wave(GOLEM_SKILLS.rune_fist)],
        fx: [
          { fx: "fist", waves: [0], seq: ["crater"], pin: 0, timing: "strike", place: "marks" },
          { fx: "fist", waves: [0], seq: ["burst"], pin: 0, timing: "strike", place: "ring", radius: "r", k: 0.7, count: 6 },
        ],
      },
      slab_cage: {
        waves: [wave(GOLEM_SKILLS.slab_cage), {}],
        fx: [
          { fx: "slab", waves: [0], seq: ["slabRise", "slabHold", "slabStrike"], pin: 2, timing: "wind", place: "ring", radius: "mid", spacing: 34 },
          { fx: "slab", waves: [1], seq: ["dropWarn", "dropFall"], pin: 1, timing: "wind", place: "marks" },
        ],
      },
      rune_pulse: { waves: [wave(GOLEM_SKILLS.rune_pulse)], fx: [{ fx: "pulse", waves: [0], seq: ["pulse"], pin: 0, timing: "strike", place: "ring", radius: "mid", spacing: 40 }] },
    },
  };
}
// ---- Мглогляд (древень-нежить): луч глаза по клину, мгла в метках, гнилые шишки, туман у ног и огоньки
{
  const id = "umb_fog_treant";
  const html = path.join(SRC, `${id}.html`);
  const eye = fs.existsSync(html) ? (JSON.parse(/const EYE = ([^;\n]*)/.exec(fs.readFileSync(html, "utf8"))?.[1] ?? "null") as { down: [number, number] } | null) : null;
  M[id] = {
    sheet: `${id}-sheet.png`, cols: FOG_TREANT_COLS, anims: anims(FOG_TREANT_ANIMS),
    fx: {
      beam: fx(`${id}-beamfx.png`, FOG_BEAMFX.frame[0], FOG_BEAMFX.frame[1], FOG_BEAMFX.origin[0], FOG_BEAMFX.origin[1], 3, { beam: { col: 0, n: FOG_BEAMFX.n, fps: FOG_BEAMFX.fps, loop: false, hit: FOG_BEAMFX.hit } }),
      miasma: fx(`${id}-miasmafx.png`, FOG_MIASMAFX.frame[0], FOG_MIASMAFX.frame[1], FOG_MIASMAFX.center[0], FOG_MIASMAFX.center[1], 2, FOG_MIASMAFX.anims),
      spore: fx(`${id}-sporefx.png`, FOG_SPOREFX.frame[0], FOG_SPOREFX.frame[1], FOG_SPOREFX.center[0], FOG_SPOREFX.center[1], 2, FOG_SPOREFX.anims),
    },
    skills: {
      gaze_beam: { waves: [wave(FOG_TREANT_SKILLS.gaze_beam)], fx: [{ fx: "beam", waves: [0], seq: ["beam"], pin: 0, timing: "strike", place: "beam" }] },
      miasma: { waves: [wave(FOG_TREANT_SKILLS.miasma)], fx: [{ fx: "miasma", waves: [0], seq: ["settle", "hold", "burst"], pin: 2, timing: "wind", place: "marks" }] },
      spore_rain: { waves: [wave(FOG_TREANT_SKILLS.spore_rain)], fx: [{ fx: "spore", waves: [0], seq: ["fall", "lie", "burst"], pin: 2, timing: "wind", place: "marks" }] },
    },
    eye: eye ? [eye.down[0] - 32, eye.down[1] - 60] : [0, -39],
    fog: { file: FOG_TREANT_FOG.sprite, wisp: FOG_TREANT_FOG.wisp, mote: FOG_TREANT_FOG.mote, wisps: FOG_TREANT_FOG.wisps, motes: FOG_TREANT_FOG.motes },
  };
}
// ---- Лютобор (зверь на цепях): удар цепей дугами по кругу и кольцу, приземление прыжка, борозды травли
{
  const id = "sol_chained_beast";
  const S = BEAST_SKILLS;
  M[id] = {
    sheet: `${id}-sheet.png`, cols: BEAST_COLS, anims: anims(BEAST_ANIMS),
    fx: {
      chain: fx(`${id}-chainfx.png`, 64, 64, 32, 44, 2, { slam: { col: 0, n: CHAINFX.n, fps: CHAINFX.fps, loop: false, hit: CHAINFX.hit } }),
      lunge: fx(`${id}-lungefx.png`, 64, 64, 32, 44, 2, { land: { col: 0, n: LUNGEFX.n, fps: LUNGEFX.fps, loop: false, hit: LUNGEFX.hit } }),
      hunt: fx(`${id}-huntfx.png`, 64, 64, 32, 44, 2, { claw: { col: 0, n: HUNTFX.n, fps: HUNTFX.fps, loop: false, hit: HUNTFX.hit } }),
    },
    skills: {
      chain_whirl: {
        waves: [wave(S.chain_whirl), { pre: [S.chain_whirl.then!.hold], strike: S.chain_whirl.then!.strike }],
        fx: [
          { fx: "chain", waves: [0], seq: ["slam"], pin: 0, timing: "strike", place: "arcs", radius: "r", spacing: CHAINFX.arc },
          { fx: "chain", waves: [1], seq: ["slam"], pin: 0, timing: "strike", place: "arcs", radius: "r2", spacing: CHAINFX.arc },
        ],
      },
      spike_lunge: { waves: [wave(S.spike_lunge)], fx: [{ fx: "lunge", waves: [0], seq: ["land"], pin: 0, timing: "strike", place: "marks" }] },
      hunt: {
        waves: (S.hunt.strikes ?? [S.hunt.strike]).map((st, i) => (i === 0 ? { pre: [...S.hunt.windup], strike: st } : { strike: st })),
        fx: [{ fx: "hunt", waves: [0, 1, 2], seq: ["claw"], pin: 0, timing: "strike", place: "marks" }],
      },
    },
  };
}
// ---- Тавр (минотавр): поджог на задетых, метки тарана по ряду, пепел по кругу и кольцам
{
  const id = "umb_ash_minotaur";
  const S = MINO_SKILLS;
  const ram = cards.bosses.find((b) => b.id === id)?.abilities.find((a) => a.id === "ram") as unknown as { count: number; stepMs: number } | undefined;
  M[id] = {
    sheet: `${id}-sheet.png`, cols: MINO_COLS, anims: anims(MINO_ANIMS),
    fx: {
      burn: fx(`${id}-burnfx.png`, 64, 64, 32, 44, 1, { burn: { col: 0, n: BURNFX.n, fps: BURNFX.fps, loop: true } }),
      ram: fx(`${id}-ramfx.png`, 64, 64, 32, 44, 2, { hoof: { col: 0, n: RAMFX.n, fps: RAMFX.fps, loop: false, hit: RAMFX.hit } }),
      ash: fx(`${id}-ashfx.png`, 64, 64, 32, 44, 2, { puff: { col: 0, n: ASHFX.n, fps: ASHFX.fps, loop: false, hit: ASHFX.hit } }),
    },
    burn: "burn",
    skills: {
      rune_axe: { waves: [wave(S.rune_axe), { pre: [...S.rune_axe.then!.windup], strike: S.rune_axe.then!.strike, turn: true }], fx: [] },
      ram: { waves: [{ pre: [...S.ram.windup], strike: S.ram.strike, hold: ram ? (ram.count - 1) * ram.stepMs + 120 : 480, post: [S.ram.after!] }], fx: [{ fx: "ram", waves: [0], seq: ["hoof"], pin: 0, timing: "strike", place: "marks" }] },
      ash_stomp: {
        waves: [wave(S.ash_stomp), {}, {}],
        fx: [
          { fx: "ash", waves: [0], seq: ["puff"], pin: 0, timing: "strike", place: "ring", radius: "inner", spacing: ASHFX.step },
          { fx: "ash", waves: [1, 2], seq: ["puff"], pin: 0, timing: "strike", place: "ring", radius: "mid", spacing: ASHFX.step },
        ],
      },
    },
  };
}
// ---- Многорот (поганище): пасти из топи в метках (вторая волна — шире), трупный газ по кольцу
{
  const id = "umb_marsh_abomination";
  const S = ABOM_SKILLS;
  M[id] = {
    sheet: `${id}-sheet.png`, cols: ABOM_COLS, anims: anims(ABOM_ANIMS),
    fx: {
      maw: fx(`${id}-mawfx.png`, MAWFX_FRAME, MAWFX_FRAME, 48, 60, 2, MAWFX_ANIMS),
      gas: fx(`${id}-gasfx.png`, 64, 64, 32, 52, 2, GASFX_ANIMS),
    },
    skills: {
      bite: { waves: [wave(S.bite), { pre: [...S.bite.then!.windup], strike: S.bite.then!.strike }], fx: [] },
      swamp_maws: {
        waves: [wave(S.swamp_maws), {}],
        fx: [
          { fx: "maw", waves: [0], seq: ["mawIn", "mawWide", "mawWideHold"], pin: 0, timing: "strike", place: "marks", holds: { mawWideHold: thenMs(id, "swamp_maws", 0) } },
          { fx: "maw", waves: [1], seq: ["mawWideSnap"], pin: 0, timing: "strike", place: "marks" },
        ],
      },
      corpse_gas: { waves: [wave(S.corpse_gas)], fx: [{ fx: "gas", waves: [0], seq: ["gasRise", "gasHold", "gasFade"], pin: 2, timing: "wind", place: "area", spacing: 64 }] },
    },
  };
}

// ---- запись
fs.mkdirSync(OUT, { recursive: true });
const size = (f: string) => { const p = PNG.sync.read(fs.readFileSync(f)); return [p.width, p.height]; };
let bad = 0;
const manifest: Record<string, Boss & { file: string }> = {};
for (const [id, b] of Object.entries(M)) {
  const src = path.join(SRC, b.sheet);
  if (!fs.existsSync(src)) { console.error(`${id}: нет листа ${b.sheet} — сначала npx tsx tools/gen/zone-bosses.ts art`); bad++; continue; }
  const [w, h] = size(src);
  if (w !== b.cols * 64 || h !== 192) { console.error(`${id}: лист ${w}×${h}, ждали ${b.cols * 64}×192`); bad++; }
  fs.copyFileSync(src, path.join(UNITS, `${id}.png`));
  for (const f of Object.values(b.fx)) {
    const p = path.join(SRC, f.file);
    if (!fs.existsSync(p)) { console.error(`${id}: нет эффекта ${f.file}`); bad++; continue; }
    const [fw, fh] = size(p);
    if (fh !== f.fh * f.rows || fw % f.fw) { console.error(`${id}: ${f.file} ${fw}×${fh} не делится на кадр ${f.fw}×${f.fh}×${f.rows}`); bad++; }
    fs.copyFileSync(p, path.join(OUT, f.file));
  }
  for (const extra of [(b.motes as { file?: string } | undefined)?.file, (b.fog as { file?: string } | undefined)?.file]) {
    if (!extra) continue;
    const p = path.join(SRC, extra);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(OUT, extra));
    else { console.error(`${id}: нет ${extra}`); bad++; }
  }
  // связки ссылаются только на свои анимации
  for (const [ab, s] of Object.entries(b.skills)) {
    for (const wv of s.waves) for (const a of [...(wv.pre ?? []), ...(wv.strike ? [wv.strike] : []), ...(wv.post ?? [])]) if (!b.anims[a]) { console.error(`${id}.${ab}: нет анимации ${a}`); bad++; }
    for (const u of s.fx) for (const a of u.seq) if (!b.fx[u.fx]?.anims[a]) { console.error(`${id}.${ab}: у эффекта ${u.fx} нет анимации ${a}`); bad++; }
  }
  const { sheet: _sheet, ...rest } = b;
  manifest[id] = { file: `${id}.png`, ...rest };
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ _doc: "Боссы стартовых земель (задача 136): каталог для client/src/game/zoneBoss.ts. Собирает tools/gen/zone-bosses-to-game.ts — руками не править.", bosses: manifest }, null, 1) + "\n");
console.log(`боссов: ${Object.keys(manifest).length}, ошибок: ${bad}; ${path.relative(ROOT, OUT)}`);
process.exitCode = bad ? 1 : 0;
