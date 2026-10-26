/**
 * Вынос текстов из кода в data/texts.json (задача 145). Находит русские строки в «разговорных» местах кода —
 * свойство text, аргументы toast/err/say/notify, возвращаемые сообщения об отказе — и заменяет их на T("ключ", {подстановки}).
 * Запуск: npx tsx tools/extract-texts.ts <область> <файл...>   (--dry — только показать)
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const [area, ...rest] = process.argv.slice(2);
const dry = rest.includes("--dry");
const files = rest.filter((x) => !x.startsWith("--"));
const TEXTS = path.resolve("data/texts.json");
const CALLS = new Set(["err", "toast", "say", "notify", "fail", "deny", "warn", "bark", "tip"]);
const PROPS = new Set(["text", "msg", "message", "hint", "tip", "label", "title", "greeting", "line"]);
const ASSIGN = new Set(["textContent", "title", "placeholder", "innerText", "ariaLabel"]);
const hasRu = (s: string) => /[А-Яа-яЁё]{3,}/.test(s);

interface Entry { text: string; who: string; where: string; area: string; vars?: Record<string, string> }
const json = JSON.parse(fs.readFileSync(TEXTS, "utf8"));
const texts: Record<string, Entry> = json.texts;
const byText = new Map<string, string>();
for (const [k, e] of Object.entries(texts)) byText.set(e.text + "|" + JSON.stringify(e.vars ?? {}), k);

const SKIP = new Set(["tolowercase", "touppercase", "tofixed", "join", "slice", "floor", "round", "ceil", "max", "min", "length", "string", "number", "tostring", "replace", "trim"]);
const slug = (expr: string, used: Set<string>) => {
  let e = expr;
  for (let i = 0; i < 4; i++) e = e.replace(/([^()]*)/g, "");
  const ids = (e.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).map((x) => x.toLowerCase()).filter((x) => !SKIP.has(x));
  let s = (ids.slice(-1)[0] ?? "v").replace(/[^a-z0-9_]/g, "") || "v";
  let n = s, i = 2;
  while (used.has(n)) n = s + i++;
  used.add(n);
  return n;
};
const WHO: [RegExp, string, string][] = [
  [/raid/, "Рейд: ведущий боя", "Объявление в рейде"],
  [/arena/, "Сервер: арена", "Сообщение в окне арены"],
  [/trade/, "Сервер: обмен", "Сообщение при обмене между героями"],
  [/bank/, "Банкир", "Сообщение в окне банка"],
  [/stable|mount/, "Конюший", "Сообщение у конюшего или при езде"],
  [/smith/, "Кузнец", "Сообщение у кузнеца"],
  [/cities|npcs|town/, "Горожане и заказчики", "Сообщение в городе"],
  [/admin/, "Служебное (администратор)", "Сообщение администратору"],
  [/encounters|rumors/, "События мира", "Подсказка о событии в мире"],
  [/biomes/, "Мир", "Подсказка о среде и ресурсах"],
  [/WorldRoom|common/, "Сервер", "Системное сообщение игроку"],
];

let counter = Object.keys(texts).length;
const log: string[] = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true);
  const [, who, where] = WHO.find(([re]) => re.test(file)) ?? [null, "Сервер", "Сообщение игроку"];
  const base = path.basename(file, ".ts");
  const edits: [number, number, string][] = [];
  let n = 0;
  const handle = (node: ts.Expression, ctxWhere: string) => {
    let text = "", vars: Record<string, string> = {}, params: string[] = [];
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateExpression(node)) {
      const used = new Set<string>();
      text = node.head.text;
      for (const sp of node.templateSpans) {
        const expr = sp.expression.getText(sf);
        const name = slug(expr, used);
        vars[name] = expr;
        params.push(`${name}: ${expr}`);
        text += `{${name}}` + sp.literal.text;
      }
    } else return;
    if (!hasRu(text) || /[<>]/.test(text) || /^\[/.test(text)) return;
    if (/\{[a-z0-9_]+\}/.test(node.getText(sf)) && !params.length) return; // уже с фигурными скобками в коде
    const sig = text + "|" + JSON.stringify(vars);
    let key = byText.get(sig);
    if (!key) {
      let i = Object.keys(texts).length + 1; key = `${area}.${base}.${i}`; while (texts[key]) key = `${area}.${base}.${++i}`; n++;
      texts[key] = { text, who, where: ctxWhere, area, ...(Object.keys(vars).length ? { vars } : {}) };
      byText.set(sig, key);
    }
    const repl = params.length ? `T(${JSON.stringify(key)}, { ${params.join(", ")} })` : `T(${JSON.stringify(key)})`;
    edits.push([node.getStart(sf), node.getEnd(), repl]);
    if (dry) log.push("    " + text.slice(0, 90));
  };
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && PROPS.has(node.name.text) && node.parent && ts.isObjectLiteralExpression(node.parent)) {
      const kindProp = node.parent.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "kind");
      const kind = kindProp && ts.isStringLiteral(kindProp.initializer) ? kindProp.initializer.text : "";
      const KINDS: Record<string, string> = { error: "красная подсказка об ошибке", loot: "зелёная подсказка о добыче", level: "золотая подсказка о событии", info: "обычная подсказка" };
      handle(node.initializer, kind ? `Всплывающая ${KINDS[kind] ?? "подсказка"} у героя` : where);
    } else if (ts.isCallExpression(node)) {
      const c = node.expression;
      const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : "";
      if (name === "setAttribute" && node.arguments.length === 2 && ts.isStringLiteral(node.arguments[0]) && /^(title|aria-label|placeholder)$/.test(node.arguments[0].text)) handle(node.arguments[1], where + " (подсказка элемента)");
      if (CALLS.has(name)) for (const a of node.arguments) handle(a, where + (name === "err" ? " (отказ действия)" : ""));
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left) && ASSIGN.has(node.left.name.text) && /client\/src/.test(file.replace(/\\/g, "/"))) {
      handle(node.right, where + " (подпись элемента)");
    } else if (ts.isReturnStatement(node) && node.expression && /server\/src\//.test(file.replace(/\\/g, "/"))) handle(node.expression, where + " (отказ действия)");
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  let out = src;
  for (const [s, e, r] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + r + out.slice(e);
  // импорт T
  const rel = path.relative(path.dirname(file), path.resolve("shared/texts")).replace(/\\/g, "/");
  const imp = `import { T } from "${rel.startsWith(".") ? rel : "./" + rel}";`;
  if (!/import \{[^}]*\bT\b[^}]*\} from "[^"]*texts"/.test(out)) {
    const lines = out.split(eol);
    let at = -1;
    for (let i = 0; i < Math.min(lines.length, 80); i++) if (/^(import .*from ".*";|\} from ".*";|import ".*";)\s*$/.test(lines[i])) at = i;
    lines.splice(at + 1, 0, imp);
    out = lines.join(eol);
  }
  log.push(`${file}: ${edits.length}`);
  if (!dry) fs.writeFileSync(file, out);
  counter += n;
}
if (!dry) {
  const outJson = JSON.stringify(json, null, 2) + "\n";
  fs.writeFileSync(TEXTS, outJson);
}
console.log(log.join("\n") || "ничего не найдено", "\nвсего ключей:", Object.keys(texts).length);
