/**
 * Сценки в фортах (задача 132, шаг 12; data/fort-scenes.json): муштра, кузнецы, приказы, расчёт катапульты.
 * Чистая функция времени: поза каждого бойца-декорации и события (искры, холостой выстрел) считаются от Date.now(),
 * поэтому у всех игроков сценка одинакова и серверу она ничего не стоит. Рисует client/src/game/fortScenes.ts.
 */
import D from "../data/fort-scenes.json";
import { FORTS, TILE } from "./constants";
import { NPC_GEAR, type NpcSet, type NpcTier } from "./npcGear";
import { Dir } from "./protocol";
import { T } from "./texts";

export type FortFaction = "solgard" | "umbrath";
type Face = "up" | "down" | "left" | "right";
interface Kf { at: number; dx: number; dy: number; carry?: boolean }
interface ActorDef { id: string; role: string; look: string; dx: number; dy: number; dir: Face; carry?: string; path?: Kf[] }
interface Beat { at: number; every?: number; count?: number; who: string; stagger?: number; attack?: boolean; hop?: number; say?: string; fx?: string; fxDx?: number; fxDy?: number }
interface SceneDef { at: [number, number]; period: number; lineSec: number; actors: ActorDef[]; beats: Beat[] }
type LookDef = { from?: string; set?: NpcSet } & Partial<NpcSet>;
const DATA = D as unknown as {
  nearRadius: number; pauseRadius: number; soundRadius: number;
  fx: Record<string, Record<string, unknown>>;
  looks: Record<FortFaction, Record<string, LookDef>>;
  lines: Record<FortFaction, Record<string, Record<string, string[]>>>;
  scenes: Record<string, SceneDef>;
};

export const FORT_SCENE_CFG = { near: DATA.nearRadius, pause: DATA.pauseRadius, sound: DATA.soundRadius, fx: DATA.fx };
export const FORT_FACTIONS: FortFaction[] = ["solgard", "umbrath"];
/** Центр форта фракции в тайлах: Сольгард — запад, Умбрат — восток. */
export const fortTile = (f: FortFaction) => (f === "solgard" ? FORTS.west : FORTS.east);

export interface FortScene {
  id: string;
  fort: FortFaction;
  kind: string;
  /** Якорь сценки (px): по нему она просыпается и замирает. */
  x: number;
  y: number;
  def: SceneDef;
}
/** Центр клетки со смещением в тайлах (как у горожан: townfolk.ts cellPx). */
const px = (f: FortFaction, dx: number, dy: number) => ({ x: (fortTile(f).x + dx) * TILE + 16, y: (fortTile(f).y + dy) * TILE + 16 });
export const FORT_SCENES: FortScene[] = FORT_FACTIONS.flatMap((fort) => Object.entries(DATA.scenes).map(([kind, def]) => {
  const p = px(fort, def.at[0], def.at[1]);
  return { id: `${fort}:${kind}`, fort, kind, x: p.x, y: p.y, def };
}));

/** Снаряжение бойца сценки: набор data/npc-gear.json (from = ранг:вид:номер) с заменой полей, либо набор целиком. */
export function lookSet(f: FortFaction, look: string): NpcSet {
  const L = DATA.looks[f][look];
  if (!L) throw new Error(`fort-scenes: нет облика ${f}/${look}`);
  if (L.set) return L.set;
  const [tier, kind, n] = (L.from ?? "").split(":");
  const list = NPC_GEAR.sets[f][tier as NpcTier]?.[kind as "melee" | "ranged"];
  if (!list?.length) throw new Error(`fort-scenes: нет набора ${f}/${L.from}`);
  const { from: _from, set: _set, ...over } = L;
  return { ...list[Number(n) % list.length], ...over };
}
/** Реплики пула сценки (тексты из data/texts.json). */
export const sceneLines = (f: FortFaction, kind: string, pool: string): string[] => (DATA.lines[f]?.[kind]?.[pool] ?? []).map((k) => T(k));

const FACE: Record<Face, Dir> = { up: Dir.Up, down: Dir.Down, left: Dir.Left, right: Dir.Right };
export interface Pose {
  id: string;
  x: number;
  y: number;
  dir: Dir;
  walking: boolean;
  /** Подпрыгивание в px (щиты вверх). */
  hop: number;
  /** Сколько ударов сделано с начала времён: смена значения запускает кадры атаки. */
  attacks: number;
  say: string;
  carry: string;
}
const HOP_H = 3;

function matches(def: SceneDef, b: Beat): ActorDef[] { return def.actors.filter((a) => a.id === b.who || a.role === b.who); }
const times = (b: Beat, idx: number): number[] => Array.from({ length: b.count ?? 1 }, (_, k) => b.at + idx * (b.stagger ?? 0) + k * (b.every ?? 0));

function dirOf(dx: number, dy: number): Dir { return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down; }

/** Поза всех бойцов сценки в момент tMs (мс от эпохи). */
export function poseAt(s: FortScene, tMs: number): Pose[] {
  const def = s.def, per = def.period, t = tMs / 1000, cyc = Math.floor(t / per), c = t - cyc * per;
  return def.actors.map((a) => {
    let ax = a.dx, ay = a.dy, dir = FACE[a.dir], walking = false, carry = "";
    if (a.path?.length) {
      const p = a.path, last = p[p.length - 1];
      let k0 = p[0], k1 = p[0];
      if (c >= last.at) k0 = k1 = last;
      else if (c > p[0].at) { const i = p.findIndex((k, j) => c >= k.at && c < p[j + 1].at); k0 = p[i]; k1 = p[i + 1]; }
      const f = k1 === k0 ? 0 : (c - k0.at) / (k1.at - k0.at);
      ax = k0.dx + (k1.dx - k0.dx) * f;
      ay = k0.dy + (k1.dy - k0.dy) * f;
      if (k1.dx !== k0.dx || k1.dy !== k0.dy) { walking = true; dir = dirOf(k1.dx - k0.dx, k1.dy - k0.dy); }
      if (k0.carry && a.carry) carry = a.carry;
    }
    const pos = px(s.fort, ax, ay);
    let hop = 0, attacks = 0, say = "";
    def.beats.forEach((b, bi) => {
      const mine = matches(def, b), idx = mine.indexOf(a);
      if (idx < 0) return;
      const ts = times(b, idx);
      if (b.attack) attacks += cyc * ts.length + ts.filter((x) => x <= c).length;
      if (b.hop) for (const x of ts) if (c >= x && c < x + b.hop) hop = Math.max(hop, Math.abs(Math.sin(((c - x) / b.hop) * Math.PI)) * HOP_H);
      if (b.say) {
        const pool = sceneLines(s.fort, s.kind, b.say);
        ts.forEach((x, k) => { if (c >= x && c < x + def.lineSec && pool.length) say = pool[(cyc * ts.length + k + idx + bi) % pool.length]; });
      }
    });
    return { id: a.id, x: pos.x, y: pos.y, dir, walking, hop, attacks, say, carry };
  });
}

export interface FortFx { kind: string; at: number; x: number; y: number; tx: number; ty: number }
/** События эффектов в (t0, t1] мс: искры наковальни и холостой выстрел катапульты (точка вылета и точка падения в px). */
export function fxBetween(s: FortScene, t0: number, t1: number): FortFx[] {
  const def = s.def, per = def.period * 1000, out: FortFx[] = [];
  for (let cyc = Math.floor(t0 / per); cyc <= Math.floor(t1 / per); cyc++) {
    for (const b of def.beats) {
      const kind = b.fx;
      if (!kind) continue;
      matches(def, b).forEach((a, idx) => {
        for (const x of times(b, idx)) {
          const at = cyc * per + x * 1000;
          if (at <= t0 || at > t1) continue;
          if (kind === "shot") {
            const sh = DATA.fx.shot as { from: [number, number]; dir: Record<string, number>; range: number; dy: number };
            const f = px(s.fort, sh.from[0], sh.from[1]), to = px(s.fort, sh.from[0] + sh.dir[s.fort] * sh.range, sh.from[1] + sh.dy);
            out.push({ kind, at, x: f.x, y: f.y, tx: to.x, ty: to.y });
          } else {
            const pose = poseAt(s, at).find((q) => q.id === a.id)!;
            out.push({ kind, at, x: pose.x + (b.fxDx ?? 0), y: pose.y + (b.fxDy ?? 0), tx: 0, ty: 0 });
          }
        }
      });
    }
  }
  return out;
}

/** Сценка бодрствует, если герой ближе nearRadius к её якорю; без героев (или далеко) все спят. */
export function scenesNear(heroes: { x: number; y: number }[]): FortScene[] {
  return FORT_SCENES.filter((s) => heroes.some((h) => Math.hypot(h.x - s.x, h.y - s.y) < DATA.nearRadius));
}
