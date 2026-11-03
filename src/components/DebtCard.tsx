import Link from "next/link";
import { formatDateZh } from "@/lib/dates";
import { dueState, projectPayoff, progressPercent, type DebtWithPayments } from "@/lib/debt";
import { describePayoff } from "@/lib/debtText";
import { formatYuan } from "@/lib/money";
import { ProgressBar } from "./ui";

const DUE_LABEL = { overdue: "已逾期", today: "今日到期", soon: "即將到期" } as const;

export function DebtCard({ debt, today }: { debt: DebtWithPayments; today: string }) {
  const progress = progressPercent(debt.originalPrincipal, debt.remainingPrincipal);
  const proj = projectPayoff(debt, debt.payments, today);
  const payoff = describePayoff(proj);
  const due = dueState(debt, debt.payments, today);
  const paid = debt.status === "PAID_OFF";

  return (
    <article className="card" aria-label={debt.name}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[1.4rem] font-extrabold">{debt.name}</h3>
          {debt.creditor && <p className="muted">欠款對象：{debt.creditor}</p>}
        </div>
        {paid ? (
          <span className="rounded-full border-2 border-ok bg-green-50 px-3 font-bold text-ok">已還清</span>
        ) : due ? (
          <span className={`rounded-full border-2 px-3 font-bold ${due === "overdue" ? "border-alert bg-orange-50 text-alert" : "border-expense bg-amber-50 text-expense"}`}>
            {due === "overdue" ? "⚠️ " : "🔔 "}
            {DUE_LABEL[due]}
          </span>
        ) : null}
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <p className="font-bold">目前剩餘本金</p>
          <p className="num text-balance">{formatYuan(debt.remainingPrincipal)}</p>
        </div>
        <div>
          <p className="font-bold">每月還款金額</p>
          <p className="num">{debt.monthlyPayment ? formatYuan(debt.monthlyPayment) : "還沒設定"}</p>
          {!paid && <p className="muted">每月 {debt.paymentDay} 號還款</p>}
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1 font-bold">已經還了 {progress}%</p>
        <ProgressBar percent={progress} tone={paid ? "green" : "blue"} label={`${debt.name}還款進度`} />
      </div>

      <p className={`mt-3 font-bold ${payoff.tone === "warn" ? "text-alert" : ""}`}>{payoff.tone === "warn" ? "⚠️ " : "📅 "}{payoff.text}</p>
      {proj.kind === "ok" && <p className="muted">預計最後一期：{formatDateZh(proj.payoffDate)}</p>}

      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={`/debts/${debt.id}`} className="btn btn-secondary">查看明細</Link>
        {!paid && <Link href={`/debts/${debt.id}/pay`} className="btn btn-income">✅ 記錄還款</Link>}
      </div>
    </article>
  );
}
