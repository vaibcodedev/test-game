/** Осмотр игрока: имя, класс, уровень, фракция и 7 вещей. ПКМ → «Осмотреть» или клик по рамке цели (docs/art/gear.md, раздел 3). */
import { CLASSES } from "../../../shared/classes";
import { FACTIONS, factionColor } from "../../../shared/factions";
import { iconFor, slotGhost, type Item } from "../../../shared/items";
import type { InspectReply, SelfState } from "../../../shared/protocol";
import type { Net } from "../net";
import { gearRows } from "./gearfx";
import { T } from "../../../shared/texts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface InspectHost {
  /** Подсказка предмета без цены и подсказок по клику, со сравнением с моей вещью. */
  itemTip(it: Item, s: SelfState): string;
  tipFor(elm: HTMLElement, html: () => string): void;
}

export class InspectUI {
  private win = document.createElement("div");
  private net!: Net;

  constructor(root: HTMLElement, private host: InspectHost) {
    this.win.className = "panel win win-inspect m";
    this.win.hidden = true;
    root.append(this.win);
  }

  bind(net: Net) {
    this.net = net;
    net.on("inspect", (m) => this.show(m));
    net.on("switch", () => void this.close());
  }

  /** Запросить осмотр игрока по id сессии; окно откроется, когда придёт ответ сервера. */
  open(sid: string) {
    this.net.send("inspect", { sid });
  }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    return was;
  }

  private show(m: InspectReply) {
    const cls = CLASSES[m.cls]?.name ?? m.cls;
    this.win.hidden = false;
    this.win.innerHTML = `<h2><span>${T("ui.inspect.649", { name: esc(m.name) })}</span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="body">
        <section class="sec flat">
          <div class="sec-head"><h3 class="sec-h">${T("ui.arena.338")}</h3><span class="chip dim">${T("ui.inspect.650", { lvl: m.lvl })}</span></div>
          <dl class="kv"><dt>${T("ui.arena.339")}</dt><dd>${esc(cls)}</dd><dt>${T("ui.charselect.408")}</dt><dd style="color:${factionColor(m.fac)}">${esc(FACTIONS[m.fac]?.name ?? "—")}</dd></dl>
        </section>
        <section class="sec gear-block"><div class="sec-head"><h3 class="sec-h">${T("ui.hud.588")}</h3></div></section>
      </div>`;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => void this.close();
    const body = this.win.querySelector<HTMLElement>(".gear-block")!;
    body.append(gearRows(m.equip.map((e) => ({ slot: e.slot, item: e.item })), m.sid, {
      tip: (elm, it) => this.host.tipFor(elm, () => this.host.itemTip(it, this.net.self!)),
      ghost: (slot) => (CLASSES[m.cls] ? iconFor({ base: slotGhost(m.cls, slot), stats: {}, uid: "slot", rarity: 0 }) : undefined),
    }));
  }
}
