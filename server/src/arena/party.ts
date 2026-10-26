/** Группы до двух игроков (для арены 2×2). Хранятся по имени, поэтому переживают переход на арену и обратно. */
import type { PartyState } from "../../../shared/arena";
import type { ClassId } from "../../../shared/classes";
import type { Player } from "../game/Player";
import { T } from "../../../shared/texts";

const MAX_PARTY = 2;
const INVITE_MS = 30_000;

interface Member {
  key: string;
  name: string;
  cls: ClassId;
  level: number;
}

export class Parties {
  private partyOf = new Map<string, Member[]>();
  private invites = new Map<string, { from: string; at: number }>();

  constructor(
    /** Игрок в мире по ключу имени. */
    private find: (key: string) => Player | undefined,
    /** Игрок онлайн (в мире или на арене). */
    private online: (key: string) => boolean,
  ) {}

  members(key: string): Member[] | null {
    return this.partyOf.get(key) ?? null;
  }
  state(key: string): PartyState | null {
    const m = this.partyOf.get(key);
    if (!m) return null;
    return { members: m.map((x) => ({ name: x.name, cls: x.cls, level: this.find(x.key)?.level ?? x.level, online: this.online(x.key) })) };
  }
  private notify(list: Member[]) {
    for (const m of list) this.find(m.key)?.send("party", this.state(m.key));
  }

  invite(from: Player, targetName: string): string | null {
    const fk = from.name.toLowerCase();
    const tk = targetName.trim().toLowerCase();
    if (tk === fk) return T("srv.party.19");
    const target = this.find(tk);
    if (!target) return T("srv.party.20");
    if (target.faction !== from.faction) return T("srv.party.21");
    if (this.partyOf.has(tk)) return T("srv.party.22", { name: target.name });
    const mine = this.partyOf.get(fk);
    if (mine && mine.length >= MAX_PARTY) return T("srv.party.23");
    this.invites.set(tk, { from: fk, at: Date.now() });
    target.send("party:invite", { from: from.name });
    return null;
  }

  respond(target: Player, accept: boolean): string | null {
    const tk = target.name.toLowerCase();
    const inv = this.invites.get(tk);
    this.invites.delete(tk);
    if (!inv || Date.now() - inv.at > INVITE_MS) return T("srv.party.24");
    const from = this.find(inv.from);
    if (!accept) {
      from?.send("toast", { text: T("srv.party.25", { name: target.name }), kind: "info" });
      return null;
    }
    if (!from) return T("srv.party.26");
    if (this.partyOf.has(tk)) return T("srv.party.27");
    let list = this.partyOf.get(inv.from);
    if (!list) {
      list = [{ key: inv.from, name: from.name, cls: from.cls, level: from.level }];
      this.partyOf.set(inv.from, list);
    }
    if (list.length >= MAX_PARTY) return T("srv.party.23");
    list.push({ key: tk, name: target.name, cls: target.cls, level: target.level });
    this.partyOf.set(tk, list);
    this.notify(list);
    for (const m of list) this.find(m.key)?.send("toast", { text: T("srv.party.28", { join: list.map((x) => x.name).join(" и ") }), kind: "info" });
    return null;
  }

  leave(key: string) {
    const list = this.partyOf.get(key);
    if (!list) return;
    const left = list.find((m) => m.key === key)!;
    const rest = list.filter((m) => m.key !== key);
    this.partyOf.delete(key);
    this.find(key)?.send("party", null);
    if (rest.length < 2) {
      for (const m of rest) {
        this.partyOf.delete(m.key);
        this.find(m.key)?.send("party", null);
        this.find(m.key)?.send("toast", { text: T("srv.party.29", { name: left.name }), kind: "info" });
      }
    } else {
      for (const m of rest) this.partyOf.set(m.key, rest);
      this.notify(rest);
    }
  }
}
