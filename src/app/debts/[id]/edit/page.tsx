import { notFound } from "next/navigation";
import { DebtForm } from "@/components/DebtForm";
import { PageTitle } from "@/components/ui";
import { getDb } from "@/lib/context";
import { getDebt } from "@/lib/services/debts";

export const dynamic = "force-dynamic";

export default async function EditDebtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const debt = await getDebt(await getDb(), id);
  if (!debt) notFound();
  return (
    <>
      <PageTitle>修改債務：{debt.name}</PageTitle>
      <DebtForm
        editing
        cancelHref={`/debts/${id}`}
        initial={{
          id,
          name: debt.name,
          creditor: debt.creditor ?? "",
          originalPrincipal: String(debt.originalPrincipal),
          remainingPrincipal: String(debt.openingPrincipal),
          monthlyPayment: debt.monthlyPayment ? String(debt.monthlyPayment) : "",
          paymentDay: String(debt.paymentDay),
          startDate: debt.startDate,
          annualRate: debt.annualRate ? String(debt.annualRate) : "",
          note: debt.note ?? "",
        }}
      />
    </>
  );
}
