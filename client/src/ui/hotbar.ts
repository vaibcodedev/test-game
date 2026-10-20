/**
 * Панель умений (задача 115, шаг 5; docs/controls.md, разделы 8 и 10).
 * Строится один раз (при смене класса, раскладки или клавиш), кадр меняет только классы и тексты — иначе пересборка ломает DnD и подсказки.
 * Источник данных — SelfState.bars; изменения идут на сервер сообщениями bars:set / bars:swap и возвращаются в SelfState.
 */
import { BASE_ITEMS } from "../../../shared/items";
import { BAR_COUNT, BAR_SLOTS, usableBase, type Slot } from "../../../shared/hotbar";
import { lineClear, type WorldMap } from "../../../shared/map";
import type { SelfState } from "../../../shared/protocol";
import { skillMana, SKILLS, type SkillDef } from "../../../shared/skills";
import { keybinds } from "../game/keybinds";
import type { Net } from "../net";

const icon = (name: string) => `/assets/icons/${name}.png`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const LOCK_KEY = "hotbar:lock:v1";
const POTION_MS = 1500;
const ACTION_INFO: Record<string, { glyph: string; name: string; tip: string }> = {
  mount: { glyph: "♞", name: "Маунт", tip: "Сесть на маунта и слезть" },
  pet: { glyph: "🐾", name: "Питомец", tip: "Призвать и отпустить питомца" },
  attack: { glyph: "⚔", name: "Атаковать цель", tip: "Подойти к цели и бить" },
  interact: { glyph: "✋", name: "Взаимодействие", tip: "Подобрать добычу или поговорить" },
};

export interface HotbarCtx {
  net: Net;
  map: WorldMap;
  press: (bar: number, i: number) => void;
  tipFor: (el: HTMLElement, html: () => string) => void;
  skillTip: (def: SkillDef, s: SelfState) => string;
}
/** Что нужно кадру: позиция героя, его мана, цель и её место. */
export interface HotbarFrame {
  mp: number;
  pos: { x: number; y: number };
  target: { x: number; y: number } | null;
}

interface Cell {
  root: HTMLButtonElement;
  kbd: HTMLElement;
  cd: HTMLElement | null;
  cdt: HTMLElement | null;
  qty: HTMLElement | null;
  ref: Slot;
  label: string;
  cls: string;
  cdv: string;
  cdtv: string;
  qtyv: string;
}

export class Hotbar {
  readonly el = document.createElement("div");
  private rows: HTMLElement[] = [];
  private cells: Cell[][] = [];
  private lockBtn = document.createElement("button");
  private sig = "";
  private locked = true;
  private self: SelfState | null = null;
  private qtyFor: Self2 = { src: null, qty: new Map() };
  private ctx!: HotbarCtx;

  constructor() {
    this.el.className = "hb";
    try { this.locked = localStorage.getItem(LOCK_KEY) !== "0"; } catch {}
    // во время перетаскивания показываем и пустую вторую панель — иначе в неё нельзя положить первое умение
    document.addEventListener("dragstart", () => this.el.classList.add("dragging"));
    document.addEventListener("dragend", () => this.el.classList.remove("dragging"));
    keybinds.onChange(() => { for (const row of this.cells) for (const c of row) this.paintKey(c); });
  }

  bind(ctx: HotbarCtx) { this.ctx = ctx; }

  /** Подпись клавиши слота — для тостов и подсказок. */
  keyOf(bar: number, i: number): string { return keybinds.barLabel(bar, i); }

  flash(bar: number, i: number) {
    const c = this.cells[bar]?.[i];
    if (!c) return;
    c.root.classList.remove("press");
    void c.root.offsetWidth;
    c.root.classList.add("press");
  }

  /** Пришло личное состояние: пересобрать, только если изменились класс или раскладка. */
  update(s: SelfState) {
    this.self = s;
    const sig = `${s.cls}|${JSON.stringify(s.bars)}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.build(s);
  }

  private setLock(v: boolean) {
    this.locked = v;
    try { localStorage.setItem(LOCK_KEY, v ? "1" : "0"); } catch {}
    this.paintLock();
  }
  private paintLock() {
    this.lockBtn.textContent = this.locked ? "🔒" : "🔓";
    this.lockBtn.title = this.locked ? "Панель закрыта: слоты не двигаются. Shift+перетаскивание работает всегда. Клик — открыть" : "Панель открыта: слоты можно переставлять и снимать. Клик — закрыть";
    this.lockBtn.classList.toggle("open", !this.locked);
  }

  private paintKey(c: Cell) {
    const bar = this.cells.findIndex((r) => r.includes(c)), i = this.cells[bar]?.indexOf(c) ?? -1;
    const label = keybinds.barLabel(bar, i);
    if (label !== c.label) { c.label = label; c.kbd.textContent = label; }
  }

  private build(s: SelfState) {
    this.el.innerHTML = "";
    this.rows = [];
    this.cells = [];
    // верхний ряд — панель 2 (с Shift), нижний — основная
    const order = [1, 0];
    for (const bar of order) {
      const row = document.createElement("div");
      row.className = `hb-row r${bar + 1}`;
      this.rows[bar] = row;
      this.cells[bar] = [];
      for (let i = 0; i < BAR_SLOTS; i++) {
        const c = this.makeCell(bar, i, s.bars[bar]?.[i] ?? null);
        this.cells[bar][i] = c;
        row.append(c.root);
      }
      if (bar === 0) { this.lockBtn.className = "hb-lock"; this.lockBtn.onclick = () => { this.setLock(!this.locked); this.lockBtn.blur(); }; row.append(this.lockBtn); }
      this.el.append(row);
    }
    this.rows[1].classList.toggle("empty", s.bars[1].every((r) => !r));
    this.paintLock();
  }

  private makeCell(bar: number, i: number, ref: Slot): Cell {
    const label = keybinds.barLabel(bar, i);
    const root = document.createElement("button");
    root.className = "slot hb-slot";
    root.dataset.bar = String(bar);
    root.dataset.i = String(i);
    let inner = "";
    if (ref) {
      if ("s" in ref) inner = `<img src="${icon(SKILLS[ref.s].icon)}" alt="" draggable="false">`;
      else if ("i" in ref) inner = `<img src="${icon(BASE_ITEMS[ref.i].icon)}" alt="" draggable="false">`;
      else inner = `<span class="act">${ACTION_INFO[ref.a].glyph}</span>`;
    }
    root.innerHTML = `${inner}<kbd>${esc(label)}</kbd>${ref ? `<i class="cd" style="transform:scaleY(0)"></i><span class="cdt"></span>` : ""}${ref && "i" in ref ? `<span class="qty"></span>` : ""}`;
    const cell: Cell = {
      root, kbd: root.querySelector("kbd")!, cd: root.querySelector(".cd"), cdt: root.querySelector(".cdt"), qty: root.querySelector(".qty"),
      ref, label, cls: "", cdv: "", cdtv: "", qtyv: "",
    };
    root.onclick = () => { root.blur(); this.ctx.press(bar, i); };
    if (ref) this.ctx.tipFor(root, () => this.tip(ref, bar, i));
    root.classList.toggle("filled", !!ref);
    root.draggable = !!ref;
    root.ondragstart = (e) => {
      // закрытая панель не отпускает слоты; Shift при начале перетаскивания открывает её на этот раз
      if (!ref || (this.locked && !e.shiftKey)) return e.preventDefault();
      e.dataTransfer!.setData("text/plain", `bar:${bar}:${i}`);
      e.dataTransfer!.effectAllowed = "move";
      root.dataset.dragging = "1";
    };
    root.ondragend = (e) => {
      delete root.dataset.dragging;
      // отпустили не на слоте и не на окне, которое приняло — снять с панели
      if (e.dataTransfer?.dropEffect === "none" && ref) this.ctx.net.send("bars:set", { bar, i, ref: null });
    };
    root.ondragover = (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "move"; root.classList.add("drag"); };
    root.ondragleave = () => root.classList.remove("drag");
    root.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      root.classList.remove("drag");
      this.drop(bar, i, e.dataTransfer?.getData("text/plain") ?? "");
    };
    return cell;
  }

  /** Что упало на слот: слот панели (обмен), умение из окна K, предмет из сумки I. */
  private drop(bar: number, i: number, data: string) {
    const net = this.ctx.net, s = net.self;
    if (!s) return;
    const m = /^bar:(\d+):(\d+)$/.exec(data);
    if (m) {
      const a = { bar: Number(m[1]), i: Number(m[2]) };
      if (a.bar !== bar || a.i !== i) net.send("bars:swap", { a, b: { bar, i } });
      return;
    }
    const sk = /^skill:(\w+)$/.exec(data);
    if (sk) {
      const d = SKILLS[sk[1]];
      if (d && d.cls === s.cls && d.kind === "active") net.send("bars:set", { bar, i, ref: { s: d.id } });
      return;
    }
    if (/^\d+$/.test(data)) {
      const it = s.inventory[Number(data)];
      if (it && usableBase(it.base)) net.send("bars:set", { bar, i, ref: { i: it.base } });
    }
  }

  private tip(ref: NonNullable<Slot>, bar: number, i: number): string {
    const s = this.self;
    const key = keybinds.barLabel(bar, i);
    if ("s" in ref) return s ? this.ctx.skillTip(SKILLS[ref.s], s) : "";
    if ("i" in ref) {
      const q = this.qtyFor.qty.get(ref.i) ?? 0;
      return `<div class="t">${esc(BASE_ITEMS[ref.i].name)}</div><div class="d">${q} шт.${key ? ` · клавиша ${esc(key)}` : ""}</div>`;
    }
    const a = ACTION_INFO[ref.a];
    return `<div class="t">${a.name}</div><div class="d">${a.tip}${key ? ` · клавиша ${esc(key)}` : ""}</div>`;
  }

  /** Количество предметов по base: пересчитывается, только когда пришло новое состояние. */
  private counts(s: SelfState) {
    if (this.qtyFor.src === s.inventory) return this.qtyFor.qty;
    const q = new Map<string, number>();
    for (const it of s.inventory) if (it) q.set(it.base, (q.get(it.base) ?? 0) + (it.qty ?? 1));
    this.qtyFor = { src: s.inventory, qty: q };
    return q;
  }

  /** Каждый кадр: только классы и тексты (раздел 10: перезарядка, мана, дальность, видимость, цель, замок). */
  frame(f: HotbarFrame) {
    const s = this.net_self();
    if (!s || !this.cells.length) return;
    const now = performance.now();
    const cds = this.ctx.net.cooldowns;
    const qty = this.counts(s);
    for (let bar = 0; bar < BAR_COUNT; bar++) {
      for (let i = 0; i < BAR_SLOTS; i++) {
        const c = this.cells[bar][i], ref = c.ref;
        if (!ref) continue;
        const cls: string[] = [];
        let cdId = "", total = 0, q = "";
        if ("s" in ref) {
          const d = SKILLS[ref.s], rank = s.skills[d.id] || 0;
          cdId = d.id;
          total = d.cd ? d.cd(Math.max(1, rank)) * 1000 : 0;
          if (!rank) cls.push("unlearned");
          else {
            if (f.mp < skillMana(d, rank, s.level)) cls.push("nomana");
            if (d.target === "enemy" && !f.target) cls.push("notarget");
            else if (f.target && d.target !== "self") {
              if (d.range && Math.hypot(f.target.x - f.pos.x, f.target.y - f.pos.y) > d.range + 8) cls.push("oor");
              else if (d.target === "enemy" && !lineClear(this.ctx.map, f.pos.x, f.pos.y, f.target.x, f.target.y)) cls.push("nolos");
            }
          }
        } else if ("i" in ref) {
          const n = qty.get(ref.i) ?? 0;
          q = String(n);
          if (!n) cls.push("none");
          if (ref.i === "hp_potion" || ref.i === "mp_potion") { cdId = "potion"; total = POTION_MS; }
        } else if (ref.a === "attack" && !f.target) cls.push("notarget");
        const left = cdId ? Math.max(0, (cds.get(cdId) ?? 0) - now) : 0;
        if (left > 0) cls.push("oncd");
        const cl = cls.join(" ");
        if (cl !== c.cls) {
          for (const o of c.cls.split(" ")) if (o) c.root.classList.remove(o);
          for (const n of cls) c.root.classList.add(n);
          c.cls = cl;
        }
        if (c.cd) {
          const v = left > 0 && total > 0 ? `scaleY(${Math.min(1, left / total).toFixed(2)})` : "scaleY(0)";
          if (v !== c.cdv) { c.cdv = v; c.cd.style.transform = v; }
          const t = left > 0 ? (left / 1000).toFixed(left < 1000 ? 1 : 0) : "";
          if (t !== c.cdtv) { c.cdtv = t; c.cdt!.textContent = t; }
        }
        if (c.qty && q !== c.qtyv) { c.qtyv = q; c.qty.textContent = q; }
      }
    }
    this.el.classList.toggle("locked", this.locked);
    this.rows[1].classList.toggle("empty", s.bars[1].every((r) => !r));
  }

  private net_self(): SelfState | null { return this.ctx?.net.self ?? this.self; }
}

interface Self2 { src: unknown; qty: Map<string, number> }
