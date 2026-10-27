import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentBusinessStatus, type BusinessStatus } from "@/lib/business-hours";

// 営業時間内は escalated（オペレーター待ち）、時間外は queued（翌日対応キュー）にして
// is_after_hours=true を立てる（H-03, O-09）。
// ai_handling のときだけ更新するので、二重に呼ばれても状態は壊れず、
// 戻り値で「今回エスカレーションが起きたか」と振り分け先が分かる（起きなければ null）。
// お知らせ文とステータスで営業判定がずれないよう、呼び出し側が判定済みの status を渡せる。
export async function escalateConversation(
  admin: SupabaseClient,
  conversationId: string,
  businessStatus?: BusinessStatus,
): Promise<"escalated" | "queued" | null> {
  const { isOpen } = businessStatus ?? (await getCurrentBusinessStatus(admin));
  const { data, error } = await admin
    .from("conversations")
    .update(isOpen ? { status: "escalated" } : { status: "queued", is_after_hours: true })
    .eq("id", conversationId)
    .eq("status", "ai_handling")
    .select("id");
  if (error) {
    console.error("[escalation] update failed", error.message);
    return null;
  }
  if (!data?.length) return null;
  return isOpen ? "escalated" : "queued";
}
