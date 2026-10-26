/** Окно истории статуи правителя (задача 141): клик по статуе в столице — имя, титул, надпись на табличке и абзацы истории (data/statues.json). Только клиент. */
import data from "../../../data/statues.json";

export type StatueKey = "solgard" | "umbrath";
type Entry = { name: string; title: string; plaque: string; text: string[] };
export const STATUES = data as unknown as Record<StatueKey, Entry> & { _doc: string };

export class StatueUI {
  private win = document.createElement("div");
  private title: HTMLElement;
  private sub: HTMLElement;
  private plaque: HTMLElement;
  private text: HTMLElement;

  constructor(root: HTMLElement) {
    this.win.className = "panel win m win-statue";
    this.win.hidden = true;
    this.win.innerHTML = `<h2><span class="st-name"></span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="body"><p class="meta st-title"></p><p class="st-plaque"></p><div class="st-text"></div></div>`;
    this.title = this.win.querySelector<HTMLElement>(".st-name")!;
    this.sub = this.win.querySelector<HTMLElement>(".st-title")!;
    this.plaque = this.win.querySelector<HTMLElement>(".st-plaque")!;
    this.text = this.win.querySelector<HTMLElement>(".st-text")!;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.close();
    root.append(this.win);
  }

  open(key: StatueKey) {
    const e = STATUES[key];
    if (!e) return;
    this.title.textContent = e.name;
    this.sub.textContent = e.title;
    this.plaque.textContent = e.plaque;
    this.text.replaceChildren(...e.text.map((t) => { const p = document.createElement("p"); p.textContent = t; return p; }));
    this.win.dataset.statue = key;
    this.win.hidden = false;
  }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    return was;
  }
}
