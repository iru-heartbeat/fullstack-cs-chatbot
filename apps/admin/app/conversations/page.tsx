import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  FILTERS,
  STATUS_LABEL,
  formatDateTime,
  isStatus,
  type ConversationStatus,
} from "@/lib/conversations";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function List({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).status;
  const status = typeof raw === "string" && isStatus(raw) ? raw : undefined;

  const supabase = await createClient();
  let query = supabase
    .from("conversations")
    .select("id, status, category, created_at, updated_at")
    .limit(100);
  if (status) query = query.eq("status", status);
  // 翌日対応キューは受付時刻の古い順（O-09）。それ以外は更新が新しい順
  query =
    status === "queued"
      ? query.order("created_at", { ascending: true })
      : query.order("updated_at", { ascending: false });

  const { data: conversations, error } = await query;
  if (error) return <p role="alert">会話の取得に失敗しました。</p>;
  if (!conversations?.length) return <p>該当する会話はありません。</p>;

  // 最終メッセージ：会話ごとに最新の1件を取得（RLS によりオペレーターは全件読める）
  const lasts = await Promise.all(
    conversations.map(async (c) => {
      const { data } = await supabase
        .from("messages")
        .select("body")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.body ?? "";
    }),
  );

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
          <th>ステータス</th>
          <th>カテゴリ</th>
          <th>最終メッセージ</th>
          <th>{status === "queued" ? "受付時刻" : "最終更新"}</th>
        </tr>
      </thead>
      <tbody>
        {conversations.map((c, i) => (
          <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
            <td>
              <Link href={`/conversations/${c.id}`}>
                {STATUS_LABEL[c.status as ConversationStatus]}
              </Link>
            </td>
            <td>{c.category ?? "未分類"}</td>
            <td>{lasts[i].length > 40 ? lasts[i].slice(0, 40) + "…" : lasts[i]}</td>
            <td>{formatDateTime(status === "queued" ? c.created_at : c.updated_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ConversationsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main style={{ margin: "2rem auto", maxWidth: 960, padding: "0 1rem" }}>
      <p><Link href="/">← トップ</Link></p>
      <h1>会話一覧</h1>
      <nav style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", margin: "1rem 0" }}>
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/conversations" : `/conversations?status=${f.value}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <Suspense fallback={<p>読み込み中…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
