import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { toggleFaq } from "./actions";

async function List() {
  const supabase = await createClient();
  const { data: faqs, error } = await supabase
    .from("faq")
    .select("id, category, question, is_active, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return <p role="alert">FAQ の取得に失敗しました。</p>;
  if (!faqs?.length) return <p>FAQ はまだありません。</p>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
          <th>質問</th>
          <th>カテゴリ</th>
          <th>状態</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {faqs.map((f) => (
          <tr key={f.id} style={{ borderBottom: "1px solid #eee", opacity: f.is_active ? 1 : 0.6 }}>
            <td>{f.question.length > 50 ? f.question.slice(0, 50) + "…" : f.question}</td>
            <td>{f.category ?? "未分類"}</td>
            <td>{f.is_active ? "有効" : "無効"}</td>
            <td style={{ display: "flex", gap: "0.75rem" }}>
              <Link href={`/faq/${f.id}`}>編集</Link>
              <form action={toggleFaq}>
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="next" value={String(!f.is_active)} />
                <button type="submit">{f.is_active ? "無効にする" : "有効にする"}</button>
              </form>
              <Link href={`/faq/${f.id}/delete`}>削除</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function FaqPage() {
  return (
    <main style={{ margin: "2rem auto", maxWidth: 960, padding: "0 1rem" }}>
      <p><Link href="/">← トップ</Link></p>
      <h1>FAQ 管理</h1>
      <p><Link href="/faq/new">新規登録</Link></p>
      <Suspense fallback={<p>読み込み中…</p>}>
        <List />
      </Suspense>
    </main>
  );
}
