/**
 * Обозначения на юните: слоты, плавность и раскладка (задача 129, шаг 2), без браузера. Настоящий модуль client/src/game/auraFx.ts собирается esbuild
 * с заглушками Phaser, сети и глубин; сцена, спрайты и юнит — подделки с теми же вызовами. Время идёт вручную, шагами по 16 мс.
 * Проверяется то, что видно глазами: уходящее обозначение (снятое или вытесненное) доигрывает затухание в прежнем виде — бусина остаётся бусиной, круг
 * кругом, значок на своём месте, круг толпы бледным; при смене роли прежний вид гаснет, пока новый проявляется; ряд значков, подъём на стаках и число
 * предметов орбиты идут плавно; мёртвый юнит гаснет, скрытый исчезает сразу; режим толпы не мигает на границе порога; пыль маунта проявляется и гаснет
 * и идёт назад от взгляда по всем четырём направлениям; ряд значков отдаёт ширину и высоту разводке подписей. Запуск: npx tsx tests/aura-plan.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Anim, Dir, UnitKind } from "../shared/protocol";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "client/public/assets/aura-fx/manifest.json"), "utf8"));

// ---------- настоящий модуль с заглушками ----------
const STUBS: Record<string, string> = {
  phaser: "export default { Scenes: { Events: { SHUTDOWN: 'shutdown' } } };",
  net: "export const net = { kind: 'world', self: { faction: 'solgard' }, arena: null };",
  terrain: "export const DEPTH = { water: -1000, terrain: -900, walls: -800, overlay: -700, ground: -600, top: 1e6 };",
};
const out = await build({
  entryPoints: [path.join(ROOT, "client/src/game/auraFx.ts")], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /^phaser$/ }, () => ({ path: "phaser", namespace: "stub" }));
      b.onResolve({ filter: /\/(net|terrain)$/ }, (a) => (a.importer.endsWith("auraFx.ts") ? { path: a.path.split("/").pop()!, namespace: "stub" } : undefined));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js" }));
    },
  }],
});
const file = path.join(os.tmpdir(), `aura-plan-${process.pid}.mjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const mod = (await import(pathToFileURL(file).href)) as typeof import("../client/src/game/auraFx");
fs.rmSync(file, { force: true });
const { afx, initAuraFx, UnitAuras, countHero } = mod;

// ---------- подделки: спрайт, графика, сцена, юнит ----------
class Img {
  tex: string; frame: number; x = 0; y = 0; alpha = 1; scale = 1; depth = 0; visible = true; active = true; flipX = false; texture: { key: string };
  constructor(public scene: unknown, tex: string, frame: number) { this.tex = tex; this.frame = frame; this.texture = { key: tex }; ALL.push(this); }
  setOrigin() { return this; }
  setTexture(t: string, f?: number) { this.tex = t; this.texture = { key: t }; if (f !== undefined) this.frame = f; return this; }
  setFrame(f: number) { this.frame = f; return this; }
  setActive(a: boolean) { this.active = a; return this; }
  setVisible(v: boolean) { this.visible = v; return this; }
  setAlpha(a: number) { this.alpha = a; return this; }
  setScale(s: number) { this.scale = s; return this; }
  setFlipX(f: boolean) { this.flipX = f; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setDepth(d: number) { this.depth = d; return this; }
  destroy() { this.scene = undefined; this.visible = false; }
}
class Gfx {
  x = 0; y = 0; alpha = 1; visible = true; dead = false;
  constructor() { GFX.push(this); }
  clear() { return this; } fillStyle() { return this; } fillRect() { return this; } setDepth() { return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setAlpha(a: number) { this.alpha = a; return this; }
  setVisible(v: boolean) { this.visible = v; return this; }
  destroy() { this.dead = true; this.visible = false; }
}
let ALL: Img[] = [], GFX: Gfx[] = [];
const mkScene = () => {
  const scene: Record<string, unknown> = {
    add: { image: (x: number, y: number, tex: string, fr: number) => new Img(scene, tex, fr).setPosition(x, y), graphics: () => new Gfx() },
    textures: { exists: () => true, createCanvas: () => ({ getContext: () => ({ fillRect() {} }), refresh() {} }) },
    time: { now: 1000 },
    cameras: { main: { zoom: 2, worldView: { x: 0, y: 0, right: 2000, bottom: 2000 } } },
    events: { once() {} },
    cache: { json: { get: (k: string) => (k === "aurafx" ? manifest : undefined) } },
  };
  return scene as { time: { now: number }; cameras: { main: { zoom: number } } };
};
const scene = mkScene();
(globalThis as unknown as { window: unknown }).window = globalThis;
initAuraFx(scene as never);
assert.ok(afx.ready && afx.fx.length === manifest.keys.length, "каталог разобран");

const enc = (list: [string, number?][]) => list.map(([k, n]) => [afx.byKey.get(k)!.idx, n ?? 0] as const).sort((a, b) => a[0] - b[0]).map(([i, n]) => String.fromCharCode(32 + i + 128 * n)).join("");
interface View { id: string; scene: unknown; u: { kind: number; fx: string; faction: string; dir: number; anim: number; team: number }; dead: boolean; unseen: boolean; mountDust: boolean; x: number; y: number; sprite: { x: number; y: number }; frame: number; isSelf: boolean; selected: boolean }
const mkView = (id: string, x: number, y: number, isSelf = true): View => ({ id, scene, u: { kind: UnitKind.Player, fx: "", faction: "solgard", dir: Dir.Down, anim: Anim.Idle, team: 0 }, dead: false, unseen: false, mountDust: false, x, y, sprite: { x, y }, frame: 32, isSelf, selected: false });
const HX = 500, HY = 500 - 27 - 15;
/** Новый юнит со своим набором обозначений: чистая сцена, время не идёт назад. */
function fresh(isSelf = true) {
  const v = mkView("p1", 500, 500, isSelf);
  const au = new UnitAuras(v as never);
  const step = (ms: number, each?: () => void) => { for (let t = 0; t < ms; t += 16) { scene.time.now += 16; each?.(); au.update(HX, HY); } };
  return { v, au, step, end: () => au.destroy() };
}
const visible = () => ALL.filter((i) => i.visible && i.active && i.scene);
const withTex = (prefix: string) => visible().filter((i) => i.tex.startsWith(prefix));
const maxAlpha = (list: Img[]) => list.reduce((m, i) => Math.max(m, i.alpha), 0);
const beads = () => withTex("afxb_");
const near = (a: number, b: number, eps: number, msg: string) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} против ${b} (допуск ${eps})`);
/** На сколько пикселей мира верх значка над подписью выше его точки привязки: рисунок выше якоря и покачивание (у орбиты — подъём эллипса). */
const upOf = (k: string) => {
  const L = manifest.fx[k].layers[0], o = L.orbit;
  return L.anchor[1] * (L.frame[1] * L.scale) + (o ? Math.max(0, o.ry - o.oy + (o.bob ?? 0)) : (L.bob?.amp ?? 0));
};

// ---------- 1. бусина, которая уходит, остаётся бусиной ----------
{
  const { v, step, end } = fresh();
  v.u.fx = enc([["root"], ["slow"]]);
  step(600);
  assert.equal(beads().length, 1, "slow — бусина на кромке круга root");
  assert.equal(withTex("afx_aura-slow").length, 0, "полного круга slow нет");
  v.u.fx = enc([["root"]]);
  step(16);
  assert.equal(withTex("afx_aura-slow").length, 0, "slow снят: вместо бусины не вспыхивает круг");
  assert.equal(beads().length, 1, "бусина ещё на месте");
  assert.ok(beads()[0].alpha > 0.9, `и ещё почти непрозрачна: ${beads()[0].alpha}`);
  step(100);
  assert.ok(beads()[0].alpha < 0.97 && beads()[0].alpha > 0.4, `бусина гаснет плавно: ${beads()[0].alpha}`);
  assert.equal(withTex("afx_aura-slow").length, 0, "полный круг slow не появился");
  step(400);
  assert.equal(beads().length, 0, "через 0,5 с бусины нет");
  assert.ok(maxAlpha(withTex("afx_aura-root")) > 0.99, "круг root не пострадал");
  end();
}

// ---------- 2. смена роли: прежний вид гаснет, новый проявляется ----------
{
  // круг понижен до бусины: пришёл более сильный круг
  const { v, step, end } = fresh();
  v.u.fx = enc([["slow"]]); step(600);
  assert.ok(maxAlpha(withTex("afx_aura-slow")) > 0.99, "slow — главный круг");
  v.u.fx = enc([["root"], ["slow"]]); step(16);
  assert.ok(maxAlpha(withTex("afx_aura-slow")) > 0.9, `прежний круг slow не пропал в первом кадре: ${maxAlpha(withTex("afx_aura-slow"))}`);
  assert.ok(maxAlpha(withTex("afx_aura-root")) < 0.3, "новый круг root проявляется с нуля");
  step(100);
  const s1 = maxAlpha(withTex("afx_aura-slow")), r1 = maxAlpha(withTex("afx_aura-root")), b1 = maxAlpha(beads());
  assert.ok(s1 > 0.05 && s1 < 0.99 && r1 > 0.2 && r1 < 0.99 && b1 > 0.2 && b1 < 0.99, `перекрёстное затухание: круг slow ${s1.toFixed(2)}, круг root ${r1.toFixed(2)}, бусина ${b1.toFixed(2)}`);
  step(500);
  assert.equal(withTex("afx_aura-slow").length, 0, "прежний круг slow исчез");
  assert.ok(maxAlpha(withTex("afx_aura-root")) > 0.99 && maxAlpha(beads()) > 0.99, "круг root и бусина slow — полностью");
  // главный круг снят: бусина становится кругом
  v.u.fx = enc([["slow"]]); step(16);
  assert.ok(maxAlpha(withTex("afx_aura-root")) > 0.9, "снятый круг root в первом кадре ещё весь");
  assert.ok(maxAlpha(withTex("afx_aura-slow")) < 0.3, "slow проявляется кругом с нуля");
  assert.ok(maxAlpha(beads()) > 0.9, "бусина slow ещё видна и уходит");
  step(500);
  assert.equal(withTex("afx_aura-root").length, 0, "root ушёл");
  assert.equal(beads().length, 0, "бусины нет");
  assert.ok(maxAlpha(withTex("afx_aura-slow")) > 0.99, "slow — главный круг");
  v.u.fx = ""; step(700);
  assert.equal(visible().length, 0, "всё снято — спрайтов нет");
  end();
}

// ---------- 3. ряд значков: сдвиг и подъём плавные, уходящий значок и точки стаков гаснут на месте ----------
{
  const { v, step, au, end } = fresh();
  v.u.fx = enc([["laststand"], ["venom", 3]]); step(600);
  const x0 = withTex("afx_aura-laststand")[0].x, vx = withTex("afx_aura-venom")[0].x, vy = withTex("afx_aura-venom")[0].y;
  assert.ok(x0 < vx, "ряд: laststand слева, venom справа");
  const pips = GFX.filter((g) => g.visible);
  assert.equal(pips.length, 1, "точки стаков под venom");
  const py = pips[0].y;
  v.u.fx = enc([["laststand"]]);
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < 20; i++) {
    step(16);
    xs.push(withTex("afx_aura-laststand")[0].x); ys.push(withTex("afx_aura-laststand")[0].y);
    if (i === 4) {
      // середина затухания: venom стоит на своём месте и на своей высоте, точки стаков — под ним и гаснут вместе с ним
      const venom = withTex("afx_aura-venom")[0], g = GFX.find((q) => q.visible);
      assert.ok(venom && venom.alpha < 1 && venom.alpha > 0.5, `venom ещё виден и гаснет: ${venom?.alpha}`);
      near(venom.x, vx, 0.01, "уходящий venom стоит на своём месте"); near(venom.y, vy, 0.01, "и на своей высоте");
      assert.ok(g && Math.abs(g.y - py) < 0.6 && g.alpha < 1 && g.alpha > 0.5, `точки стаков под своим значком и гаснут вместе с ним: ${g?.y} против ${py}, альфа ${g?.alpha}`);
    }
  }
  const dx = xs.slice(1).map((x, i) => Math.abs(x - xs[i])), dy = ys.slice(1).map((y, i) => Math.abs(y - ys[i]));
  assert.ok(Math.abs(xs[0] - x0) <= 4, `первый кадр: значок не прыгнул (${x0} → ${xs[0]})`);
  assert.ok(Math.max(...dx) <= 4 && Math.max(...dy) <= 2, `за кадр не больше 4 px по x и 2 по y: ${Math.max(...dx)}, ${Math.max(...dy)}`);
  assert.ok(xs[xs.length - 1] > x0 + 5, `значок едет к центру (${x0} → ${xs[xs.length - 1]})`);
  step(500);
  assert.equal(withTex("afx_aura-venom").length, 0, "venom ушёл");
  assert.equal(GFX.filter((q) => q.visible).length, 0, "точки стаков ушли");
  near(withTex("afx_aura-laststand")[0].x, 500 - 14 / 2, 1, "laststand встал по центру");
  assert.equal(au.rowW, 14, "ряд из одного значка: его ширина (14)");
  assert.equal(au.rowH, Math.ceil(upOf("laststand")) + 1, "высота — рисунок над точкой привязки и зазор 1");
  end();
}
{
  // второй значок со стаками поднимает ряд на 3 px и расставляет значки: плавно, без прыжка; уходит самый слабый
  const { v, step, au, end } = fresh();
  v.u.fx = enc([["laststand"]]); step(600);
  const y0 = withTex("afx_aura-laststand")[0].y, x0 = withTex("afx_aura-laststand")[0].x;
  assert.equal(au.rowH, Math.ceil(upOf("laststand")) + 1);
  v.u.fx = enc([["laststand"], ["fury", 2]]); step(16);
  const l1 = withTex("afx_aura-laststand")[0];
  assert.ok(Math.abs(l1.x - x0) <= 4 && Math.abs(l1.y - y0) <= 2, `первый кадр: laststand почти на месте (${x0},${y0} → ${l1.x},${l1.y})`);
  step(500);
  const l2 = withTex("afx_aura-laststand")[0], f2 = withTex("afx_aura-fury")[0];
  assert.ok(l2.x < f2.x && l2.y < y0 - 1, `ряд: laststand слева, оба выше (${l2.y} против ${y0})`);
  assert.equal(au.rowW, 14 + 2 + 15, "ширина ряда из двух значков");
  assert.equal(au.rowH, Math.ceil(Math.max(upOf("laststand"), upOf("fury")) + 3) + 1, "высота ряда с подъёмом на стаках (3 px) и зазор 1");
  v.u.fx = ""; step(700);
  assert.equal(au.rowW + au.rowH, 0, "значков нет — разводке нечего оставлять");
  end();
}

// ---------- 4. круг толпы бледный и при снятии ----------
{
  const { v, step, end } = fresh(false);
  afx.crowd = -1; afx.crowdHold = 0;
  v.u.fx = enc([["frenzy"]]); step(600);
  near(maxAlpha(withTex("afx_aura-frenzy")), 0.6, 0.02, "в толпе круг чужого героя бледный");
  v.u.fx = ""; step(16);
  assert.ok(maxAlpha(withTex("afx_aura-frenzy")) <= 0.61, `при снятии не вспыхивает до полного: ${maxAlpha(withTex("afx_aura-frenzy"))}`);
  step(100);
  assert.ok(maxAlpha(withTex("afx_aura-frenzy")) < 0.6, "и гаснет");
  step(500);
  assert.equal(visible().length, 0);
  afx.crowd = 6; afx.crowdHold = 1500;
  end();
}

// ---------- 5. орбита со стаками: число предметов идёт плавно ----------
{
  const { v, step, end } = fresh();
  v.u.fx = enc([["rhythm", 2]]); step(600);
  const items = () => withTex("afx_aura-rhythm");
  assert.equal(items().length, 2);
  const p0 = items().map((i) => [i.x, i.y]);
  v.u.fx = enc([["rhythm", 3]]); step(16);
  const p1 = items();
  assert.equal(p1.length, 3, "третий предмет появился");
  assert.ok(Math.min(...p1.map((i) => i.alpha)) < 0.3, `новый предмет проявляется альфой, а не вспыхивает: ${p1.map((i) => i.alpha.toFixed(2))}`);
  // старые предметы не прыгают: каждый в первом кадре рядом с каким-то из прежних мест
  const jump = Math.max(...p0.map(([x, y]) => Math.min(...p1.map((i) => Math.hypot(i.x - x, i.y - y)))));
  assert.ok(jump < 8, `старые предметы не прыгают (сдвиг за кадр ${jump.toFixed(1)} px при вращении по орбите)`);
  step(400);
  const full = items().map((i) => i.alpha), back = manifest.fx.rhythm.layers[0].orbit.backAlpha as number;
  assert.ok(items().length === 3 && Math.min(...full) > back - 0.02, `все три предмета проявились (задние приглушены альфой орбиты ${back}): ${full.map((a) => a.toFixed(2))}`);
  v.u.fx = enc([["rhythm", 1]]); step(16);
  assert.equal(items().length, 3, "лишние предметы ещё видны и гаснут");
  step(500);
  assert.equal(items().length, 1, "остался один предмет");
  v.u.fx = ""; step(700);
  end();
}

// ---------- 6. мёртвый гаснет, скрытый исчезает сразу ----------
{
  const { v, step, end } = fresh();
  v.u.fx = enc([["root"], ["slow"], ["laststand"], ["rhythm", 2]]); step(700);
  const before = visible().length;
  assert.ok(before >= 5, `обозначений на юните: ${before}`);
  v.dead = true; step(16);
  assert.equal(visible().length, before, "мёртвый: в первом кадре обозначения на месте");
  assert.ok(maxAlpha(visible()) > 0.9);
  step(100);
  assert.ok(maxAlpha(visible()) < 0.98 && maxAlpha(visible()) > 0.2, `и гаснут вместе с телом: ${maxAlpha(visible())}`);
  step(500);
  assert.equal(visible().length, 0, "через 0,6 с обозначений нет");
  v.dead = false; step(700);
  assert.ok(visible().length >= 5, "воскрес — обозначения вернулись");
  v.unseen = true; step(16);
  assert.equal(visible().length, 0, "скрытый: обозначения исчезают сразу");
  v.unseen = false; v.u.fx = ""; step(700);
  assert.equal(visible().length, 0);
  end();
}

// ---------- 7. режим толпы не мигает на границе порога ----------
{
  const { v, step, end } = fresh(false);
  const others: View[] = Array.from({ length: 9 }, (_, i) => mkView(`o${i}`, 400 + i * 20, 560, false));
  const crowdOf = (n: number) => () => { countHero(v as never); for (let i = 0; i < n - 1; i++) countHero(others[i] as never); };
  const ring = () => maxAlpha(withTex("afx_aura-frenzy"));
  v.u.fx = enc([["frenzy"]]);
  step(800, crowdOf(6));
  near(ring(), 1, 0.01, "6 героев в кадре — толпы нет");
  step(800, crowdOf(7));
  near(ring(), 0.6, 0.02, "7 героев — толпа");
  // на границе: 6 и 7 по очереди — режим держится, круг не мигает
  const seen: number[] = [];
  for (let i = 0; i < 20; i++) { step(160, crowdOf(i % 2 ? 7 : 6)); seen.push(ring()); }
  assert.ok(seen.every((a) => Math.abs(a - 0.6) < 0.02), `на границе толпа не выключается: ${seen.map((a) => a.toFixed(2)).join(" ")}`);
  step(1600, crowdOf(5));
  near(ring(), 1, 0.02, "героев стало 5 и режим продержался — толпа выключилась");
  step(800, crowdOf(6));
  near(ring(), 1, 0.01, "6 героев — порог не пройден, режим не включается");
  step(800, crowdOf(8));
  near(ring(), 0.6, 0.02, "8 героев — толпа");
  v.u.fx = ""; step(700, crowdOf(8));
  end();
}

// ---------- 8. пыль маунта: проявляется, гаснет, идёт назад от взгляда ----------
{
  const { v, step, end } = fresh();
  v.mountDust = true;
  const dust = () => withTex("afx_aura-mount");
  step(700);
  assert.equal(dust().length, 0, "верховой стоит — пыли нет");
  v.u.anim = Anim.Walk; v.u.dir = Dir.Right; step(16);
  assert.ok(dust().length === 0 || maxAlpha(dust()) < 0.3, `побежал: пыль проявляется, а не вспыхивает (${maxAlpha(dust()).toFixed(2)})`);
  step(500);
  assert.ok(maxAlpha(dust()) > 0.95, "бежит — пыль полная");
  v.u.anim = Anim.Idle; step(16);
  assert.ok(dust().length && maxAlpha(dust()) > 0.6, "встал: пыль не обрывается");
  step(100);
  assert.ok(dust().length === 0 || maxAlpha(dust()) < 0.9, "и гаснет");
  step(500);
  assert.equal(dust().length, 0, "пыли нет");
  // назад от взгляда: вправо — слева от ног, влево — справа, вверх — под ногами, вниз — над ногами
  const at = (dir: number) => { v.u.anim = Anim.Walk; v.u.dir = dir; step(500); const m = dust()[0]; return { cx: m.x + 24 * m.scale - 500, cy: m.y + 9 * m.scale - 500 }; };
  const right = at(Dir.Right), left = at(Dir.Left), up = at(Dir.Up), down = at(Dir.Down);
  assert.ok(right.cx < -3 && left.cx > 3, `вправо — пыль слева (${right.cx.toFixed(1)}), влево — справа (${left.cx.toFixed(1)})`);
  assert.ok(Math.abs(up.cx) < 1.5 && Math.abs(down.cx) < 1.5, `вверх и вниз — пыль по центру (${up.cx.toFixed(1)}, ${down.cx.toFixed(1)})`);
  assert.ok(up.cy > down.cy + 5, `вверх — пыль под ногами, вниз — над ногами (${up.cy.toFixed(1)} и ${down.cy.toFixed(1)})`);
  v.mountDust = false; step(700);
  assert.equal(visible().length, 0, "слез — пыли нет");
  end();
}

// ---------- 9. спрайты не копятся ----------
{
  const { v, step, end } = fresh();
  const cycle = () => {
    for (let k = 0; k < 12; k++) {
      v.u.fx = enc(k % 2 ? [["root"], ["slow"], ["laststand"], ["venom", 2]] : [["slow"], ["curse"]]);
      step(48);
    }
    v.u.fx = ""; step(900);
    assert.equal(visible().length, 0, "всё снято — спрайтов нет, призраки смены ролей не застряли");
    assert.equal(GFX.filter((g) => g.visible).length, 0, "и точек стаков нет");
  };
  cycle();
  const base = ALL.length, gbase = GFX.length;
  cycle();
  assert.ok(ALL.length - base <= 6 && GFX.length - gbase <= 2, `второй такой же цикл берёт спрайты из пула, а не создаёт заново: новых спрайтов ${ALL.length - base}, график ${GFX.length - gbase}`);
  end();
}

// ---------- 10. случайные наборы, толпа, зум, движение, смерть: без исключений, без NaN, спрайтов в меру, всё снимается ----------
{
  let seed = 20261022;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const keys = afx.fx.filter((f) => !f.legacy && f.layers.length).map((f) => f.key);
  const { v, step, end } = fresh(false);
  let worst = 0;
  for (let round = 0; round < 500; round++) {
    const n = Math.floor(rnd() * 7), set: [string, number][] = [];
    for (let i = 0; i < n; i++) set.push([keys[Math.floor(rnd() * keys.length)], Math.floor(rnd() * 5)]);
    v.u.fx = enc([...new Map(set).entries()]);
    v.u.anim = rnd() < 0.5 ? Anim.Walk : Anim.Idle; v.u.dir = Math.floor(rnd() * 4);
    v.isSelf = rnd() < 0.3; v.selected = rnd() < 0.1; v.dead = rnd() < 0.06; v.unseen = rnd() < 0.04; v.mountDust = rnd() < 0.25;
    scene.cameras.main.zoom = rnd() < 0.5 ? 2 : 3;
    afx.crowd = rnd() < 0.3 ? -1 : 6;
    step(16 * (1 + Math.floor(rnd() * 24)));
    for (const i of visible()) assert.ok(Number.isFinite(i.x) && Number.isFinite(i.y) && Number.isFinite(i.scale) && i.alpha >= 0 && i.alpha <= 1.0001, `раунд ${round}: спрайт ${i.tex} x ${i.x} y ${i.y} масштаб ${i.scale} альфа ${i.alpha}`);
    worst = Math.max(worst, visible().length);
  }
  assert.ok(worst <= 90, `спрайтов в кадре не больше разумного: ${worst}`);
  v.u.fx = ""; v.dead = false; v.unseen = false; v.mountDust = false; scene.cameras.main.zoom = 2; afx.crowd = 6;
  step(1500);
  assert.equal(visible().length, 0, "после случайной болтанки всё снято — спрайтов нет");
  assert.equal(GFX.filter((g) => g.visible).length, 0, "и точек стаков нет");
  end();
}

console.log("  ok   aura-plan");
