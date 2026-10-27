import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateReply, type HistoryItem } from "@/lib/ai/reply";

// ウィジェットは顧客サイトに埋め込まれ別オリジンから呼ぶため CORS を許可する。
// 認証は Cookie ではなく Bearer トークンなので、Origin 全許可でも他人の会話は触れない。
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const HISTORY_LIMIT = 10; // A-05

const APOLOGY = "申し訳ございません。ただいまAIが回答できないため、担当者におつなぎします。";
const HANDOFF = "こちらの内容は担当者が確認してご案内します。しばらくお待ちください。";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const body = await request.json().catch(() => null);
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
  if (!token || !conversationId) return json({ error: "bad_request" }, 400);

  // 1) 呼び出し元の顧客として会話を読めるか確認（RLS により他人の会話は見えない）
  const asCustomer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data: conv } = await asCustomer
    .from("conversations")
    .select("id, status, category")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return json({ error: "not_found" }, 404);
  if (conv.status !== "ai_handling") return json({ skipped: true, escalate: false });

  // 2) 以降は service role（サーバー側のみ）で FAQ と履歴を読み、返信を書き込む
  const admin = createAdminClient();
  const [{ data: faqs }, { data: recent }] = await Promise.all([
    admin.from("faq").select("id, category, question, answer").eq("is_active", true),
    admin
      .from("messages")
      .select("sender_type, body")
      .eq("conversation_id", conversationId)
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

  const row =
    reply.kind === "answer"
      ? { sender_type: "ai", body: reply.text, used_faq_ids: reply.usedFaqIds }
      : { sender_type: "system", body: reply.reason === "ai_error" ? APOLOGY : HANDOFF, used_faq_ids: [] };

  const { data: message, error } = await admin
    .from("messages")
    .insert({ conversation_id: conversationId, ...row })
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
      .eq("id", conversationId)
      .is("category", null);
    if (catError) console.error("[ai-reply] category update failed", catError.message);
  }

  // 会話ステータスの変更（escalated / queued）は escalation 機能で行う。ここでは判定だけ返す
  return json({ message, escalate: reply.kind === "escalate" });
}
