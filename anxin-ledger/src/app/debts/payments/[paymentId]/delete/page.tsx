import Link from "next/link";
import { notFound } from "next/navigation";
import { removePaymentAction } from "@/app/actions";
import { PageTitle } from "@/components/ui";
import { formatDateZh } from "@/lib/dates";
import { getDb } from "@/lib/context";
import { formatYuan } from "@/lib/money";
import { getPayment } from "@/lib/services/debts";

export const dynamic = "force-dynamic";

export default async function DeletePaymentPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const payment = await getPayment(await getDb(), paymentId);
  if (!payment) notFound();
  return (
    <>
      <PageTitle>確定要刪除這筆還款紀錄嗎？</PageTitle>
      <div className="card mb-4 max-w-[40rem]">
        <p className="font-bold">{payment.debt.name}　{formatDateZh(payment.date)}</p>
        <p className="num text-expense">{formatYuan(payment.amount)}</p>
      </div>
      <p className="mb-4 font-bold">刪除後，這筆還款不再算數：剩餘欠款會加回 {formatYuan(payment.principal)}，記帳本裡對應的支出也會一起刪除。無法復原。</p>
      <form action={removePaymentAction} className="flex flex-wrap gap-3">
        <input type="hidden" name="paymentId" value={paymentId} />
        <input type="hidden" name="debtId" value={payment.debtId} />
        <button type="submit" className="btn btn-danger">是，刪除</button>
        <Link href={`/debts/${payment.debtId}`} className="btn btn-secondary">不要，回上一頁</Link>
      </form>
    </>
  );
}
