import Link from "next/link";
import { AlertModal } from "@/components/AlertModal";
import { DebtCard } from "@/components/DebtCard";
import { DebtTable } from "@/components/DebtTable";
import { SAVED_MESSAGES, SuccessBanner } from "@/components/SuccessBanner";
import { ErrorBanner, PageTitle, ProgressBar } from "@/components/ui";
import { currentMonthKey, todayStr } from "@/lib/dates";
import { getDb } from "@/lib/context";
import { computeDebtOverview } from "@/lib/debt";
import { describeOverviewPayoff, ESTIMATE_NOTE } from "@/lib/debtText";
import { formatYuan } from "@/lib/money";
import { first, type SearchParams } from "@/lib/params";
import { loadAlertModal } from "@/lib/services/alerts";
import { listDebts } from "@/lib/services/debts";

export const dynamic = "force-dynamic";

export default async function DebtsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const saved = first(sp.saved);
  const today = todayStr();
  const db = await getDb();
  const [debts, modal] = await Promise.all([
    listDebts(db),
    loadAlertModal(db, { month: currentMonthKey(), includeLedger: true, today }),
  ]);
  const ov = computeDebtOverview(debts, today);
  const payoff = describeOverviewPayoff(ov);
  const active = debts.filter((d) => d.status === "ACTIVE");
  const paidOff = debts.filter((d) => d.status === "PAID_OFF");

  return (
    <>
      <AlertModal data={modal} />
      <SuccessBanner message={saved ? (SAVED_MESSAGES[saved] ?? null) : null} />
      <ErrorBanner message={first(sp.error)} />
      <PageTitle>債務管理</PageTitle>

      {debts.length === 0 ? (
        <section className="card max-w-[44rem]">
          <p className="mb-3">還沒有記錄任何債務。如果有貸款、借款或信用卡欠款，可以記在這裡，系統會幫你算還剩多少、還要多久還清。</p>
          <Link href="/debts/new" className="btn btn-primary text-[1.3rem]">➕ 新增債務</Link>
        </section>
      ) : (
        <>
          <section aria-label="債務總覽" className="card">
            <h2 className="text-[1.3rem] font-extrabold">我的債務總覽</h2>
            <p className="mt-2 font-bold">目前還欠多少錢？</p>
            <p className="num-xl text-balance">{formatYuan(ov.remainingTotal)}</p>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="font-bold">已經還了</p>
                <p className="num text-income">{formatYuan(ov.repaidTotal)}</p>
              </div>
              <div>
                <p className="font-bold">原本欠款</p>
                <p className="num">{formatYuan(ov.originalTotal)}</p>
              </div>
            </div>

            <div className="mt-3">
              <p className="mb-1 font-bold">已經還清 {ov.progress}%</p>
              <ProgressBar percent={ov.progress} tone="green" label="整體還款進度" />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="font-bold">預計全部還清</p>
                <p className={`num ${payoff.tone === "warn" ? "text-alert" : ""}`}>{payoff.text}</p>
                {ov.payoffYm && ov.remainingPeriods !== null && (
                  <p className="muted">每月還款 {formatYuan(ov.monthlyTotal)}，剩餘約 {ov.remainingPeriods} 期</p>
                )}
              </div>
              <div>
                <p className="font-bold">每月預計還款總額</p>
                <p className="num">{formatYuan(ov.monthlyTotal)}</p>
              </div>
            </div>

            {(ov.interestPaidTotal > 0 || ov.feePaidTotal > 0) && (
              <p className="muted mt-3">
                已付利息 {formatYuan(ov.interestPaidTotal)}、其他費用 {formatYuan(ov.feePaidTotal)}（利息和費用不會減少本金）
              </p>
            )}
            <p className="muted mt-3">{ESTIMATE_NOTE}</p>
          </section>

          <div className="mt-4">
            <Link href="/debts/new" className="btn btn-primary text-[1.3rem]">➕ 新增債務</Link>
          </div>

          <section aria-label="全部債務表" className="mt-5">
            <h2 className="mb-2 text-[1.3rem] font-extrabold">全部債務一覽表</h2>
            <DebtTable debts={debts} />
          </section>

          <section aria-label="還款中的債務" className="mt-5">
            <h2 className="mb-2 text-[1.3rem] font-extrabold">還款中（{active.length} 筆）</h2>
            {active.length === 0 ? (
              <p className="card">🎉 目前沒有還款中的債務。</p>
            ) : (
              <div className="flex flex-col gap-3">
                {active.map((d) => (
                  <DebtCard key={d.id} debt={d} today={today} />
                ))}
              </div>
            )}
          </section>

          {paidOff.length > 0 && (
            <section aria-label="已還清的債務" className="mt-5">
              <h2 className="mb-2 text-[1.3rem] font-extrabold">已還清（{paidOff.length} 筆）</h2>
              <div className="flex flex-col gap-3">
                {paidOff.map((d) => (
                  <DebtCard key={d.id} debt={d} today={today} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
