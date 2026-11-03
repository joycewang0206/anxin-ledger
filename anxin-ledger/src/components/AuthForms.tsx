"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { type AuthState, signInAction, signUpAction } from "@/app/auth/actions";
import { type HouseholdState, createHouseholdAction, joinHouseholdAction } from "@/app/household/actions";
import { ErrorBanner } from "./ui";

function Notice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-xl border-2 border-green-700 bg-green-50 p-3 font-bold text-green-900">
      {message}
    </p>
  );
}

function PasswordField({ id, label, autoComplete }: { id: string; label: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <input id={id} name={id} type={show ? "text" : "password"} autoComplete={autoComplete} required className="input" />
      <label className="mt-2 flex min-h-[48px] items-center gap-3 font-bold">
        <input type="checkbox" className="h-7 w-7" checked={show} onChange={(e) => setShow(e.target.checked)} />
        顯示密碼
      </label>
    </div>
  );
}

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signInAction, null);
  return (
    <form action={action} className="card flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Notice message={notice} />
      <ErrorBanner message={state?.error} />
      <div>
        <label htmlFor="email" className="field-label">電子郵件</label>
        <input id="email" name="email" type="email" autoComplete="email" required autoFocus className="input" />
      </div>
      <PasswordField id="password" label="密碼" autoComplete="current-password" />
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? "登入中…" : "登入"}</button>
      <p className="text-center">
        還沒有帳號？ <Link href="/signup" className="font-extrabold underline">註冊新帳號</Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUpAction, null);
  return (
    <form action={action} className="card flex flex-col gap-4">
      <Notice message={state?.notice} />
      <ErrorBanner message={state?.error} />
      <div>
        <label htmlFor="email" className="field-label">電子郵件</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <PasswordField id="password" label="設定密碼（至少 8 個字元）" autoComplete="new-password" />
      <PasswordField id="password2" label="再輸入一次密碼" autoComplete="new-password" />
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? "送出中…" : "註冊"}</button>
      <p className="text-center">
        已經有帳號？ <Link href="/login" className="font-extrabold underline">直接登入</Link>
      </p>
    </form>
  );
}

export function CreateHouseholdForm() {
  const [state, action, pending] = useActionState<HouseholdState, FormData>(createHouseholdAction, null);
  return (
    <form action={action} className="card flex flex-col gap-4" aria-label="建立新的家庭">
      <h2 className="text-[1.3rem] font-extrabold">我是第一個使用的人：建立家庭</h2>
      <ErrorBanner message={state?.error} />
      <div>
        <label htmlFor="c-name" className="field-label">家庭名稱</label>
        <input id="c-name" name="name" required maxLength={40} className="input" placeholder="例如：王家" />
      </div>
      <div>
        <label htmlFor="c-display" className="field-label">你的稱呼</label>
        <input id="c-display" name="displayName" required maxLength={30} className="input" placeholder="例如：爸爸" />
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? "建立中…" : "建立家庭"}</button>
    </form>
  );
}

export function JoinHouseholdForm() {
  const [state, action, pending] = useActionState<HouseholdState, FormData>(joinHouseholdAction, null);
  return (
    <form action={action} className="card flex flex-col gap-4" aria-label="加入已有的家庭">
      <h2 className="text-[1.3rem] font-extrabold">家人已經建立了：輸入邀請碼加入</h2>
      <ErrorBanner message={state?.error} />
      <div>
        <label htmlFor="j-code" className="field-label">邀請碼</label>
        <input id="j-code" name="code" required autoCapitalize="characters" autoComplete="off" className="input" placeholder="請家人到「設定」頁面查看" />
      </div>
      <div>
        <label htmlFor="j-display" className="field-label">你的稱呼</label>
        <input id="j-display" name="displayName" required maxLength={30} className="input" placeholder="例如：媽媽" />
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? "加入中…" : "加入家庭"}</button>
    </form>
  );
}
