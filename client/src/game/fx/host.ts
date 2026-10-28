/**
 * Хозяин вау-эффектов в игре: создаёт модули по флагам data/wow-fx.json, кормит их данными сцены (камера, герой, зона, ночь, дождь, юниты)
 * и принимает события (урон, смерть, золото, телепорт, подземелье). В GameScene — несколько строк: создание, update, locked.
 * Режим «Простые» (vfxMode): без птиц, теней облаков, тряпок на Rope и линзы перехода; цифры, следы и подлёт добычи остаются.
 */
import Phaser from "phaser";
import { T, Zone, type WorldMap } from "../../../../shared/map";
import { weatherAt } from "../../../../shared/weather";
import { UnitKind, type Fx } from "../../../../shared/protocol";
import { ZB_BY_ID } from "../../../../shared/zoneBosses";
import { vfxMode } from "../postfx";
import { DEPTH } from "../terrain";
import type { UnitView } from "../UnitView";
import * as sfx from "../sfx";
import { wowCfg, wowOn } from "./config";
import { Birds, type Species } from "./birds";
import { DmgNumbers, DMG_TEXT_OK } from "./dmgFont";
import { BossIntro } from "./bossIntro";
import { warpIn, warpOut, warpClear, warpFrame } from "./portalWarp";
import { CloudShadows } from "./cloudShadows";
import { Decals } from "./decals";
import { RopeCloth, chainTexture } from "./ropeCloth";
import { PickupFly } from "./pickupFly";
import { wowHooks } from "./hooks";

const RAVEN_ZONES = new Set<number>([Zone.Ashlands, Zone.Swamp, Zone.Barrows, Zone.UmbrathCity, Zone.FortUmbrath, Zone.Volcano, Zone.Forest]);
const SHUT = new Set<number>([Zone.Dungeon, Zone.Arena]);
const ROOF = /house|shop|temple|hall|inn|tavern|smith|chapel|barracks|keep/;
const BOSS_COL: Record<string, number> = { sol: 0xffd27a, umb: 0xb48aff, plg: 0x8adf6a, bel: 0x7ac8ff };
let pendingWarpIn = false;

export interface HostOpts {
  units: () => Map<string, UnitView>;
  selfId: string;
  map: WorldMap;
  /** позиция героя (ноги) */
  hero: () => { x: number; y: number };
  /** за кем камера снова едет после вступления босса */
  followTarget: () => Phaser.GameObjects.GameObject | undefined;
}

export class WowHost {
  locked = false;
  private birds?: Birds; private clouds?: CloudShadows; private ropes?: RopeCloth;
  private nums?: DmgNumbers; private decals?: Decals; private pick?: PickupFly;
  private intro?: BossIntro; private seen = new Set<string>();
  private zone = Zone.Town; private indoor = false; private night = 0;
  private lastDeath = { x: 0, y: 0, t: -1e9 };
  private scanAcc = 0; private bossAcc = 0; private last = { x: NaN, y: 0 }; private foot = 0; private walked = 0;
  private bloodAt = new Map<string, number>();
  private sndAt = 0;
  private warpGuard?: Phaser.Time.TimerEvent;
  private chains: { rope: Phaser.GameObjects.Rope; id: string; dx: number; dy: number; len: number }[] = [];

  constructor(private scene: Phaser.Scene, private o: HostOpts) {
    if (wowOn("dmgFont")) this.nums = new DmgNumbers(scene, DEPTH.top - 10);
    if (wowOn("decals")) this.decals = new Decals(scene, { depth: DEPTH.ground + 1 });
    if (wowOn("pickupFly")) {
      this.pick = new PickupFly(scene, () => { const h = o.hero(); return { x: h.x, y: h.y }; }, DEPTH.top - 20, (kind) => { const t = scene.time.now; if (t - this.sndAt > 90) { this.sndAt = t; sfx.play(kind === "coin" ? "clink" : "arcane", kind === "coin" ? 0.5 : 0.25); } });
      wowHooks.death = (v) => this.onDeath(v);
    }
    if (pendingWarpIn) { pendingWarpIn = false; if (wowOn("portalWarp") && vfxMode() === "full") warpIn(scene, { color: 0xc4a4ff, color2: 0x8fd0ff }); }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Раз в кадр, после погоды и света. dt — мс. */
  update(dt: number, ctx: { zone: Zone; indoor: boolean; night: number }) {
    this.zone = ctx.zone; this.indoor = ctx.indoor; this.night = ctx.night;
    const cam = this.scene.cameras.main, full = vfxMode() === "full", s = this.scene;
    const open = !ctx.indoor && !SHUT.has(ctx.zone);
    // ленивое создание и снятие тяжёлых модулей при смене режима
    if (wowOn("birds") && full && !this.birds) this.birds = new Birds(s, { roofs: () => this.roofs(), isDay: () => this.night < 0.35 && open, scare: () => { const h = this.o.hero(); return { x: h.x, y: h.y - 8 }; }, view: () => ({ x: cam.worldView.x, y: cam.worldView.y, w: cam.worldView.width, h: cam.worldView.height }), species: () => this.species(), auto: true, depth: DEPTH.top - 60, shadowDepth: DEPTH.ground + 3 });
    if ((!wowOn("birds") || !full) && this.birds) { this.birds.destroy(); this.birds = undefined; }
    if (wowOn("cloudShadows") && full && !this.clouds) this.clouds = new CloudShadows(s, { view: () => ({ x: cam.worldView.x, y: cam.worldView.y, w: cam.worldView.width, h: cam.worldView.height }), isDay: () => 1 - this.night, isOpen: () => open, rain: () => weatherAt(Date.now()).rain, density: () => wowCfg("cloudShadows").density as "sparse" | "denser", depth: DEPTH.ground + 2 });
    if ((!wowOn("cloudShadows") || !full) && this.clouds) { this.clouds.destroy(); this.clouds = undefined; }
    if (wowOn("ropeCloth") && full && !this.ropes) this.ropes = new RopeCloth(s);
    if ((!wowOn("ropeCloth") || !full) && this.ropes) { this.ropes.destroy(); this.ropes = undefined; this.chains = []; }

    this.birds?.update(dt); this.clouds?.update(dt); this.nums?.update(dt); this.decals?.update(dt); this.pick?.update(dt);
    if (this.ropes) { this.scanAcc += dt; if (this.scanAcc > 1200) { this.scanAcc = 0; this.scanStandards(); } this.ropes.update(dt); this.followChains(); }
    this.footsteps();
    if (wowOn("bossIntro")) { this.bossAcc += dt; if (this.bossAcc > 250) { this.bossAcc = 0; this.watchBosses(); } }
  }

  // ───── события ─────
  /** Цифра урона: true — нарисована здесь (свою в Effects.number пропускаем). Только цифры и знаки: слова остаются на Text. */
  number(x: number, y: number, text: string, color: string, big: boolean, mul: number, small: boolean, dim: number, dx: number, dy: number, arc: number): boolean {
    if (!this.nums || !DMG_TEXT_OK.test(text)) return false;
    this.nums.add(x, y, text, parseInt(color.slice(1), 16), big, { mul, small, dim, dx, dy, arc });
    return true;
  }
  onDmg(f: Extract<Fx, { t: "dmg" }>, u: UnitView) {
    if (!this.decals || f.heal || f.miss || f.imm || f.abs || u.dead) return;
    if (u.u.kind !== UnitKind.Mob && u.u.kind !== UnitKind.Boss && u.u.kind !== UnitKind.Player) return;
    const now = this.scene.time.now, last = this.bloodAt.get(f.id) ?? -1e9;
    if (now - last < 90) return;
    this.bloodAt.set(f.id, now); if (this.bloodAt.size > 120) this.bloodAt.clear();
    const k = f.k ?? "phys", big = !!f.crit || f.v > 0.1 * u.u.maxHp;
    const jx = (Math.random() - 0.5) * 14, jy = (Math.random() - 0.3) * 8;
    if (k === "fire") { if (Math.random() < (f.crit ? 0.8 : 0.3)) this.decals.add("scorch", u.x + jx, u.y + jy, 0, now, 0.8 + Math.random() * 0.5); }
    else if (k === "phys" || k === "blood") { if (Math.random() < (big ? 1 : 0.45)) { this.decals.add("blood", u.x + jx, u.y + jy, 0, now, big ? 1.25 : 0.85 + Math.random() * 0.3); if (big && Math.random() < 0.6) this.decals.add("blood", u.x - jx, u.y + 4 + jy, 0, now, 0.8); } }
  }
  private onDeath(v: { x: number; y: number; u: { kind: number; elite: number } }) {
    const h = this.o.hero();
    if (Math.hypot(v.x - h.x, v.y - h.y) > 320 || (v.u.kind !== UnitKind.Mob && v.u.kind !== UnitKind.Boss)) return;
    this.lastDeath = { x: v.x, y: v.y, t: this.scene.time.now };
    this.pick?.souls(v.x, v.y - 14, v.u.kind === UnitKind.Boss ? 10 : v.u.elite ? 6 : 3);
    this.decals?.add("blood", v.x, v.y + 2, 0, this.scene.time.now, 1.4);
  }
  /** Золото героя выросло на n: монеты летят от последнего убитого рядом (если он был недавно). */
  gold(n: number) {
    if (!this.pick || this.scene.time.now - this.lastDeath.t > 4000) return;
    this.pick.gold(this.lastDeath.x, this.lastDeath.y - 10, Math.max(2, Math.min(9, 2 + Math.floor(Math.log10(n + 1) * 2.5))));
    this.lastDeath.t = -1e9;
  }
  /** Телепорт героя: на go экран схлопывается, на arrive раскрывается (страховка 1,6 с). */
  tp(f: Extract<Fx, { t: "tp" }>) {
    if ((window as unknown as { __wowDbg?: boolean }).__wowDbg) console.log("[wow] tp", f.ph, f.id === this.o.selfId, wowOn("portalWarp"), vfxMode());
    if (!wowOn("portalWarp") || vfxMode() !== "full" || f.id !== this.o.selfId) return;
    const o = { color: 0x8fd0ff, color2: 0xc4a4ff };
    if (f.ph === "go") { warpOut(this.scene, undefined, o); this.warpGuard?.remove(); this.warpGuard = this.scene.time.delayedCall(wowCfg("portalWarp").outMs + 1200, () => warpIn(this.scene, o)); }
    else if (f.ph === "arrive") { this.warpGuard?.remove(); warpIn(this.scene, o); }
    else if (f.ph === "cancel") { this.warpGuard?.remove(); warpClear(this.scene); }
  }
  /** Для проверки вручную: застывший кадр перехода k 0..1 (k < 0 — снять). */
  debugWarp(k: number) { if (k < 0) warpClear(this.scene); else warpFrame(this.scene, k); }
  /** Вход в подземелье и выход: линза до закрытия экрана, раскрытие в новой сцене. */
  dungeonFade(ms: number) {
    if (!wowOn("portalWarp") || vfxMode() !== "full") return;
    warpOut(this.scene, undefined, { color: 0xc4a4ff, color2: 0x8fd0ff, ms: Math.max(300, ms) });
    pendingWarpIn = true;
  }

  // ───── внутреннее ─────
  private species(): Species { return RAVEN_ZONES.has(this.zone) ? "raven" : "gull"; }
  private roofs() {
    const v = this.scene.cameras.main.worldView, out: { x: number; y: number }[] = [];
    for (const o of this.o.map.objects) {
      if (o.x < v.x - 80 || o.x > v.right + 80 || o.y < v.y - 40 || o.y > v.bottom + 120) continue;
      if (ROOF.test(o.kind)) out.push({ x: o.x, y: o.y - 46 }); // конёк ≈ 46 px над основанием
    }
    return out;
  }
  private scanStandards() {
    const v = this.scene.cameras.main.worldView, r = this.ropes!;
    for (const ch of this.scene.children.list) {
      const sp = ch as Phaser.GameObjects.Sprite;
      if (sp.type !== "Sprite" || !sp.texture || !/^vfx_std-(pennant|drape)/.test(sp.texture.key) || r.has(sp)) continue;
      if (sp.x < v.x - 200 || sp.x > v.right + 200 || sp.y < v.y - 200 || sp.y > v.bottom + 200) continue;
      r.mirror(sp);
    }
    this.scanChains();
  }
  /** Терновые цепи Гнашеры (umb_plague_priestess): четыре Rope-цепи свисают с рук босса и качаются на общем ветру. */
  private scanChains() {
    const r = this.ropes!, links = 6;
    chainTexture(this.scene, "wow_gn_chain", links, true);
    for (const [id, v] of this.o.units()) {
      if (v.u.sprite !== "umb_plague_priestess" || v.dead || this.chains.some((c) => c.id === id)) continue;
      [[-19, -34], [-9, -28], [9, -28], [19, -34]].forEach(([dx, dy]) => this.chains.push({ rope: r.chain(v.x + dx, v.y + dy, "wow_gn_chain", links, { amp: 4, depth: 0 }), id, dx, dy, len: links * 4 }));
    }
  }
  private followChains() {
    const units = this.o.units();
    for (let i = this.chains.length - 1; i >= 0; i--) {
      const c = this.chains[i], v = units.get(c.id);
      if (!v || v.dead || !v.sprite.active) { c.rope.setVisible(false); if (!v || !units.has(c.id)) { c.rope.destroy(); this.chains.splice(i, 1); } continue; }
      c.rope.setVisible(true).setPosition(Math.round(v.x + c.dx), Math.round(v.y + c.dy + c.len / 2)).setDepth(v.sprite.depth + 1);
    }
  }
  /** Для проверки вручную: цепи на героя (__wow.debugChains()). */
  debugChains() {
    const me = this.o.units().get(this.o.selfId); if (!me || !this.ropes) return;
    chainTexture(this.scene, "wow_gn_chain", 6, true);
    [-19, -9, 9, 19].forEach((dx) => this.ropes!.chain(me.x + dx, me.y - 34, "wow_gn_chain", 6, { amp: 4, depth: me.sprite.depth + 1 }));
  }

  private footsteps() {
    if (!this.decals || this.indoor) return;
    const h = this.o.hero();
    if (Number.isNaN(this.last.x)) { this.last = { x: h.x, y: h.y }; return; }
    const dx = h.x - this.last.x, dy = h.y - this.last.y, d = Math.hypot(dx, dy);
    if (d > 60) { this.last = { x: h.x, y: h.y }; return; }
    this.walked += d; this.last = { x: h.x, y: h.y };
    if (this.walked < 13) return;
    this.walked = 0;
    const m = this.o.map, tx = Math.floor(h.x / 32), ty = Math.floor(h.y / 32);
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return;
    const t = m.vtx[ty * (m.w + 1) + tx], surf = t === T.Snow || t === T.Ice ? "snow" : t === T.Sand || t === T.Dune ? "sand" : null;
    if (!surf) return;
    const me = this.o.units().get(this.o.selfId), mounted = !!me?.u.mount, n = Math.hypot(dx, dy) || 1;
    this.decals.step(surf, h.x, h.y - 1, dx / n, dy / n, this.foot++, mounted);
  }
  private watchBosses() {
    if (this.intro?.active || this.indoor) return;
    const h = this.o.hero(), me = this.o.units().get(this.o.selfId);
    if (!me || me.dead) return;
    for (const [id, v] of this.o.units()) {
      const card = ZB_BY_ID[v.u.sprite];
      if (!card || v.dead || this.seen.has(id) || Math.hypot(v.x - h.x, v.y - h.y) > 300) continue;
      this.seen.add(id);
      this.startIntro(v.x, v.y, v.u.name || card.name || "", v.u.title || card.title || "", BOSS_COL[v.u.sprite.slice(0, 3)] ?? 0xe0a050, () => { v.flash(); }, v.u.sprite.startsWith("sol") ? "sol" : v.u.sprite.startsWith("umb") ? "umb" : "none");
      return;
    }
  }
  /** Запуск вступления (и для проверки вручную: __wow.startIntro). */
  startIntro(x: number, y: number, name: string, title: string, col: number, gesture?: () => void, crest: "sol" | "umb" | "none" = "none") {
    if (this.intro?.active) return;
    this.intro = new BossIntro(this.scene, { boss: { x, y }, name, title, kicker: "Босс кольца", crest, color: col, followTarget: this.o.followTarget(), followOffY: 12, onLock: (l) => { this.locked = l; }, onGesture: () => { gesture?.(); sfx.play("gong", 0.8); } }).play();
  }
  destroy() {
    this.birds?.destroy(); this.clouds?.destroy(); this.ropes?.destroy(); this.nums?.destroy(); this.decals?.destroy(); this.pick?.destroy();
    this.birds = this.clouds = this.ropes = undefined; this.chains = []; if (wowHooks.death) wowHooks.death = undefined; this.locked = false;
  }
}
