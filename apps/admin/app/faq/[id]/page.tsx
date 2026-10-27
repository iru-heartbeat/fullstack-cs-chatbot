import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/faq";
import { updateFaq } from "../actions";
import { FaqForm } from "../faq-form";

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: faq } = await supabase
    .from("faq")
    .select("question, answer, category, is_active")
    .eq("id", id)
    .maybeSingle();
  if (!faq) notFound();
  return <FaqForm action={updateFaq.bind(null, id)} initial={faq} />;
}

export default function EditFaqPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main style={{ margin: "2rem auto", maxWidth: 720, padding: "0 1rem" }}>
      <p><Link href="/faq">← FAQ 一覧</Link></p>
      <h1>FAQ 編集</h1>
      <Suspense fallback={<p>読み込み中…</p>}>
        <Editor params={params} />
      </Suspense>
    </main>
  );
}
