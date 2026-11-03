import { LoginForm } from "@/components/AuthForms";
import { safeNextPath } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div className="mx-auto max-w-[520px] pt-6">
      <h1 className="mb-2 text-[1.6rem] font-extrabold">🛡️ 安心記帳本</h1>
      <p className="muted mb-4">這裡有私人的收支資料，請先登入。</p>
      {error === "link" && <p role="alert" className="mb-4 rounded-xl border-2 border-red-700 bg-red-50 p-3 font-bold text-red-900">驗證連結已經失效，請直接用電子郵件和密碼登入。</p>}
      <LoginForm next={safeNextPath(next)} />
    </div>
  );
}
