"use client";

import { useRef, useState, useTransition } from "react";
import { previewBackupAction, restoreBackupAction, type BackupPreview } from "@/app/actions";
import type { ImportPlan } from "@/lib/services/backup";
import { BACKUP_KEY } from "./BackupReminder";

function markBackedUp() {
  try {
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
  } catch {}
}

const LABELS: [keyof Omit<ImportPlan, "problems">, string][] = [
  ["incomes", "收入"],
  ["expenses", "支出"],
  ["budgets", "每月預算"],
  ["debts", "債務"],
  ["debtPayments", "還款紀錄"],
];

export function BackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [done, setDone] = useState<ImportPlan | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, start] = useTransition();

  function reset() {
    setText(null);
    setFileName("");
    setPreview(null);
    setDone(null);
    setConfirmed(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(file: File | undefined) {
    setPreview(null);
    setDone(null);
    setConfirmed(false);
    if (!file) return;
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    start(async () => setPreview(await previewBackupAction(content)));
  }

  function restore() {
    if (!text) return;
    start(async () => {
      const r = await restoreBackupAction(text);
      if (r.ok) {
        setDone(r.plan);
        setPreview(null);
      } else setPreview(r);
    });
  }

  const plan = preview?.ok ? preview.plan : null;
  const addTotal = plan ? LABELS.reduce((a, [k]) => a + plan[k].add, 0) : 0;

  return (
    <div className="flex flex-col gap-6">
      <section id="backup" className="card scroll-mt-4">
        <h3 className="mb-1 text-[1.3rem] font-extrabold">備份（存一份到安全的地方）</h3>
        <p className="mb-3">備份檔包含所有收入、支出、預算和債務紀錄。建議每週備份一次，存到隨身碟或雲端硬碟；超過 7 天沒備份，首頁會提醒你。</p>
        <div className="flex flex-wrap gap-3">
          <a href="/api/export/json" className="btn btn-primary" download onClick={markBackedUp}>⬇️ 下載備份檔（JSON）</a>
          <a href="/api/export/csv" className="btn btn-secondary" download>⬇️ 下載 Excel 表格（CSV）</a>
        </div>
      </section>

      <section className="card">
        <h3 className="mb-1 text-[1.3rem] font-extrabold">還原（從備份檔放回資料）</h3>
        <p className="mb-3">還原只會「補上」目前沒有的紀錄，不會刪除或覆蓋你現在的資料。已經有的紀錄會自動略過，所以重複還原也不會變成兩筆。</p>

        {done ? (
          <div role="status" className="rounded-2xl border-2 border-ok bg-green-50 p-4">
            <p className="font-bold text-green-900">✅ 還原完成</p>
            <ul className="mt-1">
              {LABELS.map(([k, label]) => (
                <li key={k}>{label}：新增 {done[k].add} 筆，略過重複 {done[k].skip} 筆</li>
              ))}
            </ul>
            <button type="button" className="btn btn-secondary mt-3" onClick={reset}>完成</button>
          </div>
        ) : (
          <>
            <label htmlFor="backup-file" className="field-label">① 選擇備份檔</label>
            <input
              id="backup-file"
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="input mb-3"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            {pending && !plan && <p role="status">讀取中…</p>}

            {preview && !preview.ok && (
              <div role="alert" className="rounded-2xl border-2 border-red-700 bg-red-50 p-4 font-bold text-red-800">
                <p>⚠️ 這個檔案不能還原，你的資料沒有被改動：</p>
                <ul className="list-disc pl-6">
                  {preview.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {plan && (
              <div>
                <p className="field-label">② 確認內容（{fileName}）</p>
                <ul className="mb-3 rounded-2xl border-2 border-line bg-white p-3">
                  {LABELS.map(([k, label]) => (
                    <li key={k}>
                      {label}：共 {plan[k].total} 筆，<strong>將新增 {plan[k].add} 筆</strong>，已存在略過 {plan[k].skip} 筆
                    </li>
                  ))}
                </ul>
                {plan.problems.length > 0 ? (
                  <div role="alert" className="rounded-2xl border-2 border-red-700 bg-red-50 p-4 font-bold text-red-800">
                    ⚠️ 無法還原：{plan.problems.join("、")}
                  </div>
                ) : addTotal === 0 ? (
                  <p className="font-bold">這份備份裡的資料，目前都已經有了，不需要還原。</p>
                ) : (
                  <>
                    <label className="mb-3 flex items-center gap-3 font-bold">
                      <input type="checkbox" className="h-8 w-8" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                      我確認要把上面的 {addTotal} 筆資料加進記帳本
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className="btn btn-primary" disabled={!confirmed || pending} onClick={restore}>
                        {pending ? "還原中…" : "③ 開始還原"}
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={reset}>取消</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
