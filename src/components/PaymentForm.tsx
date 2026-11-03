"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { savePaymentAction, type FormState } from "@/app/actions";
import { formatYuan } from "@/lib/money";
import { ErrorText, FormErrorBox } from "./ui";

interface Props {
  debtId: string;
  paymentId?: string;
  debtName: string;
  remainingForPayment: number;
  hasRate: boolean;
  initial: { date: string; amount: string; interest: string; fee: string; note: string };
  cancelHref: string;
}

const toInt = (s: string) => {
  const n = Number(String(s).replace(/[,，\s]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

export function PaymentForm({ debtId, paymentId, debtName, remainingForPayment, hasRate, initial, cancelHref }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePaymentAction, null);
  const e = state?.errors ?? {};
  const [amount, setAmount] = useState(state?.values.amount ?? initial.amount);
  const [interest, setInterest] = useState(state?.values.interest ?? initial.interest);
  const [fee, setFee] = useState(state?.values.fee ?? initial.fee);
  const principal = toInt(amount) - toInt(interest) - toInt(fee);

  return (
    <form action={action} className="flex max-w-[44rem] flex-col gap-5" noValidate>
      <input type="hidden" name="debtId" value={debtId} />
      <input type="hidden" name="paymentId" value={paymentId ?? ""} />
      <FormErrorBox>{e.form}</FormErrorBox>

      <p className="card">
        <span className="font-bold">{debtName}</span>　目前還欠 <span className="num">{formatYuan(remainingForPayment)}</span>
      </p>

      <div>
        <label htmlFor="date" className="field-label">還款日期</label>
        <input id="date" name="date" type="date" className="input" defaultValue={state?.values.date ?? initial.date} aria-invalid={!!e.date} />
        <ErrorText>{e.date}</ErrorText>
      </div>
      <div>
        <label htmlFor="amount" className="field-label">這次實際還了多少錢（元）</label>
        <input
          id="amount"
          name="amount"
          inputMode="numeric"
          autoComplete="off"
          className="input input-amount"
          value={amount}
          onChange={(ev) => setAmount(ev.target.value)}
          aria-invalid={!!e.amount}
        />
        <p className="field-hint">已經先填好每月預計還款金額，不一樣請直接改。提前多還也是填實際金額。</p>
        <ErrorText>{e.amount}</ErrorText>
      </div>
      <div>
        <label htmlFor="interest" className="field-label">其中利息（元，沒有就填 0）</label>
        <input id="interest" name="interest" inputMode="numeric" autoComplete="off" className="input" value={interest} onChange={(ev) => setInterest(ev.target.value)} aria-invalid={!!e.interest} />
        {hasRate && <p className="field-hint">已先填入估算的利息。請以銀行通知為準。</p>}
        <ErrorText>{e.interest}</ErrorText>
      </div>
      <div>
        <label htmlFor="fee" className="field-label">其中其他費用（元，沒有就填 0）</label>
        <input id="fee" name="fee" inputMode="numeric" autoComplete="off" className="input" value={fee} onChange={(ev) => setFee(ev.target.value)} aria-invalid={!!e.fee} />
        <ErrorText>{e.fee}</ErrorText>
      </div>

      <div className="card" aria-live="polite">
        <p className="font-bold">這次會減少的本金</p>
        <p className={`num ${principal < 0 ? "text-alert" : "text-balance"}`}>{principal < 0 ? "金額不對" : formatYuan(principal)}</p>
        <p className="muted">本金 = 還款金額 − 利息 − 其他費用。只有本金會減少欠款，利息和費用不會。</p>
      </div>

      <div>
        <label htmlFor="note" className="field-label">備註（可以不填）</label>
        <input id="note" name="note" className="input" defaultValue={state?.values.note ?? initial.note} maxLength={200} />
      </div>

      <p className="muted">儲存後，這筆還款會自動記進「本月支出」（分類：債務還款），不需要再另外記一次。</p>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="btn btn-income min-w-[12rem] text-[1.3rem]">
          {pending ? "儲存中…" : paymentId ? "儲存修改" : "確認還款"}
        </button>
        <Link href={cancelHref} className="btn btn-secondary">取消</Link>
      </div>
    </form>
  );
}
