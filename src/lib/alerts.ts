import { formatDateZh } from "./dates";
import type { DebtAlert } from "./debt";
import { formatYuan } from "./money";
import type { LedgerAlert } from "./ledger";

export type AlertTone = "warn" | "danger" | "ok";

export interface AlertItem {
  key: string;
  tone: AlertTone;
  title: string;
  lines: string[];
  /** 該提醒要前往處理的頁面 */
  href?: string;
}

export interface AlertModalData {
  /** 同一組提醒內容的識別碼；內容沒變就不會重複彈出 */
  signature: string;
  items: AlertItem[];
}

/**
 * 把預算提醒、收入超支提醒與還款提醒合併成「同一個」視窗的內容。
 * 無論同時成立幾種狀況，畫面只會有一個提醒視窗。
 */
export function buildAlertModal(ledger: LedgerAlert | null, debtAlerts: DebtAlert[]): AlertModalData | null {
  const items: AlertItem[] = [];

  if (ledger?.budget) {
    const b = ledger.budget;
    if (b.level === "near") {
      items.push({
        key: `budget-near:${b.expense}`,
        tone: "warn",
        title: "注意！快要超過本月預算了",
        lines: [`已經用了預算的 ${b.percent}%`, `本月預算 ${formatYuan(b.budget)}`, `本月支出 ${formatYuan(b.expense)}`, `還剩 ${formatYuan(b.remaining)}`],
      });
    } else if (b.level === "used") {
      items.push({
        key: `budget-used:${b.expense}`,
        tone: "warn",
        title: "本月預算已經用完",
        lines: [`本月預算 ${formatYuan(b.budget)}`, `本月支出 ${formatYuan(b.expense)}`, "預算剩下 0 元"],
      });
    } else {
      items.push({
        key: `budget-over:${b.expense}`,
        tone: "danger",
        title: "注意！本月已經超支",
        lines: [`本月預算 ${formatYuan(b.budget)}`, `本月支出 ${formatYuan(b.expense)}`, `超過預算 ${formatYuan(b.overAmount)}`],
      });
    }
  }

  if (ledger?.income) {
    const i = ledger.income;
    items.push({
      key: `income-over:${i.income}:${i.expense}`,
      tone: "danger",
      title: "注意！本月支出已經超過收入",
      lines: [`本月收入 ${formatYuan(i.income)}`, `本月支出 ${formatYuan(i.expense)}`, `超支 ${formatYuan(i.overAmount)}`, "請注意接下來的花費！"],
    });
  }

  for (const d of debtAlerts) {
    const href = `/debts/${d.debtId}`;
    if (d.kind === "overdue") {
      items.push({
        key: `debt-overdue:${d.debtId}:${d.dueDate}`,
        tone: "danger",
        title: `「${d.name}」這筆債務已經逾期`,
        lines: [`還款日是 ${formatDateZh(d.dueDate!)}，本月還沒有還款紀錄`, ...(d.amount ? [`每月預計還款 ${formatYuan(d.amount)}`] : [])],
        href,
      });
    } else if (d.kind === "today") {
      items.push({
        key: `debt-today:${d.debtId}:${d.dueDate}`,
        tone: "warn",
        title: `今天是「${d.name}」的還款日`,
        lines: [...(d.amount ? [`每月預計還款 ${formatYuan(d.amount)}`] : []), "還款後請記得按「我已經還款」"],
        href,
      });
    } else if (d.kind === "soon") {
      items.push({
        key: `debt-soon:${d.debtId}:${d.dueDate}`,
        tone: "warn",
        title: `「${d.name}」本月還款即將到期`,
        lines: [`還款日是 ${formatDateZh(d.dueDate!)}`, ...(d.amount ? [`每月預計還款 ${formatYuan(d.amount)}`] : [])],
        href,
      });
    } else {
      items.push({
        key: `debt-paid:${d.debtId}:${d.paidOffDate}`,
        tone: "ok",
        title: `恭喜！「${d.name}」已經還清`,
        lines: d.paidOffDate ? [`還清日期 ${formatDateZh(d.paidOffDate)}`] : [],
        href,
      });
    }
  }

  if (items.length === 0) return null;
  return { signature: items.map((i) => i.key).join("|"), items };
}
