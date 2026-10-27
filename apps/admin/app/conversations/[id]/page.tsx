import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Conversation, Message } from "@cs-chatbot/shared";
import { ConversationPanel } from "./ConversationPanel";

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select(
      "id, customer_id, status, category, assigned_operator_id, is_after_hours, customer_email, created_at, updated_at, closed_at",
    )
    .eq("id", id)
    .maybeSingle();
  // 22P02 = UUID 形式でない ID。それ以外の失敗は 404 にせずエラー表示する
  if (convError && convError.code !== "22P02") {
    return <p role="alert">会話の取得に失敗しました。</p>;
  }
  if (!conv) notFound();

  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_type, sender_operator_id, body, used_faq_ids, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (msgError) return <p role="alert">メッセージの取得に失敗しました。</p>;

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return <p role="alert">ログインが必要です。</p>;

  return (
    <ConversationPanel
      initialConversation={conv as Conversation}
      initialMessages={(messages ?? []) as Message[]}
      operatorId={userData.user.id}
    />
  );
}

export default function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main style={{ margin: "2rem auto", maxWidth: 720, padding: "0 1rem" }}>
      <p><Link href="/conversations">← 会話一覧</Link></p>
      <h1>会話詳細</h1>
      <Suspense fallback={<p>読み込み中…</p>}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}
