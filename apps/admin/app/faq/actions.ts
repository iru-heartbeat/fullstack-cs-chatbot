"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid, parseFaqForm } from "@/lib/faq";

export type FaqFormState = { error: string } | null;

// Server Action はブラウザから直接呼べるので、画面側のログイン確認に頼らず毎回ここで確認する
async function requireOperator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  const { data: op } = await supabase
    .from("operators")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!op) throw new Error("オペレーター権限がありません");
  return supabase;
}

export async function createFaq(_prev: FaqFormState, formData: FormData): Promise<FaqFormState> {
  const supabase = await requireOperator();
  const parsed = parseFaqForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase.from("faq").insert(parsed.value);
  if (error) return { error: "保存に失敗しました。もう一度お試しください" };

  revalidatePath("/faq");
  redirect("/faq");
}

export async function updateFaq(
  id: string,
  _prev: FaqFormState,
  formData: FormData,
): Promise<FaqFormState> {
  const supabase = await requireOperator();
  if (!isUuid(id)) return { error: "FAQ が見つかりません" };

  const { data: current } = await supabase
    .from("faq")
    .select("category")
    .eq("id", id)
    .maybeSingle();
  if (!current) return { error: "FAQ が見つかりません（削除された可能性があります）" };

  const parsed = parseFaqForm(formData, current.category);
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase.from("faq").update(parsed.value).eq("id", id);
  if (error) return { error: "保存に失敗しました。もう一度お試しください" };

  revalidatePath("/faq");
  redirect("/faq");
}

export async function toggleFaq(formData: FormData) {
  const supabase = await requireOperator();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) throw new Error("不正な ID です");
  const next = formData.get("next") === "true";

  const { error } = await supabase.from("faq").update({ is_active: next }).eq("id", id);
  if (error) throw new Error("切り替えに失敗しました");
  revalidatePath("/faq");
}

export async function deleteFaq(formData: FormData) {
  const supabase = await requireOperator();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) throw new Error("不正な ID です");

  const { error } = await supabase.from("faq").delete().eq("id", id);
  if (error) throw new Error("削除に失敗しました");
  revalidatePath("/faq");
  redirect("/faq");
}
