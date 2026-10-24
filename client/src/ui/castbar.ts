/**
 * Полоса каста (стили — styles/castbar.css), выбор пользователя «A + C»:
 *   a — рамка с заклёпками (LiteUI), золотое заполнение с бегущим бликом и искрой на конце, иконка слева, таймер справа:
 *       телепорт, добыча, касты умений героя (воскрешение, гимн, танец клинков...), каст босса рейда;
 *   c — кольцо вокруг иконки по центру над панелью умений, искра бежит по дуге, подпись на плашке: призыв маунта и питомца.
 * Ход заполнения — честный линейный по времени, кадры через requestAnimationFrame; вспышка успеха, трещина и затухание прерывания — CSS с easing.
 */
export type CastVariant = "a" | "c";
export type CastState = "cast" | "ok" | "fail";
export interface CastOpts {
  /** Картинка иконки (URL); не загрузилась или нет — знак glyph. */
  icon?: string;
  glyph?: string;
  /** Цвет каста (класс героя, школа); у босса — свой. */
  color?: string;
}

/** Зигзаг трещины по ширине 100 (viewBox 0 0 100 20): ломаная с отростками. */
const CRACK = `<svg class="cb-crack" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M-2 9 L14 12 L22 6 L33 13 L41 7 L50 12 L57 4 L66 14 L74 8 L83 12 L91 5 L102 10"/><path pathLength="1" d="M33 13 L36 19 M57 4 L60 0 M74 8 L77 2 M22 6 L19 0"/></svg>`;
const CRACK_RING = `<svg class="cb-crack" viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M10 18 L24 28 L20 36 L34 40 L30 50 L44 58"/><path pathLength="1" d="M24 28 L32 22 L44 24 M34 40 L46 38 L54 44"/></svg>`;


export class CastBar {
  readonly el: HTMLElement;
  private from = 0;
  private dur = 1;
  private raf = 0;
  private hideT = 0;
  private state: CastState | "idle" = "idle";
  private q = <T extends Element>(s: string) => this.el.querySelector(s) as T | null;

  /** boss — внутри рамки босса (в потоке), иначе — над панелью умений. */
  constructor(readonly variant: CastVariant, readonly boss = false) {
    const el = document.createElement("div");
    el.className = `cb cb-${variant} ${boss ? "cb-boss" : "cb-self"}`;
    el.setAttribute("role", "progressbar");
    el.setAttribute("aria-valuemin", "0");
    el.setAttribute("aria-valuemax", "100");
    const ico = `<div class="cb-ico"><img alt="" hidden><b></b></div>`;
    if (variant === "a") {
      el.innerHTML = `${ico}<div class="cb-track"><i class="cb-fill"><s class="cb-sheen"></s></i><b class="cb-tick" style="left:25%"></b><b class="cb-tick" style="left:50%"></b><b class="cb-tick" style="left:75%"></b><u class="cb-spark"></u><span class="cb-name"></span>${CRACK}<i class="cb-flash"></i></div><em class="cb-time"></em>`;
    } else {
      el.innerHTML = `<div class="cb-orb"><svg class="cb-ring" viewBox="0 0 64 64" aria-hidden="true"><circle class="cb-ring-bg" cx="32" cy="32" r="28"/><circle class="cb-ring-arc" cx="32" cy="32" r="28" pathLength="100"/></svg>${ico}<u class="cb-spark"></u><i class="cb-rv" style="--a:0deg"></i><i class="cb-rv" style="--a:90deg"></i><i class="cb-rv" style="--a:180deg"></i><i class="cb-rv" style="--a:270deg"></i>${CRACK_RING}<i class="cb-flash"></i><em class="cb-time"></em></div><div class="cb-plaque"><span class="cb-name"></span></div>`;
    }
    const img = el.querySelector("img");
    if (img) img.onerror = () => { img.hidden = true; };
    el.hidden = true;
    this.el = el;
  }

  get casting() { return this.state === "cast"; }

  start(name: string, ms: number, o: CastOpts = {}) {
    clearTimeout(this.hideT);
    this.from = performance.now();
    this.dur = Math.max(1, ms);
    this.state = "cast";
    const el = this.el;
    el.classList.remove("ok", "fail", "in");
    void el.offsetWidth;
    el.classList.add("in");
    el.hidden = false;
    if (o.color) el.style.setProperty("--cc", o.color); else el.style.removeProperty("--cc");
    const n = this.q<HTMLElement>(".cb-name");
    if (n) { n.textContent = name; n.dataset.name = name; }
    el.setAttribute("aria-label", name);
    const img = this.q<HTMLImageElement>(".cb-ico img");
    const g = this.q<HTMLElement>(".cb-ico b");
    if (img) { img.hidden = !o.icon; if (o.icon) img.src = o.icon; }
    if (g) g.textContent = o.glyph ?? "✦";
    this.draw(0);
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  /** ok: true — успех, false — прерывание, без аргумента — по времени (дошёл почти до конца — успех). */
  end(ok?: boolean) {
    if (this.state !== "cast") return;
    const p = this.progress();
    const good = ok ?? p > 0.9;
    cancelAnimationFrame(this.raf);
    this.state = good ? "ok" : "fail";
    if (good) this.draw(1);
    const n = this.q<HTMLElement>(".cb-name");
    if (n && !good) n.textContent = "Прервано";
    const t = this.q<HTMLElement>(".cb-time");
    if (t) t.textContent = "";
    this.el.classList.add(good ? "ok" : "fail");
    this.hideT = window.setTimeout(() => { this.el.hidden = true; this.el.classList.remove("ok", "fail", "in"); this.state = "idle"; }, good ? 520 : 760);
  }

  /** Убрать сразу, без вспышки. */
  clear() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.hideT);
    this.state = "idle";
    this.el.hidden = true;
  }

  private progress() { return Math.min(1, (performance.now() - this.from) / this.dur); }

  private tick = () => {
    if (this.state !== "cast") return;
    this.draw(this.progress());
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(p: number) {
    const el = this.el;
    el.style.setProperty("--p", String(p));
    el.setAttribute("aria-valuenow", String(Math.round(p * 100)));
    const t = this.q<HTMLElement>(".cb-time");
    if (t && this.state === "cast") {
      const left = Math.max(0, (this.dur * (1 - p)) / 1000);
      t.textContent = left.toFixed(1);
    }
  }
}

/** Запасной знак иконки по подписи каста (картинки маунта, питомца и умения подбирает hud). */
export function castGlyph(name: string): string {
  if (/^Телепорт/.test(name)) return "✦";
  if (/^Добыча/.test(name)) return "⛏";
  if (/Воскреш/.test(name)) return "✚";
  return name.trim().slice(0, 1).toUpperCase() || "✦";
}
