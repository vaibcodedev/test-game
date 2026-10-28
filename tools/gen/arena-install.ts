/** Установка арен PvP в клиент: запечённая картинка и зрители (client/public/assets/arena), укрытия — объекты arena_cover_<id> в атласе. */
import fs from "node:fs";
import path from "node:path";
import { SPECS, renderArena } from "./arena-art";
import { arenaCoverKind } from "../../shared/arena";
import { buildObjectAtlases } from "./atlas";

const hexOf = (c: number[]) => "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
const OUT = path.resolve("client/public/assets"), mf = path.join(OUT, "manifest.json");
const m = JSON.parse(fs.readFileSync(mf, "utf8"));
fs.mkdirSync(path.join(OUT, "arena"), { recursive: true });
for (const sp of SPECS) {
  const a = renderArena(sp);
  a.bg.save(path.join(OUT, `arena/${sp.id}.png`));
  const norm = (r: number) => Math.round(((r + Math.PI) / (Math.PI * 2)) * 360) % 360;
  fs.writeFileSync(path.join(OUT, `arena/${sp.id}.json`), JSON.stringify({ w: a.w, h: a.h, standing: sp.standing, s: a.spectators.map((s) => [s.x, s.y, s.type, s.ring, norm(s.ang)]),
    lights: a.lights.map((l) => [Math.round(l.x), Math.round(l.y), (l.col[0] << 16) | (l.col[1] << 8) | l.col[2], l.r, l.a, l.glow]),
    banners: a.banners.map((b) => [b.x, b.y, b.len]), look: { accent: hexOf(a.theme.accent), trim: hexOf(a.theme.trim), emblem: sp.id === "ash" ? "skull" : sp.id === "frost" ? "ice" : sp.id === "pit" ? "fang" : "cross" } }));
  for (const [im, b] of [[a.coverA, false], [a.coverB, true]] as const) {
    const id = arenaCoverKind(sp.id, b);
    im.save(path.join(OUT, `objects/${id}.png`));
    m.objects[id] = { w: im.w, h: im.h };
  }
  console.log(sp.id, "зрителей", a.spectators.length);
}
const atl = buildObjectAtlases(OUT, Object.keys(m.objects));
m.atlases = atl.atlases; m.atlasOf = atl.atlasOf;
fs.writeFileSync(mf, JSON.stringify(m, null, 1));
console.log("arena installed");
