import Link from "next/link";
import { createFaq } from "../actions";
import { FaqForm } from "../faq-form";

export default function NewFaqPage() {
  return (
    <main style={{ margin: "2rem auto", maxWidth: 720, padding: "0 1rem" }}>
      <p><Link href="/faq">← FAQ 一覧</Link></p>
      <h1>FAQ 新規登録</h1>
      <FaqForm action={createFaq} initial={{ question: "", answer: "", category: null, is_active: true }} />
    </main>
  );
}
