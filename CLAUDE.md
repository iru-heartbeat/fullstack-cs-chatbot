# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 現状

模擬案件「フルスタック CS チャットボット」。リポジトリにはまだ [要件定義書.md](要件定義書.md) しかなく、コードは未実装。要件 ID（W-xx ウィジェット / A-xx AI / O-xx オペレーター / F-xx FAQ / H-xx 営業時間）はこの文書が正。実装時はコミットメッセージに該当 ID を書く。ドキュメントと UI の言語は日本語。

## 開発の進め方（必須ルール）

- **1機能 = 1ブランチ = 1 worktree = 1回のマージ**。機能を混ぜない。
- 各機能は `main` から worktree を切って作業する（課題として worktree の実践が目的）。
  ```bash
  git worktree add ../worktrees/<機能名> -b feature/<機能名>
  # 実装 → コミット
  git switch main && git merge --no-ff feature/<機能名>
  git worktree remove ../worktrees/<機能名> && git branch -d feature/<機能名>
  ```
- worktree はリポジトリの外（`../worktrees/`）に置く。`.env.local` は git 管理外なので、新しい worktree ごとにコピーして `pnpm install` する。
- 実装順序は計画どおり：db-schema-rls → operator-auth / widget-basic（並行）→ realtime-messaging → ai-reply → category-classification → escalation → operator-conversation-list → operator-reply → business-hours-queue → faq-management → hardening → acceptance-deploy。各機能の完了条件は計画書（`~/.claude/plans/1-worktree-foamy-lark.md`）を参照。

## 機能実装後の解説ルール（必須）

模擬演習のため、**機能を1つ実装するたびに**（マージ前後の報告時に）、初心者にもわかるように次を説明する。
- 何を実装したか：ユーザーから見て何ができるようになったか（対応する要件 ID を添える）
- どんな技術を採用したか：技術名と、なぜそれを選んだか。専門用語は初出で一言の説明か身近なたとえを付ける
- 仕組みの流れ：データや処理がどう流れるかを短く（必要なら図や箇条書き）
- 動作確認の方法：どう試せば動いているか分かるか

## 計画しているアーキテクチャ

pnpm モノレポ。
- `apps/admin`：Next.js（Vercel）。オペレーター管理画面と、**サーバー側 API**（Claude API 呼び出し、営業時間判定）。
- `packages/widget`：顧客サイトに埋め込む React チャットウィジェット。
- `supabase/migrations`：スキーマと RLS（Supabase はクラウドの開発用プロジェクト1つを全 worktree で共有。ローカル Supabase は使わない）。

データの流れ：ウィジェット／管理画面は Supabase（Auth / DB / Realtime）と直接やり取りし、AI 応答だけはサーバー経由で Claude API を呼ぶ。コアテーブルは `conversations` / `messages` / `operators` / `faq` / `business_hours` / `holidays`。

会話ステータス：`ai_handling` → `resolved_by_ai`、または `escalated`（営業時間内で回答不可）／`queued`（営業時間外で回答不可）→ `operator_handling` → `closed`。

## 守るべき制約

- Claude API キーと Supabase の service role キーはサーバー側環境変数のみ。ブラウザ側コードに置かない。
- 全テーブルで RLS 有効。顧客は自分の匿名セッションの会話のみ、オペレーターは認証済みなら全会話、FAQ は顧客から直接読めない。
- AI は FAQ に根拠がない質問に推測で答えず、エスカレーションする。個人情報・クレーム・返金・法的内容は強制エスカレーション。Claude API 障害時もエスカレーション扱い。
- 営業時間の判定はサーバー側で行う（タイムゾーン Asia/Tokyo）。

## コマンド

pnpm を使う予定（雛形作成後に実際のスクリプト名で更新すること）。完了確認として各マージ前に `pnpm build` と `pnpm lint` を通す。
