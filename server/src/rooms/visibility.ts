/**
 * Фильтр видимости открытого мира (задача 76): каждому клиенту — только юниты в квадрате клеток вокруг его героя.
 * Сетка VIS_CELL px; юнит входит в видимость в пределах VIS_IN клеток (по Чебышёву) и уходит только дальше VIS_OUT —
 * гистерезис в одну клетку, юниты на границе не мигают. VIS_IN·VIS_CELL = 1536 px ≥ UNIT_NEAR клиента (1500) и с запасом
 * больше полуэкрана при самом дальнем зуме (1920×1080 / 1,75 → 549×309 px).
 * Всегда видны: свой герой, его питомец, цель, участники группы (их рамкам нужно здоровье). Скачок героя (телепорт, дверь,
 * смена клетки) пересчитывает вид в тот же тик — соседи приходят следующим патчем.
 * Игроки вне вида уходят лёгким каналом «dots» (точки на миникарте/карте мира) раз в VIS_DOTS_MS.
 */
import { StateView } from "@colyseus/schema";
import type { Client } from "@colyseus/core";
import type { OpenWorldState, Unit } from "./schema";
import type { World } from "../game/World";
import type { Player } from "../game/Player";
import { petUnitId } from "../../../shared/pets";

export const VIS_CELL = 512;
export const VIS_IN = 3;
export const VIS_OUT = 4;
/** Полный пересчёт всех видов (юниты вокруг тоже ходят). */
export const VIS_REFRESH_MS = 250;
/** Сдвиг героя, после которого вид пересчитывается сразу (телепорт). */
export const VIS_JUMP = 400;
export const VIS_DOTS_MS = 2000;

/** Только для замеров (tests/stateview.ts): VIS_OFF=1 — вид видит весь мир, как до фильтра. */
const VIS_OFF = process.env.VIS_OFF === "1";

const FACTION_CODE: Record<string, number> = { solgard: 1, umbrath: 2 };

interface Watcher {
  view: StateView;
  /** Видимые юниты → их id (по id проверяем, что юнит ещё в состоянии). */
  seen: Map<Unit, string>;
  x: number;
  y: number;
  cx: number;
  cy: number;
}

const cellOf = (v: number) => Math.floor(v / VIS_CELL);
const key = (cx: number, cy: number) => cx * 65536 + cy;

export class Visibility {
  private watchers = new Map<string, Watcher>();
  private grid = new Map<number, Unit[]>();
  private gridIds = new Map<Unit, string>();
  private gridTick = -1;
  private tickNo = 0;
  private lastFull = 0;
  private lastDots = 0;

  constructor(
    private state: OpenWorldState,
    private world: () => World,
    /** Юниты, которые герой видит всегда (группа). */
    private extra: (p: Player) => Iterable<Player | undefined>,
  ) {}

  /** Вход или переподключение: свой вид клиенту и сразу пересчёт (до первой отправки полного состояния). */
  attach(client: Client, p: Player) {
    const view = (client.view as StateView | undefined) ?? new StateView();
    client.view = view;
    let w = this.watchers.get(p.id);
    if (!w || w.view !== view) {
      w = { view, seen: new Map(), x: NaN, y: NaN, cx: NaN, cy: NaN };
      this.watchers.set(p.id, w);
    }
    this.gridTick = -1; // вне тика: сетку — заново
    this.refresh(w, p);
    // новый герой у соседей — в том же патче, что и вход (не ждём пересчёта)
    const cx = cellOf(p.unit.x), cy = cellOf(p.unit.y);
    for (const o of this.watchers.values())
      if (o !== w && !o.seen.has(p.unit) && Math.abs(o.cx - cx) <= VIS_IN && Math.abs(o.cy - cy) <= VIS_IN) {
        o.view.add(p.unit);
        o.seen.set(p.unit, p.id);
      }
  }
  detach(id: string) {
    this.watchers.delete(id);
  }
  /** Сколько юнитов видит клиент (тесты, отладка). */
  count(id: string) {
    return this.watchers.get(id)?.seen.size ?? 0;
  }
  sees(id: string, u: Unit) {
    return !!this.watchers.get(id)?.seen.has(u);
  }

  /** Каждый тик симуляции: скачки — сразу, остальное — раз в VIS_REFRESH_MS. */
  tick(now: number, send: (id: string, dots: number[]) => void) {
    this.tickNo++;
    const full = now - this.lastFull >= VIS_REFRESH_MS;
    if (full) this.lastFull = now;
    const w0 = this.world();
    for (const [id, w] of this.watchers) {
      const p = w0.players.get(id);
      if (!p) continue;
      const u = p.unit;
      const moved = cellOf(u.x) !== w.cx || cellOf(u.y) !== w.cy || Math.abs(u.x - w.x) > VIS_JUMP || Math.abs(u.y - w.y) > VIS_JUMP;
      if (full || moved) this.refresh(w, p);
    }
    if (now - this.lastDots >= VIS_DOTS_MS) {
      this.lastDots = now;
      this.sendDots(send);
    }
  }

  private buildGrid() {
    if (this.gridTick === this.tickNo) return;
    this.gridTick = this.tickNo;
    this.grid.clear();
    this.gridIds.clear();
    const put = (u: Unit, id: string) => {
      const k = key(cellOf(u.x), cellOf(u.y));
      let list = this.grid.get(k);
      if (!list) this.grid.set(k, (list = []));
      list.push(u);
      this.gridIds.set(u, id);
    };
    this.state.players.forEach(put);
    this.state.mobs.forEach(put);
  }

  private attached(u: Unit, id: string) {
    return this.state.mobs.get(id) === u || this.state.players.get(id) === u;
  }

  private refresh(w: Watcher, p: Player) {
    this.buildGrid();
    const me = p.unit, cx = cellOf(me.x), cy = cellOf(me.y);
    w.x = me.x; w.y = me.y; w.cx = cx; w.cy = cy;
    const next = new Map<Unit, string>();
    if (VIS_OFF) for (const list of this.grid.values()) for (const u of list) next.set(u, this.gridIds.get(u)!);
    else for (let dx = -VIS_IN; dx <= VIS_IN; dx++)
      for (let dy = -VIS_IN; dy <= VIS_IN; dy++) {
        const list = this.grid.get(key(cx + dx, cy + dy));
        if (list) for (const u of list) next.set(u, this.gridIds.get(u)!);
      }
    // гистерезис: уже видимый юнит уходит только за VIS_OUT клеток
    for (const [u, id] of w.seen)
      if (!next.has(u) && this.attached(u, id) && Math.abs(cellOf(u.x) - cx) <= VIS_OUT && Math.abs(cellOf(u.y) - cy) <= VIS_OUT) next.set(u, id);
    // всегда: свой герой, питомец, цель, группа
    const force = (u: Unit | undefined, id: string | null | undefined) => { if (u && id && this.attached(u, id)) next.set(u, id); };
    force(me, p.id);
    const pet = petUnitId(p.id);
    force(this.state.mobs.get(pet), pet);
    if (p.targetId) force(this.world().actor(p.targetId)?.unit, p.targetId);
    for (const m of this.extra(p)) if (m) force(m.unit, m.id);
    for (const u of w.seen.keys()) if (!next.has(u)) w.view.remove(u);
    for (const [u, id] of next) if (!w.seen.has(u)) {
      if (this.attached(u, id)) w.view.add(u);
      else next.delete(u); // сетка с прошлого тика: юнит уже убран из состояния
    }
    w.seen = next;
  }

  /** Игроки вне вида клиента: [x, y, фракция(0|1|2), ...] — точки на миникарте. */
  private sendDots(send: (id: string, dots: number[]) => void) {
    const all: Unit[] = [];
    this.state.players.forEach((u) => void all.push(u));
    for (const [id, w] of this.watchers) {
      const dots: number[] = [];
      // только свои: позиции врагов (и невидимок) по всей карте — это радар, их видно лишь в радиусе вида
      const fac = this.state.players.get(id)?.faction;
      for (const u of all) if (!w.seen.has(u) && !!fac && u.faction === fac) dots.push(Math.round(u.x), Math.round(u.y), FACTION_CODE[u.faction] ?? 0);
      send(id, dots);
    }
  }
}
