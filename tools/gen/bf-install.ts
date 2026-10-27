/** Предпросмотр: кладёт кадры коней в client/public/assets/objects и дописывает в manifest.json (полный npm run assets сделает то же). Запуск: npx tsx tools/gen/bf-install.ts */
import fs from "node:fs";
import path from "node:path";
import { BF_HORSES_ART } from "./bf-horses";
const root = "client/public/assets/", mfp = root + "manifest.json";
const raw = fs.readFileSync(mfp, "utf8"), crlf = raw.includes("\r\n"), m = JSON.parse(raw);
for (const [id, f] of Object.entries(BF_HORSES_ART)) { const pc = f(); pc.save(path.join(root, "objects", id + ".png")); m.objects[id] = { w: pc.w, h: pc.h }; }
delete m.objects.bf_horse_n_a; delete m.objects.bf_horse_n_b; // нейтральные кони убраны: их заменили боевые кони по модели маунта
let out = JSON.stringify(m, null, 1);
if (crlf) out = out.replace(/\n/g, "\r\n");
fs.writeFileSync(mfp, out);
console.log("кадров записано:", Object.keys(BF_HORSES_ART).length);
