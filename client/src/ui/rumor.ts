/** Диалог городского сплетника: имя NPC, один слух, кнопки «Ещё слух» и «Пока». */
import type { RumorMsg } from "../../../shared/rumors";
import type { Net } from "../net";
import { T } from "../../../shared/texts";

export class RumorUI {
  private win = document.createElement("div");
  private net!: Net;
  private npc = "";
  private name = "";
  /** Запрос в пути: повторное нажатие не шлётся (кнопка занята), но отклик на нажатие мгновенный — старый слух сразу уходит. */
  private pending = false;
  private askedAt = 0;
  private timer = 0;
  private more: HTMLButtonElement;
  private title: HTMLElement;
  private say: HTMLElement;

  constructor(root: HTMLElement) {
    this.win.className = "panel win s win-rumor";
    this.win.hidden = true;
    // каркас строится один раз: при «Ещё слух» меняется только реплика, фокус остаётся на кнопке
    this.win.innerHTML = `<h2><span></span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="body"><p class="npc-say" aria-live="polite"></p></div>
      <div class="win-foot"><div class="actions"><button class="btn bye">${T("ui.encounter.478")}</button><button class="btn primary more">${T("ui.rumor.671")}</button></div></div>`;
    this.title = this.win.querySelector<HTMLElement>("h2 > span")!;
    this.say = this.win.querySelector<HTMLElement>(".npc-say")!;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.close();
    this.win.querySelector<HTMLButtonElement>(".bye")!.onclick = () => this.close();
    this.more = this.win.querySelector<HTMLButtonElement>(".more")!;
    this.more.onclick = () => { if (!this.pending) this.ask(); };
    root.append(this.win);
  }

  bind(net: Net) {
    this.net = net;
    net.on("rumor", (m) => {
      if (m.npc === this.npc && this.pending) this.settle(m);
    });
  }

  open(npc: string, name: string) {
    this.npc = npc;
    this.name = name;
    this.win.hidden = false;
    this.title.textContent = this.name;
    this.say.textContent = "…";
    this.say.classList.add("c-dim");
    this.ask();
  }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    return was;
  }

  /** Сразу: старый слух уходит (fade-out), кнопка занята; ответ проявляется не раньше конца ухода. Нет ответа 2,5 с — слух возвращается, кнопка свободна. */
  private ask() {
    this.pending = true;
    this.askedAt = performance.now();
    this.more.disabled = true;
    this.say.classList.add("swap-out");
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.settle(null), 2500);
    this.net.send("rumor", { npc: this.npc });
  }

  private settle(m: RumorMsg | null) {
    clearTimeout(this.timer);
    const wait = Math.max(0, 180 - (performance.now() - this.askedAt));
    this.timer = window.setTimeout(() => {
      this.pending = false;
      this.more.disabled = false;
      if (m) { this.say.textContent = m.text; this.say.classList.remove("c-dim"); }
      this.say.classList.remove("swap-out");
    }, wait);
  }
}
