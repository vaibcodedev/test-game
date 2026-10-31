/** Интерфейс поверх игры (DOM): панели, окна, чат, мини-карта, подсказки. */
import { npcRefuses, setNpcGateToast } from "./npcGate";
import { formatNumber, gold, goldify } from "./gold";
import { GP } from "../../../shared/gameplay";
import { initWindowDrag, resetWindowPositions, scaleOf } from "./drag";
import { CLASSES, STAT_HINTS, STAT_NAMES, type StatKey } from "../../../shared/classes";
import { FACTIONS, FOE_COLOR, factionColor, landLabel, zoneLand } from "../../../shared/factions";
import * as sfx from "../game/sfx";
import { enchantFxMode, gearFxMode, overlay, setEnchantFxMode, setGearFxMode, setOverlay, type EnchantFxMode, type GearFxMode } from "../game/overlay";
import { setVfxMode, vfxMode, type VfxMode } from "../game/postfx";
import { setShadowMode, shadowMode, type ShadowMode } from "../game/shadows";
import { flashGear } from "../game/gearHooks";
import { visualTier as enchantTier, GEAR_FX, legendText, nextStepText, tierText } from "../../../shared/gearFx";
import { FORTS, MAX_LEVEL, RESPAWN_DELAY_MS, TILE } from "../../../shared/constants";
import { LEGENDARIES } from "../../../shared/legendary";
import { OFFHAND_CLASSES, slotGhost, itemTypeName, isTwoHanded, BASE_ITEMS, iconFor, canEquip, isBound, effStats, ITEM_STAT_NAMES, itemName, itemValue, baseSellValue, RARITY_NAMES, SLOT_NAMES, SLOTS, UNIQUES, ITEM_MODELS, type Item, type ItemStatKey } from "../../../shared/items";
import { DUNGEON_DOOR, isTownZone, T, Zone, ZONES, zoneAtPx, zoneDanger, type WorldMap } from "../../../shared/map";
import { DUNGEON_EXIT } from "../../../shared/dungeon";
import { drawDgIcon } from "./dungeonIcon";
import { CITIES, layoutOf } from "../../../shared/cities";
import { TOWN, WALL } from "../../../shared/town";
import { MOBS } from "../../../shared/mobs";
import { Anim, UnitKind, type Aura, type ChatLine, type SelfState, type ToastMsg } from "../../../shared/protocol";
import { canLearn, classSkills, SKILLS, skillMana, type SkillDef } from "../../../shared/skills";
import type { Net, UnitState } from "../net";
import { ARENA_BLOCKED_TEXT, rankById } from "../../../shared/arena";
import { ArenaUI } from "./arena";
import { RaidHud } from "./raid";
import { WbossHud, drawWbMini } from "./wboss";
import { WarHud, drawWarMini, warBuffUntil } from "./bannerWar";
import { SiegeHud, drawSiegeMini } from "./siege";
import { CastBar, castGlyph, type CastOpts, type CastVariant } from "./castbar";
import { absorbHtml } from "./absorb";
import { TradeUI } from "./trade";
import { AdminUI } from "./admin";
import { BestiaryUI } from "./bestiary";
import { RumorUI } from "./rumor";
import { StatueUI } from "./statue";
import { EncounterUI } from "./encounter";
import { InspectUI } from "./inspect";
import { enchantTotal, gearRows, legendBlock } from "./gearfx";
import { CookUI, foodTip } from "./cook";
import { QuestUI, TeleportUI } from "./cities";
import { fillHelp, GameMenu, type HelpTab } from "./gamemenu";
import { isTextField, keybinds, skillKeys } from "../game/keybinds";
import { buildControls, buttonRow, checkRow, offerSchemeOnce, rangeRow, segRow } from "./controls";
import { rangeFill, seg, setHidden, tabs, type TabsHandle } from "./kit";
import { Hotbar } from "./hotbar";
import { LevelLook } from "./levelLook";
import { findRef } from "../../../shared/hotbar";
import { WorldMapView } from "./worldmap";
import { plusBadge, SmithUI } from "./smith";
import { TransmogUI } from "./transmog";
import { FAMILY_NAMES, familyOf, gearStrings, isShell, slotOf, tryOnSlot, withLook } from "../../../shared/transmog";
import { previewImg } from "../game/gearPreview";
import { setTryOn } from "../game/tryOn";
import { BankUI, parseBankDrag } from "./bank";
import { BagsUI } from "./bags";
import { StableUI } from "./stable";
import { MenagerieUI } from "./menagerie";
import { MOUNTS, MOUNT_IDS, MOUNT_SOURCES, MOUNT_TIERS, TIER_COLOR, mountSprite, sealMount, isPart, PARTS, PART_PREFIX, SEAL } from "../../../shared/mounts";
import { PETS, PET_SEAL, PET_TIERS, PET_ROLES, petNextGain, petUnitId, sealPet, canKeepPet } from "../../../shared/pets";
import { MATERIALS } from "../../../shared/upgrade";
import { FOOD, foodOf } from "../../../shared/food";
import { isQuestItem, QUEST_ITEM_MSG } from "../../../shared/quests";
import { AURAS, auraCompare, auraText, auraTimeLabel, auraTimeWords, foodOfAura, warOfAura } from "../../../shared/auras";
import { DODGE_CAP, STAT_K } from "../../../shared/formulas";
import { P } from "../../../shared/palette";
import { DAY_CYCLE_MS, nightLevel, warmLevel } from "../../../shared/daynight";
import { SETTLEMENTS } from "../../../shared/settlements";
import lighting from "../../../data/lighting.json";

const LOW = lighting.postfx.lowHp;
const reducedMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
/** Время мира для значка суток и ночной миникарты (тесты подменяют window.__shadowMs, как для теней). */
const worldMs = () => (window as unknown as { __shadowMs?: number }).__shadowMs ?? Date.now();
import { T as TX } from "../../../shared/texts";
import { LootRow, LootToasts } from "./lootfx";
import { DropUI } from "./dropui";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const icon = (name: string) => `/assets/icons/${name}.png`;
/** Иконка рамки питомца для призывов без своего значка: берём значок умения. */
const PET_ICON: Record<string, string> = { skeleton: "sk_wl_skeletons", imp: "sk_wl_demon", wl_skeleton: "sk_wl_skeletons", wl_demon: "sk_wl_demon" };
const CLASS_COLOR: Record<string, string> = {
  warrior: "#ff9a7a", mage: "#c8a0ff", ranger: "#9ae07a", healer: "#ffe9a0", rogue: "#b8a0e0",
  deathknight: "#8ad8ff", bloodweaver: "#ff6a7a", darkranger: "#9a8aff", warlock: "#9aff6a", reaver: "#e06a4a",
};
const TERRAIN_COLORS = ["#2a5a9e", "#e05412", "#d0b07e", "#3c432c", "#463e40", "#86593a", "#4f873c", "#2f5336", "#746e7a", "#3a3444", "#e8eef4", "#a8d4ec", "#2a2230", "#d8b878", "#3a6a7a", "#5a6c7e", "#4c4c5a", "#2c2634", "#4a405a"];

export interface HudCtx {
  net: Net;
  map: WorldMap;
  pressSlot: (bar: number, i: number) => void;
  toggleMount?: () => void;
  togglePet?: () => void;
  closeTarget: () => void;
  selectTarget?: (id: string) => void;
  selectParty?: (n: number) => void;
  focusGame: () => void;
}
export interface FrameInfo {
  me: UnitState | null;
  target: UnitState | null;
  /** id цели в списке юнитов (для осмотра игрока по клику на рамку цели). */
  targetId?: string | null;
  pos: { x: number; y: number };
  units: Map<string, { u: UnitState; x: number; y: number; dead: boolean }>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Эффект на герое или цели в HUD: end — performance.now() окончания, 0 — бессрочный; m — наложен мной (только у цели). */
interface AuraRow { k: string; n?: number; v?: number; end: number; m?: boolean }
type AuraCell = { el: HTMLElement; tm: HTMLElement; st: HTMLElement; a: AuraRow };
/** Строка значков эффектов: рамка героя или плашка цели. Ячейки живут между обновлениями (меняются только время и стаки). */
interface AuraStrip { el: HTMLElement; rows: AuraRow[]; cells: Map<string, AuraCell>; order?: (a: AuraRow, b: AuraRow) => number }

/** Слот экипировки → базовый предмет для силуэта пустой ячейки. */
const ghostBase: Record<string, string> = {};

export class Hud {
  ctx!: HudCtx;
  aimAtCursor = false;
  private player = el("div", "panel hud-player");
  private targetBox = el("div", "panel hud-target");
  private petBox = el("div", "hud-pet");
  private zoneBanner = el("div", "hud-zone passthru");
  private mini = el("div", "panel hud-mini");
  private miniCanvas = el("canvas");
  private miniBase: HTMLCanvasElement | null = null;
  private wmView: WorldMapView | null = null;
  private bar = el("div", "panel hud-bar");
  private hotbar = new Hotbar();
  private levelLook = new LevelLook();
  private menuBar = el("div", "hud-menu");
  private uiScale = 100;
  private vpBound = false;
  private chatSize = 14;
  private chatBox = el("div", "hud-chat");
  private chatLog = el("div", "log");
  private chatInput = el("input");
  private toasts = el("div", "toasts");
  /** Строка ошибок над панелью (docs/systems/combat.md, раздел 10). */
  private errLine = el("div", "errline");
  private itip = el("div", "interact-tip");
  private itipText = "";
  private errAt = new Map<string, number>();
  private errHide = 0;
  private lastCast: { id: string; at: number } | null = null;
  private death = el("div", "death");
  private tip = el("div", "panel tip");
  /** Превью добычи: ряд над мешком и тост-карточка (lootfx.ts). take — клик по ряду, ставит GameScene. */
  readonly lootRow: LootRow;
  private dropUi!: DropUI;
  readonly lootToasts: LootToasts;
  onTakeBag?: (id: string) => void;
  private wins: Record<string, HTMLElement> = {};
  private lastMini = 0;
  private todBox = el("div", "tod");
  private todCv = el("canvas");
  private todTxt = el("span", "tod-txt");
  private todKey = "";
  private todTipKey = "";
  private lowK = 0; private lowPh = 0; private lowT = 0; private lastBeat = 0; private lowShadow = "";
  private deadSince = 0;
  private zoneTimer = 0;
  private lastSelfLevel = 0;
  private netBound = false;
  private tradeBound = false;
  readonly arena: ArenaUI;
  readonly raid: RaidHud;
  /** Мировые боссы (задача 151): окно «Сборы», трекер событий, полоса вклада, итог (ui/wboss.ts). */
  readonly wboss: WbossHud;
  /** «Знамёна Предела» (задача 132, шаг 14): полоса битвы, объявления, итоги. */
  readonly war: WarHud;
  /** Осада форта (задача 132, шаг 15): полоса осады, итоги (ui/siege.ts). */
  readonly siege: SiegeHud;
  readonly trade: TradeUI;
  readonly bestiary: BestiaryUI;
  readonly admin: AdminUI;
  private gameMenu!: GameMenu;
  readonly rumor: RumorUI;
  /** История статуи правителя в столице (задача 141). */
  readonly statue: StatueUI;
  readonly enc: EncounterUI;
  readonly inspect: InspectUI;
  private targetSid: string | null = null;
  readonly cook: CookUI;
  readonly smith: SmithUI;
  readonly transmog: TransmogUI;
  readonly bank: BankUI;
  readonly bags: BagsUI;
  readonly stable: StableUI;
  readonly menagerie: MenagerieUI;
  readonly quest: QuestUI;
  readonly tp: TeleportUI;
  /** Бафы и дебафы героя (сообщение "auras"): строка значков под полосами в рамке героя; еда — тоже баф. */
  private heroAuras: AuraStrip = { el: el("div", "auras"), rows: [], cells: new Map() };
  /** Эффекты выбранной цели (сообщение "tauras", только мне): строка значков под полосой здоровья в плашке цели; мои — крупнее и ярче. */
  private tgtAuras: AuraStrip = { el: el("div", "auras"), rows: [], cells: new Map() };
  /** Чей список лежит в tgtAuras (id юнита); показывается, только пока это и есть выбранная цель. */
  private tgtAurasId: string | null = null;
  /** Значок, над которым сейчас подсказка (остаток времени в ней обновляется раз в секунду). */
  private auraHover: { s: AuraStrip; k: string } | null = null;

  /** Низ левой колонки (рамка героя, группа, рейд, питомец, задания), локальные px корня. */
  private leftBottom = 0;
  private bottomVars = new Map<string, string>();
  private setVar(name: string, v: number) {
    const s = `${Math.round(v)}px`;
    if (this.bottomVars.get(name) === s) return;
    this.bottomVars.set(name, s);
    this.root.style.setProperty(name, s);
  }
  /** Нижняя раскладка от размеров панели умений: чат стоит рядом с ней, если слева хватает места (не уже MIN), иначе над ней;
   *  лог не выше свободного места между левой колонкой и низом. Все числа — в локальных px корня (учтён zoom интерфейса).
   *  --bar-top — верх панели умений с рамкой, от него считаются строка ошибок и подсказка действия. */
  private layoutBottom() {
    const bw = this.bar.offsetWidth, bh = this.bar.offsetHeight;
    if (!bw || !bh) return;
    const EDGE = 12, GAP = 8, FRAME = 8, MIN = 300;
    const s = scaleOf(this.bar), W = innerWidth / s, H = innerHeight / s;
    const beside = (W - bw) / 2 - FRAME - EDGE - GAP;
    const fits = beside >= MIN;
    const chatW = fits ? Math.min(400, beside) : Math.min(400, W - 2 * EDGE);
    const barTop = EDGE + bh + FRAME;
    const chatBottom = fits ? EDGE : barTop + GAP;
    const logMax = Math.max(64, Math.min(190, H - this.leftBottom - GAP - chatBottom - this.chatInput.offsetHeight - 4));
    this.setVar("--bar-top", barTop);
    this.setVar("--chat-w", chatW);
    this.setVar("--chat-bottom", chatBottom);
    this.setVar("--chat-log-max", logMax);
  }

  /** Панели под рамкой героя (группа, рейд, питомец, задания) встают столбиком и не налезают друг на друга,
   *  даже когда рамка растёт (очки, «В бою», строка эффектов) или панель появляется и пропадает. */
  private stackLeftPanels() {
    const order = [".hud-player", ".hud-party", ".raid-frames", ".hud-pet", ".hud-quests"];
    const layout = () => {
      let y = 12;
      for (const sel of order) {
        const e = this.root.querySelector<HTMLElement>(sel);
        if (!e || e.hidden || e.offsetParent === null) continue;
        if (sel !== ".hud-player" && e.style.top !== `${y}px`) e.style.top = `${y}px`;
        y = (sel === ".hud-player" ? e.offsetTop : y) + e.offsetHeight + 8;
      }
      this.leftBottom = y;
      this.layoutBottom();
    };
    const ro = new ResizeObserver(layout);
    const watch = () => order.forEach((sel) => { const e = this.root.querySelector<HTMLElement>(sel); if (e && !(e as any).__stacked) { (e as any).__stacked = true; ro.observe(e); } });
    // новые панели добавляются прямо в корень; появление и скрытие — через атрибут hidden
    new MutationObserver(() => { watch(); layout(); }).observe(this.root, { childList: true });
    // Запись того же значения (hidden = true у питомца, группы и рейда каждый кадр в frame()) тоже даёт запись наблюдателю:
    // без этой проверки раскладка с принудительным пересчётом вёрстки (offsetHeight, layoutBottom) шла на каждом кадре.
    const vis = new MutationObserver((recs) => { if (recs.some((r) => r.oldValue !== (r.target as Element).getAttribute(r.attributeName!))) layout(); });
    const watchVis = () => order.forEach((sel) => { const e = this.root.querySelector<HTMLElement>(sel); if (e && !(e as any).__vis) { (e as any).__vis = true; vis.observe(e, { attributes: true, attributeFilter: ["hidden", "class"], attributeOldValue: true }); } });
    new MutationObserver(watchVis).observe(this.root, { childList: true });
    watchVis();
    watch();
    layout();
  }

  constructor(readonly root: HTMLElement) {
    this.dropUi = new DropUI((t, m) => this.ctx?.net.send(t, m));
    this.lootRow = new LootRow(root, { self: () => this.ctx?.net.self ?? undefined, take: (id) => this.onTakeBag?.(id), tipFor: (e, h) => this.tipFor(e, h), itemTip: (it, s) => this.itemTip(it, s, false, true), hideTip: () => (this.tip.hidden = true) });
    this.lootToasts = new LootToasts(root, () => this.ctx?.net.self ?? undefined);
    this.bar.append(this.hotbar.el);
    this.bar.append(this.levelLook.bar);   // над лентой умений (сама лента перестраивается, поэтому не внутри неё)
    root.append(this.player, this.petBox, this.targetBox, this.zoneBanner, this.mini, this.bar, this.chatBox, this.toasts, this.errLine, this.itip, this.death, this.tip);
    initWindowDrag(root, () => this.ctx?.net.self?.name ?? "");
    this.stackLeftPanels();
    // чат против панели умений: пересчёт при смене размеров панели (ряд Shift, питомец), поля ввода (размер шрифта) и окна
    const roBottom = new ResizeObserver(() => this.layoutBottom());
    roBottom.observe(this.bar); roBottom.observe(this.chatInput); roBottom.observe(this.root);
    this.targetBox.hidden = true;
    this.petBox.hidden = true;
    this.petBox.onclick = (e) => { const c = (e.target as HTMLElement).closest<HTMLElement>(".hud-pet-card"); if (c?.dataset.id) this.ctx.selectTarget?.(c.dataset.id); };
    this.death.hidden = true;
    this.tip.hidden = true;
    this.chatInput.placeholder = TX("ui.hud.289", { v: keybinds.label("chat", 0) });
    this.chatInput.maxLength = 140;
    this.chatInput.id = "chat-input";
    this.chatBox.append(this.chatLog, this.chatInput);
    this.miniCanvas.width = 240;
    this.miniCanvas.height = 180;
    this.mini.innerHTML = `<div class="zn" id="mini-zone"></div>`;
    this.mini.prepend(this.miniCanvas);
    this.mini.append(this.menuBar);
    const miniBtn = el("button", "mini-toggle", "▣");
    miniBtn.title = TX("ui.hud.290");
    miniBtn.setAttribute("aria-label", TX("ui.hud.290"));
    miniBtn.onclick = () => this.toggleMinimap();
    this.mini.append(miniBtn);
    this.todCv.width = 16;
    this.todCv.height = 16;
    this.todBox.append(this.todCv, this.todTxt);
    this.miniCanvas.after(this.todBox);
    // подсказка — общая игровая (tipFor, дизайн-система), а не системный title
    this.tipFor(this.todBox, () => { const [head, ...rest] = this.todTipKey.split(" · "); return `<div class="t">${esc(head)}</div>${rest.length ? `<div class="d">${esc(rest.join(" · "))}</div>` : ""}`; });
    this.buildMenu();
    this.makeWindows();
    setNpcGateToast((text) => this.toast({ text, kind: "error" }));
    this.arena = new ArenaUI(root, (text, kind) => this.toast({ text, kind }));
    this.raid = new RaidHud(root);
    this.wboss = new WbossHud(root, this.mini, this.raid);
    this.war = new WarHud(root);
    this.siege = new SiegeHud(root);
    this.bestiary = new BestiaryUI(root, icon);
    this.admin = new AdminUI(root, (onPick, onCancel) => this.pickOnMap(onPick, onCancel));
    this.rumor = new RumorUI(root);
    this.statue = new StatueUI(root);
    this.enc = new EncounterUI(root, { itemTip: (it, s) => this.itemTip(it, s, false, true), tipFor: (e, h) => this.tipFor(e, h) });
    this.inspect = new InspectUI(root, { itemTip: (it, s) => this.itemTip(it, s, false, true), tipFor: (e, h) => this.tipFor(e, h) });
    this.targetBox.onclick = () => { if (this.targetSid && this.ctx?.net.kind === "world") this.inspect.open(this.targetSid); };
    this.cook = new CookUI(root);
    this.smith = new SmithUI(root);
    this.transmog = new TransmogUI(root);
    this.quest = new QuestUI(root);
    this.tp = new TeleportUI(root);
    this.gameMenu = new GameMenu(root, {
      toggle: (id) => this.toggle(id),
      openQuests: () => this.quest.toggleLog(),
      openMap: () => this.openWorldMap(),
      openHelp: () => this.openHelp("keys"),
      isAdmin: () => !!this.ctx.net.self?.isAdmin,
      net: () => this.ctx.net,
    });
    this.bank = new BankUI(root, { itemTip: (it, s) => this.itemTip(it, s), tipFor: (e, h) => this.tipFor(e, h), hideTip: () => (this.tip.hidden = true), showInv: () => { if (this.wins.inv.hidden && this.ctx?.net.self) { this.wins.inv.hidden = false; this.renderSelf(this.ctx.net.self); } } });
    this.bags = new BagsUI(root, () => this.showInvWin());
    this.stable = new StableUI(root, () => this.showInvWin());
    this.menagerie = new MenagerieUI(root, () => this.showInvWin());
    this.heroAuras.el.hidden = true;
    this.tgtAuras.el.hidden = true;
    window.setInterval(() => this.tickAuras(), 1000);
    this.trade = new TradeUI(root, { itemTip: (it, s) => this.itemTip(it, s), tipFor: (e, h) => this.tipFor(e, h), hideTip: () => (this.tip.hidden = true) });
    this.trade.onChange = () => {
      if (this.trade.isOpen) this.wins.inv.hidden = false;
      if (this.ctx?.net.self) this.renderSelf(this.ctx.net.self);
    };
    this.applySettings();
    let hidden = false;
    try { hidden = localStorage.getItem("minimapHidden") === "1"; } catch {}
    this.mini.classList.toggle("collapsed", hidden);
    this.chatInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const text = this.chatInput.value.trim();
        if (text) this.ctx.net.send("chat", { text });
        this.chatInput.value = "";
        this.chatInput.blur();
      } else if (e.key === "Escape") this.chatInput.blur();
    });
    document.addEventListener("mousemove", (e) => this.moveTip(e));
    // кнопки, ползунки и флажки окон не держат фокус после клика мышью: иначе Пробел и Enter нажмут кнопку ещё раз, а стрелки сдвинут ползунок
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && root.contains(t) && t.matches("button, input[type=range], input[type=checkbox], input[type=radio]")) t.blur();
    }, true);
    keybinds.onChange(() => this.refreshKeys());
  }

  /** Раскладка изменилась: справка, меню под картой, чат и панель умений (список клавиш в настройках обновляет controls.ts). */
  private refreshKeys() {
    fillHelp(this.wins.help);
    this.menuBar.replaceChildren();
    this.buildMenu();
    this.chatInput.placeholder = TX("ui.hud.289", { v: keybinds.label("chat", 0) });
    if (this.ctx?.net.self) this.renderSelf(this.ctx.net.self);
  }

  /** Выход из мира (смена героя): закрыть окна и очистить чат прошлого героя. */
  reset() {
    this.gameMenu.reset();
    this.bank.close();
    this.inspect.close();
    for (const w of Object.values(this.wins)) w.hidden = true;
    this.chatLog.replaceChildren();
    this.death.hidden = true;
    this.tip.hidden = true;
    this.targetBox.hidden = true;
    this.setAuras([]);
    this.setTargetAuras(null, []);
  }

  /** Вызывается при каждом запуске сцены (мир или арена); подписки на сеть — один раз. */
  flashSlot(bar: number, i: number) { this.hotbar.flash(bar, i); }
  bind(ctx: HudCtx) {
    this.ctx = ctx;
    this.arena.onPickParty = (i) => ctx.selectParty?.(i);
    const n = ctx.net;
    this.hotbar.bind({ net: n, map: ctx.map, press: (b, i) => ctx.pressSlot(b, i), tipFor: (e, h) => this.tipFor(e, h), skillTip: (d, s) => this.skillTip(d, s, true) });
    if (!this.netBound) {
      this.netBound = true;
      n.on("self", (s) => {
        // цвета интерфейса по фракции героя (styles.css: body[data-faction])
        if (document.body.dataset.faction !== s.faction) document.body.dataset.faction = s.faction;
        this.renderSelf(s);
      });
      n.on("auras", (l) => this.setAuras(l));
      n.on("tauras", (m) => this.setTargetAuras(m.id, m.list));
      n.on("chat", (l) => this.chatLine(l));
      n.on("toast", (t) => this.toast(t));
      n.on("combat", (m) => this.setCombat(m.on));
      n.on("mountcast", (m) => { if (m.tp && m.ms) this.closeAll(); this.mountCast(m.ms, m.name); }); // телепорт: окна (Сборы, диалог NPC, город) закрываются до переноса
      n.on("air", (m) => this.airBar(m.air, m.max));
      n.on("arena:info", () => this.applyFrame());
      n.on("market:prices", (m: Record<string, number>) => {
        this.prices = m;
        if (this.ctx.net.self && !this.wins.shop.hidden) this.renderSelf(this.ctx.net.self);
      });
      this.rumor.bind(n);
      this.enc.bind(n);
      this.inspect.bind(n);
      this.admin.bind(n);
      this.cook.bind(n);
      this.smith.bind(n);
      this.transmog.bind(n);
      this.bank.bind(n);
      this.bags.bind(n);
      this.stable.bind(n);
      this.menagerie.bind(n);
      this.quest.bind(n);
      this.tp.bind(n);
      this.chatLine({ from: "", text: TX("ui.hud.291", { v: skillKeys(keybinds), v2: keybinds.label("winArena", 0) }), sys: true });
    }
    this.arena.bind(n);
    this.raid.bind(n);
    if (!this.tradeBound) { this.tradeBound = true; this.trade.bind(n); }
    for (const w of Object.values(this.wins)) w.hidden = true;
    this.deadSince = 0;
    this.death.hidden = true;
    if (n.self) this.renderSelf(n.self);
    this.buildMiniBase();
  }

  /** Рамка за сезонную награду вокруг панели героя. */
  private applyFrame() {
    const r = rankById(this.ctx?.net.arenaInfo?.frame ?? "");
    this.player.style.borderColor = r ? r.color : "";
    this.player.style.boxShadow = r ? `0 0 0 1px #000, 0 0 14px ${r.color}66` : "";
  }

  /** Печатают ли сейчас: хоткеи и движение молчат только в текстовом поле, ползунок, флажок или кнопка в фокусе не мешают. */
  isTyping() {
    return isTextField(document.activeElement);
  }
  focusChat() {
    this.chatInput.focus();
  }

  // ---------- сообщения ----------
  /** Подсказка взаимодействия над панелью: «[F] Поговорить: Торговка Марфа». */
  /**
   * Подсказка взаимодействия над панелью: клавиша плашкой, главное — золотом, детали после « · » — второй строкой.
   * Появляется и прячется плавно (errline.css, .show); при уходе текст остаётся до конца затухания.
   */
  setInteractTip(text: string | null) {
    const t = text ?? "";
    if (t === this.itipText) return;
    this.itipText = t;
    if (!t) return void this.itip.classList.remove("show");
    const m = /^\[(.+?)\] ([\s\S]*)$/.exec(t), key = m?.[1] ?? "", body = m ? m[2] : t;
    const [main, ...rest] = body.split(/ [·•] /);
    this.itip.innerHTML = `${key ? `<kbd class="kbd">${esc(key)}</kbd>` : ""}<span class="it-text"><b>${esc(main)}</b>${rest.length ? `<small>${esc(rest.join(" · "))}</small>` : ""}</span>`;
    this.itip.classList.add("show");
  }
  /** Запомнить последнее нажатое умение: отказ с кодом подсветит его слот. */
  notePress(skillId: string) { this.lastCast = { id: skillId, at: performance.now() }; }
  /** Отказ каста: строка ошибок 1,5 с, одинаковая — не чаще 2 раз в секунду, тихий звук, красная вспышка слота. */
  castError(text: string, skillId?: string) {
    const now = performance.now();
    if (skillId) this.hotbar.flashErr(skillId);
    if (now - (this.errAt.get(text) ?? -1e9) < 500) return;
    this.errAt.set(text, now);
    this.errLine.textContent = text;
    this.errLine.classList.add("on");
    clearTimeout(this.errHide);
    this.errHide = window.setTimeout(() => this.errLine.classList.remove("on"), 1500);
    sfx.play("error");
  }
  toast(t: ToastMsg) {
    if (t.code) {
      const lc = this.lastCast;
      return this.castError(t.text, lc && performance.now() - lc.at < 800 ? lc.id : undefined);
    }
    // подбор из мешка: карточка справа (lootfx), в чат — строка с иконкой, как раньше
    if (t.kind === "loot" && t.item) {
      this.lootToasts.push(t.item);
      return this.chatLine({ from: "", text: t.text, sys: true, loot: true, html: t.icon ? this.lootHtml(t) : undefined } as ChatLine & { loot: boolean; html?: string });
    }
    const html = this.lootHtml(t.slot ? { ...t, text: TX("ui.hud.292", { v: t.text, v2: this.hotbar.keyOf(t.slot.bar, t.slot.i) }) } : t);
    const cls = `toast ${t.kind ?? "info"}`;
    // одинаковый тост уже висит — продлить его (анимация с начала, без мигания появления), а не ставить второй
    const same = [...this.toasts.children].find((c) => c.className === cls && c.innerHTML === html) as (HTMLElement & { _hide?: number }) | undefined;
    if (same) {
      same.style.animation = "none";
      void same.offsetWidth;
      same.style.animation = "";
      same.style.animationDelay = "-0.26s";
      clearTimeout(same._hide);
      same._hide = window.setTimeout(() => same.remove(), 3300 - 260);
      if (t.kind !== "loot") return;
    } else {
      const d = el("div", cls) as HTMLElement & { _hide?: number };
      d.innerHTML = html;
      this.toasts.append(d);
      while (this.toasts.children.length > 4) this.toasts.firstElementChild!.remove();
      d._hide = window.setTimeout(() => d.remove(), 3300);
    }
    if (t.kind === "loot") this.chatLine({ from: "", text: t.text, sys: true, loot: true, html: t.icon ? this.lootHtml(t) : undefined } as ChatLine & { loot: boolean; html?: string });
  }
  /** Текст тоста с иконкой предмета и цветными точками классов. */
  private lootHtml(t: ToastMsg): string {
    if (!t.icon) return goldify(esc(t.text));
    const dots = (t.classes ?? []).map((c) => `<i style="display:inline-block;width:6px;height:6px;border-radius:50%;margin-left:3px;background:${CLASS_COLOR[c] ?? "#aaa"}" title="${esc(c)}"></i>`).join("");
    return `<img src="${icon(t.icon)}" width="16" height="16" style="vertical-align:middle;margin-right:4px;image-rendering:pixelated">${goldify(esc(t.text))}${dots}`;
  }
  chatLine(l: ChatLine & { loot?: boolean; html?: string }) {
    const d = el("div", l.sys ? (l.loot ? "loot" : "sys") : "");
    if (l.html) d.innerHTML = l.html;
    else if (l.sys) d.innerHTML = goldify(esc(l.text));
    else if (l.foreign) {
      // противоположная фракция: имя и «чужой язык» красным
      const c = FOE_COLOR;
      d.className = "foreign";
      d.title = TX("ui.hud.293", { v: FACTIONS[l.faction ?? "solgard"]?.name ?? "" });
      d.innerHTML = `<b style="color:${c}">${esc(l.from)}:</b> <i style="color:${c}">${esc(l.text)}</i>`;
    } else {
      // Умбрат: имя в цвете фракции (#8fd46a, правило 2.6): цвета классов (маг, тёмный следопыт, рыцарь смерти) совпадали с эпиком и бирюзой
      const c = l.faction === "umbrath" ? factionColor(l.faction) : CLASS_COLOR[l.cls ?? ""] ?? "#ffb070";
      d.innerHTML = `<b style="color:${c}">${esc(l.from)}:</b> ${esc(l.text)}`;
    }
    if (l.boss) d.innerHTML = `<b class="c-boss">${esc(l.from)}:</b> <span class="c-boss">${esc(l.text)}</span>`;
    else if (l.raid && !l.sys) d.innerHTML = `<b class="c-boss-soft">${esc(l.from)}:</b> ${esc(l.text)}`;
    const atBottom = this.chatLog.scrollTop + this.chatLog.clientHeight >= this.chatLog.scrollHeight - 4;
    this.chatLog.append(d);
    while (this.chatLog.children.length > 80) this.chatLog.firstElementChild!.remove();
    if (atBottom) this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }
  showZone(name: string, sub: string, color = "") {
    this.zoneBanner.style.color = color;
    this.zoneBanner.innerHTML = `${esc(name)}<small>${esc(sub)}</small>`;
    this.zoneBanner.classList.add("show");
    clearTimeout(this.zoneTimer);
    this.zoneTimer = window.setTimeout(() => this.zoneBanner.classList.remove("show"), 2600);
  }

  // ---------- окна ----------
  private makeWindows() {
    const mk = (id: string, cls: string, title: string) => {
      const w = el("div", `panel win ${cls}`);
      w.hidden = true;
      w.innerHTML = `<h2><span>${title}</span><button class="x" aria-label="Закрыть">×</button></h2><div class="body"></div>`;
      w.querySelector<HTMLButtonElement>(".x")!.onclick = () => (w.hidden = true);
      this.root.append(w);
      this.wins[id] = w;
    };
    mk("char", "win-char xl", TX("ui.arena.338"));
    mk("inv", "win-inv s", TX("ui.hud.531"));
    this.wins.inv.append(el("div", "win-foot")); // подвал сумки: подсказка и золото, заполняет renderInv
    mk("skills", "win-skills l", TX("ui.hud.532"));
    mk("shop", "win-shop m", TX("ui.hud.533"));
    this.buildShopFrame();
    mk("settings", "win-settings m", TX("ui.gamemenu.498"));
    this.buildSettings(this.wins.settings.querySelector(".body")!);
    mk("help", "win-help m", TX("ui.gamemenu.500"));
    fillHelp(this.wins.help);
    window.addEventListener("emberfall:help", (e) => this.openHelp((e as CustomEvent<{ tab: HelpTab }>).detail.tab));
    mk("worldmap", "win-worldmap", TX("ui.hud.534"));
  }
  /** «Помощь» на нужной вкладке; собирается при каждом открытии — советы про мышь зависят от опций, правила — от фракции и времени. */
  openHelp(tab: HelpTab) {
    fillHelp(this.wins.help, tab);
    this.wins.help.hidden = false;
  }
  openWorldMap() {
    const w = this.wins.worldmap;
    w.hidden = false;
    if (!this.wmView) {
      this.wmView = new WorldMapView(this.ctx.map, () => this.miniBase, () => this.lastPos, () => ({ known: this.ctx.net.self?.cities, faction: this.ctx.net.self?.faction }), w);
      w.querySelector(".body")!.append(this.wmView.root);
    }
    this.wmView.open();
  }
  toggleWorldMap() {
    if (this.wins.worldmap.hidden) this.openWorldMap();
    else this.wins.worldmap.hidden = true;
  }
  /** Карта мира в режиме выбора точки (телепорт из админ-панели): клик → onPick(x, y) в пикселях мира и карта закрывается; Esc или × → onCancel. */
  pickOnMap(onPick: (x: number, y: number) => void, onCancel: () => void) {
    this.openWorldMap();
    this.wmView!.beginPick(onPick, onCancel);
  }
  /** Esc: закрыть верхнее окно; иначе снять цель; иначе открыть/закрыть меню. */
  escape(hasTarget: boolean, clearTarget: () => void) {
    if (this.gameMenu.close()) return;
    if (this.closeTop()) return;
    if (hasTarget) return clearTarget();
    this.gameMenu.open();
  }
  /** Закрывает одно верхнее по z-index окно (при равенстве — позднее в DOM). */
  private closeTop(): boolean {
    let top: HTMLElement | null = null, tz = -1;
    for (const w of this.root.querySelectorAll<HTMLElement>(".win")) {
      if (w.hidden) continue;
      const z = parseInt(getComputedStyle(w).zIndex, 10) || 0;
      if (z >= tz) { top = w; tz = z; }
    }
    if (!top) return this.closeAll();
    const byCls: Record<string, () => boolean> = {
      "win-bestiary": () => this.bestiary.close(), "win-admin": () => this.admin.close(), "win-rumor": () => this.rumor.close(), "win-statue": () => this.statue.close(), "win-enc": () => this.enc.close(),
      "win-cook": () => this.cook.close(), "win-quest": () => this.quest.close(), "win-qlog": () => this.quest.closeLog(), "win-tp": () => this.tp.close(),
      "win-smith": () => this.smith.close(), "win-tm": () => this.transmog.close(), "win-inspect": () => this.inspect.close(), "win-bank": () => this.bank.close(), "win-bags": () => this.bags.close(), "win-pets": () => this.menagerie.close(), "win-stable": () => this.stable.close(), "win-arena": () => this.arena.close(), "win-muster": () => this.wboss.close(), "win-trade": () => this.trade.close(),
    };
    const cls = [...top.classList].find((c) => byCls[c]);
    if (cls) byCls[cls]();
    else top.hidden = true;
    this.tip.hidden = true;
    return true;
  }
  /** Меню под мини-картой: текстовые пункты с горячей клавишей справа. */
  private buildMenu() {
    const items: [string, string, string, string][] = [["inv", TX("ui.hud.535"), keybinds.label("winInv", 0), TX("ui.hud.535")], ["skills", TX("ui.gamemenu.493"), keybinds.label("winSkills", 0), TX("ui.gamemenu.493")], ["map", TX("ui.gamemenu.497"), keybinds.label("winMap", 0), TX("ui.hud.534")], ["menu", TX("ui.hud.536"), keybinds.label("escape", 0), TX("ui.hud.537")]];
    for (const [k, text, key, label] of items) {
      const b = el("button", "btn mbtn", `<span class="ml">${text}</span><kbd>${key}</kbd>`);
      b.title = key ? `${label} (${key})` : label;
      b.setAttribute("aria-label", label);
      b.onclick = () => (k === "map" ? this.toggleWorldMap() : k === "menu" ? this.gameMenu.toggle() : this.toggle(k));
      this.menuBar.append(b);
    }
  }
  private buildSettings(body: Element) {
    try {
      this.uiScale = Math.min(150, Math.max(80, Number(localStorage.getItem("uiScale")) || 100));
      this.chatSize = Math.min(22, Math.max(14, Number(localStorage.getItem("chatSize")) || 14));
    } catch {}
    // разделы окна — .sec с заголовком .sec-h, строки — .set-list (kit.css); сами строки строят helpers из controls.ts
    body.innerHTML = `<section class="sec">
        <h3 class="sec-h">${TX("ui.hud.538")}</h3>
        <div class="set-list">
          ${segRow("set-screen", "Экран", [["win", "Окно"], ["full", "Полный экран"]], "m", "Клавиша F11 переключает так же")}
          ${rangeRow("set-scale", "Масштаб интерфейса", 80, 150, 5)}
          ${rangeRow("set-chat", "Размер шрифта чата", 14, 22, 1)}
          ${buttonRow("set-resetwin", "Расположение окон", "", "Сбросить")}
        </div>
      </section>
      <section class="sec">
        <h3 class="sec-h">${TX("ui.hud.539")}</h3>
        <div class="set-list">
          ${rangeRow("set-vol", "Громкость звуков", 0, 100, 5)}
          ${rangeRow("set-music", "Громкость музыки", 0, 100, 5)}
          ${checkRow("set-mute", "Без звука")}
        </div>
      </section>
      <section class="sec">
        <h3 class="sec-h">${TX("ui.hud.540")}</h3>
        <div class="set-list">
          ${checkRow("set-selfNames", "Мой ник над персонажем")}
          ${checkRow("set-selfBars", "Моя полоска здоровья")}
          ${checkRow("set-names", "Ники всех остальных")}
          ${checkRow("set-bars", "Полоски здоровья всех остальных")}
          ${checkRow("set-autoNames", "В толпе прятать уровень у ников", "Кроме цели, группы и раненых (авто)")}
          ${checkRow("set-crowdNums", "Чужие цифры урона в толпе приглушать")}
          ${checkRow("set-camLead", "Камера смотрит вперёд при беге", "Чуть смещается по ходу движения и не дёргается от мелких шагов")}
          ${checkRow("set-bossIntro", "Вступление босса", "Камера показывает босса, имя на весь экран, интерфейс прячется на 5 с")}
          ${segRow("set-gearfx", GEAR_FX.setting.label, GEAR_FX.setting.modes.map((m): [string, string] => [m.id, m.label]), "m", GEAR_FX.setting.note)}
          ${segRow("set-enchfx", GEAR_FX.enchantB.setting.label, GEAR_FX.enchantB.setting.modes.map((m): [string, string] => [m.id, m.label]), "m", GEAR_FX.enchantB.setting.note)}
          ${segRow("set-vfx", "Эффекты", [["full", "Полные"], ["simple", "Простые"]], "m", "Простые: без точечного света, Bloom, марева и блеска, дождь реже")}
          ${segRow("set-shadows", "Тени", [["off", "Выкл"], ["simple", "Простые"], ["dynamic", "Динамические"]], "m", "Динамические следуют за временем суток: утром длинные влево, в полдень короткие, вечером вправо")}
        </div>
      </section>
      <div class="sec" id="set-controls"></div>`;
    const q = <T extends HTMLElement>(sel: string) => body.querySelector<T>(sel)!;
    q("#set-resetwin").onclick = () => resetWindowPositions();
    buildControls(q("#set-controls"));
    void offerSchemeOnce();
    const sc = q<HTMLInputElement>("#set-scale"), ch = q<HTMLInputElement>("#set-chat");
    sc.value = String(this.uiScale);
    ch.value = String(this.chatSize);
    // масштаб применяется, когда ползунок отпущен: пока его тянут, интерфейс не меняет размер и ползунок не уезжает из-под курсора
    sc.oninput = () => { q("#set-scale-v").textContent = sc.value + "%"; };
    sc.onchange = () => { this.uiScale = Number(sc.value); this.applySettings(); try { localStorage.setItem("uiScale", sc.value); } catch {} };
    ch.oninput = () => { this.chatSize = Number(ch.value); this.applySettings(); try { localStorage.setItem("chatSize", ch.value); } catch {} };
    const vol = q<HTMLInputElement>("#set-vol"), mute = q<HTMLInputElement>("#set-mute"), volV = q<HTMLOutputElement>("#set-vol-v");
    vol.value = String(Math.round(sfx.getVolume() * 100));
    volV.textContent = vol.value + "%";
    mute.checked = sfx.isMuted();
    const mus = q<HTMLInputElement>("#set-music"), musV = q<HTMLOutputElement>("#set-music-v");
    mus.value = String(Math.round(sfx.getMusicVolume() * 100));
    musV.textContent = mus.value + "%";
    mus.oninput = () => { sfx.setMusicVolume(Number(mus.value) / 100); musV.textContent = mus.value + "%"; };
    vol.oninput = () => { sfx.setVolume(Number(vol.value) / 100); volV.textContent = vol.value + "%"; sfx.play("hit"); };
    mute.onchange = () => sfx.setMuted(mute.checked);
    // заливку дорожки ставим после начальных значений; на input её обновляет сам rangeFill
    for (const r of [sc, ch, vol, mus]) rangeFill(r);
    for (const key of ["selfNames", "selfBars", "names", "bars", "autoNames", "crowdNums", "camLead", "bossIntro"] as const) {
      const c = q<HTMLInputElement>("#set-" + key);
      c.checked = overlay[key];
      c.onchange = () => setOverlay(key, c.checked);
    }
    // режим эффектов — только свой #set-gearfx: у «Режима прицела» в controls.ts тоже data-m
    seg(q("#set-gearfx"), (m) => setGearFxMode(m as GearFxMode), "m").set(gearFxMode());
    seg(q("#set-enchfx"), (m) => setEnchantFxMode(m as EnchantFxMode), "m").set(enchantFxMode());
    seg(q("#set-vfx"), (m) => setVfxMode(m as VfxMode), "m").set(vfxMode());
    seg(q("#set-shadows"), (m) => setShadowMode(m as ShadowMode), "m").set(shadowMode());
    // полный экран — Fullscreen API (браузер и десктоп-клиент; в клиенте F11 и запоминание режима — desktop/src/main.ts); выход по Esc или F11 обновляет переключатель
    const screenSeg = seg(q("#set-screen"), (m) => {
      if (m === "full" && !document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => screenSeg.set("win"));
      else if (m === "win" && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    }, "m");
    const syncScreen = () => screenSeg.set(document.fullscreenElement || window.innerHeight >= screen.height - 1 ? "full" : "win");
    syncScreen();
    document.addEventListener("fullscreenchange", syncScreen);
    window.addEventListener("resize", syncScreen);
    this.settingsBody = body;
  }
  private settingsBody: Element | null = null;
  /** Пиксель шрифта заголовков внутри HUD (--hu, styles/tokens.css): учитывает и масштаб экрана, и zoom интерфейса. */
  private headDpr = 0;
  private syncHeadUnit = () => {
    const dpr = window.devicePixelRatio || 1;
    this.root.style.setProperty("--hu", `${10 / (dpr * this.uiScale / 100)}px`);
    // подписка на смену масштаба экрана — одна на каждое значение dpr
    if (dpr !== this.headDpr) { this.headDpr = dpr; matchMedia(`(resolution: ${dpr}dppx)`).addEventListener("change", this.syncHeadUnit, { once: true }); }
  };
  /** Под CSS zoom корня 100vh/100vw не уменьшаются: окна при масштабе 120–150 % вылезали за экран. --vh/--vw — видимая область в пикселях корня. */
  private syncViewport = () => {
    const z = this.uiScale / 100;
    this.root.style.setProperty("--vh", `${window.innerHeight / z}px`);
    this.root.style.setProperty("--vw", `${window.innerWidth / z}px`);
  };
  private applySettings() {
    (this.root.style as CSSStyleDeclaration & { zoom: string }).zoom = String(this.uiScale / 100);
    if (!this.vpBound) { this.vpBound = true; window.addEventListener("resize", this.syncViewport); }
    this.syncViewport();
    this.root.style.setProperty("--fs-chat", this.chatSize + "px");
    this.syncHeadUnit();
    this.layoutBottom();
    const b = this.settingsBody;
    if (b) { b.querySelector("#set-scale-v")!.textContent = this.uiScale + "%"; b.querySelector("#set-chat-v")!.textContent = this.chatSize + "px"; }
  }
  /** Свернуть или развернуть мини-карту (клавиша M), выбор запоминается. */
  toggleMinimap() {
    const hidden = this.mini.classList.toggle("collapsed");
    try { localStorage.setItem("minimapHidden", hidden ? "1" : "0"); } catch {}
  }

  toggle(id: string) {
    if (id === "arena") return this.arena.toggle();
    if (id === "muster") return this.wboss.toggle();
    if (id === "bestiary") return this.bestiary.toggle(this.ctx.net.self);
    if (id === "admin") return this.ctx.net.self?.isAdmin ? this.admin.toggle() : undefined;
    if (this.ctx.net.kind === "arena" && id === "shop") return;
    const w = this.wins[id];
    w.hidden = !w.hidden;
    if (!w.hidden && this.ctx.net.self) this.renderSelf(this.ctx.net.self);
    if (id === "shop" && w.hidden) this.renderSelf(this.ctx.net.self!);
  }
  closeAll(): boolean {
    let any = [() => this.bestiary.close(), () => this.admin.close(), () => this.rumor.close(), () => this.statue.close(), () => this.enc.close(), () => this.cook.close(), () => this.quest.close(), () => this.tp.close(), () => this.smith.close(), () => this.transmog.close(), () => this.bank.close(), () => this.bags.close(), () => this.stable.close(), () => this.menagerie.close(), () => this.arena.close(), () => this.wboss.close(), () => this.raid.close(), () => this.trade.close(), () => this.inspect.close()].map((f) => f()).some(Boolean);
    for (const w of Object.values(this.wins)) if (!w.hidden) { w.hidden = true; any = true; }
    this.tip.hidden = true;
    return any;
  }
  private prices: Record<string, number> = {};
  /** Актуальная цена продажи: [цена, нормальная, ▼ если спрос низкий]. */
  private sellInfo(it: Item): { price: number; low: boolean } {
    const normal = Math.round(baseSellValue(it));
    const price = this.prices[it.uid] ?? normal;
    return { price, low: price < normal };
  }
  private priceHtml(it: Item): string {
    const { price, low } = this.sellInfo(it);
    return `${gold(price)}${low ? ` <span class="warn">▼ спрос низкий</span>` : ""}`;
  }
  /** Окно торговли; name — у кого (торговцы городов и поселений), по умолчанию Марфа. */
  openShop(name = TX("ui.hud.533")) {
    if (npcRefuses(this.ctx?.net, "shop", name)) return;
    this.ctx.net.send("market:get", {});
    const title = this.wins.shop.querySelector("h2 > span");
    if (title && title.textContent !== name) title.textContent = name;
    this.wins.shop.hidden = false;
    this.sellSel.clear();
    if (this.ctx.net.self) this.renderSelf(this.ctx.net.self);
  }
  private body(id: string) {
    return this.wins[id].querySelector<HTMLElement>(".body")!;
  }

  // ---------- подсказки ----------
  tipFor(elm: HTMLElement, html: () => string) {
    elm.addEventListener("mouseenter", (e) => {
      // нативная подсказка title (название слота) не должна лезть поверх своей
      const t = elm.getAttribute("title");
      if (t) { elm.dataset.title = t; elm.removeAttribute("title"); }
      this.tip.innerHTML = html();
      this.tip.hidden = false;
      this.moveTip(e);
    });
    elm.addEventListener("mouseleave", () => {
      this.tip.hidden = true;
      if (elm.dataset.title) { elm.title = elm.dataset.title; delete elm.dataset.title; }
    });
  }
  private moveTip(e: MouseEvent) {
    if (this.tip.hidden) return;
    const z = this.uiScale / 100;
    const r = this.tip.getBoundingClientRect();
    let x = e.clientX + 16, y = e.clientY + 16;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 12;
    if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
    this.tip.style.left = x / z + "px";
    this.tip.style.top = y / z + "px";
  }
  /** Подсказка печати маунта или детали: что даёт / для чего, передаётся ли, как изучить, цена продажи. */
  private stableItemTip(it: Item, s: SelfState, bare: boolean): string {
    const head = (sub: string) => `<div class="tip-head"><div class="tip-ico"><span class="cell sm r${it.rarity}"><img src="${icon(iconFor(it))}" alt=""></span><div><div class="tip-title r${it.rarity}">${esc(itemName(it))}</div><div class="tip-sub">${sub}</div></div></div></div>`;
    const trade = isBound(it) ? `<div class="c-bad">${TX("ui.hud.541")}</div>` : `<div class="c-ok">${TX("ui.hud.542")}</div>`;
    const price = bare ? "" : `<div class="tip-foot">${TX("ui.hud.543", { it: this.priceHtml(it) })}</div>`;
    const sm = sealMount(it.base);
    if (sm) {
      const m = MOUNTS[sm], owned = !!s.mounts?.includes(sm), low = s.level < m.level, foe = !!m.faction && m.faction !== s.faction;
      return head(`${SEAL.name} · ${RARITY_NAMES[it.rarity]}`)
        + `<div class="tip-sec"><div>${TX("ui.hud.544")} <b style="color:${TIER_COLOR[m.tier]}">${esc(m.name)}</b></div><div class="d">${TX("ui.hud.545", { tier: MOUNT_TIERS[m.tier], speed: String(m.speed).replace(".", ","), flying: m.flying ? " · летающий" : "", level: m.level })}</div>`
        + `${owned ? `<div class="c-warn">Уже в коллекции — печать можно продать${isBound(it) ? "" : " или передать"}</div>` : low ? `<div class="c-bad">Нужен ${m.level} уровень</div>` : foe ? `<div class="c-bad">Только для другой фракции</div>` : ""}</div>`
        + `<div class="tip-sec">${trade}<div>${TX("ui.hud.546")}</div></div>${price}`;
    }
    const pid = it.base.slice(PART_PREFIX.length), d = PARTS[pid];
    const uses = MOUNT_IDS.map((id) => MOUNTS[id]).filter((m) => m.craft?.parts[pid] && (!m.faction || m.faction === s.faction));
    const list = uses.map((m) => `<div><span style="color:${TIER_COLOR[m.tier]}">${esc(m.name)}</span> <span class="d">×${m.craft!.parts[pid]}${m.craft!.arenaRating ? `, рейтинг ${m.craft!.arenaRating}` : ""}</span></div>`).join("");
    return head(`${pid === "gladiator" ? "Валюта арены" : "Деталь для конюшего"} · ${it.qty ?? 1} шт.`)
      + `<div class="tip-sec"><div class="d">${esc(d.desc)}</div></div>`
      + `<div class="tip-sec"><div class="d">${TX("ui.hud.547")}</div>${list || `<div class="d">—</div>`}</div>`
      + `<div class="tip-sec">${isBound(it) ? `<div class="c-bad">Привязана к герою: передать нельзя</div>` : `<div class="c-ok">Можно передать или продать</div>`}</div>${price}`;
  }
  /** Подсказка «Печати питомца» (задача 150): какой питомец, роль и умения, можно ли изучить, передаётся ли, цена продажи. */
  private petSealTip(it: Item, s: SelfState, bare: boolean): string {
    const d = PETS[sealPet(it.base)!];
    const owned = !!s.pets?.[d.id], low = s.level < d.level, foe = !canKeepPet(d, s.faction);
    const head = `<div class="tip-head"><div class="tip-ico"><span class="cell sm r${it.rarity}"><img src="${icon(iconFor(it))}" alt=""></span><div><div class="tip-title r${it.rarity}">${esc(itemName(it))}</div><div class="tip-sub">${esc(PET_SEAL.name)} · ${RARITY_NAMES[it.rarity]}</div></div></div></div>`;
    return head
      + `<div class="tip-sec"><div>Питомец: <b>${esc(d.name)}</b></div><div class="d">${PET_TIERS[d.tier ?? "common"]} · ${esc(PET_ROLES[d.role ?? ""] ?? "")} · с ${d.level} уровня</div>${d.skills.map((k) => `<div class="d"><b>${esc(k.name)}</b> — ${esc(k.desc)}</div>`).join("")}`
      + `${owned ? `<div class="c-warn">Уже в коллекции — печать можно продать${isBound(it) ? "" : " или передать"}</div>` : low ? `<div class="c-bad">Нужен ${d.level} уровень</div>` : foe ? `<div class="c-bad">Только для другой фракции</div>` : ""}</div>`
      + `<div class="tip-sec">${isBound(it) ? `<div class="c-bad">Привязана к герою: передать нельзя</div>` : `<div class="c-ok">До изучения можно передать или продать</div>`}<div>Клик — изучить: питомец навсегда войдёт в коллекцию</div></div>`
      + (bare ? "" : `<div class="tip-foot">${TX("ui.hud.543", { it: this.priceHtml(it) })}</div>`);
  }
  /** «Оболочка» перековки: превью вида на своём герое, слот и семейство, «примерить» (ПКМ в сумке). */
  private shellTip(it: Item, s: SelfState, bare: boolean): string {
    const ap = it.appearance;
    const head = `<div class="t r${it.rarity}">${esc(itemName(it))}</div>`;
    if (!ap) return head;
    const slot = slotOf(ap.base), fam = familyOf(ap.base);
    const at = tryOnSlot(s.equip, ap);
    const look = gearStrings(at ? withLook(s.equip, at, ap) : s.equip);
    return head
      + `<div class="d">${TX("ui.transmog.shellTip", { slot: slot ? SLOT_NAMES[slot] : "", family: fam ? FAMILY_NAMES[fam] ?? fam : "" })}</div>`
      + `<div class="tm-tip-pv">${previewImg(s.cls, s.faction, look.gear, look.weapon, "tm-hero")}</div>`
      + `<div class="fx theme c-r${ap.rarity}">${TX("ui.transmog.lookOf", { name: esc(ap.name) })}</div>`
      + `<div class="d">${TX("ui.transmog.shellUse")}</div>`
      + (bare ? "" : `<div class="d">${TX("ui.hud.550", { it: this.priceHtml(it) })}</div>`);
  }
  /** «Примерить» оболочку: вид на своём герое на 10 с, только на клиенте. */
  private tryOnShell(it: Item) {
    const s = this.ctx.net.self, ap = it.appearance;
    if (!s || !ap) return;
    const at = tryOnSlot(s.equip, ap);
    if (!at) return this.toast({ text: TX("ui.transmog.tryOnNo"), kind: "error" });
    setTryOn(gearStrings(withLook(s.equip, at, ap)), 10000);
    this.toast({ text: TX("ui.transmog.tryOn", { name: ap.name }), kind: "info" });
  }
  /** Подсказка предмета. bare — без цены и подсказок по клику (осмотр чужого героя, лавка встречи, окно «Герой»). */
  itemTip(it: Item, s: SelfState, equipped = false, bare = false): string {
    const b = BASE_ITEMS[it.base];
    const lines: string[] = [`<div class="t r${it.rarity}">${esc(itemName(it))}</div>`];
    if (b.slot === "consumable") {
      const dish = foodOf(it.base);
      if (dish) return foodTip(dish) + `<div class="d">${TX("ui.hud.548", { qty: it.qty ?? 1 })}</div>`;
      if (MATERIALS[it.base]) return lines.join("") + `<div class="d">${TX("ui.hud.549", { qty: it.qty ?? 1 })}</div><div class="d">${TX("ui.hud.550", { it: this.priceHtml(it) })}</div>`;
      // конюшня (задача 142): «Печать скакуна», Печать гладиатора и детали маунтов — сгруппированная подсказка (tip-head/tip-sec/tip-foot)
      if (sealMount(it.base) || isPart(it.base)) return this.stableItemTip(it, s, bare);
      if (sealPet(it.base)) return this.petSealTip(it, s, bare);
      if (isShell(it)) return this.shellTip(it, s, bare);
      lines.push(`<div class="d">${TX("ui.hud.551", { qty: it.qty ?? 1 })}</div>`, `<div>${it.base === "hp_potion" ? "Восстанавливает 45% здоровья" : "Восстанавливает 50% маны"}</div>`, `<div class="d">${TX("ui.hud.552", { e: it.base === "hp_potion" ? "Q" : "E" })}</div>`);
    } else {
      const slot = b.slot, plus = it.plus || 0;
      // у надетой вещи в строке типа название слота (title ячейки снимается при наведении, tipFor)
      const typ = itemTypeName(it), typTxt = equipped && SLOT_NAMES[slot] !== typ ? `${SLOT_NAMES[slot]}: ${typ}` : typ;
      lines.push(`<div class="d">${TX("ui.hud.553", { rarity: RARITY_NAMES[it.rarity], typtxt: typTxt, base: isTwoHanded(it.base) ? " (двуручное)" : "", ilvl: it.ilvl })}</div>`);
      const st = effStats(it);
      // доля заточки: разница между характеристикой с заточкой и без неё
      const up = (k: ItemStatKey) => (st[k] || 0) - (it.stats[k] || 0);
      const fromPlus = (txt: string) => (txt ? ` <span class="st">${TX("ui.hud.554", { txt: txt })}</span>` : "");
      if (st.dmgMin) {
        const lo = up("dmgMin"), hi = up("dmgMax");
        lines.push(`<div>${TX("ui.hud.555", { dmgmin: st.dmgMin, dmgmax: st.dmgMax, fromplus: fromPlus(hi > 0 ? `+${lo === hi ? hi : `${lo}–${hi}`}` : "") })}</div>`);
      }
      if (st.armor) lines.push(`<div>${TX("ui.hud.556", { armor: st.armor, fromplus: fromPlus(up("armor") > 0 ? `+${up("armor")}` : "") })}</div>`);
      for (const [k, v] of Object.entries(st)) if (!["dmgMin", "dmgMax", "armor"].includes(k)) lines.push(`<div class="st">+${v}${k === "crit" ? "%" : ""} ${ITEM_STAT_NAMES[k as ItemStatKey]}${fromPlus(up(k as ItemStatKey) > 0 ? `+${up(k as ItemStatKey)}` : "")}</div>`);
      // что нарисовано на герое: ступень заточки и тема легендарки (data/gear-fx.json)
      // бирюза только у видимой заточки (ступень 1+); для +1…+3 строка серая, тема легендарки в цвете легендарки (правило 2.6)
      if (plus > 0) lines.push(`<div class="fx${enchantTier(plus) >= 1 ? " ench" : ""}">${TX("ui.hud.557", { plus: plus, tiertext: esc(tierText(slot, enchantTier(plus))), nextsteptext: nextStepText(slot, plus) ? ` ${esc(nextStepText(slot, plus))}` : "" })}</div>`);
      const theme = legendText(slot, it.legendary);
      if (theme) lines.push(`<div class="fx theme">${TX("ui.gearfx.513", { theme: esc(theme) })}</div>`);
      // строки модели (задача 147: «Особая анимация удара» у Пылающего клинка Хаоса — data/items-147.json tooltip)
      for (const t of (it.model ? ITEM_MODELS[it.model]?.tooltip : undefined) ?? []) lines.push(`<div class="fx theme">${esc(t)}</div>`);
      if (b.classes) lines.push(`<div class="${b.classes.includes(s.cls) || bare ? "d" : "warn"}">${TX("ui.hud.558", { map: b.classes.map((c) => CLASSES[c].name).join(", ") })}</div>`);
      if (Number.isFinite(it.req) && it.req > 0) lines.push(`<div class="${it.req > s.level && !bare ? "warn" : "d"}">${TX("ui.hud.559", { req: it.req })}</div>`);
      if (isBound(it)) lines.push(`<div class="${bare ? "d" : "warn"}">${TX("ui.hud.560")}</div>`);
      if (it.legendary && LEGENDARIES[it.legendary]) lines.push(`<div class="legend">★ ${esc(LEGENDARIES[it.legendary].desc)}</div>`, `<div class="lore">${esc(LEGENDARIES[it.legendary].lore)}</div>`);
      if (it.unique) lines.push(`<div class="lore">${esc(UNIQUES[it.unique].lore)}</div>`);
      // перековка: наложенный вид другой вещи (docs/art/gear.md); сила — своя
      if (it.appearance) lines.push(`<div class="fx theme c-r${it.appearance.rarity}">${TX("ui.transmog.lookOf", { name: esc(it.appearance.name) })}</div>`);
      if (!equipped) {
        const cur = s.equip[slot];
        if (cur && cur.uid !== it.uid) {
          const diff = (k: ItemStatKey) => (st[k] || 0) - (effStats(cur)[k] || 0);
          const parts = (["dmgMax", "armor", "str", "agi", "int", "vit", "hp", "crit"] as ItemStatKey[]).map((k) => [k, diff(k)] as const).filter(([, v]) => v !== 0);
          if (parts.length) lines.push(`<div class="d">${TX("ui.hud.561", { v: esc(itemName(cur)), map: parts.map(([k, v]) => `<span style="color:${v > 0 ? "var(--ok)" : "var(--bad)"}">${v > 0 ? "+" : ""}${v} ${k === "dmgMax" ? "урон" : ITEM_STAT_NAMES[k].toLowerCase()}</span>`).join(", ") })}</div>`);
        }
      }
    }
    if (!bare) {
      lines.push(`<div class="d">${!this.wins.shop.hidden && !equipped ? "Клик — продать за " : "Цена у торговца: "}${this.priceHtml(it)}</div>`);
      if (equipped) lines.push(`<div class="d">${TX("ui.hud.562")}</div>`);
      else if (b.slot !== "consumable" && this.wins.shop.hidden) lines.push(`<div class="d">${TX("ui.hud.563")}</div>`);
    }
    if (b.slot !== "consumable" && (it.plus || it.rarity > 0)) lines.push(`<div class="hint">${esc(GEAR_FX.texts.tooltipHint)}</div>`);
    return lines.join("");
  }
  /** brief — подсказка на панели умений (хотбар): только текущий ранг; следующий ранг и изучение — только в окне умений. */
  skillTip(def: SkillDef, s: SelfState, brief = false): string {
    const r = s.skills[def.id] || 0;
    // клавиша — по месту умения среди активных (так его вызывает панель), а не по полю slot, и по раскладке игрока
    const at = def.kind === "active" ? findRef(s.bars, { s: def.id }) : null;
    const key = at ? this.hotbar.keyOf(at.bar, at.i) : "";
    const lines = [`<div class="t">${def.name}</div>`, `<div class="d">${TX("ui.hud.564", { key: def.kind === "active" ? `Активное${key ? ` · клавиша ${key}` : ""}` : "Пассивное", r: r, maxrank: def.maxRank })}</div>`];
    lines.push(`<div>${def.desc(Math.max(1, r))}</div>`);
    if (def.kind === "active") lines.push(`<div class="d">${TX("ui.hud.565", { skillmana: skillMana(def, r, s.level), math: def.cd!(Math.max(1, r)).toFixed(1), math2: def.range ? ` · Дальность: ${Math.round(def.range / TILE)} кл.` : "" })}</div>`);
    if (brief) return lines.join("");
    if (r > 0 && r < def.maxRank) lines.push(`<div class="st">${TX("ui.hud.566", { desc: def.desc(r + 1) })}</div>`);
    const why = canLearn(def, s.skills, s.level, s.skillPoints);
    if (why && r < def.maxRank) lines.push(`<div class="warn">${why}</div>`);
    else if (!why) lines.push(`<div class="st">${TX("ui.hud.567")}</div>`);
    return lines.join("");
  }

  // ---------- личное состояние ----------
  private showInvWin() {
    if (this.wins.inv.hidden && this.ctx?.net.self) { this.wins.inv.hidden = false; this.renderSelf(this.ctx.net.self); }
  }
  renderSelf(s: SelfState) {
    this.bestiary.update(s);
    if (!s.isAdmin) this.admin.close();
    if (!s) return;
    this.cook.update(s);
    this.quest.update(s);
    this.tp.update(s, this.lastPos);
    this.smith.update(s);
    this.transmog.update(s);
    this.bank.update();
    this.bags.update();
    this.stable.update();
    this.menagerie.update();
    this.lastSelfLevel = s.level;
    this.levelLook.feed(s);
    const net = this.ctx.net;
    // панель героя: уровень плашкой, ник и под ним класс, фракция; на максимальном уровне полосы опыта нет
    const pts = [s.statPoints ? `<span class="pill" data-open="char">${TX("ui.hud.568", { statpoints: s.statPoints })}</span>` : "", s.skillPoints ? `<span class="pill" data-open="skills">+${s.skillPoints} ум.</span>` : ""].join("");
    const xpPct = s.xpNext ? Math.floor((s.xp / s.xpNext) * 100) : 0;
    this.player.innerHTML = `
      <div class="row1"><span class="lvl" title="Уровень ${s.level}">${s.level}</span><span class="nm" title="${esc(s.name)}">${esc(s.name)}</span><span class="chip bad combat-badge" ${this.inCombat ? "" : "hidden"}>${TX("ui.hud.569")}</span><span class="cls">${CLASSES[s.cls].name}</span><span class="fac-badge" title="${esc(FACTIONS[s.faction]?.full ?? "")}">${esc(FACTIONS[s.faction]?.name ?? "")}</span></div>
      <div class="bar hp lg"><s class="hp-lag" id="hp-lag"></s><i id="hp-fill"></i><b class="abs" id="hp-abs" hidden></b><span id="hp-text"></span></div>
      <div class="bar mp"><i id="mp-fill"></i><span id="mp-text"></span></div>
      ${s.xpNext ? `<div class="bar xp" title="Опыт: ${xpPct}%"><i style="width:${xpPct}%"></i></div>` : ""}
      ${s.xpNext || pts ? `<div class="pts">${s.xpNext ? `<span class="c-dim">Опыт ${formatNumber(s.xp)} / ${formatNumber(s.xpNext)}</span>` : ""}${pts}</div>` : ""}
      <div class="pf-foot">${gold(s.gold)}</div>`;
    // низ рамки: бафы и дебафы слева (один и тот же элемент — значки и подсказки переживают перерисовку), золото справа
    this.player.querySelector(".pf-foot")!.prepend(this.heroAuras.el);
    this.player.querySelectorAll<HTMLElement>("[data-open]").forEach((p) => (p.onclick = () => this.toggle(p.dataset.open!)));

    // панель умений: строится один раз, см. ui/hotbar.ts
    this.hotbar.update(s);
    this.hotbar.mountHost.innerHTML = ""; this.hotbar.petHost.innerHTML = "";
    {
      const mid = s.mount ?? "";
      const md = MOUNTS[mid];
      const mounted = !!(this.ctx.net.unit(s.id)?.mount);
      const b = el("button", `slot ${md ? "" : "empty"}`, `${md ? `<img src="${icon(mountSprite(mid))}" alt="" style="width:44px;height:44px;object-fit:contain;image-rendering:pixelated;position:absolute;left:3px;top:3px;${mounted ? "opacity:.55" : ""}">` : `<span style="font-size:26px;line-height:50px;display:block;text-align:center">♞</span>`}<kbd>${keybinds.label("mount", 0)}</kbd>`);
      b.style.position = "relative";
      b.onclick = () => this.ctx.toggleMount?.();
      this.tipFor(b, () => this.arenaLockTip() + (md ? `<div class="t">${md.name}</div><div class="d">${TX("ui.hud.570", { speed: md.speed, label: keybinds.label("mount", 0), label2: keybinds.label("mountNext", 0) })}</div>` : `<div class="t">${TX("ui.hotbar.521")}</div><div class="d">${TX("ui.hud.571")}</div>`));
      this.hotbar.mountHost.append(b);
    }
    {
      const pd = PETS[s.pet ?? ""];
      const rec = s.pets?.[s.pet ?? ""];
      const out = !!this.ctx.net.unit(petUnitId(s.id));
      const b = el("button", `slot ${pd ? "" : "empty"}`, `<span style="font-size:26px;line-height:50px;display:block;text-align:center">${out ? "✕" : "🐾"}</span><kbd>${keybinds.label("pet", 0)}</kbd>`);
      b.onclick = () => this.ctx.togglePet?.();
      this.tipFor(b, () => this.arenaLockTip() + (pd && rec
        ? `<div class="t">${pd.name} · ур. ${rec.level}</div>${this.petLevelHtml(pd.id, s)}<div class="d">${pd.skills.map((k) => `${k.name}: ${k.desc}`).join("<br>")}<br>${TX("ui.hud.572", { label: keybinds.label("pet", 0), label2: keybinds.label("petNext", 0) })}</div>`
        : `<div class="t">${TX("ui.hotbar.522")}</div><div class="d">${TX("ui.hud.573")}</div>`));
      this.hotbar.petHost.append(b);
    }
    if (!this.wins.char.hidden) this.renderChar(s);
    if (!this.wins.inv.hidden) this.renderInv(s);
    if (!this.wins.skills.hidden) this.renderSkills(s);
    if (!this.wins.shop.hidden) this.renderShop(s);
  }

  /** Маунт и питомец на арене запрещены (shared/arena.ts): строка-предупреждение над подсказкой кнопки. */
  private arenaLockTip(): string { return this.ctx.net.kind === "arena" ? `<div class="warn">${ARENA_BLOCKED_TEXT}</div>` : ""; }

  // ---------- бафы и дебафы в рамке героя и в плашке цели ----------
  private static rowsOf(list: Aura[]): AuraRow[] {
    const t = performance.now();
    return list.map((a) => ({ k: a.k, n: a.n, v: a.v, end: a.ms > 0 ? t + a.ms : 0, m: a.m === 1 }));
  }
  /** Новый полный список эффектов (сообщение "auras" или синтетический из аудита): отсчёт идёт здесь, от момента получения. */
  setAuras(list: Aura[]) {
    this.heroAuras.rows = Hud.rowsOf(list);
    this.renderAuras(this.heroAuras);
  }
  /** Эффекты выбранной цели (сообщение "tauras"; id null — цели нет). Порядок значков выбирает frame() по тому, враг это или союзник. */
  setTargetAuras(id: string | null, list: Aura[]) {
    this.tgtAurasId = id;
    this.tgtAuras.rows = Hud.rowsOf(list);
    this.renderAuras(this.tgtAuras);
  }

  /** Строка значков: у героя — сначала бафы, затем дебафы; у цели — порядок strip.order. Нет эффектов — нет строки. */
  private renderAuras(s: AuraStrip) {
    const t = performance.now();
    const rows = s.rows.filter((a) => AURAS[a.k] && (!a.end || a.end > t)).sort(s.order ?? ((a, b) => auraCompare(a.k, b.k)));
    s.rows = rows;
    const keep = new Set(rows.map((r) => r.k));
    for (const [k, c] of s.cells) {
      if (keep.has(k)) continue;
      if (this.auraHover?.s === s && this.auraHover.k === k) { this.auraHover = null; this.tip.hidden = true; }
      c.el.remove();
      s.cells.delete(k);
    }
    rows.forEach((a, i) => {
      let c = s.cells.get(a.k);
      if (!c) s.cells.set(a.k, (c = this.makeAuraCell(s, a)));
      c.a = a;
      if (c.el.classList.contains("mine") !== !!a.m) c.el.classList.toggle("mine", !!a.m);
      if (s.el.children[i] !== c.el) s.el.insertBefore(c.el, s.el.children[i] ?? null);
      const tm = a.end ? auraTimeLabel(a.end - t) : "";
      if (c.tm.textContent !== tm) c.tm.textContent = tm;
      const st = a.n && a.n > 1 ? String(a.n) : "";
      if (c.st.textContent !== st) { c.st.textContent = st; c.st.hidden = !st; }
    });
    if (s === this.heroAuras) s.el.hidden = rows.length === 0; // строку цели прячет frame(): ещё и по тому, чей это список
  }

  /** Ячейка эффекта: значок, стаки, время; у дебафа красная рамка; еда — .food-buff; у цели мой эффект — .mine. Подсказка — общая (this.tip). */
  private makeAuraCell(s: AuraStrip, a: AuraRow): AuraCell {
    const d = AURAS[a.k];
    const e = el("div", `cell aura${d.kind === "debuff" ? " debuff" : ""}${foodOfAura(a.k) ? " food-buff" : ""}`, `<img src="${icon(d.icon)}" alt=""><span class="qty" hidden></span><span class="tm"></span>`);
    e.setAttribute("role", "img");
    e.setAttribute("aria-label", d.name);
    const c: AuraCell = { el: e, tm: e.querySelector<HTMLElement>(".tm")!, st: e.querySelector<HTMLElement>(".qty")!, a };
    e.onmouseenter = (ev) => { this.auraHover = { s, k: a.k }; this.tip.innerHTML = this.auraTip(c.a); this.tip.hidden = false; this.moveTip(ev); };
    e.onmousemove = (ev) => this.moveTip(ev);
    e.onmouseleave = () => { if (this.auraHover?.s === s && this.auraHover.k === a.k) { this.auraHover = null; this.tip.hidden = true; } };
    return c;
  }

  /** Подсказка эффекта: название, вид и остаток времени, описание с величиной и стаками; у еды — подсказка блюда. */
  private auraTip(a: AuraRow): string {
    const d = AURAS[a.k];
    if (!d) return "";
    const left = a.end ? Math.max(0, a.end - performance.now()) : 0;
    const dish = foodOfAura(a.k);
    if (dish) return foodTip(FOOD[dish], Math.max(1, Math.ceil(left / 60000)));
    const bad = d.kind === "debuff";
    return [
      `<div class="t${bad ? " warn" : ""}">${esc(d.name)}</div>`,
      `<div class="d">${bad ? "Дебафф" : "Бафф"}${a.m ? " · ваш" : ""} · ${a.end ? `осталось ${auraTimeWords(left)}` : "без срока"}</div>`,
      `<div>${esc(auraText(d.desc, a.v, a.n, formatNumber))}</div>`,
      warOfAura(a.k) ? `<div class="d">${esc(warBuffUntil(warOfAura(a.k)!, left))}</div>` : "", // баф земли «Знамён Предела»: до когда
    ].join("");
  }

  /** Раз в секунду: время в углу значков, исчезновение истёкших и остаток в открытой подсказке. */
  private tickAuras() {
    if (this.heroAuras.rows.length) this.renderAuras(this.heroAuras);
    if (this.tgtAuras.rows.length) this.renderAuras(this.tgtAuras);
    const h = this.auraHover, c = h ? h.s.cells.get(h.k) : undefined;
    if (c && !this.tip.hidden) this.tip.innerHTML = this.auraTip(c.a);
  }

  /** Раздел «Эффекты снаряжения» в окне «Герой» открыт? Окно пересоздаёт разметку при каждом обновлении, поэтому состояние живёт здесь и в localStorage. */
  private legendOpen = (() => { try { return localStorage.getItem("charLegend:v1") === "1"; } catch { return false; } })();
  private setLegendOpen(open: boolean) {
    if (open === this.legendOpen) return; // свежесозданный раздел тоже шлёт toggle, писать в хранилище при каждом обновлении не нужно
    this.legendOpen = open;
    try { localStorage.setItem("charLegend:v1", open ? "1" : "0"); } catch {}
  }

  private renderChar(s: SelfState) {
    const b = this.body("char");
    const d = s.derived;
    const live = b.querySelector<HTMLDetailsElement>(".gear-legend");
    if (live) this.setLegendOpen(live.open); // берём из старой разметки: событие toggle приходит с задержкой, обновление могло успеть раньше
    const group = (title: string, rows: [string, string][]) =>
      `<div class="sub-grp"><h4 class="sub-h">${title}</h4><dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl></div>`;
    const attack: [string, string][] = [
      [TX("ui.arena.346"), `${d.dmgMin}–${d.dmgMax}`],
      [TX("ui.hud.574"), (1 / d.attackCd).toFixed(2)],
      [TX("ui.hud.575"), `${(d.crit * 100).toFixed(1)}%`],
      [TX("ui.hud.576"), `${Math.round(d.critMult * 100)}%`],
      [TX("ui.hud.577"), `${Math.round(d.skillMult * 100)}%`],
    ];
    if (d.lifesteal) attack.push([TX("ui.hud.578"), `${Math.round(d.lifesteal * 100)}%`]);
    const survive: [string, string][] = [
      [TX("ui.bestiary.389"), String(d.maxHp)],
      [TX("ui.bestiary.390"), String(d.armor)],
      [TX("ui.hud.579"), `${(d.dodge * 100).toFixed(1)}%`],
      [TX("ui.hud.580"), `${d.hpRegen.toFixed(1)}/с`],
      [TX("ui.hud.581"), String(d.maxMp)],
      [TX("ui.hud.582"), `${d.mpRegen.toFixed(1)}/с`],
    ];
    const score: [string, string][] = [
      [TX("ui.hud.583"), s.kills.toLocaleString("ru-RU")],
      [TX("ui.hud.584"), Object.values(s.bossKills).reduce((a, c) => a + c, 0).toLocaleString("ru-RU")],
    ];
    b.innerHTML = `<div class="char-cols">
      <div class="char-main">
        <section class="sec">
          <div class="sec-head"><h3 class="sec-h">${TX("ui.bestiary.391")}</h3><span class="chip${s.statPoints > 0 ? "" : " dim"}" title="Свободных очков характеристик">${TX("ui.hud.585", { statpoints: s.statPoints })}</span></div>
          <div class="stats"></div>
          <p class="field-hint">${TX("ui.hud.586")}</p>
        </section>
        <section class="sec">
          <h3 class="sec-h">${TX("ui.hud.587")}</h3>
          ${group("Атака", attack)}${group("Выживание", survive)}${group("Счёт", score)}
        </section>
      </div>
      <div class="char-side"></div></div>`;
    // у классов без второй руки слота нет ни здесь, ни в сумке
    const slots = SLOTS.filter((sl) => sl !== "offhand" || OFFHAND_CLASSES.includes(s.cls));
    const gear = el("section", "sec gear-block", `<div class="sec-head"><h3 class="sec-h">${TX("ui.hud.588")}</h3></div>`);
    const total = enchantTotal(slots.map((slot) => s.equip[slot]));
    if (total) gear.append(el("p", "gear-total", total));
    gear.append(gearRows(slots.map((slot) => ({ slot, item: s.equip[slot] })), s.id, {
      tip: (elm, it) => this.tipFor(elm, () => this.itemTip(it, this.ctx.net.self!, true, true)),
      hover: (slot) => { if (slot) flashGear(s.id, slot); },
      ghost: (slot) => iconFor({ base: slotGhost(s.cls, slot), stats: {}, uid: "slot", rarity: 0 }),
    }));
    b.querySelector(".char-side")!.append(gear, legendBlock(this.legendOpen, (open) => this.setLegendOpen(open)));
    // характеристики: название, значение, «+» (1 очко) и «+10» (сервер вкладывает не больше, чем есть свободных); без свободных очков кнопки выключены
    const grid = b.querySelector(".stats")!;
    const tenHint = TX("ui.hud.589");
    for (const k of ["str", "agi", "int", "vit"] as StatKey[]) {
      const main = CLASSES[s.cls].mainStat === k;
      const name = el("span", "k", `${STAT_NAMES[k]}${main ? ' <span class="c-gold">★</span>' : ""}`);
      this.tipFor(name, () => `<div class="t">${STAT_NAMES[k]}</div><div>${STAT_HINTS[k]}</div>${statTip(k, s)}<div class="d">${TX("ui.hud.590", { k: s.alloc[k] })}</div>`);
      const one = el("button", "btn icon small stat-add", "+");
      one.disabled = s.statPoints <= 0;
      one.setAttribute("aria-label", TX("ui.hud.295", { v: STAT_NAMES[k] }));
      one.onclick = () => this.ctx.net.send("alloc", { stat: k });
      const ten = el("button", "btn small stat-add10", "+10");
      ten.disabled = s.statPoints <= 0;
      ten.setAttribute("aria-label", TX("ui.hud.296", { v: STAT_NAMES[k] }));
      ten.title = tenHint; // у выключенной кнопки игровая подсказка не появится, а родная — да
      this.tipFor(ten, () => `<div>${tenHint}</div>`);
      ten.onclick = () => this.ctx.net.send("alloc", { stat: k, n: 10 });
      grid.append(name, el("span", "v", String(d.stats[k])), one, ten);
    }
  }

  private cell(it: Item | null, s: SelfState, cls = "", label = ""): HTMLButtonElement {
    const c = el("button", `cell ${cls}`);
    if (it) {
      c.classList.add(`r${it.rarity}`);
      if (BASE_ITEMS[it.base].slot !== "consumable" && canEquip(it, s.cls, s.level)) c.classList.add("cant");
      c.innerHTML = `<img src="${icon(iconFor(it))}" alt="${esc(itemName(it))}" onerror="this.onerror=null;this.style.visibility='hidden'">${plusBadge(it)}${it.qty && it.qty > 1 ? `<span class="qty">${it.qty}</span>` : ""}`;
      if (label) c.title = label;
    } else if (label) {
      // пустой слот экипировки: бледный силуэт вещи, название — в подсказке
      const base = ghostBase[label];
      c.title = label;
      c.innerHTML = base ? `<img class="ghost" src="${icon(iconFor({ base, stats: {}, uid: "slot", rarity: 0 }))}" alt="${label}">` : `<span class="lbl">${label}</span>`;
    }
    return c;
  }
  private petPop: "pet" | "mount" | null = null;
  /** Ячейки «Питомец» и «Маунт» (клик открывает список своих) и сам список; он встаёт под сеткой надетого. */
  private renderCompanions(s: SelfState): { cells: HTMLElement[]; pop: HTMLElement | null } {
    const send = (t: "pet:toggle" | "mount:toggle" | "pet:select" | "mount:select", id?: string) => this.ctx.net.send(t as never, (id ? { id } : {}) as never);
    const cells: HTMLElement[] = [];
    for (const kind of ["pet", "mount"] as const) {
      const id = kind === "pet" ? s.pet : s.mount;
      const owned = kind === "pet" ? !!id && !!s.pets?.[id] : !!id && !!s.mounts?.includes(id);
      const label = kind === "pet" ? TX("ui.hotbar.522") : TX("ui.hotbar.521");
      const c = el("button", "cell comp");
      c.setAttribute("aria-expanded", String(this.petPop === kind));
      const img = owned ? (kind === "pet" ? PETS[id!]?.sprite : mountSprite(id!)) : "";
      if (owned && img) {
        const lv = kind === "pet" ? `<span class="qty">${s.pets![id!].level}</span>` : "";
        c.innerHTML = `<img src="${icon(img)}" alt="${label}">${lv}`;
        this.tipFor(c, () => kind === "pet" ? this.petTip(id!, s) : this.mountTip(id!));
      } else {
        c.title = label;
        c.innerHTML = `<img class="ghost" src="${icon(kind === "pet" ? "pet_cliff_lynx" : "mount_horse")}" alt="${label}">`;
      }
      const key = keybinds.label(kind, 0); // клавиша — в углу ячейки, как на панели умений; переназначили — подпись сменится
      if (key) c.append(Object.assign(el("kbd"), { textContent: key }));
      c.onclick = () => { this.tip.hidden = true; this.petPop = this.petPop === kind ? null : kind; this.renderSelf(this.ctx.net.self!); };
      cells.push(c);
    }
    const kind = this.petPop;
    if (!kind) return { cells, pop: null };
    const pop = el("div", "comp-pop", `<h4 class="sub-h">${kind === "pet" ? "Питомцы" : "Маунты"}</h4>`);
    const ids = kind === "pet" ? Object.keys(s.pets ?? {}) : (s.mounts ?? []);
    const cur = kind === "pet" ? s.pet : s.mount;
    if (!ids.length) {
      pop.append(el("p", "note", kind === "pet"
        ? TX("ui.hud.591")
        : TX("ui.hud.592")));
      return { cells, pop };
    }
    const list = el("div", "list boxed");
    for (const id of ids) {
      const d = kind === "pet" ? PETS[id] : MOUNTS[id];
      if (!d) continue;
      const r = el("button", "row comp-row");
      r.setAttribute("aria-pressed", String(id === cur));
      const sub = kind === "pet" ? `ур. ${s.pets![id].level} · опыт ${Math.min(100, Math.floor((s.pets![id].xp / Math.max(1, s.pets![id].next)) * 100))}%` : `${MOUNT_TIERS[MOUNTS[id].tier]} · ×${MOUNTS[id].speed}`;
      r.innerHTML = `<span class="row-icon"><img src="${icon(kind === "pet" ? PETS[id].sprite : mountSprite(id))}" alt=""></span><span class="row-main"><span class="row-title">${esc(d.name)}</span><span class="row-sub">${sub}${id === cur ? " · выбран" : ""}</span></span>`;
      r.onclick = () => send(kind === "pet" ? "pet:select" : "mount:select", id);
      this.tipFor(r, () => kind === "pet" ? this.petTip(id, s) : this.mountTip(id));
      list.append(r);
    }
    const act = el("button", "btn small", kind === "pet" ? TX("ui.hud.593") : TX("ui.hud.594"));
    act.onclick = () => send(kind === "pet" ? "pet:toggle" : "mount:toggle");
    pop.append(list, act);
    return { cells, pop };
  }
  /** Подсказка питомца (задача 150): уровень, полоска опыта, что даст следующий уровень, умения. */
  private petTip(id: string, s: SelfState): string {
    const d = PETS[id];
    if (!d) return "";
    return `<div class="t">${esc(d.name)} · ур. ${s.pets?.[id]?.level ?? 1}</div>${this.petLevelHtml(id, s)}${d.skills.map((k) => `<div><b>${esc(k.name)}</b> — ${esc(k.desc)}</div>`).join("")}<div class="d">${TX("ui.hud.595", { label: esc(keybinds.label("pet", 0)), label2: esc(keybinds.label("petNext", 0)) })}</div>`;
  }
  /** Опыт питомца и прирост на следующем уровне; на уровне героя — «догнал хозяина». */
  private petLevelHtml(id: string, s: SelfState): string {
    const d = PETS[id], r = s.pets?.[id];
    if (!d || !r) return "";
    const pct = Math.max(0, Math.min(100, Math.floor((r.xp / Math.max(1, r.next)) * 100)));
    const g = petNextGain(d, r.level);
    const capped = r.level >= s.level;
    return `<div class="bar xp" title="Опыт питомца: ${pct}%"><i style="width:${pct}%"></i></div>`
      + `<div class="d">Опыт ${formatNumber(r.xp)} / ${formatNumber(r.next)} · ${Math.round(GP.rewards.petXpShare * 100)}% опыта хозяина, пока питомец призван</div>`
      + (capped ? `<div class="c-warn">Уровень хозяина — питомец растёт вместе с ним</div>` : `<div class="c-ok">На ${r.level + 1} уровне: +${g.dmg} урона, +${g.hp} здоровья, +${g.armor} брони</div>`);
  }
  private mountTip(id: string): string {
    const m = MOUNTS[id];
    return m ? `<div class="t" style="color:${TIER_COLOR[m.tier]}">${esc(m.name)}</div><div>${TX("ui.hud.596", { tier: MOUNT_TIERS[m.tier], speed: m.speed, flying: m.flying ? " · летающий" : "" })}</div><div class="d">${esc(m.desc)}</div><div class="d">${TX("ui.hud.597", { source: MOUNT_SOURCES[m.source], label: esc(keybinds.label("mount", 0)), label2: esc(keybinds.label("mountNext", 0)) })}</div>` : "";
  }
  /** Что делает клик по вещи в сумке: обмен › банк › торговка › обычный режим. Плашка режима и обработчик клика берут ответ отсюда. */
  private invMode(): { id: "trade" | "bank" | "shop" | "use"; note: string } {
    if (this.trade.isOpen) return { id: "trade", note: TX("ui.hud.598") };
    if (this.bank.isOpen) return { id: "bank", note: TX("ui.hud.599") };
    if (!this.wins.shop.hidden) return { id: "shop", note: TX("ui.hud.600") };
    return { id: "use", note: this.inCombat ? TX("ui.hud.601") : "" };
  }
  private renderInv(s: SelfState) {
    const b = this.body("inv");
    const mode = this.invMode();
    // надето: те же 6 колонок, что у сумки. половина вещей и питомец, остальные вещи и маунт; питомец и маунт стоят в 6-й колонке (.cell.comp)
    // в бою снаряжение не меняется (сервер: inventory.ts, IN_COMBAT): чип в шапке раздела и замок на надетых вещах
    const eqSec = el("section", "sec", `<div class="sec-head"><h3 class="sec-h">${TX("ui.hud.602")}</h3>${this.inCombat ? `<span class="chip bad" title="В бою снаряжение не меняется">В бою</span>` : ""}</div>`);
    const eq = el("div", "equip");
    const comp = this.renderCompanions(s);
    const eqSlots = SLOTS.filter((sl) => sl !== "offhand" || OFFHAND_CLASSES.includes(s.cls));
    // две строки по 6 колонок: половина вещей и питомец, остальные вещи и маунт (10 слотов — 5 + 5)
    const half = Math.ceil(eqSlots.length / 2) - 1;
    eqSlots.forEach((slot, n) => {
      const it = s.equip[slot];
      ghostBase[SLOT_NAMES[slot]] = slotGhost(s.cls, slot);
      const c = this.cell(it, s, it && this.inCombat ? "lock" : "", SLOT_NAMES[slot]);
      if (it) {
        c.onclick = () => this.ctx.net.send("unequip", { slot });
        this.tipFor(c, () => this.itemTip(it, this.ctx.net.self!, true));
      }
      eq.append(c);
      if (n === half) eq.append(comp.cells[0]);
    });
    eq.append(comp.cells[1]);
    eqSec.append(eq);
    if (comp.pop) eqSec.append(comp.pop);

    const used = s.inventory.filter(Boolean).length;
    const bag = el("section", "sec", `<div class="sec-head"><h3 class="sec-h">${TX("ui.hud.535")}</h3><span class="sec-aside" title="Занято ячеек из ${s.inventory.length}">${used} / ${s.inventory.length}</span></div>`);
    if (mode.note) bag.append(el("p", "note inv-mode", mode.note));
    const grid = el("div", "grid");
    const locked = this.trade.lockedIndices();
    s.inventory.forEach((it, i) => {
      const c = this.cell(it, s, locked.has(i) ? "locked" : "");
      c.draggable = !!it;
      c.ondragstart = (e) => e.dataTransfer!.setData("text/plain", String(i));
      // отпустили за пределами окна сумки — выбросить (dropEffect none: цели нет)
      c.ondragend = (e) => {
        const r = this.wins.inv.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (it && !inside && e.dataTransfer?.dropEffect === "none" && this.invMode().id !== "trade") this.dropUi.ask(i, it);
      };
      c.ondragover = (e) => { e.preventDefault(); c.classList.add("drag"); };
      c.ondragleave = () => c.classList.remove("drag");
      c.ondrop = (e) => {
        e.preventDefault();
        c.classList.remove("drag");
        const data = e.dataTransfer!.getData("text/plain");
        const fromBank = parseBankDrag(data);
        if (fromBank) return this.ctx.net.send("bank:take", { ...fromBank, index: i });
        const from = data === "" ? NaN : Number(data);
        if (Number.isInteger(from) && from !== i) this.ctx.net.send("swap", { a: from, b: i });
      };
      if (it) {
        c.onclick = () => {
          this.tip.hidden = true;
          const now = this.invMode().id;
          if (now === "trade") { if (!locked.has(i)) this.trade.offer(i); }
          else if (now === "bank") this.bank.deposit(i);
          else if (now === "shop") this.ctx.net.send("sell", { index: i });
          else if (BASE_ITEMS[it.base].slot === "consumable") this.ctx.net.send("use", { index: i });
          else this.ctx.net.send("equip", { index: i });
        };
        this.tipFor(c, () => this.itemTip(it, this.ctx.net.self!));
        // «Печать скакуна»: ПКМ тоже изучает (подсказка печати)
        // ПКМ: меню «Выбросить»/«Уничтожить»; у печатей — «Изучить», у «Оболочки» перековки — «Примерить» (только у себя на экране)
        c.oncontextmenu = (e) => {
          this.tip.hidden = true;
          const extra = sealMount(it.base) || sealPet(it.base) ? [{ label: "Изучить", run: () => this.ctx.net.send("use", { index: i }) }] : isShell(it) ? [{ label: "Примерить", run: () => this.tryOnShell(it) }] : [];
          this.dropUi.menu(e, i, it, extra);
        };
      }
      grid.append(c);
    });
    bag.append(grid);
    b.replaceChildren(eqSec, bag);
    // подвал не прокручивается: подсказка слева, золото справа; в особых режимах, что делает клик, сказано в плашке над сеткой
    this.wins.inv.querySelector<HTMLElement>(".win-foot")!.innerHTML =
      `<span class="win-foot-info">${mode.id === "use" ? "Клик — надеть или выпить · перетащите — переложить" : "Перетащите — переложить"}</span>${gold(s.gold)}`;
  }

  private renderSkills(s: SelfState) {
    const b = this.body("skills");
    b.innerHTML = `<section class="sec flat"><div class="sec-head"><h3 class="sec-h">${TX("ui.hud.603")}</h3><span class="chip${s.skillPoints > 0 ? "" : " dim"}" title="Свободных очков умений">${TX("ui.hud.604", { skillpoints: s.skillPoints })}</span></div>
      <p class="field-hint">${TX("ui.hud.605")}</p>
      <div class="tree"></div></section>`;
    const tree = b.querySelector<HTMLElement>(".tree")!;
    const defs = classSkills(s.cls);
    const rows = Math.max(...defs.map((d) => d.tree[0])) + 1;
    tree.style.gridTemplateRows = `repeat(${rows}, auto)`;
    // по умолчанию 3 колонки; у деревьев лучников узлы стоят и в 4-й (иначе линии req проходят через чужие узлы)
    tree.style.gridTemplateColumns = `repeat(${Math.max(3, ...defs.map((d) => d.tree[1] + 1))}, 1fr)`;
    const nodes = new Map<string, HTMLElement>();
    for (const def of defs) {
      const r = s.skills[def.id] || 0;
      const can = !canLearn(def, s.skills, s.level, s.skillPoints);
      const n = el("div", `node ${def.kind === "passive" ? "passive" : ""} ${can ? "can" : ""}`);
      n.style.gridRow = String(def.tree[0] + 1);
      n.style.gridColumn = String(def.tree[1] + 1);
      const btn = el("button", `slot ${r ? "" : "locked"}`, `<img src="${icon(def.icon)}" alt="">`);
      btn.setAttribute("aria-pressed", String(r > 0)); // изучено — общее «нажато» kit
      btn.onclick = () => this.ctx.net.send("learn", { id: def.id });
      if (def.kind === "active" && r) { btn.draggable = true; btn.ondragstart = (e) => e.dataTransfer!.setData("text/plain", `skill:${def.id}`); }
      this.tipFor(btn, () => this.skillTip(def, this.ctx.net.self!));
      n.append(btn, el("span", "nm", def.name), el("span", "rk", `<span class="chip${r ? " ok" : can ? "" : " dim"}">${r}/${def.maxRank}</span><span class="meta">ур. ${def.reqLevel}</span>`));
      tree.append(n);
      nodes.set(def.id, n);
    }
    requestAnimationFrame(() => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const tr = tree.getBoundingClientRect();
      for (const def of defs) {
        if (!def.req) continue;
        const a = nodes.get(def.req.id)?.querySelector(".slot")?.getBoundingClientRect();
        const c = nodes.get(def.id)?.querySelector(".slot")?.getBoundingClientRect();
        if (!a || !c) continue;
        const ok = (s.skills[def.req.id] || 0) >= def.req.rank;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(a.left + a.width / 2 - tr.left));
        line.setAttribute("y1", String(a.top + a.height / 2 - tr.top));
        line.setAttribute("x2", String(c.left + c.width / 2 - tr.left));
        line.setAttribute("y2", String(c.top + c.height / 2 - tr.top));
        // золотая — оба умения изучены; пунктир — следующее уже доступно; тёмная — закрыто (цвета в windows.css)
        const learned = (s.skills[def.id] || 0) > 0;
        line.setAttribute("class", learned && ok ? "on" : ok ? "next" : "off");
        svg.append(line);
      }
      tree.prepend(svg);
    });
  }

  /** Шкала воздуха под водой (air < 0 — скрыть). */
  private airBar(air: number, max: number) {
    let box = document.getElementById("air-bar");
    if (air < 0) return void box?.remove();
    if (!box) {
      box = el("div", "air-bar-box", `<div class="air-bar-label">${TX("ui.hud.606")}</div><div class="bar air"><i></i></div>`);
      box.id = "air-bar";
      document.body.append(box);
    }
    const bar = box.querySelector(".bar") as HTMLElement;
    const k = Math.max(0, Math.min(1, air / max));
    bar.style.setProperty("--p", `${k * 100}%`);
    bar.classList.toggle("low", k < 0.25);
  }

  private inCombat = false;
  private setCombat(on: boolean) {
    this.inCombat = on;
    const b = this.player.querySelector<HTMLElement>(".combat-badge");
    if (b) b.hidden = !on;
    // замки на снаряжении и плашка сумки появляются и пропадают вместе с боем
    if (!this.wins.inv.hidden && this.ctx?.net.self) this.renderInv(this.ctx.net.self);
  }

  /** Полосы каста героя (ui/castbar.ts): кольцо — призыв маунта и питомца, рамка — всё остальное (телепорт, добыча, умения). */
  private castBars: Partial<Record<CastVariant, CastBar>> = {};
  private castNow: CastBar | null = null;
  private mountCast(ms: number, name?: string) {
    if (!ms) return void this.castNow?.end();
    const nm = name ?? TX("ui.hotbar.521");
    const look = this.castLook(nm);
    const v: CastVariant = look.summon ? "c" : "a";
    const bar = (this.castBars[v] ??= new CastBar(v));
    if (this.castNow && this.castNow !== bar) { this.castNow.clear(); this.castNow.el.removeAttribute("id"); }
    // id — метка для tests/ (controls-move, ui-audit-screens)
    bar.el.id = "mount-cast";
    if (!bar.el.isConnected) document.body.append(bar.el);
    this.castNow = bar;
    bar.start(nm, ms, look);
  }

  /** Иконка и цвет каста: маунт и питомец — своей картинкой (и кольцом), умение — значком умения, прочее — знаком; цвет — класса героя. */
  private castLook(name: string): CastOpts & { summon?: boolean } {
    const color = CLASS_COLOR[this.ctx?.net.self?.cls ?? ""];
    const m = Object.values(MOUNTS).find((d) => d.name === name);
    if (m) return { icon: icon(mountSprite(m.id)), color, summon: true };
    const p = Object.values(PETS).find((d) => d.name === name);
    if (p) return { icon: icon(p.sprite), glyph: "🐾", color, summon: true };
    const sk = Object.values(SKILLS).find((d) => d.name === name) ?? Object.values(SKILLS).find((d) => d.name.startsWith(name));
    if (sk?.icon) return { icon: icon(sk.icon), glyph: castGlyph(name), color };
    return { glyph: castGlyph(name), color };
  }

  // ---------- торговка ----------
  private shopTab: "buy" | "sell" = "buy";
  private shopTabsH!: TabsHandle;
  /** Выбор на вкладке «Продать»: uid вещей. */
  private sellSel = new Set<string>();
  /** Снимок того, что нарисовано в окне: пока он не меняется, торговка не перерисовывается (держатся подсказка, наведение и прокрутка). */
  private shopSig = "";

  /** Каркас окна: заголовок, вкладки, тело и подвал строятся один раз, дальше меняется только содержимое тела и подвала. */
  private buildShopFrame() {
    const body = this.body("shop");
    body.id = "shop-body";
    body.setAttribute("role", "tabpanel");
    // shop-tabs — метка для tests/
    const bar = el("div", "tabs fill shop-tabs", [["buy", TX("ui.bank.378")], ["sell", TX("ui.hud.607")]]
      .map(([k, t]) => `<button class="btn tab" id="shop-tab-${k}" data-tab="${k}" aria-controls="shop-body"${k === this.shopTab ? ' aria-selected="true"' : ""}>${t}</button>`).join(""));
    bar.setAttribute("aria-label", TX("ui.hud.297"));
    body.before(bar);
    this.wins.shop.append(el("div", "win-foot"));
    this.shopTabsH = tabs(bar, (key) => {
      this.shopTab = key as "buy" | "sell";
      body.scrollTop = 0;
      if (this.ctx?.net.self) this.renderShop(this.ctx.net.self);
    });
  }

  private renderShop(s: SelfState) {
    const sell = this.shopTab === "sell";
    // проданное и убранное из сумки уходит из выбора
    if (sell) for (const uid of [...this.sellSel]) if (!s.inventory.some((it) => it?.uid === uid)) this.sellSel.delete(uid);
    const sig = JSON.stringify([this.shopTab, s.gold, s.level, s.cls, s.faction, s.mounts, sell && [s.inventory, this.prices, [...this.sellSel]]]);
    if (sig === this.shopSig) return;
    this.shopSig = sig;
    if (this.wins.shop.matches(":hover")) this.tip.hidden = true; // вещь под курсором пересобирается, её mouseleave не придёт
    this.shopTabsH.select(this.shopTab);
    const foot = this.wins.shop.querySelector<HTMLElement>(".win-foot")!;
    if (sell) this.shopSell(s, this.body("shop"), foot);
    else this.shopBuy(s, this.body("shop"), foot);
  }

  /** «Купить»: зелья, ездовые животные и питомцы строками — иконка, название с подписью, цены столбиком справа. */
  private shopBuy(s: SelfState, body: HTMLElement, foot: HTMLElement) {
    type Offer = { q: string; price: number; need?: number; go: () => void };
    const lv = (need: number) => `<span class="meta${s.level < need ? " c-bad" : ""}">с ${need} ур.</span>`;
    const row = (pic: string, name: string, sub: string, offers: Offer[], meta = "") => {
      const r = el("div", "row", `<span class="row-icon"><img src="${icon(pic)}" alt=""></span><div class="row-main"><span class="row-title">${esc(name)}${meta}</span><span class="row-sub">${sub}</span></div>`);
      const stack = el("div", "price-stack si-btns"); // si-btns — метка для tests/
      for (const o of offers) {
        const b = el("button", "btn small price", `<span class="price-q">${o.q}</span>${gold(o.price)}`);
        if (o.need && s.level < o.need) { b.disabled = true; b.title = TX("ui.hud.298", { v: o.need }); }
        else if (s.gold < o.price) { b.disabled = true; b.dataset.short = ""; b.title = TX("srv.bags.58"); }
        b.onclick = o.go;
        stack.append(b);
      }
      r.classList.toggle("locked", offers.every((o) => !!o.need && s.level < o.need));
      r.append(stack);
      return r;
    };
    const sec = (title: string, rows: HTMLElement[]) => {
      const list = el("div", "list boxed");
      list.append(...rows);
      const e = el("section", "sec", `<h3 class="sec-h">${title}</h3>`);
      e.append(list);
      return e;
    };
    const potions = ["hp_potion", "mp_potion"].map((base) => {
      const d = BASE_ITEMS[base], p = d.price ?? 0;
      return row(d.icon, d.name, `<span class="c-ok">${base === "hp_potion" ? "+45% здоровья" : "+50% маны"}</span>`,
        [1, 5, 20].map((q) => ({ q: `×${q}`, price: p * q, go: () => this.ctx.net.send("buy", { base, qty: q }) })));
    });
    const mounts = MOUNT_IDS.filter((id) => MOUNTS[id].source === "vendor" && MOUNTS[id].price > 0 && !s.mounts?.includes(id) && (!MOUNTS[id].faction || MOUNTS[id].faction === s.faction)).map((id) => {
      const m = MOUNTS[id];
      // печать уже куплена и лежит в сумке — вместо «Купить» сразу «Изучить» (клик по печати в сумке делает то же)
      const seal = s.inventory.findIndex((it) => !!it && sealMount(it.base) === id);
      const r = row(mountSprite(id), m.name, TX("ui.hud.596", { tier: MOUNT_TIERS[m.tier], speed: m.speed, flying: m.flying ? " · летающий" : "" }),
        seal >= 0 ? [] : [{ q: TX("ui.bank.378"), price: m.price, need: m.level, go: () => this.ctx.net.send("mount:buy", { id }) }], lv(m.level));
      if (seal >= 0) {
        const b = el("button", "btn small primary", "Изучить печать");
        b.title = "Печать уже в сумке: изучите её — маунт навсегда войдёт в коллекцию";
        b.onclick = () => this.ctx.net.send("use", { index: seal });
        r.querySelector(".price-stack")!.append(b);
      }
      return r;
    });
    body.replaceChildren(el("p", "npc-say", TX("ui.hud.608")), sec(TX("ui.hud.609"), potions),
      ...(mounts.length ? [sec(TX("ui.hud.610"), mounts)] : []));
    foot.innerHTML = `<span class="win-foot-info">${TX("ui.bags.369")}</span>${gold(s.gold)}`;
  }

  /** «Продать»: вещи сумки ячейками, под каждой — цена всей стопки. Клик выбирает вещь, продаёт кнопка в подвале; обычные вещи выбираются разом. */
  private shopSell(s: SelfState, body: HTMLElement, foot: HTMLElement) {
    const items = s.inventory.filter((it): it is Item => !!it);
    const total = (it: Item) => this.sellInfo(it).price * (it.qty ?? 1);
    const redraw = () => this.renderShop(this.ctx.net.self!);
    const picked = items.filter((it) => this.sellSel.has(it.uid));
    if (!items.length) body.replaceChildren(el("p", "note", TX("ui.hud.612")));
    else {
      const sec = el("section", "sec", `<div class="sec-head"><h3 class="sec-h">${TX("ui.hud.535")}</h3></div>`);
      // обычные вещи без заточки (расходуемое не в счёт): выбираются и снимаются разом
      const junk = items.filter((it) => it.rarity === 0 && !it.plus && BASE_ITEMS[it.base].slot !== "consumable" && !isQuestItem(it.base));
      if (junk.length) {
        const all = junk.every((it) => this.sellSel.has(it.uid));
        const quick = el("button", "btn small sell-quick", TX("ui.hud.613", { junk: junk.length }));
        quick.title = TX("ui.hud.299");
        quick.setAttribute("aria-pressed", String(all));
        quick.onclick = () => {
          this.tip.hidden = true;
          for (const it of junk) if (all) this.sellSel.delete(it.uid); else this.sellSel.add(it.uid);
          redraw();
        };
        sec.querySelector(".sec-head")!.append(quick);
      }
      const grid = el("div", "cells auto sell-grid");
      for (const it of items) {
        const { low } = this.sellInfo(it);
        const quest = isQuestItem(it.base);
        const pic = this.cell(it, s); // та же ячейка, что в сумке: рамка редкости, +N, количество
        const cap = quest ? `<span class="tile-cap c-dim">—</span>` : `<span class="tile-cap${low ? " low" : ""}">${low ? "▼ " : ""}${gold(total(it))}</span>`;
        const tile = el("button", "tile", `<span class="${pic.className}">${pic.innerHTML}</span>${cap}`);
        tile.setAttribute("aria-pressed", String(this.sellSel.has(it.uid)));
        if (quest) { tile.disabled = true; tile.title = QUEST_ITEM_MSG; }
        else tile.onclick = () => {
          this.tip.hidden = true;
          if (!this.sellSel.delete(it.uid)) this.sellSel.add(it.uid);
          redraw();
        };
        this.tipFor(tile, () => `${this.itemTip(it, this.ctx.net.self!, false, true)}${MATERIALS[it.base] ? "" : `<div class="d">${(it.qty ?? 1) > 1 ? "Цена за штуку" : "Цена"}: ${this.priceHtml(it)}</div>`}${quest ? `<div class="warn">${QUEST_ITEM_MSG}</div>` : ""}`);
        grid.append(tile);
      }
      sec.append(grid);
      body.replaceChildren(el("p", "note", TX("ui.hud.614")), sec);
    }
    // подвал: что выбрано и итог на кнопке
    const one = picked.length === 1 ? picked[0] : null;
    const info = el("span", "win-foot-info", !picked.length ? TX("ui.hud.615")
      : one ? `<span class="c-r${one.rarity}">${esc(itemName(one))}</span>${(one.qty ?? 1) > 1 ? ` ×${one.qty}` : ""}` : TX("ui.hud.616", { picked: picked.length }));
    const sum = picked.reduce((a, it) => a + total(it), 0);
    const go = el("button", "btn primary sell-go", picked.length ? TX("ui.hud.617", { gold: gold(sum, picked.length > 1 ? "~" : "") }) : TX("ui.hud.618"));
    go.disabled = !picked.length;
    go.onclick = () => {
      this.tip.hidden = true;
      const inv = this.ctx.net.self?.inventory ?? [];
      const at = [...this.sellSel].map((uid) => inv.findIndex((x) => x?.uid === uid)).filter((i) => i >= 0);
      this.sellSel.clear();
      for (const i of at) this.ctx.net.send("sell", { index: i });
      redraw();
    };
    const act = el("div", "actions");
    act.append(go);
    foot.replaceChildren(info, act);
  }

  // ---------- мини-карта ----------
  private buildMiniBase() {
    const m = this.ctx.map;
    const c = document.createElement("canvas");
    c.width = m.w;
    c.height = m.h;
    const g = c.getContext("2d")!;
    const img = g.createImageData(m.w, m.h);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const dg = !!m.dgStyle; // подземелье: свои цвета — тёмный камень пола, стены темнее, лава оранжевая, вода холодная
      let col = TERRAIN_COLORS[m.vtx[y * (m.w + 1) + x]] ?? (dg ? "#2e2838" : "#4f873c");
      const blocked = m.cell[y * m.w + x] & 1 && m.vtx[y * (m.w + 1) + x] !== T.Water && m.vtx[y * (m.w + 1) + x] !== T.Lava;
      if (m.cell[y * m.w + x] & 2) col = dg ? "#0c0910" : "#1c1822";
      else if (dg && blocked) col = "#6a5a78"; // колонны, саркофаги, статуи
      else if (blocked && isTownZone(m.zone[y * m.w + x])) {
        const c = CITIES.find((k) => k.style && Math.abs(x - k.x) <= k.half.x && Math.abs(y - k.y) <= k.half.y);
        if (c) {
          const ax = Math.abs(x - c.x), ay = Math.abs(y - c.y);
          const pal: Record<string, [string, string]> = { desert: ["#d8b878", "#c8884a"], snow: ["#9a6a3a", "#6a4a32"], solgard: ["#f0ead8", "#d8a830"], umbrath: ["#3a2c48", "#7a3ab0"] };
          const [wallC, roofC] = pal[c.style!] ?? pal.snow;
          const W = layoutOf(c).wall;
          col = ax >= W.x || ay >= W.y ? wallC : roofC;
        } else {
        // город: стены и башни — светлый камень, дома — черепица
        const dx = Math.abs(x - TOWN.x), dy = Math.abs(y - TOWN.y);
        col = dx >= WALL.x || dy >= WALL.y ? "#c8c0b0" : "#a04a30";
        }
      } else if (blocked) col = "#22402a";
      const i = (y * m.w + x) * 4;
      img.data[i] = parseInt(col.slice(1, 3), 16);
      img.data[i + 1] = parseInt(col.slice(3, 5), 16);
      img.data[i + 2] = parseInt(col.slice(5, 7), 16);
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.miniBase = c;
  }
  /** Низкое здоровье: красное свечение полоски HP пульсирует (чем меньше HP, тем чаще), тихое «тук-тук»; выше порога плавно гаснет. */
  private lowHpPulse(hpK: number, alive: boolean) {
    const now = performance.now(), dt = Math.min(0.25, this.lowT ? (now - this.lowT) / 1000 : 0);
    this.lowT = now;
    const sev = alive && hpK > 0 && hpK < LOW.hpBelow ? 1 - hpK / LOW.hpBelow : 0;
    this.lowK += ((sev > 0 ? 1 : 0) - this.lowK) * Math.min(1, dt * LOW.fade);
    const bar = this.player.querySelector<HTMLElement>(".bar.hp");
    if (!bar) return;
    let sh = "";
    if (this.lowK > 0.01) {
      const cycle = LOW.cycleSlow + (LOW.cycleFast - LOW.cycleSlow) * Math.min(1, sev);
      const prev = this.lowPh;
      this.lowPh = (this.lowPh + dt / cycle) % 1;
      const wave = reducedMotion() ? 0.6 : 0.5 + 0.5 * Math.sin(this.lowPh * Math.PI * 2 - Math.PI / 2);
      const a = (0.25 + 0.75 * wave) * this.lowK * LOW.glow;
      sh = `0 0 ${(6 + 12 * wave).toFixed(1)}px ${(2 + 2 * wave).toFixed(1)}px rgba(230, 40, 40, ${a.toFixed(2)})`;
      if (sev > 0 && this.lowPh < prev && now - this.lastBeat >= LOW.beatMinMs && !reducedMotion()) { this.lastBeat = now; sfx.play("heart", LOW.beatGain * (0.6 + 0.4 * sev)); }
    }
    if (sh !== this.lowShadow) { this.lowShadow = sh; bar.style.boxShadow = sh; }
  }
  /** Значок времени суток 16×16 (солнце / полусолнце над горизонтом / серп луны, тёмный контур) и строка «День · 9 мин» под картой. */
  private drawTod() {
    const ms = worldMs(), n = nightLevel(ms);
    const p = (((ms % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS) / DAY_CYCLE_MS;
    const phase = n >= 0.99 ? "night" : n <= 0.01 ? "day" : p > 0.8 ? "dawn" : "dusk";
    if (phase !== this.todKey) {
      this.todKey = phase;
      const g = this.todCv.getContext("2d")!;
      g.clearRect(0, 0, 16, 16);
      const OUT = "#2a1606";
      const px = (x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
      // маска -> заливка с тёмным контуром
      const paint = (inside: (x: number, y: number) => boolean, fill: string) => {
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          if (inside(x, y)) px(x, y, fill);
          else if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) px(x, y, OUT);
        }
      };
      const disc = (cx: number, cy: number, r: number) => (x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      const rays = (cx: number, cy: number, r0: number, r1: number) => (x: number, y: number) => {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        if (d < r0 || d > r1) return false;
        return Math.abs(dx) <= 0.6 || Math.abs(dy) <= 0.6 || Math.abs(Math.abs(dx) - Math.abs(dy)) <= 0.6;
      };
      if (phase === "day") {
        paint(rays(7.5, 7.5, 5.2, 7.6), "#ffcf3a");
        paint(disc(7.5, 7.5, 3.9), "#ffe45a");
      } else if (phase === "night") {
        const moon = (x: number, y: number) => disc(7.5, 8, 6)(x, y) && !disc(10.5, 5.8, 5)(x, y);
        paint(moon, "#eef2ff");
        px(12, 11, "#eef2ff"); px(13, 2, "#eef2ff"); px(14, 5, "#eef2ff");
      } else {
        const dusk = phase === "dusk", HY = 11;
        const above = (f: (x: number, y: number) => boolean) => (x: number, y: number) => y < HY && f(x, y);
        paint(above(rays(7.5, HY - 0.5, 5.6, 8)), dusk ? "#ff9a30" : "#ffb0a0");
        paint(above(disc(7.5, HY - 0.5, 4.4)), dusk ? "#ff7a1e" : "#ffd27a");
        for (let x = 0; x < 16; x++) { px(x, HY, dusk ? "#ffd27a" : "#ffc0b0"); px(x, HY + 1, OUT); }
        g.fillStyle = dusk ? "#7a3a1a" : "#8a5a6a"; g.fillRect(0, HY + 2, 16, 3);
        g.fillStyle = OUT; g.fillRect(0, HY + 5, 16, 1);
      }
    }
    const target = phase === "day" || phase === "dusk" ? 0.78 : phase === "night" ? 0.88 : 1; // до глубокой ночи / конца ночи / конца рассвета
    const left = ((((target - p) % 1) + 1) % 1) * DAY_CYCLE_MS;
    const mins = Math.max(1, Math.round(left / 60000));
    const vars = { m: mins };
    const tip = TX(`ui.hud.tod_${phase}`, vars), txt = TX(`ui.hud.tods_${phase}`, vars);
    if (tip !== this.todTipKey) { this.todTipKey = tip; this.todBox.setAttribute("aria-label", tip); this.todTxt.textContent = txt; }
  }
  /** Ночью миникарта тускнеет и города, форты и поселения светятся тёплыми огнями (вызывается из drawMini раз в 200 мс). */
  private miniNightLights(g: CanvasRenderingContext2D, X: (px: number) => number, Y: (py: number) => number, k: number, CW: number, CH: number, n: number) {
    g.fillStyle = `rgba(6, 8, 20, ${(0.14 * n).toFixed(3)})`;
    g.fillRect(0, 0, CW, CH);
    if (n < 0.08) return;
    const t = performance.now() / 1000;
    const pts: { x: number; y: number; r: number }[] = [{ x: TOWN.x, y: TOWN.y, r: 7 }];
    for (const c of CITIES) pts.push({ x: c.x, y: c.y, r: 6 });
    for (const f of [FORTS.west, FORTS.east]) pts.push({ x: f.x, y: f.y, r: 5 });
    for (const s of SETTLEMENTS) pts.push({ x: s.x, y: s.y, r: 4 });
    pts.forEach((o, i) => {
      const px = X(o.x * TILE), py = Y(o.y * TILE);
      if (px < -12 || py < -12 || px > CW + 12 || py > CH + 12) return;
      const fl = 0.85 + 0.15 * Math.sin(t * (3.1 + (i % 4) * 0.7) + i * 1.9) + 0.05 * Math.sin(t * 8.3 + i);
      const r = o.r * (k / 1.5) * 2.6;
      const gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, `rgba(255, 214, 120, ${(0.9 * n * fl).toFixed(2)})`);
      gr.addColorStop(0.35, `rgba(255, 160, 50, ${(0.45 * n * fl).toFixed(2)})`);
      gr.addColorStop(1, "rgba(255, 130, 30, 0)");
      g.fillStyle = gr;
      g.fillRect(px - r, py - r, r * 2, r * 2);
      g.fillStyle = `rgba(255, 238, 170, ${(n * fl).toFixed(2)})`;
      g.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
    });
  }
  private drawMini(info: FrameInfo) {
    const g = this.miniCanvas.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    const m = this.ctx.map;
    // большой мир: окно 160×120 тайлов вокруг героя (1,5 px на тайл); маленькая карта арены — целиком на весь холст
    const CW = this.miniCanvas.width, CH = this.miniCanvas.height;
    const big = m.w > 200;
    const vw = big ? 160 : m.w, vh = big ? 120 : m.h;
    const k = Math.min(CW / vw, CH / vh);
    const vx = big ? Math.max(0, Math.min(m.w - vw, info.pos.x / TILE - vw / 2)) : 0;
    const vy = big ? Math.max(0, Math.min(m.h - vh, info.pos.y / TILE - vh / 2)) : 0;
    const ox = (CW - vw * k) / 2 - vx * k, oy = (CH - vh * k) / 2 - vy * k;
    const X = (px: number) => ox + (px / TILE) * k, Y = (py: number) => oy + (py / TILE) * k;
    g.fillStyle = P.well;
    g.fillRect(0, 0, CW, CH);
    if (this.miniBase) g.drawImage(this.miniBase, ox, oy, m.w * k, m.h * k);
    if (big && this.ctx.net.kind === "world") { const nl = nightLevel(worldMs()); if (nl > 0.01) this.miniNightLights(g, X, Y, k, CW, CH, nl); }
    this.drawTod();
    const dot = Math.max(1.5, k * 0.9);
    for (const b of m.bosses) {
      g.fillStyle = "#ff7a2a";
      g.fillRect(X(b.x) - 2, Y(b.y) - 2, 4, 4);
    }
    // вход в «Пепельные чертоги» на карте мира и лестница выхода внутри (подземелье — отдельная карта на весь холст)
    { const d = big ? DUNGEON_DOOR : this.ctx.net.kind === "dungeon" ? DUNGEON_EXIT : null; if (d) drawDgIcon(g, this.ctx.net.dungeon?.looted && big ? "taken" : "mini", X(d.x), Y(d.y), big ? 1 : 1); }
    if (big && this.ctx.net.kind === "world") { drawWarMini(g, X, Y); drawSiegeMini(g, X, Y); drawWbMini(g, X, Y, info.pos); } // основания «Знамён Предела» и ворота осады
    for (const [, v] of info.units) {
      if (v.dead) continue;
      const near = Math.hypot(v.x - info.pos.x, v.y - info.pos.y) < 900;
      if ((v.u.kind === UnitKind.Mob && !near) || v.u.kind === UnitKind.Citizen) continue;
      const enemy = v.u.kind === UnitKind.Player && (this.ctx.net.kind === "arena" ? v.u.team !== this.ctx.net.arena?.team : !!v.u.faction && v.u.faction !== this.ctx.net.self?.faction);
      g.fillStyle = v.u.kind === UnitKind.Guard ? "#7a9cc8" : v.u.kind === UnitKind.Player ? (enemy ? P.bad : "#6ac8ff") : v.u.kind === UnitKind.Boss ? "#ff3a1a" : "#e84a4a";
      const s = v.u.kind === UnitKind.Boss ? 3 : dot;
      g.fillRect(Math.floor(X(v.x)), Math.floor(Y(v.y)), s, s);
    }
    // игроки за пределами видимости мира — лёгкие точки от сервера (net.dots, задача 76)
    if (this.ctx.net.kind === "world") {
      const d = this.ctx.net.dots, mine = this.ctx.net.self?.faction;
      for (let i = 0; i + 2 < d.length; i += 3) {
        const f = d[i + 2] === 1 ? "solgard" : d[i + 2] === 2 ? "umbrath" : "";
        g.fillStyle = f && f !== mine ? P.bad : "#6ac8ff";
        g.fillRect(Math.floor(X(d[i])), Math.floor(Y(d[i + 1])), dot, dot);
      }
    }
    g.fillStyle = "#ffffff";
    g.fillRect(X(info.pos.x) - 1.5, Y(info.pos.y) - 1.5, 3, 3);
    if (this.ctx.net.kind === "world") {
      g.strokeStyle = "rgba(255,255,255,0.5)";
      g.strokeRect(X(info.pos.x) - 20, Y(info.pos.y) - 12, 40, 24);
    }
    const zi = zoneAtPx(m, info.pos.x, info.pos.y);
    const z = ZONES[zi];
    const sub = this.ctx.net.kind === "arena" ? "PvP" : z.safe ? TX("ui.hud.619") : z.note ? TX("ui.hud.620") : `ур. ${z.levels[0]}–${z.levels[1]}`;
    // вторая строка, как на карте мира: кольцо 40–80 — «Небезопасная зона», Поля вечных битв 80–100 — прямо «Опасная зона» (задача 132, решение 1) цветом токена;
    // безопасные земли 1–40 — «Земли Сольгарда / Умбрата» цветом фракции (в столице не пишется — её название и так говорит)
    const danger = this.ctx.net.kind === "arena" ? null : zoneDanger(zi);
    const land = this.ctx.net.kind === "arena" || z.safe ? null : zoneLand(zi);
    const dline = danger ? `<br><small style="color:var(--${z.danger === "deadly" ? "bad" : "warn"})">${danger}</small>`
      : land ? `<br><small style="color:${factionColor(land)}">${landLabel(land)}</small>` : "";
    const zl = document.getElementById("mini-zone")!, zh = `${esc(z.name)} <small>${sub}</small>${dline}`;
    if (zl.dataset.html !== zh) { zl.dataset.html = zh; zl.innerHTML = zh; } // раз в 200 мс: без сравнения — перевёрстка подписи каждый раз
  }

  // ---------- каждый кадр ----------
  private lastPos = { x: 0, y: 0 };
  private tgtFoe: boolean | null = null;
  /** Порядок значков цели: на враге сначала дебафы, на союзнике — бафы; внутри вида мои эффекты первыми, дальше — порядок data/auras.json. */
  private static targetOrder(foe: boolean) {
    const rank = (k: string) => ((AURAS[k]?.kind === "debuff") === foe ? 0 : 1);
    return (a: AuraRow, b: AuraRow) => rank(a.k) - rank(b.k) || Number(!!b.m) - Number(!!a.m) || auraCompare(a.k, b.k);
  }
  /** Враг ли юнит (только для порядка значков цели): моб не моей фракции, герой другой команды (арена) или фракции, нарушитель. */
  private isFoeUnit(t: UnitState, me: UnitState | null): boolean {
    if (!me) return t.kind !== UnitKind.Player;
    if (t.kind !== UnitKind.Player) return !(t.faction && t.faction === me.faction);
    if (t.team && me.team) return t.team !== me.team;
    return t.faction !== me.faction || !!t.outlaw;
  }
  /** След потерянного здоровья в рамке героя: держится 0,4 с ярко-жёлтым и плавно тает до текущего здоровья (как в WoW/LoL);
   *  при лечении и регенерации сразу равен здоровью — поэтому постоянная регенерация не «замораживает» след. */
  private lagK = -1;
  private lagHold = 0;
  private hpDisp = -1;
  private hpAt = 0;
  /** Возвращает ширину красной заливки: при росте здоровья зелёный кусок (hp-lag.gain) сразу стоит на новом значении, заливка догоняет его ~0,35 с. */
  private hpLag(k: number): number {
    const lag = document.getElementById("hp-lag");
    const now = performance.now(), dt = Math.min(0.1, (now - (this.hpAt || now)) / 1000);
    this.hpAt = now;
    if (this.hpDisp < 0 || k < this.hpDisp) this.hpDisp = k;
    else this.hpDisp += (k - this.hpDisp) * Math.min(1, dt * 8);
    if (k - this.hpDisp < 0.002) this.hpDisp = k;
    if (!lag) return k;
    const gain = k > this.hpDisp;
    lag.classList.toggle("gain", gain);
    if (this.lagK < 0 || k >= this.lagK) this.lagK = k;
    else if (k < this.lagK - 0.001 && now > this.lagHold && this.lagHold === 0) this.lagHold = now + 400;
    if (this.lagHold && now > this.lagHold) {
      this.lagK = Math.max(k, this.lagK - 0.012);
      if (this.lagK <= k) this.lagHold = 0;
    }
    const w = `${(gain ? k : this.lagK) * 100}%`;
    if (lag.style.width !== w) lag.style.width = w;
    return this.hpDisp;
  }
  private trailK = new Map<string, number>();
  /** Полоска, которую перерисовывают целиком: убыло — жёлтый хвост тает после 0,4 с; прибавилось — зелёный кусок сразу на новом значении, красная заливка догоняет за ~0,35 с. */
  private trailBar(bar: HTMLElement | null, key: string, k: number) {
    const prev = this.trailK.get(key);
    this.trailK.clear(); this.trailK.set(key, k);
    const fill = bar?.querySelector<HTMLElement>(":scope > i"), lag = bar?.querySelector<HTMLElement>(":scope > .hp-lag");
    if (!fill || !lag || prev === undefined || Math.abs(prev - k) < 0.001) { if (lag) lag.style.width = "0"; return; }
    const pc = (v: number) => `${v * 100}%`;
    if (k > prev) {
      lag.classList.add("gain"); lag.style.width = pc(k); fill.style.width = pc(prev); fill.style.transitionDuration = ".35s";
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = pc(k); }));
    } else {
      lag.style.width = pc(prev);
      setTimeout(() => { lag.style.width = pc(k); }, 400);
    }
  }
  frame(info: FrameInfo) {
    const me = info.me;
    this.lastPos = info.pos;
    if (me) {
      const hp = document.getElementById("hp-fill"), mp = document.getElementById("mp-fill");
      // числа с разделителем разрядов, как у золота; текст пишется только при изменении
      const put = (id: string, t: string) => { const e = document.getElementById(id); if (e && e.textContent !== t) e.textContent = t; };
      this.lowHpPulse(me.hp / Math.max(1, me.maxHp), me.anim !== Anim.Dead);
      if (hp) { hp.style.width = `${this.hpLag(me.hp / Math.max(1, me.maxHp)) * 100}%`; put("hp-text", `${formatNumber(Math.max(0, me.hp))} / ${formatNumber(me.maxHp)}`); }
      // щит-поглощение поверх HP (как в WoW): от конца здоровья вправо; не помещается — заходит на здоровье с правого края
      const abs = document.getElementById("hp-abs");
      if (abs) {
        const now = performance.now(), sh = this.heroAuras.rows.find((a) => a.k === "shield" && (!a.end || a.end > now))?.v ?? 0;
        const w = Math.min(100, (sh / Math.max(1, me.maxHp)) * 100);
        setHidden(abs, w <= 0);
        if (w > 0) { abs.style.left = `${Math.min((Math.max(0, me.hp) / Math.max(1, me.maxHp)) * 100, 100 - w)}%`; abs.style.width = `${w}%`; }
      }
      if (mp) { mp.style.width = `${(me.mp / Math.max(1, me.maxMp)) * 100}%`; put("mp-text", `${formatNumber(me.mp)} / ${formatNumber(me.maxMp)}`); }
      // смерть
      if (me.anim === Anim.Dead) {
        if (!this.deadSince) {
          this.deadSince = performance.now();
          this.death.hidden = false;
          if (this.ctx.net.kind === "raid") this.death.innerHTML = `<div class="panel"><h2>${TX("ui.hud.621")}</h2><p class="muted">${TX("ui.hud.622")}</p></div>`;
          // на арене возрождения нет (комната арены не принимает respawn): павший ждёт конца боя
          else if (this.ctx.net.kind === "arena") this.death.innerHTML = `<div class="panel"><h2>${TX("ui.hud.621")}</h2><p class="muted">${TX("ui.hud.623")}</p></div>`;
          else {
            this.death.innerHTML = `<div class="panel"><h2>${TX("ui.hud.621")}</h2><p class="muted">${TX("ui.hud.624")}</p><button class="btn primary" id="respawn">${TX("ui.hud.625")}</button></div>`;
            document.getElementById("respawn")!.onclick = () => this.ctx.net.send("respawn", {});
          }
        }
        const left = Math.ceil((RESPAWN_DELAY_MS - (performance.now() - this.deadSince)) / 1000);
        const btn = document.getElementById("respawn") as HTMLButtonElement | null;
        if (btn) { btn.disabled = left > 0; btn.textContent = left > 0 ? TX("ui.hud.626", { left: left }) : TX("ui.hud.625"); }
      } else if (this.deadSince) {
        this.deadSince = 0;
        this.death.hidden = true;
      }
    }
    // цель
    const t = info.target;
    this.targetSid = t && t.anim !== Anim.Dead && t.kind === UnitKind.Player && this.ctx.net.kind === "world" ? info.targetId ?? null : null;
    this.targetBox.classList.toggle("inspectable", !!this.targetSid);
    this.targetBox.title = this.targetSid ? TX("ui.hud.627") : "";
    const inRaid = this.ctx.net.kind === "raid";
    this.targetBox.classList.toggle("in-raid", inRaid);
    if (t && t.anim !== Anim.Dead && !(inRaid && t.kind === UnitKind.Boss)) { // в рейде у босса своя полоса сверху
      setHidden(this.targetBox, false);
      const boss = t.kind === UnitKind.Boss;
      this.targetBox.classList.toggle("boss", boss);
      const def = Object.values(MOBS).find((m) => m.name === t.name);
      const phase = boss ? `<div class="phase">${TX("ui.hud.628", { phase: t.phase + 1, level: t.level, uniques: def?.uniques ? " · уникальная добыча" : "" })}</div>` : "";
      const shield = t.kind === UnitKind.Player ? Math.max(0, t.shield || 0) : 0; // щит-поглотитель шлётся только у героев
      const sig = `${t.name}|${t.level}|${t.hp}|${t.maxHp}|${t.phase}|${shield}`;
      if (this.targetBox.dataset.sig !== sig) {
        this.targetBox.dataset.sig = sig;
        this.targetBox.innerHTML = `<div class="nm">${esc(t.name)} ${t.kind === UnitKind.Player ? "" : `<span class="muted">ур. ${t.level}</span>`}</div><div class="bar hp"><s class="hp-lag"></s><i style="width:${(t.hp / Math.max(1, t.maxHp)) * 100}%"></i>${absorbHtml(t.hp, t.maxHp, shield)}<span>${Math.round((t.hp / Math.max(1, t.maxHp)) * 100)}%</span></div>${phase}`;
        this.trailBar(this.targetBox.querySelector<HTMLElement>(".bar.hp"), `${t.name}|${info.targetId ?? ""}`, t.hp / Math.max(1, t.maxHp));
        this.targetBox.append(this.tgtAuras.el); // один и тот же элемент: значки и подсказки переживают перерисовку
      }
      // эффекты цели: список от сервера только для этой цели; на враге сначала дебафы, на союзнике — бафы, внутри вида мои — первыми
      const ownList = !!info.targetId && info.targetId === this.tgtAurasId;
      const foe = this.isFoeUnit(t, me);
      if (ownList && foe !== this.tgtFoe) { this.tgtFoe = foe; this.tgtAuras.order = Hud.targetOrder(foe); this.renderAuras(this.tgtAuras); }
      setHidden(this.tgtAuras.el, !(ownList && this.tgtAuras.rows.length > 0));
    } else setHidden(this.targetBox, true);

    // рамки питомцев под рамкой героя: стопкой, до 3 (постоянный, скелет, демон); клик — выбрать целью
    const sid = this.ctx.net.self?.id;
    const pets: UnitState[] = [];
    if (sid) for (const [, v] of info.units) if (v.u.kind === UnitKind.Pet && v.u.ownerId === sid) pets.push(v.u);
    pets.sort((x, y) => (x.name < y.name ? -1 : 1));
    if (pets.length) {
      setHidden(this.petBox, false);
      const shown = pets.slice(0, 3);
      const sig = shown.map((pu) => `${pu.name}|${pu.level}|${pu.hp}|${pu.maxHp}|${pu.sprite}`).join(";") + `|${info.targetId ?? ""}|${JSON.stringify(this.ctx.net.self?.pets?.[this.ctx.net.self?.pet ?? ""] ?? "")}`;
      if (this.petBox.dataset.sig !== sig) {
        this.petBox.dataset.sig = sig;
        this.petBox.innerHTML = shown.map((pu) => {
          const id = [...info.units].find(([, v]) => v.u === pu)?.[0] ?? "";
          const k = Math.max(0, Math.min(1, pu.hp / Math.max(1, pu.maxHp)));
          const mine = sid && id === petUnitId(sid) ? this.ctx.net.self?.pets?.[this.ctx.net.self?.pet ?? ""] : undefined;
          const xp = mine ? `<div class="bar xp pc-xp" title="Опыт питомца"><i style="width:${Math.min(100, Math.floor((mine.xp / Math.max(1, mine.next)) * 100))}%"></i></div>` : "";
          return `<div class="panel hud-pet-card${xp ? " has-xp" : ""}${id === info.targetId ? " sel" : ""}" data-id="${esc(id)}"><span class="pc-ico"><img src="${icon(PET_ICON[pu.sprite] ?? pu.sprite)}" alt="" onerror="this.onerror=null;this.src='${icon("pet_cliff_lynx")}'"></span><span class="pc-head"><span class="pc-nm">${esc(pu.name)}</span><span class="pc-lv">ур. ${pu.level}</span></span><div class="bar hp"><i style="width:${k * 100}%"></i><span>${pu.hp} / ${pu.maxHp}</span></div>${xp}</div>`;
        }).join("");
      }
    } else setHidden(this.petBox, true);

    // панель умений: перезарядки, мана, дальность, видимость, цель
    if (me) {
      const tu = info.targetId ? info.units.get(info.targetId) : undefined;
      this.hotbar.frame({ mp: me.mp, pos: info.pos, target: info.target && info.target.anim !== Anim.Dead && tu ? { x: tu.x, y: tu.y } : null });
    }
    this.arena.frame(info.units);
    this.raid.frame(info.units);
    this.wboss.frame(info.pos);
    this.war.frame(info.pos, me?.mount ?? "");
    this.siege.frame();
    const now = performance.now();
    if (now - this.lastMini > 200) {
      this.lastMini = now;
      this.drawMini(info);
    }
  }
}

export { MAX_LEVEL, SKILLS };

const pct = (v: number) => `${+(v * 100).toFixed(2)}%`;
/** Что даёт одно очко характеристики этому классу (в подсказке окна персонажа). */
function statTip(k: StatKey, s: SelfState): string {
  const c = CLASSES[s.cls], d = s.derived, main = c.mainStat === k;
  const L: string[] = [];
  if (k === "str") {
    L.push(main ? TX("ui.hud.629", { maink: pct(c.mainK) }) : TX("ui.hud.630", { strdmg: pct(STAT_K.strDmg) }));
    L.push(TX("ui.hud.631", { strhp: STAT_K.strHp }));
  } else if (k === "agi") {
    if (main) L.push(TX("ui.hud.632", { maink: pct(c.mainK) }));
    else if (c.projectile) L.push(TX("ui.hud.633", { agiranged: pct(STAT_K.agiRanged) }));
    L.push(TX("ui.hud.634", { agicrit: pct(STAT_K.agiCrit) }), TX("ui.hud.635", { agidodge: pct(STAT_K.agiDodge), dodge_cap: pct(DODGE_CAP) }), TX("ui.hud.636"));
  } else if (k === "int") {
    if (main) L.push(TX("ui.hud.632", { maink: pct(c.mainK) }));
    L.push(TX("ui.hud.637", { intskill: pct(STAT_K.intSkill) }), TX("ui.hud.638"), TX("ui.hud.639"));
  } else {
    L.push(TX("ui.hud.640", { vithp: STAT_K.vitHp }), TX("ui.hud.641", { vitarmor: STAT_K.vitArmor }), TX("ui.hud.642"));
  }
  const now = k === "str" ? TX("ui.hud.643", { maxhp: d.maxHp, dmgmin: d.dmgMin, dmgmax: d.dmgMax })
    : k === "agi" ? TX("ui.hud.644", { v: (d.crit * 100).toFixed(1), v2: (d.dodge * 100).toFixed(1) })
    : k === "int" ? TX("ui.hud.645", { maxmp: d.maxMp, math: Math.round(d.skillMult * 100) })
    : TX("ui.hud.646", { maxhp: d.maxHp, armor: d.armor });
  return `<div class="d">${TX("ui.hud.647", { l: L.join(", ") })}</div><div class="d">${TX("ui.hud.648", { now: now })}</div>`;
}
