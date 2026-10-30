/**
 * Единая модель ворот (docs/art/perspective.md): проходы данжа (server/src/rooms/DungeonRoom.ts), ворота фортов и городов (shared/siege.ts: gateBlocks).
 * Состояние ворот — closed / opening / open / closing / broken, ход t 0..1; правила: кто может открыть, когда проходимо, шаг автомата по времени.
 */
export type GateKind = "doors" | "portcullis" | "leaves";
export type GateState = "closed" | "opening" | "open" | "closing" | "broken";
export interface GateModel {
  id: string;
  kind: GateKind;
  /** Ширина проёма в клетках. */
  w: number;
  /** Владелец-фракция; null — нейтральные ворота (двери данжа): открывает любой. */
  owner: string | null;
  state: GateState;
  /** 0 — закрыто, 1 — открыто полностью. */
  t: number;
  /** Сколько ещё держать открытыми после ухода последнего (мс). */
  hold: number;
  /** Заперты: осада, бой с боссом; не открываются, пока заперты. */
  locked: boolean;
}
export const GATE_OPEN_MS = 800, GATE_CLOSE_MS = 900, GATE_HOLD_MS = 1500;

export const newGate = (id: string, kind: GateKind, w: number, owner: string | null = null): GateModel => ({ id, kind, w, owner, state: "closed", t: 0, hold: 0, locked: false });

/** Может ли юнит фракции faction открыть эти ворота (и пройти, когда они открыты). Сломанные пропускают всех, запертые — никого. */
export function gateAllows(owner: string | null, faction: string | undefined, broken = false, locked = false): boolean {
  if (broken) return true;
  if (locked) return false;
  return owner === null || owner === faction;
}
/** Проходим ли проём в этом состоянии (закрытие и открытие — по ходу створок). */
export const gatePassable = (g: Pick<GateModel, "state" | "t">): boolean => g.state === "broken" || g.state === "open" || (g.state === "opening" && g.t >= 0.6) || (g.state === "closing" && g.t >= 0.34);
/** Шаг автомата: near — рядом есть разрешённый юнит, busy — в проёме кто-то стоит (закрывать нельзя). Возвращает true, если сменилось состояние. */
export function stepGate(g: GateModel, dtMs: number, near: boolean, busy: boolean): boolean {
  const was = g.state;
  if (g.state === "broken") return false;
  const want = near && !g.locked;
  if (g.state === "closed") { if (want) g.state = "opening"; }
  else if (g.state === "opening") { g.t = Math.min(1, g.t + dtMs / GATE_OPEN_MS); if (g.t >= 1) g.state = "open"; }
  else if (g.state === "open") { g.hold = want ? GATE_HOLD_MS : Math.max(0, g.hold - dtMs); if (g.hold <= 0 && !busy) g.state = "closing"; }
  else if (g.state === "closing") { if (want) g.state = "opening"; else { g.t = Math.max(0, g.t - dtMs / GATE_CLOSE_MS); if (g.t <= 0) g.state = "closed"; } }
  return g.state !== was;
}
