/** Задача 140, партия 2: состав зон для обзора — [образ, роль, усиленный]; усиленные — элита зоны (справа). Образы партии 1 в обзоре не повторяются. */
export type Pick2 = [string, string, boolean];
const n = (id: string, ...roles: string[]): Pick2[] => roles.map((r): Pick2 => [id, r, false]);
const e = (id: string, ...roles: string[]): Pick2[] => roles.map((r): Pick2 => [id, r, true]);
const both = (id: string, roles: string[]): Pick2[] => [...n(id, ...roles), ...e(id, ...roles)];
export const ZONES2: { ru: string; names: string; dirt?: boolean; mobs: Pick2[] }[] = [
  { ru: "ПУСТЫНЯ МИРАЖЕЙ 40-50 З", names: "ГНОЛЛ · ЯЩЕРОЛЮД · КОЧЕВНИК · ШАКАЛ · СКОРПИОН · ВАСИЛИСК · ГОЛЕМ | ЭЛИТА", dirt: true, mobs: [...n("gnoll", "chaser", "archer"), ...n("lizardfolk", "javelin", "shaman"), ...n("barbarian", "axe", "shield", "bow"), ...n("canine", "jackal"), ...n("arthro", "scorpion"), ...n("basilisk", "sand"), ...n("golem", "sandstone"), ...e("golem", "sandstone")] },
  { ru: "ПЕПЕЛЬНАЯ ПУСТОШЬ 40-50 В", names: "ОРК · КОСТЯНОЙ СКОРПИОН · ГОЛЕМ | ЭЛИТА", dirt: true, mobs: [...n("orc", "axe", "shield"), ...n("arthro", "bone"), ...n("golem", "lava"), ...e("golem", "lava")] },
  { ru: "ПУСТОШЬ ПАВШИХ 50-60 З", names: "МАРОДЁРЫ · ГАРПИЯ | ГЛАВАРЬ", dirt: true, mobs: [...n("barbarian", "axe", "bow"), ...n("harpy", "scavenger"), ...e("barbarian", "axe")] },
  { ru: "ЧУМНЫЕ ТОПИ 50-60 В", names: "ЧУМНОЙ СЛИЗЕНЬ · ВЕДЬМА · МЯСНИК | ЭЛИТА", mobs: [...n("slime", "plague"), ...n("bone_witch", "staff", "hex"), ...n("butcher", "cleaver", "hook"), ...e("butcher", "hook")] },
  { ru: "ГРИФОНЬИ УТЁСЫ 60-70 З", names: "СЕВЕРЯНЕ · ГАРПИЯ · ГОРНЫЙ ОРК · ЛЕДЯНОЙ ВОЛК · ЛЕДЯНОЙ ГОЛЕМ | ЭЛИТА", mobs: [...n("barbarian", "shield", "bow"), ...n("harpy", "screamer"), ...n("orc", "axe"), ...n("canine", "frost"), ...n("ice_golem", "ice"), ...e("ice_golem", "ice")] },
  { ru: "КОСТЯНОЙ ХРЕБЕТ 60-70 В", names: "БАНШИ · ОБСИДИАНОВЫЙ ГОЛЕМ | ЭЛИТА", dirt: true, mobs: [...n("banshee", "wail", "claw"), ...n("golem", "obsidian"), ...e("golem", "obsidian")] },
  { ru: "ГРОЗОВОЙ ХРЕБЕТ 70-80", names: "ОРК-ГРОМОВЕРЖЕЦ · ЛУЧНИК · ГРОЗОВАЯ ГАРПИЯ · ЛЕДЯНОЙ ВОЛК · ГОЛЕМ | ЭЛИТА", mobs: [...n("orc", "thunder", "bow"), ...n("harpy", "storm"), ...n("canine", "frost"), ...n("ice_golem", "ice"), ...e("harpy", "storm"), ...e("ice_golem", "ice")] },
  { ru: "ПОЛЯ ВЕЧНЫХ БИТВ 80-100", names: "ЛЕГИОНЕР · ДУХИ ПАВШИХ · ОРК-НАЁМНИК · ОСАДНЫЙ ГОЛЕМ | ЭЛИТА", mobs: [...n("barbarian", "legion"), ...n("fallen_spirit", "warrior", "spear", "archer", "hollow", "shroud", "ash", "drowned", "undead"), ...n("orc", "axe"), ...n("golem", "siege"), ...e("orc", "axe"), ...e("golem", "siege"), ...e("fallen_spirit", "warrior")] },
  { ru: "ПЫЛАЮЩИЙ ВУЛКАН 80-100", names: "МАГМОВЫЙ СЛИЗЕНЬ · ЛАВОВЫЙ ПЁС · САЛАМАНДРА · МАГМОВЫЙ ГОЛЕМ | ЭЛИТА", dirt: true, mobs: [...n("slime", "magma"), ...n("canine", "lava"), ...n("lizardfolk", "salamander"), ...n("golem", "magma"), ...e("golem", "magma")] },
  { ru: "ПЕПЕЛЬНЫЕ ЧЕРТОГИ 85-95 ДАНЖ", names: "КУЛЬТИСТ-ПИРОМАНТ · КОНСТРУКТЫ · ЛАВОВЫЙ ГОЛЕМ | ЭЛИТА", dirt: true, mobs: [...n("barbarian", "pyro"), ...n("wrapped_construct", "guard", "weaver"), ...n("golem", "lava"), ...e("barbarian", "pyro"), ...e("golem", "lava")] },
  { ru: "РЕЙД: ЦИТАДЕЛЬ ХАОСА", names: "ОРУЖЕНОСЕЦ ХАОСА · ИСКРА ХАОСА", dirt: true, mobs: [...e("chaos_squire", "halberd"), ...e("chaos_spark", "caster")] },
  { ru: "БЕЗ ЗОНЫ: ОБРАЗЫ", names: "ЛИЛОВОЕ СУЩЕСТВО · ВЕДЬМА · КОНСТРУКТ · БАНШИ · ДУХИ (УСИЛЕННЫЕ)", mobs: [...both("void_spirit", ["claw", "caster"]), ...e("bone_witch", "staff"), ...e("wrapped_construct", "guard", "weaver"), ...e("banshee", "wail"), ...e("fallen_spirit", "spear", "hollow", "shroud", "drowned")] },
  { ru: "ЗВЕРИ 1", names: "ПСОВЫЕ · КАБАН · КРЫСА", mobs: [...both("canine", ["wolf", "jackal", "frost", "lava"]), ...both("boar", ["boar"]), ...both("rat", ["rat"])] },
  { ru: "ЗВЕРИ 2", names: "МЫШЬ · ПАУК · ЖУК · ЯЩЕРИЦЫ", mobs: [...both("bat", ["bat"]), ...both("spider", ["biter", "spitter"]), ...both("beetle", ["armored"]), ...both("lizard", ["horned", "clay", "salamander"])] },
  { ru: "ЗВЕРИ 3", names: "ВАСИЛИСК · ЧЛЕНИСТЫЕ · ПОЛЗУН", dirt: true, mobs: [...both("basilisk", ["cave", "sand"]), ...both("arthro", ["crab", "scorpion", "bone"]), ...both("crawler", ["crawler"])] },
  { ru: "МАЛЫЕ ЛЕСНЫЕ И СЛИЗНИ", names: "ЭНТ · КОРНЕВИК · МОХОВИК · ГРИБ · СПОРОВИК · ШИШЕЧНИК · СЛИЗНИ", mobs: [...n("grove", "ent", "root", "moss", "mushroom", "spore", "cone"), ...n("slime", "jelly", "shell"), ...e("grove", "ent", "mushroom"), ...e("slime", "jelly", "shell")] },
];
