/**
 * Отказ NPC чужой фракции на клиенте (решение пользователя): окно не открывается, герой видит тот же текст, что пришлёт сервер.
 * Сервер — источник правды (shared/npcs.ts serviceRefusal); здесь только чтобы не открывать окно зря. Эмберхолл и бродячий торговец служат всем.
 */
import { stoneNear, isEnemyCapital } from "../../../shared/cities";
import { FACTIONS, type FactionId } from "../../../shared/factions";
import { npcRefusal, WORLD_NPCS, type WorldNpcKind } from "../../../shared/npcs";
import type { Net } from "../net";

let toast: (text: string) => void = () => {};
/** hud задаёт, куда показывать отказ. */
export const setNpcGateToast = (fn: (text: string) => void) => { toast = fn; };

/** true — NPC отказал (показан тост), окно открывать не надо. key — id NPC (у торговцев — имя). */
export function npcRefuses(net: Net | undefined, kind: WorldNpcKind, key: string | undefined): boolean {
  const f = net?.self?.faction;
  if (!f || key === undefined) return false;
  const n = WORLD_NPCS.find((x) => x.kind === kind && (x.id === key || (kind === "shop" && x.name === key)));
  const no = n ? npcRefusal(n, f) : null;
  if (no) toast(no);
  return !!no;
}
/** Камень телепорта в чужой столице или форте: тот же текст, что у сервера (server/src/game/cities.ts). */
export function stoneRefuses(net: Net | undefined, pos: { x: number; y: number }): boolean {
  const f = net?.self?.faction;
  const c = stoneNear(pos.x, pos.y);
  if (!f || !c || !isEnemyCapital(c, f)) return false;
  toast(`Камень телепорта ${c.name} не служит врагам ${FACTIONS[c.capital as FactionId]?.name ?? ""}а`);
  return true;
}
