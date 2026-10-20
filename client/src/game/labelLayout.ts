/** Разводка подписей над юнитами: в толпе прячет лишние ники, остальным подбирает сдвиг вверх и вбок, чтобы не налезали друг на друга. */
import { UnitKind } from "../../../shared/protocol";
import { overlay } from "./overlay";
import type { UnitView } from "./UnitView";

const CROWD = 8;
const H = 17;
/** Кандидаты сдвига (dx, dy): сначала на месте, потом вверх, потом вбок; не дальше 26 px от юнита. */
const CANDS: [number, number][] = [[0, 0], [0, -7], [12, 0], [-12, 0], [12, -7], [-12, -7], [0, -14], [20, -7], [-20, -7], [12, -14], [-12, -14], [0, -21], [24, -14], [-24, -14], [0, -26]];

export function layoutLabels(units: Map<string, UnitView>, selfId: string, targetId: string | null, partyNames: Set<string>, view: { x: number; y: number; width: number; height: number }): number {
  const vis: UnitView[] = [];
  let heroes = 0;
  for (const v of units.values()) {
    if (v.dead || v.unseen || v.x < view.x - 40 || v.x > view.x + view.width + 40 || v.y < view.y - 20 || v.y > view.y + view.height + 80) continue;
    vis.push(v);
    if (v.u.kind === UnitKind.Player) heroes++;
  }
  const crowd = overlay.autoNames && heroes > CROWD;
  for (const v of vis) {
    if (v.u.kind !== UnitKind.Player || v.isSelf) { v.nameOk = true; continue; }
    v.nameOk = !crowd || v.id === targetId || v.hovered || partyNames.has(v.u.name) || v.u.hp < v.u.maxHp;
  }
  // приоритет: свой, цель, остальные снизу вверх (нижние ближе к зрителю)
  const rank = (v: UnitView) => (v.isSelf ? 0 : v.id === targetId ? 1 : 2);
  vis.sort((a, b) => rank(a) - rank(b) || b.y - a.y);
  const placed: { l: number; r: number; t: number; b: number }[] = [];
  for (const v of vis) {
    if (v.npc || v.u.kind === UnitKind.Pet && !v.nameOk) continue;
    const w = v.blockW();
    const bx = v.x, by = v.topY;
    const fits = (dx: number, dy: number) => {
      const l = bx + dx - w / 2, r = l + w, b = by + dy + 3, t = b - H;
      for (const p of placed) if (l < p.r && r > p.l && t < p.b && b > p.t) return false;
      return true;
    };
    let pick: [number, number] | undefined;
    if (rank(v) === 2 && fits(v.tgtX, v.tgtY)) pick = [v.tgtX, v.tgtY]; // не дёргаем уже устроившееся место
    else if (rank(v) < 2) pick = [0, 0];
    else pick = CANDS.find(([dx, dy]) => fits(dx, dy)) ?? [0, 0];
    v.tgtX = pick[0];
    v.tgtY = pick[1];
    const l = bx + pick[0] - w / 2, b = by + pick[1] + 3;
    placed.push({ l, r: l + w, t: b - H, b });
  }
  return heroes;
}
