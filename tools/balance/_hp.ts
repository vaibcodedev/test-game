import { healPowerMult, pvpDamageMult, manaMult, mobHpAt, petDmgGrowth } from "../../shared/balance";
for (const l of [1, 10, 30, 60, 100]) console.log(l, "heal", healPowerMult(l).toFixed(3), "pvp", pvpDamageMult(l).toFixed(4), "mana", manaMult("mage", l).toFixed(2), "mobHp", Math.round(mobHpAt(l)), "pet", petDmgGrowth(l).toFixed(2));
