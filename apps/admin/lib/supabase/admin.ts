import { createClient } from "@supabase/supabase-js";

// service role クライアント。RLS を越えて読み書きできるので、サーバー側（API ルート）専用。
// このファイルをクライアントコンポーネントから import しないこと。
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
