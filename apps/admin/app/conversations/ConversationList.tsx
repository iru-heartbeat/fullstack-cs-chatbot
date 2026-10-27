"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { subscribeToConversations, type Conversation } from "@cs-chatbot/shared";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABEL, formatDateTime } from "@/lib/conversations";

export type ListRow = Pick<
  Conversation,
  "id" | "status" | "category" | "created_at" | "updated_at"
> & { last: string };

type Props = {
  initialRows: ListRow[];
  initialUnhandled: number;
  /** 絞り込み中のステータス（なければ全件） */
  status?: string;
};

const LIMIT = 100;

export function ConversationList({ initialRows, initialUnhandled, status }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(initialRows);
  const [unhandled, setUnhandled] = useState(initialUnhandled);
  const queued = status === "queued";

  // O-04: 会話の追加・更新をリアルタイムに反映し、未対応件数（escalated + queued）を数え直す
  useEffect(() => {
    let cancelled = false;
    const refreshCount = async () => {
      const { count } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .in("status", ["escalated", "queued"]);
      if (!cancelled && count !== null) setUnhandled(count);
    };
    const off = subscribeToConversations(supabase, async (_event, c) => {
      void refreshCount();
      if (status && c.status !== status) {
        setRows((prev) => prev.filter((r) => r.id !== c.id)); // 絞り込み条件から外れた
        return;
      }
      const { data } = await supabase
        .from("messages")
        .select("body")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const row: ListRow = {
        id: c.id,
        status: c.status,
        category: c.category,
        created_at: c.created_at,
        updated_at: c.updated_at,
        last: data?.body ?? "",
      };
      setRows((prev) => {
        const next = [row, ...prev.filter((r) => r.id !== c.id)];
        next.sort((a, b) =>
          queued
            ? a.created_at.localeCompare(b.created_at)
            : b.updated_at.localeCompare(a.updated_at),
        );
        return next.slice(0, LIMIT);
      });
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [supabase, status, queued]);

  return (
    <>
      <p aria-live="polite">
        未対応：<strong>{unhandled}</strong> 件（{STATUS_LABEL.escalated}＋{STATUS_LABEL.queued}）
      </p>
      {!rows.length ? (
        <p>該当する会話はありません。</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th>ステータス</th>
              <th>カテゴリ</th>
              <th>最終メッセージ</th>
              <th>{queued ? "受付時刻" : "最終更新"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>
                  <Link href={`/conversations/${c.id}`}>{STATUS_LABEL[c.status]}</Link>
                </td>
                <td>{c.category ?? "未分類"}</td>
                <td>{c.last.length > 40 ? c.last.slice(0, 40) + "…" : c.last}</td>
                <td>{formatDateTime(queued ? c.created_at : c.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
