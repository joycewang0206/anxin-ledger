import Link from "next/link";
import type { DebtWithPayments } from "@/lib/debt";
import { formatYuan } from "@/lib/money";

/** 全部債務一覽表（含已還清）。手機上橫向可捲動，名稱欄固定在左邊。 */
export function DebtTable({ debts }: { debts: DebtWithPayments[] }) {
  if (debts.length === 0) return <p className="card">目前還沒有任何債務。</p>;
  const active = debts.filter((d) => d.status === "ACTIVE");
  const remaining = active.reduce((a, d) => a + d.remainingPrincipal, 0);
  const monthly = active.reduce((a, d) => a + (d.monthlyPayment ?? 0), 0);
  return (
    <div className="card p-0">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">全部債務</caption>
        <thead>
          <tr className="border-b-2 border-line bg-cream">
            <th scope="col" className="w-[38%] px-2 py-2 sm:px-3">債務</th>
            <th scope="col" className="px-2 py-2 text-right sm:px-3">剩餘本金</th>
            <th scope="col" className="px-2 py-2 text-right sm:px-3">每月還款</th>
            <th scope="col" className="hidden px-3 py-2 sm:table-cell">還款日</th>
            <th scope="col" className="hidden px-3 py-2 sm:table-cell">狀態</th>
          </tr>
        </thead>
        <tbody>
          {debts.map((d) => (
            <tr key={d.id} className="border-b border-line last:border-0">
              <th scope="row" className="break-words px-2 py-2 font-extrabold sm:px-3">
                <Link href={`/debts/${d.id}`} className="inline-flex min-h-12 items-center underline">{d.name}</Link>
                {d.creditor && <span className="muted block font-normal">{d.creditor}</span>}
                <span className="block font-bold sm:hidden">{d.status === "PAID_OFF" ? <span className="text-ok">已還清</span> : `每月 ${d.paymentDay} 號`}</span>
              </th>
              <td className="px-2 py-2 text-right font-bold sm:px-3">{formatYuan(d.remainingPrincipal)}</td>
              <td className="px-2 py-2 text-right sm:px-3">{d.monthlyPayment ? formatYuan(d.monthlyPayment) : "未設定"}</td>
              <td className="hidden px-3 py-2 sm:table-cell">{d.status === "ACTIVE" ? `每月 ${d.paymentDay} 號` : "—"}</td>
              <td className="hidden px-3 py-2 font-bold sm:table-cell">{d.status === "PAID_OFF" ? <span className="text-ok">已還清</span> : "還款中"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line bg-cream font-extrabold">
            <th scope="row" className="px-2 py-2 sm:px-3">合計（還款中）</th>
            <td className="px-2 py-2 text-right sm:px-3">{formatYuan(remaining)}</td>
            <td className="px-2 py-2 text-right sm:px-3">{formatYuan(monthly)}</td>
            <td colSpan={2} className="hidden sm:table-cell" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
