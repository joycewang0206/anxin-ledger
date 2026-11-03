"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

export const BACKUP_KEY = "anxin:lastBackup";
const DAYS = 7;

/** 超過 7 天沒有下載備份，就在首頁提醒。只記在這台裝置上（瀏覽器），不會把任何資料送出去。 */
/** 距離上次備份幾天；從沒備份過（或讀不到）回傳 null。 */
function readDays(): number | null {
  try {
    const t = Date.parse(localStorage.getItem(BACKUP_KEY) ?? "");
    return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
  } catch {
    return null;
  }
}
const subscribe = () => () => {};

export function BackupReminder({ hasData }: { hasData: boolean }) {
  // 伺服器端回傳 undefined（還不知道），瀏覽器端才讀這台裝置的紀錄
  const days = useSyncExternalStore(subscribe, readDays, () => undefined);
  if (!hasData || days === undefined || (days !== null && days < DAYS)) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-expense bg-amber-50 p-4 font-bold text-amber-900">
      <span>💾 {days === null ? "還沒有下載過備份。" : `已經 ${days} 天沒有備份了。`}請下載一份備份檔，存到自己的雲端。</span>
      <Link href="/settings#backup" className="btn btn-primary">前往備份</Link>
    </div>
  );
}
