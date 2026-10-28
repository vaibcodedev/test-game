/** Слухи: выбор реплики NPC и подстановка живого состояния мира (боссы, арена, онлайн). */
import { RUMOR_NPCS, type RumorMsg } from "../../../shared/rumors";
import { npcRefusal } from "../../../shared/npcs";
import { services } from "../arena/registry";
import type { Player } from "./Player";
import type { World } from "./World";
import { T } from "../../../shared/texts";
import { RING_CARDS } from "../../../shared/zoneBosses";

const BOSSES: Record<string, { alive: string; slain: string; gone: string }> = {
  ashlord: { alive: T("srv.rumors.811"), slain: T("srv.rumors.812"), gone: T("srv.rumors.813") },
};

function bossState(w: World, id: string): string {
  const b = BOSSES[id];
  const m = [...w.mobs.values()].find((x) => x.def.id === id && !x.summoned);
  if (m && !m.dead) return b.alive;
  const k = w.bossKills.get(id);
  if (!k) return b.gone;
  const min = Math.max(1, Math.round((w.time - k.at) / 60000));
  return T("srv.rumors.137", { slain: b.slain, by: k.by, min: min });
}

/** Слух о случайном боссе кольца 40–80 (data/ring-bosses.json): жив, повержен недавно или ещё не появлялся. */
function ringBossState(w: World): string {
  const c = RING_CARDS[Math.floor(Math.random() * RING_CARDS.length)];
  const names = { name: c.name, title: c.title, loc: c.location };
  const m = [...w.mobs.values()].find((x) => x.def.id === c.id && !x.summoned);
  if (m && !m.dead) return T("srv.rumors.805", names);
  const k = w.bossKills.get(c.id);
  if (!k) return T("srv.rumors.807", names);
  const min = Math.max(1, Math.round((w.time - k.at) / 60000));
  return T("srv.rumors.137", { slain: T("srv.rumors.806", names), by: k.by, min: min });
}

const last = new Map<string, { at: number; npc: string; i: number }>();

/** null — слишком часто (не чаще 4 раз в секунду на игрока). */
export function rumorFor(w: World, p: Player, npcId: unknown): RumorMsg | null {
  const npc = RUMOR_NPCS.find((n) => n.id === npcId);
  if (!npc) return null;
  const prev = last.get(p.id);
  const now = Date.now();
  if (prev && now - prev.at < 250) return null; // защита от потока; 1 с задерживала «Ещё слух» и могла оставить окно без ответа
  const no = npcRefusal({ kind: "rumor", name: npc.name, x: npc.x, y: npc.y }, p.faction);
  if (no) { last.set(p.id, { at: now, npc: npc.id, i: -1 }); return { npc: npc.id, name: npc.name, text: no }; }
  const top = services.arena.top("1v1", 1)[0];
  const lines = npc.lines.filter((l) => top || !l.includes("{top}"));
  let i = Math.floor(Math.random() * lines.length);
  if (prev && prev.npc === npc.id && lines.length > 1 && lines[i] === npc.lines[prev.i]) i = (i + 1) % lines.length;
  last.set(p.id, { at: now, npc: npc.id, i: npc.lines.indexOf(lines[i]) });
  const text = lines[i]
    .replace("{ringboss}", () => ringBossState(w))
    .replace("{ashlord}", () => `${bossState(w, "ashlord")}`)
    .replace("{online}", () => String(w.players.size))
    .replace("{top}", () => (top ? `${top.name} (${top.rating})` : T("srv.rumors.814")));
  return { npc: npc.id, name: npc.name, text };
}

export function forgetRumors(id: string) {
  last.delete(id);
}
