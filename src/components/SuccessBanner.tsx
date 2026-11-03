"use client";

import { useEffect, useState } from "react";

/** 操作成功後的簡單提示。顯示後把網址上的 saved 參數拿掉，重新整理就不會再出現。 */
export function SuccessBanner({ message }: { message: string | null }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!message) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("saved")) {
      url.searchParams.delete("saved");
      window.history.replaceState(null, "", url.toString());
    }
  }, [message]);
  if (!message || hidden) return null;
  return (
    <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-2xl border-2 border-ok bg-green-50 p-4 font-bold text-green-900">
      <span>✅ {message}</span>
      <button type="button" className="btn btn-secondary" onClick={() => setHidden(true)}>
        關閉
      </button>
    </div>
  );
}

export const SAVED_MESSAGES: Record<string, string> = {
  income: "已經儲存這筆收入",
  expense: "已經儲存這筆支出",
  updated: "已經修改完成",
  deleted: "已經刪除",
  budget: "已經儲存本月預算",
  "budget-cleared": "已經清除本月預算",
  debt: "已經儲存債務資料",
  payment: "已經記錄這次還款，記帳本的支出也同步更新了",
  settled: "已經標記為還清",
  restored: "已經還原備份資料",
  household: "家庭建立好了，把邀請碼給家人就能一起記帳",
  joined: "已經加入家庭，現在看到的是全家共用的帳本",
  code: "已經換成新的邀請碼，舊的邀請碼不能再使用",
  "member-removed": "已經移除這位成員",
};
