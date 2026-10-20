/** Интерфейс рейда (задача 114): окно сбора у Вестника, полоса босса, рамки рейда, баннеры, итоги. */
import { RARITY_COLORS } from "../../../shared/items";
import { CLASSES } from "../../../shared/classes";
import { UnitKind } from "../../../shared/protocol";
import { phaseName, phaseNo, RAID, RAID_CFG, RAID_PHASES, RAID_ROLES, ROLE_NAMES, type RaidBannerMsg, type RaidMemberInfo, type RaidMusterMsg, type RaidResultMsg, type RaidRole } from "../../../shared/raid";
import type { Net, UnitState } from "../net";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const num = (n: number) => Math.round(n).toLocaleString("ru-RU");
const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const ROLE_ICON: Record<RaidRole, string> = { tank: "🛡", healer: "✚", melee: "⚔", ranged: "➶" };
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
/** Первые предложения лора, не длиннее max знаков. */
function shortLore(s: string, max = 220) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max), i = cut.lastIndexOf(".");
  return i > 60 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, "") + "…";
}

interface RaidState { stage?: string; countdown?: number; boss?: string; revives?: number; attempt?: number; attempts?: number; berserk?: number }
type FrameUnits = Map<string, { u: UnitState; x: number; y: number; dead: boolean }>;

export class RaidHud {
  net!: Net;
  private bound = false;
  private modal = el("div", "raid-modal");
  private result = el("div", "raid-modal");
  private top = el("div", "raid-top passthru");
  private frames = el("div", "panel raid-frames");
  private count = el("div", "raid-count passthru");
  private banner = el("div", "raid-banner passthru");
  private muster: RaidMusterMsg | null = null;
  private musterAt = 0;
  private npcId = "";
  private cast: { name: string; from: number; until: number } | null = null;
  private revive = new Map<string, { by: string; until: number }>();
  private bannerTimer = 0;
  private lastRows = 0;
  private lastKey = "";
  // ссылки на элементы полосы босса
  private bFill!: HTMLElement;
  private bPhase!: HTMLElement;
  private bText!: HTMLElement;
  private cBox!: HTMLElement;
  private cFill!: HTMLElement;
  private cName!: HTMLElement;
  private cTime!: HTMLElement;
  private berserkEl!: HTMLElement;
  private fRows!: HTMLElement;
  private fInfo!: HTMLElement;

  constructor(readonly root: HTMLElement) {
    for (const e of [this.modal, this.result, this.top, this.frames, this.count, this.banner]) e.hidden = true;
    this.top.innerHTML = `<div class="raid-bossbar"><div class="raid-fill" data-fill></div><i class="raid-tick" style="left:25%"></i><i class="raid-tick" style="left:50%"></i><i class="raid-tick" style="left:75%"></i>
      <b class="raid-no" style="left:0">I</b><b class="raid-no" style="left:25%">IV</b><b class="raid-no" style="left:50%">III</b><b class="raid-no" style="left:75%">II</b>
      <span class="raid-btext" data-text></span></div>
      <div class="raid-phase" data-phase></div>
      <div class="raid-cast" data-cast hidden><div class="raid-cfill" data-cfill></div><span data-cname></span><em data-ctime></em></div>
      <div class="raid-berserk" data-berserk></div>`;
    this.bFill = this.top.querySelector("[data-fill]")!;
    this.bPhase = this.top.querySelector("[data-phase]")!;
    this.bText = this.top.querySelector("[data-text]")!;
    this.cBox = this.top.querySelector("[data-cast]")!;
    this.cFill = this.top.querySelector("[data-cfill]")!;
    this.cName = this.top.querySelector("[data-cname]")!;
    this.cTime = this.top.querySelector("[data-ctime]")!;
    this.berserkEl = this.top.querySelector("[data-berserk]")!;
    this.frames.innerHTML = `<div class="raid-finfo" data-info></div><div class="raid-rows" data-rows></div><button class="btn raid-leave">Покинуть рейд</button>`;
    this.fRows = this.frames.querySelector("[data-rows]")!;
    this.fInfo = this.frames.querySelector("[data-info]")!;
    this.frames.querySelector<HTMLButtonElement>(".raid-leave")!.onclick = () => this.net.send("raid:leave", {});
    this.fRows.addEventListener("click", (e) => {
      const r = (e.target as HTMLElement).closest<HTMLElement>("[data-dead]");
      if (r?.dataset.id) this.net.send("raid:revive", { id: r.dataset.id });
    });
    root.append(this.top, this.frames, this.count, this.banner, this.modal, this.result);
  }

  bind(net: Net) {
    this.net = net;
    if (this.bound) return;
    this.bound = true;
    net.on("raid:muster", (m) => {
      this.muster = m;
      this.musterAt = performance.now();
      if (!this.modal.hidden) this.renderMuster();
    });
    net.on("raid:cast", (m) => {
      const now = performance.now();
      this.cast = m.ms > 0 ? { name: m.name, from: now, until: now + m.ms } : null;
    });
    net.on("raid:banner", (m) => this.showBanner(m));
    net.on("raid:revive", (m) => {
      if (m.ms > 0) this.revive.set(m.target, { by: m.by, until: performance.now() + m.ms });
      else this.revive.delete(m.target);
    });
    net.on("raid:result", (r) => this.showResult(r));
    net.on("switch", (kind) => {
      this.modal.hidden = true;
      this.result.hidden = true;
      this.cast = null;
      this.revive.clear();
      this.lastKey = "";
      if (kind !== "raid") for (const e of [this.top, this.frames, this.count, this.banner]) e.hidden = true;
    });
  }

  // ---------- окно сбора ----------
  open(npcId: string) {
    if (this.net.kind !== "world") return;
    this.npcId = npcId;
    this.modal.hidden = false;
    this.net.send("raid:info", {});
    this.renderMuster();
  }
  close(): boolean {
    const was = !this.modal.hidden || !this.result.hidden && this.net?.kind === "world";
    this.modal.hidden = true;
    if (this.net?.kind === "world") this.result.hidden = true;
    return was;
  }

  private renderMuster() {
    const m = this.muster, net = this.net;
    const lvl = net.self?.level ?? 0;
    const need = RAID_CFG.minLevel;
    const lockout = m && m.lockoutMs > 0 ? `Откат добычи: <b>${Math.ceil(m.lockoutMs / 3600_000)} ч</b> (бой доступен, добычи не будет)` : "Добыча доступна";
    let members = "";
    if (m) {
      const by = new Map<RaidRole, RaidMemberInfo[]>(RAID_ROLES.map((r) => [r, []]));
      for (const x of m.members) by.get(x.role)?.push(x);
      members = RAID_ROLES.map((r) => {
        const list = by.get(r)!;
        return `<div class="raid-role"><b>${ROLE_ICON[r]} ${ROLE_NAMES[r]}</b> <span class="muted">${list.length}${m.need[r] ? ` / ${m.need[r]}` : ""}</span>${list.map((x) => `<div class="raid-mem${x.bot ? " bot" : ""}">${esc(x.name)} <span class="muted">${esc(CLASSES[x.cls]?.name ?? x.cls)} · ${x.level}</span></div>`).join("")}</div>`;
      }).join("");
    }
    const mine = m?.joined;
    const leader = !!m && !!net.self && m.leader === net.self.name;
    const why = m?.why || (lvl && lvl < need ? `Нужен уровень ${need}+` : "");
    const canJoin = !!m && !m.running && !why;
    this.modal.innerHTML = `<div class="panel raid-dialog"><h2><span>${esc(RAID.npc.name)}</span><button class="x" data-x aria-label="Закрыть">×</button></h2>
      <p class="raid-greet">${esc(RAID.npc.greeting)}</p>
      <p class="muted raid-lore"><b style="color:${RAID.boss.color}">${esc(RAID.boss.name)}.</b> ${esc(shortLore(RAID.boss.lore))}</p>
      <div class="raid-info"><span>Требуется уровень <b class="${lvl && lvl < need ? "bad" : ""}">${need}+</b></span><span>${lockout}</span>${m ? `<span>Побед: <b>${m.wins}</b></span>` : ""}</div>
      ${m ? `<div class="raid-members">${members}</div>
      <div class="raid-info"><span>Ботов будет: <b>${m.bots}</b></span>${m.running ? `<span class="bad">Рейд уже идёт</span>` : m.open ? `<span>Старт через <b data-left>${mmss(m.leftSec)}</b></span>` : `<span class="muted">Сбор не начат</span>`}</div>` : `<p class="muted">Связь с Вестником…</p>`}
      ${why ? `<p class="bad raid-why">${esc(why)}</p>` : ""}
      <div class="raid-btns">
        ${mine ? `<button class="btn" data-cancel>Выйти</button>` : `<button class="btn primary" data-join ${canJoin ? "" : "disabled"}>Встать в рейд</button>`}
        ${mine && leader ? `<button class="btn primary" data-start>Начать сейчас</button>` : ""}
      </div></div>`;
    const q = (s: string) => this.modal.querySelector<HTMLButtonElement>(s);
    q("[data-x]")!.onclick = () => (this.modal.hidden = true);
    q("[data-join]") && (q("[data-join]")!.onclick = () => net.send("raid:join", { npc: this.npcId }));
    q("[data-cancel]") && (q("[data-cancel]")!.onclick = () => net.send("raid:cancel", {}));
    q("[data-start]") && (q("[data-start]")!.onclick = () => net.send("raid:start", {}));
  }

  // ---------- баннер и итоги ----------
  private showBanner(b: RaidBannerMsg) {
    this.banner.className = `raid-banner passthru ${b.kind}`;
    this.banner.innerHTML = `<div>${esc(b.text)}</div>${b.sub ? `<small>${esc(b.sub)}</small>` : ""}`;
    this.banner.hidden = false;
    this.banner.classList.remove("show");
    void this.banner.offsetWidth;
    this.banner.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (this.banner.hidden = true), b.kind === "win" || b.kind === "wipe" ? 3000 : 2600);
  }

  private showResult(r: RaidResultMsg) {
    const me = this.net.self?.name;
    const rows = [...r.players].sort((a, b) => b.damage - a.damage).map((p) =>
      `<tr class="${p.name === me ? "me" : ""}"><td>${ROLE_ICON[p.role]} ${esc(p.name)}${p.bot ? ` <span class="muted">бот</span>` : ""}</td><td>${num(p.damage)}</td><td>${num(p.healing)}</td><td>${p.deaths}</td><td>${p.revives}</td></tr>`).join("");
    const loot = r.loot.length ? r.loot.map((it) => `<span class="raid-loot" style="color:${RARITY_COLORS[it.rarity] ?? "#e8e2d0"}">${esc(it.name)}${it.qty && it.qty > 1 ? ` ×${it.qty}` : ""}</span>`).join("") : `<span class="muted">${r.locked ? "Добыча не положена (откат)" : "Добычи нет"}</span>`;
    this.result.innerHTML = `<div class="panel raid-dialog raid-res"><h2><span class="${r.win ? "raid-res-win" : "raid-res-loss"}">${r.win ? "Победа" : "Рейд пал"}</span></h2>
      <p class="muted">Попытка ${r.attempt} · бой ${mmss(r.durationMs / 1000)}</p>
      <table class="raid-table"><thead><tr><th>Герой</th><th>Урон</th><th>Лечение</th><th>Смерти</th><th>Воскр.</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="raid-lootbox"><b>Моя добыча</b><div>${loot}</div></div>
      ${r.title ? `<p>Титул: <b class="raid-title-gold">${esc(r.title)}</b></p>` : ""}${r.frame ? `<p>Рамка: <b style="color:${RAID.frame.color}">${esc(r.frame)}</b></p>` : ""}
      <div class="raid-btns"><button class="btn primary" data-world>В мир</button></div></div>`;
    this.result.querySelector<HTMLButtonElement>("[data-world]")!.onclick = () => { this.result.hidden = true; this.net.send("raid:leave", {}); };
    this.result.hidden = false;
  }

  // ---------- кадр ----------
  frame(units: FrameUnits) {
    const net = this.net;
    if (!net) return;
    const now = performance.now();
    if (!this.modal.hidden) {
      const left = this.modal.querySelector("[data-left]");
      if (left && this.muster) left.textContent = mmss(this.muster.leftSec - (now - this.musterAt) / 1000);
    }
    const inRaid = net.kind === "raid";
    this.top.hidden = this.frames.hidden = !inRaid;
    this.count.hidden = !inRaid || this.count.textContent === "";
    if (!inRaid) return;
    const st = (net.room?.state ?? {}) as RaidState;
    const welcome = net.raid;
    const bossId = st.boss || welcome?.boss || "";
    const b = bossId ? units.get(bossId) : undefined;
    // полоса босса
    if (b) {
      const k = Math.max(0, Math.min(1, b.u.hp / Math.max(1, b.u.maxHp)));
      this.bFill.style.width = `${k * 100}%`;
      this.bText.textContent = `${Math.ceil(k * 100)}% · ${num(Math.max(0, b.u.hp))} / ${num(b.u.maxHp)}`;
      const ph = Math.max(0, Math.min(RAID_PHASES.length - 1, b.u.phase));
      this.bPhase.innerHTML = `<b>${esc(RAID.boss.name)}</b> · Фаза ${phaseNo(ph)} — ${esc(phaseName(ph))}`;
    }
    this.top.classList.toggle("dim", !b);
    // каст босса
    if (this.cast && now < this.cast.until) {
      this.cBox.hidden = false;
      this.cName.textContent = this.cast.name;
      this.cFill.style.width = `${((now - this.cast.from) / (this.cast.until - this.cast.from)) * 100}%`;
      this.cTime.textContent = ((this.cast.until - now) / 1000).toFixed(1);
    } else {
      this.cBox.hidden = true;
      this.cast = null;
    }
    // берсерк
    const stage = st.stage ?? "";
    const bs = st.berserk ?? 0;
    this.berserkEl.hidden = stage !== "fight";
    this.berserkEl.classList.toggle("hot", bs > 0 && bs <= 30 || bs <= 0);
    this.berserkEl.textContent = bs > 0 ? `Ярость через ${mmss(bs)}` : "ЯРОСТЬ";
    // отсчёт
    const cd = Math.ceil(st.countdown ?? 0);
    this.count.textContent = (stage === "gather" || stage === "pull") && cd > 0 ? `${stage === "gather" ? "Сбор" : "Бой через"}: ${cd}` : "";
    this.count.hidden = this.count.textContent === "";
    this.fInfo.innerHTML = `Заряды воскрешения: <b>${st.revives ?? 0}</b>${st.attempts ? `<br>Попытка <b>${st.attempt ?? 1}</b> из ${st.attempts}` : ""}`;
    this.frameRows(units, welcome?.members ?? []);
  }

  private frameRows(units: FrameUnits, members: RaidMemberInfo[]) {
    const now = performance.now();
    const roleOf = new Map(members.map((m) => [m.name, m.role]));
    const list: { id: string; u: UnitState; dead: boolean; role: RaidRole }[] = [];
    for (const [id, v] of units) if (v.u.kind === UnitKind.Player) list.push({ id, u: v.u, dead: v.dead, role: roleOf.get(v.u.name) ?? "ranged" });
    list.sort((a, c) => RAID_ROLES.indexOf(a.role) - RAID_ROLES.indexOf(c.role) || a.u.name.localeCompare(c.u.name));
    list.length = Math.min(list.length, 20);
    const key = list.map((x) => x.id + (x.dead ? "d" : "")).join(",");
    if (key !== this.lastKey || list.length !== this.lastRows) {
      this.lastKey = key;
      this.lastRows = list.length;
      this.fRows.innerHTML = list.map((x) => `<div class="raid-row" data-id="${esc(x.id)}" ${x.dead ? "data-dead" : ""}><span class="raid-ri">${ROLE_ICON[x.role]}</span><span class="raid-rn">${esc(x.u.name)}</span><div class="raid-rhp"><i></i></div><em></em></div>`).join("");
    }
    const rows = this.fRows.children;
    for (let i = 0; i < list.length; i++) {
      const x = list[i], row = rows[i] as HTMLElement | undefined;
      if (!row) break;
      const k = Math.max(0, Math.min(1, x.u.hp / Math.max(1, x.u.maxHp)));
      (row.querySelector("i") as HTMLElement).style.width = `${x.dead ? 0 : k * 100}%`;
      const rv = this.revive.get(x.id) ?? this.revive.get(x.u.name);
      if (rv && rv.until < now) { this.revive.delete(x.id); this.revive.delete(x.u.name); }
      const em = row.querySelector("em")!;
      const txt = x.dead ? (rv && rv.until >= now ? `поднимают… ${rv.by}` : "мёртв") : "";
      if (em.textContent !== txt) em.textContent = txt;
      row.classList.toggle("dead", x.dead);
      row.classList.toggle("self", x.id === this.net.id);
    }
  }
}
