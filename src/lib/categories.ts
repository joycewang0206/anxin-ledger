export const INCOME_CATEGORIES = ["薪水", "外送", "年終獎金"] as const;
export const EXPENSE_CATEGORIES = ["生活費", "機場停車費", "出差費"] as const;

/** 由債務管理自動產生的支出分類，不能在一般新增支出頁選擇。 */
export const DEBT_CATEGORY = "債務還款";
export const CUSTOM_CATEGORY_MAX = 20;
