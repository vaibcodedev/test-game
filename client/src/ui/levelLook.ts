/**
 * Опыт и подъём уровня в HUD: тонкая сегментная полоска опыта над панелью умений (вспышка и «хвост» прироста, подсказка),
 * событие lvlook:xp с приростом (по нему game/effects.ts рисует «+N оп.» над героем) и надпись «Уровень N» по центру
 * со списком наград. HUD зовёт feed(self) при каждом обновлении состояния героя: из него считается прирост опыта.
 */
import type { SelfState } from "../../../shared/protocol";
import { xpToNext, statPointsAt, skillPointsAt } from "../../../shared/formulas";
import { SKILLS } from "../../../shared/skills";

/** Только для снимков: window.__lvlKeep — на сколько мс дольше держать надпись. */
const KEEP = () => Number((window as unknown as { __lvlKeep?: number }).__lvlKeep) || 0;
const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");
const h = (tag: string, cls: string, html = "") => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
const BANNER_MS = 2800;

export class LevelLook {
  /** Полоска опыта; HUD кладёт её над лентой умений. */
  readonly bar = h("div", "xpb", `<div class="xpb-track"><i class="xpb-gain"></i><i class="xpb-fill"></i><s class="xpb-seg"></s><b class="xpb-flash"></b></div><div class="xpb-tip"></div>`);
  private gainEl = this.bar.querySelector<HTMLElement>(".xpb-gain")!;
  private fillEl = this.bar.querySelector<HTMLElement>(".xpb-fill")!;
  private flashEl = this.bar.querySelector<HTMLElement>(".xpb-flash")!;
  private tipEl = this.bar.querySelector<HTMLElement>(".xpb-tip")!;
  private prev: { level: number; xp: number } | null = null;
  private timers: number[] = [];
  private banners: HTMLElement[] = [];

  feed(s: SelfState) {
    const prev = this.prev;
    this.prev = { level: s.level, xp: s.xp };
    // прирост опыта с прошлого обновления (с учётом пройденных уровней)
    let gain = 0, leveled = false;
    if (prev) {
      if (s.level > prev.level) {
        leveled = true;
        gain = xpToNext(prev.level) - prev.xp + s.xp;
        for (let l = prev.level + 1; l < s.level; l++) gain += xpToNext(l);
      } else if (s.level === prev.level) gain = s.xp - prev.xp;
    }
    this.paintBar(s, gain, leveled);
    if (gain > 0) window.dispatchEvent(new CustomEvent("lvlook:xp", { detail: { gain } }));
    if (leveled && prev) this.banner(prev.level, s);
  }

  private paintBar(s: SelfState, gain: number, leveled: boolean) {
    this.bar.hidden = !s.xpNext;
    if (!s.xpNext) return;
    const pct = Math.min(100, (s.xp / s.xpNext) * 100);
    this.tipEl.innerHTML = `<b>Опыт</b> ${fmt(s.xp)} / ${fmt(s.xpNext)}<br><span>До уровня ${s.level + 1}: ${fmt(s.xpNext - s.xp)} · ${pct.toFixed(1).replace(".", ",")}%</span>`;
    const set = (g: number, f: number) => { this.gainEl.style.width = `${g}%`; this.fillEl.style.width = `${f}%`; };
    const later = (ms: number, fn: () => void) => this.timers.push(window.setTimeout(fn, ms));
    const snap = (g: number, f: number) => { this.bar.classList.add("snap"); set(g, f); void this.bar.offsetWidth; this.bar.classList.remove("snap"); };
    this.timers.forEach(clearTimeout); this.timers = [];
    if (gain <= 0) { snap(pct, pct); return; }
    this.flashEl.classList.remove("on"); void this.flashEl.offsetWidth; this.flashEl.classList.add("on");
    const was = parseFloat(this.fillEl.style.width) || 0;
    if (!leveled) {
      set(pct, was);                       // «хвост»: новая часть сразу яркая, основная полоса догоняет позже
      later(750, () => set(pct, pct));
      return;
    }
    set(100, was);
    later(650, () => set(100, 100));
    later(1500, () => { snap(0, 0); set(pct, pct); });
  }

  /** Надпись «Уровень N» и награды; прежняя плашка-тост убрана. */
  private banner(from: number, s: SelfState) {
    const stat = statPointsAt(s.level) - statPointsAt(from), skill = skillPointsAt(s.level) - skillPointsAt(from);
    const fresh = Object.values(SKILLS).filter((d) => d.cls === s.cls && d.reqLevel > from && d.reqLevel <= s.level).map((d) => d.name).join(", ");
    const rows = [stat > 0 ? `<em>+${stat}</em> очк. характеристик <kbd>C</kbd>` : "", skill > 0 ? `<em>+${skill}</em> очк. умений <kbd>K</kbd>` : "", fresh ? `Новое умение: <b>${fresh}</b>` : ""].filter(Boolean);
    this.banners.forEach((b) => b.remove());
    const root = h("div", "lvb");
    root.style.setProperty("--lvb-dur", `${BANNER_MS / 1000}s`);
    root.innerHTML = `<div class="lvb-plate"><div class="lvb-k">Подъём уровня</div><div class="lvb-line"><i class="lvb-orn"></i><span>Уровень ${s.level}</span><i class="lvb-orn r"></i></div><div class="lvb-sub">${rows.map((r) => `<span>${r}</span>`).join("")}</div></div>`;
    document.body.append(root);
    this.banners = [root];
    setTimeout(() => root.remove(), BANNER_MS + 100 + KEEP());
  }
}
