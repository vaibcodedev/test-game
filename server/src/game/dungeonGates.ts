/**
 * Ворота подземелья (shared/dungeon.ts DUNGEON_GATES) на общей модели shared/gates.ts: нейтральные, открываются при подходе живого героя,
 * закрываются после выдержки, если проём пуст (герой, моб, питомец). Проходимость — клетки просвета на карте (CELL_BLOCK) по gatePassable.
 * Клиенту уходят два признака: open — куда идут створки (картинка), pass — проходим ли просвет сейчас (клиент ставит те же CELL_BLOCK).
 * Раньше клиент открывал клетки по open в начале хода, а сервер — только с t ≥ 0,6: предсказание шага расходилось с сервером (2026-11-02).
 */
import { DUNGEON_GATES, type DungeonGate } from "../../../shared/dungeon";
import { CELL_BLOCK } from "../../../shared/map";
import { TILE } from "../../../shared/constants";
import { gateAllows, gatePassable, newGate, stepGate, type GateModel } from "../../../shared/gates";
import type { World } from "./World";

export interface DgGateMsg { id: string; open: boolean; pass: boolean }
export interface DgGatesMsg { open: string[]; pass: string[] }
/** Герой ближе стольких px по x и y к середине просвета открывает ворота. */
export const DG_NEAR = { x: 96, y: 80 };

const opening = (m: GateModel) => m.state === "opening" || m.state === "open";

/** Стоит ли тело в просвете (закрывать нельзя): ближе 0,75 клетки к любой клетке просвета — с запасом на радиус тела (≤ 12 px). */
export function dgBusy(g: DungeonGate, u: { x: number; y: number }): boolean {
  return g.cells.some(([cx, cy]) => Math.abs(u.x - (cx + 0.5) * TILE) < TILE * 0.75 && Math.abs(u.y - (cy + 0.5) * TILE) < TILE * 0.75);
}

export class DungeonGates {
  readonly list = DUNGEON_GATES.map((g) => ({ g, m: newGate(g.id, g.kind === "wood" ? "doors" : "portcullis", g.cells.length), pass: false }));
  constructor(private w: World) {
    for (const s of this.list) this.apply(s.g, false); // ворота закрыты
  }
  private apply(g: DungeonGate, pass: boolean) {
    const m = this.w.map;
    for (const [cx, cy] of g.cells) { if (pass) m.cell[cy * m.w + cx] &= ~CELL_BLOCK; else m.cell[cy * m.w + cx] |= CELL_BLOCK; }
  }
  /** Шаг автомата; возвращает сообщения dg:gate о сменах (картинка или проходимость). */
  tick(dtMs: number): DgGateMsg[] {
    const w = this.w, out: DgGateMsg[] = [];
    const units = [...[...w.players.values()].filter((p) => !p.dead).map((p) => p.unit), ...[...w.mobs.values()].filter((m) => !m.dead).map((m) => m.unit), ...[...w.pets.values()].map((p) => p.unit)];
    for (const s of this.list) {
      const near = [...w.players.values()].some((p) => !p.dead && gateAllows(s.m.owner, p.faction, s.m.state === "broken", s.m.locked) && Math.abs(p.unit.x - s.g.cx) <= DG_NEAR.x && Math.abs(p.unit.y - s.g.cy) <= DG_NEAR.y);
      const busy = units.some((u) => dgBusy(s.g, u));
      const wasOpen = opening(s.m);
      stepGate(s.m, dtMs, near, busy);
      const pass = gatePassable(s.m);
      const passChanged = pass !== s.pass;
      if (passChanged) { s.pass = pass; this.apply(s.g, pass); }
      if (passChanged || wasOpen !== opening(s.m)) out.push({ id: s.g.id, open: opening(s.m), pass });
    }
    return out;
  }
  snapshot(): DgGatesMsg {
    return { open: this.list.filter((s) => opening(s.m)).map((s) => s.g.id), pass: this.list.filter((s) => s.pass).map((s) => s.g.id) };
  }
}
