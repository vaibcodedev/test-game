/** Один форматтер на все вызовы: toLocaleString создаёт его заново на каждое число, а HUD форматирует HP и ману каждый кадр. Вывод тот же. */
const NUM = new Intl.NumberFormat("ru-RU");
/** Золото в интерфейсе: число с разделителями + иконка монеты (1em). */
export const formatNumber = (n: number): string => NUM.format(Math.round(n)).replace(/ | /g, " ");
export const gold = (n: number, pre = ""): string => `<span class="gold-amt">${pre}${formatNumber(n)}<img class="coin" src="/assets/icons/coin.png" alt="золото"></span>`;
/** Заменяет в готовом HTML-тексте «N з» / «N золота» на число с монетой. */
export const goldify = (html: string): string => html.replace(/(\d[\d ]*)\s?(?:золота|золото|з)(?![\p{L}])/gu, (_m, n: string) => gold(Number(n.replace(/ /g, ""))));
