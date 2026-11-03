import Link from "next/link";
import { AlertModal } from "@/components/AlertModal";
import { MonthNav } from "@/components/MonthNav";
import { SAVED_MESSAGES, SuccessBanner } from "@/components/SuccessBanner";
import { PageTitle, ProgressBar, Stat } from "@/components/ui";
import { currentMonthKey, formatDateShort, todayStr } from "@/lib/dates";
import { getDb } from "@/lib/context";
import { computeDebtAlerts, computeDebtOverview } from "@/lib/debt";
import { formatYuan, signedYuan } from "@/lib/money";
import { first, monthFrom, type SearchParams } from "@/lib/params";
import { loadAlertModal } from "@/lib/services/alerts";
import { listDebts } from "@/lib/services/debts";
import { getMonthSummary, recentRecords } from "@/lib/services/ledger";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const month = monthFrom(sp.month);
  const saved = first(sp.saved);
  const today = todayStr();
  const db = await getDb();

  const [summary, recent, debts, modal] = await Promise.all([
    getMonthSummary(db, month),
    recentRecords(db, month, 5),
    listDebts(db),
    loadAlertModal(db, { month, includeLedger: month === currentMonthKey() || !!saved, today }),
  ]);
  const debtOverview = computeDebtOverview(debts, today);
  const activeDebts = debts.filter((d) => d.status === "ACTIVE");
  const dueAlerts = computeDebtAlerts(debts, today).filter((a) => a.kind !== "paid");

  const over = summary.usagePercent !== null && summary.usagePercent > 100;
  const barTone = summary.usagePercent === null ? "blue" : over ? "red" : summary.usagePercent >= 80 ? "orange" : "green";

  return (
    <>
      <AlertModal data={modal} />
      <SuccessBanner message={saved ? (SAVED_MESSAGES[saved] ?? null) : null} />
      <PageTitle>本月的錢，一眼看清楚</PageTitle>
      <MonthNav month={month} basePath="/" />

      <section aria-label="本月收支" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="本月收入" value={formatYuan(summary.income)} tone="income" />
        <Stat label="本月支出" value={formatYuan(summary.expense)} tone="expense" sub={summary.debtPayment > 0 ? `其中債務還款 ${formatYuan(summary.debtPayment)}` : undefined} />
        <Stat
          label="本月剩餘金額"
          value={formatYuan(summary.balance)}
          tone={summary.balance < 0 ? "alert" : "balance"}
          sub={summary.balance < 0 ? "支出比收入多，請小心" : "收入 − 支出"}
        />
      </section>

      <section aria-label="每月預算" className="card mt-3">
        <h2 className="mb-2 text-[1.3rem] font-extrabold">每月預算</h2>
        {summary.budget === null ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>這個月還沒有設定預算。</p>
            <Link href={`/settings?month=${month}`} className="btn btn-secondary">設定每月預算</Link>
          </div>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <div>
                <p className="font-bold">每月可花金額</p>
                <p className="num">{formatYuan(summary.budget)}</p>
              </div>
              <div>
                <p className="font-bold">{summary.budgetRemaining! < 0 ? "已超過預算" : "預算剩餘"}</p>
                <p className={`num ${summary.budgetRemaining! < 0 ? "text-alert" : "text-balance"}`}>
                  {formatYuan(Math.abs(summary.budgetRemaining!))}
                </p>
              </div>
              <div>
                <p className="font-bold">支出使用率</p>
                <p className={`num ${over ? "text-alert" : ""}`}>{Math.floor(summary.usagePercent!)}%</p>
              </div>
            </div>
            <ProgressBar percent={summary.usagePercent!} tone={barTone} label="預算使用進度" />
            <p className="mt-2 font-bold">
              {over ? "⚠️ 本月已經超支" : summary.usagePercent! >= 100 ? "本月預算已經用完" : summary.usagePercent! >= 80 ? "🔔 快要超過預算了" : "目前花費在預算內"}
            </p>
          </>
        )}
      </section>

      {debts.length > 0 && (
        <section aria-label="真正可以使用的錢" className="card mt-3">
          <h2 className="text-[1.3rem] font-extrabold">扣除生活費與還款後，真正可以使用的錢</h2>
          <p className={`num-xl ${summary.balance < 0 ? "text-alert" : "text-balance"}`}>{formatYuan(summary.balance)}</p>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            <Row label="本月收入" value={formatYuan(summary.income)} />
            <Row label="生活支出" value={formatYuan(summary.livingExpense)} />
            <Row label="債務還款" value={formatYuan(summary.debtPayment)} />
            <Row label="實際剩餘" value={formatYuan(summary.balance)} strong />
          </dl>
        </section>
      )}

      {debts.length > 0 && (
        <section aria-label="債務摘要" className="card mt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[1.3rem] font-extrabold">債務還款</h2>
              <p>
                目前還欠 <span className="num">{formatYuan(debtOverview.remainingTotal)}</span>
                <span className="muted">（共 {activeDebts.length} 筆還款中）</span>
              </p>
              {dueAlerts.length > 0 && (
                <p className="font-bold text-alert">
                  ⚠️ {dueAlerts.length} 筆債務本月需要還款，請到「債務管理」查看
                </p>
              )}
            </div>
            <Link href="/debts" className="btn btn-secondary">看債務管理</Link>
          </div>
        </section>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/income/new" className="btn btn-income text-[1.3rem]">💰 新增收入</Link>
        <Link href="/expense/new" className="btn btn-expense text-[1.3rem]">🧾 新增支出</Link>
      </div>

      <section aria-label="最近的記帳紀錄" className="mt-6">
        <h2 className="mb-2 text-[1.3rem] font-extrabold">最近 5 筆記帳</h2>
        {recent.length === 0 ? (
          <p className="card">這個月還沒有記帳，按上面的按鈕開始記第一筆吧。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="card flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="min-w-0 grow basis-[9rem]">
                  <p className="font-bold">
                    {formatDateShort(r.date)}　{r.category}
                  </p>
                  {r.note && <p className="muted break-words">{r.note}</p>}
                </div>
                <p className={`num ml-auto shrink-0 ${r.kind === "income" ? "text-income" : "text-expense"}`}>{signedYuan(r.amount, r.kind)}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Link href={`/records?month=${month}`} className="btn btn-secondary">看全部收支紀錄</Link>
        </div>
      </section>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line py-1 ${strong ? "font-extrabold" : ""}`}>
      <dt className="whitespace-nowrap">{label}</dt>
      <dd className="ml-auto whitespace-nowrap text-right font-bold">{value}</dd>
    </div>
  );
}
