/** Нормализация эффектов умений из скачанных паков (задача 127, шаг 1). Только превью и листы: в игру ничего не кладётся.
 *  Запуск: tsx tools/gen/vfx.ts
 *  Пишет: tools/out/vfx/<id>.png (одна строка кадров одного размера), tools/out/vfx/vfx-manifest.json
 *         { id: { frameW, frameH, frames, fps, anchor, blend } },
 *         tools/out/vfx-preview/<пак>.png (раскадровки ×2) и compare-<пак>.png (наш герой на нашей земле рядом с пиком эффекта, ×3).
 *  Масштаб: 1 пиксель эффекта = 1 пиксель героя (герои 32×32), кадры не масштабируются.
 *  anchor — доля кадра (x, y), которая ставится в точку применения: центр тела цели, ноги/земля, точка удара на краю кадра.
 *  Кадры снарядов (proj) смотрят вправо; клиент поворачивает по углу выстрела. proj и aura — циклы, cast и hit — один проход. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PC, RAMPS, loadDir, sliceSheet, readPng, cropToAnchor, pickIdx, peakIndex, trimBlank, downscaleMode, tidy, unionBox, toRow, gradientMap, storyboard, stackV, scaleNN, fill, drawText,
  paintGround, BG, BEIGE, GOLD, type RGBA,
} from "./vfx-lib";
import { GENERATED } from "./vfx-gen";
import { GENERATED2 } from "./vfx-gen2";
import { GENERATED_HAMMER3 } from "./vfx-hammer3";
import { GENERATED_BANNER } from "./vfx-banner";
import { GENERATED_HAMMER } from "./vfx-hammer";
import { quakeSlam } from "./vfx-quake";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const OUT = path.join(ROOT, "tools/out/vfx");
export const PREVIEW = path.join(ROOT, "tools/out/vfx-preview");
const V = (pack: string, ...p: string[]) => path.join(ROOT, "vendor", `vfx-${pack}`, "src", ...p);
const FZ = (...p: string[]) => V("foozle-magic", "Foozle_2DE0001_Pixel_Magic_Effects", ...p);

export type Role = "proj" | "hit" | "cast" | "aura" | "aoe" | "slash";
export type Blend = "normal" | "add";
interface Def {
  id: string; pack: string; role: Role;
  load: () => PC[];
  /** Диапазон кадров исходника (включительно). */
  from?: number; to?: number;
  anchor: [number, number]; fps: number; blend: Blend;
  /** Рампа стихии из vfx-lib (RAMPS); без неё остаётся палитра автора. */
  ramp?: string; gamma?: number;
  /** Прореживание длинной анимации до n кадров (fps пересчитывается, длительность сохраняется). */
  thin?: number;
  hero?: string;
  /** Кадр-пик для превью (с 0), если по числу пикселей выбирается неудачный. */
  peak?: number;
}

const sds = (name: string) => () => loadDir(V("sds-holy", name, "Frames"));
const fz = (name: string) => () => loadDir(FZ(name));
/** Есть ли скачанный пак (vendor/ в .gitignore: без него эти эффекты просто пропускаются). */
const hasPack = (pack: string) => fs.existsSync(V(pack));
/** Лист-лента или сетка: путь внутри src пака, размер кадра. */
const sh = (pack: string, rel: string, fw: number, fh = fw) => () => sliceSheet(readPng(V(pack, ...rel.split("/"))), fw, fh);
const SDSX = "Pixel Explosion Effects Pack 01 v1_1";
const NJ = (...p: string[]) => path.join("Ninja Adventure - Asset Pack", "FX", ...p);
const sheet48 = (pack: string, dir: string, file: string) => () => sliceSheet(readPng(V(pack, dir, file)), 48, 48);

const BASE: Def[] = [
  // ---- Pixel Holy Effects Pack 01 (Sentient Dream Studio), кадры 64×64, ~10 fps ----
  { id: "holy-heal", pack: "sds-holy", role: "aura", load: sds("Heal"), anchor: [0.5, 0.55], fps: 10, blend: "add", ramp: "holy", hero: "healer" },
  { id: "holy-fury", pack: "sds-holy", role: "hit", load: sds("HeavensFury"), peak: 5, anchor: [0.5, 0.8], fps: 12, blend: "add", ramp: "holy", hero: "warrior" },
  { id: "holy-nova", pack: "sds-holy", role: "aoe", load: sds("HolyNova"), anchor: [0.5, 0.5], fps: 12, blend: "add", ramp: "holy", hero: "healer" },
  { id: "holy-shield", pack: "sds-holy", role: "aura", load: sds("HolyShield"), anchor: [0.5, 0.5], fps: 11, blend: "normal", ramp: "holy", hero: "warrior" },
  { id: "holy-slash-a", pack: "sds-holy", role: "slash", load: sds("HolySlash_A"), anchor: [0.5, 0.5], fps: 20, blend: "normal", ramp: "holy", hero: "warrior" },
  { id: "holy-slash-b", pack: "sds-holy", role: "slash", load: sds("HolySlash_B"), anchor: [0.5, 0.5], fps: 20, blend: "normal", ramp: "holy", hero: "warrior" },
  { id: "holy-slash-c", pack: "sds-holy", role: "slash", load: sds("HolySlash_C"), anchor: [0.5, 0.5], fps: 18, blend: "normal", ramp: "holy", hero: "warrior" },
  { id: "holy-smite", pack: "sds-holy", role: "hit", load: sds("Smite"), anchor: [0.5, 0.5], fps: 14, blend: "add", ramp: "holy", hero: "healer" },
  { id: "holy-sword", pack: "sds-holy", role: "hit", load: sds("SwordOfJustice"), peak: 6, anchor: [0.5, 0.9], fps: 12, blend: "normal", ramp: "holy", hero: "warrior" },
  // ---- Pixel Magic Effects (Foozle, CC0), кадры 64×64; снаряд и удар лежат в одном файле — режем на два эффекта ----
  { id: "fire-ball", pack: "foozle-magic", role: "proj", load: fz("Fire_Ball"), from: 0, to: 4, anchor: [0.6, 0.5], fps: 14, blend: "normal", ramp: "fire" },
  { id: "fire-ball-hit", pack: "foozle-magic", role: "hit", load: fz("Fire_Ball"), from: 5, to: 9, anchor: [0.6, 0.5], fps: 14, blend: "normal", ramp: "fire" },
  { id: "explosion", pack: "foozle-magic", role: "hit", load: fz("Explosion"), anchor: [0.5, 0.5], fps: 16, blend: "normal" },
  { id: "water-ball", pack: "foozle-magic", role: "proj", load: fz("Water"), from: 0, to: 4, anchor: [0.6, 0.5], fps: 12, blend: "normal" },
  { id: "water-splash", pack: "foozle-magic", role: "hit", load: fz("Water"), from: 5, to: 9, anchor: [1, 0.5], fps: 14, blend: "normal" },
  { id: "wind-slash", pack: "foozle-magic", role: "proj", load: fz("Wind"), from: 0, to: 4, anchor: [0.6, 0.5], fps: 14, blend: "normal" },
  { id: "wind-hit", pack: "foozle-magic", role: "hit", load: fz("Wind"), from: 6, to: 9, anchor: [1, 0.5], fps: 14, blend: "normal" },
  { id: "rocks", pack: "foozle-magic", role: "proj", load: fz("Rocks"), from: 0, to: 5, anchor: [0.55, 0.5], fps: 12, blend: "normal" },
  { id: "rocks-hit", pack: "foozle-magic", role: "hit", load: fz("Rocks"), from: 6, to: 9, anchor: [1, 0.5], fps: 14, blend: "normal" },
  { id: "portal", pack: "foozle-magic", role: "aura", load: fz("Portal"), from: 0, to: 4, anchor: [0.5, 0.5], fps: 10, blend: "normal", hero: "mage" },
  { id: "portal-open", pack: "foozle-magic", role: "cast", load: fz("Portal"), from: 6, to: 9, anchor: [0.5, 0.5], fps: 12, blend: "normal", hero: "mage" },
  { id: "lava-spear", pack: "foozle-magic", role: "hit", load: fz("Molten_Spear"), anchor: [0.5, 0.97], fps: 14, blend: "normal", hero: "mage" },
  { id: "earth-spike", pack: "foozle-magic", role: "aoe", load: fz("Earth_Spike"), anchor: [0.5, 0.97], fps: 14, blend: "normal", hero: "warrior" },
  { id: "geyser", pack: "foozle-magic", role: "aoe", load: fz("Water_Geyser"), from: 3, to: 10, anchor: [0.5, 0.95], fps: 14, blend: "normal", hero: "healer" },
  { id: "tornado", pack: "foozle-magic", role: "aoe", load: fz("Tornado"), anchor: [0.5, 0.95], fps: 12, blend: "normal", hero: "rogue" },
  // ---- Dark VFX 01–02 (pimen) ----
  { id: "dark-bolt", pack: "pimen-dark", role: "proj", load: () => loadDir(V("pimen-dark", "Dark VFX 1", "Separeted frames")), from: 0, to: 9, anchor: [0.6, 0.5], fps: 16, blend: "normal", ramp: "shadow", gamma: 1.7, hero: "darkranger" },
  { id: "dark-bolt-hit", pack: "pimen-dark", role: "hit", load: () => loadDir(V("pimen-dark", "Dark VFX 1", "Separeted frames")), from: 10, to: 16, anchor: [0.45, 0.5], fps: 16, blend: "normal", ramp: "shadow", gamma: 1.7, hero: "darkranger" },
  { id: "dark-wraith", pack: "pimen-dark", role: "aura", load: () => loadDir(V("pimen-dark", "Dark VFX 2", "Separated Frames")), anchor: [0.5, 0.8], fps: 10, blend: "normal", ramp: "shadow", gamma: 1.7, thin: 11, hero: "warlock" },
  // ---- Smear VFX 01 и Hit Effect 01 (pimen): 48×48 ----
  { id: "smear-h-steel", pack: "pimen-smear", role: "slash", load: sheet48("pimen-smear", "Smear VFX 01", "Smear 01 Horizontal 1.png"), anchor: [0.5, 0.5], fps: 24, blend: "normal", hero: "warrior" },
  { id: "smear-h-fire", pack: "pimen-smear", role: "slash", load: sheet48("pimen-smear", "Smear VFX 01", "Smear 01 Horizontal 2.png"), anchor: [0.5, 0.5], fps: 24, blend: "normal", hero: "warrior" },
  { id: "smear-h-poison", pack: "pimen-smear", role: "slash", load: sheet48("pimen-smear", "Smear VFX 01", "Smear 01 Horizontal 3.png"), anchor: [0.5, 0.5], fps: 24, blend: "normal", hero: "rogue" },
  { id: "smear-v-steel", pack: "pimen-smear", role: "slash", load: sheet48("pimen-smear", "Smear VFX 01", "Smear 01 Vertical 01.png"), anchor: [0.5, 0.5], fps: 24, blend: "normal", hero: "warrior" },
  { id: "smear-v-fire", pack: "pimen-smear", role: "slash", load: sheet48("pimen-smear", "Smear VFX 01", "Smear 01 Vertical 02.png"), anchor: [0.5, 0.5], fps: 24, blend: "normal", hero: "warrior" },
  { id: "smear-v-poison", pack: "pimen-smear", role: "slash", load: sheet48("pimen-smear", "Smear VFX 01", "Smear 01 Vertical 03.png"), anchor: [0.5, 0.5], fps: 24, blend: "normal", hero: "rogue" },
  { id: "hit-fire", pack: "pimen-hit", role: "hit", load: sheet48("pimen-hit", "Hit Effect 01", "Hit Effect 01 1.png"), anchor: [0.5, 0.5], fps: 20, blend: "normal", hero: "warrior" },
  { id: "hit-frost", pack: "pimen-hit", role: "hit", load: sheet48("pimen-hit", "Hit Effect 01", "Hit Effect 01 2.png"), anchor: [0.5, 0.5], fps: 20, blend: "normal", hero: "mage" },
  { id: "hit-poison", pack: "pimen-hit", role: "hit", load: sheet48("pimen-hit", "Hit Effect 01", "Hit Effect 01 3.png"), anchor: [0.5, 0.5], fps: 20, blend: "normal", hero: "rogue" },
  // ---- шаг 2: закрытие пробелов бесплатными паками ----
  // Sentient Dream Studio: Poison Attacks (64×64)
  { id: "poison-skull", pack: "sds-poison", role: "hit", load: sh("sds-poison", "Poison Spells minipack/Spritesheets/PoisonMagicEffect_spritesheet.png", 64), anchor: [0.5, 0.6], fps: 12, blend: "normal", hero: "rogue" },
  { id: "poison-slash", pack: "sds-poison", role: "slash", load: sh("sds-poison", "Poison Spells minipack/Spritesheets/PoisonSlashEffect_spritesheet.png", 64), anchor: [0.5, 0.5], fps: 18, blend: "normal", hero: "rogue" },
  { id: "poison-ball", pack: "sds-poison", role: "proj", load: sh("sds-poison", "Poison Spells minipack/Spritesheets/PoisonProjectile_spritesheets/PoisonProjectile_flying_spritesheet.png", 64), anchor: [0.5, 0.5], fps: 12, blend: "normal", hero: "rogue" },
  { id: "poison-ball-hit", pack: "sds-poison", role: "hit", load: sh("sds-poison", "Poison Spells minipack/Spritesheets/PoisonProjectile_spritesheets/PoisonProjectile_fading_spritesheet.png", 64), anchor: [0.5, 0.5], fps: 12, blend: "normal", hero: "rogue" },
  // Sentient Dream Studio: Explosion Pack 01
  { id: "expl-large", pack: "sds-expl", role: "hit", load: sh("sds-expl", `${SDSX}/LargeExplosionA/Spritesheet/LargeExplosionA_spritesheet.png`, 64), anchor: [0.5, 0.5], fps: 16, blend: "normal", thin: 12, hero: "mage" },
  { id: "expl-column", pack: "sds-expl", role: "aoe", load: sh("sds-expl", `${SDSX}/LargeExplosionB/Spritesheet/LargeExplosionB_spritesheet.png`, 64, 128), anchor: [0.5, 0.92], fps: 14, blend: "normal", thin: 12, hero: "mage" },
  { id: "expl-dust", pack: "sds-expl", role: "hit", load: sh("sds-expl", `${SDSX}/DustExplosion/Spritesheet/DustExplosion_spritesheet.png`, 64), anchor: [0.5, 0.65], fps: 14, blend: "normal", hero: "warrior" },
  { id: "expl-blue", pack: "sds-expl", role: "hit", load: sh("sds-expl", `${SDSX}/BlueExplosionB/Spritesheet/BlueExplosionB_spritesheet.png`, 64), anchor: [0.5, 0.5], fps: 16, blend: "normal", ramp: "arcane", gamma: 1.3, hero: "mage" },
  // Sentient Dream Studio: Level Up и Dark Spells (крупные AoE, щупальца для пут)
  { id: "levelup", pack: "sds-levelup", role: "cast", load: sh("sds-levelup", "Level Up Effect/Spritesheet/Level Up Effect Spritesheet.png", 128), anchor: [0.5, 0.85], fps: 12, blend: "normal", ramp: "holy", hero: "warrior" },
  { id: "dark-tentacles", pack: "sds-dark", role: "aoe", load: sh("sds-dark", "DarkSpells/DarkSpell_02/DarkSpell_02_spritesheet.png", 128), anchor: [0.5, 0.9], fps: 14, blend: "normal", ramp: "shadow", gamma: 1.4, thin: 12, hero: "darkranger" },
  // pimen: молнии (без размытия), лёд, дым
  { id: "bolt-proj", pack: "pimen-thunder1", role: "proj", load: sh("pimen-thunder1", "Thunder Effect 01/Thunder Projectile 1/Thunder projectile1 wo blur.png", 32), anchor: [0.5, 0.5], fps: 16, blend: "add", ramp: "bolt", gamma: 2, hero: "mage" },
  { id: "bolt-hit", pack: "pimen-thunder1", role: "hit", load: sh("pimen-thunder1", "Thunder Effect 01/Thunder Hit/Thunder hit wo blur.png", 32), anchor: [0.5, 0.5], fps: 16, blend: "add", ramp: "bolt", gamma: 2, hero: "mage" },
  { id: "bolt-strike", pack: "pimen-thunder2", role: "hit", load: sh("pimen-thunder2", "Thunder Effect 02/Thunder Strike/Thunderstrike wo blur.png", 64), anchor: [0.5, 0.97], fps: 16, blend: "add", ramp: "bolt", gamma: 2, hero: "mage" },
  { id: "bolt-splash", pack: "pimen-thunder2", role: "hit", load: sh("pimen-thunder2", "Thunder Effect 02/Thunder Splash/Thunder splash wo blur.png", 48), anchor: [0.5, 0.97], fps: 16, blend: "add", ramp: "bolt", gamma: 2, thin: 11, hero: "mage" },
  { id: "ice-bolt", pack: "pimen-ice", role: "proj", load: sh("pimen-ice", "Ice Effect 01/Ice VFX 1/IceVFX 1 Repeatable.png", 48, 32), anchor: [0.6, 0.5], fps: 16, blend: "normal", hero: "deathknight" },
  { id: "ice-bolt-hit", pack: "pimen-ice", role: "hit", load: sh("pimen-ice", "Ice Effect 01/Ice VFX 1/Ice VFX 1 Hit.png", 48, 32), anchor: [0.5, 0.5], fps: 16, blend: "normal", hero: "deathknight" },
  { id: "ice-crystal", pack: "pimen-ice", role: "aoe", load: () => [...sh("pimen-ice", "Ice Effect 01/Ice VFX 2/Ice VFX 2 Start.png", 32)(), ...sh("pimen-ice", "Ice Effect 01/Ice VFX 2/Ice VFX 2 Active.png", 32)()], anchor: [0.5, 0.9], fps: 14, blend: "normal", thin: 12, hero: "deathknight" },
  { id: "smoke-puff", pack: "pimen-smoke", role: "cast", load: sh("pimen-smoke", "Smoke Effect 01/Smoke VFX 2.png", 64), anchor: [0.5, 0.6], fps: 12, blend: "normal", hero: "rogue" },
  { id: "fog-loop", pack: "pimen-smoke", role: "aura", load: sh("pimen-smoke", "Smoke Effect 01/Smoke VFX 2.png", 64), from: 2, to: 6, anchor: [0.5, 0.6], fps: 6, blend: "normal", hero: "rogue" },
  // ImpactForge: дуга клинка (64×64, 9 кадров)
  { id: "blade-steel", pack: "impactforge", role: "slash", load: sh("impactforge", "Spritesheets/slash.png", 64), anchor: [0.5, 0.5], fps: 22, blend: "normal", hero: "warrior" },
  { id: "blade-dark", pack: "impactforge", role: "slash", load: sh("impactforge", "Spritesheets/slash_dark-Sheet.png", 64), anchor: [0.5, 0.5], fps: 22, blend: "normal", hero: "deathknight" },
  { id: "blade-fire", pack: "impactforge", role: "slash", load: sh("impactforge", "Spritesheets/slash_fire-Sheet.png", 64), anchor: [0.5, 0.5], fps: 22, blend: "normal", hero: "warrior" },
  { id: "blade-ice", pack: "impactforge", role: "slash", load: sh("impactforge", "Spritesheets/slash_ice-Sheet.png", 64), anchor: [0.5, 0.5], fps: 22, blend: "normal", hero: "deathknight" },
  // Ninja Adventure (CC0): метательная звезда 16×16, два кадра вращения
  { id: "knife-spin", pack: "ninja", role: "proj", load: sh("ninja", NJ("Projectile", "Shuriken.png"), 16), anchor: [0.5, 0.5], fps: 14, blend: "normal", hero: "rogue" },
];

/** Перекрашенные копии: [новый id, исходный id, рампа, поправки]. Кровь, тьма и яд делаются из подходящих по форме эффектов. */
const VARIANTS: [string, string, string, Partial<Def>?][] = [
  ["nova-frost", "holy-nova", "frost"], ["nova-arcane", "holy-nova", "arcane"], ["nova-shadow", "holy-nova", "shadow"], ["nova-blood", "holy-nova", "blood"],
  ["shield-steel", "holy-shield", "steel"], ["shield-arcane", "holy-shield", "arcane"], ["shield-bone", "holy-shield", "bone"],
  ["heal-blood", "holy-heal", "blood"], ["heal-nature", "holy-heal", "nature"],
  ["slash-shadow", "holy-slash-c", "shadow"], ["slash-blood", "holy-slash-b", "blood"],
  ["blood-ball", "fire-ball", "blood"], ["blood-ball-hit", "fire-ball-hit", "blood"],
  ["frost-ball", "water-ball", "frost"], ["frost-splash", "water-splash", "frost"],
  ["axe-blood", "wind-slash", "blood"], ["axe-blood-hit", "wind-hit", "blood"],
  ["explosion-blood", "explosion", "blood", { gamma: 1.6 }], ["explosion-shadow", "explosion", "shadow", { gamma: 1.6 }], ["explosion-poison", "explosion", "poison", { gamma: 1.6 }],
  ["geyser-blood", "geyser", "blood"], ["tornado-blood", "tornado", "blood"], ["tornado-shadow", "tornado", "shadow"],
  ["bone-spikes", "earth-spike", "bone"], ["ice-spikes", "earth-spike", "frost"],
  ["portal-shadow", "portal", "shadow"], ["portal-open-shadow", "portal-open", "shadow"], ["portal-open-nature", "portal-open", "nature"],
  ["smear-h-blood", "smear-h-steel", "blood"], ["smear-v-blood", "smear-v-steel", "blood"],
  ["smear-h-frost", "smear-h-steel", "frost"], ["smear-v-frost", "smear-v-steel", "frost"], ["smear-h-shadow", "smear-h-steel", "shadow"],
  ["hit-blood", "hit-fire", "blood"], ["hit-shadow", "hit-frost", "shadow"], ["hit-holy", "hit-fire", "holy"],
  // шаг 2
  ["blade-blood", "blade-steel", "blood", { gamma: 2.3 }], ["blade-poison", "blade-steel", "poison", { gamma: 2 }], ["blade-shadow", "blade-steel", "shadow", { gamma: 2 }],
  ["expl-large-blood", "expl-large", "blood", { gamma: 1.5 }], ["expl-large-shadow", "expl-large", "shadow", { gamma: 1.5 }],
  ["puff-shadow", "smoke-puff", "veil", { gamma: 1.1 }], ["puff-poison", "smoke-puff", "bog", { gamma: 1.1 }], ["puff-smoke", "smoke-puff", "smoke", { gamma: 1.2 }],
  ["fog-shadow", "fog-loop", "veil", { gamma: 1.1 }], ["fog-poison", "fog-loop", "bog", { gamma: 1.1 }], ["fog-smoke", "fog-loop", "smoke", { gamma: 1.2 }],
  ["ice-crystal-bone", "ice-crystal", "bone"],
  ["holy-nova-s", "holy-nova", "holy"], ["nova-shadow-s", "holy-nova", "shadow"], ["portal-nature", "portal", "nature"],
];

/** Все id эффектов, которые умеет собрать конвейер (для проверки data/skill-fx.json без vendor/). */
export function knownIds(): Set<string> {
  return new Set([...BASE.map((d) => d.id), ...VARIANTS.map((v) => v[0]), ...GENERATED().map((g) => g.id), ...GENERATED2().map((g) => g.id), ...GENERATED_BANNER().map((g) => g.id), ...GENERATED_HAMMER().map((g) => g.id), ...GENERATED_HAMMER3().map((g) => g.id), "quake-slam", "portal-hold", "portal-hold-shadow", "portal-hold-nature"]);
}

/** Плавность: появление (fadeIn, мс; масштаб от scaleIn до 1), удержание (цикл кадров loop, hold мс для вызовов без длительности),
 *  выход (fadeOut). Кадры после loop[1] — финал, он играется при выходе. */
export interface Ease { drop?: number; dust?: string; alpha?: number; fadeIn?: number; fadeOut?: number; scaleIn?: number; loop?: [number, number]; hold?: number }

export interface Built { ease?: Ease; id: string; pack: string; role: Role; frames: PC[]; w: number; h: number; anchor: [number, number]; fps: number; blend: Blend; hero?: string; peak: number }

/** Целевой размер эффекта относительно героя (32×32, фигура ~26–28 px): длинная сторона кадра, px. Снаряды 14–26 (голова не больше половины героя),
 *  попадания 24–44, ауры и щиты 36–48, небесные удары 56 (1,5–2 роста героя). Лист уменьшается заранее при сборке: по блокам преобладающего цвета и
 *  чистка одиночных пикселей (как деревья в vendor.ts), дробного масштаба спрайтов в игре нет. Площадные эффекты (круги, взрывы, шипы, дождь стрел)
 *  остаются нативными, а увеличиваются целым ×2 по радиусу умения: в skill-fx.json id получает суффикс @2 (tools/gen/skill-fx-fit.ts). */
export const FIT: Record<string, number> = {
  "fire-ball": 26, "fire-ball-hit": 30, "blood-ball": 26, "blood-ball-hit": 30, "dark-bolt": 24, "dark-bolt-hit": 30, "ice-bolt": 24, "ice-bolt-hit": 32,
  "bolt-proj": 24, "bolt-hit": 32, "bolt-strike": 56, "bolt-splash": 48, "axe-spin": 16, "axe-spin-blood": 16, "knife-spin": 14, "raven-fly": 22,
  "chain-steel": 16, "chain-shadow": 16, "poison-ball": 16, "poison-ball-hit": 32,
  "hit-fire": 32, "hit-frost": 32, "hit-poison": 32, "hit-blood": 32, "hit-shadow": 32, "hit-holy": 32,
  "explosion": 40, "explosion-blood": 40, "explosion-shadow": 40, "explosion-poison": 40, "expl-large-shadow": 44, "expl-dust": 40, "expl-blue": 40,
  "holy-smite": 36, "holy-heal": 44, "heal-blood": 44, "heal-nature": 44, "poison-skull": 40, "poison-slash": 40,
  "blade-steel": 40, "blade-dark": 40, "blade-ice": 40, "blade-fire": 40, "blade-blood": 40, "blade-poison": 40, "blade-shadow": 40,
  "blood-splash": 32, "blood-splash-b": 32, "axe-blood-hit": 24, "geyser-blood": 44, "dark-wraith": 48, "dark-tentacles": 56,
  "shackle-steel": 40, "shackle-shadow": 40, "puff-shadow": 44, "puff-poison": 44, "puff-smoke": 44, "fog-loop": 44, "fog-shadow": 44, "fog-poison": 44, "fog-smoke": 44, "blood-pool": 52,
  "bubble-steel": 44, "bubble-arcane": 44, "bubble-holy": 44, "bubble-bone": 44, "bubble-shadow": 44,
  "banner-holy": 40, "banner-blood": 40, "ring-blood": 44, "ring-holy": 44, "ring-frost": 44, "ring-shadow": 44, "ring-arcane": 44,
  "tornado-blood": 48, "tornado-shadow": 48, "flame-loop": 36, "aura-rage": 44, "aura-runes-holy": 44, "aura-runes-frost": 56, "aura-runes-frost-back": 56,
  "holy-fury": 56, "holy-nova-s": 56, "nova-shadow-s": 72, "summon-circle-nature": 64, "portal-hold": 36, "portal-hold-shadow": 36, "portal-hold-nature": 36,
};

/** Уменьшение кадров до длинной стороны target (только вниз: вверх целым ×2 делает scale2). */
function rescale(b: Built, target: number): Built {
  const r = target / Math.max(b.w, b.h);
  if (r > 0.97) return b;
  const w2 = Math.max(4, Math.round(b.w * r)), h2 = Math.max(4, Math.round(b.h * r));
  const frames = b.frames.map((f) => tidy(downscaleMode(f, w2, h2, 0.34), 1));
  return { ...b, frames, w: w2, h: h2, anchor: [Math.round(b.anchor[0] * w2) / w2, Math.round(b.anchor[1] * h2) / h2] };
}
const scale2 = (b: Built): Built => ({ ...b, id: `${b.id}@2`, frames: b.frames.map((f) => scaleNN(f, 2)), w: b.w * 2, h: b.h * 2 });
const fitted = (b: Built): Built => (FIT[b.id] ? rescale(b, FIT[b.id]) : b);

/** Плавность по виду эффекта: ауры и щиты входят и выходят, круги призыва держатся и тают, портал открывается, держится и закрывается. */
function easeOf(id: string): Ease | undefined {
  if (/^summon-circle/.test(id)) return { fadeIn: 200, fadeOut: 320, scaleIn: 0.8, loop: [4, 6], hold: 1400 };
  // облака и лужи: полупрозрачные, входят и гаснут плавно (герои видны сквозь них)
  if (/^(fog-)/.test(id)) return { alpha: 0.6, fadeIn: 500, fadeOut: 600, scaleIn: 0.85 };
  if (/^(puff-|smoke-puff)/.test(id)) return { alpha: 0.65, fadeIn: 120, fadeOut: 300 };
  if (/^blood-pool/.test(id)) return { alpha: 0.55, fadeIn: 400, fadeOut: 500, scaleIn: 0.85 };
  // штандарт: падает сверху с пружинящим ударом и пылью (drop, px), гаснет за 300 мс; кольцо ауры мягко входит
  if (/^banner-(solgard|umbrath)$/.test(id)) return { fadeOut: 300, drop: 72, dust: "dust-puff" };
  if (/^banner-ring/.test(id)) return { alpha: 0.9, fadeIn: 400, fadeOut: 300 };
  if (/^(bubble-|ring-|aura-|banner-|flame-|tornado|holy-heal|heal-)/.test(id)) return { fadeIn: 220, fadeOut: 260, scaleIn: 0.7 };
  return undefined;
}

function build(d: Def): Built {
  let src = d.load();
  const fw = src[0].w, fh = src[0].h;
  src = src.slice(d.from ?? 0, (d.to ?? src.length - 1) + 1);
  src = trimBlank(src, d.from === undefined);
  let fps = d.fps;
  if (d.thin && d.thin < src.length) { const n = src.length; src = pickIdx(n, d.thin).map((i) => src[i]); fps = Math.max(4, Math.round((fps * d.thin) / n)); }
  if (d.ramp) src = gradientMap(src, RAMPS[d.ramp], d.gamma ?? 1);
  let ax = Math.round(d.anchor[0] * fw), ay = Math.round(d.anchor[1] * fh);
  if (/^(holy-nova|nova-|fog-|puff-|smoke-puff)/.test(d.id)) {
    // кольцо нарисовано в кадре не по центру (SDS HolyNova: центр ≈ 0.7 высоты): якорь — центр самого широкого кадра, чтобы кольцо встало ровно под ноги
    const box = unionBox([src[peakIndex(src)]]);
    if (box) { ax = Math.round((box[0] + box[2]) / 2); ay = Math.round((box[1] + box[3]) / 2); }
  }
  const norm = cropToAnchor(src, ax, ay, fw, fh);
  return fitted({ id: d.id, pack: d.pack, role: d.role, frames: norm.frames, w: norm.w, h: norm.h, anchor: norm.anchor, fps, blend: d.blend, hero: d.hero, peak: Math.min(d.peak ?? peakIndex(norm.frames), norm.frames.length - 1) });
}

export function buildAll(): Built[] {
  const defs = new Map<string, Def>(BASE.map((d) => [d.id, d]));
  const out: Built[] = [];
  const missing = new Set<string>();
  for (const d of BASE) { if (hasPack(d.pack)) out.push(build(d)); else missing.add(d.pack); }
  if (missing.size) console.log(`нет vendor-паков (эффекты пропущены): ${[...missing].join(", ")}`);
  for (const [id, base, ramp, over] of VARIANTS) {
    const b = defs.get(base)!;
    if (!hasPack(b.pack)) continue;
    const nd: Def = { ...b, ...over, id, ramp };
    defs.set(id, nd);
    out.push(build(nd));
  }
  for (const g of [...GENERATED(), ...GENERATED2(), ...GENERATED_BANNER(), ...GENERATED_HAMMER(), ...GENERATED_HAMMER3(), quakeSlam()]) out.push(fitted({ ...g, peak: peakIndex(g.frames) }));
  // портал: открытие, удержание (цикл вихря), закрытие (открытие в обратном порядке)
  const byId = new Map(out.map((b) => [b.id, b]));
  for (const [id, openId, loopId] of [["portal-hold", "portal-open", "portal"], ["portal-hold-shadow", "portal-open-shadow", "portal-shadow"], ["portal-hold-nature", "portal-open-nature", "portal-nature"]]) {
    const open = byId.get(openId), loop = byId.get(loopId);
    if (!open || !loop) continue;
    const W = Math.max(open.w, loop.w), H = Math.max(open.h, loop.h);
    const pad = (b: Built) => b.frames.map((f) => { const o = new PC(W, H); o.blit(f, Math.floor((W - b.w) / 2), Math.floor((H - b.h) / 2)); return o; });
    const o = pad(open), l = pad(loop);
    out.push(fitted({ id, pack: open.pack, role: "cast", frames: [...o, ...l, ...[...o].reverse()], w: W, h: H, anchor: [0.5, 0.5], fps: 11, blend: "normal", hero: "mage", peak: o.length + 1,
      ease: { fadeIn: 220, fadeOut: 240, scaleIn: 0.6, loop: [o.length, o.length + l.length - 1], hold: 900 } }));
  }
  // суффикс @2 в data/skill-fx.json: целое увеличение ×2 для площадных эффектов (радиус умения)
  try {
    const table = JSON.parse(fs.readFileSync(path.join(ROOT, "data/skill-fx.json"), "utf8")) as Record<string, Record<string, string>>;
    const need = new Set(Object.values(table).flatMap((sl) => Object.values(sl)).filter((v) => v.endsWith("@2")).map((v) => v.slice(0, -2)));
    for (const b of [...out]) if (need.has(b.id)) out.push(scale2(b));
  } catch { /* таблицы ещё нет */ }
  for (const b of out) if (!b.ease) b.ease = easeOf(b.id);
  return out;
}

// ---------- превью «герой на земле рядом с пиком эффекта» ----------
const HERO_DIR = path.join(ROOT, "client/public/assets/units");
const heroCache = new Map<string, PC>();
function hero(name: string): PC {
  let h = heroCache.get(name);
  if (!h) { const sh = readPng(path.join(HERO_DIR, `${name}.png`)); const f = new PC(32, 32); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) f.set(x, y, sh.get(x, y)!); h = f; heroCache.set(name, h); }
  return h;
}
const HERO_FOR: Record<Role, string> = { proj: "mage", hit: "warrior", cast: "mage", aura: "healer", aoe: "warrior", slash: "warrior" };
const SCALE = 3;

interface Cell { b: Built; x: number; y: number; w: number; h: number; hx: number; hy: number; ex: number; ey: number }

/** Раскладка: герой в начале координат ячейки; эффект ставится якорем в центр тела (или к ногам, если якорь у нижнего края); снаряд — на 26 пикселей правее. */
function layoutCell(b: Built): Cell {
  const feet = b.anchor[1] > 0.85 || b.role === "aoe";
  const tx = 16 + (b.role === "proj" ? 30 : 0), ty = feet ? 31 : 17;
  const ex = Math.round(tx - b.anchor[0] * b.w), ey = Math.round(ty - b.anchor[1] * b.h);
  const x0 = Math.min(0, ex) - 6, y0 = Math.min(0, ey) - 6, x1 = Math.max(32, ex + b.w) + 6, y1 = Math.max(32, ey + b.h) + 8;
  return { b, x: 0, y: 0, w: x1 - x0, h: y1 - y0, hx: -x0, hy: -y0, ex: ex - x0, ey: ey - y0 };
}

function comparePanel(cells: Cell[], width: number, ground: string): PC {
  // полочная укладка
  let x = 0, y = 0, rowH = 0;
  for (const c of cells) {
    if (x + c.w > width) { x = 0; y += rowH; rowH = 0; }
    c.x = x; c.y = y; x += c.w; rowH = Math.max(rowH, c.h);
  }
  const H = y + rowH;
  const pc = new PC(width, H);
  paintGround(pc, 0, 0, width, H, ground);
  for (const c of cells) {
    const hs = hero(c.b.hero ?? HERO_FOR[c.b.role]);
    pc.blit(hs, c.x + c.hx, c.y + c.hy);
    const f = c.b.frames[c.b.peak];
    pc.blit(f, c.x + c.ex, c.y + c.ey);
  }
  const big = scaleNN(pc, SCALE);
  for (const c of cells) {
    const label = `${c.b.id} ${c.b.peak + 1}/${c.b.frames.length}`;
    // подпись на плашке в левом нижнем углу ячейки
    const lx = c.x * SCALE + 3, ly = (c.y + c.h) * SCALE - 9;
    big.rect(lx - 1, ly - 1, label.length * 4 + 1, 7, [18, 15, 22, 230]);
    drawText(big, label, lx, ly, BEIGE);
  }
  return big;
}

function compareSheet(items: Built[]): PC {
  const W = 190;
  const cells = items.map(layoutCell);
  const left = comparePanel(cells.map((c) => ({ ...c })), W, "cobble");
  const right = comparePanel(cells.map((c) => ({ ...c })), W, "grass");
  const out = new PC(left.w + right.w + SCALE, Math.max(left.h, right.h)); fill(out, BG);
  out.blit(left, 0, 0); out.blit(right, left.w + SCALE, 0);
  return out;
}

/** Паки с лицензией «файлы раздавать нельзя» (Sentient, pimen, ImpactForge): их листы кладутся в vfx/r/, каталог в .gitignore. */
const isRestricted = (pack: string) => /^(sds-|pimen-|impactforge)/.test(pack);

export interface GameEntry { frameW: number; frameH: number; frames: number; fps: number; anchor: [number, number]; blend: Blend; r?: 1; ease?: Ease }

/** Листы и манифест для игры: client/public/assets/vfx/ (+ r/ для закрытых паков). Вызывается из tools/gen-assets.ts.
 *  Без vendor/ эффекты пака пропускаются, а уже собранные листы остаются в манифесте, пока файлы на диске (чистый клон соберёт только свободные). */
export function writeGameVfx(assetsRoot: string) {
  const dir = path.join(assetsRoot, "vfx");
  fs.mkdirSync(path.join(dir, "r"), { recursive: true });
  const mf = path.join(dir, "manifest.json");
  let old: Record<string, GameEntry> = {};
  try { old = JSON.parse(fs.readFileSync(mf, "utf8")); } catch { /* первого манифеста ещё нет */ }
  const out: Record<string, GameEntry> = {};
  for (const [id, e] of Object.entries(old)) if (fs.existsSync(path.join(dir, e.r ? "r" : "", `${id}.png`))) out[id] = e;
  for (const b of buildAll()) {
    const r = isRestricted(b.pack);
    toRow(b.frames, b.w, b.h).save(path.join(dir, r ? "r" : "", `${b.id}.png`));
    out[b.id] = { frameW: b.w, frameH: b.h, frames: b.frames.length, fps: b.fps, anchor: [Math.round(b.anchor[0] * 1000) / 1000, Math.round(b.anchor[1] * 1000) / 1000], blend: b.blend, ...(r ? { r: 1 as const } : {}), ...(b.ease ? { ease: b.ease } : {}) };
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.writeFileSync(mf, JSON.stringify(sorted, null, 1) + "\n");
  console.log(`vfx: ${Object.keys(sorted).length} листов в ${dir}`);
}

/** Лист штандарта ×3: все кадры цикла обеих фракций рядом с героем (Сольгард на траве, Умбрат на брусчатке). */
function bannerSheet(all: Built[]): PC | null {
  const rows = (["solgard", "umbrath"] as const).map((f) => all.find((b) => b.id === `banner-${f}`)).filter((b): b is Built => !!b);
  if (!rows.length) return null;
  const b0 = rows[0], cell = b0.w + 2, rowH = b0.h + 14, W = 48 + b0.frames.length * cell + 6;
  const pc = new PC(W, rowH * rows.length);
  rows.forEach((b, j) => {
    paintGround(pc, 0, j * rowH, W, rowH, j === 0 ? "grass" : "cobble");
    const feet = j * rowH + rowH - 8;
    pc.blit(hero("warrior"), 8, feet - 30);
    b.frames.forEach((f, i) => pc.blit(f, 48 + i * cell, feet - Math.round(b.anchor[1] * b.h)));
  });
  const big = scaleNN(pc, 3);
  rows.forEach((b, j) => drawText(big, `${b.id} ${b.frames.length}f ${b.fps}fps ${b.w}x${b.h}`, 6, j * rowH * 3 + 5, BEIGE, 1));
  return big;
}

export function writeAll() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(PREVIEW, { recursive: true });
  const all = buildAll();
  const manifest: Record<string, { frameW: number; frameH: number; frames: number; fps: number; anchor: [number, number]; blend: Blend; ease?: Ease }> = {};
  for (const b of all) {
    toRow(b.frames, b.w, b.h).save(path.join(OUT, `${b.id}.png`));
    manifest[b.id] = { frameW: b.w, frameH: b.h, frames: b.frames.length, fps: b.fps, anchor: [Math.round(b.anchor[0] * 1000) / 1000, Math.round(b.anchor[1] * 1000) / 1000], blend: b.blend, ...(b.ease ? { ease: b.ease } : {}) };
  }
  fs.writeFileSync(path.join(OUT, "vfx-manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
  const packs = [...new Set(all.map((b) => b.pack))];
  for (const p of packs) {
    const items = all.filter((b) => b.pack === p);
    stackV(items.map((b) => storyboard(b.frames, b.w, b.h, b.anchor, `${b.id}  ${b.frames.length}f ${b.fps}fps ${b.w}x${b.h} ${b.blend} ${b.role}`, 2, b.peak))).save(path.join(PREVIEW, `${p}.png`));
    compareSheet(items).save(path.join(PREVIEW, `compare-${p}.png`));
  }
  bannerSheet(all)?.save(path.join(PREVIEW, "banner.png"));
  console.log(`эффектов: ${all.length}; паки: ${packs.join(", ")}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { if (process.argv.includes("--game")) writeGameVfx(path.join(ROOT, "client/public/assets")); else writeAll(); }
export type { RGBA };
void GOLD;
