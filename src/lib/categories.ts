export const INCOME_CATEGORIES = ["薪水", "退休金", "其他收入"] as const;
export const EXPENSE_CATEGORIES = [
  "吃飯買菜",
  "水電瓦斯",
  "房租",
  "交通費",
  "醫療費",
  "日常用品",
  "休閒娛樂",
  "其他支出",
] as const;

/** 由債務管理自動產生的支出分類，不能在一般新增支出頁選擇。 */
export const DEBT_CATEGORY = "債務還款";
export const CUSTOM_CATEGORY_MAX = 20;
