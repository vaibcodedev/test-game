/** Скачивание бесплатного ассет-пака с itch.io без браузера (задача 127, шаг 1).
 *  Запуск: npx tsx tools/gen/itch-download.ts <страница-пака> <папка-куда-класть>
 *  Порядок загрузки на itch: страница → csrf_token → POST <страница>/download_url → страница загрузок (там id файлов)
 *  → POST <страница>/file/<id> (тот же csrf_token) → подписанная ссылка на файл (живёт около минуты).
 *  Работает только для паков с ценой «name your own price, минимум $0». Архивы кладутся как есть, распаковка — отдельно. */
import fs from "node:fs";
import path from "node:path";

const jar = new Map<string, string>();
function remember(res: Response) {
  for (const line of res.headers.getSetCookie()) {
    const [kv] = line.split(";");
    const i = kv.indexOf("=");
    if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
  }
}
const cookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { cookie: cookies(), "user-agent": "Mozilla/5.0 (asset-fetch)" }, redirect: "follow" });
  remember(res);
  return res;
}
async function post(url: string, csrf: string): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { cookie: cookies(), "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0 (asset-fetch)" },
    body: new URLSearchParams({ csrf_token: csrf }),
  });
  remember(res);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}
const csrfOf = (html: string) => /name="csrf_token" value="([^"]+)"/.exec(html)?.[1] ?? "";

export async function itchDownload(pageUrl: string, outDir: string): Promise<string[]> {
  const page = (await (await get(pageUrl)).text());
  const csrf = csrfOf(page);
  if (!csrf) throw new Error("на странице нет csrf_token");
  const { url: dlPage } = await post(pageUrl.replace(/\/$/, "") + "/download_url", csrf);
  const dl = await (await get(dlPage)).text();
  const ids = [...dl.matchAll(/data-upload_id="(\d+)"/g)].map((m) => m[1]);
  // имена файлов в порядке загрузок: <strong title="…" class="name">…</strong>
  const names = [...dl.matchAll(/<strong[^>]*class="name"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
  fs.mkdirSync(outDir, { recursive: true });
  const saved: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const info = await post(`${pageUrl.replace(/\/$/, "")}/file/${ids[i]}?source=view_game&as_props=1&after_download_lightbox=true`, csrfOf(dl) || csrf);
    const res = await fetch(info.url);
    if (!res.ok) throw new Error(`файл ${ids[i]}: ${res.status}`);
    const name = (names[i] ?? `upload-${ids[i]}.bin`).replace(/[\\/:*?"<>|]/g, "_");
    const dst = path.join(outDir, name);
    fs.writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
    saved.push(dst);
    console.log("сохранено", dst);
  }
  return saved;
}

if (process.argv[1] && /itch-download\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) {
  const [, , page, out] = process.argv;
  if (!page || !out) { console.error("Использование: tsx tools/gen/itch-download.ts <страница> <папка>"); process.exit(1); }
  itchDownload(page, path.resolve(out)).catch((e) => { console.error(e); process.exit(1); });
}
