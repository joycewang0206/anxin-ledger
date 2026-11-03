import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertModal } from "@/components/AlertModal";
import { SAVED_MESSAGES, SuccessBanner } from "@/components/SuccessBanner";
import { ErrorBanner, PageTitle, ProgressBar } from "@/components/ui";
import { currentMonthKey, formatDateShort, formatDateZh, formatMonthZh, todayStr } from "@/lib/dates";
import { getDb } from "@/lib/context";
import { buildSchedule, estimateMonthlyInterest, progressPercent, projectPayoff, type ScheduleStatus } from "@/lib/debt";
import { describePayoff, ESTIMATE_NOTE, INTEREST_NOTE } from "@/lib/debtText";
import { formatYuan } from "@/lib/money";
import { first, type SearchParams } from "@/lib/params";
import { loadAlertModal } from "@/lib/services/alerts";
import { getDebt } from "@/lib/services/debts";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ScheduleStatus, string> = { done: "✅ 已完成", pending: "待還款", "due-today": "🔔 今日到期", overdue: "⚠️ 已逾期" };
const STATUS_STYLE: Record<ScheduleStatus, string> = {
  done: "border-ok bg-green-50 text-ok",
  pending: "border-line bg-white text-ink",
  "due-today": "border-expense bg-amber-50 text-expense",
  overdue: "border-alert bg-orange-50 text-alert",
};
const UPCOMING_LIMIT = 12;

export default async function DebtDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const today = todayStr();
  const [debt, modal] = await Promise.all([getDebt(db, id), loadAlertModal(db, { month: currentMonthKey(), includeLedger: true, today })]);
  if (!debt) notFound();

  const paid = debt.status === "PAID_OFF";
  const progress = progressPercent(debt.originalPrincipal, debt.remainingPrincipal);
  const repaid = debt.originalPrincipal - debt.remainingPrincipal;
  const proj = projectPayoff(debt, debt.payments, today);
  const payoff = describePayoff(proj);
  const schedule = buildSchedule(debt, debt.payments, today);
  const doneRows = schedule.filter((r) => r.status === "done");
  const upcoming = schedule.filter((r) => r.status !== "done");
  const shownUpcoming = upcoming.slice(0, UPCOMING_LIMIT);
  const hiddenCount = upcoming.length - shownUpcoming.length;
  const saved = first(sp.saved);
  const payments = [...debt.payments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <AlertModal data={modal} />
      <SuccessBanner message={saved ? (SAVED_MESSAGES[saved] ?? null) : null} />
      <ErrorBanner message={first(sp.error)} />
      <p className="mb-2">
        <Link href="/debts" className="font-bold underline">← 回到債務管理</Link>
      </p>
      <PageTitle sub={debt.creditor ? `欠款對象：${debt.creditor}` : undefined}>{debt.name}</PageTitle>

      <section aria-label="債務摘要" className="card max-w-[44rem]">
        <p className="font-bold">目前剩餘本金</p>
        <p className="num-xl text-balance">{formatYuan(debt.remainingPrincipal)}</p>
        <div className="mt-3">
          <p className="mb-1 font-bold">已經還了 {progress}%</p>
          <ProgressBar percent={progress} tone={paid ? "green" : "blue"} label={`${debt.name}還款進度`} />
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="font-bold">已還本金</dt>
            <dd className="num text-income">{formatYuan(repaid)}</dd>
          </div>
          <div>
            <dt className="font-bold">原始本金</dt>
            <dd className="num">{formatYuan(debt.originalPrincipal)}</dd>
          </div>
          <div>
            <dt className="font-bold">每月還款金額</dt>
            <dd className="num">{debt.monthlyPayment ? formatYuan(debt.monthlyPayment) : "還沒設定"}</dd>
          </div>
          <div>
            <dt className="font-bold">還款日</dt>
            <dd className="num">每月 {debt.paymentDay} 號</dd>
          </div>
          <div>
            <dt className="font-bold">開始日期</dt>
            <dd>{formatDateZh(debt.startDate)}</dd>
          </div>
          <div>
            <dt className="font-bold">年利率</dt>
            <dd>
              {debt.annualRate > 0 ? `${debt.annualRate}%（每月利息約 ${formatYuan(estimateMonthlyInterest(debt.remainingPrincipal, debt.annualRate))}，估算值）` : "0%（沒有利息）"}
            </dd>
          </div>
        </dl>
        {debt.note && <p className="mt-3"><span className="font-bold">備註：</span>{debt.note}</p>}
        <p className={`mt-4 font-bold ${payoff.tone === "warn" ? "text-alert" : ""}`}>{payoff.tone === "warn" ? "⚠️ " : "📅 "}{payoff.text}</p>
        <p className="muted mt-1">{ESTIMATE_NOTE}</p>
        {debt.annualRate > 0 && <p className="muted mt-1">{INTEREST_NOTE}</p>}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {!paid && <Link href={`/debts/${id}/pay`} className="btn btn-income text-[1.2rem]">✅ 我已經還款</Link>}
          <Link href={`/debts/${id}/edit`} className="btn btn-secondary">✏️ 修改債務</Link>
          {!paid && <Link href={`/debts/${id}/settle`} className="btn btn-secondary">標記已還清</Link>}
          <Link href={`/debts/${id}/delete`} className="btn btn-secondary">🗑️ 刪除債務</Link>
        </div>
      </section>

      <section aria-label="還款時間表" className="mt-8">
        <h2 className="mb-1 text-[1.4rem] font-extrabold">還款時間表</h2>
        <p className="muted mb-3">已完成的月份顯示實際還款，之後的月份是預計還款。</p>
        {schedule.length === 0 ? (
          <p className="card max-w-[44rem]">{paid ? "這筆債務已經還清。" : payoff.text}</p>
        ) : (
          <ol className="flex max-w-[44rem] flex-col gap-3">
            {[...doneRows, ...shownUpcoming].map((row) => (
              <li key={row.ym} className="card" data-status={row.status}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[1.25rem] font-extrabold">{formatMonthZh(row.ym)}</h3>
                  <span className={`rounded-full border-2 px-3 font-bold ${STATUS_STYLE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                </div>
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1">
                  <div className="flex justify-between gap-3">
                    <dt>預計還款日</dt>
                    <dd className="font-bold">{formatDateShort(row.dueDate)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>預計還款金額</dt>
                    <dd className="font-bold">{row.planned ? formatYuan(row.planned) : "—"}</dd>
                  </div>
                  {row.actual !== null && (
                    <div className="flex justify-between gap-3">
                      <dt>實際還款金額</dt>
                      <dd className="font-bold text-income">{formatYuan(row.actual)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt>還完後剩餘本金</dt>
                    <dd className="font-bold">{formatYuan(row.remainingAfter)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        )}
        {hiddenCount > 0 && <p className="muted mt-3">後面還有 {hiddenCount} 期，每次還款後系統會重新計算。</p>}
        {proj.kind === "ok" && <p className="mt-3 font-bold">📅 最後一期還款後，債務歸零（{formatDateZh(proj.payoffDate)}）</p>}
      </section>

      <section aria-label="還款紀錄" className="mt-8">
        <h2 className="mb-2 text-[1.4rem] font-extrabold">還款紀錄</h2>
        {payments.length === 0 ? (
          <p className="card max-w-[44rem]">還沒有還款紀錄。還款後請按「我已經還款」，系統會同步記到本月支出。</p>
        ) : (
          <ul className="flex max-w-[44rem] flex-col gap-3">
            {payments.map((p) => (
              <li key={p.id} className="card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-bold">{formatDateZh(p.date)}</p>
                  <p className="num">{formatYuan(p.amount)}</p>
                </div>
                <p className="muted">
                  本金 {formatYuan(p.principal)}
                  {p.interest > 0 && `・利息 ${formatYuan(p.interest)}`}
                  {p.fee > 0 && `・其他費用 ${formatYuan(p.fee)}`}
                </p>
                {p.note && <p>{p.note}</p>}
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link href={`/debts/payments/${p.id}/edit`} className="btn btn-secondary">修改</Link>
                  <Link href={`/debts/payments/${p.id}/delete`} className="btn btn-secondary">刪除</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
