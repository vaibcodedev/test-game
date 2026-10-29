/**
 * Сборы (задача 151, docs/world-bosses.md §2): общий Muster для рейда и мировых боссов. Встать — у Вестника в Эмберхолле
 * (уровень ≥ minLevel, герой жив, не занят; при faction — только своя фракция); группа входит целиком. Таймер ms от первого
 * игрока, лидер начинает раньше, при maxPlayers — сразу. Автосбор по ролям: fill — кого не хватает до состава, squads — делёж
 * большого сбора на отряды с балансом танк/лекарь/бой.
 *
 * RaidMuster (docs/raid.md §1): один сбор на сервер, обе фракции; боты добирают состав до size по недостающим ролям (WorldRoom.startRaid).
 */
import type { ClassId } from "../../../shared/classes";
import { RAID_CFG, RAID_ROLES, raidRole, roleTargets, type RaidMemberInfo, type RaidMusterMsg, type RaidRole } from "../../../shared/raid";
import type { Player } from "../game/Player";
import { raids } from "../arena/registry";
import { lockoutLeft, raidState } from "./rewards";
import { T } from "../../../shared/texts";

export interface MusterEntry extends RaidMemberInfo {
  key: string;
  at: number;
  faction?: string;
}

/** Длительность сбора рейда; в тестах — переменная RAID_MUSTER_MS. */
export const musterMs = () => Number(process.env.RAID_MUSTER_MS) || RAID_CFG.musterMs;

export interface MusterCfg {
  minLevel: number;
  maxPlayers: number;
  /** Длительность сбора от первого игрока, мс. */
  ms: () => number;
  /** Только эта фракция (сбор мирового босса); пусто — обе. */
  faction?: string;
  /** Текст «не та фракция». */
  factionText?: string;
}

export class Muster {
  list: MusterEntry[] = [];
  startAt = 0;

  constructor(
    protected cfg: MusterCfg,
    protected find: (key: string) => Player | undefined,
    /** Состав собран. */
    protected start: (list: MusterEntry[]) => void,
    /** Кому разослать состояние сбора. */
    protected notify: (keys: string[]) => void,
    /** Почему игрок занят (очередь арены, переход), null — свободен. */
    protected busy: (key: string) => string | null,
  ) {}

  has(key: string) {
    return this.list.some((e) => e.key === key);
  }
  get leader(): string {
    return this.list[0]?.name ?? "";
  }

  /** Почему герой не может встать в сбор ("" — может). */
  why(p: Player): string {
    if (p.level < this.cfg.minLevel) return T("srv.muster.197", { minlevel: this.cfg.minLevel });
    if (p.dead) return T("srv.muster.198");
    if (this.cfg.faction && p.faction !== this.cfg.faction) return this.cfg.factionText ?? "—";
    return this.busy(p.name.toLowerCase()) ?? "";
  }

  /** Встать героем или всей его группой. null — встали, иначе причина. */
  join(group: Player[], now = Date.now()): string | null {
    for (const p of group) {
      const err = this.why(p);
      if (err) return group.length > 1 ? `${p.name}: ${err}` : err;
    }
    const fresh = group.filter((p) => !this.has(p.name.toLowerCase()));
    if (!fresh.length) return T("srv.muster.199");
    if (this.list.length + fresh.length > this.cfg.maxPlayers) return T("srv.muster.200");
    if (!this.list.length) this.startAt = now + this.cfg.ms();
    for (const p of fresh) this.list.push({ key: p.name.toLowerCase(), name: p.name, cls: p.cls as ClassId, level: p.level, role: raidRole(p.cls), at: now, faction: p.faction });
    this.changed();
    if (this.list.length >= this.cfg.maxPlayers) this.launch();
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
    if (!this.list.length) return T("srv.muster.201");
    if (this.list[0].key !== key) return T("srv.muster.202");
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
  launch() {
    if (!this.list.length) return;
    const list = this.list;
    this.list = [];
    this.startAt = 0;
    this.notify(list.map((e) => e.key));
    this.start(list);
  }
  protected changed(extra: string[] = []) {
    this.notify([...this.list.map((e) => e.key), ...extra]);
  }

  /** Сколько недостаёт по ролям до состава size (роли — roleTargets; сперва недостающие роли, потом дальний и ближний бой). */
  static need(list: { role: RaidRole }[], size: number): Record<RaidRole, number> {
    const tg = roleTargets(Math.max(size, list.length));
    const need = {} as Record<RaidRole, number>;
    let free = Math.max(0, size - list.length);
    for (const r of RAID_ROLES) need[r] = 0;
    for (const r of RAID_ROLES) {
      const have = list.filter((e) => e.role === r).length;
      const n = Math.min(free, Math.max(0, tg[r] - have));
      need[r] = n;
      free -= n;
    }
    for (const r of ["ranged", "melee"] as RaidRole[]) if (free > 0) { need[r] += free; free = 0; }
    return need;
  }

  /**
   * Автосбор по ролям: делёж сбора на отряды размером [min, max] (число отрядов — сколько нужно, чтобы не превысить max;
   * хвост меньше min вливается в прежние). Танки и лекари раздаются по кругу первыми, затем бойцы — в самый малочисленный отряд.
   */
  static squads<E extends { role: RaidRole }>(list: E[], [min, max]: [number, number]): E[][] {
    if (!list.length) return [];
    let n = Math.max(1, Math.ceil(list.length / max));
    while (n > 1 && list.length / n < min) n--;
    const out: E[][] = Array.from({ length: n }, () => []);
    const order: RaidRole[] = ["tank", "healer", "melee", "ranged"];
    let i = 0;
    for (const r of order.slice(0, 2)) for (const e of list.filter((x) => x.role === r)) out[i++ % n].push(e);
    for (const r of order.slice(2)) for (const e of list.filter((x) => x.role === r)) out.reduce((a, b) => (b.length < a.length ? b : a)).push(e);
    return out;
  }
}

export class RaidMuster extends Muster {
  constructor(
    find: (key: string) => Player | undefined,
    /** Состав собран: создать инстанс рейда. */
    start: (list: MusterEntry[]) => void,
    /** Кому разослать raid:muster. */
    notify: (keys: string[]) => void,
    busy: (key: string) => string | null,
  ) {
    super({ minLevel: RAID_CFG.minLevel, maxPlayers: RAID_CFG.maxPlayers, ms: musterMs }, find, start, notify, busy);
  }

  /** Сколько ботов и каких ролей доберёт сервер. */
  static fill(list: { role: RaidRole }[]): Record<RaidRole, number> {
    return Muster.need(list, RAID_CFG.size);
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
