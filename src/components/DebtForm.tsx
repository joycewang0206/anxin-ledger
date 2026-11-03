"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveDebtAction, type FormState } from "@/app/actions";
import { ErrorText, FormErrorBox } from "./ui";

export interface DebtInitial {
  id?: string;
  name: string;
  creditor: string;
  originalPrincipal: string;
  remainingPrincipal: string;
  monthlyPayment: string;
  paymentDay: string;
  startDate: string;
  annualRate: string;
  note: string;
}

export function DebtForm({ initial, cancelHref, editing }: { initial: DebtInitial; cancelHref: string; editing: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveDebtAction, null);
  const v = state?.values;
  const e = state?.errors ?? {};
  const val = (k: keyof DebtInitial) => v?.[k] ?? initial[k] ?? "";

  return (
    <form action={action} className="flex max-w-[44rem] flex-col gap-5" noValidate>
      <input type="hidden" name="id" value={initial.id ?? ""} />
      <FormErrorBox>{e.form}</FormErrorBox>

      <div>
        <label htmlFor="name" className="field-label">債務名稱</label>
        <input id="name" name="name" className="input" placeholder="例如：銀行貸款" defaultValue={val("name")} maxLength={30} aria-invalid={!!e.name} />
        <ErrorText>{e.name}</ErrorText>
      </div>
      <div>
        <label htmlFor="creditor" className="field-label">欠款對象（可以不填）</label>
        <input id="creditor" name="creditor" className="input" placeholder="例如：某某銀行、親友的名字" defaultValue={val("creditor")} maxLength={30} />
        <ErrorText>{e.creditor}</ErrorText>
      </div>
      <div>
        <label htmlFor="originalPrincipal" className="field-label">原始欠款金額（元）</label>
        <input id="originalPrincipal" name="originalPrincipal" inputMode="numeric" autoComplete="off" className="input input-amount" defaultValue={val("originalPrincipal")} aria-invalid={!!e.originalPrincipal} />
        <ErrorText>{e.originalPrincipal}</ErrorText>
      </div>
      <div>
        <label htmlFor="remainingPrincipal" className="field-label">
          {editing ? "開始記錄時，還欠多少錢（元）" : "目前還欠多少錢（元）"}
        </label>
        <input id="remainingPrincipal" name="remainingPrincipal" inputMode="numeric" autoComplete="off" className="input input-amount" defaultValue={val("remainingPrincipal")} aria-invalid={!!e.remainingPrincipal} />
        <p className="field-hint">
          {editing ? "之後記錄的還款，會從這個金額往下扣。" : "如果還沒還過錢，可以不填，系統會當作和原始欠款一樣。已經還過一部分，請填還剩多少。"}
        </p>
        <ErrorText>{e.remainingPrincipal}</ErrorText>
      </div>
      <div>
        <label htmlFor="monthlyPayment" className="field-label">每月預計還款金額（元）</label>
        <input id="monthlyPayment" name="monthlyPayment" inputMode="numeric" autoComplete="off" className="input input-amount" defaultValue={val("monthlyPayment")} aria-invalid={!!e.monthlyPayment} />
        <p className="field-hint">不填也可以，但就無法估算還清日期。</p>
        <ErrorText>{e.monthlyPayment}</ErrorText>
      </div>
      <div>
        <label htmlFor="paymentDay" className="field-label">每月幾號還款（1～31）</label>
        <input id="paymentDay" name="paymentDay" inputMode="numeric" autoComplete="off" className="input" defaultValue={val("paymentDay")} aria-invalid={!!e.paymentDay} />
        <p className="field-hint">遇到沒有那一天的月份（例如 31 號），會以當月最後一天計。</p>
        <ErrorText>{e.paymentDay}</ErrorText>
      </div>
      <div>
        <label htmlFor="startDate" className="field-label">開始還款日期</label>
        <input id="startDate" name="startDate" type="date" className="input" defaultValue={val("startDate")} aria-invalid={!!e.startDate} />
        <ErrorText>{e.startDate}</ErrorText>
      </div>
      <div>
        <label htmlFor="annualRate" className="field-label">年利率 %（不確定就不用填）</label>
        <input id="annualRate" name="annualRate" inputMode="decimal" autoComplete="off" placeholder="0" className="input" defaultValue={val("annualRate")} aria-invalid={!!e.annualRate} />
        <p className="field-hint">沒有填就是 0%，只依你實際記錄的還款來管理本金。</p>
        <ErrorText>{e.annualRate}</ErrorText>
      </div>
      <div>
        <label htmlFor="note" className="field-label">備註（可以不填）</label>
        <input id="note" name="note" className="input" defaultValue={val("note")} maxLength={200} />
        <ErrorText>{e.note}</ErrorText>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary min-w-[12rem] text-[1.3rem]">
          {pending ? "儲存中…" : "儲存"}
        </button>
        <Link href={cancelHref} className="btn btn-secondary">取消</Link>
      </div>
    </form>
  );
}
