import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/faq";
import { deleteFaq } from "../../actions";

// 削除は取り消せないので、確認ページを挟む
async function Confirm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: faq } = await supabase
    .from("faq")
    .select("question")
    .eq("id", id)
    .maybeSingle();
  if (!faq) notFound();
  return (
    <>
      <p>次の FAQ を削除します。この操作は取り消せません。</p>
      <blockquote>{faq.question}</blockquote>
      <form action={deleteFaq} style={{ display: "flex", gap: "1rem" }}>
        <input type="hidden" name="id" value={id} />
        <button type="submit">削除する</button>
        <Link href="/faq">キャンセル</Link>
      </form>
    </>
  );
}

export default function DeleteFaqPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main style={{ margin: "2rem auto", maxWidth: 720, padding: "0 1rem" }}>
      <h1>FAQ の削除</h1>
      <Suspense fallback={<p>読み込み中…</p>}>
        <Confirm params={params} />
      </Suspense>
    </main>
  );
}
