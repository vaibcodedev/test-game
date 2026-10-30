/**
 * Перекличка ботов рейда (docs/systems/bosses.md §5): на событие шины Director отвечает один бот подходящей роли строкой из
 * data/raid.json bots.lines (подстановка {name}). Общий откат и откат одного события — bots.cooldown.
 */
import { RAID, type RaidRole } from "../../../shared/raid";
import type { Player } from "../game/Player";
import type { RaidDirector } from "./director";

/** Событие шины → ключ строк и роль говорящего (by — говорит тот, кто сделал). */
const MAP: Record<string, { key: string; role: RaidRole | "any"; by?: boolean }> = {
  muster: { key: "muster", role: "any" },
  pull: { key: "pull", role: "any" },
  "tele:cleave": { key: "tele:cleave", role: "tank" },
  "tele:sun": { key: "tele:sun", role: "any" },
  "tele:verdict": { key: "tele:verdict", role: "any" },
  adds: { key: "adds", role: "tank" },
  death: { key: "death", role: "healer" },
  revive: { key: "revive", role: "healer", by: true },
  oom: { key: "oom", role: "healer", by: true },
  hold: { key: "hold", role: "tank", by: true },
  dodge: { key: "dodge", role: "any", by: true },
  win: { key: "win", role: "any" },
  wipe: { key: "wipe", role: "any" },
};
/** Эти события звучат всегда (кроме отката самого события). */
const LOUD = new Set(["win", "wipe", "pull"]);

export class Chatter {
  private lastAll = -1e9;
  private lastEv = new Map<string, number>();
  /** Сколько строк сказано (тест). */
  said = 0;
  constructor(private d: RaidDirector) {}

  event(ev: string, data: Record<string, unknown>) {
    if (ev === "stage" && data.stage === "gather") ev = "muster";
    const spec = MAP[ev];
    if (!spec) return;
    const d = this.d, t = d.w.time, cd = RAID.bots.cooldown;
    if (t - (this.lastEv.get(ev) ?? -1e9) < cd.perEvent) return;
    if (!LOUD.has(ev) && t - this.lastAll < cd.all) return;
    const bots = [...d.bots].filter((p) => !p.dead && d.w.players.get(p.id) === p);
    let who: Player | undefined, role: RaidRole | "any" = spec.role;
    if (spec.by && typeof data.by === "string") {
      who = bots.find((p) => p.name === data.by);
      if (who) role = data.role && typeof data.role === "string" ? (data.role as RaidRole) : d.roleOf(who);
    } else {
      const pool = spec.role === "any" ? bots : bots.filter((p) => d.roleOf(p) === spec.role);
      who = pool[Math.floor(d.rand() * pool.length)];
      if (who && spec.role === "any") role = d.roleOf(who);
    }
    if (!who) return;
    const lines = RAID.bots.lines[spec.key];
    const text = d.line(spec.key, lines?.[role] ? role : lines?.any ? "any" : spec.role, { name: typeof data.name === "string" ? data.name : "" });
    if (!text) return;
    this.lastEv.set(ev, t);
    this.lastAll = t;
    this.said++;
    d.say(who, text);
  }
}
