/**
 * DOM-слой вступления босса по дизайн-системе (styles/boss-intro.css): кинополосы с гравировкой, плашка-объявление с рамкой frame-b,
 * имя шрифтом заголовков по буквам, титул и подпись, герб фракции. Плашка — широкая полоса-объявление (выбор владельца). Анимации — CSS keyframes на --bi-dur (2,9 с по умолчанию).
 */
export interface BannerOpts {
  name: string;
  title: string;
  /** «Босс кольца», «Повелитель зоны» и т. п. */
  kicker?: string;
  /** подпись снизу: зона или место */
  sub?: string;
  /** цвет босса, 0xRRGGBB */
  color?: number;
  /** фракция для герба: sol / umb / none */
  crest?: "sol" | "umb" | "none";
  durMs?: number;
  /** родитель; по умолчанию body */
  parent?: HTMLElement;
}

const el = (tag: string, cls: string, text?: string) => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export class BossBanner {
  readonly root: HTMLElement;
  private gone = false;
  constructor(o: BannerOpts) {
    const root = this.root = el("div", "bi-root");
    root.style.setProperty("--bi-dur", `${(o.durMs ?? 2900) / 1000}s`);
    if (o.color !== undefined) root.style.setProperty("--c", "#" + o.color.toString(16).padStart(6, "0"));
    root.append(el("div", "bi-vig"), el("div", "bi-flash"), el("div", "bi-bar top"), el("div", "bi-bar bot"));
    const plate = el("div", "bi-plate");
    const k = el("div", "bi-k");
    const crest = o.crest ?? "none";
    const ic = () => { const i = document.createElement("img"); i.src = `/ui/war/icon-${crest}.png`; i.alt = ""; return i; };
    k.append(ic(), el("span", "bi-c", o.kicker ?? "Босс"), ic());
    const name = el("h1", "bi-name");
    [...o.name.toUpperCase()].forEach((ch, i) => { const s = el("span", ch === " " ? "bi-sp" : "bi-l", ch === " " ? "" : ch); s.style.setProperty("--i", String(i)); name.append(s); });
    name.setAttribute("aria-label", o.name);
    plate.append(k, el("div", "bi-rule"), name, el("p", "bi-t", o.title));
    if (o.sub) plate.append(el("p", "bi-sub", o.sub));
    root.append(plate);
    (o.parent ?? document.body).append(root);
    // кино-режим: на время вступления интерфейс (#ui — рамки, чат, миникарта, панель умений) плавно прячется
    BossBanner.live++; document.body.classList.add("bi-cine");
    // страховка: владелец мог не вызвать destroy (вкладка в фоне, сбой) — плашка снимает себя сама
    this.guard = setTimeout(() => this.destroy(), (o.durMs ?? 2900) + 2000);
  }
  private guard: ReturnType<typeof setTimeout>;
  /** Сколько плашек сейчас на экране — кино-режим снимается с последней. */
  private static live = 0;
  /** Быстро погасить и убрать (пропуск). */
  skip() { if (this.gone) return; this.root.classList.add("out"); setTimeout(() => this.destroy(), 230); }
  destroy() {
    clearTimeout(this.guard);
    if (!this.gone && --BossBanner.live <= 0) { BossBanner.live = 0; document.body.classList.remove("bi-cine"); }
    this.gone = true; this.root.remove();
  }
}
