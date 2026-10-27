"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import {
  MESSAGE_MAX_LENGTH,
  subscribeToConversations,
  subscribeToMessages,
  type Conversation,
  type Message,
} from "@cs-chatbot/shared";
import { createClient } from "@/lib/supabase/client";
import { SENDER_LABEL, STATUS_LABEL, formatDateTime } from "@/lib/conversations";
import {
  claimConversation,
  closeConversation,
  reopenConversation,
  sendOperatorReply,
  type ActionResult,
} from "./actions";

type Props = {
  initialConversation: Conversation;
  initialMessages: Message[];
  operatorId: string;
};

// id で重複排除して古い順に並べる（自分の送信結果と Realtime の同じ行が二重にならないように）
function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  const map = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function ConversationPanel({ initialConversation, initialMessages, operatorId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [conv, setConv] = useState(initialConversation);
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  // O-04 / W-04: 新着メッセージと会話の状態変化（他のオペレーターによる割り当てなど）を購読
  useEffect(() => {
    const offMessages = subscribeToMessages(supabase, conv.id, (m) =>
      setMessages((prev) => mergeMessages(prev, [m])),
    );
    const offConv = subscribeToConversations(supabase, (_event, c) => setConv(c), conv.id);
    return () => {
      offMessages();
      offConv();
    };
  }, [supabase, conv.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const mine = conv.assigned_operator_id === operatorId;
  const canClaim =
    (conv.status === "escalated" || conv.status === "queued") && conv.assigned_operator_id === null;
  const canReply = conv.status === "operator_handling" && mine;
  const canReopen = conv.status === "closed" && (conv.assigned_operator_id === null || mine);

  function run<T extends Conversation | Message>(
    action: () => Promise<ActionResult<T>>,
    onOk: (data: T) => void,
  ) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) setError(res.error);
      else onOk(res.data);
    });
  }

  const applyConv = (c: Conversation) => setConv(c);

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || pending) return;
    run(
      () => sendOperatorReply(conv.id, body),
      (m) => {
        setMessages((prev) => mergeMessages(prev, [m]));
        setText("");
      },
    );
  }

  let handlerNote = "未割り当て";
  if (conv.assigned_operator_id) handlerNote = mine ? "あなたが対応" : "他のオペレーターが対応中";

  return (
    <>
      <p>
        ステータス：{STATUS_LABEL[conv.status]} ／ カテゴリ：{conv.category ?? "未分類"} ／ 受付：
        {formatDateTime(conv.created_at)} ／ 担当：{handlerNote}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", margin: "0.75rem 0" }}>
        {canClaim && (
          <button type="button" disabled={pending} onClick={() => run(() => claimConversation(conv.id), applyConv)}>
            対応する
          </button>
        )}
        {canReply && (
          <button type="button" disabled={pending} onClick={() => run(() => closeConversation(conv.id), applyConv)}>
            完了にする
          </button>
        )}
        {canReopen && (
          <button type="button" disabled={pending} onClick={() => run(() => reopenConversation(conv.id), applyConv)}>
            再オープン
          </button>
        )}
      </div>
      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}

      <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.75rem" }}>
        {messages.map((m) => (
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
      {!messages.length && <p>メッセージはありません。</p>}
      <div ref={bottomRef} />

      {canReply ? (
        <form onSubmit={submit} style={{ display: "grid", gap: "0.5rem", marginTop: "1rem" }}>
          <textarea
            rows={3}
            maxLength={MESSAGE_MAX_LENGTH}
            value={text}
            aria-label="返信メッセージ"
            placeholder="顧客への返信を入力"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // 日本語変換確定の Enter では送信しない。Ctrl/Cmd+Enter で送信
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit" disabled={pending || !text.trim()}>
            送信
          </button>
        </form>
      ) : (
        <p style={{ color: "#6b7280" }}>
          {conv.status === "operator_handling" && !mine
            ? "他のオペレーターが対応中のため返信できません。"
            : canClaim
              ? "「対応する」を押すと返信できます。"
              : "この状態では返信できません。"}
        </p>
      )}
    </>
  );
}
