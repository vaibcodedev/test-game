/** Отображение одного юнита: спрайт с анимациями, тень, имя, полоска здоровья, эффекты состояния. */
import Phaser from "phaser";
import { overlay } from "./overlay";
import { BUFF_BLEED, BUFF_CURSE, BUFF_STEALTH, BUFF_BURN, BUFF_ENRAGE, BUFF_HASTE, BUFF_POISON, BUFF_ROOT, BUFF_SLOW, BUFF_STUN, BUFF_WARCRY, Anim, Dir, UnitKind } from "../../../shared/protocol";
import { net, type UnitState } from "../net";
import { emptyBox, hitUnit, silhouette, Trail, TRAIL_MS, unionBox, type Box, type Hit } from "./hit";
import { rankById } from "../../../shared/arena";
import { DEPTH } from "./terrain";
import { Shadow } from "./shadows";
import { nightLevel } from "../../../shared/daynight";
import { MOUNTS, mountTex, type MountMeta } from "../../../shared/mounts";
import { PLAYER_SPEED } from "../../../shared/constants";
import { FOE_COLOR, factionColor } from "../../../shared/factions";
import { P } from "../../../shared/palette";
import { GearLayers, parseGear } from "./GearLayers";
import { LEGENDARIES } from "../../../shared/legendary";
import { capBand, placeText, worldText } from "./worldText";
import { UnitAuras, afx, countHero } from "./auraFx";
import { zbDef, zbFx, zbViews } from "./zoneBoss";
import { drawPlate, newPlate, resetPlate } from "./nameplate";
import { HERALDRY, parseHerald, type Herald } from "../../../shared/npcGear";
import { GP } from "../../../shared/gameplay";

/** Любой объект сцены с позицией и глубиной: спрайт вспышки, эллипс щита или круга (UnitView.attach). */
export type Attachable = { setPosition(x: number, y: number): unknown; setDepth(value: number): unknown };

/** Тёмная подложка рамок и щита — цвет «колодца» из палитры. */
const WELL = Phaser.Display.Color.HexStringToColor(P.well).color;
/** Кольцо под ногами у выбранного и у наведённого: враг — красное (P.foe), союзник — зелёное (P.ally). */
export const RING_FOE = Phaser.Display.Color.HexStringToColor(P.foe).color;
export const RING_ALLY = Phaser.Display.Color.HexStringToColor(P.ally).color;
const MELEE = new Set(["guard", "pet_wolf", "pet_turtle", "warrior", "deathknight", "reaver", "goblin", "skeleton", "skeleton_knight", "wolf", "boar", "spider", "drowned", "golem", "ashlord"]);
/** Прямоугольник непрозрачных пикселей кадра (в пикселях кадра, слева сверху): считается один раз на кадр текстуры, по картинке листа. */
const alphaCache = new Map<string, readonly [number, number, number, number] | null>();
const sheetData = new Map<string, ImageData | null>();
function frameAlpha(f: Phaser.Textures.Frame): readonly [number, number, number, number] | null {
  const key = f.texture.key + "|" + f.name;
  let a = alphaCache.get(key);
  if (a !== undefined) return a;
  let data = sheetData.get(f.texture.key);
  if (data === undefined) {
    const img = f.source.image as CanvasImageSource & { width: number; height: number };
    try {
      const cv = document.createElement("canvas");
      cv.width = img.width; cv.height = img.height;
      const g = cv.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      data = g.getImageData(0, 0, cv.width, cv.height);
    } catch { data = null; }
    sheetData.set(f.texture.key, data);
  }
  a = null;
  if (data) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < f.cutHeight; y++) for (let x = 0; x < f.cutWidth; x++) {
      if (data.data[((f.cutY + y) * data.width + f.cutX + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 >= 0) a = [x0, y0, x1 + 1, y1 + 1];
  }
  alphaCache.set(key, a);
  return a;
}
/** Непрозрачная часть кадра спрайта в пикселях мира (с отражением и origin); прозрачный кадр или нет данных — весь кадр. */
function spriteAlphaBox(sp: Phaser.GameObjects.Sprite, out: Box): Box {
  const f = sp.frame, w = f.cutWidth, h = f.cutHeight;
  const a = frameAlpha(f) ?? [0, 0, w, h];
  const left = sp.x - sp.originX * w * sp.scaleX, top = sp.y - sp.originY * h * sp.scaleY;
  const ax0 = sp.flipX ? w - a[2] : a[0], ax1 = sp.flipX ? w - a[0] : a[2];
  out.x0 = left + ax0 * sp.scaleX; out.x1 = left + ax1 * sp.scaleX;
  out.y0 = top + a[1] * sp.scaleY; out.y1 = top + a[3] * sp.scaleY;
  return out;
}
/** Цвет "#rrggbb" в число (кэш: значок и факел бойцов спрашивают каждый кадр). */
const hexCache = new Map<string, number>();
const hex = (h: string) => { let v = hexCache.get(h); if (v === undefined) { v = Phaser.Display.Color.HexStringToColor(h).color; hexCache.set(h, v); } return v; };
const rowOf = (dir: number) => (dir === Dir.Down ? 0 : dir === Dir.Up ? 1 : 2);
/** Вспышка от удара: белая копия кадра поверх тела с этой прозрачностью гаснет за FLASH_MS и повторяется не чаще FLASH_GAP —
 *  рисунок виден сквозь неё, и под градом ударов в рейде босс не белеет целиком. */
const FLASH_MS = 90, FLASH_GAP = 250, FLASH_ALPHA = 0.5;
/** Сглаживание хода чужих юнитов: разрыв до позиции сервера покрывается за столько интервалов между её приходами. */
const LAG_K = GP.ui.lagK;

export class UnitView {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  ring: Phaser.GameObjects.Image;
  aura?: Phaser.GameObjects.Image;
  stun?: Phaser.GameObjects.Text;
  /** Титул над именем и рамка ранга арены. */
  titleText: Phaser.GameObjects.Text;
  frameGfx: Phaser.GameObjects.Graphics;
  /** Эффекты (щит, аура, каст, круг под ногами), привязанные к юниту: ставятся здесь же, после интерполяции, с тем же округлением, что и спрайт героя.
   *  dy — сдвиг по y, dz — смещение глубины от y (null — глубину не трогать), body — эффект на теле: идёт ровно за спрайтом героя
   *  (с покачиванием в стойке и посадкой на маунта), иначе — под ногами, в целых пикселях от позиции юнита. Позицию двигают только здесь, раз за кадр:
   *  таймеры и твины с дробными координатами дают дрожь относительно героя на бегу. */
  private attached: { obj: Attachable; dy: number; dz: number | null; body: boolean }[] = [];
  attach(obj: Attachable, dy: number, dz: number | null, body = false) { this.detach(obj); this.attached.push({ obj, dy, dz, body }); this.placeAttached(); }
  detach(obj: Attachable) { const i = this.attached.findIndex((a) => a.obj === obj); if (i >= 0) this.attached.splice(i, 1); }
  private placeAttached() {
    const gx = Math.round(this.x), gy = Math.round(this.y), bx = this.sprite.x, by = this.sprite.y;
    for (const a of this.attached) { a.obj.setPosition(a.body ? bx : gx, (a.body ? by : gy) + a.dy); if (a.dz !== null) a.obj.setDepth(this.y + a.dz); }
  }
  mountSpr?: Phaser.GameObjects.Sprite;
  mountFront?: Phaser.GameObjects.Sprite;
  private mounted = false;
  /** Верховой на земном маунте: в движении за копытами пыль (обозначение mount, game/auraFx.ts). Ставит update. */
  mountDust = false;
  /** Обозначения бафов и дебафов на юните (задача 129): создаётся, когда у юнита появляется набор ключей Unit.fx. */
  private afxView?: UnitAuras;
  private shadowMounted = false;
  /** Длинная динамическая тень из кадров тела и маунта (game/shadows.ts). */
  private dyn?: Shadow;
  private dustAt = 0;
  /** Факел стражника ночью: пламя и мерцающее свечение. */
  private torchGfx?: Phaser.GameObjects.Graphics;
  private torchGlow?: Phaser.GameObjects.Image;
  /** Круг под ногами для бафов (боевой клич, ускорение, ярость): перерисовывается только при смене набора. */
  private buffGfx?: Phaser.GameObjects.Graphics;
  private buffMask = 0;
  private layers?: GearLayers;
  /** Знамя знаменосца стражи Эмберхолла — готовый лист vfx («Жаровня», heraldry.bearerSheet), в руке. */
  private bearer?: Phaser.GameObjects.Sprite;
  private bearerGlow?: Phaser.GameObjects.Image;
  /** Геральдика бойца фракции (u.herald, задача 132 шаг 8): разбирается один раз, пока строка не сменится. */
  private herald: Herald | null = null;
  private heraldKey: string | undefined = "";
  private seed = 0;
  private sid: string;
  stepAt = 0;
  private mountId = "";
  private lastTitle = "";
  private lastColor = "";
  x: number;
  y: number;
  frame: number;
  private lastAseq: number;
  private lastAnim = -1;
  private lastRow = -1;
  private lastHp = -1;
  /** Полоска здоровья с анимацией (game/nameplate.ts): плавное убывание, след потерянного, вспышка, лечение. */
  private hpPlate = newPlate();
  private lastLabel = "";
  private attacking = false;
  private flashUntil = 0;
  private flashSpr?: Phaser.GameObjects.Sprite;
  dead = false;
  selected = false;
  /** В нейтральном городе чужая фракция показывает цвет фракции, а не красный. */
  inNeutralZone = false;
  /** Под курсором (GameScene.updateHover каждый кадр): кольцо под ногами, ник и полоска видны. hoverFoe — враг (красное кольцо) или союзник (зелёное). */
  hovered = false;
  hoverFoe = true;
  /** Разводка подписей (labelLayout): целевой и текущий сдвиг блока имя+титул+полоска, показывать ли ник в толпе, базовая точка блока. */
  tgtX = 0;
  tgtY = 0;
  private offX = 0;
  private offY = 0;
  nameOk = true;
  /** Горожанин: ник показан по близости (гистерезис 5 / 5,5 тайла) и плавность появления/ухода (0..1). */
  private nearName = false;
  /** Горожанин хочет показать имя (близко или под курсором): разводка подписей (labelLayout) ставит его наравне с остальными. */
  wantNear = false;
  get nameShown() { return this.nameF > 0.01; }
  private nameF = 0;
  /** В толпе (режим «авто») у героев без уровня: имя остаётся, прячется только « · 100». */
  shortName = false;
  topY = 0;
  /** Гигантский спрайт (рейд-босс, кадр 128): на сколько пикселей выше ног стоит низ ника; иначе подпись идёт от роста героя. Титул, рамка и разводка считаются от него так же, как у героев. */
  private nameRise?: number;
  /** Базовая линия и верх заглавных ника от верха его блока (пиксели мира): от них центруются рамка и щит. Постоянны, пока жив текст. */
  private band: { base: number; cap: number };
  /** Сколько пикселей блок подписи (титул, рамка, ник) поднимается над topY: считается в update от фактических размеров текста. */
  private blockUp = 14;
  /** Ник виден только из-за наведения (при выключенных «Имена»): разводка его не считает — он рисуется поверх соседей, и блок не уезжает от касания курсором. */
  private nameHover = false;
  /** Зазор под полоску здоровья между ником и головой (4 px): при выключенных «Полоски» ник опускается на её место, под курсором (полоска видна) плавно поднимается обратно. −1 — ещё не считался. */
  private barGap = -1;
  /** Ширина блока подписи для проверки перекрытий (с рядом значков над ней: обозначения, game/auraFx.ts). */
  blockW(): number {
    const own = !this.nameHover;
    return Math.max(own && this.label.visible ? this.label.width : 0, own && this.titleText.visible ? this.titleText.width : 0, this.frame > 32 ? 44 : 20, this.afxView?.rowW ?? 0);
  }
  /** Высота блока подписи для проверки перекрытий: от верхнего края титула (или ника) до низа полоски здоровья, плюс ряд значков над подписью (если есть):
   *  без этого ник соседа, поднятый разводкой, оказывался бы под значками. */
  blockH(): number {
    return this.blockUp + 3 + (this.afxView?.rowH ?? 0);
  }
  /** Городской NPC (стражник, горожанин): не цель, без полоски здоровья. */
  readonly npc: boolean;

  constructor(
    readonly scene: Phaser.Scene,
    readonly id: string,
    readonly u: UnitState,
    readonly isSelf: boolean,
  ) {
    this.x = u.x;
    this.y = u.y;
    this.npc = u.kind === UnitKind.Guard || u.kind === UnitKind.Citizen;
    // герои рисуются голым телом, одежда — слоями экипировки (GearLayers)
    // бойцы фракций со снаряжением (задача 132, шаг 8) — так же: тело класса и слои
    // стража Эмберхолла — Пепельнорождённые: тело из шлака nude_ashborn_<класс> (npm run assets, tools/gen/ashborn-body.ts)
    const ash = this.layered() && this.heraldOf()?.H.ash && scene.textures.exists(`u_nude_ashborn_${u.sprite}`);
    this.sid = ash ? `nude_ashborn_${u.sprite}` : this.layered() && scene.textures.exists(`u_nude_${u.sprite}`) ? `nude_${u.sprite}` : u.sprite;
    const tex = scene.textures.exists(`u_${this.sid}`) ? `u_${this.sid}` : "u_skeleton";
    this.frame = scene.textures.get(tex).get(0).width;
    const frameH = scene.textures.get(tex).get(0).height;
    const big = this.frame > 32;
    if (this.frame >= 96) this.nameRise = 0.9 * this.frame;
    else if (frameH > this.frame) this.nameRise = 0.9 * frameH; // высокий кадр (64×80): имя над макушкой
    this.shadow = scene.add.image(u.x, u.y, "fx_shadow_blob").setScale(big ? 2.2 : 1, big ? 2 : 1).setDepth(DEPTH.ground + 5);
    // кольцо выбора и наведения лежит над кругами бафов и щитов (DEPTH.ground + 7): те почти того же размера и цвета и скрыли бы его
    this.ring = scene.add.image(u.x, u.y, "fx_target").setVisible(false).setAlpha(0.7).setDepth(DEPTH.ground + 7.5).setScale(big ? 2 : 1);
    this.sprite = scene.add.sprite(u.x, u.y, tex, 0).setOrigin(0.5, frameH > this.frame ? (frameH - 4) / frameH : 30 / 32);
    // босс стартовых земель (задача 136): кадры листа ставит game/zoneBoss.ts
    if (tex === `u_${this.sid}` && zbDef(this.sid)) zbViews.add(this);
    if (u.kind === UnitKind.Pet) {
      this.sprite.setScale(0.8);
      this.shadow.setScale(0.8);
    }
    this.lastAseq = u.aseq;
    const color = u.kind === UnitKind.Player ? (isSelf ? P.fg : "#a8e0ff") : u.kind === UnitKind.Boss ? "#ff8a5a" : u.kind === UnitKind.Pet ? "#8ae88a"
      : u.kind === UnitKind.Guard ? "#ffc861" : u.kind === UnitKind.Citizen ? "#d8cfc0" : "#f0e6d2";
    // origin слева-снизу: левый край ставится в целых пикселях мира (см. update)
    this.label = worldText(scene, u.x, u.y, this.labelText(), u.kind === UnitKind.Boss ? "boss" : u.kind === UnitKind.Pet || u.kind === UnitKind.Citizen ? "small" : "name", { color })
      .setOrigin(0, 1)
      .setDepth(DEPTH.top - 5);
    this.band = capBand(this.label);
    this.bar = scene.add.graphics().setDepth(DEPTH.top - 6);
    this.titleText = worldText(scene, u.x, u.y, "", "title").setOrigin(0, 1).setDepth(DEPTH.top - 5);
    this.frameGfx = scene.add.graphics().setDepth(DEPTH.top - 7);
    this.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (a: Phaser.Animations.Animation) => {
      if (a.key.includes("-attack-")) {
        this.attacking = false;
        this.lastAnim = -1;
      }
    });
    if (u.anim === Anim.Dead) this.showDead(true);
  }

  /** Рисуется ли юнит слоями снаряжения: герой и боец фракции с набором (u.gear). */
  private layered() {
    return this.u.kind === UnitKind.Player || ((this.u.kind === UnitKind.Soldier || this.u.kind === UnitKind.Guard) && !!this.u.gear);
  }
  private heraldOf(): Herald | null {
    const u = this.u;
    if (u.herald !== this.heraldKey) { this.heraldKey = u.herald; this.herald = u.kind === UnitKind.Soldier ? parseHerald(u.faction, u.herald) : u.kind === UnitKind.Guard ? parseHerald("ember", u.herald) : null; }
    return this.herald;
  }

  private labelText() {
    const u = this.u;
    if (u.kind === UnitKind.Mob) return `${u.name} · ${u.level}`;
    if (u.kind === UnitKind.Soldier && !u.level) return u.name; // чемпион и стража столиц (задача 132, шаг 7): уровень не подписан
    if (u.kind === UnitKind.Boss || u.kind === UnitKind.Guard || u.kind === UnitKind.Citizen) return u.name;
    if (u.kind === UnitKind.Pet) return `${u.name} (${net.unit(u.ownerId)?.name ?? "?"}) · ${u.level}`;
    return `${u.outlaw ? "⚔ " : ""}${u.name}${this.shortName ? "" : ` · ${u.level}`}`;
  }

  /** Короткий след удара оружием в сторону взгляда. */
  private slash(dir: number) {
    const a = dir === Dir.Down ? Math.PI / 2 : dir === Dir.Up ? -Math.PI / 2 : dir === Dir.Left ? Math.PI : 0;
    const big = this.frame > 32;
    const s = this.scene.add.image(this.x + Math.cos(a) * (big ? 22 : 10), this.y - (big ? 24 : 12) + Math.sin(a) * (big ? 18 : 8), "fx_slash")
      .setRotation(a - 0.6).setScale(big ? 1.2 : 0.55).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.y + 1).setAlpha(0);
    if (this.u.sprite === "ashlord") s.setTint(0xff8a3a);
    this.scene.tweens.add({ targets: s, alpha: { from: 0.9, to: 0 }, rotation: a + 0.6, delay: 90, duration: 200, onComplete: () => s.destroy() });
  }

  flash() {
    const now = this.scene.time.now;
    if (now - (this.flashUntil - FLASH_MS) >= FLASH_GAP) this.flashUntil = now + FLASH_MS;
  }

  private showDead(instant: boolean) {
    this.dead = true;
    // смерть посреди удара: анимация смерти перебивает удар, его ANIMATION_COMPLETE не придёт — иначе после возрождения
    // флаг удара так и висит, бег и стойка не включаются, и моб ездит в позе трупа
    this.attacking = false;
    const row = rowOf(this.u.dir);
    const key = `${this.sid}-death-${row}`;
    const wide = this.scene.anims.exists(`${this.sid}-rest-${row}`) ? Math.round(this.sprite.texture.getSourceImage().width / this.frame) : 0;
    if (instant || !this.scene.anims.exists(key)) this.sprite.setFrame(wide ? row * wide + wide - 1 : row * 12 + 11);
    else this.sprite.play(key);
    this.sprite.setFlipX(this.u.dir === Dir.Left);
    this.label.setVisible(false);
    this.bar.clear();
    this.scene.tweens.add({ targets: [this.sprite, this.shadow], alpha: this.u.kind === UnitKind.Player ? 0.75 : 0.55, duration: 600, delay: 400 });
  }

  /** Стойка: у листов задачи 140 — анимация покоя, у прежних — первый кадр строки. */
  private restPose(row: number) {
    const rest = `${this.sid}-rest-${row}`;
    if (this.scene.anims.exists(rest)) this.sprite.play(rest, true);
    else {
      this.sprite.stop();
      this.sprite.setFrame(row * 12);
    }
  }

  /** Вызывается каждый кадр; px/py — позиция для отрисовки (у своего игрока — предсказанная). */
  private wasStealth = false;
  /** Сглаживание хода (update): последняя позиция с сервера, когда пришла, средний интервал между приходами (мс) и скорость отрисовки (px/с). */
  private srvX = NaN;
  private srvY = NaN;
  private srvAt = 0;
  private ivl = 50;
  private drawV = 0;
  /** Невидимый для меня скрытный игрок: его нельзя выбрать в меню ПКМ (иначе меню выдаст ник и позицию). */
  unseen = false;
  update(dt: number, px?: number, py?: number) {
    const u = this.u;
    let jump = false;
    if (px !== undefined && py !== undefined) {
      this.x = px;
      this.y = py;
    } else {
      const dx = u.x - this.x, dy = u.y - this.y;
      if (dx * dx + dy * dy > 160 * 160) {
        this.x = u.x;
        this.y = u.y;
        jump = true;
      } else {
        // Ровный ход к позиции сервера для всех юнитов: мобы шлют её каждый такт (50 мс), стража, горожане и бойцы вне боя — раз в 200 мс.
        // С приходом новой позиции скорость отрисовки ставится так, чтобы покрыть разрыв за LAG_K интервалов между приходами:
        // ход постоянный (без рывка «быстро — стоп» у прежнего экспоненциального сглаживания), отставание ~ LAG_K интервала.
        const now = this.scene.time.now;
        if (u.x !== this.srvX || u.y !== this.srvY) {
          const gap = now - this.srvAt;
          if (gap > 0 && gap < 400) this.ivl += (gap - this.ivl) * 0.3;
          this.srvX = u.x;
          this.srvY = u.y;
          this.srvAt = now;
          this.drawV = Math.hypot(dx, dy) / ((this.ivl * LAG_K) / 1000);
        }
        const d = Math.hypot(dx, dy);
        const k = d > 0.01 ? Math.min(1, (this.drawV * dt) / d) : 1;
        this.x += dx * k;
        this.y += dy * k;
      }
    }
    this.trail.push(this.scene.time.now, this.x, this.y, jump);
    // смерть и возрождение
    if (u.anim === Anim.Dead && !this.dead) this.showDead(false);
    else if (u.anim !== Anim.Dead && this.dead) {
      this.dead = false;
      this.attacking = false;
      this.x = u.x;
      this.y = u.y;
      // снять затухание трупа (если возродился раньше, чем оно доиграло) и кадр смерти: стойку или бег поставит код ниже
      this.scene.tweens.killTweensOf([this.sprite, this.shadow]);
      // моб мог возродиться усиленным (задача 140): у него свой лист
      if (!this.layered() && u.sprite !== this.sid && this.scene.textures.exists(`u_${u.sprite}`)) {
        this.sid = u.sprite;
        this.sprite.setTexture(`u_${u.sprite}`, 0);
      }
      this.restPose(rowOf(u.dir));
      this.sprite.setAlpha(0);
      this.shadow.setAlpha(1);
      this.label.setVisible(true);
      this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 500 });
      this.lastAnim = -1;
      this.lastHp = -1;
      resetPlate(this.hpPlate);
    }

    const row = rowOf(u.dir);
    const anim = u.mount ? Anim.Idle : u.anim;
    if (!this.dead) {
      this.sprite.setFlipX(u.dir === Dir.Left);
      if (u.aseq !== this.lastAseq) {
        this.lastAseq = u.aseq;
        this.attacking = true;
        this.sprite.play(`${this.sid}-attack-${row}`);
        if (MELEE.has(u.sprite)) this.slash(u.dir);
      } else if (!this.attacking && (anim !== this.lastAnim || row !== this.lastRow)) {
        if (anim === Anim.Walk) this.sprite.play(`${this.sid}-walk-${row}`, true);
        else this.restPose(row);
      }
      this.lastAnim = anim;
      this.lastRow = row;
    }

    // позиция и глубина
    const bob = !this.dead && anim === Anim.Idle && !u.mount && !this.attacking ? Math.round(Math.sin(this.scene.time.now / 380 + this.x) * 0.6) : 0;
    const mmeta = u.mount ? (this.scene.cache.json.get("manifest")?.mounts?.[u.mount] as MountMeta | undefined) : undefined;
    const mtex = mmeta ? mountTex(u.mount, mmeta, u.faction) : "";
    const mounted = !!mmeta && !this.dead && this.scene.textures.exists(mtex);
    this.mounted = mounted;
    this.mountDust = mounted && !mmeta?.fly;
    const big0 = this.frame > 32;
    let lift = 0, riderDx = 0, riderDy = 0, hover = 0;
    if (mounted && mmeta) {
      if (!this.mountSpr || this.mountId !== mtex) {
        this.mountSpr?.destroy();
        this.mountFront?.destroy();
        this.mountId = mtex;
        const oy = mmeta.gy / mmeta.frame;
        this.mountSpr = this.scene.add.sprite(this.x, this.y, mtex, 0).setOrigin(0.5, oy);
        this.mountFront = this.scene.add.sprite(this.x, this.y, mtex, 0).setOrigin(0.5, oy);
      }
      const ms = this.mountSpr, mf = this.mountFront!;
      const moving = u.anim === Anim.Walk;
      // лист задачи 142: 4 вида, влево — своя строка (герб и знамя не отражаются); старый лист: 3 вида, влево — отражение
      const views = mmeta.views ?? 3;
      const mrow = views === 4 && u.dir === Dir.Left ? 3 : row;
      const flip = views !== 4 && u.dir === Dir.Left;
      const kind = moving ? "run" : "idle";
      const kb = `${mtex}-${kind}-${mrow}`;
      if (ms.anims.currentAnim?.key !== kb) {
        const t = ms.anims.currentAnim && moving ? ms.anims.getProgress() : 0;
        ms.play(kb);
        mf.play(`${mtex}-${kind}-${mrow + views}`);
        if (t) { ms.anims.setProgress(t); mf.anims.setProgress(t); }
      }
      // бег нового листа: скорость показа под скорость маунта — за цикл корпус проходит stride px, копыта не скользят
      const ts = moving && mmeta.stride ? Math.max(12, Math.min(48, ((mmeta.run ?? 20) * PLAYER_SPEED * (MOUNTS[u.mount]?.speed ?? 1.6)) / mmeta.stride)) / 30 : 1;
      if (ms.anims.timeScale !== ts) { ms.anims.timeScale = ts; mf.anims.timeScale = ts; }
      const col = (Number(ms.frame.name) || 0) % mmeta.cols;
      const seat = mmeta.seat[mrow]?.[col] ?? [0, -30];
      riderDx = Math.round(seat[0]) * (flip ? -1 : 1);
      riderDy = Math.round(seat[1]);
      hover = mmeta.fly ? Math.round(mmeta.fly + Math.sin(this.scene.time.now / 420 + this.x) * 1.5) : 0;
      const mx = Math.round(this.x), my = Math.round(this.y) - hover;
      ms.setVisible(true).setPosition(mx, my).setDepth(this.y - 0.5).setFlipX(flip);
      mf.setVisible(true).setPosition(mx, my).setDepth(this.y + 0.4).setFlipX(flip);
      lift = -(riderDy + 9) + hover;
      // тень на земле: крупнее зверя, у летающих меньше и бледнее
      const sw = (mmeta.frame / 32) * 0.62 * (mmeta.fly ? 0.8 : 1), sh = mmeta.frame / 32 * 0.32;
      this.shadow.setScale(sw, sh).setAlpha(mmeta.fly ? 0.6 : 1);
      this.ring.setScale(sw * 0.8, sh * 0.9);
      if (moving && !mmeta.fly && !afx.ready && this.scene.time.now > this.dustAt) {
        this.dustAt = this.scene.time.now + 110;
        const vx = u.dir === Dir.Right ? -1 : u.dir === Dir.Left ? 1 : 0, vy = u.dir === Dir.Down ? -1 : u.dir === Dir.Up ? 1 : 0;
        for (let k = 0; k < 2; k++) {
          const d = this.scene.add.circle(this.x + vx * (10 + k * 5) + (Math.random() - 0.5) * 6, this.y + vy * 8 - 1 + (Math.random() - 0.5) * 3, 1.5 + Math.random(), 0xcdb896, 0.55).setDepth(this.y - 0.6);
          this.scene.tweens.add({ targets: d, y: d.y - 6, alpha: 0, scale: 2.2, duration: 380 + k * 80, onComplete: () => d.destroy() });
        }
      }
    } else {
      this.mountSpr?.setVisible(false);
      this.mountFront?.setVisible(false);
      if (this.shadowMounted) { this.shadow.setScale(big0 ? 2.2 : 1, big0 ? 2 : 1).setAlpha(1); this.ring.setScale(big0 ? 2 : 1); }
    }
    this.shadowMounted = mounted;
    this.sprite.setPosition(Math.round(this.x) + riderDx, Math.round(this.y) + bob + (mounted ? riderDy + 9 - hover : 0)).setDepth(this.y);
    this.shadow.setPosition(Math.round(this.x), Math.round(this.y) - 2);
    this.syncDynShadow();
    // под курсором (вместо тинта спрайта): кольцо под ногами вдвое бледнее выбранного, красное у врага и зелёное у союзника; ник и полоска видны ниже
    const hov = this.hovered && !this.dead && !this.unseen;
    this.ring.setPosition(Math.round(this.x), Math.round(this.y) - 1).setVisible((this.selected || hov) && !this.dead);
    if (this.selected) this.ring.setAlpha(0.7);
    // setTintFill, а не setTint: текстура кольца золотая (255, 208, 64), умножение дало бы оранжево-красное и оливковое вместо цветов палитры
    else if (hov) this.ring.setAlpha(0.35).setTintFill(this.hoverFoe ? RING_FOE : RING_ALLY);
    if (this.attached.length) this.placeAttached();
    let top = this.nameRise !== undefined ? this.y - this.nameRise + 4 : this.y - (this.frame > 32 ? 58 : u.kind === UnitKind.Pet ? 22 : 27) - lift - this.gearTop();
    // плавный переход к назначенному разводкой сдвигу
    const sk = Math.min(1, dt * 9);
    this.offX += (this.tgtX - this.offX) * sk;
    this.offY += (this.tgtY - this.offY) * sk;
    this.topY = top;
    const lx = Math.round(this.x + this.offX);
    const top0 = top;
    top = top0 + Math.round(this.offY);
    const lt = this.labelText();
    if (lt !== this.lastLabel) { this.lastLabel = lt; this.label.setText(lt); }
    if (u.title !== this.lastTitle) { this.lastTitle = u.title; this.titleText.setText(u.title ? `«${u.title.replace(/ \(.*\)$/, "")}»` : ""); }
    // Вся геометрия подписи — в целых пикселях мира и от фактической высоты блока ника (метрики шрифта + обводка), а не от констант.
    // Левый край считается сам (origin 0,1): при origin 0.5 и нечётной ширине он падал бы на дробный пиксель, текст мылился и дрожал при ходьбе.
    const lh = Math.round(this.label.height);
    const barsOn = this.isSelf ? overlay.selfBars : overlay.bars;
    const gapTo = barsOn || (hov && !this.npc) ? 4 : 0;
    this.barGap = this.barGap < 0 ? gapTo : this.barGap + (gapTo - this.barGap) * sk;
    const nameY = Math.round(top - this.barGap);
    // у стражи щит-значок слева от ника (10 px вместе с зазором): блок «щит + ник» стоит по центру юнита, как и полоска под ним
    const badged = (u.kind === UnitKind.Guard || u.kind === UnitKind.Soldier);
    const left = lx - Math.round(this.label.width / 2) + (badged ? 5 : 0);
    this.label.setPosition(left, nameY);
    // на арене: союзники зелёные, враги красные; в нейтральном городе враг — цвет своей фракции, в PvP-зоне — красный
    if (u.kind === UnitKind.Player) {
      // в рейде обе фракции — союзники: никого не красим врагом
      const foe = !this.isSelf && net.kind !== "raid" && !!u.faction && !!net.self && u.faction !== net.self.faction;
      const color = this.isSelf ? P.fg : net.kind === "arena" && u.team ? (u.team === net.arena?.team ? P.ally : "#ff8a7a") : u.outlaw ? "#ff5a4a" : foe ? (this.inNeutralZone && u.faction ? factionColor(u.faction) : FOE_COLOR) : u.faction === "umbrath" ? factionColor("umbrath") : "#a8e0ff";
      if (color !== this.lastColor) { this.lastColor = color; this.label.setColor(color); }
    }
    // скрытность: себе и союзникам по команде — полупрозрачно, остальным — невидим
    const stealthy = !!(u.buffs & BUFF_STEALTH) && !this.dead && u.kind === UnitKind.Player;
    if (stealthy) {
      const seen = this.isSelf || (net.kind === "arena" && u.team !== 0 && u.team === net.arena?.team);
      const a = seen ? 0.4 : 0;
      this.unseen = !seen;
      this.sprite.setAlpha(a);
      this.shadow.setAlpha(a);
      this.mountSpr?.setVisible(seen && !!u.mount);
      this.mountFront?.setVisible(seen && !!u.mount);
      this.ring.setVisible(false);
      this.wasStealth = true;
    } else if (this.wasStealth) {
      this.wasStealth = false;
      this.unseen = false;
      if (!this.dead) { this.sprite.setAlpha(1); this.shadow.setAlpha(1); }
    }
    // ник считается заново каждый кадр (а не прячется один раз): после выключения и включения «Имена» он возвращается сам;
    // под курсором ник виден всегда, даже при выключенных «Имена»; на блок разводки (blockW, blockH) такой ник не влияет
    const base = !this.dead && !this.unseen && (this.isSelf ? overlay.selfNames : overlay.names) && (this.isSelf || this.nameOk);
    // горожане: имя по близости к герою с гистерезисом (показ с 5 тайлов, уход после 5,5 — без мигания на границе) и плавностью
    const citizen = u.kind === UnitKind.Citizen;
    if (citizen) {
      const sc = this.scene as unknown as { pos?: { x: number; y: number } }, d = Math.hypot(this.x - (sc.pos?.x ?? 0), this.y - (sc.pos?.y ?? 0));
      if (d < 5 * 32) this.nearName = true; else if (d > 5.5 * 32) this.nearName = false;
    }
    this.wantNear = citizen && (this.nearName || hov);
    const nameOn = base && !(citizen && !hov && !this.nearName);
    this.nameHover = hov && !nameOn;
    const wantName = nameOn || hov;
    if (citizen) this.nameF = Math.max(0, Math.min(1, this.nameF + (wantName ? dt * 1000 / 180 : -dt * 1000 / 150)));
    else this.nameF = wantName ? 1 : 0;
    this.label.setVisible(this.nameF > 0.01);
    if (citizen) {
      const e = 1 - (1 - this.nameF) * (1 - this.nameF); // ease-out
      this.label.setAlpha(e).setY(this.label.y + Math.round((1 - e) * 2));
    }
    const showName = !this.dead && this.label.visible;
    const rank = u.frame ? rankById(u.frame) : undefined;
    // Рамка (элита, ранг арены) — вокруг самого ника, а не вокруг его блока: блок несимметричен (сверху запас под акценты, снизу под хвосты
    // букв и округление высоты). band даёт верх заглавных и базовую линию; от них до внутреннего края линии рамки — по 2 px сверху и снизу,
    // сама линия 1 px (отсюда 3). Поля слева и справа равны (см. nameFrame).
    const baseY = nameY - lh + this.band.base;
    const frameTop = Math.floor(nameY - lh + this.band.cap) - 3, frameBot = baseY + 3;
    const framed = showName && (!!u.elite || !!rank);
    // Титул — над ником, его блок заходит на 1 px в пустое поле над заглавными (там запас шрифта под акценты, чернил нет);
    // над рамкой — с зазором 1 px от её верха. Хвосты букв титула и обводки с ником и рамкой не соприкасаются.
    const titleOn = showName && !!u.title;
    const titleY = framed ? frameTop - 1 : nameY - lh + 1;
    this.titleText.setVisible(titleOn).setPosition(lx - Math.round(this.titleText.width / 2), titleY);
    // высота блока подписи для разводки (labelLayout): от верхнего края титула, рамки или ника до низа полоски;
    // зазор под полоску — по настройке, без подъёма под курсором: наведение не двигает соседей
    const lay = !this.nameHover;
    this.blockUp = Math.round(top - Math.min(framed && lay ? frameTop : nameY - lh, titleOn && lay ? titleY - Math.round(this.titleText.height) : Infinity) - this.barGap + (barsOn ? 4 : 0));
    this.frameGfx.clear();
    const guardish = u.kind === UnitKind.Guard || u.kind === UnitKind.Soldier;
    if (guardish && showName) this.guardBadge(left, (baseY + nameY - lh + this.band.cap) / 2);
    this.torch(!this.dead && guardish && nightLevel(Date.now()) > 0.35);
    if (u.elite && showName) {
      this.nameFrame(left, frameTop, frameBot, 0xf0c040);
      if (this.lastColor !== "#ffd24a") { this.lastColor = "#ffd24a"; this.label.setColor("#ffd24a"); }
    }
    if (rank && showName) this.nameFrame(left, frameTop, frameBot, Phaser.Display.Color.HexStringToColor(rank.color).color);

    // вспышка от удара: белая копия кадра поверх тела, гаснет за FLASH_MS
    const fl = this.flashUntil - this.scene.time.now, sp = this.sprite;
    if (fl > 0 && !this.dead) {
      const f = (this.flashSpr ??= this.scene.add.sprite(0, 0, sp.texture.key).setTintFill(0xffffff));
      f.setTexture(sp.texture.key, sp.frame.name).setOrigin(sp.originX, sp.originY).setFlipX(sp.flipX).setScale(sp.scaleX, sp.scaleY)
        .setPosition(sp.x, sp.y).setDepth(sp.depth + 0.01).setAlpha(sp.alpha * FLASH_ALPHA * (fl / FLASH_MS)).setVisible(sp.visible);
    } else this.flashSpr?.setVisible(false);

    // цвет: эффекты
    const b = u.buffs;
    if (b & BUFF_STUN) this.sprite.setTint(0xfff0a0);
    else if (b & BUFF_SLOW || b & BUFF_ROOT) this.sprite.setTint(0x9ac8ff);
    else if (b & BUFF_POISON) this.sprite.setTint(0xb0ff90);
    else if (b & BUFF_BURN) this.sprite.setTint(0xffb080);
    else if (b & BUFF_BLEED) this.sprite.setTint(0xff8a8a);
    else if (b & BUFF_CURSE) this.sprite.setTint(0xc8a0ff);
    else if (b & BUFF_ENRAGE) this.sprite.setTint(0xff8a7a);
    else if (u.look) this.sprite.setTint(u.look);
    else this.sprite.clearTint();

    // аура элитного моба — единственное свечение на теле; бафы рисуются кругом под ногами
    const auraOn = !!u.elite && !this.dead;
    if (auraOn && !this.aura) this.aura = this.scene.add.image(0, 0, "fx_glow").setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35).setTint(0xf0c040);
    if (this.aura) this.aura.setVisible(auraOn).setPosition(this.x, this.y - 12).setDepth(this.y - 1).setScale(this.frame > 32 ? 2.2 : 1.1);
    // круги боевого клича и ускорения заменили обозначения (warcry, haste; game/auraFx.ts), ярость босса — прежний круг
    this.buffRings(this.dead ? 0 : b & (afx.ready ? BUFF_ENRAGE : BUFF_WARCRY | BUFF_HASTE | BUFF_ENRAGE));
    if (b & BUFF_STUN && !this.dead && !afx.ready) {
      this.stun ??= worldText(this.scene, 0, 0, "✦ ✦", "name", { fontSize: "8px", fontStyle: "", color: "#fff070" }).setDepth(DEPTH.top - 4);
      placeText(this.stun.setVisible(true), this.x + Math.sin(this.scene.time.now / 120) * 3, top - 14, 0.5, 0.5);
    } else this.stun?.setVisible(false);

    // снаряжение в скрытности видят те же, кто видит героя (сам, союзники по команде), так же полупрозрачно; для остальных его нет, как и героя
    const gearOn = this.layered() && !this.dead && !(stealthy && this.unseen) && this.frame === 32;
    if (gearOn) {
      if (!this.layers) { this.layers = new GearLayers(this.scene); for (let k = 0; k < this.id.length; k++) this.seed = (this.seed * 31 + this.id.charCodeAt(k)) % 97; }
      const row = rowOf(u.dir), fr = Number(this.sprite.frame.name) || 0;
      this.layers.setDepth(this.y);
      this.layers.setAlpha(stealthy ? this.sprite.alpha : 1);
      const hd = this.heraldOf();
      this.layers.draw({ cls: u.sprite, faction: u.faction, gear: u.gear, weapon: u.weapon, view: row, flip: u.dir === Dir.Left, col: row * 12 <= fr ? fr % 12 : 0, ox: this.sprite.x - 16, oy: this.sprite.y - 30, t: this.scene.time.now, seed: this.seed, sid: this.id, self: this.isSelf, herald: hd, night: hd?.H.ash ? nightLevel(Date.now()) : 0 });
      this.bearerFlag(hd?.banner && hd.H.bearerSheet ? hd.H.bearerSheet : "", stealthy ? this.sprite.alpha : 1);
    } else { this.layers?.hide(); this.bearer?.setVisible(false); this.bearerGlow?.setVisible(false); }

    // полоска здоровья: у мобов только раненых или выбранных (боссы — всегда), тонкая, 2 px; под курсором — у любого существа, даже при выключенных «Полоски»
    const mobHidden = (u.kind === UnitKind.Mob || u.kind === UnitKind.Pet) && u.hp >= u.maxHp && !this.selected && !hov;
    const showBar = ((this.isSelf ? overlay.selfBars : overlay.bars) || hov) && !this.dead && !this.npc && !mobHidden && (u.kind !== UnitKind.Player || u.hp < u.maxHp || this.isSelf || hov);
    let barX = 0, barY = 0, barW = 0;
    if (!showBar) { if (this.hpPlate.sig) { this.bar.clear(); this.hpPlate.sig = ""; this.hpPlate.barK = -1; } }
    else {
      this.lastHp = u.hp;
      const w = badged ? 24 : (this.frame > 32 ? 40 : 20) + (u.elite ? 8 : 0); // у стражи одна ширина для всех (капитан и рядовой)
      const bx = Math.round(lx - w / 2), by = Math.round(top - 2);
      barX = bx; barY = by; barW = w;
      const k = Math.max(0, Math.min(1, u.hp / Math.max(1, u.maxHp)));
      const foeBar = u.kind === UnitKind.Player && !this.isSelf && !!net.self && !!u.faction && u.faction !== net.self.faction && net.kind !== "arena" && net.kind !== "raid";
      const col = u.kind === UnitKind.Player ? (this.isSelf ? 0x5ad04a : foeBar ? Phaser.Display.Color.HexStringToColor(FOE_COLOR).color : 0x4ab0ff) : u.kind === UnitKind.Pet ? 0x6ad06a : k > 0.5 ? 0xd8443a : k > 0.25 ? 0xe0902a : 0xff3a2a;
      drawPlate(this.bar, this.hpPlate, { x: bx + w / 2, y: by, w, k, col, elite: !!u.elite, boss: u.kind === UnitKind.Boss }, this.scene.time.now, Math.min(0.1, this.scene.game.loop.delta / 1000));
    }
    this.placeZones(mounted, showBar, barX, barY, barW);

    // обозначения бафов и дебафов (задача 129): набор ключей приходит с сервера в u.fx, рисует UnitAuras; значки — над подписью, по её середине.
    // Низ значков — на 1 px выше верха того, что подписано на самом деле (ник, титул, рамка — с подъёмом ника под курсором), без подписи — на 2 px выше полоски.
    // Всё считается от целых координат подписи (а не от дробного top): зазор до ника не дрожит, пока герой идёт.
    if (afx.ready && !this.npc) {
      countHero(this);
      if (u.fx || this.afxView || (u.mount && this.mountDust)) {
        const shown = Math.min(showName ? nameY - lh : Infinity, framed ? frameTop : Infinity, titleOn ? titleY - Math.round(this.titleText.height) : Infinity);
        (this.afxView ??= new UnitAuras(this)).update(lx, (shown < Infinity ? shown : Math.round(top - 2) - 1) - 1);
      }
    }
  }

  /** Насколько шлем (рога, гребень, пламя) выше головы: имя и полоска поднимаются над ним. */
  private gearTop(): number {
    if (!this.layered() || !this.u.gear) return 0;
    const parts = parseGear(this.u.gear), h = parts[0], cl = LEGENDARIES[parts[4].leg];
    // знамя легендарного плаща (и знаменосца бойцов, ярус 3) выше головы: подпись поднимается над навершием (высота растёт с ярусом)
    const ti = cl?.look.back === "banner" ? cl.ti : this.heraldOf()?.banner ? 3 : -1;
    const banner = ti >= 0 ? 12 + ti * 2 + (ti >= 3 ? 2 : 0) : 0;
    return Math.max(banner, h.r < 0 ? 0 : h.leg ? 12 : h.r >= 2 ? 6 : 0);
  }

  /** Баффы кругом под ногами цвета эффекта (без свечения на теле): боевой клич, ускорение, ярость. */
  private buffRings(mask: number) {
    if (!mask) { if (this.buffGfx) this.buffGfx.setVisible(false); this.buffMask = 0; return; }
    this.buffGfx ??= this.scene.add.graphics().setDepth(DEPTH.ground + 7);
    const g = this.buffGfx;
    if (mask !== this.buffMask) {
      this.buffMask = mask;
      g.clear();
      const k = this.frame > 32 ? 2 : 1;
      for (const [flag, col, rx] of [[BUFF_WARCRY, 0xff6a3a, 17], [BUFF_HASTE, 0xc0f050, 14], [BUFF_ENRAGE, 0xff3a1a, 20]]) {
        if (!(mask & flag)) continue;
        g.fillStyle(col, 0.16).fillEllipse(0, 0, rx * 2 * k, rx * k);
        g.lineStyle(1, col, 0.9).strokeEllipse(0, 0, rx * 2 * k, rx * k);
      }
    }
    g.setVisible(this.sprite.alpha > 0).setPosition(Math.round(this.x), Math.round(this.y) - 1);
  }

  /** Рамка вокруг ника (элита, ранг арены) от fy до fb по вертикали (границы заданы в update по заглавным буквам ника).
   *  По горизонтали — ровно по блоку ника с полями по 3 px слева и справа. Линия рамки в 1 px лежит на пикселях, а не на их границе;
   *  усики по бокам — по середине высоты (у нечётной рамки 3 px, у чётной 2). */
  private nameFrame(left: number, fy: number, fb: number, c: number) {
    const w = this.label.width + 6, h = fb - fy;
    const fx = left - 3;
    const g = this.frameGfx;
    g.fillStyle(WELL, 0.55).fillRoundedRect(fx, fy, w, h, 3);
    g.lineStyle(1, c, 1).strokeRoundedRect(fx + 0.5, fy + 0.5, w - 1, h - 1, 3);
    const nh = h % 2 ? 3 : 2, ny = fy + (h - nh) / 2;
    g.fillStyle(c, 1).fillRect(fx - 2, ny, 2, nh).fillRect(fx + w, ny, 2, nh);
  }

  /** Значок щита слева от имени: цвет города (красный, бирюзовый, синий) со стальной каймой; cy — середина заглавных букв ника.
   *  Щит с каймой занимает строки by-1..by+10 (середина by+5); полпикселя при нечётной разнице уходит вниз: остриё щита лёгкое, его масса выше середины. */
  private guardBadge(left: number, cy: number) {
    // боец фракции — цвета её герба (data/npc-gear.json heraldry.badge), стража Эмберхолла — красный
    const hb = this.u.kind === UnitKind.Soldier ? HERALDRY[this.u.faction]?.badge : undefined;
    const c = hb ? hex(hb.field) : 0xd02a34;
    const bx = left - 9, by = Math.round(cy - 5);
    const g = this.frameGfx;
    g.fillStyle(WELL, 0.9).fillRect(bx - 1, by - 1, 9, 11).fillRect(bx, by + 9, 7, 1).fillRect(bx + 1, by + 10, 5, 1);
    g.fillStyle(0xaab4c4, 1).fillRect(bx, by, 7, 8).fillRect(bx + 1, by + 8, 5, 1).fillRect(bx + 2, by + 9, 3, 1);
    g.fillStyle(c, 1).fillRect(bx + 1, by + 1, 5, 7).fillRect(bx + 2, by + 8, 3, 1);
    g.fillStyle(hb ? hex(hb.mark) : 0xffe08a, 1).fillRect(bx + 3, by + 2, 1, 5).fillRect(bx + 2, by + 3, 3, 1);
  }

  /** Знамя знаменосца из листа vfx (стража Эмберхолла): подток на земле у руки без факела, полотнище колышется циклом листа;
   *  спереди и сбоку — перед телом, со спины — за ним. */
  private bearerFlag(sheet: string, alpha: number) {
    if (!sheet || !this.scene.anims.exists(`vfx_${sheet}`)) { this.bearer?.setVisible(false); this.bearerGlow?.setVisible(false); return; }
    if (!this.bearer) {
      const e = (this.scene.cache.json.get("vfxm") ?? {})[sheet] as { anchor: [number, number]; frames: number } | undefined;
      this.bearer = this.scene.add.sprite(0, 0, `vfx_${sheet}`).setOrigin(e?.anchor[0] ?? 0.5, e?.anchor[1] ?? 1);
      this.bearer.play({ key: `vfx_${sheet}`, repeat: -1, startFrame: this.seed % (e?.frames ?? 1) });
    }
    const d = this.u.dir, side = d === Dir.Left || d === Dir.Right;
    // факел — в правой руке (UnitView.torch: +8, со спины −7), знамя — в другой
    const dx = d === Dir.Left ? 7 : d === Dir.Up ? 7 : side ? -5 : -8;
    this.bearer.setVisible(true).setAlpha(alpha).setFlipX(d === Dir.Left).setPosition(Math.round(this.sprite.x + dx), Math.round(this.sprite.y)).setDepth(d === Dir.Up ? this.y + 0.7 : side ? this.y - 0.3 : this.y + 0.6);
    // ночью огонь жаровни-навершия светит поверх затемнения
    const night = nightLevel(Date.now());
    if (night > 0.2) {
      this.bearerGlow ??= this.scene.add.image(0, 0, "fx_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa040);
      const top = this.bearer.y - this.bearer.displayOriginY, fl = 0.85 + Math.sin(this.scene.time.now / 90 + this.seed) * 0.1;
      this.bearerGlow.setVisible(true).setPosition(this.bearer.x, top + 8).setDepth(DEPTH.top - 12).setScale(1.2 * fl).setAlpha(Math.min(1, night * 1.4) * 0.6 * alpha);
    } else this.bearerGlow?.setVisible(false);
  }

  /** Факел в руке: ночью с мерцающим светом (ADD), днём прячется. */
  private torch(on: boolean) {
    if (!on) { this.torchGfx?.setVisible(false); this.torchGlow?.setVisible(false); return; }
    // пламя по фракции бойца (data/npc-gear.json heraldry.torch): у Умбрата — мертвенное, у Сольгарда и стражи Эмберхолла — живой огонь
    const T = (this.u.kind === UnitKind.Soldier ? HERALDRY[this.u.faction]?.torch : undefined) ?? { flame: "#ff7a1a", core: "#ffd860", glow: "#ffd080" };
    this.torchGfx ??= this.scene.add.graphics();
    this.torchGlow ??= this.scene.add.image(0, 0, "fx_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(hex(T.glow));
    const dx = this.u.dir === Dir.Left ? -8 : this.u.dir === Dir.Up ? -7 : 8;
    const hx = Math.round(this.x + dx), hy = Math.round(this.y - 13);
    const t = this.scene.time.now, fl = 0.75 + Math.sin(t / 70 + this.x) * 0.12 + Math.sin(t / 130) * 0.1 + Math.random() * 0.06;
    const g = this.torchGfx;
    g.setVisible(true).setDepth(this.y + 1).clear();
    g.fillStyle(0x4a2a10, 1).fillRect(hx, hy - 1, 2, 6);
    g.fillStyle(hex(T.flame), 1).fillRect(hx - 1, hy - 4, 4, 3);
    g.fillStyle(hex(T.core), 1).fillRect(hx, hy - 5 + (fl > 0.8 ? 0 : 1), 2, 3);
    this.torchGlow.setVisible(true).setPosition(hx + 1, hy - 3).setDepth(DEPTH.top - 12).setScale(2.2 * fl).setAlpha(0.55 * fl);
  }

  /** Расстояние от курсора до зоны юнита (0 — в зоне) или Infinity (мёртвый — всегда мимо); итог для порядка — в this.hit. Зона — силуэт кадра
   *  (всадник с маунтом) с запасом reach в пикселях мира (допуск или магнит, castResolve.pickReach), плашка ника и полоски, а при trail — след бегущего
   *  за TRAIL_MS (game/hit.ts). Без запаса — ровно по телу, плашке и следу. whole = false — всадник без маунта (свой герой). */
  hitTest(wx: number, wy: number, reach = 0, trail = true, whole = true): number {
    if (this.dead) { this.hit.d = Infinity; this.hit.exact = false; return Infinity; }
    let tdx = 0, tdy = 0;
    if (trail && this.trail.past(this.scene.time.now, TRAIL_MS, this.trailPt)) { tdx = this.trailPt.x - this.x; tdy = this.trailPt.y - this.y; }
    return hitUnit(this.hit, whole ? this.body : this.rider, this.plate, this.y, tdx, tdy, wx, wy, reach);
  }
  /** Зоны клика (задача 134, шаг 2; game/hit.ts), ставит update: body — силуэт кадра (всадник — с маунтом), plate — видимые ник, титул и полоска HP. */
  readonly body: Box = emptyBox({ x0: 0, y0: 0, x1: 0, y1: 0 });
  /** Только кадр героя без маунта: свой всадник кликается по себе, иначе конь вокруг героя в центре экрана съел бы клик-шаг. */
  readonly rider: Box = emptyBox({ x0: 0, y0: 0, x1: 0, y1: 0 });
  readonly plate: Box = emptyBox({ x0: 0, y0: 0, x1: 0, y1: 0 });
  /** Итог последнего hitTest: точное ли попадание, глубина, расстояние до центра — для порядка при наложении (hit.PickBest). */
  readonly hit: Hit = { d: Infinity, exact: false, depth: 0, center: Infinity };
  private trail = new Trail();
  private trailPt = { x: 0, y: 0 };
  private tmpBox: Box = emptyBox({ x0: 0, y0: 0, x1: 0, y1: 0 });
  /** Зоны клика по тому, что нарисовано в этом кадре. */
  private placeZones(mounted: boolean, showBar: boolean, barX: number, barY: number, barW: number) {
    const sp = this.sprite;
    silhouette(this.body, sp.x, sp.y, this.frame, this.u.kind === UnitKind.Pet ? 0.8 : 1);
    const r = this.rider;
    r.x0 = this.body.x0; r.y0 = this.body.y0; r.x1 = this.body.x1; r.y1 = this.body.y1;
    // маунт — по непрозрачным пикселям текущего кадра (задний и передний слой): конь анфас узкий, сбоку длинный
    if (mounted && this.mountSpr && this.mountFront) {
      unionBox(this.body, spriteAlphaBox(this.mountSpr, this.tmpBox));
      unionBox(this.body, spriteAlphaBox(this.mountFront, this.tmpBox));
    }
    const p = this.plate;
    emptyBox(p);
    const t = this.tmpBox;
    if (this.label.visible) { t.x0 = this.label.x; t.x1 = this.label.x + this.label.width; t.y0 = this.label.y - this.label.height; t.y1 = this.label.y; unionBox(p, t); }
    if (this.titleText.visible && this.titleText.text) { t.x0 = this.titleText.x; t.x1 = this.titleText.x + this.titleText.width; t.y0 = this.titleText.y - this.titleText.height; t.y1 = this.titleText.y; unionBox(p, t); }
    if (showBar) { t.x0 = barX - 1; t.x1 = barX + barW + 1; t.y0 = barY - 1; t.y1 = barY + 3; unionBox(p, t); }
  }

  /** Тень по кадрам тела и маунта; основание — точка юнита на земле. */
  private syncDynShadow() {
    if (!this.dyn) this.dyn = new Shadow(this.scene, this.x, this.y, 1.35);
    const bx = Math.round(this.x), by = Math.round(this.y);
    this.dyn.box.setPosition(bx, by).setVisible(!this.dead && this.sprite.visible);
    this.dyn.mirror(0, this.sprite, this.sprite.x - bx, this.sprite.y - by);
    const m = this.mountSpr;
    if (m && m.visible) this.dyn.mirror(1, m, m.x - bx, m.y - by);
    else if (this.dyn.imgs[1]) this.dyn.imgs[1].setVisible(false);
  }

  destroy() {
    this.dyn?.destroy();
    if (zbViews.delete(this)) zbFx?.drop(this);
    this.sprite.destroy();
    this.mountSpr?.destroy();
    this.mountFront?.destroy();
    this.shadow.destroy();
    this.label.destroy();
    this.bar.destroy();
    this.ring.destroy();
    this.aura?.destroy();
    this.stun?.destroy();
    this.flashSpr?.destroy();
    this.titleText.destroy();
    this.frameGfx.destroy();
    this.torchGfx?.destroy();
    this.torchGlow?.destroy();
    this.buffGfx?.destroy();
    this.layers?.destroy();
    this.bearer?.destroy();
    this.bearerGlow?.destroy();
    this.afxView?.destroy();
  }
}
