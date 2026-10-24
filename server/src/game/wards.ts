/**
 * Обереги (задача 132, шаг 6; решение 3: невидимок ловят только обереги; числа и места — data/patrols.json wards).
 * NPC скрытность не видят, поэтому у ворот мостов, поселений и фортов стоят обереги: скрытый враг фракции оберега в его радиусе
 * раскрыт (скрытность снята) и получает «Раскрыт» — revealMs нельзя снова скрыться ни умением, ни пассивкой; оберег зовёт бойцов
 * своей фракции в callRadius (Soldiers.call). Свои не раскрываются, запрета скрытности на чужой земле нет.
 * Здесь же: при входе в город скрытность снимается.
 */
import P from "../../../data/patrols.json";
import { TILE } from "../../../shared/constants";
import type { Player } from "./Player";
import type { Soldiers } from "./soldiers";
import type { World } from "./World";

const WD = P.wards;
export interface Ward { x: number; y: number; faction: string; at: string }
export const WARDS: Ward[] = WD.list.map((o) => ({ x: (o.x + 0.5) * TILE, y: (o.y + 0.5) * TILE, faction: o.faction, at: o.at }));

/** «Раскрыт»: до какого времени мира герою нельзя скрыться. */
const revealed = new WeakMap<Player, number>();
/** Умения и пассивки скрытности (для отката на кнопке). */
const STEALTH_SKILLS = ["stealth", "dr_shadowmeld", "as_smoke"];

/** Сколько мс ещё действует «Раскрыт» (0 — можно скрыться). */
export function revealedLeft(w: World, p: Player): number {
  return Math.max(0, (revealed.get(p) ?? 0) - w.time);
}
/** Отказ в скрытности под «Раскрыт» (умения: текст ошибки; пассивки — просто не срабатывают). */
export function stealthBan(w: World, p: Player): string | null {
  const ms = revealedLeft(w, p);
  return ms > 0 ? `Раскрыт: скрыться нельзя ещё ${Math.ceil(ms / 1000)} с` : null;
}

export class Wards {
  private scanAt = 0;
  constructor(private w: World, private soldiers: Soldiers) {}

  update() {
    const w = this.w, t = w.time;
    if (t < this.scanAt) return;
    this.scanAt = t + WD.scanMs;
    for (const p of w.players.values()) {
      if (p.dead || p.stealthUntil <= t || w.players.get(p.id) !== p) continue;
      // в городе скрытности нет: вошёл скрытым — раскрыт (без «Раскрыт»: в городе скрыться и так нельзя)
      if (w.inTown(p.x, p.y)) { this.unhide(p); continue; }
      if (p.team !== 0 || !p.faction) continue;
      const ward = WARDS.find((o) => o.faction !== p.faction && Math.hypot(o.x - p.x, o.y - p.y) <= WD.radius);
      if (ward) this.reveal(p, ward);
    }
  }

  private unhide(p: Player) {
    p.stealthUntil = 0;
    this.w.emit({ t: "aoe", k: "shadow", x: p.x, y: p.y, r: 40 });
  }

  /** Оберег раскрыл врага: скрытность снята, «Раскрыт» на revealMs, бойцы фракции оберега рядом идут на него. */
  reveal(p: Player, ward: Ward) {
    const w = this.w, t = w.time;
    this.unhide(p);
    revealed.set(p, t + WD.revealMs);
    // вспышка оберега: волна у его подножия (клиент — лист ward-reveal-sol/umb, tools/gen/wards.ts)
    w.emit({ t: "aoe", k: ward.faction === "umbrath" ? "ward_umb" : "ward_sol", x: ward.x, y: ward.y + TILE / 2 - 2, r: 60 });
    p.send("toast", { text: `Оберег раскрыл вас! ${WD.revealMs / 1000} с нельзя скрыться`, kind: "error" });
    // откат на кнопках скрытности — не короче «Раскрыт»
    for (const id of STEALTH_SKILLS) {
      if (!p.save.skills?.[id]) continue;
      const left = Math.max((p.cds.get(id) ?? 0) - t, WD.revealMs);
      p.send("cd", { id, ms: left });
    }
    this.soldiers.call(p, ward.x, ward.y, WD.callRadius, ward.faction);
  }
}
