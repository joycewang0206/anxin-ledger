import { notFound } from "next/navigation";
import { PageTitle } from "@/components/ui";
import { PaymentForm } from "@/components/PaymentForm";
import { getDb } from "@/lib/context";
import { computeRemaining } from "@/lib/debt";
import { getDebt, getPayment } from "@/lib/services/debts";

export const dynamic = "force-dynamic";

export default async function EditPaymentPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const db = await getDb();
  const payment = await getPayment(db, paymentId);
  if (!payment) notFound();
  const debt = await getDebt(db, payment.debtId);
  if (!debt) notFound();
  const others = debt.payments.filter((p) => p.id !== paymentId);
  return (
    <>
      <PageTitle sub="修改後，剩餘欠款和記帳本的支出會一起更新">修改還款紀錄</PageTitle>
      <PaymentForm
        debtId={debt.id}
        paymentId={paymentId}
        debtName={debt.name}
        remainingForPayment={computeRemaining(debt, others)}
        hasRate={debt.annualRate > 0}
        cancelHref={`/debts/${debt.id}`}
        initial={{ date: payment.date, amount: String(payment.amount), interest: String(payment.interest), fee: String(payment.fee), note: payment.note ?? "" }}
      />
    </>
  );
}
