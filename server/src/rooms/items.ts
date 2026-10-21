/** Сумка в инстансах (рейд): подбор мешков, зелья, надеть/снять, перестановка. В мире те же операции регистрирует WorldRoom (с замком обмена). */
import { equip, pickup, swap, unequip, useBase, useItem } from "../game/inventory";
import type { World } from "../game/World";
import type { On } from "./common";

export function registerItems(on: On, world: () => World) {
  const w = world;
  on<{ bag: unknown }>("pickup", (p, m) => pickup(w(), p, m.bag));
  on<{ index: unknown }>("use", (p, m) => useItem(w(), p, m.index));
  on<{ base: unknown }>("use:base", (p, m) => useBase(w(), p, m.base));
  on<{ index: unknown }>("equip", (p, m) => equip(w(), p, m.index));
  on<{ slot: unknown }>("unequip", (p, m) => unequip(w(), p, m.slot));
  on<{ a: unknown; b: unknown }>("swap", (p, m) => swap(p, m.a, m.b));
}
