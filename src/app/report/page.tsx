import { AlertModal } from "@/components/AlertModal";
import { MonthNav } from "@/components/MonthNav";
import { PageTitle, ProgressBar, Stat } from "@/components/ui";
import { currentMonthKey, formatMonthZh, prevMonthKey, monthRange, todayStr } from "@/lib/dates";
import { getDb } from "@/lib/context";
import { fetchAll } from "@/lib/db";
import { categoryTotals, compareMonths } from "@/lib/ledger";
import { formatYuan } from "@/lib/money";
import { monthFrom, type SearchParams } from "@/lib/params";
import { loadAlertModal } from "@/lib/services/alerts";
import { getMonthSummary } from "@/lib/services/ledger";

export const dynamic = "force-dynamic";

function diffText(label: string, diff: number, moreIsBad: boolean) {
  if (diff === 0) return { text: `${label}和上個月一樣`, bad: false };
  const more = diff > 0;
  return { text: `${label}比上個月${more ? "多" : "少"} ${formatYuan(Math.abs(diff))}`, bad: moreIsBad ? more : !more };
}

export default async function ReportPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const month = monthFrom(sp.month);
  const prev = prevMonthKey(month);
  const db = await getDb();
  const { start, end } = monthRange(month);

  const [s, ps, expenses, modal] = await Promise.all([
    getMonthSummary(db, month),
    getMonthSummary(db, prev),
    fetchAll((a, b) => db.from("expenses").select("amount, category").gte("date", start).lte("date", end).order("id").range(a, b)),
    loadAlertModal(db, { month, includeLedger: month === currentMonthKey(), today: todayStr() }),
  ]);
  const cats = categoryTotals(expenses);
  const cmp = compareMonths(s, ps);
  const hasPrev = ps.income > 0 || ps.expense > 0;
  const over = s.usagePercent !== null && s.usagePercent > 100;

  return (
    <>
      <AlertModal data={modal} />
      <PageTitle>每月報表</PageTitle>
      <MonthNav month={month} basePath="/report" />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3" aria-label="本月總覽">
        <Stat label="本月收入總額" value={formatYuan(s.income)} tone="income" />
        <Stat label="本月支出總額" value={formatYuan(s.expense)} tone="expense" />
        <Stat label="本月結餘" value={formatYuan(s.balance)} tone={s.balance < 0 ? "alert" : "balance"} sub={s.balance < 0 ? "支出比收入多" : "收入 − 支出"} />
      </section>

      <section className="card mt-3" aria-label="預算使用率">
        <h2 className="mb-2 text-[1.3rem] font-extrabold">預算使用率</h2>
        {s.budget === null ? (
          <p>這個月沒有設定預算。</p>
        ) : (
          <>
            <p className={`num ${over ? "text-alert" : ""}`}>
              {Math.floor(s.usagePercent!)}%
              <span className="muted text-[1rem] font-normal">　（預算 {formatYuan(s.budget)}，已花 {formatYuan(s.expense)}）</span>
            </p>
            <div className="mt-2">
              <ProgressBar percent={s.usagePercent!} tone={over ? "red" : s.usagePercent! >= 80 ? "orange" : "green"} label="預算使用進度" />
            </div>
          </>
        )}
      </section>

      <section className="card mt-3" aria-label="各類支出">
        <h2 className="mb-2 text-[1.3rem] font-extrabold">錢花在哪裡</h2>
        {cats.length === 0 ? (
          <p>這個月沒有支出紀錄。</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {cats.map((c) => (
              <li key={c.category}>
                <div className="flex items-baseline justify-between gap-3 font-bold">
                  <span>{c.category}</span>
                  <span>{formatYuan(c.total)}（{c.percent}%）</span>
                </div>
                <ProgressBar percent={c.percent} tone="orange" label={`${c.category}占支出的比例`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-3" aria-label="和上個月比較">
        <h2 className="mb-2 text-[1.3rem] font-extrabold">和上個月（{formatMonthZh(prev)}）比較</h2>
        {!hasPrev ? (
          <p>上個月沒有紀錄，所以還不能比較。</p>
        ) : (
          <ul className="flex flex-col gap-1 font-bold">
            {[diffText("收入", cmp.incomeDiff, false), diffText("支出", cmp.expenseDiff, true), diffText("結餘", cmp.balanceDiff, false)].map((d) => (
              <li key={d.text} className={d.bad ? "text-alert" : ""}>{d.text}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
