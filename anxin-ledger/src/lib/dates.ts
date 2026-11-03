const pad = (n: number) => String(n).padStart(2, "0");

/** 使用者所在時區。雲端伺服器通常是 UTC，所以日期一律以這個時區計算（預設台灣）。 */
const TIME_ZONE = process.env.APP_TIMEZONE || "Asia/Taipei";

export function todayStr(now: Date = new Date()): string {
  // en-CA 的日期格式剛好是 YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function currentMonthKey(now: Date = new Date()): string {
  return todayStr(now).slice(0, 7);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (y < 1900 || y > 2200 || m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

export function isValidMonthKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

export function monthKeyOf(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

export function addMonths(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key);
  const idx = year * 12 + (month - 1) + delta;
  return monthKeyOf(Math.floor(idx / 12), (idx % 12) + 1);
}

export function prevMonthKey(key: string): string {
  return addMonths(key, -1);
}

export function monthRange(key: string): { start: string; end: string } {
  const { year, month } = parseMonthKey(key);
  return { start: `${key}-01`, end: `${key}-${pad(daysInMonth(year, month))}` };
}

/** 某月的還款日；若該月沒有這一天（例如 31 日），以當月最後一天計。 */
export function dueDateFor(key: string, paymentDay: number): string {
  const { year, month } = parseMonthKey(key);
  const day = Math.min(Math.max(Math.trunc(paymentDay) || 1, 1), daysInMonth(year, month));
  return `${key}-${pad(day)}`;
}

function utc(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** b 減 a 的天數。 */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

export function formatMonthZh(key: string): string {
  const { year, month } = parseMonthKey(key);
  return `${year} 年 ${month} 月`;
}

export function formatDateShort(date: string): string {
  return `${date.slice(5, 7)}/${date.slice(8, 10)}`;
}

export function formatDateZh(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}
