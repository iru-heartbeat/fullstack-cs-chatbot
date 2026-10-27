import { authenticateCustomer, json, preflight } from "@/lib/api/customer";
import { escalateConversation } from "@/lib/escalation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentBusinessStatus } from "@/lib/business-hours";
import { generateReply, type HistoryItem } from "@/lib/ai/reply";

const HISTORY_LIMIT = 10; // A-05

const APOLOGY = "申し訳ございません。ただいまAIが回答できないため、担当者におつなぎします。";
const HANDOFF = "こちらの内容は担当者が確認してご案内します。しばらくお待ちください。";
const AFTER_HOURS_SUFFIX = "\n現在は営業時間外のため、担当者の回答は翌営業日になります。";

export function OPTIONS() {
  return preflight();
}

export async function POST(request: Request) {
  const conv = await authenticateCustomer(request);
  if (conv instanceof Response) return conv;
  if (conv.status !== "ai_handling") return json({ skipped: true, escalate: false });

  // 以降は service role（サーバー側のみ）で FAQ と履歴を読み、返信を書き込む
  const admin = createAdminClient();
  const [{ data: faqs }, { data: recent }] = await Promise.all([
    admin.from("faq").select("id, category, question, answer").eq("is_active", true),
    admin
      .from("messages")
      .select("sender_type, body")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  // 新しい順で取得したので古い順に戻し、system は除外。先頭は user、末尾も user にそろえる
  const history: HistoryItem[] = (recent ?? [])
    .reverse()
    .filter((m) => m.sender_type !== "system")
    .map((m) => ({
      role: m.sender_type === "customer" ? ("user" as const) : ("assistant" as const),
      content: m.body,
    }));
  while (history.length && history[0].role !== "user") history.shift();
  if (!history.length || history[history.length - 1].role !== "user") {
    return json({ error: "no_customer_message" }, 409);
  }

  const reply = await generateReply(faqs ?? [], history);

  // エスカレーション時は、お知らせ文とステータスで同じ営業判定を使う（H-03）
  const businessStatus = reply.kind === "escalate" ? await getCurrentBusinessStatus(admin) : undefined;

  const row =
    reply.kind === "answer"
      ? { sender_type: "ai", body: reply.text, used_faq_ids: reply.usedFaqIds }
      : {
          sender_type: "system",
          body: (reply.reason === "ai_error" ? APOLOGY : HANDOFF) + (businessStatus?.isOpen === false ? AFTER_HOURS_SUFFIX : ""),
          used_faq_ids: [],
        };

  const { data: message, error } = await admin
    .from("messages")
    .insert({ conversation_id: conv.id, ...row })
    .select("id, conversation_id, sender_type, body, created_at")
    .single();
  if (error) {
    console.error("[ai-reply] insert failed", error.message);
    return json({ error: "insert_failed" }, 500);
  }

  // A-04: 最初の質問のカテゴリを保存。未設定のときだけ書く（オペレーターが直した値を上書きしない）
  if (reply.category && !conv.category) {
    const { error: catError } = await admin
      .from("conversations")
      .update({ category: reply.category })
      .eq("id", conv.id)
      .is("category", null);
    if (catError) console.error("[ai-reply] category update failed", catError.message);
  }

  // A-03, A-09, A-10: 回答不可・危険トピック・API 障害はエスカレーション（ステータスを escalated に）
  const escalate = reply.kind === "escalate";
  if (escalate) await escalateConversation(admin, conv.id, businessStatus);
  return json({ message, escalate });
}
