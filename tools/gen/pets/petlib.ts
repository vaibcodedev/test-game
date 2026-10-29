/**
 * Питомцы и призывы (чернокнижник, зверинец): общий конвейер кадра поверх rig мобов задачи 140 (tools/gen/mobs/rig.ts,
 * lib.ts — не меняются). Тело — Creature.build rig (3D из примитивов, луч на пиксель, 5 тонов, свет сверху слева,
 * контур как у героя); здесь — свои анимации (покой, ходьба/полёт, атака, урон, появление, гибель), жёсткие части
 * (рассыпание, втягивание в портал), срез по земле (вылезает из ямы, уходит в портал) и 2D-эффекты под и над телом
 * (яма, печать-портал, огненный шар, искры) с маской свечения для ночи.
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildBody, restPose, selout, tintOutline, OUT, type Built, type Creature, type Pose, type Variant,
} from "../mobs/rig";
import {
  PC, VIEWS, add, clamp, crop, easeInOut, fill, groundBg, hash01, lerp, lerpV, loadPC, mix, nightRect, norm, renderScene, rigidPieces, rotAxis, scaleNN,
  scr, sealPinholes, shadowBlob, stackRows, sub, text, thicken, toView, vlen, cross, dot,
  type Cam, type RGBA, type Row, type Scene, type V3, type View,
} from "../mobs/lib";

export type XP = Pose & Record<string, number | V3 | [V3, V3] | [number, number]>;
export interface FxCtx { img: PC; emis: PC; cam: Cam; view: View; B: Built; depth: Float32Array; f: number; pt: (w: V3) => [number, number] }
export type Fx = (o: FxCtx) => void;
export interface PFrame {
  p: XP;
  /** жёсткие части (мир, после масштаба): поворот вокруг c0 и перенос в c1 */
  rigid?: (sc: Scene, view: View) => ((piece: number) => { c0: V3; c1: V3; axis: V3; ang: number } | null) | null;
  /** срез по земле: пиксели тела ниже ряда clipY убираются (вылезает из ямы / уходит в портал) */
  clipY?: number;
  under?: Fx; over?: Fx;
}
export interface PAnim { id: string; ru: string; fps: number; loop: boolean; frames: (view: View) => PFrame[] }
export interface Pet { id: string; ru: string; cr: Creature; v: Variant; cam: Cam; anims: PAnim[]; shadow: number; hover?: number }

export const camN = (N: number): Cam => ({ N, CX: N / 2, GY: N - 1.6 });

// ---------------- ключи поз ----------------
export interface Key { f: number; p: Partial<XP>; ease?: (t: number) => number }
function slerpDir(a: V3, b: V3, t: number): V3 {
  const A = norm(a), B = norm(b);
  const c = clamp(dot(A, B), -1, 1);
  const ang = Math.acos(c);
  if (ang < 1e-3) return B;
  let ax = cross(A, B);
  if (vlen(ax) < 1e-4) ax = [1, 0, 0];
  return norm(rotAxis(A, ax, ang * t));
}
export function lerpX(a: XP, b: XP, t: number): XP {
  const o = { ...a } as Record<string, unknown>;
  for (const k of Object.keys(b)) {
    const x = (a as Record<string, unknown>)[k], y = (b as Record<string, unknown>)[k];
    if (x === undefined) { o[k] = y; continue; }
    if (typeof x === "number") o[k] = lerp(x, y as number, t);
    else if (Array.isArray(x) && typeof x[0] === "number") o[k] = (x as number[]).map((q, i) => lerp(q, (y as number[])[i], t));
    else if (Array.isArray(x)) o[k] = (x as V3[]).map((q, i) => (i === 0 ? slerpDir(q, (y as V3[])[i], t) : norm(lerpV(q, (y as V3[])[i], t))));
  }
  return o as XP;
}
export function keyed(base: XP, keys: Key[], n: number): XP[] {
  const full: { f: number; p: XP; ease?: (t: number) => number }[] = [];
  let cur = base;
  for (const k of keys) {
    cur = { ...cur, ...k.p } as XP;
    full.push({ f: k.f, p: cur, ease: k.ease });
  }
  return Array.from({ length: n }, (_, f) => {
    let i = 0;
    while (i + 1 < full.length && full[i + 1].f <= f) i++;
    const a = full[i], b = full[Math.min(i + 1, full.length - 1)];
    const t = b.f === a.f ? 0 : (f - a.f) / (b.f - a.f);
    return lerpX(a.p, b.p, (b.ease ?? easeInOut)(clamp(t, 0, 1)));
  });
}
export const rest = (cr: Creature, v: Variant, extra: Partial<XP> = {}): XP => ({ ...restPose(cr, v.role), ...extra }) as XP;

// ---------------- жёсткие части ----------------
export function piecesOf(sc: Scene): number[] {
  return [...new Set(sc.prims.map((q) => q.piece))];
}
export function pieceCenter(sc: Scene, piece: number): V3 {
  let c: V3 = [0, 0, 0], n = 0;
  for (const q of sc.prims) if (q.piece === piece) { c = add(c, lerpV(q.a, q.b, 0.5)); n++; }
  return n ? [c[0] / n, c[1] / n, c[2] / n] : [0, 0, 0];
}
/** Низ части после поворота (мир): по концам примитивов с радиусом. */
export function pieceLow(sc: Scene, pieces: number[], c0: V3, axis: V3, ang: number): number {
  let z = 1e9;
  for (const q of sc.prims) {
    if (!pieces.includes(q.piece)) continue;
    const r = q.k === 0 ? Math.max(q.ra, q.rb) : Math.max(...q.r) * 0.85;
    for (const p of [q.a, q.b]) z = Math.min(z, add(c0, rotAxis(sub(p, c0), axis, ang))[2] - r);
  }
  return z;
}
/** Части piece → поворот и перенос: ложатся на землю (низ — z = 0). */
export function liePiece(sc: Scene, piece: number, axis: V3, ang: number, dxy: [number, number]): { c0: V3; c1: V3 } {
  const c0 = pieceCenter(sc, piece);
  const low = pieceLow(sc, [piece], c0, axis, ang);
  return { c0, c1: [c0[0] + dxy[0], c0[1] + dxy[1], c0[2] - low + 0.15] };
}

// ---------------- кадр ----------------
const isOut = (q: RGBA | null) => !!q && q[3] > 120 && q[0] === OUT[0] && q[1] === OUT[1] && q[2] === OUT[2];
export function renderPet(pet: Pet, view: View, F: PFrame, f: number): { img: PC; emis: PC } {
  const { cam } = pet;
  const N = cam.N;
  const B = buildBody(pet.cr, pet.v, F.p as Pose, view, "idle");
  const tf = F.rigid?.(B.sc, view);
  if (tf) rigidPieces(B.sc, tf);
  const R0 = renderSceneOf(cam, B.sc, view);
  const img = new PC(N, N);
  const emis = new PC(N, N);
  const ctx: FxCtx = { img, emis, cam, view, B, depth: R0.gb.t, f, pt: (w) => scr(cam, toView(view, w)) };
  const body = R0.body;
  const bodyE = R0.emis;
  if (F.clipY !== undefined) {
    for (let y = Math.max(0, Math.ceil(F.clipY)); y < N; y++) for (let x = 0; x < N; x++) { body.clear(x, y); bodyE.clear(x, y); }
    // по срезу — тёмный тон (тело уходит в тень ямы)
    const yc = Math.ceil(F.clipY) - 1;
    for (let x = 0; x < N; x++) { const q = body.get(x, yc); if (q && q[3] > 120 && !isOut(q)) body.set(x, yc, mix(q, [12, 8, 14, 255], 0.55)); }
  }
  F.under?.(ctx);
  img.blit(body, 0, 0);
  emis.blit(bodyE, 0, 0);
  thicken(img, OUT, 3);
  sealPinholes(img, OUT, true, 8);
  selout(img);
  const kill: [number, number][] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!isOut(img.get(x, y))) continue;
    let ok = false;
    for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = img.get(x + dx, y + dy);
      if (q && q[3] > 120 && !isOut(q)) { ok = true; break; }
    }
    if (!ok) kill.push([x, y]);
  }
  for (const [x, y] of kill) { img.clear(x, y); emis.clear(x, y); }
  tintOutline(img);
  F.over?.(ctx);
  for (let x = 0; x < N; x++) { img.clear(x, N - 1); emis.clear(x, N - 1); }
  return { img, emis };
}
const renderSceneOf = (cam: Cam, sc: Scene, view: View) => renderScene(cam, sc, view, OUT);

// ---------------- 2D-эффекты ----------------
export function px(o: FxCtx, x: number, y: number, c: RGBA, glow = false) {
  x = Math.floor(x); y = Math.floor(y);
  const N = o.cam.N;
  if (x < 1 || y < 0 || x >= N - 1 || y >= N - 1) return;
  o.img.set(x, y, c);
  if (glow) o.emis.set(x, y, c);
}
/** Светящийся шар с ядром и языками; depth — прятать за телом. */
export function orb(o: FxCtx, cx: number, cy: number, r: number, ramp: RGBA[], seed: number, tongues = 3, at?: V3) {
  const N = o.cam.N;
  let hidden = false;
  if (at) {
    const v = toView(o.view, at);
    const i = Math.floor(cy) * N + Math.floor(cx);
    const dp = -(Math.cos(0.244) * v[1] + Math.sin(0.244) * v[2]);
    if (i >= 0 && i < N * N && o.depth[i] && o.img.alpha(Math.floor(cx), Math.floor(cy)) && o.depth[i] < dp - 1.2) hidden = true;
  }
  if (hidden) return;
  // языки пламени вверх
  for (let k = 0; k < tongues; k++) {
    const a = -Math.PI / 2 + (k - (tongues - 1) / 2) * 0.55 + Math.sin(seed * 1.7 + k * 2.1) * 0.25;
    const L = r * (1.1 + 0.6 * hash01(seed, k, 9));
    for (let s = 0; s <= 4; s++) {
      const t = s / 4;
      const x = cx + Math.cos(a) * (r * 0.6 + L * t), y = cy + Math.sin(a) * (r * 0.6 + L * t);
      px(o, x, y, ramp[t < 0.4 ? 3 : t < 0.8 ? 2 : 1], true);
    }
  }
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const d = Math.hypot(dx, dy) / r;
    if (d > 1.05) continue;
    const l = d - 0.25 * ((-dx - dy) / r);
    px(o, x, y, ramp[l < 0.3 ? 4 : l < 0.6 ? 3 : l < 0.85 ? 2 : 1], true);
  }
}
/** Плоский эллипс на земле (кольцо/заливка) с функцией цвета. */
export function groundEllipse(o: FxCtx, cx: number, cy: number, rx: number, ry: number, col: (d: number, a: number, x: number, y: number) => RGBA | null, glow = false, onlyEmpty = false) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const d = Math.hypot(dx, dy);
    if (d > 1.0) continue;
    if (onlyEmpty && o.img.alpha(x, y)) continue;
    const c = col(d, Math.atan2(dy, dx), x, y);
    if (c) px(o, x, y, c, glow);
  }
}

// ---------------- листы ----------------
export interface PetOut { pet: Pet; sheets: Map<string, { sheet: PC; emis: PC; n: number }>; problems: string[] }
export function buildPet(pet: Pet): PetOut {
  const N = pet.cam.N;
  const sheets = new Map<string, { sheet: PC; emis: PC; n: number }>();
  const problems: string[] = [];
  for (const a of pet.anims) {
    let sheet: PC | null = null, emis: PC | null = null, n = 0;
    VIEWS.forEach((view, row) => {
      const fr = a.frames(view);
      n = fr.length;
      if (!sheet) { sheet = new PC(N * n, N * 3); emis = new PC(N * n, N * 3); }
      fr.forEach((F, i) => {
        const r = renderPet(pet, view, F, i);
        // край кадра: тело не касается левого, правого и верхнего края
        for (let k = 0; k < N; k++) {
          if (r.img.alpha(0, k) || r.img.alpha(N - 1, k) || r.img.alpha(k, 0)) { problems.push(`${pet.id} ${a.id} ${view} кадр ${i + 1}: касается края`); break; }
        }
        sheet!.blit(r.img, i * N, row * N);
        emis!.blit(r.emis, i * N, row * N);
      });
    });
    sheets.set(a.id, { sheet: sheet!, emis: emis!, n });
  }
  return { pet, sheets, problems };
}
/** Общий лист: 3 строки (вниз, вверх, вбок), столбцы — анимации подряд; раскладка — в .json рядом. */
export function saveSheets(o: PetOut, dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  const N = o.pet.cam.N;
  const cols = [...o.sheets.values()].reduce((s, a) => s + a.n, 0);
  const sh = new PC(N * cols, N * 3), em = new PC(N * cols, N * 3);
  let c = 0;
  const lay: Record<string, { col: number; n: number; fps: number; loop: boolean }> = {};
  for (const a of o.pet.anims) {
    const s = o.sheets.get(a.id)!;
    sh.blit(s.sheet, c * N, 0);
    em.blit(s.emis, c * N, 0);
    lay[a.id] = { col: c, n: s.n, fps: a.fps, loop: a.loop };
    c += s.n;
  }
  sh.save(path.join(dir, `${o.pet.id}.png`));
  em.save(path.join(dir, `${o.pet.id}_glow.png`));
  fs.writeFileSync(path.join(dir, `${o.pet.id}.json`), JSON.stringify({ frame: N, rows: ["down", "up", "side"], anims: lay }, null, 1));
}

// ---------------- монтаж ----------------
export interface Assets { hero: PC; terrain: PC }
export function loadAssets(root: string): Assets {
  return {
    hero: loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png")),
    terrain: loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png")),
  };
}
export const heroAt = (A: Assets, row: number, col = 0) => crop(A.hero, col * 32, row * 32, 32, 32);
export const frameOfSheet = (s: { sheet: PC; emis: PC }, N: number, i: number, row: number) => ({ img: crop(s.sheet, i * N, row * N, N, N), emis: crop(s.emis, i * N, row * N, N, N) });

export interface Item { img: PC; emis?: PC | null; flip?: boolean; gap?: number; shadow?: number; label?: string }
/** Спрайт ×k, низ кадра на линии yb; тень — пятно на земле (у парящих — меньше, отдельно от тела). */
export function putSprite(c: PC, it: Item, x: number, yb: number, k: number) {
  const img = it.img;
  const y = yb - img.h * k;
  const sw = it.shadow ?? (img.w / 32) * 6.5;
  if (sw > 0) shadowBlob(c, x + (img.w / 2) * k, yb - 1.2 * k, sw * k, Math.max(1.6, sw * 0.32) * k);
  c.blit(scaleNN(img, k, it.flip), x, y);
}
export function relight(c: PC, emis: PC, x: number, yb: number, k: number, flip = false) {
  const y = yb - emis.h * k;
  c.blit(scaleNN(emis, k, flip), x, y);
  for (let j = 0; j < emis.h; j++) for (let i = 0; i < emis.w; i++) {
    const q = emis.get(flip ? emis.w - 1 - i : i, j)!;
    if (!q[3]) continue;
    for (let dy = -3 * k; dy <= 4 * k; dy += 1) for (let dx = -3 * k; dx <= 4 * k; dx += 1) {
      const X = x + i * k + dx, Y = y + j * k + dy;
      const dd = Math.hypot(dx - k / 2, dy - k / 2) / (3.5 * k);
      if (dd > 1 || !c.inside(X, Y)) continue;
      const cur = c.get(X, Y)!;
      c.data.set(mix(cur, [q[0], q[1], q[2], 255], 0.035 * (1 - dd)), (Y * c.w + X) * 4);
    }
  }
}
export function sceneRow(title: string, items: Item[], A: Assets, night: boolean, W: number, k: number, H: number, g: "grass" | "dirt" = "grass"): Row {
  return {
    h: H * k + 40,
    draw: (c, y0) => {
      text(c, title, 16, y0 + 8);
      const y = y0 + 34;
      groundBg(c, A.terrain, 16, y, W - 32, H * k, k, g);
      const yb = y + H * k;
      let x = 28;
      const pos: number[] = [];
      for (const it of items) {
        x += it.gap ?? 0;
        putSprite(c, it, x, yb, k);
        pos.push(x);
        x += (it.img.w + 2) * k;
      }
      if (night) {
        nightRect(c, 16, y, W - 32, H * k);
        items.forEach((it, i) => it.emis && relight(c, it.emis, pos[i], yb, k, it.flip));
      }
      items.forEach((it, i) => it.label && text(c, it.label, pos[i], yb + 4, 1));
    },
  };
}
export function animRows(o: PetOut, A: Assets, k: number, W: number, night = false): Row[] {
  const N = o.pet.cam.N;
  const rows: Row[] = [];
  for (const a of o.pet.anims) {
    const s = o.sheets.get(a.id)!;
    rows.push({
      h: N * k * 3 + 44,
      draw: (c, y0) => {
        text(c, `×${k} · ${o.pet.ru} · ${a.ru} · ${s.n} КАДРОВ · ${a.fps} К/С${a.loop ? " · ПО КРУГУ" : ""} · ВНИЗ / ВБОК / ВВЕРХ${night ? " · НОЧЬ" : ""}`, 16, y0 + 8);
        [0, 2, 1].forEach((row, ri) => {
          const y = y0 + 34 + ri * N * k;
          groundBg(c, A.terrain, 16, y, W - 32, N * k, k, "grass");
          const yb = y + N * k;
          let x = 24;
          const hero = heroAt(A, row);
          putSprite(c, { img: hero }, x, yb, k);
          x += 36 * k;
          const pos: number[] = [];
          for (let i = 0; i < s.n; i++) {
            const fr = frameOfSheet(s, N, i, row);
            putSprite(c, { img: fr.img, shadow: o.pet.shadow }, x, yb, k);
            pos.push(x);
            x += N * k;
          }
          if (night) {
            nightRect(c, 16, y, W - 32, N * k);
            for (let i = 0; i < s.n; i++) relight(c, frameOfSheet(s, N, i, row).emis, pos[i], yb, k);
          }
        });
      },
    });
  }
  return rows;
}
export { stackRows, fill, text, crop, scaleNN, hash01, mix, lerp, clamp, lerpV, add, sub, norm, rotAxis, type Row };
export { mul } from "../mobs/lib";
