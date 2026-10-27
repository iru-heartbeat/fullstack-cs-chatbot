import type { SupabaseClient } from "@supabase/supabase-js";

// 営業時間外の queued への振り分けは business-hours-queue 機能で追加する。
// 現状は常に escalated（オペレーター待ち）にする。
// ai_handling のときだけ更新するので、二重に呼ばれても状態は壊れず、
// 戻り値で「今回エスカレーションが起きたか」が分かる。
export async function escalateConversation(
  admin: SupabaseClient,
  conversationId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("conversations")
    .update({ status: "escalated" })
    .eq("id", conversationId)
    .eq("status", "ai_handling")
    .select("id");
  if (error) {
    console.error("[escalation] update failed", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
