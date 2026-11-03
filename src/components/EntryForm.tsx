"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveEntryAction, type FormState } from "@/app/actions";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";
import { ErrorText, FormErrorBox } from "./ui";

interface Initial {
  id?: string;
  date: string;
  category: string;
  amount: string;
  note: string;
}

export function EntryForm({ kind, initial, cancelHref }: { kind: "income" | "expense"; initial: Initial; cancelHref: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveEntryAction, null);
  const v = state?.values;
  const errors = state?.errors ?? {};
  const cats: readonly string[] = kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // 編輯時，如果原本的項目不在固定清單內（自訂的項目），預設選「其他（自行輸入）」
  const startCategory = v?.category ?? (cats.includes(initial.category) || !initial.category ? initial.category : "__custom__");
  const startCustom = v?.customCategory ?? (cats.includes(initial.category) ? "" : initial.category);
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? startCategory;

  return (
    <form action={action} className="flex max-w-[44rem] flex-col gap-6" noValidate>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={initial.id ?? ""} />
      <FormErrorBox>{errors.form}</FormErrorBox>

      <div>
        <label htmlFor="date" className="field-label">① 日期</label>
        <input id="date" name="date" type="date" className="input" defaultValue={v?.date ?? initial.date} aria-invalid={!!errors.date} />
        <ErrorText>{errors.date}</ErrorText>
      </div>

      <fieldset>
        <legend className="field-label">② {kind === "income" ? "收入項目" : "支出分類"}</legend>
        <div className="grid grid-cols-2 gap-3">
          {cats.map((c) => (
            <label key={c} className="choice">
              <input type="radio" name="category" value={c} checked={current === c} onChange={() => setSelected(c)} />
              <span>{c}</span>
            </label>
          ))}
          <label className="choice">
            <input type="radio" name="category" value="__custom__" checked={current === "__custom__"} onChange={() => setSelected("__custom__")} />
            <span>其他（自行輸入）</span>
          </label>
        </div>
        {current === "__custom__" && (
          <div className="mt-3">
            <label htmlFor="customCategory" className="field-label">請輸入{kind === "income" ? "收入項目" : "支出分類"}名稱</label>
            <input id="customCategory" name="customCategory" className="input" defaultValue={startCustom} maxLength={20} />
          </div>
        )}
        <ErrorText>{errors.category}</ErrorText>
      </fieldset>

      <div>
        <label htmlFor="amount" className="field-label">③ {kind === "income" ? "收入金額" : "支出金額"}（元）</label>
        <input
          id="amount"
          name="amount"
          inputMode="numeric"
          autoComplete="off"
          placeholder="例如 500"
          className="input input-amount"
          defaultValue={v?.amount ?? initial.amount}
          aria-invalid={!!errors.amount}
        />
        <ErrorText>{errors.amount}</ErrorText>
      </div>

      <div>
        <label htmlFor="note" className="field-label">備註（可以不填）</label>
        <input id="note" name="note" className="input" defaultValue={v?.note ?? initial.note} maxLength={200} />
        <ErrorText>{errors.note}</ErrorText>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={`btn ${kind === "income" ? "btn-income" : "btn-expense"} min-w-[12rem] text-[1.3rem]`}>
          {pending ? "儲存中…" : "④ 儲存"}
        </button>
        <Link href={cancelHref} className="btn btn-secondary">取消</Link>
      </div>
    </form>
  );
}
