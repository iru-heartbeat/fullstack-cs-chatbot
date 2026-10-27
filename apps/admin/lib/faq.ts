import { CATEGORIES } from "@/lib/ai/categories";

export const QUESTION_MAX = 200;
export const ANSWER_MAX = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

export type FaqInput = {
  question: string;
  answer: string;
  category: string | null;
  is_active: boolean;
};

// フォーム入力の検証（F-01）。currentCategory は編集中の行の既存カテゴリで、
// 旧表記（例：「返品・交換」）のままなら保存を許可する
export function parseFaqForm(
  formData: FormData,
  currentCategory: string | null = null,
): { ok: true; value: FaqInput } | { ok: false; error: string } {
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "");
  const is_active = formData.get("is_active") === "on";

  if (!question) return { ok: false, error: "質問を入力してください" };
  if (question.length > QUESTION_MAX)
    return { ok: false, error: `質問は${QUESTION_MAX}文字以内で入力してください` };
  if (!answer) return { ok: false, error: "回答を入力してください" };
  if (answer.length > ANSWER_MAX)
    return { ok: false, error: `回答は${ANSWER_MAX}文字以内で入力してください` };

  let category: string | null = null;
  if (categoryRaw) {
    const known = (CATEGORIES as readonly string[]).includes(categoryRaw);
    if (!known && categoryRaw !== currentCategory)
      return { ok: false, error: "カテゴリが正しくありません" };
    category = categoryRaw;
  }
  return { ok: true, value: { question, answer, category, is_active } };
}
