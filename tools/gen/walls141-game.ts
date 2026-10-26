/**
 * Задача 141, этап 2: кадры новых стен, башен, ворот, зданий и частокола для игры (npm run assets → assets/objects/).
 * Для каждого вида из shared/cityart.ts (ART_KINDS) — кадр <kind>__<уровень>-<токен> на все варианты и общий кадр <kind>
 * (первый вариант первого уровня: на случай объекта без v). Ворота — три кадра: open (стоит в игре), closed и broken (для открывания и осады).
 */
import type { PC } from "./canvas";
import { ART_KINDS, artTokens, type ArtTier } from "../../shared/cityart";
import { LOOKS, type Look, type Wear } from "./walls141-lib";
import { archerTower, gate, palisadeCorner, palisadeGate, palisadeH, palisadePost, palisadeV, towerRound, towerSquare, wallH, wallV, type GateState } from "./walls141-walls";
import { buildingsFor } from "./walls141-buildings";

const factionOf = (kind: string) => (kind.startsWith("sol_") || kind.endsWith("_sol") ? "sol" : kind.startsWith("umb_") || kind.endsWith("_umb") ? "umb" : "ember");
function lookOf(kind: string, tier: ArtTier): Look {
  const f = factionOf(kind);
  if (f === "ember") return LOOKS.ember;
  return LOOKS[`${f}_${tier === "cap" ? "capital" : tier === "fort" ? "fort" : "settle"}`];
}
const seedOf = (s: string) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 5) + 1; };

/** Кадр варианта вида. */
function build(kind: string, tier: ArtTier, tok: string): PC {
  const L = lookOf(kind, tier), role = ART_KINDS[kind].role, seed = seedOf(kind + tok);
  switch (role) {
    case "wall_h": {
      const feat = tok === "slit" ? "slit" : tok === "emblem" ? (L.tier === "capital" ? "emblem" : "putlog") : "none";
      return wallH(L, (feat !== "none" ? "clean" : tok) as Wear, seed, feat);
    }
    case "wall_v": return wallV(L, tok as Wear, seed);
    case "tower": {
      const [pos, wear = "clean"] = tok.split("-") as [string, Wear?];
      const corner = pos === "corner", w = wear as Wear;
      if (L.tier === "fort") return towerSquare(L, corner ? "hoard" : "crest", w, seed);
      if (L.faction === "ember") return towerSquare(L, corner ? "pyramid" : "crest", w, seed);
      if (L.faction === "sol") return towerRound(L, corner ? "cone" : "dome", w, seed);
      return corner ? towerRound(L, "spire", w, seed) : towerSquare(L, "spire", w, seed);
    }
    case "gate": return gate(L, tok as GateState, "clean", 5);
    case "pal_gate": return palisadeGate(L, tok as GateState, "clean", 3);
    case "house": {
      const i = tok.lastIndexOf("-"), type = tok.slice(0, i), wear = tok.slice(i + 1) as Wear;
      return buildingsFor(L)[type](wear, seed);
    }
    case "pal_h": return palisadeH(L, tok as Wear, seed);
    case "pal_v": return palisadeV(L, tok as Wear, seed);
    case "pal_post": return palisadePost(L, tok as Wear, seed);
    case "pal_corner": { const [side, wear] = tok.split("-"); return palisadeCorner(L, side as "e" | "w", wear as Wear, seed); }
  }
}

/** Все кадры: id → построитель (как OBJECT_ART в tools/gen/objects.ts). */
export function walls141Art(): Record<string, () => PC> {
  const out: Record<string, () => PC> = {};
  for (const [kind, a] of Object.entries(ART_KINDS)) {
    for (const tier of a.tiers) for (const tok of artTokens(kind, tier)) out[`${kind}__${tier}-${tok}`] = () => build(kind, tier, tok);
    const t0 = a.tiers[0], first = artTokens(kind, t0)[0];
    out[kind] = () => build(kind, t0, first);
  }
  // вышки лучников у стен вдоль рек (shared/map.ts, server soldiers.ts): в стиле 141, камень фортов своей фракции (как и tools/gen/bf-gen.ts)
  out.bf_wall_tower_sol = () => archerTower(LOOKS.sol_fort, 2);
  out.bf_wall_tower_umb = () => archerTower(LOOKS.umb_fort, 3);
  return out;
}
