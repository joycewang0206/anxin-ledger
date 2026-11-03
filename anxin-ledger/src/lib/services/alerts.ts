import { buildAlertModal, type AlertModalData } from "../alerts";
import { computeDebtAlerts } from "../debt";
import type { Client } from "../db";
import { computeLedgerAlert } from "../ledger";
import { listDebts } from "./debts";
import { getMonthSummary } from "./ledger";

/**
 * 由實際資料即時計算提醒（不依賴任何前端暫存數值）。
 * 還款提醒永遠看「今天」；記帳（預算、收入）提醒看指定月份。
 */
export async function loadAlertModal(db: Client, opts: { month: string; includeLedger: boolean; today: string }): Promise<AlertModalData | null> {
  const [summary, debts] = await Promise.all([opts.includeLedger ? getMonthSummary(db, opts.month) : null, listDebts(db)]);
  const ledger = summary ? computeLedgerAlert(opts.month, summary) : null;
  return buildAlertModal(ledger, computeDebtAlerts(debts, opts.today));
}
