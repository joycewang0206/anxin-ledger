import { DebtForm } from "@/components/DebtForm";
import { DebtTable } from "@/components/DebtTable";
import { PageTitle } from "@/components/ui";
import { getDb } from "@/lib/context";
import { todayStr } from "@/lib/dates";
import { listDebts } from "@/lib/services/debts";

export const dynamic = "force-dynamic";

export default async function NewDebtPage() {
  const db = await getDb();
  const debts = await listDebts(db);
  return (
    <>
      <PageTitle sub="填好基本資料就可以開始記錄還款">新增債務</PageTitle>
      <DebtForm
        editing={false}
        cancelHref="/debts"
        initial={{ name: "", creditor: "", originalPrincipal: "", remainingPrincipal: "", monthlyPayment: "", paymentDay: "1", startDate: todayStr(), annualRate: "", note: "" }}
      />
      <section aria-label="全部債務表" className="mt-8">
        <h2 className="mb-2 text-[1.3rem] font-extrabold">目前全部的債務（{debts.length} 筆）</h2>
        <DebtTable debts={debts} />
      </section>
    </>
  );
}
