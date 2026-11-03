import Link from "next/link";
import { addMonths, currentMonthKey, formatMonthZh } from "@/lib/dates";

/** 年月選擇：上一個月 / 下一個月 / 回到本月（純連結，不需要任何操作技巧）。 */
export function MonthNav({ month, basePath, extra = {} }: { month: string; basePath: string; extra?: Record<string, string> }) {
  const href = (m: string) => {
    const p = new URLSearchParams({ ...extra, month: m });
    return `${basePath}?${p.toString()}`;
  };
  const now = currentMonthKey();
  return (
    <nav aria-label="選擇月份" className="mb-4 flex flex-wrap items-center gap-3">
      <Link href={href(addMonths(month, -1))} className="btn btn-secondary" aria-label="上一個月">
        ◀ 上個月
      </Link>
      <p className="min-w-[8.5rem] text-center text-[1.5rem] font-extrabold">{formatMonthZh(month)}</p>
      <Link href={href(addMonths(month, 1))} className="btn btn-secondary" aria-label="下一個月">
        下個月 ▶
      </Link>
      {month !== now && (
        <Link href={href(now)} className="btn btn-primary">
          回到本月
        </Link>
      )}
    </nav>
  );
}
