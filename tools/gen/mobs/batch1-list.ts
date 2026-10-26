/** Задача 140, партия 1: образы зон 1–40 (без скелета — он из пилота tools/gen/mobs/skeleton.ts). */
import { boarfolk } from "./boarfolk";
import { frogfolk } from "./frogfolk";
import { ghoul } from "./ghoul";
import { goblin } from "./goblin";
import { hobgoblin } from "./hobgoblin";
import { imp } from "./imp";
import { kobold } from "./kobold";
import { mummy } from "./mummy";
import { ogre } from "./ogre";
import { ratfolk } from "./ratfolk";
import { satyr } from "./satyr";
import { troll } from "./troll";
import { wolffolk } from "./wolffolk";
import { zombie } from "./zombie";
import type { Creature } from "./rig";

export const BATCH1: Creature[] = [boarfolk, ratfolk, goblin, zombie, imp, wolffolk, satyr, ghoul, hobgoblin, kobold, mummy, ogre, troll, frogfolk];
