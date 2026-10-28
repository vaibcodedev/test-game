/**
 * Проверка всей карты по правилам декора (data/decor-rules.json, shared/decorRules.ts) — общая для аудита tools/decor-audit.ts и теста tests/decor-rules.ts.
 * Кроме поверхности, биома, безопасных мест и огня проверяет, что стоячий декор не заслоняет двери, ворота, NPC и дороги.
 */
import { TILE } from "../shared/constants";
import { burntIndex, checkDecor, CLEAR, decorGroup, isTallDecor, VIOLATION_TEXT, type DecorViolation } from "../shared/decorRules";
import { DUNGEON_DOOR, OBJECT_FOOTPRINT, Zone, ZONES, decorCtxOf, roadDist, type WorldMap } from "../shared/map";
import { INTERIORS } from "../shared/interiors";
import { WORLD_NPCS } from "../shared/npcs";
import { BUILDINGS, TOWN } from "../shared/town";

export type AuditCode = DecorViolation | "door" | "gate" | "npc" | "road";
export const AUDIT_TEXT: Record<AuditCode, string> = { ...VIOLATION_TEXT, door: "заслоняет дверь", gate: "заслоняет ворота", npc: "стоит на NPC", road: "непроходимое на дороге" };
export interface Hit { i: number; kind: string; group: string; code: AuditCode; x: number; y: number; tx: number; ty: number; zone: string }

const GATE_KINDS = /(^|_)gate($|_)|gate_arch|^pal_gate/;

export function auditDecor(m: WorldMap): Hit[] {
  const ctx = decorCtxOf(m), burnt = burntIndex(m.objects);
  const doors = [...INTERIORS.map((r) => r.outDoor), ...BUILDINGS.flatMap((b) => (b.door ?? []).map((d) => ({ x: (TOWN.x + b.x + d + 0.5) * TILE, y: (TOWN.y + b.y + 1) * TILE }))), DUNGEON_DOOR];
  const gates = m.objects.filter((o) => GATE_KINDS.test(o.kind));
  const npcs = [...WORLD_NPCS, ...m.merchants];
  const near = (list: { x: number; y: number }[], x: number, y: number, r: number) => list.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < r * r);
  const hits: Hit[] = [];
  m.objects.forEach((o, i) => {
    const group = decorGroup(o.kind);
    if (!group) return;
    let code: AuditCode | null = checkDecor(ctx, o.kind, o.x, o.y, burnt);
    if (!code && isTallDecor(o.kind)) {
      if (near(doors, o.x, o.y, CLEAR.door)) code = "door";
      else if (near(gates, o.x, o.y, CLEAR.gate)) code = "gate";
      else if (near(npcs, o.x, o.y, CLEAR.npc)) code = "npc";
      else {
        const f = OBJECT_FOOTPRINT[o.kind];
        if (f) {
          const x0 = Math.round(o.x / TILE - f.w / 2), y0 = Math.floor((o.y + 2) / TILE) - 1;
          for (let j = 0; j < f.h && !code; j++) for (let k = 0; k < f.w && !code; k++) if (roadDist(x0 + k + 0.5, y0 - j + 0.5) < CLEAR.road) code = "road";
        }
      }
    }
    if (!code) return;
    const tx = Math.floor(o.x / TILE), ty = Math.floor((o.y - 2) / TILE);
    hits.push({ i, kind: o.kind, group, code, x: o.x, y: o.y, tx, ty, zone: ZONES[m.zone[ty * m.w + tx] as Zone]?.name ?? "?" });
  });
  return hits;
}
