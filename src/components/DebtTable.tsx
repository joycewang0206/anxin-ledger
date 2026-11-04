import Link from "next/link";
import type { DebtWithPayments } from "@/lib/debt";
import { currentMonthKey, formatMonthZh } from "@/lib/dates";
import { formatYuan } from "@/lib/money";
import { monthPaymentTotals, paymentSubtotal } from "@/lib/sheet";

/**
 * 債務 Excel 風格明細表（含已還清）：每筆債務一列，欄位沿用原本的債務資料，
 * 並列出該債務累計的本金、利息、其他費用、還款總額小計；最下面是總計。
 * 另有「本月還款」總計。手機與一般螢幕用精簡版（不需要左右滑動），超寬螢幕（2xl）顯示完整欄位。
 */
export function DebtTable({ debts }: { debts: DebtWithPayments[] }) {
  if (debts.length === 0) return <p className="card">目前還沒有任何債務。</p>;
  const ym = currentMonthKey();
  const month = monthPaymentTotals(debts, ym);
  const rows = debts.map((d) => ({ d, sub: paymentSubtotal(d.payments) }));
  const all = paymentSubtotal(debts.flatMap((d) => d.payments));
  const original = debts.reduce((a, d) => a + d.originalPrincipal, 0);
  const remaining = debts.reduce((a, d) => a + d.remainingPrincipal, 0);
  const monthly = debts.filter((d) => d.status === "ACTIVE").reduce((a, d) => a + (d.monthlyPayment ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="sheet-wrap max-w-[34rem]">
        <table className="sheet w-full">
          <caption className="sr-only">{formatMonthZh(ym)}還款總計</caption>
          <thead>
            <tr>
              <th scope="col">{formatMonthZh(ym)}（{month.count} 筆還款）</th>
              <th scope="col" className="r">金額</th>
            </tr>
          </thead>
          <tbody>
            <tr><th scope="row">本月還款總額</th><td className="r font-bold">{formatYuan(month.total)}</td></tr>
            <tr><th scope="row">已還本金</th><td className="r">{formatYuan(month.principal)}</td></tr>
            <tr><th scope="row">利息</th><td className="r">{formatYuan(month.interest)}</td></tr>
            <tr><th scope="row">其他費用</th><td className="r">{formatYuan(month.fee)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="sheet-wrap">
        <table className="sheet w-full table-fixed 2xl:table-auto">
          <caption className="sr-only">全部債務</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[42%] 2xl:w-auto">債務名稱</th>
              <th scope="col" className="r 2xl:hidden">剩餘本金</th>
              <th scope="col" className="r 2xl:hidden">還款總額</th>
              <th scope="col" className="r hidden 2xl:table-cell">原始本金</th>
              <th scope="col" className="r hidden 2xl:table-cell">剩餘本金</th>
              <th scope="col" className="r hidden 2xl:table-cell">每月預計還款</th>
              <th scope="col" className="hidden 2xl:table-cell">還款日期</th>
              <th scope="col" className="r hidden 2xl:table-cell">年利率</th>
              <th scope="col" className="r hidden 2xl:table-cell">已還本金</th>
              <th scope="col" className="r hidden 2xl:table-cell">已付利息</th>
              <th scope="col" className="r hidden 2xl:table-cell">其他費用</th>
              <th scope="col" className="r hidden 2xl:table-cell">還款總額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ d, sub }) => (
              <tr key={d.id}>
                <th scope="row" className="break-words font-extrabold">
                  <Link href={`/debts/${d.id}`} className="inline-flex min-h-12 items-center underline">{d.name}</Link>
                  {d.creditor && <span className="muted block font-normal">債權人：{d.creditor}</span>}
                  <span className="block font-bold">{d.status === "PAID_OFF" ? <span className="text-ok">已還清</span> : "還款中"}</span>
                  <span className="block font-normal 2xl:hidden">
                    原始本金 {formatYuan(d.originalPrincipal)}
                    <br />每月預計 {d.monthlyPayment ? formatYuan(d.monthlyPayment) : "未設定"}
                    {d.status === "ACTIVE" && <><br />每月 {d.paymentDay} 號還款</>}
                    <br />年利率 {d.annualRate > 0 ? `${d.annualRate}%` : "0%"}
                    <br />已還本金 {formatYuan(sub.principal)}
                    <br />利息 {formatYuan(sub.interest)}
                    <br />其他費用 {formatYuan(sub.fee)}
                  </span>
                </th>
                <td className="r font-bold 2xl:hidden">{formatYuan(d.remainingPrincipal)}</td>
                <td className="r font-bold 2xl:hidden">{formatYuan(sub.total)}</td>
                <td className="r hidden 2xl:table-cell">{formatYuan(d.originalPrincipal)}</td>
                <td className="r hidden font-bold 2xl:table-cell">{formatYuan(d.remainingPrincipal)}</td>
                <td className="r hidden 2xl:table-cell">{d.monthlyPayment ? formatYuan(d.monthlyPayment) : "未設定"}</td>
                <td className="hidden 2xl:table-cell">{d.status === "ACTIVE" ? `每月 ${d.paymentDay} 號` : "—"}</td>
                <td className="r hidden 2xl:table-cell">{d.annualRate > 0 ? `${d.annualRate}%` : "0%"}</td>
                <td className="r hidden 2xl:table-cell">{formatYuan(sub.principal)}</td>
                <td className="r hidden 2xl:table-cell">{formatYuan(sub.interest)}</td>
                <td className="r hidden 2xl:table-cell">{formatYuan(sub.fee)}</td>
                <td className="r hidden font-bold 2xl:table-cell">{formatYuan(sub.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total 2xl:hidden">
              <th scope="row">總計（{debts.length} 筆）</th>
              <td className="r">{formatYuan(remaining)}</td>
              <td className="r">{formatYuan(all.total)}</td>
            </tr>
            <tr className="sub 2xl:hidden">
              <th scope="row" colSpan={3} className="font-normal">
                原始本金 {formatYuan(original)}　每月預計還款 {formatYuan(monthly)}　已還本金 {formatYuan(all.principal)}　利息 {formatYuan(all.interest)}　其他費用 {formatYuan(all.fee)}
              </th>
            </tr>
            <tr className="total hidden 2xl:table-row">
              <th scope="row">總計（{debts.length} 筆）</th>
              <td className="r">{formatYuan(original)}</td>
              <td className="r">{formatYuan(remaining)}</td>
              <td className="r">{formatYuan(monthly)}</td>
              <td />
              <td />
              <td className="r">{formatYuan(all.principal)}</td>
              <td className="r">{formatYuan(all.interest)}</td>
              <td className="r">{formatYuan(all.fee)}</td>
              <td className="r">{formatYuan(all.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
