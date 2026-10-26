/** Задача 140, партия 2: образы зон 40–100, данжа «Пепельные чертоги», приспешники рейда и звери/растения списка 2. */
import { arthro, basilisk, bat, beetle, boar, crawler, lizard, rat, spider } from "./beasts";
import { canine } from "./canine";
import { barbarian, gnoll, lizardfolk, orc } from "./folk2";
import { butcher, golem, iceGolem } from "./golems";
import { chaosSpark, chaosSquire, grove, slime } from "./grove";
import { harpy } from "./harpy";
import { banshee, boneWitch, fallenSpirit, voidSpirit, wrapped } from "./spirits";
import type { Creature } from "./rig";

export const BATCH2: Creature[] = [
  orc, gnoll, lizardfolk, barbarian, harpy, golem, iceGolem, butcher, fallenSpirit, banshee, voidSpirit, boneWitch, wrapped,
  canine, boar, rat, bat, spider, beetle, lizard, basilisk, arthro, crawler, grove, slime, chaosSquire, chaosSpark,
];
