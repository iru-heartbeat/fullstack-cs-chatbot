"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string } | null;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: "メールアドレスまたはパスワードが正しくありません" };
  }

  // operators テーブルに載っているユーザーだけが管理画面に入れる
  const { data: op } = await supabase
    .from("operators")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!op) {
    await supabase.auth.signOut();
    return { error: "このアカウントにはオペレーター権限がありません" };
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
