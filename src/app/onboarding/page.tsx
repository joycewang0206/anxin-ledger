import { redirect } from "next/navigation";
import { CreateHouseholdForm, JoinHouseholdForm } from "@/components/AuthForms";
import { LogoutButton } from "@/components/LogoutButton";
import { getMembership, requireUser } from "@/lib/context";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser();
  if (await getMembership()) redirect("/");
  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-5 pt-4">
      <div>
        <h1 className="mb-2 text-[1.6rem] font-extrabold">歡迎使用安心記帳本</h1>
        <p className="muted">已登入：{user.email}。帳本是整個家庭共用的，請選擇其中一種：</p>
      </div>
      <JoinHouseholdForm />
      <CreateHouseholdForm />
      <LogoutButton />
    </div>
  );
}
