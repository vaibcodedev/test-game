/** Значки служб NPC 9×9 (атлас-лента client/public/assets/ui/npc-icons-9.png, tools/gen/npc-icons.ts): стоят слева от имени. */
export const NPC_ICON_SIZE = 9;
export const NPC_ICON_TEX = "npc_icons";

/** Порядок кадров в ленте. */
const FRAMES = ["shop", "cook", "smith", "bank", "bags", "rumor", "raid", "stable", "arena"];

/** Номер кадра значка службы или -1, если у службы значка нет. */
export const npcIconFrame = (kind: string): number => FRAMES.indexOf(kind === "pets" ? "stable" : kind); // смотритель зверинца — значок конюшни (задача 150)
