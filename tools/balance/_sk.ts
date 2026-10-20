// Умения класса: ранг, открытие, cd, мана, параметры на максимуме
import { classSkills } from "../../shared/skills";
const cls = process.argv[2] as never;
for (const s of classSkills(cls)) {
  const v = s.v(s.maxRank);
  console.log(`${s.id.padEnd(18)} ${s.kind.padEnd(7)} r${s.maxRank} L${s.reqLevel} ${s.kind === "active" ? `cd${s.cd!(s.maxRank)} mp${s.mana!(s.maxRank)}` : ""} ${JSON.stringify(v)}`);
}
