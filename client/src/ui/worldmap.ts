/** Полная карта мира: масштаб и перетаскивание, подписи с плотностью по масштабу, маркер героя, подсказки, легенда.
 *  Режим выбора точки (beginPick, телепорт админа из ui/admin.ts): прицел, подсказка, под курсором тайл и зона; клик без перетаскивания отдаёт точку. */
import { CITIES, cityKnown } from "../../../shared/cities";
import { RAID, RAID_GATE } from "../../../shared/raid";
import { factionColor, landLabel, type FactionId } from "../../../shared/factions";
import { TILE } from "../../../shared/constants";
import { DANGER_LABEL, DUNGEON_DOOR, PLACES, ZONES, type WorldMap } from "../../../shared/map";
import { DUNGEON_EXIT, DUNGEON_EXIT_LABEL } from "../../../shared/dungeon";
import { drawDgIcon } from "./dungeonIcon";
import { net } from "../net";
import world from "../../../data/world.json";
import { P } from "../../../shared/palette";
import { buildZoneLabels, type Label } from "./worldmap-labels";
import { T } from "../../../shared/texts";
import { drawWarMap, openWarRules, WAR_BASE_NAMES } from "./bannerWar";
import { drawSiegeMap } from "./siege";
import { drawWbMap, wbBadgeRects } from "./wboss";
import { MOBS } from "../../../shared/mobs";

const TEXT = `"Rubik", "Trebuchet MS", system-ui, sans-serif`;
/** Оформление подписей — как на схеме tools/map-plan.ts: Rubik, крупные числа уровней жирным, названия обычным, тёмная обводка ~3 px под заливкой.
 *  Кегли и начертания — шкала токенов (styles/tokens.css: --fs-xs 12, --fs-sm 13, --fs 14, --fs-md 16, --fs-lg 18, --fs-h 20; --fw 400, --fw-b 600). */
const FS = { xs: 12, sm: 13, base: 14, md: 16, lg: 18, h: 20 } as const;
const font = (px: number, bold = false) => `${bold ? 600 : 400} ${px}px ${TEXT}`;
/** Строка блока подписи; pill — цвет плашки под строкой (как «ОПАСНАЯ ЗОНА» на схеме). */
/** Проверка места без рисования: true — проверить; "pair" — для зеркальных пар: подпись за краем экрана место не занимает и пару не прячет
 *  (при приближении к одной стороне её подписи видны, хотя зеркальные за экраном); если на экране обе — рисуются обе или ни одной. */
type Dry = boolean | "pair";
interface Line { text: string; size: number; bold?: boolean; fill: string; pill?: string }
const CITY = "#d8dce6"; // нейтральный город — серебро
const KIND_NAME: Record<string, string> = { settlement: T("ui.worldmap.719"), camp: T("ui.worldmap.720"), ruins: T("ui.worldmap.721"), meeting: T("ui.worldmap.722") };
const KIND_COLOR: Record<string, string> = { settlement: "#e8d8a8", camp: "#e0705a", ruins: "#b8a8d8", meeting: "#8ad8c8" };
const ROADS = Object.entries(world.roads as unknown as Record<string, unknown>).filter(([k]) => k !== "_doc").map(([, v]) => v as [number, number][]);
const RIVERS = Object.entries(world.rivers as unknown as Record<string, { width: number; path: [number, number][] }>).filter(([k]) => k !== "_doc").map(([name, r]) => ({ name, ...r }));
const SIGNS = (world.signs.list as { x: number; y: number; text: string }[]);

/** Подпись зоны второй строкой и её цвет: опасность цветом токена (кольцо — янтарный, Поля — красный) или земли фракции её цветом; как на миникарте. */
const zoneTag = (z: { danger?: "unsafe" | "deadly"; land?: FactionId }): { text: string; color: string } | null =>
  z.danger ? { text: DANGER_LABEL[z.danger], color: z.danger === "deadly" ? P.bad : P.warn } : z.land ? { text: landLabel(z.land), color: factionColor(z.land) } : null;
/** Значки карты (tools/gen/wm-icons.ts → client/public/assets/ui/wm): легенда и значок босса на самой карте. */
const WM_ICON = (n: string) => `/assets/ui/wm/${n}.png`;
const wmImgs = new Map<string, HTMLImageElement>();
const wmImg = (n: string) => { let i = wmImgs.get(n); if (!i) { i = new Image(); i.src = WM_ICON(n); wmImgs.set(n, i); } return i; };
const drawWmIcon = (g: CanvasRenderingContext2D, n: string, x: number, y: number) => { const i = wmImg(n); if (i.complete && i.naturalWidth) g.drawImage(i, Math.round(x) - 7, Math.round(y) - 7, 14, 14); };
const PLACE_ICON: Record<string, string> = { settlement: "house", camp: "camp", ruins: "ruin", meeting: "meet" };
/** Сдвиги подписи-блока (px экрана), от ближайших к дальним. */
const BLOCK_SHIFTS: [number, number][] = (() => { const o: [number, number][] = []; for (let dx = -120; dx <= 120; dx += 12) for (let dy = -60; dy <= 60; dy += 6) if (dx || dy) o.push([dx, dy]); return o.sort((a, b) => Math.hypot(a[0], a[1] * 2) - Math.hypot(b[0], b[1] * 2)); })();
interface Hit { x: number; y: number; r: number; title: string; sub: string }

export class WorldMapView {
  readonly root = document.createElement("div");
  private cv = document.createElement("canvas");
  private tip = document.createElement("div");
  private wrap = document.createElement("div");
  private s = 1; // px на тайл
  private cx = 0; private cy = 0; // центр вида, тайлы
  private fit = 1;
  private W = 0; private H = 0;
  private zoneLabels: Label[] = [];
  /** Подписи «Земли Сольгарда / Умбрата» — по одной на сторону, в центре подписей её зон: рисуются раньше поселений и зон, поэтому видны при любом масштабе. */
  private landLabels: { x: number; y: number; land: FactionId }[] = [];
  /** Зеркальные пары мест (x → w − 1 − x, тот же y и вид). */
  private placePair = new Map<(typeof PLACES)[number], (typeof PLACES)[number]>();
  private bridges: { x: number; y: number }[] = [];
  private hits: Hit[] = [];
  private mouse: { x: number; y: number } | null = null;
  private drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  private raf = 0;
  private face = Math.PI / 2;
  private prev: { x: number; y: number } | null = null;
  private inited = false;
  /** Выбор точки: onPick — клик по карте (пиксели мира, центр тайла), onCancel — карта закрыта без выбора. */
  private pick: { onPick: (x: number, y: number) => void; onCancel: () => void } | null = null;
  private hint = document.createElement("span");

  constructor(private map: WorldMap, private base: () => HTMLCanvasElement | null, private getPos: () => { x: number; y: number }, private getKnown: () => { known?: string[]; faction?: string }, private win: HTMLElement) {
    this.root.className = "wm";
    const bar = document.createElement("div");
    bar.className = "wm-bar";
    const btn = (t: string, title: string, fn: () => void, icon?: string) => {
      const b = document.createElement("button");
      b.className = icon ? "btn wm-btn wm-btn-ic" : "btn wm-btn";
      if (icon) b.innerHTML = `<img src="${WM_ICON(icon)}" alt="">`;
      b.append(t);
      b.title = title;
      b.onclick = fn;
      bar.append(b);
    };
    btn("+", T("ui.worldmap.723"), () => this.zoomAt(1.5, this.W / 2, this.H / 2));
    btn("−", T("ui.worldmap.724"), () => this.zoomAt(1 / 1.5, this.W / 2, this.H / 2));
    btn(T("ui.worldmap.725"), T("ui.worldmap.726"), () => this.reset());
    btn(T("ui.worldmap.727"), T("ui.worldmap.728"), () => this.centerMe(), "center");
    this.hint.className = "chip";
    this.hint.textContent = T("ui.worldmap.309");
    this.hint.hidden = true;
    bar.append(this.hint);
    const leg = document.createElement("div");
    leg.className = "wm-legend";
    const it = (n: string, t: string) => `<span class="wm-it"><img src="${WM_ICON(n)}" alt="">${t}</span>`;
    const sw = (c: string, t: string) => `<span class="wm-it"><i style="background:${c}"></i>${t}</span>`;
    leg.innerHTML = `<span class="wm-lg">${it("you", "Вы")}${it("city", T("ui.worldmap.729"))}${it("house", T("ui.worldmap.719"))}${it("camp", T("ui.worldmap.720"))}${it("ruin", T("ui.worldmap.721"))}${it("boss", "Босс")}</span><span class="wm-lg"><span class="wm-it"><i class="road"></i>${T("ui.worldmap.730")}</span><span class="wm-it"><i class="river"></i>${T("ui.worldmap.731")}</span></span><span class="wm-lg">${sw(factionColor("solgard"), T("ui.worldmap.732"))}${sw(factionColor("umbrath"), T("ui.worldmap.733"))}</span>`;
    this.wrap.className = "wm-view";
    this.wrap.style.setProperty("--wm-ar", String(map.w / map.h)); // рамка по карте, без тёмных полос
    this.tip.className = "wm-tip";
    this.tip.hidden = true;
    this.wrap.append(this.cv, this.tip);
    this.root.append(bar, this.wrap, leg); // легенда — картушем на нижней кромке карты
    for (const p of PLACES) { const q = PLACES.find((o) => o !== p && o.kind === p.kind && o.y === p.y && o.x === map.w - 1 - p.x); if (q) this.placePair.set(p, q); }
    const lb = buildZoneLabels(map);
    this.zoneLabels = lb.zoneLabels;
    this.landLabels = lb.landLabels;
    for (const o of map.objects) if (o.kind === "bridge_h" || o.kind === "bridge_v") this.bridges.push({ x: o.x / TILE, y: o.y / TILE });

    new ResizeObserver(() => this.resize()).observe(this.wrap);
    const cv = this.cv;
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const c = this.toCanvas(e);
      this.zoomAt(e.deltaY < 0 ? 1.25 : 0.8, c.x, c.y);
    }, { passive: false });
    cv.addEventListener("pointerdown", (e) => {
      cv.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy, moved: false };
    });
    cv.addEventListener("pointermove", (e) => {
      const c = this.toCanvas(e);
      this.mouse = { x: c.x, y: c.y };
      const d = this.drag;
      if (d) {
        const dx = (e.clientX - d.x) / c.k, dy = (e.clientY - d.y) / c.k; // в пикселях холста (под CSS zoom корня интерфейса экранные пиксели крупнее)
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        this.cx = d.cx - dx / this.s;
        this.cy = d.cy - dy / this.s;
        this.clamp();
      }
    });
    cv.addEventListener("pointerup", (e) => {
      const d = this.drag;
      this.drag = null;
      // перетаскивание (сдвиг больше порога) кликом не считается
      if (this.pick && d && !d.moved && e.button === 0) {
        const c = this.toCanvas(e);
        this.commitPick(c.x, c.y);
      }
      // щелчок по основанию «Знамён Предела» — окно правил битвы
      else if (!this.pick && d && !d.moved && e.button === 0) {
        const { x: mx, y: my } = this.toCanvas(e);
        if (this.hits.some((h) => WAR_BASE_NAMES.has(h.title) && Math.hypot(h.x - mx, h.y - my) <= h.r)) openWarRules();
      }
    });
    cv.addEventListener("pointercancel", () => (this.drag = null));
    cv.addEventListener("pointerleave", () => { this.mouse = null; });
    cv.addEventListener("dblclick", (e) => {
      const c = this.toCanvas(e);
      this.zoomAt(2, c.x, c.y);
    });
  }

  /** Единый перевод «экран → холст карты» для всех попаданий и жестов: k — отношение экранных пикселей к пикселям холста (CSS zoom корня интерфейса, масштаб UI ≠ 100 %). */
  private toCanvas(e: { clientX: number; clientY: number }): { x: number; y: number; k: number } {
    const r = this.cv.getBoundingClientRect();
    const k = this.cv.clientWidth > 0 ? r.width / this.cv.clientWidth : 1;
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, k };
  }

  open() {
    this.resize();
    if (!this.inited) { this.reset(); this.inited = true; }
    this.prev = null;
    cancelAnimationFrame(this.raf);
    const loop = () => {
      if (this.win.hidden) { this.endPick(true); return; } // окно закрыли (Esc, ×, клавиша карты): выбор отменён
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  /** Включает выбор точки: вызывать после open(). Клик без перетаскивания → onPick(x, y) в пикселях мира (центр тайла), затем карта закрывается;
   *  закрытие карты без выбора (Esc, ×) → onCancel. Что делать с точкой (телепорт), решает вызывающий. */
  beginPick(onPick: (x: number, y: number) => void, onCancel: () => void) {
    this.endPick(true);
    this.pick = { onPick, onCancel };
    this.root.classList.add("picking");
    this.hint.hidden = false;
  }
  private endPick(cancel: boolean) {
    const p = this.pick;
    if (!p) return;
    this.pick = null;
    this.root.classList.remove("picking");
    this.hint.hidden = true;
    if (cancel) p.onCancel();
  }
  /** Клик по карте в режиме выбора: точка — центр тайла под курсором; за краем мира клик пропускается. */
  private commitPick(px: number, py: number) {
    const p = this.pick, t = this.tileAt(px, py);
    if (!p || !t) return;
    this.endPick(false);
    p.onPick((t.x + 0.5) * TILE, (t.y + 0.5) * TILE);
    this.win.hidden = true;
  }
  /** Подсказка зоны тайла: название и опасность («Небезопасная зона» — кольцо 40–80, «Опасная зона» — Поля вечных битв) или земли фракции. */
  private tileZoneText(x: number, y: number): string {
    const zi = ZONES[this.map.zone[y * this.map.w + x]];
    if (!zi) return "";
    const tag = zi.safe ? null : zoneTag(zi);
    return tag ? `${zi.name} · ${tag.text}` : zi.name;
  }
  /** Тайл под точкой холста (пиксели от его левого верхнего угла); null — вне мира. */
  private tileAt(px: number, py: number): { x: number; y: number } | null {
    const x = Math.floor(this.cx + (px - this.W / 2) / this.s), y = Math.floor(this.cy + (py - this.H / 2) / this.s);
    return x < 0 || y < 0 || x >= this.map.w || y >= this.map.h ? null : { x, y };
  }

  private resize() {
    const w = this.wrap.clientWidth, h = this.wrap.clientHeight;
    if (w < 10 || h < 10) return;
    const dpr = window.devicePixelRatio || 1;
    this.W = w; this.H = h;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.fit = Math.min(w / this.map.w, h / this.map.h);
    if (this.s < this.fit) this.s = this.fit;
    this.clamp();
  }
  private reset() {
    this.s = this.fit;
    this.cx = this.map.w / 2; this.cy = this.map.h / 2;
    this.clamp();
  }
  private centerMe() {
    const p = this.getPos();
    this.s = Math.max(this.s, this.fit * 2.5, 3);
    this.cx = p.x / TILE; this.cy = p.y / TILE;
    this.clamp();
  }
  private zoomAt(f: number, px: number, py: number) {
    const wx = this.cx + (px - this.W / 2) / this.s, wy = this.cy + (py - this.H / 2) / this.s;
    this.s = Math.max(this.fit, Math.min(14, this.s * f));
    this.cx = wx - (px - this.W / 2) / this.s;
    this.cy = wy - (py - this.H / 2) / this.s;
    this.clamp();
  }
  private clamp() {
    const hw = this.W / 2 / this.s, hh = this.H / 2 / this.s;
    this.cx = hw * 2 >= this.map.w ? this.map.w / 2 : Math.max(hw, Math.min(this.map.w - hw, this.cx));
    this.cy = hh * 2 >= this.map.h ? this.map.h / 2 : Math.max(hh, Math.min(this.map.h - hh, this.cy));
  }

  private draw() {
    if (!this.W) return;
    const m = this.map, s = this.s, dpr = window.devicePixelRatio || 1;
    const g = this.cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = P.well;
    g.fillRect(0, 0, this.W, this.H);
    const X = (tx: number) => this.W / 2 + (tx - this.cx) * s, Y = (ty: number) => this.H / 2 + (ty - this.cy) * s;
    g.imageSmoothingEnabled = false;
    const base = this.base();
    if (base) g.drawImage(base, X(0), Y(0), m.w * s, m.h * s);
    const big = m.w > 200;
    // реки и дороги
    if (big) {
      g.lineCap = "round"; g.lineJoin = "round";
      for (const r of RIVERS) {
        g.strokeStyle = "rgba(70,140,220,0.8)";
        g.lineWidth = Math.max(2, r.width * 2 * s);
        g.beginPath();
        r.path.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.stroke();
      }
      g.strokeStyle = "rgba(240,215,150,0.85)";
      g.lineWidth = Math.max(1.2, s * 0.9);
      for (const road of ROADS) {
        g.beginPath();
        road.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.stroke();
      }
      for (const b of this.bridges) {
        g.fillStyle = "#7a4a22";
        g.fillRect(X(b.x) - 3, Y(b.y) - 3, 6, 6);
        g.strokeStyle = "#e8c890";
        g.lineWidth = 1;
        g.strokeRect(X(b.x) - 3, Y(b.y) - 3, 6, 6);
      }
    }
    // виньетка границы мира
    g.strokeStyle = "#5a4a38";
    g.lineWidth = 2;
    g.strokeRect(X(0), Y(0), m.w * s, m.h * s);

    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const hits: Hit[] = [];
    const bossIcons = big ? this.map.bosses.filter((b) => MOBS[b.id]).map((b) => ({ b, x: Math.round(X(b.x / TILE)), y: Math.round(Y(b.y / TILE)) })) : [];
    for (const i of bossIcons) placed.push({ x0: i.x - 8, y0: i.y - 8, x1: i.x + 8, y1: i.y + 8 }); // значки боссов занимают место до подписей
    const label = (text: string, x: number, y: number, fill: string, font: string, size = 16, ws = "0px", dry: Dry = false, inMap = false): boolean => {
      g.font = font;
      g.wordSpacing = ws;
      const w = Math.ceil(g.measureText(text).width);
      // начало подписи — в целых пикселях экрана (не CSS), иначе пиксельный шрифт размывается
      // подпись зоны не выходит за край карты
      const x0 = inMap ? Math.min(Math.max(x - w / 2, X(0) + 3), X(m.w) - w - 3) : x - w / 2;
      const lx = Math.round(x0 * dpr) / dpr;
      let ly = Math.round(y * dpr) / dpr;
      let r = { x0: lx - 2, y0: ly - size, x1: lx + w + 2, y1: ly + 2 };
      if (r.x1 < 0 || r.x0 > this.W || r.y1 < 0 || r.y0 > this.H) return dry === "pair";
      const clash = (q: typeof r) => placed.some((p) => q.x0 < p.x1 && q.x1 > p.x0 && q.y0 < p.y1 && q.y1 > p.y0);
      if (clash(r)) { // подпись уступает значкам боссов: сдвиг вверх/вниз на 6 px
        const ok = [-6, 6, -12, 12].find((dy) => !clash({ ...r, y0: r.y0 + dy, y1: r.y1 + dy }));
        if (ok === undefined) return false;
        ly += ok; r = { ...r, y0: r.y0 + ok, y1: r.y1 + ok };
      }
      if (dry) return true;
      placed.push(r);
      g.lineWidth = 3;
      g.strokeStyle = P.well;
      g.lineJoin = "round";
      g.strokeText(text, lx, ly);
      g.fillStyle = fill;
      g.fillText(text, lx, ly);
      return true;
    };
    /** Блок подписи из строк с центром в (x, y): проверка места — по всему блоку (пара рисуется целиком или никак), в пределах карты. */
    const block = (lines: Line[], x: number, y: number, dry: Dry = false): boolean => {
      g.wordSpacing = "0px";
      const ws = lines.map((l) => { g.font = font(l.size, l.bold); return Math.ceil(g.measureText(l.text).width) + (l.pill ? 10 : 0); });
      const hs = lines.map((l) => Math.round(l.size * (l.pill ? 1.45 : 1.15)));
      const bw = Math.max(...ws), bh = hs.reduce((a, b) => a + b, 0);
      const cx = Math.min(Math.max(x, X(0) + 3 + bw / 2), X(m.w) - 3 - bw / 2);
      let r = { x0: cx - bw / 2 - 2, y0: y - bh / 2, x1: cx + bw / 2 + 2, y1: y + bh / 2 };
      if (r.x1 < 0 || r.x0 > this.W || r.y1 < 0 || r.y0 > this.H) return dry === "pair";
      const clash = (q: typeof r) => placed.some((p) => q.x0 < p.x1 && q.x1 > p.x0 && q.y0 < p.y1 && q.y1 > p.y0);
      if (clash(r)) { // подпись уступает значкам боссов: сдвиг по вертикали (потом по горизонтали), значок остаётся в клетке босса
        let found: typeof r | null = null;
        for (const [dx, dy] of BLOCK_SHIFTS) {
          const q = { x0: r.x0 + dx, x1: r.x1 + dx, y0: r.y0 + dy, y1: r.y1 + dy };
          if (!clash(q) && q.x0 >= X(0) && q.x1 <= X(m.w)) { found = q; break; }
        }
        if (!found) return false;
        r = found;
      }
      if (dry) return true;
      placed.push(r);
      let top = r.y0;
      lines.forEach((l, i) => {
        g.font = font(l.size, l.bold);
        const lx = Math.round(((r.x0 + r.x1) / 2 - (ws[i] - (l.pill ? 10 : 0)) / 2) * dpr) / dpr, ly = Math.round((top + hs[i] * 0.78) * dpr) / dpr;
        if (l.pill) {
          g.fillStyle = l.pill;
          g.fillRect(Math.round(((r.x0 + r.x1) / 2 - ws[i] / 2) * dpr) / dpr, top + 1, ws[i], hs[i] - 2);
          g.lineWidth = 1;
          g.strokeStyle = P.fg;
          g.strokeRect(Math.round(((r.x0 + r.x1) / 2 - ws[i] / 2) * dpr) / dpr + 0.5, top + 1.5, ws[i] - 1, hs[i] - 3);
        } else {
          g.lineWidth = 4;
          g.strokeStyle = P.well;
          g.lineJoin = "round";
          g.strokeText(l.text, lx, ly);
        }
        g.fillStyle = l.fill;
        g.fillText(l.text, lx, ly);
        top += hs[i];
      });
      return true;
    };
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    const { known, faction } = this.getKnown();
    // города (приоритет 1)
    if (big) for (const c of CITIES) {
      const x = X(c.x), y = Y(c.y);
      const open = !known || cityKnown(c, known, faction);
      const col = c.capital ? factionColor(c.capital) : open ? CITY : "#8a8290";
      const r = 8; // значок 14 px: форт — две башни со стеной, столица и город — крепость, неизвестный — табличка «?»; цвет по фракции (Сольгард — золото, Умбрат — зелёный)
      const fac = c.capital === "umbrath" ? "umb" : c.capital === "solgard" ? "sol" : "";
      const icon = !open && !c.capital ? "unknown" : c.fort ? `fort_${fac || "sol"}` : fac ? `city_${fac}` : "city_neu";
      drawWmIcon(g, icon, x, y);
      placed.push({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });
      const cs = c.capital ? FS.md : FS.base;
      label(open || c.capital ? (c.capital ? c.name.toUpperCase() : c.name) : "???", x, y - r - 5, c.capital ? col : open ? CITY : "#a8a0b0", font(cs, true), cs);
      hits.push({ x, y, r: r + 4, title: open || c.capital ? c.name : T("ui.worldmap.734"), sub: open || c.capital ? (c.capital ? T("ui.worldmap.735") : T("ui.worldmap.729")) + ` ${T("ui.worldmap.736")}` : T("ui.worldmap.737") });
    }
    if (big) for (const r of wbBadgeRects(X, Y)) placed.push(r); // герб Колосса занимает место до подписей рядом (подпись входа сдвигается)
    // вход в подземелье «Пепельные чертоги» (задача 139): тёмный проём с красным огнём; внутри — лестница выхода
    {
      const d = big ? DUNGEON_DOOR : null, e = !big && this.map.w < 200 ? DUNGEON_EXIT : null, p = d ?? e;
      if (p) {
        const x = X(p.x / TILE), y = Y(p.y / TILE), r = 12, mp = this.mouse;
        const hov = !!mp && Math.hypot(mp.x - x, mp.y - y) <= r + 4, taken = !!d && !!net.dungeon?.looted;
        drawDgIcon(g, hov ? "hover" : taken ? "taken" : "normal", x, y, 1);
        const title = d ? "Пепельные чертоги · вход" : DUNGEON_EXIT_LABEL;
        for (const dx of d ? [0, 70, 110, -70] : [0]) if (label(d ? "Пепельные чертоги" : "Выход", x + dx, y + r + 8, "#ff9a5a", font(FS.base, true), FS.base)) break;
        hits.push({ x, y, r: r + 4, title, sub: d ? "Подземелье · ур. 85–95 · Повелитель Пепла" : "Лестница наверх, на карту мира" });
      }
    }
    // земли фракций (приоритет после городов): одна подпись на сторону цветом фракции
    if (big) {
      const ls = s < 3 ? FS.md : FS.lg;
      g.globalAlpha = s < 3 ? 1 : s < 6 ? 0.6 : 0.35;
      // точка подписи — центр строки (worldmap-labels.ts)
      const lf = (l: { x: number; y: number; land: FactionId }, dry: Dry = false) => label(landLabel(l.land).toUpperCase(), X(l.x), Y(l.y) + ls * 0.36, factionColor(l.land), font(ls, true), ls, "0px", dry, true);
      // обе стороны парой: подпись одной стороны не рисуется без зеркальной
      if (this.landLabels.length === 2) { if (lf(this.landLabels[0], "pair") && lf(this.landLabels[1], "pair")) for (const l of this.landLabels) lf(l); }
      else for (const l of this.landLabels) lf(l);
      g.globalAlpha = 1;
    }
    // названия рек
    if (big && s >= 1) for (const r of RIVERS) {
      const mid = r.path[Math.floor(r.path.length / 2)];
      label(`р. ${r.name}`, X(mid[0]), Y(mid[1]), "#9ac4f0", font(FS.xs), FS.xs);
    }
    // поселения по приоритету и масштабу
    if (big) {
      const minS: Record<string, number> = { settlement: 0.9, meeting: 1.8, camp: 2.6, ruins: 2.2 };
      const order = ["settlement", "meeting", "ruins", "camp"];
      const shown = new Map<(typeof PLACES)[number], boolean>();
      const placePair = this.placePair;
      for (const kind of order) for (const p of PLACES) {
        if (p.kind !== kind) continue;
        const x = X(p.x), y = Y(p.y);
        if (x < -20 || y < -20 || x > this.W + 20 || y > this.H + 20) continue;
        const zi = ZONES[m.zone[Math.min(m.h - 1, p.y) * m.w + Math.min(m.w - 1, p.x)]];
        const tag = zi && !zi.safe ? zoneTag(zi) : null;
        // опасность — строчными (часть фразы), земли фракции — как имя собственное
        const sub = `${KIND_NAME[p.kind]}${zi ? ` · ${zi.safe ? "безопасно" : zi.note ? "дикие края" : `ур. ${zi.levels[0]}–${zi.levels[1]}${tag ? ` · ${zi.danger ? tag.text.toLowerCase() : tag.text}` : ""}`}` : ""}`;
        const sz = 8; // значок 14 px: подпись и попадание отсчитываются от него
        drawWmIcon(g, PLACE_ICON[p.kind], x, y);
        placed.push({ x0: x - 8, y0: y - 8, x1: x + 8, y1: y + 8 }); // значок занимает место: подписи не налезают
        const fs = p.kind === "settlement" ? FS.sm : FS.xs;
        if (s >= minS[p.kind]) {
          // зеркальная пара поселений подписывается вместе: если одно название не влезло, не рисуется и второе
          const q = placePair.get(p);
          let show = shown.get(p);
          if (show === undefined) {
            const dry = (a: typeof p) => label(a.name, X(a.x), Y(a.y) - sz - 5, KIND_COLOR[a.kind], font(fs), fs, "0px", "pair");
            show = dry(p) && (!q || dry(q));
            shown.set(p, show); if (q) shown.set(q, show);
          }
          if (show) label(p.name, x, y - sz - 5, KIND_COLOR[p.kind], font(fs), fs);
        }
        hits.push({ x, y, r: 8, title: p.name, sub });
      }
      // указатели
      if (s >= 4) for (const sg of SIGNS) {
        const x = X(sg.x), y = Y(sg.y);
        g.fillStyle = "#c89a52";
        g.fillRect(x - 2, y - 4, 4, 8);
        hits.push({ x, y, r: 8, title: T("ui.worldmap.310"), sub: sg.text });
      }
      // зоны: блок как на схеме — уровни крупно жирным, ниже название, у кольца и Полей — опасность (Поля — красной плашкой); на приближении бледнее
      g.globalAlpha = s < 3 ? 1 : s < 6 ? 0.7 : 0.4;
      const big2 = s >= 3;
      const zlines = (z: Label): Line[] => {
        const zi = ZONES[z.zone], out: Line[] = [];
        if (zi && zi.levels[1] > 0 && !zi.note) out.push({ text: `${zi.levels[0]}–${zi.levels[1]}`, size: big2 ? FS.h : FS.lg, bold: true, fill: P.fg });
        out.push({ text: z.text, size: big2 ? FS.base : FS.sm, fill: P.fg });
        if (z.danger === "deadly") out.push({ text: DANGER_LABEL.deadly.toUpperCase(), size: FS.xs, bold: true, fill: P.fg, pill: P.hp });
        else if (z.danger === "unsafe") out.push({ text: DANGER_LABEL.unsafe, size: FS.xs, bold: true, fill: P.warn });
        return out;
      };
      const zshown = new Map<Label, boolean>();
      for (const z of this.zoneLabels) {
        const pz = z.pair === undefined ? undefined : this.zoneLabels[z.pair];
        const zdry = (a: Label) => block(zlines(a), X(a.x), Y(a.y), "pair");
        let ok = zshown.get(z);
        if (ok === undefined) { ok = zdry(z) && (!pz || zdry(pz)); zshown.set(z, ok); if (pz) zshown.set(pz, ok); }
        if (ok) block(zlines(z), X(z.x), Y(z.y));
      }
      g.globalAlpha = 1;
    }
    // боссы зон и кольца (BOSS_SPAWNS): алый череп 9 px с тёмной обводкой в клетке босса; состояние (жив/возрождение) вне зоны видимости на клиент не приходит
    for (const { b, x, y } of bossIcons) {
      const d = MOBS[b.id]!;
      drawWmIcon(g, "boss", x, y);
      hits.push({ x, y, r: 6, title: `${d.name} · ур. ${d.level ?? "?"}`, sub: "Босс · состояние неизвестно" });
    }
    if (big) drawWbMap(g, X, Y, s, hits, placed); // Колосс Полей: 4 состояния, круг арены (задача 151)
    if (big) drawSiegeMap(g, X, Y, s, hits); // ворота осаждаемого форта и знамя недели (шаг 15)
    if (big) { const hp = this.getPos(), hx = X(hp.x / TILE), hy = Y(hp.y / TILE); drawWarMap(g, X, Y, s, hits, placed, [{ x0: hx - 34, y0: hy - 34, x1: hx + 34, y1: hy + 44 }]); } // основания «Знамён Предела» (задача 132, шаг 14) в цвете владельца
    this.hits = hits;
    this.drawHero(g, X, Y);
    if (this.pick) this.drawPickMark(g, X, Y);
    this.drawTip();
  }

  /** Прицел выбора точки: рамка тайла под курсором (не меньше 6 px, чтобы была видна на общем плане) и риски по сторонам; тёмная подложка — для читаемости на любой местности. */
  private drawPickMark(g: CanvasRenderingContext2D, X: (t: number) => number, Y: (t: number) => number) {
    const mp = this.mouse, t = mp && !this.drag?.moved ? this.tileAt(mp.x, mp.y) : null;
    if (!t) return;
    const x = X(t.x + 0.5), y = Y(t.y + 0.5), h = Math.max(this.s, 6) / 2;
    g.lineCap = "butt";
    g.lineJoin = "miter";
    for (const [w, c] of [[4, P.well], [2, P.gold]] as const) {
      g.lineWidth = w;
      g.strokeStyle = c;
      g.strokeRect(x - h, y - h, h * 2, h * 2);
      g.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        g.moveTo(x + dx * (h + 3), y + dy * (h + 3));
        g.lineTo(x + dx * (h + 10), y + dy * (h + 10));
      }
      g.stroke();
    }
  }

  private drawHero(g: CanvasRenderingContext2D, X: (t: number) => number, Y: (t: number) => number) {
    const p = this.getPos(), tx = p.x / TILE, ty = p.y / TILE;
    if (this.prev) {
      const dx = tx - this.prev.x, dy = ty - this.prev.y;
      if (dx * dx + dy * dy > 0.0004) this.face = Math.atan2(dy, dx);
    }
    this.prev = { x: tx, y: ty };
    const x = X(tx), y = Y(ty);
    const t = performance.now() / 1000;
    const ph = (t % 1.4) / 1.4;
    g.strokeStyle = `rgba(255,90,70,${0.9 * (1 - ph)})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(x, y, 8 + ph * 26, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(255,90,70,0.25)";
    g.beginPath();
    g.arc(x, y, 14, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(x, y);
    g.rotate(this.face);
    g.fillStyle = "#fff";
    g.strokeStyle = "#d81818";
    g.lineWidth = 2.5;
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(14, 0); g.lineTo(-8, -9); g.lineTo(-3, 0); g.lineTo(-8, 9);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // подпись «Вы» и выход за экран — стрелка к герою
    if (x < 0 || y < 0 || x > this.W || y > this.H) {
      const ax = Math.max(18, Math.min(this.W - 18, x)), ay = Math.max(18, Math.min(this.H - 18, y));
      g.save();
      g.translate(ax, ay);
      g.rotate(Math.atan2(y - ay, x - ax));
      g.fillStyle = "#ff5a46";
      g.strokeStyle = "#fff";
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -9); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
      g.restore();
    } else {
      g.font = `600 13px ${TEXT}`;
      g.textAlign = "center";
      g.lineWidth = 4;
      g.strokeStyle = "rgba(14,10,16,0.92)";
      g.strokeText("Вы", x, y + 32);
      g.fillStyle = "#fff";
      g.fillText("Вы", x, y + 32);
    }
  }

  private drawTip() {
    const mp = this.mouse;
    let h: Hit | null = null;
    if (mp && !this.drag?.moved) {
      if (this.pick) {
        // выбор точки: под курсором тайл и зона (города и поселения подписаны на самой карте)
        const t = this.tileAt(mp.x, mp.y);
        if (t) h = { x: mp.x, y: mp.y, r: 0, title: T("ui.worldmap.311", { v: t.x, v2: t.y }), sub: this.tileZoneText(t.x, t.y) };
      } else {
        let bd = 1e9;
        for (const c of this.hits) {
          const d = Math.hypot(c.x - mp.x, c.y - mp.y);
          if (d <= c.r + 4 && d < bd) { bd = d; h = c; }
        }
      }
    }
    if (!h || !mp) { this.tip.hidden = true; return; }
    if (this.tip.dataset.k !== h.title + h.sub) {
      this.tip.dataset.k = h.title + h.sub;
      this.tip.replaceChildren();
      const b = document.createElement("b");
      b.textContent = h.title;
      const sp = document.createElement("span");
      sp.textContent = h.sub;
      this.tip.append(b, sp);
    }
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    this.tip.style.left = `${Math.max(4, Math.min(this.W - tw - 4, mp.x + 14))}px`;
    this.tip.style.top = `${Math.max(4, Math.min(this.H - th - 4, mp.y + 14))}px`;
  }
}
