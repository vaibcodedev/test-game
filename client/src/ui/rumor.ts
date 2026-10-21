/** Диалог городского сплетника: имя NPC, один слух, кнопки «Ещё слух» и «Пока». */
import type { RumorMsg } from "../../../shared/rumors";
import type { Net } from "../net";

export class RumorUI {
  private win = document.createElement("div");
  private net!: Net;
  private npc = "";
  private name = "";
  private coolUntil = 0;
  private title: HTMLElement;
  private say: HTMLElement;

  constructor(root: HTMLElement) {
    this.win.className = "panel win s win-rumor";
    this.win.hidden = true;
    // каркас строится один раз: при «Ещё слух» меняется только реплика, фокус остаётся на кнопке
    this.win.innerHTML = `<h2><span></span><button class="x" aria-label="Закрыть">×</button></h2>
      <div class="body"><p class="npc-say" aria-live="polite"></p></div>
      <div class="win-foot"><div class="actions"><button class="btn bye">Пока</button><button class="btn primary more">Ещё слух</button></div></div>`;
    this.title = this.win.querySelector<HTMLElement>("h2 > span")!;
    this.say = this.win.querySelector<HTMLElement>(".npc-say")!;
    this.win.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.close();
    this.win.querySelector<HTMLButtonElement>(".bye")!.onclick = () => this.close();
    this.win.querySelector<HTMLButtonElement>(".more")!.onclick = () => {
      if (performance.now() < this.coolUntil) return;
      this.render(null);
      this.ask();
    };
    root.append(this.win);
  }

  bind(net: Net) {
    this.net = net;
    net.on("rumor", (m) => {
      if (m.npc === this.npc) this.render(m);
    });
  }

  open(npc: string, name: string) {
    this.npc = npc;
    this.name = name;
    this.win.hidden = false;
    this.render(null);
    this.ask();
  }
  close(): boolean {
    const was = !this.win.hidden;
    this.win.hidden = true;
    return was;
  }

  private ask() {
    this.coolUntil = performance.now() + 1000;
    this.net.send("rumor", { npc: this.npc });
  }

  /** null — слух ещё в пути: вместо текста многоточие. */
  private render(m: RumorMsg | null) {
    this.title.textContent = this.name;
    this.say.textContent = m ? m.text : "…";
    this.say.classList.toggle("c-dim", !m);
  }
}
