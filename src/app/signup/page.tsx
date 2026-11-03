import { SignupForm } from "@/components/AuthForms";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-[520px] pt-6">
      <h1 className="mb-2 text-[1.6rem] font-extrabold">🛡️ 註冊新帳號</h1>
      <p className="muted mb-4">每位家人都用自己的電子郵件註冊。註冊後，再建立家庭或輸入邀請碼加入。</p>
      <SignupForm />
    </div>
  );
}
