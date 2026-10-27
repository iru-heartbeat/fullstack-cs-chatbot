"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid, parseFaqForm } from "@/lib/faq";

export type FaqFormState = { error: string } | null;

// Server Action はブラウザから直接呼べるので、画面側のログイン確認に頼らず毎回ここで確認する。
// 権限がなければログイン画面へ送る（例外を投げると本番では内容のない汎用エラー画面になる）
async function requireOperator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: op } = await supabase
    .from("operators")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!op) redirect("/login");
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

// 切り替え・削除は一覧画面の <form> から呼ばれる。失敗しても例外は投げず、
// 一覧に ?error=… を付けて戻し、画面でメッセージを出す。
export async function toggleFaq(formData: FormData) {
  const supabase = await requireOperator();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) redirect("/faq?error=notfound");
  const next = formData.get("next") === "true";

  const { data, error } = await supabase
    .from("faq")
    .update({ is_active: next })
    .eq("id", id)
    .select("id");
  if (error) redirect("/faq?error=toggle");
  if (!data?.length) redirect("/faq?error=notfound"); // 他のオペレーターが先に削除した
  revalidatePath("/faq");
}

export async function deleteFaq(formData: FormData) {
  const supabase = await requireOperator();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) redirect("/faq?error=notfound");

  const { data, error } = await supabase.from("faq").delete().eq("id", id).select("id");
  if (error) redirect("/faq?error=delete");
  if (!data?.length) redirect("/faq?error=notfound");
  revalidatePath("/faq");
  redirect("/faq");
}
