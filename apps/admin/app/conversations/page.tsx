import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ConversationList, type ListRow } from "./ConversationList";
import {
  FILTERS,
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

  // 未対応件数（O-04）。絞り込みや 100 件の上限に関係なく全体を数える
  const { count: unhandled } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .in("status", ["escalated", "queued"]);

  // 最終メッセージ：会話ごとに最新の1件を取得（RLS によりオペレーターは全件読める）
  const rows: ListRow[] = await Promise.all(
    (conversations ?? []).map(async (c) => {
      const { data } = await supabase
        .from("messages")
        .select("body")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { ...c, status: c.status as ConversationStatus, last: data?.body ?? "" };
    }),
  );

  return <ConversationList key={status ?? "all"} initialRows={rows} initialUnhandled={unhandled ?? 0} status={status} />;
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
