/** Городские слухи: NPC-сплетники и тексты из /data/rumors.json. */
import data from "../data/rumors.json";
import { TILE } from "./constants";
import { CITIES, layoutOf } from "./cities";
import { TOWN } from "./map";

export interface RumorNpc {
  id: string;
  name: string;
  sprite: string;
  tint: number;
  color: string;
  lines: string[];
  x: number;
  y: number;
}

/** Смещения от центра города (в тайлах): Марта — на рынке, Ивор — у северных ворот, Лей — в сквере. */
const AT: Record<string, [number, number]> = { marta: [2, -4], ivor: [6, -17], lei: [-9, 3] };

/** Ошибки данных: сплетник с несуществующим городом или без места в Эмберхолле (такие не ставятся; tests/cities.ts требует пустой список). */
export const RUMOR_ERRORS: string[] = [];

export const RUMOR_NPCS: RumorNpc[] = Object.entries(data.npcs).flatMap(([id, n]): RumorNpc[] => {
  let at: { x: number; y: number };
  if ("city" in n) {
    const city = CITIES.find((c) => c.id === n.city);
    if (!city) return RUMOR_ERRORS.push(`сплетник ${id}: нет города ${n.city}`), [];
    const r = layoutOf(city).rumor;
    at = { x: city.x + r[0], y: city.y + r[1] };
  } else {
    const d = AT[id];
    if (!d) return RUMOR_ERRORS.push(`сплетник ${id}: нет города и места в Эмберхолле (shared/rumors.ts AT)`), [];
    at = { x: TOWN.x + d[0], y: TOWN.y + d[1] };
  }
  return [{ id, name: n.name, sprite: n.sprite, tint: Number(n.tint), color: n.color, lines: n.lines, x: at.x * TILE + 16, y: at.y * TILE + 16 }];
});

export interface RumorMsg {
  npc: string;
  name: string;
  text: string;
}
