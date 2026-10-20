/** Реестр моделей маунтов: id -> кадр, линия земли, высота парения, построитель позы. */
import type { MountModel } from "./mounts";
import { DESTRIER, HORSE_BROWN, NIGHTMARE, SKEL_HORSE, WAR_HORSE } from "./mounts-horses";
import { ASH_WOLF, BEAR, BOAR, LION, SAND_LIZARD, SPIRIT_WOLF, STAG } from "./mounts-beasts";
import { BONE_DRAGON, GRIFFIN, PHOENIX, RAPTOR, SPIDER, WYVERN } from "./mounts-fly";

export const MODELS: Record<string, MountModel> = {
  horse: { F: 96, gy: 80, build: HORSE_BROWN },
  war_horse: { F: 96, gy: 80, build: WAR_HORSE },
  destrier: { F: 112, gy: 92, build: DESTRIER },
  skel_horse: { F: 96, gy: 80, build: SKEL_HORSE },
  stag: { F: 112, gy: 92, build: STAG },
  lion: { F: 96, gy: 80, build: LION },
  ashwolf: { F: 96, gy: 80, build: ASH_WOLF },
  spirit_wolf: { F: 96, gy: 80, build: SPIRIT_WOLF },
  boar: { F: 96, gy: 80, build: BOAR },
  bear: { F: 112, gy: 92, build: BEAR },
  sand_lizard: { F: 112, gy: 92, build: SAND_LIZARD },
  griffin: { F: 128, gy: 100, fly: 16, build: GRIFFIN },
  bone_dragon: { F: 128, gy: 100, fly: 18, build: BONE_DRAGON },
  wyvern: { F: 128, gy: 100, fly: 16, build: WYVERN },
  phoenix: { F: 128, gy: 100, fly: 18, build: PHOENIX },
  spider: { F: 112, gy: 92, build: SPIDER },
  raptor: { F: 112, gy: 92, build: RAPTOR },
  nightmare: { F: 112, gy: 92, build: NIGHTMARE },
};
