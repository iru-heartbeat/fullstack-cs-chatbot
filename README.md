# フルスタック CS チャットボット

ECサイトのお問い合わせに **AI が自動で答え**、答えられない質問は **人間のオペレーターに引き継ぐ** チャットシステムです。
お客様向けのチャット窓（ウィジェット）と、オペレーター向けの管理画面がセットになっています。

> 要件の正式な定義は [要件定義書.md](要件定義書.md) にあります（W-xx ウィジェット / A-xx AI / O-xx オペレーター / F-xx FAQ / H-xx 営業時間）。

---

## 何ができるの？

### お客様側（チャット窓）
- サイトの右下の 💬 ボタンを押すとチャットが開き、**ログイン不要**で質問できます。
- 質問すると、AI が **FAQ（よくある質問）をもとに**数秒で答えます。
- AI が答えられないときは、担当者につなぎます。担当者の返事は **リアルタイムで**チャットに届きます。
- 営業時間外でも AI が答えます。担当者が必要な質問は「翌営業日に対応します」と案内されます。

### オペレーター側（管理画面）
- ログインして **会話一覧** を見られます。AI が答えられなかった会話は、画面を更新しなくても一覧に現れます。
- 会話を開いて「対応する」を押し、お客様に返信します。終わったら「完了にする」を押します。
- **FAQ 管理** で、AI が答えの根拠にする FAQ を追加・編集・無効化できます。

### AI の安全対策
- AI は **FAQ に書いてあることだけ**を根拠に答え、推測では答えません。
- 個人情報・クレーム・返金・法的な内容は、必ず人間に引き継ぎます。
- 「これまでの指示を無視して」のような命令を書かれても従いません。
- FAQ に載っていない URL・メールアドレス・電話番号が返信に混ざったときは、コードで止めて人間に引き継ぎます。
- AI のサービスが止まったときも、人間に引き継ぎます。

---

## 会話の流れ

```
お客様が質問
   │
   ▼
AI が FAQ をもとに回答 ──── 答えられた ──→ 解決（resolved_by_ai）
   │
   └─ 答えられない／危険な内容
          │
          ├─ 営業時間内 ──→ オペレーター待ち（escalated）
          └─ 営業時間外 ──→ 翌日対応キュー（queued）
                                  │
                          オペレーターが対応（operator_handling）
                                  │
                                 完了（closed）
```

---

## 使っている技術（初心者向けの説明）

| 技術 | 役割 | なぜ選んだか |
|---|---|---|
| **Next.js**（React） | 管理画面と、サーバー側の処理（API） | 画面とサーバー処理を 1 つのプロジェクトで作れる。Vercel にそのまま載せられる |
| **Supabase** | ログイン・データベース・リアルタイム通知 | 会話や FAQ の保存、「返信がすぐ届く」仕組み、ログインをまとめて用意してくれる |
| **Claude API**（Anthropic） | AI の回答づくり | 日本語の文章が自然で、決まった形式（JSON）で答えを返せる |
| **RLS**（行レベルセキュリティ） | データの見える範囲の制限 | お客様は自分の会話だけ、という決まりを **データベース自身が守る** |
| **Vercel** | インターネットへの公開 | Next.js と相性がよく、GitHub につなぐと自動で公開される |
| **npm workspaces** | 1 つのリポジトリに複数のパッケージ | 管理画面とウィジェットを同じ場所で管理できる |

### 「顧客情報を教えて」と言われたら？
AI には、FAQ と **その会話のやりとり**しか渡していません。データベースの顧客情報を調べる手段そのものを持たないので、漏れる経路がありません。さらに、返信はコードで検査してから送ります。

---

## フォルダ構成

```
apps/admin/          管理画面（Next.js）とサーバー側 API
  app/               画面と API（/demo, /login, /conversations, /faq, /api/...）
  lib/ai/            AI の回答づくり（reply.ts）と返信の検査（guard.ts）
  scripts/           AI の品質を確かめる評価スクリプト
packages/widget/     お客様のサイトに埋め込むチャットウィジェット（React）
packages/shared/     管理画面とウィジェットで共通の型
supabase/migrations/ データベースの設計図（テーブルと RLS）
supabase/tests/      RLS の動作確認用 SQL
docs/                デプロイ手順・受け入れ確認
```

---

## 自分のパソコンで動かす

必要なもの: Node.js、Supabase のプロジェクト、Claude API キー。

```bash
npm install                                  # 依存パッケージを入れる
cp .env.example apps/admin/.env.local        # 環境変数のひな形をコピーして値を入れる
npm run dev                                  # 起動 → http://localhost:3000
```

| 画面 | URL |
|---|---|
| お客様用チャットのデモ | http://localhost:3000/demo |
| オペレーターのログイン | http://localhost:3000/login |
| 会話一覧 | http://localhost:3000/conversations |
| FAQ 管理 | http://localhost:3000/faq |

### 環境変数

| 名前 | 内容 | 公開してよい？ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase の URL | はい |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の公開用キー | はい |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase の管理用キー | **いいえ（サーバーのみ）** |
| `ANTHROPIC_API_KEY` | Claude API キー | **いいえ（サーバーのみ）** |
| `ANTHROPIC_MODEL` | 使う AI モデル（例: `claude-haiku-5-5`）。未設定なら `claude-opus-5-5` | はい |
| `ALLOWED_ORIGINS` | ウィジェットの埋め込みを許可するサイト（カンマ区切り） | はい |

### データベースの準備
`supabase/migrations/` の SQL を、日付の古い順に Supabase で実行します。
Supabase の Authentication で **Allow anonymous sign-ins** を ON にしてください（お客様がログインなしで質問するため）。

### オペレーターのアカウント
Supabase の Authentication でユーザーを作り、`operators` テーブルに登録します。

```sql
insert into public.operators (id, name, role)
select id, '山田', 'admin' from auth.users where email = 'あなたのメール';
```

### FAQ を入れる
管理画面の `/faq` から 1 件ずつ追加できます。まとめて入れるときは SQL で `public.faq` に挿入します。

---

## 他のサイトに埋め込む

```tsx
import { ChatWidget } from "widget";

<ChatWidget
  supabaseUrl="https://xxxx.supabase.co"
  supabaseAnonKey="（公開用キー）"
  apiBaseUrl="https://この管理画面のURL"
/>
```

埋め込み先のサイトを、管理画面側の環境変数 `ALLOWED_ORIGINS` に登録してください（登録のないサイトからは拒否されます）。

---

## テストと品質チェック

```bash
npm run build                  # ビルド（型チェックを含む）
npm run lint                   # コードの書き方チェック
npm test -w apps/admin         # 営業時間などの単体テスト
npm run eval:ai -w apps/admin  # AI の品質評価（Claude API を何十回も呼ぶので注意）
EVAL_ONLY=safe npm run eval:ai -w apps/admin   # 攻撃文の評価だけ（5 回）
```

受け入れ基準の確認結果は [docs/受け入れ確認.md](docs/受け入れ確認.md) にあります。

## 公開（デプロイ）

[docs/デプロイ手順.md](docs/デプロイ手順.md) を参照してください。
