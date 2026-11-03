import { currentMonthKey, isValidMonthKey } from "./dates";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function monthFrom(v: string | string[] | undefined): string {
  const m = first(v);
  return isValidMonthKey(m) ? m : currentMonthKey();
}
