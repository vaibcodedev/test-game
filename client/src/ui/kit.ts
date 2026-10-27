/**
 * Помощники общих компонентов интерфейса (задача 126): вкладки, переключатель вариантов, модальное окно, заливка ползунка.
 * Разметка и стили — client/src/styles/kit.css (.tabs/.tab, .seg/.seg-opt, .modal/.dialog, ползунок input.range).
 */

// ---------- вкладки ----------

export interface TabsHandle {
  /** Выбрать вкладку по ключу или по самой кнопке; onSelect при этом не вызывается. */
  select(tab: string | HTMLElement): void;
  /** Ключ выбранной вкладки (null, если ни одна не выбрана). */
  current(): string | null;
  destroy(): void;
}

/** Ключ вкладки: data-tab, иначе id, иначе номер по порядку. */
const tabKey = (t: HTMLElement, i: number) => t.dataset.tab ?? (t.id || String(i));

/**
 * Вкладки `.tabs > .tab`: клик, стрелки ←/→ (по кругу), Home/End, roving tabindex, aria-selected и связь с панелью (aria-controls).
 * Выбранная вкладка берётся из разметки (aria-selected="true"); onSelect зовётся, когда выбирает пользователь.
 * Если onSelect перерисовывает окно целиком, хелпер вызывают заново на новой разметке.
 */
export function tabs(root: HTMLElement, onSelect?: (key: string, tab: HTMLElement) => void): TabsHandle {
  const all = () => [...root.querySelectorAll<HTMLElement>(".tab")];
  const usable = () => all().filter((t) => !(t as HTMLButtonElement).disabled);
  const paint = (active: HTMLElement | null) => {
    root.setAttribute("role", "tablist");
    const focusable = active ?? usable()[0] ?? null;
    for (const t of all()) {
      t.setAttribute("role", "tab");
      t.setAttribute("aria-selected", String(t === active));
      t.tabIndex = t === focusable ? 0 : -1;
    }
    const panelId = active?.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    if (panel && active?.id) panel.setAttribute("aria-labelledby", active.id);
  };
  const choose = (t: HTMLElement, byUser: boolean) => {
    if ((t as HTMLButtonElement).disabled) return;
    paint(t);
    if (byUser) onSelect?.(tabKey(t, all().indexOf(t)), t);
  };
  const onClick = (e: MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>(".tab");
    if (t && root.contains(t)) choose(t, true);
  };
  const onKey = (e: KeyboardEvent) => {
    const cur = (e.target as HTMLElement).closest<HTMLElement>(".tab");
    if (!cur || !root.contains(cur)) return;
    const list = usable(), i = list.indexOf(cur);
    const next = e.key === "ArrowRight" ? list[(i + 1) % list.length]
      : e.key === "ArrowLeft" ? list[(i - 1 + list.length) % list.length]
      : e.key === "Home" ? list[0]
      : e.key === "End" ? list[list.length - 1] : undefined;
    if (!next) return;
    e.preventDefault();
    e.stopPropagation(); // стрелки не двигают героя
    next.focus();
    choose(next, true);
  };
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKey);
  paint(all().find((t) => t.getAttribute("aria-selected") === "true") ?? null);
  return {
    select(tab) {
      const list = all();
      const t = typeof tab === "string" ? list.find((x, i) => tabKey(x, i) === tab) : tab;
      if (t) choose(t, false);
    },
    current() {
      const list = all(), t = list.find((x) => x.getAttribute("aria-selected") === "true");
      return t ? tabKey(t, list.indexOf(t)) : null;
    },
    destroy() {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKey);
    },
  };
}

// ---------- переключатель вариантов ----------

export interface SegHandle {
  /** Отметить вариант по значению без вызова onSelect (например, когда игрок отказался от выбора). */
  set(value: string | null): void;
  /** Значение отмеченного варианта. */
  value(): string | null;
  destroy(): void;
}

/**
 * Переключатель `.seg` (или `.choice`): один вариант из нескольких кнопок с aria-pressed.
 * Значение варианта — data-атрибут `attr` (по умолчанию data-v), иначе текст кнопки.
 * Клик отмечает кнопку сразу и зовёт onSelect; если выбор надо отменить (подтверждение), вызывают set(прежнее значение).
 */
export function seg(root: HTMLElement, onSelect?: (value: string, btn: HTMLButtonElement) => void, attr = "v"): SegHandle {
  const opts = () => [...root.querySelectorAll<HTMLButtonElement>("button")];
  const valueOf = (b: HTMLElement) => b.dataset[attr] ?? b.textContent?.trim() ?? "";
  const paint = (active: HTMLElement | null) => opts().forEach((b) => b.setAttribute("aria-pressed", String(b === active)));
  const onClick = (e: MouseEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b || !root.contains(b) || b.disabled) return;
    paint(b);
    onSelect?.(valueOf(b), b);
  };
  root.addEventListener("click", onClick);
  if (!root.hasAttribute("role")) root.setAttribute("role", "group");
  return {
    set(value) { paint(value === null ? null : opts().find((b) => valueOf(b) === value) ?? null); },
    value() {
      const b = opts().find((x) => x.getAttribute("aria-pressed") === "true");
      return b ? valueOf(b) : null;
    },
    destroy() { root.removeEventListener("click", onClick); },
  };
}

// ---------- модальное окно ----------

export interface ModalOpts {
  /** Куда вставить подложку; по умолчанию document.body (вне масштаба интерфейса). */
  parent?: HTMLElement;
  /** Системное окно поверх всего (слой --z-modal-sys): переподключение, ошибка соединения. */
  sys?: boolean;
  /** Закрывать по Esc (по умолчанию да). */
  esc?: boolean;
  /** Закрывать по клику на подложку (по умолчанию да). */
  backdrop?: boolean;
  /** Что получит фокус: селектор внутри диалога; по умолчанию первая кнопка подвала, затем любая кнопка, кроме ×. */
  focus?: string;
  /** Один раз при закрытии любым способом. */
  onClose?: (by: "esc" | "backdrop" | "api") => void;
}

export interface ModalHandle {
  /** Подложка `.modal`. */
  back: HTMLElement;
  /** Диалог `.dialog` (первый элемент внутри подложки). */
  dialog: HTMLElement;
  close(): void;
}

/** Открытые окна: Esc закрывает только верхнее. */
const stack: object[] = [];
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Показывает диалог (`<section class="panel dialog">…</section>` строкой или элементом) на подложке `.modal`.
 * Как ask() в controls.ts: фокус внутрь, Esc и клик по подложке закрывают, игровые клавиши под окном не работают.
 * Клавиши внутри окна доходят до его кнопок и полей, но дальше не всплывают; Tab держится внутри окна.
 */
export function openModal(content: string | HTMLElement, opts: ModalOpts = {}): ModalHandle {
  const back = document.createElement("div");
  back.className = opts.sys ? "modal sys" : "modal";
  if (typeof content === "string") back.innerHTML = content; else back.append(content);
  const dialog = back.firstElementChild instanceof HTMLElement ? back.firstElementChild : back;
  const me = {};
  const prev = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  let closed = false;
  const close = (by: "esc" | "backdrop" | "api" = "api") => {
    if (closed) return;
    closed = true;
    window.removeEventListener("keydown", onKey, true);
    stack.splice(stack.indexOf(me), 1);
    back.remove();
    if (prev?.isConnected) prev.focus();
    opts.onClose?.(by);
  };
  const onKey = (e: KeyboardEvent) => {
    if (stack[stack.length - 1] !== me) return;
    if (e.code === "Escape") {
      e.stopImmediatePropagation();
      e.preventDefault();
      if (opts.esc !== false) close("esc");
      return;
    }
    if (e.key === "Tab") {
      const list = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = list[0], last = list[list.length - 1], at = document.activeElement;
      if (!list.length) e.preventDefault();
      else if (!dialog.contains(at) || (e.shiftKey && at === first)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    }
    if (!back.contains(e.target as Node)) e.stopImmediatePropagation();
  };
  back.addEventListener("keydown", (e) => e.stopPropagation());
  let downOnBack = false;
  back.addEventListener("pointerdown", (e) => { downOnBack = e.target === back; });
  back.addEventListener("click", (e) => {
    if (e.target === back && downOnBack && opts.backdrop !== false) close("backdrop");
    downOnBack = false;
  });
  stack.push(me);
  window.addEventListener("keydown", onKey, true);
  (opts.parent ?? document.body).append(back);
  const first = (opts.focus ? dialog.querySelector<HTMLElement>(opts.focus) : null)
    ?? dialog.querySelector<HTMLElement>(".dialog-foot button:not(:disabled)")
    ?? dialog.querySelector<HTMLElement>("button:not(.x):not(:disabled)")
    ?? dialog.querySelector<HTMLElement>("input, select, textarea");
  if (first) first.focus();
  else { dialog.tabIndex = -1; dialog.focus(); }
  return { back, dialog, close: () => close("api") };
}

// ---------- видимость ----------

/**
 * Показать или скрыть узел, не трогая атрибут без нужды. Запись hidden того же значения Chrome считает изменением атрибута
 * и пересчитывает стили: из кадровых frame() HUD (цель, питомец, группа, арена, рейд) это был пересчёт на каждом кадре.
 */
export function setHidden(e: HTMLElement, hide: boolean) {
  if (e.hidden !== hide) e.hidden = hide;
}

// ---------- ползунок ----------

const filled = new WeakSet<HTMLInputElement>();

/**
 * Ставит ползунку с классом `.range` переменную `--p` — долю заливки дорожки по value/min/max — и обновляет её на событие input.
 * Возвращает функцию перерисовки: её зовут после программного `input.value = …`.
 */
export function rangeFill(input: HTMLInputElement): () => void {
  const paint = () => {
    const min = Number(input.min || 0), max = Number(input.max || 100);
    const p = max > min ? Math.min(1, Math.max(0, (Number(input.value) - min) / (max - min))) : 0;
    input.style.setProperty("--p", p * 100 + "%");
  };
  if (!filled.has(input)) {
    filled.add(input);
    input.addEventListener("input", paint);
  }
  paint();
  return paint;
}
