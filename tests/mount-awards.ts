/** Офлайн: трофеи маунтов — рейд (raidMountTrophies), арена (arenaMountRewards), без дублей и с учётом фракции. */
import assert from "node:assert/strict";
import { arenaMountRewards, raidMountTrophies } from "../server/src/game/mountDrops";

const mk = (faction: string) => {
  const toasts: string[] = [];
  return { faction, save: {} as { mounts?: string[]; mount?: string }, selfDirty: false, send: (_: string, d: { text: string }) => toasts.push(d.text), toasts } as never as {
    faction: string; save: { mounts?: string[]; mount?: string }; toasts: string[];
  };
};
const rnd = Math.random;
Math.random = () => 0;
const a = mk("solgard");
raidMountTrophies(a as never, "chaos_knight");
assert.deepEqual(a.save.mounts?.sort(), ["nightmare", "phoenix"], "рейд: оба трофея, без фракции");
assert.equal(a.save.mount, a.save.mounts?.[0] === "phoenix" ? "nightmare" : a.save.mount);
raidMountTrophies(a as never, "chaos_knight");
assert.equal(a.save.mounts?.length, 2, "без дублей");
raidMountTrophies(mk("umbrath") as never, "other_raid");
Math.random = () => 0.99;
const b = mk("solgard");
raidMountTrophies(b as never, "chaos_knight");
assert.equal(b.save.mounts, undefined, "шанс не выпал");
Math.random = rnd;
arenaMountRewards(a as never, 99);
assert.ok(!a.save.mounts?.includes("griffin"), "99 побед — грифона нет");
arenaMountRewards(a as never, 100);
assert.ok(a.save.mounts?.includes("griffin"), "100 побед — грифон (Сольгард)");
assert.ok(!a.save.mounts?.includes("wyvern"), "виверна — только Умбрат");
const u = mk("umbrath");
arenaMountRewards(u as never, 60);
assert.deepEqual(u.save.mounts, ["wyvern"]);
console.log("mount-awards: OK");
