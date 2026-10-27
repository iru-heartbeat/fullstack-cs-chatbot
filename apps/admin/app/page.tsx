import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./login/actions";

async function Operator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: op } = await supabase.from("operators").select("name").eq("id", user!.id).maybeSingle();
  return <p>{op?.name ?? user?.email} さんとしてログイン中</p>;
}

export default function Home() {
  return (
    <main style={{ margin: "2rem auto", maxWidth: 720, padding: "0 1rem" }}>
      <h1>CS 管理画面</h1>
      <Suspense fallback={<p>読み込み中…</p>}>
        <Operator />
      </Suspense>
      <p><Link href="/conversations">会話一覧へ</Link></p>
      <p><Link href="/faq">FAQ 管理へ</Link></p>
      <form action={logout}>
        <button type="submit">ログアウト</button>
      </form>
    </main>
  );
}
