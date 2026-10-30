/**
 * Мини-раннер быстрых тестов (без сервера): test — обычная проверка, knownFail — проверка найденного бага.
 * knownFail не роняет прогон, пока баг на месте; если проверка вдруг прошла — сообщает XPASS (баг починен, снять пометку).
 * В конце файла — done(): строка «RESULT passed=… failed=… known=… xpass=…» (её читает tests/run-unit.ts) и код выхода.
 */
import nodeAssert from "node:assert/strict";

let passed = 0, failed = 0, known = 0, xpass = 0;
const fails: string[] = [];
let group = "";

export const assert: typeof nodeAssert = nodeAssert;
export function section(name: string) {
  group = name;
  console.log(`\n# ${name}`);
}

export async function test(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    fails.push(`${group}: ${name}`);
    console.log(`  FAIL ${name}\n       ${(e as Error).message?.split("\n").join("\n       ")}`);
  }
}

/** Тест на найденный баг (docs/tests-map.md, «Найденные баги»): id — номер бага, bug — что не так. */
export async function knownFail(id: string, name: string, bug: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    xpass++;
    console.log(`  XPASS [${id}] ${name} — баг, похоже, починен: снимите пометку known-fail`);
  } catch (e) {
    known++;
    console.log(`  known-fail [${id}] ${name}\n       баг: ${bug}\n       сейчас: ${(e as Error).message?.split("\n")[0]}`);
  }
}

export function done() {
  console.log(`\nRESULT passed=${passed} failed=${failed} known=${known} xpass=${xpass}`);
  if (fails.length) console.log("Провалены:\n  " + fails.join("\n  "));
  process.exit(failed ? 1 : 0);
}

/** Детерминированный Math.random на время fn (seed — последовательность значений по кругу). */
export function withRandom<T>(values: number[], fn: () => T): T {
  const orig = Math.random;
  let i = 0;
  Math.random = () => values[i++ % values.length];
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/** Заглушка-отправитель: собирает сообщения игроку. */
export function inbox() {
  const msgs: { type: string; msg: any }[] = [];
  const send = (type: string, msg: unknown) => void msgs.push({ type, msg });
  const toasts = () => msgs.filter((m) => m.type === "toast").map((m) => String(m.msg?.text ?? ""));
  const errors = () => msgs.filter((m) => m.type === "toast" && m.msg?.kind === "error").map((m) => String(m.msg?.text ?? ""));
  return { msgs, send, toasts, errors, clear: () => void (msgs.length = 0) };
}
