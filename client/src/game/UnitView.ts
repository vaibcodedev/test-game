/** Отображение одного юнита: спрайт с анимациями, тень, имя, полоска здоровья, эффекты состояния. */
import Phaser from "phaser";
import { overlay } from "./overlay";
import { BUFF_BLEED, BUFF_CURSE, BUFF_STEALTH, BUFF_BURN, BUFF_ENRAGE, BUFF_HASTE, BUFF_POISON, BUFF_ROOT, BUFF_SLOW, BUFF_STUN, BUFF_WARCRY, Anim, Dir, UnitKind } from "../../../shared/protocol";
import { net, type UnitState } from "../net";
import { bodyDist } from "./castResolve";
import { rankById } from "../../../shared/arena";
import { DEPTH } from "./terrain";
import { nightLevel } from "../../../shared/daynight";
import type { MountMeta } from "../../../shared/mounts";
import { FOE_COLOR, factionColor } from "../../../shared/factions";
import { P } from "../../../shared/palette";
import { GearLayers, parseGear } from "./GearLayers";
import { LEGENDARIES } from "../../../shared/legendary";
import { capBand, placeText, worldText } from "./worldText";

/** Любой объект сцены с позицией и глубиной: спрайт вспышки, эллипс щита или круга (UnitView.attach). */
export type Attachable = { setPosition(x: number, y: number): unknown; setDepth(value: number): unknown };

/** Тёмная подложка рамок и щита — цвет «колодца» из палитры. */
const WELL = Phaser.Display.Color.HexStringToColor(P.well).color;
/** Кольцо под ногами у выбранного и у наведённого: враг — красное (P.foe), союзник — зелёное (P.ally). */
export const RING_FOE = Phaser.Display.Color.HexStringToColor(P.foe).color;
export const RING_ALLY = Phaser.Display.Color.HexStringToColor(P.ally).color;
const MELEE = new Set(["guard", "guard_desert", "guard_snow", "pet_wolf", "pet_turtle", "warrior", "deathknight", "reaver", "goblin", "skeleton", "skeleton_knight", "wolf", "boar", "spider", "drowned", "golem", "ent", "ashlord"]);
const rowOf = (dir: number) => (dir === Dir.Down ? 0 : dir === Dir.Up ? 1 : 2);
/** Вспышка от удара: белая копия кадра поверх тела с этой прозрачностью гаснет за FLASH_MS и повторяется не чаще FLASH_GAP —
 *  рисунок виден сквозь неё, и под градом ударов в рейде босс не белеет целиком. */
const FLASH_MS = 90, FLASH_GAP = 250, FLASH_ALPHA = 0.5;

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
  private shadowMounted = false;
  private dustAt = 0;
  /** Факел стражника ночью: пламя и мерцающее свечение. */
  private torchGfx?: Phaser.GameObjects.Graphics;
  private torchGlow?: Phaser.GameObjects.Image;
  /** Круг под ногами для бафов (боевой клич, ускорение, ярость): перерисовывается только при смене набора. */
  private buffGfx?: Phaser.GameObjects.Graphics;
  private buffMask = 0;
  private layers?: GearLayers;
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
  /** Ширина блока подписи для проверки перекрытий. */
  blockW(): number {
    const own = !this.nameHover;
    return Math.max(own && this.label.visible ? this.label.width : 0, own && this.titleText.visible ? this.titleText.width : 0, this.frame > 32 ? 44 : 20);
  }
  /** Высота блока подписи для проверки перекрытий: от верхнего края титула (или ника) до низа полоски здоровья. */
  blockH(): number {
    return this.blockUp + 3;
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
    this.sid = u.kind === UnitKind.Player && scene.textures.exists(`u_nude_${u.sprite}`) ? `nude_${u.sprite}` : u.sprite;
    const tex = scene.textures.exists(`u_${this.sid}`) ? `u_${this.sid}` : "u_slime";
    this.frame = scene.textures.get(tex).get(0).width;
    const big = this.frame > 32;
    if (this.frame >= 96) this.nameRise = 0.9 * this.frame;
    this.shadow = scene.add.image(u.x, u.y, "fx_shadow_blob").setScale(big ? 2.2 : 1, big ? 2 : 1).setDepth(DEPTH.ground + 5);
    // кольцо выбора и наведения лежит над кругами бафов и щитов (DEPTH.ground + 7): те почти того же размера и цвета и скрыли бы его
    this.ring = scene.add.image(u.x, u.y, "fx_target").setVisible(false).setAlpha(0.7).setDepth(DEPTH.ground + 7.5).setScale(big ? 2 : 1);
    this.sprite = scene.add.sprite(u.x, u.y, tex, 0).setOrigin(0.5, 30 / 32);
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

  private labelText() {
    const u = this.u;
    if (u.kind === UnitKind.Mob) return `${u.name} · ${u.level}`;
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
    if (instant || !this.scene.anims.exists(key)) this.sprite.setFrame(row * 12 + 11);
    else this.sprite.play(key);
    this.sprite.setFlipX(this.u.dir === Dir.Left);
    this.label.setVisible(false);
    this.bar.clear();
    this.scene.tweens.add({ targets: [this.sprite, this.shadow], alpha: this.u.kind === UnitKind.Player ? 0.75 : 0.55, duration: 600, delay: 400 });
  }

  /** Вызывается каждый кадр; px/py — позиция для отрисовки (у своего игрока — предсказанная). */
  private wasStealth = false;
  /** Невидимый для меня скрытный игрок: его нельзя выбрать в меню ПКМ (иначе меню выдаст ник и позицию). */
  unseen = false;
  update(dt: number, px?: number, py?: number) {
    const u = this.u;
    if (px !== undefined && py !== undefined) {
      this.x = px;
      this.y = py;
    } else {
      const dx = u.x - this.x, dy = u.y - this.y;
      if (dx * dx + dy * dy > 160 * 160) {
        this.x = u.x;
        this.y = u.y;
      } else if (this.npc) {
        // стражники и горожане шлют позицию редко (5 раз в секунду): ровное движение к ней
        const d = Math.hypot(dx, dy);
        const k = d > 0.01 ? Math.min(1, (Math.max(40, d * 5) * dt) / d) : 1;
        this.x += dx * k;
        this.y += dy * k;
      } else {
        const k = Math.min(1, dt * 12);
        this.x += dx * k;
        this.y += dy * k;
      }
    }
    // смерть и возрождение
    if (u.anim === Anim.Dead && !this.dead) this.showDead(false);
    else if (u.anim !== Anim.Dead && this.dead) {
      this.dead = false;
      this.attacking = false;
      this.x = u.x;
      this.y = u.y;
      // снять затухание трупа (если возродился раньше, чем оно доиграло) и кадр смерти: стойку или бег поставит код ниже
      this.scene.tweens.killTweensOf([this.sprite, this.shadow]);
      this.sprite.stop();
      this.sprite.setFrame(rowOf(u.dir) * 12);
      this.sprite.setAlpha(0);
      this.shadow.setAlpha(1);
      this.label.setVisible(true);
      this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 500 });
      this.lastAnim = -1;
      this.lastHp = -1;
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
        else {
          this.sprite.stop();
          this.sprite.setFrame(row * 12);
        }
      }
      this.lastAnim = anim;
      this.lastRow = row;
    }

    // позиция и глубина
    const bob = !this.dead && anim === Anim.Idle && !u.mount && !this.attacking ? Math.round(Math.sin(this.scene.time.now / 380 + this.x) * 0.6) : 0;
    const mmeta = u.mount ? (this.scene.cache.json.get("manifest")?.mounts?.[u.mount] as MountMeta | undefined) : undefined;
    const mounted = !!mmeta && !this.dead && this.scene.textures.exists(`m_${u.mount}`);
    this.mounted = mounted;
    const big0 = this.frame > 32;
    let lift = 0, riderDx = 0, riderDy = 0, hover = 0;
    if (mounted && mmeta) {
      if (!this.mountSpr || this.mountId !== u.mount) {
        this.mountSpr?.destroy();
        this.mountFront?.destroy();
        this.mountId = u.mount;
        const oy = mmeta.gy / mmeta.frame;
        this.mountSpr = this.scene.add.sprite(this.x, this.y, `m_${u.mount}`, 0).setOrigin(0.5, oy);
        this.mountFront = this.scene.add.sprite(this.x, this.y, `m_${u.mount}`, 0).setOrigin(0.5, oy);
      }
      const ms = this.mountSpr, mf = this.mountFront!;
      const moving = u.anim === Anim.Walk;
      const flip = u.dir === Dir.Left;
      const kind = moving ? "run" : "idle";
      const kb = `m_${u.mount}-${kind}-${row}`;
      if (ms.anims.currentAnim?.key !== kb) {
        const t = ms.anims.currentAnim && moving ? ms.anims.getProgress() : 0;
        ms.play(kb);
        mf.play(`m_${u.mount}-${kind}-${row + 3}`);
        if (t) { ms.anims.setProgress(t); mf.anims.setProgress(t); }
      }
      const col = (Number(ms.frame.name) || 0) % 12;
      const seat = mmeta.seat[row]?.[col] ?? [0, -30];
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
      if (moving && !mmeta.fly && this.scene.time.now > this.dustAt) {
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
    const left = lx - Math.round(this.label.width / 2);
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
    const nameOn = !this.dead && !this.unseen && (this.isSelf ? overlay.selfNames : overlay.names) && (this.isSelf || this.nameOk);
    this.nameHover = hov && !nameOn;
    this.label.setVisible(nameOn || hov);
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
    if (u.kind === UnitKind.Guard && showName) this.guardBadge(left, (baseY + nameY - lh + this.band.cap) / 2);
    this.torch(!this.dead && u.kind === UnitKind.Guard && nightLevel(Date.now()) > 0.35);
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
    this.buffRings(this.dead ? 0 : b & (BUFF_WARCRY | BUFF_HASTE | BUFF_ENRAGE));
    if (b & BUFF_STUN && !this.dead) {
      this.stun ??= worldText(this.scene, 0, 0, "✦ ✦", "name", { fontSize: "8px", fontStyle: "", color: "#fff070" }).setDepth(DEPTH.top - 4);
      placeText(this.stun.setVisible(true), this.x + Math.sin(this.scene.time.now / 120) * 3, top - 14, 0.5, 0.5);
    } else this.stun?.setVisible(false);

    // снаряжение в скрытности видят те же, кто видит героя (сам, союзники по команде), так же полупрозрачно; для остальных его нет, как и героя
    const gearOn = u.kind === UnitKind.Player && !this.dead && !(stealthy && this.unseen) && this.frame === 32;
    if (gearOn) {
      if (!this.layers) { this.layers = new GearLayers(this.scene); for (let k = 0; k < this.id.length; k++) this.seed = (this.seed * 31 + this.id.charCodeAt(k)) % 97; }
      const row = rowOf(u.dir), fr = Number(this.sprite.frame.name) || 0;
      this.layers.setDepth(this.y);
      this.layers.setAlpha(stealthy ? this.sprite.alpha : 1);
      this.layers.draw({ cls: u.sprite, faction: u.faction, gear: u.gear, weapon: u.weapon, view: row, flip: u.dir === Dir.Left, col: row * 12 <= fr ? fr % 12 : 0, ox: this.sprite.x - 16, oy: this.sprite.y - 30, t: this.scene.time.now, seed: this.seed, sid: this.id, self: this.isSelf });
    } else this.layers?.hide();

    // полоска здоровья: у мобов только раненых или выбранных (боссы — всегда), тонкая, 2 px; под курсором — у любого существа, даже при выключенных «Полоски»
    const mobHidden = (u.kind === UnitKind.Mob || u.kind === UnitKind.Pet) && u.hp >= u.maxHp && !this.selected && !hov;
    const showBar = ((this.isSelf ? overlay.selfBars : overlay.bars) || hov) && !this.dead && !this.npc && !mobHidden && (u.kind !== UnitKind.Player || u.hp < u.maxHp || this.isSelf || hov);
    if (!showBar) this.bar.clear();
    else {
      this.lastHp = u.hp;
      const w = (this.frame > 32 ? 40 : 20) + (u.elite ? 8 : 0);
      const bx = Math.round(lx - w / 2), by = Math.round(top - 2);
      const k = Math.max(0, Math.min(1, u.hp / Math.max(1, u.maxHp)));
      this.bar.clear();
      this.bar.fillStyle(u.elite ? 0xf0c040 : 0x0a0608, 0.55).fillRect(bx - 1, by - 1, w + 2, 4);
      this.bar.fillStyle(0x0a0608, 0.9).fillRect(bx, by, w, 2);
      const foeBar = u.kind === UnitKind.Player && !this.isSelf && !!net.self && !!u.faction && u.faction !== net.self.faction && net.kind !== "arena" && net.kind !== "raid";
      const col = u.kind === UnitKind.Player ? (this.isSelf ? 0x5ad04a : foeBar ? Phaser.Display.Color.HexStringToColor(FOE_COLOR).color : 0x4ab0ff) : u.kind === UnitKind.Pet ? 0x6ad06a : k > 0.5 ? 0xd8443a : k > 0.25 ? 0xe0902a : 0xff3a2a;
      this.bar.fillStyle(col, 1).fillRect(bx, by, Math.round(w * k), 2);
    }
  }

  /** Насколько шлем (рога, гребень, пламя) выше головы: имя и полоска поднимаются над ним. */
  private gearTop(): number {
    if (this.u.kind !== UnitKind.Player || !this.u.gear) return 0;
    const parts = parseGear(this.u.gear), h = parts[0], cl = LEGENDARIES[parts[4].leg];
    // знамя легендарного плаща выше головы: подпись поднимается над навершием (высота растёт с ярусом)
    const banner = cl?.look.back === "banner" ? 12 + cl.ti * 2 + (cl.ti >= 3 ? 2 : 0) : 0;
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
    const c = this.u.sprite === "guard_desert" ? 0x2fb0a2 : this.u.sprite === "guard_snow" ? 0x4a8ae8 : 0xd02a34;
    const bx = left - 9, by = Math.round(cy - 5);
    const g = this.frameGfx;
    g.fillStyle(WELL, 0.9).fillRect(bx - 1, by - 1, 9, 11).fillRect(bx, by + 9, 7, 1).fillRect(bx + 1, by + 10, 5, 1);
    g.fillStyle(0xaab4c4, 1).fillRect(bx, by, 7, 8).fillRect(bx + 1, by + 8, 5, 1).fillRect(bx + 2, by + 9, 3, 1);
    g.fillStyle(c, 1).fillRect(bx + 1, by + 1, 5, 7).fillRect(bx + 2, by + 8, 3, 1);
    g.fillStyle(0xffe08a, 1).fillRect(bx + 3, by + 2, 1, 5).fillRect(bx + 2, by + 3, 3, 1);
  }

  /** Факел в руке: ночью с мерцающим светом (ADD), днём прячется. */
  private torch(on: boolean) {
    if (!on) { this.torchGfx?.setVisible(false); this.torchGlow?.setVisible(false); return; }
    this.torchGfx ??= this.scene.add.graphics();
    this.torchGlow ??= this.scene.add.image(0, 0, "fx_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd080);
    const dx = this.u.dir === Dir.Left ? -8 : this.u.dir === Dir.Up ? -7 : 8;
    const hx = Math.round(this.x + dx), hy = Math.round(this.y - 13);
    const t = this.scene.time.now, fl = 0.75 + Math.sin(t / 70 + this.x) * 0.12 + Math.sin(t / 130) * 0.1 + Math.random() * 0.06;
    const g = this.torchGfx;
    g.setVisible(true).setDepth(this.y + 1).clear();
    g.fillStyle(0x4a2a10, 1).fillRect(hx, hy - 1, 2, 6);
    g.fillStyle(0xff7a1a, 1).fillRect(hx - 1, hy - 4, 4, 3);
    g.fillStyle(0xffd860, 1).fillRect(hx, hy - 5 + (fl > 0.8 ? 0 : 1), 2, 3);
    this.torchGlow.setVisible(true).setPosition(hx + 1, hy - 3).setDepth(DEPTH.top - 12).setScale(2.2 * fl).setAlpha(0.55 * fl);
  }

  /** Расстояние от курсора до центра тела юнита или Infinity (мёртвый — всегда мимо). Зона — круг по телу (castResolve.bodyDist) с запасом reach
   *  в пикселях мира: допуск клика или магнит (castResolve.pickReach: пиксели экрана / масштаб CSS, «Крупные цели» ×2). Без запаса — ровно по телу. */
  hitTest(wx: number, wy: number, reach = 0): number {
    return this.dead ? Infinity : bodyDist(this.x, this.y, this.frame > 32, this.mounted, wx, wy, reach);
  }

  destroy() {
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
  }
}
