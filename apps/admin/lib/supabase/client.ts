import { createBrowserClient } from "@supabase/ssr";

// ブラウザ用の Supabase クライアント（anon キーのみ。service role は使わない）
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
