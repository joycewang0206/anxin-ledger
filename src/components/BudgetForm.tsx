"use client";

import { useActionState } from "react";
import { saveBudgetAction, type FormState } from "@/app/actions";
import { ErrorText, FormErrorBox } from "./ui";

export function BudgetForm({ month, current }: { month: string; current: number | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBudgetAction, null);
  const errors = state?.errors ?? {};
  return (
    <form action={action} className="flex max-w-[34rem] flex-col gap-4" noValidate>
      <input type="hidden" name="month" value={month} />
      <FormErrorBox>{errors.form}</FormErrorBox>
      <div>
        <label htmlFor="budget" className="field-label">這個月最多可以花多少錢（元）</label>
        <input
          id="budget"
          name="amount"
          inputMode="numeric"
          autoComplete="off"
          placeholder="例如 30000"
          className="input input-amount"
          defaultValue={state?.values.amount ?? (current ? String(current) : "")}
          aria-invalid={!!errors.amount}
        />
        <ErrorText>{errors.amount}</ErrorText>
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary text-[1.3rem]">
        {pending ? "儲存中…" : "儲存這個月的預算"}
      </button>
    </form>
  );
}
