/**
 * Вынос текстов из строк с разметкой и из прочих мест (задача 145, продолжение tools/extract-texts.ts).
 * В шаблонах с HTML слова выносятся кусками между тегами: `<b>Нужен ${n} уровень</b>` → `<b>${T("ключ", { n })}</b>`.
 * Обычные русские строки в безопасных местах (не имена свойств, не типы, не case) заменяются на T("ключ").
 * Запуск: npx tsx tools/extract-html-texts.ts <область> <файл...> [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const [area, ...rest] = process.argv.slice(2);
const dry = rest.includes("--dry");
const files = rest.filter((x) => !x.startsWith("--"));
const TEXTS = path.resolve("data/texts.json");
const hasRu = (s: string) => /[А-Яа-яЁё]{3,}/.test(s);
interface Entry { text: string; who: string; where: string; area: string; vars?: Record<string, string> }
const json = JSON.parse(fs.readFileSync(TEXTS, "utf8"));
const texts: Record<string, Entry> = json.texts;
const byText = new Map<string, string>();
for (const [k, e] of Object.entries(texts)) byText.set(e.text + "|" + JSON.stringify(e.vars ?? {}), k);

const SKIP = new Set(["tolowercase", "touppercase", "tofixed", "join", "slice", "floor", "round", "ceil", "max", "min", "length", "string", "number", "tostring", "replace", "trim", "esc", "fmt"]);
const slug = (expr: string, used: Set<string>) => {
  let e = expr;
  for (let i = 0; i < 4; i++) e = e.replace(/\([^()]*\)/g, (m) => (/^\(\s*[\w.]+\s*\)$/.test(m) ? m.replace(/[()]/g, " ") : ""));
  const ids = (e.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).map((x) => x.toLowerCase()).filter((x) => !SKIP.has(x));
  const s = (ids.slice(-1)[0] ?? "v").replace(/[^a-z0-9_]/g, "") || "v";
  let nme = s, i = 2;
  while (used.has(nme)) nme = s + i++;
  used.add(nme);
  return nme;
};
const WHERE: [RegExp, string, string][] = [
  [/hud/, "Интерфейс героя", "Основной экран: полоса умений, сумка, окна героя"],
  [/arena/, "Арена", "Окно арены и табло боя"],
  [/raid/, "Рейд", "Окно и табло рейда"],
  [/smith/, "Кузнец", "Окно кузнеца"],
  [/cities|npcGate/, "Города", "Окна городов, заданий и телепорта"],
  [/stable/, "Конюший", "Окно конюшего"],
  [/bank/, "Банкир", "Окно банка"],
  [/trade/, "Обмен", "Окно обмена"],
  [/gamemenu|controls|charselect|login|main/, "Меню и вход", "Меню Esc, настройки, вход в игру"],
  [/bestiary|cook|encounter|worldmap|loading|credits|statue/, "Окна мира", "Бестиарий, кухня, события мира, карта"],
  [/server/, "Сервер", "Сообщение игроку"],
];
let nextId = Object.keys(texts).length;

const BAD_PARENT = (p: ts.Node | undefined): boolean => !p || ts.isPropertyAssignment(p) && false;
const okPosition = (node: ts.Node): boolean => {
  const p = node.parent;
  if (!p) return false;
  if (ts.isPropertyAssignment(p) && p.name === node) return false;
  if (ts.isPropertySignature(p) || ts.isLiteralTypeNode(p) || ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isEnumMember(p) || ts.isCaseClause(p) || ts.isComputedPropertyName(p) || ts.isElementAccessExpression(p) && p.argumentExpression === node) return false;
  if (ts.isBinaryExpression(p) && (p.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || p.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken || p.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken || p.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken)) return false;
  if (ts.isCallExpression(p) && /^(querySelector|querySelectorAll|getElementById|closest|matches|startsWith|endsWith|includes|indexOf|test|match|split|localeCompare|add|has|get|set|delete|log|warn|error|info|debug|assert|Error)$/.test(ts.isPropertyAccessExpression(p.expression) ? p.expression.name.text : ts.isIdentifier(p.expression) ? p.expression.text : "")) return false;
  if (ts.isNewExpression(p)) return false;
  if (ts.isThrowStatement(p)) return false;
  if (ts.isAsExpression(p) || ts.isTypeAssertionExpression(p) || ts.isSatisfiesExpression(p)) return false;
  if (ts.isParenthesizedExpression(p)) return okPosition(p);
  return true;
};
void BAD_PARENT;

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true);
  const norm = file.replace(/\\/g, "/");
  const [, who, where] = WHERE.find(([re]) => re.test(norm)) ?? [null, "Интерфейс", "Окна и подсказки"];
  const base = path.basename(file, ".ts");
  const alias = /\bT\b/.test(src.replace(/import \{ T(?: as TX)? \} from "[^"]*texts";/, ""));
  const fn = alias ? "TX" : "T";
  const edits: [number, number, string][] = [];

  const keyFor = (text: string, vars: Record<string, string>, ctxWhere: string): string => {
    const sig = text + "|" + JSON.stringify(vars);
    let key = byText.get(sig);
    if (!key) {
      key = `${area}.${base}.${++nextId}`;
      while (texts[key]) key = `${area}.${base}.${++nextId}`;
      texts[key] = { text, who, where: ctxWhere, area, ...(Object.keys(vars).length ? { vars } : {}) };
      byText.set(sig, key);
    }
    return key;
  };
  const call = (key: string, params: string[]) => (params.length ? `${fn}(${JSON.stringify(key)}, { ${params.join(", ")} })` : `${fn}(${JSON.stringify(key)})`);

  /** Разбор литерала на элементы: lit (сырой текст) и expr (исходник подстановки). */
  const items = (node: ts.Node): { t: "lit" | "expr"; s: string }[] | null => {
    if (ts.isNoSubstitutionTemplateLiteral(node)) return [{ t: "lit", s: node.rawText ?? node.text }];
    if (ts.isStringLiteral(node)) { const raw = node.getText(sf); return [{ t: "lit", s: raw.slice(1, -1).replace(/\\(["'])/g, "$1").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") }]; }
    if (ts.isTemplateExpression(node)) {
      const out: { t: "lit" | "expr"; s: string }[] = [{ t: "lit", s: node.head.rawText ?? node.head.text }];
      for (const sp of node.templateSpans) { out.push({ t: "expr", s: sp.expression.getText(sf) }, { t: "lit", s: sp.literal.rawText ?? sp.literal.text }); }
      return out;
    }
    return null;
  };

  const process = (node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression, ctxWhere: string) => {
    const its = items(node);
    if (!its) return;
    const whole = its.map((i) => (i.t === "lit" ? i.s : "")).join("");
    if (!hasRu(whole)) return;
    const hasTag = /<[a-zA-Z/]/.test(whole);
    let out = "", seg = "", params: string[] = [], vars: Record<string, string> = {}, used = new Set<string>(), inTag = false, changed = false, bad = false;
    const flush = () => {
      if (!seg) return;
      const trimmed = seg.replace(/^\s+|\s+$/g, "");
      const lead = seg.slice(0, seg.length - seg.trimStart().length), trail = seg.slice(seg.trimEnd().length);
      if (hasRu(trimmed) && !/\\/.test(trimmed)) {
        const text = trimmed;
        const key = keyFor(text, vars, ctxWhere);
        out += lead + "${" + call(key, params) + "}" + trail;
        changed = true;
      } else {
        // не русский кусок: вернуть как был (подстановки — обратно в ${...})
        out += seg.replace(/\{([a-z0-9_]+)\}/g, (m, k: string) => (k in vars ? "${" + vars[k] + "}" : m));
      }
      seg = ""; params = []; vars = {}; used = new Set();
    };
    for (const it of its) {
      if (it.t === "expr") {
        if (inTag || !hasTag && false) { flush(); out += "${" + it.s + "}"; continue; }
        const nme = slug(it.s, used);
        vars[nme] = it.s; params.push(`${nme}: ${it.s}`);
        seg += `{${nme}}`;
        continue;
      }
      // литерал: идём по символам, режем по тегам
      let i = 0;
      while (i < it.s.length) {
        const ch = it.s[i];
        if (!inTag && ch === "<" && /[a-zA-Z/!]/.test(it.s[i + 1] ?? "")) { flush(); inTag = true; out += ch; i++; continue; }
        if (inTag) { out += ch; if (ch === ">") inTag = false; i++; continue; }
        if (ch === "\\" ) { bad = true; seg += ch + (it.s[i + 1] ?? ""); i += 2; continue; }
        seg += ch; i++;
      }
      if (!hasTag) { /* целый текст — один сегмент */ }
    }
    flush();
    if (!changed || bad && false) return;
    // собранный шаблон
    const rebuilt = "`" + out + "`";
    // шаблон из одного вызова T — без обёртки
    const only = /^`\$\{(T|TX)\(.*\)\}`$/.exec(rebuilt);
    edits.push([node.getStart(sf), node.getEnd(), only ? rebuilt.slice(3, -2) : rebuilt]);
  };

  const visit = (node: ts.Node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && okPosition(node)) {
      process(node, where);
      if (ts.isTemplateExpression(node)) return; // вложенное внутри подстановок не трогаем
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  // вложенные правки (литерал внутри подстановки) отбрасываем
  edits.sort((a, b) => a[0] - b[0]);
  const flat: typeof edits = [];
  for (const e of edits) if (!flat.length || e[0] >= flat[flat.length - 1][1]) flat.push(e);
  let out = src;
  for (const [s, e, r] of [...flat].sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + r + out.slice(e);
  const rel = path.relative(path.dirname(file), path.resolve("shared/texts")).replace(/\\/g, "/");
  const imp = `import { T${alias ? " as TX" : ""} } from "${rel.startsWith(".") ? rel : "./" + rel}";`;
  if (!/import \{[^}]*\bT\b[^}]*\} from "[^"]*texts"/.test(out)) {
    const lines = out.split(eol);
    let at = -1;
    for (let i = 0; i < Math.min(lines.length, 80); i++) if (/^(import .*from ".*";|\} from ".*";|import ".*";)\s*$/.test(lines[i])) at = i;
    lines.splice(at + 1, 0, imp);
    out = lines.join(eol);
  }
  console.log(`${file}: ${flat.length}`);
  if (!dry) fs.writeFileSync(file, out);
}
if (!dry) fs.writeFileSync(TEXTS, JSON.stringify(json, null, 2) + "\n");
console.log("всего ключей:", Object.keys(texts).length);
