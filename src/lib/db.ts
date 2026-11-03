import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

/** 已登入使用者的 Supabase client：所有查詢都以該使用者身分執行，資料隔離由資料庫的 RLS 負責。 */
// 不使用自動產生的資料庫型別（schema 由 supabase/migrations 管理），回傳資料在 rows.ts 轉成明確的型別
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, "public", any>;
export type Client = Db;

/** 可以直接顯示給使用者看的錯誤訊息。 */
export class ServiceError extends Error {}

export const DEBT_LOCKED_MESSAGE = "這筆是「債務還款」，請到「債務管理」修改或刪除，才能讓債務金額保持一致。";

/** 資料庫函式用 `ANXIN:<代碼>` 回報可預期的錯誤，這裡轉成使用者看得懂的中文。 */
const ERROR_MESSAGES: Record<string, string> = {
  not_signed_in: "請先登入",
  already_member: "你已經加入一個家庭了",
  not_member: "你還沒有加入任何家庭，請先建立或加入家庭",
  owner_only: "只有家庭管理者可以這樣做",
  owner_cannot_leave: "管理者不能直接離開家庭。請先移除其他成員，或繼續使用這個家庭。",
  member_not_found: "找不到這位成員",
  debt_not_found: "找不到這筆債務，可能已經被刪除",
  debt_has_payments: "這筆債務已經有還款紀錄，不能直接刪除，以免歷史紀錄和每月支出對不起來。若已經還清，請使用「標記已還清」。",
  debt_already_paid: "這筆債務已經還清了，不需要再記錄還款",
  principal_too_small: "目前剩餘欠款設得太小：已經記錄的還款本金比這個金額還多，請先到還款紀錄確認",
  principal_exceeds_remaining: "還款的「本金」不能超過目前剩餘欠款",
  payment_not_found: "找不到這筆還款紀錄，可能已經被刪除",
  debt_expense_locked: DEBT_LOCKED_MESSAGE,
};

export function toServiceError(error: PostgrestError | { message: string }): Error {
  const m = /ANXIN:([a-z_]+)/.exec(error.message ?? "");
  if (m && ERROR_MESSAGES[m[1]]) return new ServiceError(ERROR_MESSAGES[m[1]]);
  return new Error(`資料庫錯誤：${error.message}`);
}

/** 取出查詢結果；出錯就丟出（可預期的錯誤是 ServiceError，其餘是一般 Error）。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unwrap(res: { data: any; error: PostgrestError | null }): any {
  if (res.error) throw toServiceError(res.error);
  return res.data;
}

/** PostgREST（含 Supabase）預設每次最多回傳 1000 筆，這裡一頁一頁讀完，避免匯出與統計被默默截斷。 */
export const PAGE_SIZE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export async function fetchAll(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: PostgrestError | null }>,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = unwrap(await page(from, from + PAGE_SIZE - 1)) ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}
