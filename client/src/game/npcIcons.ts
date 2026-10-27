/** Значки служб NPC 11×11 (атлас-лента client/public/assets/ui/npc-icons-11.png, tools/gen/npc-icons.ts): стоят слева от имени. */
export const NPC_ICON_SIZE = 11;
export const NPC_ICON_TEX = "npc_icons";

/** Порядок кадров в ленте. */
const FRAMES = ["shop", "cook", "smith", "bank", "bags", "rumor", "raid", "stable", "arena"];

/** Номер кадра значка службы или -1, если у службы значка нет. */
export const npcIconFrame = (kind: string): number => FRAMES.indexOf(kind);
