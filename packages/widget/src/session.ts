import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage } from "./types";

// ブラウザ側では anon キーのみ使う（service role キーは絶対に渡さない）
export function createWidgetClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "cs-widget-auth" },
  });
}

// W-09: 既存セッション（localStorage に保存）があれば再利用し、なければ匿名サインインする
export async function ensureAnonymousSession(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signedIn, error } = await client.auth.signInAnonymously();
  if (error || !signedIn.user) throw error ?? new Error("anonymous sign-in failed");
  return signedIn.user.id;
}

// 自分の最新の「進行中の」会話とそのメッセージを取得（RLS により自分の会話しか返らない）
// 完了・AI 解決済みの会話は再開しない（書き込んでも誰にも届かないため。新しい会話を作る）
export async function loadLatestConversation(
  client: SupabaseClient,
): Promise<{ conversationId: string; messages: ChatMessage[] } | null> {
  const { data: conv, error } = await client
    .from("conversations")
    .select("id")
    .not("status", "in", "(closed,resolved_by_ai)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!conv) return null;
  const { data: msgs, error: mErr } = await client
    .from("messages")
    .select("id, conversation_id, sender_type, body, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true });
  if (mErr) throw mErr;
  return { conversationId: conv.id, messages: (msgs ?? []) as ChatMessage[] };
}

// 会話は最初のメッセージ送信時に作る（空の会話を作らないため）
export async function createConversation(client: SupabaseClient, customerId: string): Promise<string> {
  const { data, error } = await client
    .from("conversations")
    .insert({ customer_id: customerId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function sendCustomerMessage(
  client: SupabaseClient,
  conversationId: string,
  body: string,
): Promise<ChatMessage> {
  const { data, error } = await client
    .from("messages")
    .insert({ conversation_id: conversationId, sender_type: "customer", body })
    .select("id, conversation_id, sender_type, body, created_at")
    .single();
  if (error) throw error;
  return data as ChatMessage;
}

// A-01〜A-10: サーバー（管理画面アプリの API）に AI 返信を依頼する。
// 認証は匿名セッションのアクセストークン。AI 返信は DB に保存され、そのメッセージが返る。
export async function requestAiReply(
  client: SupabaseClient,
  apiBaseUrl: string,
  conversationId: string,
): Promise<{ message: ChatMessage | null; escalate: boolean }> {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("no session");
  const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/ai-reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ conversationId }),
  });
  if (!res.ok) throw new Error(`ai-reply failed: ${res.status}`);
  const json = (await res.json()) as { message?: ChatMessage; escalate?: boolean };
  return { message: json.message ?? null, escalate: json.escalate ?? false };
}
