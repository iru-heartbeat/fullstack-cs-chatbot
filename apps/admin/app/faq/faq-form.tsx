"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CATEGORIES } from "@/lib/ai/categories";
import { ANSWER_MAX, QUESTION_MAX } from "@/lib/faq";
import type { FaqFormState } from "./actions";

type Initial = { question: string; answer: string; category: string | null; is_active: boolean };

export function FaqForm({
  action,
  initial,
}: {
  action: (prev: FaqFormState, formData: FormData) => Promise<FaqFormState>;
  initial: Initial;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  // 旧表記など CATEGORIES に無い既存値も選択肢に残し、編集画面で壊れないようにする
  const legacy =
    initial.category && !(CATEGORIES as readonly string[]).includes(initial.category)
      ? initial.category
      : null;

  return (
    <form action={formAction} style={{ display: "grid", gap: "1rem" }}>
      <label>
        質問（必須・{QUESTION_MAX}文字以内）
        <input
          name="question"
          defaultValue={initial.question}
          required
          maxLength={QUESTION_MAX}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label>
        回答（必須・{ANSWER_MAX}文字以内）
        <textarea
          name="answer"
          defaultValue={initial.answer}
          required
          maxLength={ANSWER_MAX}
          rows={8}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label>
        カテゴリ
        <select name="category" defaultValue={initial.category ?? ""} style={{ display: "block" }}>
          <option value="">未分類</option>
          {legacy && <option value={legacy}>{legacy}（旧カテゴリ）</option>}
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        <input type="checkbox" name="is_active" defaultChecked={initial.is_active} /> 有効（AI の回答に使う）
      </label>
      {state?.error && <p role="alert" style={{ color: "crimson" }}>{state.error}</p>}
      <div style={{ display: "flex", gap: "1rem" }}>
        <button type="submit" disabled={pending}>{pending ? "保存中…" : "保存"}</button>
        <Link href="/faq">キャンセル</Link>
      </div>
    </form>
  );
}
