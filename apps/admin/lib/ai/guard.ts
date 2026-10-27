// AI の返信をコード側で検査する（プロンプトのルールが破られたときの最後の砦）。
// FAQ に載っていない URL・メールアドレス・電話番号を含む返信は、偽サイトへの誘導などに悪用されうるので送らない。
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'）)」、。]+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE_RE = /0\d{1,4}[-ー－]\d{1,4}[-ー－]\d{3,4}/g;

// 全角英数・ハイフン類を半角にそろえ、小文字にして比べる
const normalize = (s: string) =>
  s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[ー－―]/g, "-")
    .toLowerCase();

function extractContacts(text: string): string[] {
  const t = normalize(text);
  return [...(t.match(URL_RE) ?? []), ...(t.match(EMAIL_RE) ?? []), ...(t.match(PHONE_RE) ?? [])].map((v) =>
    v.replace(/[.,]+$/, ""),
  );
}

/** 返信が根拠にした FAQ の回答文に無い連絡先（URL・メール・電話）を含むなら true */
export function hasUngroundedContact(answer: string, usedFaqAnswers: string[]): boolean {
  const grounded = normalize(usedFaqAnswers.join("\n"));
  return extractContacts(answer).some((c) => !grounded.includes(c));
}
