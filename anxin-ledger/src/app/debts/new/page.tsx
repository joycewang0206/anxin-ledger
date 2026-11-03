import { DebtForm } from "@/components/DebtForm";
import { PageTitle } from "@/components/ui";
import { todayStr } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default function NewDebtPage() {
  return (
    <>
      <PageTitle sub="填好基本資料就可以開始記錄還款">新增債務</PageTitle>
      <DebtForm
        editing={false}
        cancelHref="/debts"
        initial={{ name: "", creditor: "", originalPrincipal: "", remainingPrincipal: "", monthlyPayment: "", paymentDay: "1", startDate: todayStr(), annualRate: "", note: "" }}
      />
    </>
  );
}
