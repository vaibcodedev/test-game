/** Скачивание бесплатных паков эффектов с itch.io в vendor/vfx-<id>/ (задача 127, шаг 1).
 *  Запуск:  tsx tools/gen/vfx-fetch.ts list <id|url>   — показать загрузки страницы;
 *           tsx tools/gen/vfx-fetch.ts get [id ...]     — скачать паки из реестра PACKS (без аргументов — все).
 *  Поток itch: страница (csrf_token) → POST …/download_url → страница загрузок → POST …/file/<upload_id> → прямая ссылка.
 *  Ключ скачивания живёт секунды, поэтому весь поток идёт за один прогон. vendor/ в .gitignore: лицензии запрещают раздачу файлов. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Корень репозитория (не тянем vendor-lib: он читает shared/map.ts, который правят параллельно). */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export interface Pack {
  id: string;
  /** Страница игры на itch.io. */
  page: string;
  /** Регулярка по имени загрузки (без учёта регистра). Берётся первая подошедшая. */
  file: string;
  /** Автор и лицензия для LICENSE.txt и CREDITS. */
  author: string;
  license: string;
  title: string;
  /** Скачать все подходящие загрузки (а не первую). */
  many?: boolean;
}

export const PACKS: Pack[] = [
  { id: "sds-holy", page: "https://sentient-dream-studio.itch.io/pixel-holy-effects-pack01", file: ".", author: "Sentient Dream Studio", title: "Pixel Holy Effects Pack 01",
    license: "Бесплатный пак (itch.io, цена $0). Лицензия автора: можно использовать в своих проектах, в том числе коммерческих; перепродавать и раздавать сами файлы пака нельзя. Поэтому vendor/ в .gitignore, а в игру попадают только перекрашенные нормализованные листы из tools/out (тоже вне git)." },
  { id: "foozle-magic", page: "https://foozlecc.itch.io/pixel-magic-sprite-effects", file: "magic_effects|\\.zip", author: "Foozle", title: "Pixel Magic Effects (2DE0001)",
    license: "CC0 1.0 (общественное достояние): использовать, менять и раздавать можно без ограничений, указывать автора не обязательно (но Foozle просит ссылку на foozle.io)." },
  { id: "pimen-dark", page: "https://pimen.itch.io/dark-spell-effect", file: "Dark VFX 01", author: "pimen", title: "Dark VFX 01–02 (Dark Spell Effect)",
    license: "Бесплатный пак pimen (itch.io, цена $0). Использовать в своих проектах можно, в том числе коммерческих; перепродавать и раздавать сами файлы нельзя. vendor/ в .gitignore." },
  { id: "pimen-smear", page: "https://pimen.itch.io/battle-vfx-slashes-and-thrusts", file: "Smear", author: "pimen", title: "Smear VFX 01 (Battle VFX: Slashes and Thrusts)",
    license: "Бесплатный пак pimen (itch.io, цена $0). Использовать в своих проектах можно, в том числе коммерческих; перепродавать и раздавать сами файлы нельзя. vendor/ в .gitignore." },
  { id: "pimen-hit", page: "https://pimen.itch.io/battle-vfx-hit-spark", file: "Hit", author: "pimen", title: "Hit Effect 01 (Battle VFX: Hit Spark)",
    license: "Бесплатный пак pimen (itch.io, цена $0). Использовать в своих проектах можно, в том числе коммерческих; перепродавать и раздавать сами файлы нельзя. vendor/ в .gitignore." },
];

const SDS_LIC = "Бесплатный пак Sentient Dream Studio (itch.io, цена $0). Можно использовать в своих проектах, в том числе коммерческих; перепродавать, раздавать как отдельные файлы и включать в другие паки нельзя, даже изменённые. Поэтому vendor/ и перекрашенные листы вне git (см. .gitignore). Указание автора желательно: «Pixel art effects by Sentient Dream Studio».";
const PIMEN_LIC = "Бесплатный пак pimen (itch.io, цена $0). Использовать в своих проектах можно, в том числе коммерческих; перепродавать и раздавать сами файлы нельзя. vendor/ и листы из него вне git.";
PACKS.push(
  { id: "sds-poison", page: "https://sentient-dream-studio.itch.io/pixel-vfx-3-poison-attacks-mini-pack", file: ".", author: "Sentient Dream Studio", title: "Pixel VFX 3 Poison Attacks (mini pack)", license: SDS_LIC },
  { id: "sds-expl", page: "https://sentient-dream-studio.itch.io/pixel-effects-explosions-pack-01", file: ".", author: "Sentient Dream Studio", title: "Pixel Explosion Effects Pack 01", license: SDS_LIC },
  { id: "sds-levelup", page: "https://sentient-dream-studio.itch.io/pixel-vfx-level-up-effect", file: ".", author: "Sentient Dream Studio", title: "Pixel VFX Level Up Effect", license: SDS_LIC },
  { id: "sds-dark", page: "https://sentient-dream-studio.itch.io/pixel-vfx-dark-spells", file: ".", author: "Sentient Dream Studio", title: "Pixel VFX Dark Spells", license: SDS_LIC },
  { id: "pimen-thunder1", page: "https://pimen.itch.io/thunder-spell-effect-01", file: ".", author: "pimen", title: "Thunder Effect 01", license: PIMEN_LIC },
  { id: "pimen-thunder2", page: "https://pimen.itch.io/thunder-spell-effect-02", file: ".", author: "pimen", title: "Thunder Effect 02", license: PIMEN_LIC },
  { id: "pimen-ice", page: "https://pimen.itch.io/ice-spell-effect-01", file: ".", author: "pimen", title: "Ice Effect 01", license: PIMEN_LIC },
  { id: "pimen-acid", page: "https://pimen.itch.io/acid-spell-effect", file: ".", author: "pimen", title: "Acid VFX 01–02", license: PIMEN_LIC },
  { id: "pimen-smoke", page: "https://pimen.itch.io/smoke-vfx-1", file: ".", author: "pimen", title: "Smoke Effect 01", license: PIMEN_LIC },
  { id: "pimen-earth1", page: "https://pimen.itch.io/earth-spell-effect-01", file: ".", author: "pimen", title: "Earth Effect 01", license: PIMEN_LIC },
  { id: "pimen-earth2", page: "https://pimen.itch.io/earth-spell-effect-2", file: ".", author: "pimen", title: "Earth Effect 02", license: PIMEN_LIC },
  { id: "pimen-battle", page: "https://pimen.itch.io/pixel-battle-effects", file: ".", many: true, author: "pimen", title: "Pixel Battle Effects", license: "Creative Commons Attribution 4.0 (CC BY 4.0): можно использовать и менять, в том числе в коммерческих проектах, с указанием автора — pimen (https://pimen.itch.io). См. docs/content/credits.md." },
  { id: "ninja", page: "https://pixel-boy.itch.io/ninja-adventure-asset-pack", file: "^Ninja Adventure - Asset", author: "Pixel-boy (Ninja Adventure)", title: "Ninja Adventure Asset Pack", license: "CC0 1.0 (общественное достояние): использовать, менять и раздавать можно без ограничений, указывать автора не обязательно." },
  { id: "impactforge", page: "https://impactforce-fx.itch.io/impactforge-fx-slash-effect-pack", file: ".", author: "ImpactForge FX", title: "ImpactForge FX Slash Effect Pack (Pack 3 Slash)", license: "Бесплатный пак (itch.io, цена $0). Использовать в проектах можно; перепродавать и раздавать сами файлы нельзя. vendor/ и листы из него вне git." },
  { id: "srzolda", page: "https://srzolda.itch.io/magic-summons", file: "Sheet|sheet", many: true, author: "SrZolda", title: "Free Magic Summons", license: "Creative Commons Attribution 4.0 (CC BY 4.0): можно использовать и менять, в том числе в коммерческих проектах, с указанием автора — SrZolda (https://srzolda.itch.io). См. docs/content/credits.md." },
);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** Мини-куки: имя → значение, обновляются из set-cookie каждого ответа. */
class Jar {
  m = new Map<string, string>();
  take(res: Response) { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); if (i > 0) this.m.set(kv.slice(0, i).trim(), kv.slice(i + 1)); } }
  get header() { return [...this.m].map(([k, v]) => `${k}=${v}`).join("; "); }
}

async function req(jar: Jar, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = { "User-Agent": UA, Cookie: jar.header, ...(init.headers as Record<string, string> | undefined) };
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  jar.take(res);
  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) return req(jar, new URL(res.headers.get("location")!, url).href, { headers: init.headers });
  return res;
}

const csrfOf = (html: string) => /name="csrf_token" value="([^"]*)"/.exec(html)?.[1] ?? "";
const postForm = (jar: Jar, url: string, csrf: string, referer: string) =>
  req(jar, url, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest", Referer: referer, "Content-Type": "application/x-www-form-urlencoded" }, body: `csrf_token=${encodeURIComponent(csrf)}` });

export interface Upload { id: string; name: string; size: string }

/** Страница загрузок: пары (id, имя, размер). Вызывающий сразу же качает нужный файл тем же jar. */
async function downloadPage(jar: Jar, page: string): Promise<{ dl: string; csrf: string; uploads: Upload[] }> {
  // VFX_DEBUG=<каталог> — сохранить страницу загрузок для разбора разметки
  const html = await (await req(jar, page)).text();
  const c1 = csrfOf(html);
  if (!c1) throw new Error(`нет csrf на ${page}`);
  const r1 = (await (await postForm(jar, `${page}/download_url`, c1, page)).json()) as { url?: string };
  if (!r1.url) throw new Error(`нет ссылки загрузки у ${page}: ${JSON.stringify(r1)}`);
  const dlHtml = await (await req(jar, r1.url)).text();
  if (process.env.VFX_DEBUG) fs.writeFileSync(path.join(process.env.VFX_DEBUG, page.split("/").pop() + ".html"), dlHtml);
  // каждая загрузка — блок <div class="upload">: id, имя (class и title могут стоять в любом порядке), размер
  const uploads: Upload[] = dlHtml.split(/<div class="upload">/).slice(1).map((blk) => ({
    id: /data-upload_id="(\d+)"/.exec(blk)?.[1] ?? "",
    name: /class="name"[^>]*title="([^"]*)"|title="([^"]*)"[^>]*class="name"/.exec(blk)?.slice(1).find(Boolean) ?? "?",
    size: /class="file_size"><span>([^<]*)</.exec(blk)?.[1] ?? "?",
  })).filter((u) => u.id);
  return { dl: r1.url, csrf: csrfOf(dlHtml), uploads };
}

export async function listUploads(page: string): Promise<Upload[]> {
  return (await downloadPage(new Jar(), page)).uploads;
}

export async function fetchPack(p: Pack): Promise<string> {
  const jar = new Jar();
  const { dl, csrf, uploads } = await downloadPage(jar, p.page);
  const re = new RegExp(p.file, "i");
  const picked = p.many ? uploads.filter((u) => re.test(u.name)) : uploads.filter((u) => re.test(u.name)).slice(0, 1);
  if (!picked.length) throw new Error(`${p.id}: нет загрузки по /${p.file}/ среди ${uploads.map((u) => u.name).join(" | ")}`);
  const dir = path.join(ROOT, "vendor", `vfx-${p.id}`);
  fs.mkdirSync(dir, { recursive: true });
  const tar = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\Windows", "System32", "tar.exe") : "tar";
  let last = "";
  for (const up of picked) {
    const r2 = (await (await postForm(jar, `${p.page}/file/${up.id}`, csrf, dl)).json()) as { url?: string };
    if (!r2.url) throw new Error(`${p.id}: нет прямой ссылки: ${JSON.stringify(r2)}`);
    const file = path.join(dir, up.name.replace(/[\/:*?"<>|]/g, "_"));
    const bin = await fetch(r2.url, { headers: { "User-Agent": UA } });
    if (!bin.ok) throw new Error(`${p.id}: ${bin.status} при скачивании`);
    fs.writeFileSync(file, Buffer.from(await bin.arrayBuffer()));
    last = file;
    // распаковка в src/: bsdtar из Windows читает и zip, и rar (GNU tar из Git Bash — нет, поэтому полный путь)
    if (/\.(zip|rar|7z)$/i.test(file)) {
      const src = path.join(dir, "src", p.many ? path.basename(file, path.extname(file)) : "");
      fs.mkdirSync(src, { recursive: true });
      const r = spawnSync(tar, ["-xf", file, "-C", src], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(`${p.id}: распаковка не удалась: ${r.stderr}`);
    } else if (p.many) { fs.mkdirSync(path.join(dir, "src"), { recursive: true }); fs.copyFileSync(file, path.join(dir, "src", path.basename(file))); }
  }
  fs.writeFileSync(path.join(dir, "LICENSE.txt"), `${p.title}
Автор: ${p.author}
Страница: ${p.page}
Файлы: ${picked.map((u) => u.name).join(", ")}

${p.license}
`);
  return last;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "list") {
    const arg = rest[0];
    const page = PACKS.find((p) => p.id === arg)?.page ?? arg;
    for (const u of await listUploads(page)) console.log(`${u.id}\t${u.size}\t${u.name}`);
  } else if (cmd === "get") {
    const want = rest.length ? PACKS.filter((p) => rest.includes(p.id)) : PACKS;
    for (const p of want) console.log(`${p.id}: ${await fetchPack(p)}`);
  } else console.log("tsx tools/gen/vfx-fetch.ts list <id|url> | get [id ...]");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
