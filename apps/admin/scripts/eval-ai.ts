// 受け入れ基準 9 / 2 の検証: テスト質問 30 問を AI に流し、自動回答率・エスカレーション判定・応答時間を見る。
// 実行: npm run eval:ai -w apps/admin （Claude API を 30 回呼ぶ。.env.local のキーを使う）
// 会話や顧客データは作らない。FAQ は DB から読むだけで、判定ロジック(lib/ai/reply.ts)を直接呼ぶ。
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { generateReply } from "../lib/ai/reply.ts";

type Expect = "answer" | "escalate";
// faq: 正解となる FAQ の質問に含まれる語（answer のときだけ使う）
const CASES: { q: string; expect: Expect; faq?: string }[] = [
  // --- FAQ に載っている質問（言い換え 18 問） ---
  { q: "注文してから何日くらいで届きますか？", expect: "answer", faq: "どのくらいかかりますか" },
  { q: "離島に住んでいますが、配送は遅くなりますか？", expect: "answer", faq: "どのくらいかかりますか" },
  { q: "商品はいつ頃届きますか？", expect: "answer", faq: "どのくらいかかりますか" },
  { q: "荷物が今どこにあるか知りたいです", expect: "answer", faq: "配送状況" },
  { q: "追跡番号はどこで確認できますか？", expect: "answer", faq: "配送状況" },
  { q: "住所を間違えて注文してしまいました。変更できますか？", expect: "answer", faq: "注文内容" },
  { q: "発送前に注文した商品を別のものに変えたいです", expect: "answer", faq: "注文内容" },
  { q: "買った商品を返品したいのですが", expect: "answer", faq: "返品・交換はできますか" },
  { q: "交換は何日以内にできますか？", expect: "answer", faq: "返品・交換はできますか" },
  { q: "支払い方法は何がありますか？", expect: "answer", faq: "使える支払い方法" },
  { q: "コンビニで払えますか？", expect: "answer", faq: "使える支払い方法" },
  { q: "銀行振込はできますか？", expect: "answer", faq: "使える支払い方法" },
  { q: "領収書がほしいです", expect: "answer", faq: "領収書" },
  { q: "領収書はどこからダウンロードしますか？", expect: "answer", faq: "領収書" },
  { q: "ログインのパスワードを忘れました", expect: "answer", faq: "パスワード" },
  { q: "パスワードの再設定方法を教えてください", expect: "answer", faq: "パスワード" },
  { q: "会員をやめたいです", expect: "answer", faq: "退会" },
  { q: "退会するとどうなりますか？", expect: "answer", faq: "退会" },
  // --- FAQ にない質問（推測せずエスカレーションすべき 8 問） ---
  { q: "商品Aの在庫はまだありますか？", expect: "escalate" },
  { q: "実店舗はどこにありますか？", expect: "escalate" },
  { q: "使えるクーポンコードを教えてください", expect: "escalate" },
  { q: "ギフト包装はできますか？", expect: "escalate" },
  { q: "海外への発送は対応していますか？", expect: "escalate" },
  { q: "この商品のサイズ感を教えてください", expect: "escalate" },
  { q: "会員ランクによる割引はありますか？", expect: "escalate" },
  { q: "新商品はいつ発売されますか？", expect: "escalate" },
  // --- 強制エスカレーション（返金・クレーム・法的・個人情報 4 問） ---
  { q: "商品が壊れていたので返金してください", expect: "escalate" },
  { q: "対応が最悪でした。責任者を出してください。クレームです", expect: "escalate" },
  { q: "このまま対応されないなら弁護士に相談して訴訟を考えています", expect: "escalate" },
  { q: "登録した個人情報を第三者に提供していないか教えてください", expect: "escalate" },
];

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const { data: faqs, error } = await supabase
  .from("faq")
  .select("id, category, question, answer")
  .eq("is_active", true);
if (error || !faqs?.length) throw new Error(`FAQ を読めません: ${error?.message ?? "0件"}`);

type Row = {
  q: string; expect: Expect; actual: string; ok: boolean; ms: number; category: string | null; answer?: string;
};
const rows: Row[] = [];
for (const c of CASES) {
  const t0 = Date.now();
  const r = await generateReply(faqs, [{ role: "user", content: c.q }]);
  const ms = Date.now() - t0;
  let ok: boolean;
  if (c.expect === "answer") {
    const target = faqs.find((f) => f.question.includes(c.faq!));
    ok = r.kind === "answer" && !!target && r.usedFaqIds.includes(target.id);
  } else {
    ok = r.kind === "escalate";
  }
  rows.push({
    q: c.q, expect: c.expect, ok, ms, category: r.category,
    actual: r.kind === "answer" ? "answer" : `escalate(${r.reason})`,
    answer: r.kind === "answer" ? r.text : undefined,
  });
  console.log(`${ok ? "OK " : "NG "} [${c.expect}→${rows.at(-1)!.actual}] ${ms}ms ${c.q}`);
}

const faqRows = rows.filter((r) => r.expect === "answer");
const escRows = rows.filter((r) => r.expect === "escalate");
const times = rows.map((r) => r.ms).sort((a, b) => a - b);
const p95 = times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)];
console.log("\n=== 結果 ===");
console.log(`FAQ 該当 ${faqRows.length} 問: 自動回答（正しい FAQ を根拠）${faqRows.filter((r) => r.ok).length} 問 = ${Math.round((faqRows.filter((r) => r.ok).length / faqRows.length) * 100)}%（基準 70% 以上）`);
console.log(`FAQ 外・強制 ${escRows.length} 問: 正しくエスカレーション ${escRows.filter((r) => r.ok).length} 問`);
console.log(`応答時間: 中央値 ${times[Math.floor(times.length / 2)]}ms / P95 ${p95}ms（基準 10000ms 以内）`);
console.log("カテゴリ付与:", rows.filter((r) => r.category).length, "/", rows.length);

const out = process.argv[2];
if (out) {
  writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`詳細（回答文つき）を保存: ${out}`);
}
