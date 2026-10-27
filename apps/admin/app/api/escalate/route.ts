import { authenticateCustomer, json, preflight } from "@/lib/api/customer";
import { escalateConversation } from "@/lib/escalation";
import { createAdminClient } from "@/lib/supabase/admin";

const NOTICE = "担当者におつなぎします。しばらくお待ちください。";
const NOTICE_AFTER_HOURS =
  "現在は営業時間外です。担当者の回答は翌営業日になります。AI でお答えできる内容はこのままご質問ください。";

export function OPTIONS(request: Request) {
  return preflight(request);
}

// W-07: 顧客自身が「人間対応」を依頼する
export async function POST(request: Request) {
  const conv = await authenticateCustomer(request);
  if (conv instanceof Response) return conv;
  if (conv.status !== "ai_handling") return json(request, { skipped: true, message: null });

  const admin = createAdminClient();
  const result = await escalateConversation(admin, conv.id);
  if (!result) return json(request, { skipped: true, message: null });

  const { data: message, error } = await admin
    .from("messages")
    .insert({ conversation_id: conv.id, sender_type: "system", body: result === "queued" ? NOTICE_AFTER_HOURS : NOTICE })
    .select("id, conversation_id, sender_type, body, created_at")
    .single();
  if (error) console.error("[escalate] notice insert failed", error.message);
  return json(request, { message: message ?? null });
}
