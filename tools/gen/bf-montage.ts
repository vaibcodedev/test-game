/** Монтажи «наш | эталон из пака» шага 9 задачи 132 → tools/out/map-step9/. Слева (золотые подписи) — наше, справа (бежевые) — пак; герой 32 px — линейка. */
import path from "node:path";
import { PC } from "./canvas";
import { ROOT, readPng, writePng, scaleNN, fill, paintGround, chipText, textWidth, trim, crop, BG, BEIGE, GOLD } from "./vendor-lib";
import type { Anim } from "./battlefield";

const OBJ = path.join(ROOT, "client/public/assets/objects");
type Item = { id: string; frame?: number };
interface Row { title: string; ours: Item[]; refs: Item[] }

export function buildMontages(made: Record<string, PC>, anims: Anim[]) {
  const byAnim = new Map(anims.map((a) => [a.id, a]));
  const get = (it: Item): PC => {
    const a = byAnim.get(it.id);
    if (a) return a.frames[Math.min(a.frames.length - 1, it.frame ?? 0)];
    return made[it.id] ?? readPng(path.join(OBJ, `${it.id}.png`));
  };
  const hero = trim(crop(readPng(path.join(ROOT, "client/public/assets/units/warrior.png")), 0, 0, 32, 32)).pc;
  const rows: Record<string, Row[]> = {
    "01-towers-gates": [
      { title: "WALL TOWERS", ours: [{ id: "bf_wall_tower_sol" }, { id: "bf_wall_tower_umb" }, { id: "sol_tower" }], refs: [{ id: "v_fortkit_tower_block" }, { id: "v_fortkit_wall_low_a" }, { id: "v_fortkit_gate_arch" }] },
      { title: "GATES", ours: [{ id: "bf_palisade_gate" }, { id: "sol_gate" }], refs: [{ id: "bf-gate-stone", frame: 0 }, { id: "bf-gate-stone", frame: 7 }, { id: "v_basic_palisade_5" }] },
    ],
    "02-tents-camp": [
      { title: "TENTS", ours: [{ id: "bf_tent_sol" }, { id: "bf_tent_sol_cmd" }, { id: "bf_tent_umb" }, { id: "bf_tent_umb_cmd" }, { id: "bf_tent_torn" }, { id: "bf_tent_burnt" }], refs: [{ id: "v_deco_tent_side" }] },
      { title: "CAMP", ours: [{ id: "bf_map_table" }, { id: "bf_shield_stand" }, { id: "bf_spike_barrier" }, { id: "bf_sword_planted" }, { id: "bf_sword_planted_dark" }, { id: "bf_arrows_planted" }], refs: [{ id: "v_deco_spear_rack" }, { id: "v_deco_target" }, { id: "bf-dummy-0", frame: 0 }, { id: "v_deco_stocks" }] },
      { title: "FORGE", ours: [{ id: "bf-forge-cone", frame: 0 }], refs: [{ id: "v_smith_forge_cone" }, { id: "v_smith_anvil_a" }, { id: "v_smith_tool_rack" }] },
    ],
    "03-fallen": [
      { title: "BODIES", ours: [{ id: "bf_fallen_sol_a" }, { id: "bf_fallen_sol_b" }, { id: "bf_fallen_umb_a" }, { id: "bf_fallen_umb_b" }, { id: "bf_skeleton_armor" }, { id: "bf_horse_fallen_sol" }, { id: "bf_horse_fallen_umb" }], refs: [{ id: "v_undead_giant_skeleton" }, { id: "v_undead_skull_cluster" }, { id: "v_undead_ribs" }, { id: "v_undead_ruin_a" }] },
      { title: "WAGONS", ours: [{ id: "bf_wagon_broken_a" }, { id: "bf_wagon_broken_b" }, { id: "bf_blood_a" }, { id: "bf_scorch" }], refs: [{ id: "v_deco_wagon_open" }, { id: "v_deco_wagon_covered" }, { id: "v_deco_wheels" }] },
    ],
    "04-siege": [
      { title: "SIEGE", ours: [{ id: "bf-trebuchet", frame: 0 }, { id: "bf-trebuchet", frame: 6 }, { id: "bf-trebuchet", frame: 9 }, { id: "bf_ram" }, { id: "bf_siege_tower" }], refs: [{ id: "bf-catapult-w", frame: 0 }, { id: "bf-catapult-w", frame: 6 }, { id: "bf-ballista-w", frame: 0 }, { id: "bf-ballista-w", frame: 8 }] },
    ],
    "05-fire": [
      { title: "FIRE", ours: [{ id: "bf-fire-m", frame: 0 }, { id: "bf-fire-m", frame: 8 }, { id: "bf-fire-l", frame: 0 }, { id: "bf-fire-t", frame: 0 }, { id: "bf-flame-torch", frame: 3 }], refs: [{ id: "bf-smoke", frame: 0 }, { id: "bf-forge-small", frame: 0 }] },
    ],
  };
  for (const [name, rs] of Object.entries(rows)) {
    const PAD = 8, M = 8, GAP = 20;
    const lay = rs.map((r) => {
      const cells = (items: Item[]) => items.map((it) => { const pc = get(it); return { pc, label: it.id.replace(/^(bf_|bf-|v_)/, "").slice(0, 16), w: Math.max(pc.w, textWidth(it.id.slice(0, 16)) + 2) + PAD }; });
      const o = cells(r.ours), f = cells(r.refs);
      return { r, o, f, w: o.reduce((s, c) => s + c.w, 0) + f.reduce((s, c) => s + c.w, 0) + GAP + 36, h: Math.max(...[...o, ...f].map((c) => c.pc.h), 32) + 22 };
    });
    const W = Math.max(...lay.map((l) => l.w)) + M * 2, H = lay.reduce((s, l) => s + l.h, 0) + M * 2 + 10;
    const sh = new PC(W, H); fill(sh, BG); paintGround(sh, M, M + 10, W - M * 2, H - M * 2 - 10);
    chipText(sh, "OURS (GOLD) | PACK REFERENCE (BEIGE)", M + 2, M, GOLD);
    let y = M + 10;
    for (const l of lay) {
      const base = y + l.h - 14;
      sh.blit(hero, M + 2, base - hero.h);
      let x = M + 36;
      for (const c of l.o) { sh.blit(c.pc, x + Math.floor((c.w - PAD - c.pc.w) / 2), base - c.pc.h); chipText(sh, c.label, x, base + 3, GOLD); x += c.w; }
      sh.rect(x + 4, y + 4, 1, l.h - 8, [18, 15, 22, 235]); x += GAP;
      for (const c of l.f) { sh.blit(c.pc, x + Math.floor((c.w - PAD - c.pc.w) / 2), base - c.pc.h); chipText(sh, c.label, x, base + 3, BEIGE); x += c.w; }
      y += l.h;
    }
    writePng(scaleNN(sh, 2), path.join(ROOT, "tools/out/map-step9", `${name}.png`));
  }
}
