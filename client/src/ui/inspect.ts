/** Осмотр игрока: имя, класс, уровень, фракция и 7 вещей. ПКМ → «Осмотреть» или клик по рамке цели (docs/gear-visuals.md, раздел 3). */
import { CLASSES } from "../../../shared/classes";
import { FACTIONS, factionColor } from "../../../shared/factions";
import type { Item } from "../../../shared/items";
import type { InspectReply, SelfState } from "../../../shared/protocol";
import type { Net } from "../net";
import { gearRows } from "./gearfx";

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
    this.win.className = "panel win win-inspect";
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
    this.win.innerHTML = `<h2><span>Осмотр: ${esc(m.name)}</span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="insp-head"><span>${esc(cls)} · ур. ${m.lvl}</span><span style="color:${factionColor(m.fac)}">${esc(FACTIONS[m.fac]?.name ?? "")}</span></div>
      <div class="insp-body"></div>`;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => void this.close();
    const body = this.win.querySelector<HTMLElement>(".insp-body")!;
    body.append(gearRows(m.equip.map((e) => ({ slot: e.slot, item: e.item })), m.sid, {
      tip: (elm, it) => this.host.tipFor(elm, () => this.host.itemTip(it, this.net.self!)),
    }));
  }
}
