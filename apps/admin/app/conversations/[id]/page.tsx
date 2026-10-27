import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  SENDER_LABEL,
  STATUS_LABEL,
  formatDateTime,
  type ConversationStatus,
} from "@/lib/conversations";

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select("id, status, category, created_at")
    .eq("id", id)
    .maybeSingle();
  // 22P02 = UUID 形式でない ID。それ以外の失敗は 404 にせずエラー表示する
  if (convError && convError.code !== "22P02") {
    return <p role="alert">会話の取得に失敗しました。</p>;
  }
  if (!conv) notFound();

  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("id, sender_type, body, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (msgError) return <p role="alert">メッセージの取得に失敗しました。</p>;

  return (
    <>
      <p>
        ステータス：{STATUS_LABEL[conv.status as ConversationStatus]} ／ カテゴリ：
        {conv.category ?? "未分類"} ／ 受付：{formatDateTime(conv.created_at)}
      </p>
      <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.75rem" }}>
        {messages?.map((m) => (
          <li
            key={m.id}
            style={{
              padding: "0.5rem 0.75rem",
              border: "1px solid #ddd",
              borderRadius: 8,
              background: m.sender_type === "customer" ? "#fff" : "#f3f6fb",
            }}
          >
            <small>
              {SENDER_LABEL[m.sender_type] ?? m.sender_type}・{formatDateTime(m.created_at)}
            </small>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
          </li>
        ))}
      </ol>
      {!messages?.length && <p>メッセージはありません。</p>}
    </>
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
