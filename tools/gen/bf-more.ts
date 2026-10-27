/** Варианты уже объёмных предметов Полей (volume-bf.ts) для листа сравнения и сборки: рогатки, повозки, шатры, катапульты. */
import { BF_VOLUME } from "./volume-bf";
export const BF_MORE_GROUPS: [string, string[]][] = [
  ["рогатки", ["bf_spike_barrier", "bf_spike_barrier_b", "bf_spike_barrier_c", "bf_spike_barrier_d"]],
  ["повозки", ["bf_wagon_broken_a", "bf_wagon_broken_b", "bf_wagon_broken_c", "bf_wagon_broken_d", "bf_wagon_broken_e"]],
  ["шатры разбитые", ["bf_tent_torn", "bf_tent_torn_b", "bf_tent_torn_c", "bf_tent_burnt", "bf_tent_burnt_b", "bf_tent_burnt_c"]],
  ["катапульты", ["bf_catapult_wreck_a", "bf_catapult_wreck_b", "bf_catapult_wreck_c"]],
  ["стойка щитов", ["bf_shield_stand", "bf_shield_stand_sol", "bf_shield_stand_umb", "bf_shield_stand_b"]],
  ["стол с картой", ["bf_map_table", "bf_map_table_umb", "bf_map_table_b", "bf_map_table_c"]],
];
export const BF_MORE: Record<string, () => PC> = Object.fromEntries(BF_MORE_GROUPS.flatMap(([, ids]) => ids).filter((id) => BF_VOLUME[id]).map((id) => [id, BF_VOLUME[id]]));
import type { PC } from "./canvas";
