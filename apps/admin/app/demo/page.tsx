import { DemoWidget } from "./DemoWidget";

export const metadata = { title: "ウィジェット デモ" };

// ブランドサイトを模したデモページ。右下の 💬 ボタンからチャットを開く
export default function DemoPage() {
  return (
    <main style={{ margin: "2rem auto", maxWidth: 720, padding: "0 1rem" }}>
      <h1>サンプルストア</h1>
      <p>これは、チャットウィジェットを埋め込んだデモページです。右下の 💬 ボタンからご質問いただけます。</p>
      <DemoWidget />
    </main>
  );
}
