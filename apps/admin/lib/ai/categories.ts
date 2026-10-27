// 要件定義書 7.3 のカテゴリ初期案【仮】。顧客と確定したらここを差し替える。
export const CATEGORIES = [
  "注文・配送",
  "返品・交換・返金",
  "商品について",
  "支払い・請求",
  "アカウント・会員",
  "サイト・技術的な問題",
  "その他",
] as const;

export type Category = (typeof CATEGORIES)[number];
