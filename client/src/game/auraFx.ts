/**
 * Обозначения бафов и дебафов на юнитах (задача 129, шаг 2): рисует то, что сервер положил в Unit.fx (shared/auraFx.ts).
 * Каталог — client/public/assets/aura-fx/manifest.json (пишет tools/gen/aura-fx.ts вместе с листами; правила — data/aura-fx.json, _rules):
 * у каждого обозначения слой или несколько — лист кадров подряд, привязка (ноги, тело, рука, над подписью), глубина, покачивание и орбита.
 * Лист двойной плотности (scale 0,5) на зуме 2 и 4 даёт пиксель листа = пиксель холста, на зуме 3 и 6 берётся лист ×3 (pickSheet).
 *
 * Что видно на юните: не больше одного круга под ногами (slot ring) — остальные круги становятся «бусинами» на его кромке, одного купола
 * (dome) и двух значков или частиц (overlay) по приоритету; два значка над подписью идут в ряд без наложения, точки стаков — под значком.
 * В толпе (больше 6 героев в кадре; выход из режима — когда героев не больше 5 и режим продержался не меньше afx.crowdHold) у чужих героев остаётся
 * самое важное (и эмблема знамени — у каждого, кого оно прикрывает), у врагов — оглушение, корни, «вне закона». Скрытый (unseen) юнит — без обозначений сразу, у мёртвого они гаснут вместе с телом.
 * Руны рыцаря смерти (legacy) рисует прежний цикл (Vfx.orbit по событию buff).
 * Появление и снятие — плавно (ease из каталога: альфа, масштаб при появлении, радиус орбиты), орбиты и покачивание считаются каждый кадр
 * с шагом в пиксель холста. Всё, что меняется на живом юните, тоже плавно: уходящее обозначение (снятое или вытесненное правилами) доигрывает
 * затухание в прежнем виде — кругом, бусиной или значком на прежнем месте; при смене роли (круг ↔ бусина ↔ купол) прежний вид гаснет «призраком»,
 * пока новый проявляется; сдвиги ряда значков, подъём на стаках, прозрачность круга толпы и число предметов орбиты по стакам идут твином ~150 мс.
 * Спрайты берутся из пула сцены; в кадре нет ни объектов, ни массивов, ни замыканий (объекты — только при смене роли), сеттеры Phaser вызываются
 * только для изменившегося (у стоящего героя меняется почти один кадр листа).
 */
import Phaser from "phaser";
import { fxIdx, fxN } from "../../../shared/auraFx";
import { Anim, Dir, UnitKind } from "../../../shared/protocol";
import { net } from "../net";
import { DEPTH } from "./terrain";
import type { UnitView } from "./UnitView";

// ---------- каталог ----------
const FEET = 0, BODY = 1, HAND = 2, HEAD = 3;
const GROUND = 0, UNDER = 1, OVER = 2, TOP = 3;
const RING = 0, DOME = 1, OVERLAY = 2;
const AT: Record<string, number> = { feet: FEET, body: BODY, hand: HAND, head: HEAD };
const ZD: Record<string, number> = { ground: GROUND, under: UNDER, over: OVER, top: TOP };
const SLOT: Record<string, number> = { ring: RING, dome: DOME, overlay: OVERLAY };
const TAU = Math.PI * 2;

interface Orb { n: number; stacks: boolean; kinds: number; rx: number; ry: number; oy: number; period: number; sign: number; bob: number; bobPeriod: number; backAlpha: number; face: string; dirs: number; ground: boolean }
/** Слой обозначения. tex, d, fw, fh — по плотностям листа: [основной, ×3]. */
interface Lay { tex: string[]; d: number[]; fw: number[]; fh: number[]; n: number; fps: number; ax: number; ay: number; at: number; dx: number; dy: number; z: number; bobAmp: number; bobPeriod: number; orbit: Orb | null; variant: number; moving: boolean }
interface Fx {
  key: string; idx: number; slot: number; prio: number; fadeIn: number; fadeOut: number; s0: number; layers: Lay[]; theme: string; bead: string[]; beadKey: string[];
  boxW: number; boxOff: number; pipsMax: number; pipsColor: number; legacy: boolean;
  /** Есть слой «только в движении» (пыль маунта). */
  moves: boolean;
  /** Значок над подписью: на сколько пикселей мира его верх выше точки привязки (для разводки подписей); у остальных 0. */
  up: number;
}
interface MLayer { sheet: string; sheetX3?: string; frame: number[]; frameX3?: number[]; frames: number; fps: number; scale: number; anchor: number[]; at: string; z: string; offset?: number[]; bob?: { amp: number; period: number }; orbit?: Record<string, unknown>; variant?: string }
interface Manifest {
  keys: string[]; replaces: string[]; sheets: Record<string, number[]>;
  fx: Record<string, { slot: string; prio: number; theme: string; bead: string[]; ease: { fadeIn: number; fadeOut: number; scaleIn?: number }; only?: string; pips?: { max: number; color: number[] }; box?: { w: number; off: number }; legacy?: boolean; layers: MLayer[] }>;
}

/** Виды buff (fx), постоянную картинку которых теперь рисует это обозначение: старые пузыри и круги под ногами (effects.ts) для них не нужны.
 *  Для каждого вида сервер держит обозначение на юните, пока длится событие: у invuln — и у короткой вспышки «Стража» и «Объятий смерти»
 *  (data/aura-fx-rules.json, flashes), иначе эта вспышка не была бы видна совсем. */
const COVERED = new Set(["block", "shield", "invuln", "antimagic", "warp"]);
export const afx = {
  ready: false,
  /** Героев в кадре, после которых включаются правила толпы (_rules.crowd); тесты поднимают, чтобы замерить полную нагрузку. */
  crowd: 6,
  /** Сколько мс режим толпы держится после включения, даже если героев стало меньше (на границе порога обозначения не мигают). */
  crowdHold: 1500,
  fx: [] as Fx[],
  byKey: new Map<string, Fx>(),
  replaced: new Set<string>(),
  mount: null as Fx | null,
  /** Цикл aura умения (data/skill-fx.json) заменён обозначением: Vfx.buff его не запускает. */
  replaces(cycle: string): boolean { return this.ready && this.replaced.has(cycle); },
  /** Постоянную картинку этого вида buff рисует обозначение (Vfx.buff возвращает «нарисовано»). */
  covers(kind: string): boolean { return this.ready && COVERED.has(kind); },
};

/** Загрузка листов (BootScene.preload, когда каталог уже в кэше). */
export function loadAuraFx(scene: Phaser.Scene, m: Manifest | undefined | null) {
  if (!m?.sheets) return;
  for (const [name, s] of Object.entries(m.sheets)) scene.load.spritesheet(`afx_${name}`, `/assets/aura-fx/${name}.png`, { frameWidth: s[0], frameHeight: s[1] });
}

/** Насколько верх значка над подписью выше его точки привязки (пиксели мира): рисунок выше якоря, покачивание, у орбиты — ещё и подъём эллипса. */
function headUp(L: Lay): number {
  const o = L.orbit;
  return L.ay * (L.fh[0] / L.d[0]) + (o ? Math.max(0, o.ry - o.oy + o.bob) : L.bobAmp);
}

/** Разбор каталога (BootScene.create): без каталога обозначений нет, и всё остаётся по-старому. */
export function initAuraFx(scene: Phaser.Scene) {
  const m = scene.cache.json.get("aurafx") as Manifest | undefined;
  afx.ready = false;
  if (!m?.keys || !m.fx) return;
  afx.fx = []; afx.byKey.clear(); afx.replaced = new Set(m.replaces ?? []); afx.mount = null;
  m.keys.forEach((key, idx) => {
    const e = m.fx[key];
    if (!e) { afx.fx.push({ key, idx, slot: OVERLAY, prio: 0, fadeIn: 0, fadeOut: 0, s0: 1, layers: [], theme: "", bead: [], beadKey: [], boxW: 0, boxOff: 0, pipsMax: 0, pipsColor: 0, legacy: true, moves: false, up: 0 }); return; }
    const layers: Lay[] = e.layers.map((l) => {
      const o = l.orbit as Record<string, number | string | boolean> | undefined;
      return {
        tex: [`afx_${l.sheet}`, ...(l.sheetX3 ? [`afx_${l.sheetX3}`] : [])], d: [Math.round(1 / l.scale), ...(l.sheetX3 ? [3] : [])],
        fw: [l.frame[0], ...(l.frameX3 ? [l.frameX3[0]] : [])], fh: [l.frame[1], ...(l.frameX3 ? [l.frameX3[1]] : [])],
        n: l.frames, fps: l.fps, ax: l.anchor[0], ay: l.anchor[1], at: AT[l.at], dx: l.offset?.[0] ?? 0, dy: l.offset?.[1] ?? 0, z: ZD[l.z], bobAmp: l.bob?.amp ?? 0, bobPeriod: l.bob?.period ?? 1,
        orbit: o ? {
          n: o.n as number, stacks: !!o.stacks, kinds: (o.kinds as number) ?? 1, rx: o.rx as number, ry: o.ry as number, oy: o.oy as number,
          period: Math.abs(o.period as number), sign: Math.sign(o.period as number) || 1, bob: o.bob as number, bobPeriod: o.bobPeriod as number,
          backAlpha: o.backAlpha as number, face: (o.face as string) ?? "shimmer", dirs: (o.dirs as number) ?? 16, ground: !!o.ground,
        } : null,
        variant: l.variant === "solgard" ? 1 : l.variant === "umbrath" ? 2 : 0, moving: e.only === "moving",
      };
    });
    const fx: Fx = {
      key, idx, slot: SLOT[e.slot], prio: e.prio, fadeIn: e.ease.fadeIn, fadeOut: e.ease.fadeOut, s0: e.ease.scaleIn ?? 1, layers, theme: e.theme, bead: e.bead, beadKey: [`afxb_${e.theme}_0`, `afxb_${e.theme}_1`],
      boxW: e.box?.w ?? 0, boxOff: e.box?.off ?? 0, pipsMax: e.pips?.max ?? 0, pipsColor: e.pips ? (e.pips.color[0] << 16) | (e.pips.color[1] << 8) | e.pips.color[2] : 0, legacy: !!e.legacy,
      moves: layers.some((l) => l.moving), up: layers.length && layers[0].at === HEAD ? headUp(layers[0]) : 0,
    };
    afx.fx.push(fx);
    afx.byKey.set(key, fx);
  });
  afx.mount = afx.byKey.get("mount") ?? null;
  afx.ready = afx.fx.length > 0;
  (window as unknown as { __afx?: typeof afx }).__afx = afx;   // для автотестов в браузере (tests/aura-ingame.ts)
}

// ---------- пул спрайтов (на сцену: после перезапуска сцены её объекты уничтожены) ----------
const pools = new WeakMap<Phaser.Scene, Phaser.GameObjects.Image[]>();
function poolOf(scene: Phaser.Scene): Phaser.GameObjects.Image[] {
  let p = pools.get(scene);
  if (!p) { pools.set(scene, (p = [])); scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => pools.delete(scene)); }
  return p;
}
function take(scene: Phaser.Scene, tex: string, frame: number): Phaser.GameObjects.Image {
  const pool = poolOf(scene);
  let im = pool.pop();
  while (im && !im.scene) im = pool.pop();
  if (!im) return scene.add.image(0, 0, tex, frame).setOrigin(0, 0);
  return im.setTexture(tex, frame).setOrigin(0, 0).setActive(true).setVisible(true).setAlpha(1).setScale(1).setFlipX(false);
}
function give(scene: Phaser.Scene, im: Phaser.GameObjects.Image) {
  if (!im.scene) return;
  im.setVisible(false).setActive(false);
  const pool = poolOf(scene);
  if (pool.length < 96) pool.push(im); else im.destroy();
}

// ---------- бусины: камни 5×5 цвета темы на кромке главного круга ----------
const BEAD_AT = [0.62, 0.38, 0.9, 0.1];
function beadTex(scene: Phaser.Scene, fx: Fx, lit: boolean): string {
  const key = fx.beadKey[lit ? 1 : 0];
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, 5, 5);
  if (!t) return key;
  const c = t.getContext();
  const px = (dx: number, dy: number, col: string) => { c.fillStyle = col; c.fillRect(dx + 2, dy + 2, 1, 1); };
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) px(dx, dy, "#140c1e");
  const [r2, r3, r4, r5] = fx.bead;
  px(0, 0, lit ? r5 : r4); px(-1, 0, r3); px(1, 0, r3); px(0, -1, r4); px(0, 1, r2);
  t.refresh();
  return key;
}

// ---------- толпа: героев в кадре больше afx.crowd (каждый видимый герой отмечается раз за кадр) ----------
let crowdFrame = -1, crowdNow = 0, crowdPrev = 0, crowdOn = false, crowdAt = 0, crowdEval = -1;
/** Из UnitView.update: герой в кадре камеры (с запасом) входит в счёт толпы. */
export function countHero(v: UnitView) {
  const u = v.u;
  if (u.kind !== UnitKind.Player || v.dead || v.unseen) return;
  const now = v.scene.time.now;
  if (now !== crowdFrame) { crowdFrame = now; crowdPrev = crowdNow; crowdNow = 0; }
  const wv = v.scene.cameras.main.worldView;
  if (v.x >= wv.x - 20 && v.x <= wv.right + 20 && v.y >= wv.y && v.y <= wv.bottom + 60) crowdNow++;
}
/** Режим толпы в этом кадре (считается раз за кадр по полному счёту прошлого): включается сразу, как героев стало больше afx.crowd, выключается, когда их стало
 *  не больше afx.crowd − 1 и режим держался не меньше afx.crowdHold мс. Без этого на границе (6 и 7 героев) края кадра включали бы и выключали его по кругу,
 *  и у всех чужих героев обозначения гасли и проявлялись бы заново. */
function crowdMode(now: number): boolean {
  if (now !== crowdEval) {
    crowdEval = now;
    if (!crowdOn) { if (crowdPrev > afx.crowd) { crowdOn = true; crowdAt = now; } }
    else if (crowdPrev < afx.crowd && now - crowdAt >= afx.crowdHold) { crowdOn = false; crowdAt = now; }
  }
  return crowdOn;
}

// ---------- экземпляр обозначения на юните ----------
/** Спрайт слоя и то, что на него уже выставлено: сеттеры Phaser не бесплатны, у стоящего героя не меняется почти ничего, кроме кадра. */
interface Item { im: Phaser.GameObjects.Image; tex: string; fr: number; x: number; y: number; s: number; a: number; d: number; on: boolean; fl: boolean }
interface Inst {
  fx: Fx; n: number;
  /** Есть в наборе, который прислал сервер (иначе уходит и удаляется). */
  inSet: boolean;
  /** Выбран правилами слотов; роль: 1 — главный круг, 2 — бусина, 3 — купол, 4 — значок или частицы. Роль и раскладка (целевые bead, hdx, lift, dim, row)
   *  ставятся только выбранным: у уходящего — снятого или вытесненного правилами — остаются последние, и он доигрывает затухание в прежнем виде. */
  want: boolean; role: number; bead: number; hdx: number; lift: number; dim: number; row: boolean;
  /** Показываемые сейчас hdx, lift и dim: идут к целевым твином; snap — новый вид встаёт на место сразу, без скольжения. */
  sx: number; sl: number; sd: number; snap: boolean;
  /** Число предметов орбиты по слоям (дробное: плавно идёт к стакам) и доля пыли в движении (0..1). */
  oc: number[]; mv: number;
  t0: number; outAt: number; vis: number; visOut: number; lt: number;
  items: Item[][]; pz: number; pk: { i: number; k: number }[]; beadImg: Phaser.GameObjects.Image | null;
  /** Точки стаков под значком: рисуются заново только при смене числа, ряда или зума; каждый кадр объект лишь ставится на место. */
  pipsG: Phaser.GameObjects.Graphics | null; pipsSig: number;
}
const newInst = (fx: Fx, n: number, now: number): Inst => ({
  fx, n, inSet: true, want: false, role: 0, bead: -1, hdx: 0, lift: 0, dim: 1, row: false, sx: 0, sl: 0, sd: 1, snap: true, oc: [], mv: 0,
  t0: now, outAt: -1, vis: 0, visOut: 0, lt: now, items: [], pz: 0, pk: [], beadImg: null, pipsG: null, pipsSig: -1,
});

/** Привязка юнита в этом кадре, общая для всех его обозначений (один объект на модуль — кадр без аллокаций). vert — движение по вертикали (−1 вниз, 1 вверх): пыль идёт назад от взгляда. dt — мс с прошлого кадра этого обозначения (не больше 100). */
const C = { gx: 0, gy: 0, bx: 0, by: 0, hx: 0, hy: 0, z: 1, flip: false, vert: 0, dy: 0, big: 1, moving: false, now: 0, faction: 1, dt: 0 };
const easeOut = (q: number) => 1 - (1 - q) ** 3;
/** Шаг к цели: k — доля пути за кадр; у самой цели встаёт на неё. */
const near = (a: number, b: number, k: number) => (Math.abs(b - a) < 0.02 ? b : a + (b - a) * k);
/** Постоянные времени плавности, мс (95 % пути — за три постоянных): сдвиги ряда, подъём и прозрачность круга толпы ~150 мс; число предметов орбиты; пыль маунта при старте и остановке. */
const EASE_LAYOUT = 50, EASE_ORBIT = 70, EASE_MOVE = 90;
const sortDesc = (a: Inst[]) => { for (let i = 1; i < a.length; i++) { const x = a[i]; let j = i - 1; while (j >= 0 && a[j].fx.prio < x.fx.prio) { a[j + 1] = a[j]; j--; } a[j + 1] = x; } };
const RINGS: Inst[] = [], DOMES: Inst[] = [], OVS: Inst[] = [], HEADS: Inst[] = [];

/** Лист под зум: пиксель листа — целое число пикселей холста k, размер в мире ближе всего к задуманному (формула Vfx pickDensity: зум 2 и 4 — двойной лист, 3 и 6 — тройной). */
function pickSheet(z: number, d: number[]): { i: number; k: number } {
  let bi = 0, bk = 1, be = Infinity;
  for (let i = 0; i < d.length; i++) for (let k = 1; k <= Math.max(1, Math.ceil(z)); k++) {
    const r = (d[i] * k) / z, e = Math.abs(r - 1) + (r > 1 ? 1e-3 : 0) - d[i] * 1e-6;
    if (e < be) { be = e; bi = i; bk = k; }
  }
  return { i: bi, k: bk };
}

export class UnitAuras {
  private insts: Inst[] = [];
  /** Прежние виды обозначений, у которых сменилась роль: гаснут, пока новые проявляются. */
  private ghosts: Inst[] = [];
  private cur = "";
  private curMount = false;
  private planKey = -1;
  private seed = 0;
  private away = false;
  /** Ширина и высота (мир, целые) ряда значков над подписью, высота — с зазором 1 px: UnitView.blockW и blockH отдают их разводке подписей, чтобы ник соседа не лёг под значки. 0 — значков нет. */
  rowW = 0;
  rowH = 0;

  constructor(readonly v: UnitView) {
    for (let k = 0; k < v.id.length; k++) this.seed = (this.seed * 31 + v.id.charCodeAt(k)) % 9973;
  }

  /** Раз за кадр из UnitView.update после расстановки спрайтов: hx — середина подписи, hy — низ значков над ней (мир, целые). */
  update(hx: number, hy: number) {
    const v = this.v, u = v.u, scene = v.scene, kind = u.kind;
    // скрытый юнит (и не тот род юнитов) — без обозначений сразу; мёртвый — набор пуст, обозначения плавно гаснут вместе с телом
    const eligible = (kind === UnitKind.Player || kind === UnitKind.Mob || kind === UnitKind.Boss) && !v.unseen;
    if (!eligible) { if (this.insts.length || this.ghosts.length || this.cur) this.clear(); return; }
    const now = scene.time.now;
    const dead = v.dead;
    const mount = !dead && kind === UnitKind.Player && v.mountDust && !!afx.mount;   // верхом на земном маунте: пыль за копытами (обозначение mount, только в движении)
    const set = dead ? "" : u.fx;
    if (set !== this.cur || mount !== this.curMount) this.parse(now, mount, set);
    if (!this.insts.length && !this.ghosts.length) return;
    // вне кадра обозначения не считаются и не рисуются
    const cam = scene.cameras.main, wv = cam.worldView;
    if (v.x < wv.x - 90 || v.x > wv.right + 90 || v.y < wv.y - 40 || v.y > wv.bottom + 150) {
      if (!this.away) { this.away = true; for (const it of this.insts) this.release(it); this.dropGhosts(); }
      return;
    }
    this.away = false;
    const z = cam.zoom || 1;
    // правила слотов зависят от того, кто смотрит: толпа, свой герой или цель, враг
    const mine = v.isSelf || v.selected;
    const foe = kind !== UnitKind.Player ? true : v.isSelf ? false : net.kind === "arena" ? !!u.team && u.team !== net.arena?.team : net.kind !== "raid" && !!u.faction && !!net.self && u.faction !== net.self.faction;
    const crowd = crowdMode(now);
    const key = (crowd ? 1 : 0) | (mine ? 2 : 0) | (foe ? 4 : 0);
    if (key !== this.planKey) { this.planKey = key; this.plan(now, crowd, mine, foe); }
    // точки привязки: ноги — целые пиксели от позиции юнита, тело и рука идут за спрайтом (покачивание в стойке, посадка на маунта)
    const sp = v.sprite;
    C.gx = Math.round(v.x); C.gy = Math.round(v.y); C.bx = sp.x; C.by = sp.y; C.hx = hx; C.hy = hy; C.z = z; C.now = now + this.seed * 37;
    C.flip = u.dir === Dir.Left; C.vert = u.dir === Dir.Down ? -1 : u.dir === Dir.Up ? 1 : 0; C.dy = v.y; C.big = v.frame > 32 ? Math.min(4, v.frame / 32) : 1; C.moving = u.anim === Anim.Walk; C.faction = u.faction === "umbrath" ? 2 : 1;
    for (let i = this.insts.length - 1; i >= 0; i--) if (this.step(this.insts[i], now, z)) this.insts.splice(i, 1);
    for (let i = this.ghosts.length - 1; i >= 0; i--) if (this.step(this.ghosts[i], now, z)) this.ghosts.splice(i, 1);
  }

  /** Один кадр обозначения: проявление или затухание, плавный переход раскладки, рисование. true — обозначение ушло совсем, экземпляр удаляется из списка. */
  private step(it: Inst, now: number, z: number): boolean {
    const dt = Math.min(100, Math.max(0, now - it.lt));
    it.lt = now;
    let gone = false;
    // плавность: появление — альфа и масштаб, снятие — альфа
    if (it.outAt < 0) it.vis = easeOut(Math.min(1, (now - it.t0) / Math.max(1, it.fx.fadeIn)));
    else {
      const q = (now - it.outAt) / Math.max(1, it.fx.fadeOut);
      if (q >= 1) { it.vis = 0; gone = !it.inSet; }
      else it.vis = it.visOut * (1 - q * q * q);
    }
    if (it.vis <= 0.004) { this.release(it); return gone; }
    // сдвиг ряда значков, подъём на стаках и прозрачность круга толпы идут к целевым твином
    if (it.sx !== it.hdx || it.sl !== it.lift || it.sd !== it.dim) {
      const k = 1 - Math.exp(-dt / EASE_LAYOUT);
      it.sx = near(it.sx, it.hdx, k); it.sl = near(it.sl, it.lift, k); it.sd = near(it.sd, it.dim, k);
    }
    C.dt = dt;
    // пыль маунта: проявляется и гаснет с началом и концом движения
    if (it.fx.moves) { const to = C.moving ? 1 : 0; if (it.mv !== to) it.mv = near(it.mv, to, 1 - Math.exp(-dt / EASE_MOVE)); }
    this.draw(it, z, it.outAt < 0 && it.vis < 1);
    if (it.role === 4 && it.fx.pipsMax && it.n > 0) this.drawPips(it, z); else if (it.pipsG && it.pipsG.visible) it.pipsG.setVisible(false);
    return false;
  }

  /** Новый набор: появившиеся обозначения плавно входят, пропавшие плавно уходят, у оставшихся обновляются стаки. */
  private parse(now: number, mount: boolean, s: string) {
    this.cur = s; this.curMount = mount; this.planKey = -1;
    for (const it of this.insts) it.inSet = false;
    const add = (fx: Fx | undefined, n: number) => {
      if (!fx || fx.legacy || !fx.layers.length) return;
      let it: Inst | undefined;
      for (const q of this.insts) if (q.fx === fx) { it = q; break; }
      if (!it) { it = newInst(fx, n, now); this.insts.push(it); }
      it.inSet = true;
      it.n = n;
    };
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); add(afx.fx[fxIdx(c)], fxN(c)); }
    if (mount) add(afx.mount ?? undefined, 0);
    for (const it of this.insts) if (!it.inSet && it.outAt < 0) { it.visOut = it.vis; it.outAt = now; it.want = false; }
  }

  /** Правила слотов (data/aura-fx.json, _rules.slots, beads, crowd, icons): кто выбран, роли, ряд значков над подписью. Не выбранные обозначения ничего не теряют:
   *  роль и раскладка остаются прежними, пока они гаснут. */
  private plan(now: number, crowd: boolean, mine: boolean, foe: boolean) {
    RINGS.length = DOMES.length = OVS.length = HEADS.length = 0;
    for (const it of this.insts) {
      it.want = false;
      if (!it.inSet) continue;
      const k = it.fx.key;
      let ok = true;
      if (crowd && !mine) {
        if (foe) ok = k === "stun" || k === "root" || k === "outlaw";
        else if (it.fx.slot === DOME) ok = k === "invuln" || k === "block";
        // эмблема знамени (zone_banner_*) остаётся у каждого союзника в круге: в рейде и на арене в кадре почти всегда толпа, а по эмблеме видно, кого знамя прикрывает
        else if (it.fx.slot === OVERLAY) ok = k === "stun" || k === "stealth" || k === "outlaw" || k.startsWith("zone_banner_");
      }
      if (ok) (it.fx.slot === RING ? RINGS : it.fx.slot === DOME ? DOMES : OVS).push(it);
    }
    sortDesc(RINGS); sortDesc(DOMES); sortDesc(OVS);
    if (RINGS[0]) { this.pick(RINGS[0], 1, now); if (crowd && !mine) RINGS[0].dim = 0.6; }
    for (let i = 1; i < RINGS.length && i <= 4; i++) { this.pick(RINGS[i], 2, now); RINGS[i].bead = i - 1; }
    if (DOMES[0]) this.pick(DOMES[0], 3, now);
    let lift = 0;
    for (let i = 0; i < OVS.length && i < 2; i++) {
      const it = OVS[i];
      this.pick(it, 4, now);
      if (it.fx.layers[0].at === HEAD) { HEADS.push(it); if (it.fx.pipsMax && it.n > 0) lift = -3; }
    }
    if (HEADS.length >= 2) {
      const a = HEADS[0], b = HEADS[1], total = a.fx.boxW + 2 + b.fx.boxW;
      a.hdx = Math.round(-total / 2 + a.fx.boxW / 2 - a.fx.boxOff); b.hdx = Math.round(total / 2 - b.fx.boxW / 2 - b.fx.boxOff);
      a.row = b.row = true;
    }
    for (const it of HEADS) it.lift = lift;
    // ряд значков занимает место над подписью: разводка подписей (UnitView.blockW, blockH) оставляет под него полосу
    let up = 0;
    for (const it of HEADS) up = Math.max(up, it.fx.up - it.lift);
    this.rowW = HEADS.length >= 2 ? HEADS[0].fx.boxW + 2 + HEADS[1].fx.boxW : HEADS.length ? HEADS[0].fx.boxW : 0;
    this.rowH = HEADS.length ? Math.ceil(up) + 1 : 0;
    for (const it of this.insts) {
      if (it.want) {
        if (it.snap) { it.sx = it.hdx; it.sl = it.lift; it.sd = it.dim; it.snap = false; }
        // не выбранные правилами плавно уходят и так же возвращаются, если правила изменятся
        if (it.outAt >= 0) { it.t0 = now - it.fx.fadeIn * (1 - (1 - it.vis) ** (1 / 3)); it.outAt = -1; }
      } else if (it.outAt < 0) { it.visOut = it.vis; it.outAt = now; }
    }
  }

  /** Выбрать обозначение на роль и сбросить его целевую раскладку (её выставляет план). Роль сменилась — прежний вид гаснет призраком, новый проявляется заново. */
  private pick(it: Inst, role: number, now: number) {
    it.want = true;
    if (it.role !== role) {
      if (it.role) this.ghost(it, now);
      it.role = role; it.snap = true; it.t0 = now; it.outAt = -1; it.oc = [];
    }
    it.bead = -1; it.hdx = 0; it.lift = 0; it.dim = 1; it.row = false;
  }

  /** Прежний вид обозначения (у него сменилась роль) уходит отдельным экземпляром: спрайты, раскладка и прозрачность — его, затухание — обычное, как при снятии. */
  private ghost(it: Inst, now: number) {
    if (it.vis <= 0.004 || (!it.items.length && !it.beadImg)) { this.release(it); return; }
    this.ghosts.push({ ...it, inSet: false, want: false, outAt: now, visOut: it.vis, oc: it.oc.slice() });
    it.items = []; it.beadImg = null; it.pipsG = null; it.pipsSig = -1; it.pk = [];
  }

  private dropGhosts() {
    for (const g of this.ghosts) this.release(g);
    this.ghosts.length = 0;
  }

  private clear() {
    for (const it of this.insts) this.release(it);
    this.dropGhosts();
    this.insts.length = 0; this.cur = ""; this.curMount = false; this.planKey = -1; this.rowW = this.rowH = 0;
  }

  private release(it: Inst) {
    const sc = this.v.scene;
    for (const row of it.items) for (const m of row) give(sc, m.im);
    it.items.length = 0;
    if (it.beadImg) { give(sc, it.beadImg); it.beadImg = null; }
    if (it.pipsG) { it.pipsG.destroy(); it.pipsG = null; it.pipsSig = -1; }
  }

  /** Слои одного обозначения: статичный слой — один спрайт, орбита — по спрайту на предмет; бусина — камень на кромке круга. Раскладка (sx, sl, sd) — показываемая, не целевая. */
  private draw(it: Inst, z: number, fadingIn: boolean) {
    const sc = this.v.scene, fx = it.fx, t = C.now, vis = it.vis, al = vis * it.sd;
    if (!it.role) return;
    if (it.role === 2) { this.drawBead(it); return; }
    if (it.pz !== z) { it.pz = z; it.pk.length = 0; }
    const sf = fadingIn ? fx.s0 + (1 - fx.s0) * vis : 1;
    for (let li = 0; li < fx.layers.length; li++) {
      const L = fx.layers[li];
      if (L.variant && L.variant !== C.faction) continue;
      let row = it.items[li];
      if (!row) row = it.items[li] = [];
      if (L.moving && it.mv <= 0.004) { for (const m of row) this.hide(m); continue; }
      // лист по зуму (плотность выбирается раз на смену зума)
      const pk = it.pk[li] ?? (it.pk[li] = pickSheet(z, L.d));
      const di = pk.i, k = pk.k, fw = L.fw[di], fh = L.fh[di], tex = L.tex[di];
      if (!sc.textures.exists(tex)) continue;
      // точка привязки слоя
      let ax: number, ay: number;
      if (L.at === FEET) { ax = C.gx; ay = C.gy - 1; }
      else if (L.at === BODY) { ax = C.bx; ay = C.by - 13 * C.big; }
      else if (L.at === HAND) { ax = C.bx + (C.flip ? -10 : 10); ay = C.by - 11 * C.big; }
      else { ax = C.hx + it.sx; ay = C.hy + it.sl; }
      // пыль маунта идёт назад от взгляда: влево и вправо — зеркально, вверх и вниз — по центру и со сдвигом назад по вертикали
      const dust = L.moving, side = dust && !C.vert;
      ax += side && C.flip ? -L.dx : L.dx; ay += L.dy + (dust ? C.vert * 5 : 0);
      const am = dust ? al * it.mv : al;
      const depth = L.z === GROUND ? DEPTH.ground + 7 : L.z === UNDER ? C.dy - 0.6 : L.z === OVER ? C.dy + 0.6 : DEPTH.top - 4;
      const o = L.orbit, s = (k / z) * sf;
      if (!o) {
        const fi = Math.floor((t / 1000) * L.fps) % L.n;
        const m = row[0] ?? (row[0] = this.item(tex, fi));
        this.frame(m, tex, fi);
        const bob = L.bobAmp ? Math.round(Math.sin((t / L.bobPeriod) * TAU) * L.bobAmp * z) / z : 0;
        const lax = dust ? (C.vert ? 0.5 : C.flip ? 1 - L.ax : L.ax) : L.ax;   // слой в движении зеркалится: якорь тоже с другой стороны
        let x0 = ax - lax * fw * s, y0 = ay - L.ay * fh * s + bob;
        if (sf === 1) {
          if (L.d[di] === 1) { x0 = Math.round(ax - lax * fw); y0 = Math.round(ay - L.ay * fh) + bob; }
          else { x0 = Math.round(ax * z - lax * fw * k) / z; y0 = Math.round(ay * z - L.ay * fh * k) / z + bob; }
        }
        this.put(m, x0, y0, s, am, depth);
        if (dust && m.fl !== (side && C.flip)) { m.fl = side && C.flip; m.im.setFlipX(m.fl); }
        continue;
      }
      // орбита: предметы по эллипсу, угол и слой (перед или за героем) каждый кадр; радиус растёт при появлении.
      // Число предметов по стакам — дробное и плавно идёт к цели: фаза расходится на 360° / число, новый предмет проявляется альфой, снятый гаснет
      const tgt = o.stacks ? Math.max(1, Math.min(o.n, it.n || o.n)) : o.n;
      let ec = it.oc[li];
      if (ec === undefined || ec === tgt) ec = tgt; else ec = near(ec, tgt, 1 - Math.exp(-C.dt / EASE_ORBIT));
      it.oc[li] = ec;
      const cnt = Math.ceil(ec - 0.001);
      const F = o.face === "dir" || o.face === "angle" ? o.dirs : o.face === "lr" ? L.n / 2 / o.kinds : L.n / o.kinds;
      const R = 0.5 + 0.5 * vis;
      for (let i = 0; i < cnt; i++) {
        const a = (t / o.period) * TAU * o.sign + (i * TAU) / ec, sn = Math.sin(a);
        const wx = ax + Math.cos(a) * o.rx * R, wy = ay + o.oy + sn * o.ry * R + Math.sin((t / o.bobPeriod) * TAU + i * 2.1) * o.bob;
        let fi: number;
        if (o.face === "dir") fi = (Math.round((Math.atan2(Math.cos(a) * o.ry * o.sign, -Math.sin(a) * o.rx * o.sign) / TAU) * F) % F + F) % F;
        else if (o.face === "angle") fi = (Math.round(((((a % TAU) + TAU) % TAU) / TAU) * F) % F + F) % F;
        else if (o.face === "lr") fi = (-Math.sin(a) * o.sign >= 0 ? 0 : L.n / 2) + (i % o.kinds) * (L.n / 2 / o.kinds) + (Math.floor((t / 1000) * L.fps + (i * L.n) / 2 / ec) % (L.n / 2 / o.kinds));
        else fi = (i % o.kinds) * F + (Math.floor((t / 1000) * L.fps + (i * F) / ec) % F);
        const m = row[i] ?? (row[i] = this.item(tex, fi));
        this.frame(m, tex, fi);
        const front = sn >= 0;
        // предмет — целое число пикселей холста; при появлении масштаб растёт от центра, без округления
        const x0 = sf === 1 ? (Math.round(wx * z) - Math.round(L.ax * fw * k)) / z : wx - L.ax * fw * s, y0 = sf === 1 ? (Math.round(wy * z) - Math.round(L.ay * fh * k)) / z : wy - L.ay * fh * s;
        this.put(m, x0, y0, s, al * (front ? 1 : o.backAlpha) * Math.min(1, ec - i), o.ground ? DEPTH.ground + 7 : L.z === TOP ? DEPTH.top - 4 : front ? C.dy + 0.6 : C.dy - 0.6);
      }
      for (let i = cnt; i < row.length; i++) this.hide(row[i]);
    }
  }

  private item(tex: string, fr: number): Item { return { im: take(this.v.scene, tex, fr), tex, fr, x: NaN, y: NaN, s: NaN, a: NaN, d: NaN, on: false, fl: false }; }
  /** Выставить только то, что изменилось с прошлого кадра. */
  private put(m: Item, x: number, y: number, s: number, a: number, d: number) {
    const im = m.im;
    if (m.x !== x || m.y !== y) { m.x = x; m.y = y; im.setPosition(x, y); }
    if (m.s !== s) { m.s = s; im.setScale(s); }
    if (m.a !== a) { m.a = a; im.setAlpha(a); }
    if (m.d !== d) { m.d = d; im.setDepth(d); }
    if (!m.on) { m.on = true; im.setVisible(true); }
  }
  private hide(m: Item) { if (m.on) { m.on = false; m.im.setVisible(false); } }
  /** Лист или кадр сменились — менять только тогда: setTexture и setFrame не бесплатны. */
  private frame(m: Item, tex: string, fr: number) {
    if (m.tex !== tex) { m.tex = tex; m.fr = fr; m.im.setTexture(tex, fr); } else if (m.fr !== fr) { m.fr = fr; m.im.setFrame(fr); }
  }

  /** Бусина: камень на кромке главного круга (спереди), мерцает по очереди. */
  private drawBead(it: Inst) {
    const sc = this.v.scene, i = Math.max(0, it.bead), a = BEAD_AT[i % 4] * Math.PI;
    const tex = beadTex(sc, it.fx, Math.floor(C.now / 250 + i) % 4 < 2);
    if (!it.beadImg) it.beadImg = take(sc, tex, 0); else if (it.beadImg.texture.key !== tex) it.beadImg.setTexture(tex);
    it.beadImg.setPosition(Math.round(C.gx + Math.cos(a) * 23) - 2, Math.round(C.gy - 1 + Math.sin(a) * 11) - 2).setScale(1).setAlpha(it.vis).setDepth(DEPTH.ground + 7.2).setVisible(true);
  }

  /** Точки стаков под значком: 2×2 мира с контуром 1 px холста, цвет темы, набранные светлее сверху слева. Рисуются в свой Graphics заново только
   *  при смене числа, ряда или зума; каждый кадр объект лишь ставится на место и получает прозрачность появления и затухания (вместе со значком). */
  private drawPips(it: Inst, z: number) {
    const L = it.fx.layers[0], max = it.fx.pipsMax, cnt = it.row ? it.n : max, w = cnt * 3 - 1;
    let ox: number, oy: number;
    if (L.at === HEAD) { ox = C.hx + it.sx - w / 2; oy = C.hy + it.sl + 1; }
    else {
      const pk = it.pk[0] ?? (it.pk[0] = pickSheet(z, L.d)), h = (L.fh[pk.i] * pk.k) / z;
      ox = (L.at === FEET ? C.gx : L.at === BODY ? C.bx : C.bx + (C.flip ? -10 : 10)) + L.dx - w / 2;
      oy = (L.at === FEET ? C.gy - 1 : L.at === BODY ? C.by - 13 * C.big : C.by - 11 * C.big) + L.dy + h * (1 - L.ay) + 0.5;
    }
    let g = it.pipsG;
    if (!g) g = it.pipsG = this.v.scene.add.graphics().setDepth(DEPTH.top - 4.5);
    const sig = (it.n * 8 + cnt) * 16 + z;
    if (sig !== it.pipsSig) {
      it.pipsSig = sig;
      g.clear();
      const px = 1 / z, col = it.fx.pipsColor, hi = (Math.min(255, (col >> 16) + 70) << 16) | (Math.min(255, ((col >> 8) & 255) + 70) << 8) | Math.min(255, (col & 255) + 70);
      for (let i = 0; i < cnt; i++) {
        const on = i < it.n, x = i * 3;
        g.fillStyle(0x100a12, 0.9).fillRect(x - px, -px, 2 + 2 * px, 2 + 2 * px);
        g.fillStyle(on ? col : 0x3c3240, on ? 1 : 0.85).fillRect(x, 0, 2, 2);
        if (on) g.fillStyle(hi, 1).fillRect(x, 0, 1, 1);
      }
    }
    const x = Math.round(ox * z) / z, y = Math.round(oy * z) / z;
    if (g.x !== x || g.y !== y) g.setPosition(x, y);
    if (g.alpha !== it.vis) g.setAlpha(it.vis);
    if (!g.visible) g.setVisible(true);
  }

  destroy() {
    this.clear();
  }
}
