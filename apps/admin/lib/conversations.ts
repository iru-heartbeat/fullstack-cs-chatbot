// 会話一覧・詳細で共有する表示用の定義（O-02, O-03）

export type ConversationStatus =
  | "ai_handling"
  | "resolved_by_ai"
  | "escalated"
  | "queued"
  | "operator_handling"
  | "closed";

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  ai_handling: "AI 対応中",
  resolved_by_ai: "AI 解決",
  escalated: "オペレーター待ち",
  queued: "翌日対応キュー",
  operator_handling: "対応中",
  closed: "完了",
};

// 絞り込みタブ（O-03）。value は URL の ?status= に入れる
export const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "escalated", label: STATUS_LABEL.escalated },
  { value: "queued", label: STATUS_LABEL.queued },
  { value: "operator_handling", label: STATUS_LABEL.operator_handling },
  { value: "closed", label: STATUS_LABEL.closed },
  { value: "resolved_by_ai", label: STATUS_LABEL.resolved_by_ai },
];

export const SENDER_LABEL: Record<string, string> = {
  customer: "顧客",
  ai: "AI",
  operator: "オペレーター",
  system: "システム",
};

export function isStatus(v: string | undefined): v is ConversationStatus {
  return !!v && v in STATUS_LABEL;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
