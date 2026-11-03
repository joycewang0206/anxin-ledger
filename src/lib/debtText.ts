import { formatDateZh, formatMonthZh } from "./dates";
import type { DebtOverview, Projection } from "./debt";
import { formatYuan } from "./money";

export const ESTIMATE_NOTE = "預計還清日期是系統依目前剩餘本金、每月還款金額與利率估算的，不是銀行保證的清償日期；提前還款或金額改變時會自動重新計算。";
export const INTEREST_NOTE = "利息為估算值，實際金額請以債權人（銀行）通知為準。";

export function describePayoff(p: Projection): { text: string; tone: "ok" | "warn" | "muted" } {
  switch (p.kind) {
    case "ok":
      return { text: `預計 ${formatMonthZh(p.payoffYm)}還清（約剩 ${p.periods} 期）`, tone: "ok" };
    case "paid":
      return { text: p.payoffDate ? `已還清，還清日期 ${formatDateZh(p.payoffDate)}` : "已還清", tone: "ok" };
    case "no-payment":
      return { text: "請設定每月還款金額，才能計算預計還清時間。", tone: "warn" };
    case "insufficient":
      return {
        text: `每月還款金額不夠付利息（每月利息約 ${formatYuan(p.monthlyInterest)}），本金不會減少，所以無法估算還清日期。請調高每月還款金額。`,
        tone: "warn",
      };
    case "too-long":
      return { text: "依目前的每月還款金額，要超過 50 年才能還清，請確認每月還款金額。", tone: "warn" };
  }
}

export function describeOverviewPayoff(o: DebtOverview): { text: string; tone: "ok" | "warn" | "muted" } {
  if (o.payoffYm) return { text: formatMonthZh(o.payoffYm), tone: "ok" };
  switch (o.payoffNote) {
    case "none":
      return { text: "還沒有債務", tone: "muted" };
    case "all-paid":
      return { text: "全部已還清", tone: "ok" };
    case "no-payment":
      return { text: "請設定每月還款金額，才能計算預計還清時間。", tone: "warn" };
    case "insufficient":
      return { text: "有債務的每月還款金額不夠付利息，無法估算", tone: "warn" };
    default:
      return { text: "無法估算，請確認每月還款金額", tone: "warn" };
  }
}
