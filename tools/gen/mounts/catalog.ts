/**
 * Задача 142: каталог моделей маунтов (tools/gen/mounts/<модель>.ts) и сопоставление id из data/mounts.json → модель.
 * heraldic — броня/знамя с гербом: два листа, по фракции всадника (<модель>.png — Сольгард, <модель>_umbrath.png — Умбрат).
 * Модели без маунта в data (spare) тоже уходят в игру под своим id: стоит добавить маунт с таким id в data — вид уже есть.
 */
import type { Fac, MountSpec } from "./lib";
import { warHorse } from "./war_horse";
import { griffin } from "./griffin";
import { yak, spiritElk, flameHyena, warRhino, warElephant, packMammoth, batFox } from "./beasts";
import { whiteGryphon, crystalGryphon, frostOwl } from "./birds";
import { stormDrakeBlack, stormDrakeBlue } from "./drakes";
import { raptor, raptorSand } from "./raptor";
import { draftHorse, paradeHorse, spikedHorse, lavaHorse, spectralHorse, clockworkHorse, clockworkWhite, dragonHorse } from "./horses";

export interface Model {
  id: string;
  ru: string;
  /** референсы tools/out/refs/mounts/<имя>.png */
  refs: string[];
  heraldic: boolean;
  spec: (fac: Fac) => MountSpec;
}
export const MODELS: Model[] = [
  { id: "war_horse", ru: "Боевой конь со знаменем", refs: ["20-banner_armored_horse"], heraldic: true, spec: (f) => warHorse(f) },
  { id: "griffin", ru: "Королевский грифон", refs: ["11-owl_gryphon_gold", "12-owl_gryphon_gold_side"], heraldic: true, spec: (f) => griffin(f) },
  { id: "draft_horse", ru: "Бурый тяжеловоз", refs: ["17-draft_horse"], heraldic: false, spec: () => draftHorse() },
  { id: "parade_horse", ru: "Парадный конь со стягом", refs: ["07-banner_parade_horse"], heraldic: true, spec: (f) => paradeHorse(f) },
  { id: "spiked_horse", ru: "Шипастый латный конь", refs: ["03-spiked_armored_horse"], heraldic: true, spec: (f) => spikedHorse(f) },
  { id: "lava_horse", ru: "Лавовый конь", refs: ["04-lava_horse"], heraldic: false, spec: () => lavaHorse() },
  { id: "spectral_horse", ru: "Призрачный кошмар", refs: ["05-spectral_nightmare_horse"], heraldic: false, spec: () => spectralHorse() },
  { id: "clockwork_horse", ru: "Механический конь", refs: ["02-clockwork_horse"], heraldic: false, spec: () => clockworkHorse() },
  { id: "clockwork_white", ru: "Фарфоровый конь", refs: ["06-clockwork_white_horse"], heraldic: false, spec: () => clockworkWhite() },
  { id: "yak", ru: "Рогатый як", refs: ["08-horned_yak_beast"], heraldic: false, spec: () => yak() },
  { id: "spirit_elk", ru: "Духовный лось", refs: ["15-spirit_elk"], heraldic: false, spec: () => spiritElk() },
  { id: "flame_hyena", ru: "Огненная гиена", refs: ["23-armored_flame_hyena"], heraldic: false, spec: () => flameHyena() },
  { id: "war_rhino", ru: "Боевой носорог со знаменем", refs: ["24-banner_war_rhino"], heraldic: true, spec: (f) => warRhino(f) },
  { id: "war_elephant", ru: "Боевой слон", refs: ["18-armored_elephants"], heraldic: true, spec: (f) => warElephant(f) },
  { id: "pack_mammoth", ru: "Вьючный мамонт", refs: ["19-pack_mammoth"], heraldic: false, spec: () => packMammoth() },
  { id: "bat_fox", ru: "Лис-нетопырь", refs: ["01-bat_fox"], heraldic: false, spec: () => batFox() },
  { id: "white_gryphon", ru: "Белый грифон в броне", refs: ["13-white_gryphon_armored"], heraldic: true, spec: (f) => whiteGryphon(f) },
  { id: "crystal_gryphon", ru: "Хрустальный грифон", refs: ["14-crystal_gryphon"], heraldic: false, spec: () => crystalGryphon() },
  { id: "frost_owl", ru: "Ледяная сова", refs: ["16-frost_owl"], heraldic: false, spec: () => frostOwl() },
  { id: "storm_drake", ru: "Чёрный грозовой дракен", refs: ["09-storm_drake_black"], heraldic: false, spec: () => stormDrakeBlack() },
  { id: "storm_drake_blue", ru: "Синий грозовой дракен", refs: ["10-storm_drake_blue"], heraldic: false, spec: () => stormDrakeBlue() },
  { id: "raptor", ru: "Рыжий раптор", refs: ["22-raptors"], heraldic: false, spec: () => raptor() },
  { id: "raptor_sand", ru: "Песчаный раптор", refs: ["22-raptors"], heraldic: false, spec: () => raptorSand() },
  { id: "dragonhorse", ru: "Рогатый драконоконь", refs: ["21-horned_dragonhorse"], heraldic: false, spec: () => dragonHorse() },
];
/** id маунта из data/mounts.json → модель. */
export const ART: Record<string, string> = {
  horse: "draft_horse",
  boar: "yak",
  ashwolf: "flame_hyena",
  raptor: "raptor",
  sand_lizard: "raptor_sand",
  war_horse: "war_horse",
  destrier: "parade_horse",
  skel_horse: "spiked_horse",
  spider: "war_rhino",
  bear: "pack_mammoth",
  stag: "spirit_elk",
  spirit_wolf: "spectral_horse",
  lion: "war_elephant",
  wyvern: "bat_fox",
  nightmare: "lava_horse",
  phoenix: "storm_drake_blue",
  griffin: "griffin",
  bone_dragon: "storm_drake",
};
export const modelById = (id: string) => MODELS.find((m) => m.id === id);
