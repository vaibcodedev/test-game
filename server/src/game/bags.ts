/** Расширение сумки у сумочника (Эмберхолл или столица): проверки, золото и размер меняются вместе, сохранение — транзакцией. */
import { BAGMEN, BAG_STEP, bagPrice } from "../../../shared/bags";
import { MERCHANT_RANGE } from "../../../shared/constants";
import { serviceRefusal } from "../../../shared/npcs";
import type { GameDB } from "../db";
import type { Player } from "./Player";
import type { World } from "./World";
import { T } from "../../../shared/texts";

export function expandBag(w: World, db: GameDB, spawn: { x: number; y: number }, p: Player, busy: boolean) {
  const err = (text: string) => p.send("toast", { text, kind: "error" });
  if (p.dead) return err(T("srv.bags.54"));
  if (p.team !== 0 || busy) return err(T("srv.bags.55"));
  if (!BAGMEN.some((b) => w.dist(p, b) <= MERCHANT_RANGE)) return err(T("srv.bags.56"));
  const no = serviceRefusal("bags", p.x, p.y, p.faction, MERCHANT_RANGE);
  if (no) return err(no);
  const size = p.save.inventory.length;
  const price = bagPrice(size);
  if (price === null) return err(T("srv.bags.57"));
  if (p.save.gold < price) return err(T("srv.bags.58"));
  p.save.gold -= price;
  for (let i = 0; i < BAG_STEP; i++) p.save.inventory.push(null);
  try {
    db.raw.exec("BEGIN IMMEDIATE");
    db.save(p.name, p.toSave(spawn));
    db.raw.exec("COMMIT");
  } catch (ex) {
    try { db.raw.exec("ROLLBACK"); } catch {}
    console.error("[bags]", ex);
    p.save.gold += price;
    p.save.inventory.length = size;
    p.selfDirty = true;
    return err(T("srv.bags.59"));
  }
  p.selfDirty = true;
  p.send("toast", { text: T("srv.bags.60", { bag_step: size + BAG_STEP }), kind: "loot" });
}
