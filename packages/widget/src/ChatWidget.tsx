import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  createConversation,
  createWidgetClient,
  ensureAnonymousSession,
  isConversationActive,
  loadLatestConversation,
  requestAiReply,
  requestHumanSupport,
  sendCustomerMessage,
} from "./session";
import { subscribeToConversations, subscribeToMessages } from "@cs-chatbot/shared";
import type { ChatMessage, SenderType } from "./types";

export interface ChatWidgetProps {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** AI 返信 API を持つ管理画面アプリの URL（例: https://admin.example.com） */
  apiBaseUrl: string;
}

const MAX_LENGTH = 1000; // messages.body の check 制約に合わせる
const BRAND = "#2563eb";

const SENDER_LABEL: Record<SenderType, string> = {
  customer: "あなた",
  ai: "AI アシスタント",
  operator: "担当者",
  system: "お知らせ",
};

const styles: Record<string, CSSProperties> = {
  launcher: {
    position: "fixed", right: 16, bottom: 16, width: 56, height: 56, borderRadius: "50%",
    border: "none", background: BRAND, color: "#fff", fontSize: 24, cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,.25)", zIndex: 2147483000,
  },
  // 狭い画面では (100vw - 32px) になりスマホでもはみ出さない（W-10）
  window: {
    position: "fixed", right: 16, bottom: 84, width: "min(380px, calc(100vw - 32px))",
    height: "min(560px, calc(100dvh - 100px))", display: "flex", flexDirection: "column",
    background: "#fff", borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,.25)",
    overflow: "hidden", zIndex: 2147483000,
    fontFamily: "system-ui, 'Hiragino Sans', 'Yu Gothic', sans-serif",
    fontSize: 14, color: "#111827",
  },
  header: { background: BRAND, color: "#fff", padding: "12px 16px", fontWeight: 600 },
  notice: { background: "#fef3c7", color: "#92400e", padding: "8px 12px", fontSize: 12, lineHeight: 1.5 },
  list: { flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10, background: "#f9fafb" },
  form: { display: "flex", gap: 8, padding: 10, borderTop: "1px solid #e5e7eb", background: "#fff" },
  input: { flex: 1, resize: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: 8, font: "inherit" },
  send: { border: "none", background: BRAND, color: "#fff", borderRadius: 8, padding: "0 14px", cursor: "pointer", font: "inherit" },
  human: { border: "none", borderTop: "1px solid #e5e7eb", background: "#fff", color: BRAND, padding: "8px", cursor: "pointer", font: "inherit", fontSize: 12 },
  error: { color: "#b91c1c", fontSize: 12, padding: "0 12px 8px" },
};

// 同じ id のメッセージは1回だけ追加する（API の戻り値と Realtime 経由の行が重なるため）
function appendUnique(prev: ChatMessage[], m: ChatMessage): ChatMessage[] {
  return prev.some((x) => x.id === m.id) ? prev : [...prev, m];
}

function Bubble({ m }: { m: ChatMessage }) {
  const mine = m.sender_type === "customer";
  return (
    <div style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
      {/* W-06: 送信者を見分けられる表示 */}
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2, textAlign: mine ? "right" : "left" }}>
        {SENDER_LABEL[m.sender_type]}
      </div>
      <div
        style={{
          background: mine ? BRAND : m.sender_type === "system" ? "#e5e7eb" : "#fff",
          color: mine ? "#fff" : "#111827",
          border: mine ? "none" : "1px solid #e5e7eb",
          borderRadius: 12, padding: "8px 12px", whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}
      >
        {m.body}
      </div>
    </div>
  );
}

export function ChatWidget({ supabaseUrl, supabaseAnonKey, apiBaseUrl }: ChatWidgetProps) {
  const client = useMemo(() => createWidgetClient(supabaseUrl, supabaseAnonKey), [supabaseUrl, supabaseAnonKey]);
  const [open, setOpen] = useState(false); // W-02
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiTyping, setAiTyping] = useState(false); // W-05
  // true の間は AI ではなく担当者の対応待ち（ai_handling 以外の会話）
  const [escalated, setEscalated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 初回オープン時に匿名セッションを確立し、過去の会話を復元（W-09）
  useEffect(() => {
    if (!open || customerId) return;
    let cancelled = false;
    (async () => {
      try {
        const uid = await ensureAnonymousSession(client);
        const latest = await loadLatestConversation(client);
        if (cancelled) return;
        setCustomerId(uid);
        if (latest) {
          setConversationId(latest.conversationId);
          setEscalated(latest.status !== "ai_handling");
          setMessages(latest.messages);
        }
      } catch {
        if (!cancelled) setError("接続に失敗しました。時間をおいて再度お試しください。");
      }
    })();
    return () => { cancelled = true; };
  }, [open, customerId, client]);

  // O-07 / W-04: 担当者の返信などを Realtime で即時表示。id で重複排除（自分の送信分と二重にしない）
  useEffect(() => {
    if (!conversationId) return;
    return subscribeToMessages(client, conversationId, (m) => {
      setMessages((prev) => appendUnique(prev, m));
      if (m.sender_type === "operator") setEscalated(true);
    });
  }, [client, conversationId]);

  // 担当者が会話を完了にしたら、画面にお知らせを出し、次の送信は新しい相談として始める
  useEffect(() => {
    if (!conversationId) return;
    return subscribeToConversations(
      client,
      (_event, c) => {
        if (c.status !== "closed" && c.status !== "resolved_by_ai") return;
        setMessages((prev) =>
          appendUnique(prev, {
            id: `local-closed-${c.id}`,
            conversation_id: c.id,
            sender_type: "system",
            body: "この相談は完了しました。続けてご質問の場合は、新しい相談としてお送りください。",
            created_at: new Date().toISOString(),
          }),
        );
        setConversationId(null);
        setEscalated(false);
      },
      conversationId,
    );
  }, [client, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  const submit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending || !customerId) return;
    setSending(true);
    setError(null);
    try {
      // 通知を取りこぼしても閉じた会話に書き込まないよう、送信前に状態を確認する
      let activeId = conversationId;
      let handledByHuman = escalated;
      if (activeId && !(await isConversationActive(client, activeId))) {
        activeId = null;
        handledByHuman = false;
        setEscalated(false);
      }
      const cid = activeId ?? (await createConversation(client, customerId));
      setConversationId(cid);
      const sent = await sendCustomerMessage(client, cid, body);
      setMessages((prev) => appendUnique(prev, sent));
      setText("");
      setSending(false);
      if (handledByHuman) return; // 担当者対応中は AI を呼ばない
      // AI 返信を依頼（失敗時はサーバーがお詫びを保存するが、通信自体の失敗は画面に出す）
      setAiTyping(true);
      try {
        const { message, escalate } = await requestAiReply(client, apiBaseUrl, cid);
        if (message) setMessages((prev) => appendUnique(prev, message));
        if (escalate) setEscalated(true);
      } catch {
        setError("AI の応答を取得できませんでした。時間をおいて再度お試しください。");
      } finally {
        setAiTyping(false);
      }
    } catch {
      setError("送信に失敗しました。もう一度お試しください。");
    } finally {
      setSending(false);
    }
  }, [text, sending, customerId, conversationId, escalated, client, apiBaseUrl]);

  // W-07: 人間対応を依頼
  const callHuman = useCallback(async () => {
    if (!conversationId || escalated || aiTyping) return;
    setError(null);
    try {
      const notice = await requestHumanSupport(client, apiBaseUrl, conversationId);
      if (notice) setMessages((prev) => appendUnique(prev, notice));
      setEscalated(true);
    } catch {
      setError("担当者への切り替えに失敗しました。もう一度お試しください。");
    }
  }, [conversationId, escalated, aiTyping, client, apiBaseUrl]);

  const disabled = !customerId || sending || aiTyping || !text.trim();

  return (
    <>
      {open && (
        <section style={styles.window} role="dialog" aria-label="チャットサポート">
          <div style={styles.header}>チャットサポート</div>
          {/* W-11: 初回表示の注意書き */}
          <div style={styles.notice}>
            AI がご質問にお答えします。個人情報（氏名・住所・カード番号など）は入力しないでください。
          </div>
          <div style={styles.list}>
            {messages.length === 0 && customerId && (
              <div style={{ color: "#6b7280", textAlign: "center", marginTop: 16 }}>
                ご質問を入力してください。
              </div>
            )}
            {messages.map((m) => <Bubble key={m.id} m={m} />)}
            {aiTyping && (
              <div style={{ color: "#6b7280", fontSize: 12 }} aria-live="polite">AI が入力中…</div>
            )}
            <div ref={bottomRef} />
          </div>
          {error && <div style={styles.error} role="alert">{error}</div>}
          {escalated ? (
            <div style={styles.notice}>担当者の対応をお待ちください。</div>
          ) : (
            conversationId && (
              <button type="button" style={styles.human} onClick={callHuman} disabled={aiTyping}>
                担当者に相談する
              </button>
            )
          )}
          <form style={styles.form} onSubmit={submit}>
            <textarea
              style={styles.input}
              rows={2}
              maxLength={MAX_LENGTH}
              value={text}
              placeholder="メッセージを入力"
              aria-label="メッセージ"
              disabled={!customerId}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // 日本語変換確定の Enter は送信しない
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button style={{ ...styles.send, opacity: disabled ? 0.5 : 1 }} type="submit" disabled={disabled}>
              送信
            </button>
          </form>
        </section>
      )}
      <button
        style={styles.launcher}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "チャットを閉じる" : "チャットを開く"}
        aria-expanded={open}
      >
        {open ? "×" : "💬"}
      </button>
    </>
  );
}
