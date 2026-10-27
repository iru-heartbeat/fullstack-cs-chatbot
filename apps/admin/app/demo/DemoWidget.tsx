"use client";

import { ChatWidget } from "widget";

// 受け入れ基準 1: ウィジェットを埋め込んで表示できる。
// apiBaseUrl は空にして同一オリジンの /api/* を呼ぶ（別サイトに埋め込むときはこの管理画面の URL を渡す）。
export function DemoWidget() {
  return (
    <ChatWidget
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      apiBaseUrl=""
    />
  );
}
