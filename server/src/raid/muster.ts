/**
 * Сбор рейда (docs/raid.md §1): один сбор на сервер, общий для обеих фракций. Встать — у Вестника Цитадели (уровень ≥ minLevel,
 * герой жив, не в очереди арены); группа входит целиком. Таймер musterMs от первого игрока, лидер может начать раньше,
 * при maxPlayers — старт сразу. Боты добирают состав до size по недостающим ролям (WorldRoom.startRaid).
 */
import type { ClassId } from "../../../shared/classes";
import { RAID_CFG, RAID_ROLES, raidRole, roleTargets, type RaidMemberInfo, type RaidMusterMsg, type RaidRole } from "../../../shared/raid";
import type { Player } from "../game/Player";
import { raids } from "../arena/registry";
import { lockoutLeft, raidState } from "./rewards";

export interface MusterEntry extends RaidMemberInfo {
  key: string;
  at: number;
}

/** Длительность сбора; в тестах — переменная RAID_MUSTER_MS. */
export const musterMs = () => Number(process.env.RAID_MUSTER_MS) || RAID_CFG.musterMs;

export class RaidMuster {
  list: MusterEntry[] = [];
  startAt = 0;

  constructor(
    private find: (key: string) => Player | undefined,
    /** Состав собран: создать инстанс рейда. */
    private start: (list: MusterEntry[]) => void,
    /** Кому разослать raid:muster. */
    private notify: (keys: string[]) => void,
    /** Почему игрок занят (очередь арены, переход), null — свободен. */
    private busy: (key: string) => string | null,
  ) {}

  has(key: string) {
    return this.list.some((e) => e.key === key);
  }
  get leader(): string {
    return this.list[0]?.name ?? "";
  }

  /** Почему герой не может встать в рейд ("" — может). */
  why(p: Player): string {
    if (p.level < RAID_CFG.minLevel) return `Нужен ${RAID_CFG.minLevel} уровень`;
    if (p.dead) return "Сначала воскресните";
    return this.busy(p.name.toLowerCase()) ?? "";
  }

  /** Встать в рейд героем или всей его группой. null — встали, иначе причина. */
  join(group: Player[], now = Date.now()): string | null {
    for (const p of group) {
      const err = this.why(p);
      if (err) return group.length > 1 ? `${p.name}: ${err}` : err;
    }
    const fresh = group.filter((p) => !this.has(p.name.toLowerCase()));
    if (!fresh.length) return "Вы уже в рейде";
    if (this.list.length + fresh.length > RAID_CFG.maxPlayers) return "Рейд уже собран";
    if (!this.list.length) this.startAt = now + musterMs();
    for (const p of fresh) this.list.push({ key: p.name.toLowerCase(), name: p.name, cls: p.cls as ClassId, level: p.level, role: raidRole(p.cls), at: now });
    this.changed();
    if (this.list.length >= RAID_CFG.maxPlayers) this.launch();
    return null;
  }
  cancel(key: string) {
    const was = this.list.length;
    this.list = this.list.filter((e) => e.key !== key);
    if (this.list.length === was) return;
    if (!this.list.length) this.startAt = 0;
    this.changed([key]);
  }
  /** Лидер (первый вставший) начинает раньше таймера. */
  startNow(key: string): string | null {
    if (!this.list.length) return "Сбор не идёт";
    if (this.list[0].key !== key) return "Начать может только лидер сбора";
    this.launch();
    return null;
  }
  tick(now = Date.now()) {
    if (!this.list.length) return;
    // ушедшие из мира — из сбора
    const gone = this.list.filter((e) => !this.find(e.key));
    if (gone.length) { for (const e of gone) this.cancel(e.key); if (!this.list.length) return; }
    if (now >= this.startAt) this.launch();
    else if (Math.floor((this.startAt - now) / 1000) % 5 === 0) this.changed();
  }
  private launch() {
    const list = this.list;
    this.list = [];
    this.startAt = 0;
    this.notify(list.map((e) => e.key));
    this.start(list);
  }
  private changed(extra: string[] = []) {
    this.notify([...this.list.map((e) => e.key), ...extra]);
  }

  /** Сколько ботов и каких ролей доберёт сервер. */
  static fill(list: { role: RaidRole }[]): Record<RaidRole, number> {
    const size = Math.max(RAID_CFG.size, list.length);
    const tg = roleTargets(size);
    const need = {} as Record<RaidRole, number>;
    let free = Math.max(0, RAID_CFG.size - list.length);
    for (const r of RAID_ROLES) need[r] = 0;
    // сперва — недостающие роли, потом — дальний и ближний бой
    for (const r of RAID_ROLES) {
      const have = list.filter((e) => e.role === r).length;
      const n = Math.min(free, Math.max(0, tg[r] - have));
      need[r] = n;
      free -= n;
    }
    for (const r of ["ranged", "melee"] as RaidRole[]) if (free > 0) { need[r] += free; free = 0; }
    return need;
  }

  status(p: Player | undefined, key: string, now = Date.now()): RaidMusterMsg {
    const need = RaidMuster.fill(this.list);
    const s = p?.save;
    return {
      open: this.list.length > 0,
      joined: this.has(key),
      leader: this.leader,
      leftSec: this.list.length ? Math.max(0, Math.ceil((this.startAt - now) / 1000)) : 0,
      members: this.list.map(({ name, cls, level, role }) => ({ name, cls, level, role })),
      need,
      bots: RAID_ROLES.reduce((a, r) => a + need[r], 0),
      lockoutMs: s ? lockoutLeft(s) : 0,
      wins: s ? raidState(s).wins : 0,
      why: p ? this.why(p) : "",
      running: raids.running > 0,
    };
  }
}
