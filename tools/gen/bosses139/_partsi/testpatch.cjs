const fs = require("fs");
let s = fs.readFileSync("tests/zone-bosses.ts", "utf8");
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const anchor = "    if (ab.safe) {" + nl + "      // укрытия: в миг удара урон получает только тот, кто вне всех столбов";
if (!s.includes(anchor)) throw new Error("anchor");
const add = `    if (ab.bearers) {
      // носильщики: после замаха count стражей по краю арены и щит ×shield; дошедшие лечат босса на healPct каждый, убитые — нет; при сбросе убраны
      const bz = ab.bearers;
      for (const mode of ["walk", "kill"] as const) {
        mob.reset();
        for (const a of boss.abilities) a.at = 1e9;
        const p = hero("warrior", mob.x + 150, mob.y + 30, c.levels.boss);
        mob.state = "chase";
        mob.targetId = p.id;
        mob.addThreat(p.id, 100);
        mob.attackAt = w.time + 1e9;
        log.length = 0;
        mob.unit.hp = Math.floor(mob.unit.maxHp * 0.5);
        const hp0 = mob.unit.hp;
        boss.run(ab);
        for (let t = 0; t < ab.windupMs + 300; t += 50) { p.unit.hp = p.unit.maxHp; mob.attackAt = w.time + 1e9; w.update(50); }
        const bs = [...w.mobs.values()].filter((m) => m.def.id === \`\${c.id}_bearer\` && !m.dead);
        const edge = bs.every((m) => Math.hypot(m.x - mob.home.x, m.y - mob.home.y) > 150);
        check(\`\${c.id}.\${ab.id}: \${bz.count} носильщиков встали по краю арены, босс под щитом ×\${bz.shield}\`, bs.length === bz.count && edge && mob.dmgTakenMul === bz.shield, \`носильщиков \${bs.length}, щит \${mob.dmgTakenMul}\`);
        check(\`\${c.id}.\${ab.id}: носильщик — без добычи (опыт 0, золото 0), не бьёт\`, bs.every((d) => d.def.xp === 0 && d.def.gold === 0 && d.def.dmg === 0), \`\${bs[0]?.def.xp}/\${bs[0]?.def.gold}\`);
        const d0 = Math.hypot(bs[0].x - mob.x, bs[0].y - mob.y);
        let killed = 0;
        if (mode === "kill") { for (const b of bs.slice(0, 2)) { w.killMob(b, p); killed++; } }
        for (let t = 0; t < 600; t += 50) { p.unit.hp = p.unit.maxHp; mob.attackAt = w.time + 1e9; w.update(50); }
        const d1 = Math.hypot(bs[bs.length - 1].x - mob.x, bs[bs.length - 1].y - mob.y);
        check(\`\${c.id}.\${ab.id}: носильщики идут к боссу (\${Math.round(d0)} → \${Math.round(d1)} px)\`, d1 < d0 - 10, \`\${Math.round(d0)} → \${Math.round(d1)}\`);
        for (let t = 0; t < (d0 / bz.speed) * 1000 + 1500; t += 50) { p.unit.hp = p.unit.maxHp; mob.attackAt = w.time + 1e9; mob.unit.hp = Math.min(mob.unit.hp, mob.unit.maxHp * 0.99); w.update(50); }
        const reached = bz.count - killed;
        const heal = mob.unit.hp - hp0;
        check(\`\${c.id}.\${ab.id}: дошедших \${reached} — босс вылечен на \${Math.round(reached * bz.healPct * 100)} %, щит снят\`, Math.abs(heal - reached * bz.healPct * mob.unit.maxHp) <= mob.unit.maxHp * 0.011 && mob.dmgTakenMul === 1 && ![...w.mobs.values()].some((m) => m.def.id === \`\${c.id}_bearer\` && !m.dead), \`вылечен на \${Math.round((heal / mob.unit.maxHp) * 1000) / 10} %, щит \${mob.dmgTakenMul}\`);
        mob.reset();
        w.update(100);
        check(\`\${c.id}.\${ab.id}: при сбросе боя носильщики убраны\`, ![...w.mobs.values()].some((m) => m.def.id === \`\${c.id}_bearer\` && !m.dead));
        w.removePlayer(p.id);
      }
      continue;
    }
`.split("\n").join(nl);
s = s.replace(anchor, add + anchor);
fs.writeFileSync("tests/zone-bosses.ts", s);
console.log("ok");
