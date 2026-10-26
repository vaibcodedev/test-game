/** Конюшие (задача 142): в Аурелионе, Мортхейме и Эмберхолле. Данные и место (клетка от центра города) — data/mounts.json stablemasters. */
import data from "../data/mounts.json";
import { cityById, type CityNpc } from "./cities";
import { TILE } from "./constants";

export const STABLEMASTERS: CityNpc[] = Object.entries(data.stablemasters).flatMap(([city, n]) => {
  const c = cityById(city);
  if (!c) return [];
  const { at, ...rest } = n;
  return [{ ...rest, tint: Number(n.tint), x: (c.x + at[0]) * TILE + 16, y: (c.y + at[1]) * TILE + 16 }];
});
