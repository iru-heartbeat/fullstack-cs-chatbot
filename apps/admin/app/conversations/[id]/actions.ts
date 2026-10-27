"use server";

import { createClient } from "@/lib/supabase/server";
import { MESSAGE_MAX_LENGTH, type Conversation, type Message } from "@cs-chatbot/shared";

// 画面側へはエラー文言だけ返す（例外を投げると本番では文言が隠れるため）
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const CONV_COLUMNS =
  "id, customer_id, status, category, assigned_operator_id, is_after_hours, customer_email, created_at, updated_at, closed_at";

async function currentOperator() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, operatorId: null };
  const { data: op } = await supabase
    .from("operators")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();
  return { supabase, operatorId: op?.id ?? null };
}

const NOT_ALLOWED = { ok: false, error: "操作する権限がありません。再ログインしてください。" } as const;

// O-06: 「対応する」。escalated / queued かつ未割り当ての行だけを条件付きで更新する。
// 同時に2人が押しても、先に更新した1人だけが 1 行を更新でき、もう1人は 0 行になる。
export async function claimConversation(id: string): Promise<ActionResult<Conversation>> {
  const { supabase, operatorId } = await currentOperator();
  if (!operatorId) return NOT_ALLOWED;
  const { data, error } = await supabase
    .from("conversations")
    .update({ status: "operator_handling", assigned_operator_id: operatorId })
    .eq("id", id)
    .in("status", ["escalated", "queued"])
    .is("assigned_operator_id", null)
    .select(CONV_COLUMNS);
  if (error) return { ok: false, error: "対応の開始に失敗しました。" };
  if (!data?.length) return { ok: false, error: "他のオペレーターが対応中、または対応できない状態です。" };
  return { ok: true, data: data[0] as Conversation };
}

// O-07: 担当者としての返信。自分が担当の対応中の会話にだけ送れる
export async function sendOperatorReply(id: string, body: string): Promise<ActionResult<Message>> {
  const { supabase, operatorId } = await currentOperator();
  if (!operatorId) return NOT_ALLOWED;
  const text = body.trim();
  if (!text || text.length > MESSAGE_MAX_LENGTH) {
    return { ok: false, error: `メッセージは1〜${MESSAGE_MAX_LENGTH}文字で入力してください。` };
  }
  const { data: conv } = await supabase
    .from("conversations")
    .select("status, assigned_operator_id")
    .eq("id", id)
    .maybeSingle();
  if (!conv) return { ok: false, error: "会話が見つかりません。" };
  if (conv.status !== "operator_handling" || conv.assigned_operator_id !== operatorId) {
    return { ok: false, error: "この会話の担当者ではないため返信できません。" };
  }
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: id,
      sender_type: "operator",
      sender_operator_id: operatorId,
      body: text,
    })
    .select()
    .single();
  if (error) return { ok: false, error: "送信に失敗しました。もう一度お試しください。" };
  return { ok: true, data: data as Message };
}

// O-08: 完了。担当者本人の対応中の会話だけ closed にできる
export async function closeConversation(id: string): Promise<ActionResult<Conversation>> {
  const { supabase, operatorId } = await currentOperator();
  if (!operatorId) return NOT_ALLOWED;
  const { data, error } = await supabase
    .from("conversations")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "operator_handling")
    .eq("assigned_operator_id", operatorId)
    .select(CONV_COLUMNS);
  if (error) return { ok: false, error: "完了にできませんでした。" };
  if (!data?.length) return { ok: false, error: "担当者ではないか、すでに状態が変わっています。" };
  return { ok: true, data: data[0] as Conversation };
}

// O-08: 完了した会話の再オープン。担当が自分か未割り当てのときだけ、自分の担当で対応中に戻す
export async function reopenConversation(id: string): Promise<ActionResult<Conversation>> {
  const { supabase, operatorId } = await currentOperator();
  if (!operatorId) return NOT_ALLOWED;
  const { data, error } = await supabase
    .from("conversations")
    .update({ status: "operator_handling", assigned_operator_id: operatorId, closed_at: null })
    .eq("id", id)
    .eq("status", "closed")
    .or(`assigned_operator_id.is.null,assigned_operator_id.eq.${operatorId}`)
    .select(CONV_COLUMNS);
  if (error) return { ok: false, error: "再オープンできませんでした。" };
  if (!data?.length) return { ok: false, error: "他のオペレーターが担当した会話のため再オープンできません。" };
  return { ok: true, data: data[0] as Conversation };
}
