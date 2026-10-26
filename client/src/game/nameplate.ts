/**
 * Полоска здоровья над юнитом (нейм-плейт): скошенная золотая рамка (вариант V2), движок анимации.
 * Состояние на юнита — Plate (барK плавно догоняет, след потерянного «капает» с задержкой, вспышка и дрожь при ударе, зелёный прирост при лечении).
 * drawPlate перерисовывает Graphics только когда что-то изменилось или идёт анимация — сотни юнитов не нагружают кадр.
 * Все размеры — целые пиксели, без сглаживания.
 */
import type Phaser from "phaser";

export interface Plate {
  barK: number; trailK: number; trailAt: number; trailStep: number;
  lastK: number; hitK0: number; flashAt: number; shakeAt: number; shakeAmp: number;
  sig: string; busy: boolean;
}
export const newPlate = (): Plate => ({ barK: -1, trailK: -1, trailAt: 0, trailStep: 0, lastK: -1, hitK0: 0, flashAt: -1e9, shakeAt: -1e9, shakeAmp: 0, sig: "", busy: false });
export const resetPlate = (p: Plate): void => { p.barK = p.trailK = p.lastK = -1; p.sig = ""; p.busy = false; };

export interface PlateOpts {
  /** центр по x и «базовая» y (нижний край полоски в прежней раскладке — by) */
  x: number; y: number; w: number;
  k: number; absorb?: number; col: number;
  elite?: boolean; boss?: boolean;
}

const mix = (a: number, b: number, t: number): number => {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t), g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t), bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
};
const hi = (c: number, t = 0.45): number => mix(c, 0xffffff, t);
const lo = (c: number, t = 0.45): number => mix(c, 0x000000, t);

const SKULL = ["01110", "11111", "10101", "01110", "01010"];

/** Рисует один нейм-плейт; возвращает true, если действительно перерисовал. */
export function drawPlate(g: Phaser.GameObjects.Graphics, st: Plate, o: PlateOpts, now: number, dt: number): boolean {
  const k = Math.max(0, Math.min(1, o.k)), H = 4;
  if (st.barK < 0) { st.barK = st.trailK = st.lastK = k; }
  // удар: вспышка на краю, задержка следа, дрожь при крупном ударе (> 10 % здоровья)
  if (k < st.lastK - 1e-4) {
    st.hitK0 = Math.max(st.hitK0 * (now - st.flashAt < 150 ? 1 : 0), st.lastK);
    st.flashAt = now;
    if (st.lastK - k > 0.1) { st.shakeAt = now; st.shakeAmp = 1; }
    if (k < st.trailK && now >= st.trailAt) st.trailAt = now + 450;
    if (now < st.trailAt) st.trailAt = Math.max(st.trailAt, now + 200);
  }
  st.lastK = k;
  // догоняние: потеря — быстро, лечение — плавно (зелёная часть заполняется)
  const down = k < st.barK;
  st.barK += (k - st.barK) * Math.min(1, dt * (down ? 16 : 3.2));
  if (Math.abs(st.barK - k) < 0.002) st.barK = k;
  if (k >= st.trailK) st.trailK = k;
  else if (now > st.trailAt) {
    st.trailK = st.trailK - (st.trailK - k) * Math.min(1, dt * 5) - dt * 0.05;
    if (st.trailK <= k + 0.002) st.trailK = k;
  }
  const flashing = now - st.flashAt < 160, shaking = now - st.shakeAt < 170, healing = k > st.barK + 0.002;
  const busy = flashing || shaking || healing || st.trailK > st.barK + 0.001 || st.barK !== k;
  const sig = `${o.x}|${o.y}|${o.w}|${o.col}|${o.elite ? 1 : 0}${o.boss ? 1 : 0}|${o.absorb ?? 0}`;
  if (!busy && !st.busy && sig === st.sig) return false;
  st.busy = busy; st.sig = sig;

  const w = o.w;
  const sx = shaking ? ((Math.floor((now - st.shakeAt) / 40) & 1) ? -1 : 1) * st.shakeAmp : 0;
  const bx = Math.round(o.x - w / 2) + sx, top = o.y + 2 - H;
  const hp = Math.round(w * st.barK), tr = Math.round(w * st.trailK), gn = Math.round(w * k);
  const r = (x: number, y: number, ww: number, hh: number, c: number, a = 1) => { if (ww > 0 && hh > 0) g.fillStyle(c, a).fillRect(x, y, ww, hh); };
  /** заливка с бликом сверху и тенью снизу */
  const shaded = (x: number, ww: number, c: number) => {
    if (ww <= 0) return;
    r(x, top, ww, H, c);
    r(x, top, ww, 1, hi(c, 0.55));
    if (H === 4) r(x, top + 1, ww, 1, hi(c, 0.15));
    r(x, top + H - 1, ww, 1, lo(c, 0.42));
  };
  g.clear();

  // рамка и подложка
  const gold = !!(o.elite || o.boss);
  // скос: сверху/слева светлая грань, снизу/справа тёмная
  const ring = gold ? 0xf0c040 : 0x8a6a4a;
  r(bx - 1, top - 1, w + 2, H + 2, 0x050304, 0.95);
  r(bx, top - 1, w, 1, hi(ring, 0.25)); r(bx - 1, top, 1, H, hi(ring, 0.1));
  r(bx, top + H, w, 1, lo(ring, 0.55)); r(bx + w, top, 1, H, lo(ring, 0.4));
  r(bx, top, w, H, 0x1a0e12);

  // след потерянного здоровья
  if (tr > hp) {
    const tc = 0xf0c040;
    r(bx + hp, top, tr - hp, H, tc, 0.92);
    r(bx + hp, top, tr - hp, 1, 0xffffff, 0.6);
    r(bx + hp, top + H - 1, tr - hp, 1, lo(tc, 0.35), 0.9);
  }
  // здоровье; при лечении — основная часть, поверх неё растущая зелёная
  shaded(bx, Math.min(hp, gn), o.col);
  if (hp > gn) shaded(bx + gn, hp - gn, o.col);
  if (gn > hp) {
    const gc = 0x62e070;
    shaded(bx + hp, gn - hp, gc);
    const sh = Math.floor(((now / 380) % 1) * (gn - hp + 3));
    r(bx + hp + sh - 1, top, 2, H, 0xffffff, 0.7);
    r(bx + hp, top, gn - hp, 1, 0xffffff, 0.45);
  }

  // вспышка у края удара
  if (flashing) {
    const a = 1 - (now - st.flashAt) / 160;
    const fw = Math.max(2, Math.round(w * (st.hitK0 - k)));
    r(bx + gn, top, Math.min(fw, w - gn), H, 0xffffff, a * 0.85);
  }

  // щит (поглощение): светлая насечённая полоса поверх, от конца здоровья
  const ab = o.absorb ?? 0;
  if (ab > 0) {
    const aw = Math.min(w - gn, Math.max(2, Math.round(w * ab))), ax = bx + (w - gn >= 2 ? gn : Math.max(0, w - Math.round(w * ab)));
    const awr = w - gn >= 2 ? aw : Math.round(w * ab);
    r(ax, top, awr, H, 0xbfe4ff, 0.6);
    for (let i = 0; i < awr; i += 2) r(ax + i, top + 1, 1, H - 2, 0xffffff, 0.35);
    r(ax, top, awr, 1, 0xffffff, 0.95);
  }

  // деления: у элиты и боссов
  if (gold) {
    if (o.boss) for (let q = 0.25; q < 0.999; q += 0.25) r(bx + Math.round(w * q), top, 1, H, 0x050304, 0.55);
  }
  // череп босса слева
  if (o.boss) {
    const kx = bx - 8, ky = top + Math.floor((H - 5) / 2);
    r(kx - 1, ky - 1, 7, 7, 0x050304, 0.85);
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (SKULL[j][i] === "1") r(kx + i, ky + j, 1, 1, 0xf2ead8);
  }
  return true;
}
