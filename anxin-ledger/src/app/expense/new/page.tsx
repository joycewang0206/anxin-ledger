import { EntryForm } from "@/components/EntryForm";
import { PageTitle } from "@/components/ui";
import { todayStr } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default function NewExpensePage() {
  return (
    <>
      <PageTitle sub="照著 ① ② ③ ④ 的順序，四個步驟就完成">新增支出</PageTitle>
      <EntryForm kind="expense" initial={{ date: todayStr(), category: "", amount: "", note: "" }} cancelHref="/" />
    </>
  );
}
